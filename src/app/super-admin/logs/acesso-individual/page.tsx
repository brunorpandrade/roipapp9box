// ROIP APP 9BOX — rota canonica /super-admin/logs/acesso-individual
// (Bruno cross-empresa) — ME-057b Bloco C.
//
// Origem canonica:
// - DOC 05 §14.22 subtitle Bruno + mockup canonico + CC043 (aprovada
//   em ME-057b).
// - DOC 02 §10.6 + §9.14 (matriz — exclusivo Bruno; middleware ja
//   aplica; guard defensivo defense-in-depth).
// - DOC 01 §14.2 (`dataAccessLog`).
//
// Diferencas em relacao a rota RH (Bloco B):
// - `scopeCompanyId = null` (Bruno cross-empresa por default).
// - Dropdown Empresa (canonico §14.22 subtitle Bruno) via prop
//   `showEmpresaFilter=true` do DALLogsClient compartilhado.
// - Subtitle canonico do header §14.22.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - default export → runtime Next 15.
//   - `loadEmpresasListForBruno` → mesmo arquivo (chamador local).

import { redirect } from 'next/navigation';
import { asc } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../../../db/client';
import { companies } from '../../../../db/schema';
import { COLORS } from '../../../../lib/design-tokens/colors';
import {
  loadDataAccessLogPage,
  parseDALFiltersFromSearchParams,
} from '../../../../lib/logs/dataAccessLog';
import { resolveMenuItems } from '../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../server/session/serverSession';

import { DALLogsBrunoClient } from './DALLogsBrunoClient';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

export interface BrunoDALEmpresaOption {
  readonly id: number;
  readonly nomeFantasia: string;
}

async function loadEmpresasListForBruno(
  db: RoipDatabase,
): Promise<readonly BrunoDALEmpresaOption[]> {
  return db
    .select({ id: companies.id, nomeFantasia: companies.nomeFantasia })
    .from(companies)
    .orderBy(asc(companies.nomeFantasia));
}

// -----------------------------------------------------------------------
// Rota canonica /super-admin/logs/acesso-individual (§14.22 — Bruno)
// -----------------------------------------------------------------------

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DALLogsBrunoPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Guard §10.6 + §9.14 defense-in-depth ao middleware.
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rawParams = (await props.searchParams) ?? {};
    const filters = parseDALFiltersFromSearchParams(rawParams);

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

    // Escopo canonico Bruno: cross-empresa (null). Dropdown Empresa
    // aplica filtro server-side via `filters.empresaId`.
    const [empresas, listResult] = await Promise.all([
      loadEmpresasListForBruno(client.db),
      loadDataAccessLogPage(client.db, null, filters),
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
              Consulta consolidada de acessos a dados pessoais em toda a plataforma ·{' '}
              {listResult.totalCount} registros
            </p>
          </div>
          <DALLogsBrunoClient
            initialResult={listResult}
            initialFilters={filters}
            empresas={empresas}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
