// ROIP APP 9BOX — ME-fila6 D1 — regressao estrutural.
//
// 1. `/dados-mensais/meus-liderados` nao monta closures inline para o
//    client (D-MEUS-LIDERADOS-RSC-500) e as actions de template/upload
//    derivam o lider da sessao.
// 2. Pages platform com menu de C-level usam o helper unico.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

describe('ME-fila6 D1 — estrutura', () => {
  it('meus-liderados page nao passa funcoes inline ao client', () => {
    const src = read('src/app/dados-mensais/meus-liderados/page.tsx');
    expect(src).not.toMatch(/:\s*async\s*\(/);
    expect(src).toContain('downloadLeaderTemplateMonthly: downloadLeaderTemplateLeaderAction,');
    expect(src).toContain('uploadLeaderDataMonthly: uploadLeaderDataLeaderAction,');
    expect(src).toContain('actions={MEUS_LIDERADOS_ACTIONS}');
  });

  it('actions de template/upload do lider derivam liderId da sessao', () => {
    const src = read('src/app/dados-mensais/meus-liderados/actions.ts');
    expect(src).not.toContain('readonly liderId: number;');
    expect(src).toContain('liderId: session.userId,');
    expect(src).toContain("'downloadLeaderTemplateLeaderAction',");
    expect(src).toContain("'uploadLeaderDataLeaderAction',");
  });

  it.each([
    'src/app/dados-mensais/meus-liderados/page.tsx',
    'src/app/minha-equipe/page.tsx',
    'src/app/cadeia-indireta/internals.ts',
    'src/app/todos-os-colaboradores/page.tsx',
    'src/app/painel-clevel/page.tsx',
    'src/app/meu-portal/page.tsx',
    'src/app/meu-portal/auto-avaliacao/page.tsx',
    'src/app/meu-portal/lideranca-direta/page.tsx',
    'src/app/meu-portal/perfil-individual/page.tsx',
    'src/app/meu-portal/radar-nr1/page.tsx',
    'src/app/meus-dados/page.tsx',
    'src/app/alterar-senha/page.tsx',
    'src/app/organograma/page.tsx',
    'src/app/central-relatorios/page.tsx',
  ])('%s resolve menu pelo helper unico', (rel) => {
    const src = read(rel);
    expect(src).toContain('loadPlatformMenuContext');
    expect(src).not.toContain('loadRhSessionFlags');
  });

  it('todas as listagens injetam a ficha cadastral', () => {
    const rels = [
      'src/app/todos-os-colaboradores/page.tsx',
      'src/app/minha-equipe/page.tsx',
      'src/app/cadeia-indireta/page.tsx',
      'src/app/super-admin/empresa/[id]/todos-os-colaboradores/page.tsx',
    ];
    for (const rel of rels) {
      expect(read(rel), rel).toContain('fichaCadastralAction={carregarFichaCadastralAction}');
    }
  });
});
