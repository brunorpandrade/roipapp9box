// ROIP APP 9BOX — server actions canonicas da rota `/cycle-management`
// (ME-B9.1 §14.18).
//
// Padrao canonico L123 (dual-route) + CallerFactory (ME-084/086b):
//   - `requireRHOrSuperAdmin` guard no topo.
//   - `createCallerFactory` para delegar as procs via router.
//   - CompanyId derivado de `session.companyId` (platform) ou do input
//     canonico `companyId` quando super_admin atravessa.
//
// Actions canonicas desta ME (7):
//   1. `listCycleScheduleAction` — Area 2 da tela §14.18 (paginada).
//   2. `listPendingUnlockRequestsAction` — Area 3 Pendentes §14.18.
//   3. `listHistoricoUnlockRequestsAction` — Area 3 Historico §14.18.
//   4. `listCalendarioAction` — Area 1 §14.18.
//   5. `cancelUnlockRequestAction` — botao [Cancelar] (§14.18 bloco
//      Pendentes, linha do proprio solicitante — delega a
//      `cycleUnlockRequests.cancel`).
//   6. `criarSolicitacaoDesbloqueioAction` — delega a
//      `cycleUnlockRequests.create` (botao [+ Nova solicitacao] da
//      Area 3; modal `ModalSolicitarDesbloqueio` canonicamente reusado).
//   7. `listMesesFechadosAction` — alimenta o `<select>` de meses do
//      modal (reuso L125 do padrao canonico ME-086b).
//
// **RV-12.** Zero SQL cru — services + Drizzle tipado ou procs tRPC.
// **RV-13.** Todas as 7 actions consumidas por `page.tsx` (injetadas via
// prop `actions` em `CycleManagementClient`).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../db/client';
import { monthlyClosureStatus } from '../../db/schema';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { requireRHOrSuperAdmin } from '../../lib/routes/requireRHOrSuperAdmin';
import { createRateLimiter } from '../../server/auth/rateLimit';
import {
  createCycleUnlockRequestsRouter,
  NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
} from '../../server/routers/cycleUnlockRequests';
import {
  createCycleManagementListingsRouter,
  type CycleSchedulePageOut,
  type CycleScheduleRowOut,
  type UnlockRequestWithNames,
} from '../../server/routers/cycleManagementListings';
import { listActiveLeadersAndClevelsByCompany } from '../../server/services/employees';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import type { CycleScheduleFilters } from './filters';
import {
  type CalendarioEvento,
  type CycleActionResult,
  type CycleSchedulePage,
  type UnlockRequestRow,
  errResult,
  okResult,
} from './internals';
import {
  mesesDoTrimestre,
  nextTrimestre,
  resolveCalendarioEventos,
  resolveTrimestre,
} from './calendarioHelpers';

// -----------------------------------------------------------------------
// Instancias module-level canonicas (padrao S366)
// -----------------------------------------------------------------------

const listingsRouter = createCycleManagementListingsRouter();
const createListingsCaller = createCallerFactory(listingsRouter);

const cycleUnlockRequestsRouter = createCycleUnlockRequestsRouter({
  evaluateAdminAlertsFactory: NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS_FACTORY,
});
const createCycleUnlockCaller = createCallerFactory(cycleUnlockRequestsRouter);

const actionRateLimiter = createRateLimiter();

const SESSION_COOKIE = 'session';

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

/**
 * Resolve `companyId` efetivo:
 *   - rh / rh_lider → session.companyId (ignora override).
 *   - super_admin → companyIdOverride obrigatorio.
 */
function resolveEffectiveCompanyId(
  session: ReturnType<typeof requireRHOrSuperAdmin>,
  companyIdOverride: number | undefined,
): number {
  if (session.kind === 'platform') {
    return session.companyId;
  }
  if (companyIdOverride === undefined || companyIdOverride <= 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'companyId obrigatório para Super Admin.',
    });
  }
  return companyIdOverride;
}

// -----------------------------------------------------------------------
// Mapeadores de view-model
// -----------------------------------------------------------------------

function mapUnlockRow(r: UnlockRequestWithNames): UnlockRequestRow {
  return {
    id: r.id,
    companyId: r.companyId,
    mes: r.mes,
    aba: r.aba,
    liderId: r.liderId,
    liderTipo: r.liderTipo,
    liderNome: r.liderNome,
    solicitanteTipo: r.solicitanteTipo,
    solicitanteId: r.solicitanteId,
    solicitanteNome: r.solicitanteNome,
    justificativa: r.justificativa,
    status: r.status,
    decididoPor: r.decididoPor,
    decididoPorNome: r.decididoPorNome,
    decididoEm: r.decididoEm,
    motivoRecusa: r.motivoRecusa,
    comentarioAprovacao: r.comentarioAprovacao,
    createdAt: r.createdAt,
  };
}

function mapCyclePage(p: CycleSchedulePageOut): CycleSchedulePage {
  const rows: readonly CycleSchedulePage['rows'][number][] = p.rows.map(
    (r: CycleScheduleRowOut) => ({
      id: r.id,
      tipoCiclo: r.tipoCiclo,
      cicloReferencia: r.cicloReferencia,
      dataAbertura: r.dataAbertura,
      dataCorte: r.dataCorte,
      dataFechamento: r.dataFechamento,
      status: r.status,
      totalElegiveis: r.totalElegiveis,
      totalRespondidos: r.totalRespondidos,
    }),
  );
  return { rows, total: p.total, page: p.page, pageSize: p.pageSize };
}

// =======================================================================
// Action 1 — listCycleScheduleAction (Area 2)
// =======================================================================

interface ListCycleScheduleInput {
  readonly filters: CycleScheduleFilters;
  readonly companyIdOverride?: number;
}

export async function listCycleScheduleAction(
  input: ListCycleScheduleInput,
): Promise<CycleActionResult<CycleSchedulePage>> {
  try {
    const session = requireRHOrSuperAdmin(await getServerSession(), 'listCycleSchedule');
    const companyId = resolveEffectiveCompanyId(session, input.companyIdOverride);
    const token = await resolveRawToken();
    if (token === null) {
      return errResult('Sessão ausente ou expirada.');
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const caller = createListingsCaller(
        createContextInner({ db: client.db, rateLimiter: actionRateLimiter, bearerToken: token }),
      );
      const cicloReferenciaInReadonly = buildCicloRefIn(input.filters);
      const cicloReferenciaIn =
        cicloReferenciaInReadonly === null ? null : [...cicloReferenciaInReadonly];
      const page = await caller.listCycleScheduleByCompany({
        companyId,
        tipoCiclo: input.filters.tipoCiclo,
        status: input.filters.status,
        cicloReferenciaIn,
        page: input.filters.page,
        pageSize: input.filters.pageSize,
      });
      return okResult(mapCyclePage(page));
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 2 — listPendingUnlockRequestsAction
// =======================================================================

interface ListPendingInput {
  readonly companyIdOverride?: number;
}

export async function listPendingUnlockRequestsAction(
  input: ListPendingInput,
): Promise<CycleActionResult<readonly UnlockRequestRow[]>> {
  try {
    const session = requireRHOrSuperAdmin(await getServerSession(), 'listPendingUnlockRequests');
    const companyId = resolveEffectiveCompanyId(session, input.companyIdOverride);
    const token = await resolveRawToken();
    if (token === null) {
      return errResult('Sessão ausente ou expirada.');
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const caller = createListingsCaller(
        createContextInner({ db: client.db, rateLimiter: actionRateLimiter, bearerToken: token }),
      );
      const rows = await caller.listPendingUnlockByCompany({ companyId });
      return okResult(rows.map(mapUnlockRow));
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 3 — listHistoricoUnlockRequestsAction
// =======================================================================

interface ListHistoricoInput {
  readonly companyIdOverride?: number;
  readonly dias?: number;
}

export async function listHistoricoUnlockRequestsAction(
  input: ListHistoricoInput,
): Promise<CycleActionResult<readonly UnlockRequestRow[]>> {
  try {
    const session = requireRHOrSuperAdmin(await getServerSession(), 'listHistoricoUnlockRequests');
    const companyId = resolveEffectiveCompanyId(session, input.companyIdOverride);
    const token = await resolveRawToken();
    if (token === null) {
      return errResult('Sessão ausente ou expirada.');
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const caller = createListingsCaller(
        createContextInner({ db: client.db, rateLimiter: actionRateLimiter, bearerToken: token }),
      );
      const rows = await caller.listHistoricoUnlockByCompany({
        companyId,
        dias: input.dias,
      });
      return okResult(rows.map(mapUnlockRow));
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 4 — listCalendarioAction
// =======================================================================

interface ListCalendarioInput {
  readonly companyIdOverride?: number;
}

export async function listCalendarioAction(
  input: ListCalendarioInput,
): Promise<CycleActionResult<readonly CalendarioEvento[]>> {
  try {
    const session = requireRHOrSuperAdmin(await getServerSession(), 'listCalendario');
    const companyId = resolveEffectiveCompanyId(session, input.companyIdOverride);
    const token = await resolveRawToken();
    if (token === null) {
      return errResult('Sessão ausente ou expirada.');
    }

    const now = new Date();
    const tAtual = resolveTrimestre(now);
    const tProximo = nextTrimestre(tAtual);
    const refs: string[] = [
      `${tAtual.ano}-Q${tAtual.numero}`,
      `${tProximo.ano}-Q${tProximo.numero}`,
      ...mesesDoTrimestre(tAtual),
      ...mesesDoTrimestre(tProximo),
    ];

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const caller = createListingsCaller(
        createContextInner({ db: client.db, rateLimiter: actionRateLimiter, bearerToken: token }),
      );
      const rows = await caller.listCalendarioByCompany({ companyId, cicloReferenciaIn: refs });
      const eventos = resolveCalendarioEventos(
        rows.map((r) => ({
          id: r.id,
          tipoCiclo: r.tipoCiclo,
          cicloReferencia: r.cicloReferencia,
          dataAbertura: r.dataAbertura,
          dataCorte: r.dataCorte,
          dataFechamento: r.dataFechamento,
          status: r.status,
          totalElegiveis: r.totalElegiveis,
          totalRespondidos: r.totalRespondidos,
        })),
        now,
      );
      return okResult(eventos);
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 5 — cancelUnlockRequestAction
// =======================================================================

interface CancelInput {
  readonly id: number;
}

export async function cancelUnlockRequestAction(
  input: CancelInput,
): Promise<CycleActionResult<{ readonly id: number }>> {
  try {
    requireRHOrSuperAdmin(await getServerSession(), 'cancelUnlockRequest');
    const token = await resolveRawToken();
    if (token === null) {
      return errResult('Sessão ausente ou expirada.');
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const caller = createCycleUnlockCaller(
        createContextInner({ db: client.db, rateLimiter: actionRateLimiter, bearerToken: token }),
      );
      const result = await caller.cancel({ id: input.id });
      return okResult({ id: result.id });
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 6 — criarSolicitacaoDesbloqueioAction
// =======================================================================

interface CriarSolicitacaoInput {
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider' | 'faturamento';
  readonly liderId?: number;
  readonly liderTipo?: 'employee' | 'clevel';
  readonly justificativa: string;
}

export async function criarSolicitacaoDesbloqueioAction(
  input: CriarSolicitacaoInput,
): Promise<CycleActionResult<{ readonly id: number }>> {
  try {
    requireRHOrSuperAdmin(await getServerSession(), 'criarSolicitacaoDesbloqueio');
    const token = await resolveRawToken();
    if (token === null) {
      return errResult('Sessão ausente ou expirada.');
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const caller = createCycleUnlockCaller(
        createContextInner({ db: client.db, rateLimiter: actionRateLimiter, bearerToken: token }),
      );
      const result = await caller.create({
        companyId: input.companyId,
        mes: input.mes,
        aba: input.aba,
        liderId: input.liderId,
        liderTipo: input.liderTipo,
        justificativa: input.justificativa,
      });
      return okResult({ id: result.id });
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 7 — listMesesFechadosAction
// =======================================================================

interface MesFechadoOption {
  readonly mes: string;
  readonly label: string;
}

interface ListMesesFechadosInput {
  readonly companyId: number;
}

export async function listMesesFechadosAction(
  input: ListMesesFechadosInput,
): Promise<CycleActionResult<readonly MesFechadoOption[]>> {
  try {
    const session = requireRHOrSuperAdmin(await getServerSession(), 'listMesesFechados');
    if (session.kind === 'platform' && session.companyId !== input.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa fora do escopo.' });
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const rows = await client.db
        .select({ mes: monthlyClosureStatus.mes })
        .from(monthlyClosureStatus)
        .where(
          and(
            eq(monthlyClosureStatus.companyId, input.companyId),
            eq(monthlyClosureStatus.status, 'fechado'),
          ),
        )
        .orderBy(asc(monthlyClosureStatus.mes));

      const result: readonly MesFechadoOption[] = rows.map((r) => ({
        mes: r.mes,
        label: formatMesLabelInline(r.mes),
      }));

      return okResult(result);
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// =======================================================================
// Action 8 — listCompanyLeadersAction (alimenta select de lider do modal)
// =======================================================================

interface LeaderOption {
  readonly id: number;
  readonly name: string;
  readonly tipo: 'employee' | 'clevel';
}

interface ListLeadersInput {
  readonly companyId: number;
}

export async function listCompanyLeadersAction(
  input: ListLeadersInput,
): Promise<CycleActionResult<readonly LeaderOption[]>> {
  try {
    const session = requireRHOrSuperAdmin(await getServerSession(), 'listCompanyLeaders');
    if (session.kind === 'platform' && session.companyId !== input.companyId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa fora do escopo.' });
    }

    const client = createDbClient(resolveDatabaseUrl());
    try {
      const rows = await listActiveLeadersAndClevelsByCompany(client.db, input.companyId);
      return okResult(rows.map((r) => ({ id: r.id, name: r.name, tipo: r.tipo })));
    } finally {
      await closeDbClient(client);
    }
  } catch (e) {
    return errResult(resolveErrorMessage(e));
  }
}

// -----------------------------------------------------------------------
// Helpers privados
// -----------------------------------------------------------------------

function buildCicloRefIn(filters: CycleScheduleFilters): readonly string[] | null {
  if (filters.periodo === 'ultimos_90_dias') {
    return null;
  }
  const now = new Date();
  const tAtual = resolveTrimestre(now);
  if (filters.periodo === 'trimestre_atual') {
    return [`${tAtual.ano}-Q${tAtual.numero}`, ...mesesDoTrimestre(tAtual)];
  }
  const tPrev =
    tAtual.numero === 1
      ? { ano: tAtual.ano - 1, numero: 4 as const }
      : { ano: tAtual.ano, numero: (tAtual.numero - 1) as 1 | 2 | 3 | 4 };
  return [`${tPrev.ano}-Q${tPrev.numero}`, ...mesesDoTrimestre(tPrev)];
}

function formatMesLabelInline(mes: string): string {
  const nomes: readonly string[] = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  const match = mes.match(/^(\d{4})-(\d{2})$/);
  if (match === null) {
    return mes;
  }
  const anoStr = match[1];
  const mesStr = match[2];
  if (anoStr === undefined || mesStr === undefined) {
    return mes;
  }
  const idx = Number.parseInt(mesStr, 10) - 1;
  if (idx < 0 || idx > 11) {
    return mes;
  }
  const nome = nomes[idx];
  if (nome === undefined) {
    return mes;
  }
  return `${nome} de ${anoStr}`;
}

function resolveErrorMessage(e: unknown): string {
  if (e instanceof TRPCError) {
    return e.message;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return 'Erro desconhecido ao executar action.';
}
