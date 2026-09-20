// ROIP APP 9BOX — helpers, tipos, grade 9-Box e mapper da tela Dashboard
// individual (ME-fila7 construcao dispatch 3.2/3.3). Superficie read-only
// sobre `dashboard.getEmployeeDashboard` (S065, com trimestre opcional) +
// Diagnostico IA. Navegacao por trimestre.
//
// Origem canonica:
// - DOC 05 §14.25 (dashboards) + §10 (Diagnostico IA).
// - Mockup `dashboard_individual_v7.html` (layout, grade 9-Box, faixas).
// - DOC 02 §9.10/§10.4 (PC1f no resolver do backend).
//
// **RV-13.** Todo export consumido (page + client + actions + teste).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { FichaCadastralActionResult } from '../../_shared/fichaCadastral/actions';

export type FichaLoadAction = (
  companyId: number,
  employeeId: number,
) => Promise<FichaCadastralActionResult>;

export type PosicaoX = 'baixo' | 'medio' | 'alto';
export type PosicaoY = 'baixa' | 'media' | 'alta';
export type FaixaDesempenho = 'baixo' | 'medio' | 'alto';
export type FaixaPlenitude = 'baixa' | 'media' | 'alta';
export type DirecaoMovimento = 'subiu' | 'desceu' | 'lateral' | 'estavel' | 'primeira_vez';

export interface EmployeeHeader {
  readonly id: number;
  readonly companyId: number;
  readonly name: string;
  readonly departamento: string;
  readonly jobFamily: string;
  readonly senioridade: string;
  readonly nivelHierarquico: string;
  readonly status: string;
  readonly isLider: boolean;
  readonly dataNascimento: string | null;
  readonly dataAdmissao: string | null;
  readonly liderDireto: string | null;
}

export interface EixoX {
  readonly indiceDesempenho: string | null;
  readonly faixaDesempenho: FaixaDesempenho | null;
  readonly capacidadeOciosa: string | null;
}

export interface DimensaoAC {
  readonly label: string;
  readonly a: string | null;
  readonly c: string | null;
}

export interface EixoY {
  readonly plenitudeScore: string | null;
  readonly faixaPlenitude: FaixaPlenitude | null;
  readonly scoreA: string | null;
  readonly scoreC: string | null;
  readonly divergencia: string | null;
  readonly alertaDivergencia: boolean;
  readonly dimensoes: readonly DimensaoAC[];
}

export interface NineBoxPos {
  readonly posicaoX: PosicaoX;
  readonly posicaoY: PosicaoY;
  readonly quadrante: string;
  readonly direcaoMovimento: DirecaoMovimento | null;
  readonly posicaoXAnterior: PosicaoX | null;
  readonly posicaoYAnterior: PosicaoY | null;
}

export interface EixoXVariavel {
  readonly variableIndex: number;
  readonly nome: string;
  readonly unidade: string;
  readonly meta: string | null;
  readonly demanda: string | null;
  readonly executado: string | null;
  readonly desempenho: string | null;
  readonly peso: string | null;
}

export interface EixoXDetalhe {
  readonly indiceDesempenho: string | null;
  readonly variaveis: readonly EixoXVariavel[];
}

export interface FinanceiroBlock {
  readonly roiEstimado: string | null;
  readonly metaROI: string | null;
  readonly retornoEstimado: string | null;
  readonly percMetaAtingida: string | null;
}

export interface DiagnosticoState {
  readonly texto: string | null;
  readonly geradoEm: string | null;
}

/** Visao serializavel de um trimestre (montada server-side, trocada na nav). */
export interface QuarterView {
  readonly trimestre: string | null;
  readonly isTrimestreAtual: boolean;
  readonly eixoX: EixoX | null;
  readonly eixoY: EixoY | null;
  readonly nineBox: NineBoxPos | null;
  readonly financeiro: FinanceiroBlock | null;
  readonly diagnostico: DiagnosticoState;
  readonly assiduidadeMedia: string | null;
}

export interface DashboardIndividualClientProps {
  readonly variant: 'platform' | 'super_admin';
  readonly employee: EmployeeHeader;
  readonly trimestresDisponiveis: readonly string[];
  readonly view: QuarterView;
  readonly fichaLoadAction: FichaLoadAction;
  readonly editHref: string | null;
  readonly hideRf: boolean;
}

const MESES_QUADRIMESTRE: Readonly<Record<string, string>> = {
  Q1: 'Janeiro a Março',
  Q2: 'Abril a Junho',
  Q3: 'Julho a Setembro',
  Q4: 'Outubro a Dezembro',
};

export interface NineBoxCell {
  readonly quadrante: string;
  readonly bg: string;
  readonly text: string;
}

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

export function colIndexFor(posicaoX: PosicaoX): number {
  return COL_INDEX[posicaoX];
}

export function rowIndexFor(posicaoY: PosicaoY): number {
  return ROW_INDEX[posicaoY];
}

/**
 * Deriva a seta de deslocamento 9-Box (ME pos-fila7) a partir das
 * posicoes atual e anterior. Substitui `direcaoArrow` (que reduzia o
 * movimento a 3 direcoes) pela regra completa:
 *
 * Eixos (indices em COL_INDEX/ROW_INDEX):
 *  - X (desempenho): baixo<medio<alto — colIndex cresce para a DIREITA.
 *  - Y (plenitude): alta<media<baixa no indice — SUBIR e rowIndex MENOR.
 *
 * Semantica: dxDir = colAtual - colAnt (>0 direita, <0 esquerda);
 *            dySem = rowAnt - rowAtual (>0 subiu, <0 desceu).
 *
 * Seta (8 direcoes): sem movimento -> nenhuma; combinacoes de
 * direita/esquerda x cima/baixo -> →←↑↓ e diagonais ↗↘↖↙.
 *
 * Cor: VERDE (#16A34A) avanco limpo (nenhum eixo retrocede e ao menos um
 * avanca — direita e/ou cima); VERMELHO (#DC2626) retrocesso limpo;
 * AMARELO (#D97706) movimento misto (um eixo avanca e o outro retrocede).
 */
export function derivarSeta(
  posX: PosicaoX,
  posY: PosicaoY,
  posXAnt: PosicaoX | null,
  posYAnt: PosicaoY | null,
): { char: string; color: string } {
  if (posXAnt === null || posYAnt === null) {
    return { char: '', color: '' };
  }
  const dxDir = COL_INDEX[posX] - COL_INDEX[posXAnt];
  const dySem = ROW_INDEX[posYAnt] - ROW_INDEX[posY];
  if (dxDir === 0 && dySem === 0) {
    return { char: '', color: '' };
  }
  const VERDE = '#16A34A';
  const VERMELHO = '#DC2626';
  const AMARELO = '#D97706';
  let color: string;
  const avancou = dxDir > 0 || dySem > 0;
  const retrocedeu = dxDir < 0 || dySem < 0;
  if (avancou && retrocedeu) {
    color = AMARELO;
  } else if (avancou) {
    color = VERDE;
  } else {
    color = VERMELHO;
  }
  const CHAR: Record<string, string> = {
    '1,1': '↗',
    '1,0': '→',
    '1,-1': '↘',
    '0,1': '↑',
    '0,-1': '↓',
    '-1,1': '↖',
    '-1,0': '←',
    '-1,-1': '↙',
  };
  const sx = Math.sign(dxDir);
  const sy = Math.sign(dySem);
  const char = CHAR[`${sx},${sy}`] ?? '';
  return { char, color };
}

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

export function currentTrimestreUTC(now: Date = new Date()): string {
  const ano = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${ano}-Q${q}`;
}

/** Rotulo humano do trimestre `YYYY-QN`, ex.: `Janeiro a Março de 2026`. */
export function quarterLabel(trimestre: string | null): string {
  if (trimestre === null) {
    return '—';
  }
  const partes = trimestre.split('-');
  const faixa = MESES_QUADRIMESTRE[partes[1] ?? ''] ?? partes[1] ?? '';
  return `${faixa} de ${partes[0]}`;
}

/**
 * Escolhe o trimestre default: o mais recente (lista em ordem decrescente)
 * que seja <= trimestre corrente, para nao abrir em trimestre futuro/stub.
 * Se todos forem futuros, usa o primeiro (mais recente) disponivel.
 */
export function pickDefaultTrimestre(
  trimestresDesc: readonly string[],
  atual: string,
): string | null {
  if (trimestresDesc.length === 0) {
    return null;
  }
  for (const t of trimestresDesc) {
    if (t <= atual) {
      return t;
    }
  }
  return trimestresDesc[0] ?? null;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Idade em anos a partir de uma data ISO (YYYY-MM-DD). */
export function idadeAnos(iso: string | null): number | null {
  if (iso === null) {
    return null;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const now = new Date();
  let anos = now.getUTCFullYear() - d.getUTCFullYear();
  const mDiff = now.getUTCMonth() - d.getUTCMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < d.getUTCDate())) {
    anos -= 1;
  }
  return anos >= 0 ? anos : null;
}

/** Tempo de empresa a partir da admissao ISO, formato `Xa Ym`. */
export function tempoEmpresa(iso: string | null): string {
  if (iso === null) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  const now = new Date();
  let meses = (now.getUTCFullYear() - d.getUTCFullYear()) * 12;
  meses += now.getUTCMonth() - d.getUTCMonth();
  if (now.getUTCDate() < d.getUTCDate()) {
    meses -= 1;
  }
  if (meses < 0) {
    return '—';
  }
  const anos = Math.floor(meses / 12);
  const restoMeses = meses % 12;
  return `${anos}a ${restoMeses}m`;
}

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

/** Multiplicador de ROI, ex.: `3,4×`. */
export function formatMultiplier(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return `${num.toFixed(1).replace('.', ',')}×`;
}

/** BRL sem centavos, ex.: `R$ 13.260`. */
export function formatBRLInt(valor: string | null): string {
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Numero em pt-BR, ate 2 casas, sem forcar decimais (ex.: 1800 -> `1.800`). */
export function formatNumBR(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

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

/** Percentual a partir de fracao 0–1 (ex.: `0.9840` -> `98,4%`). Usado no
 * Eixo X, cujo `indiceDesempenho` e gravado como razao (sem x100). */
export function formatPercentFrac(valor: string | null): string {
  if (valor === null) {
    return '—';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return '—';
  }
  return `${(num * 100).toFixed(1).replace('.', ',')}%`;
}

export type OciosidadeTier = 'saudavel' | 'atencao' | 'critica' | 'sem_dado';

/**
 * Faixa de ociosidade (regra de negocio): abaixo de 5% e critica (sem folga
 * — perigoso); 5% a 15% e saudavel; acima de 15% ate 25% e atencao; acima de
 * 25% e critica. `capacidadeOciosa` chega em escala 0–100.
 */
export function ociosidadeTier(valor: string | null): OciosidadeTier {
  if (valor === null) {
    return 'sem_dado';
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return 'sem_dado';
  }
  if (num < 5) {
    return 'critica';
  }
  if (num <= 15) {
    return 'saudavel';
  }
  if (num <= 25) {
    return 'atencao';
  }
  return 'critica';
}

export function ociosidadeLabel(tier: OciosidadeTier): string {
  if (tier === 'saudavel') {
    return 'Faixa saudável';
  }
  if (tier === 'atencao') {
    return 'Faixa de atenção';
  }
  if (tier === 'critica') {
    return 'Faixa crítica';
  }
  return '';
}

interface QuarterlyLike {
  readonly trimestre: string;
  readonly indiceDesempenho: string | null;
  readonly faixaDesempenho: FaixaDesempenho | null;
  readonly capacidadeOciosa: string | null;
  readonly metaROI: string | null;
  readonly roiEstimado: string | null;
  readonly retornoEstimado: string | null;
  readonly percMetaAtingida: string | null;
  readonly diagnosticoIA: string | null;
  readonly diagnosticoIAgeradoEm: Date | null;
}

interface PlenitudeLike {
  readonly plenitudeScore: string | null;
  readonly faixaPlenitude: FaixaPlenitude | null;
  readonly scoreA: string | null;
  readonly scoreC: string | null;
  readonly divergencia: string | null;
  readonly alertaDivergencia: boolean | null;
  readonly engajamentoA: string | null;
  readonly engajamentoC: string | null;
  readonly desenvolvimentoA: string | null;
  readonly desenvolvimentoC: string | null;
  readonly pertencimentoA: string | null;
  readonly pertencimentoC: string | null;
  readonly realizacaoA: string | null;
  readonly realizacaoC: string | null;
}

interface NineBoxLike {
  readonly posicaoX: PosicaoX;
  readonly posicaoY: PosicaoY;
  readonly quadrante: string;
  readonly direcaoMovimento: DirecaoMovimento | null;
}

/** Monta a `QuarterView` serializavel a partir das linhas do payload. */
export function buildQuarterView(args: {
  trimestre: string | null;
  quarterly: QuarterlyLike | null;
  plenitude: PlenitudeLike | null;
  nineBox: NineBoxLike | null;
  nineBoxAnterior?: NineBoxLike | null;
  assiduidadeMedia?: string | null;
}): QuarterView {
  const { trimestre, quarterly, plenitude, nineBox } = args;
  const nineBoxAnterior = args.nineBoxAnterior ?? null;
  const dimensoes: DimensaoAC[] =
    plenitude !== null
      ? [
          { label: 'Engajamento', a: plenitude.engajamentoA, c: plenitude.engajamentoC },
          {
            label: 'Desenvolvimento',
            a: plenitude.desenvolvimentoA,
            c: plenitude.desenvolvimentoC,
          },
          { label: 'Pertencimento', a: plenitude.pertencimentoA, c: plenitude.pertencimentoC },
          { label: 'Realização', a: plenitude.realizacaoA, c: plenitude.realizacaoC },
        ]
      : [];
  return {
    trimestre,
    isTrimestreAtual: trimestre !== null && trimestre === currentTrimestreUTC(),
    eixoX:
      quarterly !== null
        ? {
            indiceDesempenho: quarterly.indiceDesempenho,
            faixaDesempenho: quarterly.faixaDesempenho,
            capacidadeOciosa: quarterly.capacidadeOciosa,
          }
        : null,
    eixoY:
      plenitude !== null
        ? {
            plenitudeScore: plenitude.plenitudeScore,
            faixaPlenitude: plenitude.faixaPlenitude,
            scoreA: plenitude.scoreA,
            scoreC: plenitude.scoreC,
            divergencia: plenitude.divergencia,
            alertaDivergencia: plenitude.alertaDivergencia === true,
            dimensoes,
          }
        : null,
    nineBox:
      nineBox !== null
        ? {
            posicaoX: nineBox.posicaoX,
            posicaoY: nineBox.posicaoY,
            quadrante: nineBox.quadrante,
            direcaoMovimento: nineBox.direcaoMovimento,
            posicaoXAnterior: nineBoxAnterior?.posicaoX ?? null,
            posicaoYAnterior: nineBoxAnterior?.posicaoY ?? null,
          }
        : null,
    financeiro:
      quarterly !== null
        ? {
            roiEstimado: quarterly.roiEstimado,
            metaROI: quarterly.metaROI,
            retornoEstimado: quarterly.retornoEstimado,
            percMetaAtingida: quarterly.percMetaAtingida,
          }
        : null,
    diagnostico: {
      texto: quarterly?.diagnosticoIA ?? null,
      geradoEm:
        quarterly?.diagnosticoIAgeradoEm != null
          ? quarterly.diagnosticoIAgeradoEm.toISOString()
          : null,
    },
    assiduidadeMedia: args.assiduidadeMedia ?? null,
  };
}
