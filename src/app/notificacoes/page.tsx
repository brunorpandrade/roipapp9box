// ROIP APP 9BOX — rota canonica /notificacoes (ME-057a; ME-070 refactor
// S366 CC068; ME 3.5 D6 admite clevel+isRH; ME 3.5 D6 patch3 corrige
// filtro para C-level operando como RH).
//
// Origem canonica:
// - DOC 05 §14.19 (Rota `/notificacoes`) — barra de filtros com 6
//   controles + tabela paginada + selecoes acumuladas + acoes em lote +
//   modais + toasts + 2 estados vazios canonicos.
// - DOC 05 §4.1 (Header) — sino ATIVO para Bruno + RH; C-level
//   operando como RH segue regra canonica de C-level (sem sino).
// - DOC 02 §10.5 + §9.7 (matriz ampliada ME 3.5 D6 — clevel liberado
//   na rota; guard fino server-side).
//
// ME 3.5 D6 patch3: para C-level operando como RH, o filtro
// `destinatarioEmployeeId` e null (o `session.userId` de um C-level e
// um cLevelId, nao um employees.id, portanto o filtro exato jamais
// casaria). Semantica canonica: C-level+isRH ve o feed RH da empresa
// como qualquer RH veria — notificacoes cujo destinatarioTipo='rh'
// SEM `destinatarioEmployeeId` (broadcast ao RH) mais o loader tRPC
// existente (que nao filtra por employee quando o id e null).

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems, type MenuItem } from '../../lib/menu/menuConfig';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession, type ServerSession } from '../../server/session/serverSession';

import { ToastProvider } from '../../components/ui/Toast';
import { NotificacoesClient } from './NotificacoesClient';
import { parseFiltersFromSearchParams } from './filters';

import { loadNotificacoesPage } from './internals';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

// -----------------------------------------------------------------------
// Presentation payload consolidado (menu + destinatario canonico)
// -----------------------------------------------------------------------

interface PagePresentation {
  readonly menuItems: readonly MenuItem[];
  readonly panelToggle: JSX.Element | undefined;
  readonly showNotificationBell: boolean;
  readonly destinatarioTipo: 'bruno' | 'rh';
  readonly destinatarioEmployeeId: number | null;
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

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseFiltersFromSearchParams(rawParams);

    const presentation: PagePresentation =
      session.kind === 'platform'
        ? await resolvePlatformPresentation(client.db, session)
        : resolveSuperAdminPresentation(session);

    const listResult = await loadNotificacoesPage(
      client.db,
      presentation.destinatarioTipo,
      presentation.destinatarioEmployeeId,
      filters,
    );

    const headerProps =
      session.kind === 'super_admin'
        ? {
            leftMode: 'super_admin_global' as const,
            user: { displayName: session.displayName },
            showNotificationBell: presentation.showNotificationBell,
          }
        : {
            leftMode: 'in_company' as const,
            companyDisplayName: session.companyDisplayName,
            companyLogoUrl: session.companyLogoUrl ?? undefined,
            user: { displayName: session.displayName },
            showNotificationBell: presentation.showNotificationBell,
          };

    return (
      <Layout
        menuItems={presentation.menuItems}
        panelToggle={presentation.panelToggle}
        header={headerProps}
      >
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

async function resolvePlatformPresentation(
  db: Parameters<typeof loadRhLikePageContext>[0],
  session: Parameters<typeof loadRhLikePageContext>[1],
): Promise<PagePresentation> {
  const rhCtx = await loadRhLikePageContext(db, session);
  if (rhCtx === null) {
    redirect('/access-denied?rota=/notificacoes');
  }
  // ME 3.5 D6 patch3 — C-level operando como RH consome feed RH geral
  // da empresa (destinatarioEmployeeId=null). RH puro e RH-Lider seguem
  // filtro canonico pelo proprio employee id.
  const destinatarioEmployeeId = rhCtx.isCLevelActingAsRH ? null : session.userId;
  return {
    menuItems: rhCtx.menuItems,
    panelToggle: rhCtx.canToggleMenuMode ? (
      <PainelToggle currentMode={rhCtx.menuMode} />
    ) : undefined,
    // Sino canonico §4.1 — C-level operando como RH nao recebe sino.
    showNotificationBell: !rhCtx.isCLevelActingAsRH,
    destinatarioTipo: 'rh',
    destinatarioEmployeeId,
  };
}

function resolveSuperAdminPresentation(
  session: Extract<ServerSession, { readonly kind: 'super_admin' }>,
): PagePresentation {
  const profileKey = resolveProfileKey({
    session,
    isRH: false,
    isLider: false,
    acessoTotal: false,
    hasDescendingChain: false,
    cLevelCount: 0,
    isSuperAdminInCompany: false,
  });
  const items = resolveMenuItems(profileKey, false);
  if (items === null) {
    throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
  }
  return {
    menuItems: items,
    panelToggle: undefined,
    showNotificationBell: true,
    destinatarioTipo: 'bruno',
    destinatarioEmployeeId: null,
  };
}
