// ROIP APP 9BOX — teste unitario `auth/rateLimit` (ME-020).
//
// Puramente algoritmico: nao toca banco (veredito unit pre-decidido —
// RV-08). Janela exercitada com `vi.useFakeTimers()` — nunca sleep.
//
// Cobre: os 7 limites canonicos literais do DOC 02 §5.8, a chave canonica
// `{ip}:{operacao}:{identificador}`, burst ate o bloqueio, contagem
// regressiva de `retryAfterSeconds`, expiracao da janela de 15 minutos,
// reset no sucesso e independencia entre chaves e entre instancias.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildRateLimitKey,
  createRateLimiter,
  RATE_LIMITS,
  type RateLimiter,
  type RateLimitRule,
  type RateLimitStatus,
} from '../../src/server/auth/rateLimit';

// Instante base simulado (abaixo de 2037 — L36).
const BASE_TIME_MS = Date.UTC(2026, 6, 1, 12, 0, 0);

const RULE: RateLimitRule = RATE_LIMITS.loginUnified;
const KEY = buildRateLimitKey('203.0.113.9', RULE.op, '12345678901');

describe('auth/rateLimit (ME-020)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('limites canonicos literais do §5.8 preservados', () => {
    const quinzeMin = 15 * 60 * 1000;
    expect(RATE_LIMITS.loginUnified).toEqual({
      op: 'login-unified',
      max: 5,
      windowMs: quinzeMin,
    });
    expect(RATE_LIMITS.loginSuperAdmin).toEqual({
      op: 'login-super-admin',
      max: 5,
      windowMs: quinzeMin,
    });
    expect(RATE_LIMITS.portalLogin).toEqual({
      op: 'portal-login',
      max: 10,
      windowMs: quinzeMin,
    });
    expect(RATE_LIMITS.forgotPassword).toEqual({
      op: 'forgot-password',
      max: 3,
      windowMs: quinzeMin,
    });
    expect(RATE_LIMITS.forgotPasswordSuperAdmin).toEqual({
      op: 'forgot-password-super-admin',
      max: 3,
      windowMs: quinzeMin,
    });
    expect(RATE_LIMITS.changePassword).toEqual({
      op: 'change-password',
      max: 5,
      windowMs: quinzeMin,
    });
    expect(RATE_LIMITS.requestEmailChange).toEqual({
      op: 'request-email-change',
      max: 5,
      windowMs: quinzeMin,
    });
  });

  it('buildRateLimitKey monta a chave canonica {ip}:{op}:{id} (§5.8)', () => {
    expect(KEY).toBe('203.0.113.9:login-unified:12345678901');
  });

  it('chave sem historico nao bloqueia', () => {
    const limiter = createRateLimiter();
    expect(limiter.check(KEY, RULE)).toEqual({ blocked: false });
  });

  it('abaixo do maximo nao bloqueia; no maximo bloqueia (burst)', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < RULE.max - 1; i += 1) {
      limiter.registerFailure(KEY, RULE);
    }
    expect(limiter.check(KEY, RULE)).toEqual({ blocked: false });
    limiter.registerFailure(KEY, RULE);
    const status: RateLimitStatus = limiter.check(KEY, RULE);
    expect(status.blocked).toBe(true);
  });

  it('retryAfterSeconds regride com o avanco do relogio', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < RULE.max; i += 1) {
      limiter.registerFailure(KEY, RULE);
    }
    const cheio = limiter.check(KEY, RULE);
    expect(cheio).toEqual({ blocked: true, retryAfterSeconds: 900 });
    vi.setSystemTime(BASE_TIME_MS + 10 * 60 * 1000);
    const depoisDe10Min = limiter.check(KEY, RULE);
    expect(depoisDe10Min).toEqual({ blocked: true, retryAfterSeconds: 300 });
  });

  it('janela de 15 minutos expira e o contador zera (§5.8)', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < RULE.max; i += 1) {
      limiter.registerFailure(KEY, RULE);
    }
    expect(limiter.check(KEY, RULE).blocked).toBe(true);
    vi.setSystemTime(BASE_TIME_MS + RULE.windowMs);
    expect(limiter.check(KEY, RULE)).toEqual({ blocked: false });
    // Nova falha abre janela nova a partir do zero.
    limiter.registerFailure(KEY, RULE);
    expect(limiter.check(KEY, RULE)).toEqual({ blocked: false });
  });

  it('reset no sucesso limpa o contador (§4.1 passo i)', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < RULE.max; i += 1) {
      limiter.registerFailure(KEY, RULE);
    }
    expect(limiter.check(KEY, RULE).blocked).toBe(true);
    limiter.reset(KEY);
    expect(limiter.check(KEY, RULE)).toEqual({ blocked: false });
  });

  it('chaves distintas nao se contaminam', () => {
    const limiter = createRateLimiter();
    const outraChave = buildRateLimitKey('203.0.113.9', RULE.op, '98765432100');
    for (let i = 0; i < RULE.max; i += 1) {
      limiter.registerFailure(KEY, RULE);
    }
    expect(limiter.check(KEY, RULE).blocked).toBe(true);
    expect(limiter.check(outraChave, RULE)).toEqual({ blocked: false });
  });

  it('instancias distintas tem stores independentes (D003 — troca isolada)', () => {
    const a: RateLimiter = createRateLimiter();
    const b: RateLimiter = createRateLimiter();
    for (let i = 0; i < RULE.max; i += 1) {
      a.registerFailure(KEY, RULE);
    }
    expect(a.check(KEY, RULE).blocked).toBe(true);
    expect(b.check(KEY, RULE)).toEqual({ blocked: false });
  });
});
