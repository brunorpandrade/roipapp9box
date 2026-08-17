'use client';

// ROIP APP 9BOX — Sidebar canonico (ME-055 Bloco B; ME-056 Bloco E).
//
// Origem canonica: DOC 05 §3 (estrutura comum a todos os menus).
//
// Estrutura canonica §3:
// - Sidebar navy `#1F3A5F`, largura 256px, altura total da viewport, fixa.
// - Logo ROIP APP no topo (48px altura, padding 16px).
// - Item ativo: background teal `#14B8A6`, texto branco, borda esquerda
//   branca de 4px.
// - Item inativo: texto branco com opacity 0.8, icone 18px, label 14px.
// - Hover: background `rgba(255, 255, 255, 0.1)`.
// - Separador: divider branco com opacity 0.15, margem vertical 8px.
// - Item "Sair" no rodape fixo.
//
// Perfil-agnostic (D2): recebe `items` (ja resolvido por `resolveMenuItems`
// no consumidor — Layout). Nao consulta sessao, nao conhece ProfileKey,
// nao aplica filtros condicionais.
//
// ME-056 Bloco E: `activeHref` opcional. Quando ausente, o Sidebar
// resolve o pathname corrente via `usePathname()` (client component). O
// prop explicito continua suportado por consumidores que querem forcar
// um `activeHref` (testes, snapshots pre-hidratacao, cenarios sem
// pathname). Refactor minimo: `'use client'` no topo do arquivo, hook
// consumido apenas quando `activeHref === undefined`; comparacao por
// igualdade exata preservada.
//
// Renderizacao canonica do item "Sair": o ultimo item de cada
// configuracao §3.1-§3.10 e sempre "Sair" (verificado por
// `menuConfig.test.ts`). Neste componente o Sidebar destaca visualmente o
// item "Sair" fixando-o ao rodape (`marginTop: auto`), preservando a
// ordem canonica na lista principal.

import { ArrowLeft as ArrowLeftIcon } from 'lucide-react';
import type { JSX } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LUCIDE_ICON_BY_MENU_ITEM } from '../../lib/design-tokens/icons';
import type { MenuItem } from '../../lib/menu/menuConfig';

const SIDEBAR_NAVY = '#1F3A5F';
const ACTIVE_TEAL = '#14B8A6';
const INACTIVE_TEXT_OPACITY = 0.8;
const HOVER_BG = 'rgba(255, 255, 255, 0.1)';
const DIVIDER_BG = 'rgba(255, 255, 255, 0.15)';

export interface SidebarProps {
  /**
   * Lista de itens do menu ja resolvida por `resolveMenuItems` no
   * consumidor. Inclui separadores e itens condicionais filtrados
   * conforme `isResponsavelFinanceiro`.
   */
  readonly items: readonly MenuItem[];
  /**
   * `href` do item de menu atualmente ativo. Determina qual item recebe
   * o destaque teal + borda esquerda branca 4px (§3 estrutura comum).
   * Comparacao por igualdade exata; em caso de multiplos itens com o
   * mesmo `href` (nao ocorre canonicamente), apenas o primeiro sera
   * destacado.
   *
   * ME-056 Bloco E: opcional. Quando ausente (`undefined`), o
   * componente resolve via `usePathname()` — o pathname corrente do
   * App Router. Consumidores tipicos (server components de painel)
   * passam nada; consumidores que precisam de override explicito
   * (testes, snapshots) passam string literal.
   */
  readonly activeHref?: string;
}

function isSairItem(item: MenuItem): boolean {
  return item.type === 'link' && item.label === 'Sair';
}

export function Sidebar(props: SidebarProps): JSX.Element {
  const { items } = props;
  const pathname = usePathname();
  // Fallback canonico ME-056 Bloco E: pathname corrente quando o
  // consumidor nao forca. String vazia quando nem prop nem hook
  // devolvem valor (cenario impossivel no App Router, mas defense-
  // in-depth para SSG e testes sem router mockado).
  const activeHref = props.activeHref ?? pathname ?? '';

  // Separa canonicamente o item "Sair" para o rodape fixo (§3).
  const mainItems = items.filter((item) => !isSairItem(item));
  const sairItem = items.find(isSairItem);

  return (
    <aside
      aria-label="Menu de navegação principal"
      style={{
        width: 256,
        minWidth: 256,
        height: '100vh',
        position: 'sticky',
        top: 0,
        background: SIDEBAR_NAVY,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Logo ROIP APP §3: 48px altura, padding 16px. */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          // ME-080d Onda 1e — centralizar horizontalmente. Antes era
          // `flex-start` (alinhado a esquerda), o que deixava a logo
          // colada na borda esquerda com espaco vazio a direita.
          justifyContent: 'center',
        }}
      >
        <Image
          src="/brand/roipeople-horizontal.png"
          alt="ROIPeople"
          width={133}
          height={48}
          priority
          style={{ height: 48, width: 'auto' }}
        />
      </div>

      <nav
        aria-label="Itens de menu"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '4px 8px 8px',
          gap: 2,
        }}
      >
        {mainItems.map((item, index) => (
          <SidebarItemRow
            key={item.type === 'link' ? `${item.label}-${item.href}` : `sep-${index}`}
            item={item}
            activeHref={activeHref}
          />
        ))}
      </nav>

      {sairItem !== undefined && sairItem.type === 'link' ? (
        <div
          style={{
            padding: 8,
            borderTop: `1px solid ${DIVIDER_BG}`,
          }}
        >
          <SidebarItemRow item={sairItem} activeHref={activeHref} />
        </div>
      ) : null}
    </aside>
  );
}

function SidebarItemRow(props: {
  readonly item: MenuItem;
  readonly activeHref: string;
}): JSX.Element {
  const { item, activeHref } = props;

  if (item.type === 'separator') {
    return (
      <hr
        aria-hidden="true"
        style={{
          height: 1,
          margin: '8px 4px',
          border: 'none',
          background: DIVIDER_BG,
        }}
      />
    );
  }

  const Icon = LUCIDE_ICON_BY_MENU_ITEM[item.iconKey];
  const isActive = item.href === activeHref;

  return (
    <>
      <Link
        href={item.href}
        // ME-080d Onda 1a — respeita `prefetch: false` explicito declarado
        // no MenuLinkItem (D8: suprime prefetch RSC 404 para rotas ainda
        // nao implementadas). Mantem `false` para /logout (comportamento
        // canonico pre-existente).
        prefetch={item.href === '/logout' || item.prefetch === false ? false : undefined}
        aria-current={isActive ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 500,
          color: '#FFFFFF',
          textDecoration: 'none',
          opacity: isActive ? 1 : INACTIVE_TEXT_OPACITY,
          background: isActive ? ACTIVE_TEAL : 'transparent',
          borderLeft: isActive ? '4px solid #FFFFFF' : '4px solid transparent',
          paddingLeft: isActive ? 8 : 12,
          transition: 'background 120ms ease-in-out',
        }}
        // Estados hover/focus canonicos §3 sao herdados de estilos globais
        // no `globals.css`; inline styles aqui garantem o estado ativo
        // bit-exact independentemente do CSS externo.
        data-active={isActive ? 'true' : 'false'}
        data-hover-bg={HOVER_BG}
      >
        {item.showBackArrow === true ? (
          <ArrowLeftIcon size={16} strokeWidth={2} aria-hidden="true" />
        ) : null}
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
      </Link>
      {item.children !== undefined && item.children.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '2px 0 2px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {item.children.map((child) => {
            const ChildIcon = LUCIDE_ICON_BY_MENU_ITEM[child.iconKey];
            const childActive = child.href === activeHref;
            return (
              <li key={`${child.label}-${child.href}`}>
                <Link
                  href={child.href}
                  // ME-080d Onda 1a — mesmo tratamento canonico do item raiz.
                  prefetch={
                    child.href === '/logout' || child.prefetch === false ? false : undefined
                  }
                  aria-current={childActive ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 400,
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    opacity: childActive ? 1 : INACTIVE_TEXT_OPACITY,
                    background: childActive ? ACTIVE_TEAL : 'transparent',
                  }}
                >
                  <ChildIcon size={16} strokeWidth={2} aria-hidden="true" />
                  <span>{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
