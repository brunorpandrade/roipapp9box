// ROIP APP 9BOX — teste de integracao hooks canonicos onLeader* (ME-062a).
//
// Vertical canonica do §21.1 (ciclo de vida do card no kanban de
// onboarding) acoplada a `employees.create` e `employees.update`:
//   - onLeaderActivated (create com `isLider=true`): INSERT canonico em
//     `leaderOnboardingStageLog` (transicao NULL → 'treinar').
//   - onLeaderActivated (update `isLider=false → true` SEM historico):
//     UPDATE `employees.onboardingEstagio='treinar'` + INSERT stageLog.
//   - onLeaderReactivated (update `isLider=false → true` COM
//     `onboardingUltimoEstagio` preservado): UPDATE
//     `onboardingEstagio=<recuperado>` + limpa `onboardingUltimoEstagio` +
//     INSERT stageLog com `estagioNovo=<recuperado>`.
//   - onLeaderDeactivated (update `isLider=true → false`): UPDATE
//     `onboardingUltimoEstagio=<atual>` + `onboardingEstagio=NULL`. SEM
//     INSERT stageLog (§21.1 nota canonica).
//
// Faixa CNPJ ME-062a (S341): principal 10250000000020..029.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfilePlaceholders,
  leaderOnboardingNotes,
  leaderOnboardingStageLog,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createEmployeesRouter } from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me062-hooks-onleader';

const FIXTURE_SUPER_ADMIN_ID = 1;

// Faixa CNPJ ME-062a (S341): 10250000000020..029.
const CNPJ_CREATE = '10250000000020';
const CNPJ_ACTIVATE = '10250000000021';
const CNPJ_DEACTIVATE = '10250000000022';
const CNPJ_REACTIVATE = '10250000000023';

let cpfCounter = 62300000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

const NOW_FIXED = new Date('2026-07-31T12:00:00Z');

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(leaderOnboardingStageLog)
      .where(inArray(leaderOnboardingStageLog.companyId, createdCompanyIds));
    await client.db
      .delete(leaderOnboardingNotes)
      .where(inArray(leaderOnboardingNotes.companyId, createdCompanyIds));
    await client.db
      .delete(employeeTerminationEvents)
      .where(inArray(employeeTerminationEvents.companyId, createdCompanyIds));
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db
      .delete(responsavelFinanceiroTransferLog)
      .where(inArray(responsavelFinanceiroTransferLog.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME062 Hooks ${cnpj} LTDA`,
      nomeFantasia: `ME062 Hooks ${cnpj}`,
      cnpj,
      telefone: '1633330063',
      endereco: `Rua ME-062 hooks, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-hk-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-hk-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createEmployeesRouter({ now: () => NOW_FIXED });
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

async function seedNonLider(companyId: number, cpf: string): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Non Lider',
      cpf,
      email: `nonlider-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Financeiro',
      status: 'ativo',
      isLider: false,
      isRH: false,
      isResponsavelFinanceiro: false,
      onboardingEstagio: null,
      passwordHash: 'x',
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

// ============================================================
// 1) onLeaderActivated no create — INSERT canonico em stageLog
// ============================================================

describe('hook onLeaderActivated em employees.create — §21.1', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CREATE);
  });

  it('create com isLider=true → INSERT canonico em stageLog (NULL → treinar)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.create({
      companyId,
      name: 'Nova Lider Create',
      cpf: nextCpf(),
      email: 'nova-lider@example.com',
      dataNascimento: '1985-05-05',
      dataAdmissao: '2020-01-01',
      cbo: '142105',
      descricaoCBO: 'Gerente',
      jobFamily: 'administrativo_suporte',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Financeiro',
      isLider: true,
      isRH: false,
    });
    const employeeId = result.employeeId;
    const stageRows = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(eq(leaderOnboardingStageLog.employeeId, employeeId));
    expect(stageRows.length).toBe(1);
    expect(stageRows[0]!.estagioAnterior).toBeNull();
    expect(stageRows[0]!.estagioNovo).toBe('treinar');
    expect(stageRows[0]!.autorTipo).toBe('super_admin');
    expect(stageRows[0]!.autorId).toBe(FIXTURE_SUPER_ADMIN_ID);
  });

  it('create com isLider=false → SEM INSERT em stageLog', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.create({
      companyId,
      name: 'Colaborador Comum',
      cpf: nextCpf(),
      email: 'comum@example.com',
      dataNascimento: '1985-05-05',
      dataAdmissao: '2020-01-01',
      cbo: '142105',
      descricaoCBO: 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Financeiro',
      isLider: false,
      isRH: false,
    });
    const stageRows = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(eq(leaderOnboardingStageLog.employeeId, result.employeeId));
    expect(stageRows.length).toBe(0);
  });
});

// ============================================================
// 2) onLeaderActivated no update — false → true primeira ativacao
// ============================================================

describe('hook onLeaderActivated em employees.update (primeira ativacao) — §21.1', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_ACTIVATE);
  });

  it('update false → true primeira vez → estagio=treinar + INSERT stageLog', async () => {
    const empId = await seedNonLider(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await caller.update({ employeeId: empId, isLider: true });
    const [row] = await client.db
      .select({
        estagio: employees.onboardingEstagio,
        ultimo: employees.onboardingUltimoEstagio,
      })
      .from(employees)
      .where(eq(employees.id, empId));
    expect(row!.estagio).toBe('treinar');
    expect(row!.ultimo).toBeNull();
    const stageRows = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(eq(leaderOnboardingStageLog.employeeId, empId));
    expect(stageRows.length).toBe(1);
    expect(stageRows[0]!.estagioAnterior).toBeNull();
    expect(stageRows[0]!.estagioNovo).toBe('treinar');
  });
});

// ============================================================
// 3) onLeaderDeactivated — true → false preserva ultimoEstagio, SEM stageLog
// ============================================================

describe('hook onLeaderDeactivated em employees.update — §21.1', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DEACTIVATE);
  });

  it('true → false → ultimoEstagio guarda, estagio=NULL, sem stageLog', async () => {
    // Seed direto: lider ativo com estagio 'em_treinamento'.
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider a desativar',
        cpf: nextCpf(),
        email: `deac-${nextCpf()}@roip.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142105',
        descricaoCBO: 'Gerente',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Financeiro',
        status: 'ativo',
        isLider: true,
        isRH: false,
        isResponsavelFinanceiro: false,
        onboardingEstagio: 'em_treinamento',
        passwordHash: 'x',
        passwordSet: true,
      })
      .$returningId();
    const empId = row!.id;
    // Contagem baseline de stageLog para este empId.
    const stageBefore = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(eq(leaderOnboardingStageLog.employeeId, empId));
    expect(stageBefore.length).toBe(0);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await caller.update({ employeeId: empId, isLider: false });

    const [afterRow] = await client.db
      .select({
        estagio: employees.onboardingEstagio,
        ultimo: employees.onboardingUltimoEstagio,
        isLider: employees.isLider,
      })
      .from(employees)
      .where(eq(employees.id, empId));
    expect(afterRow!.isLider).toBe(false);
    expect(afterRow!.estagio).toBeNull();
    expect(afterRow!.ultimo).toBe('em_treinamento');
    // §21.1 nota canonica: SEM INSERT em stageLog para a desativacao.
    const stageAfter = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(eq(leaderOnboardingStageLog.employeeId, empId));
    expect(stageAfter.length).toBe(0);
  });
});

// ============================================================
// 4) onLeaderReactivated — false → true COM ultimoEstagio preservado
// ============================================================

describe('hook onLeaderReactivated em employees.update — §21.1', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_REACTIVATE);
  });

  it('false → true com ultimoEstagio=treinado → estagio=treinado + stageLog', async () => {
    // Seed direto: nao-lider com onboardingUltimoEstagio='treinado' (padrao
    // canonico pos-desativacao).
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider reativar',
        cpf: nextCpf(),
        email: `react-${nextCpf()}@roip.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142105',
        descricaoCBO: 'Gerente',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Financeiro',
        status: 'ativo',
        isLider: false,
        isRH: false,
        isResponsavelFinanceiro: false,
        onboardingEstagio: null,
        onboardingUltimoEstagio: 'treinado',
        passwordHash: 'x',
        passwordSet: true,
      })
      .$returningId();
    const empId = row!.id;

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await caller.update({ employeeId: empId, isLider: true });

    const [afterRow] = await client.db
      .select({
        estagio: employees.onboardingEstagio,
        ultimo: employees.onboardingUltimoEstagio,
      })
      .from(employees)
      .where(eq(employees.id, empId));
    expect(afterRow!.estagio).toBe('treinado');
    expect(afterRow!.ultimo).toBeNull();
    const stageRows = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(eq(leaderOnboardingStageLog.employeeId, empId));
    expect(stageRows.length).toBe(1);
    expect(stageRows[0]!.estagioAnterior).toBeNull();
    expect(stageRows[0]!.estagioNovo).toBe('treinado');
  });
});
