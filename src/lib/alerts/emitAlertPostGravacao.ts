// ROIP APP 9BOX — orquestrador canonico `emitAlertPostGravacao` (ME-059).
//
// Origem canonica: DOC 06 §8.10 (assinatura + execucao especifica NR-1).
//
// Contrato canonico:
// - Chamada exclusiva pelo hook `evaluateNR1Alerts` do DOC 03, apos
//   `closeNR1Cycle` ja ter gravado `alerts` e `notifications` pela
//   Fase 6.
// - Assinatura: identica a `emitAlert` mais o campo `alertId` (ID da
//   linha ja gravada em `alerts` pela Fase 6).
//
// Execucao canonica:
//   - Pula M1, M2 e M3. Fase 6 ja validou e gravou.
//   - Executa M4 com chave AMPLIADA `(tipo, companyId,
//     escopoDepartamentoId, fatorId)`. Se cooldown atingido, marca
//     `alerts.suprimidoPorCooldown = true` (linha ja existente da
//     Fase 6). Retorna sem seguir.
//   - Pula M5. Fase 6 ja gravou notifications com alertId populado
//     (revisao retroativa Fase 6 §6.8).
//   - Executa M6 identicamente. Para `nr1_fator_critico` e
//     `nr1_ciclo_fechado`, severidade e `atencao` SEM override —
//     canal `digest_semanal`.
//   - Executa M7 identicamente. Enfileira em `emailQueue`.
//
// Retorno canonico: `{ notificationIds, emailQueueIds }`.
//
// **Nota canonica sobre notificationIds:** como Fase 6 ja gravou as
// notificacoes e este motor NAO relê o alertId nem consulta as linhas
// gravadas, `notificationIds` retornado e sempre vazio. Os
// destinatarios sao resolvidos aqui (via `resolveDestinatarios`) para
// serem processados pelo par M6+M7. O nome do campo preserva
// consistencia com `EmitAlertResult` da §8.2.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `EmitAlertPostGravacaoInput` (tipo) → consumido pelo religador
//     do `Nr1AlertFacade` (facade em `nr1CalculationEngine.ts`).
//   - `EmitAlertPostGravacaoResult` (tipo) → consumido pelo mesmo.
//   - `emitAlertPostGravacao` → consumido pelo religador do facade
//     + testes de integracao.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies } from '../../db/schema';

import { logAlertEmit } from './logging';
import { resolveDestinatarios, type ResolverContexto } from './resolveDestinatarios';
import { resolveLinkDestino } from './linkResolver';
import { stepM4Cooldown } from './pipeline/m4-cooldown';
import { stepM6Channel } from './pipeline/m6-channel';
import { stepM7Enqueue } from './pipeline/m7-enqueue';
import { type AlertSeveridade } from './typeDictionary';

/**
 * Payload canonico da variante NR-1 (§8.10). Inclui obrigatoriamente
 * `alertId` (Fase 6 gravou; o motor apenas propaga).
 */
export interface EmitAlertPostGravacaoInput {
  readonly alertId: number;
  readonly companyId: number;
  readonly tipo: 'nr1_fator_critico' | 'nr1_ciclo_fechado';
  readonly severidade: AlertSeveridade;
  readonly escopoDepartamentoId: number | null;
  readonly fatorId: number | null; // apenas para nr1_fator_critico
  readonly cicloDbId: number;
  readonly resolverContexto?: ResolverContexto;
  readonly now?: Date;
}

/**
 * Resultado canonico da variante NR-1. `notificationIds` sempre vazio
 * — ver nota canonica no header do arquivo.
 */
export interface EmitAlertPostGravacaoResult {
  readonly notificationIds: readonly number[];
  readonly emailQueueIds: readonly number[];
  readonly resultado: 'gravado' | 'suprimido_cooldown' | 'zero_destinatarios';
}

/**
 * Orquestrador canonico NR-1. Pula M1/M2/M3/M5 (Fase 6 ja fez);
 * executa M4+M6+M7 com chave ampliada em M4.
 */
export async function emitAlertPostGravacao(
  db: RoipDatabase,
  input: EmitAlertPostGravacaoInput,
): Promise<EmitAlertPostGravacaoResult> {
  const now = input.now ?? new Date();

  // ------- Passo M4 (chave ampliada com fatorId apenas para fator_critico) -------
  const m4 = await stepM4Cooldown(db, now, {
    companyId: input.companyId,
    tipo: input.tipo,
    escopoEmployeeId: null, // NR-1 nunca tem escopoEmployeeId
    escopoDepartamentoId: input.escopoDepartamentoId,
    fatorId: input.fatorId, // consumido apenas se metadata.chaveM4Ampliada=true (nr1_fator_critico)
    alertIdRecemGravado: input.alertId,
  });
  if (m4.suppress) {
    logAlertEmit({
      event: 'alert.emit',
      companyId: input.companyId,
      tipo: input.tipo,
      severidade: input.severidade,
      resultado: 'suprimido_cooldown',
      alertId: input.alertId,
      notificationIds: [],
      emailQueueIds: [],
    });
    return {
      notificationIds: [],
      emailQueueIds: [],
      resultado: 'suprimido_cooldown',
    };
  }

  // ------- Resolver destinatarios (Fase 6 ja gravou notifications, mas
  // precisamos deles para M7 e para logar) -------
  const destinatarios = await resolveDestinatarios(
    db,
    input.companyId,
    input.tipo,
    input.resolverContexto ?? {},
  );
  if (destinatarios.length === 0) {
    logAlertEmit({
      event: 'alert.emit',
      companyId: input.companyId,
      tipo: input.tipo,
      severidade: input.severidade,
      resultado: 'zero_destinatarios',
      alertId: input.alertId,
      notificationIds: [],
      emailQueueIds: [],
    });
    return {
      notificationIds: [],
      emailQueueIds: [],
      resultado: 'zero_destinatarios',
    };
  }

  // ------- M6+M7 por destinatario -------
  const tz = await resolveTimezone(db, input.companyId);
  const emailQueueIds: number[] = [];
  for (const dest of destinatarios) {
    // linkDestino canonico e computado por destinatario para
    // consistencia com M5 (mesmo padrao §5) — Fase 6 ja preencheu, mas
    // este motor nao volta a gravar; e apenas para simetria conceitual.
    const _linkDestino = resolveLinkDestino(input.tipo, dest.destinatarioTipo, {
      companyId: input.companyId,
      cicloDbId: input.cicloDbId,
      fatorId: input.fatorId,
    });
    void _linkDestino;

    const canalDecisao = stepM6Channel(input.severidade, input.tipo);
    if (canalDecisao.canal === null) {
      continue;
    }
    const m7 = await stepM7Enqueue(db, {
      companyId: input.companyId,
      destinatarioTipo: dest.destinatarioTipo,
      destinatarioEmail: dest.destinatarioEmail,
      destinatarioEmployeeId: dest.destinatarioEmployeeId,
      canal: canalDecisao.canal,
      alertId: input.alertId,
      timezone: tz,
      now,
    });
    emailQueueIds.push(m7.emailQueueId);
  }

  logAlertEmit({
    event: 'alert.emit',
    companyId: input.companyId,
    tipo: input.tipo,
    severidade: input.severidade,
    resultado: 'gravado',
    alertId: input.alertId,
    notificationIds: [],
    emailQueueIds,
  });

  return {
    notificationIds: [],
    emailQueueIds,
    resultado: 'gravado',
  };
}

async function resolveTimezone(db: RoipDatabase, companyId: number): Promise<string | null> {
  const rows = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const first = rows[0];
  if (first === undefined) return null;
  return first.timezone;
}
