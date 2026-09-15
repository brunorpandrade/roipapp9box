// ROIP APP 9BOX — modulo puro canonico dos cabecalhos RH + Lider das
// planilhas mensais (§3.11 + mockup §7.5 + S188, ME-fila5 D3).
//
// Racional canonico: extraido de `src/server/routers/spreadsheets.ts:139-
// 153` para que Client Components possam consumir os rotulos sem
// arrastar `exceljs` / `node:stream` no bundle client-side. `spread-
// sheets.ts` continua exportando `NOME_ABA_RH`, `NOME_ABA_LIDER`,
// `COLUNAS_CANONICAS_RH`, `COLUNAS_FIXAS_LIDER` — este modulo apenas
// duplica bit-a-bit para segurar o contrato canonico com o client.
// Um teste de regressao no `spreadsheets.ts` (existente) garante que
// as duas fontes nao divergem: mudanca em um exige mudanca no outro.
//
// **RV-13.** Consumido por `src/components/import-mass/ImportarPlanilha
// Modal.tsx` (validacao client-side de cabecalhos monthly-rh e monthly-
// leader) + `src/server/routers/spreadsheets.ts` (import-side-only, para
// prova de consistencia via teste unit).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/** Nome canonico da aba RH da planilha mensal (§3.11). */
export const NOME_ABA_RH_MONTHLY = 'Preenchimento mensal RH' as const;

/** Nome canonico da aba Lider da planilha mensal (§3.11). */
export const NOME_ABA_LIDER_MONTHLY = 'Preenchimento mensal Lider' as const;

/**
 * Cabecalhos canonicos exatos da aba RH (§3.11 + mockup §7.5).
 * Fixos (6 colunas). Validacao client-side estrita.
 */
export const COLUNAS_CANONICAS_RH_MONTHLY = [
  'Nome',
  'CPF',
  'Cargo',
  'Lider direto',
  'Custo mensal (R$)',
  'Faltas',
] as const;

/**
 * Cabecalhos fixos canonicos da aba Lider (S188). Precedem colunas
 * dinamicas CC3 (`Meta [Variavel N]`, `Demanda [Variavel N]`,
 * `Realizado [Variavel N]`) que variam por empresa. Validacao client-
 * side APENAS destas 2 fixas — as dinamicas ficam para o backend
 * autoritativo (`parseUploadLeaderWorkbook`).
 */
export const COLUNAS_FIXAS_LIDER_MONTHLY = ['Nome liderado', 'Cargo'] as const;
