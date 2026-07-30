// ROIP APP 9BOX — Drawer canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.9 (Drawers, modais, pop-ups e toasts —
// entrada Drawer lateral).
//
// Regras canonicas §2.9:
// - "Drawer lateral (Chat IA, Dialogos de desenvolvimento): posicao fixa
//   a direita, largura 54vw (min 360px, max 720px), fundo branco, borda
//   esquerda teal #14B8A6 de 3px, box-shadow lateral."
//
// Superficies canonicas de uso previstas: Chat IA (drawer flutuante,
// DOC 05 §8) e Dialogos de desenvolvimento (drawer §14.x da ME-058). O
// Drawer aqui e agnostico de conteudo — o consumidor passa `header` (ex.:
// titulo + botao [X]) e `children` (corpo scrollavel).
//
// Comportamento canonico §2.9:
// - ESC fecha.
// - Clique fora (no overlay) fecha.
// - Lock do body scroll enquanto aberto (canonico para drawers modais).
//
// Client component: precisa de useEffect para keydown e body lock.

'use client';

import type { JSX, ReactNode } from 'react';
import { useEffect } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

export interface DrawerProps {
  /**
   * Estado aberto do drawer. Controlado pelo consumidor via `useState`.
   */
  readonly open: boolean;
  /**
   * Callback canonico para fechar o drawer — chamado por ESC, clique fora
   * ou botao [X] do header do proprio consumidor.
   */
  readonly onClose: () => void;
  /**
   * Conteudo canonico do drawer. Layout interno (header + corpo
   * scrollavel + rodape) fica sob responsabilidade do consumidor.
   */
  readonly children: ReactNode;
  /**
   * Rotulo ARIA opcional para acessibilidade. Consumidor deve passar um
   * texto descritivo do conteudo do drawer (ex.: "Chat IA", "Dialogos de
   * desenvolvimento").
   */
  readonly ariaLabel?: string;
}

/**
 * Largura canonica §2.9 exportada para consumo em testes bit-exact.
 * Formato canonico "54vw" com clamp entre 360px e 720px.
 */
export const DRAWER_WIDTH_CANONIC = '54vw';
export const DRAWER_MIN_WIDTH_PX = 360;
export const DRAWER_MAX_WIDTH_PX = 720;

/**
 * Cor canonica da borda esquerda §2.9 exportada para testes bit-exact.
 */
export const DRAWER_LEFT_BORDER_COLOR = COLORS.accent.teal; // #14B8A6
export const DRAWER_LEFT_BORDER_WIDTH_PX = 3;

export function Drawer(props: DrawerProps): JSX.Element | null {
  const { open, onClose, children, ariaLabel } = props;

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);

    // Lock canonico do body scroll enquanto o drawer estiver aberto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          position: 'relative',
          width:
            `clamp(${DRAWER_MIN_WIDTH_PX}px, ${DRAWER_WIDTH_CANONIC}, ` +
            `${DRAWER_MAX_WIDTH_PX}px)`,
          height: '100%',
          background: COLORS.background.card,
          borderLeft: `${DRAWER_LEFT_BORDER_WIDTH_PX}px solid ${DRAWER_LEFT_BORDER_COLOR}`,
          boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </aside>
    </div>
  );
}
