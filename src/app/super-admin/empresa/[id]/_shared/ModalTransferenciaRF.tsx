// ROIP APP 9BOX — ME-078b D9 canonico — ModalTransferenciaRF (§5.5).
//
// Modal canonico bit-exact de transferencia de Responsavel financeiro
// entre titulares. Reutilizado por:
//   - `ColaboradorForm` / `ColaboradorNovoClient` / `ColaboradorEditarClient` (§5.5 canonico)
//   - `CLevelNovoClient` / `CLevelEditarClient` (ME-078a D9 in-place)
//
// Fluxo canonico (§5.5):
//   1. Bruno ativa toggle "Ativar como Responsavel financeiro".
//   2. Se empresa NAO tem RF vigente (`currentRFName === null`):
//        ativacao direta (modal NAO abre); toggle ativa localmente.
//   3. Se empresa TEM RF vigente (`currentRFName !== null`):
//        modal abre com titular vigente + justificativa 100-500 chars.
//   4. Ao confirmar: caller executa `company.setResponsavelFinanceiro`
//        + passa `justificativa` no payload. Log automatico em
//        `responsavelFinanceiroTransferLog` (§5.5 backend).
//
// L114 canonico — client component sem side effects; caller injeta
// callback `onConfirm(justificativa)` para orquestrar a mutation tRPC.

'use client';

import { useState, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';

const JUSTIFICATIVA_MIN = 100;
const JUSTIFICATIVA_MAX = 500;

const OVERLAY_STYLE = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(15,23,42,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60,
  padding: 16,
};

const BOX_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
  padding: 24,
};

const TITLE_STYLE = {
  fontSize: 18,
  fontWeight: 600,
  color: COLORS.text.primary,
  margin: 0,
};

const SUBTITLE_STYLE = {
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const LABEL_STYLE = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.text.primary,
  marginBottom: 6,
};

const TEXTAREA_STYLE = {
  width: '100%',
  minHeight: 120,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  resize: 'vertical' as const,
  boxSizing: 'border-box' as const,
};

const COUNTER_STYLE = (isInvalid: boolean) => ({
  fontSize: 12,
  color: isInvalid ? COLORS.semantic.danger : COLORS.text.secondary,
  marginTop: 4,
  textAlign: 'right' as const,
});

const ERROR_STYLE = {
  fontSize: 12,
  color: COLORS.semantic.danger,
  marginTop: 4,
};

const FOOTER_STYLE = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  marginTop: 8,
};

const BTN_OUTLINE_STYLE = {
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  cursor: 'pointer' as const,
};

const BTN_PRIMARY_STYLE = {
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.accent.teal}`,
  borderRadius: 6,
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  cursor: 'pointer' as const,
};

const BTN_DISABLED_STYLE = {
  ...BTN_PRIMARY_STYLE,
  opacity: 0.5,
  cursor: 'not-allowed' as const,
};

export interface ModalTransferenciaRFProps {
  /** Nome do titular atual do RF (canonico §5.5 — null significa empresa sem RF). */
  readonly currentRFName: string;
  /** Nome do novo titular sendo nomeado (canonico §5.5). */
  readonly nextRFName: string;
  /** Callback ao clicar Cancelar (fecha modal sem alterar estado externo). */
  readonly onCancel: () => void;
  /** Callback ao confirmar; recebe `justificativa` validada 100-500 chars. */
  readonly onConfirm: (justificativa: string) => Promise<void> | void;
  /** Sinaliza estado de submissao para desabilitar botoes durante request. */
  readonly submitting?: boolean;
  /** Mensagem de erro externa (falha do request tRPC). */
  readonly errorMessage?: string | null;
}

export function ModalTransferenciaRF(props: ModalTransferenciaRFProps): JSX.Element {
  const { currentRFName, nextRFName, onCancel, onConfirm, submitting, errorMessage } = props;
  const [justificativa, setJustificativa] = useState('');

  const trimmedLen = justificativa.trim().length;
  const isTooShort = trimmedLen < JUSTIFICATIVA_MIN;
  const isTooLong = trimmedLen > JUSTIFICATIVA_MAX;
  const isInvalid = isTooShort || isTooLong;
  const isSubmitting = submitting === true;
  const canSubmit = !isInvalid && !isSubmitting;

  function handleConfirm(): void {
    if (!canSubmit) return;
    void onConfirm(justificativa.trim());
  }

  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true" aria-labelledby="rf-transfer-title">
      <div style={BOX_STYLE}>
        <h2 id="rf-transfer-title" style={TITLE_STYLE}>
          Transferir Responsável financeiro
        </h2>
        <p style={SUBTITLE_STYLE}>
          Titular atual: <strong>{currentRFName}</strong>. Novo titular:{' '}
          <strong>{nextRFName}</strong>. Ao confirmar, o papel é transferido em transação atômica e
          registrado em log de auditoria permanente.
        </p>
        <div>
          <label style={LABEL_STYLE} htmlFor="rf-justificativa">
            Justificativa da transferência *
          </label>
          <textarea
            id="rf-justificativa"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            style={TEXTAREA_STYLE}
            placeholder={
              'Descreva o motivo da transferência do Responsável financeiro ' +
              '(100 a 500 caracteres).'
            }
            maxLength={JUSTIFICATIVA_MAX + 50}
            disabled={isSubmitting}
          />
          <div style={COUNTER_STYLE(isInvalid)}>
            {trimmedLen}/{JUSTIFICATIVA_MAX} caracteres
          </div>
          {isTooShort && trimmedLen > 0 ? (
            <div style={ERROR_STYLE}>A justificativa deve ter no mínimo 100 caracteres.</div>
          ) : null}
          {isTooLong ? (
            <div style={ERROR_STYLE}>A justificativa deve ter no máximo 500 caracteres.</div>
          ) : null}
          {errorMessage !== null && errorMessage !== undefined ? (
            <div style={ERROR_STYLE}>{errorMessage}</div>
          ) : null}
        </div>
        <div style={FOOTER_STYLE}>
          <button
            type="button"
            onClick={onCancel}
            style={BTN_OUTLINE_STYLE}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={canSubmit ? BTN_PRIMARY_STYLE : BTN_DISABLED_STYLE}
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Transferindo...' : 'Confirmar transferência'}
          </button>
        </div>
      </div>
    </div>
  );
}
