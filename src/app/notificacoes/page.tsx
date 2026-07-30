// ROIP APP 9BOX — rota canonica /notificacoes (ME-057a).
//
// Origem canonica:
// - DOC 05 §14.19 (Rota `/notificacoes`) — barra de filtros com 6
//   controles + tabela paginada + selecoes acumuladas + acoes em lote +
//   modais + toasts + 2 estados vazios canonicos.
// - DOC 05 §4.1 (Header) — sino ATIVO (Q1: Bruno + RH) via
//   `showNotificationBell: true`.
// - DOC 05 §5.8 (link `Ver detalhamento` dos paineis Bruno+RH aponta
//   para `/pendencias-portal` — nao para esta rota; sem impacto).
// - DOC 02 §10.5 + §9.7 (matriz — allow Bruno+RH; deny C-level+Lider).
//   O middleware (`middleware.ts`, matrix.ts) ja aplica; este page.tsx
//   faz guard defensivo em profundidade.
// - DOC 01 §12.4 (`notifications` — coluna imutavel em producao; apenas
//   `lidaEm` e `arquivadaEm` mudam via mutations do service ME-017).
// - S299/S313: faixa CNPJ ME-057a principal 10110..10119.
// - Pattern ME-056 reutilizado bit-exact: `getServerSession` →
//   `loadFlagsForSession` → `resolveProfileKey` → `resolveMenuItems` →
//   `<Layout>` com `showNotificationBell: true`.
//
// Contrato canonico:
// - Server component: query inicial da primeira pagina + count total +
//   count de nao lidas (para header). Client component (`Notificacoes
//   Client.tsx`) recebe esses valores como initial state e usa a
//   `listarNotificacoesAction` para re-fetch em mudancas de filtro ou
//   paginacao.
// - Renderiza fallback `AccessDenied` via middleware (rewrite) para
//   C-level e Lider; este page.tsx nunca vira executado por essas
//   roles em condicoes normais. Defense-in-depth com `redirect('/')`
//   para os casos degenerados (session invalida entre middleware e
//   handler).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `NotificacoesListResult`, `NotificacoesListRow`,
//     `loadNotificacoesPage` → `actions.ts` (re-fetch de filtros e
//     paginacao) + `me057a-notificacoes.test.ts` (integration).
//   - default export → runtime Next 15.

import { redirect } from 'next/navigation';
import { and, desc, eq, gte, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../db/client';
import { employees, employeeLeaderHistory, notifications } from '../../db/schema';
import type { NotificationTipo, Severidade } from '../../db/schema/enums';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession, type ServerSession } from '../../server/session/serverSession';

import { NotificacoesClient } from './NotificacoesClient';
import {
  CANONICAL_DEFAULT_FILTERS,
  parseFiltersFromSearchParams,
  resolvePeriodoRange,
  type NotificacoesFilters,
} from './filters';
import { resolveTiposFromCategoria } from './mappings';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Tipos publicos do resultado
// -----------------------------------------------------------------------

/**
 * Linha canonica da tabela renderizada §14.19. Inclui campos necessarios
 * para as 8 colunas (checkbox, data/hora, tipo, severidade, titulo,
 * colaborador, status, acao). `colaboradorNome` derivado do
 * `subtitulo` da notificacao ou de query complementar (fase futura); por
 * ora usa `subtitulo` como fonte canonica quando disponivel.
 */
export interface NotificacoesListRow {
  readonly id: number;
  readonly tipo: NotificationTipo;
  readonly severidade: Severidade;
  readonly titulo: string;
  readonly subtitulo: string | null;
  readonly linkDestino: string | null;
  readonly lidaEm: Date | null;
  readonly arquivadaEm: Date | null;
  readonly createdAt: Date;
}

export interface NotificacoesListResult {
  readonly rows: readonly NotificacoesListRow[];
  readonly totalCount: number;
  readonly unreadCount: number;
  readonly filtersApplied: NotificacoesFilters;
}

// -----------------------------------------------------------------------
// Flags do RH (reutiliza pattern ME-056 painel-rh)
// -----------------------------------------------------------------------

interface RhLikeFlags {
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
}

async function loadFlagsForRhSession(
  db: RoipDatabase,
  userId: number,
): Promise<RhLikeFlags | null> {
  const rows = await db
    .select({
      isRH: employees.isRH,
      isLider: employees.isLider,
      isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
    })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  const chainRows = await db
    .select({ liderId: employees.id })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, userId),
        sql`${employeeLeaderHistory.dataFim} IS NULL`,
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(1);

  return {
    isRH: row.isRH === true,
    isLider: row.isLider === true,
    isResponsavelFinanceiro: row.isResponsavelFinanceiro === true,
    hasDescendingChain: chainRows.length > 0,
  };
}

// -----------------------------------------------------------------------
// Query canonica da lista (server-side, Drizzle tipado)
// -----------------------------------------------------------------------

/**
 * Carrega uma pagina da lista de notificacoes aplicando os filtros
 * canonicos §14.19. Fonte unica de query — invocada tanto pelo server
 * component na renderizacao inicial quanto pela `listarNotificacoesAction`
 * em re-fetches subsequentes (RV-12 100% Drizzle tipado + DRY).
 *
 * Convencao canonica:
 * - `destinatarioTipo` + `destinatarioEmployeeId` sao **guards
 *   obrigatorios** do WHERE (defense-in-depth contra chamadas mal
 *   formadas). Bruno usa (`'bruno'`, NULL); RH usa (`'rh'`, userId).
 * - Filtros construidos como conjuncao de clausulas opcionais. Filtro
 *   ausente = clausula ausente.
 */
export async function loadNotificacoesPage(
  db: RoipDatabase,
  destinatarioTipo: 'bruno' | 'rh',
  destinatarioEmployeeId: number | null,
  filters: NotificacoesFilters,
): Promise<NotificacoesListResult> {
  const now = new Date();
  const periodoRange = resolvePeriodoRange(
    filters.periodo,
    filters.periodoPersonalizadoInicio,
    filters.periodoPersonalizadoFim,
    now,
  );

  // Clausula de destinatario (obrigatoria)
  const destClause =
    destinatarioEmployeeId === null
      ? and(
          eq(notifications.destinatarioTipo, destinatarioTipo),
          isNull(notifications.destinatarioEmployeeId),
        )
      : and(
          eq(notifications.destinatarioTipo, destinatarioTipo),
          eq(notifications.destinatarioEmployeeId, destinatarioEmployeeId),
        );

  // Clausula de categoria (tipo IN [...] quando filtro != 'todos')
  const tiposFiltrados = resolveTiposFromCategoria(filters.categoria);
  const categoriaClause =
    filters.categoria === 'todos'
      ? undefined
      : tiposFiltrados.length === 0
        ? sql`1 = 0` // categoria valida mas sem tipos mapeados (ex: 'plenitude')
        : or(...tiposFiltrados.map((t) => eq(notifications.tipo, t)));

  // Clausula de severidade
  const severidadeClause =
    filters.severidade === 'todas' ? undefined : eq(notifications.severidade, filters.severidade);

  // Clausula de periodo (createdAt range)
  const periodoClause =
    periodoRange === null
      ? filters.periodo === 'personalizado'
        ? sql`1 = 0` // personalizado sem datas validas → vazio canonico
        : undefined
      : and(
          gte(notifications.createdAt, periodoRange.from),
          lt(notifications.createdAt, periodoRange.to),
        );

  // Clausula de status (mapping canonico §14.19 → mappings.ts)
  const statusClause = (() => {
    switch (filters.status) {
      case 'nao_lidas_e_lidas':
        return isNull(notifications.arquivadaEm);
      case 'nao_lidas':
        return and(isNull(notifications.arquivadaEm), isNull(notifications.lidaEm));
      case 'lidas':
        return and(isNull(notifications.arquivadaEm), isNotNull(notifications.lidaEm));
      case 'arquivadas':
        return isNotNull(notifications.arquivadaEm);
      case 'todas':
        return undefined;
    }
  })();

  // Clausula de busca (LIKE em titulo OR subtitulo — sem colaborador
  // dedicado; refactor futuro quando linkage `destinatarioEmployeeId ×
  // employees.nome` estiver populado para busca por nome de colaborador
  // referido, nao destinatario. Nesta ME §14.19 aplicamos LIKE em campos
  // textuais canonicos do notif — cobre uso pratico e mantem WHERE
  // seguro via prepared parameter do Drizzle).
  const searchClause =
    filters.searchColaborador === ''
      ? undefined
      : or(
          like(notifications.titulo, `%${filters.searchColaborador}%`),
          like(notifications.subtitulo, `%${filters.searchColaborador}%`),
        );

  const whereClause = and(
    destClause,
    categoriaClause,
    severidadeClause,
    periodoClause,
    statusClause,
    searchClause,
  );

  const offset = (filters.page - 1) * filters.pageSize;

  const [rowsRaw, totalRow, unreadRow] = await Promise.all([
    db
      .select({
        id: notifications.id,
        tipo: notifications.tipo,
        severidade: notifications.severidade,
        titulo: notifications.titulo,
        subtitulo: notifications.subtitulo,
        linkDestino: notifications.linkDestino,
        lidaEm: notifications.lidaEm,
        arquivadaEm: notifications.arquivadaEm,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(filters.pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(whereClause),
    // unread count SEMPRE ignora filtros de status/periodo/etc — reflete
    // o header canonico "{N} notificacoes · {X} nao lidas". "Nao lidas"
    // canonicamente exclui arquivadas.
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(and(destClause, isNull(notifications.lidaEm), isNull(notifications.arquivadaEm))),
  ]);

  const rows: readonly NotificacoesListRow[] = rowsRaw.map((r) => ({
    id: r.id,
    tipo: r.tipo as NotificationTipo,
    severidade: (r.severidade ?? 'info') as Severidade,
    titulo: r.titulo,
    subtitulo: r.subtitulo,
    linkDestino: r.linkDestino,
    lidaEm: r.lidaEm,
    arquivadaEm: r.arquivadaEm,
    createdAt: r.createdAt ?? new Date(0),
  }));

  return {
    rows,
    totalCount: totalRow[0]?.total ?? 0,
    unreadCount: unreadRow[0]?.total ?? 0,
    filtersApplied: filters,
  };
}

// -----------------------------------------------------------------------
// Guard canonico da rota (defense-in-depth)
// -----------------------------------------------------------------------

interface RouteContext {
  readonly session: ServerSession;
  readonly destinatarioTipo: 'bruno' | 'rh';
  readonly destinatarioEmployeeId: number | null;
}

function resolveRouteContext(session: ServerSession): RouteContext {
  if (session.kind === 'super_admin') {
    return { session, destinatarioTipo: 'bruno', destinatarioEmployeeId: null };
  }
  if (session.role === 'rh' || session.role === 'rh_lider') {
    return { session, destinatarioTipo: 'rh', destinatarioEmployeeId: session.userId };
  }
  // Middleware §10.5 ja bloqueia — este ponto e defense-in-depth para
  // sessao que trocou de role entre middleware e handler (janela minima).
  throw new Error(
    `resolveRouteContext: role ${session.role} nao habilitada em /notificacoes ` +
      '(middleware §10.5 deveria ter bloqueado)',
  );
}

// -----------------------------------------------------------------------
// Rota canonica /notificacoes (§14.19)
// -----------------------------------------------------------------------

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificacoesPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard de matriz §10.5 (defense-in-depth ao middleware)
  if (session.kind === 'platform') {
    if (session.role !== 'rh' && session.role !== 'rh_lider') {
      redirect('/');
    }
  }

  const context = resolveRouteContext(session);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseFiltersFromSearchParams(rawParams);

    // Flags para resolveProfileKey (path de Bruno ignora RH-flags)
    const flags =
      session.kind === 'platform' ? await loadFlagsForRhSession(client.db, session.userId) : null;

    if (session.kind === 'platform' && flags === null) {
      // Registro deletado entre emissao e verificacao — sessao invalida
      redirect('/');
    }

    const profileKey = resolveProfileKey({
      session,
      isRH: flags?.isRH ?? false,
      isLider: flags?.isLider ?? false,
      acessoTotal: false,
      hasDescendingChain: flags?.hasDescendingChain ?? false,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });

    const menuItems = resolveMenuItems(profileKey, flags?.isResponsavelFinanceiro ?? false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const listResult = await loadNotificacoesPage(
      client.db,
      context.destinatarioTipo,
      context.destinatarioEmployeeId,
      filters,
    );

    const headerProps =
      session.kind === 'super_admin'
        ? {
            leftMode: 'super_admin_global' as const,
            user: { displayName: session.displayName },
            showNotificationBell: true,
          }
        : {
            leftMode: 'in_company' as const,
            companyDisplayName: session.companyDisplayName,
            companyLogoUrl: session.companyLogoUrl ?? undefined,
            user: { displayName: session.displayName },
            showNotificationBell: true,
          };

    return (
      <Layout menuItems={menuItems} header={headerProps}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
              Notificações
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
              aria-live="polite"
            >
              {listResult.totalCount} notificações · {listResult.unreadCount} não lidas
            </p>
          </div>
          <NotificacoesClient initialResult={listResult} initialFilters={filters} />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Fallback canonico do estado inicial quando searchParams e undefined
// (Next 15 chama sem searchParams em contexto de teste unit isolado)
// -----------------------------------------------------------------------

export function getCanonicalDefaultFilters(): NotificacoesFilters {
  return CANONICAL_DEFAULT_FILTERS;
}
