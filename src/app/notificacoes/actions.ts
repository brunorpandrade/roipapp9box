// ROIP APP 9BOX — server actions canonicas da rota /notificacoes (ME-057a).
//
// Origem canonica:
// - DOC 05 §14.19 (Rota `/notificacoes`) — acoes de marcacao lida e
//   arquivamento, individuais e em lote.
// - DOC 01 §12.4 (`notifications` imutavel em producao — nunca DELETE;
//   apenas `lidaEm` e `arquivadaEm` ortogonais).
// - DOC 02 §10.5 + §9.7 (matriz da rota `/notificacoes` — allow Bruno +
//   RH; deny C-level + Lider). Middleware `middleware.ts` ja filtra o
//   acesso — as actions verificam defensivamente a sessao antes de agir.
// - S299 (S313): faixa CNPJ ME-057a principal 10110..10119.
//
// Contrato canonico:
// - Todas as actions server-side ('use server'), invocadas via
//   `startTransition` do client component.
// - Cada action resolve a sessao via `getServerSession()` e monta o
//   guard canonico de destinatario:
//     - super_admin → destinatarioTipo='bruno', destinatarioEmployeeId=NULL
//     - platform + role in ('rh','rh_lider') → destinatarioTipo='rh',
//       destinatarioEmployeeId=session.userId
//     - qualquer outro role → excecao (defense-in-depth; middleware nao
//       deveria deixar chegar aqui).
// - Guards do service `notifications` (destClause com (tipo, empId))
//   protegem contra cross-tenant: notificacoes de outro RH nao sao
//   afetadas mesmo quando o id e legitimo.
// - Actions de mutation em lote iteram ids (sem WHERE `IN(...)` porque
//   o service ja tem o setter granular canonico; a coerencia
//   transacional NAO e canonicamente exigida — cada notif e uma unidade
//   independente; erro em uma nao invalida as demais). O caller
//   contabiliza as linhas afetadas e devolve o total.
// - RV-12 (100% Drizzle tipado): toda persistencia via
//   `services/notifications.ts` (ME-017) — ja usa Drizzle tipado.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `marcarLidaAction`, `marcarNaoLidaAction`, `arquivarAction`,
//     `desarquivarAction`, `marcarLidasLoteAction`, `arquivarLoteAction`,
//     `listarNotificacoesAction` → `NotificacoesClient.tsx`.

'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../db/client';
import { notifications } from '../../db/schema';
import { getServerSession, type ServerSession } from '../../server/session/serverSession';
import { archiveNotification, markNotificationRead } from '../../server/services/notifications';

import type { NotificacoesFilters } from './filters';
import type { NotificacoesListResult } from './internals';

// -----------------------------------------------------------------------
// Contexto canonico do destinatario
// -----------------------------------------------------------------------

interface DestinatarioContext {
  readonly tipo: 'bruno' | 'rh';
  readonly employeeId: number | null;
}

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Guarda canonica de destinatario a partir da `ServerSession`. Espelha
 * bit-exact o guard do `page.tsx`. Lanca se a sessao nao habilitar a
 * rota — defense-in-depth ao middleware.
 */
function resolveDestinatario(session: ServerSession): DestinatarioContext {
  if (session.kind === 'super_admin') {
    return { tipo: 'bruno', employeeId: null };
  }
  if (session.role === 'rh' || session.role === 'rh_lider') {
    return { tipo: 'rh', employeeId: session.userId };
  }
  throw new Error(
    `resolveDestinatario: role ${session.role} nao habilitada em /notificacoes ` +
      '(middleware §10.5 deveria ter bloqueado)',
  );
}

/**
 * Session guard consolidado usado por todas as mutations. Retorna a
 * sessao verificada; lanca quando ausente (o proprio ato de rodar uma
 * action requer sessao ativa).
 */
async function requireSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error('requireSession: sessao ausente — usuario deve reautenticar');
  }
  return session;
}

// -----------------------------------------------------------------------
// Actions singulares
// -----------------------------------------------------------------------

/**
 * Marca uma notificacao como lida. Idempotente (marcar lida quando ja
 * lida sobrescreve `lidaEm` com o novo timestamp — coerente com
 * `markNotificationRead` de ME-017). Retorna o total de linhas afetadas.
 * 0 significa notificacao inexistente ou guard de destinatario rejeitou.
 */
export async function marcarLidaAction(id: number): Promise<number> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const affected = await markNotificationRead(
      client.db,
      id,
      dest.tipo,
      dest.employeeId,
      new Date(),
    );
    revalidatePath('/notificacoes');
    return affected;
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Marca uma notificacao como nao lida (`lidaEm = NULL`). Aplica o mesmo
 * WHERE guard canonico de destinatario. Retorna linhas afetadas.
 */
export async function marcarNaoLidaAction(id: number): Promise<number> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const affected = await setLidaEmDirectly(client, id, dest, null);
    revalidatePath('/notificacoes');
    return affected;
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Arquiva uma notificacao. Ortogonal a lida (§16.2). Retorna linhas
 * afetadas.
 */
export async function arquivarAction(id: number): Promise<number> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const affected = await archiveNotification(
      client.db,
      id,
      dest.tipo,
      dest.employeeId,
      new Date(),
    );
    revalidatePath('/notificacoes');
    return affected;
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Desarquiva uma notificacao (`arquivadaEm = NULL`). Retorna linhas
 * afetadas.
 */
export async function desarquivarAction(id: number): Promise<number> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const affected = await setArquivadaEmDirectly(client, id, dest, null);
    revalidatePath('/notificacoes');
    return affected;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Actions em lote
// -----------------------------------------------------------------------

/**
 * Marca varias notificacoes como lidas. Itera individualmente com guard
 * de destinatario (protege contra ids injetados de outros destinatarios).
 * Retorna contagem total de linhas afetadas.
 */
export async function marcarLidasLoteAction(ids: readonly number[]): Promise<number> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const now = new Date();
    let total = 0;
    for (const id of ids) {
      total += await markNotificationRead(client.db, id, dest.tipo, dest.employeeId, now);
    }
    revalidatePath('/notificacoes');
    return total;
  } finally {
    await closeDbClient(client);
  }
}

/**
 * Arquiva varias notificacoes em lote. Mesmo pattern iterativo com guard
 * de destinatario. Retorna contagem total.
 */
export async function arquivarLoteAction(ids: readonly number[]): Promise<number> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const now = new Date();
    let total = 0;
    for (const id of ids) {
      total += await archiveNotification(client.db, id, dest.tipo, dest.employeeId, now);
    }
    revalidatePath('/notificacoes');
    return total;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Action de re-fetch (filtros e paginacao)
// -----------------------------------------------------------------------

/**
 * Re-fetch canonico da lista de notificacoes. Chamada pelo client
 * component quando o usuario aplica filtro, muda paginacao ou seleciona
 * outro tamanho de pagina. Delegada ao `loadNotificacoesPage` do
 * `page.tsx` para preservar fonte unica de query (RV-12 + DRY).
 */
export async function listarNotificacoesAction(
  filters: NotificacoesFilters,
): Promise<NotificacoesListResult> {
  const session = await requireSession();
  const dest = resolveDestinatario(session);
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const { loadNotificacoesPage } = await import('./internals');
    return await loadNotificacoesPage(client.db, dest.tipo, dest.employeeId, filters);
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Helpers privados (SET direto para colunas de bandeira)
// -----------------------------------------------------------------------

/**
 * SET direto de `lidaEm` a um valor arbitrario (incluindo NULL para
 * "marcar nao lida"). Aplica o mesmo WHERE guard canonico do
 * `markNotificationRead` de services/notifications.ts (`destClause`).
 * Aqui in-line porque o service tem apenas `markRead` com `Date` — a
 * simetria "marcar nao lida" e canonizada nesta ME (D065 nao existente:
 * comportamento §14.19 explicito — "Marcada como nao lida.").
 */
async function setLidaEmDirectly(
  client: RoipDbClient,
  id: number,
  dest: DestinatarioContext,
  lidaEm: Date | null,
): Promise<number> {
  const destClause =
    dest.employeeId === null
      ? isNull(notifications.destinatarioEmployeeId)
      : eq(notifications.destinatarioEmployeeId, dest.employeeId);
  const [result] = await client.db
    .update(notifications)
    .set({ lidaEm })
    .where(
      and(eq(notifications.id, id), eq(notifications.destinatarioTipo, dest.tipo), destClause),
    );
  return result.affectedRows;
}

/**
 * SET direto de `arquivadaEm` a um valor arbitrario (incluindo NULL para
 * "desarquivar"). Simetrico ao anterior — canoniza o UI toast
 * "Notificacao desarquivada." de §14.19.
 */
async function setArquivadaEmDirectly(
  client: RoipDbClient,
  id: number,
  dest: DestinatarioContext,
  arquivadaEm: Date | null,
): Promise<number> {
  const destClause =
    dest.employeeId === null
      ? isNull(notifications.destinatarioEmployeeId)
      : eq(notifications.destinatarioEmployeeId, dest.employeeId);
  const [result] = await client.db
    .update(notifications)
    .set({ arquivadaEm })
    .where(
      and(eq(notifications.id, id), eq(notifications.destinatarioTipo, dest.tipo), destClause),
    );
  return result.affectedRows;
}
