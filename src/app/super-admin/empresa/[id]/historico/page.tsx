// ROIP APP 9BOX — rota canonica /super-admin/empresa/[id]/historico
// (ME-057c Bloco A — Historico da empresa §14.21 S476).
//
// Origem canonica:
// - DOC 05 §14.21 (Rota `/super-admin/empresa/[id]/historico`) + mockup
//   canonico `historico_empresa_v1.html`. CC045 canonizada nesta ME:
//   mockup prevalece bit-exact.
// - DOC 02 §10.3 + §9.1 — exclusivo Bruno; middleware ja aplica; este
//   page.tsx faz guard defensivo defense-in-depth.
// - DOC 05 §3.2 — menu Bruno dentro-de-empresa com item "Historico da
//   empresa" ja registrado em `menuConfig.ts:262`.
// - DOC 01 §14 (`responsavelFinanceiroTransferLog`) + M004
//   (`monthlyUnlockLog`, `employeeLeaderHistory`) + M013
//   (`cycleUnlockRequests`).
// - Pattern ME-056 (getServerSession + resolveProfileKey +
//   resolveMenuItems + Layout) preservado bit-exact.
// - S299/S313/S325: faixa CNPJ ME-057c principal 10150..159 (test).
//
// Contrato canonico:
// - Server component: valida route param `[id]` como int positivo;
//   resolve `findCompanyDisplayInfo` (`notFound()` se ausente); executa
//   `loadCompanyHistoryPage` com filtros iniciais; renderiza
//   `HistoricoClient` com initial state.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `HistoricoPage` (default export) → runtime Next 15.
//   - `getHistoricoCanonicalDefaultFilters` migrou para
//     `./internals.ts` sob S366 CC068 (ME-070). Consumido como
//     fallback quando Next 15 nao passa searchParams em contexto de
//     teste unit isolado.
//
// S366 canonizada (ME-069 piloto para route.ts; ME-070 CC068 aplicacao
// tambem para page.tsx): helper de fallback migrou para
// `./internals.ts` irmao. Este arquivo exporta apenas o default para
// conformidade Next 15 App Router (`next build`).

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { COLORS } from '../../../../../lib/design-tokens/colors';
import {
  findCompanyDisplayInfo,
  loadCompanyHistoryPage,
} from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { HistoricoClient } from './HistoricoClient';
import { parseHistoricoFiltersFromSearchParams } from './filters';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

function parseCompanyIdParam(raw: string): number | null {
  if (raw === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || String(parsed) !== raw) return null;
  return parsed;
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HistoricoPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.3 + §9.1 (defense-in-depth ao middleware — matrix.ts
  // matchPrefix `/super-admin/empresa/`).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const rawParams = (await props.searchParams) ?? {};
    const filters = parseHistoricoFiltersFromSearchParams(rawParams);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });

    // ME-074 D088: passa `companyId` para substituir placeholder canonico
    // `[id]` nos hrefs do menu §3.2 — sem isso, cliques nos itens caem em
    // rotas literais e retornam 404.
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const listResult = await loadCompanyHistoryPage(client.db, companyId, filters);

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: company.nomeFantasia }}
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
              Histórico da empresa
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.text.secondary,
                }}
              >
                {listResult.totalCount} evento(s) encontrado(s)
              </span>
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              Log de auditoria consolidado das principais movimentações administrativas desta
              empresa. Para consultar outra empresa, volte em &quot;← Início&quot; e acesse-a
              novamente.
            </p>
          </div>
          <HistoricoClient
            companyId={companyId}
            initialResult={listResult}
            initialFilters={filters}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Fallback canonico (Next 15 chama sem searchParams em contexto de
// teste unit isolado) — migrado para `./internals.ts` sob S366 CC068
// (ME-070). Testes que precisavam de `getHistoricoCanonicalDefaultFilters`
// agora importam de `./internals` diretamente.
// -----------------------------------------------------------------------
