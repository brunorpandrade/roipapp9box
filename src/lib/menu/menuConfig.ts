// ROIP APP 9BOX — configuracao canonica de menus por perfil (ME-055 Bloco B).
//
// Fonte da verdade das 10 configuracoes canonicas de menu lateral definidas
// no DOC 05 §3.1-§3.10. Consumida pelo `Sidebar.tsx` do shell canonico.
//
// Origem canonica:
// - DOC 05 §3 (estrutura comum + §3.1-§3.10 integrais).
// - DOC 02 §2.1 (10 perfis nominais canonicos).
// - DOC 02 §2.2 (enum canonico do claim `role` do JWT).
// - DOC 02 §3.4 (item condicional "Faturamento da empresa" — S461/S463/S464/S465).
//
// Decisoes canonizadas nesta ME:
// - D1: enum `ProfileKey` com 10 valores nominais. 5 valores de `role` do
//   JWT nao distinguem as 10 configuracoes (Super Admin em 2 contextos;
//   RH-Lider em 2 cenarios; C-level em 3 variacoes; Lider em 2 cenarios).
//   A resolucao `session → ProfileKey` acontece na ME-056 (painel).
// - D3: label bit-exact "Início" no menuConfig; campo opcional
//   `showBackArrow` no item indica renderizacao da seta "←" pelo Sidebar
//   (usado somente no item 1 de `super_admin_in_company` §3.2).
// - D4: separador representado como item especial `{ type: 'separator' }`.
// - D5: filtro condicional Responsavel financeiro aplicado por
//   `resolveMenuItems(profileKey, isResponsavelFinanceiro)` — funcao pura
//   testavel isoladamente (S461/S463/S464/S465).

import type { MenuItemLabel } from '../design-tokens/icons';

// -----------------------------------------------------------------------
// Tipos canonicos
// -----------------------------------------------------------------------

/**
 * Chave canonica das 10 configuracoes de menu do DOC 05 §3.1-§3.10.
 *
 * `colaborador` produz `null` — colaborador puro nao tem menu administrativo
 * (§3.10). A resolucao `session → ProfileKey` acontece nos paineis
 * (ME-056) a partir de campos ja calculados no backend (role, tem cadeia
 * descendente, quantidade de C-levels, `acessoTotal`).
 */
export type ProfileKey =
  | 'super_admin_global'
  | 'super_admin_in_company'
  | 'rh'
  | 'rh_lider_c1'
  | 'rh_lider_c2'
  | 'lider_c1'
  | 'lider_c2'
  | 'clevel_full'
  | 'clevel_restricted'
  | 'colaborador';

/**
 * Item de link renderizavel no Sidebar canonico. `label` e `href` sao
 * bit-exact com DOC 05 §3. `iconKey` referencia `LUCIDE_ICON_BY_MENU_ITEM`
 * (§2.7 pos-CC039). `showBackArrow` habilita a renderizacao da seta "←"
 * antes do label (D3 — usado apenas no item "Início" de §3.2 item 1).
 * `condition` presente marca o item como condicional (S461/S463/S464/S465
 * para "Faturamento da empresa"); ausente = sempre visivel.
 */
export interface MenuLinkItem {
  readonly type: 'link';
  readonly label: MenuItemLabel;
  readonly href: string;
  readonly iconKey: MenuItemLabel;
  readonly showBackArrow?: boolean;
  readonly condition?: 'isResponsavelFinanceiro';
  readonly children?: readonly MenuLinkItem[];
}

/**
 * Separador visual entre grupos de itens no Sidebar canonico (D4).
 * Renderizado como divider branco com opacity 0.15 e margem vertical 8px
 * (DOC 05 §3 estrutura comum).
 */
export interface MenuSeparatorItem {
  readonly type: 'separator';
}

export type MenuItem = MenuLinkItem | MenuSeparatorItem;

/**
 * Configuracao canonica de um perfil. Ordem canonica preservada bit-exact
 * com DOC 05 §3.1-§3.10. Colaborador puro (§3.10) tem configuracao `null`.
 */
export type MenuConfig = readonly MenuItem[];

// -----------------------------------------------------------------------
// Constantes canonicas — 10 configuracoes DOC 05 §3.1-§3.10
// -----------------------------------------------------------------------

// Item condicional Responsavel financeiro — reaproveitado em RH, Lider e
// C-level (todas variacoes, exceto Super Admin global e colaborador).
// DOC 02 §3.4: posicionamento canonico imediatamente acima de "Dados mensais".
// Rota canonica: `/faturamento-mensal`. Icone: `DollarSign` §2.7.
const ITEM_FATURAMENTO: MenuLinkItem = {
  type: 'link',
  label: 'Faturamento da empresa',
  href: '/faturamento-mensal',
  iconKey: 'Faturamento da empresa',
  condition: 'isResponsavelFinanceiro',
};

const SEPARATOR: MenuSeparatorItem = { type: 'separator' };

const ITEM_MEUS_DADOS: MenuLinkItem = {
  type: 'link',
  label: 'Meus dados',
  href: '/meus-dados',
  iconKey: 'Meus dados',
};

const ITEM_SAIR: MenuLinkItem = {
  type: 'link',
  label: 'Sair',
  href: '/logout',
  iconKey: 'Sair',
};

// §3.1 — Super Admin global (`/super-admin`).
// "Logs administrativos" carrega 2 subitens (§3.1 item 5, ordem canonica):
// (1) "Transferencias de Responsavel financeiro" → /super-admin/logs/
// responsavel-financeiro (ME-057b) e (2) "Log de acesso individual" →
// /super-admin/logs/acesso-individual (ME-055b). Os subitens reaproveitam
// o icone `FileText` do pai (padrao CC039 + nota canonica ME-057b sobre
// o 3o label acrescentado em §2.7).
const MENU_SUPER_ADMIN_GLOBAL: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/super-admin',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Empresas',
    href: '/super-admin/empresas',
    iconKey: 'Empresas',
  },
  {
    type: 'link',
    label: 'Instrumentos (placeholder Fase 1)',
    href: '/super-admin/instrumentos',
    iconKey: 'Instrumentos (placeholder Fase 1)',
  },
  {
    type: 'link',
    label: 'Suporte e logs (placeholder Fase 1)',
    href: '/super-admin/suporte-logs',
    iconKey: 'Suporte e logs (placeholder Fase 1)',
  },
  {
    type: 'link',
    label: 'Logs administrativos',
    href: '/super-admin/logs',
    iconKey: 'Logs administrativos',
    children: [
      {
        type: 'link',
        label: 'Transferências de Responsável financeiro',
        href: '/super-admin/logs/responsavel-financeiro',
        iconKey: 'Transferências de Responsável financeiro',
      },
      {
        type: 'link',
        label: 'Log de acesso individual',
        href: '/super-admin/logs/acesso-individual',
        iconKey: 'Log de acesso individual',
      },
    ],
  },
  {
    type: 'link',
    label: 'Gestão de ciclos',
    href: '/cycle-management',
    iconKey: 'Gestão de ciclos',
  },
  {
    type: 'link',
    label: 'Notificações',
    href: '/notificacoes',
    iconKey: 'Notificações',
  },
  {
    type: 'link',
    label: 'Desbloqueios',
    href: '/super-admin/desbloqueios',
    iconKey: 'Desbloqueios',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.2 — Super Admin dentro-de-empresa (`/super-admin/empresa/[id]/...`).
// Placeholder `[id]` na URL sera substituido pelo consumidor (ME-056).
// Item "Início" tem `showBackArrow: true` (D3) — Sidebar renderiza "←".
const MENU_SUPER_ADMIN_IN_COMPANY: MenuConfig = [
  {
    type: 'link',
    label: 'Início',
    href: '/super-admin',
    iconKey: 'Início',
    showBackArrow: true,
  },
  {
    type: 'link',
    label: 'Painel',
    href: '/super-admin/empresa/[id]',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Todos os colaboradores',
    href: '/super-admin/empresa/[id]/todos-os-colaboradores',
    iconKey: 'Todos os colaboradores',
  },
  {
    type: 'link',
    label: 'Relatórios e exportações',
    href: '/super-admin/empresa/[id]/relatorios-e-exportacoes',
    iconKey: 'Relatórios e exportações',
  },
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/super-admin/empresa/[id]/dados-mensais',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/super-admin/empresa/[id]/organograma',
    iconKey: 'Organograma',
  },
  {
    type: 'link',
    label: 'C-level e RH',
    href: '/super-admin/empresa/[id]/clevel-rh',
    iconKey: 'C-level e RH',
  },
  {
    type: 'link',
    label: 'Cadastro da empresa',
    href: '/super-admin/empresa/[id]/parametros',
    iconKey: 'Cadastro da empresa',
  },
  {
    type: 'link',
    label: 'Radar NR-1',
    href: '/super-admin/empresa/[id]/nr1',
    iconKey: 'Radar NR-1',
  },
  {
    type: 'link',
    label: 'Pendências no portal',
    href: '/super-admin/empresa/[id]/pendencias-portal',
    iconKey: 'Pendências no portal',
  },
  {
    type: 'link',
    label: 'Histórico da empresa',
    href: '/super-admin/empresa/[id]/historico',
    iconKey: 'Histórico da empresa',
  },
  {
    type: 'link',
    label: 'Onboarding de líderes',
    href: '/super-admin/empresa/[id]/onboarding-lideres',
    iconKey: 'Onboarding de líderes',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.3 — RH puro.
const MENU_RH: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-rh',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Todos os colaboradores',
    href: '/todos-os-colaboradores',
    iconKey: 'Todos os colaboradores',
  },
  {
    type: 'link',
    label: 'Relatórios e exportações',
    href: '/central-relatorios',
    iconKey: 'Relatórios e exportações',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  {
    type: 'link',
    label: 'Radar NR-1',
    href: '/nr1',
    iconKey: 'Radar NR-1',
  },
  {
    type: 'link',
    label: 'Pendências no portal',
    href: '/pendencias-portal',
    iconKey: 'Pendências no portal',
  },
  {
    type: 'link',
    label: 'Gestão de ciclos',
    href: '/cycle-management',
    iconKey: 'Gestão de ciclos',
  },
  {
    type: 'link',
    label: 'Notificações',
    href: '/notificacoes',
    iconKey: 'Notificações',
  },
  {
    type: 'link',
    label: 'Log de acesso individual',
    href: '/logs/acesso-individual',
    iconKey: 'Log de acesso individual',
  },
  {
    type: 'link',
    label: 'Onboarding de líderes',
    href: '/onboarding-lideres',
    iconKey: 'Onboarding de líderes',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.4 — RH-Lider Cenario 1. Diff vs §3.3: "Minha equipe" inserido apos
// "Todos os colaboradores".
const MENU_RH_LIDER_C1: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-rh',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Todos os colaboradores',
    href: '/todos-os-colaboradores',
    iconKey: 'Todos os colaboradores',
  },
  {
    type: 'link',
    label: 'Minha equipe',
    href: '/minha-equipe',
    iconKey: 'Minha equipe',
  },
  {
    type: 'link',
    label: 'Relatórios e exportações',
    href: '/central-relatorios',
    iconKey: 'Relatórios e exportações',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  {
    type: 'link',
    label: 'Radar NR-1',
    href: '/nr1',
    iconKey: 'Radar NR-1',
  },
  {
    type: 'link',
    label: 'Pendências no portal',
    href: '/pendencias-portal',
    iconKey: 'Pendências no portal',
  },
  {
    type: 'link',
    label: 'Gestão de ciclos',
    href: '/cycle-management',
    iconKey: 'Gestão de ciclos',
  },
  {
    type: 'link',
    label: 'Notificações',
    href: '/notificacoes',
    iconKey: 'Notificações',
  },
  {
    type: 'link',
    label: 'Log de acesso individual',
    href: '/logs/acesso-individual',
    iconKey: 'Log de acesso individual',
  },
  {
    type: 'link',
    label: 'Onboarding de líderes',
    href: '/onboarding-lideres',
    iconKey: 'Onboarding de líderes',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.5 — RH-Lider Cenario 2. Diff vs §3.4: "Cadeia indireta" inserido
// apos "Minha equipe".
const MENU_RH_LIDER_C2: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-rh',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Todos os colaboradores',
    href: '/todos-os-colaboradores',
    iconKey: 'Todos os colaboradores',
  },
  {
    type: 'link',
    label: 'Minha equipe',
    href: '/minha-equipe',
    iconKey: 'Minha equipe',
  },
  {
    type: 'link',
    label: 'Cadeia indireta',
    href: '/cadeia-indireta',
    iconKey: 'Cadeia indireta',
  },
  {
    type: 'link',
    label: 'Relatórios e exportações',
    href: '/central-relatorios',
    iconKey: 'Relatórios e exportações',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  {
    type: 'link',
    label: 'Radar NR-1',
    href: '/nr1',
    iconKey: 'Radar NR-1',
  },
  {
    type: 'link',
    label: 'Pendências no portal',
    href: '/pendencias-portal',
    iconKey: 'Pendências no portal',
  },
  {
    type: 'link',
    label: 'Gestão de ciclos',
    href: '/cycle-management',
    iconKey: 'Gestão de ciclos',
  },
  {
    type: 'link',
    label: 'Notificações',
    href: '/notificacoes',
    iconKey: 'Notificações',
  },
  {
    type: 'link',
    label: 'Log de acesso individual',
    href: '/logs/acesso-individual',
    iconKey: 'Log de acesso individual',
  },
  {
    type: 'link',
    label: 'Onboarding de líderes',
    href: '/onboarding-lideres',
    iconKey: 'Onboarding de líderes',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.6 — Lider Cenario 1.
const MENU_LIDER_C1: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-lider',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Minha equipe',
    href: '/minha-equipe',
    iconKey: 'Minha equipe',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais/meus-liderados',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.7 — Lider Cenario 2. Diff vs §3.6: "Cadeia indireta" inserido apos
// "Minha equipe".
const MENU_LIDER_C2: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-lider',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Minha equipe',
    href: '/minha-equipe',
    iconKey: 'Minha equipe',
  },
  {
    type: 'link',
    label: 'Cadeia indireta',
    href: '/cadeia-indireta',
    iconKey: 'Cadeia indireta',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais/meus-liderados',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.8 — C-level unico OU C-level multiplo com `acessoTotal = true`.
// Mesma configuracao canonica para os 2 subperfis (§3.8 titulo consolidado).
const MENU_CLEVEL_FULL: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-clevel',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Todos os colaboradores',
    href: '/todos-os-colaboradores',
    iconKey: 'Todos os colaboradores',
  },
  {
    type: 'link',
    label: 'Minha equipe',
    href: '/minha-equipe',
    iconKey: 'Minha equipe',
  },
  {
    type: 'link',
    label: 'Relatórios e exportações',
    href: '/central-relatorios',
    iconKey: 'Relatórios e exportações',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais/meus-liderados',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

// §3.9 — C-level multiplo com `acessoTotal = false`.
const MENU_CLEVEL_RESTRICTED: MenuConfig = [
  {
    type: 'link',
    label: 'Painel',
    href: '/painel-clevel',
    iconKey: 'Painel',
  },
  {
    type: 'link',
    label: 'Minha equipe',
    href: '/minha-equipe',
    iconKey: 'Minha equipe',
  },
  {
    type: 'link',
    label: 'Cadeia indireta',
    href: '/cadeia-indireta',
    iconKey: 'Cadeia indireta',
  },
  ITEM_FATURAMENTO,
  {
    type: 'link',
    label: 'Dados mensais',
    href: '/dados-mensais/meus-liderados',
    iconKey: 'Dados mensais',
  },
  {
    type: 'link',
    label: 'Organograma',
    href: '/organograma',
    iconKey: 'Organograma',
  },
  SEPARATOR,
  ITEM_MEUS_DADOS,
  ITEM_SAIR,
];

/**
 * Mapa canonico das 10 configuracoes de menu do DOC 05 §3.1-§3.10.
 * Colaborador puro (§3.10) tem valor `null` — ausencia canonica de menu
 * administrativo. A resolucao `session → ProfileKey` acontece na ME-056.
 *
 * Cada configuracao inclui o item condicional "Faturamento da empresa"
 * quando aplicavel (RH, RH-Lider, Lider, C-level). O filtro condicional
 * `isResponsavelFinanceiro` e aplicado por `resolveMenuItems`.
 */
export const MENU_CONFIG_BY_PROFILE: Record<ProfileKey, MenuConfig | null> = {
  super_admin_global: MENU_SUPER_ADMIN_GLOBAL,
  super_admin_in_company: MENU_SUPER_ADMIN_IN_COMPANY,
  rh: MENU_RH,
  rh_lider_c1: MENU_RH_LIDER_C1,
  rh_lider_c2: MENU_RH_LIDER_C2,
  lider_c1: MENU_LIDER_C1,
  lider_c2: MENU_LIDER_C2,
  clevel_full: MENU_CLEVEL_FULL,
  clevel_restricted: MENU_CLEVEL_RESTRICTED,
  colaborador: null,
};

// -----------------------------------------------------------------------
// Resolvedor canonico com filtro condicional Responsavel financeiro (D5)
// + substituicao canonica de placeholder `[id]` (D088, ME-074)
// -----------------------------------------------------------------------

/**
 * Placeholder canonico usado nos hrefs de `MENU_SUPER_ADMIN_IN_COMPANY`
 * (§3.2). Substituido pelo `companyId` real no consumidor via
 * `resolveMenuItems(profileKey, isResponsavelFinanceiro, companyId)`.
 *
 * Debito canonico D088 (ME-074): o comentario da linha 194 declarava
 * "Placeholder [id] na URL sera substituido pelo consumidor (ME-056)" —
 * mas a substituicao nunca havia sido implementada. Consumidores atuais
 * (`pendencias-portal/page.tsx`, `historico/page.tsx`) recebiam hrefs
 * literais com `[id]` e a navegacao lateral do menu retornava 404.
 * ME-074 canoniza a substituicao aqui.
 */
const COMPANY_ID_PLACEHOLDER = '[id]';

/**
 * Substitui bit-exact toda ocorrencia canonica do placeholder
 * `[id]` no `href` de um item `MenuLinkItem` pelo `companyId` real,
 * preservando bit-exact os `children` recursivamente. Puro; recebe
 * `MenuLinkItem` e retorna novo `MenuLinkItem` estruturalmente igual
 * exceto pelo href resolvido.
 */
function applyCompanyIdToLink(item: MenuLinkItem, companyId: number): MenuLinkItem {
  const resolvedHref = item.href.split(COMPANY_ID_PLACEHOLDER).join(String(companyId));
  if (item.children === undefined) {
    return {
      ...item,
      href: resolvedHref,
    };
  }
  return {
    ...item,
    href: resolvedHref,
    children: item.children.map((child) => applyCompanyIdToLink(child, companyId)),
  };
}

/**
 * Retorna a lista de itens de menu renderizavel para o perfil informado,
 * aplicando o filtro condicional "Faturamento da empresa" conforme
 * `isResponsavelFinanceiro` (DOC 02 §3.4 / S461/S463/S464/S465) e, quando
 * `companyId` presente, substituindo canonicamente o placeholder `[id]`
 * nos hrefs (D088 — ME-074).
 *
 * Regra canonica: itens com `condition = 'isResponsavelFinanceiro'`
 * aparecem apenas quando `isResponsavelFinanceiro = true`. Itens sem
 * `condition` sao sempre incluidos. Separadores nao sao filtrados.
 *
 * Regra canonica D088 (ME-074): quando `companyId` presente, todo href
 * de item de link (incluindo `children`) tem `[id]` substituido bit-exact
 * por `String(companyId)`. Quando `companyId` ausente (undefined), os
 * hrefs sao devolvidos literais — compatibilidade retroativa com os
 * consumidores de `super_admin_global` (§3.1) e demais perfis que nao
 * usam o placeholder.
 *
 * Colaborador puro (§3.10) retorna `null` — ausencia canonica de menu.
 */
export function resolveMenuItems(
  profileKey: ProfileKey,
  isResponsavelFinanceiro: boolean,
  companyId?: number,
): readonly MenuItem[] | null {
  const config = MENU_CONFIG_BY_PROFILE[profileKey];
  if (config === null) {
    return null;
  }
  const filtered = config.filter((item) => {
    if (item.type === 'separator') {
      return true;
    }
    if (item.condition === 'isResponsavelFinanceiro') {
      return isResponsavelFinanceiro;
    }
    return true;
  });
  if (companyId === undefined) {
    return filtered;
  }
  return filtered.map((item) => {
    if (item.type === 'separator') {
      return item;
    }
    return applyCompanyIdToLink(item, companyId);
  });
}
