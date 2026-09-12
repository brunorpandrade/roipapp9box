// ROIP APP 9BOX — smoke test do Nr1FormShell (ME-B10-03, S254).
//
// Nao usa renderizacao React — o repo nao instalou jsdom nem
// @testing-library/react intencionalmente (padrao do Bloco A e do
// smoke test da ME-B10-02 `likert-form-shell.test.ts`). Este teste
// verifica identidade estrutural minima do componente (funcao React
// exportada, nao undefined) e reuso bit-a-bit da mesma import pelas
// 2 paginas de formulario (portal + platform, S246-C).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Nr1FormShell } from '../../src/components/instruments/Nr1FormShell';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('Nr1FormShell — smoke RV-13 (componente exportado)', () => {
  it('Nr1FormShell e uma funcao componente exportada', () => {
    expect(typeof Nr1FormShell).toBe('function');
    expect(Nr1FormShell.name).toBe('Nr1FormShell');
  });
});

describe('Nr1FormShell — reuso bit-a-bit entre canais portal e platform (S246-C)', () => {
  const paginas = [
    'src/app/colaborador/responder/radar-nr1/page.tsx',
    'src/app/meu-portal/radar-nr1/page.tsx',
  ] as const;

  it.each(paginas)('%s importa Nr1FormShell do modulo canonico', (rel) => {
    const content = readSrc(rel);
    expect(content).toMatch(/Nr1FormShell/);
    expect(content).toMatch(/from ['"].+components\/instruments\/Nr1FormShell['"]/);
  });

  it('cada pagina passa canalAutenticacao coerente com sua rota', () => {
    const portal = readSrc('src/app/colaborador/responder/radar-nr1/page.tsx');
    const platform = readSrc('src/app/meu-portal/radar-nr1/page.tsx');

    expect(portal).toContain('canalAutenticacao="portal"');
    expect(platform).toContain('canalAutenticacao="platform"');
  });

  it('paginas portal apontam pendencias -> /colaborador/pendencias', () => {
    const portal = readSrc('src/app/colaborador/responder/radar-nr1/page.tsx');
    expect(portal).toContain('/colaborador/pendencias');
  });

  it('paginas platform apontam pendencias -> /meu-portal', () => {
    const platform = readSrc('src/app/meu-portal/radar-nr1/page.tsx');
    expect(platform).toContain("HREF_PENDENCIAS = '/meu-portal'");
  });
});

describe('Nr1FormShell — contrato canonico consumido pelo shell', () => {
  const shellSrc = readSrc('src/components/instruments/Nr1FormShell.tsx');

  it('consome POST /api/portal/nr1-form-state para resolver estado', () => {
    expect(shellSrc).toContain("'/api/portal/nr1-form-state'");
  });

  it('consome POST /api/portal/save-nr1-response para envio', () => {
    expect(shellSrc).toContain("'/api/portal/save-nr1-response'");
  });

  it('consome POST /api/portal/session-token no canal platform', () => {
    expect(shellSrc).toContain("'/api/portal/session-token'");
  });

  it('body do save carrega chaves canonicas do backend (startToken, cicloDbId, fator)', () => {
    expect(shellSrc).toContain('startToken');
    expect(shellSrc).toContain('cicloDbId');
    expect(shellSrc).toContain('fator');
  });

  it('trata mensagem literal canonica §11.15 (ciclo encerrado)', () => {
    // A constante e definida como concatenacao de duas linhas no shell
    // (RV-14 max-len 100). Este teste verifica os dois fragmentos.
    expect(shellSrc).toContain('O ciclo do Radar NR-1 foi encerrado enquanto você preenchia.');
    expect(shellSrc).toContain('Suas respostas não puderam ser salvas.');
    expect(shellSrc).toContain('MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1');
  });
});
