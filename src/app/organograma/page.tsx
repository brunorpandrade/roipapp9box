// ROIP APP 9BOX — rota canonica base RH `/organograma` (§14.9,
// ME-086b; ME 3.5 D6 admite clevel+isRH via `loadRhLikePageContext`).
//
// Origem canonica:
// - CAMADA_UI §14.9 (organograma completo — arvore hierarquica +
//   painel lateral + comportamento clique por tipo + PC1b canonico +
//   modo analitico com toggle + esmaecimento por permissao) + §2.6
//   (cores dos nos).
// - CAMADA_AUTH §10.4 linha 824 (matriz canonica): super_admin +
//   rhp + rhl1 + rhl2 + cu + ct + cf + l1 + l2 — todos os 9 perfis
//   com PC1b canonico bit-exact para rh/rh_lider.
// - CAMADA_AUTH §11.2 PC1b canonica (tooltip literal "Detalhes
//   restritos ao Super Admin").
// - CAMADA_NEGOCIO §15.7 (regra visual PC1b).
//
// ME 3.5 D6: para C-level operando como RH (`isCLevelActingAsRH`),
// a decisao canonica e tratar como RH puro — herda `applyPC1b=true`
// e escopo hierarquico irrestrito (bit-exact ao ramo RH puro). Para
// C-level nao operando como RH, permanece o branch canonico
// pre-existente (CU/CT/CF via `resolveApplyPC1b` + PC1h).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import {
  canViewCompanyAggregate,
  NATIVE_EMPRESA_DASHBOARD_HREF,
} from '../../lib/scope/companyAggregateAccess';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { resolveApplyPC1b } from '../../server/routers/orgTree';
import { resolveHierarchicalScope } from '../../server/services/hierarchicalScope';
import { getServerSession } from '../../server/session/serverSession';
import { loadFullOrgTree } from '../../server/services/orgTree';

import { OrganogramaClient } from './_client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';

export default async function OrganogramaRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const root = await loadFullOrgTree(client.db, session.companyId);
    if (root === null) {
      redirect('/');
    }

    // ME 3.5 D6 — tentativa RH-like primeiro: admite rh/rh_lider e
    // clevel+isRH. Se null, cai nos branches canonicos pre-existentes
    // (clevel sem isRH via `loadPlatformMenuContext` para CU/CT/CF, e
    // lider puro).
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx !== null) {
      // RH puro, RH-Lider ou clevel operando como RH.
      // §11.8 PC1g — RH e RH-Lider sempre com PC1b. Para clevel-as-RH,
      // decisao canonica ME 3.5 D6: herda comportamento RH puro (PC1b).
      const applyPC1bRh = resolveApplyPC1b({
        role: 'rh',
        userId: session.userId,
        companyId: session.companyId,
      });
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
            user: { displayName: session.displayName },
            showNotificationBell: !rhCtx.isCLevelActingAsRH,
          }}
        >
          <OrganogramaPageInner
            companyId={session.companyId}
            companyName={session.companyDisplayName}
            root={root}
            applyPC1b={applyPC1bRh}
            selfNodeId={
              rhCtx.isCLevelActingAsRH ? `clevel-${session.userId}` : `employee-${session.userId}`
            }
            empresaDashboardHref={NATIVE_EMPRESA_DASHBOARD_HREF}
          />
        </Layout>
      );
    }

    // Guard defense-in-depth bit-exact ao middleware §10.4:
    // clevel sem isRH e lider caem aqui.
    const ALLOWED_ROLES = ['clevel', 'lider'] as const;
    if (!ALLOWED_ROLES.includes(session.role as (typeof ALLOWED_ROLES)[number])) {
      redirect('/access-denied?rota=/organograma');
    }

    // Menu/RF/sino via helper unico pre-existente (clevel sem isRH e
    // lider puro).
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }

    if (session.role === 'clevel') {
      const cFlags = menu.cLevel;
      if (cFlags === null) {
        redirect('/access-denied?rota=/organograma');
      }
      const applyPC1b = resolveApplyPC1b(
        {
          role: session.role,
          userId: session.userId,
          companyId: session.companyId,
        },
        {
          cLevelCount: cFlags.cLevelCount,
          acessoTotal: cFlags.acessoTotal,
        },
      );
      const scope = await resolveHierarchicalScope(
        client.db,
        {
          role: session.role,
          userId: session.userId,
          companyId: session.companyId,
        },
        {
          cLevelCount: cFlags.cLevelCount,
          acessoTotal: cFlags.acessoTotal,
        },
      );
      const restrictedNodeIds = scope === null ? undefined : Array.from(scope);
      const empresaDashboardHref = canViewCompanyAggregate(scope)
        ? NATIVE_EMPRESA_DASHBOARD_HREF
        : undefined;
      return (
        <Layout
          menuItems={menu.menuItems}
          header={{
            leftMode: 'in_company',
            companyDisplayName: session.companyDisplayName,
            companyLogoUrl: session.companyLogoUrl ?? undefined,
            user: { displayName: session.displayName },
            showNotificationBell: false,
          }}
        >
          <OrganogramaPageInner
            companyId={session.companyId}
            companyName={session.companyDisplayName}
            root={root}
            applyPC1b={applyPC1b}
            restrictedNodeIds={restrictedNodeIds}
            selfNodeId={`clevel-${session.userId}`}
            empresaDashboardHref={empresaDashboardHref}
          />
        </Layout>
      );
    }

    // Branch Lider puro.
    const applyPC1bLider = resolveApplyPC1b({
      role: session.role,
      userId: session.userId,
      companyId: session.companyId,
    });
    const scopeLider = await resolveHierarchicalScope(client.db, {
      role: session.role,
      userId: session.userId,
      companyId: session.companyId,
    });
    const restrictedNodeIdsLider = scopeLider === null ? undefined : Array.from(scopeLider);
    return (
      <Layout
        menuItems={menu.menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: menu.showNotificationBell,
        }}
      >
        <OrganogramaPageInner
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          root={root}
          applyPC1b={applyPC1bLider}
          restrictedNodeIds={restrictedNodeIdsLider}
          selfNodeId={`employee-${session.userId}`}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Wrapper canonico do render (header + OrganogramaClient) — evita
// duplicacao bit-exact entre os 3 branches.
// -----------------------------------------------------------------------

interface OrganogramaPageInnerProps {
  readonly companyId: number;
  readonly companyName: string;
  readonly root: Parameters<typeof OrganogramaClient>[0]['initialRoot'];
  readonly applyPC1b: boolean;
  readonly restrictedNodeIds?: ReadonlyArray<string>;
  readonly selfNodeId?: string | null;
  readonly empresaDashboardHref?: string;
}

function OrganogramaPageInner(props: OrganogramaPageInnerProps): JSX.Element {
  return (
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
          Organograma
        </h1>
        <p
          style={{
            fontSize: 13,
            color: COLORS.text.secondary,
            margin: '4px 0 0 0',
          }}
        >
          {props.companyName}
        </p>
      </div>
      <OrganogramaClient
        companyId={props.companyId}
        initialRoot={props.root}
        applyPC1b={props.applyPC1b}
        restrictedNodeIds={props.restrictedNodeIds}
        selfNodeId={props.selfNodeId}
        empresaDashboardHref={props.empresaDashboardHref}
      />
    </div>
  );
}
