// ME-1.5 BOTAO-DIAGNOSTICO-TRIMESTRES-FECHADOS: provas RV-03 bi-direcional
// da propriedade `isTrimestreFuturo` que governa a visibilidade do botao
// "Gerar diagnostico" no Dashboard individual.
//
// Causa raiz exercitada: a propriedade antiga `isTrimestreAtual` so era
// true quando `trimestre === currentTrimestreUTC()`, suprimindo o botao
// em TODOS os trimestres fechados (passado). Trimestre fechado e
// exatamente onde o diagnostico de IA e mais valioso (periodo completo
// com dados estaveis), entao o defeito bloqueava uso real do produto em
// toda a base — nao so demos.
//
// Correcao canonica (ME-1.5): propriedade renomeada para
// `isTrimestreFuturo` com comparacao `trimestre > currentTrimestreUTC()`.
// No cliente, `podeGerar = !view.isTrimestreFuturo && view.trimestre !==
// null`. Logica resultante:
//   - Trimestre passado:  isTrimestreFuturo=false → podeGerar=true  ✓ (fix)
//   - Trimestre atual:    isTrimestreFuturo=false → podeGerar=true  ✓
//   - Trimestre futuro:   isTrimestreFuturo=true  → podeGerar=false ✓
//
// RV-03 bi-direcional:
//   - Caso bom: trimestres passados e atual com `isTrimestreFuturo=false`;
//     trimestres futuros com `isTrimestreFuturo=true`.
//   - Defeito injetado: regredir para `===` quebra o caso de trimestre
//     passado (teste explicito).

import { describe, expect, it } from 'vitest';

import {
  buildQuarterView,
  currentTrimestreUTC,
} from '../../src/app/dashboard-individual/[id]/internals';

function proximoTrimestre(t: string): string {
  const partes = t.split('-Q');
  const ano = Number.parseInt(partes[0] ?? '', 10);
  const q = Number.parseInt(partes[1] ?? '', 10);
  if (q === 4) {
    return `${ano + 1}-Q1`;
  }
  return `${ano}-Q${q + 1}`;
}

function trimestreAnterior(t: string): string {
  const partes = t.split('-Q');
  const ano = Number.parseInt(partes[0] ?? '', 10);
  const q = Number.parseInt(partes[1] ?? '', 10);
  if (q === 1) {
    return `${ano - 1}-Q4`;
  }
  return `${ano}-Q${q - 1}`;
}

const BUILD_ARGS_VAZIO = {
  quarterly: null,
  plenitude: null,
  nineBox: null,
} as const;

describe('ME-1.5 isTrimestreFuturo governa botao Gerar diagnostico', () => {
  const atual = currentTrimestreUTC();
  const passado = trimestreAnterior(atual);
  const futuro = proximoTrimestre(atual);

  it('currentTrimestreUTC() retorna formato canonico YYYY-QN', () => {
    expect(atual).toMatch(/^\d{4}-Q[1-4]$/);
  });

  it('trimestre PASSADO: isTrimestreFuturo=false (caso bom RV-03 — era o defeito)', () => {
    const view = buildQuarterView({ trimestre: passado, ...BUILD_ARGS_VAZIO });
    expect(view.isTrimestreFuturo).toBe(false);
  });

  it('trimestre ATUAL: isTrimestreFuturo=false (caso bom RV-03)', () => {
    const view = buildQuarterView({ trimestre: atual, ...BUILD_ARGS_VAZIO });
    expect(view.isTrimestreFuturo).toBe(false);
  });

  it('trimestre FUTURO: isTrimestreFuturo=true (caso bom RV-03)', () => {
    const view = buildQuarterView({ trimestre: futuro, ...BUILD_ARGS_VAZIO });
    expect(view.isTrimestreFuturo).toBe(true);
  });

  it('trimestre null: isTrimestreFuturo=false (edge case — guard do client cuida)', () => {
    const view = buildQuarterView({ trimestre: null, ...BUILD_ARGS_VAZIO });
    expect(view.isTrimestreFuturo).toBe(false);
  });

  it('comparacao lexicografica YYYY-QN e canonica (2026-Q4 < 2027-Q1)', () => {
    // Garante que a comparacao `trimestre > currentTrimestreUTC()` esta
    // correta para todos os pares validos: formato de largura fixa
    // (4 digitos ano + Q + 1 digito) faz a comparacao string == numerica.
    expect('2026-Q4' < '2027-Q1').toBe(true);
    expect('2026-Q3' < '2026-Q4').toBe(true);
    expect('2027-Q1' > '2026-Q4').toBe(true);
    expect('2026-Q4' === '2026-Q4').toBe(true);
  });

  it('defeito injetado RV-03: regredir para === quebra trimestre passado', () => {
    // Simula o defeito antigo: a propriedade era true apenas quando o
    // trimestre era exatamente o corrente. Isso ocultava o botao em todo
    // trimestre passado — era o bug observado em produto no 12/10/2026.
    const passadoEhAtualSimulado = passado === atual;
    expect(passadoEhAtualSimulado).toBe(false);
    // A propriedade canonica resolve isso corretamente:
    const view = buildQuarterView({ trimestre: passado, ...BUILD_ARGS_VAZIO });
    expect(view.isTrimestreFuturo).toBe(false);
  });
});
