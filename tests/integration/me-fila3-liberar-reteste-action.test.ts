// ROIP APP 9BOX — teste de integracao ME-fila3-reteste-ui (MySQL real).
//
// Cobertura canonica cross-role do fluxo canonico DOC 03 §10.6 pt.6 +
// §10.7 (liberacao de reteste de Perfil Individual):
//
// 1. Service `listInconsistentesEnriquecidoByCompany` retorna somente
//    placeholders em `inconsistente` ou `aguardando_nova_resposta`,
//    enriquecidos com nome/cargo + tentativa maxima + audit trail.
// 2. Proc `individualProfile.releaseRetest` (RH+RH-Lider+Bruno)
//    transita placeholder para `aguardando_nova_resposta`, cria nova
//    assessment em `em_andamento` com `tentativa+1` e grava audit
//    trail canonico (retesteLiberadoPor/Tipo/Em).
// 3. Rejeicao canonica quando placeholder NAO esta em `inconsistente`
//    (mensagem canonica literal §10.7 `MSG_RETESTE_PRECONDICAO`).
// 4. Isolamento por empresa — RH da empresa A nao libera reteste de
//    empresa B (`assertCompanyScope` §2.4).
// 5. PC1e canonica (§15.5) — RH nao consegue liberar reteste de
//    C-level; apenas Bruno atravessa.
//
// Faixa de CNPJ desta ME: 20263100000001..20263100000049 (reservada).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
} from '../../src/db/schema';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createIndividualProfileRouter,
  MSG_RETESTE_PRECONDICAO,
} from '../../src/server/routers/individualProfile';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import {
  listInconsistentesEnriquecidoByCompany,
  type PerfilInconsistenteRow,
} from '../../src/server/services/individualProfilePlaceholders';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-fila3-ui';

const HASH_TEST = 'hash-me-fila3';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdEmployeeIds: number[] = [];
const createdCLevelIds: number[] = [];
let cpfCounter = 20263100000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string, nome: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nome} LTDA`,
      nomeFantasia: nome,
      cnpj,
      telefone: '1633330100',
      endereco: `Rua ME-fila3 ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@empresa-me-fila3.test`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@empresa-me-fila3.test`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria ME-fila3',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!row) throw new Error('seed company failed');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function seedEmployee(
  companyId: number,
  name: string,
  cargo: string,
  opts: { readonly isRH?: boolean; readonly isLider?: boolean } = {},
): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@me-fila3.test`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo,
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isRH: opts.isRH === true,
      isLider: opts.isLider === true,
      passwordHash: HASH_TEST,
      passwordSet: true,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  createdEmployeeIds.push(row.id);
  return row.id;
}

async function seedClevel(companyId: number, name: string, cargo: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@me-fila3.test`,
      cpf: nextCpf(),
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo,
      descricaoCargo: cargo,
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: true,
      passwordHash: HASH_TEST,
    })
    .$returningId();
  if (!row) throw new Error('seed clevel failed');
  createdCLevelIds.push(row.id);
  return row.id;
}

async function seedPlaceholder(
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
  status: 'inconsistente' | 'aguardando_nova_resposta' | 'respondido',
): Promise<number> {
  const [row] = await db
    .insert(individualProfilePlaceholders)
    .values({ companyId, userType, userId, status })
    .$returningId();
  if (!row) throw new Error('seed placeholder failed');
  return row.id;
}

async function seedAssessment(
  companyId: number,
  userType: 'employee' | 'clevel',
  userId: number,
  tentativa: number,
  status: 'em_andamento' | 'enviado' | 'inconsistente',
  extras: {
    readonly enviadoEm?: Date;
    readonly retesteLiberadoTipo?: 'rh' | 'super_admin';
    readonly retesteLiberadoPor?: number;
    readonly retesteLiberadoEm?: Date;
  } = {},
): Promise<number> {
  const [row] = await db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType,
      userId,
      tentativa,
      status,
      blocoAtual: 1,
      blocosCompletos: [],
      respostas: null,
      enviadoEm: extras.enviadoEm ?? null,
      retesteLiberadoTipo: extras.retesteLiberadoTipo ?? null,
      retesteLiberadoPor: extras.retesteLiberadoPor ?? null,
      retesteLiberadoEm: extras.retesteLiberadoEm ?? null,
    })
    .$returningId();
  if (!row) throw new Error('seed assessment failed');
  return row.id;
}

async function makeCtxPlatform(
  companyId: number,
  userId: number,
  role: 'rh' | 'rh_lider' | 'clevel' | 'lider',
): Promise<Context> {
  const bearerToken = await signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_TEST),
  });
  return createContextInner({
    db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
}

async function makeCtxSuperAdmin(superAdminId: number): Promise<Context> {
  const bearerToken = await signSuperAdminToken({
    superAdminId,
    credentialVersion: deriveCredentialVersion(HASH_TEST + BRUNO_EMAIL),
  });
  return createContextInner({
    db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
}

const individualProfileRouter = createIndividualProfileRouter();
const createCaller = createCallerFactory(individualProfileRouter);

let companyA: number;
let companyB: number;
let rhPuroA: number;
let liderInconsistenteA: number;
let cLevelInconsistenteA: number;
let outroEmployeeA: number;
let brunoId: number;

const BRUNO_EMAIL = 'bruno-me-fila3@roip.local';

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  companyA = await seedCompany('20263100000001', 'ME-fila3 Alpha');
  companyB = await seedCompany('20263100000002', 'ME-fila3 Beta');

  rhPuroA = await seedEmployee(companyA, 'RH Alpha', 'Coordenador de RH', { isRH: true });
  liderInconsistenteA = await seedEmployee(companyA, 'Marcos Silva', 'Gerente Comercial', {
    isLider: true,
  });
  cLevelInconsistenteA = await seedClevel(companyA, 'Ana Diretora', 'Diretora Financeira');
  outroEmployeeA = await seedEmployee(companyA, 'Carla Analista', 'Analista Pleno');

  // Placeholder + assessment inconsistente do lider `Marcos Silva`.
  await seedPlaceholder(companyA, 'employee', liderInconsistenteA, 'inconsistente');
  await seedAssessment(companyA, 'employee', liderInconsistenteA, 1, 'inconsistente', {
    enviadoEm: new Date('2026-08-15T10:00:00Z'),
  });

  // Placeholder inconsistente do C-level `Ana Diretora` (para PC1e).
  await seedPlaceholder(companyA, 'clevel', cLevelInconsistenteA, 'inconsistente');
  await seedAssessment(companyA, 'clevel', cLevelInconsistenteA, 1, 'inconsistente', {
    enviadoEm: new Date('2026-08-16T14:00:00Z'),
  });

  // Placeholder `respondido` para outro employee — NAO deve aparecer no
  // servico enriquecido.
  await seedPlaceholder(companyA, 'employee', outroEmployeeA, 'respondido');
  await seedAssessment(companyA, 'employee', outroEmployeeA, 1, 'enviado', {
    enviadoEm: new Date('2026-08-01T09:00:00Z'),
  });

  // Bruno canonico (superAdmin).
  const { superAdmins } = await import('../../src/db/schema');
  const [b] = await db
    .insert(superAdmins)
    .values({
      name: 'Bruno ME-fila3',
      email: BRUNO_EMAIL,
      passwordHash: HASH_TEST,
    })
    .$returningId();
  if (!b) throw new Error('seed bruno failed');
  brunoId = b.id;
});

afterAll(async () => {
  const { superAdmins } = await import('../../src/db/schema');
  if (createdCompanyIds.length > 0) {
    await db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
  }
  if (createdEmployeeIds.length > 0) {
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdCLevelIds.length > 0) {
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.id, createdCLevelIds));
  }
  if (createdCompanyIds.length > 0) {
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  if (brunoId !== undefined) {
    await db.delete(superAdmins).where(eq(superAdmins.id, brunoId));
  }
  await closeDbClient(client);
});

describe('ME-fila3 — service listInconsistentesEnriquecidoByCompany (§10.6/§10.7)', () => {
  it('retorna apenas placeholders inconsistente + aguardando_nova_resposta', async () => {
    const rows = await listInconsistentesEnriquecidoByCompany(db, companyA);
    const targetIds = rows.map((r) => r.userId);
    expect(targetIds).toContain(liderInconsistenteA);
    expect(targetIds).toContain(cLevelInconsistenteA);
    expect(targetIds).not.toContain(outroEmployeeA);
  });

  it('enriquece com nome, cargo e tentativa maxima', async () => {
    const rows = await listInconsistentesEnriquecidoByCompany(db, companyA);
    const marcos = rows.find((r) => r.userType === 'employee' && r.userId === liderInconsistenteA);
    expect(marcos).toBeDefined();
    expect(marcos?.userDisplayName).toBe('Marcos Silva');
    expect(marcos?.cargo).toBe('Gerente Comercial');
    expect(marcos?.tentativaAtual).toBe(1);
    expect(marcos?.placeholderStatus).toBe('inconsistente');
  });

  it('isolamento por empresa — companyId B nao ve titulares de A', async () => {
    const rowsB = await listInconsistentesEnriquecidoByCompany(db, companyB);
    expect(rowsB).toHaveLength(0);
  });
});

describe('ME-fila3 — proc individualProfile.releaseRetest (§10.7 mecanica)', () => {
  it('RH libera reteste de employee inconsistente com sucesso', async () => {
    // Preparacao: employee dedicado (para nao contaminar outros testes).
    const empId = await seedEmployee(companyA, 'Diego Souza', 'Supervisor');
    await seedPlaceholder(companyA, 'employee', empId, 'inconsistente');
    await seedAssessment(companyA, 'employee', empId, 1, 'inconsistente', {
      enviadoEm: new Date('2026-08-20T10:00:00Z'),
    });

    const ctx = await makeCtxPlatform(companyA, rhPuroA, 'rh');
    const caller = createCaller(ctx);
    const result = await caller.releaseRetest({
      companyId: companyA,
      userType: 'employee',
      userId: empId,
    });

    // Retorno canonico §10.7 passos 2-4.
    expect(result.tentativa).toBe(2);
    expect(result.placeholderStatus).toBe('aguardando_nova_resposta');
    expect(result.retesteLiberadoTipo).toBe('rh');
    expect(result.retesteLiberadoPor).toBe(rhPuroA);
    expect(result.retesteLiberadoEm).toBeInstanceOf(Date);

    // Estado canonico persistido: placeholder virou aguardando_nova_resposta.
    const [placeholderRow] = await db
      .select({
        status: individualProfilePlaceholders.status,
      })
      .from(individualProfilePlaceholders)
      .where(
        and(
          eq(individualProfilePlaceholders.companyId, companyA),
          eq(individualProfilePlaceholders.userType, 'employee'),
          eq(individualProfilePlaceholders.userId, empId),
        ),
      )
      .limit(1);
    expect(placeholderRow?.status).toBe('aguardando_nova_resposta');

    // Estado canonico persistido: nova assessment em em_andamento com
    // audit trail canonico bit-a-bit ao §10.7 passo 3.
    const [novaAssessment] = await db
      .select({
        status: individualProfileAssessments.status,
        tentativa: individualProfileAssessments.tentativa,
        retesteLiberadoPor: individualProfileAssessments.retesteLiberadoPor,
        retesteLiberadoTipo: individualProfileAssessments.retesteLiberadoTipo,
      })
      .from(individualProfileAssessments)
      .where(
        and(
          eq(individualProfileAssessments.companyId, companyA),
          eq(individualProfileAssessments.userType, 'employee'),
          eq(individualProfileAssessments.userId, empId),
          eq(individualProfileAssessments.tentativa, 2),
        ),
      )
      .limit(1);
    expect(novaAssessment?.status).toBe('em_andamento');
    expect(novaAssessment?.retesteLiberadoPor).toBe(rhPuroA);
    expect(novaAssessment?.retesteLiberadoTipo).toBe('rh');
  });

  it('rejeita quando placeholder NAO esta em inconsistente (MSG_RETESTE_PRECONDICAO)', async () => {
    const ctx = await makeCtxPlatform(companyA, rhPuroA, 'rh');
    const caller = createCaller(ctx);
    // `outroEmployeeA` esta em `respondido`.
    await expect(
      caller.releaseRetest({
        companyId: companyA,
        userType: 'employee',
        userId: outroEmployeeA,
      }),
    ).rejects.toThrow(MSG_RETESTE_PRECONDICAO);
  });

  it('isolamento por empresa — RH de A nao libera reteste em B', async () => {
    // Prepara placeholder em B para o mesmo employee id (nao existe em B,
    // mas o assertCompanyScope reprova antes por role x companyId).
    const ctx = await makeCtxPlatform(companyA, rhPuroA, 'rh');
    const caller = createCaller(ctx);
    await expect(
      caller.releaseRetest({
        companyId: companyB,
        userType: 'employee',
        userId: liderInconsistenteA,
      }),
    ).rejects.toThrow();
  });

  it('PC1e canonica — RH nao libera reteste de C-level inconsistente', async () => {
    const ctx = await makeCtxPlatform(companyA, rhPuroA, 'rh');
    const caller = createCaller(ctx);
    await expect(
      caller.releaseRetest({
        companyId: companyA,
        userType: 'clevel',
        userId: cLevelInconsistenteA,
      }),
    ).rejects.toThrow();
  });

  it('Bruno libera reteste de C-level inconsistente (PC1e atravessada)', async () => {
    // Prepara C-level dedicado para nao contaminar outros testes.
    const cId = await seedClevel(companyA, 'CFO ME-fila3', 'CFO');
    await seedPlaceholder(companyA, 'clevel', cId, 'inconsistente');
    await seedAssessment(companyA, 'clevel', cId, 1, 'inconsistente', {
      enviadoEm: new Date('2026-08-25T11:00:00Z'),
    });

    const ctx = await makeCtxSuperAdmin(brunoId);
    const caller = createCaller(ctx);
    const result = await caller.releaseRetest({
      companyId: companyA,
      userType: 'clevel',
      userId: cId,
    });
    expect(result.tentativa).toBe(2);
    expect(result.placeholderStatus).toBe('aguardando_nova_resposta');
    expect(result.retesteLiberadoTipo).toBe('super_admin');
    expect(result.retesteLiberadoPor).toBe(brunoId);
  });
});

describe('ME-fila3 — pipeline SSR: enriquecido pos-releaseRetest reflete estado canonico', () => {
  it('placeholder liberado aparece como aguardando_nova_resposta com timestamp', async () => {
    // Prepara employee dedicado.
    const empId = await seedEmployee(companyA, 'Beatriz Dev', 'Desenvolvedora');
    await seedPlaceholder(companyA, 'employee', empId, 'inconsistente');
    await seedAssessment(companyA, 'employee', empId, 1, 'inconsistente', {
      enviadoEm: new Date('2026-08-22T09:00:00Z'),
    });

    // Libera reteste.
    const ctx = await makeCtxPlatform(companyA, rhPuroA, 'rh');
    const caller = createCaller(ctx);
    await caller.releaseRetest({
      companyId: companyA,
      userType: 'employee',
      userId: empId,
    });

    // Consulta o service SSR canonico.
    const rows: readonly PerfilInconsistenteRow[] = await listInconsistentesEnriquecidoByCompany(
      db,
      companyA,
    );
    const beatriz = rows.find((r) => r.userType === 'employee' && r.userId === empId);
    expect(beatriz).toBeDefined();
    expect(beatriz?.placeholderStatus).toBe('aguardando_nova_resposta');
    expect(beatriz?.tentativaAtual).toBe(2);
    expect(beatriz?.retesteLiberadoEm).toBeInstanceOf(Date);
  });
});
