// ROIP APP 9BOX — teste de integracao `performanceQuarterlyData` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009), employee local e cobre a
// estrutura consolidada do §7.3: insert, lookup pelo UNIQUE trio,
// listagens por employee e por company, setter do motor trimestral
// (`updatePerformanceQuarterlyCalculo`) e setter do Diagnostico IA
// (`updatePerformanceQuarterlyDiagnosticoIA`), colisao de UNIQUE, FKs
// RESTRICT e delete.
//
// Cleanup:
// - `beforeEach`: apaga `performanceQuarterlyData` do escopo.
// - `afterAll`: apaga employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, performanceQuarterlyData } from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  deletePerformanceQuarterlyDataById,
  getPerformanceQuarterlyDataById,
  getPerformanceQuarterlyDataByQuarter,
  insertPerformanceQuarterlyData,
  listPerformanceQuarterlyDataByCompany,
  listPerformanceQuarterlyDataByEmployee,
  type NewPerformanceQuarterlyData,
  updatePerformanceQuarterlyCalculo,
  updatePerformanceQuarterlyDiagnosticoIA,
} from '../../src/server/services/performanceQuarterlyData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000115';

function buildValidQuarter(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewPerformanceQuarterlyData> = {},
): NewPerformanceQuarterlyData {
  return {
    companyId,
    employeeId,
    trimestre: '2026-Q1',
    ...overrides,
  };
}

describe('service performanceQuarterlyData (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let employee2Id: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa PerfQuarter Test LTDA',
        nomeFantasia: 'Empresa PerfQuarter Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330015',
        endereco: 'Rua PerfQuarter, 15',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@perfquarter.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@perfquarter.local',
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
      name: 'Colab PerfQuarter 1',
      cpf: '10101010115',
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
      name: 'Colab PerfQuarter 2',
      cpf: '10101010116',
      dataNascimento: new Date('1990-05-15'),
      dataAdmissao: new Date('2020-08-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });
  });

  afterAll(async () => {
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceQuarterlyData);
  });

  it('insertPerformanceQuarterlyData insere linha basica e retorna id positivo', async () => {
    const id = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId),
    );
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getPerformanceQuarterlyDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.companyId).toBe(companyId);
    expect(row.employeeId).toBe(employeeId);
    expect(row.trimestre).toBe('2026-Q1');
    // Todos os campos calculados nascem NULL — o motor trimestral popula depois.
    expect(row.indiceDesempenho).toBeNull();
    expect(row.scoreDesempenho).toBeNull();
    expect(row.faixaDesempenho).toBeNull();
    expect(row.metaROI).toBeNull();
    expect(row.diagnosticoIA).toBeNull();
    expect(row.diagnosticoIAgeradoEm).toBeNull();
  });

  it('getPerformanceQuarterlyDataByQuarter resolve pelo UNIQUE trio', async () => {
    const id = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const row = await getPerformanceQuarterlyDataByQuarter(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
    );
    if (!row) throw new Error('linha nao encontrada por (companyId, employeeId, trimestre)');
    expect(row.id).toBe(id);
    const miss = await getPerformanceQuarterlyDataByQuarter(
      client.db,
      companyId,
      employeeId,
      '2099-Q4',
    );
    expect(miss).toBeUndefined();
  });

  it('listPerformanceQuarterlyDataByEmployee ordena por trimestre crescente', async () => {
    const idQ2 = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const idQ4 = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId, { trimestre: '2026-Q4' }),
    );
    const idQ1 = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const rows = await listPerformanceQuarterlyDataByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([idQ1, idQ2, idQ4]);
  });

  it('listPerformanceQuarterlyDataByCompany ordena por trimestre e employeeId', async () => {
    const idQ1E1 = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ1E2 = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employee2Id, { trimestre: '2026-Q1' }),
    );
    const idQ2E1 = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listPerformanceQuarterlyDataByCompany(client.db, companyId);
    const e1Order = employeeId < employee2Id ? [idQ1E1, idQ1E2] : [idQ1E2, idQ1E1];
    expect(rows.map((r) => r.id)).toEqual([...e1Order, idQ2E1]);
  });

  it('updatePerformanceQuarterlyCalculo grava blocos Eixo X e financeiro', async () => {
    const id = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId),
    );
    const calculadoEm = new Date('2026-04-15T12:00:00Z');
    const affected = await updatePerformanceQuarterlyCalculo(client.db, id, {
      indiceDesempenho: '1.2345',
      scoreDesempenho: '123.45',
      capacidadeOciosa: '15.75',
      faixaDesempenho: 'alto',
      custoMedioTrimestral: '15000.00',
      metaROI: '3.50',
      retornoPotencial: '52500.00',
      participacao: '0.125000',
      retornoEstimado: '48000.00',
      roiEstimado: '3.2000',
      percMetaAtingida: '91.42',
      calculadoEm,
    });
    expect(affected).toBe(1);
    const row = await getPerformanceQuarterlyDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.indiceDesempenho).toBe('1.2345');
    expect(row.scoreDesempenho).toBe('123.45');
    expect(row.capacidadeOciosa).toBe('15.75');
    expect(row.faixaDesempenho).toBe('alto');
    expect(row.metaROI).toBe('3.50');
    expect(row.percMetaAtingida).toBe('91.42');
    // Diagnostico IA nao e tocado por este setter.
    expect(row.diagnosticoIA).toBeNull();
    expect(row.diagnosticoIAgeradoEm).toBeNull();
  });

  it('updatePerformanceQuarterlyCalculo aceita capacidadeOciosa null (familia 6)', async () => {
    const id = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId),
    );
    const affected = await updatePerformanceQuarterlyCalculo(client.db, id, {
      indiceDesempenho: '0.7500',
      scoreDesempenho: '75.00',
      capacidadeOciosa: null,
      faixaDesempenho: 'baixo',
      custoMedioTrimestral: '9000.00',
      metaROI: '3.00',
      retornoPotencial: '27000.00',
      participacao: '0.050000',
      retornoEstimado: '20250.00',
      roiEstimado: '2.2500',
      percMetaAtingida: '75.00',
      calculadoEm: new Date('2026-04-15T12:00:00Z'),
    });
    expect(affected).toBe(1);
    const row = await getPerformanceQuarterlyDataById(client.db, id);
    expect(row?.capacidadeOciosa).toBeNull();
    expect(row?.faixaDesempenho).toBe('baixo');
  });

  it('updatePerformanceQuarterlyDiagnosticoIA nao toca blocos calculados', async () => {
    const id = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId),
    );
    // Popula blocos calculados primeiro.
    await updatePerformanceQuarterlyCalculo(client.db, id, {
      indiceDesempenho: '1.0000',
      scoreDesempenho: '100.00',
      capacidadeOciosa: '10.00',
      faixaDesempenho: 'medio',
      custoMedioTrimestral: '12000.00',
      metaROI: '3.00',
      retornoPotencial: '36000.00',
      participacao: '0.100000',
      retornoEstimado: '36000.00',
      roiEstimado: '3.0000',
      percMetaAtingida: '100.00',
      calculadoEm: new Date('2026-04-15T12:00:00Z'),
    });
    // Agora aplica o setter do Diagnostico IA.
    const geradoEm = new Date('2026-04-20T10:30:00Z');
    const affected = await updatePerformanceQuarterlyDiagnosticoIA(client.db, id, {
      diagnosticoIA: 'Desempenho medio consistente com meta trimestral.',
      diagnosticoIAgeradoEm: geradoEm,
    });
    expect(affected).toBe(1);
    const row = await getPerformanceQuarterlyDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos IA');
    expect(row.diagnosticoIA).toBe('Desempenho medio consistente com meta trimestral.');
    expect(row.diagnosticoIAgeradoEm).not.toBeNull();
    // Blocos calculados intocados.
    expect(row.indiceDesempenho).toBe('1.0000');
    expect(row.scoreDesempenho).toBe('100.00');
    expect(row.faixaDesempenho).toBe('medio');
  });

  it('UNIQUE uq_perfQuarter impede duplicidade do trio', async () => {
    await insertPerformanceQuarterlyData(client.db, buildValidQuarter(companyId, employeeId));
    await expect(
      insertPerformanceQuarterlyData(client.db, buildValidQuarter(companyId, employeeId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em employeeId impede insert com employee inexistente', async () => {
    await expect(
      insertPerformanceQuarterlyData(
        client.db,
        buildValidQuarter(companyId, 99999, { trimestre: '2026-Q3' }),
      ),
    ).rejects.toThrow();
  });

  it('deletePerformanceQuarterlyDataById remove a linha e retorna 1', async () => {
    const id = await insertPerformanceQuarterlyData(
      client.db,
      buildValidQuarter(companyId, employeeId),
    );
    const affected = await deletePerformanceQuarterlyDataById(client.db, id);
    expect(affected).toBe(1);
    const row = await getPerformanceQuarterlyDataById(client.db, id);
    expect(row).toBeUndefined();
  });
});
