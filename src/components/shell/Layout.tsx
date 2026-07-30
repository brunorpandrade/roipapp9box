// ROIP APP 9BOX — Layout canonico perfil-agnostic (ME-055 Bloco B).
//
// Origem canonica: DOC 05 §3 (estrutura comum a todos os menus — sidebar
// 256px fixa) + §4 (header 56px + indicador contextual §4.2).
//
// Design canonizado nesta ME (D2): Layout e 100% dumb. Nao consulta
// sessao, nao conhece `ProfileKey`, nao aplica filtros condicionais. O
// consumidor (ME-056 — paineis) chama `resolveMenuItems(profileKey,
// isResponsavelFinanceiro)` e monta as props `menuItems`, `activeHref`,
// `header`, `superAdminContext` prontos. Isso desacopla a resolucao de
// perfil da renderizacao do shell e permite testar o Layout com
// combinacoes arbitrarias sem replicar a matriz canonica de perfis.

import type { JSX, ReactNode } from 'react';

import { Header, type HeaderProps } from './Header';
import { Sidebar } from './Sidebar';
import { SuperAdminContextBar, type SuperAdminContextBarProps } from './SuperAdminContextBar';
import { COLORS } from '../../lib/design-tokens/colors';
import type { MenuItem } from '../../lib/menu/menuConfig';

export interface LayoutProps {
  /**
   * Itens do menu ja resolvidos por `resolveMenuItems` — inclui
   * separadores canonicos §3 e itens condicionais filtrados conforme
   * `isResponsavelFinanceiro`.
   */
  readonly menuItems: readonly MenuItem[];
  /**
   * Rota corrente. Passada ao Sidebar para destacar o item ativo (§3
   * estrutura comum: teal `#14B8A6` + borda esquerda branca 4px).
   */
  readonly activeHref: string;
  /**
   * Props canonicas do header §4 ja preenchidas pelo consumidor (nome
   * fantasia da empresa, foto do usuario, flag `showNotificationBell`
   * canonizada por perfil — regra Q1: apenas Bruno+RH).
   */
  readonly header: HeaderProps;
  /**
   * Props canonicas do indicador contextual §4.2. Presente somente
   * quando `ProfileKey === 'super_admin_in_company'`. Ausente em todos
   * os demais perfis.
   */
  readonly superAdminContext?: SuperAdminContextBarProps;
  /**
   * Conteudo canonico da rota corrente (painel, formulario, tela
   * administrativa). Renderizado no slot principal a direita da sidebar
   * e abaixo do header.
   */
  readonly children: ReactNode;
}

export function Layout(props: LayoutProps): JSX.Element {
  const { menuItems, activeHref, header, superAdminContext, children } = props;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: COLORS.background.page,
      }}
    >
      <Sidebar items={menuItems} activeHref={activeHref} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Header {...header} />
        {superAdminContext !== undefined ? <SuperAdminContextBar {...superAdminContext} /> : null}
        <main
          style={{
            flex: 1,
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 20,
            paddingBottom: 20,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
