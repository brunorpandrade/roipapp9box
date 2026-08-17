// ROIP APP 9BOX — smoke tests do ModalDirtyState (ME-082).
//
// Cobre RV-13 + verificacao bit-exact das constantes canonicas §4.10
// (titulo, corpo, labels dos botoes).

import { describe, expect, it } from 'vitest';

import {
  MODAL_DIRTY_STATE_BODY,
  MODAL_DIRTY_STATE_DISCARD_LABEL,
  MODAL_DIRTY_STATE_KEEP_LABEL,
  MODAL_DIRTY_STATE_TITLE,
  ModalDirtyState,
} from '../../src/components/ui/ModalDirtyState';

describe('ModalDirtyState — smoke tests RV-13', () => {
  it('ModalDirtyState e uma funcao componente exportada', () => {
    expect(typeof ModalDirtyState).toBe('function');
    expect(ModalDirtyState.name).toBe('ModalDirtyState');
  });
});

describe('ModalDirtyState — constantes canonicas §4.10 bit-exact', () => {
  it('MODAL_DIRTY_STATE_TITLE literal canonico (com til e interrogacao)', () => {
    expect(MODAL_DIRTY_STATE_TITLE).toBe('Descartar alterações?');
  });
  it('MODAL_DIRTY_STATE_BODY literal canonico (com acentos)', () => {
    expect(MODAL_DIRTY_STATE_BODY).toBe(
      'Você tem dados não salvos. Se sair agora, as alterações serão perdidas.',
    );
  });
  it('MODAL_DIRTY_STATE_KEEP_LABEL literal canonico', () => {
    expect(MODAL_DIRTY_STATE_KEEP_LABEL).toBe('Continuar editando');
  });
  it('MODAL_DIRTY_STATE_DISCARD_LABEL literal canonico', () => {
    expect(MODAL_DIRTY_STATE_DISCARD_LABEL).toBe('Descartar');
  });
});
