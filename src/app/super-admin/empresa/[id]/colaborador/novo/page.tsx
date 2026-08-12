// ROIP APP 9BOX — rota canonica Bruno `/super-admin/empresa/[id]/
// colaborador/novo` (§13.4 + §13.9, ME-078b). OITAVA rota de codigo do
// bloco B8.
//
// Origem canonica:
// - CAMADA_UI §13.4 (Cadastro colaborador integral) + §13.9 (preset=rh
//   via query string) + delta canonico `delta_toggle_resp_financeiro_v2.html`.
// - CAMADA_AUTH §10.3 linha 807 + §10.9 (rota exclusiva Bruno) + §12
//   (RF exclusivo Bruno; `isRH` toggle exclusivo Bruno).
// - CAMADA_NEGOCIO §5 (RF integral) + §16.2 (Cadastro colaborador) + §16.7.
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`)
//   + §5.1 (`responsavelFinanceiroTransferLog`).
// - MASTER_ESCOPO_B8.md §2.1 (pattern) + §3.5 (ficha ME-078).
//
// Pattern §2.1 canonico bit-exact.
//
// RV-14. Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../../db/client';
import { COLORS } from '../../../../../../lib/design-tokens/colors';
import { findCompanyDisplayInfo } from '../../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../../server/session/serverSession';

import { ColaboradorNovoClient } from './ColaboradorNovoClient';
import {
  loadColaboradorNovoPage,
  parseCompanyIdParam,
  parsePresetParam,
  resolveDatabaseUrl,
} from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ preset?: string }>;
}

export default async function ColaboradorNovoPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/login-super-admin');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const companyId = parseCompanyIdParam(rawId);
  if (companyId === null) {
    notFound();
  }

  const searchParams = await props.searchParams;
  const preset = parsePresetParam(searchParams.preset);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    const pageData = await loadColaboradorNovoPage(client.db, companyId, preset);

    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });

    const menuItems = resolveMenuItems(profileKey, false, companyId);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const isRHPreset = pageData.presetIsRH;
    const titulo = isRHPreset ? 'Cadastro de RH' : 'Cadastro de colaborador';

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
              {titulo}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              {company.nomeFantasia}
            </p>
          </div>
          <ColaboradorNovoClient
            companyId={companyId}
            currentRFName={pageData.currentRF !== null ? pageData.currentRF.name : null}
            presetIsRH={pageData.presetIsRH}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
