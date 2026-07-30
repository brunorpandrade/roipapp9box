// ROIP APP 9BOX — smoke tests dos componentes UI utilitários (ME-055c).
//
// Cobre RV-13 (nenhum export orfao) para os 8 componentes novos do
// `src/components/ui/` e o helper `src/lib/avatar/initials.ts`:
//
// - Drawer
// - Modal (+ MODAL_VARIANT_SPECS)
// - Toast (+ ToastProvider + useToast + TOAST_COLORS_BY_SEVERITY + TTLs)
// - Banner (+ BANNER_COLORS_BY_SEVERITY)
// - Tooltip (+ TOOLTIP_DEFAULT_DELAY_MS + TOOLTIP_BG_COLOR)
// - Avatar
// - Spinner
// - Skeleton
// - initialsFromName (helper puro)
//
// Racional: `check-no-dead-exports.sh` vigia apenas `src/server/services`
// e `src/server/auth`, deixando `src/components/` formalmente fora do
// script. O espirito de RV-13 (todo motor tem chamador na mesma ME) e
// preservado por este teste, que importa cada componente e verifica sua
// identidade estrutural minima (funcao React exportada, nao undefined) +
// integridade bit-exact das constantes canonicas exportadas.
//
// Nao usa renderizacao React — o repo nao instalou jsdom nem
// @testing-library/react intencionalmente (padrao dos Blocos A/B). Todos
// os tests aqui sao verificacoes puramente estaticas de identidade e
// propriedades exportadas, no mesmo molde de `designTokens.test.ts` e
// `shell.test.ts`.

import { describe, expect, it } from 'vitest';

import { COLORS } from '../../src/lib/design-tokens/colors';
import { initialsFromName } from '../../src/lib/avatar/initials';
import { Avatar } from '../../src/components/ui/Avatar';
import { Banner, BANNER_COLORS_BY_SEVERITY } from '../../src/components/ui/Banner';
import {
  Drawer,
  DRAWER_LEFT_BORDER_COLOR,
  DRAWER_LEFT_BORDER_WIDTH_PX,
  DRAWER_MAX_WIDTH_PX,
  DRAWER_MIN_WIDTH_PX,
  DRAWER_WIDTH_CANONIC,
} from '../../src/components/ui/Drawer';
import { Modal, MODAL_VARIANT_SPECS } from '../../src/components/ui/Modal';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Spinner } from '../../src/components/ui/Spinner';
import {
  TOAST_COLORS_BY_SEVERITY,
  TOAST_TTL_DANGER_MS,
  TOAST_TTL_SUCCESS_MS,
  TOAST_TTL_WARNING_MS,
  ToastProvider,
  defaultTtlForSeverity,
  useToast,
} from '../../src/components/ui/Toast';
import {
  TOOLTIP_BG_COLOR,
  TOOLTIP_DEFAULT_DELAY_MS,
  Tooltip,
} from '../../src/components/ui/Tooltip';

describe('components/ui — smoke tests RV-13 (nenhum export orfao)', () => {
  it('Drawer e uma funcao componente exportada', () => {
    expect(typeof Drawer).toBe('function');
    expect(Drawer.name).toBe('Drawer');
  });

  it('Modal e uma funcao componente exportada', () => {
    expect(typeof Modal).toBe('function');
    expect(Modal.name).toBe('Modal');
  });

  it('ToastProvider e uma funcao componente exportada', () => {
    expect(typeof ToastProvider).toBe('function');
    expect(ToastProvider.name).toBe('ToastProvider');
  });

  it('useToast e uma funcao hook exportada', () => {
    expect(typeof useToast).toBe('function');
    expect(useToast.name).toBe('useToast');
  });

  it('Banner e uma funcao componente exportada', () => {
    expect(typeof Banner).toBe('function');
    expect(Banner.name).toBe('Banner');
  });

  it('Tooltip e uma funcao componente exportada', () => {
    expect(typeof Tooltip).toBe('function');
    expect(Tooltip.name).toBe('Tooltip');
  });

  it('Avatar e uma funcao componente exportada', () => {
    expect(typeof Avatar).toBe('function');
    expect(Avatar.name).toBe('Avatar');
  });

  it('Spinner e uma funcao componente exportada', () => {
    expect(typeof Spinner).toBe('function');
    expect(Spinner.name).toBe('Spinner');
  });

  it('Skeleton e uma funcao componente exportada', () => {
    expect(typeof Skeleton).toBe('function');
    expect(Skeleton.name).toBe('Skeleton');
  });
});

describe('lib/avatar/initials — helper canonico §2.10', () => {
  it('nome unico retorna as duas primeiras letras em maiusculo', () => {
    expect(initialsFromName('Bruno')).toBe('BR');
    expect(initialsFromName('ana')).toBe('AN');
  });

  it('nome + sobrenome retorna primeira do primeiro + primeira do ultimo', () => {
    expect(initialsFromName('Bruno Andrade')).toBe('BA');
    expect(initialsFromName('maria silva')).toBe('MS');
  });

  it('nome + varios sobrenomes retorna primeira do primeiro + primeira do ultimo', () => {
    expect(initialsFromName('Bruno Ribeiro Andrade')).toBe('BA');
    expect(initialsFromName('Ana Maria Ferreira Souza')).toBe('AS');
  });

  it('espacos multiplos sao normalizados', () => {
    expect(initialsFromName('  Bruno   Andrade  ')).toBe('BA');
  });

  it('entrada vazia ou so espacos cai em placeholder canonico "??"', () => {
    expect(initialsFromName('')).toBe('??');
    expect(initialsFromName('   ')).toBe('??');
  });

  it('nome unico de uma letra padeja para duas letras', () => {
    // 'A' -> primeiras duas letras de 'A' = 'A', padEnd para 2 com 'A' → 'AA'
    expect(initialsFromName('A')).toBe('AA');
  });
});

describe('Tooltip — constantes canonicas §2.9 exportadas', () => {
  it('TOOLTIP_DEFAULT_DELAY_MS canonico é 300ms (nao 500 do comando)', () => {
    expect(TOOLTIP_DEFAULT_DELAY_MS).toBe(300);
  });

  it('TOOLTIP_BG_COLOR canonico é #111827 (nao navy do comando)', () => {
    expect(TOOLTIP_BG_COLOR).toBe('#111827');
  });
});

describe('Banner — cores canonicas §2.9 exportadas (3 severidades)', () => {
  it('BANNER_COLORS_BY_SEVERITY tem exatamente 3 chaves canonicas §2.9', () => {
    const keys = Object.keys(BANNER_COLORS_BY_SEVERITY).sort();
    expect(keys).toStrictEqual(['danger', 'success', 'warning']);
  });

  it('BANNER_COLORS_BY_SEVERITY.success bit-exact §2.9', () => {
    expect(BANNER_COLORS_BY_SEVERITY.success).toStrictEqual({
      bg: COLORS.badge.successBg,
      text: COLORS.badge.successText,
      border: COLORS.semantic.success,
    });
  });

  it('BANNER_COLORS_BY_SEVERITY.warning bit-exact §2.9', () => {
    expect(BANNER_COLORS_BY_SEVERITY.warning).toStrictEqual({
      bg: COLORS.badge.warningBg,
      text: COLORS.badge.warningText,
      border: COLORS.semantic.warning,
    });
  });

  it('BANNER_COLORS_BY_SEVERITY.danger bit-exact §2.9', () => {
    expect(BANNER_COLORS_BY_SEVERITY.danger).toStrictEqual({
      bg: COLORS.badge.dangerBg,
      text: COLORS.badge.dangerText,
      border: COLORS.semantic.danger,
    });
  });
});

describe('Toast — TTLs e cores canonicas §2.9 exportadas (3 severidades)', () => {
  it('TOAST_TTL_SUCCESS_MS canonico é 3000 (nao 4000 do comando)', () => {
    expect(TOAST_TTL_SUCCESS_MS).toBe(3000);
  });

  it('TOAST_TTL_WARNING_MS canonico é 4000 (nao 6000 do comando)', () => {
    expect(TOAST_TTL_WARNING_MS).toBe(4000);
  });

  it('TOAST_TTL_DANGER_MS canonico é 4000 (persistencia e ortogonal)', () => {
    expect(TOAST_TTL_DANGER_MS).toBe(4000);
  });

  it('defaultTtlForSeverity retorna TTL canonico por severidade', () => {
    expect(defaultTtlForSeverity('success')).toBe(3000);
    expect(defaultTtlForSeverity('warning')).toBe(4000);
    expect(defaultTtlForSeverity('danger')).toBe(4000);
  });

  it('TOAST_COLORS_BY_SEVERITY tem exatamente 3 chaves canonicas §2.9', () => {
    const keys = Object.keys(TOAST_COLORS_BY_SEVERITY).sort();
    expect(keys).toStrictEqual(['danger', 'success', 'warning']);
  });

  it('TOAST_COLORS_BY_SEVERITY.success bit-exact §2.9', () => {
    expect(TOAST_COLORS_BY_SEVERITY.success).toStrictEqual({
      bg: COLORS.badge.successBg,
      text: COLORS.badge.successText,
      border: COLORS.semantic.success,
    });
  });

  it('TOAST_COLORS_BY_SEVERITY.warning bit-exact §2.9', () => {
    expect(TOAST_COLORS_BY_SEVERITY.warning).toStrictEqual({
      bg: COLORS.badge.warningBg,
      text: COLORS.badge.warningText,
      border: COLORS.semantic.warning,
    });
  });

  it('TOAST_COLORS_BY_SEVERITY.danger bit-exact §2.9', () => {
    expect(TOAST_COLORS_BY_SEVERITY.danger).toStrictEqual({
      bg: COLORS.badge.dangerBg,
      text: COLORS.badge.dangerText,
      border: COLORS.semantic.danger,
    });
  });
});

describe('Drawer — dimensoes canonicas §2.9 exportadas', () => {
  it('DRAWER_WIDTH_CANONIC é 54vw literal §2.9', () => {
    expect(DRAWER_WIDTH_CANONIC).toBe('54vw');
  });

  it('DRAWER_MIN_WIDTH_PX é 360px literal §2.9', () => {
    expect(DRAWER_MIN_WIDTH_PX).toBe(360);
  });

  it('DRAWER_MAX_WIDTH_PX é 720px literal §2.9', () => {
    expect(DRAWER_MAX_WIDTH_PX).toBe(720);
  });

  it('DRAWER_LEFT_BORDER_COLOR é teal canonico §2.9', () => {
    expect(DRAWER_LEFT_BORDER_COLOR).toBe(COLORS.accent.teal);
    expect(DRAWER_LEFT_BORDER_COLOR).toBe('#14B8A6');
  });

  it('DRAWER_LEFT_BORDER_WIDTH_PX é 3px literal §2.9', () => {
    expect(DRAWER_LEFT_BORDER_WIDTH_PX).toBe(3);
  });
});

describe('Modal — 5 variantes canonicas §2.9 exportadas (Opção A)', () => {
  it('MODAL_VARIANT_SPECS tem exatamente 5 variantes canonicas', () => {
    const keys = Object.keys(MODAL_VARIANT_SPECS).sort();
    expect(keys).toStrictEqual([
      'blocking',
      'centered',
      'confirmation',
      'fullscreenMobile',
      'popup80',
    ]);
  });

  it('nao existe variante "aviso" (correcao vs comando de abertura)', () => {
    expect(Object.keys(MODAL_VARIANT_SPECS)).not.toContain('aviso');
  });
});
