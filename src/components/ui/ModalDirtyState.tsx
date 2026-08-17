// ROIP APP 9BOX — ModalDirtyState canonico (ME-082).
//
// Origem canonica: DOC 02 §4.10 (Modal dirty state canonico).
//
// Comportamento canonico bit-exact §4.10:
//   - Titulo literal: "Descartar alteracoes?" (com cedilha e til).
//   - Corpo literal: "Voce tem dados nao salvos. Se sair agora, as
//     alteracoes serao perdidas."
//   - Botao outline: "Continuar editando" (fecha modal, retorna a
//     tela).
//   - Botao vermelho: "Descartar" (chama callback onDiscard).
//   - ESC fecha modal = [Continuar editando] (comportamento canonico
//     do Modal 'confirmation' — canCloseOnEsc: true).
//   - Clique fora do modal fecha = [Continuar editando] (idem).
//
// Consumo canonico na ME-082:
//   - AlterarSenhaClient.tsx: acionado ao clicar [Cancelar] com pelo
//     menos um campo preenchido (senhaAtual, novaSenha, confirmar).
//     `onDiscard` executa router.push('/meus-dados').
//
// Refactor futuro (D-DIRTY-CONSOLIDACAO, pos-B9): 3 clients super-admin
// pre-existentes (ColaboradorNovoClient, CLevelNovoClient,
// CLevelEditarClient) migram para este componente. Fora do escopo B9.
//
// **RV-13.** Consumido por AlterarSenhaClient.tsx (mesma ME).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use client';

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

import { Modal } from './Modal';

/**
 * Titulo canonico literal §4.10. Exportado para asserts bit-exact em
 * testes.
 */
export const MODAL_DIRTY_STATE_TITLE = 'Descartar alterações?' as const;

/**
 * Corpo canonico literal §4.10. Exportado para asserts bit-exact em
 * testes.
 */
export const MODAL_DIRTY_STATE_BODY =
  'Você tem dados não salvos. Se sair agora, as alterações serão perdidas.' as const;

/**
 * Label canonico do botao secundario (outline). Exportado para asserts.
 */
export const MODAL_DIRTY_STATE_KEEP_LABEL = 'Continuar editando' as const;

/**
 * Label canonico do botao primario (vermelho). Exportado para asserts.
 */
export const MODAL_DIRTY_STATE_DISCARD_LABEL = 'Descartar' as const;

export interface ModalDirtyStateProps {
  /**
   * Controla renderizacao do modal. `false` esconde completamente.
   */
  readonly open: boolean;
  /**
   * Chamado quando o usuario opta por continuar editando — botao
   * outline, ESC ou clique fora. Consumidor tipico: fecha o modal.
   */
  readonly onKeepEditing: () => void;
  /**
   * Chamado quando o usuario confirma descarte — botao vermelho.
   * Consumidor tipico: executa navegacao ou reset do formulario.
   */
  readonly onDiscard: () => void;
}

const TITLE_STYLE = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600 as const,
  color: COLORS.text.primary,
};

const BODY_STYLE = {
  margin: '12px 0 20px',
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const FOOTER_STYLE = {
  display: 'flex' as const,
  justifyContent: 'flex-end' as const,
  gap: 8,
};

const BTN_OUTLINE_STYLE = {
  padding: '9px 16px',
  background: COLORS.background.card,
  color: COLORS.text.secondary,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500 as const,
  cursor: 'pointer' as const,
};

const BTN_DANGER_STYLE = {
  padding: '9px 16px',
  background: COLORS.semantic.danger,
  color: COLORS.background.card,
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600 as const,
  cursor: 'pointer' as const,
};

/**
 * Modal canonico §4.10 — dirty state. Reutilizavel em qualquer
 * formulario que precise proteger campos preenchidos contra descarte
 * acidental (Cancelar, navegacao, ESC no proprio formulario).
 */
export function ModalDirtyState(props: ModalDirtyStateProps): JSX.Element | null {
  const { open, onKeepEditing, onDiscard } = props;

  if (!open) {
    return null;
  }

  return (
    <Modal variant="confirmation" open={open} onClose={onKeepEditing}>
      <h2 style={TITLE_STYLE}>{MODAL_DIRTY_STATE_TITLE}</h2>
      <p style={BODY_STYLE}>{MODAL_DIRTY_STATE_BODY}</p>
      <div style={FOOTER_STYLE}>
        <button type="button" onClick={onKeepEditing} style={BTN_OUTLINE_STYLE}>
          {MODAL_DIRTY_STATE_KEEP_LABEL}
        </button>
        <button type="button" onClick={onDiscard} style={BTN_DANGER_STYLE}>
          {MODAL_DIRTY_STATE_DISCARD_LABEL}
        </button>
      </div>
    </Modal>
  );
}
