// ROIP APP 9BOX — teste de integracao do motor
// `nineBoxCalculationEngine` (ME-041).
//
// Exercita o motor canonico do 9-Box (DOC 03 §7.1-7.8) contra MySQL
// real. Cobre:
//   - Contratos publicos exportados (RV-13): formulas puras
//     (`computePosicaoX`, `computePosicaoY`, `computeQuadrante`,
//     `computeDirecaoMovimento`), constantes canonicas (thresholds
//     default, mapa dos 9 quadrantes, lista canonica ordenada), tipos
//     (`NineBoxPosicaoX`, `NineBoxPosicaoY`, `NineBoxQuadrante`,
//     `NineBoxDirecaoMovimento`, `NineBoxMotivoAusencia`,
//     `NineBoxCalculationResult`, `NineBoxEngineFacade`,
//     `NineBoxAnteriorEstado`) e o `DEFAULT_NINE_BOX_ENGINE`.
//   - Pre-condicao §7.1: ambos presentes / so X / so Y / nenhum /
//     primeira vez sem anterior.
//   - Posicionamento §7.2 e nomenclatura §7.3: um caso por quadrante
//     (9 casos) validando o mapa com acentos preservados (S116).
//   - Direcao §7.5: estavel, subiu, desceu, lateral, primeira_vez.
//   - Regra de prioridade diagonal §7.5: Y sobe + X sobe, Y desce + X
//     sobe, Y sobe + X desce (a seta reflete Y, mesmo em diagonais).
//   - Thresholds da company: defaults §7.2 quando NULL; custom quando
//     preenchidos; fronteira exata `<`/`>` estritas.
//   - Persistencia canonica (§7.7, S111): UPSERT em
//     `nineBoxClassifications`; log com `status='calculado'`;
//     caminhos ausentes gravam SO no log (sem linha em classifications).
//   - Reexecucao §7.8: UPSERT sobrescreve classifications (1 linha por
//     trio); log e append-only (cresce a cada execucao).
//   - Dogfood da chain via `recalculatePlenitude` real (ME-040)
//     substituindo o `NineBoxEngineFacade` — hook S112 aciona 9-Box
//     apenas em caminho `ambos_completos`; caminhos incompletos NAO
//     acionam.
//   - Isolamento canonico: motor NAO vaza entre trimestres, employees
//     ou companies.
//
// Padrao S009 estendido (S076/S109): uma faixa CNPJ dedicada por ME —
// 10000000000780..789 reservada para ME-041 (760..769 pertence a
// ME-040). L32 cleanup em `afterAll` cobre tanto classifications
// quanto log (append-only), plus dependencias (plenitude, performance,
// A/C, employees, companies).
//
// JWT_SECRET fixo (motor 9-Box nao usa JWT; convencao canonica do repo).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  instrumentA_responses,
  instrumentC_assessments,
  nineBoxCalculationLog,
  nineBoxClassifications,
  performanceQuarterlyData,
  plenitudeData,
} from '../../src/db/schema';
import {
  calculateNineBoxClassification,
  computeDirecaoMovimento,
  computePosicaoX,
  computePosicaoY,
  computeQuadrante,
  DEFAULT_NINE_BOX_ENGINE,
  NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_BAIXO,
  NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_MEDIO,
  NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_BAIXO,
  NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_MEDIO,
  NINE_BOX_QUADRANTE_MAP,
  NINE_BOX_QUADRANTES,
  type NineBoxAnteriorEstado,
  type NineBoxCalculationResult,
  type NineBoxDirecaoMovimento,
  type NineBoxEngineFacade,
  type NineBoxMotivoAusencia,
  type NineBoxPosicaoX,
  type NineBoxPosicaoY,
  type NineBoxQuadrante,
} from '../../src/server/services/nineBoxCalculationEngine';
import {
  recalculatePlenitude,
  NUM_DIMENSOES_PLENITUDE,
  NUM_ITENS_POR_DIMENSAO_PLENITUDE,
} from '../../src/server/services/plenitudeCalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me041-ninebox-engine';

const HASH_A = 'hash-fixo-me041-ninebox';

// CNPJs canonicos por describe (S076/S109 — faixa 780..789 reservada
// para ME-041).
const CNPJ_CONSTANTES = '10000000000780';
const CNPJ_PRECOND = '10000000000781';
const CNPJ_POSICOES = '10000000000782';
const CNPJ_DIRECAO = '10000000000783';
const CNPJ_THRESHOLDS = '10000000000784';
const CNPJ_PERSISTENCIA = '10000000000785';
const CNPJ_REEXECUCAO = '10000000000786';
const CNPJ_CHAIN = '10000000000787';
const CNPJ_ISOLAMENTO = '10000000000788';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // Ordem canonica de delete respeitando FKs.
    await client.db
      .delete(nineBoxCalculationLog)
      .where(inArray(nineBoxCalculationLog.companyId, createdCompanyIds));
    await client.db
      .delete(nineBoxClassifications)
      .where(inArray(nineBoxClassifications.companyId, createdCompanyIds));
    await client.db
      .delete(plenitudeData)
      .where(inArray(plenitudeData.companyId, createdCompanyIds));
    await client.db
      .delete(performanceQuarterlyData)
      .where(inArray(performanceQuarterlyData.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentC_assessments)
      .where(inArray(instrumentC_assessments.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(
  cnpj: string,
  opts: {
    thresholdDesempenhoBaixo?: number;
    thresholdDesempenhoMedio?: number;
    thresholdPlenitudeBaixo?: number;
    thresholdPlenitudeMedio?: number;
  } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME041 Test ${cnpj} LTDA`,
      nomeFantasia: `ME041 Test ${cnpj}`,
      cnpj,
      telefone: '1633330041',
      endereco: `Rua ME-041, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      thresholdDesempenhoBaixo: opts.thresholdDesempenhoBaixo ?? null,
      thresholdDesempenhoMedio: opts.thresholdDesempenhoMedio ?? null,
      thresholdPlenitudeBaixo: opts.thresholdPlenitudeBaixo ?? null,
      thresholdPlenitudeMedio: opts.thresholdPlenitudeMedio ?? null,
      mesKickoff: 1,
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 41000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME041',
      cpf,
      email: `emp-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      isRH: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

/**
 * Insere o `scoreDesempenho` canonico do (employeeId, trimestre) em
 * `performanceQuarterlyData` — suficiente para o motor 9-Box ler o
 * Eixo X. Demais colunas ficam nulas (motor 9-Box nao le nada alem
 * de `scoreDesempenho`).
 */
async function insertScoreDesempenho(
  companyId: number,
  employeeId: number,
  trimestre: string,
  scoreDesempenho: number,
): Promise<void> {
  await client.db.insert(performanceQuarterlyData).values({
    companyId,
    employeeId,
    trimestre,
    scoreDesempenho: String(scoreDesempenho),
  });
}

/**
 * Insere o `plenitudeScore` canonico do (employeeId, trimestre) em
 * `plenitudeData` — suficiente para o motor 9-Box ler o Eixo Y.
 */
async function insertPlenitudeScore(
  companyId: number,
  employeeId: number,
  trimestre: string,
  plenitudeScore: number,
): Promise<void> {
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    plenitudeScore: String(plenitudeScore),
  });
}

/**
 * Insere `performanceQuarterlyData` sem valor no `scoreDesempenho`
 * (coluna NULL — §7.1 canoniza como `eixo_x_ausente`).
 */
async function insertPerformanceRowSemScore(
  companyId: number,
  employeeId: number,
  trimestre: string,
): Promise<void> {
  await client.db.insert(performanceQuarterlyData).values({
    companyId,
    employeeId,
    trimestre,
    scoreDesempenho: null,
  });
}

/**
 * Insere `plenitudeData` sem valor no `plenitudeScore` (coluna NULL —
 * §7.1 canoniza como `eixo_y_ausente`; caminho incompleto do
 * plenitude S103).
 */
async function insertPlenitudeRowSemScore(
  companyId: number,
  employeeId: number,
  trimestre: string,
): Promise<void> {
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    plenitudeScore: null,
  });
}

/**
 * Insere 20 respostas do Instrumento A canonicas (grid 4x5, valor
 * fixo) — usado para dogfood da chain via `recalculatePlenitude`.
 */
async function insertRespostasA(
  companyId: number,
  employeeId: number,
  trimestre: string,
  valor: number,
): Promise<void> {
  for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
      await client.db.insert(instrumentA_responses).values({
        companyId,
        employeeId,
        trimestre,
        dimensao: d,
        itemIndex: i,
        valor,
      });
    }
  }
}

/**
 * Insere 20 avaliacoes do Instrumento C canonicas — usado para
 * dogfood da chain via `recalculatePlenitude`.
 */
async function insertAvaliacoesC(
  companyId: number,
  employeeId: number,
  trimestre: string,
  valor: number,
): Promise<void> {
  for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
      await client.db.insert(instrumentC_assessments).values({
        companyId,
        employeeId,
        trimestre,
        dimensao: d,
        itemIndex: i,
        valor,
        liderId: employeeId,
      });
    }
  }
}

const NOW = new Date('2026-07-01T00:00:00Z');

// ============================================================
// Constantes canonicas e formulas puras
// ============================================================

describe('nineBoxCalculationEngine — constantes e formulas puras', () => {
  it('faixa CNPJ 780..789 reservada a ME-041 (S076/S109)', () => {
    expect(CNPJ_CONSTANTES).toBe('10000000000780');
  });

  it('defaults canonicos §7.2 sao 60/85 (X) e 50/75 (Y)', () => {
    expect(NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_BAIXO).toBe(60);
    expect(NINE_BOX_DEFAULT_THRESHOLD_DESEMPENHO_MEDIO).toBe(85);
    expect(NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_BAIXO).toBe(50);
    expect(NINE_BOX_DEFAULT_THRESHOLD_PLENITUDE_MEDIO).toBe(75);
  });

  it('NINE_BOX_QUADRANTES lista os 9 nomes canonicos §7.3 (acentos preservados)', () => {
    expect(NINE_BOX_QUADRANTES).toHaveLength(9);
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('DESEMPENHO CRÍTICO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('RISCO CRÍTICO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('RISCO DE ESGOTAMENTO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('DESGASTE OCULTO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('POTENCIAL SUBUTILIZADO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('DESEMPENHO REPRESADO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('ALTO IMPACTO');
    expect(NINE_BOX_QUADRANTES).toContain<NineBoxQuadrante>('ALTA ENTREGA');
  });

  it('NINE_BOX_QUADRANTE_MAP mapeia §7.3 exato (matriz 3x3)', () => {
    expect(NINE_BOX_QUADRANTE_MAP.baixo.alta).toBe<NineBoxQuadrante>('POTENCIAL SUBUTILIZADO');
    expect(NINE_BOX_QUADRANTE_MAP.baixo.media).toBe<NineBoxQuadrante>('DESEMPENHO CRÍTICO');
    expect(NINE_BOX_QUADRANTE_MAP.baixo.baixa).toBe<NineBoxQuadrante>('RISCO CRÍTICO');
    expect(NINE_BOX_QUADRANTE_MAP.medio.alta).toBe<NineBoxQuadrante>('DESEMPENHO REPRESADO');
    expect(NINE_BOX_QUADRANTE_MAP.medio.media).toBe<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
    expect(NINE_BOX_QUADRANTE_MAP.medio.baixa).toBe<NineBoxQuadrante>('DESGASTE OCULTO');
    expect(NINE_BOX_QUADRANTE_MAP.alto.alta).toBe<NineBoxQuadrante>('ALTO IMPACTO');
    expect(NINE_BOX_QUADRANTE_MAP.alto.media).toBe<NineBoxQuadrante>('ALTA ENTREGA');
    expect(NINE_BOX_QUADRANTE_MAP.alto.baixa).toBe<NineBoxQuadrante>('RISCO DE ESGOTAMENTO');
  });

  it('computePosicaoX aplica `<`/`>` estritos com fronteira em medio', () => {
    expect(computePosicaoX(59, 60, 85)).toBe<NineBoxPosicaoX>('baixo');
    expect(computePosicaoX(60, 60, 85)).toBe<NineBoxPosicaoX>('medio');
    expect(computePosicaoX(85, 60, 85)).toBe<NineBoxPosicaoX>('medio');
    expect(computePosicaoX(86, 60, 85)).toBe<NineBoxPosicaoX>('alto');
  });

  it('computePosicaoY aplica `<`/`>` estritos com fronteira em media', () => {
    expect(computePosicaoY(49, 50, 75)).toBe<NineBoxPosicaoY>('baixa');
    expect(computePosicaoY(50, 50, 75)).toBe<NineBoxPosicaoY>('media');
    expect(computePosicaoY(75, 50, 75)).toBe<NineBoxPosicaoY>('media');
    expect(computePosicaoY(76, 50, 75)).toBe<NineBoxPosicaoY>('alta');
  });

  it('computeQuadrante aplica NINE_BOX_QUADRANTE_MAP', () => {
    expect(computeQuadrante('alto', 'alta')).toBe<NineBoxQuadrante>('ALTO IMPACTO');
    expect(computeQuadrante('medio', 'media')).toBe<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
    expect(computeQuadrante('baixo', 'baixa')).toBe<NineBoxQuadrante>('RISCO CRÍTICO');
  });

  it('computeDirecaoMovimento retorna primeira_vez quando nao ha anterior', () => {
    const dir = computeDirecaoMovimento('ALTO IMPACTO', 'alta', null);
    expect(dir).toBe<NineBoxDirecaoMovimento>('primeira_vez');
  });

  it('computeDirecaoMovimento retorna estavel quando quadrante e igual', () => {
    const anterior: NineBoxAnteriorEstado = { quadrante: 'ALTO IMPACTO', posicaoY: 'alta' };
    const dir = computeDirecaoMovimento('ALTO IMPACTO', 'alta', anterior);
    expect(dir).toBe<NineBoxDirecaoMovimento>('estavel');
  });

  it('computeDirecaoMovimento retorna subiu quando posicaoY sobe', () => {
    const anterior: NineBoxAnteriorEstado = { quadrante: 'EQUILÍBRIO FRÁGIL', posicaoY: 'media' };
    const dir = computeDirecaoMovimento('DESEMPENHO REPRESADO', 'alta', anterior);
    expect(dir).toBe<NineBoxDirecaoMovimento>('subiu');
  });

  it('computeDirecaoMovimento retorna desceu quando posicaoY desce', () => {
    const anterior: NineBoxAnteriorEstado = { quadrante: 'ALTO IMPACTO', posicaoY: 'alta' };
    const dir = computeDirecaoMovimento('ALTA ENTREGA', 'media', anterior);
    expect(dir).toBe<NineBoxDirecaoMovimento>('desceu');
  });

  it('computeDirecaoMovimento retorna lateral quando so posicaoX muda', () => {
    const anterior: NineBoxAnteriorEstado = { quadrante: 'DESEMPENHO CRÍTICO', posicaoY: 'media' };
    const dir = computeDirecaoMovimento('EQUILÍBRIO FRÁGIL', 'media', anterior);
    expect(dir).toBe<NineBoxDirecaoMovimento>('lateral');
  });

  it('DEFAULT_NINE_BOX_ENGINE aponta para calculateNineBoxClassification real', () => {
    // Fachada canonica S113: DEFAULT usa a implementacao real do motor.
    expect(DEFAULT_NINE_BOX_ENGINE.calculateNineBoxClassification).toBe(
      calculateNineBoxClassification,
    );
  });
});

// ============================================================
// Pre-condicao canonica (§7.1)
// ============================================================

describe('nineBoxCalculationEngine — pre-condicao §7.1', () => {
  it('ambos scores presentes → calcula e grava classifications + log calculado', async () => {
    const companyId = await createCompany(CNPJ_PRECOND);
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 70);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.quadrante).toBe<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('primeira_vez');
    }
  });

  it('so Eixo X presente → log eixo_y_ausente sem classifications', async () => {
    const companyId = await createCompany('10000000000791');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 70);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );

    expect(result.calculated).toBe(false);
    if (!result.calculated) {
      expect(result.motivo).toBe<NineBoxMotivoAusencia>('eixo_y_ausente');
    }
    const classRows = await client.db
      .select({ id: nineBoxClassifications.id })
      .from(nineBoxClassifications)
      .where(
        and(
          eq(nineBoxClassifications.employeeId, employeeId),
          eq(nineBoxClassifications.trimestre, trimestre),
        ),
      );
    expect(classRows).toHaveLength(0);
    const logRows = await client.db
      .select({ status: nineBoxCalculationLog.status })
      .from(nineBoxCalculationLog)
      .where(
        and(
          eq(nineBoxCalculationLog.employeeId, employeeId),
          eq(nineBoxCalculationLog.trimestre, trimestre),
        ),
      );
    expect(logRows).toHaveLength(1);
    expect(logRows[0]!.status).toBe('eixo_y_ausente');
  });

  it('so Eixo Y presente → log eixo_x_ausente sem classifications', async () => {
    const companyId = await createCompany('10000000000792');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );

    expect(result.calculated).toBe(false);
    if (!result.calculated) {
      expect(result.motivo).toBe<NineBoxMotivoAusencia>('eixo_x_ausente');
    }
    const classRows = await client.db
      .select({ id: nineBoxClassifications.id })
      .from(nineBoxClassifications)
      .where(
        and(
          eq(nineBoxClassifications.employeeId, employeeId),
          eq(nineBoxClassifications.trimestre, trimestre),
        ),
      );
    expect(classRows).toHaveLength(0);
    const logRows = await client.db
      .select({ status: nineBoxCalculationLog.status })
      .from(nineBoxCalculationLog)
      .where(
        and(
          eq(nineBoxCalculationLog.employeeId, employeeId),
          eq(nineBoxCalculationLog.trimestre, trimestre),
        ),
      );
    expect(logRows).toHaveLength(1);
    expect(logRows[0]!.status).toBe('eixo_x_ausente');
  });

  it('nenhum eixo presente → log ambos_ausentes sem classifications', async () => {
    const companyId = await createCompany('10000000000793');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );

    expect(result.calculated).toBe(false);
    if (!result.calculated) {
      expect(result.motivo).toBe<NineBoxMotivoAusencia>('ambos_ausentes');
    }
    const logRows = await client.db
      .select({ status: nineBoxCalculationLog.status })
      .from(nineBoxCalculationLog)
      .where(
        and(
          eq(nineBoxCalculationLog.employeeId, employeeId),
          eq(nineBoxCalculationLog.trimestre, trimestre),
        ),
      );
    expect(logRows).toHaveLength(1);
    expect(logRows[0]!.status).toBe('ambos_ausentes');
  });

  it('linha performance com scoreDesempenho NULL trata-se como eixo_x_ausente', async () => {
    const companyId = await createCompany('10000000000794');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertPerformanceRowSemScore(companyId, employeeId, trimestre);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );

    expect(result.calculated).toBe(false);
    if (!result.calculated) {
      expect(result.motivo).toBe<NineBoxMotivoAusencia>('eixo_x_ausente');
    }
  });

  it('linha plenitude com plenitudeScore NULL trata-se como eixo_y_ausente (S103)', async () => {
    const companyId = await createCompany('10000000000795');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 70);
    await insertPlenitudeRowSemScore(companyId, employeeId, trimestre);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );

    expect(result.calculated).toBe(false);
    if (!result.calculated) {
      expect(result.motivo).toBe<NineBoxMotivoAusencia>('eixo_y_ausente');
    }
  });
});

// ============================================================
// Posicionamento §7.2 e nomenclatura §7.3 — 9 casos, um por quadrante
// ============================================================

describe('nineBoxCalculationEngine — 9 quadrantes canonicos §7.3', () => {
  const casos: readonly {
    label: string;
    scoreX: number;
    scoreY: number;
    posicaoX: NineBoxPosicaoX;
    posicaoY: NineBoxPosicaoY;
    quadrante: NineBoxQuadrante;
  }[] = [
    {
      label: 'ALTO IMPACTO',
      scoreX: 90,
      scoreY: 80,
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
    },
    {
      label: 'DESEMPENHO REPRESADO',
      scoreX: 70,
      scoreY: 80,
      posicaoX: 'medio',
      posicaoY: 'alta',
      quadrante: 'DESEMPENHO REPRESADO',
    },
    {
      label: 'POTENCIAL SUBUTILIZADO',
      scoreX: 50,
      scoreY: 80,
      posicaoX: 'baixo',
      posicaoY: 'alta',
      quadrante: 'POTENCIAL SUBUTILIZADO',
    },
    {
      label: 'ALTA ENTREGA',
      scoreX: 90,
      scoreY: 60,
      posicaoX: 'alto',
      posicaoY: 'media',
      quadrante: 'ALTA ENTREGA',
    },
    {
      label: 'EQUILÍBRIO FRÁGIL',
      scoreX: 70,
      scoreY: 60,
      posicaoX: 'medio',
      posicaoY: 'media',
      quadrante: 'EQUILÍBRIO FRÁGIL',
    },
    {
      label: 'DESEMPENHO CRÍTICO',
      scoreX: 50,
      scoreY: 60,
      posicaoX: 'baixo',
      posicaoY: 'media',
      quadrante: 'DESEMPENHO CRÍTICO',
    },
    {
      label: 'RISCO DE ESGOTAMENTO',
      scoreX: 90,
      scoreY: 40,
      posicaoX: 'alto',
      posicaoY: 'baixa',
      quadrante: 'RISCO DE ESGOTAMENTO',
    },
    {
      label: 'DESGASTE OCULTO',
      scoreX: 70,
      scoreY: 40,
      posicaoX: 'medio',
      posicaoY: 'baixa',
      quadrante: 'DESGASTE OCULTO',
    },
    {
      label: 'RISCO CRÍTICO',
      scoreX: 50,
      scoreY: 40,
      posicaoX: 'baixo',
      posicaoY: 'baixa',
      quadrante: 'RISCO CRÍTICO',
    },
  ] as const;

  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_POSICOES);
  });

  it.each(casos)(
    'quadrante $label a partir de scoreX=$scoreX / scoreY=$scoreY',
    async ({ scoreX, scoreY, posicaoX, posicaoY, quadrante }) => {
      const employeeId = await createEmployee(companyId);
      const trimestre = '2026-Q1';
      await insertScoreDesempenho(companyId, employeeId, trimestre, scoreX);
      await insertPlenitudeScore(companyId, employeeId, trimestre, scoreY);

      const result = await calculateNineBoxClassification(
        client.db,
        companyId,
        employeeId,
        trimestre,
        NOW,
      );

      expect(result.calculated).toBe(true);
      if (result.calculated) {
        expect(result.posicaoX).toBe<NineBoxPosicaoX>(posicaoX);
        expect(result.posicaoY).toBe<NineBoxPosicaoY>(posicaoY);
        expect(result.quadrante).toBe<NineBoxQuadrante>(quadrante);
      }

      // Confirma persistencia canonica (S111 caminho calculado).
      const [persistedClass] = await client.db
        .select({
          posicaoX: nineBoxClassifications.posicaoX,
          posicaoY: nineBoxClassifications.posicaoY,
          quadrante: nineBoxClassifications.quadrante,
        })
        .from(nineBoxClassifications)
        .where(
          and(
            eq(nineBoxClassifications.companyId, companyId),
            eq(nineBoxClassifications.employeeId, employeeId),
            eq(nineBoxClassifications.trimestre, trimestre),
          ),
        );
      expect(persistedClass?.quadrante).toBe(quadrante);
    },
  );
});

// ============================================================
// Direcao §7.5 e prioridade diagonal
// ============================================================

describe('nineBoxCalculationEngine — direcao de movimento §7.5', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DIRECAO);
  });

  it('primeira_vez quando nao ha classificacao no trimestre anterior', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 90);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 80);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );
    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('primeira_vez');
      expect(result.quadranteAnterior).toBeNull();
    }
  });

  it('estavel quando o quadrante do trimestre anterior e o mesmo', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 90);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 80);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 92);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 82);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.quadrante).toBe<NineBoxQuadrante>('ALTO IMPACTO');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('ALTO IMPACTO');
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('estavel');
    }
  });

  it('subiu quando posicaoY passa de media para alta (X mantido)', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 70);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 60);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 70);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 80);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('subiu');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
    }
  });

  it('desceu quando posicaoY passa de alta para media (X mantido)', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 70);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 80);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 70);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 60);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('desceu');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('DESEMPENHO REPRESADO');
    }
  });

  it('lateral quando so posicaoX muda (Y mantido)', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 50);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 60);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 70);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 60);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('lateral');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('DESEMPENHO CRÍTICO');
    }
  });

  it('diagonal Y sobe + X sobe: seta reflete Y (subiu) — regra §7.5', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 50);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 40);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 90);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 80);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('subiu');
      expect(result.quadrante).toBe<NineBoxQuadrante>('ALTO IMPACTO');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('RISCO CRÍTICO');
    }
  });

  it('diagonal Y desce + X sobe: seta reflete Y (desceu) — regra §7.5', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 50);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 80);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 90);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 60);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('desceu');
      expect(result.quadrante).toBe<NineBoxQuadrante>('ALTA ENTREGA');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('POTENCIAL SUBUTILIZADO');
    }
  });

  it('diagonal Y sobe + X desce: seta reflete Y (subiu) — regra §7.5', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 90);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 40);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2026-Q1', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q2', 50);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q2', 80);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('subiu');
      expect(result.quadrante).toBe<NineBoxQuadrante>('POTENCIAL SUBUTILIZADO');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('RISCO DE ESGOTAMENTO');
    }
  });

  it('travessia de ano: 2026-Q1 tem 2025-Q4 como anterior canonico', async () => {
    const employeeId = await createEmployee(companyId);
    await insertScoreDesempenho(companyId, employeeId, '2025-Q4', 70);
    await insertPlenitudeScore(companyId, employeeId, '2025-Q4', 60);
    await calculateNineBoxClassification(client.db, companyId, employeeId, '2025-Q4', NOW);

    await insertScoreDesempenho(companyId, employeeId, '2026-Q1', 70);
    await insertPlenitudeScore(companyId, employeeId, '2026-Q1', 80);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      '2026-Q1',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('subiu');
      expect(result.quadranteAnterior).toBe<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
    }
  });
});

// ============================================================
// Thresholds da company: defaults, custom, fronteiras `<`/`>`
// ============================================================

describe('nineBoxCalculationEngine — thresholds da company e fronteiras', () => {
  it('company sem thresholds usa defaults §7.2 (60/85 X e 50/75 Y)', async () => {
    const companyId = await createCompany(CNPJ_THRESHOLDS);
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    // scoreX=70 esta ENTRE 60 e 85 → medio; scoreY=60 esta ENTRE 50 e 75 → media.
    await insertScoreDesempenho(companyId, employeeId, trimestre, 70);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );
    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.posicaoX).toBe<NineBoxPosicaoX>('medio');
      expect(result.posicaoY).toBe<NineBoxPosicaoY>('media');
      expect(result.quadrante).toBe<NineBoxQuadrante>('EQUILÍBRIO FRÁGIL');
    }
  });

  it('company com thresholds custom substitui os defaults', async () => {
    // Thresholds custom: X 40/70 e Y 30/60. Mesmo scoreX=70/scoreY=60
    // agora e alto/media (nao mais medio/media).
    const companyId = await createCompany('10000000000796', {
      thresholdDesempenhoBaixo: 40,
      thresholdDesempenhoMedio: 70,
      thresholdPlenitudeBaixo: 30,
      thresholdPlenitudeMedio: 60,
    });
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 71);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );
    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.posicaoX).toBe<NineBoxPosicaoX>('alto');
      expect(result.posicaoY).toBe<NineBoxPosicaoY>('media');
      expect(result.quadrante).toBe<NineBoxQuadrante>('ALTA ENTREGA');
    }
  });

  it('fronteira scoreX = thresholdBaixo (60) cai em medio (`<` estrito)', async () => {
    const companyId = await createCompany('10000000000797');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 60);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );
    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.posicaoX).toBe<NineBoxPosicaoX>('medio');
    }
  });

  it('fronteira scoreX = thresholdMedio (85) cai em medio (`>` estrito)', async () => {
    const companyId = await createCompany('10000000000798');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 85);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 60);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );
    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.posicaoX).toBe<NineBoxPosicaoX>('medio');
    }
  });

  it('fronteira exata scoreY = thresholdMedio (75) cai em media', async () => {
    const companyId = await createCompany('10000000000799');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 70);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 75);

    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
    );
    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.posicaoY).toBe<NineBoxPosicaoY>('media');
    }
  });
});

// ============================================================
// Persistencia canonica §7.7 (S111 dupla)
// ============================================================

describe('nineBoxCalculationEngine — persistencia canonica §7.7 (S111)', () => {
  it('caminho calculado: 1 linha em classifications + 1 log calculado (transacional)', async () => {
    const companyId = await createCompany(CNPJ_PERSISTENCIA);
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 90);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 80);

    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);

    const classRows = await client.db
      .select({
        scoreDesempenho: nineBoxClassifications.scoreDesempenho,
        plenitudeScore: nineBoxClassifications.plenitudeScore,
        quadrante: nineBoxClassifications.quadrante,
        direcaoMovimento: nineBoxClassifications.direcaoMovimento,
      })
      .from(nineBoxClassifications)
      .where(
        and(
          eq(nineBoxClassifications.employeeId, employeeId),
          eq(nineBoxClassifications.trimestre, trimestre),
        ),
      );
    expect(classRows).toHaveLength(1);
    expect(classRows[0]!.quadrante).toBe<NineBoxQuadrante>('ALTO IMPACTO');
    expect(Number(classRows[0]!.scoreDesempenho)).toBe(90);
    expect(Number(classRows[0]!.plenitudeScore)).toBe(80);
    expect(classRows[0]!.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('primeira_vez');

    const logRows = await client.db
      .select({ status: nineBoxCalculationLog.status })
      .from(nineBoxCalculationLog)
      .where(
        and(
          eq(nineBoxCalculationLog.employeeId, employeeId),
          eq(nineBoxCalculationLog.trimestre, trimestre),
        ),
      );
    expect(logRows).toHaveLength(1);
    expect(logRows[0]!.status).toBe('calculado');
  });

  it('caminho ausente: 0 linhas em classifications + 1 log com motivo canonico', async () => {
    const companyId = await createCompany('10000000000801');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    // Nem X nem Y presentes → ambos_ausentes.

    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);

    const classRows = await client.db
      .select({ id: nineBoxClassifications.id })
      .from(nineBoxClassifications)
      .where(
        and(
          eq(nineBoxClassifications.employeeId, employeeId),
          eq(nineBoxClassifications.trimestre, trimestre),
        ),
      );
    expect(classRows).toHaveLength(0);

    const logRows = await client.db
      .select({ status: nineBoxCalculationLog.status })
      .from(nineBoxCalculationLog)
      .where(
        and(
          eq(nineBoxCalculationLog.employeeId, employeeId),
          eq(nineBoxCalculationLog.trimestre, trimestre),
        ),
      );
    expect(logRows).toHaveLength(1);
    expect(logRows[0]!.status).toBe('ambos_ausentes');
  });
});

// ============================================================
// Reexecucao §7.8 (UPSERT sobrescreve; log append-only cresce)
// ============================================================

describe('nineBoxCalculationEngine — reexecucao §7.8', () => {
  it('reexecucao sobrescreve classifications (1 linha por trio) — regua RV-03', async () => {
    const companyId = await createCompany(CNPJ_REEXECUCAO);
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 90);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 80);

    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);
    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);
    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);

    const classRows = await client.db
      .select({ id: nineBoxClassifications.id })
      .from(nineBoxClassifications)
      .where(
        and(
          eq(nineBoxClassifications.employeeId, employeeId),
          eq(nineBoxClassifications.trimestre, trimestre),
        ),
      );
    expect(classRows).toHaveLength(1);
  });

  it('reexecucao mantem log append-only crescendo (§7.8 literal)', async () => {
    const companyId = await createCompany('10000000000802');
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertScoreDesempenho(companyId, employeeId, trimestre, 90);
    await insertPlenitudeScore(companyId, employeeId, trimestre, 80);

    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);
    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);
    await calculateNineBoxClassification(client.db, companyId, employeeId, trimestre, NOW);

    const logRows = await client.db
      .select({ id: nineBoxCalculationLog.id })
      .from(nineBoxCalculationLog)
      .where(
        and(
          eq(nineBoxCalculationLog.employeeId, employeeId),
          eq(nineBoxCalculationLog.trimestre, trimestre),
        ),
      );
    expect(logRows).toHaveLength(3);
  });
});

// ============================================================
// Dogfood da chain via `recalculatePlenitude` (S112/S113)
// ============================================================

describe('nineBoxCalculationEngine — dogfood da chain via plenitude (S112/S113)', () => {
  let companyId: number;
  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CHAIN);
  });

  it('plenitude com A e C completos aciona 9-Box UMA vez (S112)', async () => {
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertRespostasA(companyId, employeeId, trimestre, 3);
    await insertAvaliacoesC(companyId, employeeId, trimestre, 3);

    let chamadas = 0;
    let ultimoInput: {
      companyId: number;
      employeeId: number;
      trimestre: string;
    } | null = null;
    const spy: NineBoxEngineFacade = {
      calculateNineBoxClassification: async (_db, cId, eId, trim) => {
        chamadas += 1;
        ultimoInput = { companyId: cId, employeeId: eId, trimestre: trim };
        return {
          calculated: false,
          companyId: cId,
          employeeId: eId,
          trimestre: trim,
          motivo: 'ambos_ausentes',
          calculadoEm: NOW,
        };
      },
    };

    await recalculatePlenitude(client.db, companyId, employeeId, trimestre, NOW, spy);

    expect(chamadas).toBe(1);
    expect(ultimoInput).toEqual({ companyId, employeeId, trimestre });
  });

  it('plenitude com so A (C ausente) NAO aciona 9-Box (motivo != ambos_completos)', async () => {
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertRespostasA(companyId, employeeId, trimestre, 3);
    // C ausente → plenitude motivo = 'instrumento_c_ausente' → sem hook.

    let chamadas = 0;
    const spy: NineBoxEngineFacade = {
      calculateNineBoxClassification: async () => {
        chamadas += 1;
        return {
          calculated: false,
          companyId,
          employeeId,
          trimestre,
          motivo: 'ambos_ausentes',
          calculadoEm: NOW,
        };
      },
    };

    const plenResult = await recalculatePlenitude(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
      spy,
    );

    expect(plenResult.motivo).toBe('instrumento_c_ausente');
    expect(chamadas).toBe(0);
  });

  it('plenitude sem A nem C NAO aciona 9-Box (motivo ambos_ausentes)', async () => {
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';

    let chamadas = 0;
    const spy: NineBoxEngineFacade = {
      calculateNineBoxClassification: async () => {
        chamadas += 1;
        return {
          calculated: false,
          companyId,
          employeeId,
          trimestre,
          motivo: 'ambos_ausentes',
          calculadoEm: NOW,
        };
      },
    };

    const plenResult = await recalculatePlenitude(
      client.db,
      companyId,
      employeeId,
      trimestre,
      NOW,
      spy,
    );

    expect(plenResult.motivo).toBe('ambos_ausentes');
    expect(chamadas).toBe(0);
  });

  it('excecao do 9-Box propaga ao caller do plenitude (S117)', async () => {
    const employeeId = await createEmployee(companyId);
    const trimestre = '2026-Q1';
    await insertRespostasA(companyId, employeeId, trimestre, 3);
    await insertAvaliacoesC(companyId, employeeId, trimestre, 3);

    const explosivo: NineBoxEngineFacade = {
      async calculateNineBoxClassification(): Promise<NineBoxCalculationResult> {
        throw new Error('9-Box falhou por defeito canonizado S117');
      },
    };

    await expect(
      recalculatePlenitude(client.db, companyId, employeeId, trimestre, NOW, explosivo),
    ).rejects.toThrow('9-Box falhou');

    // Plenitude ja foi upsertado (S110): commit do plenitude preservado.
    const [plen] = await client.db
      .select({ plenitudeScore: plenitudeData.plenitudeScore })
      .from(plenitudeData)
      .where(and(eq(plenitudeData.employeeId, employeeId), eq(plenitudeData.trimestre, trimestre)));
    expect(plen).toBeDefined();
    expect(plen!.plenitudeScore).not.toBeNull();
  });
});

// ============================================================
// Isolamento canonico (companies, employees, trimestres)
// ============================================================

describe('nineBoxCalculationEngine — isolamento canonico', () => {
  it('motor de company A NAO enxerga classificacao anterior de company B', async () => {
    const companyA = await createCompany(CNPJ_ISOLAMENTO);
    const companyB = await createCompany('10000000000803');
    const employeeA = await createEmployee(companyA);
    const employeeB = await createEmployee(companyB);

    // Estado anterior em companyB (nao deve influenciar companyA).
    await insertScoreDesempenho(companyB, employeeB, '2025-Q4', 90);
    await insertPlenitudeScore(companyB, employeeB, '2025-Q4', 80);
    await calculateNineBoxClassification(client.db, companyB, employeeB, '2025-Q4', NOW);

    // employeeA no mesmo trimestre atual (2026-Q1): sem anterior → primeira_vez.
    await insertScoreDesempenho(companyA, employeeA, '2026-Q1', 70);
    await insertPlenitudeScore(companyA, employeeA, '2026-Q1', 60);
    const result = await calculateNineBoxClassification(
      client.db,
      companyA,
      employeeA,
      '2026-Q1',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('primeira_vez');
      expect(result.quadranteAnterior).toBeNull();
    }
  });

  it('motor de employee A NAO enxerga classificacao de employee B (mesma company)', async () => {
    const companyId = await createCompany('10000000000804');
    const employeeA = await createEmployee(companyId);
    const employeeB = await createEmployee(companyId);

    // employeeB tem estado anterior; employeeA nao.
    await insertScoreDesempenho(companyId, employeeB, '2025-Q4', 90);
    await insertPlenitudeScore(companyId, employeeB, '2025-Q4', 80);
    await calculateNineBoxClassification(client.db, companyId, employeeB, '2025-Q4', NOW);

    await insertScoreDesempenho(companyId, employeeA, '2026-Q1', 70);
    await insertPlenitudeScore(companyId, employeeA, '2026-Q1', 60);
    const result = await calculateNineBoxClassification(
      client.db,
      companyId,
      employeeA,
      '2026-Q1',
      NOW,
    );

    expect(result.calculated).toBe(true);
    if (result.calculated) {
      expect(result.direcaoMovimento).toBe<NineBoxDirecaoMovimento>('primeira_vez');
    }
  });
});
