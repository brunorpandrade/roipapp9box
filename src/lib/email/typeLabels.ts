// ROIP APP 9BOX — utilitario canonico de rotulos e emojis para e-mails
// (ME-060).
//
// Origem canonica:
// - DOC 06 §6.1 (rotulos legiveis literais dos 17 tipos).
// - DOC 06 §6.2 (emojis canonicos de severidade).
// - DOC 06 §12.6 (badge canonica: emoji + rotulo legivel do tipo).
//
// Contrato canonico:
// - Camada fina sobre `TIPO_DICTIONARY` e `SEVERIDADE_EMOJI` do motor de
//   alertas (ME-059). Nao duplica dados canonicos — reutiliza o dicionario
//   ja canonicamente extraido. Se um rotulo mudar no DOC 06, muda em um
//   unico local (motor).
// - Funcoes puras sem I/O. Sem side effects.
// - `formatAlertBadge` combina emoji + rotulo canonicamente para uso nos
//   templates A e B (§12.6 linha 1407).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `getRotuloLegivel` → `contextResolvers.ts` +
//     `jobs/emailQueueJob.ts` + `jobs/weeklyDigestJob.ts` + testes.
//   - `getEmojiSeveridade` → `contextResolvers.ts` +
//     `jobs/emailQueueJob.ts` + `jobs/weeklyDigestJob.ts` + testes.
//   - `formatAlertBadge` → `templates/templateA_immediate.ts` +
//     `templates/templateB_weeklyDigest.ts` + testes.

import {
  SEVERIDADE_EMOJI,
  TIPO_DICTIONARY,
  type AlertSeveridade,
  type AlertTipo,
} from '../alerts/typeDictionary';

/**
 * Devolve o rotulo legivel canonico do tipo (§6.1). Sem transformacao —
 * reproducao bit-exact do dicionario.
 */
export function getRotuloLegivel(tipo: AlertTipo): string {
  return TIPO_DICTIONARY[tipo].rotuloLegivel;
}

/**
 * Devolve o emoji canonico da severidade (§6.2). Sem transformacao —
 * reproducao bit-exact do dicionario.
 */
export function getEmojiSeveridade(severidade: AlertSeveridade): string {
  return SEVERIDADE_EMOJI[severidade];
}

/**
 * Constroi a badge canonica de um alerta para renderizacao em template A
 * ou B (§12.6 linha 1407: "Badge com emoji canonico da severidade + rotulo
 * legivel canonico do tipo").
 *
 * Formato canonico: `{emoji} {rotuloLegivel}` — separacao por espaco
 * simples, sem colchetes, sem pontuacao adicional.
 */
export function formatAlertBadge(tipo: AlertTipo, severidade: AlertSeveridade): string {
  return `${getEmojiSeveridade(severidade)} ${getRotuloLegivel(tipo)}`;
}
