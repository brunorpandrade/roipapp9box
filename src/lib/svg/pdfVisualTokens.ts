import type { NineBoxQuadrante } from '../../server/services/nineBoxCalculationEngine';

// ROIP APP 9BOX — tokens visuais canonicos compartilhados dos PDFs (ME-1.3c).
//
// Modulo canonico de constantes visuais consumido pelos templates HTML
// que geram PDFs rich (snapshot_9box, Radar NR-1, board_deck,
// relatorio_executivo, clima_engajamento). Centraliza paleta, faixas
// de score e geometria canonica para evitar duplicacao (L125 RV-14)
// entre templates que compartilham o mesmo visual.
//
// Regra canonica (Opcao B universal da ME-1.3): zero branch por
// `companyId`. Alteracoes aqui refletem automaticamente em todas as
// empresas em producao no mesmo deploy.
//
// Fonte de verdade visual: mockups HTML da base do projeto
// (`relatorio_radar_nr1_v1.html`, `dashboard_individual_v7.html`,
// `o1b_v1.html`) + paleta canonica das 9 caixas da UI canonica em
// `src/app/dashboard-individual/[id]/internals.ts:178-194` (constante
// `NINE_BOX_GRID`). Qualquer mudanca canonica naquela constante dispara
// reprovacao dos testes unit deste modulo ate que a divergencia seja
// resolvida (replica canonica bit-exact).

/**
 * Cor de fundo e cor de texto canonicas por quadrante do 9-Box.
 * Replica bit-exact a constante `NINE_BOX_GRID` da UI canonica em
 * `src/app/dashboard-individual/[id]/internals.ts:178-194`. Testes
 * unit deste modulo asseguram que a divergencia bit-exact dispara
 * reprovacao.
 */
export interface NineBoxQuadrantePaleta {
  readonly bg: string;
  readonly text: string;
}

/**
 * Paleta canonica das 9 caixas, chaveada pelo nome canonico do
 * quadrante (`NINE_BOX_QUADRANTES` do engine). Espelho bit-exact da
 * `NINE_BOX_GRID` canonica da UI (DOC 05 §UI mirror).
 */
export const NINE_BOX_PALETTE = {
  'POTENCIAL SUBUTILIZADO': { bg: '#FCEBEB', text: '#791F1F' },
  'DESEMPENHO REPRESADO': { bg: '#E1F5EE', text: '#085041' },
  'ALTO IMPACTO': { bg: '#EAF3DE', text: '#27500A' },
  'DESEMPENHO CRÍTICO': { bg: '#FAEEDA', text: '#633806' },
  'EQUILÍBRIO FRÁGIL': { bg: '#E6F1FB', text: '#0C447C' },
  'ALTA ENTREGA': { bg: '#E6F1FB', text: '#0C447C' },
  'RISCO CRÍTICO': { bg: '#FCEBEB', text: '#791F1F' },
  'DESGASTE OCULTO': { bg: '#FAEEDA', text: '#633806' },
  'RISCO DE ESGOTAMENTO': { bg: '#FAEEDA', text: '#633806' },
} as const satisfies Record<NineBoxQuadrante, NineBoxQuadrantePaleta>;

/**
 * Faixa canonica de interpretacao de score 0-100 do Radar NR-1
 * (DOC 03 §11.12). Replica bit-exact o mockup
 * `relatorio_radar_nr1_v1.html` pagina 4:
 * - verde (66-100): satisfatorio;
 * - amarelo (50-65): atencao;
 * - vermelho (0-49): critico.
 */
export type Nr1Faixa = 'verde' | 'amarelo' | 'vermelho';

/**
 * Classifica um score 0-100 na faixa canonica correspondente.
 * Fronteiras canonicas (inclusivas em cima): score >= 66 verde;
 * score >= 50 amarelo; score < 50 vermelho. Scores fora de 0-100
 * sao clamp antes da classificacao.
 */
export function classificarNr1Faixa(score: number): Nr1Faixa {
  const clamp = Math.max(0, Math.min(100, score));
  if (clamp >= 66) {
    return 'verde';
  }
  if (clamp >= 50) {
    return 'amarelo';
  }
  return 'vermelho';
}

/**
 * Cor canonica por faixa do Radar NR-1 (coerente com UI e mockup).
 * Replica bit-exact o mockup `relatorio_radar_nr1_v1.html`.
 */
export const RADAR_NR1_CORES: Readonly<Record<Nr1Faixa, string>> = {
  verde: '#16A34A',
  amarelo: '#D97706',
  vermelho: '#DC2626',
};

/**
 * Cores canonicas gerais usadas em SVGs dos PDFs rich. Replicam
 * tokens de design da plataforma (navy/teal) + grid cinza/label.
 */
export const RADAR_COLORS = {
  teal: '#14B8A6',
  tealFillOpacity: 0.2,
  navy: '#1F3A5F',
  gridStroke: '#E5E7EB',
  gridFill: 'none',
  labelFill: '#374151',
  mediaEmpresaStroke: '#9CA3AF',
  mediaEmpresaDasharray: '4,3',
  textMuted: '#6B7280',
  textStrong: '#111827',
} as const;
