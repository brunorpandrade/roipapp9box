// ROIP APP 9BOX — Client canônico do gate LGPD do portal
// (ME-B10-01, DOC 05 §6.2; estendido ME-B10-05 S256 — perímetro mobile;
// refatorado ME-1.12.c Despacho A, item [1.12.c] do roadmap V4).
//
// Renderizado após identificação por CPF+matrícula quando
// `versaoTermoAceita` diverge de `LGPD_TERM_VERSION`.
//
// Layout: card centralizado 480-520px sobre background #F9FAFB.
// Eyebrow contextual:
//   - "Primeiro acesso" se não há registro anterior (heurística: pela
//     ausência de LGPD anterior salva em sessionStorage).
//   - "Termo atualizado" se há registro superado.
//
// Nesta ME, a heurística exclusiva é "Primeiro acesso" — o gate real
// é emitido pelo backend sem distinguir os dois casos no payload.
// Sub-decisão silenciosa L130: usar "Termo atualizado" quando o
// sessionStorage indica que já houve login anterior nesta aba
// (`portalLgpdSeen === '1'`); "Primeiro acesso" caso contrário.
//
// ME-1.12.c Despacho A: refactor canonico do fluxo do primeiro login.
// Caixa inicial com resumo curto (duas frases canonicas — finalidade +
// direitos) + botao secundario `[Ler termo integral]` que abre modal
// rolavel interno com `TERMO_LITERAL_V10` completo + botao primario
// `[Concordar e continuar]`. Preserva bit-exact o comportamento
// canonico de "não aparecer de novo após aceite" via sessionStorage e
// `recordLGPDConsent`. Fonte unica dos textos canonicos:
// `src/lib/lgpd/termoLiteral.ts` (L125 integral — refactor dos
// callsites originais).
//
// Botão único primário [Concordar e continuar]. Consome
// POST /api/portal/consent-lgpd com `{ portalToken }` do
// sessionStorage. Sucesso → redirect para /colaborador/pendencias.
//
// ME-B10-05 S256: classes `roip-lgpd-outer` e `roip-lgpd-card`
// permitem paddings responsivos em viewport `< 1024px` (DOC 05 §19.1).

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { TERMO_LITERAL_V10_HTML, TERMO_RESUMO_V10 } from '../../lib/lgpd/termoLiteral';

const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';
const TEXT_4 = '#9CA3AF';
const DANGER_BG = '#FEE2E2';
const DANGER_TX = '#991B1B';

const TITULO_CANONICO = 'Termo de tratamento de dados';

interface ConsentSuccess {
  gateStep: 'pendencias';
}

interface ConsentError {
  msg: string;
}

export function GateLgpdClient(): JSX.Element {
  const router = useRouter();
  const [eyebrow, setEyebrow] = useState<'primeiro' | 'atualizado'>('primeiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenPresente, setTokenPresente] = useState(true);
  // ME-1.12.c: estado do modal rolavel do termo integral. Controlado
  // localmente — sem backend; abre quando o usuario clica em `[Ler
  // termo integral]` e fecha com `[Fechar]` ou ESC.
  const [modalAberto, setModalAberto] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      setTokenPresente(false);
      router.replace('/colaborador');
      return;
    }
    const jaViu = window.sessionStorage.getItem('portalLgpdSeen');
    setEyebrow(jaViu === '1' ? 'atualizado' : 'primeiro');
  }, [router]);

  // ME-1.12.c: ESC fecha o modal rolavel (acessibilidade canonica).
  useEffect(() => {
    if (!modalAberto) {
      return;
    }
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setModalAberto(false);
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalAberto]);

  async function handleConcordar(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      router.replace('/colaborador');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/portal/consent-lgpd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ portalToken: token }),
      });
      const data = (await res.json()) as ConsentSuccess | ConsentError;
      if (res.status === 200) {
        window.sessionStorage.setItem('portalLgpdSeen', '1');
        router.replace('/colaborador/pendencias');
        return;
      }
      const errBody = data as ConsentError;
      if (res.status === 401) {
        window.sessionStorage.removeItem('portalToken');
        router.replace('/colaborador');
        return;
      }
      setError(errBody.msg);
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (!tokenPresente) {
    return <div />;
  }

  return (
    <div
      className="roip-lgpd-outer"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="roip-lgpd-card"
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '36px 40px',
          boxShadow: '0 10px 40px rgba(17,24,39,.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img
            src="/brand/roipeople-analytics-platform.png"
            alt="ROIPeople Analytics Platform"
            style={{
              height: 48,
              width: 'auto',
              maxWidth: '85%',
              display: 'block',
              margin: '0 auto',
            }}
          />
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: TEAL,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          {eyebrow === 'primeiro' ? 'Primeiro acesso' : 'Termo atualizado'}
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            textAlign: 'center',
            color: TEXT_1,
            margin: '0 0 20px 0',
          }}
        >
          {TITULO_CANONICO}
        </h1>

        {/*
          ME-1.12.c: caixa canônica com RESUMO CURTO (duas frases
          — finalidade + direitos). O texto literal integral é
          acessível via botão secundário `[Ler termo integral]`
          abaixo, que abre modal rolável.
        */}
        <div
          style={{
            background: '#F9FAFB',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '22px 24px',
            fontSize: 13.5,
            lineHeight: 1.65,
            color: TEXT_2,
          }}
        >
          {TERMO_RESUMO_V10}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 11.5,
            color: TEXT_4,
            textAlign: 'center',
          }}
        >
          <span>Consulta sempre disponível no rodapé do portal</span>
        </div>

        {error !== null ? (
          <div
            style={{
              marginTop: 18,
              padding: '11px 14px',
              background: DANGER_BG,
              color: DANGER_TX,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          className="roip-lgpd-cta-row"
          style={{
            marginTop: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {/*
            ME-1.12.c: botão secundário canônico `[Ler termo
            integral]`. Abre modal interno rolável com
            `TERMO_LITERAL_V10` completo. Não bloqueia o botão
            primário de aceite — leitura é opcional conforme pedido
            canônico de Bruno.
          */}
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: TEXT_3,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Ler termo integral
          </button>
          <button
            type="button"
            onClick={handleConcordar}
            disabled={loading}
            className="roip-lgpd-cta-btn"
            style={{
              padding: '13px 32px',
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
            {loading ? 'Registrando…' : 'Concordar e continuar'}
          </button>
        </div>
      </div>

      {/*
        ME-1.12.c: modal rolável canônico com o termo integral.
        Renderizado apenas quando `modalAberto === true`. Overlay
        semi-transparente + caixa centralizada com scroll interno. ESC
        e botão `[Fechar]` fecham o modal. Preserva comportamento
        canônico pré-ME: não interfere no fluxo de aceite.
      */}
      {modalAberto ? (
        <div
          onClick={() => setModalAberto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="roip-lgpd-modal-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              maxWidth: 640,
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                padding: '20px 28px',
                borderBottom: `1px solid ${BORDER}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                id="roip-lgpd-modal-title"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: TEXT_1,
                  margin: 0,
                }}
              >
                Termo de tratamento de dados — integral
              </h2>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 20,
                  color: TEXT_3,
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            {/*
              ME-1.12.d: termo jurídico V1.0 definitivo e estruturado
              em 13 seções (DOC 02 §7.3). HTML canônico vem do mapa
              versionado `TERMO_LITERAL_V10_HTML` em
              `src/lib/lgpd/termoLiteral.ts`. Zero risco XSS por
              construção — constante no código, não vem de user input.
              Estilo canônico embutido via <style> escopado por classe
              para controlar h4, p, ul em contexto de modal.
            */}
            <div
              className="roip-lgpd-termo-integral"
              style={{
                padding: '20px 28px',
                overflowY: 'auto',
                fontSize: 13.5,
                lineHeight: 1.65,
                color: TEXT_2,
                flex: 1,
              }}
              dangerouslySetInnerHTML={{ __html: TERMO_LITERAL_V10_HTML }}
            />
            <style>{`
              .roip-lgpd-termo-integral h4 {
                font-size: 14.5px;
                font-weight: 700;
                color: ${TEXT_1};
                margin: 18px 0 8px 0;
              }
              .roip-lgpd-termo-integral h4:first-of-type {
                margin-top: 0;
              }
              .roip-lgpd-termo-integral p {
                margin: 0 0 10px 0;
              }
              .roip-lgpd-termo-integral ul {
                margin: 0 0 10px 0;
                padding-left: 20px;
              }
              .roip-lgpd-termo-integral li {
                margin-bottom: 4px;
              }
              .roip-lgpd-termo-integral strong {
                color: ${TEXT_1};
              }
            `}</style>
            <div
              style={{
                padding: '14px 28px',
                borderTop: `1px solid ${BORDER}`,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                style={{
                  padding: '9px 22px',
                  background: '#FFFFFF',
                  color: TEXT_2,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
