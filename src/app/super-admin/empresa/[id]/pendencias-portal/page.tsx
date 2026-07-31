// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/
// pendencias-portal` (ME-058 §14.23 contexto dentro-de-empresa).
//
// Origem canonica:
// - Padrao S315 (rota dupla) canonizada em ME-057b: reutiliza motor
//   `loadPendenciasPage` com companyId explicito da rota; reutiliza
//   `PendenciasClient.tsx` com prop `companyId` preenchido.
// - Guard S319 defense-in-depth: matrix.ts `/super-admin/empresa/*`
//   matchPrefix ja restringe a `super_admin`; page.tsx revalida.
// - Layout canonico: `superAdminContext` presente (§4.2 indicador
//   contextual — profileKey `super_admin_in_company` §3.2).
//
// **RV-13.** `SuperAdminPendenciasPortalPage` (default) → runtime Next 15.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { COLORS } from '../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { loadPendenciasPage } from '../../../../../lib/pendencias/pendenciasEngine';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { PendenciasClient } from '../../../../pendencias-portal/PendenciasClient';
import { parsePendenciasFilters } from '../../../../pendencias-portal/filters';

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

export default async function SuperAdminPendenciasPortalPage(
  props: PageProps,
): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
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
    const filters = parsePendenciasFilters(rawParams);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const initialResult = await loadPendenciasPage({
      db: client.db,
      companyId,
      filters,
      page: 1,
      pageSize: 50,
    });

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
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
              Pendências no portal
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              Contexto dentro-de-empresa: {company.nomeFantasia}. Visao consolidada de pendencias do
              portal do colaborador; envie lembretes individualmente ou em massa.
            </p>
          </div>
          <PendenciasClient
            companyId={companyId}
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
