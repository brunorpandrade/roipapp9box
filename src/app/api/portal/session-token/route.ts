// ROIP APP 9BOX — Route Handler `POST /api/portal/session-token`
// (ME-B10-02, S247-Alfa + S252).
//
// Endpoint canonico do canal de escrita unico. Consumido pelos 4
// formularios Likert (2 do Instrumento A e 2 do Instrumento D) quando
// `canalAutenticacao === 'platform'` (S246-C). Emite um `portalToken`
// temporario com TTL 10 min (S251) a partir da sessao platform vigente
// do respondente logado, permitindo que os endpoints existentes
// `/api/portal/save-instrument-a`, `/api/portal/save-instrument-d`,
// `/api/portal/save-nr1-response` e `/api/portal/submit-profile-*`
// aceitem submits do canal platform sem alteracao.
//
// Autenticacao: `getServerSession()` (le cookie `session` httpOnly do
// dominio, verifica JWT canonico e enriquece com dados da empresa).
// Aceita apenas `session.kind === 'platform'`. Super admin recebe 403
// (nao e "usuario da empresa" e nao pode responder instrumentos —
// matriz CAMADA_AUTH §10.7 aplicada ao endpoint auxiliar). Ausencia
// de sessao valida recebe 401.
//
// Mapeamento canonico role -> titularType (bit-a-bit do padrao ja
// aplicado em `/meu-portal/page.tsx` linha 89):
// - `session.role === 'clevel'` -> `titularType: 'clevel'`,
//   `titularId: session.userId` (referindo `cLevelMembers.id`).
// - demais roles ('rh', 'rh_lider', 'lider') -> `titularType:
//   'employee'`, `titularId: session.userId` (referindo `employees.id`).
//
// Sem persistencia de log de emissao — o token emitido e portador de
// escopo ja verificado (session cookie httpOnly + JWT HS256). ME futura
// pode canonicamente introduzir log se S### dedicada o exigir.
//
// Metodo: POST (nao idempotente — cada emissao gera JWT novo com `iat`
// atual). Sem body obrigatorio.
//
// Retornos canonicos:
// - 200 + application/json com body `{ portalToken: string,
//   expiresAtEpochSeconds: number, ttlSeconds: number }`.
// - 401 — sem sessao (cookie ausente ou invalido).
// - 403 — sessao valida porem escopo errado (super admin).
//
// **S366** aplicado bit-a-bit: constantes de mensagem migram para
// `./internals.ts` irmao. Este arquivo exporta apenas POST para
// conformidade Next 15 App Router.

import { NextResponse } from 'next/server';

import {
  PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP,
  signPortalToken,
} from '../../../../server/auth/portalToken';
import { getServerSession } from '../../../../server/session/serverSession';

import { MSG_ACESSO_NEGADO_SESSION_TOKEN, MSG_SEM_SESSAO_SESSION_TOKEN } from './internals';

interface SessionTokenSuccess {
  readonly portalToken: string;
  readonly expiresAtEpochSeconds: number;
  readonly ttlSeconds: number;
}

/**
 * `POST /api/portal/session-token`.
 *
 * Autenticado por sessao platform via cookie `session`. Emite
 * `portalToken` temporario TTL 10 min para uso imediato nos endpoints
 * de escrita `/api/portal/save-*`.
 */
export async function POST(): Promise<NextResponse> {
  const session = await getServerSession();
  if (session === null) {
    return NextResponse.json({ msg: MSG_SEM_SESSAO_SESSION_TOKEN }, { status: 401 });
  }
  if (session.kind !== 'platform') {
    return NextResponse.json({ msg: MSG_ACESSO_NEGADO_SESSION_TOKEN }, { status: 403 });
  }

  const titularType: 'employee' | 'clevel' = session.role === 'clevel' ? 'clevel' : 'employee';
  const titularId = session.userId;
  const companyId = session.companyId;

  const portalToken = await signPortalToken({
    companyId,
    titularType,
    titularId,
    ttlSeconds: PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP,
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const body: SessionTokenSuccess = {
    portalToken,
    expiresAtEpochSeconds: nowSec + PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP,
    ttlSeconds: PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP,
  };
  return NextResponse.json(body, { status: 200 });
}
