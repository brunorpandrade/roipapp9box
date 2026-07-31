// ROIP APP 9BOX — helper canonico do endpoint do sino (ME-059).
//
// Origem canonica:
// - DOC 06 §10.1 (perfis com sino: apenas Bruno + RH ativos).
// - DOC 06 §10.2 (autorizacao — RH ou Bruno autenticado; outros
//   perfis retornam 403).
// - DOC 05 §14.19 + matriz `/notificacoes` (allow: super_admin,
//   rh, rh_lider; deny: clevel, lider).
//
// Contrato canonico:
// - Funcao pura sem I/O. Recebe `ServerSession` e devolve
//   destClause canonico OU um objeto de erro estruturado (403 sem
//   sino disponivel para o perfil).
//
// Mapeamento canonico:
// - `session.kind='super_admin'` → destinatarioTipo='bruno',
//   destinatarioEmployeeId=null.
// - `session.kind='platform'` com `role IN ('rh', 'rh_lider')` →
//   destinatarioTipo='rh', destinatarioEmployeeId=session.userId.
// - Qualquer outro → 403 (perfil sem sino).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `NotificationsDestClause` (tipo) → consumido por
//     `/api/notifications/route.ts` e testes unitarios.
//   - `NotificationsDestClauseError` (tipo) → consumido pelos mesmos.
//   - `resolveDestClauseFromSession` → consumido pelos mesmos.

import type { NotificationDestinatarioTipo } from '../../db/schema/enums';
import type { ServerSession } from '../../server/session/serverSession';

/**
 * Clause canonica de acesso do sino. Consumido pelas queries do
 * endpoint `/api/notifications` — determina de qual "caixa" o
 * usuario autenticado le suas notificacoes.
 */
export interface NotificationsDestClause {
  readonly destinatarioTipo: NotificationDestinatarioTipo;
  readonly destinatarioEmployeeId: number | null;
}

/**
 * Erro canonico quando o perfil autenticado nao tem sino (§10.1 Q1
 * canonizada — apenas Bruno + RH). Consumidor traduz para HTTP 403.
 */
export interface NotificationsDestClauseError {
  readonly kind: 'forbidden';
  readonly motivo: 'perfil_sem_sino_clevel' | 'perfil_sem_sino_lider' | 'sessao_ausente';
}

/**
 * Aplica narrowing canonico da sessao para clause do sino. Retorna
 * uniao discriminada por `kind`:
 *
 * - `kind='ok'` → destinatarioTipo + destinatarioEmployeeId prontos.
 * - `kind='forbidden'` → perfil sem sino canonico (motivo detalhado).
 */
export type NotificationsDestClauseResult =
  | { readonly kind: 'ok'; readonly clause: NotificationsDestClause }
  | { readonly kind: 'forbidden'; readonly motivo: NotificationsDestClauseError['motivo'] };

export function resolveDestClauseFromSession(
  session: ServerSession | null,
): NotificationsDestClauseResult {
  if (session === null) {
    return { kind: 'forbidden', motivo: 'sessao_ausente' };
  }
  if (session.kind === 'super_admin') {
    return {
      kind: 'ok',
      clause: {
        destinatarioTipo: 'bruno',
        destinatarioEmployeeId: null,
      },
    };
  }
  // session.kind === 'platform'
  if (session.role === 'rh' || session.role === 'rh_lider') {
    return {
      kind: 'ok',
      clause: {
        destinatarioTipo: 'rh',
        destinatarioEmployeeId: session.userId,
      },
    };
  }
  if (session.role === 'clevel') {
    return { kind: 'forbidden', motivo: 'perfil_sem_sino_clevel' };
  }
  // session.role === 'lider'
  return { kind: 'forbidden', motivo: 'perfil_sem_sino_lider' };
}
