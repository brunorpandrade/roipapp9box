// ROIP APP 9BOX — rota `/dashboard-individual/[id]` (ME-fila7 construcao
// dispatch 3.2/3.3). Dashboard individual com navegacao por trimestre,
// 9-Box, Eixo X/Y, Dados financeiros e Diagnostico IA, a partir de
// `dashboard.getEmployeeDashboard` (S065, trimestre opcional). Escopo PC1f
// pelo guard interno do resolver (DOC 02 §9.10).
//
// **RV-13.** Todo import consumido. `DashboardIndividualClient` abaixo do
// Layout.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import { findCompanyDisplayInfo } from '../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../lib/menu/menuConfig';
import { loadPlatformMenuContext } from '../../../lib/session/platformMenuContext';
import { resolveProfileKey } from '../../../lib/session/resolveProfileKey';
import { createRateLimiter } from '../../../server/auth/rateLimit';
import {
  DASHBOARD_HISTORY_LIMIT_CAP,
  createDashboardRouter,
} from '../../../server/routers/dashboard';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import { carregarFichaCadastralAction } from '../../_shared/fichaCadastral/actions';
import { DashboardIndividualClient } from './DashboardIndividualClient';
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
      if (err instanceof TRPCError && err.code === 'FORBIDDEN') {
        redirect('/access-denied?rota=/dashboard-individual');
      }
      if (err instanceof TRPCError && err.code === 'NOT_FOUND') {
        notFound();
      }
      throw err;
    }

    const trimestresDisponiveis = dashboard.history.map((h) => h.trimestre);
    const trimestreLatest = dashboard.history[0]?.trimestre ?? null;
    const defaultTrimestre = pickDefaultTrimestre(trimestresDisponiveis, currentTrimestreUTC());

    let view: QuarterView;
    if (defaultTrimestre !== null && defaultTrimestre !== trimestreLatest) {
      const snap = await caller.getEmployeeDashboard({ employeeId, trimestre: defaultTrimestre });
      view = buildQuarterView({
        trimestre: defaultTrimestre,
        quarterly: snap.latestQuarterly,
        plenitude: snap.latestPlenitude,
        nineBox: snap.latestNineBox,
      });
    } else {
      view = buildQuarterView({
        trimestre: trimestreLatest,
        quarterly: dashboard.latestQuarterly,
        plenitude: dashboard.latestPlenitude,
        nineBox: dashboard.latestNineBox,
      });
    }

    const isSuper = session.kind === 'super_admin';
    const empCompanyId = dashboard.employee.companyId;
    const toIsoDate = (d: Date | null): string | null =>
      d != null ? d.toISOString().slice(0, 10) : null;
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
      },
      trimestresDisponiveis,
      view,
      fichaLoadAction: carregarFichaCadastralAction,
      editHref: isSuper
        ? `/super-admin/empresa/${empCompanyId}/colaborador/${dashboard.employee.id}/editar`
        : null,
      hideRf: !isSuper,
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
            user: { displayName: session.displayName },
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
          user: { displayName: session.displayName },
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
