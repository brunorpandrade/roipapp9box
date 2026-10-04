// ROIP APP 9BOX — rota `/dashboard-individual/[id]` (ME-fila7 construcao
// dispatch 3.2/3.3). Dashboard individual com navegacao por trimestre,
// 9-Box, Eixo X/Y, Dados financeiros e Diagnostico IA, a partir de
// `dashboard.getEmployeeDashboard` (S065, trimestre opcional). Escopo PC1f
// pelo guard interno do resolver (DOC 02 §9.10).
//
// **RV-13.** Todo import consumido. `DashboardIndividualClient` abaixo do
// Layout.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { loadCLevelSessionContext } from '../../../lib/session/cLevelSessionContext';
import { loadPlatformMenuContext } from '../../../lib/session/platformMenuContext';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import {
  DASHBOARD_HISTORY_LIMIT_CAP,
  createDashboardRouter,
} from '../../../server/routers/dashboard';
import { getActiveLeaderHistoryByEmployee } from '../../../server/services/employeeLeaderHistory';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import { carregarFichaCadastralAction } from '../../_shared/fichaCadastral/actions';
import { translateDashboardCallerError } from './callerErrorRedirect';
import { DashboardIndividualClient } from './DashboardIndividualClient';
import { headerUserFromSession } from '../../../lib/session/headerUser';
import {
  buildQuarterView,
  currentTrimestreUTC,
  parseEmployeeIdParam,
  pickDefaultTrimestre,
  type DashboardIndividualClientProps,
  type QuarterView,
} from './internals';

const SESSION_COOKIE = 'session';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function DashboardIndividualPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform' && session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id: rawId } = await props.params;
  const employeeId = parseEmployeeIdParam(rawId);
  if (employeeId === null) {
    notFound();
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (token === null) {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCallerFactory(createDashboardRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );

    let dashboard;
    try {
      dashboard = await caller.getEmployeeDashboard({
        employeeId,
        historyLimit: DASHBOARD_HISTORY_LIMIT_CAP,
      });
    } catch (err) {
      translateDashboardCallerError(err, session.kind);
    }

    const trimestresDisponiveis = dashboard.history.map((h) => h.trimestre);
    const trimestreLatest = dashboard.history[0]?.trimestre ?? null;
    const defaultTrimestre = pickDefaultTrimestre(trimestresDisponiveis, currentTrimestreUTC());

    let view: QuarterView;
    if (defaultTrimestre !== null && defaultTrimestre !== trimestreLatest) {
      let snap;
      try {
        snap = await caller.getEmployeeDashboard({ employeeId, trimestre: defaultTrimestre });
      } catch (err) {
        translateDashboardCallerError(err, session.kind);
      }
      view = buildQuarterView({
        trimestre: defaultTrimestre,
        quarterly: snap.latestQuarterly,
        plenitude: snap.latestPlenitude,
        nineBox: snap.latestNineBox,
        nineBoxAnterior: snap.nineBoxAnterior,
        assiduidadeMedia: snap.assiduidadeMedia,
      });
    } else {
      view = buildQuarterView({
        trimestre: trimestreLatest,
        quarterly: dashboard.latestQuarterly,
        plenitude: dashboard.latestPlenitude,
        nineBox: dashboard.latestNineBox,
        nineBoxAnterior: dashboard.nineBoxAnterior,
        assiduidadeMedia: dashboard.assiduidadeMedia,
      });
    }

    const isSuper = session.kind === 'super_admin';
    const empCompanyId = dashboard.employee.companyId;
    const toIsoDate = (d: Date | null): string | null =>
      d != null ? d.toISOString().slice(0, 10) : null;
    // ME 3.5.1 Debito B (§3.1 operação v15) — editHref precisa ficar
    // visivel tambem para RH nativo (rh/rh_lider) e para clevel+isRH
    // (Michelle/Embrastec pos-ME 3.5). RH-like usa a rota base
    // `/colaborador/[eid]/editar`; Super Admin usa a variante
    // super-admin (§10.9 CAMADA_AUTH). Fora dessas duas classes o
    // botao "Editar cadastro" permanece oculto (guard duro do drawer
    // ficha cadastral em §14.10).
    let editHref: string | null = null;
    if (isSuper) {
      editHref = `/super-admin/empresa/${empCompanyId}/colaborador/${dashboard.employee.id}/editar`;
    } else if (session.kind === 'platform') {
      if (session.role === 'rh' || session.role === 'rh_lider') {
        editHref = `/colaborador/${dashboard.employee.id}/editar`;
      } else if (session.role === 'clevel') {
        const cctx = await loadCLevelSessionContext(client.db, session.companyId, session.userId);
        if (cctx !== null && cctx.isRH === true) {
          editHref = `/colaborador/${dashboard.employee.id}/editar`;
        }
      }
    }
    // Flag canonica unificada §14.25.4 (estendida) — controla os DOIS
    // botoes de acao consultiva: [Dialogos de desenvolvimento] E o FAB
    // Chat IA. Regra canonica pos-retomada empirica: aparecem apenas
    // para super_admin (Bruno) e lider direto atual do colaborador. Um
    // lider superior na cadeia (que nao e o direto) NAO ve nenhum dos
    // dois. Perfis suportados como "lider direto":
    //   - `lider` / `rh_lider` (lider employee): activeLeader.liderId
    //     === session.userId.
    //   - `clevel` (lider C-level via §4.6 DOC 01 — liderId XOR
    //     clevelId): activeLeader.clevelId === session.userId. Canonizado
    //     no patch v5 apos retomada empirica: C-level Cenario 1/2 e
    //     canonicamente simetrico a Lider Cenario 1/2 em permissoes.
    // Backend NAO retorna flag `true` para papeis sem permissao.
    // NOTA canonica v5: Chat IA para C-level lider direto e habilitado
    // (router aiChat ja aceita clevel). Dialogos para C-level lider
    // direto AINDA nao — depende de v6 (reescrita §10.1 + schema
    // clevelId em developmentDialogs). Ate la, flag serve ambos os
    // botoes mas o router Dialogos rejeita clevel em write; drawer
    // abriria vazio ate v6. Trade-off aceito canonicamente para
    // fechamento parcial da RETOMADA.
    let podeVerAcoesLiderDireto = false;
    if (isSuper) {
      podeVerAcoesLiderDireto = true;
    } else if (
      session.kind === 'platform' &&
      (session.role === 'lider' || session.role === 'rh_lider')
    ) {
      const activeLeader = await getActiveLeaderHistoryByEmployee(client.db, dashboard.employee.id);
      if (activeLeader !== undefined && activeLeader.liderId === session.userId) {
        podeVerAcoesLiderDireto = true;
      }
    } else if (session.kind === 'platform' && session.role === 'clevel') {
      const activeLeader = await getActiveLeaderHistoryByEmployee(client.db, dashboard.employee.id);
      if (activeLeader !== undefined && activeLeader.clevelId === session.userId) {
        podeVerAcoesLiderDireto = true;
      }
    }
    const clientProps: DashboardIndividualClientProps = {
      variant: isSuper ? 'super_admin' : 'platform',
      employee: {
        id: dashboard.employee.id,
        companyId: empCompanyId,
        name: dashboard.employee.name,
        departamento: dashboard.employee.departamento,
        jobFamily: dashboard.employee.jobFamily,
        senioridade: dashboard.employee.senioridade,
        nivelHierarquico: dashboard.employee.nivelHierarquico,
        status: dashboard.employee.status,
        isLider: dashboard.employee.isLider,
        dataNascimento: toIsoDate(dashboard.employee.dataNascimento),
        dataAdmissao: toIsoDate(dashboard.employee.dataAdmissao),
        liderDireto: dashboard.employee.liderDireto,
        photoUrl: dashboard.employee.photoUrl,
      },
      trimestresDisponiveis,
      view,
      fichaLoadAction: carregarFichaCadastralAction,
      editHref,
      hideRf: !isSuper,
      podeVerAcoesLiderDireto,
    };

    if (session.kind === 'super_admin') {
      const companyId = dashboard.employee.companyId;
      const company = await findCompanyDisplayInfo(client.db, companyId);
      if (company === null) {
        notFound();
      }
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
        throw new Error(`Menu ausente para ${profileKey}.`);
      }
      return (
        <Layout
          menuItems={menuItems}
          header={{
            leftMode: 'in_company',
            companyDisplayName: company.nomeFantasia,
            companyLogoUrl: company.logoUrl ?? undefined,
            user: headerUserFromSession(session),
            showNotificationBell: true,
          }}
          superAdminContext={{ companyDisplayName: company.nomeFantasia }}
        >
          <DashboardIndividualClient {...clientProps} />
        </Layout>
      );
    }

    const menuCtx = await loadPlatformMenuContext(client.db, session);
    if (menuCtx === null) {
      redirect('/');
    }
    return (
      <Layout
        menuItems={menuCtx.menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: headerUserFromSession(session),
          showNotificationBell: menuCtx.showNotificationBell,
        }}
      >
        <DashboardIndividualClient {...clientProps} />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
