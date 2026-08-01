// ROIP APP 9BOX — teste unitario Template 2 canonico (§12.3) — ME-063a.
// Cobre §12.3 (Template 2 — Primeiro acesso, bit-exact).

import { beforeEach, describe, expect, it } from 'vitest';

import { _resetHandlebarsCache } from '../../src/lib/email/handlebarsCompiler';
import {
  renderTemplate2,
  TEMPLATE_2_ASSUNTO,
  TEMPLATE_2_CORPO_HTML,
  TEMPLATE_2_CORPO_TEXTO,
  TEMPLATE_2_ID,
} from '../../src/lib/email/templates/template2_firstAccess';

describe('Template 2 — Primeiro acesso (§12.3)', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('exporta ID canonico', () => {
    expect(TEMPLATE_2_ID).toBe('roip.template.2.firstAccess');
  });

  it('assunto canonico literal com acento (§12.3 + S353)', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH da empresa (rh@empresa.com)',
      identificador: '123.456.789-00',
    });
    expect(r.assunto).toBe('[ROIP APP] Bem-vindo(a) — defina sua senha');
    expect(TEMPLATE_2_ASSUNTO).toBe('[ROIP APP] Bem-vindo(a) — defina sua senha');
  });

  it('corpo texto contem saudacao + link canonico /first-access?token=', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH da empresa (rh@empresa.com)',
      identificador: '123.456.789-00',
    });
    expect(r.corpoTexto).toContain('Olá, Ana!');
    expect(r.corpoTexto).toContain(
      '[Definir senha]  → link: https://app.roip.com.br/first-access?token=aaa.bbb.ccc',
    );
    expect(r.corpoTexto).toContain('O link é válido por 24 horas');
    expect(r.corpoTexto).toContain('Equipe ROIP APP');
  });

  it('corpo texto contem contatoAdmin e identificador canonicos', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH da empresa (rh@empresa.com)',
      identificador: '123.456.789-00',
    });
    expect(r.corpoTexto).toContain(
      'Após esse prazo, contate RH da empresa (rh@empresa.com) para receber um novo.',
    );
    expect(r.corpoTexto).toContain('Seu identificador de acesso será:');
    expect(r.corpoTexto).toContain('123.456.789-00');
  });

  it('corpo HTML contem botao com href canonico e sem target=_blank (B3)', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH da empresa',
      identificador: '123.456.789-00',
    });
    expect(r.corpoHtml).toContain('href="https://app.roip.com.br/first-access?token=aaa.bbb.ccc"');
    expect(r.corpoHtml).toContain('>Definir senha</a>');
    expect(r.corpoHtml).not.toContain('target="_blank"');
  });

  it('corpo HTML contem identificador em bloco destacado canonico', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH',
      identificador: '123.456.789-00',
    });
    // Handlebars escapa `.` como caractere literal e nao ha meta-chars a
    // proteger; identificador aparece no HTML dentro do span canonico.
    expect(r.corpoHtml).toContain('123.456.789-00');
    expect(r.corpoHtml).toContain("font-family: 'Courier New', Courier, monospace");
  });

  it('corpo HTML preserva encoding UTF-8 canonico (§11.11 + S353)', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH',
      identificador: '123.456.789-00',
    });
    expect(r.corpoHtml).toContain('<meta charset="UTF-8">');
    expect(r.corpoHtml).toContain('Olá, Ana!');
    expect(r.corpoHtml).toContain('primeiro acesso');
    expect(r.corpoHtml).toContain('válido');
  });

  it('constantes canonicas exportadas com contents literais §12.3', () => {
    expect(TEMPLATE_2_CORPO_TEXTO).toContain('{{nomeDoUsuario}}');
    expect(TEMPLATE_2_CORPO_TEXTO).toContain('{{baseUrl}}/first-access?token={{jwtToken}}');
    expect(TEMPLATE_2_CORPO_TEXTO).toContain('{{contatoAdmin}}');
    expect(TEMPLATE_2_CORPO_TEXTO).toContain('{{identificador}}');
    expect(TEMPLATE_2_CORPO_HTML).toContain('{{baseUrl}}/first-access?token={{jwtToken}}');
  });

  it('cadastro para Super Admin: identificador pode ser e-mail (bit-exact §12.3)', () => {
    const r = renderTemplate2({
      nomeDoUsuario: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'xyz.abc',
      contatoAdmin: 'suporte@roip.com.br',
      identificador: 'bruno@roip.com.br',
    });
    expect(r.corpoTexto).toContain('bruno@roip.com.br');
    expect(r.corpoHtml).toContain('bruno@roip.com.br');
  });
});
