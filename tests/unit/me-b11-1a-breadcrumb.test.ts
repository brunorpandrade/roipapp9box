// ROIP APP 9BOX — testes canonicos do breadcrumb registry (ME-B11.1a).
//
// Cobre:
// - RV-13: `parseCompanyIdFromPathname` e `resolveScreenNameFromPathname`
//   consumidos aqui (alem do consumidor real em `Breadcrumb.tsx`).
// - Resolucao canonica §3.2: cada rota dentro-de-empresa listada no menu
//   canonico resolve para o `screenName` canonico correspondente.
// - Especificidade: rotas aninhadas (colaborador/[id]/editar, clevel/
//   [id]/editar, dashboard-recorte/[tipo]/[alvo]) resolvem para o nome
//   especifico, nao para "Painel" (rota landing).
// - Fallback canonico: pathname fora da arvore dentro-de-empresa retorna
//   `null` em `resolveScreenNameFromPathname` e em
//   `parseCompanyIdFromPathname`.

import { describe, expect, it } from 'vitest';

import {
  BREADCRUMB_ENTRIES_DENTRO_EMPRESA,
  parseCompanyIdFromPathname,
  resolveScreenNameFromPathname,
} from '../../src/lib/menu/breadcrumbRegistry';

describe('parseCompanyIdFromPathname — extracao canonica do companyId', () => {
  it('extrai companyId numerico de rota landing', () => {
    expect(parseCompanyIdFromPathname('/super-admin/empresa/1')).toBe('1');
    expect(parseCompanyIdFromPathname('/super-admin/empresa/42')).toBe('42');
  });

  it('extrai companyId de sub-rota', () => {
    expect(parseCompanyIdFromPathname('/super-admin/empresa/1/nr1')).toBe('1');
    expect(parseCompanyIdFromPathname('/super-admin/empresa/2/todos-os-colaboradores')).toBe('2');
    expect(parseCompanyIdFromPathname('/super-admin/empresa/42/colaborador/123/editar')).toBe('42');
  });

  it('retorna null para pathname fora da arvore dentro-de-empresa', () => {
    expect(parseCompanyIdFromPathname('/')).toBeNull();
    expect(parseCompanyIdFromPathname('/super-admin')).toBeNull();
    expect(parseCompanyIdFromPathname('/super-admin/empresa/nova')).toBe('nova');
    // Note: /super-admin/empresa/nova e intencionalmente capturado como
    // companyId='nova' porque segue o shape da rota — a decisao de
    // nao renderizar breadcrumb nessa rota fica a cargo do consumidor
    // (Breadcrumb retorna null quando screenName tambem for null).
    expect(parseCompanyIdFromPathname('/painel-rh')).toBeNull();
    expect(parseCompanyIdFromPathname('/dados-mensais')).toBeNull();
  });
});

describe('resolveScreenNameFromPathname — nomes canonicos §3.2 DOC 05', () => {
  it('resolve rota landing (/super-admin/empresa/[id]) como "Painel"', () => {
    expect(resolveScreenNameFromPathname('/super-admin/empresa/1')).toBe('Painel');
    expect(resolveScreenNameFromPathname('/super-admin/empresa/42')).toBe('Painel');
  });

  it('resolve as 16 rotas de primeiro nivel do escopo da varredura', () => {
    const base = '/super-admin/empresa/1';
    expect(resolveScreenNameFromPathname(`${base}/todos-os-colaboradores`)).toBe(
      'Todos os colaboradores',
    );
    expect(resolveScreenNameFromPathname(`${base}/relatorios-e-exportacoes`)).toBe(
      'Relatórios e exportações',
    );
    expect(resolveScreenNameFromPathname(`${base}/dados-mensais`)).toBe('Dados mensais');
    expect(resolveScreenNameFromPathname(`${base}/organograma`)).toBe('Organograma');
    expect(resolveScreenNameFromPathname(`${base}/clevel-rh`)).toBe('C-level e RH');
    expect(resolveScreenNameFromPathname(`${base}/parametros`)).toBe('Cadastro da empresa');
    expect(resolveScreenNameFromPathname(`${base}/nr1`)).toBe('Radar NR-1');
    expect(resolveScreenNameFromPathname(`${base}/pendencias-portal`)).toBe('Pendências no portal');
    expect(resolveScreenNameFromPathname(`${base}/historico`)).toBe('Histórico da empresa');
    expect(resolveScreenNameFromPathname(`${base}/onboarding-lideres`)).toBe(
      'Onboarding de líderes',
    );
    expect(resolveScreenNameFromPathname(`${base}/faturamento-mensal`)).toBe(
      'Faturamento da empresa',
    );
    expect(resolveScreenNameFromPathname(`${base}/dashboard-empresa`)).toBe('Dashboard da empresa');
    expect(resolveScreenNameFromPathname(`${base}/bloco-clima`)).toBe('Clima e engajamento');
    expect(resolveScreenNameFromPathname(`${base}/turnover`)).toBe('Turnover');
    expect(resolveScreenNameFromPathname(`${base}/familias`)).toBe('Famílias de função');
    expect(resolveScreenNameFromPathname(`${base}/painel-rh-preview`)).toBe(
      'Painel do RH (preview)',
    );
  });

  it('resolve rotas aninhadas de colaborador em ordem de especificidade', () => {
    const base = '/super-admin/empresa/1/colaborador';
    expect(resolveScreenNameFromPathname(`${base}/novo`)).toBe('Novo colaborador');
    expect(resolveScreenNameFromPathname(`${base}/123/editar`)).toBe('Editar colaborador');
    expect(resolveScreenNameFromPathname(`${base}/123/desligamento`)).toBe(
      'Desligamento de colaborador',
    );
  });

  it('resolve rotas aninhadas de C-level em ordem de especificidade', () => {
    const base = '/super-admin/empresa/1/clevel';
    expect(resolveScreenNameFromPathname(`${base}/novo`)).toBe('Novo C-level');
    expect(resolveScreenNameFromPathname(`${base}/5/editar`)).toBe('Editar C-level');
  });

  it('resolve dashboard-recorte com 2 segmentos', () => {
    expect(
      resolveScreenNameFromPathname('/super-admin/empresa/1/dashboard-recorte/departamento/42'),
    ).toBe('Dashboard de recorte');
  });

  it('retorna null para pathname fora da arvore dentro-de-empresa', () => {
    expect(resolveScreenNameFromPathname('/')).toBeNull();
    expect(resolveScreenNameFromPathname('/super-admin')).toBeNull();
    expect(resolveScreenNameFromPathname('/painel-rh')).toBeNull();
    expect(resolveScreenNameFromPathname('/dados-mensais')).toBeNull();
    expect(resolveScreenNameFromPathname('/meus-dados')).toBeNull();
  });

  it('retorna null para sub-rota desconhecida dentro-de-empresa', () => {
    expect(resolveScreenNameFromPathname('/super-admin/empresa/1/rota-que-nao-existe')).toBeNull();
  });
});

describe('BREADCRUMB_ENTRIES_DENTRO_EMPRESA — invariantes estruturais', () => {
  it('todas as entradas tem pattern RegExp e screenName string nao-vazio', () => {
    for (const entry of BREADCRUMB_ENTRIES_DENTRO_EMPRESA) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.screenName).toBe('string');
      expect(entry.screenName.length).toBeGreaterThan(0);
    }
  });

  it('screenNames sao canonicamente unicos', () => {
    const names = BREADCRUMB_ENTRIES_DENTRO_EMPRESA.map((e) => e.screenName);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('entrada "Painel" (landing) e a ultima — fallback de menor especificidade', () => {
    const last = BREADCRUMB_ENTRIES_DENTRO_EMPRESA[BREADCRUMB_ENTRIES_DENTRO_EMPRESA.length - 1];
    expect(last?.screenName).toBe('Painel');
  });
});
