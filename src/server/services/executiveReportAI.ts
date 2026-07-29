// ROIP APP 9BOX — motor IA do Relatorio executivo trimestral
// (ME-053, S275).
//
// Orquestra as 6 (ou 5) chamadas canonicas a Claude API (5 blocos +
// sintese) conforme §7.3 do DOC 04. Concorrencia canonica maxima de 3
// chamadas simultaneas (§7.3.1). Sintese depende da conclusao de
// todos os blocos. Falha em qualquer bloco = fallback canonico §11.4:
// cache preservado; `apiUsageLog` NAO incrementado; notificacao de
// falha via handoff DOC 06.
//
// Fluxo canonico:
//   1. Guard §7.3 fase 1: verifica `apiUsageLog.contador >= 5` no
//      dia atual do escopo da empresa. Ao atingir, outcome `limit_reached`.
//   2. Executa motor deterministico (§7.3 fase 1 cont'd) — payload dos
//      5 (ou 4) blocos + detalhamento capilar.
//   3. Se blocoClima.disponivel=false, preenche o paragrafo canonico
//      curto §7.6 SEM chamada Claude para esse bloco.
//   4. Fase 2 §7.3: chamadas de bloco em paralelo com concorrencia 3.
//   5. Fase 3 §7.3: 6a chamada (sintese) com paragrafos ja coletados.
//   6. Fase 4 §7.3: renderiza HTML + PDF via `PdfRendererFacade`.
//   7. Fase 5 §7.3: persiste PDF via `ExecutiveReportStorageFacade` +
//      UPSERT em `executiveReportCache`.
//   8. Fase 6 §7.3: incrementa `apiUsageLog`.
//   9. Fase 7-8 §7.3: notificacao/change log via handoff DOC 06 (fora
//      do escopo desta ME — reservado por callback `onGenerationComplete`).
//
// Consumo canonico: chamado pelo sub-router `exports.generateRelatorioExecutivo`.
// Testes: `tests/unit/executiveReportAI.test.ts` (unit com stub) +
// `tests/integration/exports-router.test.ts` (integracao).

import type { RoipDatabase } from '../../db/client';
import { getApiUsageForDay, incrementApiUsage } from './apiUsageLog';
import {
  DEFAULT_CLAUDE_CALL_FACADE,
  type ClaudeCallFacade,
  type ClaudeCallResult,
  type ClaudeCallStatus,
  type ClaudeCallSurface,
} from './claudeCall';
import { upsertExecutiveReportCache } from './executiveReportCache';
import {
  EXEC_REPORT_CLIMA_INDISPONIVEL_PARAGRAFO,
  EXECUTIVE_REPORT_SYSTEM_PROMPT,
} from './executiveReportSystemPrompt';
import {
  buildExecutiveReportPayload,
  type BuildExecutiveReportArgs,
} from './executiveReportEngine';
import {
  DEFAULT_EXECUTIVE_REPORT_STORAGE,
  type ExecutiveReportStorageFacade,
} from './executiveReportStorage';
import { DEFAULT_PDF_RENDERER_FACADE, type PdfRendererFacade } from './pdfRenderer';
import {
  composeExecutiveReportFilename,
  renderExecutiveReportHTML,
} from '../pdf-templates/executiveReportTemplate';
import type {
  ExecReportPacoteSintese,
  ExecutiveReportDeterministicoPayload,
  ExecutiveReportFinalPayload,
} from './_shared/executiveReportTypes';

// ============================================================
// Constantes canonicas
// ============================================================

/**
 * Limite canonico diario §7.10 DOC 04 — 5 geracoes por dia por empresa.
 */
export const EXEC_REPORT_LIMITE_DIARIO = 5 as const;

/** `max_tokens` canonico §7.7 para paragrafo interpretativo de bloco. */
const EXEC_REPORT_MAX_TOKENS_BLOCO = 1_500 as const;

/** `max_tokens` canonico §7.7 para resumo executivo geral (6a chamada). */
const EXEC_REPORT_MAX_TOKENS_SINTESE = 2_500 as const;

/** `temperature` canonica §7.7 — interpretacao estavel. */
const EXEC_REPORT_TEMPERATURE = 0.3;

/** Timeout canonico §7.7 — 45 segundos por chamada. */
const EXEC_REPORT_TIMEOUT_MS = 45_000;

/** Concorrencia maxima canonica §7.3.1 — 3 chamadas simultaneas. */
const EXEC_REPORT_MAX_CONCORRENCIA = 3;

/** Mensagem canonica de fallback §11.4 (via sino). */
const MSG_EXEC_REPORT_FALLBACK_SINO =
  'Falha na geração do Relatório executivo trimestral. Tente novamente.';

/** Mensagem canonica exata §7.10 do limite diario atingido. */
export const MSG_EXEC_REPORT_LIMIT_REACHED =
  // eslint-disable-next-line @stylistic/max-len -- mensagem canonica literal §7.10
  'Limite diário de 5 gerações do Relatório executivo trimestral atingido para esta empresa. Novas gerações estarão disponíveis a partir de 00:00 (fuso local da empresa).';

// ============================================================
// Instrucao final canonica por bloco (S275)
// ============================================================

/**
 * Instrucao final canonica ao user prompt de cada bloco, conforme
 * §8.5-§8.9. Extraida como constante para consistencia em teste.
 */
const INSTRUCAO_BLOCO_GENERICA =
  // eslint-disable-next-line @stylistic/max-len -- instrucao canonica literal
  'Instrução: produza um parágrafo interpretativo de 2 a 4 frases sobre este bloco, em linguagem executiva. Nunca calcule, nunca invente número. Baseie-se exclusivamente nos números fornecidos.';

const INSTRUCAO_BLOCO_FINANCEIRO =
  // eslint-disable-next-line @stylistic/max-len -- instrucao canonica literal §8.5
  'Instrução: produza um parágrafo interpretativo de 2 a 4 frases sobre este bloco, em linguagem executiva. Nunca calcule, nunca invente número, nunca faça previsão definitiva de desempenho futuro. Baseie-se exclusivamente nos números fornecidos.';

const INSTRUCAO_BLOCO_CLIMA =
  // eslint-disable-next-line @stylistic/max-len -- instrucao canonica literal §8.8
  'Instrução: produza um parágrafo interpretativo de 2 a 4 frases sobre este bloco, em linguagem executiva. Nunca calcule, nunca invente número. Se houver nota de agregação por anonimato, mencione contextualmente que os dados correspondem ao nível hierárquico agregado indicado — sem revelar sub-escopos com número insuficiente de respondentes. Baseie-se exclusivamente nos números fornecidos.';

const INSTRUCAO_BLOCO_TURNOVER =
  // eslint-disable-next-line @stylistic/max-len -- instrucao canonica literal §8.9
  'Instrução: produza um parágrafo interpretativo de 2 a 4 frases sobre este bloco, em linguagem executiva. Nunca calcule, nunca invente número. Nunca especule sobre motivos individuais de saída. Baseie-se exclusivamente nos números fornecidos.';

const INSTRUCAO_SINTESE =
  // eslint-disable-next-line @stylistic/max-len -- instrucao canonica literal §8.10
  'Instrução: produza o resumo executivo geral em 1 ou 2 parágrafos curtos, em linguagem executiva, sintetizando os 5 (ou 4) blocos acima. Você pode fazer cruzamento entre os blocos usando apenas os agregados-chave fornecidos — nunca introduza número novo, nunca calcule, nunca invente. Não repita frases dos parágrafos interpretativos; produza uma síntese integrada de nível superior. Nunca especule sobre causas ou faça previsões definitivas.';

// ============================================================
// Deps canonicas
// ============================================================

/**
 * Dependencias canonicas do motor IA. Facades para claudeCall, PDF e
 * storage — permitem stubs deterministicos em teste. `now` para
 * evitar `Date.now()` no motor (determinismo canonico). `timeZone`
 * canonico da empresa para calcular `dataUso` do apiUsageLog.
 */
export interface ExecutiveReportAIDeps {
  db: RoipDatabase;
  claudeCallFacade: ClaudeCallFacade;
  pdfRendererFacade: PdfRendererFacade;
  storageFacade: ExecutiveReportStorageFacade;
  now: () => Date;
  /**
   * Callback canonico de conclusao — handoff DOC 06 (§7.3 fase 7-8).
   * Reservado para notificacao via sino + change log; NAO implementado
   * nesta ME (deferido para B6). Motor invoca no sucesso; falha nao
   * dispara este callback (a falha usa `onGenerationFailed`).
   */
  onGenerationComplete?: (payload: {
    companyId: number;
    escopoTipo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    trimestre: string;
    geradoPorTipo: 'employee' | 'clevel' | 'superAdmin';
    geradoPorId: number;
    cacheId: number;
    pdfPath: string;
  }) => void;
  /**
   * Callback canonico de falha — handoff DOC 06 (§7.3 fase 5).
   * Motor invoca com codigo de falha; DOC 06 notifica via sino +
   * change log. NAO implementado nesta ME.
   */
  onGenerationFailed?: (payload: {
    companyId: number;
    escopoTipo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    trimestre: string;
    geradoPorTipo: 'employee' | 'clevel' | 'superAdmin';
    geradoPorId: number;
    codigoFalha: string;
  }) => void;
}

/** Factory canonica default — instancia todas as facades reais. */
export function createDefaultExecutiveReportAIDeps(db: RoipDatabase): ExecutiveReportAIDeps {
  return {
    db,
    claudeCallFacade: DEFAULT_CLAUDE_CALL_FACADE,
    pdfRendererFacade: DEFAULT_PDF_RENDERER_FACADE,
    storageFacade: DEFAULT_EXECUTIVE_REPORT_STORAGE,
    now: () => new Date(),
  };
}

// ============================================================
// Args + Outcome
// ============================================================

/** Argumentos canonicos de `generateExecutiveReport`. */
export interface GenerateExecutiveReportArgs extends BuildExecutiveReportArgs {
  geradoPorTipo: 'employee' | 'clevel' | 'superAdmin';
  geradoPorId: number;
  geradoPorUserType: 'super_admin' | 'employee' | 'clevel';
  /** Data local da empresa para o gate do apiUsageLog (S276 — resolvido no router). */
  dataUsoLocal: Date;
}

/** Union discriminada do outcome canonico. */
export type GenerateExecutiveReportOutcome =
  | {
      kind: 'ok';
      cacheId: number;
      pdfPath: string;
      filename: string;
    }
  | {
      kind: 'limit_reached';
      message: string;
      contadorAtual: number;
    }
  | {
      kind: 'failed_claude';
      status: Exclude<ClaudeCallStatus, 'sucesso'>;
      message: string;
      surface: ClaudeCallSurface;
    }
  | {
      kind: 'failed_render';
      message: string;
    };

// ============================================================
// Motor canonico
// ============================================================

/**
 * Gera o Relatorio executivo trimestral canonico para o escopo e
 * trimestre informados. Executa sincrono (o router pode decidir
 * enfileirar). Retorna outcome canonico.
 */
export async function generateExecutiveReport(
  deps: ExecutiveReportAIDeps,
  args: GenerateExecutiveReportArgs,
): Promise<GenerateExecutiveReportOutcome> {
  // Guard §7.3 fase 1: limite diario.
  const contadorAtual = await getApiUsageForDay(
    deps.db,
    args.companyId,
    'relatorio_executivo',
    args.dataUsoLocal,
  );
  if (contadorAtual >= EXEC_REPORT_LIMITE_DIARIO) {
    return {
      kind: 'limit_reached',
      message: MSG_EXEC_REPORT_LIMIT_REACHED,
      contadorAtual,
    };
  }

  // Fase 1 cont'd: payload deterministico.
  const payload: ExecutiveReportDeterministicoPayload = await buildExecutiveReportPayload(
    deps.db,
    args,
  );

  // Fase 2 §7.3: chamadas de bloco.
  const blocoOutcomes = await runBlocoCallsWithConcurrency(deps, args, payload);
  const failed = blocoOutcomes.find((o) => o.kind === 'failed');
  if (failed && failed.kind === 'failed') {
    reportFailure(deps, args, failed.surface);
    return {
      kind: 'failed_claude',
      status: failed.status,
      message: MSG_EXEC_REPORT_FALLBACK_SINO,
      surface: failed.surface,
    };
  }

  const paragrafos = extractParagrafos(blocoOutcomes);

  // Fase 3 §7.3: 6a chamada — sintese.
  const sinteseResult = await callSintese(deps, args, payload, paragrafos);
  if (!sinteseResult.ok) {
    reportFailure(deps, args, 'execReport_sintese');
    return {
      kind: 'failed_claude',
      status: sinteseResult.status,
      message: MSG_EXEC_REPORT_FALLBACK_SINO,
      surface: 'execReport_sintese',
    };
  }

  const resumoExecutivoGeral = sinteseResult.content;
  const geradoEmIso = deps.now().toISOString();
  const finalPayload: ExecutiveReportFinalPayload = {
    ...payload,
    paragrafoFinanceiro: paragrafos.financeiro,
    paragrafoDesempenho: paragrafos.desempenho,
    paragrafoPlenitude: paragrafos.plenitude,
    paragrafoClima: paragrafos.clima,
    paragrafoTurnover: paragrafos.turnover,
    resumoExecutivoGeral,
    geradoEmIso,
  };

  // Fase 4 §7.3: renderiza HTML + PDF.
  let pdfBytes: Uint8Array;
  try {
    const html = renderExecutiveReportHTML(finalPayload);
    pdfBytes = await deps.pdfRendererFacade.renderPdf(html);
  } catch (err) {
    reportFailure(deps, args, 'execReport_sintese');
    return {
      kind: 'failed_render',
      message: err instanceof Error ? err.message : 'Falha na renderizacao do PDF',
    };
  }

  // Fase 5 §7.3: grava PDF + UPSERT em cache.
  const pdfPath = await deps.storageFacade.writePdf({
    companyId: args.companyId,
    escopoTipo: args.escopo.tipo,
    escopoReferencia: args.escopo.referencia,
    trimestre: args.trimestre,
    bytes: pdfBytes,
  });
  const cacheId = await upsertExecutiveReportCache(deps.db, {
    companyId: args.companyId,
    escopoTipo: args.escopo.tipo,
    escopoReferencia: args.escopo.referencia,
    trimestre: args.trimestre,
    conteudoPdfUrl: pdfPath,
    geradoPorTipo: args.geradoPorTipo,
    geradoPorId: args.geradoPorId,
    geradoEm: deps.now(),
  });

  // Fase 6 §7.3: incrementa apiUsageLog.
  await incrementApiUsage(deps.db, args.companyId, 'relatorio_executivo', args.dataUsoLocal);

  // Fase 7-8 §7.3: handoff DOC 06 (opcional nesta ME).
  if (deps.onGenerationComplete) {
    try {
      deps.onGenerationComplete({
        companyId: args.companyId,
        escopoTipo: args.escopo.tipo,
        escopoReferencia: args.escopo.referencia,
        trimestre: args.trimestre,
        geradoPorTipo: args.geradoPorTipo,
        geradoPorId: args.geradoPorId,
        cacheId,
        pdfPath,
      });
    } catch {
      // Fire-and-forget canonico: falha do callback NAO reverte o
      // sucesso da geracao (handoff DOC 06 e assincrono por natureza).
    }
  }

  return {
    kind: 'ok',
    cacheId,
    pdfPath,
    filename: composeExecutiveReportFilename(
      args.razaoSocialSanitizada,
      args.trimestre,
      geradoEmIso,
    ),
  };
}

// ============================================================
// Helpers internos
// ============================================================

interface BlocoOutcomeOk {
  kind: 'ok';
  surface: ClaudeCallSurface;
  bloco: 'financeiro' | 'desempenho' | 'plenitude' | 'clima' | 'turnover';
  content: string;
}
interface BlocoOutcomeFailed {
  kind: 'failed';
  surface: ClaudeCallSurface;
  bloco: 'financeiro' | 'desempenho' | 'plenitude' | 'clima' | 'turnover';
  status: Exclude<ClaudeCallStatus, 'sucesso'>;
}
type BlocoOutcome = BlocoOutcomeOk | BlocoOutcomeFailed;

/**
 * Executa chamadas de bloco com concorrencia maxima 3 (§7.3.1). Clima
 * indisponivel usa paragrafo canonico curto sem chamar Claude.
 */
async function runBlocoCallsWithConcurrency(
  deps: ExecutiveReportAIDeps,
  args: GenerateExecutiveReportArgs,
  payload: ExecutiveReportDeterministicoPayload,
): Promise<BlocoOutcome[]> {
  const tasks: (() => Promise<BlocoOutcome>)[] = [];
  tasks.push(() =>
    callBloco(deps, args, {
      surface: 'execReport_financeiro',
      bloco: 'financeiro',
      pacote: payload.blocoFinanceiro,
      instrucao: INSTRUCAO_BLOCO_FINANCEIRO,
    }),
  );
  tasks.push(() =>
    callBloco(deps, args, {
      surface: 'execReport_desempenho',
      bloco: 'desempenho',
      pacote: payload.blocoDesempenho,
      instrucao: INSTRUCAO_BLOCO_GENERICA,
    }),
  );
  tasks.push(() =>
    callBloco(deps, args, {
      surface: 'execReport_plenitude',
      bloco: 'plenitude',
      pacote: payload.blocoPlenitude,
      instrucao: INSTRUCAO_BLOCO_GENERICA,
    }),
  );
  if (payload.blocoClima.disponivel) {
    tasks.push(() =>
      callBloco(deps, args, {
        surface: 'execReport_clima',
        bloco: 'clima',
        pacote: payload.blocoClima,
        instrucao: INSTRUCAO_BLOCO_CLIMA,
      }),
    );
  } else {
    // Bypass canonico §7.6: paragrafo curto pre-composto, sem chamada.
    tasks.push(() =>
      Promise.resolve<BlocoOutcomeOk>({
        kind: 'ok',
        surface: 'execReport_clima',
        bloco: 'clima',
        content: EXEC_REPORT_CLIMA_INDISPONIVEL_PARAGRAFO,
      }),
    );
  }
  if (payload.blocoTurnover !== null) {
    const turn = payload.blocoTurnover;
    tasks.push(() =>
      callBloco(deps, args, {
        surface: 'execReport_turnover',
        bloco: 'turnover',
        pacote: turn,
        instrucao: INSTRUCAO_BLOCO_TURNOVER,
      }),
    );
  }
  return await runWithConcurrencyLimit(tasks, EXEC_REPORT_MAX_CONCORRENCIA);
}

/**
 * Semaforo simples: dispara tarefas com concorrencia maxima. Se
 * qualquer tarefa lancar (nao deveria — as tarefas ja capturam erro
 * e devolvem Outcome), o erro sobe para o motor que ja tratou.
 */
async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= tasks.length) return;
      const task = tasks[idx];
      if (task) {
        results[idx] = await task();
      }
    }
  };
  const n = Math.min(limit, tasks.length);
  for (let i = 0; i < n; i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

async function callBloco(
  deps: ExecutiveReportAIDeps,
  args: GenerateExecutiveReportArgs,
  opts: {
    surface: ClaudeCallSurface;
    bloco: BlocoOutcomeOk['bloco'];
    pacote: unknown;
    instrucao: string;
  },
): Promise<BlocoOutcome> {
  const userPrompt = composeUserPromptBloco(opts.bloco, opts.pacote, opts.instrucao);
  const result: ClaudeCallResult = await deps.claudeCallFacade.claudeCall({
    systemPrompt: EXECUTIVE_REPORT_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: EXEC_REPORT_MAX_TOKENS_BLOCO,
    temperature: EXEC_REPORT_TEMPERATURE,
    jsonExpected: false,
    telemetry: {
      companyId: args.companyId,
      surface: opts.surface,
      userId: args.geradoPorId,
      userType: args.geradoPorUserType,
    },
    timeoutMs: EXEC_REPORT_TIMEOUT_MS,
  });
  if (!result.ok) {
    return {
      kind: 'failed',
      surface: opts.surface,
      bloco: opts.bloco,
      status: result.status,
    };
  }
  return {
    kind: 'ok',
    surface: opts.surface,
    bloco: opts.bloco,
    content: result.content,
  };
}

async function callSintese(
  deps: ExecutiveReportAIDeps,
  args: GenerateExecutiveReportArgs,
  payload: ExecutiveReportDeterministicoPayload,
  paragrafos: ExtractedParagrafos,
): Promise<
  { ok: true; content: string } | { ok: false; status: Exclude<ClaudeCallStatus, 'sucesso'> }
> {
  const pacoteSintese = buildPacoteSintese(payload, paragrafos);
  const userPrompt = composeUserPromptSintese(pacoteSintese);
  const result = await deps.claudeCallFacade.claudeCall({
    systemPrompt: EXECUTIVE_REPORT_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: EXEC_REPORT_MAX_TOKENS_SINTESE,
    temperature: EXEC_REPORT_TEMPERATURE,
    jsonExpected: false,
    telemetry: {
      companyId: args.companyId,
      surface: 'execReport_sintese',
      userId: args.geradoPorId,
      userType: args.geradoPorUserType,
    },
    timeoutMs: EXEC_REPORT_TIMEOUT_MS,
  });
  if (!result.ok) return { ok: false, status: result.status };
  return { ok: true, content: result.content };
}

interface ExtractedParagrafos {
  financeiro: string;
  desempenho: string;
  plenitude: string;
  clima: string;
  turnover: string | null;
}

function extractParagrafos(outcomes: BlocoOutcome[]): ExtractedParagrafos {
  const out: ExtractedParagrafos = {
    financeiro: '',
    desempenho: '',
    plenitude: '',
    clima: '',
    turnover: null,
  };
  for (const o of outcomes) {
    if (o.kind === 'ok') {
      if (o.bloco === 'financeiro') out.financeiro = o.content;
      else if (o.bloco === 'desempenho') out.desempenho = o.content;
      else if (o.bloco === 'plenitude') out.plenitude = o.content;
      else if (o.bloco === 'clima') out.clima = o.content;
      else if (o.bloco === 'turnover') out.turnover = o.content;
    }
  }
  return out;
}

// ============================================================
// Composicao canonica dos user prompts §8.5-§8.10
// ============================================================

function composeUserPromptBloco(
  bloco: BlocoOutcomeOk['bloco'],
  pacote: unknown,
  instrucao: string,
): string {
  const cabecalho = cabecalhoBloco(bloco);
  const json = JSON.stringify(pacote, null, 2);
  return `${cabecalho}\n\n${json}\n\n${instrucao}`;
}

function cabecalhoBloco(bloco: BlocoOutcomeOk['bloco']): string {
  switch (bloco) {
    case 'financeiro':
      return 'Pacote-bloco Financeiro do Relatório executivo trimestral.';
    case 'desempenho':
      return 'Pacote-bloco Desempenho do Relatório executivo trimestral.';
    case 'plenitude':
      return 'Pacote-bloco Plenitude do Relatório executivo trimestral.';
    case 'clima':
      return 'Pacote-bloco Clima do Relatório executivo trimestral.';
    case 'turnover':
      return 'Pacote-bloco Turnover do Relatório executivo trimestral.';
    default:
      return 'Pacote-bloco do Relatório executivo trimestral.';
  }
}

function composeUserPromptSintese(sintese: ExecReportPacoteSintese): string {
  const json = JSON.stringify(sintese, null, 2);
  const cabecalho =
    'Pacote-síntese do Relatório executivo trimestral. Este é o pacote final da geração — ' +
    'sintetize os blocos abaixo em um resumo executivo geral que abrirá o documento.';
  return `${cabecalho}\n\n${json}\n\n${INSTRUCAO_SINTESE}`;
}

function buildPacoteSintese(
  payload: ExecutiveReportDeterministicoPayload,
  paragrafos: ExtractedParagrafos,
): ExecReportPacoteSintese {
  return {
    escopo: {
      tipo: payload.escopo.tipo,
      referencia: payload.escopo.rotulo,
      trimestre: payload.trimestre,
    },
    resumosPorBloco: {
      financeiro: {
        roiAgregado: payload.blocoFinanceiro.trimestreAtual.roiAgregado,
        variacaoPercentualTrimestreAnterior:
          payload.blocoFinanceiro.comparativoTrimestreAnterior?.variacaoPercentualRoi ?? null,
        percMetaAtingidaAgregada: payload.blocoFinanceiro.trimestreAtual.percMetaAtingidaAgregada,
        paragrafoInterpretativo: paragrafos.financeiro,
      },
      desempenho: {
        scoreDesempenhoMedioAgregado:
          payload.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado,
        variacaoPercentual:
          payload.blocoDesempenho.comparativoTrimestreAnterior?.variacaoPercentual ?? null,
        paragrafoInterpretativo: paragrafos.desempenho,
      },
      plenitude: {
        plenitudeScoreMedioAgregado:
          payload.blocoPlenitude.trimestreAtual.plenitudeScoreMedioAgregado,
        percColaboradoresComAlertaDivergencia:
          payload.blocoPlenitude.trimestreAtual.percColaboradoresComAlertaDivergencia,
        paragrafoInterpretativo: paragrafos.plenitude,
      },
      clima: {
        notaClima: payload.blocoClima.trimestreAtual?.notaClima ?? null,
        adesao: payload.blocoClima.trimestreAtual?.adesao ?? null,
        disponivel: payload.blocoClima.disponivel,
        paragrafoInterpretativo: paragrafos.clima,
      },
      turnover: {
        turnoverTrimestralPercentual:
          payload.blocoTurnover?.trimestreAtual.turnoverTrimestralPercentual ?? null,
        turnoverAnualizadoPercentual:
          payload.blocoTurnover?.trimestreAtual.turnoverAnualizadoPercentual ?? null,
        disponivelParaEscopo: payload.blocoTurnover !== null,
        paragrafoInterpretativo: paragrafos.turnover,
      },
    },
  };
}

function reportFailure(
  deps: ExecutiveReportAIDeps,
  args: GenerateExecutiveReportArgs,
  surface: ClaudeCallSurface,
): void {
  if (deps.onGenerationFailed) {
    try {
      deps.onGenerationFailed({
        companyId: args.companyId,
        escopoTipo: args.escopo.tipo,
        escopoReferencia: args.escopo.referencia,
        trimestre: args.trimestre,
        geradoPorTipo: args.geradoPorTipo,
        geradoPorId: args.geradoPorId,
        codigoFalha: surface,
      });
    } catch {
      // Fire-and-forget canonico — falha do handoff nao interfere.
    }
  }
}
