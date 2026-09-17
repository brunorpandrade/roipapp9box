// ROIP APP 9BOX — rota `/dashboard-individual/[id]` (ME-fila7 construcao
// dispatch 3, fase 1). Dashboard individual read-only: 9-Box, Eixo X/Y e
// Diagnostico IA, a partir de `dashboard.getEmployeeDashboard` (S065).
// Escopo PC1f aplicado pelo guard interno do resolver (DOC 02 §9.10).
//
// Origem canonica:
// - DOC 05 §14.25 + §10 (Diagnostico IA).
// - DOC 02 §9.10/§10.4 (PC1f + acesso Bruno via super-admin).
// - Mockup `dashboard_individual_v7.html`.
//
// **RV-13.** Todo import consumido. `DashboardIndividualClient` abaixo
// do Layout.
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
import { createDashboardRouter } from '../../../server/routers/dashboard';
import { getServerSession } from '../../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../../server/trpc';

import { DashboardIndividualClient } from './DashboardIndividualClient';
import {
  currentTrimestreUTC,
  parseEmployeeIdParam,
  type DashboardIndividualClientProps,
  type DimensaoAC,
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
      dashboard = await caller.getEmployeeDashboard({ employeeId });
    } catch (err) {
      if (err instanceof TRPCError && err.code === 'FORBIDDEN') {
        redirect('/access-denied?rota=/dashboard-individual');
      }
      if (err instanceof TRPCError && err.code === 'NOT_FOUND') {
        notFound();
      }
      throw err;
    }

    const q = dashboard.latestQuarterly;
    const p = dashboard.latestPlenitude;
    const nb = dashboard.latestNineBox;
    const trimestre = q?.trimestre ?? null;

    const dimensoes: DimensaoAC[] =
      p !== null
        ? [
            { label: 'Engajamento', a: p.engajamentoA, c: p.engajamentoC },
            { label: 'Desenvolvimento', a: p.desenvolvimentoA, c: p.desenvolvimentoC },
            { label: 'Pertencimento', a: p.pertencimentoA, c: p.pertencimentoC },
            { label: 'Realização', a: p.realizacaoA, c: p.realizacaoC },
          ]
        : [];

    const clientProps: DashboardIndividualClientProps = {
      variant: session.kind === 'super_admin' ? 'super_admin' : 'platform',
      employee: {
        id: dashboard.employee.id,
        name: dashboard.employee.name,
        departamento: dashboard.employee.departamento,
        jobFamily: dashboard.employee.jobFamily,
        senioridade: dashboard.employee.senioridade,
        nivelHierarquico: dashboard.employee.nivelHierarquico,
        isLider: dashboard.employee.isLider,
      },
      trimestre,
      isTrimestreAtual: trimestre !== null && trimestre === currentTrimestreUTC(),
      eixoX:
        q !== null
          ? {
              indiceDesempenho: q.indiceDesempenho,
              faixaDesempenho: q.faixaDesempenho,
              capacidadeOciosa: q.capacidadeOciosa,
            }
          : null,
      eixoY:
        p !== null
          ? {
              plenitudeScore: p.plenitudeScore,
              faixaPlenitude: p.faixaPlenitude,
              divergencia: p.divergencia,
              alertaDivergencia: p.alertaDivergencia === true,
              dimensoes,
            }
          : null,
      nineBox:
        nb !== null
          ? {
              posicaoX: nb.posicaoX,
              posicaoY: nb.posicaoY,
              quadrante: nb.quadrante,
              direcaoMovimento: nb.direcaoMovimento,
            }
          : null,
      diagnostico: {
        texto: q?.diagnosticoIA ?? null,
        geradoEm: q?.diagnosticoIAgeradoEm != null ? q.diagnosticoIAgeradoEm.toISOString() : null,
      },
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
