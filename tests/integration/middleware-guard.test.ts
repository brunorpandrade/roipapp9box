// ROIP APP 9BOX — teste de integracao do `middleware.ts` (ME-023).
//
// Cobre a matriz canonica §10 DOC 02 mais os fluxos §13.7 e §13.8:
//   - Rota publica passa sem verificacao (`isPublicRoute`).
//   - Rota administrativa sem cookie `session` → redirect canonico:
//     · pathname iniciando com `/super-admin` → `/login-super-admin`;
//     · demais → `/`.
//   - Cookie invalido/expirado → mesmo redirect (com `?expired=1` se
//     branch `expired`).
//   - Cookie valido:
//     · matriz `allow` → NextResponse.next();
//     · matriz `deny` → `NextResponse.rewrite('/access-denied?rota=&role=')`;
//     · `redirect_super_admin` → `redirect('/super-admin?toast=...')`;
//     · `redirect_painel` → `redirect('/painel-rh'|'/painel-clevel'|
//       '/painel-lider'|'/super-admin')`.
//   - Rota fora da matriz → NextResponse.next() (Next devolve 404 natural).
//
// Nao toca MySQL (matriz e verifyToken sao puros). Ainda assim classificado
// integration por usar runtime Next 15 (NextRequest/NextResponse) e
// jose (WebCrypto).
//
// A cobertura NAO explora as 96 celulas (30 rotas x 5 roles) — foca nas
// decisoes canonicas representativas por familia (S038). Testes literais
// das mensagens canonicas vivem no unit test `accessDeniedMessages`.

import { describe, expect, it, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

import { signPlatformToken, signSuperAdminToken } from '../../src/server/auth/jwt';
import { middleware } from '../../middleware';

process.env.JWT_SECRET = 'test-secret-roip-me023-middleware-guard';

const PWV = 'deadbeefdeadbeef';

async function tokenFor(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): Promise<string> {
  return await signPlatformToken({
    userId: 1,
    role,
    companyId: 1,
    credentialVersion: PWV,
  });
}

async function tokenForSuperAdmin(): Promise<string> {
  return await signSuperAdminToken({
    superAdminId: 1,
    credentialVersion: PWV,
  });
}

function makeRequest(pathname: string, cookieValue?: string): NextRequest {
  const url = new URL(`http://localhost${pathname}`);
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set('cookie', `session=${cookieValue}`);
  }
  return new NextRequest(url, { headers });
}

/**
 * `NextResponse.next()` retorna Response 200 sem redirect e sem rewrite.
 * O header `x-middleware-next: 1` so e adicionado pelo runtime do Next
 * em producao (edge). Em teste isolado verificamos por ausencia dos
 * headers de redirect/rewrite e status 200.
 */
function isAllow(res: Response): boolean {
  return (
    res.status === 200 &&
    res.headers.get('location') === null &&
    res.headers.get('x-middleware-rewrite') === null
  );
}

describe('middleware guard — matriz canonica §10 (ME-023)', () => {
  let tokenRh = '';
  let tokenRhLider = '';
  let tokenClevel = '';
  let tokenLider = '';
  let tokenBruno = '';

  beforeAll(async () => {
    tokenRh = await tokenFor('rh');
    tokenRhLider = await tokenFor('rh_lider');
    tokenClevel = await tokenFor('clevel');
    tokenLider = await tokenFor('lider');
    tokenBruno = await tokenForSuperAdmin();
  });

  // ------------------------------------------------------- Rotas publicas
  it('/ (login unificado) passa sem cookie', async () => {
    const res = await middleware(makeRequest('/'));
    expect(isAllow(res)).toBe(true);
  });

  it('/login-super-admin passa sem cookie', async () => {
    const res = await middleware(makeRequest('/login-super-admin'));
    expect(isAllow(res)).toBe(true);
  });

  it('/access-denied passa sem cookie (evita loop)', async () => {
    const res = await middleware(makeRequest('/access-denied?rota=/painel-rh'));
    expect(isAllow(res)).toBe(true);
  });

  it('/api/portal/login passa sem cookie', async () => {
    const res = await middleware(makeRequest('/api/portal/login'));
    expect(isAllow(res)).toBe(true);
  });

  it('/api/trpc/auth.loginPlatform passa sem cookie (adapter tRPC)', async () => {
    const res = await middleware(makeRequest('/api/trpc/auth.loginPlatform'));
    expect(isAllow(res)).toBe(true);
  });

  // ----------------------------------------------- Sem cookie ou invalido
  it('/painel-rh sem cookie → redirect para /', async () => {
    const res = await middleware(makeRequest('/painel-rh'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  it('/super-admin sem cookie → redirect para /login-super-admin', async () => {
    const res = await middleware(makeRequest('/super-admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login-super-admin');
  });

  it('/painel-rh com cookie invalido → redirect para /', async () => {
    const res = await middleware(makeRequest('/painel-rh', 'bogus.jwt.value'));
    expect(res.status).toBe(307);
    // Nao ha branch para malformed adicionar ?expired=1 — cai em /.
    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  // --------------------------------------- Matriz allow / deny / redirect
  it('/painel-rh com token RH → allow (next)', async () => {
    const res = await middleware(makeRequest('/painel-rh', tokenRh));
    expect(isAllow(res)).toBe(true);
  });

  it('/painel-rh com token C-level → deny (rewrite /access-denied)', async () => {
    const res = await middleware(makeRequest('/painel-rh', tokenClevel));
    const rewrite = res.headers.get('x-middleware-rewrite');
    expect(rewrite).not.toBeNull();
    expect(rewrite).toContain('/access-denied');
    expect(rewrite).toContain('rota=%2Fpainel-rh');
    expect(rewrite).toContain('role=clevel');
  });

  it('/painel-clevel com token C-level → allow', async () => {
    const res = await middleware(makeRequest('/painel-clevel', tokenClevel));
    expect(isAllow(res)).toBe(true);
  });

  it('/painel-clevel com token RH → deny (rewrite)', async () => {
    const res = await middleware(makeRequest('/painel-clevel', tokenRh));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/access-denied');
  });

  it('/painel-lider com token Lider → allow', async () => {
    const res = await middleware(makeRequest('/painel-lider', tokenLider));
    expect(isAllow(res)).toBe(true);
  });

  it('/painel-lider com token RH-Lider → redirect_painel para /painel-rh', async () => {
    const res = await middleware(makeRequest('/painel-lider', tokenRhLider));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/painel-rh');
  });

  it('/painel-rh com token Super Admin → redirect_painel para /super-admin', async () => {
    const res = await middleware(makeRequest('/painel-rh', tokenBruno));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/super-admin');
  });

  it('/minha-equipe com token Super Admin → redirect_super_admin com toast', async () => {
    const res = await middleware(makeRequest('/minha-equipe', tokenBruno));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/super-admin');
    expect(location).toContain('toast=super_admin_route_unavailable');
  });

  it('/super-admin com token Super Admin → allow', async () => {
    const res = await middleware(makeRequest('/super-admin', tokenBruno));
    expect(isAllow(res)).toBe(true);
  });

  it('/super-admin com token RH → deny', async () => {
    const res = await middleware(makeRequest('/super-admin', tokenRh));
    const rewrite = res.headers.get('x-middleware-rewrite') ?? '';
    expect(rewrite).toContain('/access-denied');
    expect(rewrite).toContain('rota=%2Fsuper-admin');
  });

  it('super-admin/empresa/42/colaborador/novo token Bruno → allow (prefix)', async () => {
    const res = await middleware(
      makeRequest('/super-admin/empresa/42/colaborador/novo', tokenBruno),
    );
    expect(isAllow(res)).toBe(true);
  });

  it('/super-admin/empresa/42 com token RH → deny (prefix)', async () => {
    const res = await middleware(makeRequest('/super-admin/empresa/42', tokenRh));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/access-denied');
  });

  it('/dashboard-individual/99 com token RH → allow (resolver filtra alvo)', async () => {
    const res = await middleware(makeRequest('/dashboard-individual/99', tokenRh));
    expect(isAllow(res)).toBe(true);
  });

  it('/faturamento-mensal com token Lider → allow (resolver filtra RF)', async () => {
    const res = await middleware(makeRequest('/faturamento-mensal', tokenLider));
    expect(isAllow(res)).toBe(true);
  });

  it('/organograma com token Lider → allow (PC1b no frontend)', async () => {
    const res = await middleware(makeRequest('/organograma', tokenLider));
    expect(isAllow(res)).toBe(true);
  });

  it('/colaborador/novo com token C-level → deny (S039a)', async () => {
    const res = await middleware(makeRequest('/colaborador/novo', tokenClevel));
    const rewrite = res.headers.get('x-middleware-rewrite') ?? '';
    expect(rewrite).toContain('/access-denied');
    expect(rewrite).toContain('rota=%2Fcolaborador%2Fnovo');
  });

  it('/central-relatorios com token Lider → deny', async () => {
    const res = await middleware(makeRequest('/central-relatorios', tokenLider));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/access-denied');
  });

  it('/onboarding-lideres com token C-level → deny (S434 canonico)', async () => {
    const res = await middleware(makeRequest('/onboarding-lideres', tokenClevel));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/access-denied');
  });

  // ---------------------------------------------- Rota fora da matriz
  it('/rota-inexistente com token valido → next (Next devolve 404 natural)', async () => {
    const res = await middleware(makeRequest('/rota-inexistente', tokenRh));
    expect(isAllow(res)).toBe(true);
  });
});
