// ROIP APP 9BOX — teste de integracao `employeeGoals` (ME-011).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfilePlaceholders,
  leaderOnboardingNotes,
  leaderOnboardingStageLog,
  cLevelMembers,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  deleteGoalsByEmployee,
  getEmployeeGoal,
  insertEmployeeGoal,
  listGoalsByEmployee,
  updateEmployeeGoal,
} from '../../src/server/services/employeeGoals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '44444444000104';

describe('service employeeGoals (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Goals Test LTDA',
        nomeFantasia: 'Empresa Goals Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330004',
        endereco: 'Rua Goals, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@goals.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@goals.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company');
    companyId = companyRow.id;
  });

  afterAll(async () => {
    // Cleanup completo do escopo pessoas + delete da company local para
    // deixar `roip_test` no mesmo estado do inicio (fixtures do
    // globalSetup). Impede que este arquivo arraste employees / cLevels
    // remanescentes para arquivos que rodem depois (companyJobFamilies e
    // companies fazem delete de companies sem WHERE).
    await client.db.delete(leaderOnboardingStageLog);
    await client.db.delete(leaderOnboardingNotes);
    await client.db.delete(employeeTerminationEvents);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(leaderOnboardingStageLog);
    await client.db.delete(leaderOnboardingNotes);
    await client.db.delete(employeeTerminationEvents);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);

    employeeId = await createEmployee(client.db, {
      companyId,
      name: 'Vendedor Local',
      cpf: '30000000001',
      dataNascimento: new Date('1992-04-04'),
      dataAdmissao: new Date('2021-05-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });
  });

  it('insertEmployeeGoal insere e retorna id numerico', async () => {
    const id = await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 0,
      variableName: 'Faturamento',
      unit: 'BRL',
      weight: '40.00',
      goal: '50000.00',
      updatedBy: 'rh',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getEmployeeGoal resolve pelo par (employeeId, variableIndex)', async () => {
    const id = await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket médio',
      unit: 'BRL',
      weight: '30.00',
      goal: '450.00',
      updatedBy: 'rh',
    });
    const row = await getEmployeeGoal(client.db, employeeId, 1);
    if (!row) throw new Error('getEmployeeGoal retornou undefined');
    expect(row.id).toBe(id);
    expect(row.variableName).toBe('Ticket médio');
  });

  it('getEmployeeGoal retorna undefined para variableIndex inexistente', async () => {
    const row = await getEmployeeGoal(client.db, employeeId, 99);
    expect(row).toBeUndefined();
  });

  it('listGoalsByEmployee ordena por variableIndex crescente', async () => {
    // Insercao fora de ordem para forcar o sort do service.
    const id2 = await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 2,
      variableName: 'Novos clientes',
      unit: 'unidade',
      weight: '20.00',
      goal: '10.00',
      updatedBy: 'lider',
    });
    const id0 = await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 0,
      variableName: 'Faturamento',
      unit: 'BRL',
      weight: '50.00',
      goal: '50000.00',
      updatedBy: 'rh',
    });
    const id1 = await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket médio',
      unit: 'BRL',
      weight: '30.00',
      goal: '450.00',
      updatedBy: 'rh',
    });
    const rows = await listGoalsByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([id0, id1, id2]);
    expect(rows.map((r) => r.variableIndex)).toEqual([0, 1, 2]);
  });

  it('updateEmployeeGoal altera weight e goal, preservando os demais campos', async () => {
    await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 0,
      variableName: 'Faturamento',
      unit: 'BRL',
      weight: '40.00',
      goal: '50000.00',
      updatedBy: 'rh',
    });
    const affected = await updateEmployeeGoal(client.db, employeeId, 0, {
      weight: '55.00',
      goal: '60000.00',
      updatedBy: 'lider',
    });
    expect(affected).toBe(1);
    const row = await getEmployeeGoal(client.db, employeeId, 0);
    if (!row) throw new Error('getEmployeeGoal retornou undefined apos update');
    expect(row.weight).toBe('55.00');
    expect(row.goal).toBe('60000.00');
    expect(row.updatedBy).toBe('lider');
    expect(row.variableName).toBe('Faturamento');
  });

  it('deleteGoalsByEmployee remove todas as metas do colaborador', async () => {
    await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 0,
      variableName: 'Faturamento',
      unit: 'BRL',
      weight: '50.00',
      goal: '50000.00',
      updatedBy: 'rh',
    });
    await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket médio',
      unit: 'BRL',
      weight: '50.00',
      goal: '450.00',
      updatedBy: 'rh',
    });
    const affected = await deleteGoalsByEmployee(client.db, employeeId);
    expect(affected).toBe(2);
    const rows = await listGoalsByEmployee(client.db, employeeId);
    expect(rows).toHaveLength(0);
  });

  it('uq_goal (§4.7) rejeita variableIndex duplicado para o mesmo colaborador', async () => {
    await insertEmployeeGoal(client.db, {
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex: 0,
      variableName: 'Faturamento',
      unit: 'BRL',
      weight: '50.00',
      goal: '50000.00',
      updatedBy: 'rh',
    });
    await expect(
      insertEmployeeGoal(client.db, {
        employeeId,
        jobFamily: 'vendas_comercial',
        variableIndex: 0,
        variableName: 'Faturamento duplicado',
        unit: 'BRL',
        weight: '10.00',
        goal: '10.00',
        updatedBy: 'rh',
      }),
    ).rejects.toThrow();
  });

  it('FK employeeId invalido rejeita insert', async () => {
    await expect(
      insertEmployeeGoal(client.db, {
        employeeId: 999999,
        jobFamily: 'vendas_comercial',
        variableIndex: 0,
        variableName: 'Faturamento',
        unit: 'BRL',
        weight: '50.00',
        goal: '50000.00',
        updatedBy: 'rh',
      }),
    ).rejects.toThrow();
  });
});
