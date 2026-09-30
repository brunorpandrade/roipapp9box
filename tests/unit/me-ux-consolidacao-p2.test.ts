// ROIP APP 9BOX — teste unitario ME-UX-CONSOLIDACAO-P2 (D4a card
// "9-Box equipe direta" em painel-lider).
//
// Cobre:
//   - Constantes canonicas do card (titulo + unidade sempre plural).
//   - Rota-alvo canonica bit-a-bit (`/dashboard-recorte/equipe/[id]`).
//   - `painel-lider/page.tsx` importa e usa o card canonico, e nao
//     mais o `ComingSoonBlock` "9-Box" da versao anterior.
//
// Estrategia canonica: assercao textual sobre o source (padrao dos
// demais testes estruturais do repo).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CARD_9BOX_EQUIPE_DIRETA_TITULO,
  CARD_9BOX_EQUIPE_DIRETA_UNIDADE,
} from '../../src/components/paineis/Card9BoxEquipeDireta';

const ROOT = resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('ME-UX-CONSOLIDACAO-P2 — D4a card "9-Box equipe direta"', () => {
  it('titulo canonico bit-a-bit', () => {
    expect(CARD_9BOX_EQUIPE_DIRETA_TITULO).toBe('9-Box equipe direta');
  });

  it('unidade canonica bit-a-bit (sempre plural)', () => {
    expect(CARD_9BOX_EQUIPE_DIRETA_UNIDADE).toBe('colaboradores');
  });

  it('componente monta href canonico com prefixo `employee-N` ou `clevel-N`', () => {
    // Contrato canonico do `resolveRecorteAlvo` em
    // src/server/services/recorteAccess.ts: `[alvo]` para tipo=equipe
    // e o padrao `${liderTipo}-${liderId}` (regex `/^(employee|clevel)-(\d+)$/`).
    // ID puro sem prefixo falha com "Pagina nao encontrada" (hotfix v2).
    const src = readSrc('src/components/paineis/Card9BoxEquipeDireta.tsx');
    expect(src).toContain('`/dashboard-recorte/equipe/${liderTipo}-${liderId}`');
  });

  it('painel-lider importa Card9BoxEquipeDireta', () => {
    const src = readSrc('src/app/painel-lider/page.tsx');
    expect(src).toContain(
      "import { Card9BoxEquipeDireta } from '../../components/paineis/Card9BoxEquipeDireta'",
    );
  });

  it('painel-lider consome o card com session.userId + liderTipo="employee"', () => {
    // Painel-lider e canonicamente acessado apenas por lider (role
    // === 'lider'), cujo `session.userId` sempre e `employees.id`.
    const src = readSrc('src/app/painel-lider/page.tsx');
    expect(src).toContain('liderId={session.userId}');
    expect(src).toContain('liderTipo="employee"');
    expect(src).toContain('count={data.liderarDiretosCount}');
  });

  it('painel-lider NAO renderiza mais o ComingSoonBlock title="9-Box"', () => {
    const src = readSrc('src/app/painel-lider/page.tsx');
    expect(src).not.toContain('title="9-Box"');
  });
});
