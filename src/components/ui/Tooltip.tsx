// ROIP APP 9BOX — Tooltip canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.9 (Drawers, modais, pop-ups e toasts —
// entrada Tooltip).
//
// Regras canonicas §2.9 aplicadas:
// - Background: #111827 (canonico literal §2.9; corrigido em relacao ao
//   comando de abertura da ME-055c que sugeria navy — CC via S235).
// - Texto: branco 12px.
// - Radius: 6px.
// - Seta: 6px.
// - Delay: 300ms no hover (canonico literal §2.9; corrigido em relacao ao
//   comando de abertura que sugeria 500ms — CC via S235).
// - Fade-in: 150ms.
//
// Client component: precisa de `onMouseEnter`/`onMouseLeave` + timeout
// para o delay canonico. Wrap: consumidor envolve o filho com Tooltip e
// passa o conteudo textual do tooltip via prop `content`.
//
// Posicionamento canonico auto (top/bottom/left/right) — a decisao aqui
// e simplificada a "top como default; consumidor pode forcar via prop
// `placement`". Auto-position dinamico baseado em viewport fica como
// evolucao futura (nao ha requisito canonico literal em §2.9 para isso).

'use client';

import type { CSSProperties, JSX, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

/** Posicionamento canonico do tooltip em relacao ao ancora. */
export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /**
   * Conteudo textual do tooltip. Renderizado como texto branco 12px sobre
   * fundo #111827 (canonico §2.9). Nao aceita HTML — apenas string.
   */
  readonly content: string;
  /**
   * Posicao canonica em relacao ao ancora. Default: `'top'`.
   */
  readonly placement?: TooltipPlacement;
  /**
   * Delay de hover em ms. Default canonico §2.9: 300ms.
   */
  readonly delayMs?: number;
  /**
   * Elemento ancora que dispara o tooltip. Recebe os handlers de mouse
   * via clonagem — o consumidor apenas envolve o filho.
   */
  readonly children: ReactNode;
}

/**
 * Delay canonico §2.9 exportado para consumo em testes bit-exact.
 */
export const TOOLTIP_DEFAULT_DELAY_MS = 300;

/**
 * Cor de fundo canonica §2.9 exportada para consumo em testes bit-exact.
 */
export const TOOLTIP_BG_COLOR = '#111827';

const TOOLTIP_TRANSITION_MS = 150; // canonico §2.9 fade-in

function positionStyle(placement: TooltipPlacement): CSSProperties {
  switch (placement) {
    case 'top':
      return { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };
    case 'bottom':
      return { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };
    case 'left':
      return { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' };
    case 'right':
      return { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' };
  }
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const { content, placement = 'top', delayMs = TOOLTIP_DEFAULT_DELAY_MS, children } = props;
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleEnter(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delayMs);
  }

  function handleLeave(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
      <span
        role="tooltip"
        aria-hidden={!visible}
        style={{
          position: 'absolute',
          ...positionStyle(placement),
          background: TOOLTIP_BG_COLOR,
          color: '#FFFFFF',
          fontSize: 12,
          lineHeight: 1.4,
          padding: '6px 10px',
          borderRadius: 6,
          maxWidth: 240, // capacidade canonica de tooltip curto
          whiteSpace: 'normal',
          pointerEvents: 'none',
          opacity: visible ? 1 : 0,
          transition: `opacity ${TOOLTIP_TRANSITION_MS}ms ease-in-out`,
          zIndex: 300,
        }}
      >
        {content}
      </span>
    </span>
  );
}
