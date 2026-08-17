// ROIP APP 9BOX — MeusDadosClient (ME-082).
//
// Client component canonico da rota /meus-dados. Render condicional
// H1a (Super Admin — editavel inline) vs H1b (RH/RH-Lider/C-level/
// Lider — read-only + microcopy).
//
// Fluxos canonicos:
//   - H1a: [Editar] nome inline (Enter salva, ESC cancela) — dispara
//     `atualizarNomeAction` (S511). Sucesso: toast literal "Nome
//     atualizado." + propagacao no card, header, avatar (iniciais).
//   - H1b: reveal CPF inline (mascara <-> completo, sem backend).
//   - Ambos: botao [Alterar senha] navega para /alterar-senha; H1a
//     tem tambem [Alterar e-mail] navegando para /alterar-email (rota
//     ainda inexistente — D-ALTERAR-EMAIL registrado, bloco pos-B9).
//
// **RV-13.** Consumido por page.tsx (mesma ME).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use client';

import { useRouter } from 'next/navigation';
import type { CSSProperties, JSX, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import { initialsFromName } from '../../lib/avatar/initials';

import { atualizarNomeAction } from './actions';
import {
  MSG_NOME_ATUALIZADO,
  MSG_NOME_OBRIGATORIO,
  NOME_MAX_LENGTH,
  calcularIdade,
  calcularTempoEmpresa,
  formatCpf,
  formatarDataBR,
  formatarIdade,
  formatarTempoEmpresa,
  maskCpf,
  validateNome,
  type MeusDadosH1aPayload,
  type MeusDadosH1bPayload,
  type MeusDadosPayload,
} from './internals';

interface Props {
  readonly payload: MeusDadosPayload;
}

// -----------------------------------------------------------------------
// Estilos canonicos (§2.1 + §14.5)
// -----------------------------------------------------------------------

const PAGE_STYLE: CSSProperties = {
  padding: 32,
  display: 'flex',
  justifyContent: 'center',
};

const CARD_H1A_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 680,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 12,
  padding: 28,
  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
};

const CARD_H1B_STYLE: CSSProperties = {
  ...CARD_H1A_STYLE,
  maxWidth: 720,
};

const SECTION_STYLE: CSSProperties = {
  paddingTop: 20,
  paddingBottom: 20,
  borderTop: `1px solid ${COLORS.border.divider}`,
};

const FIRST_SECTION_STYLE: CSSProperties = {
  ...SECTION_STYLE,
  paddingTop: 0,
  borderTop: 'none',
};

const AVATAR_STYLE: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  background: COLORS.accent.teal,
  color: COLORS.background.card,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 24,
  fontWeight: 600,
  flexShrink: 0,
};

const LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 4,
};

const VALUE_STYLE: CSSProperties = {
  fontSize: 14,
  color: COLORS.text.primary,
};

const NAME_VALUE_STYLE: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: COLORS.text.primary,
};

const BADGE_PILL_STYLE: CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 999,
  background: COLORS.badge.rhBg,
  color: COLORS.badge.rhText,
  fontSize: 12,
  fontWeight: 500,
  marginLeft: 10,
};

const BTN_OUTLINE_NAVY_STYLE: CSSProperties = {
  padding: '8px 14px',
  background: COLORS.background.card,
  color: COLORS.primary.navy,
  border: `1px solid ${COLORS.primary.navy}`,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const BTN_EDIT_INLINE_STYLE: CSSProperties = {
  marginLeft: 10,
  padding: '4px 10px',
  background: 'transparent',
  color: COLORS.primary.navy,
  border: 'none',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const INPUT_STYLE: CSSProperties = {
  padding: '8px 10px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  fontSize: 14,
  color: COLORS.text.primary,
  width: 320,
};

const INPUT_ERROR_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  border: `1px solid ${COLORS.semantic.danger}`,
};

const ERROR_INLINE_STYLE: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: COLORS.badge.dangerText,
};

const BTN_CANCEL_STYLE: CSSProperties = {
  ...BTN_OUTLINE_NAVY_STYLE,
  marginLeft: 8,
  color: COLORS.text.secondary,
  border: `1px solid ${COLORS.border.default}`,
};

const BTN_SAVE_STYLE: CSSProperties = {
  ...BTN_OUTLINE_NAVY_STYLE,
  marginLeft: 8,
  background: COLORS.primary.navy,
  color: COLORS.background.card,
  border: `1px solid ${COLORS.primary.navy}`,
};

const INFO_LINE_STYLE: CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: `1px dashed ${COLORS.border.divider}`,
  fontSize: 12,
  color: COLORS.text.tertiary,
};

const ROW_BETWEEN_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const GRID_2_COL_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
};

const CPF_REVEAL_BTN_STYLE: CSSProperties = {
  marginLeft: 8,
  background: 'transparent',
  border: 'none',
  color: COLORS.primary.navy,
  cursor: 'pointer',
  fontSize: 14,
};

const MICROCOPY_STYLE: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: COLORS.text.tertiary,
};

const STATUS_BADGE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 999,
  background: COLORS.badge.successBg,
  color: COLORS.badge.successText,
  fontSize: 12,
  fontWeight: 500,
};

const STATUS_DOT_STYLE: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: COLORS.semantic.success,
};

// -----------------------------------------------------------------------
// Toast local (padrao B8 — sem ToastProvider global; DOC 05 §2.9)
// -----------------------------------------------------------------------

const TOAST_STYLE: CSSProperties = {
  position: 'fixed',
  right: 24,
  bottom: 24,
  padding: '10px 16px',
  borderRadius: 10,
  background: COLORS.badge.successBg,
  color: COLORS.badge.successText,
  border: `1px solid ${COLORS.semantic.success}`,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  fontSize: 13,
  fontWeight: 500,
  zIndex: 500,
};

interface ToastState {
  readonly visible: boolean;
  readonly message: string;
}

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function MeusDadosClient(props: Props): JSX.Element {
  const { payload } = props;
  if (payload.kind === 'h1a') {
    return <H1aSuperAdmin initial={payload} />;
  }
  return <H1bDemaisPerfis payload={payload} />;
}

// -----------------------------------------------------------------------
// H1a — Super Admin (editavel inline)
// -----------------------------------------------------------------------

interface H1aProps {
  readonly initial: MeusDadosH1aPayload;
}

function H1aSuperAdmin(props: H1aProps): JSX.Element {
  const { initial } = props;
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string>(initial.displayName);
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>(initial.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '' });

  useEffect(() => {
    if (!toast.visible) return;
    const t = setTimeout(() => setToast({ visible: false, message: '' }), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const iniciais = useMemo(() => initialsFromName(displayName), [displayName]);
  const contaCriadaBR = useMemo(
    () => formatarDataBR(initial.contaCriadaEm),
    [initial.contaCriadaEm],
  );

  const startEdit = useCallback(() => {
    setDraft(displayName);
    setError(null);
    setEditing(true);
  }, [displayName]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
    setDraft(displayName);
  }, [displayName]);

  const doSave = useCallback(async () => {
    const errMsg = validateNome(draft);
    if (errMsg !== null) {
      setError(errMsg);
      return;
    }
    setSaving(true);
    try {
      const res = await atualizarNomeAction({ nome: draft });
      if (!res.ok) {
        setError(res.message);
        setSaving(false);
        return;
      }
      setDisplayName(res.data.novoNome);
      setEditing(false);
      setError(null);
      setSaving(false);
      setToast({ visible: true, message: MSG_NOME_ATUALIZADO });
      // Refresh do server component para propagar novoNome ao Layout
      // (header/avatar) na proxima navegacao. Toast local ja propaga no
      // card/avatar imediatamente via state.
      router.refresh();
    } catch {
      setError('Falha de rede ao salvar. Tente novamente.');
      setSaving(false);
    }
  }, [draft, router]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void doSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [doSave, cancelEdit],
  );

  return (
    <div style={PAGE_STYLE}>
      <div style={CARD_H1A_STYLE}>
        {/* Secao 1 — Dados pessoais */}
        <div style={FIRST_SECTION_STYLE}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={AVATAR_STYLE}>{iniciais}</div>
            <div style={{ flex: 1 }}>
              <div style={LABEL_STYLE}>Nome</div>
              {!editing ? (
                <div style={ROW_BETWEEN_STYLE}>
                  <span style={NAME_VALUE_STYLE}>{displayName}</span>
                  <button type="button" onClick={startEdit} style={BTN_EDIT_INLINE_STYLE}>
                    ✎ Editar
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKeyDown}
                      onFocus={(e) => e.currentTarget.select()}
                      maxLength={NOME_MAX_LENGTH}
                      disabled={saving}
                      style={error !== null ? INPUT_ERROR_STYLE : INPUT_STYLE}
                      aria-label="Editar nome"
                    />
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      style={BTN_CANCEL_STYLE}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void doSave()}
                      disabled={saving}
                      style={BTN_SAVE_STYLE}
                    >
                      {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                  {error !== null ? <div style={ERROR_INLINE_STYLE}>{error}</div> : null}
                </div>
              )}
              <div style={INFO_LINE_STYLE}>Conta criada em: {contaCriadaBR}</div>
            </div>
          </div>
        </div>

        {/* Secao 2 — Credenciais */}
        <div style={SECTION_STYLE}>
          <div style={ROW_BETWEEN_STYLE}>
            <div>
              <div style={LABEL_STYLE}>E-mail</div>
              <div style={VALUE_STYLE}>{initial.email}</div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/alterar-email')}
              style={BTN_OUTLINE_NAVY_STYLE}
            >
              Alterar e-mail
            </button>
          </div>
          <div
            style={{
              ...ROW_BETWEEN_STYLE,
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${COLORS.border.divider}`,
            }}
          >
            <div>
              <div style={LABEL_STYLE}>Senha</div>
              <div style={VALUE_STYLE}>••••••••</div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/alterar-senha')}
              style={BTN_OUTLINE_NAVY_STYLE}
            >
              Alterar senha
            </button>
          </div>
        </div>
      </div>
      {toast.visible ? <div style={TOAST_STYLE}>{toast.message}</div> : null}
    </div>
  );
}

// -----------------------------------------------------------------------
// H1b — RH / RH-Lider / C-level / Lider (read-only)
// -----------------------------------------------------------------------

interface H1bProps {
  readonly payload: MeusDadosH1bPayload;
}

function H1bDemaisPerfis(props: H1bProps): JSX.Element {
  const { payload } = props;
  const router = useRouter();
  const [cpfRevelado, setCpfRevelado] = useState<boolean>(false);

  const iniciais = useMemo(() => initialsFromName(payload.displayName), [payload.displayName]);

  const idade = useMemo(
    () => calcularIdade(payload.dataNascimento, new Date()),
    [payload.dataNascimento],
  );
  const tempoEmp = useMemo(
    () => calcularTempoEmpresa(payload.dataAdmissao, new Date()),
    [payload.dataAdmissao],
  );

  const cpfExibido = cpfRevelado ? formatCpf(payload.cpfCompleto) : maskCpf(payload.cpfCompleto);

  return (
    <div style={PAGE_STYLE}>
      <div style={CARD_H1B_STYLE}>
        {/* Secao 1 — Dados pessoais */}
        <div style={FIRST_SECTION_STYLE}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={AVATAR_STYLE}>{iniciais}</div>
            <div style={{ flex: 1 }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 600, color: COLORS.text.primary }}>
                  {payload.displayName}
                </span>
                <span style={BADGE_PILL_STYLE}>{payload.badgePapel}</span>
              </div>
              <div style={{ ...GRID_2_COL_STYLE, marginTop: 16 }}>
                <div>
                  <div style={LABEL_STYLE}>CPF</div>
                  <div style={{ ...VALUE_STYLE, display: 'flex', alignItems: 'center' }}>
                    <span>{cpfExibido}</span>
                    <button
                      type="button"
                      onClick={() => setCpfRevelado((v) => !v)}
                      style={CPF_REVEAL_BTN_STYLE}
                      aria-label={cpfRevelado ? 'Ocultar CPF' : 'Revelar CPF'}
                    >
                      {cpfRevelado ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                <div>
                  <div style={LABEL_STYLE}>Data de nascimento</div>
                  <div style={VALUE_STYLE}>
                    {formatarDataBR(payload.dataNascimento)}{' '}
                    <span style={{ color: COLORS.text.tertiary, fontSize: 12 }}>
                      {formatarIdade(idade)}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={LABEL_STYLE}>Data de admissão</div>
                  <div style={VALUE_STYLE}>
                    {formatarDataBR(payload.dataAdmissao)}{' '}
                    <span style={{ color: COLORS.text.tertiary, fontSize: 12 }}>
                      {formatarTempoEmpresa(tempoEmp.anos, tempoEmp.meses)}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={LABEL_STYLE}>Status</div>
                  {payload.statusAtivo ? (
                    <div style={STATUS_BADGE_STYLE}>
                      <span style={STATUS_DOT_STYLE} />
                      Ativo
                    </div>
                  ) : (
                    <div
                      style={{
                        ...STATUS_BADGE_STYLE,
                        background: COLORS.badge.dangerBg,
                        color: COLORS.badge.dangerText,
                      }}
                    >
                      Inativo
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Secao 2 — Vinculo profissional */}
        <div style={SECTION_STYLE}>
          <div style={{ ...LABEL_STYLE, marginBottom: 12, fontSize: 12 }}>Vínculo profissional</div>
          <div style={GRID_2_COL_STYLE}>
            {payload.vinculo.tipo === 'employee' ? (
              <>
                <FieldRO label="Papel na plataforma" value={payload.vinculo.papelPlataforma} />
                <FieldRO label="Cargo" value={payload.vinculo.cargo} />
                <FieldRO label="CBO" value={payload.vinculo.cbo} />
                <FieldRO label="Descrição do CBO" value={payload.vinculo.descricaoCBO} />
                <FieldRO label="Família de função" value={payload.vinculo.familiaFuncao} />
                <FieldRO label="Senioridade" value={payload.vinculo.senioridade} />
                <FieldRO label="Nível hierárquico" value={payload.vinculo.nivelHierarquico} />
                <FieldRO label="Departamento" value={payload.vinculo.departamento} />
                <FieldRO label="Líder direto" value={payload.vinculo.liderDireto ?? '—'} />
              </>
            ) : (
              <>
                <FieldRO label="Papel na plataforma" value={payload.vinculo.papelPlataforma} />
                <FieldRO label="Cargo" value={payload.vinculo.cargo} />
                <FieldRO label="Descrição do cargo" value={payload.vinculo.descricaoCargo} />
                <FieldRO label="Departamento" value={payload.vinculo.departamento} />
                <FieldRO
                  label="Escopo de visualização"
                  value={payload.vinculo.escopoVisualizacao}
                />
              </>
            )}
          </div>
        </div>

        {/* Secao 3 — Credenciais */}
        <div style={SECTION_STYLE}>
          <div>
            <div style={LABEL_STYLE}>E-mail</div>
            <div style={VALUE_STYLE}>{payload.email ?? '—'}</div>
            <div style={MICROCOPY_STYLE}>{payload.microcopyAlterarEmail}</div>
          </div>
          <div
            style={{
              ...ROW_BETWEEN_STYLE,
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${COLORS.border.divider}`,
            }}
          >
            <div>
              <div style={LABEL_STYLE}>Senha</div>
              <div style={VALUE_STYLE}>••••••••</div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/alterar-senha')}
              style={BTN_OUTLINE_NAVY_STYLE}
            >
              Alterar senha
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRO(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div>
      <div style={LABEL_STYLE}>{props.label}</div>
      <div style={VALUE_STYLE}>{props.value}</div>
    </div>
  );
}

/** Re-export para asserts em testes. */
export { MSG_NOME_OBRIGATORIO, MSG_NOME_ATUALIZADO };
