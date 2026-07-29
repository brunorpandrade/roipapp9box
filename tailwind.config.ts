// ROIP APP 9BOX — configuracao canonica do Tailwind (ME-055 Bloco A).
//
// Extend do tema Tailwind consumindo tokens canonicos de
// `src/lib/design-tokens/`. Nenhum valor arbitrario declarado aqui —
// toda cor, tamanho tipografico, radius e sombra tem origem em
// `colors.ts`, `typography.ts` ou `spacing.ts`.
//
// Origem canonica: DOC 05 §2 (design system integral).
//
// Escolha de versao: Tailwind v3 (obrigatorio pelo comando aberto —
// `tailwind.config.ts` e canonico; v4 elimina esse arquivo).

import type { Config } from 'tailwindcss';

import { COLORS } from './src/lib/design-tokens/colors';
import { SPACING } from './src/lib/design-tokens/spacing';
import { TYPOGRAPHY } from './src/lib/design-tokens/typography';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}', './src/lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // §2.1 primaria e acento (com variantes hover derivadas §2.3).
        navy: {
          DEFAULT: COLORS.primary.navy,
          hover: COLORS.primary.navyHover,
        },
        teal: {
          DEFAULT: COLORS.accent.teal,
          hover: COLORS.accent.tealHover,
        },
        // §2.1 semantica.
        success: COLORS.semantic.success,
        warning: COLORS.semantic.warning,
        danger: {
          DEFAULT: COLORS.semantic.danger,
          hover: COLORS.semantic.dangerHover,
        },
        // §2.1 fundos.
        pageBg: COLORS.background.page,
        cardBg: COLORS.background.card,
        elevatedBg: COLORS.background.elevated,
        // §2.1 textos.
        textPrimary: COLORS.text.primary,
        textSecondary: COLORS.text.secondary,
        textTertiary: COLORS.text.tertiary,
        textQuaternary: COLORS.text.quaternary,
        // §2.1 bordas.
        borderDefault: COLORS.border.default,
        borderDivider: COLORS.border.divider,
        // §2.1 e §2.3 badges.
        badgeInfoBg: COLORS.badge.infoBg,
        badgeInfoText: COLORS.badge.infoText,
        badgeSuccessBg: COLORS.badge.successBg,
        badgeSuccessText: COLORS.badge.successText,
        badgeSuccessTextAlt: COLORS.badge.successTextAlt,
        badgeWarningBg: COLORS.badge.warningBg,
        badgeWarningText: COLORS.badge.warningText,
        badgeDangerBg: COLORS.badge.dangerBg,
        badgeDangerText: COLORS.badge.dangerText,
        badgeTealClaroBg: COLORS.badge.tealClaroBg,
        badgeTealClaroBgAlt: COLORS.badge.tealClaroBgAlt,
        badgeTealClaroText: COLORS.badge.tealClaroText,
        badgeRhBg: COLORS.badge.rhBg,
        badgeRhText: COLORS.badge.rhText,
        // §2.4 e §2.5 escalas (semanticamente iguais — hex identicos).
        scoreLow: COLORS.scoreScale.climateLow,
        scoreMid: COLORS.scoreScale.climateMid,
        scoreHigh: COLORS.scoreScale.climateHigh,
        // §2.6 organograma.
        orgRootBorder: COLORS.orgChart.rootBorder,
        orgClevelBg: COLORS.orgChart.clevelBg,
        orgTaticoBg: COLORS.orgChart.taticoBg,
        orgOperacionalBorder: COLORS.orgChart.operacionalBorder,
      },
      fontFamily: {
        sans: [...TYPOGRAPHY.fontFamily.sans],
      },
      fontSize: {
        // §2.2 escala tipografica canonica.
        'page-title': [TYPOGRAPHY.fontSize.pageTitle, { fontWeight: '600' }],
        'section-title': [TYPOGRAPHY.fontSize.sectionTitle, { fontWeight: '600' }],
        'card-title': [TYPOGRAPHY.fontSize.cardTitle, { fontWeight: '600' }],
        body: [TYPOGRAPHY.fontSize.body, { lineHeight: '1.6' }],
        meta: TYPOGRAPHY.fontSize.meta,
        badge: TYPOGRAPHY.fontSize.badge,
        'badge-sm': TYPOGRAPHY.fontSize.badgeSmall,
        timestamp: TYPOGRAPHY.fontSize.timestamp,
        'card-value-sm': [TYPOGRAPHY.fontSize.cardValueSm, { fontWeight: '600' }],
        'card-value-lg': [TYPOGRAPHY.fontSize.cardValueLg, { fontWeight: '600' }],
      },
      spacing: {
        // §2.8 paddings canonicos como spacing tokens.
        'card-min': SPACING.padding.cardMin,
        'card-max': SPACING.padding.cardMax,
        'page-h': SPACING.padding.pageHorizontal,
        'page-v': SPACING.padding.pageVertical,
      },
      borderRadius: {
        // §2.8 radius canonicos.
        card: SPACING.radius.card,
        button: SPACING.radius.button,
      },
      boxShadow: {
        // §2.8 e §2.9 sombras canonicas.
        card: SPACING.shadow.card,
        modal: SPACING.shadow.modal,
        'popup-80': SPACING.shadow.popup80,
      },
    },
  },
  plugins: [],
};

export default config;
