// ROIP APP 9BOX — log estruturado canonico do motor de alertas (ME-059).
//
// Origem canonica: DOC 06 §8.13 (Log estruturado canonico de `emitAlert`).
//
// Payload literal:
//   {
//     "event": "alert.emit",
//     "companyId": {id},
//     "tipo": "{tipo}",
//     "severidade": "{severidade}",
//     "resultado": "gravado" | "suprimido_onboarding" |
//                  "suprimido_materialidade" | "suprimido_cooldown" |
//                  "zero_destinatarios" | "b3_nao_recorrencia",
//     "alertId": {id_or_null},
//     "notificationIds": [ids],
//     "emailQueueIds": [ids]
//   }
//
// Contrato canonico:
// - Funcao pura sem I/O externo (apenas console). Nao lanca.
// - Consumida por `emitAlert` e `emitAlertPostGravacao` no final de
//   cada invocacao para telemetria completa.
// - `resultado='b3_nao_recorrencia'` e extensao canonica ME-059 do
//   enum literal do §8.13 — cobre a supressao especifica §9.2 que o
//   texto do §8.13 nao previa por antecedencia; mantida na mesma
//   familia de resultados de supressao.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `AlertEmitResultado` (tipo) → consumido por
//     `emitAlert.ts` + `emitAlertPostGravacao.ts` + testes.
//   - `AlertEmitLog` (tipo) → consumido pelos mesmos.
//   - `logAlertEmit` → consumido pelos mesmos.

import { type AlertSeveridade, type AlertTipo } from './typeDictionary';

/**
 * Enum canonico de resultados possiveis do `emitAlert` (§8.13 +
 * extensao ME-059 para B3).
 */
export type AlertEmitResultado =
  | 'gravado'
  | 'suprimido_onboarding'
  | 'suprimido_materialidade'
  | 'suprimido_cooldown'
  | 'zero_destinatarios'
  | 'b3_nao_recorrencia'
  | 'tipo_invalido';

/**
 * Payload canonico do log estruturado. Formato JSON serializado ao
 * console + reservado para Sentry em producao (integracao externa
 * fora do escopo ME-059).
 */
export interface AlertEmitLog {
  readonly event: 'alert.emit';
  readonly companyId: number;
  readonly tipo: AlertTipo | string; // string quando tipo_invalido
  readonly severidade: AlertSeveridade | null;
  readonly resultado: AlertEmitResultado;
  readonly alertId: number | null;
  readonly notificationIds: readonly number[];
  readonly emailQueueIds: readonly number[];
}

/**
 * Emite log estruturado. Serializa como JSON linha unica — padrao
 * canonico do repo (compativel com agregadores stdout do log).
 */
export function logAlertEmit(payload: AlertEmitLog): void {
  console.log(JSON.stringify(payload));
}
