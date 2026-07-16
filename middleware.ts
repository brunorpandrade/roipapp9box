// ROIP APP 9BOX — middleware Next 15 catch-all (ME-023).
//
// Barreira efetiva de autorizacao a nivel de rota (§14.5 ponto 30): o
// frontend replica visualmente (esconde botoes, redireciona no client),
// mas o middleware server-side e a barreira canonica.
//
// Ordem de decisao S038 (interpretacao canonica de §8.4 no Next 15):
//   1. Rota publica (login, portal, links por token, /access-denied,
//      /api/*, assets): passa sem verificacao (S038 passo 1). Prefixos
//      canonicos em `matrix.ts`.
//   2. Rota administrativa e nao ha cookie `session` (S040): redirect
//      canonico para `/` (login unificado) — ou `/login-super-admin` se
//      o pathname inicia com `/super-admin/*` (fluxo natural do Bruno).
//   3. Cookie `session` presente e invalido/expirado: mesma decisao do
//      passo 2. Frontend renderiza toast §8.3 "Sua sessao expirou.
//      Faca login novamente." baseado em query param `?expired=1`.
//   4. Token valido: extrai `role`.
//   5. Consulta matriz canonica (§10) via `findRouteRule(pathname)`:
//      - `allow` → passa.
//      - `deny` → `NextResponse.rewrite` para
//        `/access-denied?rota=<key>&role=<role>` (S033). URL na barra
//        preservada.
//      - `redirect_super_admin` (§13.7) → `NextResponse.redirect` para
//        `/super-admin?toast=super_admin_route_unavailable`.
//      - `redirect_painel` (§2.3 precedencia) → redirect silencioso ao
//        painel do perfil ativo.
//   6. Rota administrativa fora da matriz: 404 canonico (§13.9). O Next
//      naturalmente renderiza 404; middleware nao intervem.
//
// §5.6 empresa inativa: JA implementado no `authed` do tRPC (ME-021).
// O middleware Next NAO duplica — se a pagina server-rendered ler
// dados via tRPC, o guard existente entra na primeira query e
// invalida a sessao. Se a pagina server-rendered ler algo fora de
// tRPC, o helper de leitura devera aplicar o guard (fora do escopo
// desta ME).
//
// §13.8 colaborador puro em rota administrativa: middleware server-side
// apenas faz redirect generico para `/` (nao ve `sessionStorage`, S037).
// O frontend do portal e do login unificado detecta e emite o toast
// canonico apropriado.

import { NextResponse, type NextRequest } from 'next/server';

import { verifyToken } from './src/server/auth/jwt';
import { findRouteRule, isPublicRoute } from './src/lib/routes/matrix';

const SESSION_COOKIE = 'session';

/**
 * Reemissao de `x-roip-session`: o adapter tRPC ja publica no response
 * do proprio `/api/trpc/*` (S013). Middleware Next NAO reemite (nao
 * conhece pwv, nao renova sliding). Esse contrato e do tRPC.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // 1) Matriz canonica §10 tem precedencia. Rotas administrativas
  //    listadas em `ROUTE_MATRIX` sempre passam pelo guard, mesmo que
  //    seu pathname bata um prefixo publico (ex.: `/colaborador/novo`
  //    e rota administrativa RH; `/colaborador/perfil` e portal
  //    publico — ambas comecam com `/colaborador/`).
  const rule = findRouteRule(pathname);

  // 2) Se nao esta na matriz e casa um prefixo publico, passa livre.
  if (rule === null && isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 3) A partir daqui exige-se sessao — administrativa (matriz) ou nao
  //    listada (Next devolve 404, mas ainda protegemos por token
  //    para evitar leak de "rota existe / nao existe").
  const tokenCookie = req.cookies.get(SESSION_COOKIE);
  if (tokenCookie === undefined || tokenCookie.value.length === 0) {
    return redirectToLogin(req, pathname, false);
  }

  const verification = await verifyToken(tokenCookie.value);
  if (!verification.valid) {
    return redirectToLogin(req, pathname, verification.reason === 'expired');
  }

  const role = verification.token.claims.role;

  // 4) Rota fora da matriz mas com token valido: Next devolve 404 natural.
  if (rule === null) {
    return NextResponse.next();
  }
  const decision = rule.byRole[role] ?? 'deny';

  switch (decision) {
    case 'allow':
      return NextResponse.next();
    case 'deny':
      return rewriteToAccessDenied(req, rule.pattern, role);
    case 'redirect_super_admin':
      return redirectWithToast(req, '/super-admin', 'super_admin_route_unavailable');
    case 'redirect_painel':
      return redirectToPanel(req, role);
  }
}

function redirectToLogin(req: NextRequest, from: string, expired: boolean): NextResponse {
  const isSuperAdminRoute = from.startsWith('/super-admin');
  const url = req.nextUrl.clone();
  url.pathname = isSuperAdminRoute ? '/login-super-admin' : '/';
  url.search = '';
  if (expired) {
    url.searchParams.set('expired', '1');
  }
  return NextResponse.redirect(url);
}

function rewriteToAccessDenied(req: NextRequest, routeKey: string, role: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/access-denied';
  url.search = '';
  url.searchParams.set('rota', routeKey);
  url.searchParams.set('role', role);
  return NextResponse.rewrite(url);
}

function redirectWithToast(req: NextRequest, to: string, toastKey: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = to;
  url.search = '';
  url.searchParams.set('toast', toastKey);
  return NextResponse.redirect(url);
}

function redirectToPanel(req: NextRequest, role: string): NextResponse {
  const url = req.nextUrl.clone();
  url.search = '';
  switch (role) {
    case 'super_admin':
      url.pathname = '/super-admin';
      break;
    case 'rh':
    case 'rh_lider':
      url.pathname = '/painel-rh';
      break;
    case 'clevel':
      url.pathname = '/painel-clevel';
      break;
    case 'lider':
      url.pathname = '/painel-lider';
      break;
    default:
      url.pathname = '/';
  }
  return NextResponse.redirect(url);
}

/**
 * Matcher canonico do middleware Next 15. Aplica a todo path exceto:
 *   - `_next/static`, `_next/image` (assets do build);
 *   - `favicon.ico`, arquivos estaticos com extensao.
 * Rotas publicas (login, portal, api) sao processadas pelo middleware
 * mas o proprio codigo (`isPublicRoute`) as libera. Manter no matcher
 * garante que a decisao de "publico" viva em um lugar so.
 */
export const config = {
  matcher: [
    /*
     * Casa qualquer path que nao comece com _next/static, _next/image,
     * ou termine com uma extensao de asset (.svg, .png, .jpg, .css,
     * .js, .ico, .webmanifest, .txt). Regex avaliado uma vez pelo Next.
     */
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico|' +
      'webmanifest|txt)$).*)',
  ],
};
