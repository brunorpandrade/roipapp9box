// ROIP APP 9BOX — modal [Definir metas] (M1): textos e validacao
// (DOC 05 §13.7 e §18.9; DOC 03 §3.2/§3.3; ME-fila6 D3).
//
// Modulo puro compartilhado pelo client do modal e pelo service de
// gravacao (mesma regra nos dois lados).
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

export const MSG_SOMA_PESOS = 'A soma dos pesos deve totalizar 100%.';
export const MSG_META_VAZIA = 'Informe o valor da meta.';
export const MSG_META_FORA_INTERVALO = 'Valor fora do intervalo permitido.';
export const MSG_PESO_VAZIO = 'Informe o peso.';
export const MSG_PESO_FORA_INTERVALO = 'Peso deve estar entre 0 e 100.';
export const MSG_METAS_SALVAS = 'Metas definidas com sucesso.';
export const MSG_TEMPLATE_ATUALIZADO =
  'O template desta família foi atualizado por Bruno. Considere revisar as metas para ' +
  'alinhar com o novo padrão.';
export const MSG_TEMPLATE_AUSENTE =
  'O template desta família ainda não foi configurado. Peça ao Bruno para configurá-lo em ' +
  'Famílias de função.';
export const TEXTO_FAMILIA_6 =
  'Família 6 (Liderança e gestão): nomes e unidade fixos; a meta é sempre 5. Apenas o peso é ' +
  'editável.';

/** Quantidade de variaveis por familia de funcao (DOC 01 §12.2). */
export const VARIAVEIS_POR_FAMILIA = 4;

/** Meta fixa da Familia 6 (DOC 03 §3.3). */
export const META_FAMILIA_6 = 5;

const META_MAXIMA = 9999999999999.99;

/** Linha do rascunho (valores como digitados). */
export interface MetaRascunho {
  readonly variableIndex: number;
  readonly weight: string;
  readonly goal: string;
}

/** Linha validada pronta para gravar. */
export interface MetaValidada {
  readonly variableIndex: number;
  readonly weight: number;
  readonly goal: number;
}

/** Erros por linha (`variableIndex`) e da soma. */
export interface ErrosMetas {
  readonly porVariavel: Readonly<Record<number, { peso?: string; meta?: string }>>;
  readonly soma: string | null;
}

export type ValidacaoMetas =
  | { readonly ok: true; readonly data: MetaValidada[] }
  | { readonly ok: false; readonly erros: ErrosMetas };

function decimalValido(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) {
    return null;
  }
  return Number(t);
}

/** Soma dos pesos em centesimos (evita erro de ponto flutuante). */
export function somaPesosCentesimos(linhas: readonly MetaRascunho[]): number {
  let total = 0;
  for (const l of linhas) {
    const n = decimalValido(l.weight);
    if (n !== null) {
      total += Math.round(n * 100);
    }
  }
  return total;
}

/** Valida as 4 linhas conforme DOC 05 §18.9. */
export function validarMetas(linhas: readonly MetaRascunho[], familia6: boolean): ValidacaoMetas {
  const porVariavel: Record<number, { peso?: string; meta?: string }> = {};
  const data: MetaValidada[] = [];
  for (const l of linhas) {
    const erro: { peso?: string; meta?: string } = {};
    let peso: number | null = null;
    if (l.weight.trim() === '') {
      erro.peso = MSG_PESO_VAZIO;
    } else {
      peso = decimalValido(l.weight);
      if (peso === null || peso < 0 || peso > 100) {
        erro.peso = MSG_PESO_FORA_INTERVALO;
        peso = null;
      }
    }
    let meta = 0;
    if (peso !== null && peso > 0) {
      if (familia6) {
        meta = META_FAMILIA_6;
      } else if (l.goal.trim() === '') {
        erro.meta = MSG_META_VAZIA;
      } else {
        const n = decimalValido(l.goal);
        if (n === null || n <= 0 || n > META_MAXIMA) {
          erro.meta = MSG_META_FORA_INTERVALO;
        } else {
          meta = n;
        }
      }
    }
    if (erro.peso !== undefined || erro.meta !== undefined) {
      porVariavel[l.variableIndex] = erro;
    }
    if (peso !== null) {
      data.push({ variableIndex: l.variableIndex, weight: peso, goal: meta });
    }
  }
  const soma = somaPesosCentesimos(linhas) === 10000 ? null : MSG_SOMA_PESOS;
  if (Object.keys(porVariavel).length > 0 || soma !== null) {
    return { ok: false, erros: { porVariavel, soma } };
  }
  return { ok: true, data };
}
