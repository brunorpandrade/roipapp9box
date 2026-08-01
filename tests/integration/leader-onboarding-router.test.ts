// ROIP APP 9BOX — teste de integracao sub-router `leaderOnboarding` (ME-062a).
//
// Exercita as 4 procs canonicas do §21:
//   - `list` (§21.1): kanban de lideres ativos por empresa; §21.4 bloqueio
//     silencioso do proprio card.
//   - `getDetail` (§21.2): estagio + historico stageLog + notes; §21.4
//     403 canonico ao proprio titular; NOT_FOUND para inexistente;
//     CONFLICT para nao-lider e inativo.
//   - `updateStage` (§21.2): transacao atomica canonica — anotacao SEMPRE
//     + stageLog condicional + UPDATE employees.onboardingEstagio.
//   - `getSummaryCounts` (§21.3): SUM canonica por estagio.
//
// Faixa CNPJ ME-062a (S341): principal 10250000000010..019.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  individualProfilePlaceholders,
  leaderOnboardingNotes,
  leaderOnboardingStageLog,
  responsavelFinanceiroTransferLog,
  cLevelMembers,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  ANOTACAO_MAX_CHARS,
  ANOTACAO_MIN_CHARS,
  MSG_ANOTACAO_MIN_100,
  MSG_ANOTACAO_MAX_500,
  MSG_LEADER_ONB_ACESSO_PROPRIO,
  MSG_LEADER_ONB_COMPANY_MISMATCH,
  MSG_LEADER_ONB_EMPLOYEE_NAO_ENCONTRADO,
  MSG_LEADER_ONB_INATIVO,
  MSG_LEADER_ONB_NAO_E_LIDER,
  UPDATE_STAGE_INPUT_SCHEMA,
  assertCompanyScopeOnb,
  createLeaderOnboardingRouter,
  resolveAutorOnb,
} from '../../src/server/routers/leaderOnboarding';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me062-leader-onboarding';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me062-leader-onb';

// Faixa CNPJ ME-062a (S341): principal 10250000000010..019.
const CNPJ_LIST = '10250000000010';
const CNPJ_DETAIL = '10250000000011';
const CNPJ_UPDATE = '10250000000012';
const CNPJ_COUNTS = '10250000000013';
const CNPJ_GUARDS = '10250000000014';

let cpfCounter = 62200000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

const NOW_FIXED = new Date('2026-07-31T12:00:00Z');
const TEXTO_100 = 'A'.repeat(100);
const TEXTO_MAIS =
  'Anotacao canonica de treinamento com detalhes especificos que representam a evolucao do lider ' +
  '00000000000000000000000000000000000000';
const TEXTO_501 = 'B'.repeat(501);

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
    await client.db
      .delete(employeeLeaderHistory)
      .where(inArray(employeeLeaderHistory.employeeId, [] as number[]));
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
      razaoSocial: `ME062 LeaderOnb ${cnpj} LTDA`,
      nomeFantasia: `ME062 LeaderOnb ${cnpj}`,
      cnpj,
      telefone: '1633330062',
      endereco: `Rua ME-062, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-onb-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-onb-${cnpj}@example.com`,
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

interface CreateEmpOpts {
  status?: 'ativo' | 'inativo';
  isLider?: boolean;
  isRH?: boolean;
  onboardingEstagio?: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem' | null;
  name?: string;
  departamento?: 'Financeiro' | 'Operações' | 'Recursos Humanos' | 'Comercial';
}

async function createFixtureEmp(companyId: number, opts: CreateEmpOpts = {}): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Emp Onb',
      cpf: nextCpf(),
      email: `emp-onb-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: opts.departamento ?? 'Financeiro',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: opts.isRH ?? false,
      isResponsavelFinanceiro: false,
      onboardingEstagio:
        opts.onboardingEstagio === null
          ? null
          : (opts.onboardingEstagio ?? (opts.isLider ? 'treinar' : null)),
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function tokenPlatform(
  role: PlatformRole,
  userId: number,
  companyId: number,
): Promise<string> {
  return signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createLeaderOnboardingRouter({ now: () => NOW_FIXED });
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// ============================================================
// 0) Contratos exportados (RV-13)
// ============================================================

describe('leaderOnboarding — contratos publicos exportados', () => {
  it('mensagens literais canonicas', () => {
    expect(MSG_LEADER_ONB_ACESSO_PROPRIO).toBe(
      'Você não tem permissão para acessar esta informação.',
    );
    expect(MSG_LEADER_ONB_COMPANY_MISMATCH).toBe('Empresa não pertence ao seu escopo.');
    expect(MSG_LEADER_ONB_EMPLOYEE_NAO_ENCONTRADO).toBe('Colaborador não encontrado.');
    expect(MSG_LEADER_ONB_NAO_E_LIDER).toBe(
      'Este colaborador não é líder e não possui card no kanban de onboarding.',
    );
    expect(MSG_LEADER_ONB_INATIVO).toBe(
      'Este colaborador está inativo e não possui card no kanban de onboarding.',
    );
    expect(MSG_ANOTACAO_MIN_100).toBe('A anotação deve ter no mínimo 100 caracteres.');
    expect(MSG_ANOTACAO_MAX_500).toBe('A anotação deve ter no máximo 500 caracteres.');
  });

  it('constantes canonicas §2.3', () => {
    expect(ANOTACAO_MIN_CHARS).toBe(100);
    expect(ANOTACAO_MAX_CHARS).toBe(500);
  });

  it('UPDATE_STAGE_INPUT_SCHEMA aceita anotacao 100-500', () => {
    expect(
      UPDATE_STAGE_INPUT_SCHEMA.safeParse({
        employeeId: 1,
        novoEstagio: 'em_treinamento',
        texto: TEXTO_100,
      }).success,
    ).toBe(true);
    expect(
      UPDATE_STAGE_INPUT_SCHEMA.safeParse({
        employeeId: 1,
        novoEstagio: 'em_treinamento',
        texto: 'A'.repeat(99),
      }).success,
    ).toBe(false);
    expect(
      UPDATE_STAGE_INPUT_SCHEMA.safeParse({
        employeeId: 1,
        novoEstagio: 'em_treinamento',
        texto: TEXTO_501,
      }).success,
    ).toBe(false);
    expect(
      UPDATE_STAGE_INPUT_SCHEMA.safeParse({
        employeeId: 1,
        novoEstagio: 'estagio_invalido',
        texto: TEXTO_100,
      }).success,
    ).toBe(false);
  });

  it('resolveAutorOnb canonico: super_admin → super_admin; rh/rh_lider → rh', () => {
    expect(resolveAutorOnb({ role: 'super_admin', superAdminId: 42 })).toEqual({
      autorTipo: 'super_admin',
      autorId: 42,
    });
    expect(resolveAutorOnb({ role: 'rh', userId: 7, companyId: 1 })).toEqual({
      autorTipo: 'rh',
      autorId: 7,
    });
    expect(resolveAutorOnb({ role: 'rh_lider', userId: 9, companyId: 1 })).toEqual({
      autorTipo: 'rh',
      autorId: 9,
    });
  });

  it('assertCompanyScopeOnb: super_admin atravessa; role platform bloqueia mismatch', () => {
    expect(() =>
      assertCompanyScopeOnb({ role: 'super_admin', superAdminId: 1 }, 999),
    ).not.toThrow();
    expect(() => assertCompanyScopeOnb({ role: 'rh', userId: 1, companyId: 5 }, 5)).not.toThrow();
    let thrown: unknown = null;
    try {
      assertCompanyScopeOnb({ role: 'rh', userId: 1, companyId: 5 }, 6);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe('FORBIDDEN');
    expect((thrown as TRPCError).message).toBe(MSG_LEADER_ONB_COMPANY_MISMATCH);
  });
});

// ============================================================
// 1) list — kanban canonico §21.1
// ============================================================

describe('leaderOnboarding.list — kanban canonico', () => {
  let companyId: number;
  let liderAId: number;
  let liderBId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_LIST);
    liderAId = await createFixtureEmp(companyId, {
      isLider: true,
      onboardingEstagio: 'treinar',
      name: 'Lider A',
    });
    liderBId = await createFixtureEmp(companyId, {
      isLider: true,
      onboardingEstagio: 'em_treinamento',
      name: 'Lider B',
    });
    // Nao-lider — nao deve aparecer.
    await createFixtureEmp(companyId, { isLider: false, name: 'Colaborador comum' });
    // Lider inativo — nao deve aparecer.
    await createFixtureEmp(companyId, {
      isLider: true,
      status: 'inativo',
      onboardingEstagio: 'treinado',
      name: 'Lider inativo',
    });
  });

  it('super_admin lista kanban da empresa (2 lideres ativos)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.list({ companyId });
    expect(result.length).toBe(2);
    const nomes = result.map((r) => r.nome).sort();
    expect(nomes).toEqual(['Lider A', 'Lider B']);
    expect(result.find((r) => r.nome === 'Lider A')?.onboardingEstagio).toBe('treinar');
    expect(result.find((r) => r.nome === 'Lider B')?.onboardingEstagio).toBe('em_treinamento');
  });

  it('rh_lider caller nao ve o proprio card (§21.4 bloqueio silencioso)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh_lider', liderAId, companyId)));
    const result = await caller.list({ companyId });
    expect(result.length).toBe(1);
    expect(result[0]!.nome).toBe('Lider B');
    expect(result.some((r) => r.employeeId === liderAId)).toBe(false);
    // Uso do liderBId para eliminar warning de nao-uso.
    expect(result[0]!.employeeId).toBe(liderBId);
  });
});

// ============================================================
// 2) getDetail — §21.2 + bloqueio absoluto §21.4
// ============================================================

describe('leaderOnboarding.getDetail — canonico', () => {
  let companyId: number;
  let liderId: number;
  let liderInativoId: number;
  let colaboradorComumId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DETAIL);
    liderId = await createFixtureEmp(companyId, {
      isLider: true,
      onboardingEstagio: 'treinar',
      name: 'Detail Lider',
    });
    liderInativoId = await createFixtureEmp(companyId, {
      isLider: true,
      status: 'inativo',
      name: 'Detail Inativo',
    });
    colaboradorComumId = await createFixtureEmp(companyId, {
      isLider: false,
      name: 'Detail Comum',
    });
    // Semear historico canonico via inserts diretos (§21.2 detalhe).
    await client.db.insert(leaderOnboardingStageLog).values({
      companyId,
      employeeId: liderId,
      estagioAnterior: null,
      estagioNovo: 'treinar',
      autorTipo: 'super_admin',
      autorId: FIXTURE_SUPER_ADMIN_ID,
      createdAt: new Date('2026-06-01T10:00:00Z'),
    });
    await client.db.insert(leaderOnboardingNotes).values({
      companyId,
      employeeId: liderId,
      autorTipo: 'super_admin',
      autorId: FIXTURE_SUPER_ADMIN_ID,
      texto: 'Anotacao inicial de recepcao no kanban ' + 'X'.repeat(65),
      createdAt: new Date('2026-06-01T10:00:00Z'),
    });
  });

  it('super_admin obtem detalhe com estagio + historico + notes', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.getDetail({ employeeId: liderId });
    expect(result.employeeId).toBe(liderId);
    expect(result.nome).toBe('Detail Lider');
    expect(result.onboardingEstagio).toBe('treinar');
    expect(result.stageHistory.length).toBeGreaterThanOrEqual(1);
    expect(result.stageHistory[0]!.estagioNovo).toBe('treinar');
    expect(result.notes.length).toBeGreaterThanOrEqual(1);
  });

  it('§21.4 bloqueio absoluto: caller e o proprio titular → FORBIDDEN', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh_lider', liderId, companyId)));
    await expect(caller.getDetail({ employeeId: liderId })).rejects.toThrow(TRPCError);
    await expect(caller.getDetail({ employeeId: liderId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_LEADER_ONB_ACESSO_PROPRIO,
    });
  });

  it('NOT_FOUND para employeeId inexistente', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(caller.getDetail({ employeeId: 99999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_LEADER_ONB_EMPLOYEE_NAO_ENCONTRADO,
    });
  });

  it('CONFLICT para nao-lider', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(caller.getDetail({ employeeId: colaboradorComumId })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_LEADER_ONB_NAO_E_LIDER,
    });
  });

  it('CONFLICT para lider inativo', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    await expect(caller.getDetail({ employeeId: liderInativoId })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_LEADER_ONB_INATIVO,
    });
  });
});

// ============================================================
// 3) updateStage — transacao atomica §21.2
// ============================================================

describe('leaderOnboarding.updateStage — transacao atomica canonica', () => {
  let companyId: number;
  let liderId: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UPDATE);
    liderId = await createFixtureEmp(companyId, {
      isLider: true,
      onboardingEstagio: 'treinar',
      name: 'Update Lider',
    });
    rhId = await createFixtureEmp(companyId, {
      isLider: false,
      isRH: true,
      name: 'Update RH',
    });
  });

  it('anotacao SEMPRE mesmo sem mudanca de estagio (§21.2 sub-passo 2)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhId, companyId)));
    const textoValido = TEXTO_MAIS.slice(0, 140);
    const result = await caller.updateStage({
      employeeId: liderId,
      novoEstagio: 'treinar', // mesmo estagio
      texto: textoValido,
    });
    expect(result.noteId).toBeGreaterThan(0);
    expect(result.stageLogId).toBeNull();
    expect(result.estagioAnterior).toBeNull();
    expect(result.estagioNovo).toBe('treinar');
    // Verifica linha canonica em leaderOnboardingNotes.
    const notes = await client.db
      .select()
      .from(leaderOnboardingNotes)
      .where(inArray(leaderOnboardingNotes.employeeId, [liderId]));
    expect(notes.some((n) => n.texto === textoValido)).toBe(true);
  });

  it('mudanca de estagio → nota + stageLog + UPDATE atomicos (§21.2 sub-passo 3)', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const textoValido =
      'Lider concluiu modulo canonico de treinamento e progride para em_treinamento com nota ' +
      'canonica de progresso 001';
    const result = await caller.updateStage({
      employeeId: liderId,
      novoEstagio: 'em_treinamento',
      texto: textoValido,
    });
    expect(result.noteId).toBeGreaterThan(0);
    expect(result.stageLogId).toBeGreaterThan(0);
    expect(result.estagioAnterior).toBe('treinar');
    expect(result.estagioNovo).toBe('em_treinamento');
    // Verifica UPDATE em employees.
    const [empRow] = await client.db
      .select({ estagio: employees.onboardingEstagio })
      .from(employees)
      .where(inArray(employees.id, [liderId]));
    expect(empRow!.estagio).toBe('em_treinamento');
    // Verifica linha canonica em stageLog com autor super_admin.
    const stageRows = await client.db
      .select()
      .from(leaderOnboardingStageLog)
      .where(inArray(leaderOnboardingStageLog.employeeId, [liderId]));
    const last = stageRows[stageRows.length - 1];
    expect(last!.estagioAnterior).toBe('treinar');
    expect(last!.estagioNovo).toBe('em_treinamento');
    expect(last!.autorTipo).toBe('super_admin');
    expect(last!.autorId).toBe(FIXTURE_SUPER_ADMIN_ID);
  });

  it('FORBIDDEN §21.4 quando caller e o proprio titular', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh_lider', liderId, companyId)));
    await expect(
      caller.updateStage({
        employeeId: liderId,
        novoEstagio: 'treinado',
        texto: TEXTO_MAIS.slice(0, 140),
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_LEADER_ONB_ACESSO_PROPRIO,
    });
  });
});

// ============================================================
// 4) getSummaryCounts — §21.3
// ============================================================

describe('leaderOnboarding.getSummaryCounts — SUM canonica', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_COUNTS);
    await createFixtureEmp(companyId, { isLider: true, onboardingEstagio: 'treinar' });
    await createFixtureEmp(companyId, { isLider: true, onboardingEstagio: 'treinar' });
    await createFixtureEmp(companyId, { isLider: true, onboardingEstagio: 'em_treinamento' });
    await createFixtureEmp(companyId, { isLider: true, onboardingEstagio: 'treinado' });
    // Lider inativo — NAO deve contar.
    await createFixtureEmp(companyId, {
      isLider: true,
      status: 'inativo',
      onboardingEstagio: 'reciclagem',
    });
    // Nao-lider — NAO deve contar.
    await createFixtureEmp(companyId, { isLider: false });
  });

  it('conta canonica: 2 treinar + 1 em_treinamento + 1 treinado + 0 reciclagem', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const result = await caller.getSummaryCounts({ companyId });
    expect(result).toEqual({
      treinar: 2,
      em_treinamento: 1,
      treinado: 1,
      reciclagem: 0,
    });
  });
});

// ============================================================
// 5) Guards — cross-company mismatch
// ============================================================

describe('leaderOnboarding — guards de scope', () => {
  let companyIdA: number;
  let companyIdB: number;
  let liderBId: number;
  let rhAId: number;

  beforeAll(async () => {
    companyIdA = await createCompany(CNPJ_GUARDS);
    companyIdB = await createCompany('10260000000010');
    rhAId = await createFixtureEmp(companyIdA, {
      isLider: false,
      isRH: true,
      name: 'RH da empresa A',
    });
    liderBId = await createFixtureEmp(companyIdB, {
      isLider: true,
      onboardingEstagio: 'treinar',
    });
  });

  it('rh da empresa A tentando list em empresa B → FORBIDDEN mismatch', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhAId, companyIdA)));
    await expect(caller.list({ companyId: companyIdB })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_LEADER_ONB_COMPANY_MISMATCH,
    });
  });

  it('rh da empresa A tentando getDetail de lider da empresa B → FORBIDDEN mismatch', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenPlatform('rh', rhAId, companyIdA)));
    await expect(caller.getDetail({ employeeId: liderBId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_LEADER_ONB_COMPANY_MISMATCH,
    });
  });
});
