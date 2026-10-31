// ROIP APP 9BOX — Rotulos canonicos dos motivos de inconsistencia do
// Perfil Individual (ME-1.11 do ROADMAP_V3). Modulo puro, zero IO,
// consumido pelo service `individualProfilePlaceholders.ts` para
// enriquecer as linhas do box "Perfil Individual inconsistente" com os
// motivos humanizados que levaram o motor a classificar a tentativa
// como `baixa` confiabilidade (DOC 03 §10.6 pt.1).
//
// Origem canonica das classificacoes:
// - DOC 03 §5.1.1 a §5.1.5 — os 5 indices de confiabilidade:
//   ia_att (atencao), ia_soc (desejabilidade social), ia_acq
//   (aquiescencia), ia_cons (consistencia), ia_ext (extremidade).
// - DOC 03 §5.1.6 — classificacao em niveis `alta`, `moderada`, `baixa`
//   agregando os alertas dos 5 subindices.
// - `src/server/services/individualProfileEngine.ts` linhas 437 a 526
//   — funcoes puras `computeIaAtt`, `computeIaSoc`, `computeIaAcq`,
//   `computeIaCons`, `computeIaExt` que classificam cada subindice como
//   `ok | medio | critico` a partir do score bruto.
//
// Racional da duplicacao canonica dos thresholds (RV-14 L125 avaliada e
// rejeitada nesta ME):
// - O service `listInconsistentesEnriquecidoByCompany` recebe os 5
//   scores ja persistidos em `individualProfileAssessments` (colunas
//   decimais `ia_att` a `ia_ext`). Nao recebe os alertas — a tabela
//   nunca os persistiu. Reclassificacao e inevitavel.
// - Extracao L125 integral dos 10 thresholds + do tipo
//   `AlertaConfiabilidade` em constantes compartilhadas do motor
//   aumenta o perimetro da ME-1.11 para alem da divida canonica (4
//   partes para 3). Fica como debito D-THRESHOLDS-SHARED no OPERACAO.
// - O teste `individualProfileReliabilityLabels.test.ts` cobre os 15
//   cenarios canonicos de severidade (3 niveis x 5 subescalas) + ordem
//   + filtro de `ok`, protegendo contra drift silencioso. Qualquer
//   mudanca canonica dos thresholds do motor dispara reprovacao do
//   teste nesta ME ate que a divida D-THRESHOLDS-SHARED se consolide.
//
// RV-14: um statement por linha, largura maxima 100 cols.
// RV-13: `classificarMotivosInconsistencia` e `MOTIVO_LABELS` sao
//   consumidos pelo service `individualProfilePlaceholders.ts` e
//   testados em `tests/unit/individualProfileReliabilityLabels.test.ts`.

/**
 * Chave canonica das 5 subescalas de confiabilidade (DOC 03 §5.1).
 * Preserva nomenclatura bit-a-bit das colunas `ia_*` do schema
 * `individualProfileAssessments` (DOC 01 §9.1).
 */
export type MotivoKey = 'ia_att' | 'ia_soc' | 'ia_acq' | 'ia_cons' | 'ia_ext';

/**
 * Severidade canonica do motivo. Espelho do `AlertaConfiabilidade` do
 * motor (`src/server/services/individualProfileEngine.ts` linha 379).
 * `ok` nunca entra na lista final — e filtrado pela
 * `classificarMotivosInconsistencia`.
 */
export type MotivoSeveridade = 'critico' | 'medio';

/**
 * Rotulo canonico humanizado de um motivo de inconsistencia. Exposto
 * ao usuario final (RH e Super Admin em preview) no pop-up da modal
 * `MotivoInconsistenciaModal` do painel RH (DOC 05 §5.5 estendida pela
 * ME-1.11).
 *
 * - `titulo`: curto, imperativo-descritivo, sem termo tecnico sem
 *   traducao (DOC 03 §6.5 regra 4).
 * - `descricao`: 1 a 2 linhas em registro executivo, explicando o
 *   padrao observado sem jargao psicometrico (DOC 03 §6.7).
 * - `severidade`: ordem canonica de apresentacao
 *   (`critico` antes de `medio`).
 */
export interface MotivoRotulado {
  readonly chave: MotivoKey;
  readonly titulo: string;
  readonly descricao: string;
  readonly severidade: MotivoSeveridade;
}

/**
 * Catalogo canonico dos 5 motivos humanizados. Textos aprovados em
 * leitura da especificacao DOC 03 §6.7 (restricoes absolutas) + §10.6
 * (fluxo canonico de confiabilidade baixa).
 *
 * Nenhum termo tecnico (traco, faceta, construto, aquiescencia) e
 * exposto ao usuario; nenhuma metodologia de origem (DISC, Big Five) e
 * citada. A linguagem e executiva, orientada ao padrao observavel.
 */
export const MOTIVO_LABELS: Readonly<
  Record<
    MotivoKey,
    {
      readonly titulo: string;
      readonly descricao: string;
    }
  >
> = {
  ia_att: {
    titulo: 'Falhas em perguntas de atenção',
    descricao:
      'As duas perguntas de verificação de atenção do instrumento não receberam a resposta ' +
      'esperada. Indica que o colaborador pode ter respondido rápido demais ou sem ler o ' +
      'enunciado com cuidado.',
  },
  ia_soc: {
    titulo: 'Padrão de resposta socialmente desejável',
    descricao:
      'Várias perguntas-chave foram respondidas no sentido mais favorável socialmente, com ' +
      'pouca variação. Indica que o colaborador pode ter respondido o que acredita ser ' +
      'esperado, em vez de como realmente percebe o próprio comportamento.',
  },
  ia_acq: {
    titulo: 'Tendência de concordar sem avaliar',
    descricao:
      'Pares de perguntas com conteúdo oposto foram respondidos no mesmo sentido (ambas em ' +
      'concordância alta ou ambas em discordância alta). Indica que o colaborador pode ter ' +
      'respondido no automático, sem avaliar cada afirmação individualmente.',
  },
  ia_cons: {
    titulo: 'Respostas contraditórias entre si',
    descricao:
      'Perguntas que medem o mesmo aspecto por caminhos diferentes receberam respostas ' +
      'incompatíveis entre si. Indica inconsistência interna que compromete a leitura do ' +
      'perfil.',
  },
  ia_ext: {
    titulo: 'Uso excessivo das extremidades da escala',
    descricao:
      'Mais de 75% das respostas usaram as pontas extremas da escala (1 ou 5), com pouca ' +
      'variação intermediária. Indica padrão de resposta polarizado que compromete a ' +
      'granularidade da leitura.',
  },
};

/**
 * Scores dos 5 subindices como persistidos em
 * `individualProfileAssessments` — vindos do driver MySQL como `string`
 * (decimais) ou `null` quando a tentativa nao foi calculada ainda.
 */
export interface SubescalaScores {
  readonly ia_att: string | null;
  readonly ia_soc: string | null;
  readonly ia_acq: string | null;
  readonly ia_cons: string | null;
  readonly ia_ext: string | null;
}

/**
 * Severidade canonica calculada a partir do score de uma subescala.
 * Replica bit-a-bit a logica das funcoes `computeIa*` do motor
 * (`src/server/services/individualProfileEngine.ts` linhas 437 a 526).
 *
 * Retorna `null` quando o motivo e `ok` (nao inclui no payload final).
 * `null` tambem quando o score esta ausente — motor nunca persiste
 * `baixa` sem ter calculado todos os 5 scores, mas a defensiva protege
 * payloads parciais vindos de reseeds historicos.
 */
function severidadeDeIaAtt(score: number): MotivoSeveridade | null {
  // §5.1.1 — score 0-2. ok=2, medio=1, critico=0.
  if (score === 2) return null;
  if (score === 1) return 'medio';
  return 'critico';
}

function severidadeDeIaSoc(score: number): MotivoSeveridade | null {
  // §5.1.2 — score 0-6. ok<=1, medio<=3, critico>3.
  if (score <= 1) return null;
  if (score <= 3) return 'medio';
  return 'critico';
}

function severidadeDeIaAcq(score: number): MotivoSeveridade | null {
  // §5.1.3 — score 0-1. ok=0, medio=1 (nunca critico neste subindice).
  if (score === 0) return null;
  return 'medio';
}

function severidadeDeIaCons(score: number): MotivoSeveridade | null {
  // §5.1.4 — score 0-6 (|6 - soma|). ok<=1, medio=2, critico>2.
  if (score <= 1) return null;
  if (score === 2) return 'medio';
  return 'critico';
}

function severidadeDeIaExt(score: number): MotivoSeveridade | null {
  // §5.1.5 — score 0-1 (proporcao). ok<=0.6, medio<=0.75, critico>0.75.
  if (score <= 0.6) return null;
  if (score <= 0.75) return 'medio';
  return 'critico';
}

function parseScore(valor: string | null): number | null {
  if (valor === null) return null;
  const num = Number(valor);
  if (!Number.isFinite(num)) return null;
  return num;
}

/**
 * Classifica os 5 subindices em motivos rotulados ordenados por
 * severidade canonica (`critico` antes de `medio`). Dentro da mesma
 * severidade, a ordem segue a sequencia do DOC 03 §5.1 (att, soc, acq,
 * cons, ext) — estavel entre execucoes.
 *
 * Entradas `null`, `ok` ou nao-finitas sao filtradas silenciosamente;
 * o payload final so contem subindices que efetivamente contribuiram
 * para a classificacao de `baixa` confiabilidade pelo motor.
 */
export function classificarMotivosInconsistencia(
  scores: SubescalaScores,
): readonly MotivoRotulado[] {
  const ordemCanonica: readonly MotivoKey[] = ['ia_att', 'ia_soc', 'ia_acq', 'ia_cons', 'ia_ext'];
  const severidadeFns: Readonly<Record<MotivoKey, (n: number) => MotivoSeveridade | null>> = {
    ia_att: severidadeDeIaAtt,
    ia_soc: severidadeDeIaSoc,
    ia_acq: severidadeDeIaAcq,
    ia_cons: severidadeDeIaCons,
    ia_ext: severidadeDeIaExt,
  };
  const resultados: MotivoRotulado[] = [];
  for (const chave of ordemCanonica) {
    const num = parseScore(scores[chave]);
    if (num === null) continue;
    const severidade = severidadeFns[chave](num);
    if (severidade === null) continue;
    const label = MOTIVO_LABELS[chave];
    resultados.push({
      chave,
      titulo: label.titulo,
      descricao: label.descricao,
      severidade,
    });
  }
  // Ordenacao canonica: critico antes de medio. Dentro de cada
  // severidade preserva a ordem do DOC 03 §5.1 (sort estavel do V8).
  resultados.sort((a, b) => {
    if (a.severidade === b.severidade) return 0;
    return a.severidade === 'critico' ? -1 : 1;
  });
  return resultados;
}
