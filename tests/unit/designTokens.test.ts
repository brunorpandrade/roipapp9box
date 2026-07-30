// ROIP APP 9BOX — testes canonicos dos design tokens (ME-055 Bloco A + CC039).
//
// Verifica presenca canonica bit-exact:
// - 25 itens de menu §2.7 na ordem canonica exata (pos-CC039).
// - 25 mapeamentos LucideIcon canonicos (S466 Opcao A + CC039).
// - Hex canonicos da paleta §2.1 preservados.
// - Escalas canonicas §2.4 (Clima) e §2.5 (Radar NR-1) alinhadas.

import { describe, expect, it } from 'vitest';
import {
  Bell,
  BellRing,
  Building,
  Building2,
  CalendarClock,
  ClipboardList,
  DollarSign,
  FileBarChart,
  FileText,
  GitFork,
  GraduationCap,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Network,
  RefreshCw,
  Shield,
  Unlock,
  UserCircle,
  UserCog,
  Users,
  Users2,
} from 'lucide-react';

import { COLORS } from '../../src/lib/design-tokens/colors';
import {
  LUCIDE_ICON_BY_MENU_ITEM,
  MENU_ITEM_LABELS,
  type MenuItemLabel,
} from '../../src/lib/design-tokens/icons';
import { SPACING } from '../../src/lib/design-tokens/spacing';
import { TYPOGRAPHY } from '../../src/lib/design-tokens/typography';

describe('MENU_ITEM_LABELS — 25 itens canonicos DOC 05 §2.7 (pos-CC039)', () => {
  it('contem exatamente 25 entradas', () => {
    expect(MENU_ITEM_LABELS).toHaveLength(25);
  });

  it('preserva a ordem canonica bit-exact do DOC 05 §2.7 (pos-CC039)', () => {
    expect([...MENU_ITEM_LABELS]).toEqual([
      'Painel',
      'Início',
      'Empresas',
      'Todos os colaboradores',
      'Minha equipe',
      'Cadeia indireta',
      'Faturamento da empresa',
      'Dados mensais',
      'Organograma',
      'Radar NR-1',
      'Pendências no portal',
      'C-level e RH',
      'Cadastro da empresa',
      'Gestão de ciclos',
      'Notificações',
      'Desbloqueios',
      'Logs administrativos',
      'Log de acesso individual',
      'Histórico da empresa',
      'Relatórios e exportações',
      'Onboarding de líderes',
      'Instrumentos (placeholder Fase 1)',
      'Suporte e logs (placeholder Fase 1)',
      'Meus dados',
      'Sair',
    ]);
  });

  it('nao contem duplicatas', () => {
    const uniques = new Set(MENU_ITEM_LABELS);
    expect(uniques.size).toBe(MENU_ITEM_LABELS.length);
  });
});

describe('LUCIDE_ICON_BY_MENU_ITEM — mapeamento canonico S466 Opcao A + CC039', () => {
  it('cobre todos os 25 itens canonicos', () => {
    const keys = Object.keys(LUCIDE_ICON_BY_MENU_ITEM) as MenuItemLabel[];
    expect(keys).toHaveLength(25);
    for (const label of MENU_ITEM_LABELS) {
      expect(LUCIDE_ICON_BY_MENU_ITEM[label]).toBeDefined();
    }
  });

  // Identidade referencial — se o Manus (ou qualquer editor) substituir
  // o import por um icone diferente, o teste reprova aqui.
  it.each<[MenuItemLabel, unknown]>([
    ['Painel', LayoutDashboard],
    ['Início', Home],
    ['Empresas', Building2],
    ['Todos os colaboradores', Users],
    ['Minha equipe', Users2],
    ['Cadeia indireta', Network],
    ['Faturamento da empresa', DollarSign],
    ['Dados mensais', CalendarClock],
    ['Organograma', GitFork],
    ['Radar NR-1', Shield],
    ['Pendências no portal', Bell],
    ['C-level e RH', UserCog],
    ['Cadastro da empresa', Building],
    ['Gestão de ciclos', RefreshCw],
    ['Notificações', BellRing],
    ['Desbloqueios', Unlock],
    ['Logs administrativos', FileText],
    ['Log de acesso individual', FileText],
    ['Histórico da empresa', FileText],
    ['Relatórios e exportações', FileBarChart],
    ['Onboarding de líderes', GraduationCap],
    ['Instrumentos (placeholder Fase 1)', ClipboardList],
    ['Suporte e logs (placeholder Fase 1)', LifeBuoy],
    ['Meus dados', UserCircle],
    ['Sair', LogOut],
  ])('%s → icone canonico Lucide correto (identidade referencial)', (label, expectedIcon) => {
    expect(LUCIDE_ICON_BY_MENU_ITEM[label]).toBe(expectedIcon);
  });
});

describe('COLORS — paleta canonica DOC 05 §2.1', () => {
  it('primaria: navy #1F3A5F', () => {
    expect(COLORS.primary.navy).toBe('#1F3A5F');
  });

  it('acento: teal #14B8A6', () => {
    expect(COLORS.accent.teal).toBe('#14B8A6');
  });

  it('semantica: success/warning/danger canonicos', () => {
    expect(COLORS.semantic.success).toBe('#16A34A');
    expect(COLORS.semantic.warning).toBe('#D97706');
    expect(COLORS.semantic.danger).toBe('#DC2626');
  });

  it('fundos: page/card/elevated canonicos', () => {
    expect(COLORS.background.page).toBe('#F9FAFB');
    expect(COLORS.background.card).toBe('#FFFFFF');
    expect(COLORS.background.elevated).toBe('#F8FAFC');
  });

  it('textos: 4 niveis canonicos preservados', () => {
    expect(COLORS.text.primary).toBe('#111827');
    expect(COLORS.text.secondary).toBe('#374151');
    expect(COLORS.text.tertiary).toBe('#6B7280');
    expect(COLORS.text.quaternary).toBe('#9CA3AF');
  });

  it('bordas: default e divider canonicos', () => {
    expect(COLORS.border.default).toBe('#E5E7EB');
    expect(COLORS.border.divider).toBe('#F3F4F6');
  });

  it('badges: 4 semanticas (info/success/warning/danger) canonicas', () => {
    expect(COLORS.badge.infoBg).toBe('#DBEAFE');
    expect(COLORS.badge.infoText).toBe('#1E40AF');
    expect(COLORS.badge.successBg).toBe('#DCFCE7');
    expect(COLORS.badge.successText).toBe('#15803D');
    expect(COLORS.badge.warningBg).toBe('#FEF3C7');
    expect(COLORS.badge.warningText).toBe('#92400E');
    expect(COLORS.badge.dangerBg).toBe('#FEE2E2');
    expect(COLORS.badge.dangerText).toBe('#991B1B');
  });

  it('badges: variantes canonicas §2.1 preservadas', () => {
    expect(COLORS.badge.successTextAlt).toBe('#166534');
    expect(COLORS.badge.tealClaroBg).toBe('#CCFBF1');
    expect(COLORS.badge.tealClaroBgAlt).toBe('#F0FDFA');
    expect(COLORS.badge.tealClaroText).toBe('#0F766E');
  });

  it('badges: RH canonico §2.3 preservado', () => {
    expect(COLORS.badge.rhBg).toBe('#E6F1FB');
    expect(COLORS.badge.rhText).toBe('#0C447C');
  });
});

describe('COLORS — escalas canonicas §2.4 Clima e §2.5 Radar NR-1', () => {
  it('escala Clima §2.4: vermelho/amarelo/verde canonicos', () => {
    expect(COLORS.scoreScale.climateLow).toBe('#DC2626');
    expect(COLORS.scoreScale.climateMid).toBe('#D97706');
    expect(COLORS.scoreScale.climateHigh).toBe('#16A34A');
  });

  it('escala Radar NR-1 §2.5: vermelho/amarelo/verde canonicos', () => {
    expect(COLORS.scoreScale.nr1Low).toBe('#DC2626');
    expect(COLORS.scoreScale.nr1Mid).toBe('#D97706');
    expect(COLORS.scoreScale.nr1High).toBe('#16A34A');
  });

  it('escalas Clima e NR-1 usam hex identicos (mesma semantica canonica)', () => {
    expect(COLORS.scoreScale.climateLow).toBe(COLORS.scoreScale.nr1Low);
    expect(COLORS.scoreScale.climateMid).toBe(COLORS.scoreScale.nr1Mid);
    expect(COLORS.scoreScale.climateHigh).toBe(COLORS.scoreScale.nr1High);
  });
});

describe('COLORS — cores dos nos do organograma §2.6', () => {
  it('preserva os 4 hex canonicos do organograma', () => {
    expect(COLORS.orgChart.rootBorder).toBe('#1F3A5F');
    expect(COLORS.orgChart.clevelBg).toBe('#1F3A5F');
    expect(COLORS.orgChart.taticoBg).toBe('#14B8A6');
    expect(COLORS.orgChart.operacionalBorder).toBe('#E5E7EB');
  });
});

describe('TYPOGRAPHY — escala tipografica canonica DOC 05 §2.2', () => {
  it('fonte unica: Inter com fallback canonico', () => {
    expect(TYPOGRAPHY.fontFamily.sans[0]).toBe('Inter');
    expect(TYPOGRAPHY.fontFamily.sans).toContain('system-ui');
    expect(TYPOGRAPHY.fontFamily.sans).toContain('sans-serif');
  });

  it('tamanhos canonicos preservados', () => {
    expect(TYPOGRAPHY.fontSize.pageTitle).toBe('20px');
    expect(TYPOGRAPHY.fontSize.sectionTitle).toBe('12px');
    expect(TYPOGRAPHY.fontSize.cardTitle).toBe('14px');
    expect(TYPOGRAPHY.fontSize.body).toBe('13px');
    expect(TYPOGRAPHY.fontSize.meta).toBe('12px');
    expect(TYPOGRAPHY.fontSize.badge).toBe('11px');
    expect(TYPOGRAPHY.fontSize.badgeSmall).toBe('10px');
    expect(TYPOGRAPHY.fontSize.timestamp).toBe('11px');
    expect(TYPOGRAPHY.fontSize.cardValueSm).toBe('24px');
    expect(TYPOGRAPHY.fontSize.cardValueLg).toBe('32px');
  });

  it('pesos canonicos: 400/500/600/700', () => {
    expect(TYPOGRAPHY.fontWeight.normal).toBe(400);
    expect(TYPOGRAPHY.fontWeight.medium).toBe(500);
    expect(TYPOGRAPHY.fontWeight.semibold).toBe(600);
    expect(TYPOGRAPHY.fontWeight.bold).toBe(700);
  });

  it('line-height e letter-spacing canonicos', () => {
    expect(TYPOGRAPHY.lineHeight.body).toBe(1.6);
    expect(TYPOGRAPHY.letterSpacing.sectionTitle).toBe('0.06em');
    expect(TYPOGRAPHY.letterSpacing.badge).toBe('0.06em');
  });
});

describe('SPACING — grid, radius e sombras canonicos DOC 05 §2.8', () => {
  it('grid: 12 colunas gap 16px', () => {
    expect(SPACING.grid.columns).toBe(12);
    expect(SPACING.grid.gap).toBe('16px');
  });

  it('paddings canonicos preservados', () => {
    expect(SPACING.padding.cardMin).toBe('16px');
    expect(SPACING.padding.cardMax).toBe('20px');
    expect(SPACING.padding.pageHorizontal).toBe('24px');
    expect(SPACING.padding.pageVertical).toBe('20px');
  });

  it('radius: card 12px, button 8px, pill 9999px, badge small 4px', () => {
    expect(SPACING.radius.card).toBe('12px');
    expect(SPACING.radius.button).toBe('8px');
    expect(SPACING.radius.badgePill).toBe('9999px');
    expect(SPACING.radius.badgeSmall).toBe('4px');
  });

  it('sombras canonicas §2.8 e §2.9', () => {
    expect(SPACING.shadow.modal).toBe('0 20px 60px rgba(0,0,0,0.2)');
    expect(SPACING.shadow.popup80).toBe('0 24px 80px rgba(0,0,0,0.25)');
  });
});
