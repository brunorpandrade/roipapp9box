// ROIP APP 9BOX — smoke tests dos componentes shell (ME-055 Bloco B).
//
// Cobre RV-13 (nenhum export orfao) para os 6 componentes do
// `src/components/shell/` que serao consumidos apenas na ME-056:
// - Sidebar
// - Header
// - Layout
// - NotificationBell
// - SuperAdminContextBar
// - Breadcrumb
//
// Racional: `check-no-dead-exports.sh` vigia apenas `src/server/services`
// e `src/server/auth`, deixando `src/components/` formalmente fora do
// script. O espirito de RV-13 (todo motor tem chamador na mesma ME) e
// preservado por este teste, que importa cada componente e verifica sua
// identidade estrutural minima (funcao React exportada, nao undefined).
//
// Nao usa renderizacao React — o repo nao instalou jsdom nem
// @testing-library/react intencionalmente (padrao do Bloco A). Todos os
// tests aqui sao verificacoes puramente estaticas de identidade e
// propriedades exportadas, no mesmo molde de `designTokens.test.ts`.

import { describe, expect, it } from 'vitest';

import { Breadcrumb } from '../../src/components/shell/Breadcrumb';
import { Header } from '../../src/components/shell/Header';
import { Layout } from '../../src/components/shell/Layout';
import { NotificationBell } from '../../src/components/shell/NotificationBell';
import { Sidebar } from '../../src/components/shell/Sidebar';
import {
  SUPER_ADMIN_CONTEXT_BAR_NAVY,
  SuperAdminContextBar,
} from '../../src/components/shell/SuperAdminContextBar';
import { COLORS } from '../../src/lib/design-tokens/colors';

describe('shell components — smoke tests RV-13 (nenhum export orfao)', () => {
  it('Sidebar e uma funcao componente exportada', () => {
    expect(typeof Sidebar).toBe('function');
    expect(Sidebar.name).toBe('Sidebar');
  });

  it('Header e uma funcao componente exportada', () => {
    expect(typeof Header).toBe('function');
    expect(Header.name).toBe('Header');
  });

  it('Layout e uma funcao componente exportada', () => {
    expect(typeof Layout).toBe('function');
    expect(Layout.name).toBe('Layout');
  });

  it('NotificationBell e uma funcao componente exportada', () => {
    expect(typeof NotificationBell).toBe('function');
    expect(NotificationBell.name).toBe('NotificationBell');
  });

  it('SuperAdminContextBar e uma funcao componente exportada', () => {
    expect(typeof SuperAdminContextBar).toBe('function');
    expect(SuperAdminContextBar.name).toBe('SuperAdminContextBar');
  });

  it('Breadcrumb e uma funcao componente exportada', () => {
    expect(typeof Breadcrumb).toBe('function');
    expect(Breadcrumb.name).toBe('Breadcrumb');
  });
});

describe('shell components — coerencia canonica com design tokens §2.1', () => {
  it('SUPER_ADMIN_CONTEXT_BAR_NAVY e o navy canonico §2.1 (#1F3A5F)', () => {
    expect(SUPER_ADMIN_CONTEXT_BAR_NAVY).toBe('#1F3A5F');
    expect(SUPER_ADMIN_CONTEXT_BAR_NAVY).toBe(COLORS.primary.navy);
  });
});
