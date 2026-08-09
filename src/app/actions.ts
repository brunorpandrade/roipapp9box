// ROIP APP 9BOX — server actions `/` login unificado (ME-Rota-C-D075).
//
// Origem canonica:
// - DOC 02 §4.1 (login unificado a-i).
// - DOC 02 §4.4 (forgot password branch CPF — anti-enumeracao 200).
// - DOC 02 §5.2 (JWT sliding 8h) + §5.6 (companies inativa).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
//
// Escopo canonico bit-exact:
// - `loginPlatformAction({ cpf, senha })` — server action canonica
//   bit-exact do form `LoginUnifiedClient`. Passos:
//   1. Cria pool Drizzle canonico bit-exact via `createDbClient`.
//   2. Extrai IP canonico bit-exact via `headers()` (`x-forwarded-for`,
//      `x-real-ip`, fallback `unknown`).
//   3. Executa `authenticatePlatformUser` (helper puro §4.1 a-i).
//   4. Se sucesso: `setSessionCookie(token, 'platform')` +
//      `redirect(redirectPath)`. `redirect()` do Next 15 lanca uma
//      Error com digest NEXT_REDIRECT — nunca retorna do action.
//   5. Se falha: retorna resultado discriminado canonico bit-exact
//      para o client renderizar mensagem canonica literal §13.1.
// - `forgotPasswordUnifiedAction({ cpf })` — server action canonica
//   bit-exact para o modal `[Esqueci minha senha]` §4.4. Delega ao
//   authRouter tRPC via caller factory canonica bit-exact
//   (`auth.forgotPassword` ja emite tokens + anti-enumeracao).
//
// **RV-13.** Cada export publico tem chamador na propria ME:
//   - `loginPlatformAction` → `src/app/LoginUnifiedClient.tsx` (submit
//     do form) + `tests/integration/loginPlatformAction.test.ts`.
//   - `forgotPasswordUnifiedAction` → `src/app/LoginUnifiedClient.tsx`
//     (submit do modal §4.4).
//
// **S366 + CC068** canonicamente preservados bit-exact — este arquivo
// exporta apenas as server actions canonicas bit-exact. Mensagens,
// helpers de IP e helpers de DB URL sao locais (nao exportados).

'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { closeDbClient, createDbClient } from '../db/client';
import { createRateLimiter } from '../server/auth/rateLimit';
import {
  authenticatePlatformUser,
  type AuthenticatePlatformUserResult,
} from '../lib/auth/authenticatePlatformUser';
import { setSessionCookie } from '../server/session/serverSession';
import { authRouter } from '../server/routers/auth';
import { createCallerFactory, createContextInner } from '../server/trpc';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366).
// -----------------------------------------------------------------------

/**
 * Rate limiter canonico bit-exact do server action de login unificado.
 * Instancia dedicada (nao compartilha com o tRPC ou o portal): chave
 * canonica bit-exact `{ip}:login-unified:{cpf}` e distinta das demais
 * chaves e nao ha sobreposicao real de contagem.
 */
const loginPlatformRateLimiter = createRateLimiter();

/**
 * Rate limiter canonico bit-exact do forgotPassword unificado (S025 —
 * incrementa a cada tentativa). Compartilha chave `{ip}:forgot-password:{cpf}`
 * com o tRPC caller.
 */
const forgotPasswordRateLimiter = createRateLimiter();

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

function stripCpfMask(masked: string): string {
  return masked.replace(/\D/g, '');
}

// -----------------------------------------------------------------------
// Contratos canonicos bit-exact
// -----------------------------------------------------------------------

export interface LoginPlatformActionInput {
  readonly cpf: string;
  readonly senha: string;
}

/**
 * Resultado canonico bit-exact do action. O sucesso NAO chega ao
 * cliente (o `redirect()` do Next 15 lanca Error NEXT_REDIRECT antes),
 * mas o narrowing pelo `success` mantem simetria canonica com os
 * helpers e permite testes cobrirem ambos os ramos.
 */
export type LoginPlatformActionResult =
  { readonly success: true } | Exclude<AuthenticatePlatformUserResult, { readonly success: true }>;

export interface ForgotPasswordUnifiedInput {
  readonly cpf: string;
}

export interface ForgotPasswordUnifiedResult {
  readonly msg: string;
  readonly enviado: true;
}

// -----------------------------------------------------------------------
// loginPlatformAction — §4.1
// -----------------------------------------------------------------------

export async function loginPlatformAction(
  input: LoginPlatformActionInput,
): Promise<LoginPlatformActionResult> {
  const cpfDigits = stripCpfMask(input.cpf);
  if (cpfDigits.length !== 11 || input.senha.length === 0) {
    // Anti-enumeracao canonica bit-exact — mesma mensagem para todos os
    // ramos de entrada invalida (§13.1).
    return {
      success: false,
      code: 'unauthorized',
      message: 'CPF ou senha incorretos.',
    };
  }

  const ip = await extractClientIp();
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const result = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: loginPlatformRateLimiter,
      ip,
      cpf: cpfDigits,
      senha: input.senha,
    });

    if (!result.success) {
      return result;
    }

    // (i) sucesso — grava cookie httpOnly canonico bit-exact e redireciona.
    await setSessionCookie(result.token, 'platform');
    redirect(result.redirectPath);
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// forgotPasswordUnifiedAction — §4.4 branch CPF
// -----------------------------------------------------------------------

export async function forgotPasswordUnifiedAction(
  input: ForgotPasswordUnifiedInput,
): Promise<ForgotPasswordUnifiedResult> {
  const cpfDigits = stripCpfMask(input.cpf);
  const ip = await extractClientIp();

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createAuthCaller(
      createContextInner({
        db: client.db,
        rateLimiter: forgotPasswordRateLimiter,
        bearerToken: null,
        ip,
      }),
    );
    // Delega canonicamente bit-exact ao tRPC (mesma logica anti-enumeracao
    // §4.4 a-c-d). Retorna sempre 200 com msg canonica.
    const result = await caller.forgotPassword({ cpf: cpfDigits });
    return { msg: result.msg, enviado: true };
  } finally {
    await closeDbClient(client);
  }
}
