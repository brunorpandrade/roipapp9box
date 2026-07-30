// ROIP APP 9BOX — Banner canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.9 (Drawers, modais, pop-ups e toasts —
// entrada Banner topo).
//
// Regras canonicas §2.9:
// - "Banner topo: faixa larga acima do card ou tela, com icone a esquerda +
//   texto + botao opcional a direita. Cores conforme severidade
//   (ambar/vermelho/verde)."
//
// Severidades canonicas §2.9: 3 (success/verde, warning/ambar, danger/
// vermelho). O comando de abertura da ME-055c sugeria 4 incluindo "info",
// mas §2.9 nao define info para banner — correcao canonica S235 aplicada.
//
// Client component: precisa de `useState` para o comportamento dismissivel.
// Consumidor opcionalmente conecta persistencia via localStorage nas MEs
// futuras (ME-058) — nao ha requisito canonico literal para persistir por
// default, entao mantemos apenas o estado in-memory nesta ME.
//
// Cores canonicas por severidade §2.9 (mesmo mapa canonico dos toasts):
// - Verde: bg #DCFCE7, texto #15803D, borda #16A34A
// - Ambar: bg #FEF3C7, texto #92400E, borda #D97706
// - Vermelho: bg #FEE2E2, texto #991B1B, borda #DC2626

'use client';

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

/** Severidades canonicas §2.9 do Banner. 3 valores. Sem 'info'. */
export type BannerSeverity = 'success' | 'warning' | 'danger';

export interface BannerProps {
  /**
   * Severidade canonica §2.9 — determina cores de fundo, texto e borda.
   */
  readonly severity: BannerSeverity;
  /**
   * Conteudo textual do banner. String simples (padrao) ou React node
   * quando precisar de inline styles no texto.
   */
  readonly children: ReactNode;
  /**
   * Habilita botao [X] canonico a direita para dispensar o banner.
   * Default: `true`. Consumidor pode desabilitar via `dismissible={false}`
   * quando o banner e informativo persistente (ex.: aviso amarelo §13.5
   * empresa sem Responsavel financeiro).
   */
  readonly dismissible?: boolean;
  /**
   * Callback opcional quando o banner e dispensado — util para persistir
   * o estado no consumidor (ex.: localStorage) sem acoplar o Banner ao
   * mecanismo de armazenamento.
   */
  readonly onDismiss?: () => void;
  /**
   * Icone opcional canonico a esquerda §2.9. Consumidor passa qualquer
   * ReactNode (ex.: `<AlertTriangle size={16} />`). Ausente cai em uma
   * bolinha colorida canonica pela severidade.
   */
  readonly icon?: ReactNode;
}

/** Mapa canonico de cores §2.9 exportado para consumo em testes. */
export const BANNER_COLORS_BY_SEVERITY: Readonly<
  Record<BannerSeverity, { readonly bg: string; readonly text: string; readonly border: string }>
> = {
  success: {
    bg: COLORS.badge.successBg, // #DCFCE7 §2.9
    text: COLORS.badge.successText, // #15803D §2.9
    border: COLORS.semantic.success, // #16A34A §2.9
  },
  warning: {
    bg: COLORS.badge.warningBg, // #FEF3C7 §2.9
    text: COLORS.badge.warningText, // #92400E §2.9
    border: COLORS.semantic.warning, // #D97706 §2.9
  },
  danger: {
    bg: COLORS.badge.dangerBg, // #FEE2E2 §2.9
    text: COLORS.badge.dangerText, // #991B1B §2.9
    border: COLORS.semantic.danger, // #DC2626 §2.9
  },
};

export function Banner(props: BannerProps): JSX.Element | null {
  const { severity, children, dismissible = true, onDismiss, icon } = props;
  const [dismissed, setDismissed] = useState(false);
  const palette = BANNER_COLORS_BY_SEVERITY[severity];

  if (dismissed) {
    return null;
  }

  function handleDismiss(): void {
    setDismissed(true);
    if (onDismiss !== undefined) {
      onDismiss();
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: palette.bg,
        color: palette.text,
        borderLeft: `4px solid ${palette.border}`,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {icon !== undefined ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
          {icon}
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: palette.border,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {dismissible ? (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dispensar aviso"
          style={{
            border: 'none',
            background: 'transparent',
            color: palette.text,
            cursor: 'pointer',
            padding: 4,
            fontSize: 16,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {'\u00D7'}
        </button>
      ) : null}
    </div>
  );
}
