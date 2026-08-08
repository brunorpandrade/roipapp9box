// ROIP APP 9BOX — Route Handler `POST /api/portal/consent-lgpd`
// (ME-023, §7.2 passo 5; ME-070 refactor S366).
//
// Recebe `{ portalToken }` no body, verifica assinatura + expiracao,
// grava `lgpdConsents` para a versao canonica vigente
// (`LGPD_TERM_VERSION`). Idempotente por UNIQUE canonica
// (`uq_lgpd_employee` / `uq_lgpd_clevel`).
//
// Sem rate limit dedicado (canonico §5.8 nao contempla — o gate LGPD
// chega apos identificacao ja rate-limitada §4.3 passo a).
//
// Retorno canonico 200: `{ gateStep: 'pendencias' }` (§7.2 passo 5).
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): constantes de
// mensagem, estado privado dbClient e escape hatch migraram para
// `./internals.ts` irmao. Este arquivo exporta apenas POST para
// conformidade Next 15 App Router.

import { NextResponse } from 'next/server';

import { verifyPortalToken } from '../../../../server/auth/portalToken';
import { recordLGPDConsent } from '../../../../server/services/lgpdConsents';
import { LGPD_TERM_VERSION } from '../../../../lib/env';

import { MSG_EXPIRED_TOKEN, MSG_INVALID_TOKEN, MSG_MISSING_TOKEN, getDbClient } from './internals';

interface RequestBody {
  portalToken: unknown;
}

interface ConsentSuccess {
  gateStep: 'pendencias';
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN }, { status: 400 });
  }

  const raw = body.portalToken;
  if (typeof raw !== 'string' || raw.length === 0) {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN }, { status: 400 });
  }

  const verified = await verifyPortalToken(raw);
  if (!verified.valid) {
    const msg = verified.reason === 'expired' ? MSG_EXPIRED_TOKEN : MSG_INVALID_TOKEN;
    return NextResponse.json({ msg }, { status: 401 });
  }

  const { companyId, titularType, titularId } = verified.claims;
  const { db } = getDbClient();

  await recordLGPDConsent(db, companyId, titularType, titularId, LGPD_TERM_VERSION);

  const body200: ConsentSuccess = { gateStep: 'pendencias' };
  return NextResponse.json(body200, { status: 200 });
}
