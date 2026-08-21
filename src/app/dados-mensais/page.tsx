// ROIP APP 9BOX — rota canonica base RH `/dados-mensais` (§14.13,
// ME-086b). SEGUNDA das duas rotas RH-facing da ME-086b.
//
// Origem canonica:
// - CAMADA_UI §14.13 (dados mensais RH — abas RH + Lideres +
//   navegacao por mes + comportamento por status + botao `[Solicitar
//   desbloqueio]` D051/D052/D053 + badge `⏳ Solicitação em análise`).
// - CAMADA_UI §14.16 (modal `[Solicitar desbloqueio]` integral).
// - CAMADA_UI §14.17 (botao `[Desbloquear mes]` exclusivo Bruno —
//   NAO renderizado nesta rota RH-facing).
// - CAMADA_AUTH §10.4 linha 825 (matriz canonica): super_admin +
//   rhp + rhl1 + rhl2 apenas — cu + ct + cf + l1 + l2 bloqueados.
// - CAMADA_NEGOCIO §11 (motor de dados mensais + regras de
//   fechamento mensal automatico dia 11).
//
// D-086b-1 A + D-086b-2 B + D-086b-3 A + D-086b-5 A aprovadas
// bit-exact: rota RH renderiza `DadosMensaisClient` compartilhado
// (variant='rh') + injeta 8 actions RH-facing + Aba Lideres canonicamente
// read-only.
//
// Padrao canonico bit-exact ao precedente `/central-relatorios`
// (ME-B9-CR) + `/todos-os-colaboradores` (ME-084): guard defensivo
// canonico + branch RH puro/RH-Lider consumindo `loadRhSessionFlags`
// (helper canonico consolidado ME-086 D-086-10).
//
// **RV-13.** Todo import consumido bit-exact:
//   - `DadosMensaisClient` compartilhado.
//   - `loadRhSessionFlags` (helper canonico).
//   - 8 actions RH-facing.
//   - `getMonthlyClosureStatusByMonth` (SSR do status inicial).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { DadosMensaisClient } from '../../components/dados-mensais/DadosMensaisClient';
import type { DadosMensaisClientActions } from '../../components/dados-mensais/internals';
import { Layout } from '../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../db/client';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { loadRhSessionFlags } from '../../lib/session/rhSessionFlags';
import { getServerSession } from '../../server/session/serverSession';
import { getMonthlyClosureStatusByMonth } from '../../server/services/monthlyClosureStatus';

import {
  criarSolicitacaoDesbloqueioAction,
  getClosureStatusAction,
  getLeadersStatusAction,
  hasPendingUnlockAction,
  listCompanyLeadersRHAction,
  listMesesFechadosAction,
  loadMonthlyFormAction,
  saveMonthlyRHDataAction,
} from './actions';
import { currentMes, parseTabParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  // ME-080a — `?tab=` na URL controla aba inicial (default `rh`).
  readonly searchParams?: Promise<{ tab?: string }>;
}

// -----------------------------------------------------------------------
// Actions canonicas RH-facing injetadas via prop (D-086b-2 B)
// -----------------------------------------------------------------------

const RH_ACTIONS: DadosMensaisClientActions = {
  loadMonthlyForm: loadMonthlyFormAction,
  saveMonthlyRHData: saveMonthlyRHDataAction,
  getClosureStatus: getClosureStatusAction,
  getLeadersStatus: getLeadersStatusAction,
  // Especificas canonicas de variant='rh' (D-086b-2 B):
  createUnlockRequest: criarSolicitacaoDesbloqueioAction,
  hasPendingRequest: hasPendingUnlockAction,
  listMesesFechados: listMesesFechadosAction,
  listCompanyLeaders: listCompanyLeadersRHAction,
  // Especificas canonicas de variant='super_admin' NAO injetadas
  // (unlockMonth, saveMonthlyLeaderData): §14.17 exclusivo Bruno +
  // D-086b-5 A canoniza Aba Lideres read-only para variant='rh'.
};

/**
 * Flags default canonicas para C-level — nao aplicavel nesta rota
 * (matriz §10.4 nega C-level), mas mantidas por simetria bit-exact
 * ao padrao ME-B9-CR.
 */
function defaultCLevelFlags(): { readonly cLevelCount: number; readonly acessoTotal: boolean } {
  return { cLevelCount: 0, acessoTotal: false };
}

export default async function DadosMensaisRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.3 canonica: Bruno usa `/super-admin` (rota RH base sem
  // `companyId` nao faz sentido para ele). Padrao bit-exact
  // `/central-relatorios` (ME-B9-CR).
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  // Guard defense-in-depth bit-exact ao middleware §10.4:
  // super_admin + rh + rh_lider allow; clevel + lider + colaborador deny.
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/dados-mensais');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
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

    // SSR canonico do status inicial do mes corrente.
    const mes = currentMes();
    const closureRow = await getMonthlyClosureStatusByMonth(client.db, session.companyId, mes);
    const initialStatus = closureRow?.status ?? 'aberto';

    // ME-080a — resolve aba inicial a partir de `?tab=` (default `rh`).
    const rawSearch = (await props.searchParams) ?? {};
    const initialTab = parseTabParam(rawSearch.tab);

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
        <DadosMensaisClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          initialMes={mes}
          initialStatus={initialStatus}
          initialTab={initialTab}
          variant="rh"
          actions={RH_ACTIONS}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
