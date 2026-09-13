// ROIP APP 9BOX — Client canônico da tela de entrada do portal
// (ME-B10-01, DOC 05 §6.1 revisado — S248 Opção B aprovada;
// estendido ME-B10-05 S256 — perímetro mobile).
//
// Formulário canônico revisado ME-080b (S515):
//   - Campo CPF (com máscara 000.000.000-00, inputmode numeric).
//   - Campo Matrícula (formato AA00 — 2 letras + 2 dígitos,
//     case-insensitive na entrada, normalizada uppercase).
//   - Botão [Entrar].
//
// Estados canônicos de UI (§6.1 revisado):
//   1. padrão (form vazio, foco em CPF).
//   2. CPF vazio (inline "Informe seu CPF.").
//   3. CPF incompleto (inline "Informe um CPF com 11 dígitos.").
//   4. Matrícula vazia (inline "Informe sua matrícula.").
//   5. Matrícula inválida (inline canônico backend
//      "Informe uma matrícula com 2 letras seguidas de 2 números.").
//   6. Credenciais inválidas (banner vermelho canônico backend
//      "CPF ou matrícula incorretos. Verifique e tente novamente.").
//   7. Empresa inativa (banner âmbar canônico backend
//      "Empresa inativa no sistema. Entre em contato com o suporte.").
//   8. Loading (spinner + campos desabilitados + label "Entrando…").
//   9. Rate limit (bloco vermelho substituindo botão + contador
//      regressivo em mm:ss derivado do `retryAfterSeconds` do backend).
//   10. Offline (toast âmbar "Sem conexão. Verifique sua internet.").
//
// Consome POST /api/portal/login. Armazena `portalToken` retornado em
// `sessionStorage` (chave canônica "portalToken", DOC 02 §5.3).
// Armazena `userName` em sessionStorage (chave "portalUserName") para
// exibição no header pós-login. Redirect conforme `gateStep`:
//   - "lgpd_consent" → /colaborador/gate-lgpd
//   - "pendencias"   → /colaborador/pendencias
//
// ME-B10-05 S256: classe `roip-login-card` no card e classe
// `roip-login-outer` no wrapper permitem paddings responsivos
// canônicos em viewport `< 1024px` (DOC 05 §19.1).

'use client';

import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';

const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#D1D5DB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';
const TEXT_4 = '#9CA3AF';
const DANGER = '#DC2626';
const DANGER_BG = '#FEE2E2';
const DANGER_TX = '#991B1B';
const WARNING_BG = '#FEF3C7';
const WARNING_TX = '#92400E';

type BannerKind = 'credenciais' | 'empresa_inativa' | 'offline' | null;

const MSG_CPF_VAZIO = 'Informe seu CPF.';
const MSG_CPF_INCOMPLETO = 'Informe um CPF com 11 dígitos.';
const MSG_MATRICULA_VAZIA = 'Informe sua matrícula.';
const MSG_OFFLINE = 'Sem conexão. Verifique sua internet.';

const MATRICULA_UI_REGEX = /^[A-Za-z]{2}[0-9]{2}$/;

interface LoginSuccess {
  portalToken: string;
  user: { id: number; name: string; type: 'employee' | 'clevel' };
  gateStep: 'lgpd_consent' | 'pendencias';
}

interface LoginError {
  msg: string;
  retryAfterSeconds?: number;
}

export function ColaboradorLoginClient(): JSX.Element {
  const router = useRouter();
  const cpfRef = useRef<HTMLInputElement>(null);

  const [cpf, setCpf] = useState('');
  const [matricula, setMatricula] = useState('');
  const [errCpf, setErrCpf] = useState<string | null>(null);
  const [errMatricula, setErrMatricula] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: BannerKind; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [rateLimitSecs, setRateLimitSecs] = useState<number | null>(null);

  useEffect(() => {
    cpfRef.current?.focus();
  }, []);

  useEffect(() => {
    if (rateLimitSecs === null || rateLimitSecs <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setRateLimitSecs((s) => {
        if (s === null || s <= 1) {
          return null;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSecs]);

  function handleCpfChange(e: ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    const masked = applyCpfMask(raw);
    setCpf(masked);
    setErrCpf(null);
    setBanner(null);
  }

  function handleMatriculaChange(e: ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value.toUpperCase().slice(0, 4);
    setMatricula(raw);
    setErrMatricula(null);
    setBanner(null);
  }

  async function handleSubmit(): Promise<void> {
    setErrCpf(null);
    setErrMatricula(null);
    setBanner(null);

    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpfDigits.length === 0) {
      setErrCpf(MSG_CPF_VAZIO);
      cpfRef.current?.focus();
      return;
    }
    if (cpfDigits.length !== 11) {
      setErrCpf(MSG_CPF_INCOMPLETO);
      cpfRef.current?.focus();
      return;
    }
    if (matricula.length === 0) {
      setErrMatricula(MSG_MATRICULA_VAZIA);
      return;
    }
    if (!MATRICULA_UI_REGEX.test(matricula)) {
      // Delega mensagem final ao backend — inline mostra hint canônico
      // do formato esperado bit-a-bit com MSG_INVALID_MATRICULA.
      setErrMatricula('Informe uma matrícula com 2 letras seguidas de 2 números.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setBanner({ kind: 'offline', msg: MSG_OFFLINE });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cpf: cpfDigits, matricula }),
      });
      const data = (await res.json()) as LoginSuccess | LoginError;

      if (res.status === 200) {
        const success = data as LoginSuccess;
        window.sessionStorage.setItem('portalToken', success.portalToken);
        window.sessionStorage.setItem('portalUserName', success.user.name);
        window.sessionStorage.setItem('portalUserType', success.user.type);
        if (success.gateStep === 'lgpd_consent') {
          router.replace('/colaborador/gate-lgpd');
        } else {
          router.replace('/colaborador/pendencias');
        }
        return;
      }

      const errBody = data as LoginError;
      if (res.status === 400 && errBody.msg.includes('CPF')) {
        setErrCpf(errBody.msg);
        return;
      }
      if (res.status === 400 && errBody.msg.toLowerCase().includes('matr')) {
        setErrMatricula(errBody.msg);
        return;
      }
      if (res.status === 404) {
        setBanner({ kind: 'credenciais', msg: errBody.msg });
        return;
      }
      if (res.status === 403) {
        setBanner({ kind: 'empresa_inativa', msg: errBody.msg });
        return;
      }
      if (res.status === 429) {
        const secs = errBody.retryAfterSeconds ?? 60;
        setRateLimitSecs(secs);
        return;
      }
      setBanner({ kind: 'credenciais', msg: errBody.msg });
    } catch {
      setBanner({ kind: 'offline', msg: MSG_OFFLINE });
    } finally {
      setLoading(false);
    }
  }

  const inRateLimit = rateLimitSecs !== null && rateLimitSecs > 0;

  return (
    <div
      className="roip-login-outer"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="roip-login-card"
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '36px 32px',
          boxShadow: '0 10px 40px rgba(17,24,39,.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: NAVY,
            }}
          >
            ROIP<span style={{ color: TEAL }}> APP</span>
          </div>
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            textAlign: 'center',
            color: TEXT_1,
            margin: '0 0 22px 0',
          }}
        >
          Acesso ao Portal
        </h1>

        {banner !== null ? <Banner kind={banner.kind} msg={banner.msg} /> : null}

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="cpf"
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: TEXT_2,
              marginBottom: 6,
            }}
          >
            Digite seu CPF para acessar
          </label>
          <input
            ref={cpfRef}
            id="cpf"
            type="text"
            value={cpf}
            onChange={handleCpfChange}
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoComplete="username"
            disabled={loading || inRateLimit}
            maxLength={14}
            style={inputStyle(errCpf !== null)}
          />
          {errCpf !== null ? <InlineError msg={errCpf} /> : null}
        </div>

        <div style={{ marginBottom: 22 }}>
          <label
            htmlFor="matricula"
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: TEXT_2,
              marginBottom: 6,
            }}
          >
            Matrícula
          </label>
          <input
            id="matricula"
            type="text"
            value={matricula}
            onChange={handleMatriculaChange}
            placeholder="AA00"
            autoComplete="off"
            disabled={loading || inRateLimit}
            maxLength={4}
            style={{ ...inputStyle(errMatricula !== null), textTransform: 'uppercase' }}
          />
          {errMatricula !== null ? <InlineError msg={errMatricula} /> : null}
        </div>

        {inRateLimit ? (
          <div
            style={{
              padding: '12px 14px',
              background: DANGER_BG,
              color: DANGER_TX,
              borderRadius: 8,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Muitas tentativas. Tente novamente em {formatMMSS(rateLimitSecs!)}.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px 16px',
              background: NAVY,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              fontSize: 14.5,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading ? (
              <span>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#FFFFFF',
                    borderRadius: '50%',
                    marginRight: 8,
                    verticalAlign: -1,
                    animation: 'roip-spin 0.9s linear infinite',
                  }}
                />
                Entrando…
              </span>
            ) : (
              'Entrar'
            )}
          </button>
        )}

        <style>
          {`@keyframes roip-spin {
              from { transform: rotate(0); }
              to { transform: rotate(360deg); }
            }`}
        </style>
      </div>
    </div>
  );
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '11px 14px',
    border: `1px solid ${hasError ? DANGER : BORDER}`,
    borderRadius: 8,
    fontSize: 14,
    color: TEXT_1,
    outline: 'none',
    fontFamily: 'inherit',
    background: '#FFFFFF',
    boxSizing: 'border-box',
  };
}

interface InlineErrorProps {
  readonly msg: string;
}

function InlineError(props: InlineErrorProps): JSX.Element {
  return (
    <div
      style={{
        fontSize: 12,
        color: DANGER,
        marginTop: 6,
      }}
    >
      {props.msg}
    </div>
  );
}

interface BannerProps {
  readonly kind: BannerKind;
  readonly msg: string;
}

function Banner(props: BannerProps): JSX.Element {
  const { kind, msg } = props;
  const isDanger = kind === 'credenciais';
  const isWarning = kind === 'empresa_inativa' || kind === 'offline';
  return (
    <div
      style={{
        padding: '11px 14px',
        marginBottom: 16,
        background: isDanger ? DANGER_BG : isWarning ? WARNING_BG : TEXT_4,
        color: isDanger ? DANGER_TX : isWarning ? WARNING_TX : TEXT_3,
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {msg}
    </div>
  );
}

function applyCpfMask(digits: string): string {
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push('.', digits.slice(3, 6));
  if (digits.length > 6) parts.push('.', digits.slice(6, 9));
  if (digits.length > 9) parts.push('-', digits.slice(9, 11));
  return parts.join('');
}

function formatMMSS(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
