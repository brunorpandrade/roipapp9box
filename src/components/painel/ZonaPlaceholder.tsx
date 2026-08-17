'use client';

// ROIP APP 9BOX — componente canonico compartilhado ZonaPlaceholder
// (ME-083 D-ME083-7 aprovado — extracao do CompanyLandingClient).
//
// Origem canonica:
// - DOC 05 §5.2 (estado canonico "Coleta de dados em andamento" +
//   correlatos placeholder das Fases 3-4).
// - DOC 05 §5.9 (zona reservada "9-Box" nos paineis).
// - DOC 05 §5.10 (bloco "Status da plataforma").
// - DOC 05 §5.4 (zonas placeholder do painel Super Admin dentro-de-
//   empresa).
// - DOC 05 §5.5 (zonas placeholder do painel RH).
//
// Racional canonico da extracao (D-ME083-7): mesmo card canonico de
// placeholder (borda tracejada, titulo uppercase, texto secondary) usado
// em §5.4 e §5.5. Consolidacao evita drift.
//
// **RV-13 canonica.** Consumidores:
// - `src/app/painel-rh/PainelRHClient.tsx` (ME-083).
// - `src/app/super-admin/empresa/[id]/CompanyLandingClient.tsx` (refactor
//   ME-083).
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

export interface ZonaPlaceholderProps {
  /**
   * Titulo canonico da zona (uppercase discreto).
   */
  readonly title: string;
  /**
   * Texto canonico literal. Ex.: "Coleta de dados em andamento" (§5.2)
   * ou textos canonicos das zonas §5.9 e §5.10.
   */
  readonly texto: string;
}

/**
 * Card canonico bit-exact de zona placeholder. Border dashed para
 * sinalizar visualmente que a zona ainda esta em coleta ou reservada.
 */
export function ZonaPlaceholder(props: ZonaPlaceholderProps): JSX.Element {
  return (
    <div
      style={{
        background: COLORS.background.card,
        border: `1px dashed ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          margin: 0,
        }}
      >
        {props.title}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: COLORS.text.secondary,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {props.texto}
      </p>
    </div>
  );
}
