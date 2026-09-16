// ROIP APP 9BOX — rota Bruno `/super-admin/empresa/[id]/turnover`
// (especificacao "Turnover e desligamento" §6/§7, ME-fila6 D2). Mesma
// view de `/turnover`, com drill-down nominal.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { TurnoverView } from '../../../../../components/turnover/TurnoverView';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import {
  listTurnoverDrilldown,
  loadTurnoverPage,
} from '../../../../../server/services/turnoverPanel';
import { getServerSession } from '../../../../../server/session/serverSession';
import { buildDocumentosPadrao } from '../../../../turnover/documentos';
import { parseGrupoDrilldown, parseTrimestreParam } from '../../../../turnover/internals';
import { parseCompanyIdParam } from '../colaborador/[employeeId]/editar/internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TurnoverBrunoPage(props: PageProps): Promise<JSX.Element> {
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

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }
    const params = (await props.searchParams) ?? {};
    const data = await loadTurnoverPage(
      client.db,
      companyId,
      parseTrimestreParam(params.trimestre),
    );
    const grupo = parseGrupoDrilldown(params.grupo);
    const drilldown =
      grupo !== null && data.resumo !== null
        ? await listTurnoverDrilldown(client.db, companyId, data.resumo.trimestre, grupo)
        : [];

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
      throw new Error(`Menu ausente para ${profileKey} — inconsistencia DOC 05 §3`);
    }

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
        <TurnoverView
          data={data}
          basePath={`/super-admin/empresa/${companyId}/turnover`}
          podeDrilldown
          grupo={grupo}
          drilldown={drilldown}
          documentos={buildDocumentosPadrao(companyId)}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
