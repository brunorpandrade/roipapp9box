// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/parametros`
// (§13.1 Aba 1 "Parametros gerais", ME-075). SEGUNDA rota de codigo do
// bloco B8 (fecha D086 canonico bit-exact).
//
// Origem canonica:
// - CAMADA_UI §13.1 (Aba 1: 9 secoes bit-exact — Dados / Contatos /
//   Encarregado LGPD / Perfil / Ano fiscal / ROI / Thresholds / NR-1 /
//   Status).
// - CAMADA_AUTENTICACAO_AUTORIZACAO §10.9 (cadastro/edicao empresa —
//   exclusivo Bruno) + §12 (matriz de acoes administrativas).
// - CAMADA_NEGOCIO §16 (cadastros) + §3.9 (retroatividade assimetrica)
//   + §3.6 (diagnostico trimestral consome ano fiscal).
// - CAMADA_DADOS §4.2 (`companies` 40 colunas + isDemo).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canonico bit-exact) + §3.2 (ficha
//   canonica desta ME).
//
// Pattern §2.1 canonico bit-exact preservado bit-exact via consumo dos
// helpers `getServerSession`, `resolveProfileKey`, `resolveMenuItems`
// (com fix D088), `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido: `parseCompanyIdParam` (parse [id]),
// `resolveDatabaseUrl`, `loadCompanyForParametros`, `mapCompanyRowToForm-
// Values` → `page.tsx`. `ParametrosClient` → renderizado abaixo do Layout.
//
// **RV-08.** Nenhuma decisao aqui — todos os loaders sao helpers puros
// pre-decididos em `internals.ts`.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';
import { hasFirstQuarterCalculated } from '../../../../../server/services/companies';

import { ParametrosClient } from './ParametrosClient';
import {
  loadCompanyForParametros,
  mapCompanyRowToFormValues,
  parseCompanyIdParam,
  resolveDatabaseUrl,
} from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function SuperAdminCompanyParametrosPage(
  props: PageProps,
): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  // Guard §10.9 + §9.1 (defense-in-depth ao middleware `/super-admin/
  // empresa/`).
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
    const row = await loadCompanyForParametros(client.db, companyId);
    if (row === null) {
      notFound();
    }
    const firstQuarterCalculated = await hasFirstQuarterCalculated(client.db, companyId);
    const formValues = mapCompanyRowToFormValues(row);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });
    // D088 canonico bit-exact — passa `companyId` para substituir place-
    // holder `[id]` nos hrefs do menu §3.2.
    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: row.nomeFantasia,
          companyLogoUrl: row.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{ companyDisplayName: row.nomeFantasia }}
      >
        <ParametrosClient
          companyId={companyId}
          companyNomeFantasia={row.nomeFantasia}
          firstQuarterCalculated={firstQuarterCalculated}
          initialValues={formValues}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
