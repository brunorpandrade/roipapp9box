// ROIP APP 9BOX — teste de integracao `radarNR1Reports` (ME-016).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico (S009) e usa o proprio
// service ME-016 `insertCopsoqCycle` para materializar o ciclo pai
// (dogfood RV-13).
//
// Cobre a particularidade canonica do §11.6 (nome canonico unico,
// D004): `companyId` e `cicloDbId` AMBOS nullaveis (INSERT valido com
// ambos nulos, so empresa, so ciclo, ou ambos) e AMBOS com ON DELETE
// CASCADE dos respectivos pais — a delecao do ciclo apaga o rastro do
// ciclo e a delecao da empresa apaga o rastro da empresa. Cobre ainda
// as listagens por empresa (mais recente primeiro) e por ciclo
// (cronologica) e a FK invalida em `cicloDbId`.
//
// Cleanup:
// - `beforeEach`: apaga os registros da company local e os orfaos
//   (ambos os campos nulos) criados pelos casos.
// - `afterAll`: apaga registros + ciclos + company local (L32).

import { eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoqCycles, radarNR1Reports } from '../../src/db/schema';
import { deleteCopsoqCycleById, insertCopsoqCycle } from '../../src/server/services/copsoqCycles';
import {
  getRadarNR1ReportById,
  insertRadarNR1Report,
  listRadarNR1ReportsByCiclo,
  listRadarNR1ReportsByCompany,
  type NewRadarNR1Report,
} from '../../src/server/services/radarNR1Reports';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000134';

describe('service radarNR1Reports (ME-016)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let cicloDbId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa RadarReports Test LTDA',
        nomeFantasia: 'Empresa RadarReports Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330034',
        endereco: 'Rua RadarReports, 34',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@radarreports.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@radarreports.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Dogfood RV-13: ciclo pai via service da propria ME-016.
    cicloDbId = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-08-03',
      dataAbertura: new Date('2026-08-03'),
      dataFechamento: new Date('2026-08-17'),
    });
  });

  afterAll(async () => {
    await client.db.delete(radarNR1Reports).where(eq(radarNR1Reports.companyId, companyId));
    await client.db.delete(radarNR1Reports).where(isNull(radarNR1Reports.companyId));
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(radarNR1Reports).where(eq(radarNR1Reports.companyId, companyId));
    await client.db.delete(radarNR1Reports).where(isNull(radarNR1Reports.companyId));
  });

  it('registra geracao com empresa e ciclo e retorna id positivo', async () => {
    const payload: NewRadarNR1Report = { companyId, cicloDbId };
    const id = await insertRadarNR1Report(client.db, payload);
    expect(id).toBeGreaterThan(0);

    const row = await getRadarNR1ReportById(client.db, id);
    expect(row?.companyId).toBe(companyId);
    expect(row?.cicloDbId).toBe(cicloDbId);
    expect(row?.createdAt).not.toBeNull();
  });

  it('aceita INSERT com ambos os campos nulos (§11.6 — ambos nullaveis)', async () => {
    const id = await insertRadarNR1Report(client.db, {});
    const row = await getRadarNR1ReportById(client.db, id);
    expect(row?.companyId).toBeNull();
    expect(row?.cicloDbId).toBeNull();
  });

  it('aceita INSERT apenas com empresa ou apenas com ciclo', async () => {
    const idEmpresa = await insertRadarNR1Report(client.db, { companyId });
    const idCiclo = await insertRadarNR1Report(client.db, { cicloDbId });

    const rowEmpresa = await getRadarNR1ReportById(client.db, idEmpresa);
    expect(rowEmpresa?.companyId).toBe(companyId);
    expect(rowEmpresa?.cicloDbId).toBeNull();

    const rowCiclo = await getRadarNR1ReportById(client.db, idCiclo);
    expect(rowCiclo?.companyId).toBeNull();
    expect(rowCiclo?.cicloDbId).toBe(cicloDbId);
  });

  it('listagens por empresa (desc) e por ciclo (asc) ordenam corretamente', async () => {
    const id1 = await insertRadarNR1Report(client.db, { companyId, cicloDbId });
    const id2 = await insertRadarNR1Report(client.db, { companyId, cicloDbId });

    const porEmpresa = await listRadarNR1ReportsByCompany(client.db, companyId);
    expect(porEmpresa.map((r) => r.id)).toEqual([id2, id1]);

    const porCiclo = await listRadarNR1ReportsByCiclo(client.db, cicloDbId);
    expect(porCiclo.map((r) => r.id)).toEqual([id1, id2]);
  });

  it('FK bloqueia cicloDbId inexistente', async () => {
    await expect(insertRadarNR1Report(client.db, { cicloDbId: 999999 })).rejects.toThrow();
  });

  it('CASCADE do ciclo apaga o rastro vinculado ao ciclo', async () => {
    const cicloTemp = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2027-01-04',
      dataAbertura: new Date('2027-01-04'),
      dataFechamento: new Date('2027-01-18'),
    });
    const reportId = await insertRadarNR1Report(client.db, { cicloDbId: cicloTemp });

    expect(await deleteCopsoqCycleById(client.db, cicloTemp)).toBe(1);
    expect(await getRadarNR1ReportById(client.db, reportId)).toBeUndefined();
  });

  it('CASCADE da empresa apaga o rastro vinculado a empresa', async () => {
    // Empresa descartavel dedicada para nao derrubar as fixtures.
    const [tempCompany] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa RadarReports Temp LTDA',
        nomeFantasia: 'Empresa RadarReports Temp',
        cnpj: '10000000000135',
        telefone: '1633330035',
        endereco: 'Rua RadarReports, 35',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@radartemp.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@radartemp.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!tempCompany) throw new Error('falha ao criar company temporaria');

    const reportId = await insertRadarNR1Report(client.db, { companyId: tempCompany.id });
    await client.db.delete(companies).where(eq(companies.id, tempCompany.id));
    expect(await getRadarNR1ReportById(client.db, reportId)).toBeUndefined();
  });
});
