// ROIP APP 9BOX — UserMenuDropdown (ME-080d Onda 1c).
//
// Origem canonica: DOC 05 §4 (Header) + DOC 05 §9.6 (Alterar senha) +
// itens transversais canonicos `ITEM_MEUS_DADOS`, `ITEM_ALTERAR_SENHA`,
// `ITEM_SAIR` de `menuConfig.ts`.
//
// Correcao canonica desta ME:
// ---------------------------
// Ate ME-080d validacao e2e por Bruno, o nome do usuario ao lado do
// avatar no Header era um `<span>` inerte (nao clicavel). Existia
// somente o botao `[Sair]` como acao canonica. Padrao web app
// consolidado (Gmail, Notion, GitHub, Linear, etc) coloca ali um
// dropdown de perfil com Meus dados + Alterar senha + Sair.
//
// D8 canonica: dropdown contem 3 itens canonicos:
//   1. Meus dados      → `/meus-dados`
//   2. Alterar senha   → `/alterar-senha`
//   3. Sair            → `/logout`
//
// Nota tecnica sobre /meus-dados: rota ainda nao implementada (debito
// D-RH-B8, endereçada por B9). O `prefetch={false}` inline aqui
// suprime o prefetch RSC 404 desnecessario, alinhado com a estrategia
// canonica do menuConfig.ts para outros itens placeholder.
//
// Chamador exclusivo: `src/components/shell/Header.tsx` (server
// component pai — este componente e client-only por precisar de
// useState + useEffect + useRef para gerir aberto/fechado + click-outside).

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

/**
 * Iniciais canonicas (§2.10 DOC 05) — helper duplicado localmente para
 * manter este componente auto-suficiente sem acoplamento circular com
 * o `Header.tsx` que ja o define. Espelha bit-exact a mesma logica.
 */
function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    const p = parts[0] ?? '';
    return p.slice(0, 2).toUpperCase();
  }
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/**
 * Itens canonicos do dropdown (rotas + labels bit-exact do menuConfig).
 */
export const USER_MENU_ITEMS = [
  { label: 'Meus dados', href: '/meus-dados', prefetch: false as const },
  { label: 'Alterar senha', href: '/alterar-senha', prefetch: undefined },
  { label: 'Sair', href: '/logout', prefetch: false as const },
] as const;

const TRIGGER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'transparent',
  border: 'none',
  padding: '4px 8px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 120ms ease-in-out',
};

const AVATAR_STYLE: CSSProperties = {
  display: 'inline-flex',
  width: 32,
  height: 32,
  borderRadius: 9999,
  background: COLORS.background.elevated,
  border: `1px solid ${COLORS.border.default}`,
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.text.secondary,
};

const NAME_STYLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.text.primary,
};

const DROPDOWN_STYLE: CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 8,
  minWidth: 200,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: 4,
  zIndex: 100,
};

const ITEM_STYLE: CSSProperties = {
  display: 'block',
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.text.primary,
  textDecoration: 'none',
  borderRadius: 6,
  transition: 'background 120ms ease-in-out',
};

/**
 * Dropdown de perfil canonico do Header.
 *
 * Comportamento:
 * - Clique no trigger (avatar + nome) abre/fecha o menu.
 * - Clique fora do dropdown (via listener `mousedown` no document) fecha.
 * - `Escape` fecha o dropdown.
 * - Cada item usa `<Link>` — clique navega e o Next fecha a rota
 *   corrente naturalmente (nao precisamos fechar manual apos click).
 *
 * Notas tecnicas:
 * - `containerRef` cobre trigger + dropdown para o click-outside
 *   nao disparar quando o proprio menu e clicado.
 * - `useEffect` de listener e adicionado somente enquanto `open === true`
 *   — evita listener global permanente em cada render.
 */
export function UserMenuDropdown(props: {
  readonly displayName: string;
  readonly avatarUrl?: string;
}): JSX.Element {
  const { displayName, avatarUrl } = props;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(evt: MouseEvent): void {
      if (containerRef.current === null) return;
      if (!containerRef.current.contains(evt.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(evt: KeyboardEvent): void {
      if (evt.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      data-testid="user-menu-dropdown-container"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu do usuário ${displayName}`}
        data-testid="user-menu-dropdown-trigger"
        style={TRIGGER_STYLE}
      >
        {avatarUrl !== undefined && avatarUrl !== '' ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={32}
            height={32}
            style={{ width: 32, height: 32, borderRadius: 9999, objectFit: 'cover' }}
          />
        ) : (
          <span aria-hidden="true" style={AVATAR_STYLE}>
            {initialsFromName(displayName)}
          </span>
        )}
        <span style={NAME_STYLE}>{displayName}</span>
      </button>

      {open ? (
        <div role="menu" style={DROPDOWN_STYLE} data-testid="user-menu-dropdown-panel">
          {USER_MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.prefetch === false ? false : undefined}
              role="menuitem"
              onClick={close}
              style={ITEM_STYLE}
              data-testid={`user-menu-dropdown-item-${item.href.replace(/\//g, '-')}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
