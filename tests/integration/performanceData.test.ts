// ROIP APP 9BOX — teste de integracao `performanceData` (ME-013).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria a propria company local com CNPJ unico do arquivo
// (S009) mais um employee local (necessario pela FK).
//
// Cobre: INSERT, lookup por id, lookup pelo UNIQUE (companyId, employeeId,
// mes), listagem por employee e por company em ordem cronologica,
// setter dedicado do motor (`updatePerformanceDataCalculo`), colisao de
// UNIQUE, FK RESTRICT em employeeId e delete de teardown.
//
// Cleanup:
// - `beforeEach`: apaga apenas `performanceData` (isolamento entre casos).
// - `afterAll`: apaga o escopo + employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, performanceData } from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  deletePerformanceDataById,
  getPerformanceDataById,
  getPerformanceDataByMonth,
  insertPerformanceData,
  listPerformanceDataByCompany,
  listPerformanceDataByEmployee,
  type NewPerformanceData,
  updatePerformanceDataCalculo,
} from '../../src/server/services/performanceData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000111';

function buildValidPerformanceData(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewPerformanceData> = {},
): NewPerformanceData {
  return {
    companyId,
    employeeId,
    mes: '2026-01',
    custoTotalMes: '5000.00',
    faltas: 0,
    ...overrides,
  };
}

describe('service performanceData (ME-013)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let secondEmployeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa PerformanceData Test LTDA',
        nomeFantasia: 'Empresa PerformanceData Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330011',
        endereco: 'Rua PerformanceData, 11',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@performancedata.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@performancedata.local',
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
      name: 'Colaborador PerfData',
      cpf: '10101010101',
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-06-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });

    secondEmployeeId = await createEmployee(client.db, {
      companyId,
      name: 'Colaborador PerfData 2',
      cpf: '10101010102',
      dataNascimento: new Date('1992-05-05'),
      dataAdmissao: new Date('2021-03-01'),
      cbo: '141405',
      descricaoCBO: 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'junior',
      nivelHierarquico: 'operacional',
      departamento: 'Administrativo',
    });
  });

  afterAll(async () => {
    await client.db.delete(performanceData);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceData);
  });

  it('insertPerformanceData insere e retorna id numerico positivo', async () => {
    const id = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId),
    );
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getPerformanceDataById retorna a linha com faltas default = 0', async () => {
    const id = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-02' }),
    );
    const row = await getPerformanceDataById(client.db, id);
    if (!row) throw new Error('getPerformanceDataById retornou undefined');
    expect(row.employeeId).toBe(employeeId);
    expect(row.faltas).toBe(0);
    expect(row.assiduidade).toBeNull();
    expect(row.indiceDesempenho).toBeNull();
  });

  it('getPerformanceDataByMonth resolve pelo trio (company, employee, mes)', async () => {
    const id = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-03' }),
    );
    const row = await getPerformanceDataByMonth(client.db, companyId, employeeId, '2026-03');
    if (!row) throw new Error('getPerformanceDataByMonth retornou undefined');
    expect(row.id).toBe(id);
  });

  it('getPerformanceDataByMonth retorna undefined para trio inexistente', async () => {
    const row = await getPerformanceDataByMonth(client.db, companyId, employeeId, '2099-12');
    expect(row).toBeUndefined();
  });

  it('listPerformanceDataByEmployee ordena por mes crescente', async () => {
    const idJan = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-01' }),
    );
    const idMar = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-03' }),
    );
    const idFev = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-02' }),
    );
    const rows = await listPerformanceDataByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([idJan, idFev, idMar]);
  });

  it('listPerformanceDataByCompany ordena por mes crescente e depois employeeId', async () => {
    // 2 meses x 2 employees; verifica ordem canonica (mes asc, employeeId asc).
    const idJanE1 = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-01' }),
    );
    const idJanE2 = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, secondEmployeeId, { mes: '2026-01' }),
    );
    const idFevE1 = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-02' }),
    );
    const idFevE2 = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, secondEmployeeId, { mes: '2026-02' }),
    );
    const rows = await listPerformanceDataByCompany(client.db, companyId);
    // employeeId de employeeId < secondEmployeeId (autoincrement na ordem de criacao).
    expect(rows.map((r) => r.id)).toEqual([idJanE1, idJanE2, idFevE1, idFevE2]);
  });

  it('updatePerformanceDataCalculo grava assiduidade, indiceDesempenho e calculadoEm', async () => {
    const id = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-04', faltas: 2 }),
    );
    const calculadoEm = new Date('2026-05-11T00:00:05Z');
    const affected = await updatePerformanceDataCalculo(client.db, id, {
      assiduidade: '90.91',
      indiceDesempenho: '1.0500',
      calculadoEm,
    });
    expect(affected).toBe(1);
    const row = await getPerformanceDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.assiduidade).toBe('90.91');
    expect(row.indiceDesempenho).toBe('1.0500');
    expect(row.calculadoEm).not.toBeNull();
    // Confirma que faltas e custoTotalMes nao foram tocados pelo setter.
    expect(row.faltas).toBe(2);
    expect(row.custoTotalMes).toBe('5000.00');
  });

  it('UNIQUE (companyId, employeeId, mes) impede duas linhas para o mesmo par', async () => {
    await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-06' }),
    );
    await expect(
      insertPerformanceData(
        client.db,
        buildValidPerformanceData(companyId, employeeId, { mes: '2026-06' }),
      ),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em employeeId impede insert com employee inexistente', async () => {
    await expect(
      insertPerformanceData(
        client.db,
        buildValidPerformanceData(companyId, 99999, { mes: '2026-07' }),
      ),
    ).rejects.toThrow();
  });

  it('deletePerformanceDataById remove a linha e retorna affectedRows=1', async () => {
    const id = await insertPerformanceData(
      client.db,
      buildValidPerformanceData(companyId, employeeId, { mes: '2026-08' }),
    );
    const affected = await deletePerformanceDataById(client.db, id);
    expect(affected).toBe(1);
    const row = await getPerformanceDataById(client.db, id);
    expect(row).toBeUndefined();
  });
});
