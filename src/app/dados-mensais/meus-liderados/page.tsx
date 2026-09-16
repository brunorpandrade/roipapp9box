// ROIP APP 9BOX — rota `/dados-mensais/meus-liderados` (DOC 05 §14.14,
// ME-fila1-01; ME-fila6 D1).
//
// Origem:
// - DOC 05 §14.14 (header + navegacao por mes + comportamento por status
//   do mes + botao `[Solicitar desbloqueio]` D053 + tabela por familia de
//   funcao + Familia 6 CC3).
// - DOC 02 §10.4 matriz `/dados-mensais/meus-liderados`:
//     super_admin → redirect_super_admin; rh → allow (estado vazio);
//     rh_lider → allow; clevel → allow; lider → allow.
// - DOC 05 §4.1: sino apenas Bruno e RH.
//
// ME-fila6 D1 (D-MEUS-LIDERADOS-RSC-500):
// - Removidas as closures `async` inline que o page montava para
//   `downloadLeaderTemplateMonthly` e `uploadLeaderDataMonthly`. O Next 15
//   rejeita funcoes comuns na fronteira Server -> Client e a rota
//   respondia 500 para todo perfil com liderados (Lider, RH-Lider,
//   C-level). As actions agora derivam `liderId`/`liderTipo` da sessao e
//   sao injetadas diretamente.
// - Menu, RF e sino resolvidos por `loadPlatformMenuContext` (substitui
//   `loadClevelContext` e `loadLiderChainFlag` locais).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import {
  MeusLideradosClient,
  type MeusLideradosClientActions,
} from '../../../components/dados-mensais/MeusLideradosClient';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { loadPlatformMenuContext } from '../../../lib/session/platformMenuContext';
import { getServerSession } from '../../../server/session/serverSession';
import { getMonthlyClosureStatusByMonth } from '../../../server/services/monthlyClosureStatus';

import {
  criarSolicitacaoDesbloqueioAction,
  downloadLeaderTemplateLeaderAction,
  getClosureStatusAction,
  hasPendingUnlockAction,
  listMesesFechadosAction,
  loadMonthlyFormAction,
  saveMonthlyLeaderDataAction,
  uploadLeaderDataLeaderAction,
} from './actions';

// -----------------------------------------------------------------------
// Actions injetadas via prop — apenas referencias de server actions
// -----------------------------------------------------------------------

const MEUS_LIDERADOS_ACTIONS: MeusLideradosClientActions = {
  loadMonthlyForm: loadMonthlyFormAction,
  saveMonthlyLeaderData: saveMonthlyLeaderDataAction,
  getClosureStatus: getClosureStatusAction,
  createUnlockRequest: criarSolicitacaoDesbloqueioAction,
  hasPendingRequest: hasPendingUnlockAction,
  listMesesFechados: listMesesFechadosAction,
  downloadLeaderTemplateMonthly: downloadLeaderTemplateLeaderAction,
  uploadLeaderDataMonthly: uploadLeaderDataLeaderAction,
};

function currentMes(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default async function MeusLideradosPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.4: Bruno usa `/super-admin` (matrix `redirect_super_admin`).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  // Guard defense-in-depth §10.4: platform allow para
  // {rh, rh_lider, clevel, lider}; demais rejeitados.
  if (
    session.role !== 'rh' &&
    session.role !== 'rh_lider' &&
    session.role !== 'clevel' &&
    session.role !== 'lider'
  ) {
    redirect('/access-denied?rota=/dados-mensais/meus-liderados');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menu = await loadPlatformMenuContext(client.db, session);
    if (menu === null) {
      redirect('/');
    }

    const mes = currentMes();
    const closureRow = await getMonthlyClosureStatusByMonth(client.db, session.companyId, mes);
    const initialStatus = closureRow?.status ?? 'aberto';

    const liderTipo: 'employee' | 'clevel' = session.role === 'clevel' ? 'clevel' : 'employee';

    // RH puro nao tem liderados diretos por definicao (§10.4). Renderiza
    // estado vazio sem invocar as procs do motor.
    const isRhPuro = session.role === 'rh';

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
        <MeusLideradosClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          initialMes={mes}
          initialStatus={initialStatus}
          liderId={session.userId}
          liderTipo={liderTipo}
          isRhPuro={isRhPuro}
          actions={MEUS_LIDERADOS_ACTIONS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
