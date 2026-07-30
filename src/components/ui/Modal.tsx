// ROIP APP 9BOX — Modal canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.9 (Drawers, modais, pop-ups e toasts).
//
// Regras canonicas §2.9 aplicadas — 5 variantes canonicas (Opcao A
// aprovada em N7/S226):
//
// - `'centered'`: overlay rgba(0,0,0,0.5), z-index 100, container
//   centralizado com radius 12px. Largura definida pelo consumidor.
// - `'confirmation'`: largura 420px, titulo 16px semibold, corpo 13px
//   #374151, rodape com botoes alinhados a direita. ESC fecha equivalente
//   a [Cancelar]; clique fora fecha equivalente a [Cancelar].
// - `'blocking'`: modal obrigatorio. ESC e clique fora NAO fecham — o
//   usuario precisa clicar em [Entendi] ou botao unico de saida. Usado
//   pelo gate LGPD termo v1.0 (portal §6.2) e pelo modal pre-questionario
//   Radar NR-1 (§7.4).
// - `'popup80'`: pop-up 80%. Overlay rgba(0,0,0,0.55), z-index 200,
//   container 80vw x 80vh (min 900x640, max 1080x800), radius 14px. Usado
//   pelo relatorio do Perfil Individual (§9), Diagnostico IA (§10) e Chat
//   IA (§8).
// - `'fullscreenMobile'`: variante responsiva (breakpoint <1024px
//   conforme §19). Fullscreen no mobile; renderiza como centered no
//   desktop.
//
// Persistencia canonica: `MODAL_VARIANT_SPECS` exportado como fonte da
// verdade dos valores canonicos (largura, altura, radius, overlay,
// z-index, canCloseOnEsc, canCloseOnOverlay). Este mapa e o alvo da prova
// RV-03 dirigida desta ME (M2/S201): qualquer alteracao de valor bate no
// teste `tests/unit/modalVariants.test.ts`.

'use client';

import type { CSSProperties, JSX, ReactNode } from 'react';
import { useEffect } from 'react';

/** Variantes canonicas §2.9 do Modal. 5 valores. */
export type ModalVariant =
  'centered' | 'confirmation' | 'blocking' | 'popup80' | 'fullscreenMobile';

/**
 * Especificacoes canonicas §2.9 bit-exact por variante. Alvo canonico da
 * prova RV-03 dirigida desta ME (M2/S201). Alterar qualquer valor aqui
 * reprova o teste `tests/unit/modalVariants.test.ts`.
 */
export interface ModalVariantSpec {
  /** Largura fixa em px, ou `'auto'` quando o consumidor define. */
  readonly width: number | 'auto';
  /** Altura fixa ou `'auto'`. */
  readonly height: number | 'auto';
  /** Largura minima em px (apenas para popup80). */
  readonly minWidth?: number;
  /** Altura minima em px (apenas para popup80). */
  readonly minHeight?: number;
  /** Largura maxima em px (apenas para popup80). */
  readonly maxWidth?: number;
  /** Altura maxima em px (apenas para popup80). */
  readonly maxHeight?: number;
  /** Radius canonico em px. */
  readonly radius: number;
  /** Cor canonica do overlay (rgba). */
  readonly overlay: string;
  /** z-index canonico. */
  readonly zIndex: number;
  /** ESC fecha? Regra canonica §2.9. */
  readonly canCloseOnEsc: boolean;
  /** Clique fora fecha? Regra canonica §2.9. */
  readonly canCloseOnOverlay: boolean;
}

export const MODAL_VARIANT_SPECS: Readonly<Record<ModalVariant, ModalVariantSpec>> = {
  centered: {
    width: 'auto',
    height: 'auto',
    radius: 12,
    overlay: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    canCloseOnEsc: true,
    canCloseOnOverlay: true,
  },
  confirmation: {
    width: 420,
    height: 'auto',
    radius: 12,
    overlay: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    canCloseOnEsc: true,
    canCloseOnOverlay: true,
  },
  blocking: {
    width: 'auto',
    height: 'auto',
    radius: 12,
    overlay: 'rgba(0,0,0,0.6)',
    zIndex: 150,
    canCloseOnEsc: false,
    canCloseOnOverlay: false,
  },
  popup80: {
    width: 'auto', // controlado por 80vw + clamp min/max
    height: 'auto', // controlado por 80vh + clamp min/max
    minWidth: 900,
    minHeight: 640,
    maxWidth: 1080,
    maxHeight: 800,
    radius: 14,
    overlay: 'rgba(0,0,0,0.55)',
    zIndex: 200,
    canCloseOnEsc: true,
    canCloseOnOverlay: true,
  },
  fullscreenMobile: {
    width: 'auto',
    height: 'auto',
    radius: 12,
    overlay: 'rgba(0,0,0,0.5)',
    zIndex: 100,
    canCloseOnEsc: true,
    canCloseOnOverlay: true,
  },
};

export interface ModalProps {
  /**
   * Estado aberto do modal. Controlado pelo consumidor via `useState`.
   */
  readonly open: boolean;
  /**
   * Callback canonico para fechar o modal. Chamado por ESC (quando
   * `canCloseOnEsc`), clique no overlay (quando `canCloseOnOverlay`) ou
   * pelos botoes internos do proprio consumidor.
   */
  readonly onClose: () => void;
  /**
   * Variante canonica §2.9. Determina largura, radius, overlay, z-index e
   * comportamento de fechamento.
   */
  readonly variant: ModalVariant;
  /**
   * Conteudo canonico do modal — layout interno fica sob responsabilidade
   * do consumidor. Para variante `'confirmation'`, o padrao esperado e
   * titulo 16px semibold + corpo 13px #374151 + rodape com botoes.
   */
  readonly children: ReactNode;
  /**
   * Rotulo ARIA para acessibilidade. Consumidor deve passar descricao do
   * modal (ex.: "Confirmar exclusao", "Termo LGPD").
   */
  readonly ariaLabel?: string;
}

function containerStyleForVariant(variant: ModalVariant): CSSProperties {
  const spec = MODAL_VARIANT_SPECS[variant];
  const base: CSSProperties = {
    background: '#FFFFFF',
    borderRadius: spec.radius,
    boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
    overflow: 'hidden',
  };

  if (variant === 'popup80') {
    return {
      ...base,
      width: '80vw',
      height: '80vh',
      minWidth: `${spec.minWidth ?? 900}px`,
      minHeight: `${spec.minHeight ?? 640}px`,
      maxWidth: `${spec.maxWidth ?? 1080}px`,
      maxHeight: `${spec.maxHeight ?? 800}px`,
    };
  }

  if (variant === 'confirmation') {
    return { ...base, width: `${spec.width as number}px` };
  }

  if (variant === 'fullscreenMobile') {
    // Fullscreen no mobile (< 1024px §19) — controlado por media query
    // via style ternario. Aqui aplicamos comportamento base "centered" no
    // desktop; o consumidor mobile envolve com wrapper responsivo se
    // precisar de fullscreen 100vw x 100vh (fora do escopo canonico do
    // componente Modal em si — e responsabilidade do container por perfil).
    return { ...base };
  }

  // 'centered' e 'blocking' — largura definida pelo consumidor.
  return { ...base };
}

export function Modal(props: ModalProps): JSX.Element | null {
  const { open, onClose, variant, children, ariaLabel } = props;
  const spec = MODAL_VARIANT_SPECS[variant];

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && spec.canCloseOnEsc) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);

    // Lock canonico do body scroll enquanto o modal estiver aberto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, spec.canCloseOnEsc]);

  if (!open) return null;

  function handleOverlayClick(): void {
    if (spec.canCloseOnOverlay) {
      onClose();
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: spec.zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        aria-hidden="true"
        onClick={handleOverlayClick}
        style={{
          position: 'absolute',
          inset: 0,
          background: spec.overlay,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', ...containerStyleForVariant(variant) }}
      >
        {children}
      </div>
    </div>
  );
}
