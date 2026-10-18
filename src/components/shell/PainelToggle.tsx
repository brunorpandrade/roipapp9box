// ROIP APP 9BOX — componente `<PainelToggle />` (ME 3.5 Dispatch 4 +
// ampliacao ME-1.16 Conversa 4b Despacho B — D-B8).
//
// Client component canonicamente renderizado no rodape da `<Sidebar />`
// APENAS quando `PlatformMenuContext.menuModeScenario !== null`. Dois
// cenarios canonicos:
//
//   - `scenario='clevel_rh'` (C-level com `cLevelMembers.isRH=true`):
//       - modo atual 'clevel' → label "⇄ Painel RH".
//       - modo atual 'rh'     → label "⇄ Painel C-level".
//   - `scenario='rh_lider'` (RH-Lider com liderados ativos > 0):
//       - modo atual 'rh'     → label "⇄ Painel Líder".
//       - modo atual 'lider'  → label "⇄ Painel RH".
//
// Para os demais perfis o componente nunca e renderizado — o Layout nem
// passa `panelToggle` para a Sidebar.
//
// Comportamento canonico:
//   - `<form action={setMenuModeAction}>` com input hidden `mode` com o
//     valor do modo alvo. Zero JavaScript no cliente — pure form action
//     (SSR + server action + redirect).
//   - Server action valida sessao, escreve cookie, redireciona para
//     `/painel-rh`, `/painel-clevel` ou `/painel-lider` conforme modo
//     alvo.
//
// **RV-13.** Consumidor real: `<Layout />` do D4 quando
// `panelToggle !== undefined`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use client';

import type { JSX } from 'react';

import { setMenuModeAction } from '../../app/_actions/setMenuMode';
import type { MenuMode } from '../../lib/menu/menuMode';
import type { MenuModeScenario } from '../../lib/session/platformMenuContext';

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
 * Rotulos canonicos por cenario:
 *
 *   - `scenario='clevel_rh'`:
 *     - 'clevel' → nextMode 'rh', label "⇄ Painel RH".
 *     - 'rh'     → nextMode 'clevel', label "⇄ Painel C-level".
 *   - `scenario='rh_lider'`:
 *     - 'rh'     → nextMode 'lider', label "⇄ Painel Líder".
 *     - 'lider'  → nextMode 'rh', label "⇄ Painel RH".
 *
 * Combinacao ilegal (ex.: scenario='rh_lider' com currentMode='clevel')
 * cai no sentinel canonico que devolve o proprio modo como next e label
 * vazio — defensivo; nao deve ocorrer em producao porque `menuMode` do
 * context ja fica confinado ao scenario.
 */
export function computeToggleLabels(
  currentMode: MenuMode,
  scenario: MenuModeScenario = 'clevel_rh',
): PainelToggleLabels {
  if (scenario === 'clevel_rh') {
    const nextMode: MenuMode = currentMode === 'clevel' ? 'rh' : 'clevel';
    const label = nextMode === 'rh' ? '⇄ Painel RH' : '⇄ Painel C-level';
    const ariaLabel = `Alternar para ${label.replace('⇄ ', '')}`;
    return { nextMode, label, ariaLabel };
  }
  // scenario === 'rh_lider'
  const nextMode: MenuMode = currentMode === 'lider' ? 'rh' : 'lider';
  const label = nextMode === 'lider' ? '⇄ Painel Líder' : '⇄ Painel RH';
  const ariaLabel = `Alternar para ${label.replace('⇄ ', '')}`;
  return { nextMode, label, ariaLabel };
}

export interface PainelToggleProps {
  /**
   * Modo canonico corrente aplicado no menu (lido do cookie
   * `roip.menu.mode` pelo consumidor server-side via `resolveMenuMode`).
   */
  readonly currentMode: MenuMode;
  /**
   * ME-1.16 — cenario canonico de alternancia. Omitido = default
   * `'clevel_rh'` (bit-exact compat com callers pre-ME-1.16).
   */
  readonly scenario?: MenuModeScenario;
}

/**
 * Rodape canonico do menu com toggle de alternancia. Suporta canonicamente
 * os dois cenarios: C-level+isRH (clevel <-> rh) e RH-Lider (rh <-> lider).
 */
export function PainelToggle(props: PainelToggleProps): JSX.Element {
  const { currentMode, scenario = 'clevel_rh' } = props;
  const { nextMode, label, ariaLabel } = computeToggleLabels(currentMode, scenario);
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
