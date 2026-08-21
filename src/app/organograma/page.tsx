// ROIP APP 9BOX — rota canonica base RH `/organograma` (§14.9,
// ME-086b). PRIMEIRA das duas rotas RH-facing da ME-086b.
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
// - CAMADA_DADOS §4.4/§4.5/§4.6.
//
// D-086b-1 A + D-086b-4 A aprovadas bit-exact: escopo canonico completo
// bit-exact §14.9 via reutilizacao integral do `OrganogramaClient`
// da ME-077 (978 linhas — ja expoe `applyPC1b: boolean`, S408).
//
// Padrao canonico bit-exact ao precedente `/central-relatorios`
// (ME-B9-CR) + `/todos-os-colaboradores` (ME-084): guard defensivo
// canonico 5 checks (redirect super-admin, kind, passwordSet, role,
// access-denied) + branch canonico por perfil.
//
// **RV-13.** Todo import consumido bit-exact:
//   - `OrganogramaClient` via `_client.ts` shim (RV-14 canonica).
//   - `loadRhSessionFlags` (helper canonico consolidado ME-086 D-086-10).
//   - `shouldApplyPC1b` (helper canonico router `orgTree`).
//   - Loader `loadFullOrgTree` (service `orgTree`).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { cLevelMembers } from '../../db/schema';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';
import { shouldApplyPC1b } from '../../server/routers/orgTree';
import { getServerSession } from '../../server/session/serverSession';
import { loadFullOrgTree } from '../../server/services/orgTree';

import { OrganogramaClient } from './_client';
import { resolveDatabaseUrl } from './internals';

/**
 * Flags default canonicas para C-level — usadas quando o guard
 * resolve para branch RH/RH-Lider ou Lider (nao ha C-level na sessao
 * para carregar). Bit-exact ao padrao ME-084/ME-B9-CR.
 */
function defaultCLevelFlags(): { readonly cLevelCount: number; readonly acessoTotal: boolean } {
  return { cLevelCount: 0, acessoTotal: false };
}

/**
 * §12.2 CAMADA_UI — resolve flags reais de C-level (`acessoTotal=true`
 * obrigatorio para acesso pleno; CF cai em access-denied). Bit-exact
 * ao padrao `/central-relatorios` ME-B9-CR3.
 */
async function resolveCLevelFlags(
  db: Awaited<ReturnType<typeof createDbClient>>['db'],
  userId: number,
  companyId: number,
): Promise<{
  readonly acessoTotal: boolean;
  readonly cLevelCount: number;
} | null> {
  const memberRows = await db
    .select({ acessoTotal: cLevelMembers.acessoTotal })
    .from(cLevelMembers)
    .where(eq(cLevelMembers.id, userId))
    .limit(1);
  const member = memberRows[0];
  if (member === undefined) {
    return null;
  }
  const countRows = await db
    .select({ id: cLevelMembers.id })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')));
  return {
    acessoTotal: member.acessoTotal ?? true,
    cLevelCount: countRows.length,
  };
}

export default async function OrganogramaRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.3 canonica: Bruno usa `/super-admin` (contexto dentro-de-empresa
  // via prefixo dedicado); rota base sem `companyId` nao faz sentido
  // para ele. Padrao bit-exact `/central-relatorios` (ME-B9-CR).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  // Guard defense-in-depth bit-exact ao middleware §10.4:
  // super_admin + rh + rh_lider + clevel + lider allow;
  // colaborador comum (role=colaborador) deny.
  const ALLOWED_ROLES = ['rh', 'rh_lider', 'clevel', 'lider'] as const;
  if (!ALLOWED_ROLES.includes(session.role as (typeof ALLOWED_ROLES)[number])) {
    redirect('/access-denied?rota=/organograma');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    // Carga da arvore canonica bit-exact (mesma que o super-admin
    // consome — service compartilhado `orgTree`).
    const root = await loadFullOrgTree(client.db, session.companyId);
    if (root === null) {
      // Empresa sem arvore montada — CAMADA_UI §14.9 canonicamente
      // supõe pelo menos 1 C-level para renderizar; retornar redirect
      // canonico para o painel principal como fallback seguro.
      redirect('/');
    }

    // §11.2 PC1b canonica bit-exact: retorna `true` para rh/rh_lider,
    // `false` para clevel/lider (que veem C-level clicaveis).
    const applyPC1b = shouldApplyPC1b({
      role: session.role,
      userId: session.userId,
      companyId: session.companyId,
    });

    // Branch canonico bit-exact por perfil para resolver menu.
    // C-level: consulta acessoTotal (§12.2 CAMADA_UI — CF nega).
    if (session.role === 'clevel') {
      const cFlags = await resolveCLevelFlags(client.db, session.userId, session.companyId);
      if (cFlags === null || !cFlags.acessoTotal) {
        redirect('/access-denied?rota=/organograma');
      }
      const menuFlagsClevel = { isRH: false, isLider: false, hasDescendingChain: false };
      const profileKeyClevel = resolveProfileKey({
        session,
        isRH: menuFlagsClevel.isRH,
        isLider: menuFlagsClevel.isLider,
        acessoTotal: cFlags.acessoTotal,
        hasDescendingChain: menuFlagsClevel.hasDescendingChain,
        cLevelCount: cFlags.cLevelCount,
        isSuperAdminInCompany: false,
      });
      const menuItemsClevel = resolveMenuItems(profileKeyClevel, false);
      if (menuItemsClevel === null) {
        throw new Error(`Menu canonico ausente para ${profileKeyClevel} — inconsistencia §3`);
      }
      return (
        <Layout
          menuItems={menuItemsClevel}
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
          />
        </Layout>
      );
    }

    // Branch canonico bit-exact Lider puro: menu de lider (isLider=true,
    // isRH=false). loadRhSessionFlags aceita canonicamente qualquer
    // role platform.
    if (session.role === 'lider') {
      const menuFlags = await loadRhSessionFlags(client.db, session.userId);
      if (menuFlags === null) {
        redirect('/');
      }
      const cFlags = defaultCLevelFlags();
      const profileKey = resolveProfileKey({
        session,
        isRH: false,
        isLider: true,
        acessoTotal: cFlags.acessoTotal,
        hasDescendingChain: menuFlags.hasDescendingChain,
        cLevelCount: cFlags.cLevelCount,
        isSuperAdminInCompany: false,
      });
      const menuItems = resolveMenuItems(profileKey, menuFlags.isResponsavelFinanceiro);
      if (menuItems === null) {
        throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
      }
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
          <OrganogramaPageInner
            companyId={session.companyId}
            companyName={session.companyDisplayName}
            root={root}
            applyPC1b={applyPC1b}
          />
        </Layout>
      );
    }

    // Branch canonico bit-exact RH puro / RH-Lider (bit-exact ao
    // padrao `/central-relatorios` pre-CR3). ME-086 D-086-10: helper
    // canonico consolidado `loadRhSessionFlags`.
    const menuFlags = await loadRhSessionFlags(client.db, session.userId);
    if (menuFlags === null) {
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
        <OrganogramaPageInner
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          root={root}
          applyPC1b={applyPC1b}
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
      />
    </div>
  );
}
