// ROIP APP 9BOX — /alterar-senha page canonica (refactor ME-082).
//
// Origem canonica original: ME-080b Dispatch 3 (gate primeiro acesso).
// Refactor canonico ME-082:
//   - Modo `forcado === true`: preservado bit-exact (standalone sem
//     sidebar, destino apos sucesso = painel do perfil).
//   - Modo `forcado === false`: envolvido em Layout canonico do perfil
//     autenticado (§14.6 exige sidebar com item "Meus dados" ativo);
//     destino apos sucesso = /meus-dados (§14.6).
//
// **RV-13.** Todos os imports consumidos.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees } from '../../db/schema';
import { findCompanyDisplayInfo } from '../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';

import { AlterarSenhaClient } from './AlterarSenhaClient';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

function resolvePainelHref(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): string {
  switch (role) {
    case 'rh':
    case 'rh_lider':
      return '/painel-rh';
    case 'clevel':
      return '/painel-clevel';
    case 'lider':
      return '/painel-lider';
  }
}

export default async function AlterarSenhaPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // -------------------------------------------------------------------
  // Super Admin: sempre modo voluntario (sem passwordSet no schema).
  // Envolvido em Layout MENU_SUPER_ADMIN_GLOBAL. Destino = /meus-dados.
  // -------------------------------------------------------------------
  if (session.kind === 'super_admin') {
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
      throw new Error(`resolveMenuItems retornou null para profileKey=${profileKey}`);
    }
    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'super_admin_global',
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
      >
        <AlterarSenhaClient
          titularKind="super_admin"
          forcado={false}
          destinoAposTroca="/meus-dados"
          displayName={session.displayName}
        />
      </Layout>
    );
  }

  // -------------------------------------------------------------------
  // Platform: rh, rh_lider, clevel, lider.
  // Modo forcado (passwordSet=false): standalone (sem Layout).
  // Modo voluntario (passwordSet=true): envolvido em Layout do perfil.
  // -------------------------------------------------------------------
  const forcado = session.passwordSet === false;

  if (forcado) {
    // Standalone canonico preservado bit-exact ME-080b Dispatch 3.
    const painelHref = resolvePainelHref(session.role);
    return (
      <AlterarSenhaClient
        titularKind="platform"
        forcado
        destinoAposTroca={painelHref}
        displayName={session.displayName}
      />
    );
  }

  // Modo voluntario platform: envolver em Layout canonico do perfil.
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const role = session.role;
    let isRH = false;
    let isLider = false;
    let acessoTotal = false;
    let hasDescendingChain = false;
    let cLevelCount = 0;
    let isResponsavelFinanceiro = false;
    let showNotificationBell = false;

    if (role === 'clevel') {
      const clevelRows = await client.db
        .select({ acessoTotal: cLevelMembers.acessoTotal })
        .from(cLevelMembers)
        .where(eq(cLevelMembers.id, session.userId))
        .limit(1);
      acessoTotal = clevelRows[0]?.acessoTotal ?? true;
      const totalRows = await client.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(cLevelMembers)
        .where(
          and(eq(cLevelMembers.companyId, session.companyId), eq(cLevelMembers.status, 'ativo')),
        );
      cLevelCount = Number(totalRows[0]?.count ?? 0);
      const clevelRfRows = await client.db
        .select({ rf: cLevelMembers.isResponsavelFinanceiro })
        .from(cLevelMembers)
        .where(eq(cLevelMembers.id, session.userId))
        .limit(1);
      isResponsavelFinanceiro = clevelRfRows[0]?.rf ?? false;
    } else {
      isRH = role === 'rh' || role === 'rh_lider';
      isLider = role === 'rh_lider' || role === 'lider';
      showNotificationBell = role === 'rh' || role === 'rh_lider';
      if (role === 'rh_lider' || role === 'lider') {
        const chainRows = await client.db
          .select({ id: employees.id })
          .from(employeeLeaderHistory)
          .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
          .where(
            and(
              eq(employeeLeaderHistory.liderId, session.userId),
              isNull(employeeLeaderHistory.dataFim),
              eq(employees.isLider, true),
            ),
          )
          .limit(1);
        hasDescendingChain = chainRows.length > 0;
      }
      const empRfRows = await client.db
        .select({ rf: employees.isResponsavelFinanceiro })
        .from(employees)
        .where(eq(employees.id, session.userId))
        .limit(1);
      isResponsavelFinanceiro = empRfRows[0]?.rf ?? false;
    }

    const profileKey = resolveProfileKey({
      session,
      isRH,
      isLider,
      acessoTotal,
      hasDescendingChain,
      cLevelCount,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`resolveMenuItems retornou null para profileKey=${profileKey}`);
    }

    const companyInfo = await findCompanyDisplayInfo(client.db, session.companyId);
    const companyDisplayName = companyInfo?.nomeFantasia ?? session.companyDisplayName;
    const companyLogoUrl = companyInfo?.logoUrl ?? session.companyLogoUrl ?? undefined;

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName,
          companyLogoUrl,
          user: { displayName: session.displayName },
          showNotificationBell,
        }}
      >
        <AlterarSenhaClient
          titularKind="platform"
          forcado={false}
          destinoAposTroca="/meus-dados"
          displayName={session.displayName}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
