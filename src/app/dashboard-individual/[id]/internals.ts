// ROIP APP 9BOX — helpers, tipos e constantes da tela Dashboard individual
// (ME-fila7 construcao dispatch 3, fase 1). Superficie read-only sobre o
// backend `dashboard.getEmployeeDashboard` (S065) + Diagnostico IA
// (`getDiagnostico`/`generateDiagnostico`), ja testados.
//
// Origem canonica:
// - DOC 05 §14.25 (dashboards hierarquicos) + §10 (Diagnostico IA).
// - Mockup `dashboard_individual_v7.html` (referencia visual + grade 9-Box).
// - DOC 02 §9.10/§10.4 (PC1f — guard de escopo no resolver do backend).
//
// **RV-13.** Todo export tem consumidor real (page + client + actions +
// teste `me-fila7-dashboard-individual-structure`).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export type PosicaoX = 'baixo' | 'medio' | 'alto';
export type PosicaoY = 'baixa' | 'media' | 'alta';
export type FaixaDesempenho = 'baixo' | 'medio' | 'alto';
export type FaixaPlenitude = 'baixa' | 'media' | 'alta';
export type DirecaoMovimento = 'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez';

/** Cabecalho do colaborador (subconjunto de `employee` do payload). */
export interface EmployeeHeader {
  readonly id: number;
  readonly name: string;
  readonly departamento: string;
  readonly jobFamily: string;
  readonly senioridade: string;
  readonly nivelHierarquico: string;
  readonly isLider: boolean;
}

/** Eixo X — desempenho (subconjunto de `latestQuarterly`). */
export interface EixoX {
  readonly indiceDesempenho: string | null;
  readonly faixaDesempenho: FaixaDesempenho | null;
  readonly capacidadeOciosa: string | null;
}

/** Dimensao autoavaliacao (A) vs avaliacao do lider (C). */
export interface DimensaoAC {
  readonly label: string;
  readonly a: string | null;
  readonly c: string | null;
}

/** Eixo Y — plenitude (subconjunto de `latestPlenitude`). */
export interface EixoY {
  readonly plenitudeScore: string | null;
  readonly faixaPlenitude: FaixaPlenitude | null;
  readonly divergencia: string | null;
  readonly alertaDivergencia: boolean;
  readonly dimensoes: readonly DimensaoAC[];
}

/** Posicao 9-Box (subconjunto de `latestNineBox`). */
export interface NineBoxPos {
  readonly posicaoX: PosicaoX;
  readonly posicaoY: PosicaoY;
  readonly quadrante: string;
  readonly direcaoMovimento: DirecaoMovimento | null;
}

/** Diagnostico IA do trimestre. */
export interface DiagnosticoState {
  readonly texto: string | null;
  readonly geradoEm: string | null;
}

/** Props do `DashboardIndividualClient`, montadas server-side pela page. */
export interface DashboardIndividualClientProps {
  readonly variant: 'platform' | 'super_admin';
  readonly employee: EmployeeHeader;
  readonly trimestre: string | null;
  readonly isTrimestreAtual: boolean;
  readonly eixoX: EixoX | null;
  readonly eixoY: EixoY | null;
  readonly nineBox: NineBoxPos | null;
  readonly diagnostico: DiagnosticoState;
}

/** Celula da grade 9-Box (nome do quadrante + cores canonicas do mockup). */
export interface NineBoxCell {
  readonly quadrante: string;
  readonly bg: string;
  readonly text: string;
}

/**
 * Grade 9-Box canonica (`dashboard_individual_v7.html` var CL). Linha 0 =
 * plenitude ALTA (topo); coluna 0 = desempenho BAIXO (esquerda).
 */
export const NINE_BOX_GRID: readonly (readonly NineBoxCell[])[] = [
  [
    { quadrante: 'POTENCIAL SUBUTILIZADO', bg: '#FCEBEB', text: '#791F1F' },
    { quadrante: 'DESEMPENHO REPRESADO', bg: '#E1F5EE', text: '#085041' },
    { quadrante: 'ALTO IMPACTO', bg: '#EAF3DE', text: '#27500A' },
  ],
  [
    { quadrante: 'DESEMPENHO CRÍTICO', bg: '#FAEEDA', text: '#633806' },
    { quadrante: 'EQUILÍBRIO FRÁGIL', bg: '#E6F1FB', text: '#0C447C' },
    { quadrante: 'ALTA ENTREGA', bg: '#E6F1FB', text: '#0C447C' },
  ],
  [
    { quadrante: 'RISCO CRÍTICO', bg: '#FCEBEB', text: '#791F1F' },
    { quadrante: 'DESGASTE OCULTO', bg: '#FAEEDA', text: '#633806' },
    { quadrante: 'RISCO DE ESGOTAMENTO', bg: '#FAEEDA', text: '#633806' },
  ],
];

/** Legendas canonicas por quadrante (`dashboard_individual_v7.html` var QD). */
export const QUADRANTE_LEGENDA: Readonly<Record<string, string>> = {
  'ALTO IMPACTO':
    'Perfil de maior contribuição para a empresa. Valorize e fortaleça os ' +
    'comportamentos que sustentam essa condição.',
  'DESEMPENHO REPRESADO':
    'Potencial elevado ainda não convertido em desempenho. Investigar ' +
    'competências, contexto e adequação à função.',
  'POTENCIAL SUBUTILIZADO':
    'Engajamento presente, mas desempenho distante do potencial. Há espaço ' +
    'para investigar oportunidades de desenvolvimento.',
  'ALTA ENTREGA':
    'Resultados elevados com risco crescente de desgaste. Convém acompanhar ' +
    'a sustentabilidade desse ritmo ao longo do tempo.',
  'EQUILÍBRIO FRÁGIL':
    'Condição estável, com pequena margem para oscilações. Mudanças no ' +
    'contexto podem alterar rapidamente esse equilíbrio.',
  'DESEMPENHO CRÍTICO':
    'O desempenho está abaixo do esperado, apesar de condições favoráveis ' +
    'para recuperação. Compreender os fatores que limitam os resultados.',
  'RISCO DE ESGOTAMENTO':
    'Resultados elevados produzidos em uma condição insustentável. A ' +
    'continuidade tende a comprometer a pessoa e o desempenho.',
  'DESGASTE OCULTO':
    'A entrega atual mascara sinais de deterioração. Requer atenção à ' +
    'motivação, energia e estado emocional.',
  'RISCO CRÍTICO':
    'Situação de maior vulnerabilidade da matriz. Requer compreensão ampla ' +
    'das causas antes de qualquer decisão.',
};

const COL_INDEX: Readonly<Record<PosicaoX, number>> = { baixo: 0, medio: 1, alto: 2 };
const ROW_INDEX: Readonly<Record<PosicaoY, number>> = { alta: 0, media: 1, baixa: 2 };

/** Indice de coluna (desempenho) na grade. */
export function colIndexFor(posicaoX: PosicaoX): number {
  return COL_INDEX[posicaoX];
}

/** Indice de linha (plenitude) na grade. */
export function rowIndexFor(posicaoY: PosicaoY): number {
  return ROW_INDEX[posicaoY];
}

/** Seta de movimento entre trimestres (mockup `getSeta`). */
export function direcaoArrow(d: DirecaoMovimento | null): { char: string; color: string } {
  if (d === 'subiu') {
    return { char: '↑', color: '#16A34A' };
  }
  if (d === 'desceu') {
    return { char: '↓', color: '#DC2626' };
  }
  if (d === 'lateral') {
    return { char: '→', color: '#D97706' };
  }
  return { char: '', color: '' };
}

/** Valida o `[id]` (employeeId) da rota — inteiro positivo. */
export function parseEmployeeIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/** Trimestre corrente `YYYY-QN`, ancorado em UTC (TZ do projeto). */
export function currentTrimestreUTC(now: Date = new Date()): string {
  const ano = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${ano}-Q${q}`;
}

/** Iniciais (ate 2) do nome, maiusculas — para o avatar. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Formata um decimal string (0-100) como percentual pt-BR, ex.: `98,4%`. */
export function formatPercent(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return `${num.toFixed(1).replace('.', ',')}%`;
}

/** Formata um decimal string como score inteiro pt-BR, ex.: `81`. */
export function formatScore(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return String(Math.round(num));
}

/** Rotulo humano da faixa de desempenho. */
export function faixaDesempenhoLabel(f: FaixaDesempenho | null): string {
  if (f === 'alto') {
    return 'Alto desempenho';
  }
  if (f === 'medio') {
    return 'Médio desempenho';
  }
  if (f === 'baixo') {
    return 'Baixo desempenho';
  }
  return '—';
}

/** Rotulo humano da faixa de plenitude. */
export function faixaPlenitudeLabel(f: FaixaPlenitude | null): string {
  if (f === 'alta') {
    return 'Alta plenitude';
  }
  if (f === 'media') {
    return 'Média plenitude';
  }
  if (f === 'baixa') {
    return 'Baixa plenitude';
  }
  return '—';
}
