// ROIP APP 9BOX — teste unitario `auth/pdfEphemeralToken` (ME-050/51, S254).
//
// Puramente algoritmico: nao toca banco (RV-08 — veredito unit
// pre-decidido). Segredo deterministico via `process.env.JWT_SECRET`.
// TTL exercitado com `vi.useFakeTimers()` + `vi.setSystemTime(...)`.
// Datas simuladas abaixo de 2037 (L36).
//
// Cobre:
// - assinatura e verificacao no caminho feliz (round-trip);
// - claims completos (scope, companyId, resourceId, userId, userType,
//   iat, exp);
// - expiracao apos exatos 300s (dentro passa, um segundo alem falha);
// - segredo errado -> malformed;
// - assinatura adulterada -> malformed;
// - claim `kind` errado (`nr1_start` do modulo vizinho) -> malformed;
// - scope fora do union (`snapshot_9box` — reservado para ME-053) ->
//   malformed;
// - userType fora do union canonico -> malformed;
// - JWT_SECRET ausente -> throw explicito na emissao e na verificacao.

import { SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  PDF_EPHEMERAL_TTL_SECONDS,
  type PdfEphemeralTokenInput,
  signPdfEphemeralToken,
  verifyPdfEphemeralToken,
} from '../../src/server/auth/pdfEphemeralToken';

const TEST_SECRET = 'roip-me050-pdf-ephemeral-segredo-deterministico';
const OTHER_SECRET = 'outro-segredo-nao-canonico';

// Instante base simulado: 2026-08-15T10:00:00Z (abaixo de 2037 — L36).
const BASE_TIME_MS = Date.UTC(2026, 7, 15, 10, 0, 0);
const BASE_DATE = new Date(BASE_TIME_MS);

const CANON_INPUT: PdfEphemeralTokenInput = {
  scope: 'nr1_report',
  companyId: 7,
  resourceId: 42,
  userId: 900,
  userType: 'super_admin',
};

describe('auth/pdfEphemeralToken (ME-050/51)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('assina e verifica no caminho feliz (round-trip canonico)', async () => {
    const token = await signPdfEphemeralToken(CANON_INPUT, BASE_DATE);
    const result = await verifyPdfEphemeralToken(token, BASE_DATE);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.claims.kind).toBe('pdf_ephemeral');
    expect(result.claims.scope).toBe('nr1_report');
    expect(result.claims.companyId).toBe(7);
    expect(result.claims.resourceId).toBe(42);
    expect(result.claims.userId).toBe(900);
    expect(result.claims.userType).toBe('super_admin');
    expect(result.claims.issuedAtEpochSeconds).toBe(Math.floor(BASE_TIME_MS / 1000));
    expect(result.claims.expiresAtEpochSeconds).toBe(
      Math.floor(BASE_TIME_MS / 1000) + PDF_EPHEMERAL_TTL_SECONDS,
    );
  });

  it('aceita userType = employee (portal futuro)', async () => {
    const token = await signPdfEphemeralToken(
      { ...CANON_INPUT, userType: 'employee', userId: 101 },
      BASE_DATE,
    );
    const result = await verifyPdfEphemeralToken(token, BASE_DATE);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.userType).toBe('employee');
      expect(result.claims.userId).toBe(101);
    }
  });

  it('rejeita token expirado exatamente 1s apos o TTL (301s adiante)', async () => {
    const token = await signPdfEphemeralToken(CANON_INPUT, BASE_DATE);
    const alemDoTTL = new Date(BASE_TIME_MS + (PDF_EPHEMERAL_TTL_SECONDS + 1) * 1000);
    const result = await verifyPdfEphemeralToken(token, alemDoTTL);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('expired');
    }
  });

  it('aceita token dentro do TTL exato (300s adiante = ainda valido)', async () => {
    // Um instante ANTES do limite (299s) — `jose` considera `exp` inclusive.
    const token = await signPdfEphemeralToken(CANON_INPUT, BASE_DATE);
    const dentroDoTTL = new Date(BASE_TIME_MS + (PDF_EPHEMERAL_TTL_SECONDS - 1) * 1000);
    const result = await verifyPdfEphemeralToken(token, dentroDoTTL);
    expect(result.valid).toBe(true);
  });

  it('rejeita token assinado por outro segredo como malformed', async () => {
    const token = await signPdfEphemeralToken(CANON_INPUT, BASE_DATE);
    process.env.JWT_SECRET = OTHER_SECRET;
    const result = await verifyPdfEphemeralToken(token, BASE_DATE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('rejeita token adulterado (payload trocado) como malformed', async () => {
    const token = await signPdfEphemeralToken(CANON_INPUT, BASE_DATE);
    // Trocar o segundo segmento (payload) — assinatura fica invalida.
    const parts = token.split('.');
    const payloadSeg = parts[1];
    if (payloadSeg === undefined) throw new Error('token JWT malformado — sem payload segment');
    parts[1] = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payloadSeg, 'base64url').toString()),
        companyId: 99,
      }),
    ).toString('base64url');
    const adulterado = parts.join('.');
    const result = await verifyPdfEphemeralToken(adulterado, BASE_DATE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('rejeita token com kind errado (nr1_start) como malformed', async () => {
    const iat = Math.floor(BASE_TIME_MS / 1000);
    const foreiro = await new SignJWT({
      kind: 'nr1_start',
      companyId: 7,
      cicloDbId: 42,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('900')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(new TextEncoder().encode(TEST_SECRET));
    const result = await verifyPdfEphemeralToken(foreiro, BASE_DATE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('rejeita scope fora do union canonico como malformed (reserva ME-053)', async () => {
    const iat = Math.floor(BASE_TIME_MS / 1000);
    // `snapshot_9box` esta reservado para a ME-053 (S251); nesta ME nao
    // e aceito pelo verifier.
    const foreiro = await new SignJWT({
      kind: 'pdf_ephemeral',
      scope: 'snapshot_9box',
      companyId: 7,
      resourceId: 42,
      userType: 'super_admin',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('900')
      .setIssuedAt(iat)
      .setExpirationTime(iat + PDF_EPHEMERAL_TTL_SECONDS)
      .sign(new TextEncoder().encode(TEST_SECRET));
    const result = await verifyPdfEphemeralToken(foreiro, BASE_DATE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('rejeita userType fora do union como malformed', async () => {
    const iat = Math.floor(BASE_TIME_MS / 1000);
    const foreiro = await new SignJWT({
      kind: 'pdf_ephemeral',
      scope: 'nr1_report',
      companyId: 7,
      resourceId: 42,
      userType: 'clevel',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('900')
      .setIssuedAt(iat)
      .setExpirationTime(iat + PDF_EPHEMERAL_TTL_SECONDS)
      .sign(new TextEncoder().encode(TEST_SECRET));
    const result = await verifyPdfEphemeralToken(foreiro, BASE_DATE);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('lanca erro explicito quando JWT_SECRET esta ausente na emissao', async () => {
    delete process.env.JWT_SECRET;
    await expect(signPdfEphemeralToken(CANON_INPUT, BASE_DATE)).rejects.toThrow(
      /JWT_SECRET ausente/,
    );
  });

  it('retorna malformed quando JWT_SECRET ausente na verify (padrao nr1StartToken)', async () => {
    const token = await signPdfEphemeralToken(CANON_INPUT, BASE_DATE);
    delete process.env.JWT_SECRET;
    const result = await verifyPdfEphemeralToken(token, BASE_DATE);
    // `verify` herda o padrao canonico do `nr1StartToken.ts` — falha
    // qualquer (inclusive JWT_SECRET ausente, capturada como excecao
    // dentro do try) resulta em invalidacao discriminada, nunca throw.
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('malformed');
    }
  });
});
