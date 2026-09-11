// ROIP APP 9BOX — teste estrutural ME-D101 (D-DIRTY-CONSOLIDACAO).
//
// Verifica via analise estatica (readFileSync) que:
// 1. src/lib/db/resolveDatabaseUrl.ts existe e exporta a funcao.
// 2. Zero definicoes locais de `resolveDatabaseUrl` fora do lib e dos
//    dois arquivos excluidos (trpc.ts, serverSession.ts).
// 3. Todo callsite que invoca `resolveDatabaseUrl()` importa do lib.
// 4. Ausencia de imports de resolveDatabaseUrl apontando para internals.ts.
//
// **RV-13.** Este teste e o consumidor canonico do lib.
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../src');
const LIB_PATH = path.join(ROOT, 'lib/db/resolveDatabaseUrl.ts');

const EXCLUDED_FROM_DEF_CHECK = new Set([
  path.join(ROOT, 'server/trpc.ts'),
  path.join(ROOT, 'server/session/serverSession.ts'),
  LIB_PATH,
]);

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...walkTs(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('ME-D101 — D-DIRTY-CONSOLIDACAO estrutural', () => {
  const allFiles = walkTs(ROOT);

  it('lib canonico existe e exporta resolveDatabaseUrl', () => {
    expect(fs.existsSync(LIB_PATH)).toBe(true);
    const content = fs.readFileSync(LIB_PATH, 'utf-8');
    expect(content).toContain('export function resolveDatabaseUrl(): string');
    expect(content).toContain('process.env.DATABASE_URL');
  });

  it('zero definicoes locais fora do lib e dos arquivos excluidos', () => {
    const violations: string[] = [];
    for (const file of allFiles) {
      if (EXCLUDED_FROM_DEF_CHECK.has(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (/function resolveDatabaseUrl\(\)/.test(content)) {
        violations.push(path.relative(ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('todo callsite importa do lib canonico', () => {
    const violations: string[] = [];
    for (const file of allFiles) {
      if (EXCLUDED_FROM_DEF_CHECK.has(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('resolveDatabaseUrl')) continue;
      // Se o arquivo chama a funcao, deve importar do lib
      if (!content.includes('resolveDatabaseUrl()')) continue;
      // Verifica substring invariante — independente de profundidade de pasta
      const hasLibImport = content.includes("lib/db/resolveDatabaseUrl'");
      if (!hasLibImport) {
        violations.push(path.relative(ROOT, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('zero imports de resolveDatabaseUrl apontando para internals.ts', () => {
    const violations: string[] = [];
    for (const file of allFiles) {
      if (EXCLUDED_FROM_DEF_CHECK.has(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (
          line.includes('resolveDatabaseUrl') &&
          line.includes('from ') &&
          line.includes('internals')
        ) {
          violations.push(`${path.relative(ROOT, file)}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
