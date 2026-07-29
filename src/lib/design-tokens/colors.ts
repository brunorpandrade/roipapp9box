// ROIP APP 9BOX — paleta canonica de cores (ME-055 Bloco A).
//
// Fonte da verdade dos hex canonicos consumida por `tailwind.config.ts`
// (mapeamento a tokens Tailwind) e por componentes que precisam do hex
// em string (SVGs inline, graficos que aceitam cor por prop).
//
// Origem canonica: DOC 05 §2.1 (paleta), §2.3 (derivados hover
// escurecidos 8% e badges especiais L/RH/RF), §2.4 (escala Clima),
// §2.5 (escala Radar NR-1), §2.6 (cores dos nos do organograma).
//
// Nao ha valor arbitrario aqui — todo hex tem origem em ordinal do DOC 05.

export const COLORS = {
  // §2.1 paleta primaria
  primary: {
    navy: '#1F3A5F',
    navyHover: '#1e3a8a', // §2.3 hover navy
  },
  accent: {
    teal: '#14B8A6',
    tealHover: '#0D9488', // §2.3 hover teal
  },
  // §2.1 semantica
  semantic: {
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    dangerHover: '#B91C1C', // §2.3 hover danger
  },
  // §2.1 fundos
  background: {
    page: '#F9FAFB',
    card: '#FFFFFF',
    elevated: '#F8FAFC',
  },
  // §2.1 textos
  text: {
    primary: '#111827',
    secondary: '#374151',
    tertiary: '#6B7280',
    quaternary: '#9CA3AF',
  },
  // §2.1 bordas
  border: {
    default: '#E5E7EB',
    divider: '#F3F4F6',
  },
  // §2.1 badges (info/success/warning/danger) + §2.3 badges especiais
  badge: {
    infoBg: '#DBEAFE',
    infoText: '#1E40AF',
    successBg: '#DCFCE7',
    // §2.1 declara duas variantes de texto sucesso (dependem do contraste
    // sobre a badge). Ambas preservadas.
    successText: '#15803D',
    successTextAlt: '#166534',
    warningBg: '#FEF3C7',
    warningText: '#92400E',
    dangerBg: '#FEE2E2',
    dangerText: '#991B1B',
    // §2.1 realce teal em cards ativos (duas variantes de fundo).
    tealClaroBg: '#CCFBF1',
    tealClaroBgAlt: '#F0FDFA',
    tealClaroText: '#0F766E',
    // §2.3 badge RH — nao mapeado em §2.1, canonico exclusivo do padrao
    // de componentes.
    rhBg: '#E6F1FB',
    rhText: '#0C447C',
  },
  // §2.4 escala Clima (0.0-5.9 vermelho, 6.0-7.4 amarelo, 7.5-10 verde)
  // e §2.5 escala Radar NR-1 (0-49 vermelho, 50-65 amarelo, 66-100 verde).
  // Hex identicos aos de `semantic` — sao os mesmos por definicao canonica.
  scoreScale: {
    climateLow: '#DC2626',
    climateMid: '#D97706',
    climateHigh: '#16A34A',
    nr1Low: '#DC2626',
    nr1Mid: '#D97706',
    nr1High: '#16A34A',
  },
  // §2.6 nos do organograma
  orgChart: {
    rootBorder: '#1F3A5F',
    clevelBg: '#1F3A5F',
    taticoBg: '#14B8A6',
    operacionalBorder: '#E5E7EB',
  },
} as const;

// Tipo derivado — leitores podem depender do formato exato exportado.
export type ColorsToken = typeof COLORS;
