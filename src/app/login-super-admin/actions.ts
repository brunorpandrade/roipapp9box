// ROIP APP 9BOX — server actions `/login-super-admin` (ME-Rota-C-D075).
//
// Origem canonica:
// - DOC 02 §4.2 (login Super Admin a-e).
// - DOC 02 §4.4 (forgot password branch e-mail — anti-enumeracao 200).
// - DOC 02 §5.1 (JWT sem `exp` — cookie persistente).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
//
// Escopo canonico bit-exact:
// - `loginSuperAdminAction({ email, senha })` — server action canonica
//   bit-exact do form `LoginSuperAdminClient`. Passos:
//   1. Valida entrada canonica bit-exact.
//   2. Extrai IP + cria pool Drizzle canonico.
//   3. `authenticateSuperAdmin` (helper puro §4.2 a-e).
//   4. Sucesso: `setSessionCookie(token, 'super_admin')` +
//      `redirect('/super-admin')`.
//   5. Falha: retorna resultado discriminado canonico.
// - `forgotPasswordSuperAdminAction({ email })` — §4.4 branch email.
//
// **RV-13.** Cada export publico tem chamador na propria ME:
//   - `loginSuperAdminAction` → `LoginSuperAdminClient.tsx` (form
//     submit) + `tests/integration/loginSuperAdminAction.test.ts`.
//   - `forgotPasswordSuperAdminAction` → `LoginSuperAdminClient.tsx`
//     (modal §4.4).

'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../../db/client';
import { createRateLimiter } from '../../server/auth/rateLimit';
import {
  authenticateSuperAdmin,
  type AuthenticateSuperAdminResult,
} from '../../lib/auth/authenticateSuperAdmin';
import { setSessionCookie } from '../../server/session/serverSession';
import { authRouter } from '../../server/routers/auth';
import { createCallerFactory, createContextInner } from '../../server/trpc';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366).
// -----------------------------------------------------------------------

const loginSuperAdminRateLimiter = createRateLimiter();
const forgotPasswordSuperAdminRateLimiter = createRateLimiter();
const createAuthCaller = createCallerFactory(authRouter);

// -----------------------------------------------------------------------
// Helpers locais (nao exportados — CC068)
// -----------------------------------------------------------------------

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

async function extractClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  const real = h.get('x-real-ip');
  if (real !== null && real.length > 0) return real;
  return 'unknown';
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// -----------------------------------------------------------------------
// Contratos canonicos bit-exact
// -----------------------------------------------------------------------

export interface LoginSuperAdminActionInput {
  readonly email: string;
  readonly senha: string;
}

export type LoginSuperAdminActionResult =
  { readonly success: true } | Exclude<AuthenticateSuperAdminResult, { readonly success: true }>;

export interface ForgotPasswordSuperAdminInput {
  readonly email: string;
}

export interface ForgotPasswordSuperAdminResult {
  readonly msg: string;
  readonly enviado: true;
}

// -----------------------------------------------------------------------
// loginSuperAdminAction — §4.2
// -----------------------------------------------------------------------

export async function loginSuperAdminAction(
  input: LoginSuperAdminActionInput,
): Promise<LoginSuperAdminActionResult> {
  const email = normalizeEmail(input.email);
  if (email.length === 0 || !isValidEmailShape(email) || input.senha.length === 0) {
    return {
      success: false,
      code: 'unauthorized',
      message: 'E-mail ou senha incorretos.',
    };
  }

  const ip = await extractClientIp();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const result = await authenticateSuperAdmin({
      db: client.db,
      rateLimiter: loginSuperAdminRateLimiter,
      ip,
      email,
      senha: input.senha,
    });

    if (!result.success) {
      return result;
    }

    await setSessionCookie(result.token, 'super_admin');
    redirect('/super-admin');
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// forgotPasswordSuperAdminAction — §4.4 branch e-mail
// -----------------------------------------------------------------------

export async function forgotPasswordSuperAdminAction(
  input: ForgotPasswordSuperAdminInput,
): Promise<ForgotPasswordSuperAdminResult> {
  const email = normalizeEmail(input.email);
  const ip = await extractClientIp();

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createAuthCaller(
      createContextInner({
        db: client.db,
        rateLimiter: forgotPasswordSuperAdminRateLimiter,
        bearerToken: null,
        ip,
      }),
    );
    const result = await caller.forgotPassword({ email });
    return { msg: result.msg, enviado: true };
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Validador canonico bit-exact minimo de shape de e-mail
// -----------------------------------------------------------------------

function isValidEmailShape(email: string): boolean {
  // Shape canonico bit-exact: pelo menos 1 char antes do `@`, dominio
  // com pelo menos 1 ponto e 1 char por segmento. O backend (Zod
  // `email().max(255)`) faz a validacao definitiva; aqui evitamos ida
  // ao banco quando o input claramente nao e email.
  if (email.length > 255) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const domain = email.slice(at + 1);
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
}
