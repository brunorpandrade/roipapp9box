// ROIP APP 9BOX — teste unitario `handlebarsCompiler` (ME-060).
// Cobre §11.1 (templates compilados no boot — sem compilacao a cada envio)
// + comportamento do cache global.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  _resetHandlebarsCache,
  compileTemplateOnce,
  renderTemplate,
} from '../../src/lib/email/handlebarsCompiler';

describe('compileTemplateOnce — cache canonico global', () => {
  beforeEach(() => {
    _resetHandlebarsCache();
  });

  it('primeira chamada compila e retorna delegate', () => {
    const delegate = compileTemplateOnce('t1', 'Ola, {{nome}}!');
    expect(typeof delegate).toBe('function');
    expect(delegate({ nome: 'Bruno' })).toBe('Ola, Bruno!');
  });

  it('segunda chamada com mesmo templateId reutiliza (source novo ignorado)', () => {
    const first = compileTemplateOnce('t2', 'Ola, {{nome}}!');
    const second = compileTemplateOnce('t2', 'IGNORADO {{outro}}');
    expect(second).toBe(first);
    expect(second({ nome: 'Ana' })).toBe('Ola, Ana!');
  });

  it('templateIds diferentes produzem delegates diferentes', () => {
    const a = compileTemplateOnce('t3a', 'A: {{v}}');
    const b = compileTemplateOnce('t3b', 'B: {{v}}');
    expect(a).not.toBe(b);
    expect(a({ v: 'x' })).toBe('A: x');
    expect(b({ v: 'x' })).toBe('B: x');
  });
});

describe('renderTemplate — pipeline canonico', () => {
  beforeEach(() => {
    _resetHandlebarsCache();
  });

  it('renderiza template com variavel', () => {
    const out = renderTemplate('render1', 'Ola, {{nome}}!', { nome: 'Bruno' });
    expect(out).toBe('Ola, Bruno!');
  });

  it('escape HTML default protege contra injecao', () => {
    const out = renderTemplate('render2', 'Nome: {{nome}}', { nome: '<script>x</script>' });
    // Handlebars escape padrao — < vira &lt;
    expect(out).toContain('&lt;');
    expect(out).not.toContain('<script>');
  });
});
