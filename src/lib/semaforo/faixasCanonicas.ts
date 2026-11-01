// ROIP APP 9BOX — faixas canonicas de semaforo por metrica
// (ME-1.3d-REV DIS-C).
//
// Convencao canonica para semaforizacao visual em todos os PDFs
// (board_deck, executive, clima_engajamento) e nos cards semaforizados
// do painel executivo. Faixas calibradas com padrao de consultoria
// estrategica (McKinsey/BCG) e com os limiares historicos ja usados
// na plataforma.
//
// Convencao de retorno: literal union `'verde' | 'amarelo' | 'vermelho'`
// — mapeada para classes CSS canonicas pelo helper
// `coresCanonicasPorFaixa`.
//
// Semantica canonica:
// - `verde`   → OK / meta atingida / abaixo do limite de alerta.
// - `amarelo` → atencao / zona de alerta / proximo do limite.
// - `vermelho`→ critico / abaixo da meta / acima do limite.

export type FaixaSemaforo = 'verde' | 'amarelo' | 'vermelho';

/**
 * Classes CSS canonicas para um KPI card semaforizado:
 * - `cardClass`: classe aplicada ao `<div class="kpi-card ...">`
 * - `valueClass`: classe aplicada ao `<div class="kpi-value ...">`
 */
export interface ClassesSemaforo {
  cardClass: string;
  valueClass: string;
}

export function coresCanonicasPorFaixa(faixa: FaixaSemaforo | null): ClassesSemaforo {
  if (faixa === null) return { cardClass: '', valueClass: '' };
  if (faixa === 'verde') return { cardClass: 'highlight-green', valueClass: 'green' };
  if (faixa === 'amarelo') return { cardClass: 'highlight-yellow', valueClass: 'yellow' };
  return { cardClass: 'highlight-red', valueClass: 'red' };
}

// ============================================================
// Faixa de clima (nota 0..10) — DOC 03 §9.4.
// ============================================================

export function faixaClima(nota: number | null): FaixaSemaforo | null {
  if (nota === null || !Number.isFinite(nota)) return null;
  if (nota >= 7.5) return 'verde';
  if (nota >= 5) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa de ROI (numero puro). Benchmark de mercado: ROI > 3 e
// consistentemente positivo em people analytics de PMEs.
// ============================================================

export function faixaRoi(valor: number | null): FaixaSemaforo | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  if (valor >= 3) return 'verde';
  if (valor >= 1) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa de turnover trimestral (%). Benchmark: turnover trimestral
// <= 5% e saudavel; 5-10% zona de alerta; > 10% critico.
// ============================================================

export function faixaTurnover(pct: number | null): FaixaSemaforo | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct <= 5) return 'verde';
  if (pct <= 10) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa de desempenho medio agregado (0..100).
// ============================================================

export function faixaDesempenho(score: number | null): FaixaSemaforo | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 85) return 'verde';
  if (score >= 70) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa de plenitude media agregada (0..100).
// ============================================================

export function faixaPlenitude(score: number | null): FaixaSemaforo | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 75) return 'verde';
  if (score >= 60) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa de % meta atingida (%).
// ============================================================

export function faixaMetaAtingida(pct: number | null): FaixaSemaforo | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct >= 100) return 'verde';
  if (pct >= 85) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa de assiduidade (%).
// ============================================================

export function faixaAssiduidade(pct: number | null): FaixaSemaforo | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct >= 95) return 'verde';
  if (pct >= 90) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa canonica de variacao (padrao McKinsey/BCG) — aplicada aos
// 3 destaques do resumo executivo e a TODOS os cards de variacao
// (Financeiro, Desempenho, Plenitude, Clima, Turnover).
//
// Convencao:
// - Positivo ou zero → verde (variacao desejada).
// - Recuo entre 0 e 2% exclusivo → amarelo (zona de atencao).
// - Recuo >= 2% → vermelho (alerta).
//
// Para o TURNOVER a semantica e INVERTIDA (subida = pior) — nesse
// caso use `faixaVariacaoInvertida` abaixo.
// ============================================================

export function faixaVariacaoCanonica(delta: number | null): FaixaSemaforo | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (delta >= 0) return 'verde';
  if (delta > -2) return 'amarelo';
  return 'vermelho';
}

export function faixaVariacaoInvertida(delta: number | null): FaixaSemaforo | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (delta <= 0) return 'verde';
  if (delta < 2) return 'amarelo';
  return 'vermelho';
}

// ============================================================
// Faixa canonica dos 8 fatores do Radar NR-1 (score 0..100).
// Fator de RECURSO: alto e bom; fator de RISCO: alto e ruim
// (invertido). Semantica canonica DOC 03 §11.
// ============================================================

export function faixaRadarRecurso(score: number | null): FaixaSemaforo | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 70) return 'verde';
  if (score >= 50) return 'amarelo';
  return 'vermelho';
}

export function faixaRadarRisco(score: number | null): FaixaSemaforo | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score <= 40) return 'verde';
  if (score <= 60) return 'amarelo';
  return 'vermelho';
}

/**
 * Classifica canonicamente um fator do Radar NR-1 pelo seu nome,
 * identificando se e fator de RISCO (nome comeca com "Exigencias",
 * "Ritmo", "Conflitos" ou "Inseguranca") ou de RECURSO (demais).
 */
export function classificarTipoFatorRadar(nome: string): 'risco' | 'recurso' {
  const prefixosRisco = ['Exigências', 'Ritmo', 'Conflitos', 'Insegurança'];
  const isRisco = prefixosRisco.some((prefix) => nome.startsWith(prefix));
  return isRisco ? 'risco' : 'recurso';
}

/**
 * Aplica a faixa canonica correta ao fator do Radar NR-1 conforme o
 * seu tipo (recurso ou risco).
 */
export function faixaFatorRadar(nome: string, score: number | null): FaixaSemaforo | null {
  const tipo = classificarTipoFatorRadar(nome);
  return tipo === 'risco' ? faixaRadarRisco(score) : faixaRadarRecurso(score);
}
