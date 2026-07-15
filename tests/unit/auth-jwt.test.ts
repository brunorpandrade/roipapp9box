// ROIP APP 9BOX — teste unitario `auth/jwt` (ME-020).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido —
// RV-08). Segredo deterministico provisionado no proprio arquivo via
// `process.env.JWT_SECRET`. TTLs exercitados com `vi.useFakeTimers()` +
// `vi.setSystemTime(...)` — nunca sleep. Datas simuladas abaixo de 2037
// (L36, por consistencia com o restante da suite).
//
// Cobre os dois regimes de sessao do escopo da ME-020:
// - plataforma (§5.2): exp sliding 8h — valido antes, expirado depois;
// - Super Admin (§5.1): sem exp — valido mesmo anos a frente; token de
//   super admin COM exp e rejeitado como malformado.
// Cobre ainda: assinatura adulterada, segredo errado, role fora do enum
// canonico, claims obrigatorios ausentes e derivacao de versao de
// credencial (`pwv`, S011).

import { SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  deriveCredentialVersion,
  PLATFORM_ROLES,
  PLATFORM_SESSION_TTL_SECONDS,
  type PlatformRole,
  type PlatformTokenClaims,
  type PlatformTokenInput,
  signPlatformToken,
  signSuperAdminToken,
  type SuperAdminTokenClaims,
  type SuperAdminTokenInput,
  type VerifiedToken,
  verifyToken,
  type VerifyResult,
} from '../../src/server/auth/jwt';

const TEST_SECRET = 'roip-me020-segredo-deterministico-de-teste';
const OTHER_SECRET = 'outro-segredo-que-nao-assina-nada-valido';

// Instante base simulado: 2026-07-01T12:00:00Z (abaixo de 2037 — L36).
const BASE_TIME_MS = Date.UTC(2026, 6, 1, 12, 0, 0);

const PLATFORM_INPUT: PlatformTokenInput = {
  userId: 42,
  role: 'rh',
  companyId: 7,
  credentialVersion: deriveCredentialVersion('$2b$12$hash-exemplo'),
};

function secretBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

describe('auth/jwt (ME-020)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('enum canonico role da plataforma tem exatamente 4 valores (§2.2)', () => {
    // O 5o valor do enum canonico ('super_admin') e emitido por rota
    // propria e nao passa pelo login unificado.
    const roles: readonly PlatformRole[] = PLATFORM_ROLES;
    expect(roles).toEqual(['rh', 'rh_lider', 'clevel', 'lider']);
  });

  it('deriveCredentialVersion e deterministica com 16 hex chars (S011)', () => {
    const a = deriveCredentialVersion('material-a');
    const b = deriveCredentialVersion('material-a');
    const c = deriveCredentialVersion('material-b');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(c);
  });

  it('roundtrip do token de plataforma com exp = now + 8h (§4.1-i, §5.2)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME_MS);
    const token = await signPlatformToken(PLATFORM_INPUT);
    const result: VerifyResult = await verifyToken(token);
    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    const verificado: VerifiedToken = result.token;
    expect(verificado.kind).toBe('platform');
    if (verificado.kind !== 'platform') {
      return;
    }
    const claims: PlatformTokenClaims = verificado.claims;
    expect(claims.role).toBe('rh');
    expect(claims.userId).toBe(42);
    expect(claims.companyId).toBe(7);
    expect(claims.credentialVersion).toBe(PLATFORM_INPUT.credentialVersion);
    expect(claims.expiresAtEpochSeconds).toBe(
      Math.floor(BASE_TIME_MS / 1000) + PLATFORM_SESSION_TTL_SECONDS,
    );
  });

  it('token de plataforma expira apos 8h de inatividade (§5.2)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME_MS);
    const token = await signPlatformToken(PLATFORM_INPUT);
    vi.setSystemTime(BASE_TIME_MS + (PLATFORM_SESSION_TTL_SECONDS + 60) * 1000);
    const result = await verifyToken(token);
    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('token do Super Admin nao expira — valido anos a frente (§5.1)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME_MS);
    const pwv = deriveCredentialVersion('$2b$12$hash-bruno' + 'bruno@roip.app');
    const input: SuperAdminTokenInput = { superAdminId: 1, credentialVersion: pwv };
    const token = await signSuperAdminToken(input);
    vi.setSystemTime(Date.UTC(2036, 6, 1, 12, 0, 0));
    const result = await verifyToken(token);
    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    expect(result.token.kind).toBe('super_admin');
    if (result.token.kind !== 'super_admin') {
      return;
    }
    const claims: SuperAdminTokenClaims = result.token.claims;
    expect(claims.superAdminId).toBe(1);
    expect(claims.credentialVersion).toBe(pwv);
  });

  it('token com role super_admin E exp presente e malformado (§5.1)', async () => {
    const forjado = await new SignJWT({ role: 'super_admin', pwv: 'abcd0123abcd0123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(secretBytes(TEST_SECRET));
    const result = await verifyToken(forjado);
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('token adulterado no payload e malformado', async () => {
    const token = await signPlatformToken(PLATFORM_INPUT);
    const partes = token.split('.');
    expect(partes).toHaveLength(3);
    const payload = partes[1] ?? '';
    const adulterado = [partes[0], payload.slice(0, -2) + 'xx', partes[2]].join('.');
    const result = await verifyToken(adulterado);
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('token assinado com outro segredo e malformado', async () => {
    const alheio = await new SignJWT({ role: 'rh', companyId: 7, pwv: 'abcd0123abcd0123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('42')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(secretBytes(OTHER_SECRET));
    const result = await verifyToken(alheio);
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('role fora do enum canonico de 5 valores e malformado (§2.2)', async () => {
    const forjado = await new SignJWT({
      role: 'colaborador',
      companyId: 7,
      pwv: 'ab12ab12ab12ab12',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('42')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(secretBytes(TEST_SECRET));
    const result = await verifyToken(forjado);
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('token de plataforma sem companyId e malformado', async () => {
    const forjado = await new SignJWT({ role: 'lider', pwv: 'ab12ab12ab12ab12' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('42')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(secretBytes(TEST_SECRET));
    const result = await verifyToken(forjado);
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('string arbitraria e malformada', async () => {
    const result = await verifyToken('isto-nao-e-um-jwt');
    expect(result).toEqual({ valid: false, reason: 'malformed' });
  });

  it('assinatura falha com erro claro quando JWT_SECRET esta ausente', async () => {
    delete process.env.JWT_SECRET;
    await expect(signPlatformToken(PLATFORM_INPUT)).rejects.toThrow(/JWT_SECRET ausente/);
  });
});
