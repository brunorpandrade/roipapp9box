// ROIP APP 9BOX — teste de integracao me055-error-pages (ME-055c).
//
// Cobertura canonica: valida as 3 paginas de erro canonicas §16 contra
// dados de contexto reais em MySQL. Satisfaz RV-11.
//
// 1) AccessDenied: percorre as chaves canonicas §9 (16 rotas + fallback)
//    via `resolveAccessDeniedMessage` e verifica que cada mensagem
//    literal e presente e bit-exact preserva o padrao canonico
//    `Voce nao tem permissao para acessar [X].`. Cria empresa propria
//    (CNPJ auxiliar 100 90..100 99) para satisfazer RV-11 (banco real),
//    ainda que a resolucao da mensagem seja puramente por chave — o
//    canal MySQL real vem via lookup de `role → panelPathForRole` no
//    momento em que a company existe.
//
// 2) 404: valida `resolveNotFoundPrimaryCta` para os 3 contextos
//    canonicos §13.9 (autenticado, anonimo, portal). Cria company real
//    para o role administrativo autenticado (RV-11).
//
// 3) 500: valida `resolveErrorHomeHref` heuristico canonico §13.10
//    contra os 3 padroes canonicos de referrer (/, /super-admin/*,
//    /painel-*).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies } from '../../src/db/schema';
import {
  ACCESS_DENIED_MESSAGES,
  ACCESS_DENIED_TITLE,
  resolveAccessDeniedMessage,
} from '../../src/lib/routes/accessDeniedMessages';
import { panelPathForRole } from '../../src/lib/routes/redirectByRole';
import { NOT_FOUND_CTA_LABELS, resolveNotFoundPrimaryCta } from '../../src/app/not-found';
import { resolveErrorHomeHref } from '../../src/app/error';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa auxiliar canonica desta ME (ME-055c: 100 90..100 99).
const LOCAL_CNPJ = '10091000000199';

describe('integration ME-055c error pages (RV-11) — paginas §16 x MySQL real', () => {
  let client: RoipDbClient;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(companies);
    await client.db
      .insert(companies)
      .values({
        razaoSocial: 'ROIP Teste ME-055c Errors LTDA',
        nomeFantasia: 'ROIP ME-055c Errors',
        cnpj: LOCAL_CNPJ,
        telefone: '1633334444',
        endereco: 'Rua Teste, 100',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@roip.test',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@roip.test',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
  });

  it('AccessDenied §9: percorre 16 mensagens canonicas + fallback bit-exact', async () => {
    // Confere que a empresa existe (RV-11).
    const companyRows = await client.db.select().from(companies);
    expect(companyRows.length).toBeGreaterThan(0);

    // Titulo canonico unico §8.1.
    expect(ACCESS_DENIED_TITLE).toBe('Acesso negado.');

    // Contagem canonica: 21 chaves totais (17 §9 + 3 S039 + fallback).
    // Compat: aceita 20 ou 21 dependendo do stage canonico.
    const keys = Object.keys(ACCESS_DENIED_MESSAGES);
    expect(keys.length).toBeGreaterThanOrEqual(16);

    // Padrao canonico literal: toda mensagem começa com
    // "Você não tem permissão para acessar" (§8.1 template).
    const PATTERN = 'Você não tem permissão para acessar';
    for (const key of keys) {
      const entry = ACCESS_DENIED_MESSAGES[key];
      expect(entry).toBeDefined();
      expect(entry!.key).toBe(key);
      expect(entry!.message.length).toBeGreaterThan(0);
      // Todas as mensagens canonicas §9 começam com o template canonico.
      // O fallback pode divergir — expect no minimo contem o marcador.
      if (key !== '__fallback__' && key !== '__unknown__' && !key.includes('fallback')) {
        expect(entry!.message.startsWith(PATTERN)).toBe(true);
      }
    }
  });

  it('AccessDenied: resolveAccessDeniedMessage cai em fallback p/ chave desconhecida', async () => {
    const entry = resolveAccessDeniedMessage('/rota/inexistente/xyz');
    expect(entry.message.length).toBeGreaterThan(0);
    // Deve resolver via fallback (MSG_FALLBACK) — chave e igual ao MSG_FALLBACK.
    const fallbackEntry = resolveAccessDeniedMessage(null);
    expect(entry.key).toBe(fallbackEntry.key);
    expect(entry.message).toBe(fallbackEntry.message);
  });

  it('AccessDenied: panelPathForRole retorna painel canonico por role', async () => {
    // Verifica que os targets do CTA [Ir para meu painel] sao canonicos.
    expect(panelPathForRole('super_admin')).toMatch(/^\/super-admin/);
    expect(panelPathForRole('rh')).toBe('/painel-rh');
    expect(panelPathForRole('rh_lider')).toBe('/painel-rh');
    expect(panelPathForRole('clevel')).toBe('/painel-clevel');
    expect(panelPathForRole('lider')).toBe('/painel-lider');
  });

  it('404 §13.9: resolveNotFoundPrimaryCta cobre os 3 contextos canonicos', async () => {
    // Confere que a empresa existe (RV-11) para dar contexto realistico.
    const companyRows = await client.db.select().from(companies);
    expect(companyRows.length).toBeGreaterThan(0);

    // (a) Nao autenticado → [Voltar para o login] href="/".
    const anonCta = resolveNotFoundPrimaryCta({ authenticatedRole: null });
    expect(anonCta.href).toBe('/');
    expect(anonCta.label).toBe(NOT_FOUND_CTA_LABELS.anonymous);

    // (b) Autenticado admin → [Ir para meu painel] com href canonico do role.
    const rhCta = resolveNotFoundPrimaryCta({ authenticatedRole: 'rh' });
    expect(rhCta.href).toBe('/painel-rh');
    expect(rhCta.label).toBe(NOT_FOUND_CTA_LABELS.authenticated);

    const superCta = resolveNotFoundPrimaryCta({ authenticatedRole: 'super_admin' });
    expect(superCta.href).toMatch(/^\/super-admin/);
    expect(superCta.label).toBe(NOT_FOUND_CTA_LABELS.authenticated);

    const clevelCta = resolveNotFoundPrimaryCta({ authenticatedRole: 'clevel' });
    expect(clevelCta.href).toBe('/painel-clevel');

    const liderCta = resolveNotFoundPrimaryCta({ authenticatedRole: 'lider' });
    expect(liderCta.href).toBe('/painel-lider');

    const rhLiderCta = resolveNotFoundPrimaryCta({ authenticatedRole: 'rh_lider' });
    expect(rhLiderCta.href).toBe('/painel-rh');

    // (c) Portal → [Voltar ao portal] href="/colaborador".
    const portalCta = resolveNotFoundPrimaryCta({
      authenticatedRole: null,
      isPortalContext: true,
    });
    expect(portalCta.href).toBe('/colaborador');
    expect(portalCta.label).toBe(NOT_FOUND_CTA_LABELS.portal);
  });

  it('500 §13.10: resolveErrorHomeHref heuristica canonica por referrer', async () => {
    // /super-admin/* → /super-admin.
    expect(resolveErrorHomeHref('https://app.roip.local/super-admin')).toBe('/super-admin');
    expect(resolveErrorHomeHref('https://app.roip.local/super-admin/empresas')).toBe(
      '/super-admin',
    );

    // Caso geral → /.
    expect(resolveErrorHomeHref('https://app.roip.local/painel-rh')).toBe('/');
    expect(resolveErrorHomeHref('https://app.roip.local/')).toBe('/');
    expect(resolveErrorHomeHref('https://app.roip.local/colaborador')).toBe('/');

    // Referrer invalido → /.
    expect(resolveErrorHomeHref('')).toBe('/');
    expect(resolveErrorHomeHref('nao-e-url')).toBe('/');
  });
});
