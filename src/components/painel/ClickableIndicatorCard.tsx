'use client';

// ROIP APP 9BOX — componente canonico compartilhado ClickableIndicatorCard
// (ME-083 D-ME083-7 aprovado — extracao do CompanyLandingClient).
//
// Origem canonica:
// - DOC 05 §5.4 (Painel Super Admin dentro-de-empresa — 7 cards
//   indicadores clicaveis).
// - DOC 05 §5.5 (Painel RH — cards de indicadores da Secao 1 Visao geral).
// - DOC 05 §5.1 (estrutura comum a paineis).
//
// Racional canonico da extracao (D-ME083-7): mesmo card canonico com
// mesmos estilos bit-exact. Reutilizado em §5.4 e §5.5. Consolidar em
// componente unico evita drift visual entre os paineis (RV-14). Toda
// mudanca futura de layout do card acontece em um lugar so.
//
// **RV-13 canonica.** Consumidores:
// - `src/app/painel-rh/PainelRHClient.tsx` (ME-083).
// - `src/app/super-admin/empresa/[id]/CompanyLandingClient.tsx` (refactor
//   ME-083).
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import Link from 'next/link';
import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

export interface ClickableIndicatorCardProps {
  /**
   * Titulo do card em uppercase discreto (label secundario canonico).
   * Renderizado com tracking canonico e cor `text.tertiary`.
   */
  readonly title: string;
  /**
   * Valor principal do card. Renderizado em fonte 18/700. Usa ellipsis
   * canonico bit-exact ME-080a para valores longos (ex. "R$ 999.999,00").
   */
  readonly value: string;
  /**
   * Sub-texto opcional abaixo do valor principal. Renderizado em fonte
   * 12/regular com cor `text.secondary`.
   */
  readonly sub?: string;
  /**
   * Href canonico de destino. Quando omitido, renderiza como `<div>`
   * nao clicavel (mesmo layout visual).
   */
  readonly href?: string;
  /**
   * `aria-label` do Link. Fallback canonico: `title` do card.
   */
  readonly ariaLabel?: string;
}

/**
 * Card canonico bit-exact usado nos paineis de indicadores §5.4 e §5.5.
 * Preserva bit-exact fixes canonicos ME-080a (fontSize responsivo +
 * ellipsis) e ME-080d Onda 1b (display:block nos spans para evitar
 * grude inline).
 */
export function ClickableIndicatorCard(props: ClickableIndicatorCardProps): JSX.Element {
  const { title, value, sub, href, ariaLabel } = props;
  const cardStyle = {
    background: COLORS.background.card,
    border: `1px solid ${COLORS.border.default}`,
    borderRadius: 8,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    textDecoration: 'none',
    color: 'inherit',
  };
  const body = (
    <>
      <span
        style={{
          // ME-080d Onda 1b — display:block canonico para evitar grude
          // inline entre spans consecutivos.
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
        }}
      >
        {title}
      </span>
      <span
        style={{
          // ME-080a — fontSize + overflowWrap canonicos para valores
          // longos em cards com minmax(180px,1fr).
          // ME-080d Onda 1b — display:block.
          display: 'block',
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.text.primary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      {sub !== undefined ? (
        <span
          style={{
            // ME-080d Onda 1b — display:block.
            display: 'block',
            fontSize: 12,
            color: COLORS.text.secondary,
          }}
        >
          {sub}
        </span>
      ) : null}
    </>
  );
  if (href === undefined) {
    return <div style={cardStyle}>{body}</div>;
  }
  return (
    <Link href={href} style={cardStyle} aria-label={ariaLabel ?? title}>
      {body}
    </Link>
  );
}
