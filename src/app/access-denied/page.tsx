// ROIP APP 9BOX — pagina AccessDeniedPage (ME-023, DOC 02 §8).
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
// Sidebar canonica do perfil autenticado e header canonico contextualizado
// (§8.1) sao layouts globais reutilizados por rotas administrativas —
// integrados em MEs de UI (Fase 3+). Nesta ME, a pagina renderiza o card
// central canonico; o layout global sera enxertado quando existir.
//
// Server component (padrao App Router). Sem estado; nao ha operacao
// (§8.2: "AccessDeniedPage e apenas visualizacao + botao de retorno").

import {
  ACCESS_DENIED_TITLE,
  resolveAccessDeniedMessage,
} from '../../lib/routes/accessDeniedMessages';
import { panelPathForRole } from '../../lib/routes/redirectByRole';
import { ALL_GUARD_ROLES, type GuardRole } from '../../lib/routes/matrix';

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
        padding: '24px',
        background: '#F9FAFB',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif',
      }}
    >
      <div
        role="alert"
        aria-live="polite"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#FFFFFF',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#FEF3C7',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D97706"
            strokeWidth="2"
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
            fontSize: '24px',
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.3,
          }}
        >
          {ACCESS_DENIED_TITLE}
        </h1>

        <p
          data-testid="access-denied-message"
          style={{
            margin: '0 0 32px 0',
            fontSize: '15px',
            lineHeight: 1.6,
            color: '#374151',
          }}
        >
          {messageEntry.message}
        </p>

        <a
          href={painelHref}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: '#1E3A8A',
            color: '#FFFFFF',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '15px',
            fontWeight: 600,
          }}
        >
          Ir para meu painel
        </a>
      </div>
    </main>
  );
}
