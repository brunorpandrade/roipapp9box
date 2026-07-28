// ROIP APP 9BOX — teste unitario `services/claudeCall` (ME-050/51,
// S240-S243). Puramente algoritmico: `fetch` e `sleep` injetados
// (nenhum I/O real, nenhum sleep real). RV-08 — veredito unit
// pre-decidido.
//
// Cobre a politica canonica de retry §2.2 (S448):
// - Sucesso no primeiro shot (transporte + parse JSON).
// - Sucesso apos 2 falhas 5xx (3 tentativas totais, backoff 5s + 15s).
// - Falha 5xx apos 3 tentativas — status `falha_5xx`.
// - Falha 4xx sem retry — status `falha_4xx`.
// - Timeout via AbortError com retentativa canonica.
// - JSON invalido com retry sucessivo (2 tentativas totais).
// - JSON invalido em ambas as tentativas — status `falha_json`.
// - Payload de telemetria completo (§2.6).
// - `ANTHROPIC_API_KEY` ausente -> throw explicito (falha de configuracao).
// - Fallback do modelo canonico via `CLAUDE_MODEL` (S451).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CLAUDE_CALL_DEFAULT_TIMEOUT_MS,
  CLAUDE_CALL_RETRY_BACKOFF_MS,
  CLAUDE_MODEL_DEFAULT,
  claudeCall,
  type ClaudeCallDeps,
  type ClaudeCallOpts,
  type ClaudeCallTelemetryRecord,
} from '../../src/server/services/claudeCall';

const CANON_OPTS: ClaudeCallOpts = {
  systemPrompt: 'system canonico do Perfil Individual',
  userPrompt: '{"identificacao": {"nome": "Fulano"}}',
  maxTokens: 8000,
  temperature: 0.3,
  jsonExpected: true,
  telemetry: {
    companyId: 7,
    surface: 'individualProfile_resumo',
    userId: 900,
    userType: 'super_admin',
  },
};

const BASE_TIME_MS = Date.UTC(2026, 7, 15, 10, 0, 0);

function fakeResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeApiOkBody(text: string): {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
} {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

interface TestHarness {
  fetchImpl: ReturnType<typeof vi.fn>;
  sleep: ReturnType<typeof vi.fn>;
  onTelemetry: ReturnType<typeof vi.fn>;
  now: ReturnType<typeof vi.fn>;
  deps: ClaudeCallDeps;
  telemetryRecords: ClaudeCallTelemetryRecord[];
}

function makeHarness(): TestHarness {
  const telemetryRecords: ClaudeCallTelemetryRecord[] = [];
  const fetchImpl = vi.fn();
  const sleep = vi.fn().mockResolvedValue(undefined);
  const onTelemetry = vi.fn().mockImplementation((r: ClaudeCallTelemetryRecord) => {
    telemetryRecords.push(r);
  });
  // Relogio deterministico: cada chamada incrementa 100ms.
  let nowCursor = BASE_TIME_MS;
  const now = vi.fn().mockImplementation(() => {
    const d = new Date(nowCursor);
    nowCursor += 100;
    return d;
  });
  const deps: ClaudeCallDeps = {
    fetchImpl,
    sleep,
    onTelemetry,
    now,
    apiKeyResolver: () => 'sk-ant-test-key',
    modelResolver: () => CLAUDE_MODEL_DEFAULT,
    callIdGenerator: () => '00000000-0000-4000-8000-000000000042',
  };
  return { fetchImpl, sleep, onTelemetry, now, deps, telemetryRecords };
}

describe('services/claudeCall (ME-050/51)', () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    process.env.CLAUDE_MODEL = CLAUDE_MODEL_DEFAULT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caminho feliz — sucesso no primeiro shot com JSON parseado', async () => {
    const h = makeHarness();
    const canonicalJson = {
      sintese_executiva: 'ok',
      recomendacoes_executivas: [],
      confiabilidade: 'alta',
    };
    h.fetchImpl.mockResolvedValueOnce(
      fakeResponse(200, makeApiOkBody(JSON.stringify(canonicalJson))),
    );

    const result = await claudeCall(CANON_OPTS, h.deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(JSON.stringify(canonicalJson));
    expect(result.parsedJson).toEqual(canonicalJson);
    expect(result.telemetry.status).toBe('sucesso');
    expect(result.telemetry.retriesEffective).toBe(0);
    expect(result.telemetry.inputTokens).toBe(100);
    expect(result.telemetry.outputTokens).toBe(50);
    expect(result.telemetry.callId).toBe('00000000-0000-4000-8000-000000000042');
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.sleep).not.toHaveBeenCalled();
    expect(h.onTelemetry).toHaveBeenCalledTimes(1);
  });

  it('caminho feliz — jsonExpected=false devolve texto sem parse', async () => {
    const h = makeHarness();
    h.fetchImpl.mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('parágrafo canônico livre')));
    const result = await claudeCall({ ...CANON_OPTS, jsonExpected: false }, h.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe('parágrafo canônico livre');
    expect(result.parsedJson).toBeUndefined();
  });

  it('retry canonico — 500,500,200 com backoff 5s + 15s (S448)', async () => {
    const h = makeHarness();
    h.fetchImpl
      .mockResolvedValueOnce(fakeResponse(500, { error: 'x' }))
      .mockResolvedValueOnce(fakeResponse(502, { error: 'y' }))
      .mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{"ok":true}')));

    const result = await claudeCall(CANON_OPTS, h.deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.telemetry.status).toBe('sucesso');
    expect(result.telemetry.retriesEffective).toBe(2);
    expect(h.fetchImpl).toHaveBeenCalledTimes(3);
    expect(h.sleep).toHaveBeenCalledTimes(2);
    expect(h.sleep).toHaveBeenNthCalledWith(1, CLAUDE_CALL_RETRY_BACKOFF_MS[0]);
    expect(h.sleep).toHaveBeenNthCalledWith(2, CLAUDE_CALL_RETRY_BACKOFF_MS[1]);
  });

  it('falha_5xx — 3x 500 esgota o orcamento canonico (§2.2)', async () => {
    const h = makeHarness();
    h.fetchImpl
      .mockResolvedValueOnce(fakeResponse(500, {}))
      .mockResolvedValueOnce(fakeResponse(500, {}))
      .mockResolvedValueOnce(fakeResponse(500, {}));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe('falha_5xx');
    expect(result.telemetry.retriesEffective).toBe(2);
    expect(h.fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('falha_4xx — 429 sem retry canonico (§2.2)', async () => {
    const h = makeHarness();
    h.fetchImpl.mockResolvedValueOnce(fakeResponse(429, { error: 'rate limit' }));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe('falha_4xx');
    expect(result.telemetry.retriesEffective).toBe(0);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.sleep).not.toHaveBeenCalled();
  });

  it('falha_4xx — 401 sem retry canonico', async () => {
    const h = makeHarness();
    h.fetchImpl.mockResolvedValueOnce(fakeResponse(401, { error: 'auth' }));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe('falha_4xx');
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falha_timeout — AbortError com backoff e retentativas', async () => {
    const h = makeHarness();
    // Simula AbortError em todas as 3 tentativas.
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    h.fetchImpl.mockRejectedValue(abortErr);
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe('falha_timeout');
    expect(h.fetchImpl).toHaveBeenCalledTimes(3);
    expect(h.sleep).toHaveBeenCalledTimes(2);
  });

  it('falha_json — JSON invalido em ambas as tentativas (§2.2)', async () => {
    const h = makeHarness();
    h.fetchImpl
      .mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{ nao e json valido')))
      .mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('nem esse tambem')));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe('falha_json');
    // 2 tentativas de conteudo * 1 tentativa de transporte cada.
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retry por JSON invalido — 1a falha JSON, 2a sucesso JSON', async () => {
    const h = makeHarness();
    h.fetchImpl
      .mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{ ainda quebrado')))
      .mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{"ok":true}')));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsedJson).toEqual({ ok: true });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rede — erro de conexao retenta como 5xx', async () => {
    const h = makeHarness();
    const netErr = new Error('ECONNRESET');
    netErr.name = 'FetchError';
    h.fetchImpl
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{"ok":1}')));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.telemetry.retriesEffective).toBe(2);
    expect(h.fetchImpl).toHaveBeenCalledTimes(3);
    expect(h.sleep).toHaveBeenCalledTimes(2);
  });

  it('telemetria — payload completo com todos os campos canonicos (§2.6)', async () => {
    const h = makeHarness();
    h.fetchImpl.mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{"ok":true}')));
    const result = await claudeCall(CANON_OPTS, h.deps);
    expect(result.ok).toBe(true);
    const rec = h.telemetryRecords[0];
    expect(rec).toBeDefined();
    if (!rec) return;
    expect(rec.callId).toBe('00000000-0000-4000-8000-000000000042');
    expect(rec.companyId).toBe(7);
    expect(rec.surface).toBe('individualProfile_resumo');
    expect(rec.model).toBe(CLAUDE_MODEL_DEFAULT);
    expect(rec.userId).toBe(900);
    expect(rec.userType).toBe('super_admin');
    expect(rec.status).toBe('sucesso');
    expect(rec.inputTokens).toBe(100);
    expect(rec.outputTokens).toBe(50);
    expect(rec.retriesEffective).toBe(0);
    expect(rec.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('config — envia model, max_tokens, temperature, system, messages canonicos', async () => {
    const h = makeHarness();
    h.fetchImpl.mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{"ok":true}')));
    await claudeCall(CANON_OPTS, h.deps);
    const call = h.fetchImpl.mock.calls[0];
    if (!call) throw new Error('fetch nunca chamado');
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(CLAUDE_MODEL_DEFAULT);
    expect(body.max_tokens).toBe(8000);
    expect(body.temperature).toBe(0.3);
    expect(body.system).toBe(CANON_OPTS.systemPrompt);
    expect(body.messages).toEqual([{ role: 'user', content: CANON_OPTS.userPrompt }]);
  });

  it('ANTHROPIC_API_KEY ausente -> throw explicito canonico', async () => {
    const deps: ClaudeCallDeps = {
      fetchImpl: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      onTelemetry: vi.fn(),
      // Sem apiKeyResolver custom — cai no default que le process.env.
    };
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(claudeCall(CANON_OPTS, deps)).rejects.toThrow(/ANTHROPIC_API_KEY ausente/);
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('CLAUDE_MODEL ausente -> fallback canonico para claude-sonnet-4-6', async () => {
    const h = makeHarness();
    // Substitui o modelResolver pelo padrao (le env).
    const depsSemModelOverride: ClaudeCallDeps = { ...h.deps, modelResolver: undefined };
    const originalModel = process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_MODEL;
    h.fetchImpl.mockResolvedValueOnce(fakeResponse(200, makeApiOkBody('{"ok":1}')));
    const result = await claudeCall(CANON_OPTS, depsSemModelOverride);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.telemetry.model).toBe(CLAUDE_MODEL_DEFAULT);
    }
    process.env.CLAUDE_MODEL = originalModel;
  });

  it('constantes canonicas expostas', () => {
    expect(CLAUDE_MODEL_DEFAULT).toBe('claude-sonnet-4-6');
    expect(CLAUDE_CALL_DEFAULT_TIMEOUT_MS).toBe(60_000);
    expect(CLAUDE_CALL_RETRY_BACKOFF_MS).toEqual([5_000, 15_000]);
  });
});
