// ROIP APP 9BOX — AlterarSenhaClient refactor canonico (ME-082).
//
// Refactor bit-exact conforme DOC 05 §14.6 + §18.5 + DOC 02 §4.7 +
// §5.9 (Caps Lock) + §4.10 (Modal dirty state).
//
// Refactor vs implementacao original ME-080b Dispatch 3:
//   - Card 480px (era 440px).
//   - Toggle mostrar/ocultar senha em cada um dos 3 campos.
//   - Banner Caps Lock canonico literal "Caps Lock ativado." acima do
//     input quando ativa (§5.9).
//   - Checklist dinamico da politica sob o campo Nova senha.
//   - Botao primario literal "Salvar nova senha" (era "Alterar senha").
//   - Textos canonicos com acentos corretos.
//   - Mensagens de erro literais §18.5.
//   - Sucesso: toast verde canto inferior direito literal "Senha
//     alterada com sucesso." + redirect para /meus-dados (era redirect
//     ao painel do perfil).
//   - Modal dirty state canonico §4.10 no Cancelar com campo
//     preenchido.
//
// Modo `forcado === true` (gate primeiro acesso ME-080b Dispatch 3)
// preservado bit-exact: sem sidebar, sem [Cancelar], texto explicativo
// obrigatoriedade, redirect ao painel do perfil apos sucesso. Canonico
// §14.6 nao aborda este modo — comportamento preservado por decisao
// canonica ME-082 sub-E082-3.1.
//
// **RV-13.** Consumido por page.tsx (mesma ME) + testes.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use client';

import { useRouter } from 'next/navigation';
import type { CSSProperties, FormEvent, JSX, KeyboardEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import { ModalDirtyState } from '../../components/ui/ModalDirtyState';

import { alterarSenhaAction } from './actions';

interface Props {
  readonly titularKind: 'super_admin' | 'platform';
  readonly forcado: boolean;
  readonly destinoAposTroca: string;
  readonly displayName: string;
}

/**
 * Comprimento minimo canonico da politica de senha (DOC 02 §4.7 +
 * §18.5). Exportado para tests bit-exact.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Mensagem canonica literal de politica de senha violada (DOC 05
 * §18.5). Exportada para tests bit-exact.
 */
export const MSG_POLITICA_SENHA: string =
  'A senha deve ter no mínimo 8 caracteres, pelo menos 1 letra e pelo menos 1 número.';

/** Mensagem canonica literal senha atual vazia (§18.5). */
export const MSG_SENHA_ATUAL_VAZIA: string = 'Informe sua senha atual.';

/** Mensagem canonica literal senha atual incorreta (§18.5). */
export const MSG_SENHA_ATUAL_INCORRETA: string = 'Senha atual incorreta.';

/** Mensagem canonica literal nova senha igual a atual (§18.5). */
export const MSG_NOVA_IGUAL_ATUAL: string = 'A nova senha deve ser diferente da atual.';

/** Mensagem canonica literal senhas divergem (§18.5). */
export const MSG_SENHAS_DIVERGEM: string = 'As senhas não coincidem.';

/** Mensagem canonica literal toast sucesso (§18.5 + DOC 02 §13.3). */
export const MSG_SENHA_ALTERADA_SUCESSO: string = 'Senha alterada com sucesso.';

/** Banner canonico literal Caps Lock ativo (DOC 02 §5.9). */
export const MSG_CAPS_LOCK: string = 'Caps Lock ativado.';

const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /[0-9]/;

interface ChecklistItem {
  readonly label: string;
  readonly ok: boolean;
}

function computeChecklist(senha: string): readonly ChecklistItem[] {
  return [
    { label: 'Mínimo de 8 caracteres', ok: senha.length >= PASSWORD_MIN_LENGTH },
    { label: 'Pelo menos 1 letra', ok: HAS_LETTER.test(senha) },
    { label: 'Pelo menos 1 número', ok: HAS_DIGIT.test(senha) },
  ];
}

function validatePolicy(senha: string): string | null {
  if (senha.length < PASSWORD_MIN_LENGTH || !HAS_LETTER.test(senha) || !HAS_DIGIT.test(senha)) {
    return MSG_POLITICA_SENHA;
  }
  return null;
}

// -----------------------------------------------------------------------
// Estilos canonicos (§2.1 + §14.6)
// -----------------------------------------------------------------------

const PAGE_STANDALONE_STYLE: CSSProperties = {
  minHeight: '100vh',
  background: COLORS.background.page,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const PAGE_WITH_LAYOUT_STYLE: CSSProperties = {
  padding: 32,
  display: 'flex',
  justifyContent: 'center',
};

const CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 12,
  padding: 28,
  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: COLORS.text.primary,
};

const SUBTITLE_STYLE: CSSProperties = {
  margin: '8px 0 20px',
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.text.secondary,
  marginBottom: 6,
};

const FIELD_WRAPPER_STYLE: CSSProperties = { marginBottom: 14 };

const INPUT_WRAPPER_STYLE: CSSProperties = { position: 'relative' };

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '10px 40px 10px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 14,
  color: COLORS.text.primary,
  boxSizing: 'border-box',
};

const TOGGLE_EYE_STYLE: CSSProperties = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  padding: 4,
  color: COLORS.text.tertiary,
};

const CAPS_LOCK_BANNER_STYLE: CSSProperties = {
  marginBottom: 4,
  padding: '6px 10px',
  background: COLORS.badge.warningBg,
  color: COLORS.badge.warningText,
  border: `1px solid ${COLORS.semantic.warning}`,
  borderRadius: 6,
  fontSize: 12,
};

const CHECKLIST_STYLE: CSSProperties = {
  marginTop: 8,
  padding: '10px 12px',
  background: COLORS.background.elevated,
  borderRadius: 6,
  fontSize: 12,
};

const CHECKLIST_ITEM_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 2,
};

const FOOTER_STYLE: CSSProperties = {
  marginTop: 20,
  paddingTop: 16,
  borderTop: `1px solid ${COLORS.border.divider}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const BTN_PRIMARY_STYLE: CSSProperties = {
  padding: '11px 20px',
  background: COLORS.primary.navy,
  color: COLORS.background.card,
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_DISABLED_STYLE: CSSProperties = {
  ...BTN_PRIMARY_STYLE,
  background: COLORS.background.elevated,
  color: COLORS.text.quaternary,
  cursor: 'not-allowed',
};

const BTN_OUTLINE_STYLE: CSSProperties = {
  padding: '11px 20px',
  background: COLORS.background.card,
  color: COLORS.text.secondary,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const ERROR_INLINE_STYLE: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: COLORS.badge.dangerText,
};

const ERROR_BOX_STYLE: CSSProperties = {
  marginTop: 12,
  padding: '10px 14px',
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 8,
  fontSize: 12,
};

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

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function AlterarSenhaClient(props: Props): JSX.Element {
  const { forcado, destinoAposTroca, displayName } = props;
  const router = useRouter();

  const [senhaAtual, setSenhaAtual] = useState<string>('');
  const [novaSenha, setNovaSenha] = useState<string>('');
  const [confirmar, setConfirmar] = useState<string>('');
  const [showAtual, setShowAtual] = useState<boolean>(false);
  const [showNova, setShowNova] = useState<boolean>(false);
  const [showConfirmar, setShowConfirmar] = useState<boolean>(false);
  const [capsAtual, setCapsAtual] = useState<boolean>(false);
  const [capsNova, setCapsNova] = useState<boolean>(false);
  const [capsConfirmar, setCapsConfirmar] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    readonly field: string;
    readonly msg: string;
  } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const [dirtyModalOpen, setDirtyModalOpen] = useState<boolean>(false);

  // Toast 3s (§2.9 verde).
  useEffect(() => {
    if (!toastVisible) return;
    const t = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(t);
  }, [toastVisible]);

  const hasAnyValue = senhaAtual.length > 0 || novaSenha.length > 0 || confirmar.length > 0;
  const confirmarDivergente =
    confirmar.length > 0 && novaSenha.length > 0 && confirmar !== novaSenha;

  const onKeyDetectCaps = useCallback(
    (setter: (v: boolean) => void) =>
      (e: KeyboardEvent<HTMLInputElement>): void => {
        setter(e.getModifierState('CapsLock'));
      },
    [],
  );

  const handleCancelar = useCallback(() => {
    if (hasAnyValue) {
      setDirtyModalOpen(true);
      return;
    }
    router.push('/meus-dados');
  }, [hasAnyValue, router]);

  const handleDescartar = useCallback(() => {
    setDirtyModalOpen(false);
    router.push('/meus-dados');
  }, [router]);

  const handleKeepEditing = useCallback(() => {
    setDirtyModalOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErrorMsg(null);
      setFieldError(null);

      if (senhaAtual.length === 0) {
        setFieldError({ field: 'senhaAtual', msg: MSG_SENHA_ATUAL_VAZIA });
        return;
      }
      const policyErr = validatePolicy(novaSenha);
      if (policyErr !== null) {
        setFieldError({ field: 'novaSenha', msg: policyErr });
        return;
      }
      if (novaSenha !== confirmar) {
        setFieldError({ field: 'confirmar', msg: MSG_SENHAS_DIVERGEM });
        return;
      }
      if (novaSenha === senhaAtual) {
        setFieldError({ field: 'novaSenha', msg: MSG_NOVA_IGUAL_ATUAL });
        return;
      }

      setSaving(true);
      try {
        const res = await alterarSenhaAction({ senhaAtual, novaSenha });
        if (!res.ok) {
          // Backend retorna mensagem literal canonica (§13.3 + §18.5).
          setErrorMsg(res.message);
          setSaving(false);
          return;
        }
        setToastVisible(true);
        // Delay curto para o toast aparecer antes do redirect.
        setTimeout(() => {
          router.push(destinoAposTroca);
          router.refresh();
        }, 700);
      } catch {
        setErrorMsg('Falha de rede ao alterar. Tente novamente.');
        setSaving(false);
      }
    },
    [senhaAtual, novaSenha, confirmar, destinoAposTroca, router],
  );

  const checklist = computeChecklist(novaSenha);

  // Modo forcado: card standalone (sem sidebar/header), sem [Cancelar],
  // texto explicativo. Modo voluntario: card dentro do Layout do perfil
  // (page.tsx envolve com Layout quando !forcado — a partir da ME-082
  // a mudanca de comportamento e feita na page.tsx).
  const pageStyle = forcado ? PAGE_STANDALONE_STYLE : PAGE_WITH_LAYOUT_STYLE;

  return (
    <div style={pageStyle}>
      <div style={CARD_STYLE}>
        <h1 style={TITLE_STYLE}>{forcado ? 'Defina sua nova senha' : 'Alterar senha'}</h1>
        <p style={SUBTITLE_STYLE}>
          {forcado ? (
            <>
              Olá, <strong>{displayName}</strong>. Este é seu primeiro acesso ao painel. Por
              segurança, você precisa trocar a senha inicial fornecida pelo RH antes de continuar.
            </>
          ) : (
            <>
              Trocando senha de <strong>{displayName}</strong>. A senha atual deixará de funcionar
              imediatamente após a confirmação.
            </>
          )}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          {/* Campo 1 — Senha atual */}
          <div style={FIELD_WRAPPER_STYLE}>
            <label style={LABEL_STYLE} htmlFor="senhaAtual">
              {forcado ? 'Senha inicial recebida do RH' : 'Senha atual'}
            </label>
            {capsAtual ? <div style={CAPS_LOCK_BANNER_STYLE}>{MSG_CAPS_LOCK}</div> : null}
            <div style={INPUT_WRAPPER_STYLE}>
              <input
                id="senhaAtual"
                type={showAtual ? 'text' : 'password'}
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                onKeyDown={onKeyDetectCaps(setCapsAtual)}
                onKeyUp={onKeyDetectCaps(setCapsAtual)}
                autoComplete="current-password"
                disabled={saving}
                placeholder="Digite sua senha atual"
                style={INPUT_STYLE}
              />
              <button
                type="button"
                onClick={() => setShowAtual((v) => !v)}
                style={TOGGLE_EYE_STYLE}
                aria-label={showAtual ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                tabIndex={-1}
              >
                {showAtual ? '🙈' : '👁'}
              </button>
            </div>
            {fieldError?.field === 'senhaAtual' ? (
              <div style={ERROR_INLINE_STYLE}>{fieldError.msg}</div>
            ) : null}
          </div>

          {/* Campo 2 — Nova senha */}
          <div style={FIELD_WRAPPER_STYLE}>
            <label style={LABEL_STYLE} htmlFor="novaSenha">
              Nova senha
            </label>
            {capsNova ? <div style={CAPS_LOCK_BANNER_STYLE}>{MSG_CAPS_LOCK}</div> : null}
            <div style={INPUT_WRAPPER_STYLE}>
              <input
                id="novaSenha"
                type={showNova ? 'text' : 'password'}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                onKeyDown={onKeyDetectCaps(setCapsNova)}
                onKeyUp={onKeyDetectCaps(setCapsNova)}
                autoComplete="new-password"
                disabled={saving}
                placeholder="Escolha uma nova senha"
                style={INPUT_STYLE}
              />
              <button
                type="button"
                onClick={() => setShowNova((v) => !v)}
                style={TOGGLE_EYE_STYLE}
                aria-label={showNova ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                tabIndex={-1}
              >
                {showNova ? '🙈' : '👁'}
              </button>
            </div>
            <div style={CHECKLIST_STYLE}>
              {checklist.map((item) => (
                <div key={item.label} style={CHECKLIST_ITEM_STYLE}>
                  <span
                    style={{
                      color: item.ok ? COLORS.semantic.success : COLORS.text.tertiary,
                      fontWeight: 700,
                    }}
                  >
                    {item.ok ? '✓' : '○'}
                  </span>
                  <span
                    style={{
                      color: item.ok ? COLORS.badge.successText : COLORS.text.secondary,
                    }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            {fieldError?.field === 'novaSenha' ? (
              <div style={ERROR_INLINE_STYLE}>{fieldError.msg}</div>
            ) : null}
          </div>

          {/* Campo 3 — Confirmar nova senha */}
          <div style={FIELD_WRAPPER_STYLE}>
            <label style={LABEL_STYLE} htmlFor="confirmar">
              Confirmar nova senha
            </label>
            {capsConfirmar ? <div style={CAPS_LOCK_BANNER_STYLE}>{MSG_CAPS_LOCK}</div> : null}
            <div style={INPUT_WRAPPER_STYLE}>
              <input
                id="confirmar"
                type={showConfirmar ? 'text' : 'password'}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                onKeyDown={onKeyDetectCaps(setCapsConfirmar)}
                onKeyUp={onKeyDetectCaps(setCapsConfirmar)}
                autoComplete="new-password"
                disabled={saving}
                placeholder="Repita a nova senha"
                style={INPUT_STYLE}
              />
              <button
                type="button"
                onClick={() => setShowConfirmar((v) => !v)}
                style={TOGGLE_EYE_STYLE}
                aria-label={
                  showConfirmar ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'
                }
                tabIndex={-1}
              >
                {showConfirmar ? '🙈' : '👁'}
              </button>
            </div>
            {(fieldError?.field === 'confirmar' || confirmarDivergente) && !saving ? (
              <div style={ERROR_INLINE_STYLE}>
                {fieldError?.field === 'confirmar' ? fieldError.msg : MSG_SENHAS_DIVERGEM}
              </div>
            ) : null}
          </div>

          <div style={FOOTER_STYLE}>
            {forcado ? (
              <span style={{ fontSize: 12, color: COLORS.text.secondary }}>
                Obrigatório para continuar.
              </span>
            ) : (
              <button
                type="button"
                onClick={handleCancelar}
                disabled={saving}
                style={BTN_OUTLINE_STYLE}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              style={saving ? BTN_DISABLED_STYLE : BTN_PRIMARY_STYLE}
            >
              {saving ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </div>

          {errorMsg !== null ? <div style={ERROR_BOX_STYLE}>{errorMsg}</div> : null}
        </form>
      </div>

      {toastVisible ? <div style={TOAST_STYLE}>{MSG_SENHA_ALTERADA_SUCESSO}</div> : null}

      <ModalDirtyState
        open={dirtyModalOpen}
        onKeepEditing={handleKeepEditing}
        onDiscard={handleDescartar}
      />
    </div>
  );
}
