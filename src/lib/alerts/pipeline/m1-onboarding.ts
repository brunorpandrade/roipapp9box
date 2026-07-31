// ROIP APP 9BOX — passo M1 do pipeline anti-ruido (ME-059).
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
// **CC049 (ME-059).** O campo `companies.kickoffDate` referenciado
// pelo §8.3 canonico NAO existe no schema real (DOC 01 §4.3). Apenas
// `mesKickoff` (int 1-12) e presente — semantica distinta (mes do ano
// fiscal, nao data efetiva de kickoff). Proxy canonico operacional:
// `companies.createdAt` como aproximacao — empresa criada ha menos de
// 90 dias = janela de onboarding. Debito canonico D066 registrado
// para adicionar `kickoffDate` (date) explicito ao schema em ME
// futura (Bloco B6 sub-b ou posterior); ao migrar, este passo M1
// consumira o campo dedicado sem retrabalho da assinatura interna.
//
// Contrato canonico:
// - Funcao com I/O. Le `companies.kickoffDate` do repo real.
// - Retorno canonico: `{ suppress: boolean }`.
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
 * Aplica passo M1 canonico sob CC049 (proxy `createdAt`). Isentos
 * passam sem consulta ao banco.
 *
 * Nota canonica sobre `createdAt` ausente: `companies.createdAt` tem
 * default `NOW()` e sempre esta populado apos INSERT — o motivo
 * canonico `kickoff_ausente` e preservado apenas como salvaguarda
 * defensiva (registro corrompido ou empresa deletada durante execucao
 * do pipeline).
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
    .select({ createdAt: companies.createdAt })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const first = rows[0];
  if (first === undefined || first.createdAt === null) {
    return { suppress: true, motivo: 'kickoff_ausente' };
  }

  // Comparacao canonica: NOW() < createdAt + 90 DIAS (CC049 proxy).
  // `createdAt` no schema e `timestamp` — comparacao direta em ms.
  const kickoffMs = first.createdAt.getTime();
  const limiteMs = kickoffMs + M1_ONBOARDING_JANELA_DIAS * 24 * 60 * 60 * 1000;
  if (now.getTime() < limiteMs) {
    return { suppress: true, motivo: 'dentro_onboarding' };
  }
  return { suppress: false, motivo: 'fora_onboarding' };
}
