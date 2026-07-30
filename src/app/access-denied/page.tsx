// ROIP APP 9BOX — pagina AccessDeniedPage (ME-023; refactor mínimo ME-055c CC040).
//
// Rota alvo do rewrite server-side do `middleware.ts` (S033) para quando
// um perfil autenticado tenta acessar rota fora do proprio escopo (§10).
// URL na barra permanece a rota original tentada — o rewrite preserva.
//
// Estrutura canonica §8.1:
//   - Icone: cadeado 72px em circulo âmbar (#FEF3C7 fundo, #D97706 cor).
//     Renderizado em SVG inline para nao adicionar dependencia.
//   - Titulo canonico unico: "Acesso negado." (§8.1).
//   - Corpo: mensagem literal canonica de §9 (ou §11.5, ou derivada
//     S039) resolvida por `?rota=<key>` publicado pelo middleware.
//   - CTA: botao primario navy `[Ir para meu painel]` → link para o
//     painel do perfil ativo (§8.1). O perfil vem via query param
//     `?role=<super_admin|rh|rh_lider|clevel|lider>` publicado pelo
//     middleware; ausencia cai em `/` (login).
//
// **ME-055c CC040 (refactor mínimo — correcao canonica retroativa):**
// - Substituido `#1E3A8A` do botao primario pelo token canonico
//   `COLORS.primary.navy` (#1F3A5F) — alinha ao DOC 05 §2.1 canonico.
// - Substituidos hexes hardcoded (#F9FAFB, #FFFFFF, #FEF3C7, #D97706,
//   #111827, #374151) por tokens de `src/lib/design-tokens/colors.ts`
//   (Bloco A ME-055a) — canoniza a dependencia de cor a fonte unica de
//   verdade.
// - Nenhuma mensagem canonica §9/§11.5/S039 tocada. Comportamento
//   preservado bit-exact.
//
// **D064 (debito canonico novo):** integracao ao Layout perfil-agnostic
// da ME-055b (§8.1 canonico) exige leitura server-side da sessao real
// para preencher `HeaderProps.user.displayName` + `companyDisplayName` +
// resolver `MenuConfig` do perfil. Esse pattern sera canonizado na
// ME-056 (paineis), quando o helper de leitura de sessao server-side
// entrar em producao. Nesta ME-055c, preservamos o card central canonico
// intacto — refactor "verdadeiramente mínimo" S298 Opção A.
//
// Server component (padrao App Router). Sem estado; nao ha operacao
// (§8.2: "AccessDeniedPage e apenas visualizacao + botao de retorno").

import {
  ACCESS_DENIED_TITLE,
  resolveAccessDeniedMessage,
} from '../../lib/routes/accessDeniedMessages';
import { panelPathForRole } from '../../lib/routes/redirectByRole';
import { ALL_GUARD_ROLES, type GuardRole } from '../../lib/routes/matrix';
import { COLORS } from '../../lib/design-tokens/colors';

interface AccessDeniedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function normalizeRoleParam(raw: string | string[] | undefined): GuardRole | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  return (ALL_GUARD_ROLES as readonly string[]).includes(value) ? (value as GuardRole) : null;
}

function normalizeRotaParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const params = await searchParams;
  const rotaKey = normalizeRotaParam(params['rota']);
  const role = normalizeRoleParam(params['role']);
  const messageEntry = resolveAccessDeniedMessage(rotaKey);
  const painelHref = role === null ? '/' : panelPathForRole(role);

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
            background: COLORS.badge.warningBg,
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
            stroke={COLORS.semantic.warning}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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
          {ACCESS_DENIED_TITLE}
        </h1>

        <p
          data-testid="access-denied-message"
          style={{
            margin: '0 0 32px 0',
            fontSize: 15,
            lineHeight: 1.6,
            color: COLORS.text.secondary,
          }}
        >
          {messageEntry.message}
        </p>

        <a
          href={painelHref}
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
          Ir para meu painel
        </a>
      </div>
    </main>
  );
}
