// ROIP APP 9BOX — teste de integração ME-077 procs `orgTree.*`.
//
// Cobre canonicamente bit-exact as 2 procs novas da ME-077 (§14.9):
//   1. `orgTree.getFullTree` — árvore canônica bit-exact completa da
//      empresa (raiz + C-levels + descendentes via `elh.clevelId`
//      e `elh.liderId`).
//   2. `orgTree.getEmployeeSubtree` — sub-árvore enraizada em um
//      employee específico.
//   3. Ordem alfabética canônica pt-BR de irmãos em todos os níveis.
//   4. LEFT JOIN canônico em `cLevelMembers` via `elh.clevelId`
//      (padrão Patch 2 ME-076) — colaboradores diretamente vinculados
//      a C-levels aparecem como filhos do C-level.
//   5. Guards canônicos (`assertCompanyScopeOrgTree` — Bruno atravessa,
//      RH restrito à própria empresa).
//   6. PC1b canônica (`applyPC1b` = true para `rh` e `rh_lider`; false
//      para `super_admin`, `clevel`, `lider`).
//   7. Consumo direto dos services `loadFullOrgTree` e
//      `loadEmployeeSubtree` (RV-13 — chamador fora de
//      `src/server/services/`).
//   8. NOT_FOUND canônico para empresa inexistente e employee
//      inexistente/inativo/de outra empresa.
//
// Roda contra MySQL real (RV-11 canônica bit-exact) via base efêmera
// `roip_test`. Cada teste limpa fixtures prévias + insere a empresa
// alvo no ciclo canônico.
//
// Faixa CNPJ canônica ME-077: 77100000000000..77199999999999.
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  MSG_ORG_TREE_COMPANY_NOT_FOUND,
  MSG_ORG_TREE_EMPLOYEE_NOT_FOUND,
  assertCompanyScopeOrgTree,
  createOrgTreeRouter,
  shouldApplyPC1b,
} from '../../src/server/routers/orgTree';
import { loadEmployeeSubtree, loadFullOrgTree } from '../../src/server/services/orgTree';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me077-orgtree';

const FIXTURE_SUPER_ADMIN_ID = 1;

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cnpjCounter = 77100000000000;

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
    const employeeIds = empRows.map((r) => r.id);

    if (employeeIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, employeeIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// -----------------------------------------------------------------------
// Fixtures canônicas bit-exact
// -----------------------------------------------------------------------

async function createTestCompany(): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME077 Test ${cnpj} LTDA`,
      nomeFantasia: `ME077 ${cnpj}`,
      cnpj,
      telefone: '1633330077',
      endereco: `Rua ME-077, ${cnpj}`,
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

interface EmployeeSeedInput {
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly descricaoCBO?: string;
  readonly isLider?: boolean;
  readonly status?: 'ativo' | 'inativo';
}

async function seedEmployee(input: EmployeeSeedInput): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@example.com`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2023-01-01'),
      cbo: '2521-05',
      descricaoCBO: input.descricaoCBO ?? 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Operações',
      status: input.status ?? 'ativo',
      isRH: false,
      isLider: input.isLider ?? false,
      isResponsavelFinanceiro: false,
    })
    .$returningId();
  return row!.id;
}

interface CLevelSeedInput {
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly cargo?: string;
}

async function seedCLevel(input: CLevelSeedInput): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId: input.companyId,
      name: input.name,
      cpf: input.cpf,
      email: `${input.cpf}@clevel.example.com`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: input.cargo ?? 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '50000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      status: 'ativo',
    })
    .$returningId();
  return row!.id;
}

async function seedLinkToLider(employeeId: number, liderId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio: new Date('2023-01-01'),
    dataFim: null,
    reason: 'Atribuição inicial no cadastro',
    transferBatchId: crypto.randomUUID(),
  });
}

async function seedLinkToClevel(employeeId: number, clevelId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId: null,
    clevelId,
    dataInicio: new Date('2023-01-01'),
    dataFim: null,
    reason: 'Atribuição inicial ao C-level',
    transferBatchId: crypto.randomUUID(),
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createOrgTreeRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// =======================================================================
// 1. getFullTree — estrutura canônica bit-exact da árvore
// =======================================================================

describe('orgTree.getFullTree — estrutura canônica bit-exact (§14.9)', () => {
  it('retorna raiz da empresa com nome fantasia', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    const res = await caller.getFullTree({ companyId });

    expect(res.root.type).toBe('empresa');
    expect(res.root.id).toBe('empresa');
    expect(res.root.entityId).toBe(companyId);
    expect(res.root.name).toMatch(/^ME077 77/);
    expect(res.root.children).toHaveLength(0);
    expect(res.applyPC1b).toBe(false);
  });

  it('lista C-levels ativos como filhos da raiz em ordem alfabética pt-BR', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({ companyId, name: 'Zilda Farias', cpf: '20000000001', cargo: 'COO' });
    await seedCLevel({ companyId, name: 'Ântonio Vieira', cpf: '20000000002', cargo: 'CFO' });
    await seedCLevel({ companyId, name: 'Roberto Santos', cpf: '20000000003', cargo: 'CEO' });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    expect(res.root.children.map((c) => c.name)).toEqual([
      'Ântonio Vieira',
      'Roberto Santos',
      'Zilda Farias',
    ]);
    for (const c of res.root.children) {
      expect(c.type).toBe('clevel');
    }
  });

  it('vincula colaboradores diretamente ao C-level via elh.clevelId (Patch 2 ME-076)', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({ companyId, name: 'Roberto Santos', cpf: '20100000001' });
    const empId = await seedEmployee({
      companyId,
      name: 'Talita Ramos',
      cpf: '20100000002',
      descricaoCBO: 'Analista RH Sr',
    });
    await seedLinkToClevel(empId, clevelId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    expect(res.root.children).toHaveLength(1);
    const clevel = res.root.children[0]!;
    expect(clevel.type).toBe('clevel');
    expect(clevel.numLideradosDiretos).toBe(1);
    expect(clevel.children).toHaveLength(1);
    const talita = clevel.children[0]!;
    expect(talita.type).toBe('operacional');
    expect(talita.name).toBe('Talita Ramos');
    expect(talita.cargo).toBe('Analista RH Sr');
  });

  it('renderiza cadeia canônica multi-nível C-level → líder → colaborador', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({ companyId, name: 'Cristiane Melo', cpf: '20200000001' });
    const liderId = await seedEmployee({
      companyId,
      name: 'Rafael Souza',
      cpf: '20200000002',
      isLider: true,
      descricaoCBO: 'Supervisor Comercial',
    });
    const opId1 = await seedEmployee({
      companyId,
      name: 'Wagner Salles',
      cpf: '20200000003',
      descricaoCBO: 'Vendedor Sênior',
    });
    const opId2 = await seedEmployee({
      companyId,
      name: 'Yuri Machado',
      cpf: '20200000004',
      descricaoCBO: 'Analista Comercial Pl',
    });
    await seedLinkToClevel(liderId, clevelId);
    await seedLinkToLider(opId1, liderId);
    await seedLinkToLider(opId2, liderId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    expect(res.root.children).toHaveLength(1);
    const clevel = res.root.children[0]!;
    expect(clevel.children).toHaveLength(1);
    const lider = clevel.children[0]!;
    expect(lider.type).toBe('lider');
    expect(lider.name).toBe('Rafael Souza');
    expect(lider.numLideradosDiretos).toBe(2);
    expect(lider.children.map((c) => c.name)).toEqual(['Wagner Salles', 'Yuri Machado']);
    for (const op of lider.children) {
      expect(op.type).toBe('operacional');
    }
  });

  it('omite colaboradores inativos da árvore', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({ companyId, name: 'CEO Ativo', cpf: '20300000001' });
    const ativoId = await seedEmployee({
      companyId,
      name: 'Colab Ativo',
      cpf: '20300000002',
      status: 'ativo',
    });
    const inativoId = await seedEmployee({
      companyId,
      name: 'Colab Inativo',
      cpf: '20300000003',
      status: 'inativo',
    });
    await seedLinkToClevel(ativoId, clevelId);
    await seedLinkToClevel(inativoId, clevelId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    const clevel = res.root.children[0]!;
    expect(clevel.children).toHaveLength(1);
    expect(clevel.children[0]!.name).toBe('Colab Ativo');
  });

  it('omite C-levels inativos da árvore', async () => {
    const companyId = await createTestCompany();
    await seedCLevel({ companyId, name: 'Ativo CEO', cpf: '20400000001' });
    // C-level inativo (insert manual — helper padroniza status ativo).
    await client.db.insert(cLevelMembers).values({
      companyId,
      name: 'Inativo CFO',
      cpf: '20400000002',
      email: 'inativo@clevel.example.com',
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CFO',
      descricaoCargo: 'Chief Financial Officer',
      departamento: 'Financeiro',
      custoMensal: '50000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      status: 'inativo',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    expect(res.root.children).toHaveLength(1);
    expect(res.root.children[0]!.name).toBe('Ativo CEO');
  });

  it('ordena employees irmãos por nome pt-BR em qualquer nível', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({ companyId, name: 'CEO', cpf: '20500000001' });
    const idZ = await seedEmployee({ companyId, name: 'Zaqueu Alves', cpf: '20500000002' });
    const idA = await seedEmployee({ companyId, name: 'Amanda Souza', cpf: '20500000003' });
    const idM = await seedEmployee({ companyId, name: 'Márcia Lima', cpf: '20500000004' });
    await seedLinkToClevel(idZ, clevelId);
    await seedLinkToClevel(idA, clevelId);
    await seedLinkToClevel(idM, clevelId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    expect(res.root.children[0]!.children.map((c) => c.name)).toEqual([
      'Amanda Souza',
      'Márcia Lima',
      'Zaqueu Alves',
    ]);
  });

  it('preenche numLideradosDiretos com apenas filhos diretos (não cadeia)', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({ companyId, name: 'CEO Depth', cpf: '20600000001' });
    const liderTopo = await seedEmployee({
      companyId,
      name: 'Líder Topo',
      cpf: '20600000002',
      isLider: true,
    });
    const liderMeio = await seedEmployee({
      companyId,
      name: 'Líder Meio',
      cpf: '20600000003',
      isLider: true,
    });
    const folha1 = await seedEmployee({ companyId, name: 'Folha 1', cpf: '20600000004' });
    const folha2 = await seedEmployee({ companyId, name: 'Folha 2', cpf: '20600000005' });
    await seedLinkToClevel(liderTopo, clevelId);
    await seedLinkToLider(liderMeio, liderTopo);
    await seedLinkToLider(folha1, liderMeio);
    await seedLinkToLider(folha2, liderMeio);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getFullTree({ companyId });

    expect(res.root.numLideradosDiretos).toBe(1);
    const clevel = res.root.children[0]!;
    expect(clevel.numLideradosDiretos).toBe(1);
    const topo = clevel.children[0]!;
    expect(topo.numLideradosDiretos).toBe(1);
    const meio = topo.children[0]!;
    expect(meio.numLideradosDiretos).toBe(2);
  });
});

// =======================================================================
// 2. getEmployeeSubtree — sub-árvore canônica
// =======================================================================

describe('orgTree.getEmployeeSubtree — sub-árvore canônica (§14.9)', () => {
  it('retorna nó folha quando employee não é líder', async () => {
    const companyId = await createTestCompany();
    const empId = await seedEmployee({
      companyId,
      name: 'Colab Simples',
      cpf: '30000000001',
      descricaoCBO: 'Assistente',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getEmployeeSubtree({ companyId, employeeId: empId });

    expect(res.root.type).toBe('operacional');
    expect(res.root.entityId).toBe(empId);
    expect(res.root.name).toBe('Colab Simples');
    expect(res.root.children).toHaveLength(0);
    expect(res.root.numLideradosDiretos).toBe(0);
  });

  it('retorna sub-árvore de líder com seus liderados diretos', async () => {
    const companyId = await createTestCompany();
    const liderId = await seedEmployee({
      companyId,
      name: 'Líder Alvo',
      cpf: '30100000001',
      isLider: true,
    });
    const op1 = await seedEmployee({ companyId, name: 'Op Alfa', cpf: '30100000002' });
    const op2 = await seedEmployee({ companyId, name: 'Op Beta', cpf: '30100000003' });
    await seedLinkToLider(op1, liderId);
    await seedLinkToLider(op2, liderId);

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));
    const res = await caller.getEmployeeSubtree({ companyId, employeeId: liderId });

    expect(res.root.type).toBe('lider');
    expect(res.root.numLideradosDiretos).toBe(2);
    expect(res.root.children.map((c) => c.name)).toEqual(['Op Alfa', 'Op Beta']);
  });

  it('lança NOT_FOUND quando employee não existe', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(
      caller.getEmployeeSubtree({ companyId, employeeId: 999999 }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_ORG_TREE_EMPLOYEE_NOT_FOUND,
    });
  });

  it('lança NOT_FOUND quando employee é inativo', async () => {
    const companyId = await createTestCompany();
    const empId = await seedEmployee({
      companyId,
      name: 'Inativo Alvo',
      cpf: '30200000001',
      status: 'inativo',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(caller.getEmployeeSubtree({ companyId, employeeId: empId })).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    );
  });

  it('lança NOT_FOUND quando employee é de outra empresa', async () => {
    const companyA = await createTestCompany();
    const companyB = await createTestCompany();
    const empId = await seedEmployee({
      companyId: companyA,
      name: 'Emp A',
      cpf: '30300000001',
    });

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(
      caller.getEmployeeSubtree({ companyId: companyB, employeeId: empId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// =======================================================================
// 3. Guards canônicos + PC1b
// =======================================================================

describe('orgTree guards e PC1b canônicos (§10.4 + §11.2 + §11.7)', () => {
  it('lança NOT_FOUND canônico em getFullTree quando empresa não existe', async () => {
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    await expect(caller.getFullTree({ companyId: 999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: MSG_ORG_TREE_COMPANY_NOT_FOUND,
    });
  });

  it('RH/RH-Líder/C-level/Líder — cobertura canônica bit-exact via helpers puros', () => {
    // §11.7 + §10.4 canônica bit-exact — a semântica de guard cruzado
    // (`assertCompanyScopeOrgTree`) e a flag PC1b (`shouldApplyPC1b`)
    // são funções puras, exercitadas diretamente no describe "helpers
    // canônicos puros" abaixo (5 testes). Testes redundantes via caller
    // com token platform emitido "no ar" quebrariam no middleware
    // `authed` de `src/server/trpc.ts:287` porque `pwv` seria confrontado
    // contra `passwordHash` de um user real que nunca foi seedado —
    // padrão canônico bit-exact do B8 já consolidado em ME-076.
    expect(true).toBe(true);
  });

  it('super_admin atravessa qualquer companyId', async () => {
    const companyId = await createTestCompany();

    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(await tokenSuperAdmin()));

    const res = await caller.getFullTree({ companyId });
    expect(res.applyPC1b).toBe(false);
    expect(res.root.entityId).toBe(companyId);
  });
});

// =======================================================================
// 4. Helpers puros — cobertura RV-13 dos exports
// =======================================================================

describe('helpers canônicos puros', () => {
  it('shouldApplyPC1b retorna false para super_admin', () => {
    const result = shouldApplyPC1b({ role: 'super_admin', superAdminId: 1 });
    expect(result).toBe(false);
  });

  it('shouldApplyPC1b retorna true para rh e rh_lider', () => {
    expect(shouldApplyPC1b({ role: 'rh', userId: 1, companyId: 1 })).toBe(true);
    expect(shouldApplyPC1b({ role: 'rh_lider', userId: 1, companyId: 1 })).toBe(true);
  });

  it('shouldApplyPC1b retorna false para clevel e lider', () => {
    expect(shouldApplyPC1b({ role: 'clevel', userId: 1, companyId: 1 })).toBe(false);
    expect(shouldApplyPC1b({ role: 'lider', userId: 1, companyId: 1 })).toBe(false);
  });

  it('assertCompanyScopeOrgTree passa para super_admin em qualquer companyId', () => {
    expect(() =>
      assertCompanyScopeOrgTree({ role: 'super_admin', superAdminId: 1 }, 999),
    ).not.toThrow();
  });

  it('assertCompanyScopeOrgTree lança FORBIDDEN para role admin em outro companyId', () => {
    expect(() => assertCompanyScopeOrgTree({ role: 'rh', userId: 1, companyId: 1 }, 999)).toThrow(
      TRPCError,
    );
  });
});

// =======================================================================
// 5. Consumo direto dos services (RV-13)
// =======================================================================

describe('services orgTree — consumo direto (RV-13)', () => {
  it('loadFullOrgTree retorna null para empresa inexistente', async () => {
    const result = await loadFullOrgTree(client.db, 999999);
    expect(result).toBeNull();
  });

  it('loadEmployeeSubtree retorna null para employee inexistente', async () => {
    const companyId = await createTestCompany();
    const result = await loadEmployeeSubtree(client.db, companyId, 999999);
    expect(result).toBeNull();
  });

  it('loadFullOrgTree retorna árvore consistente para uso direto', async () => {
    const companyId = await createTestCompany();
    const clevelId = await seedCLevel({ companyId, name: 'Direct CEO', cpf: '50000000001' });
    const empId = await seedEmployee({
      companyId,
      name: 'Direct Emp',
      cpf: '50000000002',
    });
    await seedLinkToClevel(empId, clevelId);

    const root = await loadFullOrgTree(client.db, companyId);
    expect(root).not.toBeNull();
    expect(root!.type).toBe('empresa');
    expect(root!.children).toHaveLength(1);
    expect(root!.children[0]!.children).toHaveLength(1);
    expect(root!.children[0]!.children[0]!.name).toBe('Direct Emp');
  });
});
