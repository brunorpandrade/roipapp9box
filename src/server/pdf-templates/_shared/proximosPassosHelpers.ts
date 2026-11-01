/* eslint-disable @stylistic/max-len -- helpers com strings interpoladas de proximos passos canonicos */
// ROIP APP 9BOX — helpers canonicos para derivacao deterministica
// dos 3 proximos passos ("next steps" no padrao consultoria
// estrategica) de cada PDF (ME-1.3d-REV DIS-C).
//
// Zero I/O; puros TypeScript — recebem o payload do relatorio e
// aplicam regras canonicas fechadas para gerar as 3 strings de
// recomendacao exibidas antes da rastreabilidade.
//
// Determinismo canonico: mesmo payload = mesmas 3 strings em ordem
// fixa. Zero chamada IA — preserva reproducibilidade bit-exata do
// payload canonico.

import type {
  ExecReportDepartamentoLinha,
  ExecutiveReportFinalPayload,
} from '../../services/_shared/executiveReportTypes';

type ProximosPassos = readonly [string, string, string];

// ME-1.3d-REV DIS-C CC079-1 (D-DIS-C-FORMATO-DECIMAL): numeros em pt-BR
// (virgula decimal) em TODOS os textos user-facing dos proximos passos.
function fmtPt(v: number, decimals = 2): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ============================================================
// Helpers de ranking interno (usados nas regras canonicas abaixo)
// ============================================================

function piorDimensaoClima(payload: ExecutiveReportFinalPayload): string | null {
  const atual = payload.blocoClima.trimestreAtual;
  if (atual === null) return null;
  const dim = atual.porDimensaoAgregada;
  const linhas: { nome: string; valor: number | null }[] = [
    { nome: 'engajamento', valor: dim.engajamento },
    { nome: 'desenvolvimento', valor: dim.desenvolvimento },
    { nome: 'pertencimento', valor: dim.pertencimento },
    { nome: 'realização', valor: dim.realizacao },
  ];
  const validos = linhas.filter((l): l is { nome: string; valor: number } => l.valor !== null);
  if (validos.length === 0) return null;
  const pior = validos.reduce((acc, cur) => (cur.valor < acc.valor ? cur : acc));
  return pior.nome;
}

function piorDeptoClima(payload: ExecutiveReportFinalPayload): string | null {
  const deptos = payload.detalhamentoCapilar.departamentos;
  if (deptos.length === 0) return null;
  const validos = deptos.filter(
    (d): d is ExecReportDepartamentoLinha & { notaClima: number } =>
      d.notaClima !== null && Number.isFinite(d.notaClima),
  );
  if (validos.length === 0) return null;
  const pior = validos.reduce((acc, cur) => (cur.notaClima < acc.notaClima ? cur : acc));
  return pior.departamento;
}

function piorDeptoDesempenho(payload: ExecutiveReportFinalPayload): string | null {
  const deptos = payload.detalhamentoCapilar.departamentos;
  if (deptos.length === 0) return null;
  const validos = deptos.filter(
    (d): d is ExecReportDepartamentoLinha & { scoreDesempenhoMedio: number } =>
      d.scoreDesempenhoMedio !== null && Number.isFinite(d.scoreDesempenhoMedio),
  );
  if (validos.length === 0) return null;
  const pior = validos.reduce((acc, cur) =>
    cur.scoreDesempenhoMedio < acc.scoreDesempenhoMedio ? cur : acc,
  );
  return pior.departamento;
}

function piorDeptoTurnover(payload: ExecutiveReportFinalPayload): string | null {
  const deptos = payload.detalhamentoCapilar.departamentos;
  if (deptos.length === 0) return null;
  const validos = deptos.filter(
    (d): d is ExecReportDepartamentoLinha & { turnoverTrimestralPercentual: number } =>
      d.turnoverTrimestralPercentual !== null &&
      Number.isFinite(d.turnoverTrimestralPercentual) &&
      d.turnoverTrimestralPercentual > 0,
  );
  if (validos.length === 0) return null;
  const pior = validos.reduce((acc, cur) =>
    cur.turnoverTrimestralPercentual > acc.turnoverTrimestralPercentual ? cur : acc,
  );
  return pior.departamento;
}

// ============================================================
// Executive — 3 proximos passos canonicos
// ============================================================

/**
 * Deriva deterministicamente os 3 proximos passos canonicos do
 * relatorio executivo a partir dos dados agregados. Regras canonicas
 * (ordenadas por prioridade; as 3 primeiras que se aplicarem viram
 * os passos):
 *
 * 1. Alerta de divergencia alto (>= 20%) → "Investigar divergencias
 *    de jornada no RH"
 * 2. Depto com pior nota de clima → "Investigar fatores de clima em
 *    <depto>"
 * 3. Dimensao mais fragil → "Priorizar iniciativas de <dimensao>"
 * 4. Depto com pior desempenho → "Revisar rotina de gestao em
 *    <depto>"
 * 5. Turnover trimestral >= 10% → "Revisar politica de retencao da
 *    empresa"
 * 6. Depto com maior turnover → "Mapear causas de saida em <depto>"
 *
 * Fallback canonico quando menos de 3 regras se aplicarem: completar
 * com recomendacoes neutras canonicas pre-definidas.
 */
export function derivarProximosPassosExecutivo(
  payload: ExecutiveReportFinalPayload,
): ProximosPassos {
  const passos: string[] = [];

  const alertaDiverg = payload.blocoPlenitude.trimestreAtual.percColaboradoresComAlertaDivergencia;
  if (alertaDiverg !== null && alertaDiverg >= 20) {
    passos.push(
      'Investigar divergências de jornada vs expectativa com o RH antes do próximo ciclo.',
    );
  }

  const deptoPiorClima = piorDeptoClima(payload);
  if (deptoPiorClima !== null && passos.length < 3) {
    passos.push(
      `Investigar fatores locais de clima no departamento ${deptoPiorClima} e desenhar plano de ação.`,
    );
  }

  const dimPior = piorDimensaoClima(payload);
  if (dimPior !== null && passos.length < 3) {
    passos.push(`Priorizar iniciativas que fortaleçam a dimensão ${dimPior} no próximo trimestre.`);
  }

  const deptoPiorDesemp = piorDeptoDesempenho(payload);
  if (deptoPiorDesemp !== null && deptoPiorDesemp !== deptoPiorClima && passos.length < 3) {
    passos.push(
      `Revisar rotina de gestão no departamento ${deptoPiorDesemp} para recuperar entrega.`,
    );
  }

  const turnoverTri = payload.blocoTurnover?.trimestreAtual.turnoverTrimestralPercentual ?? null;
  if (turnoverTri !== null && turnoverTri >= 10 && passos.length < 3) {
    passos.push(
      'Revisar política de retenção da empresa; turnover trimestral está acima do limiar saudável.',
    );
  }

  const deptoPiorTurnover = piorDeptoTurnover(payload);
  if (
    deptoPiorTurnover !== null &&
    deptoPiorTurnover !== deptoPiorClima &&
    deptoPiorTurnover !== deptoPiorDesemp &&
    passos.length < 3
  ) {
    passos.push(
      `Mapear causas de saída no departamento ${deptoPiorTurnover} com entrevistas estruturadas.`,
    );
  }

  // Fallback canonico — recomendacoes neutras para completar a 3
  // quando o cenario esta canonicamente saudavel e nao houve
  // alertas.
  const fallbackCanonico = [
    'Manter rotina de ciclos trimestrais e reforçar os aprendizados do período.',
    'Comunicar os resultados do trimestre à liderança operacional em até 15 dias.',
    'Consolidar a leitura cruzada dos cinco blocos no planejamento do próximo ciclo.',
  ];
  let idxFallback = 0;
  while (passos.length < 3 && idxFallback < fallbackCanonico.length) {
    passos.push(fallbackCanonico[idxFallback] ?? '');
    idxFallback += 1;
  }

  return [passos[0] ?? '', passos[1] ?? '', passos[2] ?? ''] as const;
}

// ============================================================
// Clima — 3 proximos passos canonicos
// ============================================================

export interface ClimaProximosPassosInput {
  notaClimaEmpresa: number | null;
  deptos: readonly {
    titulo: string;
    notaClima: number | null;
    respondentes: number;
  }[];
  dimensoesEmpresa: {
    engajamento: number | null;
    desenvolvimento: number | null;
    pertencimento: number | null;
    realizacao: number | null;
  };
  piorAspectoTexto: string | null;
}

export function derivarProximosPassosClima(input: ClimaProximosPassosInput): ProximosPassos {
  const passos: string[] = [];

  // Regra 1: depto com pior nota de clima.
  const deptosComNota = input.deptos.filter(
    (d): d is (typeof input.deptos)[number] & { notaClima: number } =>
      d.notaClima !== null && Number.isFinite(d.notaClima),
  );
  if (deptosComNota.length > 0) {
    const pior = deptosComNota.reduce((acc, cur) => (cur.notaClima < acc.notaClima ? cur : acc));
    passos.push(
      `Priorizar escuta ativa no departamento ${pior.titulo} (menor nota de clima: ${fmtPt(pior.notaClima, 2)}).`,
    );
  }

  // Regra 2: dimensao mais fragil da empresa.
  const dims: { nome: string; valor: number | null }[] = [
    { nome: 'engajamento', valor: input.dimensoesEmpresa.engajamento },
    { nome: 'desenvolvimento', valor: input.dimensoesEmpresa.desenvolvimento },
    { nome: 'pertencimento', valor: input.dimensoesEmpresa.pertencimento },
    { nome: 'realização', valor: input.dimensoesEmpresa.realizacao },
  ];
  const dimsValidos = dims.filter((d): d is { nome: string; valor: number } => d.valor !== null);
  if (dimsValidos.length > 0 && passos.length < 3) {
    const piorDim = dimsValidos.reduce((acc, cur) => (cur.valor < acc.valor ? cur : acc));
    passos.push(
      `Fortalecer iniciativas de ${piorDim.nome} (dimensão mais frágil da empresa: ${fmtPt(piorDim.valor, 2)}).`,
    );
  }

  // Regra 3: aspecto mais fragil (quando dado disponivel).
  if (input.piorAspectoTexto !== null && passos.length < 3) {
    passos.push(`Investigar causa estrutural do aspecto mais frágil: "${input.piorAspectoTexto}".`);
  }

  // Fallback.
  const fallback = [
    'Comunicar o resultado agregado à liderança da empresa em até 15 dias.',
    'Repetir o ciclo de clima no próximo trimestre com cadência consistente.',
    'Alinhar leitura cruzada do clima com os resultados do bloco Plenitude.',
  ];
  let i = 0;
  while (passos.length < 3 && i < fallback.length) {
    passos.push(fallback[i] ?? '');
    i += 1;
  }

  return [passos[0] ?? '', passos[1] ?? '', passos[2] ?? ''] as const;
}

// ============================================================
// Board deck — 3 proximos passos canonicos
// ============================================================

export interface BoardDeckProximosPassosInput {
  pctCriticos9Box: number;
  pctPositivos9Box: number;
  turnoverTrimestralPct: number;
  turnoverAnualizadoPct: number;
  piorFatorRadarNome: string | null;
  piorFatorRadarScore: number | null;
}

export function derivarProximosPassosBoardDeck(
  input: BoardDeckProximosPassosInput,
): ProximosPassos {
  const passos: string[] = [];

  if (input.pctCriticos9Box >= 10) {
    passos.push(
      `Mapear planos individuais para os colaboradores em quadrantes críticos (${fmtPt(input.pctCriticos9Box, 0)}% da base).`,
    );
  }

  if (
    input.piorFatorRadarNome !== null &&
    input.piorFatorRadarScore !== null &&
    passos.length < 3
  ) {
    passos.push(
      `Investigar causa estrutural do fator "${input.piorFatorRadarNome}" (score ${fmtPt(input.piorFatorRadarScore, 0)}) no Radar NR-1.`,
    );
  }

  if (input.turnoverAnualizadoPct >= 20 && passos.length < 3) {
    passos.push(
      `Revisar política de retenção da empresa; turnover anualizado em ${fmtPt(input.turnoverAnualizadoPct, 1)}%.`,
    );
  }

  if (input.turnoverTrimestralPct >= 5 && passos.length < 3) {
    passos.push(
      `Monitorar a cadência de saídas no próximo trimestre; taxa atual em ${fmtPt(input.turnoverTrimestralPct, 2)}%.`,
    );
  }

  if (input.pctPositivos9Box >= 60 && passos.length < 3) {
    passos.push(
      'Reconhecer formalmente os colaboradores em Alto Impacto e desenhar planos de sucessão.',
    );
  }

  const fallback = [
    'Manter rotina de ciclos trimestrais; o quadro consolidado está saudável.',
    'Comunicar os principais achados ao conselho e à liderança operacional.',
    'Preparar a próxima rodada do ciclo com foco em consistência comparativa.',
  ];
  let i = 0;
  while (passos.length < 3 && i < fallback.length) {
    passos.push(fallback[i] ?? '');
    i += 1;
  }

  return [passos[0] ?? '', passos[1] ?? '', passos[2] ?? ''] as const;
}
