// ROIP APP 9BOX — passo M7 do pipeline anti-ruido (ME-059).
//
// Origem canonica: DOC 06 §8.9 (Agrupamento em emailQueue).
//
// Regra literal:
//
// Para canal `imediato`:
//   - Busca linha existente em emailQueue com:
//       companyId = ?, destinatarioEmail = ?,
//       tipoEnvio = 'imediato', status = 'pendente',
//       scheduledFor >= NOW() - INTERVAL 15 MINUTE
//   - Se encontrar: adiciona `alertId` ao array `alertIds` (JSON),
//     atualiza `updatedAt=NOW()`. Sem novo INSERT — agrupamento
//     canonico cross-tipo em janela de 15 min.
//   - Se nao encontrar: cria linha nova com scheduledFor=NOW(),
//     alertIds=[alertId].
//
// Para canal `digest_semanal`:
//   - Busca linha existente com:
//       companyId = ?, destinatarioEmail = ?,
//       tipoEnvio = 'digest_semanal', status = 'pendente',
//       scheduledFor = proxima_segunda_08h_UTC_calculada
//   - Se encontrar: adiciona `alertId`. Sem novo INSERT.
//   - Se nao encontrar: cria linha nova com scheduledFor = proxima
//     segunda 08:00 fuso local convertida para UTC (via
//     `nextWeeklyDigestDate`).
//
// Contrato canonico:
// - Funcao com I/O. Retorna emailQueueId (existente atualizada ou nova).
// - `companies.timezone` resolvido pelo caller antes de invocar — se
//   NULL, aplicar `TIMEZONE_FALLBACK` ('America/Sao_Paulo').
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `JANELA_IMEDIATO_MINUTOS` (constante) → consumido internamente
//     + testes.
//   - `M7EnqueuePayload` (tipo) → consumido por `emitAlert.ts` e testes.
//   - `stepM7Enqueue` → consumido por `emitAlert.ts` e testes.

import { and, eq, gte } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import { emailQueue } from '../../../db/schema';
import type { EmailQueueKind, NotificationDestinatarioTipo } from '../../../db/schema/enums';

import { nextWeeklyDigestDate, TIMEZONE_FALLBACK } from './nextWeeklyDigestDate';

/**
 * Janela canonica de agrupamento imediato (§8.9 — 15 minutos).
 * Preservado bit-exact do SQL literal linha 867.
 */
export const JANELA_IMEDIATO_MINUTOS = 15 as const;

/**
 * Payload canonico do M7. Nao inclui `alertIds` — o step le a linha
 * existente e concatena o novo `alertId`.
 */
export interface M7EnqueuePayload {
  readonly companyId: number;
  readonly destinatarioTipo: NotificationDestinatarioTipo;
  readonly destinatarioEmail: string;
  readonly destinatarioEmployeeId: number | null;
  readonly canal: EmailQueueKind;
  readonly alertId: number;
  readonly timezone: string | null; // companies.timezone (fallback interno se null)
  readonly now: Date;
}

/**
 * Resultado canonico do M7.
 *
 * - `emailQueueId`: id da linha `emailQueue` afetada (existente
 *   atualizada OU nova criada).
 * - `motivo`: `agrupado` (linha existente teve alertId concatenado)
 *   OU `criado` (nova linha inserida).
 */
export interface M7Result {
  readonly emailQueueId: number;
  readonly motivo: 'agrupado' | 'criado';
}

/**
 * Concatena `alertId` ao JSON `alertIds` existente. Usado internamente
 * quando linha existente e encontrada.
 *
 * `alertIds` no schema e `json` (armazenado como TEXT MySQL). Drizzle
 * decodifica automaticamente para JS. Preservamos a ordem canonica
 * (append no final).
 */
function concatAlertIds(existente: unknown, novo: number): number[] {
  if (Array.isArray(existente)) {
    return [...existente.filter((x): x is number => typeof x === 'number'), novo];
  }
  return [novo];
}

/**
 * Aplica passo M7 canonico. Roteia para agrupamento imediato ou digest
 * conforme canal.
 */
export async function stepM7Enqueue(
  db: RoipDatabase,
  payload: M7EnqueuePayload,
): Promise<M7Result> {
  if (payload.canal === 'imediato') {
    return enqueueImediato(db, payload);
  }
  return enqueueDigestSemanal(db, payload);
}

async function enqueueImediato(db: RoipDatabase, payload: M7EnqueuePayload): Promise<M7Result> {
  const janelaInicio = new Date(payload.now.getTime() - JANELA_IMEDIATO_MINUTOS * 60 * 1000);
  const existente = await db
    .select({ id: emailQueue.id, alertIds: emailQueue.alertIds })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.companyId, payload.companyId),
        eq(emailQueue.destinatarioEmail, payload.destinatarioEmail),
        eq(emailQueue.tipoEnvio, 'imediato'),
        eq(emailQueue.status, 'pendente'),
        gte(emailQueue.scheduledFor, janelaInicio),
      ),
    )
    .limit(1);

  const first = existente[0];
  if (first !== undefined) {
    const novosIds = concatAlertIds(first.alertIds, payload.alertId);
    await db.update(emailQueue).set({ alertIds: novosIds }).where(eq(emailQueue.id, first.id));
    return { emailQueueId: first.id, motivo: 'agrupado' };
  }

  const [res] = await db.insert(emailQueue).values({
    companyId: payload.companyId,
    destinatarioTipo: payload.destinatarioTipo,
    destinatarioEmail: payload.destinatarioEmail,
    destinatarioEmployeeId: payload.destinatarioEmployeeId,
    tipoEnvio: 'imediato',
    alertIds: [payload.alertId],
    scheduledFor: payload.now,
    status: 'pendente',
    retries: 0,
  });
  return { emailQueueId: res.insertId, motivo: 'criado' };
}

async function enqueueDigestSemanal(
  db: RoipDatabase,
  payload: M7EnqueuePayload,
): Promise<M7Result> {
  const tz =
    payload.timezone === null || payload.timezone.length === 0
      ? TIMEZONE_FALLBACK
      : payload.timezone;
  const scheduledFor = nextWeeklyDigestDate(payload.now, tz);

  const existente = await db
    .select({ id: emailQueue.id, alertIds: emailQueue.alertIds })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.companyId, payload.companyId),
        eq(emailQueue.destinatarioEmail, payload.destinatarioEmail),
        eq(emailQueue.tipoEnvio, 'digest_semanal'),
        eq(emailQueue.status, 'pendente'),
        eq(emailQueue.scheduledFor, scheduledFor),
      ),
    )
    .limit(1);

  const first = existente[0];
  if (first !== undefined) {
    const novosIds = concatAlertIds(first.alertIds, payload.alertId);
    await db.update(emailQueue).set({ alertIds: novosIds }).where(eq(emailQueue.id, first.id));
    return { emailQueueId: first.id, motivo: 'agrupado' };
  }

  const [res] = await db.insert(emailQueue).values({
    companyId: payload.companyId,
    destinatarioTipo: payload.destinatarioTipo,
    destinatarioEmail: payload.destinatarioEmail,
    destinatarioEmployeeId: payload.destinatarioEmployeeId,
    tipoEnvio: 'digest_semanal',
    alertIds: [payload.alertId],
    scheduledFor,
    status: 'pendente',
    retries: 0,
  });
  return { emailQueueId: res.insertId, motivo: 'criado' };
}
