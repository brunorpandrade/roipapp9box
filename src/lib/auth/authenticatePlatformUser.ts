// ROIP APP 9BOX — helper canonico bit-exact de autenticacao unificada
// (RH / RH-Lider / C-level / Lider) — ME-Rota-C-D075 fundacao pre-ME-072.
//
// Origem canonica:
// - DOC 02 §4.1 (ordem canonica a-i do login unificado).
// - DOC 02 §5.2 (JWT sliding 8h — reemissao a cada request autenticado
//   fica FORA de escopo desta ME).
// - DOC 02 §5.8 (rate limit `loginUnified` = 5 tentativas / 15 min).
// - DOC 02 §13.1 (mensagens canonicas literais bit-exact).
// - DOC 02 §2.3 (precedencia inviolavel isRH > C-level > isLider >
//   colaborador puro).
//
// Papel canonico:
// - Extracao do nucleo canonico bit-exact da procedure `auth.loginPlatform`
//   para reuso pela server action `loginPlatformAction` de
//   `src/app/actions.ts`. Mesma justificativa canonica de
//   `authenticateSuperAdmin.ts` (contrato discriminado, sem TRPCError).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `authenticatePlatformUser` → `src/app/actions.ts`
//     (`loginPlatformAction`) + `tests/integration/authenticatePlatformUser.test.ts`.
//   - `AuthenticatePlatformUserResult` (tipo) → consumido pelo mesmo
//     action + teste para narrowing bit-exact.
//   - `resolveRedirectPath` (funcao) → interno bit-exact ao helper +
//     teste (RV-13 aceita test como chamador).
//
// Contrato canonico:
// - `authenticatePlatformUser({ db, rateLimiter, ip, cpf, senha })` →
//   Promise<AuthenticatePlatformUserResult>. Contrato discriminado por
//   `success: boolean`. No ramo `success:true`, `redirectPath` traz a
//   rota canonica bit-exact do painel de destino conforme role
//   (§DOC 05 §5.5, §5.6, §5.7).

import { signPlatformToken, deriveCredentialVersion } from '../../server/auth/jwt';
import { verifyPassword } from '../../server/auth/password';
import { buildRateLimitKey, RATE_LIMITS, type RateLimiter } from '../../server/auth/rateLimit';
import {
  MSG_COLLABORATOR_ONLY,
  MSG_COMPANY_INACTIVE,
  MSG_LOGIN_INVALID,
  MSG_RATE_LIMIT,
  resolveTargetAndRole,
} from '../../server/routers/auth';
import { findPlatformUserByCpf } from '../../server/services/authLookup';
import { getCompanyById } from '../../server/services/companies';
import type { RoipDatabase } from '../../db/client';
import type { PlatformRole } from '../../server/auth/jwt';

export interface AuthenticatePlatformUserInput {
  readonly db: RoipDatabase;
  readonly rateLimiter: RateLimiter;
  readonly ip: string;
  readonly cpf: string;
  readonly senha: string;
}

export type AuthenticatePlatformUserResult =
  | {
      readonly success: true;
      readonly token: string;
      readonly redirectPath: '/painel-rh' | '/painel-clevel' | '/painel-lider';
      readonly user: {
        readonly id: number;
        readonly name: string;
        readonly role: PlatformRole;
        readonly companyId: number;
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
    }
  | {
      readonly success: false;
      readonly code: 'collaborator_only';
      readonly message: string;
      readonly redirectUrl: '/colaborador';
    }
  | {
      readonly success: false;
      readonly code: 'company_inactive';
      readonly message: string;
    };

// -----------------------------------------------------------------------
// Nucleo canonico
// -----------------------------------------------------------------------

/**
 * Deriva a rota canonica bit-exact de painel a partir do `role` §2.2.
 * Espelha DOC 05 §5.5-§5.7 + DOC 02 §2.3 (roteamento pos-login):
 * - `rh` / `rh_lider` → `/painel-rh` (§5.5)
 * - `clevel` → `/painel-clevel` (§5.7)
 * - `lider` → `/painel-lider` (§5.6)
 */
export function resolveRedirectPath(
  role: PlatformRole,
): '/painel-rh' | '/painel-clevel' | '/painel-lider' {
  if (role === 'rh' || role === 'rh_lider') return '/painel-rh';
  if (role === 'clevel') return '/painel-clevel';
  return '/painel-lider';
}

/**
 * Executa a ordem canonica bit-exact a-i do login unificado (§4.1).
 * Mesma logica da procedure `auth.loginPlatform`; troca contrato de
 * erro TRPCError → resultado discriminado (analogo a
 * `authenticateSuperAdmin`).
 *
 * Ordem canonica:
 * - (a) rate limit.
 * - (b, c) busca cross-company via `findPlatformUserByCpf`.
 * - (d) nao encontrado OU S019 ambiguidade → incrementa + `unauthorized`.
 * - Precedencia §2.3 via `resolveTargetAndRole`.
 * - (e) `status='inativo'` → `unauthorized` (nao incrementa — anti-enum).
 * - (f) `bcrypt.compare` → falha incrementa + `unauthorized`.
 * - (g) colaborador puro pos-senha → `collaborator_only` + redirect.
 * - (h) empresa inativa → `company_inactive`.
 * - (i) sucesso → reset + JWT + `{success:true, token, redirectPath, user}`.
 */
export async function authenticatePlatformUser(
  input: AuthenticatePlatformUserInput,
): Promise<AuthenticatePlatformUserResult> {
  const { db, rateLimiter, ip, cpf, senha } = input;
  const rule = RATE_LIMITS.loginUnified;
  const key = buildRateLimitKey(ip, rule.op, cpf);

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

  // (b) e (c) — Busca cross-company.
  const candidates = await findPlatformUserByCpf(db, cpf);

  // (d) — Nao encontrado + (S019) ambiguidade.
  if (candidates.length !== 1) {
    rateLimiter.registerFailure(key, rule);
    return { success: false, code: 'unauthorized', message: MSG_LOGIN_INVALID };
  }
  const only = candidates[0];
  if (only === undefined) {
    rateLimiter.registerFailure(key, rule);
    return { success: false, code: 'unauthorized', message: MSG_LOGIN_INVALID };
  }

  // Precedencia §2.3.
  const resolved = resolveTargetAndRole(only);
  if (resolved === undefined) {
    rateLimiter.registerFailure(key, rule);
    return { success: false, code: 'unauthorized', message: MSG_LOGIN_INVALID };
  }

  // (e) — Inativo (nao incrementa; anti-enumeracao).
  if (resolved.user.status === 'inativo') {
    return { success: false, code: 'unauthorized', message: MSG_LOGIN_INVALID };
  }

  // (f) — bcrypt.compare.
  const passwordHash = resolved.user.passwordHash;
  if (passwordHash === null || passwordHash === undefined) {
    rateLimiter.registerFailure(key, rule);
    return { success: false, code: 'unauthorized', message: MSG_LOGIN_INVALID };
  }
  const passwordOk = await verifyPassword(senha, passwordHash);
  if (!passwordOk) {
    rateLimiter.registerFailure(key, rule);
    return { success: false, code: 'unauthorized', message: MSG_LOGIN_INVALID };
  }

  // (g) — colaborador puro apos validar senha (§4.1 g).
  if (resolved.kind === 'collaborator_only') {
    return {
      success: false,
      code: 'collaborator_only',
      message: MSG_COLLABORATOR_ONLY,
      redirectUrl: '/colaborador',
    };
  }

  // (h) — empresa inativa.
  const company = await getCompanyById(db, only.companyId);
  if (company === undefined || company.status === 'inativa') {
    return { success: false, code: 'company_inactive', message: MSG_COMPANY_INACTIVE };
  }

  // (i) — Sucesso.
  rateLimiter.reset(key);
  const token = await signPlatformToken({
    userId: resolved.user.id,
    role: resolved.role,
    companyId: only.companyId,
    credentialVersion: deriveCredentialVersion(passwordHash),
  });
  return {
    success: true,
    token,
    redirectPath: resolveRedirectPath(resolved.role),
    user: {
      id: resolved.user.id,
      name: resolved.user.name,
      role: resolved.role,
      companyId: only.companyId,
    },
  };
}
