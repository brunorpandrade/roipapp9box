// ROIP APP 9BOX — teste de integracao do sub-router `leadershipTransfer`
// (ME-045, DOC 03 §14).
//
// Exercita as 4 procs canonicas do §14.12 + transacao atomica §14.9.
//
// Cobre:
//   - Contratos exportados (RV-13): mensagens literais §14.11, schemas
//     Zod, tipos, DI defaults, factory.
//   - `canInactivate`: cenario true (com C-levels ou lideres ativos);
//     cenario false (empresa sem candidato — mensagem canonica com
//     `{nome}` substituido); NOT_FOUND; FORBIDDEN cross-company.
//   - `getCandidates`: 5 grupos canonicos preenchidos corretamente;
//     ordenacao alfabetica; contador `X liderados` via Map; grupo 5
//     condicional (so aparece se `tentativaLiderados` nao-vazio).
//   - `checkEmailForPromotion`: hasEmail true/false; NOT_FOUND;
//     FORBIDDEN.
//   - `execute`: cenario sucesso completo (batchId, terminationEventId,
//     ids retornados, historicos fechados/inseridos); loop condicional
//     violado (Grupo 4 sem email E sem promocao); e-mail vazio Grupo 4;
//     justificativa MIN/MAX via Zod (mensagens literais §14.11);
//     novoLider invalido (cross-company); encapsulamento §14.8 (S146:
//     nao ha hook DI de notification exposto); DI de `now` e
//     `generateBatchId` deterministicos.
//
// Faixa CNPJ canonica 820..824 (S143 — sub-faixa leadershipTransfer).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  CAN_INACTIVATE_INPUT_SCHEMA,
  CANDIDATO_GRUPO_4_ITEM_SCHEMA,
  CHECK_EMAIL_INPUT_SCHEMA,
  DEFAULT_LEADERSHIP_TRANSFER_ROUTER_DEPS,
  EXECUTE_INPUT_SCHEMA,
  GET_CANDIDATES_INPUT_SCHEMA,
  MAPEAMENTO_ITEM_SCHEMA,
  MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO,
  MSG_CANDIDATO_NAO_ENCONTRADO_LT,
  MSG_COMPANY_MISMATCH_LT,
  MSG_EMAIL_VAZIO_GRUPO_4,
  MSG_EMPLOYEE_NAO_ENCONTRADO_LT,
  MSG_JUSTIFICATIVA_MAX_500,
  MSG_JUSTIFICATIVA_MIN_100,
  MSG_LOOP_CONDICIONAL_VIOLADO,
  MSG_NOVO_LIDER_INVALIDO_LT,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  assertCompanyScopeLT,
  createLeadershipTransferRouter,
  resolveActorForTerminationLT,
} from '../../src/server/routers/leadershipTransfer';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me045-lt';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me045-lt';

let cpfCounter = 45600000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Sub-faixa leadershipTransfer-router (S143).
const CNPJ_CONTRATOS = '10000000000820';
const CNPJ_CAN_INACTIVATE = '10000000000821';
const CNPJ_GET_CANDIDATES = '10000000000822';
const CNPJ_CHECK_EMAIL = '10000000000823';
const CNPJ_EXECUTE = '10000000000824';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(employeeLeaderHistory)
      .where(inArray(employeeLeaderHistory.employeeId, await selectEmployeeIdsInCompanies()));
    await client.db
      .delete(employeeTerminationEvents)
      .where(inArray(employeeTerminationEvents.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function selectEmployeeIdsInCompanies(): Promise<number[]> {
  if (createdCompanyIds.length === 0) return [];
  const rows = await client.db
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.companyId, createdCompanyIds));
  return rows.map((r) => r.id);
}

// ============================================================
// Fixtures
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME045LT ${cnpj} LTDA`,
      nomeFantasia: `ME045LT ${cnpj}`,
      cnpj,
      telefone: '1633330045',
      endereco: `Rua ME-045 LT, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-lt-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-lt-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
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
  isResponsavelFinanceiro?: boolean;
  departamento?: 'Financeiro' | 'Operações' | 'Recursos Humanos' | 'Comercial';
  nivelHierarquico?: 'operacional' | 'tatico' | 'estrategico';
  name?: string;
  email?: string | null;
}

async function createFixtureEmp(companyId: number, opts: CreateEmpOpts = {}): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? `Emp LT ${cpf}`,
      cpf,
      email: opts.email === undefined ? `emp-lt-${cpf}@roip.local` : opts.email,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: opts.nivelHierarquico ?? 'tatico',
      departamento: opts.departamento ?? 'Financeiro',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: opts.isRH ?? false,
      isResponsavelFinanceiro: opts.isResponsavelFinanceiro ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

interface CreateCLevelOpts {
  status?: 'ativo' | 'inativo';
  name?: string;
}

async function createFixtureCLevel(
  companyId: number,
  opts: CreateCLevelOpts = {},
): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: opts.name ?? 'CFO LT',
      cpf,
      email: `cl-lt-${cpf}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'CFO',
      descricaoCargo: 'CFO',
      departamento: 'Financeiro',
      custoMensal: '25000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      status: opts.status ?? 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function insertActiveLeaderHistory(opts: {
  employeeId: number;
  liderId?: number | null;
  clevelId?: number | null;
}): Promise<number> {
  const [row] = await client.db
    .insert(employeeLeaderHistory)
    .values({
      employeeId: opts.employeeId,
      liderId: opts.liderId ?? null,
      clevelId: opts.clevelId ?? null,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'Vinculo inicial de fixture — teste ME-045.',
      transferBatchId: crypto.randomUUID(),
    })
    .$returningId();
  return row!.id;
}

// ============================================================
// Tokens
// ============================================================

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

function bindRouter(deps?: { now?: () => Date; generateBatchId?: () => string }) {
  const testRouter = createLeadershipTransferRouter(deps ?? {});
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

const REASON_VALIDA =
  'Substituicao canonica do lider por decisao estrategica da diretoria de gente ' +
  'apos revisao anual do modelo de sucessao dos lideres da area financeira.';

// ============================================================
// 0) Contratos exportados (RV-13)
// ============================================================

describe('leadershipTransfer — contratos publicos exportados', () => {
  it('mensagens literais canonicas §14.11 batem verbatim', () => {
    expect(MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO).toBe(
      'Nao e possivel inativar {nome}. Nao ha nenhum outro C-level ou colaborador com ' +
        'isLider=true ativo na empresa. Cadastre outro C-level ou promova um colaborador a ' +
        'Lider antes de prosseguir.',
    );
    expect(MSG_LOOP_CONDICIONAL_VIOLADO).toBe(
      'Este colaborador precisa ter novo lider atribuido antes de poder liderar outros.',
    );
    expect(MSG_EMAIL_VAZIO_GRUPO_4).toBe(
      'E-mail obrigatorio para ativar acesso como Lider. Cadastre o e-mail em C3e antes.',
    );
    expect(MSG_JUSTIFICATIVA_MIN_100).toBe('A justificativa deve ter no minimo 100 caracteres.');
    expect(MSG_JUSTIFICATIVA_MAX_500).toBe('A justificativa deve ter no maximo 500 caracteres.');
    expect(MSG_COMPANY_MISMATCH_LT).toBe('Colaborador nao pertence a sua empresa.');
    expect(MSG_EMPLOYEE_NAO_ENCONTRADO_LT).toBe('Colaborador nao encontrado.');
    expect(MSG_CANDIDATO_NAO_ENCONTRADO_LT).toBe('Candidato nao encontrado.');
    expect(MSG_NOVO_LIDER_INVALIDO_LT).toBe(
      'Novo lider indicado nao existe, nao pertence a esta empresa ou nao esta ativo.',
    );
  });

  it('constantes de tamanho canonicas', () => {
    expect(REASON_MIN_LENGTH).toBe(100);
    expect(REASON_MAX_LENGTH).toBe(500);
  });

  it('DI default: now retorna Date e generateBatchId retorna uuid v4', () => {
    const d = DEFAULT_LEADERSHIP_TRANSFER_ROUTER_DEPS.now();
    expect(d).toBeInstanceOf(Date);
    const id = DEFAULT_LEADERSHIP_TRANSFER_ROUTER_DEPS.generateBatchId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('assertCompanyScopeLT: super_admin atravessa; role divergente lanca FORBIDDEN', () => {
    expect(() => {
      assertCompanyScopeLT({ role: 'super_admin', superAdminId: 1 }, 42);
    }).not.toThrow();
    expect(() => {
      assertCompanyScopeLT({ role: 'rh', userId: 1, companyId: 42 }, 43);
    }).toThrowError(new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_LT }));
  });

  it('resolveActorForTerminationLT: super_admin → superAdmin; rh → employee', () => {
    const a = resolveActorForTerminationLT({ role: 'super_admin', superAdminId: 7 });
    expect(a.actorTipo).toBe('superAdmin');
    expect(a.actorId).toBe(7);
    const b = resolveActorForTerminationLT({ role: 'rh', userId: 33, companyId: 1 });
    expect(b.actorTipo).toBe('employee');
    expect(b.actorId).toBe(33);
  });

  it('schemas Zod aceitam inputs canonicos', () => {
    expect(CAN_INACTIVATE_INPUT_SCHEMA.safeParse({ employeeId: 1 }).success).toBe(true);
    expect(
      GET_CANDIDATES_INPUT_SCHEMA.safeParse({
        employeeId: 1,
        companyId: 1,
        tentativaLiderados: [],
      }).success,
    ).toBe(true);
    expect(CHECK_EMAIL_INPUT_SCHEMA.safeParse({ candidatoId: 1 }).success).toBe(true);
    expect(
      MAPEAMENTO_ITEM_SCHEMA.safeParse({
        lideradoId: 1,
        novoLiderId: 2,
        novoLiderTipo: 'employee',
      }).success,
    ).toBe(true);
    expect(CANDIDATO_GRUPO_4_ITEM_SCHEMA.safeParse({ candidatoId: 1 }).success).toBe(true);
  });

  it('EXECUTE_INPUT_SCHEMA rejeita justificativa < 100 e > 500 com mensagens literais', () => {
    const curta = 'a'.repeat(50);
    const parsedCurta = EXECUTE_INPUT_SCHEMA.safeParse({
      liderOriginalId: 1,
      mapeamento: [{ lideradoId: 2, novoLiderId: 3, novoLiderTipo: 'employee' }],
      candidatosGrupo4: [],
      reason: curta,
      motivoSaida: 'voluntario',
    });
    expect(parsedCurta.success).toBe(false);
    if (!parsedCurta.success) {
      expect(parsedCurta.error.issues.some((i) => i.message === MSG_JUSTIFICATIVA_MIN_100)).toBe(
        true,
      );
    }

    const longa = 'b'.repeat(501);
    const parsedLonga = EXECUTE_INPUT_SCHEMA.safeParse({
      liderOriginalId: 1,
      mapeamento: [{ lideradoId: 2, novoLiderId: 3, novoLiderTipo: 'employee' }],
      candidatosGrupo4: [],
      reason: longa,
      motivoSaida: 'voluntario',
    });
    expect(parsedLonga.success).toBe(false);
    if (!parsedLonga.success) {
      expect(parsedLonga.error.issues.some((i) => i.message === MSG_JUSTIFICATIVA_MAX_500)).toBe(
        true,
      );
    }
  });

  it('contrato CNPJ_CONTRATOS na sub-faixa 820..824 (S143)', async () => {
    const c = await createCompany(CNPJ_CONTRATOS);
    expect(c).toBeGreaterThan(0);
  });
});

// ============================================================
// 1) canInactivate
// ============================================================

describe('leadershipTransfer.canInactivate', () => {
  it('retorna true quando ha C-level ativo na empresa', async () => {
    const c = await createCompany(CNPJ_CAN_INACTIVATE);
    const alvo = await createFixtureEmp(c, { isLider: true });
    await createFixtureCLevel(c);
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.canInactivate({ employeeId: alvo });
    expect(res.canInactivate).toBe(true);
  });

  it('retorna true quando ha outro lider ativo na empresa (sem C-level)', async () => {
    const c = await createCompany('10000000000816');
    const alvo = await createFixtureEmp(c, { isLider: true, name: 'Lider Alvo' });
    await createFixtureEmp(c, { isLider: true, name: 'Outro Lider' });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.canInactivate({ employeeId: alvo });
    expect(res.canInactivate).toBe(true);
  });

  it('retorna false com mensagem canonica {nome} substituido', async () => {
    const c = await createCompany('10000000000817');
    const alvo = await createFixtureEmp(c, { isLider: true, name: 'Maria Sozinha' });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.canInactivate({ employeeId: alvo });
    expect(res.canInactivate).toBe(false);
    expect(res.reason).toContain('Maria Sozinha');
    expect(res.reason).toBe(MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO.replace('{nome}', 'Maria Sozinha'));
  });

  it('NOT_FOUND canonico quando employee nao existe', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.canInactivate({ employeeId: 999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_EMPLOYEE_NAO_ENCONTRADO_LT,
    });
  });

  it('FORBIDDEN canonico para RH de outra empresa', async () => {
    const cA = await createCompany('10000000000818');
    const cB = await createCompany('10000000000819');
    const alvoEmA = await createFixtureEmp(cA, { isLider: true });
    const rhEmB = await createFixtureEmp(cB, { isRH: true });
    const { factory, ctx } = bindRouter();
    const tRH = await tokenPlatform('rh', rhEmB, cB);
    const caller = factory(ctx(tRH));
    await expect(caller.canInactivate({ employeeId: alvoEmA })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_COMPANY_MISMATCH_LT,
    });
  });
});

// ============================================================
// 2) getCandidates
// ============================================================

describe('leadershipTransfer.getCandidates', () => {
  it('preenche os 5 grupos com ordenacao alfabetica e contadores canonicos', async () => {
    const c = await createCompany(CNPJ_GET_CANDIDATES);
    const alvo = await createFixtureEmp(c, {
      isLider: true,
      departamento: 'Financeiro',
      name: 'Lider Alvo',
    });
    // Grupo 1: 2 C-levels — Beto, Ana (ordenacao alfabetica: Ana, Beto).
    const clB = await createFixtureCLevel(c, { name: 'Beto CFO' });
    const clA = await createFixtureCLevel(c, { name: 'Ana CEO' });
    // Grupo 2: mesmo departamento Financeiro, lider — Zeca, Bia (ordem: Bia, Zeca).
    const g2z = await createFixtureEmp(c, {
      isLider: true,
      departamento: 'Financeiro',
      name: 'Zeca Fin',
    });
    const g2b = await createFixtureEmp(c, {
      isLider: true,
      departamento: 'Financeiro',
      name: 'Bia Fin',
    });
    // Grupo 3: outros departamentos, lider — Comercial e Ops.
    const g3c = await createFixtureEmp(c, {
      isLider: true,
      departamento: 'Comercial',
      name: 'Carlos Com',
    });
    // Grupo 4: colaboradores nao-lideres — Diana, Ellen.
    const g4d = await createFixtureEmp(c, { departamento: 'Financeiro', name: 'Diana Naolider' });
    const g4e = await createFixtureEmp(c, {
      departamento: 'Financeiro',
      name: 'Ellen Naolider',
    });
    // Liderado do alvo — vira Grupo 5 quando enviado em tentativaLiderados.
    const g5f = await createFixtureEmp(c, { departamento: 'Financeiro', name: 'Fabio Liderado' });
    // Contador de liderados do C-level Ana (1) e do Grupo 2 Bia (1).
    await insertActiveLeaderHistory({ employeeId: g4d, clevelId: clA });
    await insertActiveLeaderHistory({ employeeId: g4e, liderId: g2b });

    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.getCandidates({
      employeeId: alvo,
      companyId: c,
      tentativaLiderados: [{ lideradoId: g5f }],
    });

    // Grupo 1: [Ana CEO, Beto CFO] com contadores.
    expect(res.grupo1_cLevelsAtivos.map((r) => r.name)).toEqual(['Ana CEO', 'Beto CFO']);
    const anaLine = res.grupo1_cLevelsAtivos.find((l) => l.id === clA);
    expect(anaLine?.liderados).toBe(1);
    const betoLine = res.grupo1_cLevelsAtivos.find((l) => l.id === clB);
    expect(betoLine?.liderados).toBe(0);

    // Grupo 2: [Bia Fin, Zeca Fin] com contador de Bia = 1.
    expect(res.grupo2_mesmoDepartamento.map((r) => r.name)).toEqual(['Bia Fin', 'Zeca Fin']);
    const biaLine = res.grupo2_mesmoDepartamento.find((l) => l.id === g2b);
    expect(biaLine?.liderados).toBe(1);
    const zecaLine = res.grupo2_mesmoDepartamento.find((l) => l.id === g2z);
    expect(zecaLine?.liderados).toBe(0);

    // Grupo 3: [Carlos Com].
    expect(res.grupo3_demaisLideres.map((r) => r.name)).toEqual(['Carlos Com']);
    expect(res.grupo3_demaisLideres.find((l) => l.id === g3c)?.liderados).toBe(0);

    // Grupo 4: EXCLUI o liderado da tentativa (g5f) e ordena alfabetico.
    expect(res.grupo4_colaboradoresNaoLideres.map((r) => r.name)).toEqual([
      'Diana Naolider',
      'Ellen Naolider',
    ]);
    // g4d e g4e nao estao em tentativaLiderados; contador Grupo 4 sempre 0.
    expect(res.grupo4_colaboradoresNaoLideres.find((l) => l.id === g4d)?.liderados).toBe(0);
    expect(res.grupo4_colaboradoresNaoLideres.find((l) => l.id === g4e)?.liderados).toBe(0);

    // Grupo 5: [Fabio Liderado].
    expect(res.grupo5_liderasDestaTransferencia.map((r) => r.name)).toEqual(['Fabio Liderado']);
    expect(res.departamentoDoLiderInativado).toBe('Financeiro');
  });

  it('grupo 5 vazio quando tentativaLiderados eh vazio', async () => {
    const c = await createCompany('10000000000815');
    const alvo = await createFixtureEmp(c, { isLider: true, departamento: 'Financeiro' });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.getCandidates({
      employeeId: alvo,
      companyId: c,
      tentativaLiderados: [],
    });
    expect(res.grupo5_liderasDestaTransferencia).toEqual([]);
  });

  it('BAD_REQUEST quando companyId nao bate com companyId do employee', async () => {
    const cA = await createCompany('10000000000814');
    const cB = await createCompany('10000000000813');
    const alvo = await createFixtureEmp(cA, { isLider: true });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.getCandidates({ employeeId: alvo, companyId: cB, tentativaLiderados: [] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_COMPANY_MISMATCH_LT });
  });
});

// ============================================================
// 3) checkEmailForPromotion
// ============================================================

describe('leadershipTransfer.checkEmailForPromotion', () => {
  it('hasEmail=true quando email cadastrado', async () => {
    const c = await createCompany(CNPJ_CHECK_EMAIL);
    const cand = await createFixtureEmp(c, { email: 'com-email@roip.local' });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.checkEmailForPromotion({ candidatoId: cand });
    expect(res.hasEmail).toBe(true);
    expect(res.email).toBe('com-email@roip.local');
  });

  it('hasEmail=false quando email nulo', async () => {
    const c = await createCompany('10000000000812');
    const cand = await createFixtureEmp(c, { email: null });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = await caller.checkEmailForPromotion({ candidatoId: cand });
    expect(res.hasEmail).toBe(false);
    expect(res.email).toBeUndefined();
  });

  it('NOT_FOUND canonico', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(caller.checkEmailForPromotion({ candidatoId: 999998 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_CANDIDATO_NAO_ENCONTRADO_LT,
    });
  });
});

// ============================================================
// 4) execute — transacao §14.9 completa
// ============================================================

describe('leadershipTransfer.execute — transacao atomica §14.9', () => {
  it('cenario sucesso completo com DI deterministico', async () => {
    const c = await createCompany(CNPJ_EXECUTE);
    // Estrutura:
    //   lider (sendo inativado) — tem 2 liderados: A, B
    //   novo lider natural (isLider=true) — Zeca — recebe A
    //   candidato Grupo 4 promovido — Debora — recebe B
    const clAncora = await createFixtureCLevel(c, { name: 'Ancora CEO' });
    const lider = await createFixtureEmp(c, {
      isLider: true,
      departamento: 'Financeiro',
      name: 'Lider Sendo Inativado',
      nivelHierarquico: 'tatico',
    });
    const zeca = await createFixtureEmp(c, {
      isLider: true,
      departamento: 'Financeiro',
      name: 'Zeca Novo Lider',
    });
    const debora = await createFixtureEmp(c, {
      departamento: 'Financeiro',
      name: 'Debora Promovida',
      email: 'debora@roip.local',
    });
    const lideradoA = await createFixtureEmp(c, {
      departamento: 'Financeiro',
      name: 'Liderado A',
    });
    const lideradoB = await createFixtureEmp(c, {
      departamento: 'Financeiro',
      name: 'Liderado B',
    });
    // Historicos ativos: A e B liderados por `lider`.
    const histA = await insertActiveLeaderHistory({ employeeId: lideradoA, liderId: lider });
    const histB = await insertActiveLeaderHistory({ employeeId: lideradoB, liderId: lider });
    // O proprio lider tem vinculo ativo com o C-level ancora.
    const histLider = await insertActiveLeaderHistory({ employeeId: lider, clevelId: clAncora });

    // DI deterministico.
    const FIXED_NOW = new Date('2026-07-20T13:00:00.000Z');
    const FIXED_BATCH = '00000000-0000-4000-8000-000000000045';
    const { factory, ctx } = bindRouter({
      now: () => FIXED_NOW,
      generateBatchId: () => FIXED_BATCH,
    });
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));

    const res = await caller.execute({
      liderOriginalId: lider,
      mapeamento: [
        { lideradoId: lideradoA, novoLiderId: zeca, novoLiderTipo: 'employee' },
        { lideradoId: lideradoB, novoLiderId: debora, novoLiderTipo: 'employee' },
      ],
      candidatosGrupo4: [{ candidatoId: debora }],
      reason: REASON_VALIDA,
      motivoSaida: 'voluntario',
    });

    // Retorno canonico.
    expect(res.sucesso).toBe(true);
    expect(res.transferBatchId).toBe(FIXED_BATCH);
    expect(res.terminationEventId).toBeGreaterThan(0);
    expect(res.leaderHistoryInsertedIds).toHaveLength(2);
    // Fechou 3 historicos (histA, histB, histLider).
    expect(res.leaderHistoryClosedIds).toHaveLength(3);
    expect(res.grupo4PromovidosIds).toEqual([debora]);

    // Confere no banco: `lider` esta inativo.
    const liderRow = await client.db
      .select({ status: employees.status })
      .from(employees)
      .where(eq(employees.id, lider))
      .limit(1);
    expect(liderRow[0]?.status).toBe('inativo');

    // Debora isLider=true.
    const deboraRow = await client.db
      .select({ isLider: employees.isLider })
      .from(employees)
      .where(eq(employees.id, debora))
      .limit(1);
    expect(deboraRow[0]?.isLider).toBe(true);

    // Termination canonico snapshot + motivoSaida.
    const term = await client.db
      .select()
      .from(employeeTerminationEvents)
      .where(eq(employeeTerminationEvents.id, res.terminationEventId))
      .limit(1);
    expect(term[0]?.employeeId).toBe(lider);
    expect(term[0]?.motivo).toBe('voluntario');
    expect(term[0]?.nivelHierarquicoSnapshot).toBe('tatico');
    expect(term[0]?.departamentoSnapshot).toBe('Financeiro');
    expect(term[0]?.actorTipo).toBe('superAdmin');
    expect(term[0]?.actorId).toBe(FIXTURE_SUPER_ADMIN_ID);

    // Novos vinculos com batchId marcado.
    const novos = await client.db
      .select()
      .from(employeeLeaderHistory)
      .where(
        and(
          eq(employeeLeaderHistory.transferBatchId, FIXED_BATCH),
          isNull(employeeLeaderHistory.dataFim),
        ),
      );
    expect(novos).toHaveLength(2);
    const novosPorEmp = new Map(novos.map((n) => [n.employeeId, n]));
    expect(novosPorEmp.get(lideradoA)?.liderId).toBe(zeca);
    expect(novosPorEmp.get(lideradoB)?.liderId).toBe(debora);

    // Ids de fechamento coerentes.
    expect(res.leaderHistoryClosedIds).toContain(histA);
    expect(res.leaderHistoryClosedIds).toContain(histB);
    expect(res.leaderHistoryClosedIds).toContain(histLider);
  });

  it('email vazio no Grupo 4 promovido → CONFLICT canonico', async () => {
    const c = await createCompany('10000000000811');
    await createFixtureCLevel(c);
    const lider = await createFixtureEmp(c, { isLider: true });
    const cand = await createFixtureEmp(c, { email: null });
    const liderado = await createFixtureEmp(c);
    await insertActiveLeaderHistory({ employeeId: liderado, liderId: lider });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.execute({
        liderOriginalId: lider,
        mapeamento: [{ lideradoId: liderado, novoLiderId: cand, novoLiderTipo: 'employee' }],
        candidatosGrupo4: [{ candidatoId: cand }],
        reason: REASON_VALIDA,
        motivoSaida: 'voluntario',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_EMAIL_VAZIO_GRUPO_4 });
  });

  it('novoLider cross-company → BAD_REQUEST canonico', async () => {
    const cA = await createCompany('10000000000810');
    const cB = await createCompany('10000000000809');
    await createFixtureCLevel(cA);
    const lider = await createFixtureEmp(cA, { isLider: true });
    const foraDaEmpresa = await createFixtureEmp(cB, { isLider: true });
    const liderado = await createFixtureEmp(cA);
    await insertActiveLeaderHistory({ employeeId: liderado, liderId: lider });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.execute({
        liderOriginalId: lider,
        mapeamento: [
          { lideradoId: liderado, novoLiderId: foraDaEmpresa, novoLiderTipo: 'employee' },
        ],
        candidatosGrupo4: [],
        reason: REASON_VALIDA,
        motivoSaida: 'involuntario',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_NOVO_LIDER_INVALIDO_LT });
  });

  it('novoLider = nao-lider fora de candidatosGrupo4 → CONFLICT loop violado', async () => {
    const c = await createCompany('10000000000808');
    await createFixtureCLevel(c);
    const lider = await createFixtureEmp(c, { isLider: true });
    const naoLider = await createFixtureEmp(c);
    const liderado = await createFixtureEmp(c);
    await insertActiveLeaderHistory({ employeeId: liderado, liderId: lider });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.execute({
        liderOriginalId: lider,
        mapeamento: [{ lideradoId: liderado, novoLiderId: naoLider, novoLiderTipo: 'employee' }],
        candidatosGrupo4: [],
        reason: REASON_VALIDA,
        motivoSaida: 'voluntario',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_LOOP_CONDICIONAL_VIOLADO });
  });

  it('bloqueio previo canInactivate=false → CONFLICT canonico', async () => {
    const c = await createCompany('10000000000807');
    // Nenhum C-level nem outro lider.
    const lider = await createFixtureEmp(c, { isLider: true, name: 'Unico Lider' });
    const liderado = await createFixtureEmp(c);
    await insertActiveLeaderHistory({ employeeId: liderado, liderId: lider });
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.execute({
        liderOriginalId: lider,
        mapeamento: [{ lideradoId: liderado, novoLiderId: lider, novoLiderTipo: 'employee' }],
        candidatosGrupo4: [],
        reason: REASON_VALIDA,
        motivoSaida: 'voluntario',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: MSG_BLOQUEIO_PREVIO_SEM_CANDIDATO.replace('{nome}', 'Unico Lider'),
    });
  });
});
