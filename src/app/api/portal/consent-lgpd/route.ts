// ROIP APP 9BOX — Route Handler `POST /api/portal/consent-lgpd`
// (ME-023, §7.2 passo 5).
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

import { NextResponse } from 'next/server';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import { recordLGPDConsent } from '../../../../server/services/lgpdConsents';
import { LGPD_TERM_VERSION } from '../../../../lib/env';

export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';
export const MSG_MISSING_TOKEN = 'Sessão ausente.';

let dbClient: RoipDbClient | null = null;

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

export function __setPortalConsentDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

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
