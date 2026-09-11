// ROIP APP 9BOX — teste de integracao ME-B9-fechamento
// (D-ME083-LIDERES-PREENCHIDOS ENCERRADO). Cobre semantica canonica
// S231-B' + S231.1 do `loadMesAtualClosureStatus`:
// - `lideresComLiderados`: lideres com >=1 liderado direto ativo.
// - `lideresPreenchidos`: subset onde para TODOS os liderados diretos
//   ativos, TODAS as `performanceVariableData` do mes corrente
//   (referenciando `performanceData(mes)`) tem `demanda` E `executado`
//   NOT NULL. Liderado sem `employeeGoals` conta como vaziosamente
//   completo.
//
// Faixa canonica CNPJ desta ME: 10870000000001..10870000000049.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyMonthlyData,
  employeeGoals,
  employeeLeaderHistory,
  employees,
  monthlyClosureStatus,
  performanceData,
  performanceQuarterlyData,
  performanceVariableData,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { loadMesAtualClosureStatus } from '../../src/app/super-admin/empresa/[id]/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_A = '10870000000001';

const REFERENCE = new Date('2026-08-17');
// `deriveMesAtual(reference)` no loader retorna 'YYYY-MM' — para
// 2026-08-17 canonicamente eh '2026-08'.
const MES_ATUAL = '2026-08';

const BASE_COMPANY_INPUT = {
  telefone: '1633330001',
  endereco: 'Rua Teste',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  contatoPrincipalNome: 'Principal',
  contatoPrincipalEmail: 'p@roip.test',
  contatoRHNome: 'RH',
  contatoRHEmail: 'rh@roip.test',
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'A',
  contextoMercado: 'A',
  mesKickoff: 1,
  kickoffDate: new Date('2020-01-01'),
};

describe('ME-B9-fechamento — lideresPreenchidos (S231-B` + S231.1)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(employeeGoals);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(employeeGoals);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-B9-fechamento LTDA',
      nomeFantasia: 'ROIP ME-B9-fechamento',
      cnpj: CNPJ_A,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyId]));
  });

  it('lider com liderado goal completo → preenchido = 1', async () => {
    const liderId = await seedEmployee({ cpf: '20870000001', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000002' });
    await seedLeaderHistory(liderado, liderId);
    await seedGoal(liderado, 1);
    const perfId = await seedPerformanceData(liderado, MES_ATUAL);
    await seedVariableData(perfId, 1, '100.00', '95.00');

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(1);
  });

  it('lider com liderado sem goals (vaziosamente completo) → preenchido = 1', async () => {
    const liderId = await seedEmployee({ cpf: '20870000010', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000011' });
    await seedLeaderHistory(liderado, liderId);
    // Sem seedGoal, sem seedPerformanceData.

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(1);
  });

  it('lider com liderado sem performanceData do mes → NAO preenchido = 0', async () => {
    const liderId = await seedEmployee({ cpf: '20870000020', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000021' });
    await seedLeaderHistory(liderado, liderId);
    await seedGoal(liderado, 1);
    // Sem seedPerformanceData → LEFT JOIN retorna null → liderado
    // incompleto → lider nao preenchido.

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('lider com liderado sem executado (demanda ok, executado NULL) → NAO preenchido', async () => {
    const liderId = await seedEmployee({ cpf: '20870000030', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000031' });
    await seedLeaderHistory(liderado, liderId);
    await seedGoal(liderado, 1);
    const perfId = await seedPerformanceData(liderado, MES_ATUAL);
    await seedVariableData(perfId, 1, '100.00', null);

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('lider com 2 liderados: 1 completo + 1 incompleto → lider NAO preenchido', async () => {
    const liderId = await seedEmployee({ cpf: '20870000040', isLider: true });
    const liderA = await seedEmployee({ cpf: '20870000041' });
    const liderB = await seedEmployee({ cpf: '20870000042' });
    await seedLeaderHistory(liderA, liderId);
    await seedLeaderHistory(liderB, liderId);
    await seedGoal(liderA, 1);
    await seedGoal(liderB, 1);
    const perfA = await seedPerformanceData(liderA, MES_ATUAL);
    await seedVariableData(perfA, 1, '100.00', '95.00');
    // liderB sem performanceData → incompleto → lider nao preenchido.

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('lider ativo sem liderados NAO entra em lideresComLiderados', async () => {
    await seedEmployee({ cpf: '20870000050', isLider: true });

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(0);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('vinculo employeeLeaderHistory encerrado (dataFim NOT NULL) NAO conta', async () => {
    const liderId = await seedEmployee({ cpf: '20870000060', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000061' });
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: new Date('2025-12-31'),
      reason: 'seed teste encerramento',
      transferBatchId: '00000000-0000-4000-8000-000000000870',
    });

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Helpers de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: {
    cpf: string;
    isLider?: boolean;
    isRH?: boolean;
    status?: 'ativo' | 'inativo';
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: `Titular ${overrides.cpf}`,
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: overrides.isLider ?? false,
        isRH: overrides.isRH ?? false,
        isResponsavelFinanceiro: false,
        status: overrides.status ?? 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedLeaderHistory(employeeId: number, liderId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'seed teste ME-B9-fechamento',
      transferBatchId: '00000000-0000-4000-8000-000000000871',
    });
  }

  async function seedGoal(employeeId: number, variableIndex: number): Promise<void> {
    await client.db.insert(employeeGoals).values({
      employeeId,
      jobFamily: 'vendas_comercial',
      variableIndex,
      variableName: `Var ${variableIndex}`,
      unit: 'un',
      weight: '10.00',
      goal: '100.00',
      updatedBy: 'rh',
    });
  }

  async function seedPerformanceData(employeeId: number, mes: string): Promise<number> {
    const [row] = await client.db
      .insert(performanceData)
      .values({
        companyId,
        employeeId,
        mes,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedPerformanceData sem id');
    }
    return row.id;
  }

  async function seedVariableData(
    performanceDataId: number,
    variableIndex: number,
    demanda: string | null,
    executado: string | null,
  ): Promise<void> {
    await client.db.insert(performanceVariableData).values({
      performanceDataId,
      variableIndex,
      demanda,
      executado,
    });
  }
});
