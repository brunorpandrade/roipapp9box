// ROIP APP 9BOX — teste de integracao `apiUsageLog` (ME-017).
//
// Cobre §13.3: upsert por chave UNIQUE (companyId, tipo, dataUso);
// incrementApiUsage insere com contador=1 e depois incrementa em novos
// valores absolutos (RV-12 — sem sql`` no service); getApiUsageForDay
// retorna 0 quando nao ha linha; FK RESTRICT em companyId; delete
// por company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { apiUsageLog, companies } from '../../src/db/schema';
import {
  deleteApiUsageLogByCompany,
  getApiUsageForDay,
  getApiUsageLogRow,
  incrementApiUsage,
} from '../../src/server/services/apiUsageLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000146';

describe('service apiUsageLog (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa ApiUsage Test LTDA',
        nomeFantasia: 'Empresa AU Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330046',
        endereco: 'Rua AU, 46',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@au.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@au.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;
  });

  afterAll(async () => {
    await client.db.delete(apiUsageLog).where(eq(apiUsageLog.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(apiUsageLog).where(eq(apiUsageLog.companyId, companyId));
  });

  it('primeira gravacao do dia retorna contador=1 (INSERT)', async () => {
    const n = await incrementApiUsage(
      client.db,
      companyId,
      'relatorio_executivo',
      new Date('2026-06-15'),
    );
    expect(n).toBe(1);
    const row = await getApiUsageLogRow(
      client.db,
      companyId,
      'relatorio_executivo',
      new Date('2026-06-15'),
    );
    expect(row?.contador).toBe(1);
  });

  it('incrementApiUsage retorna 2, 3, 4, 5 em chamadas sucessivas do mesmo dia', async () => {
    const dia = new Date('2026-06-15');
    for (let esperado = 1; esperado <= 5; esperado++) {
      const n = await incrementApiUsage(client.db, companyId, 'relatorio_executivo', dia);
      expect(n).toBe(esperado);
    }
  });

  it('dias distintos abrem linhas distintas', async () => {
    await incrementApiUsage(client.db, companyId, 'relatorio_executivo', new Date('2026-06-15'));
    const dois = await incrementApiUsage(
      client.db,
      companyId,
      'relatorio_executivo',
      new Date('2026-06-16'),
    );
    expect(dois).toBe(1);
  });

  it('getApiUsageForDay retorna 0 quando nao ha linha', async () => {
    const n = await getApiUsageForDay(
      client.db,
      companyId,
      'relatorio_executivo',
      new Date('2030-01-01'),
    );
    expect(n).toBe(0);
  });

  it('getApiUsageForDay retorna contador atual apos incrementos', async () => {
    const dia = new Date('2026-06-20');
    await incrementApiUsage(client.db, companyId, 'relatorio_executivo', dia);
    await incrementApiUsage(client.db, companyId, 'relatorio_executivo', dia);
    await incrementApiUsage(client.db, companyId, 'relatorio_executivo', dia);
    const n = await getApiUsageForDay(client.db, companyId, 'relatorio_executivo', dia);
    expect(n).toBe(3);
  });

  it('FK RESTRICT em companyId: escopo teste', async () => {
    await expect(
      incrementApiUsage(client.db, 999999, 'relatorio_executivo', new Date('2026-06-15')),
    ).rejects.toThrow();
  });

  it('deleteApiUsageLogByCompany remove todas as linhas da empresa', async () => {
    await incrementApiUsage(client.db, companyId, 'relatorio_executivo', new Date('2026-06-15'));
    await incrementApiUsage(client.db, companyId, 'relatorio_executivo', new Date('2026-06-16'));
    const afetadas = await deleteApiUsageLogByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
