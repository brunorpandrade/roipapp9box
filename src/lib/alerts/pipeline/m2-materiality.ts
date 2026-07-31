// ROIP APP 9BOX — passo M2 do pipeline anti-ruido (ME-059).
//
// Origem canonica: DOC 06 §8.4 (Materialidade 5pp — P06 canonizada).
// Regra literal:
//
//   - Se `tipo` em {desempenho_queda_brusca, desempenho_queda_isolada,
//     divergencia_a_c}: extrai `variacao` (P07/B3) ou `diferenca` (P28)
//     do payload `metadados`. Se `|valor| < 5.00`, retorna sem gravar.
//   - Caso contrario, pula M2.
//   - Log de trace: `alert.suppressed.materiality { companyId, tipo, variacao }`.
//
// Nota canonica sobre P28 (linha 763): a formula original de gatilho e
// `|scoreA - scoreC| > 25` — muito maior que 5. M2 e filtro
// redundante de fronteira; tipicamente sem efeito pratico. Preservado
// bit-exact.
//
// Contrato canonico:
// - Funcao pura sem I/O. Entrada: tipo + metadados (JSON opaco).
// - Retorno: `{ suppress: boolean }`.
// - Nao lanca. Se o campo esperado nao estiver presente ou tiver tipo
//   invalido, retorna `suppress=true` com motivo `sem_valor_material`
//   — assume conservador de que o hook chamador tem bug e nao emite
//   alerta ruim.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `LIMIAR_5PP` (constante) → consumido internamente + testes.
//   - `stepM2Materiality` → consumido por `emitAlert.ts` e testes.

import { type AlertTipo } from '../typeDictionary';

/**
 * Limiar canonico de materialidade (§8.4 P06 — 5 pontos percentuais).
 * Comparacao usa modulo (|x| < 5.00). Variacoes negativas ou positivas
 * sao ambas materiais se |x| >= 5.00.
 */
export const LIMIAR_5PP = 5.0 as const;

/**
 * Tipos canonicos sujeitos a M2 (§8.4). Extraido para inspecao dos
 * testes e para evitar duplicacao com o corpo do step.
 */
export const TIPOS_M2: readonly AlertTipo[] = [
  'desempenho_queda_brusca',
  'desempenho_queda_isolada',
  'divergencia_a_c',
] as const;

/**
 * Resultado canonico do passo M2.
 *
 * - `suppress=true` → pipeline encerra sem gravar. Motivos:
 *     - `nao_aplicavel` (defeito de logica — nao deve ocorrer com
 *       codigo bem chamado);
 *     - `sem_valor_material` (payload malformado — supressao defensiva);
 *     - `abaixo_limiar` (|valor| < 5.00 — supressao canonica §8.4).
 * - `suppress=false, motivo='fora_escopo_m2' | 'acima_limiar'` →
 *   prosseguir para M3.
 */
export interface M2Result {
  readonly suppress: boolean;
  readonly motivo: 'fora_escopo_m2' | 'sem_valor_material' | 'abaixo_limiar' | 'acima_limiar';
  readonly valorExtraido: number | null;
}

function extrairValorMaterial(tipo: AlertTipo, metadados: unknown): number | null {
  if (metadados === null || typeof metadados !== 'object') return null;
  const obj = metadados as Record<string, unknown>;
  // §8.4: `variacao` para P07 e B3; `diferenca` para P28.
  const chave = tipo === 'divergencia_a_c' ? 'diferenca' : 'variacao';
  const valor = obj[chave];
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  return null;
}

/**
 * Aplica passo M2 canonico. Curto-circuita para tipos fora do escopo
 * de materialidade.
 */
export function stepM2Materiality(tipo: AlertTipo, metadados: unknown): M2Result {
  if (!TIPOS_M2.includes(tipo)) {
    return { suppress: false, motivo: 'fora_escopo_m2', valorExtraido: null };
  }
  const valor = extrairValorMaterial(tipo, metadados);
  if (valor === null) {
    return { suppress: true, motivo: 'sem_valor_material', valorExtraido: null };
  }
  if (Math.abs(valor) < LIMIAR_5PP) {
    return { suppress: true, motivo: 'abaixo_limiar', valorExtraido: valor };
  }
  return { suppress: false, motivo: 'acima_limiar', valorExtraido: valor };
}
