// ROIP APP 9BOX — tokens tipograficos canonicos (ME-055 Bloco A).
//
// Fonte da verdade da escala tipografica canonica consumida pelo
// `tailwind.config.ts` e por componentes que precisam de fontSize/
// fontWeight em runtime (grafo, artefatos SVG).
//
// Origem canonica: DOC 05 §2.2 (tipografia).

export const TYPOGRAPHY = {
  fontFamily: {
    // §2.2: fonte unica Inter (Google Fonts). Fallback declarado.
    sans: ['Inter', 'system-ui', 'sans-serif'] as const,
  },
  // §2.2 tamanhos aplicados. Base 14px. Cada chave tem origem no DOC.
  fontSize: {
    pageTitle: '20px', // §2.2 Page title
    sectionTitle: '12px', // §2.2 Section title (uppercase)
    cardTitle: '14px', // §2.2 Card title
    body: '13px', // §2.2 Body
    meta: '12px', // §2.2 Meta / subtitle
    badge: '11px', // §2.2 Badge / label (10-11px range — 11px canonico)
    badgeSmall: '10px', // §2.2 Badge / label (10-11px range — 10px canonico)
    timestamp: '11px', // §2.2 Timestamp discreto
    cardValueSm: '24px', // §2.2 Card value grande (24-32px range)
    cardValueLg: '32px', // §2.2 Card value grande (24-32px range)
  },
  // §2.2 pesos utilizados.
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  // §2.2 line-heights.
  lineHeight: {
    body: 1.6,
  },
  // §2.2 letter-spacings.
  letterSpacing: {
    sectionTitle: '0.06em',
    badge: '0.06em',
  },
} as const;

export type TypographyToken = typeof TYPOGRAPHY;
