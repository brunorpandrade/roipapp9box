// ROIP APP 9BOX — server actions canônicas da rota Bruno
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` (§12, ME-079a).
//
// Pattern S315 + `createCallerFactory` (ME-078b-refactor). 4 actions:
// listar trimestres fechados, listar departamentos, listar líderes,
// gerar relatório executivo. Downloads (xlsx/PDF) usam Route Handlers
// existentes (`/api/reports/*`) — o client redireciona direto.
//
// **RV-13.** Todas consumidas por `RelatoriosClient.tsx`.
// **RV-12.** Zero SQL cru — services + Drizzle tipado.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { employees, monthlyClosureStatus } from '../../../../../db/schema';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';
import { createExportsRouter } from '../../../../../server/routers/exports';
import { getServerSession } from '../../../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instâncias module-level (S366)
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

async function requireSuperAdmin(actionName: string): Promise<void> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin`);
  }
}

// -----------------------------------------------------------------------
// Contrato
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// 1. Listar trimestres fechados (§12.6)
// -----------------------------------------------------------------------

export interface ClosedQuarter {
  readonly trimestre: string;
  readonly label: string;
}

export async function listClosedQuartersAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<ClosedQuarter[]>> {
  await requireSuperAdmin('listClosedQuartersAction');

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // Trimestres com todos os 3 meses fechados.
    const rows = await client.db
      .select({
        mes: monthlyClosureStatus.mes,
      })
      .from(monthlyClosureStatus)
      .where(
        and(
          eq(monthlyClosureStatus.companyId, input.companyId),
          eq(monthlyClosureStatus.status, 'fechado'),
        ),
      )
      .orderBy(asc(monthlyClosureStatus.mes));

    // Agrupar meses em trimestres e verificar se todos 3
    // meses do trimestre estão fechados.
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

    // Ordem decrescente, mais recente primeiro.
    closed.sort((a, b) => b.trimestre.localeCompare(a.trimestre));
    return { ok: true, data: closed };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 2. Listar departamentos (§12.5 dropdown 2)
// -----------------------------------------------------------------------

export async function listDepartmentsAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<string[]>> {
  await requireSuperAdmin('listDepartmentsAction');

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .selectDistinct({ departamento: employees.departamento })
      .from(employees)
      .where(and(eq(employees.companyId, input.companyId), eq(employees.status, 'ativo')))
      .orderBy(asc(employees.departamento));

    return {
      ok: true,
      data: rows.map((r) => r.departamento),
    };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 3. Listar líderes ativos (§12.5 dropdown 2 quando Nível=Equipe)
// -----------------------------------------------------------------------

export interface LeaderOption {
  readonly id: number;
  readonly tipo: 'employee' | 'clevel';
  readonly name: string;
  readonly departamento: string;
}

export async function listLeadersAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<LeaderOption[]>> {
  await requireSuperAdmin('listLeadersAction');

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
          eq(employees.companyId, input.companyId),
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
// 4. Gerar relatório executivo (§11 + §13.11 — enfileira job assíncrono)
// -----------------------------------------------------------------------

export async function generateRelatorioExecutivoAction(input: {
  readonly companyId: number;
  readonly trimestre: string;
  readonly escopoTipo: 'empresa' | 'departamento' | 'equipe';
  readonly escopoReferencia?: string;
}): Promise<ActionResult<{ status: string }>> {
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
      companyId: input.companyId,
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
// 5. Start report download token (D098-2 fix, ME-079b L113)
// -----------------------------------------------------------------------

import { signPdfEphemeralToken } from '../../../../../server/auth/pdfEphemeralToken';
import { deriveResourceIdCanonicoEscopo } from '../../../../../server/routers/exports';

export async function startReportDownloadTokenAction(input: {
  readonly companyId: number;
  readonly scope: 'snapshot_9box' | 'board_deck';
  readonly escopoTipo: 'empresa' | 'departamento' | 'equipe';
  readonly escopoReferencia?: string;
}): Promise<ActionResult<{ token: string; downloadUrl: string }>> {
  const session = await getServerSession();
  if (session === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }
  if (session.kind !== 'super_admin') {
    return { ok: false, message: 'Acesso restrito ao Super Admin.' };
  }

  try {
    const resourceId = deriveResourceIdCanonicoEscopo(
      input.companyId,
      input.escopoTipo,
      input.escopoReferencia ?? null,
    );
    const now = new Date();
    const token = await signPdfEphemeralToken(
      {
        scope: input.scope,
        companyId: input.companyId,
        resourceId,
        userId: session.superAdminId,
        userType: 'super_admin',
      },
      now,
    );

    const basePath =
      input.scope === 'snapshot_9box'
        ? '/api/reports/snapshot-9box/download'
        : '/api/reports/board-deck/download';
    const qs = [
      `token=${encodeURIComponent(token)}`,
      `escopoTipo=${input.escopoTipo}`,
      'trimestre=',
    ].join('&');
    const downloadUrl = `${basePath}?${qs}`;

    return { ok: true, data: { token, downloadUrl } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar token.';
    return { ok: false, message: msg };
  }
}
