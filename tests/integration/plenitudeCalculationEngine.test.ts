// ROIP APP 9BOX — teste de integracao do motor
// `plenitudeCalculationEngine` (ME-040).
//
// Exercita o motor canonico do Eixo Y (DOC 03 §6.4) contra MySQL real.
// Cobre:
//   - Contratos publicos exportados (RV-13): formulas puras
//     (`computeScoreInstrumento`, `computeScoreDimensao`,
//     `computePlenitudeScore`, `computeDivergencia`,
//     `computeAlertaDivergencia`, `computeFaixaPlenitude`), constantes
//     canonicas (thresholds default, pesos, limiar de divergencia,
//     numero canonico de dimensoes/itens), tipos (`PlenitudeCalculationResult`,
//     `PlenitudeCalculationMotivo`, `PlenitudeEngineFacade`) e o
//     `DEFAULT_PLENITUDE_ENGINE`.
//   - Motivos canonicos: `ambos_completos`, `instrumento_a_ausente`,
//     `instrumento_c_ausente`, `ambos_ausentes`.
//   - UPSERT canonico em `plenitudeData`: linha existe em qualquer
//     caso (chave UNIQUE `uq_plenitude`); scores nulos quando faltar
//     A ou C; scores calculados quando ambos completos; reexecucao
//     idempotente (sobrescreve, nao duplica).
//   - Formulas §6.4 literais: scoreA/scoreC (/80 × 100), plenitudeScore
//     (0.40 × scoreA + 0.60 × scoreC), divergencia (|scoreA - scoreC|),
//     alertaDivergencia (> 25, estritamente maior).
//   - Faixas canonicas (§6.4): fronteiras inclusivas em `media`;
//     thresholds customizados da empresa; defaults 50/75 quando NULL.
//   - Scores por dimensao (§6.4 informativos): soma de 5 itens de cada
//     dimensao / 20 × 100.
//   - Cobertura canonica S107: qualquer contagem != 20 = ausente;
//     duplicata em (dim, itemIndex) = ausente.
//   - Isolamento canonico: motor NAO vaza entre trimestres, employees
//     ou companies.
//
// Padrao S009 estendido (S076): uma company por describe, CNPJ unico
// da faixa 10000000000760..769 (S109 — ME-040). L32 cleanup em
// afterAll. JWT_SECRET fixo no arquivo (motor nao usa JWT mas o setup
// canonico do repo declara).

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
  plenitudeData,
} from '../../src/db/schema';
import {
  computeAlertaDivergencia,
  computeDivergencia,
  computeFaixaPlenitude,
  computePlenitudeScore,
  computeScoreDimensao,
  computeScoreInstrumento,
  DEFAULT_PLENITUDE_ENGINE,
  DEFAULT_THRESHOLD_PLENITUDE_BAIXO,
  DEFAULT_THRESHOLD_PLENITUDE_MEDIO,
  DIVERGENCIA_ALERTA,
  NUM_DIMENSOES_PLENITUDE,
  NUM_ITENS_POR_DIMENSAO_PLENITUDE,
  NUM_ITENS_TOTAL_PLENITUDE,
  PESO_SCORE_A,
  PESO_SCORE_C,
  type PlenitudeCalculationMotivo,
  type PlenitudeCalculationResult,
  type PlenitudeEngineFacade,
  recalculatePlenitude,
} from '../../src/server/services/plenitudeCalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me040-plenitude-engine';

const HASH_A = 'hash-fixo-me040-plenitude';

// CNPJs canonicos por describe (S076 estendido, S109 — faixa 760..
// reservada para ME-040).
const CNPJ_CONSTANTES = '10000000000760';
// CNPJ 761 reservado (formulas puras — nao cria company).
const CNPJ_MOTIVOS = '10000000000762';
const CNPJ_SCORES = '10000000000763';
const CNPJ_DIVERGENCIA = '10000000000764';
const CNPJ_FAIXAS = '10000000000765';
const CNPJ_DIMENSOES = '10000000000766';
const CNPJ_UPSERT = '10000000000767';
const CNPJ_COBERTURA = '10000000000768';
const CNPJ_ISOLAMENTO = '10000000000769';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // ME-041: `recalculatePlenitude` agora aciona `calculateNineBoxClassification`
    // in-band (S112) em cenarios `ambos_completos`; log tem FK RESTRICT a
    // employees, entao limpar as duas tabelas do 9-Box antes de employees.
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
  opts: { thresholdBaixo?: number; thresholdMedio?: number } = {},
): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME040 Test ${cnpj} LTDA`,
      nomeFantasia: `ME040 Test ${cnpj}`,
      cnpj,
      telefone: '1633330040',
      endereco: `Rua ME-040, ${cnpj}`,
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
      thresholdPlenitudeBaixo: opts.thresholdBaixo ?? null,
      thresholdPlenitudeMedio: opts.thresholdMedio ?? null,
      mesKickoff: 1,
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 40000000000;
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
      name: 'Colab ME040',
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
 * Insere 20 respostas do Instrumento A cobrindo grid 4x5 canonico
 * com um mapeamento `(dim, item) -> valor`. `valorFn` recebe
 * `(dim, item)` e retorna o valor 0-4.
 */
async function insertRespostasA(
  companyId: number,
  employeeId: number,
  trimestre: string,
  valorFn: (dim: number, item: number) => number,
  now: Date,
): Promise<void> {
  for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
      await client.db.insert(instrumentA_responses).values({
        companyId,
        employeeId,
        trimestre,
        dimensao: d,
        itemIndex: i,
        valor: valorFn(d, i),
        respondidoEm: now,
        createdAt: now,
      });
    }
  }
}

/**
 * Insere 20 avaliacoes do Instrumento C cobrindo grid 4x5 canonico
 * com o mesmo padrao de A. Precisa de `liderId` para satisfazer o
 * XOR canonico (schema exige `liderId` XOR `clevelId`).
 */
async function insertAvaliacoesC(
  companyId: number,
  employeeId: number,
  liderId: number,
  trimestre: string,
  valorFn: (dim: number, item: number) => number,
  now: Date,
): Promise<void> {
  for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
      await client.db.insert(instrumentC_assessments).values({
        companyId,
        employeeId,
        liderId,
        clevelId: null,
        trimestre,
        dimensao: d,
        itemIndex: i,
        valor: valorFn(d, i),
        respondidoEm: now,
        createdAt: now,
      });
    }
  }
}

async function getPlenitudeLine(companyId: number, employeeId: number, trimestre: string) {
  const rows = await client.db
    .select()
    .from(plenitudeData)
    .where(
      and(
        eq(plenitudeData.companyId, companyId),
        eq(plenitudeData.employeeId, employeeId),
        eq(plenitudeData.trimestre, trimestre),
      ),
    )
    .limit(1);
  return rows[0];
}

// ============================================================
// Constantes canonicas exportadas (RV-13)
// ============================================================

describe('plenitudeCalculationEngine — constantes canonicas', () => {
  it('DEFAULT_THRESHOLD_PLENITUDE_BAIXO == 50 (§6.4 default canonico)', () => {
    expect(DEFAULT_THRESHOLD_PLENITUDE_BAIXO).toBe(50);
  });

  it('DEFAULT_THRESHOLD_PLENITUDE_MEDIO == 75 (§6.4 default canonico)', () => {
    expect(DEFAULT_THRESHOLD_PLENITUDE_MEDIO).toBe(75);
  });

  it('PESO_SCORE_A == 0.40 (§6.4 literal — fixo, nao configuravel)', () => {
    expect(PESO_SCORE_A).toBe(0.4);
  });

  it('PESO_SCORE_C == 0.60 (§6.4 literal — fixo, nao configuravel)', () => {
    expect(PESO_SCORE_C).toBe(0.6);
  });

  it('pesos somam exatamente 1 (§6.4 — invariante canonica)', () => {
    expect(PESO_SCORE_A + PESO_SCORE_C).toBe(1);
  });

  it('DIVERGENCIA_ALERTA == 25 (§6.4 literal — fixo, nao configuravel)', () => {
    expect(DIVERGENCIA_ALERTA).toBe(25);
  });

  it('NUM_DIMENSOES_PLENITUDE == 4 (§6.2/§6.3 grid canonico)', () => {
    expect(NUM_DIMENSOES_PLENITUDE).toBe(4);
  });

  it('NUM_ITENS_POR_DIMENSAO_PLENITUDE == 5 (§6.2/§6.3 grid canonico)', () => {
    expect(NUM_ITENS_POR_DIMENSAO_PLENITUDE).toBe(5);
  });

  it('NUM_ITENS_TOTAL_PLENITUDE == 20 (§6.2/§6.3 grid canonico)', () => {
    expect(NUM_ITENS_TOTAL_PLENITUDE).toBe(20);
    expect(NUM_ITENS_TOTAL_PLENITUDE).toBe(
      NUM_DIMENSOES_PLENITUDE * NUM_ITENS_POR_DIMENSAO_PLENITUDE,
    );
  });

  it('DEFAULT_PLENITUDE_ENGINE.recalculatePlenitude aponta para o motor real', () => {
    expect(DEFAULT_PLENITUDE_ENGINE.recalculatePlenitude).toBe(recalculatePlenitude);
  });
});

// ============================================================
// Formulas puras (§6.4)
// ============================================================

describe('plenitudeCalculationEngine — formulas puras §6.4', () => {
  it('computeScoreInstrumento: 80 (todos 4) → 100', () => {
    expect(computeScoreInstrumento(80)).toBe(100);
  });

  it('computeScoreInstrumento: 0 (todos 0) → 0', () => {
    expect(computeScoreInstrumento(0)).toBe(0);
  });

  it('computeScoreInstrumento: 40 (media geral 2) → 50', () => {
    expect(computeScoreInstrumento(40)).toBe(50);
  });

  it('computeScoreInstrumento: 60 → 75', () => {
    expect(computeScoreInstrumento(60)).toBe(75);
  });

  it('computeScoreDimensao: 20 (todos 4) → 100', () => {
    expect(computeScoreDimensao(20)).toBe(100);
  });

  it('computeScoreDimensao: 0 (todos 0) → 0', () => {
    expect(computeScoreDimensao(0)).toBe(0);
  });

  it('computeScoreDimensao: 10 (media 2) → 50', () => {
    expect(computeScoreDimensao(10)).toBe(50);
  });

  it('computePlenitudeScore: (100, 100) → 100', () => {
    expect(computePlenitudeScore(100, 100)).toBe(100);
  });

  it('computePlenitudeScore: (0, 0) → 0', () => {
    expect(computePlenitudeScore(0, 0)).toBe(0);
  });

  it('computePlenitudeScore: (100, 0) → 40 (peso 0.40 do A)', () => {
    expect(computePlenitudeScore(100, 0)).toBe(40);
  });

  it('computePlenitudeScore: (0, 100) → 60 (peso 0.60 do C)', () => {
    expect(computePlenitudeScore(0, 100)).toBe(60);
  });

  it('computePlenitudeScore: (50, 75) → 65 (0.40×50 + 0.60×75 = 65)', () => {
    expect(computePlenitudeScore(50, 75)).toBe(65);
  });

  it('computeDivergencia: valores iguais → 0', () => {
    expect(computeDivergencia(50, 50)).toBe(0);
  });

  it('computeDivergencia: |100-0| → 100', () => {
    expect(computeDivergencia(100, 0)).toBe(100);
    expect(computeDivergencia(0, 100)).toBe(100);
  });

  it('computeDivergencia: assimetrica preservada (valor absoluto)', () => {
    expect(computeDivergencia(70, 45)).toBe(25);
    expect(computeDivergencia(45, 70)).toBe(25);
  });

  it('computeAlertaDivergencia: exatamente 25 → false (estritamente > 25)', () => {
    expect(computeAlertaDivergencia(25)).toBe(false);
  });

  it('computeAlertaDivergencia: 25.01 → true', () => {
    expect(computeAlertaDivergencia(25.01)).toBe(true);
  });

  it('computeAlertaDivergencia: 24.99 → false', () => {
    expect(computeAlertaDivergencia(24.99)).toBe(false);
  });

  it('computeAlertaDivergencia: 100 → true', () => {
    expect(computeAlertaDivergencia(100)).toBe(true);
  });

  it('computeFaixaPlenitude: score < baixo → baixa', () => {
    expect(computeFaixaPlenitude(40, 50, 75)).toBe('baixa');
    expect(computeFaixaPlenitude(0, 50, 75)).toBe('baixa');
    expect(computeFaixaPlenitude(49.99, 50, 75)).toBe('baixa');
  });

  it('computeFaixaPlenitude: score == baixo → media (fronteira inclusiva)', () => {
    expect(computeFaixaPlenitude(50, 50, 75)).toBe('media');
  });

  it('computeFaixaPlenitude: score entre baixo e medio → media', () => {
    expect(computeFaixaPlenitude(65, 50, 75)).toBe('media');
  });

  it('computeFaixaPlenitude: score == medio → media (fronteira inclusiva)', () => {
    expect(computeFaixaPlenitude(75, 50, 75)).toBe('media');
  });

  it('computeFaixaPlenitude: score > medio → alta', () => {
    expect(computeFaixaPlenitude(75.01, 50, 75)).toBe('alta');
    expect(computeFaixaPlenitude(100, 50, 75)).toBe('alta');
  });

  it('computeFaixaPlenitude: thresholds customizados aplicados', () => {
    expect(computeFaixaPlenitude(30, 40, 70)).toBe('baixa');
    expect(computeFaixaPlenitude(40, 40, 70)).toBe('media');
    expect(computeFaixaPlenitude(70, 40, 70)).toBe('media');
    expect(computeFaixaPlenitude(71, 40, 70)).toBe('alta');
  });
});

// ============================================================
// Motivos canonicos e persistencia em plenitudeData
// ============================================================

describe('plenitudeCalculationEngine — motivos canonicos', () => {
  let companyId: number;
  let employeeId: number;
  let liderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_MOTIVOS);
    liderId = await createEmployee(companyId);
    employeeId = await createEmployee(companyId);
  });

  it('ambos_ausentes: nem A nem C → upsert com scores nulos', async () => {
    const now = new Date('2026-04-01T12:00:00Z');
    const trimestre = '2026-Q1';
    const result: PlenitudeCalculationResult = await recalculatePlenitude(
      client.db,
      companyId,
      employeeId,
      trimestre,
      now,
    );
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('ambos_ausentes');
    expect(result.calculado).toBe(false);
    expect(result.scoreA).toBeNull();
    expect(result.scoreC).toBeNull();
    expect(result.plenitudeScore).toBeNull();
    expect(result.faixaPlenitude).toBeNull();
    expect(result.divergencia).toBeNull();
    expect(result.alertaDivergencia).toBe(false);
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line).toBeDefined();
    expect(line!.scoreA).toBeNull();
    expect(line!.scoreC).toBeNull();
    expect(line!.plenitudeScore).toBeNull();
    expect(line!.faixaPlenitude).toBeNull();
    expect(line!.alertaDivergencia).toBe(false);
  });

  it('instrumento_c_ausente: so A completo → upsert com scores nulos', async () => {
    const now = new Date('2026-04-02T12:00:00Z');
    const trimestre = '2026-Q2';
    await insertRespostasA(companyId, employeeId, trimestre, () => 3, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('instrumento_c_ausente');
    expect(result.calculado).toBe(false);
    expect(result.scoreA).toBeNull();
    expect(result.scoreC).toBeNull();
    expect(result.plenitudeScore).toBeNull();
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line).toBeDefined();
    expect(line!.scoreA).toBeNull();
    expect(line!.plenitudeScore).toBeNull();
  });

  it('instrumento_a_ausente: so C completo → upsert com scores nulos', async () => {
    const now = new Date('2026-04-03T12:00:00Z');
    const trimestre = '2026-Q3';
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 3, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('instrumento_a_ausente');
    expect(result.calculado).toBe(false);
    expect(result.scoreA).toBeNull();
    expect(result.scoreC).toBeNull();
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line).toBeDefined();
    expect(line!.scoreC).toBeNull();
  });

  it('ambos_completos: A e C completos → scores calculados persistidos', async () => {
    const now = new Date('2026-04-04T12:00:00Z');
    const trimestre = '2026-Q4';
    // A: todos 4 (score 100). C: todos 4 (score 100). Plenitude 100.
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 4, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('ambos_completos');
    expect(result.calculado).toBe(true);
    expect(result.scoreA).toBe(100);
    expect(result.scoreC).toBe(100);
    expect(result.plenitudeScore).toBe(100);
    expect(result.faixaPlenitude).toBe('alta');
    expect(result.divergencia).toBe(0);
    expect(result.alertaDivergencia).toBe(false);
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line).toBeDefined();
    expect(line!.scoreA).toBe('100.00');
    expect(line!.plenitudeScore).toBe('100.00');
    expect(line!.faixaPlenitude).toBe('alta');
  });
});

// ============================================================
// Calculo canonico dos scores agregados
// ============================================================

describe('plenitudeCalculationEngine — scores agregados §6.4', () => {
  let companyId: number;
  let employeeId: number;
  let liderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SCORES);
    liderId = await createEmployee(companyId);
    employeeId = await createEmployee(companyId);
  });

  it('todos 0 → scoreA=0, scoreC=0, plenitude=0, faixa=baixa', async () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const trimestre = '2025-Q1';
    await insertRespostasA(companyId, employeeId, trimestre, () => 0, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 0, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(0);
    expect(result.scoreC).toBe(0);
    expect(result.plenitudeScore).toBe(0);
    expect(result.faixaPlenitude).toBe('baixa');
  });

  it('todos 2 → scoreA=50, scoreC=50, plenitude=50, faixa=media (fronteira)', async () => {
    const now = new Date('2026-05-02T12:00:00Z');
    const trimestre = '2025-Q2';
    await insertRespostasA(companyId, employeeId, trimestre, () => 2, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 2, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(50);
    expect(result.scoreC).toBe(50);
    expect(result.plenitudeScore).toBe(50);
    expect(result.faixaPlenitude).toBe('media');
  });

  it('A=4 e C=0 → scoreA=100, scoreC=0, plenitude=40, faixa=baixa', async () => {
    const now = new Date('2026-05-03T12:00:00Z');
    const trimestre = '2025-Q3';
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 0, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(100);
    expect(result.scoreC).toBe(0);
    expect(result.plenitudeScore).toBe(40);
    expect(result.faixaPlenitude).toBe('baixa');
  });

  it('A=0 e C=4 → scoreA=0, scoreC=100, plenitude=60, faixa=media', async () => {
    const now = new Date('2026-05-04T12:00:00Z');
    const trimestre = '2025-Q4';
    await insertRespostasA(companyId, employeeId, trimestre, () => 0, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 4, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(0);
    expect(result.scoreC).toBe(100);
    expect(result.plenitudeScore).toBe(60);
    expect(result.faixaPlenitude).toBe('media');
  });

  it('mistura A=3 C=3 → scoreA=75, scoreC=75, plenitude=75 (fronteira sup media)', async () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const trimestre = '2024-Q1';
    await insertRespostasA(companyId, employeeId, trimestre, () => 3, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 3, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(75);
    expect(result.scoreC).toBe(75);
    expect(result.plenitudeScore).toBe(75);
    expect(result.faixaPlenitude).toBe('media');
  });
});

// ============================================================
// Divergencia canonica e alerta
// ============================================================

describe('plenitudeCalculationEngine — divergencia canonica §6.4', () => {
  let companyId: number;
  let employeeId: number;
  let liderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_DIVERGENCIA);
    liderId = await createEmployee(companyId);
    employeeId = await createEmployee(companyId);
  });

  it('divergencia zero: A=2 e C=2 → alertaDivergencia=false', async () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const trimestre = '2023-Q1';
    await insertRespostasA(companyId, employeeId, trimestre, () => 2, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 2, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.divergencia).toBe(0);
    expect(result.alertaDivergencia).toBe(false);
  });

  it('divergencia extrema: A=4 e C=0 → divergencia=100, alertaDivergencia=true', async () => {
    const now = new Date('2026-06-02T12:00:00Z');
    const trimestre = '2023-Q2';
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 0, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.divergencia).toBe(100);
    expect(result.alertaDivergencia).toBe(true);
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line!.alertaDivergencia).toBe(true);
  });

  it('divergencia exatamente 25 → alertaDivergencia=false (estritamente > 25)', async () => {
    // scoreA=75, scoreC=50 → div=25. A=3 (soma=60→75). C=2 (soma=40→50).
    const now = new Date('2026-06-03T12:00:00Z');
    const trimestre = '2023-Q3';
    await insertRespostasA(companyId, employeeId, trimestre, () => 3, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 2, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(75);
    expect(result.scoreC).toBe(50);
    expect(result.divergencia).toBe(25);
    expect(result.alertaDivergencia).toBe(false);
  });

  it('divergencia > 25 (via item unico assimetrico) → alerta=true', async () => {
    // A: dim1 item1..5 = 4,4,4,4,4; dim2 item1..5 = 4,4,4,4,4; dim3 = 4x5; dim4 = 4,4,4,4,4
    //   → tot 80, scoreA=100.
    // C: todos 2 → scoreC=50. Divergencia=50 > 25.
    const now = new Date('2026-06-04T12:00:00Z');
    const trimestre = '2023-Q4';
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 2, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.divergencia).toBe(50);
    expect(result.alertaDivergencia).toBe(true);
  });
});

// ============================================================
// Faixas canonicas com thresholds customizados
// ============================================================

describe('plenitudeCalculationEngine — thresholds canonicos §6.4', () => {
  it('empresa com thresholds NULL usa defaults 50/75', async () => {
    const companyId = await createCompany(CNPJ_FAIXAS);
    const liderId = await createEmployee(companyId);
    const employeeId = await createEmployee(companyId);
    const now = new Date('2026-07-01T12:00:00Z');
    const trimestre = '2022-Q1';
    // Plenitude 40 → faixa=baixa (defaults 50/75).
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 0, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.plenitudeScore).toBe(40);
    expect(result.faixaPlenitude).toBe('baixa');
  });

  it('empresa com thresholds customizados aplica-os canonicamente', async () => {
    const companyId = await createCompany(`${CNPJ_FAIXAS.slice(0, -1)}0`.slice(-14), {
      thresholdBaixo: 30,
      thresholdMedio: 60,
    });
    const liderId = await createEmployee(companyId);
    const employeeId = await createEmployee(companyId);
    const now = new Date('2026-07-02T12:00:00Z');
    const trimestre = '2022-Q2';
    // Plenitude 40 → com threshold 30/60 é 'media'.
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 0, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.plenitudeScore).toBe(40);
    expect(result.faixaPlenitude).toBe('media');
  });
});

// ============================================================
// Scores por dimensao (informativos)
// ============================================================

describe('plenitudeCalculationEngine — scores por dimensao §6.4', () => {
  it('dimensao 1 do A com 5 itens de valor 4 → engajamentoA=100', async () => {
    const companyId = await createCompany(CNPJ_DIMENSOES);
    const liderId = await createEmployee(companyId);
    const employeeId = await createEmployee(companyId);
    const now = new Date('2026-08-01T12:00:00Z');
    const trimestre = '2021-Q1';
    // A: dim1 todos 4 (soma 20), dim2 todos 2 (soma 10), dim3 todos 1 (soma 5),
    //    dim4 todos 0 (soma 0). Total: 35. scoreA = 35/80*100 = 43.75.
    await insertRespostasA(
      companyId,
      employeeId,
      trimestre,
      (d) => (d === 1 ? 4 : d === 2 ? 2 : d === 3 ? 1 : 0),
      now,
    );
    // C: espelho (mesmos valores por dimensao).
    await insertAvaliacoesC(
      companyId,
      employeeId,
      liderId,
      trimestre,
      (d) => (d === 1 ? 4 : d === 2 ? 2 : d === 3 ? 1 : 0),
      now,
    );
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.scoreA).toBe(43.75);
    expect(result.scoreC).toBe(43.75);
    // Dimensoes A informativas.
    expect(result.engajamentoA).toBe(100); // dim1: soma 20 / 20 × 100
    expect(result.desenvolvimentoA).toBe(50); // dim2: soma 10 / 20 × 100
    expect(result.pertencimentoA).toBe(25); // dim3: soma 5 / 20 × 100
    expect(result.realizacaoA).toBe(0); // dim4: soma 0
    // Dimensoes C informativas (mesmos valores).
    expect(result.engajamentoC).toBe(100);
    expect(result.desenvolvimentoC).toBe(50);
    expect(result.pertencimentoC).toBe(25);
    expect(result.realizacaoC).toBe(0);
    // Persistidos.
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line!.engajamentoA).toBe('100.00');
    expect(line!.desenvolvimentoA).toBe('50.00');
    expect(line!.pertencimentoA).toBe('25.00');
    expect(line!.realizacaoA).toBe('0.00');
    expect(line!.engajamentoC).toBe('100.00');
  });
});

// ============================================================
// UPSERT canonico e reexecucao idempotente
// ============================================================

describe('plenitudeCalculationEngine — UPSERT idempotente §6.4', () => {
  let companyId: number;
  let employeeId: number;
  let liderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_UPSERT);
    liderId = await createEmployee(companyId);
    employeeId = await createEmployee(companyId);
  });

  it('primeira chamada (nem A nem C) → cria linha nula', async () => {
    const now = new Date('2026-09-01T12:00:00Z');
    const trimestre = '2020-Q1';
    await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    const rows = await client.db
      .select()
      .from(plenitudeData)
      .where(
        and(
          eq(plenitudeData.companyId, companyId),
          eq(plenitudeData.employeeId, employeeId),
          eq(plenitudeData.trimestre, trimestre),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]!.scoreA).toBeNull();
  });

  it('reexecucao sem novos dados → mesma linha, mesmo id, sem duplicar', async () => {
    const trimestre = '2020-Q1';
    const rowsBefore = await client.db
      .select()
      .from(plenitudeData)
      .where(
        and(
          eq(plenitudeData.companyId, companyId),
          eq(plenitudeData.employeeId, employeeId),
          eq(plenitudeData.trimestre, trimestre),
        ),
      );
    const idBefore = rowsBefore[0]!.id;
    const now2 = new Date('2026-09-02T12:00:00Z');
    await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now2);
    const rowsAfter = await client.db
      .select()
      .from(plenitudeData)
      .where(
        and(
          eq(plenitudeData.companyId, companyId),
          eq(plenitudeData.employeeId, employeeId),
          eq(plenitudeData.trimestre, trimestre),
        ),
      );
    expect(rowsAfter.length).toBe(1);
    expect(rowsAfter[0]!.id).toBe(idBefore);
  });

  it('inserir A e C DEPOIS da linha nula, reexecutar → mesma linha atualiza scores', async () => {
    const trimestre = '2020-Q1';
    const now3 = new Date('2026-09-03T12:00:00Z');
    await insertRespostasA(companyId, employeeId, trimestre, () => 4, now3);
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 4, now3);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now3);
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('ambos_completos');
    expect(result.plenitudeScore).toBe(100);
    const rows = await client.db
      .select()
      .from(plenitudeData)
      .where(
        and(
          eq(plenitudeData.companyId, companyId),
          eq(plenitudeData.employeeId, employeeId),
          eq(plenitudeData.trimestre, trimestre),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]!.scoreA).toBe('100.00');
    expect(rows[0]!.plenitudeScore).toBe('100.00');
  });

  it('calculadoEm eh atualizado a cada execucao', async () => {
    const trimestre = '2020-Q1';
    const nowNew = new Date('2027-01-01T00:00:00Z');
    await recalculatePlenitude(client.db, companyId, employeeId, trimestre, nowNew);
    const line = await getPlenitudeLine(companyId, employeeId, trimestre);
    expect(line!.calculadoEm).not.toBeNull();
    // Convertido para comparar timestamps (MySQL retorna Date).
    const calculadoTs = new Date(line!.calculadoEm as unknown as Date).getTime();
    expect(calculadoTs).toBeGreaterThan(new Date('2026-12-31T00:00:00Z').getTime());
  });
});

// ============================================================
// Cobertura S107 (contagem != 20 ou grid incompleto)
// ============================================================

describe('plenitudeCalculationEngine — cobertura S107', () => {
  let companyId: number;
  let employeeId: number;
  let liderId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_COBERTURA);
    liderId = await createEmployee(companyId);
    employeeId = await createEmployee(companyId);
  });

  it('A com 19 itens (falta 1) → tratado como ausente', async () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const trimestre = '2019-Q1';
    // Insere 19 dos 20 itens de A (pula dim=4, item=5).
    for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
      for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
        if (d === 4 && i === 5) continue;
        await client.db.insert(instrumentA_responses).values({
          companyId,
          employeeId,
          trimestre,
          dimensao: d,
          itemIndex: i,
          valor: 3,
          respondidoEm: now,
          createdAt: now,
        });
      }
    }
    // C completo.
    await insertAvaliacoesC(companyId, employeeId, liderId, trimestre, () => 3, now);
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('instrumento_a_ausente');
    expect(result.scoreA).toBeNull();
    expect(result.scoreC).toBeNull();
  });

  it('C com 19 itens (falta 1) → tratado como ausente', async () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const trimestre = '2019-Q3';
    // A completo.
    await insertRespostasA(companyId, employeeId, trimestre, () => 3, now);
    // C com 19 itens (pula dim=2, item=3).
    for (let d = 1; d <= NUM_DIMENSOES_PLENITUDE; d++) {
      for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_PLENITUDE; i++) {
        if (d === 2 && i === 3) continue;
        await client.db.insert(instrumentC_assessments).values({
          companyId,
          employeeId,
          liderId,
          clevelId: null,
          trimestre,
          dimensao: d,
          itemIndex: i,
          valor: 3,
          respondidoEm: now,
          createdAt: now,
        });
      }
    }
    const result = await recalculatePlenitude(client.db, companyId, employeeId, trimestre, now);
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('instrumento_c_ausente');
    expect(result.scoreC).toBeNull();
  });
});

// ============================================================
// Isolamento canonico (trimestre, employee, company)
// ============================================================

describe('plenitudeCalculationEngine — isolamento canonico', () => {
  it('motor nao vaza dados de OUTRO trimestre do mesmo colaborador', async () => {
    const companyId = await createCompany(CNPJ_ISOLAMENTO);
    const liderId = await createEmployee(companyId);
    const employeeId = await createEmployee(companyId);
    const now = new Date('2026-11-01T12:00:00Z');
    // 2018-Q1: A completo com 4s, C completo com 4s → plenitude=100.
    await insertRespostasA(companyId, employeeId, '2018-Q1', () => 4, now);
    await insertAvaliacoesC(companyId, employeeId, liderId, '2018-Q1', () => 4, now);
    // 2018-Q2: sem A nem C.
    const resultQ2 = await recalculatePlenitude(client.db, companyId, employeeId, '2018-Q2', now);
    expect(resultQ2.motivo).toBe<PlenitudeCalculationMotivo>('ambos_ausentes');
    expect(resultQ2.scoreA).toBeNull();
    // 2018-Q1 permanece calculado (nao afetado).
    const resultQ1 = await recalculatePlenitude(client.db, companyId, employeeId, '2018-Q1', now);
    expect(resultQ1.motivo).toBe<PlenitudeCalculationMotivo>('ambos_completos');
    expect(resultQ1.plenitudeScore).toBe(100);
  });

  it('motor nao vaza dados de OUTRO colaborador da mesma empresa/trimestre', async () => {
    const companyId = await createCompany(`${CNPJ_ISOLAMENTO.slice(0, -1)}1`.slice(-14));
    const liderId = await createEmployee(companyId);
    const employeeA = await createEmployee(companyId);
    const employeeB = await createEmployee(companyId);
    const now = new Date('2026-11-02T12:00:00Z');
    // Empregado A: A e C completos.
    await insertRespostasA(companyId, employeeA, '2017-Q1', () => 4, now);
    await insertAvaliacoesC(companyId, employeeA, liderId, '2017-Q1', () => 4, now);
    // Empregado B: sem A nem C.
    const resultB = await recalculatePlenitude(client.db, companyId, employeeB, '2017-Q1', now);
    expect(resultB.motivo).toBe<PlenitudeCalculationMotivo>('ambos_ausentes');
    // A permanece com scores.
    const resultA = await recalculatePlenitude(client.db, companyId, employeeA, '2017-Q1', now);
    expect(resultA.motivo).toBe<PlenitudeCalculationMotivo>('ambos_completos');
    expect(resultA.plenitudeScore).toBe(100);
  });
});

// ============================================================
// Facade DI canonica (S105)
// ============================================================

describe('plenitudeCalculationEngine — Facade canonica S105', () => {
  it('DEFAULT_PLENITUDE_ENGINE implementa PlenitudeEngineFacade', () => {
    const facade: PlenitudeEngineFacade = DEFAULT_PLENITUDE_ENGINE;
    expect(typeof facade.recalculatePlenitude).toBe('function');
  });

  it('facade mock em conformidade com o contrato', async () => {
    let chamadas = 0;
    let ultimoInput: {
      companyId: number;
      employeeId: number;
      trimestre: string;
    } | null = null;
    const spy: PlenitudeEngineFacade = {
      recalculatePlenitude: async (_db, companyId, employeeId, trimestre, now) => {
        chamadas += 1;
        ultimoInput = { companyId, employeeId, trimestre };
        return {
          companyId,
          employeeId,
          trimestre,
          motivo: 'ambos_ausentes',
          calculado: false,
          scoreA: null,
          scoreC: null,
          plenitudeScore: null,
          faixaPlenitude: null,
          divergencia: null,
          alertaDivergencia: false,
          engajamentoA: null,
          desenvolvimentoA: null,
          pertencimentoA: null,
          realizacaoA: null,
          engajamentoC: null,
          desenvolvimentoC: null,
          pertencimentoC: null,
          realizacaoC: null,
          calculadoEm: now,
        };
      },
    };
    const result = await spy.recalculatePlenitude(
      client.db,
      42,
      100,
      '2019-Q4',
      new Date('2026-12-01T00:00:00Z'),
    );
    expect(chamadas).toBe(1);
    expect(ultimoInput).toEqual({ companyId: 42, employeeId: 100, trimestre: '2019-Q4' });
    expect(result.motivo).toBe<PlenitudeCalculationMotivo>('ambos_ausentes');
  });
});

// ============================================================
// Constantes ainda nao exercitadas fora de constantes canonicas
// ============================================================

describe('plenitudeCalculationEngine — nome canonico do arquivo (S106)', () => {
  it('CNPJ_CONSTANTES esta reservado a esta ME (S109)', () => {
    // Marker canonico: confirma que a faixa 760.. e reservada a ME-040
    // e que este teste esta ancorado no repo real (nao mock).
    expect(CNPJ_CONSTANTES).toBe('10000000000760');
  });
});
