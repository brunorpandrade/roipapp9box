// ROIP APP 9BOX — teste unitario `nodemailerAdapter` (ME-060).
// Cobre §11.1 (config SMTP das variaveis de ambiente) + §12.11 (From
// humanizado, encoding UTF-8, smtpMessageId).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetSmtpTransportCache,
  buildFromHumanizado,
  resolveSmtpConfig,
  sendEmailViaTransport,
  SmtpConfigError,
  type SmtpEnvelope,
} from '../../src/lib/email/nodemailerAdapter';

describe('resolveSmtpConfig — §11.1', () => {
  it('resolve todas as variaveis canonicas do env', () => {
    const cfg = resolveSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'true',
      SMTP_USER: 'usuario',
      SMTP_PASSWORD: 'senha',
      SMTP_FROM: 'no-reply@example.com',
    });
    expect(cfg.host).toBe('smtp.example.com');
    expect(cfg.port).toBe(587);
    expect(cfg.secure).toBe(true);
    expect(cfg.user).toBe('usuario');
    expect(cfg.password).toBe('senha');
    expect(cfg.from).toBe('no-reply@example.com');
  });

  it('SMTP_SECURE aceita "1" como truthy canonico', () => {
    const cfg = resolveSmtpConfig({
      SMTP_HOST: 'smtp.x',
      SMTP_PORT: '25',
      SMTP_SECURE: '1',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
      SMTP_FROM: 'x@y',
    });
    expect(cfg.secure).toBe(true);
  });

  it('SMTP_SECURE=false vira false', () => {
    const cfg = resolveSmtpConfig({
      SMTP_HOST: 'smtp.x',
      SMTP_PORT: '25',
      SMTP_SECURE: 'false',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
      SMTP_FROM: 'x@y',
    });
    expect(cfg.secure).toBe(false);
  });

  it('SMTP_HOST ausente lanca SmtpConfigError', () => {
    expect(() =>
      resolveSmtpConfig({
        SMTP_PORT: '25',
        SMTP_SECURE: 'true',
        SMTP_USER: 'u',
        SMTP_PASSWORD: 'p',
        SMTP_FROM: 'x@y',
      }),
    ).toThrow(SmtpConfigError);
  });

  it('SMTP_PORT invalida (nao numerica) lanca', () => {
    expect(() =>
      resolveSmtpConfig({
        SMTP_HOST: 'smtp.x',
        SMTP_PORT: 'abc',
        SMTP_SECURE: 'true',
        SMTP_USER: 'u',
        SMTP_PASSWORD: 'p',
        SMTP_FROM: 'x@y',
      }),
    ).toThrow(SmtpConfigError);
  });

  it('SMTP_PORT fora do range 1-65535 lanca', () => {
    expect(() =>
      resolveSmtpConfig({
        SMTP_HOST: 'smtp.x',
        SMTP_PORT: '99999',
        SMTP_SECURE: 'true',
        SMTP_USER: 'u',
        SMTP_PASSWORD: 'p',
        SMTP_FROM: 'x@y',
      }),
    ).toThrow(SmtpConfigError);
  });
});

describe('buildFromHumanizado — §12.11', () => {
  it('formato canonico "ROIP APP <email>"', () => {
    expect(buildFromHumanizado('no-reply@app.roip.com.br')).toBe(
      'ROIP APP <no-reply@app.roip.com.br>',
    );
  });
});

describe('sendEmailViaTransport — §12.11', () => {
  beforeEach(() => {
    _resetSmtpTransportCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chama transport.sendMail com params canonicos e retorna smtpMessageId', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<abc123@smtp>' });
    const stubTransport = { sendMail } as unknown as import('nodemailer').Transporter;
    const envelope: SmtpEnvelope = {
      to: 'destino@example.com',
      subject: '[ROIP APP] teste',
      text: 'texto plano',
      html: '<p>html</p>',
    };
    const result = await sendEmailViaTransport(stubTransport, 'no-reply@app.roip.com.br', envelope);
    expect(result.smtpMessageId).toBe('<abc123@smtp>');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'ROIP APP <no-reply@app.roip.com.br>',
      to: 'destino@example.com',
      subject: '[ROIP APP] teste',
      text: 'texto plano',
      html: '<p>html</p>',
      encoding: 'utf-8',
    });
  });

  it('propaga excecao do transport (para retry policy §11.2)', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('SMTP timeout'));
    const stubTransport = { sendMail } as unknown as import('nodemailer').Transporter;
    await expect(
      sendEmailViaTransport(stubTransport, 'x@y', {
        to: 'a@b',
        subject: 's',
        text: 't',
        html: 'h',
      }),
    ).rejects.toThrow('SMTP timeout');
  });
});
