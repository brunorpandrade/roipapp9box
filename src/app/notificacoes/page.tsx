// ROIP APP 9BOX — rota canonica /notificacoes (ME-057a; ME-070 refactor
// S366 CC068).
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
//     `loadNotificacoesPage`, `getCanonicalDefaultFilters` migraram
//     para `./internals.ts` sob S366 CC068 (ME-070). Consumidos por
//     `actions.ts` (re-fetch de filtros e paginacao) +
//     `me057a-notificacoes.test.ts` (integration).
//   - default export → runtime Next 15.
//
// S366 canonizada (ME-069 piloto para route.ts; ME-070 CC068 aplicacao
// tambem para page.tsx): tipos publicos, funcao de query e helper de
// fallback migraram para `./internals.ts` irmao. Este arquivo exporta
// apenas o default para conformidade Next 15 App Router (`next build`).

import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../db/client';
import { employees, employeeLeaderHistory } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession, type ServerSession } from '../../server/session/serverSession';

import { ToastProvider } from '../../components/ui/Toast';
import { NotificacoesClient } from './NotificacoesClient';
import { parseFiltersFromSearchParams } from './filters';

import { loadNotificacoesPage } from './internals';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
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
        <ToastProvider>
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
        </ToastProvider>
      </Layout>
    );
  } catch (err) {
    // ME-080a — telemetria item 12/19. `/notificacoes` reportava
    // "erro interno" em produção sem stack. Log estruturado permite
    // que a próxima ocorrência apareça em Railway logs com stack
    // completo + kind da sessão. Rethrow preserva comportamento
    // canônico (Next 15 App Router mostra error boundary).
    console.error('[/notificacoes] erro no server component', {
      kind: session.kind,
      role: session.kind === 'platform' ? session.role : null,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  } finally {
    await closeDbClient(client);
  }
}
