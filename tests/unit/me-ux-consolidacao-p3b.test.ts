// ROIP APP 9BOX — teste unitario ME-UX-CONSOLIDACAO-P3b.
//
// Cobre:
//   - Constantes canonicas do card "Ver equipes" (titulo + estado vazio).
//   - `painel-clevel/page.tsx` importa `countCLevelDiretos` e renderiza
//     `Card9BoxEquipeDireta` condicionado a `cLevelDiretosCount >= 1`.
//   - `painel-rh/page.tsx` chama `listActiveLeaders` e passa como prop
//     `activeLeaders` para `PainelRHClient`.
//   - `PainelRHClient` renderiza `<CardVerEquipes>` no rodape com
//     `basePath` canonico via `hrefPrefix`.
//   - `super-admin/empresa/[id]/page.tsx` idem para D4c (basePath com
//     prefixo Bruno).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CARD_VER_EQUIPES_TITULO,
  CARD_VER_EQUIPES_VAZIO,
} from '../../src/components/paineis/CardVerEquipes';

const ROOT = resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('ME-UX-CONSOLIDACAO-P3b — CardVerEquipes canonicas', () => {
  it('titulo canonico bit-a-bit', () => {
    expect(CARD_VER_EQUIPES_TITULO).toBe('Ver equipes');
  });

  it('mensagem vazia canonica bit-a-bit', () => {
    expect(CARD_VER_EQUIPES_VAZIO).toBe('Nenhuma equipe ativa nesta empresa.');
  });

  it('CardVerEquipes monta href canonico ${basePath}/${liderTipo}-${liderId}', () => {
    const src = readSrc('src/components/paineis/CardVerEquipes.tsx');
    expect(src).toContain('${basePath}/${l.liderTipo}-${l.liderId}');
  });
});

describe('ME-UX-CONSOLIDACAO-P3b D4a-clevel — Card9BoxEquipeDireta no painel-clevel', () => {
  it('painel-clevel importa countCLevelDiretos e Card9BoxEquipeDireta', () => {
    const src = readSrc('src/app/painel-clevel/page.tsx');
    expect(src).toContain(
      "import { countCLevelDiretos } from '../../server/services/painelNavigation'",
    );
    expect(src).toContain(
      "import { Card9BoxEquipeDireta } from '../../components/paineis/Card9BoxEquipeDireta'",
    );
  });

  it('painel-clevel executa countCLevelDiretos com session.userId', () => {
    const src = readSrc('src/app/painel-clevel/page.tsx');
    expect(src).toContain(
      'cLevelDiretosCount = await countCLevelDiretos(client.db, session.userId)',
    );
  });

  it('painel-clevel renderiza Card9BoxEquipeDireta com liderTipo="clevel"', () => {
    const src = readSrc('src/app/painel-clevel/page.tsx');
    expect(src).toContain('cLevelDiretosCount >= 1');
    expect(src).toContain('liderTipo="clevel"');
    expect(src).toContain('count={cLevelDiretosCount}');
  });
});

describe('ME-UX-CONSOLIDACAO-P3b D4b — CardVerEquipes no painel-rh', () => {
  it('painel-rh importa listActiveLeaders e chama com companyId', () => {
    const src = readSrc('src/app/painel-rh/page.tsx');
    expect(src).toContain(
      "import { listActiveLeaders } from '../../server/services/painelNavigation'",
    );
    expect(src).toContain('await listActiveLeaders(client.db, session.companyId)');
  });

  it('painel-rh passa activeLeaders como prop para PainelRHClient', () => {
    const src = readSrc('src/app/painel-rh/page.tsx');
    expect(src).toContain('activeLeaders={activeLeaders}');
  });

  it('PainelRHClient renderiza CardVerEquipes com basePath canonico', () => {
    const src = readSrc('src/app/painel-rh/PainelRHClient.tsx');
    expect(src).toContain(
      "import { CardVerEquipes } from '../../components/paineis/CardVerEquipes'",
    );
    expect(src).toContain('leaders={activeLeaders}');
    expect(src).toContain('basePath={`${hrefPrefix}/dashboard-recorte/equipe`}');
  });
});

describe('ME-UX-CONSOLIDACAO-P3b D4c — CardVerEquipes no super-admin/empresa', () => {
  it('page.tsx importa listActiveLeaders e chama com companyId', () => {
    const src = readSrc('src/app/super-admin/empresa/[id]/page.tsx');
    expect(src).toContain(
      "import { listActiveLeaders } from '../../../../server/services/painelNavigation'",
    );
    expect(src).toContain('await listActiveLeaders(client.db, companyId)');
  });

  it('page.tsx passa activeLeaders como prop para CompanyLandingClient', () => {
    const src = readSrc('src/app/super-admin/empresa/[id]/page.tsx');
    expect(src).toContain('activeLeaders={activeLeaders}');
  });

  it('CompanyLandingClient renderiza CardVerEquipes com basePath Bruno', () => {
    const src = readSrc('src/app/super-admin/empresa/[id]/CompanyLandingClient.tsx');
    expect(src).toContain(
      "import { CardVerEquipes } from '../../../../components/paineis/CardVerEquipes'",
    );
    expect(src).toContain(
      'basePath={`/super-admin/empresa/${company.id}/dashboard-recorte/equipe`}',
    );
  });
});
