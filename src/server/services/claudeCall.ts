// ROIP APP 9BOX — servico `claudeCall` (ME-050/51, S240-S243 + S258).
//
// Wrapper unico canonico para todas as chamadas a Claude API desta
// camada (DOC 04 §2 + §10). Consolida os padroes transversais:
// - modelo unico via `CLAUDE_MODEL` (S451 — §2.1).
// - retry canonico §2.2 (2x timeout/5xx com backoff 5s/15s; 1x JSON
//   invalido; 0x 4xx).
// - timeout via `AbortSignal.timeout()`.
// - telemetria canonica §2.6 / §10.5 (payload estruturado com UUID,
//   companyId, superficie, tokens, latencia, status, retentativas,
//   usuario) — no MVP loga estruturado; consumidor pode injetar
//   `onTelemetry` para persistir.
// - chave via `process.env.ANTHROPIC_API_KEY` (§10.6 — nunca commitada,
//   nunca logada, nunca exposta ao frontend).
// - orquestracao assincrona in-process: as duas chamadas do Perfil
//   Individual M2 (§3.4) rodam em paralelo via `Promise.all` no
//   consumidor; o wrapper e chamavel N vezes concorrentemente.
//
// Politica de retry (§2.2, S448):
// - Timeout / 5xx / erro de conexao: ate 2 novas tentativas com backoff
//   fixo 5s / 15s. Total ate 3 tentativas.
// - JSON invalido (quando `jsonExpected=true`): ate 1 nova tentativa
//   com o mesmo prompt. Total ate 2 tentativas.
// - 4xx: sem retentativa. Falha imediata.
//
// Facade DI canonica (S258 + S205):
// - `ClaudeCallFacade` — interface injetavel para consumidores tRPC.
// - `DEFAULT_CLAUDE_CALL_FACADE` — implementacao real que chama a API
//   via `fetch` global (Node 20+ built-in — sem SDK; consistente com o
//   minimalismo de dependencias do projeto).
// - Testes de integracao substituem o Facade por stub deterministico —
//   `claudeCall` real e exercitado apenas pelo unit deste modulo.
//
// Escopo desta ME: consumido apenas pelo motor IA do Perfil Individual
// (`individualProfileAI.ts`). O Perfil Individual NAO consome
// `apiUsageLog` (§2.3) — o wrapper nao faz UPSERT em `apiUsageLog`;
// isso e responsabilidade do consumidor Relatorio executivo trimestral
// (ME-053).

import { randomUUID } from 'node:crypto';

/**
 * Modelo canonico unico (S451 — §2.1). Fallback para
 * `claude-sonnet-4-6` se `CLAUDE_MODEL` estiver ausente do env — a
 * constante canonica cobre o cenario de deploy que esquece de
 * configurar. O `.env.example` documenta o valor canonico.
 */
export const CLAUDE_MODEL_DEFAULT = 'claude-sonnet-4-6';

/** Timeout canonico por chamada (§3.7 e §7.7). Em milissegundos. */
export const CLAUDE_CALL_DEFAULT_TIMEOUT_MS = 60_000;

/** Backoff canonico entre retentativas (§2.2). Em milissegundos. */
export const CLAUDE_CALL_RETRY_BACKOFF_MS = [5_000, 15_000] as const;

/**
 * Superficies canonicas de origem da chamada (§2.6 — 13 valores
 * canonicos + reserva). Union fechado — expandido conforme novas MEs
 * (ME-052 acrescenta os 4 escopos do Chat IA; ME-053 acrescenta os 6
 * escopos do Relatorio executivo).
 */
export type ClaudeCallSurface =
  | 'individualProfile_resumo'
  | 'individualProfile_expandido'
  // Reservadas — habilitadas em MEs futuras:
  | 'aiChat_global'
  | 'aiChat_departamento'
  | 'aiChat_equipe'
  | 'aiChat_individual'
  | 'dashboardDiagnostico'
  | 'execReport_financeiro'
  | 'execReport_desempenho'
  | 'execReport_plenitude'
  | 'execReport_clima'
  | 'execReport_turnover'
  | 'execReport_sintese';

/**
 * Payload de contexto para a telemetria canonica (§2.6 / §10.5). O
 * wrapper acrescenta os campos operacionais (UUID, timestamps,
 * latencia, tokens, status, retries).
 */
export interface ClaudeCallTelemetryContext {
  companyId: number;
  surface: ClaudeCallSurface;
  userId: number;
  userType: 'super_admin' | 'employee' | 'clevel';
}

/** Opcoes canonicas de uma chamada. */
export interface ClaudeCallOpts {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  /**
   * Quando `true`, o wrapper tenta `JSON.parse` do texto de resposta;
   * falha de parse dispara UMA nova tentativa (§2.2). Quando `false`,
   * o texto e devolvido como esta — sem parsing, sem retry por
   * conteudo (§2.2 texto plano).
   */
  jsonExpected: boolean;
  /** Contexto de telemetria (§2.6). Obrigatorio para rastreabilidade. */
  telemetry: ClaudeCallTelemetryContext;
  /** Timeout canonico do §3.7 (60s). Override so em cenarios calibrados. */
  timeoutMs?: number;
}

/** Status canonico final da chamada (§2.6 — 5 valores canonicos). */
export type ClaudeCallStatus =
  'sucesso' | 'falha_timeout' | 'falha_4xx' | 'falha_5xx' | 'falha_json';

/** Registro canonico de telemetria (§2.6). */
export interface ClaudeCallTelemetryRecord {
  callId: string;
  companyId: number;
  surface: ClaudeCallSurface;
  model: string;
  startedAt: Date;
  finishedAt: Date;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  status: ClaudeCallStatus;
  retriesEffective: number;
  userId: number;
  userType: 'super_admin' | 'employee' | 'clevel';
}

/** Resultado canonico. Union discriminada por `ok`. */
export type ClaudeCallResult =
  | {
      ok: true;
      /** Texto bruto retornado pela API. */
      content: string;
      /** JSON parseado — presente sse `jsonExpected=true`. */
      parsedJson: unknown;
      telemetry: ClaudeCallTelemetryRecord;
    }
  | {
      ok: false;
      status: Exclude<ClaudeCallStatus, 'sucesso'>;
      /** Mensagem para telemetria — nunca exposta ao usuario final (§11). */
      message: string;
      telemetry: ClaudeCallTelemetryRecord;
    };

/**
 * Dependencias injetaveis do `claudeCall` — usadas exclusivamente pelo
 * unit deste modulo. Consumidores tRPC injetam o `ClaudeCallFacade`,
 * nao chamam esta funcao diretamente com deps.
 */
export interface ClaudeCallDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  apiKeyResolver?: () => string;
  modelResolver?: () => string;
  onTelemetry?: (record: ClaudeCallTelemetryRecord) => void;
  callIdGenerator?: () => string;
}

/**
 * Facade DI canonica (S258). Consumidores tRPC recebem esta interface
 * e chamam `claudeCall` atraves dela; testes substituem a
 * implementacao por stub deterministico.
 */
export interface ClaudeCallFacade {
  claudeCall: (opts: ClaudeCallOpts) => Promise<ClaudeCallResult>;
}

// ============================================================
// Helpers internos
// ============================================================

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function defaultApiKeyResolver(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.length === 0) {
    throw new Error('ANTHROPIC_API_KEY ausente no ambiente — configure .env');
  }
  return key;
}

function defaultModelResolver(): string {
  const model = process.env.CLAUDE_MODEL;
  return model && model.length > 0 ? model : CLAUDE_MODEL_DEFAULT;
}

function defaultOnTelemetry(record: ClaudeCallTelemetryRecord): void {
  // §22.3: telemetria e log operacional interno — MVP faz JSON em
  // stdout; consumidor pode injetar handler para persistir. Nunca expor
  // ao frontend (§10.6). Nunca inclui `ANTHROPIC_API_KEY` no payload —
  // este registro nao carrega credenciais.
  console.info(`[claudeCall.telemetry] ${JSON.stringify(record)}`);
}

interface ClaudeApiResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface AttemptOutcome {
  kind: 'ok';
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

interface AttemptFailure {
  kind: 'timeout' | 'client_error' | 'server_error' | 'network_error';
  httpStatus?: number;
  message: string;
}

/**
 * Executa UMA tentativa HTTP contra a API. Devolve outcome
 * discriminado — sem retry, sem sleep. Timeout via `AbortSignal`.
 */
async function performAttempt(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  opts: ClaudeCallOpts,
  timeoutMs: number,
): Promise<AttemptOutcome | AttemptFailure> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: opts.userPrompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      return { kind: 'timeout', message: `Timeout apos ${timeoutMs}ms` };
    }
    return { kind: 'network_error', message: (err as Error).message };
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (response.status >= 500) {
    return {
      kind: 'server_error',
      httpStatus: response.status,
      message: `HTTP ${response.status} do upstream`,
    };
  }
  if (response.status >= 400) {
    return {
      kind: 'client_error',
      httpStatus: response.status,
      message: `HTTP ${response.status} do upstream`,
    };
  }

  let json: ClaudeApiResponse;
  try {
    json = (await response.json()) as ClaudeApiResponse;
  } catch (err) {
    return { kind: 'server_error', message: `Resposta 200 nao-JSON: ${(err as Error).message}` };
  }

  const content = json.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');

  return {
    kind: 'ok',
    content,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
  };
}

// ============================================================
// Funcao principal — implementacao do wrapper
// ============================================================

/**
 * Executa a chamada canonica a Claude API com retry, timeout e
 * telemetria. Nunca lanca — devolve `{ ok: false, ... }` em qualquer
 * caminho de falha.
 */
export async function claudeCall(
  opts: ClaudeCallOpts,
  deps: ClaudeCallDeps = {},
): Promise<ClaudeCallResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? ((): Date => new Date());
  const apiKeyResolver = deps.apiKeyResolver ?? defaultApiKeyResolver;
  const modelResolver = deps.modelResolver ?? defaultModelResolver;
  const onTelemetry = deps.onTelemetry ?? defaultOnTelemetry;
  const callIdGenerator = deps.callIdGenerator ?? ((): string => randomUUID());

  const timeoutMs = opts.timeoutMs ?? CLAUDE_CALL_DEFAULT_TIMEOUT_MS;
  const callId = callIdGenerator();
  const model = modelResolver();
  const startedAt = now();

  const apiKey = apiKeyResolver();

  // Politica canonica §2.2 (S448):
  // - HTTP 5xx / timeout / network: 3 tentativas totais (2 retries).
  // - JSON invalido (jsonExpected=true): 2 tentativas totais (1 retry
  //   por conteudo), independentes dos retries de transporte.
  // - 4xx: 1 tentativa, sem retry.
  const MAX_TRANSPORT_ATTEMPTS = 3;
  const MAX_JSON_ATTEMPTS = opts.jsonExpected ? 2 : 1;

  let attemptsUsed = 0;
  let jsonAttemptsUsed = 0;
  let lastFailure: {
    status: Exclude<ClaudeCallStatus, 'sucesso'>;
    message: string;
  } = { status: 'falha_timeout', message: 'nenhuma tentativa executada' };

  // Laco externo: retentativa por JSON invalido.
  while (jsonAttemptsUsed < MAX_JSON_ATTEMPTS) {
    let outcome: AttemptOutcome | AttemptFailure | null = null;

    // Laco interno: retentativas de transporte (timeout / 5xx / net).
    // Cada iteracao consome UMA tentativa do orcamento MAX_TRANSPORT_ATTEMPTS.
    let transportAttemptsThisRound = 0;
    while (transportAttemptsThisRound < MAX_TRANSPORT_ATTEMPTS) {
      attemptsUsed += 1;
      transportAttemptsThisRound += 1;

      outcome = await performAttempt(fetchImpl, apiKey, model, opts, timeoutMs);

      if (outcome.kind === 'ok') {
        break;
      }
      if (outcome.kind === 'client_error') {
        // 4xx nao retenta — falha imediata (§2.2).
        lastFailure = { status: 'falha_4xx', message: outcome.message };
        return finishFailure();
      }

      // 5xx / timeout / network: retenta com backoff (5s / 15s), se
      // ainda restam tentativas de transporte neste round. Como
      // `MAX_TRANSPORT_ATTEMPTS = 3`, `transportAttemptsThisRound - 1`
      // e sempre 0 ou 1 aqui — dentro dos limites do array canonico.
      if (transportAttemptsThisRound < MAX_TRANSPORT_ATTEMPTS) {
        const backoffIdx = transportAttemptsThisRound - 1;
        const backoffMs =
          CLAUDE_CALL_RETRY_BACKOFF_MS[backoffIdx] ?? CLAUDE_CALL_RETRY_BACKOFF_MS[0];
        await sleep(backoffMs);
        continue;
      }
      // Esgotou tentativas de transporte neste round.
      lastFailure =
        outcome.kind === 'timeout'
          ? { status: 'falha_timeout', message: outcome.message }
          : { status: 'falha_5xx', message: outcome.message };
    }

    // outcome nunca fica null aqui: o laco de transporte sempre
    // executa ao menos uma vez.
    if (!outcome || outcome.kind !== 'ok') {
      return finishFailure();
    }

    // Sucesso de transporte. Se JSON esperado, tenta parse.
    if (!opts.jsonExpected) {
      return finishSuccess(outcome.content, undefined, outcome.usage);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(outcome.content);
      return finishSuccess(outcome.content, parsed, outcome.usage);
    } catch (err) {
      jsonAttemptsUsed += 1;
      lastFailure = {
        status: 'falha_json',
        message: `JSON invalido: ${(err as Error).message}`,
      };
      if (jsonAttemptsUsed >= MAX_JSON_ATTEMPTS) {
        return finishFailure();
      }
      // Retry por JSON invalido: mesmo prompt, novo round de transporte.
      continue;
    }
  }

  return finishFailure();

  function buildTelemetry(
    status: ClaudeCallStatus,
    usage?: { inputTokens: number; outputTokens: number },
  ): ClaudeCallTelemetryRecord {
    const finishedAt = now();
    return {
      callId,
      companyId: opts.telemetry.companyId,
      surface: opts.telemetry.surface,
      model,
      startedAt,
      finishedAt,
      latencyMs: finishedAt.getTime() - startedAt.getTime(),
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      status,
      retriesEffective: attemptsUsed - 1,
      userId: opts.telemetry.userId,
      userType: opts.telemetry.userType,
    };
  }

  function finishSuccess(
    content: string,
    parsedJson: unknown,
    usage: { inputTokens: number; outputTokens: number },
  ): ClaudeCallResult {
    const record = buildTelemetry('sucesso', usage);
    onTelemetry(record);
    return { ok: true, content, parsedJson, telemetry: record };
  }

  function finishFailure(): ClaudeCallResult {
    const record = buildTelemetry(lastFailure.status);
    onTelemetry(record);
    return {
      ok: false,
      status: lastFailure.status,
      message: lastFailure.message,
      telemetry: record,
    };
  }
}

/**
 * Implementacao canonica default da Facade (S258). Consumidores tRPC
 * usam esta constante como valor default do parametro DI; testes
 * substituem por stub deterministico.
 */
export const DEFAULT_CLAUDE_CALL_FACADE: ClaudeCallFacade = {
  claudeCall: (opts: ClaudeCallOpts): Promise<ClaudeCallResult> => claudeCall(opts),
};
