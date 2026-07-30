// ROIP APP 9BOX — pagina 500 canonica (ME-055c).
//
// Origem canonica: DOC 05 §16.3 (Erro interno) + DOC 02 §13.10 (Contexto
// do 500 e correlation ID).
//
// App Router file convention do Next 15: `error.tsx` em `src/app/` atua
// como error boundary global. OBRIGATORIAMENTE client component (Next 15
// exige `'use client'` em error.tsx — o error boundary precisa hidratar
// para poder disparar `reset()`). O `error.digest` do Next 15 e o
// correlation ID canonico §13.10: hash publicado nos logs server-side
// (correlacionavel via observabilidade) e exposto ao client via a prop
// `digest`. Este e o valor canonico do [Ref: ...] rodape do card.
//
// Regras canonicas §16.3:
// - Layout: brand-only (sem sidebar — erro pode ocorrer antes do
//   carregamento do menu). Card centralizado 480px.
// - Icone: alerta em circulo vermelho claro.
// - Titulo canonico literal: "Erro interno."
// - Corpo canonico literal: "Nossa equipe ja foi notificada. Tente
//   novamente em alguns instantes."
// - CTA canonico: botao outline [Ir para o inicio] (redireciona ao painel
//   do perfil ativo ou / se nao autenticado) + botao primario navy
//   [Recarregar] (reset do error boundary).
// - Rodape canonico: Ref: [correlation-id] (fonte monoespacada) + botao
//   inline [Copiar] (navigator.clipboard).
// - Sem exposicao de stack trace ou detalhes tecnicos.
//
// Nota canonica de layout: [Ir para o inicio] resolve a rota canonica
// via `document.referrer` (heuristica leve) — se veio de `/super-admin`,
// vai para `/super-admin`; caso contrario, vai para `/`. Refinamento
// server-side (leitura de sessao real) fica na ME-056 (D064).

'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { COLORS } from '../lib/design-tokens/colors';

/**
 * Titulo canonico literal §16.3 exportado para consumo em testes bit-exact.
 */
export const ERROR_TITLE = 'Erro interno.';

/**
 * Corpo canonico literal §16.3 exportado para consumo em testes bit-exact.
 */
export const ERROR_BODY = 'Nossa equipe já foi notificada. Tente novamente em alguns instantes.';

/**
 * Labels canonicos dos CTAs §16.3.
 */
export const ERROR_CTA_HOME_LABEL = 'Ir para o início';
export const ERROR_CTA_RELOAD_LABEL = 'Recarregar';
export const ERROR_COPY_LABEL = 'Copiar';
export const ERROR_COPIED_LABEL = 'Copiado!';

/**
 * Prefixo canonico literal §13.10 do rodape do card.
 */
export const ERROR_REF_PREFIX = 'Ref:';

/**
 * Placeholder canonico exibido quando `error.digest` esta ausente
 * (situacao rara — geralmente em desenvolvimento local sem digest
 * gerado). Nao e "sem-id" para nao virar texto tecnico visivel ao
 * usuario final; e um marcador que a operacao devera investigar via log.
 */
export const ERROR_REF_FALLBACK = 'nao-disponivel';

export interface ErrorPageProps {
  /**
   * Erro capturado pelo boundary do Next 15. Contem `message`, `stack` (nao
   * exibidos ao usuario final — sem exposicao de stack trace §16.3) e
   * `digest`: correlation ID canonico §13.10 publicado no log server-side.
   */
  readonly error: Error & { readonly digest?: string };
  /**
   * Reset canonico do error boundary — chamado pelo botao [Recarregar]
   * §16.3. O Next 15 injeta esta funcao ao montar o boundary.
   */
  readonly reset: () => void;
}

/**
 * Resolve o href canonico do CTA [Ir para o inicio] §16.3. Funcao pura
 * exportada para consumo em testes.
 *
 * Heuristica canonica: se o `referrer` comeca com `/super-admin`, retorna
 * `/super-admin`; caso contrario, retorna `/`. Refinamento por sessao
 * real (server-side) fica em D064 (ME-056).
 */
export function resolveErrorHomeHref(referrer: string): string {
  try {
    const url = new URL(referrer);
    if (url.pathname.startsWith('/super-admin')) {
      return '/super-admin';
    }
    return '/';
  } catch {
    return '/';
  }
}

export default function ErrorPage(props: ErrorPageProps): JSX.Element {
  const { error, reset } = props;
  const [copied, setCopied] = useState(false);
  const correlationId = error.digest ?? ERROR_REF_FALLBACK;
  const homeHref =
    typeof window !== 'undefined' ? resolveErrorHomeHref(window.document.referrer) : '/';

  useEffect(() => {
    // Log local canonico — em producao a observabilidade server-side ja
    // capturou o erro com o digest correspondente. Este console.error e
    // recurso de debug local sem exposicao de stack ao usuario.
    console.error('[ROIP APP] erro capturado por error boundary', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(correlationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silenciosamente ignora — navegadores muito antigos ou contexto
      // sem clipboard. O usuario ainda ve o correlation ID em texto.
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: COLORS.background.page,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif',
      }}
    >
      <div
        role="alert"
        aria-live="assertive"
        style={{
          width: '100%',
          maxWidth: 480,
          background: COLORS.background.card,
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: COLORS.badge.dangerBg,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <svg
            width={36}
            height={36}
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.semantic.danger}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path
              d={
                'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3' +
                'L13.71 3.86a2 2 0 0 0-3.42 0z'
              }
            />
          </svg>
        </div>

        <h1
          style={{
            margin: '0 0 16px 0',
            fontSize: 24,
            fontWeight: 700,
            color: COLORS.text.primary,
            lineHeight: 1.3,
          }}
        >
          {ERROR_TITLE}
        </h1>

        <p
          data-testid="error-body"
          style={{
            margin: '0 0 32px 0',
            fontSize: 15,
            lineHeight: 1.6,
            color: COLORS.text.secondary,
          }}
        >
          {ERROR_BODY}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
          <a
            data-testid="error-cta-home"
            href={homeHref}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'transparent',
              color: COLORS.primary.navy,
              borderRadius: 6,
              border: `1px solid ${COLORS.primary.navy}`,
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {ERROR_CTA_HOME_LABEL}
          </a>
          <button
            type="button"
            data-testid="error-cta-reload"
            onClick={reset}
            style={{
              padding: '12px 24px',
              background: COLORS.primary.navy,
              color: '#FFFFFF',
              borderRadius: 6,
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {ERROR_CTA_RELOAD_LABEL}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 12,
            color: COLORS.text.tertiary,
          }}
        >
          <span
            data-testid="error-correlation-id"
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
            }}
          >
            {ERROR_REF_PREFIX} {correlationId}
          </span>
          <button
            type="button"
            data-testid="error-copy"
            onClick={handleCopy}
            aria-label={`${ERROR_COPY_LABEL} referencia ${correlationId}`}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              color: COLORS.primary.navy,
              border: `1px solid ${COLORS.primary.navy}`,
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {copied ? ERROR_COPIED_LABEL : ERROR_COPY_LABEL}
          </button>
        </div>
      </div>
    </main>
  );
}
