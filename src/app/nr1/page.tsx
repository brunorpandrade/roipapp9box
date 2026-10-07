// ROIP APP 9BOX — rota canonica RH `/nr1` (§14.28, ME-B11.1b, NR1·2).
//
// Historia canonica:
// - ME 3.5 D6: substituido guard historico `role IN {'rh','rh_lider'}`
//   pelo helper canonico `loadRhLikePageContext` (admite C-level com
//   `cLevelMembers.isRH=true`).
// - ME-B11.1b (NR1·2): ampliado o loader para carregar
//   `historicalCycles` + `nr1Alerts` + resolver nomes de departamento,
//   payloads identicos ao Super Admin em
//   `/super-admin/empresa/[id]/nr1/page.tsx`. Props do `Nr1Client` sao
//   as mesmas (canonicas unicas): `companyId`, `companyName`,
//   `initialCycleDetails`, `historicalCycles`, `nr1Alerts`.
//
// Antes desta ME, o loader passava apenas `cycleDetails` + um stub de
// `collectionStatus`/`rhFlags`/`company` ao `Nr1Client` local — que era
// o pseudo-conteudo cru de 28 linhas. Agora o `Nr1Client` local
// reexporta o canonico de Super Admin (ver `Nr1Client.tsx` desta rota).
//
// Permissoes canonicas (DOC 03 §11.2, §11.17): o router `nr1` expoe
// `configureCycle` / `editClosingDate` / `cancelCycle` /
// `startDownloadToken` como `rhAllowedProcedure()` — RH e Bruno
// compartilham a mesma matriz de acoes.
//
// **RV-13.** Chamador: Next.js router (`/nr1`). `Nr1Client` consumido.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, desc, eq, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { PainelToggle } from '../../components/shell/PainelToggle';
import { closeDbClient, createDbClient } from '../../db/client';
import { alerts, copsoqCycles, departments } from '../../db/schema';
import { toIsoDateUtc } from '../../lib/date/toIsoDateUtc';
import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl';
import { headerUserFromSession } from '../../lib/session/headerUser';
import { loadRhLikePageContext } from '../../lib/session/loadRhLikePageContext';
import { createRateLimiter } from '../../server/auth/rateLimit';
import { createNr1Router } from '../../server/routers/nr1';
import { getServerSession } from '../../server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../server/trpc';
import type { AlertRow, HistoricalCycleRow } from '../super-admin/empresa/[id]/nr1/internals';

import { Nr1Client } from './Nr1Client';

const nr1Router = createNr1Router();
const createNr1Caller = createCallerFactory(nr1Router);
const pageRateLimiter = createRateLimiter();
const SESSION_COOKIE = 'session';

export default async function Nr1RHPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind === 'super_admin') {
    redirect('/super-admin');
  }

  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  if (bearerToken === null) {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rhCtx = await loadRhLikePageContext(client.db, session);
    if (rhCtx === null) {
      redirect('/access-denied?rota=/nr1');
    }

    const companyId = session.companyId;

    // 1. Ciclo mais recente via tRPC caller.
    const caller = createNr1Caller(
      createContextInner({
        db: client.db,
        rateLimiter: pageRateLimiter,
        bearerToken,
      }),
    );
    const cycleDetails = await caller.getCycleDetails({
      companyId,
    });

    // 2. Historico de ciclos (Drizzle direto) — mesmo payload
    // canonico do Super Admin. NR1·6: serializacao via toIsoDateUtc
    // (nao mais `String(dateObj)`, que produzia `Date.toString()`).
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

    // 3. Alertas NR-1 (Drizzle direto) — mesma query canonica.
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
      dataAbertura: toIsoDateUtc(c.dataAbertura) ?? '',
      dataFechamento: toIsoDateUtc(c.dataFechamento) ?? '',
      status: c.status,
    }));

    return (
      <Layout
        menuItems={rhCtx.menuItems}
        panelToggle={
          rhCtx.canToggleMenuMode ? <PainelToggle currentMode={rhCtx.menuMode} /> : undefined
        }
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: session.companyLogoUrl ?? undefined,
          user: headerUserFromSession(session),
          showNotificationBell: !rhCtx.isCLevelActingAsRH,
        }}
      >
        <Nr1Client
          companyId={companyId}
          companyName={session.companyDisplayName || 'Empresa'}
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
