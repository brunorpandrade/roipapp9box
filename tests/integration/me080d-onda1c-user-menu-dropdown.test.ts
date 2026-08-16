// ROIP APP 9BOX — teste de integração ME-080d Onda 1c.
//
// Cobre bit-exact o `UserMenuDropdown` client component criado
// para dar acao ao nome do usuario no Header (antes um <span> inerte).
//
// Estrategia canonica: como o componente e client-side ('use client')
// com useState/useEffect/useRef, evitamos render via jsdom (fora do
// stack canonico). Testamos:
//
// 1. `USER_MENU_ITEMS` bit-exact aos canonicos (Meus dados + Alterar
//    senha + Sair, na ordem canonica UX consolidada).
// 2. Rotas apontam para as hrefs canonicas do menuConfig.
// 3. `prefetch: false` em `/meus-dados` (D-RH-B8) e `/logout`
//    (comportamento canonico pre-existente).
// 4. `/alterar-senha` NAO tem prefetch: false (rota existente).
// 5. Smoke: componente exportado e importavel.

import { describe, expect, it } from 'vitest';

import { UserMenuDropdown, USER_MENU_ITEMS } from '../../src/components/shell/UserMenuDropdown';

describe('ME-080d Onda 1c — UserMenuDropdown (D8: dropdown do nome no header)', () => {
  it('USER_MENU_ITEMS tem exatamente 3 itens na ordem canonica', () => {
    expect(USER_MENU_ITEMS).toHaveLength(3);
    expect(USER_MENU_ITEMS[0]?.label).toBe('Meus dados');
    expect(USER_MENU_ITEMS[1]?.label).toBe('Alterar senha');
    expect(USER_MENU_ITEMS[2]?.label).toBe('Sair');
  });

  it('hrefs bit-exact ao menuConfig canonico', () => {
    expect(USER_MENU_ITEMS[0]?.href).toBe('/meus-dados');
    expect(USER_MENU_ITEMS[1]?.href).toBe('/alterar-senha');
    expect(USER_MENU_ITEMS[2]?.href).toBe('/logout');
  });

  it('prefetch: false em /meus-dados (D-RH-B8) e /logout (canonico)', () => {
    expect(USER_MENU_ITEMS[0]?.prefetch).toBe(false);
    expect(USER_MENU_ITEMS[2]?.prefetch).toBe(false);
  });

  it('prefetch NAO e false em /alterar-senha (rota existente)', () => {
    expect(USER_MENU_ITEMS[1]?.prefetch).toBeUndefined();
  });

  it('UserMenuDropdown exportado e importavel', () => {
    expect(UserMenuDropdown).toBeDefined();
    expect(typeof UserMenuDropdown).toBe('function');
  });
});
