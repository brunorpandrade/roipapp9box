// ROIP APP 9BOX — sub-router `auth` (ME-022a).
//
// Primeiro sub-router de negocio do repositorio, cobrindo os dois logins
// canonicos do DOC 02 — `/` (login unificado, §4.1) e `/login-super-admin`
// (§4.2). Ambos sao `publicProcedure` porque a sessao ainda nao existe.
//
// Regras invioluveis herdadas do canonico:
//   - Ordem canonica de avaliacao a-i em §4.1 e a-e em §4.2 (comentada
//     linha a linha nos handlers). Erro de ordem aqui vira vulnerabilidade,
//     nao bug — cf. anti-enumeracao.
//   - Mensagens literais do §13 — nunca reescrever palavra, pontuacao ou
//     acento. As constantes MSG_* concentram a fonte para prevenir drift.
//   - Rate limit canonico do §5.8 via `RATE_LIMITS.loginUnified` e
//     `RATE_LIMITS.loginSuperAdmin` (ME-020). Incremento SOMENTE nos passos
//     d/f (nao encontrado, senha errada) — passos e/g/h nao incrementam
//     (canonico). Reset SOMENTE no sucesso (i).
//   - Emissao de token via `signPlatformToken` / `signSuperAdminToken`
//     (ME-020). `pwv` derivado de `passwordHash` (perfil administrativo) ou
//     `passwordHash + email` (super_admin) — S011.
//
// Decisoes de autor registradas para esta ME:
//   - S018 — fatiamento ME-022 em 022a/b/c.
//   - S019 — CPF administrativo ambiguo (mesmo CPF em >1 empresa) trata-se
//     como "nao encontrado" no login unificado, com incremento de rate
//     limit e mensagem anti-enumeracao identica. Divida D004 registrada.
//   - S020 — codigos tRPC canonicos: UNAUTHORIZED (credenciais/token),
//     FORBIDDEN (colaborador puro, empresa inativa), TOO_MANY_REQUESTS
//     (rate limit). `cause` carrega extras (retryAfterSeconds, redirectUrl,
//     field, forceLogout) para consumo tipado pelo cliente.
//   - S021 — contratos de resposta (formato dos objetos `user`); mensagem
//     de rate limit e devolvida com "X" literal + `retryAfterSeconds` no
//     cause (a UI substitui/faz countdown, §5.8).
//   - S022 — sentinel `RATE_LIMIT_IP_UNKNOWN` para `ctx.ip === null`.
//
// RV-13: chamador exclusivo `appRouter` (acoplado em `routers/index.ts` na
// mesma ME). Testes de integracao em `tests/integration/auth-*.test.ts`.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { deriveCredentialVersion, signPlatformToken, signSuperAdminToken } from '../auth/jwt';
import type { PlatformRole } from '../auth/jwt';
import { verifyPassword } from '../auth/password';
import { buildRateLimitKey, RATE_LIMITS } from '../auth/rateLimit';
import { getCompanyById } from '../services/companies';
import { getSuperAdminByEmail } from '../services/superAdmins';
import { findPlatformUserByCpf, type PlatformUserCandidate } from '../services/authLookup';
import { publicProcedure, router } from '../trpc';

// ---- Constantes canonicas do §13 ---------------------------------------

/** Mensagem canonica exata do login unificado (§13.1). */
export const MSG_LOGIN_INVALID = 'CPF ou senha incorretos.';

/** Mensagem canonica exata do login super admin (§13.1). */
export const MSG_LOGIN_SUPER_ADMIN_INVALID = 'E-mail ou senha incorretos.';

/** Mensagem canonica exata de colaborador puro em `/` (§13.1). */
export const MSG_COLLABORATOR_ONLY =
  'Este CPF não tem acesso à plataforma. Para responder instrumentos, acesse /colaborador.';

/** Mensagem canonica exata de empresa inativa (§13.1, §5.6). */
export const MSG_COMPANY_INACTIVE = 'Empresa inativa no sistema. Entre em contato com o suporte.';

/** Mensagem canonica exata de rate limit (§13.1 e §5.8). "X" literal — a UI substitui. */
export const MSG_RATE_LIMIT = 'Muitas tentativas. Tente novamente em X minutos.';

/** Sentinel canonico para `ctx.ip === null` (S022). */
const RATE_LIMIT_IP_UNKNOWN = 'unknown';

// ---- Zod schemas de entrada --------------------------------------------

/**
 * CPF apos remocao de mascara: 11 digitos numericos (§4.1 passo 3
 * client-side, redundante no backend). O frontend limpa a mascara antes de
 * enviar; o backend rejeita qualquer outro formato com BAD_REQUEST — o zod
 * cuida disso automaticamente antes do handler.
 */
const cpfSchema = z.string().regex(/^\d{11}$/);

const loginPlatformInput = z.object({
  cpf: cpfSchema,
  senha: z.string().min(1),
});

const loginSuperAdminInput = z.object({
  email: z.string().email().max(255),
  senha: z.string().min(1),
});

// ---- Contratos de resposta canonicos (S021) ----------------------------

interface LoginPlatformSuccess {
  token: string;
  user: {
    id: number;
    name: string;
    role: PlatformRole;
    companyId: number;
  };
}

interface LoginSuperAdminSuccess {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'super_admin';
  };
}

// ---- Helpers privados --------------------------------------------------

/**
 * Lanca TRPCError TOO_MANY_REQUESTS com o `retryAfterSeconds` no `cause`
 * (padrao S020). Mensagem canonica exata do §13.1 (S021 — "X" literal).
 */
function throwRateLimited(retryAfterSeconds: number): never {
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: MSG_RATE_LIMIT,
    cause: { retryAfterSeconds },
  });
}

/**
 * Deriva o `role` canonico (§2.2, §2.3) do candidato resolvido pela
 * precedencia inviolavel do §2.3. Retorna undefined quando o employee
 * existente NAO e RH nem Lider — cenario canonico de "colaborador puro"
 * em `employees` (§4.1 passo g).
 */
function resolveTargetAndRole(
  candidate: PlatformUserCandidate,
):
  | { kind: 'employee'; user: NonNullable<PlatformUserCandidate['employee']>; role: PlatformRole }
  | { kind: 'clevel'; user: NonNullable<PlatformUserCandidate['clevel']>; role: 'clevel' }
  | { kind: 'collaborator_only'; user: NonNullable<PlatformUserCandidate['employee']> }
  | undefined {
  const { employee, clevel } = candidate;
  // Regra 1 (§2.3): isRH prevalece — role administrativa distingue-se pelo
  // isLider (rh_lider quando acumula, rh puro caso contrario).
  if (employee !== undefined && employee.isRH === true) {
    return {
      kind: 'employee',
      user: employee,
      role: employee.isLider === true ? 'rh_lider' : 'rh',
    };
  }
  // Regra 2 (§2.3): registro em cLevelMembers com mesmo CPF e mesma
  // empresa (a agregacao ja garante o "mesma empresa").
  if (clevel !== undefined) {
    return { kind: 'clevel', user: clevel, role: 'clevel' };
  }
  // Regra 3 (§2.3): isLider (sem isRH e sem C-level).
  if (employee !== undefined && employee.isLider === true) {
    return { kind: 'employee', user: employee, role: 'lider' };
  }
  // Regra 4 (§2.3): colaborador puro — employee sem isRH e sem isLider.
  if (employee !== undefined) {
    return { kind: 'collaborator_only', user: employee };
  }
  return undefined;
}

// ---- authRouter --------------------------------------------------------

export const authRouter = router({
  /**
   * `/` — login unificado (§4.1). Ordem canonica a-i, comentada nos
   * proprios passos. Perfis atendidos: RH, RH-Lider, C-level, Lider.
   * Colaborador puro digitando o proprio CPF recebe FORBIDDEN com
   * `redirectUrl: '/colaborador'` (canonico §4.1 g, §13.1).
   */
  loginPlatform: publicProcedure
    .input(loginPlatformInput)
    .mutation(async ({ ctx, input }): Promise<LoginPlatformSuccess> => {
      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;
      const rule = RATE_LIMITS.loginUnified;
      const key = buildRateLimitKey(ip, rule.op, input.cpf);

      // (a) — Rate limit.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }

      // (b) e (c) — Busca cross-company (agregada por companyId).
      const candidates = await findPlatformUserByCpf(ctx.db, input.cpf);

      // (d) — Nao encontrado + (S019) ambiguidade cross-company. Ambos
      // sao tratados como "nao encontrado" para preservar anti-enumeracao.
      if (candidates.length !== 1) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }
      const only = candidates[0];
      if (only === undefined) {
        // Inalcancavel (candidates.length === 1 acima), mas o narrowing
        // do TS exige. Trata como "nao encontrado" defensivamente.
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // Precedencia §2.3 escolhe o alvo antes das verificacoes de e/f.
      const resolved = resolveTargetAndRole(only);
      if (resolved === undefined) {
        // Nenhum registro elegivel no candidato — trata como "nao
        // encontrado". O caminho canonico coloca este cenario em (d).
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // (e) — status = 'inativo' (nao incrementa; §4.1 e).
      // Para C-level, DOC 01 §4.4 declara status ativo/inativo; para
      // employee, §4.5. Colaborador puro tambem tem status; tratamos
      // igual — a mensagem canonica cobre "encontrado mas inativo".
      const targetStatus = resolved.user.status;
      if (targetStatus === 'inativo') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // (f) — bcrypt.compare. `passwordHash` pode ser null para titulares
      // que ainda nao definiram senha (passwordSet=false); tratamos como
      // senha errada (incrementa rate limit) — anti-enumeracao preservada.
      const passwordHash = resolved.user.passwordHash;
      if (passwordHash === null || passwordHash === undefined) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }
      const passwordOk = await verifyPassword(input.senha, passwordHash);
      if (!passwordOk) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
      }

      // (g) — colaborador puro APOS validar senha (canonico §4.1 g).
      if (resolved.kind === 'collaborator_only') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: MSG_COLLABORATOR_ONLY,
          cause: { redirectUrl: '/colaborador' },
        });
      }

      // (h) — empresa inativa.
      const company = await getCompanyById(ctx.db, only.companyId);
      if (company === undefined || company.status === 'inativa') {
        throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_INACTIVE });
      }

      // (i) — Sucesso: reset + emissao do JWT.
      ctx.rateLimiter.reset(key);
      const token = await signPlatformToken({
        userId: resolved.user.id,
        role: resolved.role,
        companyId: only.companyId,
        credentialVersion: deriveCredentialVersion(passwordHash),
      });
      return {
        token,
        user: {
          id: resolved.user.id,
          name: resolved.user.name,
          role: resolved.role,
          companyId: only.companyId,
        },
      };
    }),

  /**
   * `/login-super-admin` — login exclusivo do Super Admin (§4.2). Ordem
   * canonica a-e. Sem `exp` no JWT (§5.1 — sessao nunca expira).
   */
  loginSuperAdmin: publicProcedure
    .input(loginSuperAdminInput)
    .mutation(async ({ ctx, input }): Promise<LoginSuperAdminSuccess> => {
      const ip = ctx.ip ?? RATE_LIMIT_IP_UNKNOWN;
      const rule = RATE_LIMITS.loginSuperAdmin;
      const key = buildRateLimitKey(ip, rule.op, input.email);

      // (a) — Rate limit.
      const status = ctx.rateLimiter.check(key, rule);
      if (status.blocked) {
        throwRateLimited(status.retryAfterSeconds);
      }

      // (b) — Busca em superAdmins por email (UNIQUE global).
      const admin = await getSuperAdminByEmail(ctx.db, input.email);

      // (c) — Nao encontrado.
      if (admin === undefined) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_SUPER_ADMIN_INVALID });
      }

      // (d) — bcrypt.compare. `passwordHash` e NOT NULL no schema (§4.1
      // DOC 01), mas o narrow defensivo trata como senha errada.
      const passwordOk = await verifyPassword(input.senha, admin.passwordHash);
      if (!passwordOk) {
        ctx.rateLimiter.registerFailure(key, rule);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: MSG_LOGIN_SUPER_ADMIN_INVALID });
      }

      // (e) — Sucesso: reset + emissao do JWT (sem exp).
      ctx.rateLimiter.reset(key);
      const token = await signSuperAdminToken({
        superAdminId: admin.id,
        credentialVersion: deriveCredentialVersion(admin.passwordHash + admin.email),
      });
      return {
        token,
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: 'super_admin',
        },
      };
    }),
});
