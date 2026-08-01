/* eslint-disable @stylistic/max-len -- describe/it com contexto S/§/canonizacoes tornam labels longas por design */
// ROIP APP 9BOX — teste unitario Template L canonico (§12.8) — ME-063a.
// Cobre §12.8 (Template L — Lembrete de portal, bit-exact) + estrutura
// canonica de `listaInstrumentos` por tipo (A/C/D/B_NR1/PerfilIndividual).

import { beforeEach, describe, expect, it } from 'vitest';

import { _resetHandlebarsCache } from '../../src/lib/email/handlebarsCompiler';
import type { TemplateLInstrumentoPendente } from '../../src/lib/email/types';
import {
  renderListaInstrumentosHtml,
  renderListaInstrumentosTexto,
  renderTemplateL,
  TEMPLATE_L_ASSUNTO,
  TEMPLATE_L_CORPO_HTML,
  TEMPLATE_L_CORPO_TEXTO,
  TEMPLATE_L_ID,
  TEMPLATE_L_INSTRUMENTO_ROTULO,
} from '../../src/lib/email/templates/templateL_portalReminder';

describe('Template L — Lembrete de portal (§12.8)', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('exporta ID canonico', () => {
    expect(TEMPLATE_L_ID).toBe('roip.template.L.portalReminder');
  });

  it('assunto canonico literal com acento (§12.8 + S353)', () => {
    const r = renderTemplateL({
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    });
    expect(r.assunto).toBe('Você tem instrumentos pendentes no portal ROIP APP');
    expect(TEMPLATE_L_ASSUNTO).toBe('Você tem instrumentos pendentes no portal ROIP APP');
  });

  it('rotulos canonicos bit-exact §12.8 por tipo de instrumento', () => {
    expect(TEMPLATE_L_INSTRUMENTO_ROTULO.A).toBe('Autoavaliação');
    expect(TEMPLATE_L_INSTRUMENTO_ROTULO.C).toBe('Avaliação da liderança direta');
    expect(TEMPLATE_L_INSTRUMENTO_ROTULO.D).toBe('Avaliação do colaborador direto / seu líder');
    expect(TEMPLATE_L_INSTRUMENTO_ROTULO.B_NR1).toBe('Radar NR-1');
    expect(TEMPLATE_L_INSTRUMENTO_ROTULO.PerfilIndividual).toBe('Meu perfil');
  });

  it('corpo texto contem saudacao + link canonico /colaborador', () => {
    const r = renderTemplateL({
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    });
    expect(r.corpoTexto).toContain('Olá, Carla,');
    expect(r.corpoTexto).toContain(
      '[Acessar portal →]  → link: https://app.roip.com.br/colaborador',
    );
    expect(r.corpoTexto).toContain('Este e-mail foi enviado automaticamente. Não responda.');
    expect(r.corpoTexto).toContain('Equipe ROIP APP');
  });

  it('corpo HTML contem botao canonico [Acessar portal →] sem target=_blank (B3)', () => {
    const r = renderTemplateL({
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    });
    expect(r.corpoHtml).toContain('href="https://app.roip.com.br/colaborador"');
    expect(r.corpoHtml).toContain('>Acessar portal →</a>');
    expect(r.corpoHtml).not.toContain('target="_blank"');
  });

  it('corpo HTML preserva encoding UTF-8 canonico (§11.11 + S353)', () => {
    const r = renderTemplateL({
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    });
    expect(r.corpoHtml).toContain('<meta charset="UTF-8">');
    expect(r.corpoHtml).toContain('Olá');
    expect(r.corpoHtml).toContain('Você tem instrumentos pendentes');
  });

  it('constantes canonicas exportadas com placeholders literais §12.8', () => {
    expect(TEMPLATE_L_CORPO_TEXTO).toContain('{{primeiroNome}}');
    expect(TEMPLATE_L_CORPO_TEXTO).toContain('{{baseUrl}}/colaborador');
    expect(TEMPLATE_L_CORPO_TEXTO).toContain('{{{listaFormatadaTexto}}}');
    expect(TEMPLATE_L_CORPO_HTML).toContain('{{{listaFormatadaHtml}}}');
    expect(TEMPLATE_L_CORPO_HTML).toContain('{{baseUrl}}/colaborador');
  });
});

describe('Template L — Lista de instrumentos canonica (§12.8) — texto', () => {
  it('Instrumento A canonico: Autoavaliação — {status} · Prazo original: {prazo}', () => {
    const linha = renderListaInstrumentosTexto([
      { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
    ]);
    expect(linha).toBe('• Autoavaliação — Pendente · Prazo original: 10/04/2026');
  });

  it('Instrumento C canonico: Avaliação da liderança direta', () => {
    const linha = renderListaInstrumentosTexto([
      { tipo: 'C', status: 'Atrasado', prazoDdMmYyyy: '10/04/2026' },
    ]);
    expect(linha).toBe('• Avaliação da liderança direta — Atrasado · Prazo original: 10/04/2026');
  });

  it('Instrumento D canonico: Avaliação do colaborador direto / seu líder', () => {
    const linha = renderListaInstrumentosTexto([
      { tipo: 'D', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
    ]);
    expect(linha).toBe(
      '• Avaliação do colaborador direto / seu líder — Pendente · Prazo original: 10/04/2026',
    );
  });

  it('Instrumento B (Radar NR-1) canonico: Radar NR-1 — {status} · Prazo original', () => {
    const linha = renderListaInstrumentosTexto([
      { tipo: 'B_NR1', status: 'Atrasado', prazoDdMmYyyy: '25/03/2026' },
    ]);
    expect(linha).toBe('• Radar NR-1 — Atrasado · Prazo original: 25/03/2026');
  });

  it('Perfil Individual canonico: Meu perfil — {status} (sem prazo, one-shot §12.8)', () => {
    const linha = renderListaInstrumentosTexto([{ tipo: 'PerfilIndividual', status: 'Pendente' }]);
    expect(linha).toBe('• Meu perfil — Pendente');
    expect(linha).not.toContain('Prazo');
  });

  it('multiplos instrumentos: uma linha por item separados por \\n (§12.8 ordem canonica)', () => {
    const lista: readonly TemplateLInstrumentoPendente[] = [
      { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
      { tipo: 'C', status: 'Atrasado', prazoDdMmYyyy: '10/04/2026' },
      { tipo: 'D', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
      { tipo: 'B_NR1', status: 'Atrasado', prazoDdMmYyyy: '25/03/2026' },
      { tipo: 'PerfilIndividual', status: 'Pendente' },
    ];
    const linhas = renderListaInstrumentosTexto(lista);
    expect(linhas.split('\n')).toHaveLength(5);
    expect(linhas).toContain('• Autoavaliação — Pendente · Prazo original: 10/04/2026');
    expect(linhas).toContain('• Radar NR-1 — Atrasado · Prazo original: 25/03/2026');
    expect(linhas).toContain('• Meu perfil — Pendente');
  });

  it('lista vazia: retorna string vazia (nenhum instrumento pendente)', () => {
    expect(renderListaInstrumentosTexto([])).toBe('');
  });
});

describe('Template L — Lista de instrumentos canonica (§12.8) — HTML', () => {
  it('Instrumento A canonico: <li>Autoavaliação — {status} · Prazo original: {prazo}</li>', () => {
    const html = renderListaInstrumentosHtml([
      { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
    ]);
    expect(html).toContain('<li>Autoavaliação — Pendente · Prazo original: 10/04/2026</li>');
  });

  it('Perfil Individual canonico: <li>Meu perfil — {status}</li> sem prazo', () => {
    const html = renderListaInstrumentosHtml([{ tipo: 'PerfilIndividual', status: 'Atrasado' }]);
    expect(html).toContain('<li>Meu perfil — Atrasado</li>');
    expect(html).not.toContain('Prazo');
  });

  it('multiplos instrumentos: um <li> por item, wrapped em <ul>', () => {
    const html = renderListaInstrumentosHtml([
      { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
      { tipo: 'B_NR1', status: 'Atrasado', prazoDdMmYyyy: '25/03/2026' },
      { tipo: 'PerfilIndividual', status: 'Pendente' },
    ]);
    expect(html.startsWith('<ul')).toBe(true);
    expect(html.endsWith('</ul>')).toBe(true);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it('lista vazia: retorna <ul> vazio canonico', () => {
    const html = renderListaInstrumentosHtml([]);
    expect(html).toContain('<ul');
    expect(html).toContain('</ul>');
    expect(html).not.toContain('<li>');
  });

  it('escape canonico: valores dinamicos com < > & sao escapados', () => {
    // Nao ha caso canonico onde `status` contenha meta-chars (enum
    // discriminado limita a "Pendente" | "Atrasado"), mas o helper
    // canonico protege por defesa em profundidade.
    const html = renderListaInstrumentosHtml([
      {
        tipo: 'A',
        status: 'Pendente',
        prazoDdMmYyyy: '10/04/2026 <script>',
      } as TemplateLInstrumentoPendente,
    ]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('Template L — Renderizacao integrada bit-exact §12.8', () => {
  beforeEach(() => _resetHandlebarsCache());

  it('renderizacao completa: cinco instrumentos + link + saudacao (§12.8 canonico literal)', () => {
    const r = renderTemplateL({
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [
        { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
        { tipo: 'C', status: 'Atrasado', prazoDdMmYyyy: '10/04/2026' },
        { tipo: 'D', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
        { tipo: 'B_NR1', status: 'Atrasado', prazoDdMmYyyy: '25/03/2026' },
        { tipo: 'PerfilIndividual', status: 'Pendente' },
      ],
    });
    // Texto
    expect(r.corpoTexto).toContain('Olá, Carla,');
    expect(r.corpoTexto).toContain('Instrumentos pendentes:');
    expect(r.corpoTexto).toContain('• Autoavaliação — Pendente · Prazo original: 10/04/2026');
    expect(r.corpoTexto).toContain('• Radar NR-1 — Atrasado · Prazo original: 25/03/2026');
    expect(r.corpoTexto).toContain('• Meu perfil — Pendente');
    expect(r.corpoTexto).toContain(
      '[Acessar portal →]  → link: https://app.roip.com.br/colaborador',
    );
    // HTML
    expect(r.corpoHtml).toContain('<li>Autoavaliação — Pendente · Prazo original: 10/04/2026</li>');
    expect(r.corpoHtml).toContain('<li>Meu perfil — Pendente</li>');
    expect(r.corpoHtml).toContain('href="https://app.roip.com.br/colaborador"');
  });

  it('determinismo canonico: mesma entrada → mesma saida byte-a-byte', () => {
    const input = {
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [
        { tipo: 'A' as const, status: 'Pendente' as const, prazoDdMmYyyy: '10/04/2026' },
        { tipo: 'PerfilIndividual' as const, status: 'Atrasado' as const },
      ],
    };
    const r1 = renderTemplateL(input);
    const r2 = renderTemplateL(input);
    expect(r1.assunto).toBe(r2.assunto);
    expect(r1.corpoTexto).toBe(r2.corpoTexto);
    expect(r1.corpoHtml).toBe(r2.corpoHtml);
  });

  it('sem instrumentos: renderiza sem lista canonicamente vazia (caller decide se enfileira)', () => {
    const r = renderTemplateL({
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    });
    expect(r.corpoTexto).toContain('Instrumentos pendentes:');
    // Duas linhas em branco entre "pendentes:" e "[Acessar portal →]"
    // quando listaFormatadaTexto === '': (a) quebra apos "pendentes:",
    // (b) quebra da propria variavel vazia, (c) quebra literal do template
    // antes de "[Acessar". Ou seja: `\n\n\n`.
    expect(r.corpoTexto).toMatch(/Instrumentos pendentes:\n\n\n\[Acessar portal/);
  });
});
