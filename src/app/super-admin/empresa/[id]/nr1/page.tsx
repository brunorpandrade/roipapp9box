// ROIP APP 9BOX — rota canônica Bruno `/super-admin/empresa/[id]/
// nr1` (§14.28, ME-079b). DÉCIMA SEGUNDA rota de código do bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.28 (integral: 6 estados canônicos + modais +
//   gauge + radar SVG + tabelas convergência/divergência).
// - CAMADA_UI §14.29 (relatório PDF — download via token efêmero).
// - CAMADA_AUTH §10.4 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §11.17 (7 procs tRPC NR-1).
// - CAMADA_DADOS §11.1-§11.6 (6 tabelas NR-1).
// - MASTER_ESCOPO_B8.md §2.1 (pattern canônico) + §3.6.2 (ficha).
//
// Pattern §2.1 canônico preservado via consumo dos helpers
// `getServerSession`, `resolveProfileKey`, `resolveMenuItems`,
// `Layout`, `superAdminContext`.
//
// **RV-13.** Todo import consumido. `Nr1Client` renderizado abaixo
// do Layout. Loader inline no server component (padrão §2.1 B8).
//
// **RV-08.** Nenhuma decisão aqui.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { alerts, copsoqCycles, departments } from '../../../../../db/schema';
import { findCompanyDisplayInfo } from '../../../../../lib/logs/companyHistoryLog';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';
import { createNr1Router } from '../../../../../server/routers/nr1';
import { createCallerFactory, createContextInner } from '../../../../../server/trpc';
import { createRateLimiter } from '../../../../../server/auth/rateLimit';

import { Nr1Client } from './Nr1Client';
import {
  parseCompanyIdParam,
  resolveDatabaseUrl,
  type HistoricalCycleRow,
  type AlertRow,
} from './internals';

// -----------------------------------------------------------------------
// tRPC caller para getCycleDetails (loader)
// -----------------------------------------------------------------------

const nr1Router = createNr1Router();
const createNr1Caller = createCallerFactory(nr1Router);
const loaderRateLimiter = createRateLimiter();

const SESSION_COOKIE = 'session';

// -----------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Nr1Page(props: PageProps): Promise<JSX.Element> {
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

  // Ler raw token do cookie para tRPC caller.
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  const rawToken = sessionCookie?.value ?? '';

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await findCompanyDisplayInfo(client.db, companyId);
    if (company === null) {
      notFound();
    }

    // 1. Ciclo mais recente via tRPC caller.
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: loaderRateLimiter,
        bearerToken: rawToken,
      }),
    );
    const cycleDetails = await caller.getCycleDetails({
      companyId,
    });

    // 2. Histórico de ciclos (Drizzle direto).
    const historicalCyclesRaw = await client.db
      .select({
        id: copsoqCycles.id,
        ciclo: copsoqCycles.ciclo,
        dataAbertura: copsoqCycles.dataAbertura,
        dataFechamento: copsoqCycles.dataFechamento,
        status: copsoqCycles.status,
      })
      .from(copsoqCycles)
      .where(eq(copsoqCycles.companyId, companyId))
      .orderBy(desc(copsoqCycles.dataAbertura))
      .limit(50);

    // 3. Alertas NR-1 (Drizzle direto).
    const nr1AlertsRaw = await client.db
      .select({
        id: alerts.id,
        tipo: alerts.tipo,
        severidade: alerts.severidade,
        escopo: alerts.escopo,
        escopoDepartamentoId: alerts.escopoDepartamentoId,
        cicloDbId: alerts.cicloDbId,
        fatorId: alerts.fatorId,
        scoreValor: alerts.scoreValor,
        createdAt: alerts.createdAt,
      })
      .from(alerts)
      .where(and(eq(alerts.companyId, companyId), eq(alerts.tipo, 'nr1_fator_critico')))
      .orderBy(desc(alerts.createdAt))
      .limit(100);

    // 4. Resolver nomes de departamentos para alertas.
    const deptIds = new Set(
      nr1AlertsRaw.map((a) => a.escopoDepartamentoId).filter((d): d is number => d !== null),
    );
    const deptMap = new Map<number, string>();
    if (deptIds.size > 0) {
      const deptRows = await client.db
        .select({
          id: departments.id,
          nome: departments.nome,
        })
        .from(departments)
        .where(inArray(departments.id, [...deptIds]));
      for (const d of deptRows) {
        deptMap.set(d.id, d.nome);
      }
    }

    const alertRows: AlertRow[] = nr1AlertsRaw.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      severidade: a.severidade ?? null,
      escopo: a.escopo ?? null,
      escopoDepartamentoId: a.escopoDepartamentoId ?? null,
      departamentoNome:
        a.escopoDepartamentoId !== null ? (deptMap.get(a.escopoDepartamentoId) ?? null) : null,
      cicloDbId: a.cicloDbId ?? null,
      fatorId: a.fatorId ?? null,
      scoreValor: a.scoreValor !== null ? String(a.scoreValor) : null,
      createdAt: a.createdAt !== null ? a.createdAt.toISOString() : null,
    }));

    const historicalRows: HistoricalCycleRow[] = historicalCyclesRaw.map((c) => ({
      id: c.id,
      ciclo: c.ciclo,
      dataAbertura: String(c.dataAbertura),
      dataFechamento: String(c.dataFechamento),
      status: c.status,
    }));

    // Menu e Layout §2.1.
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
      throw new Error(`Menu canonico ausente para ${profileKey} — ` + 'inconsistencia §3');
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
        superAdminContext={{
          companyDisplayName: company.nomeFantasia,
        }}
      >
        <Nr1Client
          companyId={companyId}
          companyName={company.nomeFantasia}
          initialCycleDetails={cycleDetails}
          historicalCycles={historicalRows}
          nr1Alerts={alertRows}
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
