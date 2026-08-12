// ROIP APP 9BOX — componente RadarPolar (SVG) para o módulo Radar
// NR-1 (§14.28, ME-079b).
//
// Extraído para `src/components/nr1/RadarPolar.tsx` para reuso
// futuro no painel-rh B9 (MASTER_ESCOPO_B8.md §3.6.2).
//
// Renderiza radar polar de 8 vértices com 4 anéis concêntricos.
// Suporta polígono primário (empresa ou departamento) e polígono
// secundário opcional (comparação — tracejado cinza).
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
   * Scores do polígono secundário (comparação). Quando presente,
   * renderiza com linha tracejada cinza atrás do primário.
   */
  readonly comparison?: readonly RadarFatorScore[];
  /** Cor de preenchimento + traço do polígono primário. */
  readonly color?: string;
  /** Cor do polígono de comparação (default: #9CA3AF). */
  readonly comparisonColor?: string;
  /** Labels abreviados dos 8 fatores (default: canônicos). */
  readonly labels?: readonly string[];
  /** viewBox width/height (default: 400). */
  readonly size?: number;
}

// -----------------------------------------------------------------------
// Constantes geométricas
// -----------------------------------------------------------------------

const DEFAULT_LABELS = [
  'Exig. quant.',
  'Ritmo',
  'Confl. papel',
  'Autonomia',
  'Sup. líder',
  'Sup. colegas',
  'Insegurança',
  'Saúde',
] as const;

const NUM_FATORES = 8;
const NUM_ANEIS = 4;

/** Raio máximo (anel externo) em unidades SVG. */
const R_MAX = 140;

/** Centro do radar em unidades SVG. */
const CX = 200;
const CY = 200;

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

function ringPolygon(radiusFraction: number): string {
  const r = R_MAX * radiusFraction;
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

export function RadarPolar({
  scores,
  comparison,
  color = '#14B8A6',
  comparisonColor = '#9CA3AF',
  labels,
  size = 400,
}: RadarPolarProps): ReactElement {
  const effectiveLabels = labels ?? DEFAULT_LABELS;
  const vb = `0 0 ${size} ${size - 20}`;

  return (
    <svg
      viewBox={vb}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 420, height: 'auto' }}
    >
      {/* Anéis concêntricos */}
      <g fill="none" stroke="#E5E7EB" strokeWidth={1}>
        {Array.from({ length: NUM_ANEIS }, (_, i) => (
          <polygon key={`ring-${i}`} points={ringPolygon((i + 1) / NUM_ANEIS)} />
        ))}
      </g>

      {/* Eixos radiais */}
      <g stroke="#E5E7EB" strokeWidth={1}>
        {Array.from({ length: NUM_FATORES }, (_, i) => {
          const { x, y } = vertexCoord(i, R_MAX);
          return <line key={`axis-${i}`} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
      </g>

      {/* Polígono de comparação (se presente) */}
      {comparison && comparison.length === NUM_FATORES && (
        <>
          <polygon
            points={polygonPoints(comparison)}
            fill="none"
            stroke={comparisonColor}
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />
          <g fill={comparisonColor}>
            {[...comparison]
              .sort((a, b) => a.fator - b.fator)
              .map((s, i) => {
                const r = (s.score / 100) * R_MAX;
                const { x, y } = vertexCoord(i, r);
                return <circle key={`comp-${i}`} cx={x} cy={y} r={3} />;
              })}
          </g>
        </>
      )}

      {/* Polígono primário */}
      {scores.length === NUM_FATORES && (
        <>
          <polygon
            points={polygonPoints(scores)}
            fill={color}
            fillOpacity={comparison ? 0.15 : 0.2}
            stroke={color}
            strokeWidth={2}
          />
          <g fill={color}>
            {[...scores]
              .sort((a, b) => a.fator - b.fator)
              .map((s, i) => {
                const r = (s.score / 100) * R_MAX;
                const { x, y } = vertexCoord(i, r);
                return <circle key={`main-${i}`} cx={x} cy={y} r={4} />;
              })}
          </g>
        </>
      )}

      {/* Labels dos fatores */}
      <g fontFamily="Inter, Arial" fontSize={10} fill="#374151" fontWeight={600}>
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
