'use client';

// ROIP APP 9BOX — modal canonico bit-exact `[Solicitar desbloqueio]`
// (§14.16, ME-086b). Componente compartilhado canonicamente reutilizavel
// por `/dados-mensais`, `/dados-mensais/meus-liderados` (ME futura),
// `/faturamento-mensal` (ME futura) e `/cycle-management` (ME futura)
// conforme MASTER_ESCOPO_B9 §3.5.
//
// Origem canonica:
// - CAMADA_UI §14.16 (modal integral — titulo literal + 4 campos +
//   validacoes + contador colorido + confirmacao de cancelamento +
//   toast literal).
// - CAMADA_NEGOCIO §11 (motor de dados mensais — mes tem que estar
//   `fechado`).
// - CAMADA_DADOS §4.5 (`employees`) + §4.6 (`employeeLeaderHistory`).
// - DOC 03 §2.3 (justificativa 100-500 chars).
//
// D-086b-3 A aprovada bit-exact: implementacao canonica integral
// §14.16, sem parcialidade.
//
// **RV-13.** `ModalSolicitarDesbloqueio` consumido por
// `DadosMensaisClient.tsx` (variant='rh').
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

import type {
  DadosMensaisActionResult,
  DadosMensaisLeaderOption,
  DadosMensaisMesFechado,
} from './internals';

// -----------------------------------------------------------------------
// Props canonicas
// -----------------------------------------------------------------------

/**
 * Contrato canonico bit-exact do modal. Todas as callbacks sao
 * server actions injetadas via prop (pattern S315 + D-CR-5).
 */
export interface ModalSolicitarDesbloqueioProps {
  readonly companyId: number;
  readonly initialMes: string;
  readonly initialAba?: 'rh' | 'lider' | 'faturamento';
  readonly onClose: () => void;
  readonly onSuccess: (message: string) => void;
  readonly listMesesFechados: (input: {
    readonly companyId: number;
  }) => Promise<DadosMensaisActionResult<DadosMensaisMesFechado[]>>;
  readonly listCompanyLeaders: (input: {
    readonly companyId: number;
  }) => Promise<DadosMensaisActionResult<DadosMensaisLeaderOption[]>>;
  readonly createUnlockRequest: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly aba: 'rh' | 'lider' | 'faturamento';
    readonly liderId?: number;
    readonly liderTipo?: 'employee' | 'clevel';
    readonly justificativa: string;
  }) => Promise<DadosMensaisActionResult<{ readonly id: number }>>;
}

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact §14.16 (exportadas para RV-13 tests)
// -----------------------------------------------------------------------

export const MODAL_SOLICITAR_DESBLOQUEIO_TITLE = 'Nova solicitação de desbloqueio' as const;

export const MODAL_SOLICITAR_DESBLOQUEIO_TOAST_SUCCESS =
  'Solicitação enviada. Bruno será notificado.' as const;

export const MODAL_SOLICITAR_DESBLOQUEIO_CONFIRM_TITLE =
  'Descartar solicitação em preenchimento?' as const;

export const MODAL_SOLICITAR_DESBLOQUEIO_HELPER_JUSTIFICATIVA =
  'Mínimo 100, máximo 500 caracteres.' as const;

export const MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_NORMAL = '#6B7280' as const;
export const MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_OVER = '#DC2626' as const;

export const MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MIN = 100 as const;
export const MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MAX = 500 as const;

// Aliases internos (uso local — preserva legibilidade do render)
const TITLE_LITERAL = MODAL_SOLICITAR_DESBLOQUEIO_TITLE;
const HELPER_JUSTIFICATIVA = MODAL_SOLICITAR_DESBLOQUEIO_HELPER_JUSTIFICATIVA;
const TOAST_SUCCESS_LITERAL = MODAL_SOLICITAR_DESBLOQUEIO_TOAST_SUCCESS;
const CONFIRM_TITLE_LITERAL = MODAL_SOLICITAR_DESBLOQUEIO_CONFIRM_TITLE;
const CONTADOR_COLOR_NORMAL = MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_NORMAL;
const CONTADOR_COLOR_OVER = MODAL_SOLICITAR_DESBLOQUEIO_CONTADOR_COLOR_OVER;
const JUSTIFICATIVA_MIN = MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MIN;
const JUSTIFICATIVA_MAX = MODAL_SOLICITAR_DESBLOQUEIO_JUSTIFICATIVA_MAX;

const PLACEHOLDER_JUSTIFICATIVA =
  'Descreva o motivo do desbloqueio. Ex.: correção retroativa de custo' +
  ' lançado incorretamente em 22/05 — divergência apontada pelo' +
  ' Financeiro na conciliação mensal.';

// -----------------------------------------------------------------------
// Estilos canonicos bit-exact
// -----------------------------------------------------------------------

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 200,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 16,
};

const MODAL_STYLE: CSSProperties = {
  background: 'white',
  borderRadius: 14,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

const HEADER_STYLE: CSSProperties = {
  background: '#1F3A5F',
  color: 'white',
  padding: '16px 24px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const HEADER_TITLE_STYLE: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: 0,
};

const HEADER_CLOSE_STYLE: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'white',
  fontSize: 20,
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
  fontFamily: 'inherit',
};

const BODY_STYLE: CSSProperties = {
  padding: 24,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  flex: 1,
};

const FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.primary,
  marginBottom: 4,
  display: 'block',
};

const FIELD_INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: `1px solid ${'#D1D5DB'}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  color: COLORS.text.primary,
  background: 'white',
  boxSizing: 'border-box',
};

const FIELD_TEXTAREA_STYLE: CSSProperties = {
  ...FIELD_INPUT_STYLE,
  minHeight: 120,
  resize: 'vertical',
  fontFamily: 'inherit',
};

const RADIO_GROUP_STYLE: CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

const RADIO_ITEM_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  cursor: 'pointer',
  color: COLORS.text.primary,
};

const HELPER_STYLE: CSSProperties = {
  fontSize: 11,
  color: COLORS.text.secondary,
  marginTop: 4,
};

const CONTADOR_STYLE_BASE: CSSProperties = {
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
  marginTop: 4,
  textAlign: 'right',
};

const FOOTER_STYLE: CSSProperties = {
  padding: '16px 24px',
  borderTop: `1px solid ${COLORS.border.default}`,
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  background: '#FAFAFA',
};

const BTN_PRIMARY_STYLE: CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  background: '#1F3A5F',
  color: 'white',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const BTN_SECONDARY_STYLE: CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: `1px solid ${COLORS.border.default}`,
  background: 'white',
  color: COLORS.text.primary,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const BTN_DANGER_STYLE: CSSProperties = {
  ...BTN_PRIMARY_STYLE,
  background: '#DC2626',
};

const ERROR_STYLE: CSSProperties = {
  padding: '10px 12px',
  background: '#FEE2E2',
  border: '1px solid #DC2626',
  borderRadius: 8,
  fontSize: 12,
  color: '#991B1B',
};

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function ModalSolicitarDesbloqueio(props: ModalSolicitarDesbloqueioProps): JSX.Element {
  const {
    companyId,
    initialMes,
    initialAba,
    onClose,
    onSuccess,
    listMesesFechados,
    listCompanyLeaders,
    createUnlockRequest,
  } = props;

  // -------------------------------------------------------------------
  // Estado canonico
  // -------------------------------------------------------------------

  const [mes, setMes] = useState<string>(initialMes);
  const [aba, setAba] = useState<'rh' | 'lider' | 'faturamento'>(initialAba ?? 'rh');
  const [liderKey, setLiderKey] = useState<string>('');
  const [justificativa, setJustificativa] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [mesesFechados, setMesesFechados] = useState<DadosMensaisMesFechado[]>([]);
  const [leaders, setLeaders] = useState<DadosMensaisLeaderOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // -------------------------------------------------------------------
  // Carga inicial canonica: meses fechados + lideres
  // -------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoadingOptions(true);
      try {
        const [mesesResult, leadersResult] = await Promise.all([
          listMesesFechados({ companyId }),
          listCompanyLeaders({ companyId }),
        ]);
        if (cancelled) {
          return;
        }
        if (mesesResult.ok) {
          setMesesFechados(mesesResult.data);
          // Se o initialMes nao esta na lista de fechados, limpar
          const found = mesesResult.data.some((m) => m.mes === initialMes);
          if (!found && mesesResult.data.length > 0) {
            const first = mesesResult.data[0];
            if (first !== undefined) {
              setMes(first.mes);
            }
          }
        } else {
          setError(mesesResult.message);
        }
        if (leadersResult.ok) {
          setLeaders(leadersResult.data);
        }
      } catch {
        if (!cancelled) {
          setError('Não foi possível carregar as opções. Tente novamente.');
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [companyId, initialMes, listMesesFechados, listCompanyLeaders]);

  // -------------------------------------------------------------------
  // Derivados canonicos
  // -------------------------------------------------------------------

  const justificativaLen = justificativa.trim().length;
  const isDirty = useMemo(() => {
    if (justificativa.trim().length > 0) {
      return true;
    }
    if (liderKey.length > 0) {
      return true;
    }
    if (aba !== (initialAba ?? 'rh')) {
      return true;
    }
    return false;
  }, [justificativa, liderKey, aba, initialAba]);

  const contadorColor =
    justificativaLen > JUSTIFICATIVA_MAX ? CONTADOR_COLOR_OVER : CONTADOR_COLOR_NORMAL;

  // -------------------------------------------------------------------
  // Handlers canonicos
  // -------------------------------------------------------------------

  const handleAttemptClose = useCallback((): void => {
    if (isDirty) {
      setShowConfirmCancel(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  const handleConfirmDiscard = useCallback((): void => {
    setShowConfirmCancel(false);
    onClose();
  }, [onClose]);

  const handleContinueEditing = useCallback((): void => {
    setShowConfirmCancel(false);
  }, []);

  const parseLiderKey = useCallback(
    (key: string): { liderId: number; liderTipo: 'employee' | 'clevel' } | null => {
      const parts = key.split(':');
      if (parts.length !== 2) {
        return null;
      }
      const tipo = parts[0];
      const idStr = parts[1];
      if (tipo !== 'employee' && tipo !== 'clevel') {
        return null;
      }
      if (idStr === undefined) {
        return null;
      }
      const id = Number.parseInt(idStr, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return null;
      }
      return { liderId: id, liderTipo: tipo };
    },
    [],
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    setError(null);

    // Validacao canonica client-side bit-exact §14.16 + DOC 03 §2.3
    if (mes.length === 0) {
      setError('Selecione o mês.');
      return;
    }
    if (justificativaLen < JUSTIFICATIVA_MIN) {
      setError(`A justificativa deve ter no mínimo ${JUSTIFICATIVA_MIN} caracteres.`);
      return;
    }
    if (justificativaLen > JUSTIFICATIVA_MAX) {
      setError(`A justificativa deve ter no máximo ${JUSTIFICATIVA_MAX} caracteres.`);
      return;
    }

    let liderId: number | undefined;
    let liderTipo: 'employee' | 'clevel' | undefined;
    if (aba === 'lider') {
      const parsed = parseLiderKey(liderKey);
      if (parsed === null) {
        setError('Selecione o líder.');
        return;
      }
      liderId = parsed.liderId;
      liderTipo = parsed.liderTipo;
    }

    setSubmitting(true);
    try {
      const result = await createUnlockRequest({
        companyId,
        mes,
        aba,
        liderId,
        liderTipo,
        justificativa: justificativa.trim(),
      });
      if (result.ok) {
        onSuccess(TOAST_SUCCESS_LITERAL);
        onClose();
      } else {
        setError(result.message);
      }
    } catch {
      setError('Erro ao enviar solicitação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [
    aba,
    companyId,
    createUnlockRequest,
    justificativa,
    justificativaLen,
    liderKey,
    mes,
    onClose,
    onSuccess,
    parseLiderKey,
  ]);

  // -------------------------------------------------------------------
  // Render canonico bit-exact
  // -------------------------------------------------------------------

  return (
    <div style={OVERLAY_STYLE} onClick={handleAttemptClose}>
      <div
        style={MODAL_STYLE}
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        {/* Header canonico */}
        <div style={HEADER_STYLE}>
          <h2 style={HEADER_TITLE_STYLE}>{TITLE_LITERAL}</h2>
          <button
            type="button"
            style={HEADER_CLOSE_STYLE}
            onClick={handleAttemptClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Body canonico */}
        <div style={BODY_STYLE}>
          {error !== null && <div style={ERROR_STYLE}>{error}</div>}

          {/* Campo mes canonico §14.16 */}
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="modal-desb-mes">
              Mês
            </label>
            <select
              id="modal-desb-mes"
              style={FIELD_INPUT_STYLE}
              value={mes}
              onChange={(e): void => setMes(e.target.value)}
              disabled={loadingOptions || submitting}
            >
              <option value="">— Selecione o mês —</option>
              {mesesFechados.map((m) => (
                <option key={m.mes} value={m.mes}>
                  {m.label}
                </option>
              ))}
            </select>
            {mesesFechados.length === 0 && !loadingOptions && (
              <div style={HELPER_STYLE}>Nenhum mês fechado disponível para solicitação.</div>
            )}
          </div>

          {/* Campo aba canonico §14.16 */}
          <div>
            <label style={FIELD_LABEL_STYLE}>Aba</label>
            <div style={RADIO_GROUP_STYLE}>
              <label style={RADIO_ITEM_STYLE}>
                <input
                  type="radio"
                  name="modal-desb-aba"
                  value="rh"
                  checked={aba === 'rh'}
                  onChange={(): void => setAba('rh')}
                  disabled={submitting}
                />
                RH
              </label>
              <label style={RADIO_ITEM_STYLE}>
                <input
                  type="radio"
                  name="modal-desb-aba"
                  value="lider"
                  checked={aba === 'lider'}
                  onChange={(): void => setAba('lider')}
                  disabled={submitting}
                />
                Líder
              </label>
              <label style={RADIO_ITEM_STYLE}>
                <input
                  type="radio"
                  name="modal-desb-aba"
                  value="faturamento"
                  checked={aba === 'faturamento'}
                  onChange={(): void => setAba('faturamento')}
                  disabled={submitting}
                />
                Faturamento
              </label>
            </div>
          </div>

          {/* Campo liderId canonico condicional §14.16 */}
          {aba === 'lider' && (
            <div>
              <label style={FIELD_LABEL_STYLE} htmlFor="modal-desb-lider">
                Líder
              </label>
              <select
                id="modal-desb-lider"
                style={FIELD_INPUT_STYLE}
                value={liderKey}
                onChange={(e): void => setLiderKey(e.target.value)}
                disabled={loadingOptions || submitting}
              >
                <option value="">— Selecione o líder —</option>
                {leaders.map((l) => {
                  const key = `${l.tipo}:${l.id}`;
                  return (
                    <option key={key} value={key}>
                      {l.name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Campo justificativa canonico §14.16 */}
          <div>
            <label style={FIELD_LABEL_STYLE} htmlFor="modal-desb-justificativa">
              Justificativa
            </label>
            <textarea
              id="modal-desb-justificativa"
              style={FIELD_TEXTAREA_STYLE}
              value={justificativa}
              onChange={(e): void => setJustificativa(e.target.value)}
              placeholder={PLACEHOLDER_JUSTIFICATIVA}
              disabled={submitting}
              maxLength={JUSTIFICATIVA_MAX + 50}
            />
            <div style={HELPER_STYLE}>{HELPER_JUSTIFICATIVA}</div>
            <div style={{ ...CONTADOR_STYLE_BASE, color: contadorColor }}>
              {justificativaLen}/{JUSTIFICATIVA_MAX}
            </div>
          </div>
        </div>

        {/* Footer canonico */}
        <div style={FOOTER_STYLE}>
          <button
            type="button"
            style={BTN_SECONDARY_STYLE}
            onClick={handleAttemptClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            style={{
              ...BTN_PRIMARY_STYLE,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            onClick={(): void => {
              void handleSubmit();
            }}
            disabled={submitting}
          >
            {submitting ? 'Enviando...' : 'Enviar solicitação'}
          </button>
        </div>
      </div>

      {/* Modal de confirmacao de cancelamento canonico §14.16 */}
      {showConfirmCancel && (
        <div
          style={{
            ...OVERLAY_STYLE,
            zIndex: 300,
          }}
          onClick={handleContinueEditing}
        >
          <div
            style={{
              ...MODAL_STYLE,
              maxWidth: 440,
            }}
            onClick={(e): void => {
              e.stopPropagation();
            }}
          >
            <div style={HEADER_STYLE}>
              <h2 style={HEADER_TITLE_STYLE}>{CONFIRM_TITLE_LITERAL}</h2>
            </div>
            <div style={{ ...BODY_STYLE, gap: 0 }}>
              <p
                style={{
                  fontSize: 13,
                  color: COLORS.text.primary,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Você perderá as informações preenchidas até aqui.
              </p>
            </div>
            <div style={FOOTER_STYLE}>
              <button type="button" style={BTN_SECONDARY_STYLE} onClick={handleContinueEditing}>
                Continuar editando
              </button>
              <button type="button" style={BTN_DANGER_STYLE} onClick={handleConfirmDiscard}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
