// ROIP APP 9BOX — modulo do `portalToken` (ME-023, S042).
//
// Token de sessao do portal do colaborador (DOC 02 §5.3). Independente
// dos regimes administrativos (§5.1 e §5.2): claim `role` NAO existe
// (colaborador puro nunca recebe JWT de plataforma — §2.2). Usa a mesma
// chave `JWT_SECRET` HS256 e a mesma dependencia `jose`.
//
// Semantica canonica §5.3: portal opera com token independente
// (`portalToken`) armazenado em `sessionStorage`; duracao "ate
// fechamento da aba". O JWT precisa de `exp` por seguranca — o
// comportamento canonico e realizado no cliente (nao persistir alem da
// aba); no servidor definimos TTL fallback de 12h (S042) como
// mecanismo defensivo contra reuso indevido de token colado. Bump de
// TTL requer S### dedicada.
//
// Titular polimorfico A: o token carrega `titularType` ('employee' |
// 'clevel') e `titularId`. Fluxos NR-1, IQL e pendencias que consomem o
// token no Bloco B3+ usam ambos para escopo.
//
// Escopo canonico: portalToken NUNCA e aceito por procedures
// administrativas (roleProcedure em `trpc.ts`). O verificador aqui
// devolve union discriminada distinta de `VerifiedToken` administrativo
// para forcar narrowing no consumidor.

import { jwtVerify, SignJWT } from 'jose';

/** TTL do portalToken (S042). Defensivo — sessionStorage encerra antes. */
const PORTAL_SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Discriminante do titular (padrao polimorfico A). */
type PortalTitularType = 'employee' | 'clevel';

/** Claims de entrada para emissao do portalToken. */
interface PortalTokenInput {
  companyId: number;
  titularType: PortalTitularType;
  titularId: number;
}

/** Claims verificados do portalToken. */
interface PortalTokenClaims {
  kind: 'portal';
  companyId: number;
  titularType: PortalTitularType;
  titularId: number;
  expiresAtEpochSeconds: number;
}

/** Resultado: valido com claims ou invalido com motivo. */
type PortalVerifyResult =
  { valid: true; claims: PortalTokenClaims } | { valid: false; reason: 'expired' | 'malformed' };

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET ausente no ambiente — configure .env (ver .env.example)');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Emite o portalToken (§5.3). Claims: `sub` = titularId, `kind: 'portal'`,
 * `companyId`, `titularType`, `iat`, `exp` = now + 12h (S042).
 */
export async function signPortalToken(input: PortalTokenInput): Promise<string> {
  return new SignJWT({
    kind: 'portal',
    companyId: input.companyId,
    titularType: input.titularType,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.titularId))
    .setIssuedAt()
    .setExpirationTime(`${PORTAL_SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

function isPortalTitularType(value: unknown): value is PortalTitularType {
  return value === 'employee' || value === 'clevel';
}

/**
 * Verifica assinatura e expiracao. Nunca lanca — retorna invalidacao
 * discriminada. Claims fora do formato canonico caem em `malformed`.
 */
export async function verifyPortalToken(token: string): Promise<PortalVerifyResult> {
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

  if (payload.kind !== 'portal') {
    return { valid: false, reason: 'malformed' };
  }
  const sub = typeof payload.sub === 'string' ? Number.parseInt(payload.sub, 10) : Number.NaN;
  const companyId = payload.companyId;
  const titularType = payload.titularType;
  const exp = payload.exp;
  if (
    !Number.isInteger(sub) ||
    typeof companyId !== 'number' ||
    !isPortalTitularType(titularType) ||
    typeof exp !== 'number'
  ) {
    return { valid: false, reason: 'malformed' };
  }
  return {
    valid: true,
    claims: {
      kind: 'portal',
      companyId,
      titularType,
      titularId: sub,
      expiresAtEpochSeconds: exp,
    },
  };
}
