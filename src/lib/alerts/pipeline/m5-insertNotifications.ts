// ROIP APP 9BOX — passo M5 do pipeline anti-ruido (ME-059).
//
// Origem canonica: DOC 06 §8.7 (INSERT em `notifications`) + §7.5
// (multiplicacao canonica de linhas em notifications).
//
// Regra literal:
//   - Se M4 marcou supressao, pula (nao grava em notifications).
//   - Caso contrario:
//     1) Chama `resolveDestinatarios(companyId, tipo, escopoDepartamentoId)`.
//     2) Se retorna array vazio → fallback zero destinatarios (§7.4):
//        warning no Sentry, sem gravacao. Retorna sem erro.
//     3) Para cada destinatario:
//        INSERT INTO notifications (
//          companyId, destinatarioTipo, destinatarioEmployeeId,
//          tipo, alertId, titulo, subtitulo, linkDestino,
//          severidade, createdAt
//        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
//
//   - `linkDestino` e resolvido conforme §5 por
//     `resolveLinkDestino(tipo, destinatarioTipo, ctx)` — 3 tipos tem
//     roteamento condicional por destinatarioTipo.
//   - `titulo` e o rotulo canonico literal do §6.1 (via getTipoMetadata).
//
// Contrato canonico:
// - Funcao com I/O. Encapsula resolveDestinatarios + linkResolver.
// - Retorno: `{ notificationIds: number[], destinatarios: Destinatario[] }`.
//   O array `destinatarios` e propagado para M6 e M7 (evita re-executar
//   a resolucao).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `M5NotificationsPayload` (tipo) → consumido por `emitAlert.ts`
//     e testes.
//   - `M5Result` (tipo) → consumido por `emitAlert.ts` + M6 + M7.
//   - `stepM5InsertNotifications` → consumido por `emitAlert.ts` e testes.

import type { RoipDatabase } from '../../../db/client';
import { notifications } from '../../../db/schema';

import { type LinkResolverContext, resolveLinkDestino } from '../linkResolver';
import {
  type Destinatario,
  resolveDestinatarios,
  type ResolverContexto,
} from '../resolveDestinatarios';
import { type AlertSeveridade, type AlertTipo, getTipoMetadata } from '../typeDictionary';

/**
 * Payload canonico de M5. Contem tudo o que o step precisa para
 * resolver destinatarios + linkDestino + gravar notifications.
 */
export interface M5NotificationsPayload {
  readonly companyId: number;
  readonly tipo: AlertTipo;
  readonly alertId: number;
  readonly severidade: AlertSeveridade;
  readonly linkContext: LinkResolverContext;
  readonly resolverContexto: ResolverContexto;
  readonly subtitulo: string | null;
  readonly escopoDepartamentoId: number | null;
}

/**
 * Resultado canonico do M5.
 *
 * - `notificationIds`: ids das linhas gravadas (por ordem dos
 *   destinatarios). Vazio se M5 executou fallback zero destinatarios.
 * - `destinatarios`: array resolvido (para propagacao a M6/M7 sem
 *   re-executar consulta).
 * - `motivo`: `gravado` (linhas gravadas) | `zero_destinatarios`
 *   (fallback silencioso).
 */
export interface M5Result {
  readonly notificationIds: readonly number[];
  readonly destinatarios: readonly Destinatario[];
  readonly motivo: 'gravado' | 'zero_destinatarios';
}

/**
 * Aplica passo M5 canonico. Encapsula 3 responsabilidades:
 * (1) resolveDestinatarios, (2) resolveLinkDestino por destinatario,
 * (3) INSERT em notifications. Nao trata exception do banco — o
 * `emitAlert` orquestrador captura e faz o log estruturado.
 */
export async function stepM5InsertNotifications(
  db: RoipDatabase,
  payload: M5NotificationsPayload,
): Promise<M5Result> {
  const destinatarios = await resolveDestinatarios(
    db,
    payload.companyId,
    payload.tipo,
    payload.resolverContexto,
  );

  if (destinatarios.length === 0) {
    // §7.4 — fallback canonico zero destinatarios. Warning no console;
    // o `emitAlert` reforca com log estruturado §8.13 depois.
    console.warn('alert.zero_destinatarios', {
      companyId: payload.companyId,
      tipo: payload.tipo,
    });
    return {
      notificationIds: [],
      destinatarios: [],
      motivo: 'zero_destinatarios',
    };
  }

  const meta = getTipoMetadata(payload.tipo);
  const notificationIds: number[] = [];

  for (const dest of destinatarios) {
    const linkDestino = resolveLinkDestino(
      payload.tipo,
      dest.destinatarioTipo,
      payload.linkContext,
    );
    const [res] = await db.insert(notifications).values({
      companyId: payload.companyId,
      destinatarioTipo: dest.destinatarioTipo,
      destinatarioEmployeeId: dest.destinatarioEmployeeId,
      tipo: payload.tipo,
      alertId: payload.alertId,
      titulo: meta.rotuloLegivel,
      subtitulo: payload.subtitulo,
      linkDestino,
      severidade: payload.severidade,
    });
    notificationIds.push(res.insertId);
  }

  return {
    notificationIds,
    destinatarios,
    motivo: 'gravado',
  };
}
