// ROIP APP 9BOX — testes canonicos do menuConfig (ME-055 Bloco B).
//
// Verifica presenca canonica bit-exact das 10 configuracoes de menu
// definidas no DOC 05 §3.1-§3.10 e o comportamento do filtro condicional
// "Faturamento da empresa" (S461/S463/S464/S465).
//
// Estrutura:
// - 10 tests compondo integralmente MENU_CONFIG_BY_PROFILE (1 por perfil).
// - 3 tests exercitando `resolveMenuItems` no filtro condicional Responsavel
//   financeiro (RF=true, RF=false, e RH puro que nao muda com RF=false).
//
// Racional canonico: os tests declaram a ordem canonica bit-exact dos
// itens (label + href) para cada perfil. Se qualquer editor inserir,
// remover ou reordenar itens, o teste correspondente reprova com
// diagnostico especifico (item por indice). Isso e a implementacao
// concreta da prova RV-03 dirigida ao alvo `MENU_CONFIG_BY_PROFILE`
// declarada em S201.

import { describe, expect, it } from 'vitest';

import {
  MENU_CONFIG_BY_PROFILE,
  resolveMenuItems,
  type MenuConfig,
  type MenuItem,
  type ProfileKey,
} from '../../src/lib/menu/menuConfig';

/** Reduz um item a `[label, href]` para as assercoes canonicas de ordem. */
function summarize(item: MenuItem): readonly [string, string] {
  if (item.type === 'separator') {
    return ['(separator)', ''];
  }
  return [item.label, item.href];
}

function summarizeAll(
  config: MenuConfig | readonly MenuItem[],
): ReadonlyArray<readonly [string, string]> {
  return config.map(summarize);
}

// -----------------------------------------------------------------------
// 10 tests — composicao integral MENU_CONFIG_BY_PROFILE §3.1-§3.10.
// -----------------------------------------------------------------------

describe('MENU_CONFIG_BY_PROFILE — composicao canonica DOC 05 §3.1-§3.10', () => {
  it('§3.1 super_admin_global — 11 itens canonicos bit-exact', () => {
    const config = MENU_CONFIG_BY_PROFILE.super_admin_global;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/super-admin'],
      ['Empresas', '/super-admin/empresas'],
      ['Instrumentos (placeholder Fase 1)', '/super-admin/instrumentos'],
      ['Suporte e logs (placeholder Fase 1)', '/super-admin/suporte-logs'],
      ['Logs administrativos', '/super-admin/logs'],
      ['Gestão de ciclos', '/cycle-management'],
      ['Notificações', '/notificacoes'],
      ['Desbloqueios', '/super-admin/desbloqueios'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.2 super_admin_in_company — 15 itens canonicos com "Início" showBackArrow', () => {
    const config = MENU_CONFIG_BY_PROFILE.super_admin_in_company;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Início', '/super-admin'],
      ['Painel', '/super-admin/empresa/[id]'],
      ['Todos os colaboradores', '/super-admin/empresa/[id]/todos-os-colaboradores'],
      ['Relatórios e exportações', '/super-admin/empresa/[id]/relatorios-e-exportacoes'],
      ['Dados mensais', '/super-admin/empresa/[id]/dados-mensais'],
      ['Organograma', '/super-admin/empresa/[id]/organograma'],
      ['C-level e RH', '/super-admin/empresa/[id]/clevel-rh'],
      ['Cadastro da empresa', '/super-admin/empresa/[id]/parametros'],
      ['Radar NR-1', '/super-admin/empresa/[id]/nr1'],
      ['Pendências no portal', '/super-admin/empresa/[id]/pendencias-portal'],
      ['Histórico da empresa', '/super-admin/empresa/[id]/historico'],
      ['Onboarding de líderes', '/super-admin/empresa/[id]/onboarding-lideres'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
    // Item "Início" e o unico com `showBackArrow: true` — canonicamente
    // marcado por D3 para renderizar a seta "←" no Sidebar §3.2.
    const inicio = (config as MenuConfig).find(
      (item) => item.type === 'link' && item.label === 'Início',
    );
    expect(inicio).toBeDefined();
    expect(inicio?.type).toBe('link');
    if (inicio && inicio.type === 'link') {
      expect(inicio.showBackArrow).toBe(true);
    }
  });

  it('§3.3 rh (RH puro) — 15 itens canonicos com Faturamento condicional', () => {
    const config = MENU_CONFIG_BY_PROFILE.rh;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-rh'],
      ['Todos os colaboradores', '/todos-os-colaboradores'],
      ['Relatórios e exportações', '/central-relatorios'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais'],
      ['Organograma', '/organograma'],
      ['Radar NR-1', '/nr1'],
      ['Pendências no portal', '/pendencias-portal'],
      ['Gestão de ciclos', '/cycle-management'],
      ['Notificações', '/notificacoes'],
      ['Log de acesso individual', '/logs/acesso-individual'],
      ['Onboarding de líderes', '/onboarding-lideres'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.4 rh_lider_c1 — 16 itens canonicos, "Minha equipe" apos "Todos"', () => {
    const config = MENU_CONFIG_BY_PROFILE.rh_lider_c1;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-rh'],
      ['Todos os colaboradores', '/todos-os-colaboradores'],
      ['Minha equipe', '/minha-equipe'],
      ['Relatórios e exportações', '/central-relatorios'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais'],
      ['Organograma', '/organograma'],
      ['Radar NR-1', '/nr1'],
      ['Pendências no portal', '/pendencias-portal'],
      ['Gestão de ciclos', '/cycle-management'],
      ['Notificações', '/notificacoes'],
      ['Log de acesso individual', '/logs/acesso-individual'],
      ['Onboarding de líderes', '/onboarding-lideres'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.5 rh_lider_c2 — 17 itens canonicos com "Cadeia indireta" apos "Minha equipe"', () => {
    const config = MENU_CONFIG_BY_PROFILE.rh_lider_c2;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-rh'],
      ['Todos os colaboradores', '/todos-os-colaboradores'],
      ['Minha equipe', '/minha-equipe'],
      ['Cadeia indireta', '/cadeia-indireta'],
      ['Relatórios e exportações', '/central-relatorios'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais'],
      ['Organograma', '/organograma'],
      ['Radar NR-1', '/nr1'],
      ['Pendências no portal', '/pendencias-portal'],
      ['Gestão de ciclos', '/cycle-management'],
      ['Notificações', '/notificacoes'],
      ['Log de acesso individual', '/logs/acesso-individual'],
      ['Onboarding de líderes', '/onboarding-lideres'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.6 lider_c1 — 8 itens canonicos (Lider Cenario 1)', () => {
    const config = MENU_CONFIG_BY_PROFILE.lider_c1;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-lider'],
      ['Minha equipe', '/minha-equipe'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais/meus-liderados'],
      ['Organograma', '/organograma'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.7 lider_c2 — 9 itens canonicos (Lider Cenario 2 com "Cadeia indireta")', () => {
    const config = MENU_CONFIG_BY_PROFILE.lider_c2;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-lider'],
      ['Minha equipe', '/minha-equipe'],
      ['Cadeia indireta', '/cadeia-indireta'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais/meus-liderados'],
      ['Organograma', '/organograma'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.8 clevel_full — 10 itens canonicos (C-level unico ou multiplo acessoTotal=true)', () => {
    const config = MENU_CONFIG_BY_PROFILE.clevel_full;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-clevel'],
      ['Todos os colaboradores', '/todos-os-colaboradores'],
      ['Minha equipe', '/minha-equipe'],
      ['Relatórios e exportações', '/central-relatorios'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais/meus-liderados'],
      ['Organograma', '/organograma'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.9 clevel_restricted — 9 itens canonicos (C-level multiplo acessoTotal=false)', () => {
    const config = MENU_CONFIG_BY_PROFILE.clevel_restricted;
    expect(config).not.toBeNull();
    expect(summarizeAll(config as MenuConfig)).toEqual([
      ['Painel', '/painel-clevel'],
      ['Minha equipe', '/minha-equipe'],
      ['Cadeia indireta', '/cadeia-indireta'],
      ['Faturamento da empresa', '/faturamento-mensal'],
      ['Dados mensais', '/dados-mensais/meus-liderados'],
      ['Organograma', '/organograma'],
      ['(separator)', ''],
      ['Alterar senha', '/alterar-senha'],
      ['Meus dados', '/meus-dados'],
      ['Sair', '/logout'],
    ]);
  });

  it('§3.10 colaborador — configuracao canonica null (sem menu administrativo)', () => {
    expect(MENU_CONFIG_BY_PROFILE.colaborador).toBeNull();
  });
});

// -----------------------------------------------------------------------
// 3 tests — filtro condicional "Faturamento da empresa" (S461/S463/S464/S465).
// -----------------------------------------------------------------------

describe('resolveMenuItems — filtro condicional Responsavel financeiro', () => {
  it('RH-Lider C1 com isResponsavelFinanceiro=true inclui "Faturamento da empresa"', () => {
    const items = resolveMenuItems('rh_lider_c1', true);
    expect(items).not.toBeNull();
    const labels = (items as readonly MenuItem[])
      .filter((item): item is Extract<MenuItem, { type: 'link' }> => item.type === 'link')
      .map((item) => item.label);
    expect(labels).toContain('Faturamento da empresa');
    // Posicionamento canonico DOC 02 §3.4: imediatamente acima de
    // "Dados mensais".
    const faturamentoIdx = labels.indexOf('Faturamento da empresa');
    const dadosIdx = labels.indexOf('Dados mensais');
    expect(faturamentoIdx).toBeGreaterThanOrEqual(0);
    expect(dadosIdx).toBeGreaterThanOrEqual(0);
    expect(dadosIdx).toBe(faturamentoIdx + 1);
  });

  it('C-level acessoTotal=true, RF=false remove "Faturamento da empresa"', () => {
    const items = resolveMenuItems('clevel_full', false);
    expect(items).not.toBeNull();
    const labels = (items as readonly MenuItem[])
      .filter((item): item is Extract<MenuItem, { type: 'link' }> => item.type === 'link')
      .map((item) => item.label);
    expect(labels).not.toContain('Faturamento da empresa');
    // Regra canonica: "Dados mensais" continua presente mesmo sem RF.
    expect(labels).toContain('Dados mensais');
  });

  it('RH puro com RF=false mantem menu §3.3 sem "Faturamento da empresa"', () => {
    const items = resolveMenuItems('rh', false);
    expect(items).not.toBeNull();
    const labels = (items as readonly MenuItem[])
      .filter((item): item is Extract<MenuItem, { type: 'link' }> => item.type === 'link')
      .map((item) => item.label);
    // §3.3 RH puro sem RF: 15 itens link (16 no total menos 1 condicional
    // filtrado; separador nao entra no filter link). ME-080b D3.1: +1 item
    // 'Alterar senha' apos ME-057b canonizado.
    expect(labels).not.toContain('Faturamento da empresa');
    expect(labels).toEqual([
      'Painel',
      'Todos os colaboradores',
      'Relatórios e exportações',
      'Dados mensais',
      'Organograma',
      'Radar NR-1',
      'Pendências no portal',
      'Gestão de ciclos',
      'Notificações',
      'Log de acesso individual',
      'Onboarding de líderes',
      'Alterar senha',
      'Meus dados',
      'Sair',
    ]);
  });
});

// Cobertura estrutural de tipos — declaracao explicita das 10 chaves
// canonicas de ProfileKey. Se qualquer chave for renomeada ou removida,
// esta linha reprova em typecheck (nao em runtime).
const _profileKeysExhaustive: readonly ProfileKey[] = [
  'super_admin_global',
  'super_admin_in_company',
  'rh',
  'rh_lider_c1',
  'rh_lider_c2',
  'lider_c1',
  'lider_c2',
  'clevel_full',
  'clevel_restricted',
  'colaborador',
];
void _profileKeysExhaustive;
