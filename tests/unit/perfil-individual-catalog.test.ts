// ROIP APP 9BOX — teste unit do catalogo canonico do Perfil
// Individual (ME-B10-04, S255). Cobre cardinalidade, unicidade,
// distribuicao por tipo e por dimensao, alinhamento canonico com
// `itemKey` do motor (`src/server/services/individualProfileEngine.ts`)
// e helper `itensDoBlocoUx`.
//
// Este teste e o guarda-corpo canonico do RV-13 dirigido: qualquer
// divergencia entre o catalogo do front-end e o motor do back-end
// quebra a suite imediatamente. Reforcado bit-a-bit pelo espelhamento
// numerico das constantes canonicas do engine (80 itens, 10 blocos,
// 8 itens por bloco).

import { describe, expect, it } from 'vitest';

import {
  LETRAS_ALTERNATIVAS,
  LIKERT_LEGENDAS,
  PERFIL_INDIVIDUAL_CATALOG,
  PERFIL_INDIVIDUAL_ITENS_POR_BLOCO,
  PERFIL_INDIVIDUAL_TOTAL_BLOCOS,
  PERFIL_INDIVIDUAL_TOTAL_ITENS,
  itensDoBlocoUx,
} from '../../src/lib/instruments/perfilIndividualCatalog';
import {
  NUM_BLOCOS_TOTAL,
  NUM_ITENS_POR_BLOCO,
  NUM_ITENS_TOTAL,
  itemKey,
} from '../../src/server/services/individualProfileEngine';

describe('PERFIL_INDIVIDUAL_CATALOG — cardinalidade canonica', () => {
  it('total de itens = 80 (espelho canonico de NUM_ITENS_TOTAL)', () => {
    expect(PERFIL_INDIVIDUAL_CATALOG.length).toBe(80);
    expect(PERFIL_INDIVIDUAL_TOTAL_ITENS).toBe(80);
    expect(PERFIL_INDIVIDUAL_TOTAL_ITENS).toBe(NUM_ITENS_TOTAL);
  });

  it('total de blocos = 10 (espelho canonico de NUM_BLOCOS_TOTAL)', () => {
    expect(PERFIL_INDIVIDUAL_TOTAL_BLOCOS).toBe(10);
    expect(PERFIL_INDIVIDUAL_TOTAL_BLOCOS).toBe(NUM_BLOCOS_TOTAL);
  });

  it('itens por bloco = 8 (espelho canonico de NUM_ITENS_POR_BLOCO)', () => {
    expect(PERFIL_INDIVIDUAL_ITENS_POR_BLOCO).toBe(8);
    expect(PERFIL_INDIVIDUAL_ITENS_POR_BLOCO).toBe(NUM_ITENS_POR_BLOCO);
  });

  it('cada bloco UX tem exatamente 8 itens (10 x 8 = 80)', () => {
    for (let bloco = 1; bloco <= PERFIL_INDIVIDUAL_TOTAL_BLOCOS; bloco += 1) {
      const itens = itensDoBlocoUx(bloco);
      expect(itens.length).toBe(PERFIL_INDIVIDUAL_ITENS_POR_BLOCO);
    }
  });
});

describe('PERFIL_INDIVIDUAL_CATALOG — numeracao e ordem canonicas', () => {
  it('numeros vao de 1 a 80 sem gap nem duplicata', () => {
    const numeros = PERFIL_INDIVIDUAL_CATALOG.map((it) => it.numero).sort((a, b) => a - b);
    for (let i = 0; i < numeros.length; i += 1) {
      expect(numeros[i]).toBe(i + 1);
    }
  });

  it('ordem do array preserva ordem numerica 1..80', () => {
    for (let i = 0; i < PERFIL_INDIVIDUAL_CATALOG.length; i += 1) {
      const item = PERFIL_INDIVIDUAL_CATALOG[i];
      expect(item).toBeDefined();
      expect(item?.numero).toBe(i + 1);
    }
  });

  it('id canonico = itemKey(numero) bit-a-bit alinhado com o engine', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      expect(item.id).toBe(itemKey(item.numero));
    }
  });

  it('ids sao unicos (ITEM_001..ITEM_080)', () => {
    const ids = new Set(PERFIL_INDIVIDUAL_CATALOG.map((it) => it.id));
    expect(ids.size).toBe(80);
    for (let n = 1; n <= 80; n += 1) {
      expect(ids.has(itemKey(n))).toBe(true);
    }
  });
});

describe('PERFIL_INDIVIDUAL_CATALOG — atribuicao canonica a blocos UX', () => {
  it('bloco canonico = ceil(numero / 8): Bloco 1 = 1..8; Bloco 10 = 73..80', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      const blocoEsperado = Math.ceil(item.numero / PERFIL_INDIVIDUAL_ITENS_POR_BLOCO);
      expect(item.bloco).toBe(blocoEsperado);
    }
  });

  it('itensDoBlocoUx(1) retorna itens 1..8 na ordem canonica', () => {
    const itens = itensDoBlocoUx(1);
    const numeros = itens.map((it) => it.numero);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('itensDoBlocoUx(10) retorna itens 73..80 na ordem canonica', () => {
    const itens = itensDoBlocoUx(10);
    const numeros = itens.map((it) => it.numero);
    expect(numeros).toEqual([73, 74, 75, 76, 77, 78, 79, 80]);
  });

  it('itensDoBlocoUx(N) para N=1..10 retorna janela contigua de 8', () => {
    for (let bloco = 1; bloco <= 10; bloco += 1) {
      const itens = itensDoBlocoUx(bloco);
      const inicio = (bloco - 1) * 8 + 1;
      const numeros = itens.map((it) => it.numero);
      const esperado = Array.from({ length: 8 }, (_, i) => inicio + i);
      expect(numeros).toEqual(esperado);
    }
  });
});

describe('PERFIL_INDIVIDUAL_CATALOG — distribuicao por tipo (contagem empirica)', () => {
  it('50 Likert + 12 EF + 18 Cenario = 80 (soma exata)', () => {
    const likert = PERFIL_INDIVIDUAL_CATALOG.filter((it) => it.tipo === 'likert').length;
    const ef = PERFIL_INDIVIDUAL_CATALOG.filter((it) => it.tipo === 'ef').length;
    const cenario = PERFIL_INDIVIDUAL_CATALOG.filter((it) => it.tipo === 'cenario').length;
    expect(likert).toBe(50);
    expect(ef).toBe(12);
    expect(cenario).toBe(18);
    expect(likert + ef + cenario).toBe(80);
  });

  it('itens Likert nao expoem opcoes canonicas (usam LIKERT_LEGENDAS)', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      if (item.tipo === 'likert') {
        expect(item.opcoes).toBeUndefined();
      }
    }
  });

  it('itens EF expoem exatamente 2 opcoes literais', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      if (item.tipo === 'ef') {
        expect(item.opcoes).toBeDefined();
        expect(item.opcoes?.length).toBe(2);
      }
    }
  });

  it('itens Cenario expoem exatamente 4 opcoes literais', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      if (item.tipo === 'cenario') {
        expect(item.opcoes).toBeDefined();
        expect(item.opcoes?.length).toBe(4);
      }
    }
  });
});

describe('PERFIL_INDIVIDUAL_CATALOG — distribuicao por dimensao (§3.2 instrumento)', () => {
  it('distribuicao por dimensao: 16 + 15 + 15 + 15 + 12 + 7 = 80', () => {
    const contagem = {
      postura: 0,
      estrutura: 0,
      motor: 0,
      equilibrio: 0,
      assinatura: 0,
      confiabilidade: 0,
    };
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      contagem[item.dimensao] += 1;
    }
    expect(contagem.postura).toBe(16);
    expect(contagem.estrutura).toBe(15);
    expect(contagem.motor).toBe(15);
    expect(contagem.equilibrio).toBe(15);
    expect(contagem.assinatura).toBe(12);
    expect(contagem.confiabilidade).toBe(7);
    const soma =
      contagem.postura +
      contagem.estrutura +
      contagem.motor +
      contagem.equilibrio +
      contagem.assinatura +
      contagem.confiabilidade;
    expect(soma).toBe(80);
  });
});

describe('PERFIL_INDIVIDUAL_CATALOG — enunciados literais', () => {
  it('todo item tem enunciado nao vazio', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      expect(item.enunciado.length).toBeGreaterThan(0);
    }
  });

  it('todo item EF/Cenario tem alternativas nao vazias', () => {
    for (const item of PERFIL_INDIVIDUAL_CATALOG) {
      if (item.tipo === 'ef' || item.tipo === 'cenario') {
        const opcoes = item.opcoes ?? [];
        for (const op of opcoes) {
          expect(op.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ITEM_001 tem enunciado canonico do instrumento §4 (calibracao Postura)', () => {
    const item001 = PERFIL_INDIVIDUAL_CATALOG[0];
    expect(item001?.id).toBe('ITEM_001');
    expect(item001?.dimensao).toBe('postura');
    expect(item001?.tipo).toBe('likert');
    expect(item001?.enunciado).toContain('iniciativa sem esperar');
  });

  it('ITEM_080 e canonicamente Confiabilidade/Likert (Atencao dirigida final §4)', () => {
    const item080 = PERFIL_INDIVIDUAL_CATALOG[79];
    expect(item080?.id).toBe('ITEM_080');
    expect(item080?.dimensao).toBe('confiabilidade');
    expect(item080?.tipo).toBe('likert');
    expect(item080?.enunciado).toContain('última verificação de atenção');
  });
});

describe('LIKERT_LEGENDAS + LETRAS_ALTERNATIVAS — constantes canonicas', () => {
  it('LIKERT_LEGENDAS tem 5 opcoes literais canonicas DOC 05 §7.5', () => {
    expect(LIKERT_LEGENDAS.length).toBe(5);
    expect(LIKERT_LEGENDAS[0]).toBe('Nunca');
    expect(LIKERT_LEGENDAS[1]).toBe('Quase nunca');
    expect(LIKERT_LEGENDAS[2]).toBe('Às vezes');
    expect(LIKERT_LEGENDAS[3]).toBe('Quase sempre');
    expect(LIKERT_LEGENDAS[4]).toBe('Sempre');
  });

  it('LETRAS_ALTERNATIVAS = A, B, C, D (ordem canonica)', () => {
    expect(LETRAS_ALTERNATIVAS).toEqual(['A', 'B', 'C', 'D']);
  });
});
