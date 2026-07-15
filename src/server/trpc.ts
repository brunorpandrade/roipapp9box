// ROIP APP 9BOX — bootstrap tRPC 11 (ME-021).
//
// Primeira infraestrutura tRPC do repositorio: define o contexto, as
// procedures base e os guards canonicos que todo o Bloco B3 (routers de
// dominio) herda. Nenhuma regra de acesso e reimplementada nas procedures
// de dominio — elas apenas escolhem entre `publicProcedure`,
// `protectedProcedure` e `roleProcedure(...)`.
//
// Fonte canonica: DOC 02.
// - §2.2 — enum `role` fechado de 5 valores (super_admin, rh, rh_lider,
//   clevel, lider). `roleProcedure` cruza contra este enum.
// - §5.1/§5.2 — regimes de sessao: Super Admin sem `exp`; administrativos
//   com sliding 8h. A reemissao do token administrativo a cada request
//   autenticada bem-sucedida acontece aqui (middleware `authed`), e o
//   token novo viaja para fora via `ctx.reissuedToken` — o adapter
//   (route.ts) o publica no header de resposta `x-roip-session` (S013).
// - §5.6 (S444) — status de empresa: toda procedure autenticada de perfil
//   administrativo (nao super_admin) verifica `companies.status`; 'inativa'
//   → FORBIDDEN com `{ msg, forceLogout: true }`.
// - §5.7 — invalidacao de sessao por versao de credencial (pwv, S011): o
//   guard compara o claim `pwv` do token com o valor derivado do registro
//   vigente do titular. Divergiu (troca de senha/e-mail) → sessao invalida.
// - §8.3 — distincao canonica: sessao expirada/invalida NUNCA vira
//   AccessDenied. No transporte tRPC isso e UNAUTHORIZED (o front trata
//   como "sessao expirou", nao renderiza AccessDeniedPage). Perfil errado
//   em rota valida e FORBIDDEN.
// - §8.4 — os 8 passos do middleware server-side canonico, aqui compostos
//   como: `authed` (passos 1,2,6,7 + pwv/§5.7) e `roleProcedure` (passos
//   3,5). Colaborador puro (passo 8) nao possui JWT de plataforma (§2.2),
//   logo nao alcanca estas procedures.
//
// Isolamento por empresa (§2.4): o contexto autenticado carrega `companyId`
// do JWT; procedures de plataforma so enxergam a propria empresa. O
// super_admin atravessa (nao tem `companyId` — opera global). O
// enforcement por-linha (WHERE companyId = ctx.companyId) e responsabilidade
// das procedures de dominio (Bloco B3); aqui o contexto expoe a identidade
// autenticada de forma que o dominio nao possa ler o companyId de outra
// fonte que nao o token.

import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

import { createDbClient, type RoipDatabase } from '../db/client';
import {
  deriveCredentialVersion,
  verifyToken,
  type PlatformRole,
  type VerifiedToken,
} from './auth/jwt';
import { createRateLimiter, type RateLimiter } from './auth/rateLimit';
import { getCLevelMemberById } from './services/cLevelMembers';
import { getCompanyById } from './services/companies';
import { getEmployeeById } from './services/employees';
import { getSuperAdminById } from './services/superAdmins';

/** Enum canonico completo do claim `role` (DOC 02 §2.2) — 5 valores. */
export const ALL_ROLES = ['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'] as const;

/** Um dos 5 perfis canonicos que emitem JWT de plataforma (§2.2). */
export type Role = (typeof ALL_ROLES)[number];

/**
 * Mensagem canonica de empresa inativa (DOC 02 §5.6). Exportada para que o
 * teste asserte o literal exato, sem reescrever a string.
 */
export const COMPANY_INACTIVE_MESSAGE =
  'Empresa inativa no sistema. Entre em contato com o suporte.';

/**
 * Identidade autenticada derivada do JWT verificado. Discriminada por
 * `role`: o super_admin nao carrega `companyId` (opera global — §2.4); os
 * perfis administrativos carregam o `companyId` do proprio token, unica
 * fonte de isolamento por empresa aceita pelo dominio.
 */
export type AuthenticatedUser =
  | { role: 'super_admin'; superAdminId: number }
  | { role: PlatformRole; userId: number; companyId: number };

/**
 * Singleton do rate limiter por processo (S012). Criado uma unica vez no
 * modulo — o contexto o reexpoe para as procedures de credencial do Bloco
 * B2 (ME-022+). As procedures da ME-021 nao o exercem; ele viaja no
 * contexto para nao precisar ser recriado a cada request (o store em
 * memoria perde sentido se instanciado por request — D003).
 */
const rateLimiter: RateLimiter = createRateLimiter();

/** Resolve a URL de conexao da aplicacao a partir do ambiente. */
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/**
 * Cliente de banco singleton por processo. O pool `mysql2` e caro para
 * recriar por request; uma unica instancia serve toda a aplicacao. Os
 * testes NAO usam este caminho — injetam o proprio `db` via
 * `createContextInner` (ver mais abaixo), contra a base efemera `roip_test`.
 */
let appDb: RoipDatabase | null = null;

function getAppDb(): RoipDatabase {
  if (appDb === null) {
    appDb = createDbClient(resolveDatabaseUrl()).db;
  }
  return appDb;
}

/**
 * Contexto base do tRPC. `reissuedToken` e um slot mutavel que o middleware
 * `authed` preenche quando reemite a sessao administrativa (§5.2); o adapter
 * o le apos a execucao e o publica no header `x-roip-session` (S013). Nao e
 * um claim de negocio — e canal de saida de sessao.
 */
export interface Context {
  db: RoipDatabase;
  rateLimiter: RateLimiter;
  /** Bearer token cru do header `Authorization`, ou null se ausente. */
  bearerToken: string | null;
  /** Preenchido pelo `authed` quando ha reemissao de sessao (§5.2). */
  reissuedToken: { value: string | null };
}

/**
 * Monta o contexto a partir de partes explicitas. Usado tanto pelo adapter
 * (que passa o `db` singleton) quanto pelos testes (que passam o `db` da
 * base efemera). Manter esta funcao pura e sem I/O de rede permite testar
 * os guards sem subir um servidor HTTP.
 */
export function createContextInner(parts: {
  db: RoipDatabase;
  rateLimiter: RateLimiter;
  bearerToken: string | null;
}): Context {
  return {
    db: parts.db,
    rateLimiter: parts.rateLimiter,
    bearerToken: parts.bearerToken,
    reissuedToken: { value: null },
  };
}

/** Extrai o bearer token do header `Authorization: Bearer <token>`. */
function extractBearerToken(headers: Headers): string | null {
  const raw = headers.get('authorization') ?? headers.get('Authorization');
  if (raw === null) {
    return null;
  }
  const match = raw.match(/^Bearer[[:space:]]+(.+)$/i);
  if (match === null || match[1] === undefined) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Factory de contexto para o adapter fetch do Next 15 (§ route.ts). Extrai
 * o bearer token do request e injeta o `db` e o `rateLimiter` singletons.
 */
export function createContext(opts: FetchCreateContextFnOptions): Context {
  return createContextInner({
    db: getAppDb(),
    rateLimiter,
    bearerToken: extractBearerToken(opts.req.headers),
  });
}

const t = initTRPC.context<Context>().create();

/** Cria routers e sub-routers de dominio (Bloco B3). */
export const router = t.router;

/** Cria um caller server-side (usado por jobs e por testes). */
export const createCallerFactory = t.createCallerFactory;

/**
 * Procedure publica: sem exigencia de sessao. Base dos fluxos de
 * autenticacao (login, first access, reset) do Bloco B2 (ME-022+) e de
 * qualquer endpoint que nao dependa de identidade.
 */
export const publicProcedure = t.procedure;

/**
 * Deriva a versao de credencial vigente do titular do token (§5.7, S011).
 * Retorna null quando o titular nao existe ou nao possui `passwordHash`
 * definido (S014): um token cujo titular sumiu ou nunca definiu senha e
 * tratado como sessao invalida, nunca como AccessDenied.
 */
async function currentCredentialVersion(
  db: RoipDatabase,
  token: VerifiedToken,
): Promise<string | null> {
  if (token.kind === 'super_admin') {
    const admin = await getSuperAdminById(db, token.claims.superAdminId);
    if (admin === undefined) {
      return null;
    }
    // Super Admin: e-mail participa da derivacao (§5.7 — alteracao de
    // e-mail tambem invalida sessoes). `passwordHash` e NOT NULL na tabela.
    return deriveCredentialVersion(admin.passwordHash + admin.email);
  }

  if (token.claims.role === 'clevel') {
    const member = await getCLevelMemberById(db, token.claims.userId);
    if (member === undefined || member.passwordHash === null) {
      return null;
    }
    return deriveCredentialVersion(member.passwordHash);
  }

  // rh | rh_lider | lider — titular em `employees`.
  const employee = await getEmployeeById(db, token.claims.userId);
  if (employee === undefined || employee.passwordHash === null) {
    return null;
  }
  return deriveCredentialVersion(employee.passwordHash);
}

/**
 * Middleware de autenticacao (§8.4 passos 1,2,6,7 + §5.7). Ordem canonica:
 *   1. Bearer ausente → UNAUTHORIZED (sessao expirada — §8.3).
 *   2. Token invalido/expirado (verifyToken) → UNAUTHORIZED.
 *   3. pwv divergente do registro vigente (§5.7) → UNAUTHORIZED.
 *   4. Empresa inativa, para perfil administrativo (§5.6, S444) → FORBIDDEN
 *      com `{ msg, forceLogout: true }`.
 *   5. Sucesso: injeta `ctx.user` e, para perfil administrativo, reemite o
 *      token sliding 8h em `ctx.reissuedToken` (§5.2).
 * Autorizacao por perfil (passos 3,5) NAO acontece aqui — fica no
 * `roleProcedure`, para que `protectedProcedure` cubra "qualquer sessao
 * valida" sem amarrar a um conjunto de roles.
 */
const authed = t.middleware(async ({ ctx, next }) => {
  if (ctx.bearerToken === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao ausente.' });
  }

  const result = await verifyToken(ctx.bearerToken);
  if (!result.valid) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
  }

  const expected = await currentCredentialVersion(ctx.db, result.token);
  if (expected === null || expected !== result.token.claims.credentialVersion) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessao expirada.' });
  }

  const token = result.token;
  let user: AuthenticatedUser;

  if (token.kind === 'super_admin') {
    user = { role: 'super_admin', superAdminId: token.claims.superAdminId };
  } else {
    // Perfil administrativo: guard de empresa (§5.6, S444) antes de liberar.
    const company = await getCompanyById(ctx.db, token.claims.companyId);
    if (company === undefined || company.status === 'inativa') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: COMPANY_INACTIVE_MESSAGE,
        cause: { forceLogout: true },
      });
    }
    user = {
      role: token.claims.role,
      userId: token.claims.userId,
      companyId: token.claims.companyId,
    };
    // Reemissao sliding 8h (§5.2): mesmo titular, mesma versao de
    // credencial, novo `exp`. Feito para que TODA request autenticada
    // bem-sucedida de perfil administrativo renove a janela (canonico). O
    // adapter publica o token em `x-roip-session`. O Super Admin nao tem
    // `exp` (§5.1), logo nao reemite.
    ctx.reissuedToken.value = ctx.bearerToken;
  }

  return next({ ctx: { ...ctx, user } });
});

/**
 * Procedure autenticada: exige sessao valida (qualquer um dos 5 perfis).
 * `ctx.user` fica disponivel, tipado como `AuthenticatedUser`. Nao decide
 * perfil — para restringir a papeis especificos, use `roleProcedure`.
 */
export const protectedProcedure = publicProcedure.use(authed);

/**
 * Guard por perfil canonico (§8.4 passos 3,5). Recebe a lista fechada de
 * roles autorizados (subconjunto de `ALL_ROLES`); perfil autenticado fora
 * da lista recebe FORBIDDEN (§8.3 — perfil errado, nunca sessao expirada).
 * As mensagens exatas do AccessDeniedPage (§9) pertencem as rotas/UI; aqui
 * fica apenas o codigo de erro tRPC correto.
 */
export function roleProcedure(roles: readonly Role[]) {
  const allowed = new Set<Role>(roles);
  return protectedProcedure.use(({ ctx, next }) => {
    if (!allowed.has(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Perfil sem permissao para a rota.' });
    }
    return next({ ctx });
  });
}
