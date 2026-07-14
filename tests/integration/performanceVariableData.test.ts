// ROIP APP 9BOX — teste de integracao `performanceVariableData` (ME-013).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local + employee local + uma linha de
// `performanceData` (via `insertPerformanceData` do service da propria
// ME-013 — dogfood RV-13).
//
// Cobre: INSERT, lookup por id e pelo UNIQUE (performanceDataId,
// variableIndex), listagem ordenada por variableIndex, setter do motor
// (`updatePerformanceVariableCalculo`), CASCADE ao deletar a linha pai
// e FK ao inserir com performanceDataId invalido.
//
// Cleanup:
// - `beforeEach`: apaga `performanceVariableData` + `performanceData` do
//   escopo (a CASCADE ja garantiria, mas explicitamos).
// - `afterAll`: apaga o escopo + employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  performanceData,
  performanceVariableData,
} from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import { insertPerformanceData } from '../../src/server/services/performanceData';
import {
  deletePerformanceVariableDataByPerformance,
  getPerformanceVariableDataById,
  getPerformanceVariableDataByIndex,
  insertPerformanceVariableData,
  listPerformanceVariableDataByPerformance,
  type NewPerformanceVariableData,
  updatePerformanceVariableCalculo,
} from '../../src/server/services/performanceVariableData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000112';

function buildValidVariable(
  performanceDataId: number,
  variableIndex: number,
  overrides: Partial<NewPerformanceVariableData> = {},
): NewPerformanceVariableData {
  return {
    performanceDataId,
    variableIndex,
    demanda: '10000.00',
    executado: '8500.00',
    ...overrides,
  };
}

describe('service performanceVariableData (ME-013)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let performanceDataId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa PerformanceVariable Test LTDA',
        nomeFantasia: 'Empresa PerformanceVariable Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330012',
        endereco: 'Rua PerformanceVariable, 12',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@performancevariable.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@performancevariable.local',
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
      name: 'Colab PerfVar',
      cpf: '10101010112',
      dataNascimento: new Date('1988-01-01'),
      dataAdmissao: new Date('2018-04-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
    });
  });

  afterAll(async () => {
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    // Recria a linha pai a cada caso para isolar.
    performanceDataId = await insertPerformanceData(client.db, {
      companyId,
      employeeId,
      mes: '2026-01',
      custoTotalMes: '5000.00',
      faltas: 0,
    });
  });

  it('insertPerformanceVariableData insere e retorna id numerico positivo', async () => {
    const id = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 0),
    );
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getPerformanceVariableDataById retorna a linha com peso/desempenho null', async () => {
    const id = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 1, { demanda: '20000.00', executado: '18000.00' }),
    );
    const row = await getPerformanceVariableDataById(client.db, id);
    if (!row) throw new Error('getPerformanceVariableDataById retornou undefined');
    expect(row.performanceDataId).toBe(performanceDataId);
    expect(row.variableIndex).toBe(1);
    expect(row.demanda).toBe('20000.00');
    expect(row.executado).toBe('18000.00');
    expect(row.desempenho).toBeNull();
    expect(row.peso).toBeNull();
  });

  it('getPerformanceVariableDataByIndex resolve pelo par UNIQUE', async () => {
    const id = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 2),
    );
    const row = await getPerformanceVariableDataByIndex(client.db, performanceDataId, 2);
    if (!row) throw new Error('getPerformanceVariableDataByIndex retornou undefined');
    expect(row.id).toBe(id);
  });

  it('listPerformanceVariableDataByPerformance ordena por variableIndex crescente', async () => {
    // Insercao fora de ordem para forcar o sort do service.
    const id2 = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 2),
    );
    const id0 = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 0),
    );
    const id3 = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 3),
    );
    const id1 = await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 1),
    );
    const rows = await listPerformanceVariableDataByPerformance(client.db, performanceDataId);
    expect(rows.map((r) => r.id)).toEqual([id0, id1, id2, id3]);
    expect(rows.map((r) => r.variableIndex)).toEqual([0, 1, 2, 3]);
  });

  it('updatePerformanceVariableCalculo grava desempenho e peso', async () => {
    await insertPerformanceVariableData(
      client.db,
      buildValidVariable(performanceDataId, 0, { demanda: '10000.00', executado: '8500.00' }),
    );
    const affected = await updatePerformanceVariableCalculo(client.db, performanceDataId, 0, {
      desempenho: '0.8500',
      peso: '40.00',
    });
    expect(affected).toBe(1);
    const row = await getPerformanceVariableDataByIndex(client.db, performanceDataId, 0);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.desempenho).toBe('0.8500');
    expect(row.peso).toBe('40.00');
    // demanda/executado nao devem ter sido tocados.
    expect(row.demanda).toBe('10000.00');
    expect(row.executado).toBe('8500.00');
  });

  it('UNIQUE (performanceDataId, variableIndex) impede duas linhas mesmo indice', async () => {
    await insertPerformanceVariableData(client.db, buildValidVariable(performanceDataId, 0));
    await expect(
      insertPerformanceVariableData(
        client.db,
        buildValidVariable(performanceDataId, 0, { demanda: '99999.99' }),
      ),
    ).rejects.toThrow();
  });

  it('FK invalida (performanceDataId inexistente) impede insert', async () => {
    await expect(
      insertPerformanceVariableData(client.db, buildValidVariable(99999, 0)),
    ).rejects.toThrow();
  });

  it('CASCADE: deletar performanceData apaga suas linhas de performanceVariableData', async () => {
    await insertPerformanceVariableData(client.db, buildValidVariable(performanceDataId, 0));
    await insertPerformanceVariableData(client.db, buildValidVariable(performanceDataId, 1));
    // Confirma que existem 2 linhas antes.
    const antes = await listPerformanceVariableDataByPerformance(client.db, performanceDataId);
    expect(antes.length).toBe(2);
    // Apaga a linha pai — CASCADE deve levar as filhas.
    await client.db.delete(performanceData).where(eq(performanceData.id, performanceDataId));
    const depois = await listPerformanceVariableDataByPerformance(client.db, performanceDataId);
    expect(depois.length).toBe(0);
  });

  it('deletePerformanceVariableDataByPerformance remove filhas sem apagar o pai', async () => {
    await insertPerformanceVariableData(client.db, buildValidVariable(performanceDataId, 0));
    await insertPerformanceVariableData(client.db, buildValidVariable(performanceDataId, 1));
    const affected = await deletePerformanceVariableDataByPerformance(client.db, performanceDataId);
    expect(affected).toBe(2);
    const depois = await listPerformanceVariableDataByPerformance(client.db, performanceDataId);
    expect(depois.length).toBe(0);
    // Pai continua existindo.
    const paiRows = await client.db
      .select()
      .from(performanceData)
      .where(eq(performanceData.id, performanceDataId));
    expect(paiRows.length).toBe(1);
  });
});
