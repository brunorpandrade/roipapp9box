// ROIP APP 9BOX — public API do motor canonico de alertas (ME-059).
//
// Origem canonica: DOC 06 §8 (arquitetura em 3 camadas). Este `index.ts`
// e o barrel unico do modulo `src/lib/alerts/` — consumidores externos
// (hooks NOOP religados, endpoint do sino, testes) importam daqui.
//
// Regra canonica: nenhum consumidor externo importa modulos internos do
// pipeline (`pipeline/m*`, `severity.ts`, `linkResolver.ts`) diretamente
// — o barrel controla o superficie publica. Modulos internos permanecem
// acessiveis para testes unitarios via caminho absoluto.
//
// **RV-13.** Cada re-export tem chamador:
//   - `emitAlert` → consumido pelo religador de
//     `NOOP_EMIT_AUTO_ALERT` em `cycleScheduleEngine.ts`.
//   - `emitAlertPostGravacao` → consumido pelo religador do
//     `DEFAULT_NR1_ALERT_FACADE` em `nr1CalculationEngine.ts`.
//   - Tipos re-exportados → consumidos por testes de integracao.

// Entrypoints publicos
export { emitAlert } from './emitAlert';
export type { EmitAlertInput, EmitAlertResult } from './emitAlert';

export { emitAlertPostGravacao } from './emitAlertPostGravacao';
export type {
  EmitAlertPostGravacaoInput,
  EmitAlertPostGravacaoResult,
} from './emitAlertPostGravacao';

// Tipos publicos derivados
export type {
  AlertCanal,
  AlertEscopo,
  AlertSeveridade,
  AlertTipo,
  AlertTrilha,
  TipoMetadata,
} from './typeDictionary';

// Utilitarios publicos consumidos por testes ou por hooks especificos
export { assertTipoCanonico, AlertTipoInvalidoError, getTipoMetadata } from './typeDictionary';
