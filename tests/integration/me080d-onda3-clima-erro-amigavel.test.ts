// ROIP APP 9BOX — teste de integração ME-080d Onda 3.
//
// Cobre bit-exact D6=A — bug do card "Clima e engajamento" que
// abria nova aba com JSON de erro cru quando nao havia agregados
// de clima (esperado hoje ate implementacao do motor no Bloco B3,
// debito D-CLIMA-B3).
//
// Fix canonico:
// - Client faz `fetch` primeiro (em vez de `window.open` direto).
// - Se resposta 200 (PDF): extrai como blob + trigger download
//   programatico via `<a download>` invisivel.
// - Se resposta 4xx/5xx: setToast com mensagem canonica amigavel
//   baseada em `body.error`.
//
// Estrategia canonica: leitura do source-code (grep-style).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const CLIENT_PATH = join(
  process.cwd(),
  'src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/RelatoriosClient.tsx',
);

describe('ME-080d Onda 3 — RelatoriosClient.tsx (D6=A: clima erro amigavel)', () => {
  const source = readFileSync(CLIENT_PATH, 'utf8');

  it('branch clima_engajamento usa fetch (nao mais window.open direto)', () => {
    // Escopo estreito: bloco `if (cardId === 'clima_engajamento')`.
    const bloco = source.match(/if\s*\(cardId === 'clima_engajamento'\)\s*\{([\s\S]*?)^\s{6}\}/m);
    expect(bloco).not.toBeNull();
    const blocoText = bloco?.[1] ?? '';
    expect(blocoText).toContain('await fetch(url)');
    expect(blocoText).not.toMatch(/window\.open\(`\/api\/reports\/clima-engajamento/);
  });

  it('mensagem canonica sem_agregados_clima presente', () => {
    expect(source).toContain('sem_agregados_clima');
    // Mensagem para o usuario final menciona Bloco B3.
    expect(source).toContain('Bloco B3');
  });

  it('trata error empresa_nao_encontrada', () => {
    expect(source).toContain('empresa_nao_encontrada');
    expect(source).toContain('Empresa não encontrada');
  });

  it('trata error perfil_sem_permissao', () => {
    expect(source).toContain('perfil_sem_permissao');
  });

  it('trata error nao_autenticado', () => {
    expect(source).toContain('nao_autenticado');
    expect(source).toContain('Sessão expirada');
  });

  it('sucesso dispara download via createObjectURL + link.click()', () => {
    expect(source).toContain('URL.createObjectURL(blob)');
    expect(source).toMatch(/link\.click\(\)/);
    expect(source).toContain('URL.revokeObjectURL');
  });

  it('extrai filename do Content-Disposition (fallback "clima-engajamento.pdf")', () => {
    expect(source).toMatch(/filename="\(\[\^"\]\+\)"/);
    expect(source).toContain("'clima-engajamento.pdf'");
  });
});
