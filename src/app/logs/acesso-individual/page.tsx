// ROIP APP 9BOX — rota canonica /logs/acesso-individual (RH puro +
// RH-Lider C1/C2) — ME-057b Bloco B.
//
// Origem canonica:
// - DOC 05 §14.22 + mockup canonico `log_acesso_individual_v1.html`
//   + CC043 (aprovada em ME-057b).
// - DOC 02 §10.6 + §9.14 (matriz — RH puro + RH-Lider C1/C2; middleware
//   redirect_painel para Bruno → /super-admin/logs/…; middleware ja
//   aplica; este page.tsx faz guard defensivo defense-in-depth).
// - DOC 01 §14.2 (`dataAccessLog`) — append-only, agente polimorfico
//   padrao B.
// - Pattern ME-056/ME-057a reutilizado bit-exact.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - default export → runtime Next 15.

import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../../db/client';
import { employees, employeeLeaderHistory } from '../../../db/schema';
import { COLORS } from '../../../lib/design-tokens/colors';
import {
  loadDataAccessLogPage,
  parseDALFiltersFromSearchParams,
} from '../../../lib/logs/dataAccessLog';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../server/session/serverSession';

import { DALLogsClient } from './DALLogsClient';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Flags do RH (reutiliza pattern ME-057a — necessarias para
// resolveProfileKey e para o Layout perfil-agnostic).
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
        isNull(employeeLeaderHistory.dataFim),
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
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseDALFiltersFromSearchParams(rawParams);

    const flags = await loadFlagsForRhSession(client.db, session.userId);
    if (flags === null) {
      redirect('/');
    }

    const profileKey = resolveProfileKey({
      session,
      isRH: flags.isRH,
      isLider: flags.isLider,
      acessoTotal: false,
      hasDescendingChain: flags.hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });

    const menuItems = resolveMenuItems(profileKey, flags.isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    // Escopo canonico: RH ve apenas propria empresa.
    const listResult = await loadDataAccessLogPage(client.db, session.companyId, filters);

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
