// ROIP APP 9BOX — derivacao canonica de climateEngagementData Ubatuba
// (ME-080b Dispatch 5).
//
// Escopo canonico DOC 03 (Clima e Engajamento): 84 registros distribuidos
// em 3 escopos e 4 trimestres:
//   - Empresa: 4 registros (1 por trimestre 2027Q1..2027Q4).
//   - Departamento: 24 registros (6 departamentos × 4 trimestres).
//   - Equipe (liderId): 56 registros (14 lideres × 4 trimestres). Cobertura
//     restrita aos lideres com equipe (`isLider=true`) — 14 lideres no total
//     Ubatuba (10 lideres_f6 + 3 C-levels + 1 apoio_sr por convencao).
//     Nota: como C-levels sao 3, e o schema `climateEngagementData.liderId`
//     e FK para employees.id (nao aceita clevelId), C-levels sao excluidos
//     do escopo 'equipe'. Sobram 11 lideres ativos + 3 do pool nao-employee
//     ignorados. Rodamos ate 14 se houver `isLider=true` entre employees.
//
// Cada registro tem:
//   - 20 notaQuestao*: gerado deterministicamente via PRNG dentro da faixa
//     [3.0, 4.8] (escala 1-5, evita extremos).
//   - notaClima, notaEngajamento, notaDesenvolvimento, notaPertencimento,
//     notaRealizacao: agregacao canonica das 20 questoes (media aritmetica
//     das 5 dimensoes de 4 questoes cada, arredondada para 2 casas).
//   - adesao: derivada de countCobertura / countTotal.
//   - createdAt/calculadoEm/updatedAt: EXPLICITOS (bit-exact — T4a).
//
// Idempotencia bit-exact: mesma seed produz mesmos valores. Rodar reset+reseed
// 2x produz SHA-256 identico da tabela.
//
// RV-13: consumido por `src/db/seed/ubatuba/loadUbatubaFixtures.ts` +
// `tests/unit/ubatuba/deriveClimateEngagementData.test.ts`.

import { createSeededPrng } from '../../../lib/auth/prng';
import type { DerivedUbatubaEmployeeRow } from './deriveUbatubaEmployees';
import { UBATUBA_CLIMATE_SEED, UBATUBA_COMPANY_ID, UBATUBA_REFERENCE_DATE } from './constants';

/** Trimestres canonicos do escopo Ubatuba (formato varchar(7) do schema). */
export const UBATUBA_CLIMATE_TRIMESTRES = ['2027Q1', '2027Q2', '2027Q3', '2027Q4'] as const;
export type UbatubaClimateTrimestre = (typeof UBATUBA_CLIMATE_TRIMESTRES)[number];

/**
 * Departamentos canonicos com escopo=departamento no climate. Inclui todos
 * os departamentos com >= 3 employees ativos na fixture Nativa (que se
 * espelham na Ubatuba). Excluido Diretoria (escopo cabe em empresa).
 */
export const UBATUBA_CLIMATE_DEPARTAMENTOS = [
  'Produção',
  'Comercial',
  'Logística',
  'Financeiro',
  'Administrativo',
  'Qualidade',
] as const;

/** Estrutura row-ready para INSERT em climateEngagementData. */
export interface DerivedClimateRow {
  readonly companyId: number;
  readonly escopo: 'empresa' | 'departamento' | 'equipe';
  readonly departamento: string | null;
  readonly liderId: number | null;
  readonly trimestre: UbatubaClimateTrimestre;
  readonly notaClima: string;
  readonly adesao: string;
  readonly countCobertura: number;
  readonly countTotal: number;
  readonly notaEngajamento: string;
  readonly notaDesenvolvimento: string;
  readonly notaPertencimento: string;
  readonly notaRealizacao: string;
  readonly notaQuestao01: string;
  readonly notaQuestao02: string;
  readonly notaQuestao03: string;
  readonly notaQuestao04: string;
  readonly notaQuestao05: string;
  readonly notaQuestao06: string;
  readonly notaQuestao07: string;
  readonly notaQuestao08: string;
  readonly notaQuestao09: string;
  readonly notaQuestao10: string;
  readonly notaQuestao11: string;
  readonly notaQuestao12: string;
  readonly notaQuestao13: string;
  readonly notaQuestao14: string;
  readonly notaQuestao15: string;
  readonly notaQuestao16: string;
  readonly notaQuestao17: string;
  readonly notaQuestao18: string;
  readonly notaQuestao19: string;
  readonly notaQuestao20: string;
  readonly calculadoEm: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Gera uma nota canonica no intervalo [3.0, 4.8] com 2 casas decimais.
 * Faixa escolhida canonicamente para representar climate saudavel de PME
 * em operacao (nao usar extremos <2.0 ou >4.9 que sinalizariam crise ou
 * anomalia estatistica implausivel).
 */
function gerarNotaCanonica(prng: () => number): string {
  const min = 3.0;
  const max = 4.8;
  const val = min + prng() * (max - min);
  return val.toFixed(2);
}

/**
 * Calcula media aritmetica canonica de um array de decimal strings.
 */
function mediaDecimal(valores: readonly string[]): string {
  const soma = valores.reduce((acc, v) => acc + Number(v), 0);
  return (soma / valores.length).toFixed(2);
}

/**
 * Deriva um trimestre-registro completo com as 20 notaQuestao + as 5 medias
 * de dimensao + nota geral. As 4 dimensoes canonicas mapeiam para 5
 * questoes cada (5 questoes × 4 dimensoes = 20 questoes). A 5a "dimensao"
 * derivada e notaClima (media geral das 20).
 */
function derivarTrimestre(prng: () => number): {
  notasQuestoes: readonly string[];
  notaClima: string;
  notaEngajamento: string;
  notaDesenvolvimento: string;
  notaPertencimento: string;
  notaRealizacao: string;
} {
  const notas: string[] = [];
  for (let i = 0; i < 20; i++) {
    notas.push(gerarNotaCanonica(prng));
  }
  // Dimensoes canonicas: cada 5 questoes cobrem uma dimensao (ordem canonica
  // DOC 03 §5.2: Engajamento[1-5], Desenvolvimento[6-10],
  // Pertencimento[11-15], Realizacao[16-20]).
  const notaEngajamento = mediaDecimal(notas.slice(0, 5));
  const notaDesenvolvimento = mediaDecimal(notas.slice(5, 10));
  const notaPertencimento = mediaDecimal(notas.slice(10, 15));
  const notaRealizacao = mediaDecimal(notas.slice(15, 20));
  const notaClima = mediaDecimal([
    notaEngajamento,
    notaDesenvolvimento,
    notaPertencimento,
    notaRealizacao,
  ]);
  return {
    notasQuestoes: notas,
    notaClima,
    notaEngajamento,
    notaDesenvolvimento,
    notaPertencimento,
    notaRealizacao,
  };
}

/**
 * Monta a linha row-ready a partir do trimestre-registro derivado.
 */
function montarRow(
  escopo: 'empresa' | 'departamento' | 'equipe',
  departamento: string | null,
  liderId: number | null,
  trimestre: UbatubaClimateTrimestre,
  derivado: ReturnType<typeof derivarTrimestre>,
  cobertura: number,
  total: number,
  timestampBase: Date,
): DerivedClimateRow {
  const notas = derivado.notasQuestoes;
  const adesao = total > 0 ? ((cobertura / total) * 100).toFixed(2) : '0.00';
  return {
    companyId: UBATUBA_COMPANY_ID,
    escopo,
    departamento,
    liderId,
    trimestre,
    notaClima: derivado.notaClima,
    adesao,
    countCobertura: cobertura,
    countTotal: total,
    notaEngajamento: derivado.notaEngajamento,
    notaDesenvolvimento: derivado.notaDesenvolvimento,
    notaPertencimento: derivado.notaPertencimento,
    notaRealizacao: derivado.notaRealizacao,
    notaQuestao01: notas[0]!,
    notaQuestao02: notas[1]!,
    notaQuestao03: notas[2]!,
    notaQuestao04: notas[3]!,
    notaQuestao05: notas[4]!,
    notaQuestao06: notas[5]!,
    notaQuestao07: notas[6]!,
    notaQuestao08: notas[7]!,
    notaQuestao09: notas[8]!,
    notaQuestao10: notas[9]!,
    notaQuestao11: notas[10]!,
    notaQuestao12: notas[11]!,
    notaQuestao13: notas[12]!,
    notaQuestao14: notas[13]!,
    notaQuestao15: notas[14]!,
    notaQuestao16: notas[15]!,
    notaQuestao17: notas[16]!,
    notaQuestao18: notas[17]!,
    notaQuestao19: notas[18]!,
    notaQuestao20: notas[19]!,
    calculadoEm: timestampBase,
    createdAt: timestampBase,
    updatedAt: timestampBase,
  };
}

/**
 * Deriva os 84 registros canonicos de climateEngagementData Ubatuba.
 * Ordem canonica (garante determinismo bit-exact do array retornado):
 *   1. Escopo empresa × 4 trimestres.
 *   2. Escopo departamento × 6 departamentos × 4 trimestres = 24.
 *   3. Escopo equipe × N lideres_employee ativos × 4 trimestres.
 *
 * @param ubatubaEmployees array derivado com os 66 employees Ubatuba (para
 *                          identificar lideres ativos e derivar count por
 *                          departamento).
 * @param seed              semente PRNG (default: UBATUBA_CLIMATE_SEED).
 * @returns array com todas as rows canonicas em ordem determinista.
 */
export function deriveClimateEngagementData(
  ubatubaEmployees: readonly DerivedUbatubaEmployeeRow[],
  seed: number = UBATUBA_CLIMATE_SEED,
): DerivedClimateRow[] {
  const prng = createSeededPrng(seed);
  const rows: DerivedClimateRow[] = [];
  const ts = UBATUBA_REFERENCE_DATE;

  // Contagem canonica de employees ativos (para count nos escopos).
  const ativos = ubatubaEmployees.filter((e) => e.status === 'ativo');
  const totalEmpresa = ativos.length;

  // 1. Empresa × 4 trimestres.
  for (const tri of UBATUBA_CLIMATE_TRIMESTRES) {
    const derivado = derivarTrimestre(prng);
    // Cobertura canonica: 88-97% da empresa aderiu (variacao trimestral).
    const cobertura = Math.floor(totalEmpresa * (0.88 + prng() * 0.09));
    rows.push(montarRow('empresa', null, null, tri, derivado, cobertura, totalEmpresa, ts));
  }

  // 2. Departamento × 6 × 4 trimestres.
  for (const dep of UBATUBA_CLIMATE_DEPARTAMENTOS) {
    const empsDoDep = ativos.filter((e) => e.departamento === dep);
    const totalDep = empsDoDep.length;
    for (const tri of UBATUBA_CLIMATE_TRIMESTRES) {
      const derivado = derivarTrimestre(prng);
      const cobertura = Math.floor(totalDep * (0.85 + prng() * 0.12));
      rows.push(montarRow('departamento', dep, null, tri, derivado, cobertura, totalDep, ts));
    }
  }

  // 3. Equipe × N lideres_employee × 4 trimestres.
  // "Equipe" canonica: cada lider tem seus liderados (deriva do padrao Nativa;
  // aproximamos como employees do mesmo departamento com nivelHierarquico
  // operacional/tatico e id != lider). Numero medio de liderados por lider
  // varia canonicamente com o departamento.
  const lideres = ativos.filter((e) => e.isLider);
  for (const lider of lideres) {
    const liderados = ativos.filter(
      (e) =>
        e.departamento === lider.departamento &&
        e.id !== lider.id &&
        e.nivelHierarquico !== 'estrategico',
    );
    const totalEquipe = liderados.length;
    for (const tri of UBATUBA_CLIMATE_TRIMESTRES) {
      const derivado = derivarTrimestre(prng);
      const cobertura = Math.floor(totalEquipe * (0.75 + prng() * 0.2));
      rows.push(montarRow('equipe', null, lider.id, tri, derivado, cobertura, totalEquipe, ts));
    }
  }

  return rows;
}
