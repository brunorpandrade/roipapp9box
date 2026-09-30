// ROIP APP 9BOX — teste unitario ME-D-DIRTY-CONSOLIDACAO.
//
// Cobre a consolidacao canonica de `resolveDatabaseUrl`: apos esta ME,
// `src/server/trpc.ts` e `src/server/session/serverSession.ts` NAO
// definem mais copia local da funcao — importam o helper canonico de
// `src/lib/db/resolveDatabaseUrl.ts`. Fecha o debito remanescente da
// ME-D101 (que deixou os dois arquivos com copia privada "fora do
// escopo").
//
// Estrategia canonica (padrao dos testes estruturais do repo, ex.
// `me-b9-cr-structure.test.ts`): assercao textual sobre o source com
// `readFileSync`. Nao executa a funcao — o comportamento ja e coberto
// por `me-d101-resolve-db-url.test.ts`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('ME-D-DIRTY-CONSOLIDACAO — resolveDatabaseUrl unificado', () => {
  it('src/server/trpc.ts importa o helper canonico', () => {
    const src = readSrc('src/server/trpc.ts');
    expect(src).toContain("import { resolveDatabaseUrl } from '../lib/db/resolveDatabaseUrl'");
  });

  it('src/server/trpc.ts NAO redefine resolveDatabaseUrl localmente', () => {
    const src = readSrc('src/server/trpc.ts');
    expect(src).not.toMatch(/function\s+resolveDatabaseUrl\s*\(/);
  });

  it('src/server/session/serverSession.ts importa o helper canonico', () => {
    const src = readSrc('src/server/session/serverSession.ts');
    expect(src).toContain("import { resolveDatabaseUrl } from '../../lib/db/resolveDatabaseUrl'");
  });

  it('src/server/session/serverSession.ts NAO redefine resolveDatabaseUrl localmente', () => {
    const src = readSrc('src/server/session/serverSession.ts');
    expect(src).not.toMatch(/function\s+resolveDatabaseUrl\s*\(/);
  });

  it('src/server/trpc.ts NAO le process.env.DATABASE_URL diretamente', () => {
    const src = readSrc('src/server/trpc.ts');
    expect(src).not.toContain('process.env.DATABASE_URL');
  });

  it('src/server/session/serverSession.ts NAO le process.env.DATABASE_URL diretamente', () => {
    const src = readSrc('src/server/session/serverSession.ts');
    expect(src).not.toContain('process.env.DATABASE_URL');
  });
});
