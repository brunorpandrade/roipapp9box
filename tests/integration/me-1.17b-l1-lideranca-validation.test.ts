// ROIP APP 9BOX — teste de integracao `countActiveLiderados` (ME-1.17.b,
// Conversa 5 — validacao canonica L1 server-side para familia de funcao
// de colaborador com liderados ativos).
//
// Cobre canonicamente bit-exact a funcao `countActiveLiderados`
// (`src/server/routers/employees.ts:924`) que o guard L1 da procedure
// `employees.update` consome para validar: colaborador com liderados
// ATIVOS exige `jobFamily === 'lideranca_gestao'` (decisao executiva
// de Bruno em 24/10/2026).
//
// Dois cenarios canonicos (RV-03 — regua provada nos dois sentidos):
//   1. Lider com 1 liderado ativo → countActiveLiderados = 1. Guard L1
//      do router rejeita update para jobFamily != 'lideranca_gestao'.
//   2. Lider sem liderados ativos (desligado) → countActiveLiderados = 0.
//      Guard L1 do router aceita qualquer jobFamily.
//
// Padrao bit-exact ao `tests/integration/employees.test.ts` (ME-011):
// cria company local com CNPJ unico, limpa employees/leaderHistory no
// beforeEach, usa service puro `createEmployee` do dominio.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfilePlaceholders,
} from '../../src/db/schema';
import { createEmployee, type NewEmployee } from '../../src/server/services/employees';
import { countActiveLiderados } from '../../src/server/routers/employees';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '33333333000133';

function buildEmployee(companyId: number, overrides: Partial<NewEmployee> = {}): NewEmployee {
  return {
    companyId,
    name: 'Colab L1 Teste',
    cpf: '11111111112',
    email: 'colab.l1@roip.local',
    dataNascimento: new Date('1990-01-01'),
    dataAdmissao: new Date('2020-01-15'),
    cbo: '141405',
    descricaoCBO: 'Analista',
    jobFamily: 'lideranca_gestao',
    senioridade: 'pleno',
    nivelHierarquico: 'tatico',
    departamento: 'Operações',
    ...overrides,
  };
}

describe('L1 lideranca_gestao validation — countActiveLiderados (ME-1.17.b)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa L1 Validation LTDA',
        nomeFantasia: 'Empresa L1 Validation',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330002',
        endereco: 'Rua L1, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@l1.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@l1.local',
        segmento: 'Comércio',
        tipoAtividade: 'Comercio de bens',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 4,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!row) {
      throw new Error('setup L1: insert company retornou sem id');
    }
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db.delete(employeeTerminationEvents);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db.delete(employeeTerminationEvents);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
  });

  it('lider com 1 liderado ativo → countActiveLiderados retorna 1', async () => {
    const liderId = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '21111111111',
        email: 'lider.l1@roip.local',
        jobFamily: 'lideranca_gestao',
      }),
    );
    const liderado1 = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '21111111112',
        email: 'liderado1.l1@roip.local',
        jobFamily: 'vendas_comercial',
      }),
    );
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado1,
      liderId: liderId,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'Setup L1 — vinculo ativo',
      transferBatchId: randomUUID(),
    });

    const count = await countActiveLiderados(client.db, liderId);
    expect(count).toBe(1);
  });

  it('lider sem liderados ativos → countActiveLiderados retorna 0', async () => {
    const liderId = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '31111111111',
        email: 'lider.sem.l1@roip.local',
        jobFamily: 'lideranca_gestao',
      }),
    );
    const count = await countActiveLiderados(client.db, liderId);
    expect(count).toBe(0);
  });

  it('lider com liderado de vinculo fechado (dataFim preenchido) → count = 0', async () => {
    const liderId = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '41111111111',
        email: 'lider.fechado.l1@roip.local',
        jobFamily: 'lideranca_gestao',
      }),
    );
    const liderado1 = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '41111111112',
        email: 'liderado.fechado.l1@roip.local',
        jobFamily: 'vendas_comercial',
      }),
    );
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado1,
      liderId: liderId,
      dataInicio: new Date('2024-01-01'),
      dataFim: new Date('2024-12-31'),
      reason: 'Setup L1 — vinculo fechado',
      transferBatchId: randomUUID(),
    });

    const count = await countActiveLiderados(client.db, liderId);
    expect(count).toBe(0);
  });

  it('lider com liderado inativo (status=inativo) → countActiveLiderados retorna 0', async () => {
    const liderId = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '51111111111',
        email: 'lider.inat.l1@roip.local',
        jobFamily: 'lideranca_gestao',
      }),
    );
    const liderado1 = await createEmployee(
      client.db,
      buildEmployee(companyId, {
        cpf: '51111111112',
        email: 'liderado.inat.l1@roip.local',
        jobFamily: 'vendas_comercial',
      }),
    );
    await client.db.update(employees).set({ status: 'inativo' }).where(eq(employees.id, liderado1));
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado1,
      liderId: liderId,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'Setup L1 — vinculo aberto porem liderado inativo',
      transferBatchId: randomUUID(),
    });

    const count = await countActiveLiderados(client.db, liderId);
    expect(count).toBe(0);
  });
});
