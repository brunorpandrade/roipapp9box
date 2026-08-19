// ROIP APP 9BOX — server actions canonicas da rota base RH
// `/central-relatorios` (ME-B9-CR).
//
// Pareada canonicamente com a rota Super Admin
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` (ME-079a) no
// padrao dual-route L123 canonizado em ME-084. Todas as 6 actions
// desta rota:
//   - Usam `requireRHOrSuperAdmin` (ME-084) como guard canonico
//     (aceita `session.kind === 'super_admin'` OU
//     `session.kind === 'platform'` com `role IN {'rh', 'rh_lider'}`).
//   - Derivam `companyId` de `session.companyId` para RH/RH-Lider
//     (D-CR-4 aprovada — client sempre passa `companyId` mas o valor
//     efetivo e o do JWT quando o guard resolve para branch `platform`).
//   - `startReportDownloadTokenRHAction` +
//     `startExecutiveReportDownloadTokenRHAction` emitem token com
//     `userType='employee'` (RH) ou `'super_admin'` (Bruno), preservando
//     bit-exact a semantica canonica de `signPdfEphemeralToken`.
//
// Defense-in-depth §2.4: o router `exports` aplica `assertCompanyScope`
// (ME-B9-SEC) em todas as 6 procedures — mesmo que o RH tente passar
// `companyId` cross-company via manipulacao do client, o backend rejeita
// com FORBIDDEN antes de qualquer leitura.
//
// Consumidas por `page.tsx` desta mesma rota, injetadas via prop
// `actions` no `RelatoriosClient` compartilhado (D-CR-5 aprovada).
//
// **RV-13.** Todas as 6 actions consumidas pelo `RelatoriosClient` via
// prop injetada.
// **RV-12.** Zero SQL cru — services + Drizzle tipado.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../db/client';
import { employees, monthlyClosureStatus } from '../../db/schema';
import { requireRHOrSuperAdmin } from '../../lib/routes/requireRHOrSuperAdmin';
import { signPdfEphemeralToken } from '../../server/auth/pdfEphemeralToken';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createExportsRouter, deriveResourceIdCanonicoEscopo } from '../../server/routers/exports';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { resolveDatabaseUrl } from './internals';

import type {
  ActionResult,
  ClosedQuarter,
  GenerateRelatorioExecutivoResult,
  LeaderOption,
  NivelEscopo,
} from '../../components/central-relatorios/internals';

// -----------------------------------------------------------------------
// Instancias module-level (S366)
// -----------------------------------------------------------------------

const exportsRouter = createExportsRouter();
const createExportsCaller = createCallerFactory(exportsRouter);
const actionRateLimiter = createRateLimiter();

// -----------------------------------------------------------------------
// Helpers locais (CC068)
// -----------------------------------------------------------------------

const SESSION_COOKIE = 'session';

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

/**
 * Resolve `companyId` efetivo a partir do escopo canonico da sessao.
 * Para RH/RH-Lider (`kind='platform'`): retorna `session.companyId` bit-
 * exact (D-CR-4). Para Super Admin: retorna o `input.companyId` (Bruno
 * atravessa empresas explicitamente). Combinado com o guard §2.4 do
 * router `exports` (ME-B9-SEC), o RH nao consegue extrair dados de
 * outra empresa mesmo se manipular `companyId` no client.
 */
function resolveEffectiveCompanyId(
  session: ReturnType<typeof requireRHOrSuperAdmin>,
  inputCompanyId: number,
): number {
  if (session.kind === 'platform') {
    return session.companyId;
  }
  return inputCompanyId;
}

/**
 * Resolve `userType` do token efemero conforme perfil da sessao (D-CR-4).
 * `signPdfEphemeralToken` aceita canonicamente apenas
 * `'super_admin' | 'employee'` — RH cai em `'employee'`.
 */
function resolveTokenUserType(
  session: ReturnType<typeof requireRHOrSuperAdmin>,
): 'super_admin' | 'employee' {
  return session.kind === 'super_admin' ? 'super_admin' : 'employee';
}

/** Resolve `userId` do agente (auditoria — nunca autorizacao). */
function resolveTokenUserId(session: ReturnType<typeof requireRHOrSuperAdmin>): number {
  return session.kind === 'super_admin' ? session.superAdminId : session.userId;
}

// -----------------------------------------------------------------------
// 1. Listar trimestres fechados (§12.6)
// -----------------------------------------------------------------------

export async function listClosedQuartersRHAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<ClosedQuarter[]>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'listClosedQuartersRHAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({ mes: monthlyClosureStatus.mes })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, companyId),
          eq(monthlyClosureStatus.status, 'fechado'),
        ),
      )
      .orderBy(asc(monthlyClosureStatus.mes));

    const mesSet = new Set(rows.map((r) => r.mes));
    const trimestreMap = new Map<string, number>();
    for (const m of mesSet) {
      const [yearStr, monthStr] = m.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const q = Math.ceil(month / 3);
      const tri = `${year}-Q${q}`;
      trimestreMap.set(tri, (trimestreMap.get(tri) ?? 0) + 1);
    }

    const closed: ClosedQuarter[] = [];
    for (const [tri, count] of trimestreMap.entries()) {
      if (count >= 3) {
        const match = /^(\d{4})-Q(\d)$/.exec(tri);
        const label = match !== null ? `${match[2]}º trimestre de ${match[1]}` : tri;
        closed.push({ trimestre: tri, label });
      }
    }
    closed.sort((a, b) => b.trimestre.localeCompare(a.trimestre));
    return { ok: true, data: closed };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 2. Listar departamentos (§12.5 dropdown 2)
// -----------------------------------------------------------------------

export async function listDepartmentsRHAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<string[]>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'listDepartmentsRHAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .selectDistinct({ departamento: employees.departamento })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, 'ativo')))
      .orderBy(asc(employees.departamento));
    return { ok: true, data: rows.map((r) => r.departamento) };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 3. Listar lideres ativos (§12.5 dropdown 2 quando Nivel=Equipe)
// -----------------------------------------------------------------------

export async function listLeadersRHAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<LeaderOption[]>> {
  const session = requireRHOrSuperAdmin(await getServerSession(), 'listLeadersRHAction');
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({
        id: employees.id,
        name: employees.name,
        departamento: employees.departamento,
      })
      .from(employees)
      .where(
        and(
          eq(employees.companyId, companyId),
          eq(employees.status, 'ativo'),
          eq(employees.isLider, true),
        ),
      )
      .orderBy(asc(employees.name));

    const leaders: LeaderOption[] = rows.map((r) => ({
      id: r.id,
      tipo: 'employee' as const,
      name: r.name,
      departamento: r.departamento,
    }));
    return { ok: true, data: leaders };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 4. Gerar relatorio executivo (§11 + §13.11)
// -----------------------------------------------------------------------

export async function generateRelatorioExecutivoRHAction(input: {
  readonly companyId: number;
  readonly trimestre: string;
  readonly escopoTipo: NivelEscopo;
  readonly escopoReferencia?: string;
}): Promise<ActionResult<GenerateRelatorioExecutivoResult>> {
  const session = requireRHOrSuperAdmin(
    await getServerSession(),
    'generateRelatorioExecutivoRHAction',
  );
  const companyId = resolveEffectiveCompanyId(session, input.companyId);
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createExportsCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.generateRelatorioExecutivo({
      companyId,
      trimestre: input.trimestre,
      escopoTipo: input.escopoTipo,
      escopoReferencia: input.escopoReferencia,
    });
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 5. Start report download token (snapshot_9box / board_deck)
// -----------------------------------------------------------------------
//
// Nota canonica D-CR-3: `board_deck` e roleProcedure(['super_admin',
// 'clevel']) — nao aceita RH. Client compartilhado esconde o card em
// `variant='rh'`; esta action recebe `scope='board_deck'` apenas quando
// Bruno estiver logado (super_admin), caso contrario e `snapshot_9box`.
// Defense-in-depth §2.4 no router garante FORBIDDEN se manipulado.

export async function startReportDownloadTokenRHAction(input: {
  readonly companyId: number;
  readonly scope: 'snapshot_9box' | 'board_deck';
  readonly escopoTipo: NivelEscopo;
  readonly escopoReferencia?: string;
}): Promise<ActionResult<{ token: string; downloadUrl: string }>> {
  const session = requireRHOrSuperAdmin(
    await getServerSession(),
    'startReportDownloadTokenRHAction',
  );
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  try {
    const resourceId = deriveResourceIdCanonicoEscopo(
      companyId,
      input.escopoTipo,
      input.escopoReferencia ?? null,
    );
    const now = new Date();
    const token = await signPdfEphemeralToken(
      {
        scope: input.scope,
        companyId,
        resourceId,
        userId: resolveTokenUserId(session),
        userType: resolveTokenUserType(session),
      },
      now,
    );

    const basePath =
      input.scope === 'snapshot_9box'
        ? '/api/reports/snapshot-9box/download'
        : '/api/reports/board-deck/download';
    const qsParts = [`token=${encodeURIComponent(token)}`, `escopoTipo=${input.escopoTipo}`];
    if (input.escopoTipo !== 'empresa' && input.escopoReferencia !== undefined) {
      qsParts.push(`escopoReferencia=${encodeURIComponent(input.escopoReferencia)}`);
    }
    qsParts.push('trimestre=');
    const qs = qsParts.join('&');
    const downloadUrl = `${basePath}?${qs}`;

    return { ok: true, data: { token, downloadUrl } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar token.';
    return { ok: false, message: msg };
  }
}

// -----------------------------------------------------------------------
// 6. Start executive report download token
// -----------------------------------------------------------------------

export async function startExecutiveReportDownloadTokenRHAction(input: {
  readonly companyId: number;
  readonly cacheId: number;
}): Promise<ActionResult<{ token: string; downloadUrl: string }>> {
  const session = requireRHOrSuperAdmin(
    await getServerSession(),
    'startExecutiveReportDownloadTokenRHAction',
  );
  const companyId = resolveEffectiveCompanyId(session, input.companyId);

  try {
    const now = new Date();
    const token = await signPdfEphemeralToken(
      {
        scope: 'executive_report',
        companyId,
        resourceId: input.cacheId,
        userId: resolveTokenUserId(session),
        userType: resolveTokenUserType(session),
      },
      now,
    );
    const downloadUrl = `/api/reports/executive/download?token=${encodeURIComponent(token)}`;
    return { ok: true, data: { token, downloadUrl } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar token.';
    return { ok: false, message: msg };
  }
}
