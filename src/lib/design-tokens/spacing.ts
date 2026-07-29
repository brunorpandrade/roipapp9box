// ROIP APP 9BOX — tokens de espacamento, radius e sombra (ME-055 Bloco A).
//
// Fonte da verdade dos valores canonicos consumidos pelo
// `tailwind.config.ts` e por componentes que precisam de valores em
// runtime (ex.: box-shadow de modal em `Modal.tsx` da Bloco C).
//
// Origem canonica: DOC 05 §2.8 (espacamento e grid) e §2.9 (drawers,
// modais, pop-ups e toasts — sombras canonicas).

export const SPACING = {
  // §2.8 grid geral de conteudo.
  grid: {
    columns: 12,
    gap: '16px',
  },
  // §2.8 paddings canonicos.
  padding: {
    cardMin: '16px',
    cardMax: '20px',
    pageHorizontal: '24px',
    pageVertical: '20px',
  },
  // §2.8 radius canonicos.
  radius: {
    card: '12px', // rounded-xl — cards e modais
    button: '8px', // rounded-lg — botoes e inputs
    badgePill: '9999px', // rounded-full — badges pill
    badgeSmall: '4px', // rounded — badges pequenos
  },
  // §2.8 e §2.9 sombras canonicas.
  shadow: {
    // §2.8 sombra padrao de cards (equivalente Tailwind shadow-sm).
    card: '0 1px 2px 0 rgba(0,0,0,0.05)',
    // §2.8 sombra de modal.
    modal: '0 20px 60px rgba(0,0,0,0.2)',
    // §2.8 sombra de pop-up 80%.
    popup80: '0 24px 80px rgba(0,0,0,0.25)',
  },
} as const;

export type SpacingToken = typeof SPACING;
