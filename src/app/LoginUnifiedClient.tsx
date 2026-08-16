'use client';

// ROIP APP 9BOX — client component `/` login unificado (ME-Rota-C-D075).
//
// Origem canonica:
// - DOC 05 §14.1 (login unificado — layout, campos, estados de UI).
// - DOC 02 §4.1 (fluxo canonico a-i backend).
// - DOC 02 §4.4 (modal `[Esqueci minha senha]` — branch CPF).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
// - DOC 02 §5.9 (banner Caps Lock canonico literal).
// - Referencia visual: `login_unificado_v1.html`.
//
// Escopo canonico bit-exact:
// - Card centralizado 420px, background `#F9FAFB` (page).
// - Campos: CPF (mascara `000.000.000-00`), Senha (password + toggle
//   mostrar/ocultar + banner Caps Lock canonico).
// - Link `[Esqueci minha senha]` abre modal com branch CPF (§4.4).
// - Botao primario navy `[Entrar]` — chama `loginPlatformAction`.
// - Rodape: botao discreto `[Acessar como Super Admin]` — link para
//   `/login-super-admin`.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `LoginUnifiedClient` → `src/app/page.tsx` (mesma rota).

import Image from 'next/image';
import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type JSX,
} from 'react';

import { COLORS } from '../lib/design-tokens/colors';

import { forgotPasswordUnifiedAction, loginPlatformAction } from './actions';

// -----------------------------------------------------------------------
// Mascaras + normalizacao canonicas
// -----------------------------------------------------------------------

function applyCpfMask(digitsOrMasked: string): string {
  const digits = digitsOrMasked.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function stripCpfMask(masked: string): string {
  return masked.replace(/\D/g, '');
}

// -----------------------------------------------------------------------
// Estilos canonicos bit-exact §14.1
// -----------------------------------------------------------------------

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  background: COLORS.background.page,
  display: 'flex',
  flexDirection: 'column',
};

const HEADER_STYLE: CSSProperties = {
  // ME-080d Onda 1c — D14=Y: padding-top maior desloca a logo para baixo
  // do topo da pagina, centralizando visualmente no espaco entre o
  // topo e o topo do card de login (que fica centralizado verticalmente
  // no MAIN_STYLE). 80px top + 40px bottom = ~120px de altura do header,
  // logo aparece a ~110px do topo (80 + 30 para o centro vertical da
  // logo de 60px).
  padding: '80px 24px 40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ME-080d Onda 1c — D13=A: logo oficial ROIPeople no lugar do texto
// placeholder "ROIP APP". Altura 60px preserva legibilidade e proporcao
// visual entre header e card. `priority` para LCP.
const LOGO_HEIGHT = 60;
const LOGO_WIDTH = 170; // ratio ~2.83 do PNG oficial (1822x658).

const MAIN_STYLE: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 32,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.text.secondary,
  marginBottom: 6,
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  color: COLORS.text.primary,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: '#FFFFFF',
  background: COLORS.primary.navy,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const PRIMARY_BUTTON_DISABLED_STYLE: CSSProperties = {
  ...PRIMARY_BUTTON_STYLE,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const LINK_BUTTON_STYLE: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: COLORS.accent.teal,
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'none',
};

const FOOTER_BUTTON_STYLE: CSSProperties = {
  ...LINK_BUTTON_STYLE,
  display: 'block',
  margin: '16px auto 0 auto',
  color: COLORS.text.tertiary,
};

const ERROR_BANNER_STYLE: CSSProperties = {
  padding: '10px 12px',
  background: COLORS.badge.dangerBg,
  color: COLORS.badge.dangerText,
  border: `1px solid ${COLORS.badge.dangerText}`,
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 16,
};

const CAPS_LOCK_BANNER_STYLE: CSSProperties = {
  padding: '6px 10px',
  background: COLORS.badge.warningBg,
  color: COLORS.badge.warningText,
  border: `1px solid ${COLORS.badge.warningText}`,
  borderRadius: 6,
  fontSize: 12,
  marginBottom: 6,
};

const MODAL_BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};

const MODAL_CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: COLORS.background.card,
  borderRadius: 8,
  padding: 24,
  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
};

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function LoginUnifiedClient(): JSX.Element {
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotCpf, setForgotCpf] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string>('');

  const cpfDigits = useMemo(() => stripCpfMask(cpf), [cpf]);
  const canSubmit = cpfDigits.length === 11 && senha.length > 0 && !loading;

  const handleCpfChange = useCallback((v: string) => {
    setCpf(applyCpfMask(v));
    setErrorMessage(null);
  }, []);

  const handleSenhaKeyEvent = useCallback((evt: React.KeyboardEvent<HTMLInputElement>) => {
    // Detecta Caps Lock via `getModifierState` (canonico bit-exact §5.9).
    setCapsLockOn(evt.getModifierState('CapsLock'));
  }, []);

  const handleSubmit = useCallback(
    async (evt: FormEvent<HTMLFormElement>) => {
      evt.preventDefault();
      if (!canSubmit) return;
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await loginPlatformAction({ cpf: cpfDigits, senha });
        if (result.success) {
          // Redirect canonico executado server-side pelo action; codigo
          // apos redirect nao roda (Next 15 throws NEXT_REDIRECT).
          return;
        }
        setErrorMessage(result.message);
      } catch (err) {
        // NEXT_REDIRECT sai como throw canonico do server action; nao
        // e erro de UI — deixa o browser navegar.
        if (isNextRedirect(err)) throw err;
        setErrorMessage('Erro inesperado. Tente novamente.');
      } finally {
        setLoading(false);
      }
    },
    [canSubmit, cpfDigits, senha],
  );

  const handleForgotOpen = useCallback(() => {
    setForgotOpen(true);
    setForgotStep(1);
    setForgotCpf('');
    setForgotMessage('');
  }, []);

  const handleForgotClose = useCallback(() => {
    setForgotOpen(false);
  }, []);

  const handleForgotSubmit = useCallback(async () => {
    const cpfDigitsForgot = stripCpfMask(forgotCpf);
    if (cpfDigitsForgot.length !== 11) return;
    setForgotLoading(true);
    try {
      const result = await forgotPasswordUnifiedAction({ cpf: cpfDigitsForgot });
      setForgotMessage(result.msg);
      setForgotStep(2);
    } catch {
      setForgotMessage('Erro inesperado. Tente novamente.');
      setForgotStep(2);
    } finally {
      setForgotLoading(false);
    }
  }, [forgotCpf]);

  return (
    <div style={PAGE_STYLE}>
      <header style={HEADER_STYLE}>
        <Image
          src="/brand/roipeople-horizontal.png"
          alt="ROIPeople"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          priority
          style={{ height: LOGO_HEIGHT, width: 'auto' }}
        />
      </header>
      <main style={MAIN_STYLE}>
        <div style={CARD_STYLE}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.text.primary,
              margin: '0 0 20px 0',
              textAlign: 'center',
            }}
          >
            Acesse sua conta
          </h1>

          {errorMessage !== null ? <div style={ERROR_BANNER_STYLE}>{errorMessage}</div> : null}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: 16 }}>
              <label style={LABEL_STYLE} htmlFor="cpf">
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                placeholder="000.000.000-00"
                maxLength={14}
                value={cpf}
                onChange={(e) => handleCpfChange(e.target.value)}
                style={INPUT_STYLE}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={LABEL_STYLE} htmlFor="senha">
                Senha
              </label>
              {capsLockOn ? <div style={CAPS_LOCK_BANNER_STYLE}>Caps Lock ativado.</div> : null}
              <div style={{ position: 'relative' }}>
                <input
                  id="senha"
                  type={showSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={handleSenhaKeyEvent}
                  onKeyUp={handleSenhaKeyEvent}
                  style={{ ...INPUT_STYLE, paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: COLORS.text.tertiary,
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 4,
                  }}
                >
                  {showSenha ? 'ocultar' : 'mostrar'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20, textAlign: 'right' }}>
              <button type="button" onClick={handleForgotOpen} style={LINK_BUTTON_STYLE}>
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={canSubmit ? PRIMARY_BUTTON_STYLE : PRIMARY_BUTTON_DISABLED_STYLE}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <a href="/login-super-admin" style={{ ...FOOTER_BUTTON_STYLE, textAlign: 'center' }}>
            Acessar como Super Admin
          </a>
        </div>
      </main>

      {forgotOpen ? (
        <div style={MODAL_BACKDROP_STYLE} role="dialog" aria-modal="true">
          <div style={MODAL_CARD_STYLE}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: COLORS.text.primary,
                margin: '0 0 12px 0',
              }}
            >
              {forgotStep === 1 ? 'Esqueci minha senha' : 'Verifique seu e-mail'}
            </h2>
            {forgotStep === 1 ? (
              <>
                <label style={LABEL_STYLE} htmlFor="cpfReset">
                  CPF
                </label>
                <input
                  id="cpfReset"
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  value={forgotCpf}
                  onChange={(e) => setForgotCpf(applyCpfMask(e.target.value))}
                  style={{ ...INPUT_STYLE, marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleForgotClose}
                    style={{
                      padding: '8px 14px',
                      background: 'transparent',
                      border: `1px solid ${COLORS.border.default}`,
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      color: COLORS.text.secondary,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleForgotSubmit}
                    disabled={stripCpfMask(forgotCpf).length !== 11 || forgotLoading}
                    style={
                      stripCpfMask(forgotCpf).length === 11 && !forgotLoading
                        ? { ...PRIMARY_BUTTON_STYLE, width: 'auto', padding: '8px 14px' }
                        : { ...PRIMARY_BUTTON_DISABLED_STYLE, width: 'auto', padding: '8px 14px' }
                    }
                  >
                    {forgotLoading ? 'Enviando…' : 'Enviar link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: COLORS.text.secondary, margin: '0 0 16px 0' }}>
                  {forgotMessage}
                </p>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={handleForgotClose}
                    style={{ ...PRIMARY_BUTTON_STYLE, width: 'auto', padding: '8px 14px' }}
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------
// Helper canonico bit-exact para detectar NEXT_REDIRECT do server action.
// Server actions do App Router lançam `redirect()` como throw sinalizado
// via `digest` proprio; capturar como erro de UI seria bug canonico.
// -----------------------------------------------------------------------

function isNextRedirect(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}
