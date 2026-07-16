// ROIP APP 9BOX — modulo de token de credencial (ME-022b).
//
// Assinatura e verificacao de JWT para links de credencial (reset de senha
// e primeiro acesso) — DOC 02 §4.4 e §4.5. Separado do modulo `jwt.ts`
// (ME-020, sessao) para preservar responsabilidades disjuntas:
//
//   - `jwt.ts` cuida de TOKEN DE SESSAO — regime discriminado por `role`,
//     com `exp` sliding 8h para plataforma e sem `exp` para Super Admin
//     (§5.1, §5.2). O tipo `VerifiedToken` do jwt.ts nao mistura tokens de
//     link com sessao.
//
//   - `credentialToken.ts` cuida de TOKEN DE LINK — portador nao-adivinhavel
//     emitido no fluxo de `forgotPassword` (§4.4) ou pelo botao de envio de
//     primeiro acesso na ficha (§5.5, fora do escopo da ME-022b). Payload
//     minimo: `{ sub, tipo, userType }`. SEM `exp` no JWT: a autoridade de
//     validade e `accessTokens.expiresAt` (§5.4), fonte canonica unica.
//
// Segredo e algoritmo: mesmos do jwt.ts (HS256, `JWT_SECRET`). Reuso do
// segredo aceito porque o payload discriminado (`tipo` presente APENAS em
// tokens de credencial; `role` presente APENAS em tokens de sessao) impede
// confusao entre os dois tipos de token em consumo — o verifyToken de
// sessao rejeita payload sem `role`; o verifyCredentialToken rejeita
// payload sem `tipo`.
//
// Decisao de autor S023 (ME-022b): modulo separado + payload sem `exp`.
// Racional: consolidar em jwt.ts poluiria a union `VerifiedToken` da
// sessao com um terceiro kind; incluir `exp` no JWT criaria autoridade de
// validade paralela a `accessTokens.expiresAt`, com risco de drift entre
// as duas fontes. Alternativa considerada e descartada: JWT com `exp = 7d`
// como defesa em profundidade — descartada porque a mecanica de
// invalidacao §5.4 (concorrencia + usedAt) e a fonte unica `accessTokens`
// ja cobrem 100% dos casos canonicos.
//
// RV-13: consumidor exclusivo `authRouter` — procedures `forgotPassword`,
// `validateToken`, `resetPassword`, `firstAccess` — mais os testes de
// integracao desta ME. Sem chamador fora deste conjunto ate a ME-022c.

import { randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

/** Tipos canonicos de token de credencial (DOC 02 §4.4, §4.5, §5.4). */
const CREDENTIAL_TOKEN_TIPOS = ['reset', 'first_access'] as const;

export type CredentialTokenTipo = (typeof CREDENTIAL_TOKEN_TIPOS)[number];

/** Discriminador polimorfico do titular (DOC 01 §4.8 — enum `userType`). */
const CREDENTIAL_USER_TYPES = ['employee', 'clevel', 'super_admin'] as const;

export type CredentialUserType = (typeof CREDENTIAL_USER_TYPES)[number];

/** Payload de entrada para emissao do JWT de credencial. */
interface CredentialTokenInput {
  userId: number;
  tipo: CredentialTokenTipo;
  userType: CredentialUserType;
}

/** Claims verificados de um token de credencial. */
interface CredentialTokenClaims {
  userId: number;
  tipo: CredentialTokenTipo;
  userType: CredentialUserType;
}

/** Resultado de verificacao: valido com claims, ou invalido. */
type CredentialVerifyResult =
  { valid: true; claims: CredentialTokenClaims } | { valid: false; reason: 'malformed' };

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET ausente no ambiente — configure .env (ver .env.example)');
  }
  return new TextEncoder().encode(secret);
}

function isCredentialTipo(value: unknown): value is CredentialTokenTipo {
  return typeof value === 'string' && (CREDENTIAL_TOKEN_TIPOS as readonly string[]).includes(value);
}

function isCredentialUserType(value: unknown): value is CredentialUserType {
  return typeof value === 'string' && (CREDENTIAL_USER_TYPES as readonly string[]).includes(value);
}

/**
 * Emite o JWT de credencial para link de e-mail. Claims: `sub`, `tipo`,
 * `userType`, `jti` (nonce de 128 bits base64url), `iat` — SEM `exp` (a
 * validade canonica esta em `accessTokens.expiresAt`, §5.4). O caller
 * (`auth.forgotPassword` ou o botao da ficha na ME-022c) grava o retorno
 * em `accessTokens.token` (VARCHAR(255) UNIQUE, DOC 01 §4.8) junto com o
 * `expiresAt = createdAt + 7 dias`.
 *
 * O `jti` garante unicidade global do valor de `token` mesmo quando duas
 * emissoes acontecem no mesmo segundo (`iat` em segundos coincidiria e
 * produziria assinaturas identicas, violando o UNIQUE). Nonce de 128 bits
 * torna colisao acidental estatisticamente inviavel.
 */
export async function signCredentialToken(input: CredentialTokenInput): Promise<string> {
  return new SignJWT({
    tipo: input.tipo,
    userType: input.userType,
    jti: randomBytes(16).toString('base64url'),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.userId))
    .setIssuedAt()
    .sign(getSecretKey());
}

/**
 * Verifica assinatura e estrutura do token de credencial e devolve os
 * claims tipados. Nunca lanca: assinatura invalida, claims fora do enum
 * canonico ou estrutura corrompida devolvem
 * `{ valid: false, reason: 'malformed' }`. Verificacao de `usedAt`,
 * `expiresAt` e `type` do registro em `accessTokens` sao responsabilidade
 * do handler (`auth.validateToken` / `auth.resetPassword` /
 * `auth.firstAccess`), conforme ordem canonica §4.5 passo 4.
 *
 * O caller NAO deve confundir este verificador com o `verifyToken` de
 * sessao (`jwt.ts`): payloads sem `role` sao rejeitados pelo `verifyToken`
 * de sessao; payloads sem `tipo` sao rejeitados por este.
 */
export async function verifyCredentialToken(token: string): Promise<CredentialVerifyResult> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] });
    payload = result.payload;
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const sub = typeof payload.sub === 'string' ? Number.parseInt(payload.sub, 10) : Number.NaN;
  if (!Number.isInteger(sub) || sub <= 0) {
    return { valid: false, reason: 'malformed' };
  }

  if (!isCredentialTipo(payload.tipo) || !isCredentialUserType(payload.userType)) {
    return { valid: false, reason: 'malformed' };
  }

  // Um token de credencial nunca carrega `exp` (S023 — validade canonica
  // vive em `accessTokens.expiresAt`). Payload com `exp` foi emitido por
  // outro modulo (provavelmente o `jwt.ts` de sessao) e nao pertence aqui.
  if (payload.exp !== undefined) {
    return { valid: false, reason: 'malformed' };
  }

  // Um token de credencial nunca carrega `role`. Cruzamento com o
  // `verifyToken` de sessao: um token de sessao carrega `role`; este nao.
  // A presenca de `role` no payload significa que o token nao e de
  // credencial.
  if (payload.role !== undefined) {
    return { valid: false, reason: 'malformed' };
  }

  return {
    valid: true,
    claims: { userId: sub, tipo: payload.tipo, userType: payload.userType },
  };
}
