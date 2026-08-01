// ROIP APP 9BOX — passo M1 do pipeline anti-ruido (ME-059 → ME-062 D066).
//
// Origem canonica: DOC 06 §8.3 (Supressao de onboarding — 90 dias
// pos-kickoff). Regra literal:
//
//   - Se `tipo` esta na lista canonica de isentos (`isentoM1=true` no
//     TIPO_DICTIONARY), pula M1.
//   - Caso contrario, consulta `companies.kickoffDate`. Se
//     `NOW() < kickoffDate + INTERVAL 90 DAY`, retorna sem gravar.
//   - Log de trace: `alert.suppressed.onboarding { companyId, tipo }`.
//     Sem gravacao em `alerts` nem em `notifications`.
//
// **CC049 FECHADA em ME-062 (D066).** Ate ME-061 o campo canonico
// `companies.kickoffDate` referenciado pelo §8.3 NAO existia no schema
// real (DOC 01 §4.2); apenas `mesKickoff` (int 1-12) — semantica
// distinta (mes do ano fiscal, nao data efetiva de kickoff). Proxy
// operacional temporario: `companies.createdAt` como aproximacao. A
// migration canonica ME-062 (0000_canonical.sql sob S339) adiciona
// `kickoffDate DATE NOT NULL` ao schema `companies` — este passo M1
// passa a consumir o campo dedicado literalmente conforme §8.3, sem
// proxy. CC049 canonicamente encerrada; D066 canonicamente fechada.
//
// Regra de imutabilidade canonica CC054 (ME-062, N5 aprovada):
// `kickoffDate` e imutavel apos o primeiro trimestre fechado — padrao
// bit-exact aos campos irmaos `mesInicioAnoFiscal`/`mesKickoff` do
// DOC 01 §4.2. Validacao aplicada em `companies.update` (fora do
// escopo deste modulo — este passo apenas consome o campo).
//
// Contrato canonico:
// - Funcao com I/O. Le `companies.kickoffDate` do repo real.
// - Retorno canonico: `{ suppress: boolean, motivo: ... }`.
// - Consumido apenas por `emitAlert` (nao aplicavel a
//   `emitAlertPostGravacao` — NR-1 e canonicamente isento).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `M1_ONBOARDING_JANELA_DIAS` (constante) → consumido internamente
//     + testes unitarios.
//   - `stepM1Onboarding` → consumido por `emitAlert.ts` e testes
//     unitarios.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../../db/client';
import { companies } from '../../../db/schema';
import { type AlertTipo, getTipoMetadata } from '../typeDictionary';

/**
 * Janela canonica de supressao pos-kickoff (§8.3 — "90 dias corridos
 * pos-kickoff"). Constante para inspecao dos testes e para o log de
 * trace evidenciar o valor operacional.
 */
export const M1_ONBOARDING_JANELA_DIAS = 90 as const;

/**
 * Resultado canonico do passo M1.
 *
 * - `suppress=true` → pipeline encerra sem gravar em `alerts` nem em
 *   `notifications`. Motivo canonico: onboarding em curso.
 * - `suppress=false` → prosseguir para M2.
 */
export interface M1Result {
  readonly suppress: boolean;
  readonly motivo: 'isento' | 'dentro_onboarding' | 'fora_onboarding' | 'kickoff_ausente';
}

/**
 * Aplica passo M1 canonico contra `companies.kickoffDate` real (D066
 * fechada em ME-062). Isentos passam sem consulta ao banco.
 *
 * Nota canonica sobre `kickoffDate` ausente: `companies.kickoffDate` e
 * `NOT NULL` no schema real — o motivo canonico `kickoff_ausente` e
 * preservado apenas como salvaguarda defensiva (empresa deletada
 * durante execucao do pipeline, ou linha retornada sem `kickoffDate`
 * por corrupcao). Nao ha caminho canonico em que uma empresa ativa
 * chegue aqui sem `kickoffDate` populado.
 *
 * `kickoffDate` e `date` no schema — Drizzle desserializa como `Date`
 * (JavaScript). A comparacao canonica `NOW() < kickoffDate +
 * INTERVAL 90 DAY` traduz-se em milissegundos com `getTime()`.
 */
export async function stepM1Onboarding(
  db: RoipDatabase,
  companyId: number,
  tipo: AlertTipo,
  now: Date,
): Promise<M1Result> {
  const meta = getTipoMetadata(tipo);
  if (meta.isentoM1) {
    return { suppress: false, motivo: 'isento' };
  }

  const rows = await db
    .select({ kickoffDate: companies.kickoffDate })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const first = rows[0];
  if (first === undefined || first.kickoffDate === null) {
    return { suppress: true, motivo: 'kickoff_ausente' };
  }

  // Comparacao canonica: NOW() < kickoffDate + 90 DIAS (§8.3 literal).
  // `kickoffDate` no schema e `date` — Drizzle desserializa como Date
  // com hora 00:00:00 local. Comparacao direta em ms preserva a
  // semantica "90 dias corridos pos-kickoff".
  const kickoffValue: Date =
    first.kickoffDate instanceof Date ? first.kickoffDate : new Date(first.kickoffDate);
  const kickoffMs = kickoffValue.getTime();
  const limiteMs = kickoffMs + M1_ONBOARDING_JANELA_DIAS * 24 * 60 * 60 * 1000;
  if (now.getTime() < limiteMs) {
    return { suppress: true, motivo: 'dentro_onboarding' };
  }
  return { suppress: false, motivo: 'fora_onboarding' };
}
