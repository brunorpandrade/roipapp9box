// ROIP APP 9BOX — teste de integracao do sub-router `company` (ME-044).
//
// Exercita a proc `setResponsavelFinanceiro` (DOC 03 §5.5) — Bruno
// EXCLUSIVO. Cobre:
//   - Contratos publicos exportados (RV-13): mensagens literais, schemas
//     Zod, tipos, constantes, factory, DI defaults.
//   - Cenario 'atribuido' (sem RF vigente): `reason` = literal canonico
//     `REASON_ATRIBUIDO_CANONICA`; `previousHolderType='none'`,
//     `previousHolderId=null`; UPDATE flag=true do novo; INSERT no log.
//     Justificativa do payload IGNORADA neste cenario (nao ha
//     transferencia a justificar).
//   - Cenario 'transferido' (com RF vigente): `reason` = justificativa
//     do payload (validada 100-500); `previousHolderType/Id` do vigente;
//     UPDATE flag=false do anterior + UPDATE flag=true do novo + INSERT
//     no log — tudo em transacao atomica. Justificativa ausente = BAD_REQUEST
//     literal; < 100 chars = BAD_REQUEST literal.
//   - Guards: RH FORBIDDEN (Bruno EXCLUSIVO); novo === vigente = CONFLICT;
//     novo inativo = CONFLICT; novo empresa divergente = FORBIDDEN; novo
//     nao encontrado = NOT_FOUND; empresa nao encontrada = NOT_FOUND.
//   - Hook D050: chamado apos COMMIT bem-sucedido (DI capturador).
//   - Enum `cLevel` (camelCase, nao `clevel`) do schema respeitado tanto
//     em `previousHolderType` quanto em `newHolderType`.
//   - Sentinela RV-13.
//
// Faixa CNPJ canonica 810..812 (sub-faixa `company-router`).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  individualProfilePlaceholders,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  DEFAULT_COMPANY_ROUTER_DEPS,
  DEFAULT_D050_HOOK,
  JUSTIFICATIVA_TRANSFER_MAX,
  JUSTIFICATIVA_TRANSFER_MIN,
  MSG_COMPANY_MISMATCH_RF,
  MSG_COMPANY_NAO_ENCONTRADA_RF,
  MSG_NEW_HOLDER_EMPRESA_DIVERGENTE_RF,
  MSG_NEW_HOLDER_INATIVO_RF,
  MSG_NEW_HOLDER_JA_E_RF,
  MSG_NEW_HOLDER_NAO_ENCONTRADO_RF,
  MSG_TRANSFER_JUSTIFICATIVA_MAX,
  MSG_TRANSFER_JUSTIFICATIVA_MIN,
  MSG_TRANSFER_JUSTIFICATIVA_OBRIGATORIA,
  REASON_ATRIBUIDO_CANONICA,
  SET_RF_INPUT_SCHEMA,
  createCompanyRouter,
  type EmitD050Facade,
  type SetResponsavelFinanceiroResult,
} from '../../src/server/routers/company';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me044-company';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me044-company';

let cpfCounter = 44100000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Sub-faixa company-router: 810, 811, 812, 819 (cross) dentro do bloco 810..819.
const CNPJ_CONTRATOS_ATRIBUIDO = '10000000000810';
const CNPJ_TRANSFERIDO = '10000000000811';
const CNPJ_GUARDS = '10000000000812';
const CNPJ_OUTRA_EMPRESA_CROSS = '10000000000819';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(responsavelFinanceiroTransferLog)
      .where(inArray(responsavelFinanceiroTransferLog.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Fixtures
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME044CO Test ${cnpj} LTDA`,
      nomeFantasia: `ME044CO ${cnpj}`,
      cnpj,
      telefone: '1633330044',
      endereco: `Rua ME-044, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
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

interface CreateFixtureEmpOpts {
  isResponsavelFinanceiro?: boolean;
  status?: 'ativo' | 'inativo';
  isRH?: boolean;
  isLider?: boolean;
  name?: string;
}

async function createFixtureEmp(
  companyId: number,
  opts: CreateFixtureEmpOpts = {},
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: opts.name ?? 'Colaborador ME044',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente administrativo',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Financeiro',
      status: opts.status ?? 'ativo',
      isRH: opts.isRH ?? false,
      isLider: opts.isLider ?? false,
      isResponsavelFinanceiro: opts.isResponsavelFinanceiro ?? false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

interface CreateFixtureClOpts {
  isResponsavelFinanceiro?: boolean;
  status?: 'ativo' | 'inativo';
  name?: string;
}

async function createFixtureCLevel(
  companyId: number,
  opts: CreateFixtureClOpts = {},
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: opts.name ?? 'CFO ME044',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'CFO',
      descricaoCargo: 'Chief Financial Officer',
      departamento: 'Financeiro',
      custoMensal: '25000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: opts.isResponsavelFinanceiro ?? false,
      status: opts.status ?? 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
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

function bindRouter(emitD050Capturado?: EmitD050Facade) {
  const testRouter = createCompanyRouter(
    emitD050Capturado === undefined ? {} : { emitD050: emitD050Capturado },
  );
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

const JUSTIFICATIVA_OK =
  'Substituicao do RF vigente por decisao estrategica do conselho apos revisao ' +
  'anual das responsabilidades financeiras da empresa.';

// ============================================================
// 0) Contratos exportados (RV-13)
// ============================================================

describe('company — contratos publicos exportados', () => {
  it('mensagens canonicas literais batem o texto exato', () => {
    expect(MSG_COMPANY_MISMATCH_RF).toBe('Empresa nao pertence ao seu escopo.');
    expect(MSG_COMPANY_NAO_ENCONTRADA_RF).toBe('Empresa nao encontrada.');
    expect(MSG_NEW_HOLDER_NAO_ENCONTRADO_RF).toBe('Novo titular nao encontrado.');
    expect(MSG_NEW_HOLDER_INATIVO_RF).toBe('Novo titular esta inativo e nao pode receber o papel.');
    expect(MSG_NEW_HOLDER_EMPRESA_DIVERGENTE_RF).toBe('Novo titular nao pertence a esta empresa.');
    expect(MSG_NEW_HOLDER_JA_E_RF).toBe(
      'O titular indicado ja e o Responsavel financeiro vigente.',
    );
    expect(MSG_TRANSFER_JUSTIFICATIVA_MIN).toBe(
      'A justificativa deve ter no minimo 100 caracteres.',
    );
    expect(MSG_TRANSFER_JUSTIFICATIVA_MAX).toBe(
      'A justificativa deve ter no maximo 500 caracteres.',
    );
    expect(MSG_TRANSFER_JUSTIFICATIVA_OBRIGATORIA).toBe(
      'Transferencia de Responsavel financeiro exige justificativa.',
    );
    expect(REASON_ATRIBUIDO_CANONICA).toBe('Primeira atribuicao de Responsavel financeiro');
  });

  it('constantes canonicas de tamanho batem o schema', () => {
    expect(JUSTIFICATIVA_TRANSFER_MIN).toBe(100);
    expect(JUSTIFICATIVA_TRANSFER_MAX).toBe(500);
  });

  it('SET_RF_INPUT_SCHEMA aceita apenas newHolderType em {employee, cLevel}', () => {
    expect(
      SET_RF_INPUT_SCHEMA.safeParse({
        companyId: 1,
        newHolderType: 'employee',
        newHolderId: 10,
      }).success,
    ).toBe(true);
    expect(
      SET_RF_INPUT_SCHEMA.safeParse({
        companyId: 1,
        newHolderType: 'cLevel',
        newHolderId: 10,
      }).success,
    ).toBe(true);
    // camelCase respeitado (schema canonico).
    expect(
      SET_RF_INPUT_SCHEMA.safeParse({
        companyId: 1,
        newHolderType: 'clevel' as unknown as 'cLevel',
        newHolderId: 10,
      }).success,
    ).toBe(false);
    // 'none' nao aceito em `newHolderType` (removido fora do escopo).
    expect(
      SET_RF_INPUT_SCHEMA.safeParse({
        companyId: 1,
        newHolderType: 'none' as unknown as 'employee',
        newHolderId: 10,
      }).success,
    ).toBe(false);
  });

  it('DEFAULT_D050_HOOK e no-op assincrono', async () => {
    await expect(DEFAULT_D050_HOOK(1, 'employee', 2)).resolves.toBeUndefined();
    expect(typeof DEFAULT_COMPANY_ROUTER_DEPS.now).toBe('function');
    expect(DEFAULT_COMPANY_ROUTER_DEPS.emitD050).toBe(DEFAULT_D050_HOOK);
  });
});

// ============================================================
// 1) Cenario 'atribuido' — sem RF vigente
// ============================================================

describe('company.setResponsavelFinanceiro — cenario atribuido (sem RF vigente)', () => {
  let companyId: number;
  let empAlvo: number;
  let clAlvo: number;
  let rhId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CONTRATOS_ATRIBUIDO);
    empAlvo = await createFixtureEmp(companyId, { isRH: true });
    clAlvo = await createFixtureCLevel(companyId);
    rhId = await createFixtureEmp(companyId, { isRH: true });
  });

  it('Bruno atribui RF a employee; log eventType=atribuido, previousHolderType=none', async () => {
    const captured: Array<{ companyId: number; type: string; id: number }> = [];
    const emit: EmitD050Facade = async (cId, t, iid) => {
      captured.push({ companyId: cId, type: t, id: iid });
    };
    const { factory, ctx } = bindRouter(emit);
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.setResponsavelFinanceiro({
      companyId,
      newHolderType: 'employee',
      newHolderId: empAlvo,
    })) as SetResponsavelFinanceiroResult;

    expect(res.eventType).toBe('atribuido');
    expect(res.previousHolder).toEqual({ type: 'none', id: null });
    expect(res.newHolder).toEqual({ type: 'employee', id: empAlvo });
    expect(res.transferLogId).toBeGreaterThan(0);

    const [log] = await client.db
      .select()
      .from(responsavelFinanceiroTransferLog)
      .where(eq(responsavelFinanceiroTransferLog.id, res.transferLogId));
    expect(log!.eventType).toBe('atribuido');
    expect(log!.previousHolderType).toBe('none');
    expect(log!.previousHolderId).toBeNull();
    expect(log!.newHolderType).toBe('employee');
    expect(log!.newHolderId).toBe(empAlvo);
    expect(log!.actorSuperAdminId).toBe(FIXTURE_SUPER_ADMIN_ID);
    expect(log!.reason).toBe(REASON_ATRIBUIDO_CANONICA);

    const [emp] = await client.db.select().from(employees).where(eq(employees.id, empAlvo));
    expect(emp!.isResponsavelFinanceiro).toBe(true);

    // D050 hook chamado apos COMMIT.
    await new Promise((r) => setTimeout(r, 20));
    expect(captured).toEqual([{ companyId, type: 'employee', id: empAlvo }]);
  });

  it('Bruno atribui RF a cLevel — enum camelCase respeitado', async () => {
    // Reusa a empresa principal — antes zera o RF anterior manualmente.
    await client.db
      .update(employees)
      .set({ isResponsavelFinanceiro: false })
      .where(eq(employees.id, empAlvo));

    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.setResponsavelFinanceiro({
      companyId,
      newHolderType: 'cLevel',
      newHolderId: clAlvo,
    })) as SetResponsavelFinanceiroResult;
    expect(res.eventType).toBe('atribuido');
    expect(res.newHolder).toEqual({ type: 'cLevel', id: clAlvo });

    const [log] = await client.db
      .select()
      .from(responsavelFinanceiroTransferLog)
      .where(eq(responsavelFinanceiroTransferLog.id, res.transferLogId));
    expect(log!.newHolderType).toBe('cLevel');
    expect(log!.reason).toBe(REASON_ATRIBUIDO_CANONICA);
  });

  it('RH FORBIDDEN — Bruno EXCLUSIVO', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenPlatform('rh', rhId, companyId);
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: empAlvo,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});

// ============================================================
// 2) Cenario 'transferido' — com RF vigente
// ============================================================

describe('company.setResponsavelFinanceiro — cenario transferido (com RF vigente)', () => {
  let companyId: number;
  let rfVigente: number;
  let rfNovo: number;
  let rfCl: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TRANSFERIDO);
    rfVigente = await createFixtureEmp(companyId, { isResponsavelFinanceiro: true });
    rfNovo = await createFixtureEmp(companyId);
    rfCl = await createFixtureCLevel(companyId);
  });

  it('Bruno transfere entre employees com justificativa 100-500', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.setResponsavelFinanceiro({
      companyId,
      newHolderType: 'employee',
      newHolderId: rfNovo,
      justificativa: JUSTIFICATIVA_OK,
    })) as SetResponsavelFinanceiroResult;

    expect(res.eventType).toBe('transferido');
    expect(res.previousHolder).toEqual({ type: 'employee', id: rfVigente });
    expect(res.newHolder).toEqual({ type: 'employee', id: rfNovo });

    const [prev] = await client.db.select().from(employees).where(eq(employees.id, rfVigente));
    expect(prev!.isResponsavelFinanceiro).toBe(false);
    const [novo] = await client.db.select().from(employees).where(eq(employees.id, rfNovo));
    expect(novo!.isResponsavelFinanceiro).toBe(true);

    const [log] = await client.db
      .select()
      .from(responsavelFinanceiroTransferLog)
      .where(eq(responsavelFinanceiroTransferLog.id, res.transferLogId));
    expect(log!.eventType).toBe('transferido');
    expect(log!.previousHolderType).toBe('employee');
    expect(log!.previousHolderId).toBe(rfVigente);
    expect(log!.newHolderType).toBe('employee');
    expect(log!.newHolderId).toBe(rfNovo);
    expect(log!.reason).toBe(JUSTIFICATIVA_OK.trim());
  });

  it('Bruno transfere employee -> cLevel com justificativa', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const res = (await caller.setResponsavelFinanceiro({
      companyId,
      newHolderType: 'cLevel',
      newHolderId: rfCl,
      justificativa: JUSTIFICATIVA_OK,
    })) as SetResponsavelFinanceiroResult;

    expect(res.eventType).toBe('transferido');
    expect(res.previousHolder).toEqual({ type: 'employee', id: rfNovo });
    expect(res.newHolder).toEqual({ type: 'cLevel', id: rfCl });

    const [empPrev] = await client.db.select().from(employees).where(eq(employees.id, rfNovo));
    expect(empPrev!.isResponsavelFinanceiro).toBe(false);
    const [clNovo] = await client.db.select().from(cLevelMembers).where(eq(cLevelMembers.id, rfCl));
    expect(clNovo!.isResponsavelFinanceiro).toBe(true);
  });

  it('transferencia sem justificativa = BAD_REQUEST literal', async () => {
    // Zera vigente para permitir novo cenario com RF fixado.
    await client.db
      .update(cLevelMembers)
      .set({ isResponsavelFinanceiro: false })
      .where(eq(cLevelMembers.id, rfCl));
    await client.db
      .update(employees)
      .set({ isResponsavelFinanceiro: true })
      .where(eq(employees.id, rfVigente));

    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: rfNovo,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TRANSFER_JUSTIFICATIVA_OBRIGATORIA,
    });
  });

  it('transferencia com justificativa < 100 chars = BAD_REQUEST literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: rfNovo,
        justificativa: 'motivo curto',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TRANSFER_JUSTIFICATIVA_MIN,
    });
  });

  it('transferencia com justificativa > 500 chars = BAD_REQUEST literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    const grande = 'x'.repeat(600);
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: rfNovo,
        justificativa: grande,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TRANSFER_JUSTIFICATIVA_MAX,
    });
  });
});

// ============================================================
// 3) Guards — elegibilidade, cross-company, coincidencia
// ============================================================

describe('company.setResponsavelFinanceiro — guards', () => {
  let companyId: number;
  let outraCompanyId: number;
  let rfVigente: number;
  let empInativo: number;
  let empOutraEmpresa: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_GUARDS);
    outraCompanyId = await createCompany(CNPJ_OUTRA_EMPRESA_CROSS);
    rfVigente = await createFixtureEmp(companyId, { isResponsavelFinanceiro: true });
    empInativo = await createFixtureEmp(companyId, { status: 'inativo' });
    empOutraEmpresa = await createFixtureEmp(outraCompanyId);
  });

  it('novo === vigente = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: rfVigente,
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_NEW_HOLDER_JA_E_RF });
  });

  it('novo inativo = CONFLICT literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: empInativo,
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: MSG_NEW_HOLDER_INATIVO_RF });
  });

  it('novo de outra empresa = FORBIDDEN literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: empOutraEmpresa,
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_NEW_HOLDER_EMPRESA_DIVERGENTE_RF,
    });
  });

  it('novo nao encontrado = NOT_FOUND literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId,
        newHolderType: 'employee',
        newHolderId: 999_999_777,
        justificativa: JUSTIFICATIVA_OK,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: MSG_NEW_HOLDER_NAO_ENCONTRADO_RF });
  });

  it('empresa nao encontrada = NOT_FOUND literal', async () => {
    const { factory, ctx } = bindRouter();
    const t = await tokenSuperAdmin();
    const caller = factory(ctx(t));
    await expect(
      caller.setResponsavelFinanceiro({
        companyId: 999_999_777,
        newHolderType: 'employee',
        newHolderId: rfVigente,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: MSG_COMPANY_NAO_ENCONTRADA_RF });
  });
});

// ============================================================
// 4) Sentinela RV-13
// ============================================================

describe('company — sentinela RV-13', () => {
  it('createCompanyRouter aceita deps `emitD050` e `now` injetaveis', () => {
    const fixed = new Date('2026-07-19T00:00:00Z');
    let called = false;
    const emit: EmitD050Facade = async () => {
      called = true;
    };
    const r = createCompanyRouter({ emitD050: emit, now: () => fixed });
    expect(r).toBeDefined();
    expect(called).toBe(false);
  });
});
