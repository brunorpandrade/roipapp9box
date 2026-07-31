// ROIP APP 9BOX — passo M4 do pipeline anti-ruido (ME-059).
//
// Origem canonica: DOC 06 §8.6 (Cooldown 7 dias).
//
// Regra literal:
//   - Se `tipo` esta na lista canonica de isentos (`isentoM4=true` no
//     TIPO_DICTIONARY), pula M4.
//   - Caso contrario, consulta canonica com chave
//     `(tipo, companyId, escopoEmployeeId?, escopoDepartamentoId?)`:
//
//     SELECT id FROM alerts
//     WHERE tipo = ?
//       AND companyId = ?
//       AND (escopoEmployeeId <=> ?)
//       AND (escopoDepartamentoId <=> ?)
//       AND (fatorId <=> NULL)             -- exceto NR-1 fator (chave ampliada)
//       AND suprimidoPorCooldown = false
//       AND id != ?
//       AND createdAt >= NOW() - INTERVAL 7 DAY
//     LIMIT 1
//
//   - Se retorna linha: marca `suprimidoPorCooldown = true` na linha
//     recem-gravada em M3 e retorna sem seguir para M5.
//
// Chave ampliada canonica para NR-1 (`nr1_fator_critico`): a chave inclui
// `fatorId` — `(tipo, companyId, escopoDepartamentoId, fatorId)` — para
// distinguir alertas do mesmo tipo em fatores diferentes.
//
// **Cooldown 7 DIAS**: preserva regra bit-exact — `NOW() - INTERVAL 7 DAY`.
//
// Contrato canonico:
// - Funcao com I/O. Recebe `db`, `alertIdRecemGravado`, payload M3.
// - Retorno: `{ suppress: boolean }`.
// - Se `suppress=true`, executa UPDATE canonico em `alerts` no mesmo
//   passo (efeito colateral proprio do M4 §8.6 linha 787).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `M4_JANELA_DIAS` (constante) → consumido internamente + testes.
//   - `stepM4Cooldown` → consumido por `emitAlert.ts` e testes.

import { and, eq, gte, isNull, ne } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import { alerts } from '../../../db/schema';

import { type AlertTipo, getTipoMetadata } from '../typeDictionary';

/**
 * Janela canonica do cooldown (§8.6 — 7 dias corridos).
 */
export const M4_JANELA_DIAS = 7 as const;

/**
 * Payload de contexto canonico. Inclui `fatorId` apenas para NR-1
 * (`nr1_fator_critico`) — os demais tipos passam `null`.
 */
export interface M4CooldownContext {
  readonly companyId: number;
  readonly tipo: AlertTipo;
  readonly escopoEmployeeId: number | null;
  readonly escopoDepartamentoId: number | null;
  readonly fatorId: number | null; // apenas para nr1_fator_critico
  readonly alertIdRecemGravado: number;
}

/**
 * Resultado canonico do M4.
 *
 * - `suppress=true, alertIdBloqueador=X` → alerta anterior X esta na
 *   janela; a linha recem-gravada foi marcada `suprimidoPorCooldown=true`.
 * - `suppress=false, motivo='isento'` → tipo isento de M4.
 * - `suppress=false, motivo='sem_anterior'` → nenhum alerta na janela.
 */
export interface M4Result {
  readonly suppress: boolean;
  readonly motivo: 'isento' | 'sem_anterior' | 'em_cooldown';
  readonly alertIdBloqueador: number | null;
}

/**
 * Aplica passo M4 canonico. Cooldown de 7 dias, com chave ampliada
 * para NR-1 fator critico (por fatorId).
 *
 * O UPDATE canonico (`SET suprimidoPorCooldown = true WHERE id = ?`)
 * ocorre INTERNAMENTE aqui sob supressao — comportamento bit-exact do
 * §8.5 linha 787 ("Se M4 subsequentemente marcar supressao, executa
 * na mesma transacao"). O `emitAlert` orquestrador nao precisa fazer
 * o UPDATE — este step ja o faz.
 */
export async function stepM4Cooldown(
  db: RoipDatabase,
  now: Date,
  ctx: M4CooldownContext,
): Promise<M4Result> {
  const meta = getTipoMetadata(ctx.tipo);
  if (meta.isentoM4) {
    return { suppress: false, motivo: 'isento', alertIdBloqueador: null };
  }

  const janelaInicio = new Date(now.getTime() - M4_JANELA_DIAS * 24 * 60 * 60 * 1000);

  // Chave canonica: sempre inclui (tipo, companyId). Comparacao
  // null-safe via `isNull` tipado do Drizzle (equivalente a
  // `(coluna <=> valor)` do SQL literal do §8.6).
  const escopoEmployeeIdSql =
    ctx.escopoEmployeeId === null
      ? isNull(alerts.escopoEmployeeId)
      : eq(alerts.escopoEmployeeId, ctx.escopoEmployeeId);

  const escopoDepartamentoIdSql =
    ctx.escopoDepartamentoId === null
      ? isNull(alerts.escopoDepartamentoId)
      : eq(alerts.escopoDepartamentoId, ctx.escopoDepartamentoId);

  const fatorIdSql = meta.chaveM4Ampliada
    ? ctx.fatorId === null
      ? isNull(alerts.fatorId)
      : eq(alerts.fatorId, ctx.fatorId)
    : isNull(alerts.fatorId);
  // §8.6 linha 807 — `(fatorId <=> NULL)` para todos exceto ampliada.

  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.tipo, ctx.tipo),
        eq(alerts.companyId, ctx.companyId),
        escopoEmployeeIdSql,
        escopoDepartamentoIdSql,
        fatorIdSql,
        eq(alerts.suprimidoPorCooldown, false),
        ne(alerts.id, ctx.alertIdRecemGravado),
        gte(alerts.createdAt, janelaInicio),
      ),
    )
    .limit(1);
  const first = rows[0];
  if (first === undefined) {
    return { suppress: false, motivo: 'sem_anterior', alertIdBloqueador: null };
  }

  // Efeito colateral canonico §8.5 linha 787: UPDATE bit-exact.
  await db
    .update(alerts)
    .set({ suprimidoPorCooldown: true })
    .where(eq(alerts.id, ctx.alertIdRecemGravado));

  return { suppress: true, motivo: 'em_cooldown', alertIdBloqueador: first.id };
}
