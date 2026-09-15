// ROIP APP 9BOX — rota canonica `/dados-mensais/meus-liderados`
// (DOC 05 §14.14, ME-fila1-01).
//
// Endereca D-DATA-MENSAIS-MEUS-LIDERADOS-STUB. Ate esta ME, o menu de
// Lider/RH-Lider/C-level apontava para essa rota mas o `page.tsx` nao
// existia — clique gerava 404. Rota consolidada bit-a-bit canonica.
//
// Origem canonica:
// - DOC 05 §14.14 (integral — header + navegacao por mes + comportamento
//   por status + botao `[Solicitar desbloqueio]` D053 + tabela por
//   familia de funcao + tratamento Familia 6 CC3).
// - DOC 02 §10.4 matriz `/dados-mensais/meus-liderados`:
//     super_admin → redirect_super_admin; rh → allow (renderiza estado
//     vazio); rh_lider → allow; clevel → allow; lider → allow.
// - DOC 03 §3.11 + §4.7 (motor de dados mensais + comportamento por
//   status do mes).
//
// Padrao arquitetural bit-a-bit ao precedente `/dados-mensais` RH
// (ME-086b): guard defensivo + `resolveProfileKey` + `resolveMenuItems`
// + SSR do status inicial + `Layout` + client component compartilhado
// consumindo actions injetadas via prop.
//
// **RV-13.** Todo import consumido:
//   - `MeusLideradosClient` compartilhado (novo, `src/components/
//     dados-mensais/`).
//   - `requireLiderRHLiderOrClevel` (novo guard).
//   - `resolveProfileKey`, `resolveMenuItems`, `loadRhSessionFlags`.
//   - 6 actions locais (RV-13 injecao via prop `actions`).
//   - `getMonthlyClosureStatusByMonth` (SSR do status inicial).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import {
  MeusLideradosClient,
  type MeusLideradosClientActions,
} from '../../../components/dados-mensais/MeusLideradosClient';
import { closeDbClient, createDbClient, type RoipDatabase } from '../../../db/client';
import { cLevelMembers, employees, employeeLeaderHistory } from '../../../db/schema';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { loadRhSessionFlags } from '../../../lib/session/rhSessionFlags';
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
// Actions canonicas injetadas via prop
// -----------------------------------------------------------------------

const MEUS_LIDERADOS_ACTIONS: MeusLideradosClientActions = {
  loadMonthlyForm: loadMonthlyFormAction,
  saveMonthlyLeaderData: saveMonthlyLeaderDataAction,
  getClosureStatus: getClosureStatusAction,
  createUnlockRequest: criarSolicitacaoDesbloqueioAction,
  hasPendingRequest: hasPendingUnlockAction,
  listMesesFechados: listMesesFechadosAction,
};

// -----------------------------------------------------------------------
// Helpers de mes canonicos (paridade bit-a-bit com internals do
// `/dados-mensais` RH — ambos derivam o mes corrente no server)
// -----------------------------------------------------------------------

function currentMes(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// -----------------------------------------------------------------------
// Helpers de sessao canonicos por perfil
// -----------------------------------------------------------------------

/**
 * Resolve cLevelCount + acessoTotal do C-level autenticado. Uso canonico
 * paralelo ao painel-clevel — necessario para `resolveProfileKey` +
 * distincao `clevel_full` vs `clevel_restricted` no menu.
 */
async function loadClevelContext(
  db: RoipDatabase,
  userId: number,
): Promise<{
  acessoTotal: boolean;
  cLevelCount: number;
  isResponsavelFinanceiro: boolean;
} | null> {
  const memberRows = await db
    .select({
      acessoTotal: cLevelMembers.acessoTotal,
      isResponsavelFinanceiro: cLevelMembers.isResponsavelFinanceiro,
      companyId: cLevelMembers.companyId,
    })
    .from(cLevelMembers)
    .where(eq(cLevelMembers.id, userId))
    .limit(1);
  const member = memberRows[0];
  if (member === undefined) {
    return null;
  }
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, member.companyId), eq(cLevelMembers.status, 'ativo')));
  return {
    acessoTotal: member.acessoTotal === true,
    isResponsavelFinanceiro: member.isResponsavelFinanceiro === true,
    cLevelCount: Number(countRows[0]?.count ?? 0),
  };
}

/**
 * Resolve `hasDescendingChain` do Lider puro. RH-Lider tem helper
 * dedicado (`loadRhSessionFlags`); Lider puro replica a mesma logica
 * canonica sem carregar as demais flags de RH.
 */
async function loadLiderChainFlag(
  db: RoipDatabase,
  userId: number,
): Promise<{ hasDescendingChain: boolean; isRH: boolean; isLider: boolean } | null> {
  const rows = await db
    .select({
      isRH: employees.isRH,
      isLider: employees.isLider,
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
    hasDescendingChain: chainRows.length > 0,
    isRH: row.isRH === true,
    isLider: row.isLider === true,
  };
}

// -----------------------------------------------------------------------
// Page principal
// -----------------------------------------------------------------------

export default async function MeusLideradosPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // §10.4 canonica: Bruno usa `/super-admin` (rota base sem `companyId`
  // nao faz sentido para ele — matrix `redirect_super_admin`).
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
    // Resolucao canonica do menu por perfil (§3.3-§3.9).
    let profileKeyInput: Parameters<typeof resolveProfileKey>[0];
    let isResponsavelFinanceiro = false;

    if (session.role === 'rh' || session.role === 'rh_lider') {
      const menuFlags = await loadRhSessionFlags(client.db, session.userId);
      if (menuFlags === null) {
        redirect('/');
      }
      isResponsavelFinanceiro = menuFlags.isResponsavelFinanceiro;
      profileKeyInput = {
        session,
        isRH: menuFlags.isRH,
        isLider: menuFlags.isLider,
        acessoTotal: false,
        hasDescendingChain: menuFlags.hasDescendingChain,
        cLevelCount: 0,
        isSuperAdminInCompany: false,
      };
    } else if (session.role === 'clevel') {
      const cLevelContext = await loadClevelContext(client.db, session.userId);
      if (cLevelContext === null) {
        redirect('/');
      }
      isResponsavelFinanceiro = cLevelContext.isResponsavelFinanceiro;
      profileKeyInput = {
        session,
        isRH: false,
        isLider: false,
        acessoTotal: cLevelContext.acessoTotal,
        hasDescendingChain: false,
        cLevelCount: cLevelContext.cLevelCount,
        isSuperAdminInCompany: false,
      };
    } else {
      // session.role === 'lider'
      const liderContext = await loadLiderChainFlag(client.db, session.userId);
      if (liderContext === null) {
        redirect('/');
      }
      profileKeyInput = {
        session,
        isRH: liderContext.isRH,
        isLider: liderContext.isLider,
        acessoTotal: false,
        hasDescendingChain: liderContext.hasDescendingChain,
        cLevelCount: 0,
        isSuperAdminInCompany: false,
      };
    }

    const profileKey = resolveProfileKey(profileKeyInput);
    const menuItems = resolveMenuItems(profileKey, isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    // SSR canonico do status inicial do mes corrente.
    const mes = currentMes();
    const closureRow = await getMonthlyClosureStatusByMonth(client.db, session.companyId, mes);
    const initialStatus = closureRow?.status ?? 'aberto';

    // Titular canonico: liderId = session.userId; liderTipo derivado
    // do role (clevel → 'clevel'; demais → 'employee').
    const liderTipo: 'employee' | 'clevel' = session.role === 'clevel' ? 'clevel' : 'employee';

    // ME-fila5 D3 (Item 5.6) — wire actions monthly-leader com closure
    // sobre liderId + liderTipo (o modal nao os conhece).
    const liderId = session.userId;
    const meusLideradosActions: MeusLideradosClientActions = {
      ...MEUS_LIDERADOS_ACTIONS,
      downloadLeaderTemplateMonthly: async ({ companyId, mes: mesInput }) => {
        return downloadLeaderTemplateLeaderAction({
          companyId,
          mes: mesInput,
          liderId,
          liderTipo,
        });
      },
      uploadLeaderDataMonthly: async ({ companyId, mes: mesInput, xlsxBase64 }) => {
        return uploadLeaderDataLeaderAction({
          companyId,
          mes: mesInput,
          liderId,
          liderTipo,
          xlsxBase64,
        });
      },
    };

    // RH puro nao tem liderados diretos por definicao canonica (§10.4
    // linha 285 — "RH puro (sem liderados) recebe conjunto vazio via
    // resolver"). Renderiza estado vazio canonico sem invocar as procs
    // do motor — o proc `getMonthlyInputForm` bloquearia por perfil.
    const isRhPuro = session.role === 'rh';

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
        <MeusLideradosClient
          companyId={session.companyId}
          companyName={session.companyDisplayName}
          initialMes={mes}
          initialStatus={initialStatus}
          liderId={session.userId}
          liderTipo={liderTipo}
          isRhPuro={isRhPuro}
          actions={meusLideradosActions}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
