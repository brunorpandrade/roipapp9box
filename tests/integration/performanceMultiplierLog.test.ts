// ROIP APP 9BOX — teste de integracao `performanceMultiplierLog` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009), employee local, e uma linha pai
// em `performanceQuarterlyData` via o service da propria ME-014 (dogfood
// RV-13 — precedente `performanceVariableData` em ME-013).
//
// Cobre: INSERT, lookup por id, listagens por quarterly / employee /
// (employee, trimestre), append-only (nenhum setter/delete exposto),
// CASCADE ao deletar a linha pai, FK RESTRICT em employeeId, os 3
// valores de `nivelHierarquico`, campo `ajusteRetroativo`.
//
// Cleanup:
// - `beforeEach`: apaga `performanceMultiplierLog` +
//   `performanceQuarterlyData` do escopo. Recria a linha pai a cada
//   caso para isolar.
// - `afterAll`: apaga o escopo + employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  performanceMultiplierLog,
  performanceQuarterlyData,
} from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  getPerformanceMultiplierLogById,
  insertPerformanceMultiplierLog,
  listPerformanceMultiplierLogByEmployee,
  listPerformanceMultiplierLogByEmployeeQuarter,
  listPerformanceMultiplierLogByQuarterly,
  type NewPerformanceMultiplierLog,
} from '../../src/server/services/performanceMultiplierLog';
import { insertPerformanceQuarterlyData } from '../../src/server/services/performanceQuarterlyData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000116';

function buildValidMultiplier(
  quarterlyDataId: number,
  employeeId: number,
  overrides: Partial<NewPerformanceMultiplierLog> = {},
): NewPerformanceMultiplierLog {
  return {
    quarterlyDataId,
    employeeId,
    trimestre: '2026-Q1',
    nivelHierarquico: 'tatico',
    metaROIUsada: '3.00',
    ...overrides,
  };
}

describe('service performanceMultiplierLog (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let quarterlyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa PerfMultiplier Test LTDA',
        nomeFantasia: 'Empresa PerfMultiplier Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330016',
        endereco: 'Rua PerfMultiplier, 16',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@perfmultiplier.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@perfmultiplier.local',
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
      name: 'Colab PerfMultiplier',
      cpf: '10101010117',
      dataNascimento: new Date('1985-06-01'),
      dataAdmissao: new Date('2015-03-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente Comercial',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
    });
  });

  afterAll(async () => {
    await client.db.delete(performanceMultiplierLog);
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceMultiplierLog);
    await client.db.delete(performanceQuarterlyData);
    // Recria a linha pai a cada caso para isolar (dogfood RV-13).
    quarterlyId = await insertPerformanceQuarterlyData(client.db, {
      companyId,
      employeeId,
      trimestre: '2026-Q1',
    });
  });

  it('insertPerformanceMultiplierLog insere e retorna id positivo', async () => {
    const id = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId),
    );
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getPerformanceMultiplierLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.quarterlyDataId).toBe(quarterlyId);
    expect(row.employeeId).toBe(employeeId);
    expect(row.nivelHierarquico).toBe('tatico');
    expect(row.metaROIUsada).toBe('3.00');
    // ajusteRetroativo nasce false por default.
    expect(row.ajusteRetroativo).toBe(false);
  });

  it('insertPerformanceMultiplierLog cobre os 3 niveis hierarquicos canonicos', async () => {
    const idOp = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        nivelHierarquico: 'operacional',
        metaROIUsada: '2.50',
      }),
    );
    const idTa = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        nivelHierarquico: 'tatico',
        metaROIUsada: '3.00',
      }),
    );
    const idEs = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        nivelHierarquico: 'estrategico',
        metaROIUsada: '4.00',
      }),
    );
    const rowOp = await getPerformanceMultiplierLogById(client.db, idOp);
    const rowTa = await getPerformanceMultiplierLogById(client.db, idTa);
    const rowEs = await getPerformanceMultiplierLogById(client.db, idEs);
    expect(rowOp?.nivelHierarquico).toBe('operacional');
    expect(rowTa?.nivelHierarquico).toBe('tatico');
    expect(rowEs?.nivelHierarquico).toBe('estrategico');
  });

  it('insertPerformanceMultiplierLog aceita ajusteRetroativo=true', async () => {
    const id = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        ajusteRetroativo: true,
        metaROIUsada: '3.20',
      }),
    );
    const row = await getPerformanceMultiplierLogById(client.db, id);
    expect(row?.ajusteRetroativo).toBe(true);
    expect(row?.metaROIUsada).toBe('3.20');
  });

  it('listPerformanceMultiplierLogByQuarterly ordena por calculadoEm crescente', async () => {
    const id1 = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, { metaROIUsada: '3.00' }),
    );
    const id2 = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        metaROIUsada: '3.10',
        ajusteRetroativo: true,
      }),
    );
    const id3 = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        metaROIUsada: '3.20',
        ajusteRetroativo: true,
      }),
    );
    const rows = await listPerformanceMultiplierLogByQuarterly(client.db, quarterlyId);
    expect(rows.length).toBe(3);
    // calculadoEm iguais na mesma resolucao — desempate por id asc.
    expect(rows.map((r) => r.id)).toEqual([id1, id2, id3]);
  });

  it('listPerformanceMultiplierLogByEmployee ordena por trimestre desc, id desc', async () => {
    // Cria uma segunda linha trimestral pai para o mesmo employee.
    const quarterly2Id = await insertPerformanceQuarterlyData(client.db, {
      companyId,
      employeeId,
      trimestre: '2026-Q2',
    });
    const idQ1 = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ2 = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterly2Id, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listPerformanceMultiplierLogByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([idQ2, idQ1]);
  });

  it('listPerformanceMultiplierLogByEmployeeQuarter isola pelo par', async () => {
    const quarterly2Id = await insertPerformanceQuarterlyData(client.db, {
      companyId,
      employeeId,
      trimestre: '2026-Q3',
    });
    const idQ1a = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ1b = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId, {
        trimestre: '2026-Q1',
        metaROIUsada: '3.15',
        ajusteRetroativo: true,
      }),
    );
    await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterly2Id, employeeId, { trimestre: '2026-Q3' }),
    );
    const rows = await listPerformanceMultiplierLogByEmployeeQuarter(
      client.db,
      employeeId,
      '2026-Q1',
    );
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.id)).toEqual([idQ1a, idQ1b]);
  });

  it('CASCADE ao deletar a linha pai remove tambem os logs filhos', async () => {
    const id = await insertPerformanceMultiplierLog(
      client.db,
      buildValidMultiplier(quarterlyId, employeeId),
    );
    const antes = await getPerformanceMultiplierLogById(client.db, id);
    expect(antes).toBeDefined();
    // Deleta a linha trimestral pai — CASCADE deve remover o log.
    await client.db
      .delete(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.id, quarterlyId));
    const depois = await getPerformanceMultiplierLogById(client.db, id);
    expect(depois).toBeUndefined();
  });

  it('FK em quarterlyDataId impede insert com id inexistente', async () => {
    await expect(
      insertPerformanceMultiplierLog(client.db, buildValidMultiplier(99999, employeeId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em employeeId impede insert com employee inexistente', async () => {
    await expect(
      insertPerformanceMultiplierLog(client.db, buildValidMultiplier(quarterlyId, 99999)),
    ).rejects.toThrow();
  });
});
