// ROIP APP 9BOX — régua única da seta de deslocamento no 9-Box, por
// posição (baixo/médio/alto × baixa/média/alta), compartilhada pelo
// dashboard individual e pelos dashboards agregados (§8.06.6a).
// Extraída de dashboard-individual/[id]/internals.ts (RV-14): uma cópia
// só, consumida por ambos.
//
// Gatilho (Opção A): a seta aparece apenas quando muda de célula —
// isto é, quando muda de quadrante em relação ao trimestre anterior.
// Mesma célula → char/label vazios (nada é desenhado na grade).
//
// Direção (8 setas) pelo par (ΔX desempenho, ΔY plenitude) de posições.
// Cor (régua do produto): verde quando nenhum eixo retrocede; vermelho
// quando ambos retrocedem; amarelo quando só um retrocede.

import { COLORS } from './design-tokens/colors';

export type PosicaoX = 'baixo' | 'medio' | 'alto';
export type PosicaoY = 'baixa' | 'media' | 'alta';

const COL_INDEX: Readonly<Record<PosicaoX, number>> = { baixo: 0, medio: 1, alto: 2 };
const ROW_INDEX: Readonly<Record<PosicaoY, number>> = { alta: 0, media: 1, baixa: 2 };

export function colIndexFor(posicaoX: PosicaoX): number {
  return COL_INDEX[posicaoX];
}

export function rowIndexFor(posicaoY: PosicaoY): number {
  return ROW_INDEX[posicaoY];
}

/** Resultado da régua: caractere da seta, cor e rótulo do veredito.
 * Todos vazios quando não houve troca de célula/quadrante. */
export interface SetaMovimento {
  readonly char: string;
  readonly color: string;
  readonly label: string;
}

const CHAR_LABEL: Readonly<Record<string, { readonly char: string; readonly label: string }>> = {
  '1,1': { char: '↗', label: 'Subiu' },
  '1,0': { char: '→', label: 'Desempenho subiu' },
  '1,-1': { char: '↘', label: 'Desempenho subiu, plenitude caiu' },
  '0,1': { char: '↑', label: 'Plenitude subiu' },
  '0,-1': { char: '↓', label: 'Plenitude caiu' },
  '-1,1': { char: '↖', label: 'Plenitude subiu, desempenho caiu' },
  '-1,0': { char: '←', label: 'Desempenho caiu' },
  '-1,-1': { char: '↙', label: 'Caiu' },
};

/**
 * Deriva a seta de deslocamento no 9-Box a partir das posições atual e
 * anterior. Eixos: X (desempenho) baixo<medio<alto — colIndex cresce
 * para a DIREITA; Y (plenitude) alta<media<baixa no índice — SUBIR
 * corresponde a rowIndex MENOR. Sem base anterior ou mesma célula →
 * `{ char:'', color:'', label:'' }` (nada é desenhado).
 */
export function derivarSeta(
  posX: PosicaoX,
  posY: PosicaoY,
  posXAnt: PosicaoX | null,
  posYAnt: PosicaoY | null,
): SetaMovimento {
  if (posXAnt === null || posYAnt === null) {
    return { char: '', color: '', label: '' };
  }
  const dxDir = COL_INDEX[posX] - COL_INDEX[posXAnt];
  const dySem = ROW_INDEX[posYAnt] - ROW_INDEX[posY];
  if (dxDir === 0 && dySem === 0) {
    return { char: '', color: '', label: '' };
  }
  const sx = Math.sign(dxDir);
  const sy = Math.sign(dySem);
  const cl = CHAR_LABEL[`${sx},${sy}`] ?? { char: '', label: '' };
  const nenhumRetrocede = dxDir >= 0 && dySem >= 0;
  const ambosRetrocedem = dxDir < 0 && dySem < 0;
  let color: string;
  if (nenhumRetrocede) {
    color = COLORS.semantic.success;
  } else if (ambosRetrocedem) {
    color = COLORS.semantic.danger;
  } else {
    color = COLORS.semantic.warning;
  }
  return { char: cl.char, color, label: cl.label };
}
