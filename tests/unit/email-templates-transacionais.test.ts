// ROIP APP 9BOX — teste unitario templates transacionais 1/3/4 (ME-060).
// Cobre §12.2 (Template 1 — Reset senha) + §12.4 (Template 3 —
// Confirmacao alteracao) + §12.5 (Template 4 — Aviso seguranca) +
// `formatDataHoraCanonica`.

import { beforeEach, describe, expect, it } from 'vitest';

import { _resetHandlebarsCache } from '../../src/lib/email/handlebarsCompiler';
import {
  formatDataHoraCanonica,
  renderTemplate4,
  TEMPLATE_4_ASSUNTO,
} from '../../src/lib/email/templates/template4_emailChangeSecurity';
import {
  renderTemplate1,
  TEMPLATE_1_ASSUNTO,
} from '../../src/lib/email/templates/template1_resetPassword';
import {
  renderTemplate3,
  TEMPLATE_3_ASSUNTO,
} from '../../src/lib/email/templates/template3_emailChangeConfirm';

describe('Template 1 — Reset de senha (§12.2)', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('assunto canonico literal', () => {
    const r = renderTemplate1({
      nomeDoUsuario: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'xxx.yyy.zzz',
    });
    expect(r.assunto).toBe('[ROIP APP] Redefinicao de senha');
    expect(TEMPLATE_1_ASSUNTO).toBe('[ROIP APP] Redefinicao de senha');
  });

  it('corpo texto contem nome + link canonico', () => {
    const r = renderTemplate1({
      nomeDoUsuario: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'xxx.yyy.zzz',
    });
    expect(r.corpoTexto).toContain('Ola, Bruno!');
    expect(r.corpoTexto).toContain(
      '[Redefinir senha]  → link: https://app.roip.com.br/reset-password?token=xxx.yyy.zzz',
    );
    expect(r.corpoTexto).toContain('link e valido por 24 horas');
    expect(r.corpoTexto).toContain('Equipe ROIP APP');
  });

  it('corpo HTML contem botao com href canonico', () => {
    const r = renderTemplate1({
      nomeDoUsuario: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'xxx.yyy.zzz',
    });
    expect(r.corpoHtml).toContain(
      'href="https://app.roip.com.br/reset-password?token=xxx.yyy.zzz"',
    );
    expect(r.corpoHtml).toContain('>Redefinir senha</a>');
    expect(r.corpoHtml).not.toContain('target="_blank"');
  });
});

describe('Template 3 — Confirmacao alteracao (§12.4)', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('assunto canonico literal', () => {
    const r = renderTemplate3({
      nomeDoBruno: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'abc.def',
    });
    expect(r.assunto).toBe('[ROIP APP] Confirme a alteracao do seu e-mail de acesso');
    expect(TEMPLATE_3_ASSUNTO).toBe('[ROIP APP] Confirme a alteracao do seu e-mail de acesso');
  });

  it('corpo texto contem link canonico /confirmar-alteracao-email', () => {
    const r = renderTemplate3({
      nomeDoBruno: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'abc.def',
    });
    expect(r.corpoTexto).toContain(
      '[Confirmar alteracao]  → link: https://app.roip.com.br/confirmar-alteracao-email?token=abc.def',
    );
  });

  it('corpo HTML sem target=_blank (B3)', () => {
    const r = renderTemplate3({
      nomeDoBruno: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'abc.def',
    });
    expect(r.corpoHtml).not.toContain('target="_blank"');
    expect(r.corpoHtml).toContain('Confirmar alteracao</a>');
  });
});

describe('Template 4 — Aviso seguranca (§12.5)', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('assunto canonico literal', () => {
    const r = renderTemplate4({
      nomeDoBruno: 'Bruno',
      dataHora: '31/07/2026 as 14:30',
      novoEmail: 'novo@example.com',
    });
    expect(r.assunto).toBe('[ROIP APP] Seu e-mail de acesso foi alterado');
    expect(TEMPLATE_4_ASSUNTO).toBe('[ROIP APP] Seu e-mail de acesso foi alterado');
  });

  it('corpo texto contem dataHora + novoEmail', () => {
    const r = renderTemplate4({
      nomeDoBruno: 'Bruno',
      dataHora: '31/07/2026 as 14:30',
      novoEmail: 'novo@example.com',
    });
    expect(r.corpoTexto).toContain('foi alterado em 31/07/2026 as 14:30');
    expect(r.corpoTexto).toContain('Novo e-mail: novo@example.com');
    expect(r.corpoTexto).toContain('aviso de seguranca');
  });
});

describe('formatDataHoraCanonica — §12.5', () => {
  it('formata Date UTC no fuso SP como DD/MM/YYYY as HH:mm', () => {
    // 2026-07-31 17:30:00 UTC = 2026-07-31 14:30 BRT (UTC-3)
    const d = new Date('2026-07-31T17:30:00Z');
    expect(formatDataHoraCanonica(d, 'America/Sao_Paulo')).toBe('31/07/2026 as 14:30');
  });

  it('zero-padding em dia/mes/hora/minuto', () => {
    // 2026-01-05 12:05:00 UTC = 2026-01-05 09:05 BRT
    const d = new Date('2026-01-05T12:05:00Z');
    expect(formatDataHoraCanonica(d, 'America/Sao_Paulo')).toBe('05/01/2026 as 09:05');
  });
});
