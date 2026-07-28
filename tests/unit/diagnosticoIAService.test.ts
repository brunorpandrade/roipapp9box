// ROIP APP 9BOX — teste unitario `services/diagnosticoIAService`
// (ME-052, S267). Cobre a orquestracao canonica:
//   - Guard §6.6: trimestre != atual → outcome
//     `not_current_quarter` (nao chama Claude, nao mexe em banco).
//   - Guard `performanceQuarterlyData` ausente → outcome
//     `quarterly_data_not_found`.
//   - Guard contexto ausente (colaborador nao existe) → outcome
//     `context_not_found`.
//   - Instrucao canonica §6.3 variante A/B conforme presenca do bloco
//     financeiro no payload.
//   - Falha §11.3 (`kind: 'failed_claude'`) preserva o cache
//     (UPDATE canonico NAO e chamado).
//   - Sucesso: UPDATE via `updatePerformanceQuarterlyDiagnosticoIA`.
//
// Wrapper `claudeCall` e persistence (`updatePerformanceQuarterlyDiagnosticoIA`)
// sao stubbed via injecao de deps.

import { describe, expect, it } from 'vitest';

import type { RoipDatabase } from '../../src/db/client';
import {
  composeDiagnosticoIAUserPrompt,
  DIAGNOSTICO_IA_MAX_TOKENS,
  DIAGNOSTICO_IA_TEMPERATURE,
  DIAGNOSTICO_IA_TIMEOUT_MS,
  generateDiagnosticoIA,
  MSG_DIAGNOSTICO_IA_FALLBACK,
  MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER,
  MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO,
  type DiagnosticoIAServiceDeps,
  type GenerateDiagnosticoIAArgs,
} from '../../src/server/services/diagnosticoIAService';
import type { DashboardIndividualContextPayload } from '../../src/server/services/_shared/dashboardContextTypes'; // eslint-disable-line @stylistic/max-len
import type { ClaudeCallResult } from '../../src/server/services/claudeCall';
import {
  DIAGNOSTICO_IA_INSTRUCAO_COM_FINANCEIRO,
  DIAGNOSTICO_IA_INSTRUCAO_SEM_FINANCEIRO,
  DIAGNOSTICO_IA_SYSTEM_PROMPT,
} from '../../src/server/services/diagnosticoIASystemPrompt';

// ============================================================
// Fixtures canonicas
// ============================================================

const PAYLOAD_COM_FINANCEIRO: DashboardIndividualContextPayload = {
  identificacao: {
    nome: 'Fulano',
    cargo: 'Analista',
    departamento: 'TI',
    familia_funcao: 'engenharia',
    nivel_hierarquico: 'tatico',
    senioridade: 'pleno',
    tempo_empresa: '18 meses',
    lider_direto: '',
  },
  trimestre_atual: '2026-Q2',
  eixo_x: {
    score_desempenho: 85,
    indice_desempenho: 92,
    detalhamento_variaveis: [],
  },
  eixo_y: {
    plenitude_score: 78,
    score_a: 80,
    score_c: 76,
    alerta_divergencia: false,
    magnitude_divergencia: 4,
    por_dimensao: {
      engajamento: { a: null, c: null },
      desenvolvimento: { a: null, c: null },
      pertencimento: { a: null, c: null },
      realizacao: { a: null, c: null },
    },
  },
  capacidade_ociosa: { valor: 35, faixa: 'baixa' },
  assiduidade: null,
  financeiro: {
    roi_estimado: 12000,
    meta_roi: 10000,
    retorno_estimado: 15000,
    perc_meta_atingida: 110,
  },
  '9box': { quadrante: 'ALTA ENTREGA', dx: null, dy: null },
  iql: null,
  historico_4_trimestres: [],
  dialogos_desenvolvimento_recentes: [],
};

const PAYLOAD_SEM_FINANCEIRO: DashboardIndividualContextPayload = {
  ...PAYLOAD_COM_FINANCEIRO,
  financeiro: null,
};

const BASE_ARGS: GenerateDiagnosticoIAArgs = {
  companyId: 100,
  employeeId: 10,
  trimestreSolicitado: '2026-Q2',
  trimestreAtual: '2026-Q2',
  viewerRole: 'rh',
  viewerUserId: 900,
  viewerUserType: 'employee',
};

// ============================================================
// Harness canonico
// ============================================================

interface Harness {
  updateCalls: Array<{ id: number; diagnostico: string }>;
  deps: DiagnosticoIAServiceDeps;
}

function buildHarness(overrides: {
  quarterlyRow?: { id: number } | null;
  contextResult?: DashboardIndividualContextPayload | null;
  claudeResult?: ClaudeCallResult;
}): Harness {
  const updateCalls: Array<{ id: number; diagnostico: string }> = [];
  // NOTA: usar `in overrides` — `null` seria consumido por `??`, e
  // este teste PRECISA distinguir "ausente" de "null explicito".
  const quarterlyRow = 'quarterlyRow' in overrides ? overrides.quarterlyRow : { id: 500 };
  // Mock do db.select().from().where().limit() para
  // getPerformanceQuarterlyDataByQuarter, e db.update().set().where()
  // para updatePerformanceQuarterlyDiagnosticoIA.
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (quarterlyRow ? [quarterlyRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (patch: { diagnosticoIA: string }) => ({
        where: async () => {
          updateCalls.push({
            id: quarterlyRow?.id ?? -1,
            diagnostico: patch.diagnosticoIA,
          });
          return [{ affectedRows: 1 }];
        },
      }),
    }),
  } as unknown as RoipDatabase;
  const claudeResult: ClaudeCallResult = overrides.claudeResult ?? {
    ok: true,
    content: 'Diagnostico canonico gerado.',
    parsedJson: null,
    telemetry: {
      callId: 'call-diag-1',
      companyId: 100,
      surface: 'dashboardDiagnostico',
      model: 'claude-model-stub',
      startedAt: new Date(0),
      finishedAt: new Date(500),
      latencyMs: 500,
      inputTokens: 400,
      outputTokens: 150,
      status: 'sucesso',
      retriesEffective: 0,
      userId: 900,
      userType: 'employee',
    },
  };
  const deps: DiagnosticoIAServiceDeps = {
    db,
    claudeCallFacade: {
      claudeCall: async () => claudeResult,
    },
    loadIndividualContext: async () =>
      overrides.contextResult === undefined ? PAYLOAD_COM_FINANCEIRO : overrides.contextResult,
    now: () => new Date('2026-08-01T12:00:00Z'),
  };
  return { updateCalls, deps };
}

// ============================================================
// Testes canonicos
// ============================================================

describe('generateDiagnosticoIA — guard §6.6', () => {
  it('rejeita trimestreSolicitado != trimestreAtual', async () => {
    const h = buildHarness({});
    const outcome = await generateDiagnosticoIA(h.deps, {
      ...BASE_ARGS,
      trimestreSolicitado: '2026-Q1',
      trimestreAtual: '2026-Q2',
    });
    expect(outcome.kind).toBe('not_current_quarter');
    if (outcome.kind === 'not_current_quarter') {
      expect(outcome.message).toBe(MSG_DIAGNOSTICO_IA_NOT_CURRENT_QUARTER);
    }
    // Nem UPDATE nem chamada a Claude.
    expect(h.updateCalls).toHaveLength(0);
  });
});

describe('generateDiagnosticoIA — guard quarterly_data ausente', () => {
  it('retorna `quarterly_data_not_found` quando linha nao existe', async () => {
    const h = buildHarness({ quarterlyRow: null });
    const outcome = await generateDiagnosticoIA(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('quarterly_data_not_found');
    if (outcome.kind === 'quarterly_data_not_found') {
      expect(outcome.message).toBe(MSG_DIAGNOSTICO_IA_QUARTERLY_NAO_ENCONTRADO);
    }
    expect(h.updateCalls).toHaveLength(0);
  });
});

describe('generateDiagnosticoIA — guard contexto ausente', () => {
  it('retorna `context_not_found` quando loader devolve null', async () => {
    const h = buildHarness({ contextResult: null });
    const outcome = await generateDiagnosticoIA(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('context_not_found');
    expect(h.updateCalls).toHaveLength(0);
  });
});

describe('generateDiagnosticoIA — falha Claude §11.3', () => {
  it('preserva cache: UPDATE NAO e chamado em falha', async () => {
    const h = buildHarness({
      claudeResult: {
        ok: false,
        status: 'falha_timeout',
        message: 'timeout upstream',
        telemetry: {
          callId: 'call-diag-timeout',
          companyId: 100,
          surface: 'dashboardDiagnostico',
          model: 'claude-model-stub',
          startedAt: new Date(0),
          finishedAt: new Date(45_000),
          latencyMs: 45_000,
          inputTokens: 400,
          outputTokens: 0,
          status: 'falha_timeout',
          retriesEffective: 1,
          userId: 900,
          userType: 'employee',
        },
      },
    });
    const outcome = await generateDiagnosticoIA(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('failed_claude');
    if (outcome.kind === 'failed_claude') {
      expect(outcome.message).toBe(MSG_DIAGNOSTICO_IA_FALLBACK);
    }
    expect(h.updateCalls).toHaveLength(0);
  });
});

describe('generateDiagnosticoIA — sucesso', () => {
  it('grava diagnostico via UPDATE canonico', async () => {
    const h = buildHarness({});
    const outcome = await generateDiagnosticoIA(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('ok');
    expect(h.updateCalls).toHaveLength(1);
    expect(h.updateCalls[0]?.diagnostico).toBe('Diagnostico canonico gerado.');
  });
});

describe('composeDiagnosticoIAUserPrompt — variantes §6.3', () => {
  it('com financeiro: instrucao canonica variante A (5 temas)', () => {
    const prompt = composeDiagnosticoIAUserPrompt(PAYLOAD_COM_FINANCEIRO);
    expect(prompt).toContain(DIAGNOSTICO_IA_INSTRUCAO_COM_FINANCEIRO);
    expect(prompt).not.toContain(DIAGNOSTICO_IA_INSTRUCAO_SEM_FINANCEIRO);
  });

  it('sem financeiro: instrucao canonica variante B (4 temas)', () => {
    const prompt = composeDiagnosticoIAUserPrompt(PAYLOAD_SEM_FINANCEIRO);
    expect(prompt).toContain(DIAGNOSTICO_IA_INSTRUCAO_SEM_FINANCEIRO);
    expect(prompt).not.toContain(DIAGNOSTICO_IA_INSTRUCAO_COM_FINANCEIRO);
  });
});

describe('constantes canonicas exportadas', () => {
  it('DIAGNOSTICO_IA_MAX_TOKENS = 2000 (canonico §6.4)', () => {
    expect(DIAGNOSTICO_IA_MAX_TOKENS).toBe(2000);
  });
  it('DIAGNOSTICO_IA_TEMPERATURE = 0.4 (canonico §6.4)', () => {
    expect(DIAGNOSTICO_IA_TEMPERATURE).toBe(0.4);
  });
  it('DIAGNOSTICO_IA_TIMEOUT_MS = 45000 (canonico §6.4)', () => {
    expect(DIAGNOSTICO_IA_TIMEOUT_MS).toBe(45_000);
  });
  it('MSG_DIAGNOSTICO_IA_FALLBACK e o texto canonico literal §11.3', () => {
    expect(MSG_DIAGNOSTICO_IA_FALLBACK).toBe(
      'Não foi possível gerar o diagnóstico agora. Tente novamente em alguns instantes.',
    );
  });
  it('DIAGNOSTICO_IA_SYSTEM_PROMPT abre com a linha canonica §9.3', () => {
    expect(DIAGNOSTICO_IA_SYSTEM_PROMPT.startsWith('Você é o gerador de diagnóstico')).toBe(true);
  });
});
