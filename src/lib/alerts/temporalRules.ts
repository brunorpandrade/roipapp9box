// ROIP APP 9BOX — regras canonicas temporais do motor de alertas (ME-059).
//
// Origem canonica:
// - DOC 06 §9.1 (recorrencia canonica de P08 — cadencia natural mensal).
// - DOC 06 §9.2 (nao recorrencia canonica de B3 — 2 trimestres anteriores).
// - DOC 06 §9.3 (exclusividade mutua P07/B3 — resolvida pelo hook, nao
//   pelo motor).
// - DOC 06 §9.4 (coexistencia P07/P08 — resolvida pelo hook).
// - DOC 06 §9.5 (comparacao temporal Z1 — P07 com gap — resolvida pelo
//   hook, nao pelo motor).
// - DOC 06 §9.6 (comparacao temporal R3 — P08 com lacunas — resolvida
//   pelo hook).
// - DOC 06 §9.7-§9.9 (filtragens Q5/Q6/W2 — resolvidas pelo hook antes
//   de invocar `emitAlert`).
//
// Contrato canonico:
// - Este modulo cobre APENAS a regra canonica §9.2 (nao recorrencia
//   B3) — a unica regra temporal que se aplica DENTRO do pipeline
//   M1-M7, especificamente entre M2 (materialidade) e M3 (INSERT).
// - Todas as demais regras §9 sao responsabilidade dos HOOKS canonicos
//   §8.11 do DOC 03 (evaluateQuarterlyAlerts, evaluateMonthlyAlerts,
//   etc), que ja resolvem exclusividade/coexistencia/gaps antes de
//   chamar o motor. O motor recebe eventos ja pre-decididos.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `SEIS_MESES_INTERVALO_DIAS` (constante) → consumido por
//     `checkB3NaoRecorrencia` internamente + testes unitarios.
//   - `checkB3NaoRecorrencia` → consumido por `emitAlert` (orquestrador)
//     como sub-passo entre M2 e M3 apenas para tipo `desempenho_queda_isolada`.

import { and, eq, gte, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { alerts } from '../../db/schema';

/**
 * Janela canonica de nao recorrencia do B3 (§9.2): "proxy canonico para
 * 2 trimestres". O DOC 06 usa `INTERVAL 6 MONTH` no SQL literal — 6
 * meses = 2 trimestres em cadencia trimestral padrao. Preservado
 * bit-exact do §9.2 linha 993.
 */
export const SEIS_MESES_INTERVALO_DIAS = 183 as const;

/**
 * Resultado canonico da verificacao. `bloquear=true` significa: existe
 * alerta P07 ou B3 nao suprimido nos ultimos 6 meses para o mesmo
 * `(companyId, employeeId)` — B3 nao deve gravar.
 */
export interface B3NaoRecorrenciaResult {
  readonly bloquear: boolean;
  readonly alertIdBloqueador: number | null;
}

/**
 * Aplica a regra canonica §9.2. Aplicada exclusivamente para
 * `tipo === 'desempenho_queda_isolada'` entre M2 e M3.
 *
 * Regra literal:
 *   B3 so dispara se NAO houve `desempenho_queda_brusca` (P07) nem
 *   `desempenho_queda_isolada` (B3) EFETIVAMENTE ENTREGUES nos 2
 *   trimestres anteriores. "Efetivamente entregue" =
 *   `alerts.suprimidoPorCooldown = false`. Alertas suprimidos por M2
 *   (materialidade) tambem NAO contam — mas nao ha coluna
 *   `suprimidoPorMaterialidade` em `alerts` porque M2 rejeita SEM
 *   gravar (§8.4). Consequentemente, a presenca da linha em `alerts`
 *   com `suprimidoPorCooldown=false` implica passagem em M2.
 *
 * SQL canonico (§9.2 linhas 986-995):
 *   SELECT id FROM alerts
 *   WHERE tipo IN ('desempenho_queda_brusca', 'desempenho_queda_isolada')
 *     AND companyId = ?
 *     AND escopoEmployeeId = ?
 *     AND suprimidoPorCooldown = false
 *     AND createdAt >= NOW() - INTERVAL 6 MONTH
 *   LIMIT 1
 */
export async function checkB3NaoRecorrencia(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  now: Date,
): Promise<B3NaoRecorrenciaResult> {
  const janela = new Date(now.getTime() - SEIS_MESES_INTERVALO_DIAS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        inArray(alerts.tipo, ['desempenho_queda_brusca', 'desempenho_queda_isolada']),
        eq(alerts.companyId, companyId),
        eq(alerts.escopoEmployeeId, employeeId),
        eq(alerts.suprimidoPorCooldown, false),
        gte(alerts.createdAt, janela),
      ),
    )
    .limit(1);
  const first = rows[0];
  if (first === undefined) {
    return { bloquear: false, alertIdBloqueador: null };
  }
  return { bloquear: true, alertIdBloqueador: first.id };
}
