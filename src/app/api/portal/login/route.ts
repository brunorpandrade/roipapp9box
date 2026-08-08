// ROIP APP 9BOX — Route Handler `POST /api/portal/login` (ME-023, §4.3;
// ME-070 refactor S366).
//
// Endpoint canonico do portal do colaborador. REST literal (S036).
// Procedure canonica implementada: `collaboratorPortal.identify` (§4.3).
//
// Ordem canonica (§4.3 passo 4):
//   a) Rate limit `{ip}:portal-login:{cpf}` = 10/15min (§5.8).
//   b) Busca em `employees` (todas as empresas); se nada, tambem em
//      `cLevelMembers`. Reuso do service `findPlatformUserByCpf`.
//   c) Nao encontrado ou usuario `status='inativo'`: 404 com mensagem
//      canonica anti-enumeracao "CPF nao encontrado. Verifique e tente
//      novamente." + incrementa rate limit.
//   d) `companies.status = 'inativa'`: 403 com mensagem canonica
//      "Empresa inativa no sistema. Entre em contato com o suporte."
//   e) Emite `portalToken` (S042); verifica gate LGPD (§7.2 f/g).
//      - gate pendente: `gateStep: 'lgpd_consent'`
//      - gate vigente: `gateStep: 'pendencias'`
//
// Ambiguidade cross-empresa (S019 analogo — sem canonico regulando o
// portal): tratamos como "nao encontrado" para preservar anti-enumeracao.
// Registrado como D003 (mesma divida do login unificado — consolidacao
// futura via UNIQUE global). Nao ha bloqueio de operacao por conta disto.
//
// S041: RateLimiter tem instancia propria neste handler (module-level
// const em `./internals.ts` sob S366). Chave canonica `portal-login` e
// disjunta das chaves do tRPC admin — sem sobreposicao real.
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): constantes de
// mensagem, estado privado dbClient e RateLimiter, escape hatches
// migraram para `./internals.ts` irmao. Este arquivo exporta apenas
// POST para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';

import { buildRateLimitKey, RATE_LIMITS } from '../../../../server/auth/rateLimit';
import { signPortalToken } from '../../../../server/auth/portalToken';
import { findPlatformUserByCpf } from '../../../../server/services/authLookup';
import { getCompanyById } from '../../../../server/services/companies';
import { hasValidLGPDConsent } from '../../../../server/services/lgpdConsents';
import { LGPD_TERM_VERSION } from '../../../../lib/env';

import {
  MSG_COMPANY_INACTIVE,
  MSG_CPF_NOT_FOUND,
  MSG_INVALID_CPF,
  MSG_RATE_LIMIT,
  getDbClient,
  getRateLimiter,
} from './internals';

const RATE_LIMIT_IP_UNKNOWN = 'unknown';

interface RequestBody {
  cpf: unknown;
}

interface PortalLoginSuccess {
  portalToken: string;
  user: { id: number; name: string; type: 'employee' | 'clevel' };
  gateStep: 'lgpd_consent' | 'pendencias';
}

function extractClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  const real = headers.get('x-real-ip');
  if (real !== null && real.length > 0) return real;
  return RATE_LIMIT_IP_UNKNOWN;
}

function normalizeCpf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ msg: MSG_INVALID_CPF }, { status: 400 });
  }

  const cpf = normalizeCpf(body.cpf);
  if (cpf === null) {
    return NextResponse.json({ msg: MSG_INVALID_CPF }, { status: 400 });
  }

  const ip = extractClientIp(req.headers);
  const rule = RATE_LIMITS.portalLogin;
  const key = buildRateLimitKey(ip, rule.op, cpf);
  const rateLimiter = getRateLimiter();

  // a) Rate limit
  const status = rateLimiter.check(key, rule);
  if (status.blocked) {
    return NextResponse.json(
      { msg: MSG_RATE_LIMIT, retryAfterSeconds: status.retryAfterSeconds },
      { status: 429 },
    );
  }

  const { db } = getDbClient();

  // b) Busca CPF
  const candidates = await findPlatformUserByCpf(db, cpf);

  // Ambiguidade cross-empresa: >1 candidato → trata como "nao encontrado"
  // (D003 analogo — anti-enumeracao preservada).
  if (candidates.length !== 1) {
    rateLimiter.registerFailure(key, rule);
    return NextResponse.json({ msg: MSG_CPF_NOT_FOUND }, { status: 404 });
  }

  const candidate = candidates[0]!;
  const employee = candidate.employee;
  const clevel = candidate.clevel;

  // Precedencia canonica dentro da mesma empresa (§2.3 regra 2):
  // C-level tem precedencia sobre employee quando ambos existem.
  let titularType: 'employee' | 'clevel';
  let titularId: number;
  let name: string;
  let userStatus: 'ativo' | 'inativo';

  if (clevel !== undefined) {
    titularType = 'clevel';
    titularId = clevel.id;
    name = clevel.name;
    userStatus = clevel.status ?? 'ativo';
  } else if (employee !== undefined) {
    titularType = 'employee';
    titularId = employee.id;
    name = employee.name;
    userStatus = employee.status ?? 'ativo';
  } else {
    // Nunca deve ocorrer (candidato agregado exige um dos dois preenchido),
    // mas guard defensivo para o narrowing do TS.
    rateLimiter.registerFailure(key, rule);
    return NextResponse.json({ msg: MSG_CPF_NOT_FOUND }, { status: 404 });
  }

  // c) usuario inativo → mesma mensagem anti-enumeracao
  if (userStatus === 'inativo') {
    rateLimiter.registerFailure(key, rule);
    return NextResponse.json({ msg: MSG_CPF_NOT_FOUND }, { status: 404 });
  }

  // d) empresa inativa
  const company = await getCompanyById(db, candidate.companyId);
  if (company === undefined || company.status === 'inativa') {
    return NextResponse.json({ msg: MSG_COMPANY_INACTIVE }, { status: 403 });
  }

  // e) emite portalToken + gate LGPD
  const portalToken = await signPortalToken({
    companyId: candidate.companyId,
    titularType,
    titularId,
  });

  const consented = await hasValidLGPDConsent(db, titularType, titularId, LGPD_TERM_VERSION);
  const gateStep: PortalLoginSuccess['gateStep'] = consented ? 'pendencias' : 'lgpd_consent';

  const body200: PortalLoginSuccess = {
    portalToken,
    user: { id: titularId, name, type: titularType },
    gateStep,
  };

  // Sucesso: reseta contador de tentativas para este IP+CPF
  rateLimiter.reset(key);

  return NextResponse.json(body200, { status: 200 });
}
