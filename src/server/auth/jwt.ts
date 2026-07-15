// ROIP APP 9BOX — modulo de JWT (ME-020).
//
// Assinatura e verificacao HS256 via `jose`, segredo unico em
// `process.env.JWT_SECRET` (nunca hard-coded; `.env.example` documenta a
// chave). Nao existe refresh token no canonico: o DOC 02 define tres
// regimes de sessao (§5.1-§5.3) e nenhum usa refresh/rotacao.
//
// Regimes cobertos por este modulo:
// - Super Admin (§5.1): JWT SEM claim `exp` — sessao nunca expira por
//   inatividade. Emitido por `signSuperAdminToken`.
// - Perfis administrativos (§5.2): JWT com `exp` sliding de 8 horas.
//   Emitido por `signPlatformToken`; a reemissao a cada request e
//   responsabilidade do middleware (ME-021).
// O `portalToken` do portal do colaborador (§5.3) nasce na ME que
// implementa `collaboratorPortal.identify` — fora do escopo da ME-020.
//
// Claim canonico `role` (DOC 02 §2.2): enum fechado de 5 valores. Nao
// existe o valor `'colaborador'` — colaborador puro nunca recebe JWT de
// plataforma.
//
// Claim `pwv` — versao de credencial derivada (S011, decisao E1 opcao B):
// invalidacao de sessao (§5.7) sem blacklist e sem tabela nova. O token
// carrega um resumo do `passwordHash` vigente (para Super Admin, de
// `passwordHash + email`); o middleware compara com o valor derivado do
// registro atual. Troca de senha ou de e-mail muda a derivacao e todos os
// tokens anteriores caem. O comportamento "exceto a sessao atual" do
// `/alterar-senha` e preservado pela reemissao de token novo na resposta
// 200 da propria operacao (ME-022).

import { createHash } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

/** Roles do login unificado (`/`) — DOC 02 §2.2. */
export const PLATFORM_ROLES = ['rh', 'rh_lider', 'clevel', 'lider'] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** TTL canonico da sessao administrativa: sliding 8h (DOC 02 §5.2). */
export const PLATFORM_SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Claims de entrada para emissao de token da plataforma (§4.1 passo i). */
export interface PlatformTokenInput {
  userId: number;
  role: PlatformRole;
  companyId: number;
  credentialVersion: string;
}

/** Claims de entrada para emissao de token do Super Admin (§4.2 passo e). */
export interface SuperAdminTokenInput {
  superAdminId: number;
  credentialVersion: string;
}

/** Claims verificados de um token da plataforma. */
export interface PlatformTokenClaims {
  role: PlatformRole;
  userId: number;
  companyId: number;
  credentialVersion: string;
  expiresAtEpochSeconds: number;
}

/** Claims verificados de um token do Super Admin (sem expiracao — §5.1). */
export interface SuperAdminTokenClaims {
  role: 'super_admin';
  superAdminId: number;
  credentialVersion: string;
}

/** Union discriminada por `role` — consumidor faz narrowing (padrao B). */
export type VerifiedToken =
  | { kind: 'platform'; claims: PlatformTokenClaims }
  | { kind: 'super_admin'; claims: SuperAdminTokenClaims };

/** Resultado de verificacao: valido com claims, ou invalido com motivo. */
export type VerifyResult =
  { valid: true; token: VerifiedToken } | { valid: false; reason: 'expired' | 'malformed' };

/**
 * Deriva a versao de credencial (`pwv`) de um usuario (S011). Para perfis
 * administrativos, do `passwordHash`; para Super Admin, o caller concatena
 * o e-mail (`deriveCredentialVersion(passwordHash + email)`) porque a
 * alteracao de e-mail tambem invalida sessoes (§5.7). SHA-256 truncado a
 * 16 hex chars — suficiente para comparacao de versao, sem expor o hash.
 */
export function deriveCredentialVersion(material: string): string {
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET ausente no ambiente — configure .env (ver .env.example)');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Emite o JWT da plataforma administrativa (login unificado `/`).
 * Claims: `sub`, `role`, `companyId`, `pwv`, `iat`, `exp` = now + 8h
 * (DOC 02 §4.1 passo i e §5.2).
 */
export async function signPlatformToken(input: PlatformTokenInput): Promise<string> {
  return new SignJWT({
    role: input.role,
    companyId: input.companyId,
    pwv: input.credentialVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.userId))
    .setIssuedAt()
    .setExpirationTime(`${PLATFORM_SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Emite o JWT do Super Admin (`/login-super-admin`). Claims: `sub`,
 * `role: 'super_admin'`, `pwv`, `iat` — SEM `exp` (DOC 02 §4.2 passo e e
 * §5.1: a sessao nunca expira por inatividade).
 */
export async function signSuperAdminToken(input: SuperAdminTokenInput): Promise<string> {
  return new SignJWT({
    role: 'super_admin',
    pwv: input.credentialVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.superAdminId))
    .setIssuedAt()
    .sign(getSecretKey());
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}

/**
 * Verifica assinatura e expiracao de um token e devolve a union
 * discriminada por `role`. Nunca lanca: token expirado devolve
 * `{ valid: false, reason: 'expired' }`; assinatura invalida, claims
 * fora do enum canonico ou estrutura corrompida devolvem
 * `{ valid: false, reason: 'malformed' }` — mensagens canonicas de erro
 * pertencem as procedures (DOC 02 §13), nao a este modulo.
 */
export async function verifyToken(token: string): Promise<VerifyResult> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] });
    payload = result.payload;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') {
      return { valid: false, reason: 'expired' };
    }
    return { valid: false, reason: 'malformed' };
  }

  const sub = typeof payload.sub === 'string' ? Number.parseInt(payload.sub, 10) : Number.NaN;
  const pwv = payload.pwv;
  if (!Number.isInteger(sub) || typeof pwv !== 'string') {
    return { valid: false, reason: 'malformed' };
  }

  if (payload.role === 'super_admin') {
    // Token do Super Admin NUNCA carrega `exp` (§5.1). Um token com
    // `role: 'super_admin'` e `exp` presente nao foi emitido por este
    // modulo — tratado como malformado.
    if (payload.exp !== undefined) {
      return { valid: false, reason: 'malformed' };
    }
    return {
      valid: true,
      token: {
        kind: 'super_admin',
        claims: { role: 'super_admin', superAdminId: sub, credentialVersion: pwv },
      },
    };
  }

  if (isPlatformRole(payload.role)) {
    const companyId = payload.companyId;
    const exp = payload.exp;
    if (typeof companyId !== 'number' || typeof exp !== 'number') {
      return { valid: false, reason: 'malformed' };
    }
    return {
      valid: true,
      token: {
        kind: 'platform',
        claims: {
          role: payload.role,
          userId: sub,
          companyId,
          credentialVersion: pwv,
          expiresAtEpochSeconds: exp,
        },
      },
    };
  }

  return { valid: false, reason: 'malformed' };
}
