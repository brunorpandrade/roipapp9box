// ROIP APP 9BOX — teste unitario dos context loaders do dashboard
// (ME-052, S268). Cobre bloqueios canonicos §5.6 (financeiro se
// lider, IQL null em autovisualizacao / nao-lider / < 3
// respondentes), extensao perfil_individual §5.3 e a estrutura §8.3.2
// (agregados = null nesta ME por D059).
//
// Puramente algoritmico: nao toca banco real. O teste exercita
// as decisoes de composicao / bloqueio; a integracao com Drizzle e
// coberta pelos testes de integracao dos routers correspondentes.

import { describe, expect, it, vi } from 'vitest';

import type {
  DashboardEquipeContextArgs,
  DashboardIndividualContextArgs,
} from '../../src/server/services/_shared/dashboardContextTypes';
import { loadDashboardIndividualContext } from '../../src/server/services/_shared/dashboardIndividualContext'; // eslint-disable-line @stylistic/max-len
import {
  EQUIPE_LISTA_COLABORADORES_CAP,
  loadDashboardEquipeContext,
} from '../../src/server/services/_shared/dashboardEquipeContext';

// ============================================================
// Stubs canonicos de Drizzle query builder (chain)
// ============================================================

type StubRow = Record<string, unknown>;

interface FakeSelectChain {
  select: (fields?: unknown) => FakeSelectChain;
  from: (t: unknown) => FakeSelectChain;
  where: (c: unknown) => FakeSelectChain;
  orderBy: (...args: unknown[]) => FakeSelectChain;
  limit: (n: number) => Promise<StubRow[]>;
  then: (fn: (rows: StubRow[]) => unknown) => Promise<unknown>;
}

/**
 * Constroi uma chain determinista que devolve `queue.shift()` a cada
 * chamada terminal (`.limit(...)` ou `await` direto na Promise). Cobre
 * o padrao real do Drizzle usado nos loaders.
 */
function buildFakeDb(queue: StubRow[][]) {
  function makeChain(): FakeSelectChain {
    let terminated = false;
    const chain: FakeSelectChain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async (n: number) => {
        void n;
        if (terminated) return [];
        terminated = true;
        return queue.shift() ?? [];
      },
      then: (fn) => {
        if (terminated) return Promise.resolve(fn([]));
        terminated = true;
        return Promise.resolve(fn(queue.shift() ?? []));
      },
    };
    return chain;
  }
  return {
    select: (fields?: unknown) => makeChain().select(fields),
  } as unknown as Parameters<typeof loadDashboardIndividualContext>[0];
}

// ============================================================
// Fixtures canonicas
// ============================================================

const EMPLOYEE_ROW_ID_10: StubRow = {
  id: 10,
  companyId: 100,
  name: 'Fulano',
  descricaoCBO: 'Analista',
  departamento: 'TI',
  jobFamily: 'engenharia',
  nivelHierarquico: 'tatico',
  senioridade: 'pleno',
  dataAdmissao: '2024-01-01',
  isLider: true,
};

const QUARTERLY_ROW_2026_Q2: StubRow = {
  id: 500,
  trimestre: '2026-Q2',
  scoreDesempenho: '85.50',
  indiceDesempenho: '92.10',
  capacidadeOciosa: '35.00',
  roiEstimado: '12000.00',
  metaROI: '10000.00',
  retornoEstimado: '15000.00',
  percMetaAtingida: '110.00',
  diagnosticoIA: null,
  diagnosticoIAgeradoEm: null,
};

const IQL_ROW_5_RESPONDENTES: StubRow = {
  iql: '75.00',
  countRespondentes: 5,
  scoreDirecionamentoClareza: '80.00',
  scoreDesenvolvimentoApoio: '70.00',
  scoreRelacionamentoConfianca: '78.00',
  scoreGestaoResultados: '72.00',
};

const IQL_ROW_2_RESPONDENTES: StubRow = {
  iql: '65.00',
  countRespondentes: 2,
};

// ============================================================
// Testes canonicos — contexto individual
// ============================================================

describe('loadDashboardIndividualContext — bloqueios §5.6', () => {
  it('bloqueia bloco financeiro (`null`) quando viewer.role === lider', async () => {
    const queue: StubRow[][] = [
      [EMPLOYEE_ROW_ID_10], // identificacao
      [QUARTERLY_ROW_2026_Q2], // performanceQuarterlyData x4 slots -> 1o = latest
      [], // plenitudeData
      [], // nineBoxClassifications
      [{ isLider: true }], // employees.isLider
      [IQL_ROW_5_RESPONDENTES], // iqlData
      [], // individualProfileAssessments (nao existe -> perfil_individual undefined)
    ];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 10,
      viewerRole: 'lider',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.financeiro).toBeNull();
  });

  it('mantem bloco financeiro (nao-null) quando viewer.role !== lider', async () => {
    const queue: StubRow[][] = [
      [EMPLOYEE_ROW_ID_10],
      [QUARTERLY_ROW_2026_Q2],
      [],
      [],
      [{ isLider: true }],
      [IQL_ROW_5_RESPONDENTES],
      [],
    ];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 10,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.financeiro).not.toBeNull();
    expect(ctx!.financeiro!.roi_estimado).toBe(12000);
  });

  it('bloqueia IQL (`null`) em autovisualizacao', async () => {
    const queue: StubRow[][] = [
      [EMPLOYEE_ROW_ID_10],
      [QUARTERLY_ROW_2026_Q2],
      [],
      [],
      [{ isLider: true }],
      // getIqlDataByLiderQuarter NAO deve ser consultado — mas se for,
      // a fila esta preparada com um resultado que causaria bloqueio.
      [],
      [],
    ];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 10,
      viewerRole: 'lider',
      viewerUserId: 10, // autovisualizacao (o proprio)
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.iql).toBeNull();
  });

  it('bloqueia IQL (`null`) quando count_respondentes < 3', async () => {
    const queue: StubRow[][] = [
      [EMPLOYEE_ROW_ID_10],
      [QUARTERLY_ROW_2026_Q2],
      [],
      [],
      [{ isLider: true }],
      [IQL_ROW_2_RESPONDENTES], // < 3
      [],
    ];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 10,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.iql).toBeNull();
  });

  it('bloqueia IQL (`null`) quando colaborador nao e lider', async () => {
    const queue: StubRow[][] = [
      [{ ...EMPLOYEE_ROW_ID_10, isLider: false }],
      [QUARTERLY_ROW_2026_Q2],
      [],
      [],
      [{ isLider: false }],
      [IQL_ROW_5_RESPONDENTES],
      [],
    ];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 10,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.iql).toBeNull();
  });

  it('retorna `null` quando employees.id nao existe', async () => {
    const queue: StubRow[][] = [[]];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 9999,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).toBeNull();
  });

  it('omite `perfil_individual` (undefined) quando assessment nao esta enviado', async () => {
    const queue: StubRow[][] = [
      [EMPLOYEE_ROW_ID_10],
      [QUARTERLY_ROW_2026_Q2],
      [],
      [],
      [{ isLider: true }],
      [IQL_ROW_5_RESPONDENTES],
      [], // assessments vazio -> §5.3 nao atendido
    ];
    const db = buildFakeDb(queue);
    const args: DashboardIndividualContextArgs = {
      companyId: 100,
      employeeId: 10,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardIndividualContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.perfil_individual).toBeUndefined();
  });
});

// ============================================================
// Testes canonicos — contexto equipe
// ============================================================

describe('loadDashboardEquipeContext — §5.6 e D059', () => {
  it('bloqueia IQL do lider (`null`) em autovisualizacao', async () => {
    const queue: StubRow[][] = [
      // composeEquipeIdentificacao: lider + diretos
      [{ name: 'Lider X', departamento: 'TI', isLider: true }],
      [{ id: 20 }, { id: 21 }], // 2 diretos
      // trimestre atual — primeiroDireto + latestQuarterly do primeiro
      [{ employeeId: 20 }],
      [{ trimestre: '2026-Q2' }],
      // composeEquipeIqlBlock — NAO deve ser chamado (autovisualizacao)
      // composeEquipeClimaBlock — chamado, sem dados
      [],
      // composeListaColaboradores — 2 vinculos, 2 employees (nomes),
      // 2 nineBoxClassifications, 2 quarterly.
      [{ employeeId: 20 }, { employeeId: 21 }],
      [{ name: 'Colab A' }],
      [{ quadrante: 'ALTA ENTREGA' }],
      [{ scoreDesempenho: '80.00' }],
      [{ name: 'Colab B' }],
      [{ quadrante: 'ALTO IMPACTO' }],
      [{ scoreDesempenho: '90.00' }],
    ];
    const db = buildFakeDb(queue);
    const args: DashboardEquipeContextArgs = {
      companyId: 100,
      liderId: 15,
      viewerRole: 'lider',
      viewerUserId: 15, // autovisualizacao (o proprio lider)
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardEquipeContext(db, args);
    expect(ctx).not.toBeNull();
    expect(ctx!.iql_lider).toBeNull();
  });

  it('declara agregados como `null` (D059) — nesta ME nao ha motor de agregacao', async () => {
    const queue: StubRow[][] = [
      [{ name: 'Lider Y', departamento: 'Vendas', isLider: true }],
      [{ id: 30 }],
      [{ employeeId: 30 }],
      [{ trimestre: '2026-Q2' }],
      [], // iql
      [], // clima
      [{ employeeId: 30 }],
      [{ name: 'Colab C' }],
      [{ quadrante: 'SOLIDO' }],
      [{ scoreDesempenho: '75.00' }],
    ];
    const db = buildFakeDb(queue);
    const args: DashboardEquipeContextArgs = {
      companyId: 100,
      liderId: 25,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardEquipeContext(db, args);
    expect(ctx).not.toBeNull();
    // D059: todos os agregados null.
    expect(ctx!.agregados.score_desempenho_medio).toBeNull();
    expect(ctx!.agregados.plenitude_score_medio).toBeNull();
    expect(ctx!.agregados.roi_estimado_medio).toBeNull();
    // Distribuicao 9-Box zerada (D059 — sem motor de agregacao).
    expect(ctx!.distribuicao_9box.estrela).toBe(0);
    // Historico agregado vazio (D059).
    expect(ctx!.historico_4_trimestres).toEqual([]);
  });

  it('retorna `null` quando lider nao existe', async () => {
    const queue: StubRow[][] = [[]];
    const db = buildFakeDb(queue);
    const args: DashboardEquipeContextArgs = {
      companyId: 100,
      liderId: 9999,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardEquipeContext(db, args);
    expect(ctx).toBeNull();
  });

  it('retorna `null` quando o employee existe mas nao e lider', async () => {
    const queue: StubRow[][] = [[{ name: 'Nao Lider', departamento: 'TI', isLider: false }]];
    const db = buildFakeDb(queue);
    const args: DashboardEquipeContextArgs = {
      companyId: 100,
      liderId: 30,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'employee',
    };
    const ctx = await loadDashboardEquipeContext(db, args);
    expect(ctx).toBeNull();
  });

  it('cap canonico da lista de colaboradores = 200 (§2.4)', () => {
    // Assercao estrutural — o cap e uma constante exportada canonica.
    expect(EQUIPE_LISTA_COLABORADORES_CAP).toBe(200);
  });
});

// ============================================================
// Vitest hygiene
// ============================================================

vi.restoreAllMocks();
