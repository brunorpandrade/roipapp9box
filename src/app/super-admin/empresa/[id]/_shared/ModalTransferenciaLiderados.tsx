// ROIP APP 9BOX — ME-078b canonico — ModalTransferenciaLiderados M2 v2 (§13.8).
//
// Modal canonico bit-exact de redistribuicao de liderados de um lider
// sendo inativado. Consolidacao das divergencias D040-D048.
//
// Fluxo canonico bit-exact (§14.9 CAMADA_NEGOCIO + §13.8 CAMADA_UI):
//   0. Verificacao previa `leadershipTransfer.canInactivate` executada
//      pelo caller ANTES de abrir o modal. Se `canInactivate=false`,
//      caller mostra bloqueador (mensagem canonica literal §14.2) e
//      NAO abre este modal.
//   1. Modal abre com lista de liderados diretos ativos.
//   2. Para cada liderado, autocomplete de novo lider — resultado de
//      `leadershipTransfer.getCandidates` (5 grupos canonicos §14.3).
//   3. Justificativa obrigatoria 100-500 caracteres.
//   4. Ao confirmar: caller chama `leadershipTransfer.execute` em
//      transacao atomica canonica (§14.9 Passos 1-7).
//
// L114 canonico — client component. Estado local dos mapeamentos
// (liderado_id → novo_lider). Caller injeta a lista de liderados e a
// funcao de busca de candidatos. Toda validacao critica esta no
// backend (canInactivate + loop condicional §14.4 + email obrigatorio
// §14.5). Este modal implementa apenas a coleta e a superficie visual.

'use client';

import { useMemo, useState, type JSX } from 'react';

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
  maxWidth: 720,
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

const INFO_BLOCK_STYLE = {
  background: COLORS.background.elevated,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const LIDERADO_CARD_STYLE = {
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  padding: 12,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
};

const LIDERADO_ROW_STYLE = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
};

const AVATAR_STYLE = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 600,
  flexShrink: 0,
};

const LIDERADO_INFO_STYLE = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
};

const LIDERADO_NAME_STYLE = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.text.primary,
};

const LIDERADO_META_STYLE = {
  fontSize: 12,
  color: COLORS.text.tertiary,
};

const SELECT_STYLE = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  boxSizing: 'border-box' as const,
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
  minHeight: 100,
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

function getIniciais(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  if (first === '') return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  const firstChar = first[0] ?? '';
  const lastChar = last[0] ?? '';
  return (firstChar + lastChar).toUpperCase();
}

/** §14.3 CAMADA_NEGOCIO — 5 grupos canonicos do autocomplete. */
export type CandidateGroup =
  'clevel_ativo' | 'mesmo_departamento' | 'demais_lideres' | 'nao_lider' | 'condicional';

export interface CandidateOption {
  readonly tipo: 'employee' | 'clevel';
  readonly id: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly group: CandidateGroup;
  /** Contagem canonica "X liderados" (D046 §14.6). */
  readonly countLiderados: number;
}

export interface LideradoToTransfer {
  readonly employeeId: number;
  readonly name: string;
  readonly cargo: string;
  readonly departamento: string;
}

/** Chave canonica do target (tipo + id — polimorfismo §14.3 Grupo 1/2/3). */
type TargetKey = `employee:${number}` | `clevel:${number}`;

function optionKey(o: CandidateOption): TargetKey {
  return `${o.tipo}:${o.id}` as TargetKey;
}

export interface TransferMapping {
  readonly liderado_employeeId: number;
  readonly novo_lider_tipo: 'employee' | 'clevel';
  readonly novo_lider_id: number;
}

export interface ModalTransferenciaLideradosProps {
  /** Nome do lider sendo inativado (para titulo). */
  readonly liderName: string;
  /** Liderados diretos ativos a redistribuir. */
  readonly liderados: readonly LideradoToTransfer[];
  /** Candidatos canonicos §14.3 pre-agrupados. */
  readonly candidates: readonly CandidateOption[];
  /** Callback ao clicar Cancelar. */
  readonly onCancel: () => void;
  /** Callback ao confirmar; recebe mapeamentos + justificativa validada. */
  readonly onConfirm: (
    mappings: readonly TransferMapping[],
    justificativa: string,
  ) => Promise<void> | void;
  /** Sinaliza estado de submissao. */
  readonly submitting?: boolean;
  /** Erro externo do request. */
  readonly errorMessage?: string | null;
}

const GROUP_LABELS: Record<CandidateGroup, string> = {
  clevel_ativo: 'C-LEVELS ATIVOS',
  mesmo_departamento: 'MESMO DEPARTAMENTO',
  demais_lideres: 'DEMAIS LÍDERES',
  nao_lider: 'COLABORADORES NÃO-LÍDERES · CONFIRMAÇÃO NECESSÁRIA',
  condicional: 'LIDERADOS DESTA TRANSFERÊNCIA · CONDICIONAL',
};

const GROUP_ORDER: readonly CandidateGroup[] = [
  'clevel_ativo',
  'mesmo_departamento',
  'demais_lideres',
  'nao_lider',
  'condicional',
];

export function ModalTransferenciaLiderados(props: ModalTransferenciaLideradosProps): JSX.Element {
  const { liderName, liderados, candidates, onCancel, onConfirm, submitting, errorMessage } = props;

  const [mappings, setMappings] = useState<Record<number, TargetKey | ''>>(() => {
    const initial: Record<number, TargetKey | ''> = {};
    for (const l of liderados) {
      initial[l.employeeId] = '';
    }
    return initial;
  });
  const [justificativa, setJustificativa] = useState('');

  const candidatesByGroup = useMemo(() => {
    const grouped: Record<CandidateGroup, CandidateOption[]> = {
      clevel_ativo: [],
      mesmo_departamento: [],
      demais_lideres: [],
      nao_lider: [],
      condicional: [],
    };
    for (const c of candidates) {
      grouped[c.group].push(c);
    }
    return grouped;
  }, [candidates]);

  const trimmedLen = justificativa.trim().length;
  const isJustifTooShort = trimmedLen < JUSTIFICATIVA_MIN;
  const isJustifTooLong = trimmedLen > JUSTIFICATIVA_MAX;
  const isJustifInvalid = isJustifTooShort || isJustifTooLong;

  const allMapped = liderados.every((l) => {
    const v = mappings[l.employeeId];
    return v !== '' && v !== undefined;
  });

  const isSubmitting = submitting === true;
  const canSubmit = allMapped && !isJustifInvalid && !isSubmitting;

  function handleChangeMapping(liderado_employeeId: number, value: string): void {
    setMappings((prev) => ({
      ...prev,
      [liderado_employeeId]: value as TargetKey | '',
    }));
  }

  function handleConfirm(): void {
    if (!canSubmit) return;
    const output: TransferMapping[] = [];
    for (const l of liderados) {
      const v = mappings[l.employeeId];
      if (v === '' || v === undefined) return;
      const [tipo, idStr] = v.split(':');
      const id = Number(idStr);
      if ((tipo !== 'employee' && tipo !== 'clevel') || Number.isNaN(id)) return;
      output.push({
        liderado_employeeId: l.employeeId,
        novo_lider_tipo: tipo,
        novo_lider_id: id,
      });
    }
    void onConfirm(output, justificativa.trim());
  }

  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true" aria-labelledby="m2v2-title">
      <div style={BOX_STYLE}>
        <h2 id="m2v2-title" style={TITLE_STYLE}>
          Redistribuir liderados de {liderName}
        </h2>
        <div style={INFO_BLOCK_STYLE}>
          {liderName} tem <strong>{liderados.length} liderado(s) direto(s) ativo(s)</strong>.
          Selecione um novo líder para cada um antes de prosseguir. C-levels e demais líderes da
          empresa são elegíveis. Colaboradores não-líderes exigem confirmação de promoção.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {liderados.map((l) => (
            <div key={l.employeeId} style={LIDERADO_CARD_STYLE}>
              <div style={LIDERADO_ROW_STYLE}>
                <div style={AVATAR_STYLE}>{getIniciais(l.name)}</div>
                <div style={LIDERADO_INFO_STYLE}>
                  <span style={LIDERADO_NAME_STYLE}>{l.name}</span>
                  <span style={LIDERADO_META_STYLE}>
                    {l.cargo} · {l.departamento}
                  </span>
                </div>
              </div>
              <div>
                <label style={LABEL_STYLE} htmlFor={`novo-lider-${l.employeeId}`}>
                  Novo líder *
                </label>
                <select
                  id={`novo-lider-${l.employeeId}`}
                  value={mappings[l.employeeId] ?? ''}
                  onChange={(e) => handleChangeMapping(l.employeeId, e.target.value)}
                  style={SELECT_STYLE}
                  disabled={isSubmitting}
                >
                  <option value="">Selecione um novo líder...</option>
                  {GROUP_ORDER.map((group) => {
                    const items = candidatesByGroup[group];
                    if (items.length === 0) return null;
                    return (
                      <optgroup key={group} label={GROUP_LABELS[group]}>
                        {items.map((c) => (
                          <option key={optionKey(c)} value={optionKey(c)}>
                            {c.name} · {c.cargo} · {c.departamento} ({c.countLiderados} liderados)
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div>
          <label style={LABEL_STYLE} htmlFor="m2v2-justificativa">
            Justificativa da redistribuição *
          </label>
          <textarea
            id="m2v2-justificativa"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            style={TEXTAREA_STYLE}
            placeholder="Descreva o motivo da redistribuição (100 a 500 caracteres)."
            maxLength={JUSTIFICATIVA_MAX + 50}
            disabled={isSubmitting}
          />
          <div style={COUNTER_STYLE(isJustifInvalid)}>
            {trimmedLen}/{JUSTIFICATIVA_MAX} caracteres
          </div>
          {isJustifTooShort && trimmedLen > 0 ? (
            <div style={ERROR_STYLE}>A justificativa deve ter no mínimo 100 caracteres.</div>
          ) : null}
          {isJustifTooLong ? (
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
