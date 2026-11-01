/* eslint-disable @stylistic/max-len -- helpers com strings interpoladas de takeaway canonico */
// ROIP APP 9BOX — helpers canonicos para derivacao deterministica
// de takeaways curtos ("so what?" no padrao consultoria estrategica)
// de cada bloco dos PDFs (ME-1.3d-REV DIS-C).
//
// Zero I/O; puros TypeScript — recebem dados agregados do payload e
// aplicam regras canonicas fechadas para gerar frases curtas
// interpretativas (1-2 linhas) exibidas em info-card teal no rodape
// de cada secao.
//
// Determinismo canonico: mesmo input = mesma string bit-exata. Zero
// chamada IA — preserva reprodutibilidade canonica do payload.

import {
  faixaClima,
  faixaDesempenho,
  faixaPlenitude,
  faixaRoi,
  faixaTurnover,
} from '../../../lib/semaforo/faixasCanonicas';

function fmtNum(v: number | null, decimals = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(v: number | null, decimals = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${fmtNum(v, decimals)}%`;
}

// ============================================================
// Takeaways canonicos de bloco (executive)
// ============================================================

export function takeawayFinanceiro(input: {
  roi: number | null;
  variacaoRoi: number | null;
  percMeta: number | null;
  percFolhaFaturamento: number | null;
  folhaMaximaIdeal: number | null;
}): string {
  const faixa = faixaRoi(input.roi);
  const sinalRoi =
    faixa === 'verde' ? 'ROI saudável' : faixa === 'amarelo' ? 'ROI em atenção' : 'ROI frágil';
  const sinalVariacao =
    input.variacaoRoi === null
      ? ''
      : input.variacaoRoi >= 0
        ? `com alta de ${fmtPct(input.variacaoRoi)} vs trimestre anterior`
        : `com recuo de ${fmtPct(Math.abs(input.variacaoRoi))} vs trimestre anterior`;
  const sinalFolha =
    input.percFolhaFaturamento !== null && input.folhaMaximaIdeal !== null
      ? input.percFolhaFaturamento > input.folhaMaximaIdeal
        ? `folha acima do teto ideal (${fmtPct(input.percFolhaFaturamento, 1)} vs limite ${fmtPct(input.folhaMaximaIdeal, 1)})`
        : `folha dentro da faixa ideal`
      : null;
  const partes = [`${sinalRoi} em ${fmtNum(input.roi, 2)}`, sinalVariacao, sinalFolha].filter(
    (s): s is string => s !== null && s.length > 0,
  );
  return partes.join('; ') + '.';
}

export function takeawayDesempenho(input: {
  scoreMedio: number | null;
  variacao: number | null;
  percMeta: number | null;
  distAcima: number;
  distNa: number;
  distProximo: number;
  distAbaixo: number;
}): string {
  const faixa = faixaDesempenho(input.scoreMedio);
  const sinal =
    faixa === 'verde'
      ? 'Desempenho forte'
      : faixa === 'amarelo'
        ? 'Desempenho em atenção'
        : 'Desempenho frágil';
  const total = input.distAcima + input.distNa + input.distProximo + input.distAbaixo;
  const pctAcima = total > 0 ? (input.distAcima / total) * 100 : 0;
  const sinalMeta =
    input.percMeta !== null
      ? `atingimento médio de ${fmtPct(input.percMeta, 0)}`
      : 'atingimento médio não calculado';
  const sinalBase =
    pctAcima >= 50
      ? `base concentrada acima da meta (${fmtPct(pctAcima, 0)})`
      : `base majoritariamente dentro ou abaixo da meta`;
  return `${sinal} em ${fmtNum(input.scoreMedio)}; ${sinalMeta}; ${sinalBase}.`;
}

export function takeawayPlenitude(input: {
  scoreMedio: number | null;
  variacao: number | null;
  pctAlertaDivergencia: number | null;
}): string {
  const faixa = faixaPlenitude(input.scoreMedio);
  const sinal =
    faixa === 'verde'
      ? 'Plenitude saudável'
      : faixa === 'amarelo'
        ? 'Plenitude em atenção'
        : 'Plenitude frágil';
  const alerta =
    input.pctAlertaDivergencia !== null
      ? input.pctAlertaDivergencia >= 20
        ? `com alta divergência jornada vs expectativa (${fmtPct(input.pctAlertaDivergencia, 0)})`
        : `com divergência jornada vs expectativa sob controle (${fmtPct(input.pctAlertaDivergencia, 0)})`
      : 'sem leitura de divergência disponível';
  return `${sinal} em ${fmtNum(input.scoreMedio)}; ${alerta}.`;
}

export function takeawayClima(input: {
  notaClima: number | null;
  variacao: number | null;
  adesao: number | null;
  respondentes: number;
}): string {
  if (input.notaClima === null) {
    return 'Clima indisponível no trimestre por piso de anonimato.';
  }
  const faixa = faixaClima(input.notaClima);
  const sinal =
    faixa === 'verde'
      ? 'Clima favorável'
      : faixa === 'amarelo'
        ? 'Clima em atenção'
        : 'Clima crítico';
  const adesao =
    input.adesao !== null ? `com adesão de ${fmtPct(input.adesao, 0)}` : 'sem adesão calculada';
  const variacao =
    input.variacao === null
      ? ''
      : input.variacao >= 0
        ? `; alta de ${fmtPct(input.variacao)} vs trim. anterior`
        : `; recuo de ${fmtPct(Math.abs(input.variacao))} vs trim. anterior`;
  return `${sinal} em ${fmtNum(input.notaClima)} ${adesao}${variacao}.`;
}

export function takeawayTurnover(input: {
  trimestralPct: number;
  variacaoPct: number | null;
  ultimos12mPct: number;
  voluntarioPct: number;
  involuntarioPct: number;
}): string {
  const faixa = faixaTurnover(input.trimestralPct);
  const sinal =
    faixa === 'verde'
      ? 'Turnover saudável'
      : faixa === 'amarelo'
        ? 'Turnover em atenção'
        : 'Turnover crítico';
  const perfil =
    input.voluntarioPct > input.involuntarioPct
      ? 'perfil predominantemente voluntário'
      : input.involuntarioPct > input.voluntarioPct
        ? 'perfil predominantemente involuntário'
        : 'perfil equilibrado voluntário/involuntário';
  const janela = `últimos 12 meses em ${fmtPct(input.ultimos12mPct)}`;
  return `${sinal} em ${fmtPct(input.trimestralPct)}; ${perfil}; ${janela}.`;
}
