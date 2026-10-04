// ROIP APP 9BOX — rota canonica /logs/acesso-individual (RH puro +
// RH-Lider C1/C2 + clevel+isRH pos ME 3.5 D6 patch3) — ME-057b Bloco B.
//
// Origem canonica:
// - DOC 05 §14.22 + mockup canonico `log_acesso_individual_v1.html`
//   + CC043 (aprovada em ME-057b).
// - DOC 02 §10.6 + §9.14 (matriz — RH puro + RH-Lider C1/C2 +
//   clevel+isRH; middleware redirect_painel para Bruno →
//   /super-admin/logs/…; middleware ja aplica; este page.tsx faz guard
//   defensivo defense-in-depth via `loadRhLikePageContext`).
// - DOC 01 §14.2 (`dataAccessLog`) — append-only, agente polimorfico
//   padrao B.
// - Pattern canonico bit-exact das 6 pages RH-facing da ME 3.5 D6.
//
// ME 3.5 D6 patch3: essa rota estava fora do escopo do D6 monolitico
// original e continuava com o guard historico `role IN {'rh','rh_lider'}`
// mais o `loadPlatformMenuContext` implicito via `resolveMenuItems`.
// Consequencia empirica: clevel+isRH caia em `redirect('/')` que, com
// o cookie `roip.menu.mode='rh'`, redirecionava de volta para
// `/painel-rh` (loop visual). Migracao canonica para
// `loadRhLikePageContext` + `loadPlatformMenuCtxCookie` corrige.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - default export → runtime Next 15.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import { PainelToggle } from '../../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../../db/client';
import { COLORS } from '../../../lib/design-tokens/colors';
import {
  loadDataAccessLogPage,
  parseDALFiltersFromSearchParams,
} from '../../../lib/logs/dataAccessLog';
import { loadRhLikePageContext } from '../../../lib/session/loadRhLikePageContext';
import { getServerSession } from '../../../server/session/serverSession';

import { DALLogsClient } from './DALLogsClient';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { headerUserFromSession } from '../../../lib/session/headerUser';

// -----------------------------------------------------------------------
// Rota canonica /logs/acesso-individual (§14.22 — RH)
// -----------------------------------------------------------------------

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DALLogsRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard §10.6 defense-in-depth. Bruno tem redirect_painel via
  // middleware para /super-admin/logs/acesso-individual — se por algum
  // motivo chegar aqui, redirect canonico.
  if (session.kind === 'super_admin') {
    redirect('/super-admin/logs/acesso-individual');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME 3.5 D6 patch3 — helper unico admite rh puro, rh_lider e
    // clevel+isRH=true. Retorna null quando a sessao nao pode operar
    // como RH nesta rota.
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/logs/acesso-individual');
    }

    const rawParams = (await props.searchParams) ?? {};
    const filters = parseDALFiltersFromSearchParams(rawParams);

    // Escopo canonico: RH ve apenas propria empresa.
    const listResult = await loadDataAccessLogPage(client.db, session.companyId, filters);

    return (
      <Layout
        menuItems={rhCtx.menuItems}
        panelToggle={
          rhCtx.canToggleMenuMode ? <PainelToggle currentMode={rhCtx.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: headerUserFromSession(session),
          // Sino canonico §4.1 — Bruno + RH puro/RH-Lider recebem sino;
          // C-level operando como RH segue a regra canonica de C-level
          // (sem sino).
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text.primary,
                margin: 0,
              }}
            >
              Log de acesso individual
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
              aria-live="polite"
            >
              {listResult.totalCount} registros
            </p>
          </div>
          <DALLogsClient
            initialResult={listResult}
            initialFilters={filters}
            showEmpresaFilter={false}
            empresas={[]}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
