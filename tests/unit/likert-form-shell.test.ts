// ROIP APP 9BOX — smoke test do LikertFormShell (ME-B10-02, S253).
//
// Nao usa renderizacao React — o repo nao instalou jsdom nem
// @testing-library/react intencionalmente (padrao do Bloco A). Este
// teste verifica identidade estrutural minima do componente (funcao
// React exportada, nao undefined) e reuso bit-a-bit da mesma import
// pelas 4 paginas de formulario (portal + platform, S246-C).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LikertFormShell } from '../../src/components/instruments/LikertFormShell';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('LikertFormShell — smoke RV-13 (componente exportado)', () => {
  it('LikertFormShell e uma funcao componente exportada', () => {
    expect(typeof LikertFormShell).toBe('function');
    expect(LikertFormShell.name).toBe('LikertFormShell');
  });
});

describe('LikertFormShell — reuso bit-a-bit entre canais portal e platform (S246-C)', () => {
  const paginas = [
    'src/app/colaborador/responder/auto-avaliacao/page.tsx',
    'src/app/colaborador/responder/lideranca-direta/page.tsx',
    'src/app/meu-portal/auto-avaliacao/page.tsx',
    'src/app/meu-portal/lideranca-direta/page.tsx',
  ] as const;

  it.each(paginas)('%s importa LikertFormShell do modulo canonico', (rel) => {
    const content = readSrc(rel);
    expect(content).toMatch(/LikertFormShell/);
    expect(content).toMatch(/from ['"].+components\/instruments\/LikertFormShell['"]/);
  });

  it('cada pagina passa canalAutenticacao coerente com sua rota', () => {
    const portalA = readSrc('src/app/colaborador/responder/auto-avaliacao/page.tsx');
    const portalD = readSrc('src/app/colaborador/responder/lideranca-direta/page.tsx');
    const platformA = readSrc('src/app/meu-portal/auto-avaliacao/page.tsx');
    const platformD = readSrc('src/app/meu-portal/lideranca-direta/page.tsx');

    expect(portalA).toContain('canalAutenticacao="portal"');
    expect(portalD).toContain('canalAutenticacao="portal"');
    expect(platformA).toContain('canalAutenticacao="platform"');
    expect(platformD).toContain('canalAutenticacao="platform"');
  });

  it('cada pagina liga o endpoint canonico correto', () => {
    const portalA = readSrc('src/app/colaborador/responder/auto-avaliacao/page.tsx');
    const portalD = readSrc('src/app/colaborador/responder/lideranca-direta/page.tsx');
    const platformA = readSrc('src/app/meu-portal/auto-avaliacao/page.tsx');
    const platformD = readSrc('src/app/meu-portal/lideranca-direta/page.tsx');

    expect(portalA).toContain('/api/portal/save-instrument-a');
    expect(portalD).toContain('/api/portal/save-instrument-d');
    expect(platformA).toContain('/api/portal/save-instrument-a');
    expect(platformD).toContain('/api/portal/save-instrument-d');
  });

  it('paginas portal apontam pendencias -> /colaborador/pendencias', () => {
    const portalA = readSrc('src/app/colaborador/responder/auto-avaliacao/page.tsx');
    const portalD = readSrc('src/app/colaborador/responder/lideranca-direta/page.tsx');
    expect(portalA).toContain('/colaborador/pendencias');
    expect(portalD).toContain('/colaborador/pendencias');
  });

  it('paginas platform apontam pendencias -> /meu-portal', () => {
    const platformA = readSrc('src/app/meu-portal/auto-avaliacao/page.tsx');
    const platformD = readSrc('src/app/meu-portal/lideranca-direta/page.tsx');
    expect(platformA).toContain("HREF_PENDENCIAS = '/meu-portal'");
    expect(platformD).toContain("HREF_PENDENCIAS = '/meu-portal'");
  });
});

describe('LikertFormShell — arquitetura visual canonica (mockup A/D)', () => {
  const shellSrc = readSrc('src/components/instruments/LikertFormShell.tsx');

  it('header sticky com titulo e progresso', () => {
    expect(shellSrc).toContain("position: 'sticky'");
    expect(shellSrc).toContain('progress');
    expect(shellSrc).toContain('de');
    expect(shellSrc).toContain('respondidas');
  });

  it('modal de saida com texto canonico', () => {
    expect(shellSrc).toContain('Sair sem enviar?');
    expect(shellSrc).toContain('Continuar respondendo');
    expect(shellSrc).toContain('Sair mesmo assim');
  });

  it('tela de confirmacao com mensagem de sucesso', () => {
    expect(shellSrc).toContain('Resposta enviada com sucesso');
    expect(shellSrc).toContain('Voltar às pendências');
  });

  it('emite portalToken temp via /api/portal/session-token no canal platform', () => {
    expect(shellSrc).toContain('/api/portal/session-token');
    expect(shellSrc).toContain("props.canalAutenticacao === 'portal'");
  });
});
