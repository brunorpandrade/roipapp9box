// ROIP APP 9BOX — teste de integracao `nineBoxCalculationLog` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e employee local, cobre o §8.6:
// insert com os 4 valores canonicos do enum `status`, listagens por
// company / employee / (employee, trimestre), append-only (nenhum setter
// nem delete exposto), FK RESTRICT em employeeId e companyId, ausencia
// de FK formal para `nineBoxClassifications` (nao ha dogfood — o log
// existe justamente para registrar tentativas que NAO produziram
// classificacao).
//
// Cleanup:
// - `beforeEach`: apaga `nineBoxCalculationLog` do escopo.
// - `afterAll`: apaga employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, nineBoxCalculationLog } from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  getNineBoxCalculationLogById,
  insertNineBoxCalculationLog,
  listNineBoxCalculationLogByCompany,
  listNineBoxCalculationLogByEmployee,
  listNineBoxCalculationLogByEmployeeQuarter,
  type NewNineBoxCalculationLog,
} from '../../src/server/services/nineBoxCalculationLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000120';

function buildValidLog(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewNineBoxCalculationLog> = {},
): NewNineBoxCalculationLog {
  return {
    companyId,
    employeeId,
    trimestre: '2026-Q1',
    status: 'calculado',
    ...overrides,
  };
}

describe('service nineBoxCalculationLog (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa NineBoxLog Test LTDA',
        nomeFantasia: 'Empresa NineBoxLog Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330020',
        endereco: 'Rua NineBoxLog, 20',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@nineboxlog.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@nineboxlog.local',
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
      name: 'Colab NineBoxLog',
      cpf: '10101010122',
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2015-04-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
    });
  });

  afterAll(async () => {
    await client.db.delete(nineBoxCalculationLog);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(nineBoxCalculationLog);
  });

  it('insertNineBoxCalculationLog com status=calculado insere e retorna id positivo', async () => {
    const id = await insertNineBoxCalculationLog(client.db, buildValidLog(companyId, employeeId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getNineBoxCalculationLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.companyId).toBe(companyId);
    expect(row.employeeId).toBe(employeeId);
    expect(row.trimestre).toBe('2026-Q1');
    expect(row.status).toBe('calculado');
    // observacao default null (§8.6 nao carrega snapshot dos eixos).
    expect(row.observacao).toBeNull();
  });

  it('status aceita os 4 valores canonicos do enum', async () => {
    const statuses = ['calculado', 'eixo_x_ausente', 'eixo_y_ausente', 'ambos_ausentes'] as const;
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      if (!status) throw new Error(`statuses[${i}] indefinido`);
      const id = await insertNineBoxCalculationLog(
        client.db,
        buildValidLog(companyId, employeeId, { status, trimestre: `2027-Q${i + 1}` }),
      );
      const row = await getNineBoxCalculationLogById(client.db, id);
      expect(row?.status).toBe(status);
    }
  });

  it('insertNineBoxCalculationLog aceita observacao com texto livre', async () => {
    const id = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, {
        status: 'eixo_x_ausente',
        observacao: 'Nao ha performanceQuarterlyData para 2026-Q1 (janela ainda aberta).',
      }),
    );
    const row = await getNineBoxCalculationLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada');
    expect(row.status).toBe('eixo_x_ausente');
    expect(row.observacao).toContain('janela ainda aberta');
  });

  it('sem FK para classificacao: log de status ausente independe de linha pai', async () => {
    // Confirmacao explicita da leitura RV-09 do §8.6: o log grava tentativas
    // que NAO produziram linha em nineBoxClassifications. Nao ha FK formal,
    // e portanto nao ha dependencia estrutural entre as duas tabelas.
    const id = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, {
        status: 'ambos_ausentes',
        observacao: 'Sem performanceQuarterlyData nem plenitudeData para o trimestre.',
      }),
    );
    const row = await getNineBoxCalculationLogById(client.db, id);
    expect(row?.status).toBe('ambos_ausentes');
  });

  it('multiplas tentativas do mesmo (employee, trimestre) sao aceitas (append-only)', async () => {
    const id1 = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { status: 'eixo_y_ausente' }),
    );
    const id2 = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { status: 'calculado' }),
    );
    const rows = await listNineBoxCalculationLogByEmployeeQuarter(client.db, employeeId, '2026-Q1');
    expect(rows.length).toBe(2);
    // Ordem asc por (registradoEm, id) — insercoes em sequencia na mesma
    // resolucao de timestamp, desempate por id asc.
    expect(rows.map((r) => r.id)).toEqual([id1, id2]);
  });

  it('listNineBoxCalculationLogByCompany ordena por registradoEm desc, id desc', async () => {
    const idA = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idB = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const idC = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, {
        trimestre: '2026-Q3',
        status: 'eixo_x_ausente',
      }),
    );
    const rows = await listNineBoxCalculationLogByCompany(client.db, companyId);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.id)).toEqual([idC, idB, idA]);
  });

  it('listNineBoxCalculationLogByEmployee ordena por trimestre asc, id asc', async () => {
    const idQ2 = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const idQ1 = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ3 = await insertNineBoxCalculationLog(
      client.db,
      buildValidLog(companyId, employeeId, { trimestre: '2026-Q3' }),
    );
    const rows = await listNineBoxCalculationLogByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([idQ1, idQ2, idQ3]);
  });

  it('FK RESTRICT em companyId impede insert com company inexistente', async () => {
    await expect(
      insertNineBoxCalculationLog(client.db, buildValidLog(99999, employeeId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em employeeId impede insert com employee inexistente', async () => {
    await expect(
      insertNineBoxCalculationLog(client.db, buildValidLog(companyId, 99999)),
    ).rejects.toThrow();
  });
});
