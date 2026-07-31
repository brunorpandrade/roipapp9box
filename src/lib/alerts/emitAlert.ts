// ROIP APP 9BOX — orquestrador canonico `emitAlert` (ME-059).
//
// Origem canonica:
// - DOC 06 §8.2 (assinatura canonica de `emitAlert(input)`).
// - DOC 06 §8.3-§8.9 (pipeline determinístico M1-M7).
// - DOC 06 §9.2 (nao recorrencia B3 — sub-step entre M2 e M3).
// - DOC 06 §8.13 (log estruturado obrigatorio).
//
// Contrato canonico:
// - Chamada canonica pelos hooks Fase 8 do DOC 03 e por D049/D050.
// - Nao usada por NR-1 (que usa `emitAlertPostGravacao`).
// - Retorno canonico: `{ alertId, notificationIds, emailQueueIds }`.
//
// Pipeline canonico executado por chamada:
//   1. Validacao de entrada — `assertTipoCanonico` rejeita valores fora
//      do enum de 17.
//   2. M1 (onboarding) — retorna se supresso.
//   3. M2 (materialidade) — retorna se supresso.
//   4. Sub-step §9.2 (B3 nao recorrencia) — apenas para tipo
//      `desempenho_queda_isolada`. Retorna se bloqueado.
//   5. M3 (INSERT em alerts) — captura `alertId`.
//   6. M4 (cooldown 7 dias) — se supresso, UPDATE em alerts +
//      pipeline encerra. Ver §8.5 linha 787.
//   7. M5 (INSERT em notifications) — array de notificationIds
//      (1 por destinatario). Se zero destinatarios → fallback
//      silencioso, pipeline encerra apos M3+M4 (linha permanece em
//      `alerts` para rastreabilidade).
//   8. M6+M7 loop — para cada destinatario:
//      - M6 decide canal (`imediato` | `digest_semanal` | null).
//      - Se canal != null → M7 enfileira em emailQueue.
//   9. Log estruturado.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `EmitAlertInput` (tipo) → consumido pelos hooks canonicos +
//     testes.
//   - `EmitAlertResult` (tipo) → consumido pelos mesmos.
//   - `emitAlert` → consumido pelo hook `NOOP_EMIT_AUTO_ALERT`
//     religado em `cycleScheduleEngine.ts` (via factory `hooks.ts`)
//     + testes de integracao.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies } from '../../db/schema';

import { AlertTipoInvalidoError, assertTipoCanonico } from './typeDictionary';
import type { AlertEscopo, AlertSeveridade, AlertTipo } from './typeDictionary';
import type { LinkResolverContext } from './linkResolver';
import type { ResolverContexto } from './resolveDestinatarios';
import { checkB3NaoRecorrencia } from './temporalRules';
import { logAlertEmit } from './logging';
import { stepM1Onboarding } from './pipeline/m1-onboarding';
import { stepM2Materiality } from './pipeline/m2-materiality';
import { stepM3InsertAlert } from './pipeline/m3-insertAlert';
import { stepM4Cooldown } from './pipeline/m4-cooldown';
import { stepM5InsertNotifications } from './pipeline/m5-insertNotifications';
import { stepM6Channel } from './pipeline/m6-channel';
import { stepM7Enqueue } from './pipeline/m7-enqueue';

/**
 * Payload canonico de `emitAlert` (§8.2). Espelha a estrutura literal
 * do DOC 06.
 */
export interface EmitAlertInput {
  readonly companyId: number;
  readonly tipo: string; // validado por assertTipoCanonico
  readonly severidade: AlertSeveridade;
  readonly escopo: AlertEscopo | null;
  readonly escopoDepartamentoId: number | null;
  readonly escopoEmployeeId: number | null;
  readonly metadados: unknown;
  readonly linkContext: LinkResolverContext;
  readonly resolverContexto?: ResolverContexto;
  readonly subtitulo?: string | null;
  /**
   * `now` canonico — o caller (hook do DOC 03) fornece; o motor nao le
   * `Date.now()` internamente para permitir teste deterministico. Se
   * omitido, usa `new Date()` (uso em producao).
   */
  readonly now?: Date;
}

/**
 * Resultado canonico. Arrays vazios significam supressao no ponto
 * respectivo — o log estruturado carrega o `resultado` semantico.
 */
export interface EmitAlertResult {
  readonly alertId: number | null;
  readonly notificationIds: readonly number[];
  readonly emailQueueIds: readonly number[];
  readonly resultado:
    | 'gravado'
    | 'suprimido_onboarding'
    | 'suprimido_materialidade'
    | 'suprimido_cooldown'
    | 'zero_destinatarios'
    | 'b3_nao_recorrencia';
}

/**
 * Orquestrador canonico. Executa pipeline M1-M7 na ordem determinística
 * DOC 06 §8, com sub-step §9.2 entre M2 e M3 para B3.
 *
 * Este e um dos dois entrypoints publicos do motor (o outro e
 * `emitAlertPostGravacao` para NR-1).
 *
 * @throws AlertTipoInvalidoError se `input.tipo` fora do enum canonico.
 */
export async function emitAlert(db: RoipDatabase, input: EmitAlertInput): Promise<EmitAlertResult> {
  const now = input.now ?? new Date();

  // ------- Passo 0: validacao canonica de entrada -------
  try {
    assertTipoCanonico(input.tipo);
  } catch (err) {
    if (err instanceof AlertTipoInvalidoError) {
      logAlertEmit({
        event: 'alert.emit',
        companyId: input.companyId,
        tipo: input.tipo,
        severidade: null,
        resultado: 'tipo_invalido',
        alertId: null,
        notificationIds: [],
        emailQueueIds: [],
      });
    }
    throw err;
  }
  const tipo: AlertTipo = input.tipo;

  // ------- Passo M1: onboarding -------
  const m1 = await stepM1Onboarding(db, input.companyId, tipo, now);
  if (m1.suppress) {
    logAlertEmit({
      event: 'alert.emit',
      companyId: input.companyId,
      tipo,
      severidade: input.severidade,
      resultado: 'suprimido_onboarding',
      alertId: null,
      notificationIds: [],
      emailQueueIds: [],
    });
    return {
      alertId: null,
      notificationIds: [],
      emailQueueIds: [],
      resultado: 'suprimido_onboarding',
    };
  }

  // ------- Passo M2: materialidade 5pp -------
  const m2 = stepM2Materiality(tipo, input.metadados);
  if (m2.suppress) {
    logAlertEmit({
      event: 'alert.emit',
      companyId: input.companyId,
      tipo,
      severidade: input.severidade,
      resultado: 'suprimido_materialidade',
      alertId: null,
      notificationIds: [],
      emailQueueIds: [],
    });
    return {
      alertId: null,
      notificationIds: [],
      emailQueueIds: [],
      resultado: 'suprimido_materialidade',
    };
  }

  // ------- Sub-step canonico §9.2 (nao recorrencia B3) -------
  if (tipo === 'desempenho_queda_isolada') {
    if (input.escopoEmployeeId === null) {
      throw new Error(
        'alert.b3.invalid — desempenho_queda_isolada requer ' +
          'escopoEmployeeId (§9.2 chave canonica).',
      );
    }
    const b3 = await checkB3NaoRecorrencia(db, input.companyId, input.escopoEmployeeId, now);
    if (b3.bloquear) {
      logAlertEmit({
        event: 'alert.emit',
        companyId: input.companyId,
        tipo,
        severidade: input.severidade,
        resultado: 'b3_nao_recorrencia',
        alertId: null,
        notificationIds: [],
        emailQueueIds: [],
      });
      return {
        alertId: null,
        notificationIds: [],
        emailQueueIds: [],
        resultado: 'b3_nao_recorrencia',
      };
    }
  }

  // ------- Passo M3: INSERT em alerts -------
  const m3 = await stepM3InsertAlert(db, {
    companyId: input.companyId,
    tipo,
    severidade: input.severidade,
    escopo: input.escopo,
    escopoDepartamentoId: input.escopoDepartamentoId,
    escopoEmployeeId: input.escopoEmployeeId,
    metadados: input.metadados,
  });

  // ------- Passo M4: cooldown 7 dias -------
  const m4 = await stepM4Cooldown(db, now, {
    companyId: input.companyId,
    tipo,
    escopoEmployeeId: input.escopoEmployeeId,
    escopoDepartamentoId: input.escopoDepartamentoId,
    fatorId: null, // pipeline principal nunca fornece fatorId — apenas emitAlertPostGravacao
    alertIdRecemGravado: m3.alertId,
  });
  if (m4.suppress) {
    logAlertEmit({
      event: 'alert.emit',
      companyId: input.companyId,
      tipo,
      severidade: input.severidade,
      resultado: 'suprimido_cooldown',
      alertId: m3.alertId,
      notificationIds: [],
      emailQueueIds: [],
    });
    return {
      alertId: m3.alertId,
      notificationIds: [],
      emailQueueIds: [],
      resultado: 'suprimido_cooldown',
    };
  }

  // ------- Passo M5: INSERT em notifications -------
  const m5 = await stepM5InsertNotifications(db, {
    companyId: input.companyId,
    tipo,
    alertId: m3.alertId,
    severidade: input.severidade,
    linkContext: input.linkContext,
    resolverContexto: input.resolverContexto ?? {},
    subtitulo: input.subtitulo ?? null,
    escopoDepartamentoId: input.escopoDepartamentoId,
  });

  if (m5.motivo === 'zero_destinatarios') {
    logAlertEmit({
      event: 'alert.emit',
      companyId: input.companyId,
      tipo,
      severidade: input.severidade,
      resultado: 'zero_destinatarios',
      alertId: m3.alertId,
      notificationIds: [],
      emailQueueIds: [],
    });
    return {
      alertId: m3.alertId,
      notificationIds: [],
      emailQueueIds: [],
      resultado: 'zero_destinatarios',
    };
  }

  // ------- Passos M6+M7: canal + agrupamento por destinatario -------
  const tz = await resolveTimezone(db, input.companyId);

  const emailQueueIds: number[] = [];
  for (const dest of m5.destinatarios) {
    const canalDecisao = stepM6Channel(input.severidade, tipo);
    if (canalDecisao.canal === null) {
      // severidade='info' — sem enfileiramento (§6.5 regra 4). Fim para
      // este destinatario; a linha em notifications ja foi gravada.
      continue;
    }
    const m7 = await stepM7Enqueue(db, {
      companyId: input.companyId,
      destinatarioTipo: dest.destinatarioTipo,
      destinatarioEmail: dest.destinatarioEmail,
      destinatarioEmployeeId: dest.destinatarioEmployeeId,
      canal: canalDecisao.canal,
      alertId: m3.alertId,
      timezone: tz,
      now,
    });
    emailQueueIds.push(m7.emailQueueId);
  }

  logAlertEmit({
    event: 'alert.emit',
    companyId: input.companyId,
    tipo,
    severidade: input.severidade,
    resultado: 'gravado',
    alertId: m3.alertId,
    notificationIds: m5.notificationIds,
    emailQueueIds,
  });

  return {
    alertId: m3.alertId,
    notificationIds: m5.notificationIds,
    emailQueueIds,
    resultado: 'gravado',
  };
}

/**
 * Carrega `companies.timezone` da empresa alvo — utilizada pelo M7
 * digest_semanal para o calculo canonico da proxima segunda 08h fuso
 * local. Retorna null se empresa nao existe (o M7 aplica
 * `TIMEZONE_FALLBACK` para null).
 */
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
