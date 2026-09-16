// ROIP APP 9BOX — rota `/turnover` (especificacao "Turnover e
// desligamento" §6/§7, ME-fila6 D2).
//
// Acesso: RH puro, RH-Lider (com drill-down) e C-level com acesso total
// (sem drill-down — Q1 Opcao B). Bruno usa
// `/super-admin/empresa/[id]/turnover`. Lider e C-level restrito vao para
// acesso negado.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { TurnoverView } from '../../components/turnover/TurnoverView';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import { listTurnoverDrilldown, loadTurnoverPage } from '../../server/services/turnoverPanel';
import { getServerSession } from '../../server/session/serverSession';

import { buildDocumentosPadrao } from './documentos';
import { parseGrupoDrilldown, parseTrimestreParam, resolveTurnoverAccess } from './internals';

interface PageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TurnoverPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }
    const access = await resolveTurnoverAccess(client.db, session, null);
    if (access === null) {
      redirect('/access-denied?rota=/turnover');
    }
    const params = (await props.searchParams) ?? {};
    const data = await loadTurnoverPage(
      client.db,
      access.companyId,
      parseTrimestreParam(params.trimestre),
    );
    const grupo = access.podeDrilldown ? parseGrupoDrilldown(params.grupo) : null;
    const drilldown =
      grupo !== null && data.resumo !== null
        ? await listTurnoverDrilldown(client.db, access.companyId, data.resumo.trimestre, grupo)
        : [];

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
        <TurnoverView
          data={data}
          basePath="/turnover"
          podeDrilldown={access.podeDrilldown}
          grupo={grupo}
          drilldown={drilldown}
          documentos={buildDocumentosPadrao(null)}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
