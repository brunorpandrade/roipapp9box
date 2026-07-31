// ROIP APP 9BOX — regra canonica de canal por severidade (ME-059).
//
// Origem canonica:
// - DOC 06 §6.3 (regra canonica de canal por severidade).
// - DOC 06 §6.5 (determinacao do canal no passo M6).
// - DOC 06 §8.8 (passo M6 do pipeline — lista canonica de overrides).
//
// Contrato canonico:
// - Funcao pura sem I/O. Entrada: severidade + tipo. Saida: canal ou
//   null (para severidade `info` — pipeline encerra sem enfileirar).
// - Utilizado exclusivamente pelo passo M6 do pipeline (M6-channel).
// - Nenhum consumo externo alem do proprio pipeline — modulo interno
//   ao motor.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `resolveCanal` → consumido por
//     `src/lib/alerts/pipeline/m6-channel.ts` e testes unitarios.
//   - `CanalDecisao` (tipo) → consumido por consumidores acima.

import {
  type AlertCanal,
  type AlertSeveridade,
  type AlertTipo,
  getTipoMetadata,
} from './typeDictionary';

/**
 * Decisao canonica do canal apos M6.
 *
 * - `{ canal: 'imediato' | 'digest_semanal' }` — enfileirar em
 *   `emailQueue` na trilha correspondente.
 * - `{ canal: null, motivo: 'severidade_info' }` — severidade `info`
 *   nao gera e-mail; o pipeline encerra para o destinatario apos M5
 *   (§6.5, regra 4).
 */
export type CanalDecisao =
  | { readonly canal: AlertCanal; readonly motivo: null }
  | { readonly canal: null; readonly motivo: 'severidade_info' };

/**
 * Aplica a regra canonica §6.5:
 *
 *   1. `critico` → `imediato` (sem override possivel — §6.3).
 *   2. `atencao` → `imediato` se tipo em lista de override
 *      (`override_atencao_imediato` do `TIPO_DICTIONARY`); caso
 *      contrario, `digest_semanal`.
 *   3. `observacao` → `digest_semanal` (sem override possivel).
 *   4. `info` → sem canal (retorna `{ canal: null, motivo:
 *      'severidade_info' }`).
 *
 * Nota canonica sobre `atencao` fora da lista de override: sao os 4
 * tipos administrativos de ciclo/NR-1 que canonicamente vao para
 * digest (§6.3). O motor nao inspeciona uma lista propria — le
 * `TIPO_DICTIONARY[tipo].override_atencao_imediato` que ja carrega a
 * decisao canonica.
 */
export function resolveCanal(severidade: AlertSeveridade, tipo: AlertTipo): CanalDecisao {
  if (severidade === 'critico') {
    return { canal: 'imediato', motivo: null };
  }
  if (severidade === 'atencao') {
    const meta = getTipoMetadata(tipo);
    return meta.override_atencao_imediato
      ? { canal: 'imediato', motivo: null }
      : { canal: 'digest_semanal', motivo: null };
  }
  if (severidade === 'observacao') {
    return { canal: 'digest_semanal', motivo: null };
  }
  // severidade === 'info'
  return { canal: null, motivo: 'severidade_info' };
}
