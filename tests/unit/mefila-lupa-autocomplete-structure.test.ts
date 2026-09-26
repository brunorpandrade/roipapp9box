// ROIP APP 9BOX — regua estatica da ME lupa + autocomplete em "Todos os
// colaboradores" (§14.10). Mede o produto contra a especificacao lendo o
// fonte (padrao das reguas de estrutura ME-084). Vive no caminho de aceite
// (`npm run validate` → passo 9 `vitest run`, projeto `unit`).
//
// RV-03 (provada nos dois sentidos no despacho): codigo conforme → estes
// testes passam; defeito injetado em qualquer alvo → o teste do alvo
// reprova. Sem banco.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

const SA_DIR = 'src/app/super-admin/empresa/[id]/todos-os-colaboradores';
const NATIVA_DIR = 'src/app/todos-os-colaboradores';

describe('ME lupa+autocomplete — componente ColaboradorSearchBox', () => {
  const src = readSrc(`${SA_DIR}/ColaboradorSearchBox.tsx`);

  it('e client component e exporta ColaboradorSearchBox', () => {
    expect(src).toContain("'use client'");
    expect(src).toMatch(/export function ColaboradorSearchBox\(/);
  });

  it('tem o icone de lupa (superficie exigida pela ME + §14.10)', () => {
    expect(src).toContain('🔍');
  });

  it('preserva o placeholder canonico §14.10', () => {
    expect(src).toContain('Buscar por nome, CPF ou cargo...');
  });

  it('reusa o normalizeForSearch compartilhado (RV-14)', () => {
    expect(src).toMatch(/import \{ normalizeForSearch \} from '.*lib\/text\/normalizeForSearch'/);
  });

  it('aplica debounce de 300ms (§14.10)', () => {
    expect(src).toMatch(/DEBOUNCE_MS\s*=\s*300/);
  });

  it('limita as sugestoes do dropdown a 20 (padrao organograma)', () => {
    expect(src).toMatch(/SUGGESTION_LIMIT\s*=\s*20/);
  });

  it('expoe onSelectSuggestion (selecao no autocomplete)', () => {
    expect(src).toContain('onSelectSuggestion');
  });
});

describe('ME lupa+autocomplete — callsite TodosColaboradoresClient', () => {
  const src = readSrc(`${SA_DIR}/TodosColaboradoresClient.tsx`);

  it('importa o componente extraido', () => {
    expect(src).toMatch(/import \{ ColaboradorSearchBox \} from '\.\/ColaboradorSearchBox'/);
  });

  it('renderiza o ColaboradorSearchBox no lugar do input inline', () => {
    expect(src).toContain('<ColaboradorSearchBox');
    expect(src).toContain('suggestions={searchIndex}');
    expect(src).toContain('onSubmit={handleBuscaSubmit}');
    expect(src).toContain('onSelectSuggestion={handleSelectSuggestion}');
  });

  it('declara o prop opcional searchIndex e o handler de selecao', () => {
    expect(src).toMatch(/readonly searchIndex\?:\s*readonly EmployeeSearchEntry\[\]/);
    expect(src).toMatch(/const handleSelectSuggestion = useCallback\(/);
  });

  it('nao mantem mais o input inline nem o estilo orfao FILTRO_INPUT', () => {
    expect(src).not.toContain('Buscar por nome, CPF ou cargo...');
    expect(src).not.toContain('const FILTRO_INPUT');
  });
});

describe('ME lupa+autocomplete — organograma reusa o normalizador (L125)', () => {
  const src = readSrc('src/app/super-admin/empresa/[id]/organograma/OrganogramaClient.tsx');

  it('importa normalizeForSearch da fonte unica', () => {
    expect(src).toMatch(/import \{ normalizeForSearch \} from '.*lib\/text\/normalizeForSearch'/);
  });

  it('nao redefine normalizeForSearch localmente', () => {
    expect(src).not.toMatch(/function normalizeForSearch\(/);
  });
});

describe('ME lupa+autocomplete — loaders alimentam o indice nas duas rotas', () => {
  it('super-admin internals constroi e retorna searchIndex', () => {
    const src = readSrc(`${SA_DIR}/internals.ts`);
    expect(src).toContain('listEmployeesByCompany');
    expect(src).toMatch(/export function buildEmployeeSearchIndex\(/);
    expect(src).toMatch(/export interface EmployeeSearchEntry/);
    expect(src).toMatch(/const searchIndex = buildEmployeeSearchIndex\(allRows\)/);
    expect(src).toContain('lideres, searchIndex }');
  });

  it('nativa internals reusa helper/tipo e retorna searchIndex', () => {
    const src = readSrc(`${NATIVA_DIR}/internals.ts`);
    expect(src).toContain('listEmployeesByCompany');
    expect(src).toContain('buildEmployeeSearchIndex');
    expect(src).toContain('EmployeeSearchEntry');
    expect(src).toMatch(/const searchIndex = buildEmployeeSearchIndex\(allRows\)/);
    expect(src).toContain('lideres, searchIndex }');
  });

  it('page super-admin passa searchIndex ao client', () => {
    const src = readSrc(`${SA_DIR}/page.tsx`);
    expect(src).toContain('searchIndex={pageData.searchIndex}');
  });

  it('page nativa passa searchIndex nos dois ramos (C-level e RH)', () => {
    const src = readSrc(`${NATIVA_DIR}/page.tsx`);
    const matches = src.match(/searchIndex=\{pageData\.searchIndex\}/g) ?? [];
    expect(matches.length).toBe(2);
  });
});

describe('ME lupa+autocomplete — cobertura das 4 rotas da tabela (por permissao)', () => {
  it('minha-equipe: indice escopado ao lider + prop no client', () => {
    const internals = readSrc('src/app/minha-equipe/internals.ts');
    expect(internals).toContain('listAllEmployeesForExport');
    expect(internals).toContain('buildEmployeeSearchIndex');
    expect(internals).toMatch(/enforceEmployeeLeaderScope\(\s*\{[^}]*status: 'todos'/);
    expect(internals).toContain('lideres, searchIndex }');
    const page = readSrc('src/app/minha-equipe/page.tsx');
    expect(page).toContain('searchIndex={pageData.searchIndex}');
  });

  it('cadeia-indireta: indice restrito a scopeEmployeeIds + prop no client', () => {
    const internals = readSrc('src/app/cadeia-indireta/internals.ts');
    expect(internals).toContain('listEmployeesByCompany');
    expect(internals).toContain('buildEmployeeSearchIndex');
    expect(internals).toMatch(/scopeSet\.has\(r\.id\)/);
    expect(internals).toContain('departamentos, searchIndex }');
    const page = readSrc('src/app/cadeia-indireta/page.tsx');
    expect(page).toContain('searchIndex={pageData.searchIndex}');
  });
});
