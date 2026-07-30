// ROIP APP 9BOX — Skeleton canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.11 (Estados globais de interacao).
//
// Regra canonica §2.11:
// - "Skeleton em card: placeholder cinza #E5E7EB com animacao pulse de
//   1,5s."
//
// O placeholder cinza usa o token canonico `COLORS.border.default`
// (#E5E7EB — mesma hex canonica de §2.1 borders default). A animacao
// pulse tem 1,5s de duracao canonica (definida bit-exact em §2.11).
//
// Sem estado. Sem dependencias externas alem de React. Animacao CSS pura
// via keyframes inline (mesma politica do Spinner).

import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

export interface SkeletonProps {
  /**
   * Largura do skeleton. String CSS (`'100%'`, `'240px'`) ou numero em
   * pixels. Default: `'100%'`.
   */
  readonly width?: string | number;
  /**
   * Altura do skeleton. String CSS ou numero em pixels. Default: `16` px.
   */
  readonly height?: string | number;
  /**
   * Formato do skeleton.
   * - `'rect'` (default): retangulo com radius 4px, para textos e blocos.
   * - `'circle'`: circulo perfeito (largura = altura), para avatares e
   *   icones placeholder.
   * - `'pill'`: pill retangular com radius alto (999px), para badges e
   *   botoes placeholder.
   */
  readonly shape?: 'rect' | 'circle' | 'pill';
}

const KEYFRAMES = `
@keyframes roipPulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.5; }
  100% { opacity: 1; }
}
`;

export function Skeleton(props: SkeletonProps): JSX.Element {
  const { width = '100%', height = 16, shape = 'rect' } = props;
  const borderRadius = shape === 'circle' ? '50%' : shape === 'pill' ? 999 : 4;

  const style: CSSProperties = {
    display: 'inline-block',
    background: COLORS.border.default,
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius,
    animation: 'roipPulse 1.5s ease-in-out infinite',
  };

  return (
    <>
      <style>{KEYFRAMES}</style>
      <span aria-hidden="true" style={style} />
    </>
  );
}
