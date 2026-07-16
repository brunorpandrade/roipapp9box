// ROIP APP 9BOX — helpers puros das formulas canonicas do Eixo X (ME-033).
//
// Consolidam as formulas de §3.4 (Eixo X), §3.5 (bloco financeiro trimestral)
// e §3.6 (diagnostico economico) do DOC 03. Puros: sem I/O, sem banco, sem
// dependencias externas. Consumidos por `roiCalculationEngine.ts` (motor
// canonico DOC 03 §18.1) e testados diretamente por `roiFormulas.test.ts`.
//
// Convencoes canonicas:
//   - Todas as funcoes recebem e retornam `number` (nao `string`). O motor
//     converte de/para string decimal do Drizzle antes/depois de chamar.
//   - Divisao segura: quando o denominador canonico e zero ou nulo, a
//     funcao retorna `null` para o caller propagar o `RoiSkipMotivo`
//     apropriado (§3.7). Nao arredonda prematuramente — o MySQL trunca
//     conforme o `decimal(P,S)` da coluna alvo.
//   - Sem arredondamento intermediario. O produto Number * Number pode
//     acumular ruido de ponto flutuante, mas o cap de 150% e as faixas
//     canonicas do §3.4 tem margem confortavel; e a persistencia em
//     `decimal(6,4)`/`decimal(6,2)` do MySQL trunca no fim (S055).
//   - Sem lib externa (`decimal.js`, `big.js`) — helpers ficam consistentes
//     com `quarterlyPeriod.ts` e `cycleDates.ts` (100% puros JavaScript).

// ============================================================
// Constantes canonicas do §3.4
// ============================================================

/**
 * Cap canonico de 150% aplicado em DUAS camadas independentes (§3.4):
 *   1) Por variavel, no Passo 2 (`desempenho_i = min(exec/demanda, 1.50)`).
 *   2) No resultado final, no Passo 6 (`scoreDesempenho = min(ind*100, 150)`).
 * Ambas usam a mesma constante — 1.50 em fracao, 150 em percentual.
 */
export const DESEMPENHO_CAP_FRACAO = 1.5;
export const SCORE_DESEMPENHO_CAP_PERCENTUAL = 150.0;

/**
 * Valor canonico `jobFamily` da Familia 6 (`lideranca_gestao`). O motor
 * usa esta constante ao decidir os casos especiais canonicos (§3.3):
 *   - `demanda` fixa=5, ignorada se enviada.
 *   - `executado` inteiro 1..5.
 *   - `capacidadeOciosa` sempre `null`.
 */
export const FAMILIA_6_JOB_FAMILY = 'lideranca_gestao' as const;

/**
 * Faixa canonica do `scoreDesempenho` — usada para gravar
 * `performanceQuarterlyData.faixaDesempenho`. Ordem canonica dos valores
 * (`baixo` < `medio` < `alto`) e a mesma do enum MySQL (S28 de ordenacao
 * canonica).
 */
export type FaixaDesempenho = 'baixo' | 'medio' | 'alto';

/**
 * Status canonico do diagnostico economico trimestral da empresa (§3.6).
 * `sem_referencia` e o caso canonico quando `roiSegmentoMinimo` ou
 * `roiSegmentoMaximo` e NULL no cadastro da empresa.
 */
export type StatusDiagnostico =
  'excelente' | 'muito_bom' | 'aceitavel' | 'critico' | 'sem_referencia';

/**
 * Motivos canonicos de `ignoradoMotivo` (§3.7). Sete literais fechados.
 * O motor propaga estes literais no retorno do hook publico
 * (`RoiCalculationResult.skipped`) sem persistir (S054 — nao ha tabela
 * canonica no schema atual; D006 aberta para ME futura de schema
 * estendido).
 */
export type RoiSkipMotivo =
  | 'meta_roi_nao_configurada'
  | 'custo_nao_lancado'
  | 'sem_demanda'
  | 'dias_uteis_nao_lancado'
  | 'faturamento_nao_lancado'
  | 'sem_responsavel_financeiro'
  | 'trimestre_incompleto';

// ============================================================
// Passo 1 — Assiduidade mensal (§3.4)
// ============================================================

/**
 * `assiduidade = ((diasUteis - faltas) / diasUteis) * 100`.
 * Indicador informativo (nao entra no Eixo X). Percentual 0..100. Retorna
 * `null` quando `diasUteis <= 0` (canonicamente inputs invalidos que o
 * validador de campo do §3.12 ja deveria ter barrado; motor propaga
 * como `RoiSkipMotivo.dias_uteis_nao_lancado`).
 */
export function computeAssiduidade(diasUteis: number, faltas: number): number | null {
  if (diasUteis <= 0) {
    return null;
  }
  return ((diasUteis - faltas) / diasUteis) * 100;
}

// ============================================================
// Passo 2 — Desempenho por variavel (§3.4)
// ============================================================

/**
 * `desempenho_i = min(executado_i / demanda_i, 1.50)`. Precondicao:
 * `demanda > 0`. Chamado por `computeIndiceDesempenhoMes` apos filtrar
 * variaveis com `weight = 0` e `demanda = 0` (§3.3).
 */
export function computeDesempenhoVariavel(demanda: number, executado: number): number {
  if (demanda <= 0) {
    throw new Error('computeDesempenhoVariavel: demanda deve ser > 0');
  }
  const razao = executado / demanda;
  return Math.min(razao, DESEMPENHO_CAP_FRACAO);
}

// ============================================================
// Passos 3 + 4 combinados — Indice de desempenho mensal (§3.4)
// ============================================================

/**
 * Entrada canonica por variavel mensal:
 *   - `weight`: 0..100 (percentual). `weight=0` -> ignorada em tudo.
 *   - `demanda`: `null` quando ainda nao lancada; `0` quando lancada mas
 *     ainda nao ha demanda (§3.3: peso redistribuido); positivo caso
 *     canonico.
 *   - `executado`: `null` quando ainda nao lancado; nao-negativo caso
 *     canonico.
 */
export interface VariableMonth {
  weight: number;
  demanda: number | null;
  executado: number | null;
}

/**
 * Passos 3 + 4 combinados: redistribuicao de pesos + indice ponderado.
 *
 * Algoritmo canonico:
 *   1) Filtra variaveis com `weight > 0` E `demanda != null` E
 *      `demanda > 0` E `executado != null`.
 *   2) Se lista filtrada vazia -> `null` (motor propaga `sem_demanda`).
 *   3) `pesoTotal = soma dos pesos das variaveis filtradas`.
 *   4) `pesoEfetivo_i = weight_i / pesoTotal` (soma dos efetivos = 1).
 *   5) `desempenho_i = computeDesempenhoVariavel(demanda_i, executado_i)`
 *      (com cap 150% aplicado por variavel).
 *   6) `indiceMes = Σ desempenho_i * pesoEfetivo_i`.
 *
 * Faixa de saida: 0.0 a 1.50 (o cap de 150% do Passo 6 se aplica apos
 * a media trimestral, nao aqui).
 */
export function computeIndiceDesempenhoMes(vars: VariableMonth[]): number | null {
  const ativas = vars.filter(
    (v) => v.weight > 0 && v.demanda !== null && v.demanda > 0 && v.executado !== null,
  );
  if (ativas.length === 0) {
    return null;
  }
  const pesoTotal = ativas.reduce((acc, v) => acc + v.weight, 0);
  if (pesoTotal <= 0) {
    return null;
  }
  let indice = 0;
  for (const v of ativas) {
    const pesoEfetivo = v.weight / pesoTotal;
    // narrowing garantido pelo filter acima.
    const demanda = v.demanda as number;
    const executado = v.executado as number;
    const desempenho = computeDesempenhoVariavel(demanda, executado);
    indice += desempenho * pesoEfetivo;
  }
  return indice;
}

// ============================================================
// Passo 5 — Indice de desempenho trimestral (§3.4)
// ============================================================

/**
 * `indiceTri = (indiceMes1 + indiceMes2 + indiceMes3) / 3`. Media simples.
 * Retorna `null` se qualquer um dos 3 meses e `null` (motor propaga o
 * motivo canonico correspondente do mes ausente).
 */
export function computeIndiceDesempenhoTrimestral(
  mes1: number | null,
  mes2: number | null,
  mes3: number | null,
): number | null {
  if (mes1 === null || mes2 === null || mes3 === null) {
    return null;
  }
  return (mes1 + mes2 + mes3) / 3;
}

// ============================================================
// Passo 6 — scoreDesempenho (§3.4)
// ============================================================

/**
 * `scoreDesempenho = min(indiceTri * 100, 150.00)`. Percentual 0..150.
 * Valor final do Eixo X que vai para `performanceQuarterlyData.scoreDesempenho`.
 */
export function computeScoreDesempenho(indiceTrimestral: number): number {
  const percentual = indiceTrimestral * 100;
  return Math.min(percentual, SCORE_DESEMPENHO_CAP_PERCENTUAL);
}

// ============================================================
// Faixa de desempenho (§3.4)
// ============================================================

/**
 * Faixa canonica do `scoreDesempenho` a partir dos thresholds da empresa:
 *   - `score < thresholdBaixo` -> `baixo` (vermelho).
 *   - `thresholdBaixo <= score <= thresholdMedio` -> `medio` (amarelo).
 *   - `score > thresholdMedio` -> `alto` (verde).
 *
 * Defaults canonicos (schema): `thresholdBaixo=60`, `thresholdMedio=85`.
 * A borda (`= thresholdBaixo` e `= thresholdMedio`) canonicamente cai em
 * `medio` conforme §3.4 (intervalo fechado nos dois lados).
 */
export function computeFaixaDesempenho(
  score: number,
  thresholdBaixo: number,
  thresholdMedio: number,
): FaixaDesempenho {
  if (score < thresholdBaixo) {
    return 'baixo';
  }
  if (score <= thresholdMedio) {
    return 'medio';
  }
  return 'alto';
}

// ============================================================
// Passo 7 — Capacidade ociosa (§3.4)
// ============================================================

/**
 * Entrada canonica de variavel para o calculo da capacidade ociosa. `weight`
 * filtra: `weight = 0` nao entra. `goal` vem do snapshot `employeeGoals`
 * do momento do calculo (§3.2 — o motor consome o snapshot congelado).
 */
export interface OciosaVariable {
  weight: number;
  demanda: number | null;
  goal: number;
}

/**
 * Capacidade ociosa do colaborador (indicador paralelo, nao entra no Eixo X).
 *
 * Regra canonica §3.4 Passo 7:
 *   - Familia 6 -> `null` (nao calcula).
 *   - Para cada variavel com `weight > 0` e `demanda_i < goal_i`:
 *     `ociosa_i = (goal_i - demanda_i) / goal_i`.
 *   - Variaveis com `demanda_i >= goal_i` contribuem 0 de ociosidade.
 *   - Variaveis com `weight = 0` nao entram no calculo.
 *   - Media das ociosidades sobre TODAS as variaveis com `weight > 0`
 *     (nao so as com `demanda < goal`).
 *
 * Decisao S056 (autor): usa a `demanda` do MES injetado pelo caller. O
 * motor decide qual mes usar — canonicamente o ultimo mes do trimestre
 * (representa a capacidade atual do colaborador). Documentado no
 * comentario canonico do motor.
 *
 * Retorna `null` quando `isFamilia6 = true` ou quando nao ha variavel com
 * `weight > 0` (caso extremo defensivo).
 */
export function computeCapacidadeOciosa(
  vars: OciosaVariable[],
  isFamilia6: boolean,
): number | null {
  if (isFamilia6) {
    return null;
  }
  const ativas = vars.filter((v) => v.weight > 0);
  if (ativas.length === 0) {
    return null;
  }
  let somaOciosa = 0;
  for (const v of ativas) {
    if (v.goal <= 0) {
      // defensivo: goal <= 0 e canonicamente invalido (§3.12), motor
      // propaga como skip antes de chegar aqui; retornamos 0 para nao
      // dividir por zero.
      continue;
    }
    const demanda = v.demanda ?? 0;
    if (demanda >= v.goal) {
      // variavel contribui 0% de ociosidade.
      continue;
    }
    somaOciosa += (v.goal - demanda) / v.goal;
  }
  // multiplicado por 100 no motor antes de gravar em decimal(5,2)
  // (percentual). Aqui devolvemos fracao 0..1.
  return somaOciosa / ativas.length;
}

// ============================================================
// §3.5 Bloco financeiro trimestral
// ============================================================

/**
 * Media aritmetica simples dos 3 meses do trimestre. Usado para
 * `custoMedioTrimestral`, `faturamentoMedioTrimestral`. Nao ha tratamento
 * de `null` aqui — o motor filtra os casos NULL e propaga
 * `custo_nao_lancado` ou `faturamento_nao_lancado` antes de chamar.
 */
export function computeMediaTrimestral(m1: number, m2: number, m3: number): number {
  return (m1 + m2 + m3) / 3;
}

/**
 * Soma canonica dos custos medios trimestrais de todos os
 * colaboradores ativos (employees) mais os C-levels ativos (§3.5 Passo 1).
 * Motor injeta `custosEmployees` e `custosCLevels` ja calculados.
 */
export function computeFolhaTotalMedia(custosEmployees: number[], custosCLevels: number[]): number {
  const somaEmp = custosEmployees.reduce((acc, c) => acc + c, 0);
  const somaCL = custosCLevels.reduce((acc, c) => acc + c, 0);
  return somaEmp + somaCL;
}

/**
 * `retornoPotencial_i = custoMedioTrimestral_i * metaROI_i` (§3.5 Passo 3).
 * `metaROI` e um ratio (ex.: 3.5 = 350% de retorno sobre o custo). Motor
 * carrega da `companies.metaROIOperacional`/`metaROITatico`/`metaROIEstrategico`
 * conforme `employees.nivelHierarquico`.
 */
export function computeRetornoPotencial(custoMedioTrimestral: number, metaROI: number): number {
  return custoMedioTrimestral * metaROI;
}

/**
 * `participacao_i = retornoPotencial_i / faturamentoPotencial` (§3.5 Passo 5).
 * Retorna `null` se `faturamentoPotencial <= 0` — canonicamente quando
 * nenhum colaborador tem `metaROI` configurada e o somatorio zerou.
 */
export function computeParticipacao(
  retornoPotencialIndividual: number,
  faturamentoPotencial: number,
): number | null {
  if (faturamentoPotencial <= 0) {
    return null;
  }
  return retornoPotencialIndividual / faturamentoPotencial;
}

/**
 * `retornoEstimado_i = faturamentoMedioTrimestral * participacao_i`
 * (§3.5 Passo 6).
 */
export function computeRetornoEstimado(
  faturamentoMedioTrimestral: number,
  participacao: number,
): number {
  return faturamentoMedioTrimestral * participacao;
}

/**
 * `roiEstimado_i = retornoEstimado_i / custoMedioTrimestral_i` (§3.5 Passo 7).
 * Retorna `null` se `custoMedioTrimestral <= 0` (defensivo — canonicamente
 * o `custo_nao_lancado` ja teria propagado antes de chegar aqui).
 */
export function computeRoiEstimado(
  retornoEstimado: number,
  custoMedioTrimestral: number,
): number | null {
  if (custoMedioTrimestral <= 0) {
    return null;
  }
  return retornoEstimado / custoMedioTrimestral;
}

/**
 * `percMetaAtingida_i = (roiEstimado_i / metaROI_i) * 100` (§3.5 Passo 8).
 * Percentual (pode passar de 100). Retorna `null` se `metaROI <= 0`
 * (defensivo — `meta_roi_nao_configurada` ja teria propagado).
 */
export function computePercMetaAtingida(roiEstimado: number, metaROI: number): number | null {
  if (metaROI <= 0) {
    return null;
  }
  return (roiEstimado / metaROI) * 100;
}

/**
 * `roiEmpresa = faturamentoMedioTrimestral / folhaTotalMedia` (§3.5 Passo 9).
 * Independente dos ROIs individuais e independente de colaboradores sem
 * `metaROI` (§3.5 nota canonica). Retorna `null` se `folhaTotalMedia <= 0`.
 */
export function computeRoiEmpresa(
  faturamentoMedioTrimestral: number,
  folhaTotalMedia: number,
): number | null {
  if (folhaTotalMedia <= 0) {
    return null;
  }
  return faturamentoMedioTrimestral / folhaTotalMedia;
}

// ============================================================
// §3.6 Diagnostico economico trimestral da empresa
// ============================================================

/**
 * `roiMuitoBom = (roiSegmentoMinimo + roiSegmentoMaximo) / 2` (§3.6).
 * Motor so chama esta funcao quando ambos os campos da empresa estao
 * preenchidos (canonicamente definidos na `companies`).
 */
export function computeRoiMuitoBom(roiSegmentoMinimo: number, roiSegmentoMaximo: number): number {
  return (roiSegmentoMinimo + roiSegmentoMaximo) / 2;
}

/**
 * `folhaPorcentagem = (folhaTotalMedia / faturamentoMedioTrimestral) * 100`
 * (§3.6). Retorna `null` se `faturamentoMedioTrimestral <= 0` — motor
 * propaga skip antes de chegar aqui, mas defensivo.
 */
export function computeFolhaPorcentagem(
  folhaTotalMedia: number,
  faturamentoMedioTrimestral: number,
): number | null {
  if (faturamentoMedioTrimestral <= 0) {
    return null;
  }
  return (folhaTotalMedia / faturamentoMedioTrimestral) * 100;
}

/**
 * Cascata canonica do §3.6 do `statusDiagnostico`:
 *   - `roiEmpresa >= roiSegmentoMaximo` -> `excelente`.
 *   - `roiEmpresa >= roiMuitoBom`        -> `muito_bom`.
 *   - `roiEmpresa >= roiSegmentoMinimo`  -> `aceitavel`.
 *   - `roiEmpresa <  roiSegmentoMinimo`  -> `critico`.
 *
 * Se `roiSegmentoMinimo` ou `roiSegmentoMaximo` for `null` -> `sem_referencia`
 * (canonico §3.6 fim). Neste caso `roiMuitoBom` e ignorado.
 */
export function computeStatusDiagnostico(
  roiEmpresa: number,
  roiSegmentoMinimo: number | null,
  roiSegmentoMaximo: number | null,
): StatusDiagnostico {
  if (roiSegmentoMinimo === null || roiSegmentoMaximo === null) {
    return 'sem_referencia';
  }
  const roiMuitoBom = computeRoiMuitoBom(roiSegmentoMinimo, roiSegmentoMaximo);
  if (roiEmpresa >= roiSegmentoMaximo) {
    return 'excelente';
  }
  if (roiEmpresa >= roiMuitoBom) {
    return 'muito_bom';
  }
  if (roiEmpresa >= roiSegmentoMinimo) {
    return 'aceitavel';
  }
  return 'critico';
}

/**
 * `faturamentoIdeal = folhaTotalMedia * roiMuitoBom` (§3.6). Motor so
 * calcula quando `roiSegmentoMinimo` e `roiSegmentoMaximo` estao
 * preenchidos; caso contrario grava NULL em
 * `companyEconomicDiagnosis.faturamentoIdeal`.
 */
export function computeFaturamentoIdeal(folhaTotalMedia: number, roiMuitoBom: number): number {
  return folhaTotalMedia * roiMuitoBom;
}
