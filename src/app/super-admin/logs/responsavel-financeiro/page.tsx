// ROIP APP 9BOX — rota canonica /super-admin/logs/responsavel-financeiro
// (ME-057b Bloco A; ME-070 refactor S366 CC068).
//
// Origem canonica:
// - DOC 05 §14.20 (Rota) + mockup canonico + CC043 (aprovada em
//   ME-057b) — mockup prevalece: colunas em ordem "Empresa, Data/hora,
//   Tipo, De, Para, Justificativa, Acao"; "Executado por" no modal.
// - DOC 02 §10.8 + §9.12 (matriz — exclusivo Bruno; middleware ja
//   aplica; este page.tsx faz guard defensivo defense-in-depth).
// - DOC 01 §14 (`responsavelFinanceiroTransferLog`) + M002.
// - S299/S313: faixa CNPJ ME-057b principal 10130..139 (test); esta
//   pagina em runtime nao restringe por CNPJ, apenas por acesso Bruno.
// - Pattern ME-056/ME-057a reutilizado bit-exact.
//
// Contrato canonico:
// - Server component: query inicial (primeira pagina) + lista de
//   empresas para popular o dropdown. Client component
//   (`RFLogsClient.tsx`) recebe esses valores como initial state e
//   consome `listarRFLogsAction` para re-fetch em mudanca de filtro
//   ou paginacao.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `RFLogListRow`, `RFLogListResult`, `EmpresaOption` (tipos) →
//     RFLogsClient.tsx, actions.ts, tests (agora em `./internals.ts`
//     sob S366 CC068).
//   - `loadRFLogsPage` → actions.ts (re-fetch), me057b-logs.test.ts
//     (agora em `./internals.ts` sob S366 CC068).
//   - `loadEmpresasList` → page.tsx (mesmo arquivo — chamador local
//     via import de `./internals`), actions.ts, me057b-logs.test.ts
//     (agora em `./internals.ts` sob S366 CC068).
//   - `getRFCanonicalDefaultFilters` → runtime fallback (agora em
//     `./internals.ts` sob S366 CC068).
//   - default export → runtime Next 15.
//
// S366 canonizada (ME-069 piloto para route.ts; ME-070 CC068 aplicacao
// tambem para page.tsx): tipos publicos, aliases de LEFT JOIN, funcoes
// de query e helper de fallback migraram para `./internals.ts` irmao.
// Este arquivo exporta apenas o default para conformidade Next 15 App
// Router (`next build`).

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../db/client';
import { COLORS } from '../../../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../server/session/serverSession';

import { RFLogsClient } from './RFLogsClient';
import { parseRFFiltersFromSearchParams } from './filters';

import { loadEmpresasList, loadRFLogsPage } from './internals';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Rota canonica /super-admin/logs/responsavel-financeiro (§14.20)
// -----------------------------------------------------------------------

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RFLogsPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard §10.8 + §9.12 (defense-in-depth ao middleware — matrix.ts).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseRFFiltersFromSearchParams(rawParams);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });

    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const [empresas, listResult] = await Promise.all([
      loadEmpresasList(client.db),
      loadRFLogsPage(client.db, filters),
    ]);

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'super_admin_global',
          user: { displayName: session.displayName },
          showNotificationBell: true,
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
              Logs de Responsável financeiro
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
              aria-live="polite"
            >
              {listResult.totalCount} eventos
            </p>
          </div>
          <RFLogsClient initialResult={listResult} initialFilters={filters} empresas={empresas} />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
