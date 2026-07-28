// ROIP APP 9BOX — motor `diagnosticoIAService` (ME-052, S267).
//
// Motor canonico do Diagnostico IA (DOC 04 §6). Superficie canonica
// unica: dashboard individual (§6.1). Reusa integralmente a
// composicao de contexto do Chat IA individual (§6.2 canoniza a
// identidade). Instrucao final canonica variante conforme presenca
// do bloco financeiro (§6.3 — S454).
//
// Regime canonico:
//   - Geracao restrita ao trimestre atual (§6.6). Trimestres
//     anteriores retornam outcome `not_current_quarter`.
//   - Sem versionamento (§6.5): sobrescrita direta via UPDATE.
//   - Sem consumo de `apiUsageLog` (§6.1 + §2.3).
//   - Telemetria canonica §2.6 via `onTelemetry` do `claudeCall`.
//
// Politica de falha canonica (§11.3):
//   - `performanceQuarterlyData.diagnosticoIA` permanece no estado
//     anterior (NULL se nunca gerado; texto cacheado se atualizacao
//     falhou).
//   - `diagnosticoIAgeradoEm` nao e atualizado.
//   - Frontend exibe mensagem canonica exata §11.3.
//
// Chamador canonico: `dashboard.generateDiagnostico` (router
// `dashboard`, EDIT S266).
// Testes: `tests/unit/diagnosticoIAService.test.ts` +
// `tests/integration/dashboard-router-diagnostico.test.ts`.

import type { RoipDatabase } from '../../db/client';
import {
  DEFAULT_CLAUDE_CALL_FACADE,
  type ClaudeCallFacade,
  type ClaudeCallResult,
  type ClaudeCallStatus,
} from './claudeCall';
import {
  DIAGNOSTICO_IA_INSTRUCAO_COM_FINANCEIRO,
  DIAGNOSTICO_IA_INSTRUCAO_SEM_FINANCEIRO,
  DIAGNOSTICO_IA_SYSTEM_PROMPT,
} from './diagnosticoIASystemPrompt';
import {
  getPerformanceQuarterlyDataByQuarter,
  updatePerformanceQuarterlyDiagnosticoIA,
} from './performanceQuarterlyData';
import type {
  ChatIaUserType,
  DashboardIndividualContextArgs,
  DashboardIndividualContextPayload,
} from './_shared/dashboardContextTypes';
import { loadDashboardIndividualContext } from './_shared/dashboardIndividualContext';

// ============================================================
// Constantes canonicas (§6.4)
// ============================================================

/**
 * `max_tokens` canonico §6.4. Folga sobre extensao esperada — 3 a 5
 * paragrafos aproximadamente 1200-1500 tokens; teto 2000.
 */
export const DIAGNOSTICO_IA_MAX_TOKENS = 2_000;

/**
 * `temperature` canonica §6.4. Interpretacao estavel com pequena
 * variabilidade textual entre geracoes do mesmo trimestre.
 */
export const DIAGNOSTICO_IA_TEMPERATURE = 0.4;

/**
 * Timeout canonico da chamada §6.4. 45 segundos. Override do default
 * de 60s do wrapper.
 */
export const DIAGNOSTICO_IA_TIMEOUT_MS = 45_000;

/**
 * Mensagem canonica exata de fallback §11.3 do DOC 04. Exportada
 * como constante para assercao literal em testes (S206).
 */
export const MSG_DIAGNOSTICO_IA_FALLBACK =
  'Não foi possível gerar o diagnóstico agora. Tente novamente em alguns instantes.';

/**
 * Mensagem canonica exata de guard "trimestre nao e atual" (§6.6).
 * Nao esta em §11 canonicamente — canonizada aqui como constante
 * para consistencia S206.
 */
export const MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER =
  // eslint-disable-next-line @stylistic/max-len -- mensagem canonica literal §6.6
  'Somente o trimestre atual permite geracao ou atualizacao do diagnostico. Trimestres anteriores sao read-only.';

/**
 * Mensagem canonica exata de guard "colaborador nao encontrado ou
 * sem dados do trimestre".
 */
export const MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO =
  'Colaborador nao encontrado ou sem dados calculados para o trimestre.';

// ============================================================
// Composicao canonica do user prompt (§8.4 + §6.3)
// ============================================================

/**
 * Compoe o user prompt canonico do Diagnostico IA. Estrutura §8.4:
 * texto identico ao Chat IA individual (§8.3.1) + instrucao final §6.3
 * variante conforme presenca de `financeiro` no payload.
 */
export function composeDiagnosticoIAUserPrompt(payload: DashboardIndividualContextPayload): string {
  const preamble =
    // eslint-disable-next-line @stylistic/max-len -- preambulo canonico literal §8.4
    'Contexto do dashboard individual do colaborador para o qual voce esta gerando um diagnostico executivo do trimestre. Todos os dados abaixo foram calculados pelos motores deterministicos do backend. Voce interpreta.';
  const instrucao =
    payload.financeiro === null
      ? DIAGNOSTICO_IA_INSTRUCAO_SEM_FINANCEIRO
      : DIAGNOSTICO_IA_INSTRUCAO_COM_FINANCEIRO;
  return `${preamble}\n\n${JSON.stringify(payload, null, 2)}\n\n${instrucao}`;
}

// ============================================================
// Facade DI canonica (S205/S258)
// ============================================================

/**
 * Dependencias injetaveis do motor Diagnostico IA. Loader de contexto
 * e substituivel em teste unit; `claudeCallFacade` substituido por
 * stub em teste de integracao.
 */
export interface DiagnosticoIAServiceDeps {
  db: RoipDatabase;
  claudeCallFacade: ClaudeCallFacade;
  loadIndividualContext: (
    db: RoipDatabase,
    args: DashboardIndividualContextArgs,
  ) => Promise<DashboardIndividualContextPayload | null>;
  now: () => Date;
}

/** Factory canonica com defaults reais. */
export function createDefaultDiagnosticoIAServiceDeps(db: RoipDatabase): DiagnosticoIAServiceDeps {
  return {
    db,
    claudeCallFacade: DEFAULT_CLAUDE_CALL_FACADE,
    loadIndividualContext: loadDashboardIndividualContext,
    now: () => new Date(),
  };
}

// ============================================================
// Argumentos canonicos e outcome de `generateDiagnosticoIA`
// ============================================================

/**
 * Argumentos canonicos de `generateDiagnosticoIA`. `trimestreSolicitado`
 * e o trimestre alvo YYYY-QN informado no input do router. `trimestreAtual`
 * e o trimestre canonico atual da empresa — passado pelo router (que
 * consulta via motor de ciclo canonico).
 */
export interface GenerateDiagnosticoIAArgs {
  companyId: number;
  employeeId: number;
  trimestreSolicitado: string;
  trimestreAtual: string;
  viewerRole: 'super_admin' | 'rh' | 'rh_lider' | 'clevel' | 'lider';
  viewerUserId: number;
  viewerUserType: ChatIaUserType;
}

/** Union discriminado do outcome canonico. */
export type GenerateDiagnosticoIAOutcome =
  | {
      kind: 'ok';
      diagnostico: string;
      diagnosticoIAgeradoEm: Date;
      /** Metadados de telemetria propagados do `claudeCall`. */
      telemetryCallId: string;
      /** Numero de linhas afetadas pelo UPDATE canonico. */
      affectedRows: number;
    }
  | {
      kind: 'not_current_quarter';
      message: string;
    }
  | {
      kind: 'quarterly_data_not_found';
      message: string;
    }
  | {
      kind: 'context_not_found';
      message: string;
    }
  | {
      kind: 'failed_claude';
      status: Exclude<ClaudeCallStatus, 'sucesso'>;
      message: string;
    };

// ============================================================
// Motor canonico
// ============================================================

/**
 * Gera (ou atualiza) o Diagnostico IA para o colaborador no trimestre
 * atual. Fluxo canonico:
 *   1. Guard §6.6: `trimestreSolicitado !== trimestreAtual` →
 *      outcome `not_current_quarter`.
 *   2. Localiza a linha canonica de `performanceQuarterlyData` para
 *      (companyId, employeeId, trimestre). Ausencia = outcome
 *      `quarterly_data_not_found` (nao ha o que diagnosticar).
 *   3. Recompoe contexto do dashboard individual (§6.2 canoniza a
 *      identidade com o Chat IA individual). Ausencia = outcome
 *      `context_not_found`.
 *   4. Compoe user prompt §8.4 com instrucao §6.3 variante.
 *   5. Chama Claude API. Falha = outcome `failed_claude`; cache
 *      preservado (§11.3).
 *   6. Sucesso: UPDATE atomico canonico em
 *      `performanceQuarterlyData.diagnosticoIA` +
 *      `.diagnosticoIAgeradoEm`.
 */
export async function generateDiagnosticoIA(
  deps: DiagnosticoIAServiceDeps,
  args: GenerateDiagnosticoIAArgs,
): Promise<GenerateDiagnosticoIAOutcome> {
  // 1. Guard §6.6 — canonicamente restrita ao trimestre atual.
  if (args.trimestreSolicitado !== args.trimestreAtual) {
    return {
      kind: 'not_current_quarter',
      message: MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER,
    };
  }

  // 2. Localiza a linha canonica de performanceQuarterlyData.
  const quarterlyRow = await getPerformanceQuarterlyDataByQuarter(
    deps.db,
    args.companyId,
    args.employeeId,
    args.trimestreSolicitado,
  );
  if (!quarterlyRow) {
    return {
      kind: 'quarterly_data_not_found',
      message: MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO,
    };
  }

  // 3. Recompoe contexto identico ao Chat IA individual (§6.2).
  const contextPayload = await deps.loadIndividualContext(deps.db, {
    companyId: args.companyId,
    employeeId: args.employeeId,
    viewerRole: args.viewerRole,
    viewerUserId: args.viewerUserId,
    viewerUserType: args.viewerUserType,
  });
  if (contextPayload === null) {
    return {
      kind: 'context_not_found',
      message: MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO,
    };
  }

  // 4. Compoe user prompt canonico §8.4.
  const userPrompt = composeDiagnosticoIAUserPrompt(contextPayload);

  // 5. Chama Claude API. Texto plano (jsonExpected = false).
  const result: ClaudeCallResult = await deps.claudeCallFacade.claudeCall({
    systemPrompt: DIAGNOSTICO_IA_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: DIAGNOSTICO_IA_MAX_TOKENS,
    temperature: DIAGNOSTICO_IA_TEMPERATURE,
    jsonExpected: false,
    telemetry: {
      companyId: args.companyId,
      surface: 'dashboardDiagnostico',
      userId: args.viewerUserId,
      userType: args.viewerUserType,
    },
    timeoutMs: DIAGNOSTICO_IA_TIMEOUT_MS,
  });

  // 6. Falha canonica §11.3 — cache preservado.
  if (!result.ok) {
    return {
      kind: 'failed_claude',
      status: result.status,
      message: MSG_DIAGNOSTICO_IA_FALLBACK,
    };
  }

  // 7. Persiste via setter canonico. UPDATE atomico sobre a linha do
  //    trimestre atual.
  const generatedAt = deps.now();
  const affectedRows = await updatePerformanceQuarterlyDiagnosticoIA(deps.db, quarterlyRow.id, {
    diagnosticoIA: result.content,
    diagnosticoIAgeradoEm: generatedAt,
  });

  return {
    kind: 'ok',
    diagnostico: result.content,
    diagnosticoIAgeradoEm: generatedAt,
    telemetryCallId: result.telemetry.callId,
    affectedRows,
  };
}
