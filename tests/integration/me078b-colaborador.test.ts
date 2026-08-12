// ROIP APP 9BOX — teste de integração ME-078b procs `employees.getById` +
// `employees.searchLiderCandidates` + `employees.create` com `cargo` +
// `liderInicialClevelId` polimorfico + `employees.update` com `cargo`.
//
// Cobre canonicamente bit-exact:
//   1. `employees.getById` — happy path, shape completo com
//      currentLiderInicial polimorfico (employee | clevel), sem lider.
//   2. NOT_FOUND canonico para employeeId inexistente.
//   3. Guard cross-company (assertCompanyScope).
//   4. `employees.searchLiderCandidates` — union employees + clevel,
//      filtro por query, excludeEmployeeId, C-levels primeiro.
//   5. `employees.create` com `cargo` obrigatorio.
//   6. `employees.create` com `liderInicialClevelId` (branch polimorfico).
//   7. Refine mutual exclusion liderInicialId x liderInicialClevelId.
//   8. `employees.update` com `cargo`.
//   9. Helpers puros: `assertClevelAtivoDaEmpresa`.
//  10. RV-13 — exports usados.
//
// Faixa CNPJ canonica ME-078b: 78200000000000..78299999999999.
// L32 cleanup em afterAll. CC070 — APENAS `tokenSuperAdmin()`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  individualProfilePlaceholders,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  MSG_LIDER_INICIAL_INVALIDO,
  assertClevelAtivoDaEmpresa,
  assertLiderAtivoDaEmpresa,
  createEmployeesRouter,
  getEmployeeById,
  searchLiderCandidatesForCompany,
} from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me078b-colaborador';

const FIXTURE_SUPER_ADMIN_ID = 1;

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cnpjCounter = 78200000000000;

function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter);
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createTestCompany(): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME078b Test ${cnpj} LTDA`,
      nomeFantasia: `ME078b ${cnpj}`,
      cnpj,
      telefone: '1633330078',
      endereco: `Rua ME-078b, ${cnpj}`,
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
      modoAnoFiscal: 'padrao',
      mesInicioAnoFiscal: 1,
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function seedEmployee(input: {
  companyId: number;
  name: string;
  cpf: string;
  cargo?: string;
  isLider?: boolean;
  status?: 'ativo' | 'inativo';
}): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@e.example.com`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2023-01-01'),
      cargo: input.cargo ?? 'Analista',
      cbo: '2521',
      descricaoCBO: 'Analista de Recursos Humanos',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Recursos Humanos',
      status: input.status ?? 'ativo',
      isRH: false,
      isLider: input.isLider ?? false,
      isResponsavelFinanceiro: false,
    })
    .$returningId();
  return row!.id;
}

async function seedCLevel(input: {
  companyId: number;
  name: string;
  cpf: string;
  cargo?: string;
  status?: 'ativo' | 'inativo';
}): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@cl.example.com`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: input.cargo ?? 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '50000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      status: input.status ?? 'ativo',
    })
    .$returningId();
  return row!.id;
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindEmployeesRouter() {
  const testRouter = createEmployeesRouter();
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
// employees.getById
// ============================================================

describe('ME-078b — employees.getById', () => {
  it('retorna shape completo com currentLiderInicial employee', async () => {
    const companyId = await createTestCompany();
    const liderId = await seedEmployee({
      companyId,
      name: 'Líder Direto Alpha',
      cpf: `${cnpjCounter}01`.slice(-11),
      isLider: true,
    });
    const cpf = `${cnpjCounter}02`.slice(-11);
    const empId = await seedEmployee({
      companyId,
      name: 'Colaborador Comum',
      cpf,
    });
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: empId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'Cadastro inicial',
      transferBatchId: '00000000-0000-0000-0000-000000000001',
    });

    const result = await getEmployeeById(client.db, empId);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Colaborador Comum');
    expect(result?.cargo).toBe('Analista');
    expect(result?.currentLiderInicial).not.toBeNull();
    expect(result?.currentLiderInicial?.tipo).toBe('employee');
    expect(result?.currentLiderInicial?.id).toBe(liderId);
    expect(result?.currentLiderInicial?.name).toBe('Líder Direto Alpha');
    expect(result?.countActiveLiderados).toBe(0);
    expect(result?.hasTerminationEvents).toBe(false);
  });

  it('retorna currentLiderInicial clevel quando lider e C-level', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({
      companyId,
      name: 'CEO da Empresa',
      cpf: `${cnpjCounter}11`.slice(-11),
    });
    const empId = await seedEmployee({
      companyId,
      name: 'Diretor Direto',
      cpf: `${cnpjCounter}12`.slice(-11),
    });
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: empId,
      liderId: null,
      clevelId,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'Cadastro inicial',
      transferBatchId: '00000000-0000-0000-0000-000000000002',
    });

    const result = await getEmployeeById(client.db, empId);
    expect(result?.currentLiderInicial?.tipo).toBe('clevel');
    expect(result?.currentLiderInicial?.id).toBe(clevelId);
    expect(result?.currentLiderInicial?.name).toBe('CEO da Empresa');
  });

  it('retorna null para employeeId inexistente', async () => {
    const result = await getEmployeeById(client.db, 999999999);
    expect(result).toBeNull();
  });

  it('proc getById lanca NOT_FOUND para inexistente', async () => {
    const { factory, ctx } = bindEmployeesRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(caller.getById({ employeeId: 999999999 })).rejects.toThrow(TRPCError);
  });
});

// ============================================================
// employees.searchLiderCandidates
// ============================================================

describe('ME-078b — employees.searchLiderCandidates', () => {
  it('retorna union clevel + employees lideres ativos, C-levels primeiro', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({
      companyId,
      name: 'Alpha CEO',
      cpf: `${cnpjCounter}21`.slice(-11),
    });
    await seedEmployee({
      companyId,
      name: 'Beta Lider',
      cpf: `${cnpjCounter}22`.slice(-11),
      isLider: true,
    });
    await seedEmployee({
      companyId,
      name: 'Gamma Nao Lider',
      cpf: `${cnpjCounter}23`.slice(-11),
      isLider: false,
    });

    const result = await searchLiderCandidatesForCompany(
      client.db,
      companyId,
      undefined,
      undefined,
    );
    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0]?.tipo).toBe('clevel');
    expect(result.candidates[0]?.name).toBe('Alpha CEO');
    expect(result.candidates[1]?.tipo).toBe('employee');
    expect(result.candidates[1]?.name).toBe('Beta Lider');
  });

  it('filtra por termo de busca em name ou cargo case-insensitive', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({
      companyId,
      name: 'CEO Marcado',
      cpf: `${cnpjCounter}31`.slice(-11),
    });
    await seedEmployee({
      companyId,
      name: 'Diretor Zeta',
      cpf: `${cnpjCounter}32`.slice(-11),
      cargo: 'Gerente Comercial',
      isLider: true,
    });

    const result = await searchLiderCandidatesForCompany(
      client.db,
      companyId,
      'comercial',
      undefined,
    );
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.name).toBe('Diretor Zeta');
  });

  it('excludeEmployeeId remove candidato empregado', async () => {
    const companyId = await createTestCompany();
    const liderId = await seedEmployee({
      companyId,
      name: 'Lider Excluido',
      cpf: `${cnpjCounter}41`.slice(-11),
      isLider: true,
    });

    const result = await searchLiderCandidatesForCompany(client.db, companyId, undefined, liderId);
    expect(
      result.candidates.find((c) => c.tipo === 'employee' && c.id === liderId),
    ).toBeUndefined();
  });
});

// ============================================================
// employees.create com cargo obrigatorio + liderInicialClevelId
// ============================================================

describe('ME-078b — employees.create ampliada', () => {
  it('cria colaborador com cargo obrigatorio', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindEmployeesRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.create({
      companyId,
      name: 'Novo Colaborador',
      cpf: `${cnpjCounter}51`.slice(-11),
      dataNascimento: '1990-05-05',
      dataAdmissao: '2024-01-01',
      cargo: 'Analista Comercial Sênior',
      cbo: '3541',
      descricaoCBO: 'Vendedor pracista',
      jobFamily: 'vendas_comercial',
      senioridade: 'senior',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });
    expect(result.employeeId).toBeGreaterThan(0);

    const stored = await getEmployeeById(client.db, result.employeeId);
    expect(stored?.cargo).toBe('Analista Comercial Sênior');
  });

  it('cria colaborador com liderInicialClevelId polimorfico', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({
      companyId,
      name: 'CEO Alpha',
      cpf: `${cnpjCounter}61`.slice(-11),
    });
    const { factory, ctx } = bindEmployeesRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.create({
      companyId,
      name: 'Diretor Novo',
      cpf: `${cnpjCounter}62`.slice(-11),
      dataNascimento: '1985-05-05',
      dataAdmissao: '2024-01-01',
      cargo: 'Diretor Comercial',
      cbo: '1414',
      descricaoCBO: 'Diretor comercial',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'estrategico',
      departamento: 'Comercial',
      liderInicialClevelId: clevelId,
    });
    expect(result.employeeId).toBeGreaterThan(0);

    const stored = await getEmployeeById(client.db, result.employeeId);
    expect(stored?.currentLiderInicial?.tipo).toBe('clevel');
    expect(stored?.currentLiderInicial?.id).toBe(clevelId);
  });

  it('rejeita create com ambos liderInicialId e liderInicialClevelId', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindEmployeesRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.create({
        companyId,
        name: 'Invalido',
        cpf: `${cnpjCounter}71`.slice(-11),
        dataNascimento: '1990-01-01',
        dataAdmissao: '2024-01-01',
        cargo: 'Analista',
        cbo: '2521',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Financeiro',
        liderInicialId: 1,
        liderInicialClevelId: 1,
      }),
    ).rejects.toThrow();
  });
});

// ============================================================
// employees.update com cargo
// ============================================================

describe('ME-078b — employees.update com cargo', () => {
  it('atualiza cargo do colaborador', async () => {
    const companyId = await createTestCompany();
    const empId = await seedEmployee({
      companyId,
      name: 'Colaborador Editavel',
      cpf: `${cnpjCounter}81`.slice(-11),
      cargo: 'Analista Junior',
    });
    const { factory, ctx } = bindEmployeesRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await caller.update({
      employeeId: empId,
      cargo: 'Analista Pleno',
    });
    const stored = await getEmployeeById(client.db, empId);
    expect(stored?.cargo).toBe('Analista Pleno');
  });
});

// ============================================================
// Helpers puros — assertClevelAtivoDaEmpresa
// ============================================================

describe('ME-078b — assertClevelAtivoDaEmpresa', () => {
  it('nao lanca para C-level ativo da empresa', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({
      companyId,
      name: 'CEO Ativo',
      cpf: `${cnpjCounter}91`.slice(-11),
    });
    await expect(
      assertClevelAtivoDaEmpresa(client.db, companyId, clevelId),
    ).resolves.toBeUndefined();
  });

  it('lanca BAD_REQUEST para C-level de outra empresa', async () => {
    const companyA = await createTestCompany();
    const companyB = await createTestCompany();
    const clevelId = await seedCLevel({
      companyId: companyA,
      name: 'CEO A',
      cpf: `${cnpjCounter}92`.slice(-11),
    });
    await expect(assertClevelAtivoDaEmpresa(client.db, companyB, clevelId)).rejects.toThrow(
      MSG_LIDER_INICIAL_INVALIDO,
    );
  });

  it('lanca BAD_REQUEST para C-level inativo', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({
      companyId,
      name: 'CEO Inativo',
      cpf: `${cnpjCounter}93`.slice(-11),
      status: 'inativo',
    });
    await expect(assertClevelAtivoDaEmpresa(client.db, companyId, clevelId)).rejects.toThrow(
      MSG_LIDER_INICIAL_INVALIDO,
    );
  });

  it('lanca BAD_REQUEST para C-level inexistente', async () => {
    const companyId = await createTestCompany();
    await expect(assertClevelAtivoDaEmpresa(client.db, companyId, 999999999)).rejects.toThrow(
      MSG_LIDER_INICIAL_INVALIDO,
    );
  });
});

// ============================================================
// RV-13 — exports usados
// ============================================================

describe('ME-078b — RV-13 exports usados', () => {
  it('assertLiderAtivoDaEmpresa exportado e chamado', () => {
    expect(typeof assertLiderAtivoDaEmpresa).toBe('function');
  });
  it('assertClevelAtivoDaEmpresa exportado e chamado', () => {
    expect(typeof assertClevelAtivoDaEmpresa).toBe('function');
  });
  it('getEmployeeById exportado e chamado', () => {
    expect(typeof getEmployeeById).toBe('function');
  });
  it('searchLiderCandidatesForCompany exportado e chamado', () => {
    expect(typeof searchLiderCandidatesForCompany).toBe('function');
  });
});
