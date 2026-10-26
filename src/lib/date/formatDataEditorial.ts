// ROIP APP 9BOX — helper canonico de data editorial em portugues
// brasileiro (ME-1.3d, item [1.10] do ROADMAP_V7).
//
// Extracao canonica L125 do debito D-DUP-DATA: ate 25/10/2026,
// `nr1Template.ts` e `snapshot9BoxTemplate.ts` carregavam copias
// identicas das 3 funcoes abaixo. Esta extracao consolida uma
// unica fonte de verdade e refatora os dois callsites originais +
// os 3 templates da ME-1.3d (board_deck, executiveReport,
// climaEngajamento) para consumi-la.
//
// Contratos preservados bit-exact das implementacoes originais do
// Radar NR-1 v7.1 e Snapshot 9-Box v1 (RV-10 integral).

/** Nomes dos 12 meses em portugues brasileiro, minuscula canonica. */
export const MESES_PT_BR = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/**
 * Deriva a data civil (YYYY-MM-DD) em America/Sao_Paulo a partir do
 * timestamp ISO UTC. Preserva o input bit-exact quando a data e
 * invalida ou a localizacao retorna formato inesperado.
 *
 * Canonico: espelho exato do helper do Radar NR-1 v7.1 (CC079-3).
 */
export function dataCivilBrtFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const partes = d
    .toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    .split('/');
  if (partes.length !== 3) return iso;
  const [dd, mm, yyyy] = partes;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formata uma data civil (YYYY-MM-DD ou ISO UTC) para o padrao
 * editorial canonico ROIPeople: "DD de mês de YYYY" (sem zero a
 * esquerda no dia, mes em minuscula). Preserva o input bit-exact
 * quando o formato nao casa.
 *
 * Canonico: espelho exato do helper do Radar NR-1 v6 +
 * Snapshot 9-Box v1.
 */
export function formatDataEditorial(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) return iso;
  const [, y, m, d] = match;
  if (y === undefined || m === undefined || d === undefined) return iso;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return iso;
  const mesNome = MESES_PT_BR[mi];
  if (mesNome === undefined) return iso;
  return `${Number(d)} de ${mesNome} de ${y}`;
}
