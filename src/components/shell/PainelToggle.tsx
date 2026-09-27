// ROIP APP 9BOX — componente `<PainelToggle />` (ME 3.5 Dispatch 4).
//
// Client component canonicamente renderizado no rodape da `<Sidebar />`
// APENAS quando `PlatformMenuContext.canToggleMenuMode === true` (C-level
// com `cLevelMembers.isRH === true`). Para todos os demais perfis o
// componente nunca e renderizado — o Layout nem passa `panelToggle` para
// a Sidebar.
//
// Estado visual canonico (D3 aprovado em bloco):
//   - modo atual 'clevel' → label "⇄ Painel RH" (alterna para o outro).
//   - modo atual 'rh'     → label "⇄ Painel C-level".
//
// Comportamento canonico:
//   - `<form action={setMenuModeAction}>` com input hidden `mode` com o
//     valor do modo alvo. Zero JavaScript no cliente — pure form action
//     (SSR + server action + redirect).
//   - Server action valida sessao, escreve cookie, redireciona para
//     `/painel-rh` ou `/painel-clevel` conforme modo alvo.
//
// **RV-13.** Consumidor real: `<Layout />` do D4 quando
// `panelToggle !== undefined`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use client';

import type { JSX } from 'react';

import { setMenuModeAction } from '../../app/_actions/setMenuMode';
import type { MenuMode } from '../../lib/menu/menuMode';

const TOGGLE_BORDER = 'rgba(255, 255, 255, 0.25)';
const TOGGLE_HOVER_BG = 'rgba(255, 255, 255, 0.08)';
const TOGGLE_TEXT_COLOR = 'rgba(255, 255, 255, 0.9)';

/** Resultado canonico da decisao de rotulo do toggle (RV-13 — testado). */
export interface PainelToggleLabels {
  readonly nextMode: MenuMode;
  readonly label: string;
  readonly ariaLabel: string;
}

/**
 * Funcao pura canonica de decisao dos rotulos do toggle. Extraida do
 * componente para permitir teste unit direto (sem renderizar client
 * component nem invocar server action).
 *
 * Rotulos canonicos:
 *   - modo atual 'clevel' → alterna para 'rh'; label "⇄ Painel RH".
 *   - modo atual 'rh'     → alterna para 'clevel'; label "⇄ Painel C-level".
 */
export function computeToggleLabels(currentMode: MenuMode): PainelToggleLabels {
  const nextMode: MenuMode = currentMode === 'clevel' ? 'rh' : 'clevel';
  const label = nextMode === 'rh' ? '⇄ Painel RH' : '⇄ Painel C-level';
  const ariaLabel = `Alternar para ${label.replace('⇄ ', '')}`;
  return { nextMode, label, ariaLabel };
}

export interface PainelToggleProps {
  /**
   * Modo canonico corrente aplicado no menu (lido do cookie
   * `roip.menu.mode` pelo consumidor server-side via `resolveMenuMode`).
   */
  readonly currentMode: MenuMode;
}

/**
 * Rodape canonico do menu do C-level com isRH. Alterna entre "Painel
 * C-level" e "Painel RH" via server action + cookie + redirect.
 */
export function PainelToggle(props: PainelToggleProps): JSX.Element {
  const { currentMode } = props;
  const { nextMode, label, ariaLabel } = computeToggleLabels(currentMode);
  return (
    <form action={setMenuModeAction} style={{ display: 'block' }}>
      <input type="hidden" name="mode" value={nextMode} />
      <button
        type="submit"
        aria-label={ariaLabel}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          color: TOGGLE_TEXT_COLOR,
          border: `1px solid ${TOGGLE_BORDER}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          textAlign: 'left',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = TOGGLE_HOVER_BG;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {label}
      </button>
    </form>
  );
}
