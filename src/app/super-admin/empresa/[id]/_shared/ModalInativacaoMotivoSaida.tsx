// ROIP APP 9BOX — ME-078b canonico — ModalInativacaoMotivoSaida (§13.6).
//
// Modal canonico bit-exact de inativacao de colaborador comum com
// campo obrigatorio "Motivo de saida" (voluntario | involuntario).
//
// Estrutura canonica bit-exact (mockup `delta_modal_inativacao_motivo_saida_v1.html`):
//   - Titulo: "Inativar colaborador"
//   - Bloco condicional canonico RF ATIVO (§16.3 + §5.6): bloqueador
//     com botao unico [Entendi] — cancela a inativacao.
//   - Bloco condicional canonico impacto liderados (§14 M2 v2): quando
//     o colaborador e lider com liderados ativos, informa que M2
//     abrira em seguida para redistribuicao — NAO bloqueia.
//   - Texto informativo canonico literal §13.6.
//   - Radio buttons Voluntario/Involuntario SEM pre-selecao.
//   - Rodape: [Cancelar] + [Prosseguir] (desabilitado ate radio selecionado).
//
// Ordem canonica com M2 (§13.6 canonico):
//   1. Motivo de saida preenchido e validado neste modal.
//   2. Se `hasLiderados=true`, M2 abre em seguida (fluxo do caller).
//   3. Gravacao em `employeeTerminationEvents` na transacao atomica do
//      `employees.inactivate` (backend §12.6).

'use client';

import { useState, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';

type MotivoSaida = 'voluntario' | 'involuntario';

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
  maxWidth: 620,
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

const RF_BLOCKER_STYLE = {
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
};

const IMPACTO_BLOCK_STYLE = {
  background: COLORS.badge.warningBg,
  color: COLORS.badge.warningText,
  border: `1px solid ${COLORS.semantic.warning}`,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
};

const BODY_TEXT_STYLE = {
  fontSize: 14,
  color: COLORS.text.secondary,
  lineHeight: 1.6,
};

const MOTIVO_LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.text.primary,
  marginBottom: 8,
};

const RADIO_OPTION_STYLE = (checked: boolean) => ({
  display: 'flex',
  gap: 12,
  padding: 12,
  border: `1px solid ${checked ? COLORS.accent.teal : COLORS.border.default}`,
  borderRadius: 6,
  background: checked ? COLORS.badge.tealClaroBgAlt : COLORS.background.card,
  cursor: 'pointer' as const,
  marginBottom: 8,
});

const INFO_TEXT_STYLE = {
  fontSize: 12,
  color: COLORS.text.tertiary,
  lineHeight: 1.5,
  fontStyle: 'italic' as const,
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

const BTN_DANGER_STYLE = {
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 6,
  background: COLORS.semantic.danger,
  color: '#FFFFFF',
  cursor: 'pointer' as const,
};

const BTN_DISABLED_STYLE = {
  ...BTN_DANGER_STYLE,
  opacity: 0.5,
  cursor: 'not-allowed' as const,
};

const ERROR_STYLE = {
  fontSize: 12,
  color: COLORS.semantic.danger,
  marginTop: 4,
};

export interface ModalInativacaoMotivoSaidaProps {
  /** Nome do colaborador sendo inativado. */
  readonly employeeName: string;
  /** True se colaborador e o RF vigente da empresa (bloqueio §5.6). */
  readonly isCurrentRF: boolean;
  /** Contagem de liderados ativos (abre bloco informativo M2 se > 0). */
  readonly countLiderados: number;
  /** Callback ao clicar Cancelar. */
  readonly onCancel: () => void;
  /** Callback ao confirmar; recebe motivoSaida validado. */
  readonly onConfirm: (motivoSaida: MotivoSaida) => Promise<void> | void;
  /** Sinaliza estado de submissao. */
  readonly submitting?: boolean;
  /** Erro externo do request. */
  readonly errorMessage?: string | null;
}

export function ModalInativacaoMotivoSaida(props: ModalInativacaoMotivoSaidaProps): JSX.Element {
  const {
    employeeName,
    isCurrentRF,
    countLiderados,
    onCancel,
    onConfirm,
    submitting,
    errorMessage,
  } = props;
  const [motivo, setMotivo] = useState<MotivoSaida | null>(null);
  const isSubmitting = submitting === true;
  const canSubmit = motivo !== null && !isSubmitting && !isCurrentRF;

  function handleConfirm(): void {
    if (!canSubmit || motivo === null) return;
    void onConfirm(motivo);
  }

  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true" aria-labelledby="inativacao-title">
      <div style={BOX_STYLE}>
        <h2 id="inativacao-title" style={TITLE_STYLE}>
          Inativar colaborador
        </h2>
        {isCurrentRF ? (
          <div style={RF_BLOCKER_STYLE}>
            Este colaborador é o Responsável financeiro da empresa. Antes de inativar, atribua o
            papel de Responsável financeiro a outro colaborador.
          </div>
        ) : (
          <>
            <p style={BODY_TEXT_STYLE}>
              Você está inativando <strong>{employeeName}</strong>. O colaborador deixará de acessar
              a plataforma, sairá do organograma e não aparecerá em novos ciclos.
            </p>
            {countLiderados > 0 ? (
              <div style={IMPACTO_BLOCK_STYLE}>
                <strong>
                  Este colaborador tem {countLiderados} liderado(s) direto(s) ativo(s).
                </strong>{' '}
                Você precisará selecionar um novo líder para cada liderado antes de concluir a
                inativação. O modal de transferência de liderados abrirá em seguida.
              </div>
            ) : null}
            <div>
              <div style={MOTIVO_LABEL_STYLE}>Motivo de saída *</div>
              <label style={RADIO_OPTION_STYLE(motivo === 'voluntario')}>
                <input
                  type="radio"
                  name="motivoSaida"
                  value="voluntario"
                  checked={motivo === 'voluntario'}
                  onChange={() => setMotivo('voluntario')}
                  disabled={isSubmitting}
                  aria-label="Motivo voluntário"
                />
                <div>
                  <strong>Voluntário</strong>
                  <br />
                  <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
                    Colaborador solicitou o desligamento (pedido de demissão, aceite de proposta
                    externa).
                  </span>
                </div>
              </label>
              <label style={RADIO_OPTION_STYLE(motivo === 'involuntario')}>
                <input
                  type="radio"
                  name="motivoSaida"
                  value="involuntario"
                  checked={motivo === 'involuntario'}
                  onChange={() => setMotivo('involuntario')}
                  disabled={isSubmitting}
                  aria-label="Motivo involuntário"
                />
                <div>
                  <strong>Involuntário</strong>
                  <br />
                  <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
                    Desligamento decidido pela empresa (rescisão sem justa causa, com justa causa,
                    término de contrato).
                  </span>
                </div>
              </label>
            </div>
            <p style={INFO_TEXT_STYLE}>
              O histórico do colaborador (avaliações, respostas de instrumentos, dashboards
              passados) é preservado permanentemente. A inativação não deleta dados.
            </p>
            {errorMessage !== null && errorMessage !== undefined ? (
              <div style={ERROR_STYLE}>{errorMessage}</div>
            ) : null}
          </>
        )}
        <div style={FOOTER_STYLE}>
          <button
            type="button"
            onClick={onCancel}
            style={BTN_OUTLINE_STYLE}
            disabled={isSubmitting}
          >
            {isCurrentRF ? 'Entendi' : 'Cancelar'}
          </button>
          {isCurrentRF ? null : (
            <button
              type="button"
              onClick={handleConfirm}
              style={canSubmit ? BTN_DANGER_STYLE : BTN_DISABLED_STYLE}
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Inativando...' : 'Prosseguir'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
