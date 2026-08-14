// ROIP APP 9BOX — Route Handler `POST /api/portal/login` (ME-023, §4.3;
// ME-070 refactor S366; ME-080b Dispatch 1 refactor 2 fatores).
//
// Endpoint canonico do portal do colaborador. REST literal (S036).
// Procedure canonica implementada: `collaboratorPortal.identify` (§4.3).
//
// ME-080b Dispatch 1: introducao de segundo fator canonico (matricula).
// Fluxo canonico revisado (§4.3 passo 4 revisado):
//   a) Valida payload: `cpf` (11 digitos) + `matricula` (formato canonico
//      AA00, case-insensitive na entrada — normalizada uppercase antes
//      da busca).
//   b) Rate limit `{ip}:portal-login:{cpf}` = 10/15min (§5.8, chave
//      permanece por CPF para nao facilitar enumeracao de matricula).
//   c) Busca em `employees` + `cLevelMembers` pelo par (cpf,
//      matriculaUpper) via `findPlatformUserByCpfAndMatricula`.
//   d) Nenhum candidato, multiplos candidatos, usuario inativo:
//      MSG_INVALID_CREDENTIALS (mesma mensagem — anti-enumeracao S515).
//   e) `companies.status = 'inativa'`: 403 MSG_COMPANY_INACTIVE.
//   f) Emite `portalToken` (S042); verifica gate LGPD (§7.2 f/g).
//      - gate pendente: `gateStep: 'lgpd_consent'`
//      - gate vigente: `gateStep: 'pendencias'`
//
// Case-insensitivity canonica (ME-080b): matricula sempre armazenada em
// uppercase; usuario pode digitar em qualquer caixa; normalizacao para
// uppercase acontece aqui antes de qualquer busca.
//
// Ambiguidade cross-empresa (S019 analogo): tratamos como
// MSG_INVALID_CREDENTIALS para preservar anti-enumeracao. Registrado
// como D003 (mesma divida do login unificado — consolidacao futura via
// UNIQUE global).
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
import { findPlatformUserByCpfAndMatricula } from '../../../../server/services/authLookup';
import { getCompanyById } from '../../../../server/services/companies';
import { hasValidLGPDConsent } from '../../../../server/services/lgpdConsents';
import { LGPD_TERM_VERSION } from '../../../../lib/env';
import { MATRICULA_REGEX } from '../../../../lib/auth/matriculaGenerator';

import {
  MSG_COMPANY_INACTIVE,
  MSG_INVALID_CPF,
  MSG_INVALID_CREDENTIALS,
  MSG_INVALID_MATRICULA,
  MSG_RATE_LIMIT,
  getDbClient,
  getRateLimiter,
} from './internals';

const RATE_LIMIT_IP_UNKNOWN = 'unknown';

interface RequestBody {
  cpf: unknown;
  matricula: unknown;
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

function normalizeMatricula(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length !== 4) return null;
  const upper = trimmed.toUpperCase();
  return MATRICULA_REGEX.test(upper) ? upper : null;
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

  const matriculaUpper = normalizeMatricula(body.matricula);
  if (matriculaUpper === null) {
    return NextResponse.json({ msg: MSG_INVALID_MATRICULA }, { status: 400 });
  }

  const ip = extractClientIp(req.headers);
  const rule = RATE_LIMITS.portalLogin;
  const key = buildRateLimitKey(ip, rule.op, cpf);
  const rateLimiter = getRateLimiter();

  // b) Rate limit
  const status = rateLimiter.check(key, rule);
  if (status.blocked) {
    return NextResponse.json(
      { msg: MSG_RATE_LIMIT, retryAfterSeconds: status.retryAfterSeconds },
      { status: 429 },
    );
  }

  const { db } = getDbClient();

  // c) Busca par (cpf, matricula)
  const candidates = await findPlatformUserByCpfAndMatricula(db, cpf, matriculaUpper);

  // Ambiguidade cross-empresa OU nenhum candidato: mesma mensagem
  // anti-enumeracao (D003 analogo — S515 preserva anti-enumeracao).
  if (candidates.length !== 1) {
    rateLimiter.registerFailure(key, rule);
    return NextResponse.json({ msg: MSG_INVALID_CREDENTIALS }, { status: 404 });
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
    return NextResponse.json({ msg: MSG_INVALID_CREDENTIALS }, { status: 404 });
  }

  // d) usuario inativo → mesma mensagem anti-enumeracao
  if (userStatus === 'inativo') {
    rateLimiter.registerFailure(key, rule);
    return NextResponse.json({ msg: MSG_INVALID_CREDENTIALS }, { status: 404 });
  }

  // e) empresa inativa
  const company = await getCompanyById(db, candidate.companyId);
  if (company === undefined || company.status === 'inativa') {
    return NextResponse.json({ msg: MSG_COMPANY_INACTIVE }, { status: 403 });
  }

  // f) emite portalToken + gate LGPD
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
