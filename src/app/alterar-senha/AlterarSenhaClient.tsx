// ROIP APP 9BOX — AlterarSenhaClient (ME-080b Dispatch 3).
//
// Client component canonico da rota `/alterar-senha`. Form controlado
// com 3 campos: senha atual, nova senha, confirmar nova senha. Delega
// ao `alterarSenhaAction` (server action que chama `auth.changePassword`
// via createCallerFactory).
//
// Estados canonicos:
//   - `forcado === true`: gate de primeiro acesso — sem link "Cancelar",
//     texto explicativo sobre a obrigatoriedade. Titular veio de painel
//     via redirect por `passwordSet=false`.
//   - `forcado === false`: troca voluntaria — link "Cancelar" leva de
//     volta ao painel.
//
// Validacao client-side canonica (§4.7):
//   - Todos os campos obrigatorios.
//   - Nova !== atual.
//   - Confirmar === nova.
//   - Politica de senha (min 8 chars, letra + numero — a mesma do
//     `passwordGenerator` Dispatch 1). Backend re-valida via
//     `isPasswordPolicyValid` de `auth.ts`.

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent, type JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

import { alterarSenhaAction } from './actions';

interface Props {
  readonly titularKind: 'super_admin' | 'platform';
  readonly forcado: boolean;
  readonly destinoAposTroca: string;
  readonly displayName: string;
}

const PAGE_STYLE = {
  minHeight: '100vh',
  background: COLORS.background.page,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  padding: 16,
};

const CARD_STYLE = {
  width: '100%',
  maxWidth: 440,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 12,
  padding: 28,
  boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
};

const TITLE_STYLE = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600 as const,
  color: COLORS.text.primary,
};

const SUBTITLE_STYLE = {
  margin: '8px 0 20px',
  fontSize: 13,
  color: COLORS.text.secondary,
  lineHeight: 1.5,
};

const LABEL_STYLE = {
  display: 'block' as const,
  fontSize: 12,
  fontWeight: 500 as const,
  color: COLORS.text.secondary,
  marginBottom: 6,
};

const INPUT_STYLE = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 14,
  color: COLORS.text.primary,
  boxSizing: 'border-box' as const,
};

const FIELD_WRAPPER_STYLE = { marginBottom: 14 };

const BTN_PRIMARY_STYLE = {
  padding: '11px 20px',
  background: COLORS.accent.teal,
  color: COLORS.background.card,
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600 as const,
  cursor: 'pointer' as const,
};

const BTN_DISABLED_STYLE = {
  ...BTN_PRIMARY_STYLE,
  background: COLORS.background.elevated,
  color: COLORS.text.quaternary,
  cursor: 'not-allowed' as const,
};

const BTN_LINK_STYLE = {
  padding: '11px 12px',
  background: 'transparent',
  color: COLORS.text.secondary,
  border: 'none',
  fontSize: 13,
  fontWeight: 500 as const,
  cursor: 'pointer' as const,
};

const ERROR_STYLE = {
  marginTop: 12,
  padding: '10px 14px',
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
  border: `1px solid ${COLORS.semantic.danger}`,
  borderRadius: 8,
  fontSize: 12,
};

const SUCCESS_STYLE = {
  marginTop: 12,
  padding: '10px 14px',
  background: COLORS.badge.successBg,
  color: COLORS.badge.successText,
  border: `1px solid ${COLORS.semantic.success}`,
  borderRadius: 8,
  fontSize: 12,
};

const PASSWORD_MIN_LENGTH = 8;
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /[0-9]/;

function validatePolicy(senha: string): string | null {
  if (senha.length < PASSWORD_MIN_LENGTH) {
    return `Nova senha deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!HAS_LETTER.test(senha)) {
    return 'Nova senha deve conter ao menos uma letra.';
  }
  if (!HAS_DIGIT.test(senha)) {
    return 'Nova senha deve conter ao menos um numero.';
  }
  return null;
}

export function AlterarSenhaClient(props: Props): JSX.Element {
  const { forcado, destinoAposTroca, displayName } = props;
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErrorMsg(null);
      setSuccessMsg(null);

      if (senhaAtual.length === 0) {
        setErrorMsg('Informe a senha atual.');
        return;
      }
      const policyErr = validatePolicy(novaSenha);
      if (policyErr !== null) {
        setErrorMsg(policyErr);
        return;
      }
      if (novaSenha !== confirmar) {
        setErrorMsg('Confirmacao nao confere com a nova senha.');
        return;
      }
      if (novaSenha === senhaAtual) {
        setErrorMsg('A nova senha deve ser diferente da atual.');
        return;
      }

      setSaving(true);
      try {
        const res = await alterarSenhaAction({ senhaAtual, novaSenha });
        if (!res.ok) {
          setErrorMsg(res.message);
          setSaving(false);
          return;
        }
        setSuccessMsg('Senha alterada com sucesso. Redirecionando...');
        // Delay curto para o usuario ver o feedback antes do redirect.
        setTimeout(() => {
          router.push(destinoAposTroca);
          router.refresh();
        }, 900);
      } catch {
        setErrorMsg('Falha de rede ao alterar. Tente novamente.');
        setSaving(false);
      }
    },
    [senhaAtual, novaSenha, confirmar, destinoAposTroca, router],
  );

  return (
    <div style={PAGE_STYLE}>
      <div style={CARD_STYLE}>
        <h1 style={TITLE_STYLE}>{forcado ? 'Defina sua nova senha' : 'Alterar senha'}</h1>
        <p style={SUBTITLE_STYLE}>
          {forcado ? (
            <>
              Ola, <strong>{displayName}</strong>. Este e seu primeiro acesso ao painel. Por
              seguranca, voce precisa trocar a senha inicial fornecida pelo RH antes de continuar.
            </>
          ) : (
            <>
              Trocando senha de <strong>{displayName}</strong>. A senha atual deixara de funcionar
              imediatamente apos a confirmacao.
            </>
          )}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div style={FIELD_WRAPPER_STYLE}>
            <label style={LABEL_STYLE} htmlFor="senhaAtual">
              {forcado ? 'Senha inicial recebida do RH' : 'Senha atual'}
            </label>
            <input
              id="senhaAtual"
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
              disabled={saving}
              style={INPUT_STYLE}
            />
          </div>

          <div style={FIELD_WRAPPER_STYLE}>
            <label style={LABEL_STYLE} htmlFor="novaSenha">
              Nova senha (min. 8 caracteres, com letra e numero)
            </label>
            <input
              id="novaSenha"
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
              style={INPUT_STYLE}
            />
          </div>

          <div style={FIELD_WRAPPER_STYLE}>
            <label style={LABEL_STYLE} htmlFor="confirmar">
              Confirmar nova senha
            </label>
            <input
              id="confirmar"
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
              style={INPUT_STYLE}
            />
          </div>

          <div
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {forcado ? (
              <span style={{ fontSize: 12, color: COLORS.text.secondary }}>
                Obrigatorio para continuar.
              </span>
            ) : (
              <button
                type="button"
                onClick={() => router.push(destinoAposTroca)}
                disabled={saving}
                style={BTN_LINK_STYLE}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              style={saving ? BTN_DISABLED_STYLE : BTN_PRIMARY_STYLE}
            >
              {saving ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>

          {errorMsg !== null ? <div style={ERROR_STYLE}>{errorMsg}</div> : null}
          {successMsg !== null ? <div style={SUCCESS_STYLE}>{successMsg}</div> : null}
        </form>
      </div>
    </div>
  );
}
