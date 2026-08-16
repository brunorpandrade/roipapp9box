// ROIP APP 9BOX — pagina 404 canonica (ME-055c).
//
// Origem canonica: DOC 05 §16.2 (Pagina nao encontrada) + DOC 02 §13.9
// (Contexto do 404 e resolucao do CTA primario).
//
// App Router file convention do Next 15: `not-found.tsx` em `src/app/`
// atende automaticamente qualquer rota nao mapeada. Server component por
// padrao — sem custo de hidratacao em erro comum.
//
// Regras canonicas §16.2:
// - Layout: sidebar do perfil autenticado (ou brand-only se nao
//   autenticado) + header canonico + area central com card centralizado
//   480px. Nesta ME, o refactor completo do Layout perfil-agnostic com
//   sessao real depende de infraestrutura server-side que sera canonizada
//   na ME-056 (D064 novo — debito canonico). Nesta ME, renderizamos o
//   card canonico centralizado sem shell; a integracao ao Layout ocorre
//   junto com a ME-056 quando o pattern de leitura de sessao estiver
//   canonizado.
// - Icone: lupa em circulo cinza claro.
// - Titulo canonico literal: "Pagina nao encontrada."
// - Corpo canonico literal: "A pagina que voce tentou acessar nao existe
//   ou foi removida."
// - CTA canonico: botao outline [Voltar] (history back) + botao primario
//   navy contextual ([Ir para meu painel] autenticado; [Voltar para o
//   login] nao autenticado; [Voltar ao portal] autenticado no portal do
//   colaborador). Detalhamento canonico completo: DOC 02 §13.9.
// - Sem exposicao do codigo HTTP.
//
// Resolucao do CTA primario canonica DOC 02 §13.9: baseada na presenca e
// no valor do cookie `session`. Este server component le o cookie via
// `cookies()` do Next 15 e resolve o CTA:
// - Sem cookie ou cookie invalido → nao autenticado → CTA [Voltar para o
//   login] href="/".
// - Cookie valido de role administrativa (super_admin/rh/rh_lider/clevel/
//   lider) → autenticado → CTA [Ir para meu painel] href resolvido por
//   `panelPathForRole`.
// - Cookie valido com pathname atual `/colaborador*` (colaborador puro no
//   portal) → CTA [Voltar ao portal] href="/colaborador". Nesta ME, sem
//   contexto de path corrente no server component do `not-found` (Next 15
//   nao expõe originalUrl consistentemente aqui), o portal e detectado
//   quando o token e uma sessao do portal — que hoje nao existe na
//   arquitetura (§4.3 opera com `sessionStorage`, nao cookie). Assim, a
//   variante "portal" e resolvida SOMENTE quando o consumidor explicitamente
//   passa via query param `?ctx=portal` (adicionado pelo consumidor do
//   portal em ME-057).

import { cookies } from 'next/headers';

import { verifyToken } from '../server/auth/jwt';
import { panelPathForRole } from '../lib/routes/redirectByRole';
import { COLORS } from '../lib/design-tokens/colors';
import { NotFoundBackButton, NOT_FOUND_BACK_LABEL } from './NotFoundBackButton';

const SESSION_COOKIE = 'session';

/**
 * Titulo canonico literal §16.2 exportado para consumo em testes bit-exact.
 */
export const NOT_FOUND_TITLE = 'Página não encontrada.';

/**
 * Corpo canonico literal §16.2 exportado para consumo em testes bit-exact.
 */
export const NOT_FOUND_BODY = 'A página que você tentou acessar não existe ou foi removida.';

/**
 * Label canonico do CTA outline §16.2.
 *
 * ME-080d Onda 1b — o label agora vive em `NotFoundBackButton.tsx`
 * (client component canonico do botao). Este alias exportado preserva
 * o contrato bit-exact de importacao existente para consumidores em
 * `tests/` (`me055c-not-found-page.test.tsx` etc) sem quebrar API.
 */
export const NOT_FOUND_CTA_BACK_LABEL = NOT_FOUND_BACK_LABEL;

/**
 * Labels canonicos do CTA primario contextual §13.9.
 */
export const NOT_FOUND_CTA_LABELS = {
  authenticated: 'Ir para meu painel',
  anonymous: 'Voltar para o login',
  portal: 'Voltar ao portal',
} as const;

/**
 * Resolve o CTA primario canonico do 404 §13.9. Funcao pura exportada
 * para consumo em testes bit-exact.
 */
export function resolveNotFoundPrimaryCta(context: {
  readonly authenticatedRole: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider' | null;
  readonly isPortalContext?: boolean;
}): { readonly href: string; readonly label: string } {
  if (context.isPortalContext === true) {
    return { href: '/colaborador', label: NOT_FOUND_CTA_LABELS.portal };
  }
  if (context.authenticatedRole === null) {
    return { href: '/', label: NOT_FOUND_CTA_LABELS.anonymous };
  }
  return {
    href: panelPathForRole(context.authenticatedRole),
    label: NOT_FOUND_CTA_LABELS.authenticated,
  };
}

export default async function NotFound(): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  let role: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider' | null = null;

  if (sessionCookie !== undefined && sessionCookie.value.length > 0) {
    const verified = await verifyToken(sessionCookie.value);
    if (verified.valid) {
      role = verified.token.claims.role;
    }
  }

  const cta = resolveNotFoundPrimaryCta({ authenticatedRole: role });

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
        aria-live="polite"
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
            background: COLORS.border.divider,
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
            stroke={COLORS.text.tertiary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
          {NOT_FOUND_TITLE}
        </h1>

        <p
          data-testid="not-found-body"
          style={{
            margin: '0 0 32px 0',
            fontSize: 15,
            lineHeight: 1.6,
            color: COLORS.text.secondary,
          }}
        >
          {NOT_FOUND_BODY}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <NotFoundBackButton />
          <a
            data-testid="not-found-cta-primary"
            href={cta.href}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: COLORS.primary.navy,
              color: '#FFFFFF',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {cta.label}
          </a>
        </div>
      </div>
    </main>
  );
}
