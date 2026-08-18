// ROIP APP 9BOX — rota base RH `/colaborador/novo` (§13.4, ME-084).
// Variante do padrao dual-route L123.
//
// Origem canonica:
// - CAMADA_UI §13.4 (Cadastro colaborador integral) — 7 secoes canonicas.
// - CAMADA_AUTH §10.9 linha 862 (RH puro/RHL1/RHL2 acessam) + §12 (RF
//   exclusivo Bruno + `isRH` toggle exclusivo Bruno — canonicamente
//   ocultos via variant='rh' do ColaboradorForm).
// - CAMADA_NEGOCIO §5 (RF) + §16.2 (Cadastro colaborador).
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`).
// - MASTER_ESCOPO_B9 §3.3 (ficha canonica ME-084 aprovada em D-B9-3).
//
// Diferencas canonicas bit-exact vs rota super-admin:
// - Rota base, sem prefixo `/super-admin/empresa/[id]`.
// - Escopa `companyId` de `session.companyId` (nao de `params.id`).
// - Sem query param `preset=rh` (Bruno-exclusive DOC 02 §10.9 linha 864).
// - Header sem `superAdminContext`, `leftMode: 'in_company'`.
// - Menu `MENU_RH_PURO` / `MENU_RH_LIDER_C1` / `MENU_RH_LIDER_C2`.
// - `ColaboradorNovoClient` compartilhado bit-exact com prop
//   `variant='rh'` (oculta toggles Bruno-exclusive) + hrefs base
//   `/todos-os-colaboradores` + actions RH-facing.
//
// **RV-13.** Todo import consumido. **RV-08.** Zero decisao.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { employeeLeaderHistory, employees } from '../../../db/schema';
import { COLORS } from '../../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../server/session/serverSession';

import { ColaboradorNovoClient } from './_client';
import { loadColaboradorNovoPage } from '../../super-admin/empresa/[id]/colaborador/novo/internals';

import {
  criarColaboradorRHAction,
  definirRFRHAction,
  pesquisarLiderCandidatosRHAction,
} from './actions';
import { resolveDatabaseUrl } from '../../todos-os-colaboradores/internals';

/**
 * §5.4 / §5.5 — resolve flags canonicas de perfil para o menu §3.3-§3.5.
 * Bit-exact ao helper reutilizado em `/todos-os-colaboradores/page.tsx`
 * e `/pendencias-portal/page.tsx`. Extracao para helper compartilhado
 * ficara para bloco futuro (padrao S366 preserva localizacao com page
 * enquanto <=3 rotas consomem).
 */
async function resolveMenuFlagsForRH(
  db: ReturnType<typeof createDbClient>['db'],
  userId: number,
): Promise<{
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly hasDescendingChain: boolean;
}> {
  const rows = await db
    .select({ isRH: employees.isRH, isLider: employees.isLider })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  const emp = rows[0];
  const isRH = emp?.isRH ?? false;
  const isLider = emp?.isLider ?? false;

  if (!isLider) {
    return { isRH, isLider, hasDescendingChain: false };
  }
  const chainRows = await db
    .select({ id: employees.id })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, userId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.isLider, true),
      ),
    )
    .limit(1);
  return { isRH, isLider, hasDescendingChain: chainRows.length > 0 };
}

export default async function ColaboradorNovoRHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    // Bruno tem rota canonica dedicada — nao usa base RH.
    redirect('/super-admin');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/colaborador/novo');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const menuFlags = await resolveMenuFlagsForRH(client.db, session.userId);
    const profileKey = resolveProfileKey({
      session,
      isRH: menuFlags.isRH,
      isLider: menuFlags.isLider,
      acessoTotal: false,
      hasDescendingChain: menuFlags.hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }

    const companyId = session.companyId;
    // RH nunca envia preset=rh (Bruno-exclusive DOC 02 §10.9 linha 864).
    const pageData = await loadColaboradorNovoPage(client.db, companyId, null);

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
              Cadastro de colaborador
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              {session.companyDisplayName}
            </p>
          </div>
          <ColaboradorNovoClient
            companyId={companyId}
            currentRFName={pageData.currentRF !== null ? pageData.currentRF.name : null}
            presetIsRH={false}
            variant="rh"
            todosColaboradoresHref="/todos-os-colaboradores"
            presetRHBackHref="/todos-os-colaboradores"
            criarColaborador={criarColaboradorRHAction}
            definirRF={definirRFRHAction}
            pesquisarLiderCandidatos={pesquisarLiderCandidatosRHAction}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
