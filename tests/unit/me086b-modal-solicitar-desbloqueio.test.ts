// ROIP APP 9BOX — smoke tests do ModalSolicitarDesbloqueio (ME-086b).
//
// Cobre RV-13 (export nao-orfao) + verificacao bit-exact canonica
// das constantes literais canonizadas §14.16 (titulo, toast de
// sucesso, titulo do modal de confirmacao, helper de justificativa,
// cores canonicas do contador, limites canonicos).
//
// Padrao canonico bit-exact ao precedente `me082-modal-dirty-state.
// test.ts` (ME-082) — smoke test unit-only sem DOM (jsdom nao
// configurado no vitest — testing-library nao esta no toolchain).

import { describe, expect, it } from 'vitest';

import {
  MODAL_SOLICITAR_DESBLOQUEIO_CONFIRM_TITLE,
  MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_NORMAL,
  MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_OVER,
  MODAL_SOLICITAR_DESBLOQUEIO_HELPER_JUSTIFICATIVA,
  MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MAX,
  MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MIN,
  MODAL_SOLICITAR_DESBLOQUEIO_TITLE,
  MODAL_SOLICITAR_DESBLOQUEIO_TOAST_SUCCESS,
  ModalSolicitarDesbloqueio,
} from '../../src/components/dados-mensais/ModalSolicitarDesbloqueio';

describe('ModalSolicitarDesbloqueio — smoke tests RV-13', () => {
  it('ModalSolicitarDesbloqueio e uma funcao componente exportada', () => {
    expect(typeof ModalSolicitarDesbloqueio).toBe('function');
    expect(ModalSolicitarDesbloqueio.name).toBe('ModalSolicitarDesbloqueio');
  });
});

describe('ModalSolicitarDesbloqueio — constantes canonicas §14.16 bit-exact', () => {
  it('TITLE literal canonico bit-exact §14.16', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_TITLE).toBe('Nova solicitação de desbloqueio');
  });

  it('TOAST_SUCCESS literal canonico bit-exact §14.16', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_TOAST_SUCCESS).toBe(
      'Solicitação enviada. Bruno será notificado.',
    );
  });

  it('CONFIRM_TITLE literal canonico bit-exact §14.16 (confirmacao cancelamento)', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_CONFIRM_TITLE).toBe(
      'Descartar solicitação em preenchimento?',
    );
  });

  it('HELPER_JUSTIFICATIVA literal canonico bit-exact §14.16', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_HELPER_JUSTIFICATIVA).toBe(
      'Mínimo 100, máximo 500 caracteres.',
    );
  });

  it('CONTADOR_COLOR_NORMAL hex canonico bit-exact §14.16 (cinza)', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_NORMAL).toBe('#6B7280');
  });

  it('CONTADOR_COLOR_OVER hex canonico bit-exact §14.16 (vermelho)', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_OVER).toBe('#DC2626');
  });

  it('JUSTIFICATIVA_MIN canonico bit-exact §14.16 (100 chars)', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MIN).toBe(100);
  });

  it('JUSTIFICATIVA_MAX canonico bit-exact §14.16 (500 chars)', () => {
    expect(MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MAX).toBe(500);
  });
});
