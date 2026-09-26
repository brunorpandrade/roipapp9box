// ROIP APP 9BOX — bateria de segurança cross-company e autorização
// cruzada (rota §4, Etapa 0, item 2). Bloqueante para credenciais do
// primeiro cliente.
//
// Duas empresas reais na base efêmera:
//   Empresa A: ct1 (C-level restrito, acessoTotal=false) → l1 → l2 → e1
//              ct2 (C-level total)                        → l3 → e2
//              rh (RH puro)
//   Empresa B: cl (C-level) → l1 → e1; rh
//
// Camada 1 — varredura automática: todas as procedures do `appRouter`
// com input são chamadas por RH(A), líder l2(A) e C-level restrito
// ct1(A) em dois cenários cross-company:
//   · B   — `companyId` e alvos da empresa B;
//   · MIX — `companyId` próprio (A) com alvos da empresa B (IDOR).
// Regra: nenhuma chamada B pode ter sucesso quando o input carrega
// `companyId`; nenhuma chamada MIX pode devolver identificadores da B.
// Os inputs são gerados por introspecção do schema zod (fonte única: o
// próprio router), com dicas por nome de campo — um BAD_REQUEST de zod
// numa procedure com `companyId` reprova a régua (gerador incompleto),
// para que nenhuma procedure fique silenciosamente fora da varredura.
//
// Camada 2 — casos dirigidos S1–S8 (defeitos encontrados na auditoria)
// e controles positivos (acesso legítimo continua funcionando).
//
// Camada 3 — middleware: rotas antes fora da matriz agora barram
// acesso direto por URL.
//
// RV-03: com as correções revertidas esta régua reprova (outputs no
// histórico da ME). RV-11: MySQL real. RV-14: 100 colunas.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import mysql from 'mysql2/promise';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { appRouter } from '../../src/server/routers/index';
import { resolveCadeiaScope } from '../../src/server/services/cadeiaScopeGuard';
import { createCallerFactory, createContextInner } from '../../src/server/trpc';
import { middleware } from '../../middleware';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-seguranca-cross-company';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const HASH = 'hash-seguranca-cross-company';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
const createdEmployeeIds: number[] = [];
const createdElhIds: number[] = [];
let cpfCounter = 93000000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// ---------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------

async function seedCompany(cnpj: string, nome: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nome} LTDA`,
      nomeFantasia: nome,
      cnpj,
      telefone: '1633330099',
      endereco: `Rua Seguranca ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Seguranca',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
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

async function seedClevel(companyId: number, name: string, acessoTotal: boolean): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${companyId}-${Date.now()}@seg.com`,
      cpf: nextCpf(),
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal,
      passwordHash: HASH,
    })
    .$returningId();
  if (!row) throw new Error('seed cLevel failed');
  createdCLevelIds.push(row.id);
  return row.id;
}

async function seedEmployee(
  companyId: number,
  name: string,
  opts: { readonly isLider?: boolean; readonly isRH?: boolean } = {},
): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'tecnico_especialista',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isRH: opts.isRH === true,
      isLider: opts.isLider === true,
      passwordHash: HASH,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  createdEmployeeIds.push(row.id);
  return row.id;
}

async function seedLink(
  employeeId: number,
  liderId: number | null,
  clevelId: number | null,
): Promise<void> {
  const [row] = await db
    .insert(employeeLeaderHistory)
    .values({
      employeeId,
      liderId,
      clevelId,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'setup seguranca',
      transferBatchId: '00000000-0000-0000-0000-000000009301',
    })
    .$returningId();
  if (!row) throw new Error('seed elh failed');
  createdElhIds.push(row.id);
}

const A = { company: 0, ct1: 0, ct2: 0, rh: 0, l1: 0, l2: 0, e1: 0, l3: 0, e2: 0 };
const B = { company: 0, cl: 0, rh: 0, l1: 0, e1: 0 };

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  A.company = await seedCompany('93000000000001', 'Seguranca A');
  B.company = await seedCompany('93000000000002', 'Seguranca B');

  A.ct1 = await seedClevel(A.company, 'Ct Restrito A', false);
  A.ct2 = await seedClevel(A.company, 'Ct Total A', true);
  A.rh = await seedEmployee(A.company, 'RH A', { isRH: true });
  A.l1 = await seedEmployee(A.company, 'Lider Um A', { isLider: true });
  A.l2 = await seedEmployee(A.company, 'Lider Dois A', { isLider: true });
  A.e1 = await seedEmployee(A.company, 'Colab Um A');
  A.l3 = await seedEmployee(A.company, 'Lider Tres A', { isLider: true });
  A.e2 = await seedEmployee(A.company, 'Colab Dois A');
  await seedLink(A.l1, null, A.ct1);
  await seedLink(A.l2, A.l1, null);
  await seedLink(A.e1, A.l2, null);
  await seedLink(A.l3, null, A.ct2);
  await seedLink(A.e2, A.l3, null);

  B.cl = await seedClevel(B.company, 'Cl B', true);
  B.rh = await seedEmployee(B.company, 'RH B', { isRH: true });
  B.l1 = await seedEmployee(B.company, 'Lider B', { isLider: true });
  B.e1 = await seedEmployee(B.company, 'Colab B');
  await seedLink(B.l1, null, B.cl);
  await seedLink(B.e1, B.l1, null);
});

/**
 * Limpeza integral das duas empresas. A varredura da camada 1 exercita
 * mutations reais (cadastro, chat, placeholders...) que deixam linhas em
 * tabelas variadas; suites vizinhas (`auth-changePassword`) apagam
 * `companies` inteira e quebram por FK se algo ficar para tras. Por
 * isso a limpeza descobre, via `information_schema`, toda tabela com
 * coluna `companyId` e apaga as linhas das empresas desta suite antes
 * de remover as proprias empresas (conexao mysql2 dedicada, como o
 * `setup.ts`; a base e efemera).
 */
async function limparEmpresasDaSuite(): Promise<void> {
  const m = TEST_URL.match(/^mysql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error('DATABASE_URL_TEST invalida para a limpeza');
  const conn = await mysql.createConnection({
    host: m[3],
    port: Number(m[4]),
    user: decodeURIComponent(m[1]!),
    password: decodeURIComponent(m[2]!),
    database: m[5],
  });
  try {
    const [rows] = await conn.query(
      'SELECT TABLE_NAME AS t FROM information_schema.COLUMNS ' +
        "WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'companyId' AND TABLE_NAME <> 'companies'",
      [m[5]],
    );
    const ids = createdCompanyIds;
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const r of rows as { t: string }[]) {
      await conn.query(`DELETE FROM \`${r.t}\` WHERE companyId IN (?)`, [ids]);
    }
    await conn.query('DELETE FROM companies WHERE id IN (?)', [ids]);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await conn.end();
  }
}

afterAll(async () => {
  if (createdElhIds.length > 0) {
    await db.delete(employeeLeaderHistory).where(inArray(employeeLeaderHistory.id, createdElhIds));
  }
  if (createdEmployeeIds.length > 0) {
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdCLevelIds.length > 0) {
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.id, createdCLevelIds));
  }
  await limparEmpresasDaSuite();
  await closeDbClient(client);
});

// ---------------------------------------------------------------------
// Callers
// ---------------------------------------------------------------------

const callerFactory = createCallerFactory(appRouter);
type Caller = ReturnType<typeof callerFactory>;

async function tokenFor(role: PlatformRole, userId: number, companyId: number): Promise<string> {
  return signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH),
  });
}

async function callerFor(role: PlatformRole, userId: number, companyId: number): Promise<Caller> {
  const bearer = await tokenFor(role, userId, companyId);
  const ctx = createContextInner({ db, rateLimiter: createRateLimiter(), bearerToken: bearer });
  return callerFactory(ctx);
}

function procedure(caller: Caller, path: string): (input: unknown) => Promise<unknown> {
  const fn = path
    .split('.')
    .reduce((acc: unknown, k) => (acc as Record<string, unknown>)[k], caller);
  return fn as (input: unknown) => Promise<unknown>;
}

async function outcome(
  caller: Caller,
  path: string,
  input: unknown,
): Promise<{ readonly kind: string; readonly body: string }> {
  try {
    const res = await procedure(caller, path)(input);
    return { kind: 'ok', body: JSON.stringify(res) ?? '' };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { kind: typeof code === 'string' ? code : 'ERR', body: '' };
  }
}

// ---------------------------------------------------------------------
// Gerador de inputs por introspecção do zod 4
// ---------------------------------------------------------------------

interface ZodDef {
  readonly type: string;
  readonly shape?: Record<string, unknown>;
  readonly innerType?: unknown;
  readonly options?: readonly unknown[];
  readonly element?: unknown;
  readonly entries?: Record<string, unknown>;
  readonly values?: readonly unknown[];
  readonly checks?: readonly unknown[];
  readonly in?: unknown;
}

interface ZodCheckDef {
  readonly check: string;
  readonly minimum?: number;
  readonly inclusive?: boolean;
  readonly pattern?: RegExp;
  readonly format?: string;
}

function defOf(schema: unknown): ZodDef {
  return (schema as { _zod: { def: ZodDef } })._zod.def;
}

function checkDefs(d: ZodDef): readonly ZodCheckDef[] {
  return (d.checks ?? []).map((c) => (c as { _zod: { def: ZodCheckDef } })._zod.def);
}

function generateString(d: ZodDef): string {
  let min = 1;
  for (const cd of checkDefs(d)) {
    const p = cd.pattern?.source ?? '';
    if (p.includes('Q[1-4]') || p.includes('Q[13]')) return '2026-Q1';
    if (p.includes('(0[1-9]|1[0-2])') || p === '^\\d{4}-\\d{2}$') return '2026-01';
    if (p === '^\\d{4}-\\d{2}-\\d{2}$') return '2026-01-15';
    if (p === '^\\d{11}$') return '12345678901';
    if (cd.format === 'email') return 'x@y.com';
    if (cd.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
    if (cd.check === 'min_length' && cd.minimum !== undefined) min = Math.max(min, cd.minimum);
  }
  return 'x'.repeat(Math.min(min, 600));
}

function generateNumber(d: ZodDef): number {
  let v = 1;
  for (const cd of checkDefs(d)) {
    if (cd.check === 'greater_than' && cd.minimum !== undefined) {
      v = Math.max(v, cd.inclusive === true ? cd.minimum : cd.minimum + 1);
    }
  }
  return v;
}

function generate(schema: unknown, key: string, hints: Record<string, unknown>): unknown {
  if (key in hints) return hints[key];
  const d = defOf(schema);
  switch (d.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.shape ?? {})) {
        if (defOf(v).type === 'optional' && !(k in hints)) continue;
        const value = generate(v, k, hints);
        if (value !== undefined) out[k] = value;
      }
      return out;
    }
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
    case 'nonoptional':
      return generate(d.innerType, key, hints);
    case 'pipe':
      return generate(d.in, key, hints);
    case 'number':
      return generateNumber(d);
    case 'string':
      return generateString(d);
    case 'boolean':
      return true;
    case 'literal':
      return (d.values ?? [])[0];
    case 'enum':
      return Object.values(d.entries ?? {})[0];
    case 'array':
      return [generate(d.element, key, hints)];
    case 'union':
      return generate((d.options ?? [])[0], key, hints);
    case 'record':
      return {};
    case 'date':
      return new Date('2026-01-01');
    default:
      return undefined;
  }
}

interface ProcInfo {
  readonly path: string;
  readonly schema: unknown;
  readonly fields: readonly string[];
}

function listProcedures(): readonly ProcInfo[] {
  const procs = (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def
    .procedures;
  const out: ProcInfo[] = [];
  for (const [path, proc] of Object.entries(procs)) {
    const inputs = (proc as { _def: { inputs?: unknown[] } })._def.inputs ?? [];
    const schema = inputs[0];
    const shape = schema === undefined ? {} : (defOf(schema).shape ?? {});
    out.push({ path, schema, fields: Object.keys(shape) });
  }
  return out;
}

/** Procedures públicas/sem alvo — fora da varredura cross-company. */
const FORA_DA_VARREDURA_PREFIXOS = ['auth.', 'health.', 'session.', 'admin.', 'myData.'];

function hintsB(): Record<string, unknown> {
  return {
    companyId: B.company,
    employeeId: B.e1,
    employeeIds: [B.e1],
    cLevelId: B.cl,
    clevelId: undefined,
    liderId: B.l1,
    liderTipo: 'employee',
    newLiderEmployeeId: B.l1,
    liderOriginalId: B.l1,
    candidatoId: B.e1,
    avaliadoId: B.l1,
    contextId: B.e1,
    userId: B.e1,
    titularId: B.e1,
    targetEmployeeId: B.e1,
    id: 1,
    cicloDbId: 1,
    pageSize: 25,
    name: 'Novo Nome',
    cpf: '52998224725',
    oQuePoderiaReter: 'r'.repeat(120),
    motivosSecundarios: [],
    justificativa: 'j'.repeat(120),
    aba: 'lider',
    escopo: 'empresa',
  };
}

/** Marcadores que só existem na empresa B — nunca podem sair para A. */
function marcadoresDaB(): readonly string[] {
  return ['Colab B', 'Lider B', 'Cl B', 'RH B', `"companyId":${B.company}`, 'SEGURANCA_B'];
}

// =====================================================================
// Camada 1 — varredura automática cross-company
// =====================================================================

describe('camada 1 — varredura automática cross-company (appRouter)', () => {
  const procs = listProcedures().filter(
    (p) => !FORA_DA_VARREDURA_PREFIXOS.some((prefixo) => p.path.startsWith(prefixo)),
  );

  it('inventário: o appRouter expõe 100+ procedures e a varredura cobre as com input', () => {
    expect(listProcedures().length).toBeGreaterThanOrEqual(100);
    expect(procs.filter((p) => p.fields.includes('companyId')).length).toBeGreaterThanOrEqual(60);
  });

  const atores: readonly (readonly [string, () => Promise<Caller>])[] = [
    ['RH da empresa A', () => callerFor('rh', A.rh, A.company)],
    ['líder l2 da empresa A', () => callerFor('lider', A.l2, A.company)],
    ['C-level restrito ct1 da empresa A', () => callerFor('clevel', A.ct1, A.company)],
  ];

  for (const [nome, build] of atores) {
    it(`${nome}: nenhuma procedure com companyId da B tem sucesso (cenário B)`, async () => {
      const caller = await build();
      const hints = hintsB();
      const sucessos: string[] = [];
      const geradorIncompleto: string[] = [];
      for (const p of procs) {
        if (!p.fields.includes('companyId')) continue;
        const input = generate(p.schema, '', hints);
        const res = await outcome(caller, p.path, input);
        if (res.kind === 'ok') sucessos.push(p.path);
        if (res.kind === 'BAD_REQUEST' && p.path !== 'leadershipTransfer.execute') {
          geradorIncompleto.push(p.path);
        }
      }
      expect(sucessos).toEqual([]);
      expect(geradorIncompleto).toEqual([]);
    }, 120000);

    it(`${nome}: MIX — companyId próprio nunca devolve dados da B`, async () => {
      const caller = await build();
      const hints = { ...hintsB(), companyId: A.company };
      const vazamentos: string[] = [];
      for (const p of procs) {
        if (p.schema === undefined) continue;
        const input = generate(p.schema, '', hints);
        const res = await outcome(caller, p.path, input);
        if (res.kind !== 'ok') continue;
        if (marcadoresDaB().some((m) => res.body.includes(m))) vazamentos.push(p.path);
      }
      expect(vazamentos).toEqual([]);
    }, 120000);
  }
});

// =====================================================================
// Camada 2 — casos dirigidos S1–S8 + controles positivos
// =====================================================================

describe('camada 2 — S1/S2: IDOR cross-company com companyId próprio', () => {
  it('S1 instrumentC.getAssessment: RH de A com employeeId da B → FORBIDDEN', async () => {
    const rh = await callerFor('rh', A.rh, A.company);
    await expect(
      rh.instrumentC.getAssessment({
        companyId: A.company,
        employeeId: B.e1,
        trimestre: '2026-Q1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('S2 spreadsheets.downloadLeaderTemplate: RH de A com liderId da B → FORBIDDEN', async () => {
    const rh = await callerFor('rh', A.rh, A.company);
    await expect(
      rh.spreadsheets.downloadLeaderTemplate({
        companyId: A.company,
        mes: '2026-01',
        liderId: B.l1,
        liderTipo: 'employee',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('controle: RH de A baixa o template de líder da própria empresa', async () => {
    const rh = await callerFor('rh', A.rh, A.company);
    const res = await rh.spreadsheets.downloadLeaderTemplate({
      companyId: A.company,
      mes: '2026-01',
      liderId: A.l2,
      liderTipo: 'employee',
    });
    expect(res.filename).toContain('LIDER_DOIS_A');
  });
});

describe('camada 2 — S3/S4/S5/S6: líder não sobe a cadeia nem vê cadeia irmã', () => {
  it('escopo resolvido de l2 é só a cadeia descendente (e1)', async () => {
    const scope = await resolveCadeiaScope(db, {
      role: 'lider',
      userId: A.l2,
      companyId: A.company,
    });
    expect(scope).toEqual(new Set([`employee-${A.e1}`]));
  });

  it('S3 getAssessment: l2 sobre l1 (chefe) e e2 → FORBIDDEN; e1 → OK', async () => {
    const l2 = await callerFor('lider', A.l2, A.company);
    for (const alvo of [A.l1, A.e2]) {
      await expect(
        l2.instrumentC.getAssessment({
          companyId: A.company,
          employeeId: alvo,
          trimestre: '2026-Q1',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    const ok = await l2.instrumentC.getAssessment({
      companyId: A.company,
      employeeId: A.e1,
      trimestre: '2026-Q1',
    });
    expect(ok.employeeId).toBe(A.e1);
  });

  it('S4 iql.getIQLData: l2 sobre o chefe l1 e sobre l3 → FORBIDDEN', async () => {
    const l2 = await callerFor('lider', A.l2, A.company);
    for (const alvo of [A.l1, A.l3]) {
      await expect(
        l2.iql.getIQLData({
          companyId: A.company,
          trimestre: '2026-Q1',
          avaliadoTipo: 'employee',
          avaliadoId: alvo,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('S5 dashboard/plenitude/nineBox: l2 sobre l1 e e2 → FORBIDDEN', async () => {
    const l2 = await callerFor('lider', A.l2, A.company);
    for (const alvo of [A.l1, A.e2]) {
      await expect(l2.dashboard.getEmployeeDashboard({ employeeId: alvo })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        l2.plenitude.getPlenitudeData({
          companyId: A.company,
          employeeId: alvo,
          trimestre: '2026-Q1',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        l2.nineBox.getNineBoxTrajectory({ companyId: A.company, employeeId: alvo }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('S6 aiChat.getHistory: l2 sobre e2 → FORBIDDEN; sobre e1 → OK', async () => {
    const l2 = await callerFor('lider', A.l2, A.company);
    await expect(
      l2.aiChat.getHistory({ dashboardLevel: 'individual', contextId: A.e2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ok = await l2.aiChat.getHistory({ dashboardLevel: 'individual', contextId: A.e1 });
    expect(Array.isArray(ok.messages)).toBe(true);
  });
});

describe('camada 2 — S5/S6/S7: C-level restrito não sai da própria cadeia', () => {
  it('escopo resolvido de ct1 é a cadeia l1 → l2 → e1', async () => {
    const scope = await resolveCadeiaScope(db, {
      role: 'clevel',
      userId: A.ct1,
      companyId: A.company,
    });
    expect(scope).toEqual(new Set([`employee-${A.l1}`, `employee-${A.l2}`, `employee-${A.e1}`]));
  });

  it('S5 ct1 sobre e2 (cadeia irmã) → FORBIDDEN em 6 procedures; sobre l1 → OK', async () => {
    const ct1 = await callerFor('clevel', A.ct1, A.company);
    const cid = A.company;
    await expect(
      ct1.instrumentC.getAssessment({ companyId: cid, employeeId: A.e2, trimestre: '2026-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.plenitude.getPlenitudeData({ companyId: cid, employeeId: A.e2, trimestre: '2026-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.nineBox.getNineBoxSnapshot({
        mode: 'employee',
        companyId: cid,
        employeeId: A.e2,
        trimestre: '2026-Q1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.nineBox.getNineBoxTrajectory({ companyId: cid, employeeId: A.e2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.individualProfile.getReport({ companyId: cid, userType: 'employee', userId: A.e2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.quarterlyCalculation.getQuarterlyResults({ employeeId: A.e2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ok = await ct1.dashboard.getEmployeeDashboard({ employeeId: A.l1 });
    expect(ok.employee.id).toBe(A.l1);
  });

  it('S4 iql.getIQLData: ct1 sobre l3 (cadeia irmã) → FORBIDDEN', async () => {
    const ct1 = await callerFor('clevel', A.ct1, A.company);
    await expect(
      ct1.iql.getIQLData({
        companyId: A.company,
        trimestre: '2026-Q1',
        avaliadoTipo: 'employee',
        avaliadoId: A.l3,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('S6 aiChat.getHistory: ct1 sobre e2 → FORBIDDEN', async () => {
    const ct1 = await callerFor('clevel', A.ct1, A.company);
    await expect(
      ct1.aiChat.getHistory({ dashboardLevel: 'individual', contextId: A.e2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('S7 agregados da empresa: ct1 → FORBIDDEN em 5 procedures', async () => {
    const ct1 = await callerFor('clevel', A.ct1, A.company);
    const cid = A.company;
    await expect(
      ct1.turnover.getByCompany({ companyId: cid, trimestre: '2026-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.turnover.getByDepartamento({
        companyId: cid,
        departamento: 'Comercial',
        trimestre: '2026-Q1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.economicDiagnosis.getCompanyDiagnosis({ companyId: cid, trimestre: '2026-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      ct1.economicDiagnosis.getDiagnosisHistory({ companyId: cid }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      ct1.quarterlyCalculation.getCompanyQuarterlyStatus({ companyId: cid, trimestre: '2026-Q1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('controle: ct2 (total) alcança e1 e os agregados da empresa', async () => {
    const ct2 = await callerFor('clevel', A.ct2, A.company);
    const dash = await ct2.dashboard.getEmployeeDashboard({ employeeId: A.e1 });
    expect(dash.employee.id).toBe(A.e1);
    const turnover = await ct2.turnover.getByCompany({
      companyId: A.company,
      trimestre: '2026-Q1',
    });
    expect(turnover.companyId).toBe(A.company);
    const status = await ct2.quarterlyCalculation.getCompanyQuarterlyStatus({
      companyId: A.company,
      trimestre: '2026-Q1',
    });
    expect(status.companyId).toBe(A.company);
  });

  it('controle: RH de A continua com escopo total sobre a própria empresa', async () => {
    const rh = await callerFor('rh', A.rh, A.company);
    const dash = await rh.dashboard.getEmployeeDashboard({ employeeId: A.e2 });
    expect(dash.employee.id).toBe(A.e2);
    const hist = await rh.economicDiagnosis.getDiagnosisHistory({ companyId: A.company });
    expect(hist.companyId).toBe(A.company);
  });
});

describe('camada 2 — S8: faturamento mensal só para o Responsável financeiro', () => {
  it('líder l2 e C-level restrito ct1 sem RF → FORBIDDEN; RH sem RF → FORBIDDEN', async () => {
    const atores = [
      await callerFor('lider', A.l2, A.company),
      await callerFor('clevel', A.ct1, A.company),
      await callerFor('rh', A.rh, A.company),
    ];
    for (const caller of atores) {
      await expect(
        caller.revenue.getFaturamento({ companyId: A.company, mes: '2026-01' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});

// =====================================================================
// Camada 3 — middleware: acesso direto por URL nas rotas antes fora da matriz
// =====================================================================

describe('camada 3 — middleware barra acesso direto por URL', () => {
  function makeRequest(pathname: string, cookieValue?: string): NextRequest {
    const url = new URL(`http://localhost${pathname}`);
    const headers = new Headers();
    if (cookieValue !== undefined) headers.set('cookie', `session=${cookieValue}`);
    return new NextRequest(url, { headers });
  }

  it('/colaborador/7/editar sem cookie → redirect para /', async () => {
    const res = await middleware(makeRequest('/colaborador/7/editar'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/');
  });

  it('/colaborador/7/editar e /desligamento com token de líder → access-denied', async () => {
    const token = await tokenFor('lider', A.l2, A.company);
    for (const path of ['/colaborador/7/editar', '/colaborador/7/desligamento']) {
      const res = await middleware(makeRequest(path, token));
      expect(res.headers.get('x-middleware-rewrite') ?? '').toContain('/access-denied');
    }
  });

  it('/dashboard-individual/clevel/3 e /super-admin/logs com RH → access-denied', async () => {
    const token = await tokenFor('rh', A.rh, A.company);
    for (const path of ['/dashboard-individual/clevel/3', '/super-admin/logs']) {
      const res = await middleware(makeRequest(path, token));
      expect(res.headers.get('x-middleware-rewrite') ?? '').toContain('/access-denied');
    }
  });

  it('/dashboard-recorte/... e /meu-portal/radar-nr1 com líder → allow', async () => {
    const token = await tokenFor('lider', A.l2, A.company);
    for (const path of ['/dashboard-recorte/departamento/Comercial', '/meu-portal/radar-nr1']) {
      const res = await middleware(makeRequest(path, token));
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBe(200);
    }
  });
});
