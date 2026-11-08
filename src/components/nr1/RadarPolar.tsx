// ROIP APP 9BOX — componente RadarPolar (SVG) para o módulo Radar
// NR-1 (§14.28, ME-079b).
//
// Extraído para `src/components/nr1/RadarPolar.tsx` para reuso
// futuro no painel-rh B9 (MASTER_ESCOPO_B8.md §3.6.2).
//
// ME-1.18 — identidade unificada com o PDF do Radar NR-1:
//   - Polígono do escopo principal (empresa isolada ou departamento):
//     linha cinza-escura neutra ao fundo, preenchimento azul-cinza
//     suave, e os pontos pintados pela faixa do semáforo (verde /
//     amarelo / vermelho), com contorno branco, na frente da linha.
//   - No modo comparativo, a empresa entra apenas como polígono
//     pontilhado azul-escuro (navy), sem preenchimento e sem pontos.
//   - Grid em 3 linhas, uma em cada fronteira de faixa (50, 66, 100).
//
// **RV-13.** Consumido por `Nr1Client.tsx`.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

'use client';

import { type ReactElement } from 'react';

// -----------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------

export interface RadarFatorScore {
  /** ID do fator (1-8). */
  readonly fator: number;
  /** Score 0-100. */
  readonly score: number;
}

export interface RadarPolarProps {
  /** Scores do polígono primário (empresa ou departamento). */
  readonly scores: readonly RadarFatorScore[];
  /**
   * Scores do polígono secundário (comparação — a empresa). Quando
   * presente, renderiza como polígono pontilhado azul-escuro, sem
   * pontos, atrás do primário.
   */
  readonly comparison?: readonly RadarFatorScore[];
  /** Labels por extenso dos 8 fatores (default: nomes completos). */
  readonly labels?: readonly string[];
}

// -----------------------------------------------------------------------
// Paleta e faixas (espelho do PDF — pdfVisualTokens.ts)
// -----------------------------------------------------------------------

/** Cor do semáforo por faixa de score (idêntica ao PDF). */
const FAIXA_CORES = {
  verde: '#16A34A',
  amarelo: '#F2A900',
  vermelho: '#DC2626',
} as const;

/** Cinza-escuro neutro da linha/preenchimento do escopo principal. */
const POLY_STROKE_NEUTRO = '#64748B';
const POLY_FILL_NEUTRO_OPACITY = 0.12;
/** Azul-escuro do polígono pontilhado da empresa no comparativo. */
const REF_NAVY = '#1F3A5F';
const PONTO_STROKE_BRANCO = '#FFFFFF';
const GRID_STROKE = '#E5E7EB';
const LABEL_FILL = '#374151';

/** Classifica um score 0-100 na faixa do semáforo. */
function corDaFaixa(score: number): string {
  const clamp = Math.max(0, Math.min(100, score));
  if (clamp >= 66) return FAIXA_CORES.verde;
  if (clamp >= 50) return FAIXA_CORES.amarelo;
  return FAIXA_CORES.vermelho;
}

// -----------------------------------------------------------------------
// Constantes geométricas
// -----------------------------------------------------------------------

const DEFAULT_LABELS = [
  'Exigências quantitativas',
  'Ritmo de trabalho',
  'Conflitos de papel',
  'Autonomia',
  'Suporte social do líder',
  'Suporte social de colegas',
  'Insegurança no trabalho',
  'Saúde geral autopercebida',
] as const;

const NUM_FATORES = 8;

/** Fronteiras de faixa (score) desenhadas como anéis do grid. */
const GRID_FAIXAS_SCORES = [50, 66, 100] as const;

// ME-1.18 — viewBox largo (520x400) para acomodar os nomes dos 8
// fatores por extenso nos eixos sem corte, como no PDF.
const VB_WIDTH = 520;
const VB_HEIGHT = 400;

/** Raio máximo (anel externo) em unidades SVG. */
const R_MAX = 120;

/** Centro do radar em unidades SVG. */
const CX = 260;
const CY = 190;

/** Ângulo entre vértices (radianos). */
const ANGLE_STEP = (2 * Math.PI) / NUM_FATORES;

/** Offset de rotação: primeiro vértice no topo (12h). */
const ANGLE_OFFSET = -Math.PI / 2;

// -----------------------------------------------------------------------
// Helpers geométricos
// -----------------------------------------------------------------------

function vertexCoord(index: number, radius: number): { x: number; y: number } {
  const angle = ANGLE_OFFSET + index * ANGLE_STEP;
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

function polygonPoints(scores: readonly RadarFatorScore[]): string {
  const sorted = [...scores].sort((a, b) => a.fator - b.fator);
  return sorted
    .map((s, i) => {
      const r = (s.score / 100) * R_MAX;
      const { x, y } = vertexCoord(i, r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function ringPolygon(ringScore: number): string {
  const r = R_MAX * (ringScore / 100);
  return Array.from({ length: NUM_FATORES }, (_, i) => {
    const { x, y } = vertexCoord(i, r);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/** Posição dos labels (fora do anel externo). */
function labelPosition(index: number): {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
} {
  const r = R_MAX + 22;
  const { x, y } = vertexCoord(index, r);
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (x < CX - 10) anchor = 'end';
  else if (x > CX + 10) anchor = 'start';
  return { x, y: y + 4, anchor };
}

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function RadarPolar({ scores, comparison, labels }: RadarPolarProps): ReactElement {
  const effectiveLabels = labels ?? DEFAULT_LABELS;
  const vb = `0 0 ${VB_WIDTH} ${VB_HEIGHT}`;
  const scoresSorted = [...scores].sort((a, b) => a.fator - b.fator);

  return (
    <svg
      viewBox={vb}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 520, height: 'auto' }}
    >
      {/* Grid: 3 anéis nas fronteiras de faixa (50, 66, 100) */}
      <g fill="none" stroke={GRID_STROKE} strokeWidth={1}>
        {GRID_FAIXAS_SCORES.map((ringScore) => (
          <polygon key={`ring-${ringScore}`} points={ringPolygon(ringScore)} />
        ))}
      </g>

      {/* Eixos radiais */}
      <g stroke={GRID_STROKE} strokeWidth={1}>
        {Array.from({ length: NUM_FATORES }, (_, i) => {
          const { x, y } = vertexCoord(i, R_MAX);
          return <line key={`axis-${i}`} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
      </g>

      {/* Empresa no comparativo: polígono pontilhado navy, sem pontos */}
      {comparison && comparison.length === NUM_FATORES && (
        <polygon
          points={polygonPoints(comparison)}
          fill="none"
          stroke={REF_NAVY}
          strokeWidth={1.8}
          strokeDasharray="4,3"
        />
      )}

      {/* Polígono principal: linha cinza neutra + preenchimento suave */}
      {scores.length === NUM_FATORES && (
        <>
          <polygon
            points={polygonPoints(scores)}
            fill={POLY_STROKE_NEUTRO}
            fillOpacity={POLY_FILL_NEUTRO_OPACITY}
            stroke={POLY_STROKE_NEUTRO}
            strokeWidth={2}
          />
          {/* Pontos coloridos pela faixa, com contorno branco, na frente */}
          <g>
            {scoresSorted.map((s, i) => {
              const r = (s.score / 100) * R_MAX;
              const { x, y } = vertexCoord(i, r);
              return (
                <circle
                  key={`main-${i}`}
                  cx={x}
                  cy={y}
                  r={4.5}
                  fill={corDaFaixa(s.score)}
                  stroke={PONTO_STROKE_BRANCO}
                  strokeWidth={1.2}
                />
              );
            })}
          </g>
        </>
      )}

      {/* Labels dos fatores */}
      <g fontFamily="Inter, Arial" fontSize={9} fill={LABEL_FILL} fontWeight={600}>
        {effectiveLabels.map((label, i) => {
          const pos = labelPosition(i);
          return (
            <text key={`label-${i}`} x={pos.x} y={pos.y} textAnchor={pos.anchor}>
              {label}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

export default RadarPolar;
