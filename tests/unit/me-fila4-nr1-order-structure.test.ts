// ROIP APP 9BOX — teste estrutural (L129) da ME-fila4.
//
// Protege contra regressao silenciosa do fix deterministico canonico
// aplicado em `src/app/api/portal/nr1-form-state/route.ts:154-159`:
// selecao do ciclo `aberto` da empresa passa a incluir
// `ORDER BY dataAbertura DESC` como defesa em profundidade ao invariante
// canonico DOC 03 §11.2 (no maximo 1 ciclo aberto por empresa). Sem esta
// garantia, `LIMIT 1` sem `ORDER BY` retorna linha indeterminada em
// MySQL quando o invariante e violado empiricamente (descoberto durante
// ME-fila2-seed).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-fila4 — ORDER BY canonico deterministico em nr1-form-state', () => {
  const ROUTE_REL = 'src/app/api/portal/nr1-form-state/route.ts';

  it('route.ts importa `desc` de drizzle-orm alem de `and` e `eq`', () => {
    const src = readSrc(ROUTE_REL);
    expect(src).toContain("import { and, desc, eq } from 'drizzle-orm';");
  });

  it('bloco §11.2 aplica `.orderBy(desc(copsoqCycles.dataAbertura))` antes de `.limit(1)`', () => {
    const src = readSrc(ROUTE_REL);
    expect(src).toContain('.orderBy(desc(copsoqCycles.dataAbertura))');
    // Garante ordem canonica: orderBy vem imediatamente antes de limit(1).
    const orderIdx = src.indexOf('.orderBy(desc(copsoqCycles.dataAbertura))');
    const limitIdx = src.indexOf('.limit(1)', orderIdx);
    expect(orderIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(orderIdx);
  });

  it('comentario canonico do bloco §11.2 referencia ME-fila4 + DOC 03 §11.2', () => {
    const src = readSrc(ROUTE_REL);
    expect(src).toContain('ME-fila4:');
    expect(src).toContain('DOC 03 §11.2');
  });
});
