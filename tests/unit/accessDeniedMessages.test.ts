/* eslint-disable @stylistic/max-len -- literais canonicas comparadas em linha unica para deteccao de drift */
// ROIP APP 9BOX — teste unitario `accessDeniedMessages` (ME-023).
//
// Cobre a fidelidade literal das mensagens canonicas do
// `AccessDeniedPage` (DOC 02 §9 + §11.5 + S039 derivadas de §10.9). O
// teste NAO computa nada — apenas cruza cada constante exportada
// contra a string literal canonica. Alterar uma palavra aqui e mudar
// canonico; alterar sem mudar o texto no `accessDeniedMessages.ts`
// reprova (RV-03 — RV-14).

import { describe, expect, it } from 'vitest';

import {
  ACCESS_DENIED_MESSAGES,
  ACCESS_DENIED_TITLE,
  MSG_ALTERAR_EMAIL,
  MSG_CENTRAL_RELATORIOS,
  MSG_CLEVEL_CADASTRO,
  MSG_COLABORADOR_NOVO,
  MSG_CYCLE_MANAGEMENT,
  MSG_DASHBOARD_INDIVIDUAL_CLEVEL,
  MSG_EMPRESA_CADASTRO,
  MSG_FALLBACK,
  MSG_FATURAMENTO_MENSAL,
  MSG_LOGS_ACESSO_INDIVIDUAL,
  MSG_NOTIFICACOES,
  MSG_ONBOARDING_LIDERES,
  MSG_PAINEL_CLEVEL,
  MSG_PAINEL_LIDER,
  MSG_PAINEL_RH,
  MSG_PENDENCIAS_PORTAL,
  MSG_PERFIL_INDIVIDUAL_CLEVEL,
  MSG_SUPER_ADMIN,
  MSG_SUPER_ADMIN_DESBLOQUEIOS,
  MSG_SUPER_ADMIN_LOGS_ACESSO_INDIVIDUAL,
  MSG_SUPER_ADMIN_LOGS_RF,
  resolveAccessDeniedMessage,
} from '../../src/lib/routes/accessDeniedMessages';

describe('accessDeniedMessages — literais canonicas (ME-023)', () => {
  it('titulo canonico unico §8.1', () => {
    expect(ACCESS_DENIED_TITLE).toBe('Acesso negado.');
  });

  // §9.1..§9.15 --------------------------------------------------------
  it('§9.1 /super-admin', () => {
    expect(MSG_SUPER_ADMIN.message).toBe(
      'Você não tem permissão para acessar Painel Super Admin. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
    expect(MSG_SUPER_ADMIN.canonicalRef).toBe('DOC 02 §9.1');
  });

  it('§9.2 /painel-rh', () => {
    expect(MSG_PAINEL_RH.message).toBe(
      'Você não tem permissão para acessar Painel RH. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.3 /painel-clevel', () => {
    expect(MSG_PAINEL_CLEVEL.message).toBe(
      'Você não tem permissão para acessar Painel C-level. Este espaço é restrito ao C-level e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.4 /painel-lider', () => {
    expect(MSG_PAINEL_LIDER.message).toBe(
      'Você não tem permissão para acessar Painel Líder. Este espaço é restrito ao Líder e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.5 /alterar-email — tail canonica "contate o RH da sua empresa."', () => {
    expect(MSG_ALTERAR_EMAIL.message).toBe(
      'Você não tem permissão para acessar Alterar e-mail. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o RH da sua empresa.',
    );
  });

  it('§9.6 /cycle-management', () => {
    expect(MSG_CYCLE_MANAGEMENT.message).toBe(
      'Você não tem permissão para acessar Gestão de ciclos. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.7 /notificacoes', () => {
    expect(MSG_NOTIFICACOES.message).toBe(
      'Você não tem permissão para acessar Notificações. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.8 /super-admin/desbloqueios — tail canonica "contate diretamente o Super Admin."', () => {
    expect(MSG_SUPER_ADMIN_DESBLOQUEIOS.message).toBe(
      'Você não tem permissão para acessar Desbloqueios. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate diretamente o Super Admin.',
    );
  });

  it('§9.9 /pendencias-portal', () => {
    expect(MSG_PENDENCIAS_PORTAL.message).toBe(
      'Você não tem permissão para acessar Pendências no portal. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.10 /dashboard-individual (alvo C-level, PC1f)', () => {
    expect(MSG_DASHBOARD_INDIVIDUAL_CLEVEL.message).toBe(
      'Você não tem permissão para acessar o dashboard individual deste colaborador. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.11 /faturamento-mensal (S437)', () => {
    expect(MSG_FATURAMENTO_MENSAL.message).toBe(
      'Você não tem permissão para acessar Faturamento da empresa. Este espaço é restrito ao Responsável financeiro e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.12 /super-admin/logs/responsavel-financeiro (S438)', () => {
    expect(MSG_SUPER_ADMIN_LOGS_RF.message).toBe(
      'Você não tem permissão para acessar Logs administrativos. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.13 /onboarding-lideres (S434)', () => {
    expect(MSG_ONBOARDING_LIDERES.message).toBe(
      'Você não tem permissão para acessar Onboarding de líderes. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.14a /logs/acesso-individual (variante RH)', () => {
    expect(MSG_LOGS_ACESSO_INDIVIDUAL.message).toBe(
      'Você não tem permissão para acessar Log de acesso individual. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.14b /super-admin/logs/acesso-individual (variante Super Admin)', () => {
    expect(MSG_SUPER_ADMIN_LOGS_ACESSO_INDIVIDUAL.message).toBe(
      'Você não tem permissão para acessar Log de acesso individual (Super Admin). Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('§9.15 /central-relatorios', () => {
    expect(MSG_CENTRAL_RELATORIOS.message).toBe(
      'Você não tem permissão para acessar Relatórios e exportações. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  // §11.5 --------------------------------------------------------------
  it('§11.5 Perfil Individual de C-level (PC1e)', () => {
    expect(MSG_PERFIL_INDIVIDUAL_CLEVEL.message).toBe(
      'Você não tem permissão para acessar o Perfil Individual deste colaborador. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  // S039 derivadas -----------------------------------------------------
  it('S039a /colaborador/novo', () => {
    expect(MSG_COLABORADOR_NOVO.message).toBe(
      'Você não tem permissão para acessar Cadastro de colaborador. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('S039b Cadastro de C-level', () => {
    expect(MSG_CLEVEL_CADASTRO.message).toBe(
      'Você não tem permissão para acessar Cadastro de C-level. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  it('S039c Cadastro de empresa', () => {
    expect(MSG_EMPRESA_CADASTRO.message).toBe(
      'Você não tem permissão para acessar Cadastro de empresa. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  // Fallback -----------------------------------------------------------
  it('MSG_FALLBACK — recurso de ultima linha', () => {
    expect(MSG_FALLBACK.message).toBe(
      'Você não tem permissão para acessar esta área. Se acredita que isso é um erro, contate o Super Admin.',
    );
  });

  // Registro consolidado ----------------------------------------------
  it('ACCESS_DENIED_MESSAGES indexa 21 chaves distintas (17 §9-§11.5 + 3 S039 + fallback)', () => {
    expect(Object.keys(ACCESS_DENIED_MESSAGES).length).toBe(21);
  });

  // Resolver -----------------------------------------------------------
  it('resolveAccessDeniedMessage devolve entrada exata por key', () => {
    expect(resolveAccessDeniedMessage('/painel-rh')).toBe(MSG_PAINEL_RH);
    expect(resolveAccessDeniedMessage('/super-admin')).toBe(MSG_SUPER_ADMIN);
    expect(resolveAccessDeniedMessage('/faturamento-mensal')).toBe(MSG_FATURAMENTO_MENSAL);
  });

  it('resolveAccessDeniedMessage devolve fallback quando key ausente ou desconhecida', () => {
    expect(resolveAccessDeniedMessage(null)).toBe(MSG_FALLBACK);
    expect(resolveAccessDeniedMessage(undefined)).toBe(MSG_FALLBACK);
    expect(resolveAccessDeniedMessage('')).toBe(MSG_FALLBACK);
    expect(resolveAccessDeniedMessage('/rota-inexistente')).toBe(MSG_FALLBACK);
  });
});
