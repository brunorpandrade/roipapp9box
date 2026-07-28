// ROIP APP 9BOX — modulo do `pdfEphemeralToken` (ME-050/51, S254).
//
// Token efemero de curta duracao para downloads de PDF sem chamada a IA
// (DOC 03 §11.12 — `nr1.downloadReport`). O binario nao viaja pelo tRPC
// porque o browser precisa de uma URL direta que dispare o download
// (Content-Disposition: attachment); Route Handlers do Next.js
// (S207/S208) atendem essa URL, mas nao herdam o cookie/JWT
// administrativo do request tRPC de forma canonicamente segura, e o
// canonico do §11.12 proibe link publico. A terceira via canonica e
// esta: o cliente pede a proc `startDownloadToken` (autenticada pelo
// regime administrativo do §5.2), recebe um token efemero HS256 com
// TTL 300s, e o Route Handler consome esse token no path `?token=X`
// para autorizar o download server-side. Zero cookie novo, zero link
// publico, zero janela de reuso alem de 5 minutos.
//
// Racional canonico (S254, aprovado por Bruno na sessao N7/S226):
// - HS256 sobre `JWT_SECRET` — mesma chave dos demais tokens (§5).
// - TTL 300s — janela suficiente para o browser abrir a URL apos a
//   proc devolver a query string; curta o bastante para que o token
//   vazado por qualquer log intermediario tenha valor operacional
//   proximo de zero.
// - Scope canonicamente fechado por union — primeiro valor
//   `'nr1_report'`. ME-053 estende para `'snapshot_9box' | 'board_deck'`
//   por `str_replace` cirurgico (padrao dos enums fechados do projeto).
//   Clima e engajamento (§13.6) e URL direto sem token — nunca consome
//   este modulo.
//
// Escopo canonico: este token NUNCA autentica procedures administrativas
// nem substitui `PlatformTokenClaims`. O verificador devolve union
// discriminada propria (`kind: 'pdf_ephemeral'`) para forcar narrowing e
// impedir confusao com outros regimes de token do projeto.
//
// Precedente direto: `nr1StartToken.ts` (S236) — mesma forma, mesmo
// verify pattern, mesmo `getSecretKey()` interno.

import { jwtVerify, SignJWT } from 'jose';

/**
 * TTL do token efemero (S254). 5 minutos e a janela canonica canonizada
 * na sessao N7/S226 — suficiente para o browser abrir a URL apos a
 * proc devolver, curta para minimizar valor operacional de vazamento.
 */
export const PDF_EPHEMERAL_TTL_SECONDS = 5 * 60;

/**
 * Scope canonico do token — union fechado. ME-050/51 abre com um unico
 * consumidor; ME-053 estende para `'snapshot_9box' | 'board_deck'` por
 * str_replace cirurgico (S251). Clima e engajamento nao entra — usa URL
 * direto sem token, conforme DOC 03 §13.6.
 */
export type PdfEphemeralTokenScope = 'nr1_report';

/** Claims de entrada para emissao do token. */
export interface PdfEphemeralTokenInput {
  /** Escopo canonico do download alvo. */
  scope: PdfEphemeralTokenScope;
  /** Empresa dona do artefato (isolamento canonico do §2.4 do DOC 04). */
  companyId: number;
  /**
   * ID do recurso especifico dentro do scope. Semantica varia por
   * scope: para `'nr1_report'` e o `copsoqCycles.id` (i.e. `cicloDbId`).
   * A union `scope` fecha o mapeamento; o consumidor no Route Handler
   * faz o narrowing pelo `scope` antes de usar.
   */
  resourceId: number;
  /**
   * `userId` do agente que solicitou o token (auditoria — nunca
   * autorizacao). O download e reautorizado no Route Handler contra a
   * matriz do DOC 02, ignorando este campo para permissao. `userType`
   * viaja junto para diferenciar `super_admin` de agentes de plataforma
   * (§5.1 x §5.2).
   */
  userId: number;
  userType: 'super_admin' | 'employee';
}

/** Claims verificados do token. */
export interface PdfEphemeralTokenClaims {
  kind: 'pdf_ephemeral';
  scope: PdfEphemeralTokenScope;
  companyId: number;
  resourceId: number;
  userId: number;
  userType: 'super_admin' | 'employee';
  /** `iat` do JWT — instante assinado de emissao (epoch s). */
  issuedAtEpochSeconds: number;
  /** `exp` do JWT — instante assinado de expiracao (epoch s). */
  expiresAtEpochSeconds: number;
}

/** Resultado da verificacao: valido com claims ou invalido com motivo. */
export type PdfEphemeralVerifyResult =
  | { valid: true; claims: PdfEphemeralTokenClaims }
  | { valid: false; reason: 'expired' | 'malformed' };

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET ausente no ambiente — configure .env (ver .env.example)');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Emite o token efemero. Claims: `sub` = `userId`,
 * `kind: 'pdf_ephemeral'`, `scope`, `companyId`, `resourceId`,
 * `userType`, `iat`, `exp`.
 *
 * `issuedAt` e parametro explicito para o Route Handler e os testes
 * controlarem o relogio (convencao canonica de motor deterministico —
 * nunca `new Date()` interno).
 */
export async function signPdfEphemeralToken(
  input: PdfEphemeralTokenInput,
  issuedAt: Date,
): Promise<string> {
  const iatSeconds = Math.floor(issuedAt.getTime() / 1000);
  const expSeconds = iatSeconds + PDF_EPHEMERAL_TTL_SECONDS;
  return new SignJWT({
    kind: 'pdf_ephemeral',
    scope: input.scope,
    companyId: input.companyId,
    resourceId: input.resourceId,
    userType: input.userType,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.userId))
    .setIssuedAt(iatSeconds)
    .setExpirationTime(expSeconds)
    .sign(getSecretKey());
}

/**
 * Verifica assinatura e expiracao do token. Nunca lanca — retorna
 * invalidacao discriminada. Claims fora do formato canonico caem em
 * `malformed`.
 *
 * `currentDate` e o relogio da checagem de expiracao. O Route Handler
 * canonico passa `new Date()`; os testes controlam explicitamente com
 * `vi.setSystemTime()`.
 */
export async function verifyPdfEphemeralToken(
  token: string,
  currentDate?: Date,
): Promise<PdfEphemeralVerifyResult> {
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
      ...(currentDate === undefined ? {} : { currentDate }),
    });
    payload = result.payload;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') {
      return { valid: false, reason: 'expired' };
    }
    return { valid: false, reason: 'malformed' };
  }

  if (payload.kind !== 'pdf_ephemeral') {
    return { valid: false, reason: 'malformed' };
  }
  const scope = payload.scope;
  const companyId = payload.companyId;
  const resourceId = payload.resourceId;
  const userType = payload.userType;
  const sub = typeof payload.sub === 'string' ? Number.parseInt(payload.sub, 10) : Number.NaN;
  const iat = payload.iat;
  const exp = payload.exp;

  if (scope !== 'nr1_report') {
    return { valid: false, reason: 'malformed' };
  }
  if (
    typeof companyId !== 'number' ||
    typeof resourceId !== 'number' ||
    !Number.isInteger(sub) ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  ) {
    return { valid: false, reason: 'malformed' };
  }
  if (userType !== 'super_admin' && userType !== 'employee') {
    return { valid: false, reason: 'malformed' };
  }

  return {
    valid: true,
    claims: {
      kind: 'pdf_ephemeral',
      scope,
      companyId,
      resourceId,
      userId: sub,
      userType,
      issuedAtEpochSeconds: iat,
      expiresAtEpochSeconds: exp,
    },
  };
}
