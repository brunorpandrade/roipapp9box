// ROIP APP 9BOX — teste de integração ME-080d Onda 1a + Onda 1e.
//
// Cobre bit-exact as mutacoes canonicas do `MENU_SUPER_ADMIN_GLOBAL`:
//
// 1. Onda 1e (revisao de D2=C) — item "Empresas" REMOVIDO do menu.
//    Racional: apontar para `/super-admin` (mesma rota de "Painel")
//    causava destaque visual duplicado. Debito D-EMPRESAS-B1 continua
//    aberto; item volta quando a rota `/super-admin/empresas` dedicada
//    for implementada.
//
// 2. Onda 1a — D8: 5 itens sem rota implementada declaram
//    `prefetch: false` explicito para suprimir o prefetch RSC automatico
//    do Next 15 (elimina 404 no console):
//      - Instrumentos (placeholder Fase 1)
//      - Suporte e logs (placeholder Fase 1)
//      - Gestao de ciclos  (D-CYCLE-B8)
//      - Desbloqueios       (rota nao implementada)
//      - Meus dados         (D-RH-B8 — endereçada por B9)
//    Adicionalmente, `ITEM_FATURAMENTO` (D-FATURAMENTO-B8) tambem tem
//    `prefetch: false` — validado a parte pois esta em outros menus.
//
// Estrategia canonica: teste opera sobre `resolveMenuItems('super_admin_global', false)`
// (funcao pura, sem I/O) para garantir que o consumidor real le a
// configuracao correta. Nao mockamos nada.

import { describe, expect, it } from 'vitest';

import { resolveMenuItems, type MenuItem, type MenuLinkItem } from '../../src/lib/menu/menuConfig';

function requireItems(items: readonly MenuItem[] | null, ctx: string): readonly MenuItem[] {
  if (items === null) {
    throw new Error(`resolveMenuItems retornou null em contexto: ${ctx}`);
  }
  return items;
}

function findLinkByLabel(items: readonly MenuItem[], label: string): MenuLinkItem | undefined {
  const found = items.find((i): i is MenuLinkItem => i.type === 'link' && i.label === label);
  return found;
}

describe('ME-080d — MENU_SUPER_ADMIN_GLOBAL (Onda 1e revisão de D2 + Onda 1a D8)', () => {
  const items = requireItems(resolveMenuItems('super_admin_global', false), 'super_admin_global');

  it('Onda 1e — item "Empresas" removido do menu (era duplicado com "Painel")', () => {
    const empresas = findLinkByLabel(items, 'Empresas');
    expect(empresas).toBeUndefined();
  });

  it('Onda 1e — item "Painel" preservado bit-exact', () => {
    const painel = findLinkByLabel(items, 'Painel');
    expect(painel).toBeDefined();
    expect(painel?.href).toBe('/super-admin');
  });

  it('D8 — "Instrumentos (placeholder Fase 1)" declara prefetch: false', () => {
    const item = findLinkByLabel(items, 'Instrumentos (placeholder Fase 1)');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBe(false);
  });

  it('D8 — "Suporte e logs (placeholder Fase 1)" declara prefetch: false', () => {
    const item = findLinkByLabel(items, 'Suporte e logs (placeholder Fase 1)');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBe(false);
  });

  it('D8 — "Gestão de ciclos" declara prefetch: false (D-CYCLE-B8)', () => {
    const item = findLinkByLabel(items, 'Gestão de ciclos');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBe(false);
  });

  it('D8 — "Desbloqueios" declara prefetch: false', () => {
    const item = findLinkByLabel(items, 'Desbloqueios');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBe(false);
  });

  it('D8 — "Meus dados" declara prefetch: false (D-RH-B8)', () => {
    const item = findLinkByLabel(items, 'Meus dados');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBe(false);
  });

  it('D8 — "Notificações" NAO tem prefetch: false (rota /notificacoes existe)', () => {
    const item = findLinkByLabel(items, 'Notificações');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBeUndefined();
  });

  it('D8 — "Painel" NAO tem prefetch: false (rota existente)', () => {
    const item = findLinkByLabel(items, 'Painel');
    expect(item).toBeDefined();
    expect(item?.prefetch).toBeUndefined();
  });
});

describe('ME-080d Onda 1a — ITEM_FATURAMENTO em MENU_RH (D8: D-FATURAMENTO-B8)', () => {
  it('ITEM_FATURAMENTO declara prefetch: false em MENU_RH quando RF=true', () => {
    // Em RH, ITEM_FATURAMENTO so aparece se isResponsavelFinanceiro=true.
    // Faturamento aponta a /faturamento-mensal (D-FATURAMENTO-B8, bloco futuro).
    const rhItems = requireItems(resolveMenuItems('rh', true), 'rh (RF=true)');
    const faturamento = findLinkByLabel(rhItems, 'Faturamento da empresa');
    expect(faturamento).toBeDefined();
    expect(faturamento?.href).toBe('/faturamento-mensal');
    expect(faturamento?.prefetch).toBe(false);
  });
});
