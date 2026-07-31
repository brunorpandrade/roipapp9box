// ROIP APP 9BOX — dispatcher canonico de e-mails (ME-060).
//
// Origem canonica:
// - DOC 06 §11.2 (worker `runEmailQueueJob` consome linhas gravadas pelo
//   dispatcher).
// - DOC 06 §12.9 (enfileiramento canonico dos templates transacionais
//   via marker especial em `emailQueue.alertIds`).
// - DOC 06 §11.9 (rastreabilidade canonica cross-tabela).
// - Motor de alertas ME-059 (`m7-enqueue.ts`): a interacao canonica
//   entre motor e dispatcher e via a tabela `emailQueue`. O motor grava
//   linhas com `alertIds=[alertId]` numericos e `tipoEnvio='imediato'`
//   ou `'digest_semanal'`. O dispatcher grava linhas com marker
//   transacional `['__transactional__', templateId, payloadJson]` e
//   `tipoEnvio='imediato'` sempre.
//
// Contrato canonico:
// - `enqueueTransactional` (§12.9): API canonica dos 3 templates
//   transacionais desta ME (1, 3, 4). Grava linha em `emailQueue` com:
//     - `alertIds` = array-marker canonico
//       `['__transactional__', templateId, JSON.stringify(payload)]`.
//     - `tipoEnvio` = `'imediato'` sempre (§12.9: "transacional nao vai
//       para digest").
//     - `scheduledFor` = `now` (envio imediato — sem agrupamento 15 min
//       do §12.9: "cada e-mail transacional e uma linha propria em
//       emailQueue").
// - Retorna o `id` da linha gravada — o caller consumidor (auth.ts) nao
//   precisa desse valor para o fluxo canonico, mas o expomos para
//   rastreabilidade e testes.
// - Zero envio SMTP aqui — o dispatcher apenas grava; o worker envia.
// - Sem transaction wrapping: um unico INSERT nao precisa de transacao
//   (padrao canonico do repo — o motor ME-059 tambem enfileira via
//   INSERT direto).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `EnqueueTransactionalInput` (tipo) → `enqueueTransactional` +
//     `routers/auth.ts` religacao + testes.
//   - `enqueueTransactional` → `routers/auth.ts` (3 pontos de
//     religacao: forgotPassword, requestEmailChange, confirmEmailChange)
//     + testes.

import type { RoipDatabase } from '../../db/client';
import {
  TRANSACTIONAL_MARKER_HEAD,
  type Template1Payload,
  type Template3Payload,
  type Template4Payload,
  type TransactionalPayloadUnion,
  type TransactionalTemplateId,
} from '../../lib/email';
import { insertEmailQueueItem } from './emailQueue';

/**
 * Input canonico do `enqueueTransactional`. Uniao discriminada por
 * `templateId` — TypeScript narrowing garante que o `payload` seja o
 * tipo correto para cada template.
 *
 * Campos comuns:
 * - `companyId` — FK canonica (`emailQueue.companyId` — obrigatorio pelo
 *   schema).
 * - `destinatarioEmail` — e-mail alvo do envio.
 * - `destinatarioTipo` — canonico do §12.9 alvo: `rh` ou `bruno` (nao
 *   canonico ter e-mails transacionais para C-level ou colaborador
 *   nesta ME; se surgir, ampliar em ME futura).
 * - `destinatarioEmployeeId` — opcional (null para Bruno; obrigatorio
 *   para RH quando disponivel — o caller decide).
 * - `now` — instante de referencia canonica para `scheduledFor`.
 */
interface EnqueueTransactionalBase {
  readonly companyId: number | null;
  readonly destinatarioEmail: string;
  readonly destinatarioTipo: 'rh' | 'bruno';
  readonly destinatarioEmployeeId: number | null;
  readonly now: Date;
}

export type EnqueueTransactionalInput = EnqueueTransactionalBase & TransactionalPayloadUnion;

/**
 * Enfileira e-mail transacional canonico (§12.9). Retorna o `id` da
 * linha gravada em `emailQueue`. Nunca envia SMTP — apenas grava.
 *
 * Comportamento canonico:
 * - `alertIds` gravado como marker canonico
 *   `[TRANSACTIONAL_MARKER_HEAD, templateId, JSON.stringify(payload)]`.
 *   O worker `runEmailQueueJob` distingue esse formato do formato de
 *   alertas puros (array de int).
 * - `tipoEnvio` = `'imediato'` (§12.9).
 * - `scheduledFor` = `input.now` (envio imediato).
 * - `status` = `'pendente'` (default do schema — nao precisamos
 *   explicitar).
 * - `retries` = `0` (default do schema).
 */
export async function enqueueTransactional(
  db: RoipDatabase,
  input: EnqueueTransactionalInput,
): Promise<number> {
  const payloadForMarker: Template1Payload | Template3Payload | Template4Payload = input.payload;
  const templateId: TransactionalTemplateId = input.templateId;
  const marker: readonly [string, string, string] = [
    TRANSACTIONAL_MARKER_HEAD,
    templateId,
    JSON.stringify(payloadForMarker),
  ];

  const id = await insertEmailQueueItem(db, {
    companyId: input.companyId,
    destinatarioTipo: input.destinatarioTipo,
    destinatarioEmail: input.destinatarioEmail,
    destinatarioEmployeeId: input.destinatarioEmployeeId,
    tipoEnvio: 'imediato',
    alertIds: marker,
    scheduledFor: input.now,
  });
  return id;
}
