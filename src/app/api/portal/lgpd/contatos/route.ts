// ROIP APP 9BOX — Route Handler `GET /api/portal/lgpd/contatos`
// (ME-B11.1c, LGPD2).
//
// Endpoint canonico do portal do colaborador para expor os contatos
// do Encarregado de dados (DPO) canonicos da empresa do titular
// autenticado. Consumido pelo `PortalLayout.tsx` / `PrivacyModal.tsx`
// na aba "Contatos" do modal "Privacidade e proteção de dados" (DOC
// 05 §6.4).
//
// Motivacao canonica (LGPD Lei 13.709/2018 art. 41):
// o Encarregado precisa estar identificado e contatavel para toda
// controladora de dados pessoais. O PrivacyModal exibia placeholder
// "a ser configurado pela empresa" bit-exact mesmo quando a empresa
// ja tinha DPO configurado em `/parametros` — ME-B11.1c elimina a
// dissonancia expondo os dados reais via este endpoint.
//
// S207 preservado bit-a-bit: portal autenticado por `portalToken`
// NUNCA usa tRPC. Este handler consome Drizzle diretamente — sem
// sub-router tRPC intermediario. Padrao bit-a-bit do handler
// `GET /api/portal/pendencias` (ME-B10-01).
//
// S343 preservado bit-a-bit: a autorizacao canonica e derivada
// literalmente do `portalToken` — o handler NAO aceita `companyId`
// via input do cliente. Identity vem exclusivamente dos claims
// verificados.
//
// Metodo: GET (idempotente, read-only).
// Autenticacao: header `Authorization: Bearer <portalToken>`. Padrao
// REST canonico defensivo bit-exact ao `/api/portal/pendencias`.
//
// Retornos canonicos:
// - 200 + application/json com body `LgpdContatosPayload`.
// - 401 — token ausente, invalido, expirado ou scope errado.
// - 404 — empresa nao encontrada (corrida rara com delete
//   administrativo posterior a emissao do token).
//
// Nenhum log em `dataAccessLog`: a consulta e para os proprios
// dados de contato publico da empresa controladora, nao para dados
// pessoais do titular. Alinhamento canonico com DOC 06 §19.6
// (autoacesso de dados nao e auditado).

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { companies } from '../../../../../db/schema';
import { verifyPortalToken } from '../../../../../server/auth/portalToken';

import {
  MSG_COMPANY_NOT_FOUND_LGPD_CONTATOS,
  MSG_EXPIRED_TOKEN_LGPD_CONTATOS,
  MSG_INVALID_TOKEN_LGPD_CONTATOS,
  MSG_MISSING_TOKEN_LGPD_CONTATOS,
  getDbClient,
} from './internals';

/**
 * Payload canonico de contatos LGPD retornado por este endpoint.
 * Nome / email / telefone / politica podem ser `null` quando a
 * empresa ainda nao configurou — a UI (PrivacyModal) renderiza
 * canonicamente "(não configurado)" nesses casos. Empresas ativas
 * sempre tem nome + email preenchidos (DOC 06 §19.8 — validacao de
 * `company.setStatus` bloqueia ativacao sem DPO), mas o endpoint
 * nao assume isso — expoe exatamente o que esta no banco.
 */
export interface LgpdContatosPayload {
  readonly encarregadoNome: string | null;
  readonly encarregadoEmail: string | null;
  readonly encarregadoTelefone: string | null;
  readonly encarregadoPoliticaUrl: string | null;
}

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
 * `GET /api/portal/lgpd/contatos`.
 *
 * Header obrigatorio: `Authorization: Bearer <portalToken>`.
 *
 * Response canonico 200: JSON serializado de `LgpdContatosPayload`
 * com os 4 campos `encarregadoLgpd*` da empresa do titular.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const raw = extractBearerToken(req);
  if (raw === null) {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN_LGPD_CONTATOS }, { status: 401 });
  }

  const verified = await verifyPortalToken(raw);
  if (!verified.valid) {
    const msg =
      verified.reason === 'expired'
        ? MSG_EXPIRED_TOKEN_LGPD_CONTATOS
        : MSG_INVALID_TOKEN_LGPD_CONTATOS;
    return NextResponse.json({ msg }, { status: 401 });
  }

  const { companyId } = verified.claims;
  const client = getDbClient();
  const db = client.db;

  const rows = await db
    .select({
      encarregadoNome: companies.encarregadoLgpdNome,
      encarregadoEmail: companies.encarregadoLgpdEmail,
      encarregadoTelefone: companies.encarregadoLgpdTelefone,
      encarregadoPoliticaUrl: companies.encarregadoLgpdPoliticaUrl,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    return NextResponse.json({ msg: MSG_COMPANY_NOT_FOUND_LGPD_CONTATOS }, { status: 404 });
  }

  const payload: LgpdContatosPayload = {
    encarregadoNome: row.encarregadoNome,
    encarregadoEmail: row.encarregadoEmail,
    encarregadoTelefone: row.encarregadoTelefone,
    encarregadoPoliticaUrl: row.encarregadoPoliticaUrl,
  };

  return NextResponse.json(payload, { status: 200 });
}
