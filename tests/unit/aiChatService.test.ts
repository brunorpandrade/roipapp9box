// ROIP APP 9BOX — teste unitario `services/aiChatService` (ME-052,
// S267). Cobre a orquestracao canonica do motor Chat IA:
//   - Guard S263: rejeita `dashboardLevel` fora do MVP.
//   - Persistencia §11.2: mensagem `user` gravada SEMPRE (antes da
//     chamada a Claude); mensagem `assistant` gravada SO NO SUCESSO.
//   - Recomposicao do contexto (§5.7): loader chamado a cada mensagem.
//   - `composeChatIaUserPrompt`: preambulo + JSON + trailer canonicos.
//   - Fallback §11.2 (mensagem literal exata).
//
// Loaders, `claudeCallFacade` e o `db` sao stubbed via injecao. RV-13:
// o motor e o unico caminho de escrita em `aiConversations` a partir
// do router `aiChat` — os testes de integracao complementam.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_CHAT_MAX_TOKENS,
  AI_CHAT_TEMPERATURE,
  CHAT_IA_LEVELS_MVP,
  CHAT_IA_USER_MESSAGE_MAX_CHARS,
  chatIaSurfaceFromLevel,
  composeChatIaUserPrompt,
  MSG_CHAT_IA_FALLBACK,
  sendChatMessage,
  type AiChatServiceDeps,
  type SendChatMessageArgs,
} from '../../src/server/services/aiChatService';
import { AI_CHAT_SYSTEM_PROMPT } from '../../src/server/services/aiChatSystemPrompt';
import type {
  DashboardEquipeContextPayload,
  DashboardIndividualContextPayload,
} from '../../src/server/services/_shared/dashboardContextTypes';
import type { ClaudeCallResult } from '../../src/server/services/claudeCall';

// ============================================================
// Fixtures canonicas de payload
// ============================================================

const INDIVIDUAL_PAYLOAD_STUB: DashboardIndividualContextPayload = {
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
    score_desempenho: 85.5,
    indice_desempenho: 92.1,
    detalhamento_variaveis: [],
  },
  eixo_y: {
    plenitude_score: 78.0,
    score_a: 80.0,
    score_c: 76.0,
    alerta_divergencia: false,
    magnitude_divergencia: 4.0,
    por_dimensao: {
      engajamento: { a: 82, c: 78 },
      desenvolvimento: { a: 80, c: 75 },
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

const EQUIPE_PAYLOAD_STUB: DashboardEquipeContextPayload = {
  identificacao: {
    nome_lider: 'Lider X',
    departamento: 'TI',
    diretos: 5,
    total_incluindo_abaixo: 5,
  },
  trimestre_atual: '2026-Q2',
  agregados: {
    score_desempenho_medio: null,
    plenitude_score_medio: null,
    score_a_medio: null,
    capacidade_ociosa_media: null,
    roi_estimado_medio: null,
    perc_meta_atingida_media: null,
    assiduidade_media: null,
  },
  distribuicao_9box: {
    estrela: 0,
    alto_desempenho: 0,
    solido: 0,
    desenvolvimento: 0,
    consistente: 0,
    manutencao: 0,
    duvida: 0,
    abaixo_esperado: 0,
    critico: 0,
  },
  iql_lider: null,
  clima_equipe: { nota_clima: null, adesao: null },
  historico_4_trimestres: [],
  lista_colaboradores: [],
};

// ============================================================
// Harness canonico
// ============================================================

interface Harness {
  db: unknown;
  insertCalls: Array<{ role: string; content: string }>;
  counters: { claude: number; loadIndividual: number; loadEquipe: number };
  deps: AiChatServiceDeps;
}

function buildHarness(overrides: {
  claudeResult?: ClaudeCallResult;
  loadIndividualResult?: DashboardIndividualContextPayload | null;
  loadEquipeResult?: DashboardEquipeContextPayload | null;
}): Harness {
  const insertCalls: Array<{ role: string; content: string }> = [];
  const counters = { claude: 0, loadIndividual: 0, loadEquipe: 0 };
  const claudeResult: ClaudeCallResult = overrides.claudeResult ?? {
    ok: true,
    content: 'Resposta canonica da IA.',
    parsedJson: null,
    telemetry: {
      callId: 'call-stub-1',
      companyId: 100,
      surface: 'aiChat_individual',
      model: 'claude-model-stub',
      startedAt: new Date(0),
      finishedAt: new Date(100),
      latencyMs: 100,
      inputTokens: 200,
      outputTokens: 50,
      status: 'sucesso',
      retriesEffective: 0,
      userId: 900,
      userType: 'employee',
    },
  };
  const db = {
    insert: () => ({
      values: (data: { role: string; content: string }) => ({
        $returningId: async () => {
          insertCalls.push({ role: data.role, content: data.content });
          return [{ id: insertCalls.length }];
        },
      }),
    }),
  };
  const deps: AiChatServiceDeps = {
    db: db as unknown as AiChatServiceDeps['db'],
    claudeCallFacade: {
      claudeCall: async () => {
        counters.claude += 1;
        return claudeResult;
      },
    },
    loadIndividualContext: async () => {
      counters.loadIndividual += 1;
      return overrides.loadIndividualResult === undefined
        ? INDIVIDUAL_PAYLOAD_STUB
        : overrides.loadIndividualResult;
    },
    loadEquipeContext: async () => {
      counters.loadEquipe += 1;
      return overrides.loadEquipeResult === undefined
        ? EQUIPE_PAYLOAD_STUB
        : overrides.loadEquipeResult;
    },
  };
  return { db, insertCalls, counters, deps };
}

const BASE_ARGS: SendChatMessageArgs = {
  companyId: 100,
  dashboardLevel: 'individual',
  contextId: 10,
  content: 'Como esta o desempenho deste colaborador?',
  viewerRole: 'rh',
  viewerUserId: 900,
  viewerUserType: 'employee',
};

// ============================================================
// Testes canonicos
// ============================================================

describe('sendChatMessage — guard canonico S263', () => {
  it('rejeita dashboardLevel `global`', async () => {
    const h = buildHarness({});
    await expect(
      sendChatMessage(h.deps, {
        ...BASE_ARGS,
        dashboardLevel: 'global' as never,
      }),
    ).rejects.toThrow(/fora do MVP/);
  });

  it('rejeita dashboardLevel `departamento`', async () => {
    const h = buildHarness({});
    await expect(
      sendChatMessage(h.deps, {
        ...BASE_ARGS,
        dashboardLevel: 'departamento' as never,
      }),
    ).rejects.toThrow(/fora do MVP/);
  });
});

describe('sendChatMessage — persistencia §11.2', () => {
  it('grava mensagem `user` sempre — ANTES da chamada a Claude', async () => {
    const h = buildHarness({});
    await sendChatMessage(h.deps, BASE_ARGS);
    const [first] = h.insertCalls;
    expect(first?.role).toBe('user');
    expect(first?.content).toBe(BASE_ARGS.content);
  });

  it('grava mensagem `assistant` no sucesso da chamada', async () => {
    const h = buildHarness({});
    const outcome = await sendChatMessage(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('ok');
    expect(h.insertCalls).toHaveLength(2);
    expect(h.insertCalls[1]?.role).toBe('assistant');
  });

  it('NAO grava mensagem `assistant` quando Claude falha (§11.2)', async () => {
    const h = buildHarness({
      claudeResult: {
        ok: false,
        status: 'falha_5xx',
        message: 'erro upstream',
        telemetry: {
          callId: 'call-stub-fail',
          companyId: 100,
          surface: 'aiChat_individual',
          model: 'claude-model-stub',
          startedAt: new Date(0),
          finishedAt: new Date(200),
          latencyMs: 200,
          inputTokens: 200,
          outputTokens: 0,
          status: 'falha_5xx',
          retriesEffective: 2,
          userId: 900,
          userType: 'employee',
        },
      },
    });
    const outcome = await sendChatMessage(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('failed_claude');
    if (outcome.kind === 'failed_claude') {
      expect(outcome.message).toBe(MSG_CHAT_IA_FALLBACK);
    }
    // Apenas `user` — assistant nao pode ter sido gravado.
    expect(h.insertCalls).toHaveLength(1);
    expect(h.insertCalls[0]?.role).toBe('user');
  });

  it('retorna `context_not_found` quando loader devolve null', async () => {
    const h = buildHarness({
      loadIndividualResult: null,
    });
    const outcome = await sendChatMessage(h.deps, BASE_ARGS);
    expect(outcome.kind).toBe('context_not_found');
    // user foi gravado antes da checagem de contexto — canonico §11.2.
    expect(h.insertCalls).toHaveLength(1);
    expect(h.insertCalls[0]?.role).toBe('user');
  });
});

describe('sendChatMessage — nivel equipe', () => {
  it('usa loader de equipe para dashboardLevel equipe', async () => {
    const h = buildHarness({});
    await sendChatMessage(h.deps, {
      ...BASE_ARGS,
      dashboardLevel: 'equipe',
    });
    expect(h.counters.loadEquipe).toBe(1);
    expect(h.counters.loadIndividual).toBe(0);
  });
});

describe('composeChatIaUserPrompt — estrutura canonica §8.3', () => {
  it('individual: preambulo + JSON + trailer canonicos', () => {
    const prompt = composeChatIaUserPrompt({
      level: 'individual',
      payload: INDIVIDUAL_PAYLOAD_STUB,
    });
    expect(prompt).toContain('Contexto do dashboard individual do colaborador');
    expect(prompt).toContain('"nome": "Fulano"');
    expect(prompt).toContain(
      'Estou pronto para receber perguntas do gestor sobre este colaborador',
    );
  });

  it('equipe: preambulo + JSON + trailer canonicos', () => {
    const prompt = composeChatIaUserPrompt({
      level: 'equipe',
      payload: EQUIPE_PAYLOAD_STUB,
    });
    expect(prompt).toContain('Contexto do dashboard de equipe');
    expect(prompt).toContain('"nome_lider": "Lider X"');
    expect(prompt).toContain('Estou pronto para receber perguntas sobre esta equipe');
  });
});

describe('chatIaSurfaceFromLevel — mapeamento canonico §2.6', () => {
  it('individual → aiChat_individual', () => {
    expect(chatIaSurfaceFromLevel('individual')).toBe('aiChat_individual');
  });
  it('equipe → aiChat_equipe', () => {
    expect(chatIaSurfaceFromLevel('equipe')).toBe('aiChat_equipe');
  });
});

describe('constantes canonicas exportadas', () => {
  it('CHAT_IA_LEVELS_MVP contem apenas equipe e individual (S263)', () => {
    expect(CHAT_IA_LEVELS_MVP).toEqual(['equipe', 'individual']);
  });
  it('AI_CHAT_MAX_TOKENS = 2000 (canonico §5.1)', () => {
    expect(AI_CHAT_MAX_TOKENS).toBe(2000);
  });
  it('AI_CHAT_TEMPERATURE = 0.5 (canonico §5.1)', () => {
    expect(AI_CHAT_TEMPERATURE).toBe(0.5);
  });
  it('CHAT_IA_USER_MESSAGE_MAX_CHARS = 2000 (canonico §5.8)', () => {
    expect(CHAT_IA_USER_MESSAGE_MAX_CHARS).toBe(2000);
  });
  it('MSG_CHAT_IA_FALLBACK e o texto canonico literal §11.2', () => {
    expect(MSG_CHAT_IA_FALLBACK).toBe(
      'Não foi possível processar sua pergunta agora. Tente novamente em alguns instantes.',
    );
  });
  it('AI_CHAT_SYSTEM_PROMPT abre com a linha canonica §9.2', () => {
    expect(AI_CHAT_SYSTEM_PROMPT.startsWith('Você é o assistente executivo')).toBe(true);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
