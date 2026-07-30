// ROIP APP 9BOX — Spinner canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.11 (Estados globais de interacao).
//
// Regras canonicas §2.11:
// - "Loading em botao: spinner branco 14px + label conforme contexto
//   ('Salvando…', 'Enviando…', 'Gerando…', 'Entrando…'), botao
//   desabilitado."
// - "Loading em tela: spinner centralizado + label conforme contexto, area
//   fica com opacity: 0.6 e pointer-events: none."
//
// O Spinner canonico deste modulo cobre AMBAS as superficies: em botoes
// (variant='inline', tamanho 14px, cor branca por padrao) e em tela
// (variant='screen', tamanho maior, texto secundario ao lado). O
// consumidor de botao envolve o proprio botao com aria-disabled/opacity;
// o consumidor de tela envolve a area com opacity 0.6 + pointer-events
// none. Este componente e a peca visual, nao o wrapper.
//
// Sem estado. Sem dependencias externas alem de React. Animacao CSS pura
// via keyframes inline (evita dependencia de Tailwind config).

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

export interface SpinnerProps {
  /**
   * Variante canonica §2.11.
   * - `'inline'`: 14px, cor branca por padrao — para uso dentro de botoes
   *   primarios/navy. Consumidor pode sobrescrever cor via `color`.
   * - `'screen'`: 32px, cor navy por padrao — para uso em skeletons
   *   centralizados de tela.
   */
  readonly variant?: 'inline' | 'screen';
  /**
   * Label opcional canonico §2.11 (ex.: 'Salvando…', 'Gerando…'). Quando
   * ausente, renderiza apenas o circulo animado. Quando presente:
   * - Em `inline`: label a direita do spinner em branco 14px, para uso
   *   dentro de botoes.
   * - Em `screen`: label abaixo do spinner em texto secundario 14px.
   */
  readonly label?: string;
  /**
   * Cor da parte animada do spinner. Default: branco em `inline`, navy em
   * `screen`. O rastro nao-animado usa opacity 0.2 sobre a mesma cor.
   */
  readonly color?: string;
}

const KEYFRAMES = `
@keyframes roipSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

export function Spinner(props: SpinnerProps): JSX.Element {
  const { variant = 'screen', label, color } = props;
  const size = variant === 'inline' ? 14 : 32;
  const strokeWidth = variant === 'inline' ? 2 : 3;
  const effectiveColor = color ?? (variant === 'inline' ? '#FFFFFF' : COLORS.primary.navy);
  const labelColor = variant === 'inline' ? '#FFFFFF' : COLORS.text.secondary;
  const labelSize = 14;

  const spinnerSvg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        animation: 'roipSpin 0.9s linear infinite',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={effectiveColor}
        strokeOpacity={0.2}
        strokeWidth={strokeWidth}
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke={effectiveColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );

  if (variant === 'inline') {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label={label ?? 'Carregando'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      >
        <style>{KEYFRAMES}</style>
        {spinnerSvg}
        {label !== undefined ? (
          <span style={{ color: labelColor, fontSize: labelSize }}>{label}</span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Carregando'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 24,
      }}
    >
      <style>{KEYFRAMES}</style>
      {spinnerSvg}
      {label !== undefined ? (
        <span style={{ color: labelColor, fontSize: labelSize }}>{label}</span>
      ) : null}
    </div>
  );
}
