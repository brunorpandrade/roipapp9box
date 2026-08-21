// ROIP APP 9BOX — rota canonica `/pendencias-portal` (ME-058 §14.23).
//
// Origem canonica:
// - DOC 05 §14.23 (Rota `/pendencias-portal`) — carga inicial com filtros
//   default; 3 cards resumo, 6 filtros, tabela 11 colunas, ordenacao
//   tripla canonica S328.
// - DOC 02 §10.4 + §9.9 — matrix.ts ja restringe a rh/rh_lider/super_admin;
//   este page.tsx faz guard defensivo (S317).
// - Layout canonico ME-056: getServerSession + resolveProfileKey +
//   resolveMenuItems + <Layout>.
// - Mockup canonico primario: `painel_principal_fase7_v5.html` linhas
//   1192-1400 (CC047 canonizada nesta ME-058).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `PendenciasPortalPage` (default) → runtime Next 15.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { loadPendenciasPage } from '../../lib/pendencias/pendenciasEngine';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';
import { getServerSession } from '../../server/session/serverSession';

import { PendenciasClient } from './PendenciasClient';
import { parsePendenciasFilters } from './filters';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Resolve flags canonicas para C-level (numero total, acessoTotal). Nao
 * consumido em `/pendencias-portal` (matrix.ts nega C-level), mas o
 * `resolveProfileKey` exige as flags como entrada canonica. Retorna 0/
 * false por seguranca defensiva.
 */
function defaultCLevelFlags(): { readonly cLevelCount: number; readonly acessoTotal: boolean } {
  return { cLevelCount: 0, acessoTotal: false };
}

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PendenciasPortalPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard defense-in-depth ao matrix.ts §10.4 + §9.9. Super admin acessa
  // a rota base tambem (matrix.ts permite); RH e RH-Lider acessam;
  // C-level e Lider recebem redirect via middleware antes de chegar
  // aqui.
  if (session.kind === 'super_admin') {
    // Bruno usa /super-admin/empresa/[id]/pendencias-portal (contexto
    // dentro-de-empresa). A rota base sem companyId nao faz sentido para
    // ele — redireciona ao /super-admin (padrao canonico ME-057c).
    redirect('/super-admin');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    // Middleware ja bloquearia; defense-in-depth.
    redirect('/access-denied?rota=/pendencias-portal');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // ME-086 D-086-10: helper canonico consolidado — inclui
    // `isResponsavelFinanceiro` e filtra `employees.status='ativo'` na
    // cadeia (bugs latentes das 6 copias antigas de
    // `resolveMenuFlagsForRH` corrigidos).
    const menuFlags = await loadRhSessionFlags(client.db, session.userId);
    if (menuFlags === null) {
      // Registro deletado entre emissao do JWT e verificacao — sessao
      // invalida (padrao canonico bit-exact ao painel-rh).
      redirect('/');
    }
    const cFlags = defaultCLevelFlags();
    const profileKey = resolveProfileKey({
      session,
      isRH: menuFlags.isRH,
      isLider: menuFlags.isLider,
      acessoTotal: cFlags.acessoTotal,
      hasDescendingChain: menuFlags.hasDescendingChain,
      cLevelCount: cFlags.cLevelCount,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, menuFlags.isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const rawParams = (await props.searchParams) ?? {};
    const filters = parsePendenciasFilters(rawParams);

    const initialResult = await loadPendenciasPage({
      db: client.db,
      companyId: session.companyId,
      filters,
      page: 1,
      pageSize: 50,
    });

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
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
              Pendências no portal
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              Colaboradores com instrumentos pendentes ou atrasados no portal do colaborador. Envie
              lembretes individualmente ou em massa; cooldown de 72 horas por (colaborador,
              instrumento).
            </p>
          </div>
          <PendenciasClient
            companyId={null}
            initialResult={initialResult}
            initialFilters={filters}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
