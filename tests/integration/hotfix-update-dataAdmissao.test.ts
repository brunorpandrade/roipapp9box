// ROIP APP 9BOX — teste de integração canônico do hotfix pós-ME 3.5.1.
//
// Cobre bit-a-bit a persistência de `dataAdmissao` no UPDATE canônico
// de ambas as tabelas de cadastro (`cLevelMembers` + `employees`). Bug
// canonicamente pré-existente descoberto empiricamente por Bruno em
// 28/09/2026 durante correção do cadastro dos 2 C-levels da Embrastec:
// o campo era enviado pelo formulário mas descartado silenciosamente
// pelo `.strip()` default do Zod, resultando em UI que aparentava
// salvar sem efeito real no DB.
//
// Regra nova canonizada (RV-16 estendida): teste de contrato de UPDATE
// cobre TODOS os campos editáveis com asserção bit-a-bit BEFORE/AFTER —
// não subset. Este arquivo aplica a regra bit-a-bit aos updates de
// C-level e colaborador simultaneamente, e serve de referência
// canônica para próximas MEs que adicionem novos campos editáveis.
//
// Faixa CNPJ dedicada: 96000000000001..96000000000009 (hotfix pós-ME
// 3.5.1). L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  individualProfilePlaceholders,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  UPDATE_CLEVEL_INPUT_SCHEMA,
  createCLevelMembersRouter,
} from '../../src/server/routers/cLevelMembers';
import {
  UPDATE_EMPLOYEE_INPUT_SCHEMA,
  createEmployeesRouter,
} from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-hotfix-dataAdmissao';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-hotfix-dataAdmissao';

let cnpjCounter = 95999999999999;
function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter).padStart(14, '0');
}

let cpfCounter = 79000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

async function createCompany(razaoSocial: string): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial,
      nomeFantasia: razaoSocial,
      cnpj,
      telefone: '1633330000',
      endereco: `Rua hotfix, ${cnpj}`,
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
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function createCLevel(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'CEO Teste Inicial',
      cpf: nextCpf(),
      email: 'ceo-inicial@roip.local',
      dataNascimento: new Date('1975-05-20'),
      dataAdmissao: new Date('2018-01-15'),
      cargo: 'CEO Inicial',
      descricaoCargo: 'Executivo Inicial',
      departamento: 'Diretoria',
      custoMensal: '30000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      isRH: false,
      status: 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Employee Inicial',
      cpf: nextCpf(),
      email: 'emp-inicial@roip.local',
      dataNascimento: new Date('1990-03-10'),
      dataAdmissao: new Date('2020-06-01'),
      cbo: '142105',
      descricaoCBO: 'Analista Inicial',
      cargo: 'Analista Inicial',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      isRH: false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function buildContext(bearerToken: string | null): Promise<Context> {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: null,
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
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

describe('Hotfix pós-ME 3.5.1 — Zod contract dos schemas UPDATE', () => {
  it('UPDATE_CLEVEL_INPUT_SCHEMA aceita dataAdmissao', () => {
    const parsed = UPDATE_CLEVEL_INPUT_SCHEMA.safeParse({
      cLevelId: 1,
      dataAdmissao: '2019-03-20',
    });
    expect(parsed.success).toBe(true);
  });

  it('UPDATE_EMPLOYEE_INPUT_SCHEMA aceita dataAdmissao', () => {
    const parsed = UPDATE_EMPLOYEE_INPUT_SCHEMA.safeParse({
      employeeId: 1,
      dataAdmissao: '2021-08-10',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('Hotfix pós-ME 3.5.1 — persistência bit-a-bit de dataAdmissao', () => {
  it('cLevelMembers.update grava dataAdmissao (bug do descarte silencioso corrigido)', async () => {
    const companyId = await createCompany('Empresa Hotfix Alpha Ltda');
    const cLevelId = await createCLevel(companyId);

    const before = await client.db
      .select({ dataAdmissao: cLevelMembers.dataAdmissao })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, cLevelId))
      .limit(1);
    expect(before[0]!.dataAdmissao.toISOString().slice(0, 10)).toBe('2018-01-15');

    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createCLevelMembersRouter())(ctx);
    const result = await caller.update({
      cLevelId,
      dataAdmissao: '2020-11-30',
    });
    expect(result.affected).toBe(1);

    const after = await client.db
      .select({ dataAdmissao: cLevelMembers.dataAdmissao })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, cLevelId))
      .limit(1);
    expect(after[0]!.dataAdmissao.toISOString().slice(0, 10)).toBe('2020-11-30');
  });

  it('employees.update grava dataAdmissao (bug canônico simétrico ao clevel)', async () => {
    const companyId = await createCompany('Empresa Hotfix Beta Ltda');
    const employeeId = await createEmployee(companyId);

    const before = await client.db
      .select({ dataAdmissao: employees.dataAdmissao })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    expect(before[0]!.dataAdmissao.toISOString().slice(0, 10)).toBe('2020-06-01');

    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createEmployeesRouter())(ctx);
    const result = await caller.update({
      employeeId,
      dataAdmissao: '2022-02-14',
    });
    expect(result.affected).toBe(1);

    const after = await client.db
      .select({ dataAdmissao: employees.dataAdmissao })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    expect(after[0]!.dataAdmissao.toISOString().slice(0, 10)).toBe('2022-02-14');
  });

  it('cLevelMembers.update preserva outros campos quando só dataAdmissao muda', async () => {
    const companyId = await createCompany('Empresa Hotfix Gamma Ltda');
    const cLevelId = await createCLevel(companyId);

    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createCLevelMembersRouter())(ctx);
    await caller.update({ cLevelId, dataAdmissao: '2019-07-01' });

    const after = await client.db
      .select()
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, cLevelId))
      .limit(1);
    expect(after[0]!.name).toBe('CEO Teste Inicial');
    expect(after[0]!.cargo).toBe('CEO Inicial');
    expect(after[0]!.dataNascimento.toISOString().slice(0, 10)).toBe('1975-05-20');
    expect(after[0]!.dataAdmissao.toISOString().slice(0, 10)).toBe('2019-07-01');
  });
});
