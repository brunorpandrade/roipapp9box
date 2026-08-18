// ROIP APP 9BOX — rota base RH `/colaborador/[employeeId]/editar`
// (§13.5 + §13.6 + §13.8 + §5.5 + §16.3 + §16.4, ME-084). Variante do
// padrao dual-route L123.
//
// Origem canonica:
// - CAMADA_UI §13.5 (Edicao integral) + §13.6 (modal motivo saida) +
//   §13.8 (M2 v2 transferencia liderados).
// - CAMADA_AUTH §10.9 linha 862 (RH puro/RHL1/RHL2 acessam) + §12 (RF
//   + isRH exclusivos Bruno — canonicamente ocultos via variant='rh').
// - CAMADA_NEGOCIO §5 (RF) + §14 (transferencia liderados) + §16.2 +
//   §16.3 + §16.4 (delecao) + §16.7.
// - CAMADA_DADOS §4.5 + §4.6 + §5.1 + §13.1.
// - MASTER_ESCOPO_B9 §3.3 (ficha ME-084 aprovada em D-B9-3).
//
// Diferencas canonicas bit-exact vs rota super-admin:
// - Rota base, sem prefixo `/super-admin/empresa/[id]`.
// - `employeeId` vem de `params.employeeId` (mantido — identificador do
//   recurso). `companyId` vem de `session.companyId`.
// - Guard defensivo bit-exact `/pendencias-portal`.
// - `notFound()` se employee for de outra empresa (defense-in-depth ao
//   `assertCompanyScope` do router).
// - `ColaboradorEditarClient` compartilhado bit-exact com prop
//   `variant='rh'` + href base `/todos-os-colaboradores` + bag das 13
//   actions RH-facing.
//
// **RV-13.** Todo import consumido. **RV-08.** Zero decisao.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import type { JSX } from 'react';

import { Layout } from '../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../db/client';
import { employeeLeaderHistory, employees } from '../../../../db/schema';
import { COLORS } from '../../../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../server/session/serverSession';

import { ColaboradorEditarClient } from './_client';
import {
  loadColaboradorEditarPage,
  parseEmployeeIdParam,
} from '../../../super-admin/empresa/[id]/colaborador/[employeeId]/editar/internals';

import {
  atualizarColaboradorRHAction,
  buscarCandidatosTransferenciaRHAction,
  definirRFEditarRHAction,
  excluirColaboradorRHAction,
  executarTransferenciaRHAction,
  inativarColaboradorRHAction,
  listarLideradosRHAction,
  pesquisarLiderCandidatosEditarRHAction,
  reativarColaboradorRHAction,
  reatribuirLiderColaboradorRHAction,
  regenerarMatriculaColaboradorRHAction,
  regenerarSenhaColaboradorRHAction,
  verificarInativacaoRHAction,
} from './actions';
import { resolveDatabaseUrl } from '../../../todos-os-colaboradores/internals';

/**
 * §5.4 / §5.5 — resolve flags canonicas de perfil para o menu §3.3-§3.5.
 * Padrao bit-exact reaproveitado das outras rotas RH (L125 futura quando
 * >=3 pages consumirem).
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

interface PageProps {
  readonly params: Promise<{ readonly employeeId: string }>;
}

export default async function ColaboradorEditarRHPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }
  if (session.role !== 'rh' && session.role !== 'rh_lider') {
    redirect('/access-denied?rota=/colaborador/editar');
  }

  const rawParams = await props.params;
  const employeeId = parseEmployeeIdParam(rawParams.employeeId);
  if (employeeId === null) {
    notFound();
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
    const pageData = await loadColaboradorEditarPage(client.db, companyId, employeeId);
    if (pageData === null) {
      // Defense-in-depth ao `assertCompanyScope` do router: employee
      // inexistente OU de outra empresa retorna 404. RH nunca ve mesmo
      // que forcar `employeeId` de outra empresa.
      notFound();
    }

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
              Editar colaborador
            </h1>
            <p
              style={{
                fontSize: 13,
                color: COLORS.text.secondary,
                margin: '4px 0 0 0',
              }}
            >
              {pageData.employee.name} — {session.companyDisplayName}
            </p>
          </div>
          <ColaboradorEditarClient
            companyId={companyId}
            initialEmployee={pageData.employee}
            currentRFName={pageData.currentRF !== null ? pageData.currentRF.name : null}
            variant="rh"
            todosColaboradoresHref="/todos-os-colaboradores"
            actions={{
              atualizarColaborador: atualizarColaboradorRHAction,
              buscarCandidatosTransferencia: buscarCandidatosTransferenciaRHAction,
              definirRFEditar: definirRFEditarRHAction,
              excluirColaborador: excluirColaboradorRHAction,
              executarTransferencia: executarTransferenciaRHAction,
              inativarColaborador: inativarColaboradorRHAction,
              listarLiderados: listarLideradosRHAction,
              pesquisarLiderCandidatosEditar: pesquisarLiderCandidatosEditarRHAction,
              reativarColaborador: reativarColaboradorRHAction,
              reatribuirLiderColaborador: reatribuirLiderColaboradorRHAction,
              regenerarMatriculaColaborador: regenerarMatriculaColaboradorRHAction,
              regenerarSenhaColaborador: regenerarSenhaColaboradorRHAction,
              verificarInativacao: verificarInativacaoRHAction,
            }}
          />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
