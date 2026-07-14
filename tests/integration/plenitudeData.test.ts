// ROIP APP 9BOX — teste de integracao `plenitudeData` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e employee local, cobre o §8.3:
// insert, lookup pelo UNIQUE trio, listagens por employee e por company,
// setter do motor de plenitude (`updatePlenitudeCalculo` — scores
// principais e por dimensao), os 3 valores de `faixaPlenitude`, colisao
// de UNIQUE, FKs RESTRICT, delete.
//
// Cleanup:
// - `beforeEach`: apaga `plenitudeData` do escopo.
// - `afterAll`: apaga employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, plenitudeData } from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  deletePlenitudeDataById,
  getPlenitudeDataById,
  getPlenitudeDataByQuarter,
  insertPlenitudeData,
  listPlenitudeDataByCompany,
  listPlenitudeDataByEmployee,
  type NewPlenitudeData,
  updatePlenitudeCalculo,
} from '../../src/server/services/plenitudeData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000118';

function buildValidPlenitude(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewPlenitudeData> = {},
): NewPlenitudeData {
  return {
    companyId,
    employeeId,
    trimestre: '2026-Q1',
    ...overrides,
  };
}

describe('service plenitudeData (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let employee2Id: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Plenitude Test LTDA',
        nomeFantasia: 'Empresa Plenitude Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330018',
        endereco: 'Rua Plenitude, 18',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@plenitude.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@plenitude.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    employeeId = await createEmployee(client.db, {
      companyId,
      name: 'Colab Plenitude 1',
      cpf: '10101010118',
      dataNascimento: new Date('1988-01-01'),
      dataAdmissao: new Date('2018-04-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
    });
    employee2Id = await createEmployee(client.db, {
      companyId,
      name: 'Colab Plenitude 2',
      cpf: '10101010119',
      dataNascimento: new Date('1990-02-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });
  });

  afterAll(async () => {
    await client.db.delete(plenitudeData);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(plenitudeData);
  });

  it('insertPlenitudeData insere linha basica e retorna id positivo', async () => {
    const id = await insertPlenitudeData(client.db, buildValidPlenitude(companyId, employeeId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getPlenitudeDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.companyId).toBe(companyId);
    expect(row.employeeId).toBe(employeeId);
    expect(row.trimestre).toBe('2026-Q1');
    // Todos os scores nascem NULL; alertaDivergencia default false.
    expect(row.scoreA).toBeNull();
    expect(row.scoreC).toBeNull();
    expect(row.plenitudeScore).toBeNull();
    expect(row.faixaPlenitude).toBeNull();
    expect(row.divergencia).toBeNull();
    expect(row.alertaDivergencia).toBe(false);
    expect(row.engajamentoA).toBeNull();
    expect(row.engajamentoC).toBeNull();
  });

  it('getPlenitudeDataByQuarter resolve pelo UNIQUE trio', async () => {
    const id = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const row = await getPlenitudeDataByQuarter(client.db, companyId, employeeId, '2026-Q2');
    if (!row) throw new Error('linha nao encontrada pelo trio');
    expect(row.id).toBe(id);
    const miss = await getPlenitudeDataByQuarter(client.db, companyId, employeeId, '2099-Q4');
    expect(miss).toBeUndefined();
  });

  it('listPlenitudeDataByEmployee ordena por trimestre crescente', async () => {
    const idQ3 = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employeeId, { trimestre: '2026-Q3' }),
    );
    const idQ1 = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ2 = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listPlenitudeDataByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([idQ1, idQ2, idQ3]);
  });

  it('listPlenitudeDataByCompany ordena por trimestre e employeeId', async () => {
    const idQ1E1 = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ1E2 = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employee2Id, { trimestre: '2026-Q1' }),
    );
    const idQ2E1 = await insertPlenitudeData(
      client.db,
      buildValidPlenitude(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listPlenitudeDataByCompany(client.db, companyId);
    const e1Order = employeeId < employee2Id ? [idQ1E1, idQ1E2] : [idQ1E2, idQ1E1];
    expect(rows.map((r) => r.id)).toEqual([...e1Order, idQ2E1]);
  });

  it('updatePlenitudeCalculo grava scores principais e por dimensao', async () => {
    const id = await insertPlenitudeData(client.db, buildValidPlenitude(companyId, employeeId));
    const calculadoEm = new Date('2026-04-15T12:00:00Z');
    const affected = await updatePlenitudeCalculo(client.db, id, {
      scoreA: '85.00',
      scoreC: '72.50',
      plenitudeScore: '78.75',
      faixaPlenitude: 'alta',
      divergencia: '12.50',
      alertaDivergencia: true,
      engajamentoA: '90.00',
      engajamentoC: '75.00',
      desenvolvimentoA: '80.00',
      desenvolvimentoC: '70.00',
      pertencimentoA: '85.00',
      pertencimentoC: '72.00',
      realizacaoA: '85.00',
      realizacaoC: '73.00',
      calculadoEm,
    });
    expect(affected).toBe(1);
    const row = await getPlenitudeDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.scoreA).toBe('85.00');
    expect(row.scoreC).toBe('72.50');
    expect(row.plenitudeScore).toBe('78.75');
    expect(row.faixaPlenitude).toBe('alta');
    expect(row.divergencia).toBe('12.50');
    expect(row.alertaDivergencia).toBe(true);
    expect(row.engajamentoA).toBe('90.00');
    expect(row.realizacaoC).toBe('73.00');
  });

  it('updatePlenitudeCalculo aceita nulls para primeira gravacao parcial', async () => {
    const id = await insertPlenitudeData(client.db, buildValidPlenitude(companyId, employeeId));
    // Cenario: apenas Instrumento A foi respondido — scoreC / dimensoesC ficam null.
    const affected = await updatePlenitudeCalculo(client.db, id, {
      scoreA: '80.00',
      scoreC: null,
      plenitudeScore: null,
      faixaPlenitude: null,
      divergencia: null,
      alertaDivergencia: false,
      engajamentoA: '82.00',
      engajamentoC: null,
      desenvolvimentoA: '78.00',
      desenvolvimentoC: null,
      pertencimentoA: '80.00',
      pertencimentoC: null,
      realizacaoA: '80.00',
      realizacaoC: null,
      calculadoEm: new Date('2026-04-15T12:00:00Z'),
    });
    expect(affected).toBe(1);
    const row = await getPlenitudeDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update parcial');
    expect(row.scoreA).toBe('80.00');
    expect(row.scoreC).toBeNull();
    expect(row.plenitudeScore).toBeNull();
    expect(row.faixaPlenitude).toBeNull();
    expect(row.engajamentoA).toBe('82.00');
    expect(row.engajamentoC).toBeNull();
  });

  it('UNIQUE uq_plenitude impede duplicidade do trio', async () => {
    await insertPlenitudeData(client.db, buildValidPlenitude(companyId, employeeId));
    await expect(
      insertPlenitudeData(client.db, buildValidPlenitude(companyId, employeeId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em employeeId impede insert com employee inexistente', async () => {
    await expect(
      insertPlenitudeData(client.db, buildValidPlenitude(companyId, 99999)),
    ).rejects.toThrow();
  });

  it('deletePlenitudeDataById remove e retorna 1', async () => {
    const id = await insertPlenitudeData(client.db, buildValidPlenitude(companyId, employeeId));
    const affected = await deletePlenitudeDataById(client.db, id);
    expect(affected).toBe(1);
    const row = await getPlenitudeDataById(client.db, id);
    expect(row).toBeUndefined();
  });
});
