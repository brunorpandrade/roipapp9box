// ROIP APP 9BOX — modulo do `nr1StartToken` (ME-049cd, S236).
//
// Token de INICIO do questionario do Radar NR-1 (DOC 03 §11.5 —
// controle anti-fraude silencioso "tempo baixo"). Emitido pelo Route
// Handler `POST /api/portal/nr1-form-state` no momento em que a tela do
// questionario carrega, devolvido pelo cliente no `POST
// /api/portal/save-nr1-response` e consumido exclusivamente para
// derivar, NO SERVIDOR, o tempo decorrido entre a abertura da tela e o
// clique em `[Enviar respostas]`.
//
// Racional canonico (S236, estreitamento de S215 aprovado por Bruno):
// §11.5 exige que o tempo seja medido "entre a abertura da tela e o
// clique em [Enviar respostas]". O DOC 01 §11.2 declara
// `copsoqCycleSnapshot` SEM coluna `iniciadoEm` — e o DOC 01 e fonte
// unica e integral do schema (RV-09). Persistir o instante de abertura
// exigiria coluna inexistente no canonico; aceitar o tempo vindo do
// corpo da requisicao entregaria a medicao ao relogio do cliente
// (fraude trivial). A terceira via canonica e esta: o instante de
// abertura viaja ASSINADO (HS256, mesma `JWT_SECRET` do `portalToken`),
// portanto e inviolavel pelo cliente, e o servidor calcula
// `tempoRespostaSegundos = now - iat`. Zero coluna nova, zero desvio do
// DOC 01, medicao server-side.
//
// TTL canonico: 12h, identico ao `portalToken` (S042). O questionario
// nao tem salvamento parcial (§11.4) e a sessao do portal morre com a
// aba; um token de inicio mais longo que a sessao que o originou nao
// teria consumidor. Token expirado NAO bloqueia o envio — o handler
// trata a ausencia de medicao confiavel como "tempo desconhecido" e
// aplica a regra canonica documentada em `save-nr1-response`.
//
// Escopo canonico: este token NUNCA autentica. Ele nao substitui o
// `portalToken` nem e aceito por nenhuma procedure administrativa; o
// verificador devolve union discriminada propria (`kind: 'nr1_start'`)
// para forcar narrowing no consumidor e impedir confusao com
// `PortalTokenClaims`.

import { jwtVerify, SignJWT } from 'jose';

/**
 * TTL do token de inicio. Espelha `PORTAL_SESSION_TTL_SECONDS` (S042) —
 * o token de inicio nunca sobrevive a sessao de portal que o emitiu.
 */
const NR1_START_TTL_SECONDS = 12 * 60 * 60;

/** Claims de entrada para emissao do token de inicio. */
interface Nr1StartTokenInput {
  companyId: number;
  employeeId: number;
  cicloDbId: number;
}

/** Claims verificados do token de inicio. */
export interface Nr1StartTokenClaims {
  kind: 'nr1_start';
  companyId: number;
  employeeId: number;
  cicloDbId: number;
  /** `iat` do JWT — instante assinado de abertura da tela (epoch s). */
  issuedAtEpochSeconds: number;
}

/** Resultado: valido com claims ou invalido com motivo. */
export type Nr1StartVerifyResult =
  { valid: true; claims: Nr1StartTokenClaims } | { valid: false; reason: 'expired' | 'malformed' };

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error('JWT_SECRET ausente no ambiente — configure .env (ver .env.example)');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Emite o token de inicio. Claims: `sub` = employeeId,
 * `kind: 'nr1_start'`, `companyId`, `cicloDbId`, `iat`, `exp`.
 *
 * `issuedAt` e parametro explicito para que o Route Handler e os testes
 * controlem o relogio (convencao canonica de motor deterministico —
 * nunca `new Date()` interno).
 */
export async function signNr1StartToken(
  input: Nr1StartTokenInput,
  issuedAt: Date,
): Promise<string> {
  const iatSeconds = Math.floor(issuedAt.getTime() / 1000);
  return new SignJWT({
    kind: 'nr1_start',
    companyId: input.companyId,
    cicloDbId: input.cicloDbId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(input.employeeId))
    .setIssuedAt(iatSeconds)
    .setExpirationTime(iatSeconds + NR1_START_TTL_SECONDS)
    .sign(getSecretKey());
}

/**
 * Verifica assinatura e expiracao do token de inicio. Nunca lanca —
 * retorna invalidacao discriminada. Claims fora do formato canonico
 * caem em `malformed`.
 *
 * `currentDate` e o relogio usado na checagem de expiracao. O
 * consumidor canonico (`save-nr1-response`) passa o MESMO `now` que
 * usa para calcular `tempoRespostaSegundos`, de modo que a medicao e a
 * validade do token nunca discordem entre si. Omitido, cai no relogio
 * do processo.
 */
export async function verifyNr1StartToken(
  token: string,
  currentDate?: Date,
): Promise<Nr1StartVerifyResult> {
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

  if (payload.kind !== 'nr1_start') {
    return { valid: false, reason: 'malformed' };
  }
  const sub = typeof payload.sub === 'string' ? Number.parseInt(payload.sub, 10) : Number.NaN;
  const companyId = payload.companyId;
  const cicloDbId = payload.cicloDbId;
  const iat = payload.iat;
  if (
    !Number.isInteger(sub) ||
    typeof companyId !== 'number' ||
    typeof cicloDbId !== 'number' ||
    typeof iat !== 'number'
  ) {
    return { valid: false, reason: 'malformed' };
  }
  return {
    valid: true,
    claims: {
      kind: 'nr1_start',
      companyId,
      employeeId: sub,
      cicloDbId,
      issuedAtEpochSeconds: iat,
    },
  };
}
