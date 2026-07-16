// ROIP APP 9BOX — modulo de token de credencial (ME-022b + ME-022c).
//
// Assinatura e verificacao de JWT para links de credencial (reset de senha,
// primeiro acesso e alteracao de e-mail do Super Admin) — DOC 02 §4.4, §4.5
// e §4.8. Separado do modulo `jwt.ts` (ME-020, sessao) para preservar
// responsabilidades disjuntas:
//
//   - `jwt.ts` cuida de TOKEN DE SESSAO — regime discriminado por `role`,
//     com `exp` sliding 8h para plataforma e sem `exp` para Super Admin
//     (§5.1, §5.2). O tipo `VerifiedToken` do jwt.ts nao mistura tokens de
//     link com sessao.
//
//   - `credentialToken.ts` cuida de TOKEN DE LINK — portador nao-adivinhavel
//     emitido no fluxo de `forgotPassword` (§4.4), no botao de envio de
//     primeiro acesso na ficha (§5.5) e no Bloco A de `/alterar-email`
//     (§4.8). Payload: `{ sub, tipo, userType }` + campo opcional
//     `novoEmail` presente APENAS quando `tipo === 'email_change'`. SEM
//     `exp` no JWT: a autoridade de validade e `accessTokens.expiresAt`
//     (§5.4), fonte canonica unica.
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
// Decisao de autor S027 (ME-022c): extensao do enum `CredentialTokenTipo`
// com `'email_change'`. Canonico §4.8g e §6.5 explicitos ("a semantica de
// mudanca de e-mail e diferenciada no metadado interno do JWT `tipo:
// 'email_change'` ... nao ha valor novo `'email_change'` no enum canonico
// do DOC 01"). O enum canonico DOC 01 refere-se a `accessTokens.type`
// (`'first_access' | 'password_reset'`); a coluna `type` em accessTokens
// permanece `'password_reset'` para email_change. O que estende aqui e o
// discriminador do PAYLOAD do JWT, camada acima. Alternativas descartadas:
// tabela dedicada de solicitacoes de troca de e-mail (canonico proibe —
// ver §19 DOC 01 termos abandonados), coluna `metadata` em accessTokens
// (schema change), tabela separada (custo maior).
//
// Decisao de autor S028 (ME-022c): extensao do payload com campo opcional
// `novoEmail: string`. Presente APENAS em tokens com `tipo === 'email_change'`;
// ausente nos demais. O verificador retorna `novoEmail` no result para o
// caller cruzar com o registro em accessTokens e com o superAdmin
// destinatario no fluxo §4.9.
//
// RV-13: consumidores em `authRouter` — procedures `forgotPassword`,
// `validateToken`, `resetPassword`, `firstAccess` (ME-022b) mais
// `requestEmailChange`, `cancelEmailChange`, `confirmEmailChange`
// (ME-022c) — mais os testes de integracao das duas MEs.

import { randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

/** Tipos canonicos de token de credencial (DOC 02 §4.4, §4.5, §4.8, §5.4). */
const CREDENTIAL_TOKEN_TIPOS = ['reset', 'first_access', 'email_change'] as const;

export type CredentialTokenTipo = (typeof CREDENTIAL_TOKEN_TIPOS)[number];

/** Discriminador polimorfico do titular (DOC 01 §4.8 — enum `userType`). */
const CREDENTIAL_USER_TYPES = ['employee', 'clevel', 'super_admin'] as const;

export type CredentialUserType = (typeof CREDENTIAL_USER_TYPES)[number];

/**
 * Payload de entrada para emissao do JWT de credencial. `novoEmail` e
 * exigido para `tipo === 'email_change'` (S028); ignorado nos demais.
 */
interface CredentialTokenInput {
  userId: number;
  tipo: CredentialTokenTipo;
  userType: CredentialUserType;
  /** Presente APENAS quando `tipo === 'email_change'` (S028, §4.8g). */
  novoEmail?: string;
}

/**
 * Claims verificados de um token de credencial. `novoEmail` sempre presente
 * para `tipo === 'email_change'`; ausente nos demais. O caller que consome
 * um token de email_change deve cruzar o `novoEmail` do payload com o
 * proximo passo canonico do §4.9 (UPDATE superAdmins.email).
 */
interface CredentialTokenClaims {
  userId: number;
  tipo: CredentialTokenTipo;
  userType: CredentialUserType;
  novoEmail?: string;
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
 * validade canonica esta em `accessTokens.expiresAt`, §5.4). Para
 * `tipo === 'email_change'`, o payload inclui tambem `novoEmail` (S028).
 *
 * O caller (`auth.forgotPassword`, botao da ficha, ou `requestEmailChange`)
 * grava o retorno em `accessTokens.token` (VARCHAR(255) UNIQUE, DOC 01 §4.8)
 * junto com o `expiresAt` canonico (§5.4).
 *
 * O `jti` garante unicidade global do valor de `token` mesmo quando duas
 * emissoes acontecem no mesmo segundo (`iat` em segundos coincidiria e
 * produziria assinaturas identicas, violando o UNIQUE). Nonce de 128 bits
 * torna colisao acidental estatisticamente inviavel.
 *
 * Contrato de invocacao: para `tipo === 'email_change'`, o caller deve
 * fornecer `novoEmail`. Ausencia dispara erro em tempo de execucao —
 * defensivo para o caller esquecer o campo obrigatorio.
 */
export async function signCredentialToken(input: CredentialTokenInput): Promise<string> {
  if (input.tipo === 'email_change' && input.novoEmail === undefined) {
    throw new Error('signCredentialToken: `novoEmail` obrigatorio para tipo=email_change (S028)');
  }
  // S032 — compactacao do payload para `email_change`:
  //   - jti de 8 bytes (64 bits, 11 chars base64url), nao 16 bytes;
  //   - SEM claim `iat` (economia ~20 chars no JWT final).
  // Reset/first_access mantem 128 bits de jti + `iat`.
  //
  // Motivo: `accessTokens.token VARCHAR(255)` do canonico DOC 01 §4.8 nao
  // comporta o JWT de email_change com jti de 128 bits + payload
  // `novoEmail` + `iat`. O JWT inclui o novoEmail no payload (S028
  // canonico §4.8g), o que consome ate 100+ chars da margem. Empresas
  // brasileiras B2B tem e-mails de 20-60 chars — a compactacao acomoda
  // com folga esse range.
  //
  // Reducao aceitavel pela concorrencia canonica §5.4
  // (invalidateActiveTokensByUserAndType antes de cada INSERT garante
  // que dois ativos do mesmo (userType, userId, type) nao coexistem; a
  // colisao de `token` UNIQUE so ocorreria com dois INSERT no mesmo
  // segundo do mesmo super_admin com mesmo novoEmail, cenario
  // canonicamente inatingivel — a UI H3 exige 24h entre solicitacoes).
  // A ausencia de `iat` e defensavel: o campo canonico de referencia
  // temporal do consumo e `accessTokens.createdAt`/`expiresAt` (§5.4,
  // fonte unica de validade — S023), nao o `iat` do JWT. Reset e
  // first_access mantem `iat` por ja terem folga na coluna e por
  // simetria com o codigo pre-existente.
  const isEmailChange = input.tipo === 'email_change';
  const jtiBytes = isEmailChange ? 8 : 16;
  const payload: Record<string, unknown> = {
    tipo: input.tipo,
    userType: input.userType,
    jti: randomBytes(jtiBytes).toString('base64url'),
  };
  if (input.novoEmail !== undefined) {
    payload.novoEmail = input.novoEmail;
  }
  const signer = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.userId));
  if (!isEmailChange) {
    signer.setIssuedAt();
  }
  return signer.sign(getSecretKey());
}

/**
 * Verifica assinatura e estrutura do token de credencial e devolve os
 * claims tipados. Nunca lanca: assinatura invalida, claims fora do enum
 * canonico ou estrutura corrompida devolvem
 * `{ valid: false, reason: 'malformed' }`. Verificacao de `usedAt`,
 * `expiresAt` e `type` do registro em `accessTokens` sao responsabilidade
 * do handler (`auth.validateToken` / `auth.resetPassword` /
 * `auth.firstAccess` / `auth.confirmEmailChange`), conforme ordem canonica
 * §4.5 passo 4 e §4.9 passo 3.
 *
 * Para `tipo === 'email_change'`, exige `novoEmail` string no payload;
 * ausencia rejeita como malformado (S028). O caller cruza `novoEmail` com
 * a atualizacao de `superAdmins.email` no fluxo §4.9d.
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

  // Regras de `novoEmail` (S028):
  //   - obrigatorio quando tipo === 'email_change' (payload sem novoEmail
  //     nao pode ter sido emitido por este modulo para este tipo);
  //   - proibido quando tipo !== 'email_change' (payload com novoEmail e
  //     token forjado / bug de emissao — rejeita defensivo).
  let novoEmail: string | undefined;
  if (payload.tipo === 'email_change') {
    if (typeof payload.novoEmail !== 'string' || payload.novoEmail.length === 0) {
      return { valid: false, reason: 'malformed' };
    }
    novoEmail = payload.novoEmail;
  } else if (payload.novoEmail !== undefined) {
    return { valid: false, reason: 'malformed' };
  }

  const claims: CredentialTokenClaims = {
    userId: sub,
    tipo: payload.tipo,
    userType: payload.userType,
  };
  if (novoEmail !== undefined) {
    claims.novoEmail = novoEmail;
  }
  return { valid: true, claims };
}
