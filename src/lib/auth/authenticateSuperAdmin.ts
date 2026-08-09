// ROIP APP 9BOX — helper canonico bit-exact de autenticacao Super Admin
// (ME-Rota-C-D075 — fundacao pre-ME-072).
//
// Origem canonica:
// - DOC 02 §4.2 (ordem canonica a-e do login Super Admin).
// - DOC 02 §5.1 (JWT sem `exp` — sessao nunca expira por inatividade).
// - DOC 02 §5.8 (rate limit `loginSuperAdmin` = 5 tentativas / 15 min).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
//
// Papel canonico:
// - Extracao do nucleo canonico bit-exact da procedure `auth.loginSuperAdmin`
//   para reuso pela server action `loginSuperAdminAction` de
//   `src/app/login-super-admin/actions.ts`. Server actions do App Router
//   NAO passam pelo pipeline tRPC (nao ha `ctx` com `rateLimiter` injetado
//   automaticamente); logo, o helper puro aceita `db` + `rateLimiter` +
//   `ip` explicitamente e devolve um contrato discriminado sem lancar
//   `TRPCError` — o consumidor decide o comportamento (redirect, JSON,
//   throw) conforme a superficie.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `authenticateSuperAdmin` → `src/app/login-super-admin/actions.ts`
//     (`loginSuperAdminAction`) + `tests/integration/authenticateSuperAdmin.test.ts`.
//   - `AuthenticateSuperAdminResult` (tipo) → consumido pelo mesmo action
//     e teste para narrowing bit-exact.
//
// Contrato canonico:
// - `authenticateSuperAdmin({ db, rateLimiter, ip, email, senha })` →
//   Promise<AuthenticateSuperAdminResult>. Contrato discriminado por
//   `success: boolean`. O caller nunca precisa reinvocar rate limit,
//   bcrypt, JWT — tudo esta encapsulado.

import { signSuperAdminToken, deriveCredentialVersion } from '../../server/auth/jwt';
import { verifyPassword } from '../../server/auth/password';
import { buildRateLimitKey, RATE_LIMITS, type RateLimiter } from '../../server/auth/rateLimit';
import { MSG_LOGIN_SUPER_ADMIN_INVALID, MSG_RATE_LIMIT } from '../../server/routers/auth';
import { getSuperAdminByEmail } from '../../server/services/superAdmins';
import type { RoipDatabase } from '../../db/client';

// -----------------------------------------------------------------------
// Contratos canonicos bit-exact
// -----------------------------------------------------------------------

/**
 * Sentinel canonico bit-exact para IP nao resolvido (S022). Alinha com
 * `RATE_LIMIT_IP_UNKNOWN` da camada tRPC (`src/server/trpc.ts`) e do
 * route handler de portal (`src/app/api/portal/login/route.ts`).
 */
export const RATE_LIMIT_IP_UNKNOWN = 'unknown';

export interface AuthenticateSuperAdminInput {
  readonly db: RoipDatabase;
  readonly rateLimiter: RateLimiter;
  readonly ip: string;
  readonly email: string;
  readonly senha: string;
}

/**
 * Contrato canonico bit-exact discriminado do resultado. `success=true`
 * carrega `token` (JWT sem `exp` §5.1) e o payload minimo `user` para
 * telemetria do consumidor. `success=false` carrega `code` canonico
 * (mapeado ao codigo tRPC equivalente ao da procedure) + `message`
 * canonico bit-exact literal (§13.1) + `retryAfterSeconds` no ramo
 * `rate_limit`.
 */
export type AuthenticateSuperAdminResult =
  | {
      readonly success: true;
      readonly token: string;
      readonly user: {
        readonly id: number;
        readonly name: string;
        readonly email: string;
        readonly role: 'super_admin';
      };
    }
  | {
      readonly success: false;
      readonly code: 'rate_limit';
      readonly message: string;
      readonly retryAfterSeconds: number;
    }
  | {
      readonly success: false;
      readonly code: 'unauthorized';
      readonly message: string;
    };

// -----------------------------------------------------------------------
// Nucleo canonico
// -----------------------------------------------------------------------

/**
 * Executa a ordem canonica bit-exact a-e do login do Super Admin
 * (§4.2). Mesma logica da procedure `auth.loginSuperAdmin`; o helper
 * apenas troca o contrato de erro (TRPCError → resultado discriminado)
 * para caber em superficies que nao passam pelo pipeline tRPC (server
 * actions).
 *
 * Ordem canonica:
 * - (a) rate limit `{ip}:login-super-admin:{email}` = 5/15min.
 * - (b) busca em `superAdmins` por email (UNIQUE global).
 * - (c) nao encontrado → incrementa + `unauthorized`.
 * - (d) senha incorreta → incrementa + `unauthorized` (mesma mensagem
 *   canonica anti-enumeracao §13.1).
 * - (e) sucesso → reset rate limit + `signSuperAdminToken` sem `exp`
 *   (§5.1) + retorna `{ success:true, token, user }`.
 */
export async function authenticateSuperAdmin(
  input: AuthenticateSuperAdminInput,
): Promise<AuthenticateSuperAdminResult> {
  const { db, rateLimiter, ip, email, senha } = input;
  const rule = RATE_LIMITS.loginSuperAdmin;
  const key = buildRateLimitKey(ip, rule.op, email);

  // (a) — Rate limit.
  const status = rateLimiter.check(key, rule);
  if (status.blocked) {
    return {
      success: false,
      code: 'rate_limit',
      message: MSG_RATE_LIMIT,
      retryAfterSeconds: status.retryAfterSeconds,
    };
  }

  // (b) — Busca em superAdmins.
  const admin = await getSuperAdminByEmail(db, email);

  // (c) — Nao encontrado.
  if (admin === undefined) {
    rateLimiter.registerFailure(key, rule);
    return {
      success: false,
      code: 'unauthorized',
      message: MSG_LOGIN_SUPER_ADMIN_INVALID,
    };
  }

  // (d) — bcrypt.compare. `passwordHash` e NOT NULL (§4.1 DOC 01);
  // narrowing defensivo trata como senha errada + incrementa.
  const passwordOk = await verifyPassword(senha, admin.passwordHash);
  if (!passwordOk) {
    rateLimiter.registerFailure(key, rule);
    return {
      success: false,
      code: 'unauthorized',
      message: MSG_LOGIN_SUPER_ADMIN_INVALID,
    };
  }

  // (e) — Sucesso.
  rateLimiter.reset(key);
  const token = await signSuperAdminToken({
    superAdminId: admin.id,
    credentialVersion: deriveCredentialVersion(admin.passwordHash + admin.email),
  });

  return {
    success: true,
    token,
    user: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'super_admin',
    },
  };
}
