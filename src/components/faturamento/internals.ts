// ROIP APP 9BOX — helpers puros e tipos da tela de Faturamento mensal
// (ME-fila7 construcao dispatch 1).
//
// Superficie de UI de `/faturamento-mensal` (RF) e
// `/super-admin/empresa/[id]/faturamento-mensal` (Bruno). Consome o
// backend `revenue.*` (ME-044) e `monthlyClosure.getClosureStatus`
// (ME-037), ja testados. Nenhuma regra de negocio nova vive aqui.
//
// Origem canonica:
// - DOC 05 §14.15 (estrutura da tela + navegacao por mes §14.13).
// - DOC 02 §3.2 (matriz de permissao — aplicada no backend `revenue`).
// - Mockup `faturamento_mensal_v1.html` (referencia visual).
//
// **RV-13.** Todo export tem consumidor real:
// - tipos e `FaturamentoClientProps` → pages + `FaturamentoClient`.
// - `currentMesUTC`, `addMonthsToMes`, `formatMesLabel`,
//   `enumerateJanelaDesc`, `formatBRL` → `FaturamentoClient` + actions +
//   teste `me-fila7-faturamento-structure`.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/** Status canonico do mes (espelha `monthlyClosureStatus.status`). */
export type FaturamentoStatus = 'aberto' | 'fechado' | 'desbloqueado';

/** Linha do historico mensal (§14.15 tabela mensal). */
export interface MesFaturamentoRow {
  readonly mes: string;
  readonly faturamentoBruto: string | null;
  readonly status: FaturamentoStatus;
}

/** Props do `FaturamentoClient`, montadas server-side pelas duas pages. */
export interface FaturamentoClientProps {
  readonly variant: 'rh' | 'super_admin';
  readonly companyId: number;
  readonly mesInicial: string;
  readonly faturamentoInicial: string | null;
  readonly statusInicial: FaturamentoStatus;
  readonly mesesPendentes: number;
}

/** Nomes canonicos dos meses em pt-BR (indice 0 = Janeiro). */
const MESES_PT: readonly string[] = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Mes corrente no formato `YYYY-MM`, ancorado em UTC (TZ do projeto). */
export function currentMesUTC(now: Date = new Date()): string {
  const ano = now.getUTCFullYear();
  const mes = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

/** Desloca `mes` (`YYYY-MM`) em `delta` meses, preservando o formato. */
export function addMonthsToMes(mes: string, delta: number): string {
  const partes = mes.split('-');
  const ano = Number(partes[0]);
  const mesIdx = Number(partes[1]) - 1;
  const base = new Date(Date.UTC(ano, mesIdx, 1));
  base.setUTCMonth(base.getUTCMonth() + delta);
  const novoAno = base.getUTCFullYear();
  const novoMes = String(base.getUTCMonth() + 1).padStart(2, '0');
  return `${novoAno}-${novoMes}`;
}

/** Rotulo humano de um `mes` (`YYYY-MM`) — ex.: `Junho 2026`. */
export function formatMesLabel(mes: string): string {
  const partes = mes.split('-');
  const idx = Number(partes[1]) - 1;
  const nome = MESES_PT[idx] ?? partes[1];
  return `${nome} ${partes[0]}`;
}

/**
 * Enumera `janela` meses terminando em `mesFinal`, do mais recente para
 * o mais antigo (ordem decrescente — a tabela de historico exibe assim).
 */
export function enumerateJanelaDesc(mesFinal: string, janela: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < janela; i += 1) {
    out.push(addMonthsToMes(mesFinal, -i));
  }
  return out;
}

/** Formata um decimal string em BRL (`R$ 1.234.567,89`) ou `—` se nulo. */
export function formatBRL(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
