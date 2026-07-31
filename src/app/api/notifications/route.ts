// ROIP APP 9BOX — Route Handler canonico `/api/notifications` (ME-059).
//
// Origem canonica:
// - DOC 06 §10.2 (endpoint `notifications.getUnreadCount` — polling
//   canonico 60s do sino).
// - DOC 06 §10.4 (endpoint `notifications.listUnread` — 10 ultimas
//   nao lidas para o dropdown).
// - DOC 06 §10.6 (marcacao como lida via botao explicito — nao pelo
//   pop-up open).
// - DOC 05 §14.19 (ja implementou marcacao/arquivamento via server
//   actions em ME-057a — endpoint REST aqui e complementar para o
//   caso do POLLING do sino que nao roda em server action).
// - S197 canonizada (ME-057c): padrao Route Handler `POST /api/*` para
//   escrita. Adaptacao canonica ME-059: GET/PATCH em rota unificada
//   com querystring de modo/acao, evitando proliferacao de sub-rotas.
//
// Contrato canonico:
// - GET com `?mode=count` → payload §10.2 (total + 4 counts por severidade).
// - GET com `?mode=unread` → payload §10.4 (top 10 nao lidas ordenadas
//   por createdAt desc + id desc, com lidaEm IS NULL e arquivadaEm IS NULL).
// - PATCH com `?action=read&id={id}` → marca `lidaEm=NOW()` com guard
//   canonico de destinatario (ver `markNotificationRead`).
// - PATCH com `?action=archive&id={id}` → marca `arquivadaEm=NOW()`
//   com guard.
// - Autorizacao canonica §10.1: apenas Bruno (super_admin) + RH
//   (role IN ('rh', 'rh_lider')). Outros perfis autenticados → 403.
//   Sessao ausente → 401.
//
// Ordem canonica das validacoes:
//   1. `resolveDestClauseFromSession` → 401 (sem sessao) OU 403 (perfil
//      sem sino).
//   2. Modo/acao invalido → 400.
//   3. Delega para consulta/servico correspondente.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `GET` → consumido pelo cliente do sino (frontend polling 60s +
//     dropdown listUnread), testes de integracao ME-059.
//   - `PATCH` → consumido por marcacoes rapidas do sino (dropdown ou
//     navegacao contextual), testes de integracao ME-059.
//   - `__setNotificationsRouteDbClient` → escape hatch canonico de
//     teste (padrao ME-057c bit-exact).

import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { createDbClient, type RoipDbClient } from '../../../db/client';
import { notifications } from '../../../db/schema';
import { archiveNotification, markNotificationRead } from '../../../server/services/notifications';
import { getServerSession } from '../../../server/session/serverSession';
import { resolveDestClauseFromSession } from '../../../lib/alerts/notificationsEndpointHelper';

export const MSG_UNAUTHORIZED = 'Sessao ausente.';
export const MSG_FORBIDDEN = 'Perfil sem sino canonico (§10.1).';
export const MSG_INVALID_MODE = 'Parametro "mode" invalido — use count OU unread.';
export const MSG_INVALID_ACTION = 'Parametro "action" invalido — use read OU archive.';
export const MSG_MISSING_ID = 'Parametro "id" ausente ou invalido.';
export const MSG_NOT_FOUND = 'Notificacao nao encontrada OU sem permissao.';

/**
 * Limite canonico do dropdown do sino (§10.4 — 10 ultimas nao lidas).
 */
export const LISTA_UNREAD_LIMIT = 10 as const;

/**
 * Escape hatch canonico de teste. Padrao bit-exact estabelecido em
 * ME-057c (Route Handler `/api/portal/consent-lgpd`). Injeta cliente
 * customizado (ex.: MySQL fixture) para permitir teste de integracao
 * sem levantar servidor Next.
 */
let dbClient: RoipDbClient | null = null;

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

export function __setNotificationsRouteDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// GET — count OU listagem
// ============================================================

/**
 * Payload canonico `?mode=count` (§10.2 linha 1097).
 */
export interface UnreadCountPayload {
  total: number;
  criticoCount: number;
  atencaoCount: number;
  observacaoCount: number;
  infoCount: number;
}

/**
 * Payload canonico `?mode=unread` (§10.4). Item nu — o pop-up de
 * detalhe consome via `notifications.getById(id)` em rota separada
 * (fora do escopo ME-059).
 */
export interface UnreadListItem {
  id: number;
  tipo: string;
  titulo: string;
  subtitulo: string | null;
  linkDestino: string | null;
  severidade: string;
  createdAt: string; // ISO
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession();
  const auth = resolveDestClauseFromSession(session);
  if (auth.kind === 'forbidden') {
    if (auth.motivo === 'sessao_ausente') {
      return NextResponse.json({ msg: MSG_UNAUTHORIZED }, { status: 401 });
    }
    return NextResponse.json({ msg: MSG_FORBIDDEN, motivo: auth.motivo }, { status: 403 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');
  if (mode !== 'count' && mode !== 'unread') {
    return NextResponse.json({ msg: MSG_INVALID_MODE }, { status: 400 });
  }

  const client = getDbClient();

  const destClause =
    auth.clause.destinatarioEmployeeId === null
      ? isNull(notifications.destinatarioEmployeeId)
      : eq(notifications.destinatarioEmployeeId, auth.clause.destinatarioEmployeeId);

  if (mode === 'count') {
    // §10.2 SQL canonico linha 1099-1110. Uso de `sum(severidade='X')`
    // via Drizzle: implementamos via 5 select agregado com CASE.
    const [row] = await client.db
      .select({
        total: count(),
        criticoCount: sql<number>`
          SUM(CASE WHEN ${notifications.severidade} = 'critico' THEN 1 ELSE 0 END)
        `.mapWith(Number),
        atencaoCount: sql<number>`
          SUM(CASE WHEN ${notifications.severidade} = 'atencao' THEN 1 ELSE 0 END)
        `.mapWith(Number),
        observacaoCount: sql<number>`
          SUM(CASE WHEN ${notifications.severidade} = 'observacao' THEN 1 ELSE 0 END)
        `.mapWith(Number),
        infoCount: sql<number>`
          SUM(CASE WHEN ${notifications.severidade} = 'info' THEN 1 ELSE 0 END)
        `.mapWith(Number),
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.destinatarioTipo, auth.clause.destinatarioTipo),
          destClause,
          isNull(notifications.lidaEm),
          isNull(notifications.arquivadaEm),
        ),
      );

    const payload: UnreadCountPayload = {
      total: row?.total ?? 0,
      criticoCount: row?.criticoCount ?? 0,
      atencaoCount: row?.atencaoCount ?? 0,
      observacaoCount: row?.observacaoCount ?? 0,
      infoCount: row?.infoCount ?? 0,
    };
    return NextResponse.json(payload, { status: 200 });
  }

  // mode === 'unread'
  const rows = await client.db
    .select({
      id: notifications.id,
      tipo: notifications.tipo,
      titulo: notifications.titulo,
      subtitulo: notifications.subtitulo,
      linkDestino: notifications.linkDestino,
      severidade: notifications.severidade,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.destinatarioTipo, auth.clause.destinatarioTipo),
        destClause,
        isNull(notifications.lidaEm),
        isNull(notifications.arquivadaEm),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(LISTA_UNREAD_LIMIT);

  const payload: UnreadListItem[] = rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    titulo: r.titulo,
    subtitulo: r.subtitulo,
    linkDestino: r.linkDestino,
    severidade: r.severidade ?? 'info',
    createdAt: (r.createdAt ?? new Date(0)).toISOString(),
  }));
  return NextResponse.json(payload, { status: 200 });
}

// ============================================================
// PATCH — read OU archive
// ============================================================

export async function PATCH(req: Request): Promise<NextResponse> {
  const session = await getServerSession();
  const auth = resolveDestClauseFromSession(session);
  if (auth.kind === 'forbidden') {
    if (auth.motivo === 'sessao_ausente') {
      return NextResponse.json({ msg: MSG_UNAUTHORIZED }, { status: 401 });
    }
    return NextResponse.json({ msg: MSG_FORBIDDEN, motivo: auth.motivo }, { status: 403 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  if (action !== 'read' && action !== 'archive') {
    return NextResponse.json({ msg: MSG_INVALID_ACTION }, { status: 400 });
  }

  const idRaw = url.searchParams.get('id');
  const id = idRaw === null ? NaN : Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ msg: MSG_MISSING_ID }, { status: 400 });
  }

  const client = getDbClient();
  const now = new Date();

  const affected =
    action === 'read'
      ? await markNotificationRead(
          client.db,
          id,
          auth.clause.destinatarioTipo,
          auth.clause.destinatarioEmployeeId,
          now,
        )
      : await archiveNotification(
          client.db,
          id,
          auth.clause.destinatarioTipo,
          auth.clause.destinatarioEmployeeId,
          now,
        );

  if (affected === 0) {
    return NextResponse.json({ msg: MSG_NOT_FOUND }, { status: 404 });
  }
  return NextResponse.json({ affected }, { status: 200 });
}
