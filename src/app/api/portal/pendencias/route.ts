// ROIP APP 9BOX — Route Handler `GET /api/portal/pendencias`
// (ME-B10-01, S250 Opção B).
//
// Endpoint canônico do portal do colaborador para listar pendências e
// respondidos recentes do titular autenticado. Consumido pelo Client
// Component `PendenciasClient.tsx` da rota `/colaborador/pendencias`.
//
// S207 preservado bit-a-bit: portal autenticado por `portalToken` NUNCA
// usa tRPC. Este handler consome o helper canônico
// `loadPortalColaboradorPendencias` diretamente — sem sub-router tRPC
// intermediário. Padrão bit-a-bit do handler `GET /api/portal/lgpd/
// portability` (ME-062b).
//
// S343 preservado bit-a-bit: a autorização canônica é derivada
// literalmente do `portalToken` — o handler NÃO aceita `titularId` nem
// `companyId` via input do cliente. Identity vem exclusivamente dos
// claims verificados. Elimina superfície de input tampering e alinha
// com padrão defense-in-depth consolidado.
//
// Método: GET (idempotente, read-only).
// Autenticação: header `Authorization: Bearer <portalToken>`. Padrão
// REST canônico defensivo — não vaza token em URL nem em logs de
// acesso do proxy.
//
// Retornos canônicos:
// - 200 + application/json com body `PortalColaboradorPendencias`.
// - 401 — token ausente, inválido, expirado ou scope errado.
//
// S366 aplicado bit-a-bit: constantes de mensagem, estado privado do
// dbClient e escape hatches migram para `./internals.ts` irmão. Este
// arquivo exporta apenas GET para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';

import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  loadPortalColaboradorPendencias,
  type PortalColaboradorPendencias,
} from '../../../../lib/pendencias/portalColaborador';

import {
  MSG_EXPIRED_TOKEN_PORTAL_PENDENCIAS,
  MSG_INVALID_TOKEN_PORTAL_PENDENCIAS,
  MSG_MISSING_TOKEN_PORTAL_PENDENCIAS,
  getDbClient,
} from './internals';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (header === null || header.length === 0) {
    return null;
  }
  const parts = header.split(' ');
  if (parts.length !== 2) {
    return null;
  }
  if (parts[0]!.toLowerCase() !== 'bearer') {
    return null;
  }
  const token = parts[1]!.trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}

/**
 * `GET /api/portal/pendencias`.
 *
 * Header obrigatório: `Authorization: Bearer <portalToken>`.
 *
 * Response canônico 200: JSON serializado de
 * `PortalColaboradorPendencias` — pendências enriquecidas por regra
 * P-M3.8 + respondidos <7 dias ordenados descendentemente.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const raw = extractBearerToken(req);
  if (raw === null) {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN_PORTAL_PENDENCIAS }, { status: 401 });
  }

  const verified = await verifyPortalToken(raw);
  if (!verified.valid) {
    const msg =
      verified.reason === 'expired'
        ? MSG_EXPIRED_TOKEN_PORTAL_PENDENCIAS
        : MSG_INVALID_TOKEN_PORTAL_PENDENCIAS;
    return NextResponse.json({ msg }, { status: 401 });
  }

  const { companyId, titularType, titularId } = verified.claims;
  const { db } = getDbClient();

  const payload: PortalColaboradorPendencias = await loadPortalColaboradorPendencias(
    db,
    companyId,
    titularType,
    titularId,
  );

  return NextResponse.json(payload, { status: 200 });
}
