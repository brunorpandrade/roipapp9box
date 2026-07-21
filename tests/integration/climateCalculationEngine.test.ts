// ROIP APP 9BOX — teste de integracao do motor
// `climateCalculationEngine` (ME-047).
//
// Exercita o motor canonico do Bloco Clima e Engajamento (DOC 03 §9)
// contra MySQL real. Cobre:
//   - Contratos publicos exportados (RV-13): constantes canonicas,
//     formulas puras, helpers estruturais, tipos, Facade e DEFAULT.
//   - Formulas §9.4 literais: notaClima (media(scoreA)/10), adesao
//     (cobertura/total x 100), notaDimensao (media(scoreDimensaoA)
//     /10), notaQuestao (media(valor)/4 x 10).
//   - Motor cascata S169: uma chamada recalcula empresa + N
//     departamentos + M equipes (grid canonico S176).
//   - Snapshot dia 16 S181: `dataAdmissao <= dia16` filtra o
//     denominador; inativado com scoreA calculado entra normalmente.
//   - Filtro canonico S171: `plenitudeData.scoreA IS NOT NULL` e a
//     unica fonte de cobertura.
//   - UPSERT canonico S172/S172b: idempotencia bit-exact (2 chamadas
//     seguidas produzem mesma linha, sem duplicata mesmo com NULLs
//     nas colunas da UNIQUE); sem delete de orfaos (departamento
//     removido de employees permanece em `climateEngagementData`).
//   - BFS cadeia descendente S173: diretos + indiretos entram na
//     equipe; defesa contra ciclos.
//   - Facade DI S168: `DEFAULT_CLIMATE_ENGINE` implementa
//     `ClimateEngineFacade`; spy mock em conformidade com o contrato.
//
// Padrao S009/S076 estendido (S178): uma company por describe (excepto
// puros), CNPJ unico da faixa 10000000000843..849 (S178 — ME-047).
// Escopos de teste reutilizam trimestre distinto quando compactando
// dentro de um mesmo describe para nao colidir em `uq_climate_escopo`.
// L32 cleanup em afterAll. JWT_SECRET fixo (o motor nao usa JWT mas
// o setup canonico do repo declara).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  climateEngagementData,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentA_responses,
  plenitudeData,
} from '../../src/db/schema';
import {
  buildLiderSubordinadosMapClimate,
  type ClimateCalculationResult,
  type ClimateEngineFacade,
  type ClimateEscopoAggregado,
  computeAdesao,
  computeNotaClima,
  computeNotaDimensao,
  computeNotaQuestao,
  DEFAULT_CLIMATE_ENGINE,
  DEFAULT_TIMEZONE_CLIMATE,
  expandirCadeiaDescendenteClimate,
  getClimateDia16,
  NUM_DIMENSOES_CLIMATE,
  NUM_ITENS_POR_DIMENSAO_CLIMATE,
  NUM_QUESTOES_CLIMATE,
  PISO_RESPONDENTES_CLIMATE,
  questaoIndex,
  recalculateAggregates,
  round2,
  VALOR_MAX_INSTRUMENTO_A,
} from '../../src/server/services/climateCalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me047-climate-engine';

const HASH_CLIMA = 'hash-fixo-me047-climate';

// CNPJs canonicos por describe (S076 estendido, S178 — faixa 843..849
// reservada para o motor da ME-047; 840..842 consumidos pelo [EDIT] do
// plenitudeCalculationEngine.test.ts).
const CNPJ_HELPERS_BD = '10000000000843';
const CNPJ_CASCATA = '10000000000844';
const CNPJ_FILTRO_SCORE_A = '10000000000845';
const CNPJ_SNAPSHOT_DIA16 = '10000000000846';
const CNPJ_IDEMPOTENCIA = '10000000000847';
const CNPJ_BFS_CADEIA = '10000000000848';
const CNPJ_ORFAOS = '10000000000849';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // Ordem canonica FK RESTRICT: primeiro tabelas que apontam a
    // employees/companies, depois employeeLeaderHistory (FK a
    // employees), depois employees, depois companies.
    await client.db
      .delete(climateEngagementData)
      .where(inArray(climateEngagementData.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    await client.db
      .delete(plenitudeData)
      .where(inArray(plenitudeData.companyId, createdCompanyIds));
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = emps.map((e) => e.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME047 Test ${cnpj} LTDA`,
      nomeFantasia: `ME047 Test ${cnpj}`,
      cnpj,
      telefone: '1633330047',
      endereco: `Rua ME-047, ${cnpj}`,
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
      mesKickoff: 1,
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 47000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

interface CreateEmpOpts {
  departamento?:
    | 'Comercial'
    | 'Financeiro'
    | 'Operações'
    | 'Recursos Humanos'
    | 'Tecnologia da Informação'
    | 'Marketing';
  isLider?: boolean;
  status?: 'ativo' | 'inativo';
  dataAdmissao?: Date;
}

async function createEmployee(companyId: number, opts: CreateEmpOpts = {}): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Colab ${cpf}`,
      cpf,
      email: `emp-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: opts.dataAdmissao ?? new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: opts.isLider === true ? 'tatico' : 'operacional',
      departamento: opts.departamento ?? 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: opts.isLider ?? false,
      isRH: false,
      passwordHash: HASH_CLIMA,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

interface PlenitudeOpts {
  scoreA: number | null;
  engajamentoA?: number | null;
  desenvolvimentoA?: number | null;
  pertencimentoA?: number | null;
  realizacaoA?: number | null;
}

async function insertPlenitude(
  companyId: number,
  employeeId: number,
  trimestre: string,
  opts: PlenitudeOpts,
): Promise<void> {
  const scoreAStr = opts.scoreA === null ? null : String(opts.scoreA);
  const dimensaoStr = (v: number | null | undefined): string | null => {
    if (v === undefined) {
      return scoreAStr;
    }
    return v === null ? null : String(v);
  };
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    scoreA: scoreAStr,
    engajamentoA: dimensaoStr(opts.engajamentoA),
    desenvolvimentoA: dimensaoStr(opts.desenvolvimentoA),
    pertencimentoA: dimensaoStr(opts.pertencimentoA),
    realizacaoA: dimensaoStr(opts.realizacaoA),
  });
}

async function insertRespostasAGrid(
  companyId: number,
  employeeId: number,
  trimestre: string,
  valorFn: (dim: number, item: number) => number,
): Promise<void> {
  for (let d = 1; d <= NUM_DIMENSOES_CLIMATE; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_CLIMATE; i++) {
      await client.db.insert(instrumentA_responses).values({
        companyId,
        employeeId,
        trimestre,
        dimensao: d,
        itemIndex: i,
        valor: valorFn(d, i),
      });
    }
  }
}

async function linkLider(
  employeeId: number,
  liderId: number,
  dataInicio: Date,
  dataFim: Date | null = null,
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    clevelId: null,
    dataInicio,
    dataFim,
    reason: 'test-fixture-me047',
    transferBatchId: '00000000-0000-0000-0000-000000000000',
  });
}

async function selectClimateRow(
  companyId: number,
  escopo: 'empresa' | 'departamento' | 'equipe',
  trimestre: string,
  departamento: string | null,
  liderId: number | null,
) {
  const rows = await client.db
    .select()
    .from(climateEngagementData)
    .where(
      and(
        eq(climateEngagementData.companyId, companyId),
        eq(climateEngagementData.escopo, escopo),
        eq(climateEngagementData.trimestre, trimestre),
        departamento === null
          ? isNull(climateEngagementData.departamento)
          : eq(climateEngagementData.departamento, departamento),
        liderId === null
          ? isNull(climateEngagementData.liderId)
          : eq(climateEngagementData.liderId, liderId),
      ),
    );
  return rows;
}

// ============================================================
// Constantes canonicas
// ============================================================

describe('climateCalculationEngine — constantes canonicas', () => {
  it('NUM_DIMENSOES_CLIMATE === 4 (§9.4)', () => {
    expect(NUM_DIMENSOES_CLIMATE).toBe(4);
  });

  it('NUM_ITENS_POR_DIMENSAO_CLIMATE === 5 (§9.4)', () => {
    expect(NUM_ITENS_POR_DIMENSAO_CLIMATE).toBe(5);
  });

  it('NUM_QUESTOES_CLIMATE === 20 (§9.4)', () => {
    expect(NUM_QUESTOES_CLIMATE).toBe(20);
    expect(NUM_QUESTOES_CLIMATE).toBe(NUM_DIMENSOES_CLIMATE * NUM_ITENS_POR_DIMENSAO_CLIMATE);
  });

  it('PISO_RESPONDENTES_CLIMATE === 3 (§9.6)', () => {
    expect(PISO_RESPONDENTES_CLIMATE).toBe(3);
  });

  it('VALOR_MAX_INSTRUMENTO_A === 4 (§6.2)', () => {
    expect(VALOR_MAX_INSTRUMENTO_A).toBe(4);
  });

  it('DEFAULT_TIMEZONE_CLIMATE === America/Sao_Paulo (S181)', () => {
    expect(DEFAULT_TIMEZONE_CLIMATE).toBe('America/Sao_Paulo');
  });
});

// ============================================================
// Formulas canonicas puras (§9.4 literal)
// ============================================================

describe('climateCalculationEngine — formulas canonicas puras', () => {
  it('round2 arredonda para 2 casas com regra deterministica', () => {
    expect(round2(1.234567)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(10)).toBe(10);
  });

  it('computeNotaClima retorna media/10 e null para lista vazia', () => {
    // scoreA em escala 0..100 -> notaClima em 0..10.
    expect(computeNotaClima([70, 80, 90])).toBe(round2(80 / 10));
    expect(computeNotaClima([100])).toBe(10);
    expect(computeNotaClima([])).toBeNull();
  });

  it('computeAdesao retorna cob/total x 100 e null para total zero', () => {
    expect(computeAdesao(3, 10)).toBe(30);
    expect(computeAdesao(1, 3)).toBe(round2((1 / 3) * 100));
    expect(computeAdesao(0, 10)).toBe(0);
    expect(computeAdesao(5, 0)).toBeNull();
  });

  it('computeNotaDimensao retorna media/10 e null para lista vazia', () => {
    expect(computeNotaDimensao([60, 80])).toBe(round2(70 / 10));
    expect(computeNotaDimensao([100, 100, 100])).toBe(10);
    expect(computeNotaDimensao([])).toBeNull();
  });

  it('computeNotaQuestao retorna media/4 x 10 e null para lista vazia', () => {
    // valor em 0..4 -> notaQuestao em 0..10.
    expect(computeNotaQuestao([4, 4])).toBe(10);
    expect(computeNotaQuestao([0, 4])).toBe(5);
    expect(computeNotaQuestao([2, 2, 2])).toBe(5);
    expect(computeNotaQuestao([])).toBeNull();
  });
});

// ============================================================
// Helpers puros (sem banco)
// ============================================================

describe('climateCalculationEngine — helpers puros', () => {
  it('questaoIndex mapeia dim/item linearmente 1..20', () => {
    expect(questaoIndex(1, 1)).toBe(1);
    expect(questaoIndex(1, 5)).toBe(5);
    expect(questaoIndex(2, 1)).toBe(6);
    expect(questaoIndex(2, 5)).toBe(10);
    expect(questaoIndex(3, 3)).toBe(13);
    expect(questaoIndex(4, 5)).toBe(20);
  });

  it('getClimateDia16 resolve trimestre valido no fuso default', () => {
    const dia16 = getClimateDia16('2020-Q2', DEFAULT_TIMEZONE_CLIMATE);
    expect(dia16).not.toBeNull();
    expect(dia16 instanceof Date).toBe(true);
  });

  it('getClimateDia16 retorna null em trimestre invalido', () => {
    expect(getClimateDia16('abc-XYZ', DEFAULT_TIMEZONE_CLIMATE)).toBeNull();
    expect(getClimateDia16('2020-Q9', DEFAULT_TIMEZONE_CLIMATE)).toBeNull();
  });

  it('expandirCadeiaDescendenteClimate cobre diretos + indiretos via BFS', () => {
    const mapa = new Map<number, Set<number>>();
    mapa.set(1, new Set([2, 3]));
    mapa.set(2, new Set([4]));
    mapa.set(3, new Set([5, 6]));
    mapa.set(4, new Set([7]));
    const cadeia = expandirCadeiaDescendenteClimate(1, mapa);
    expect(Array.from(cadeia).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('expandirCadeiaDescendenteClimate termina em ciclo (defesa DOC 01 §8.9)', () => {
    // Ciclo forçado: 1 -> {2}; 2 -> {1}. O BFS canonico do motor
    // NAO exclui o vertex-raiz da travessia (mantem estritamente
    // "quem foi visitado como descendente"). Com ciclo, 2 aponta
    // de volta a 1, e 1 aparece na cadeia via o passo 2 -> 1.
    // A garantia do teste e: (i) a chamada TERMINA em tempo
    // finito e (ii) a cadeia contem todos os vertices atingiveis
    // no ciclo. Dados canonicos (§8.9) proibem ciclos, portanto o
    // caso e defesa contra dado corrompido.
    const mapa = new Map<number, Set<number>>();
    mapa.set(1, new Set([2]));
    mapa.set(2, new Set([1]));
    const cadeia = expandirCadeiaDescendenteClimate(1, mapa);
    expect(Array.from(cadeia).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});

// ============================================================
// buildLiderSubordinadosMapClimate (com banco)
// ============================================================

describe('climateCalculationEngine — buildLiderSubordinadosMapClimate', () => {
  it('agrupa employees por liderId ativo no snapshot dia16', async () => {
    const companyId = await createCompany(CNPJ_HELPERS_BD);
    const liderA = await createEmployee(companyId, { isLider: true });
    const liderB = await createEmployee(companyId, { isLider: true });
    const sub1 = await createEmployee(companyId);
    const sub2 = await createEmployee(companyId);
    const sub3 = await createEmployee(companyId);

    // Vinculos ativos no trimestre 2020-Q2 (dia16 = 2020-06-16).
    const inicio = new Date('2020-02-01');
    await linkLider(sub1, liderA, inicio);
    await linkLider(sub2, liderA, inicio);
    await linkLider(sub3, liderB, inicio);

    const dia16 = getClimateDia16('2020-Q2', DEFAULT_TIMEZONE_CLIMATE);
    const mapa = await buildLiderSubordinadosMapClimate(client.db, companyId, dia16);

    expect(mapa.get(liderA)?.has(sub1)).toBe(true);
    expect(mapa.get(liderA)?.has(sub2)).toBe(true);
    expect(mapa.get(liderA)?.size).toBe(2);
    expect(mapa.get(liderB)?.has(sub3)).toBe(true);
    expect(mapa.get(liderB)?.size).toBe(1);
  });
});

// ============================================================
// Motor cascata S169 + grid canonico S176
// ============================================================

describe('climateCalculationEngine — motor cascata S169 + grid S176', () => {
  let companyId: number;
  let liderComercial: number;
  let liderOps: number;
  const trimestre = '2020-Q2';
  const now = new Date('2020-11-10T00:00:00Z');

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CASCATA);
    liderComercial = await createEmployee(companyId, {
      isLider: true,
      departamento: 'Comercial',
    });
    liderOps = await createEmployee(companyId, {
      isLider: true,
      departamento: 'Operações',
    });
    const empComercial1 = await createEmployee(companyId, { departamento: 'Comercial' });
    const empComercial2 = await createEmployee(companyId, { departamento: 'Comercial' });
    const empOps1 = await createEmployee(companyId, { departamento: 'Operações' });

    const inicio = new Date('2020-02-01');
    await linkLider(empComercial1, liderComercial, inicio);
    await linkLider(empComercial2, liderComercial, inicio);
    await linkLider(empOps1, liderOps, inicio);

    // Respostas do A + plenitude para 3 employees em cobertura.
    // valorFn(d, i) = 3 -> scoreA = 3*20/80*100 = 75; notaQuestao = 3/4*10 = 7.5.
    const valor = (): number => 3;
    for (const eid of [empComercial1, empComercial2, empOps1]) {
      await insertRespostasAGrid(companyId, eid, trimestre, valor);
      await insertPlenitude(companyId, eid, trimestre, {
        scoreA: 75,
        engajamentoA: 75,
        desenvolvimentoA: 75,
        pertencimentoA: 75,
        realizacaoA: 75,
      });
    }
    // liderComercial e liderOps ativos, admitidos antes do dia16, sem
    // scoreA — entram apenas em countTotal.
    await recalculateAggregates(client.db, companyId, trimestre, now);
  });

  it('cria linha para escopo empresa (S176)', async () => {
    const rows = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(rows.length).toBe(1);
    expect(rows[0]?.countTotal).toBe(5);
    expect(rows[0]?.countCobertura).toBe(3);
  });

  it('cria linha para cada departamento com employees ativos (S176)', async () => {
    const rowsCom = await selectClimateRow(companyId, 'departamento', trimestre, 'Comercial', null);
    expect(rowsCom.length).toBe(1);
    expect(rowsCom[0]?.countTotal).toBe(3);
    expect(rowsCom[0]?.countCobertura).toBe(2);

    const rowsOps = await selectClimateRow(companyId, 'departamento', trimestre, 'Operações', null);
    expect(rowsOps.length).toBe(1);
    expect(rowsOps[0]?.countTotal).toBe(2);
    expect(rowsOps[0]?.countCobertura).toBe(1);
  });

  it('cria linha para cada equipe com >=1 subordinado direto (S176)', async () => {
    const rowsEqCom = await selectClimateRow(companyId, 'equipe', trimestre, null, liderComercial);
    expect(rowsEqCom.length).toBe(1);
    expect(rowsEqCom[0]?.countTotal).toBe(2);
    expect(rowsEqCom[0]?.countCobertura).toBe(2);

    const rowsEqOps = await selectClimateRow(companyId, 'equipe', trimestre, null, liderOps);
    expect(rowsEqOps.length).toBe(1);
    expect(rowsEqOps[0]?.countTotal).toBe(1);
    expect(rowsEqOps[0]?.countCobertura).toBe(1);
  });

  it('notaClima empresa segue media(scoreA)/10 (§9.4)', async () => {
    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(row?.notaClima).not.toBeNull();
    expect(Number(row?.notaClima)).toBe(7.5); // 75/10
  });

  it('notaDimensao empresa segue media(scoreDimensaoA)/10 (§9.4)', async () => {
    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(Number(row?.notaEngajamento)).toBe(7.5);
    expect(Number(row?.notaDesenvolvimento)).toBe(7.5);
    expect(Number(row?.notaPertencimento)).toBe(7.5);
    expect(Number(row?.notaRealizacao)).toBe(7.5);
  });

  it('notaQuestao01..20 seguem media(valor)/4 x 10 (§9.4)', async () => {
    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    const cols = [
      row?.notaQuestao01,
      row?.notaQuestao05,
      row?.notaQuestao06,
      row?.notaQuestao10,
      row?.notaQuestao11,
      row?.notaQuestao15,
      row?.notaQuestao16,
      row?.notaQuestao20,
    ];
    for (const c of cols) {
      expect(Number(c)).toBe(7.5);
    }
  });

  it('adesao empresa segue cob/total x 100 (§9.4)', async () => {
    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(Number(row?.adesao)).toBe(60); // 3/5*100
  });
});

// ============================================================
// Filtro canonico S171: plenitudeData.scoreA IS NOT NULL
// ============================================================

describe('climateCalculationEngine — filtro scoreA IS NOT NULL (S171)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_FILTRO_SCORE_A);
  });

  it('employee SEM plenitudeData NAO entra em cobertura', async () => {
    const trimestre = '2020-Q3';
    const now = new Date('2020-11-01T00:00:00Z');
    await createEmployee(companyId);
    await recalculateAggregates(client.db, companyId, trimestre, now);
    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(row?.countTotal).toBeGreaterThanOrEqual(1);
    expect(row?.countCobertura).toBe(0);
    expect(row?.notaClima).toBeNull();
  });

  it('employee com plenitudeData mas scoreA NULL NAO entra em cobertura', async () => {
    const trimestre = '2020-Q4';
    const now = new Date('2020-12-30T00:00:00Z');
    const emp = await createEmployee(companyId);
    await insertPlenitude(companyId, emp, trimestre, { scoreA: null });
    await recalculateAggregates(client.db, companyId, trimestre, now);
    const rows = await client.db
      .select()
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, 'empresa'),
          eq(climateEngagementData.trimestre, trimestre),
        ),
      );
    expect(rows[0]?.countCobertura).toBe(0);
  });

  it('employee com scoreA NOT NULL entra em cobertura', async () => {
    const trimestre = '2021-Q1';
    const now = new Date('2021-03-31T00:00:00Z');
    const emp = await createEmployee(companyId);
    await insertPlenitude(companyId, emp, trimestre, { scoreA: 82.5 });
    await recalculateAggregates(client.db, companyId, trimestre, now);
    const rows = await client.db
      .select()
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, 'empresa'),
          eq(climateEngagementData.trimestre, trimestre),
        ),
      );
    expect(rows[0]?.countCobertura).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.notaClima).not.toBeNull();
    expect(Number(rows[0]?.notaClima)).toBe(round2(82.5 / 10));
  });
});

// ============================================================
// Snapshot dia 16 (S181)
// ============================================================

describe('climateCalculationEngine — snapshot dia 16 (S181)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SNAPSHOT_DIA16);
  });

  it('employee admitido APOS dia16 e EXCLUIDO do denominador', async () => {
    const trimestre = '2020-Q2';
    const now = new Date('2020-11-15T00:00:00Z');
    // dia16 canonico do 2020-Q2 = 2020-06-16 local America/Sao_Paulo.
    await createEmployee(companyId, {
      dataAdmissao: new Date('2020-06-20'),
    });
    const empAntes = await createEmployee(companyId, {
      dataAdmissao: new Date('2020-01-01'),
    });
    await insertPlenitude(companyId, empAntes, trimestre, { scoreA: 80 });
    await recalculateAggregates(client.db, companyId, trimestre, now);

    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(row?.countTotal).toBe(1);
    expect(row?.countCobertura).toBe(1);
  });

  it('employee inativado com scoreA calculado entra em cobertura (§9.5)', async () => {
    const trimestre = '2020-Q3';
    const now = new Date('2020-11-30T00:00:00Z');
    const empInativo = await createEmployee(companyId, {
      dataAdmissao: new Date('2020-01-01'),
      status: 'inativo',
    });
    await insertPlenitude(companyId, empInativo, trimestre, { scoreA: 60 });
    await recalculateAggregates(client.db, companyId, trimestre, now);

    const [row] = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(row?.countTotal).toBeGreaterThanOrEqual(1);
    expect(row?.countCobertura).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Idempotencia UPSERT (S172 / S172b)
// ============================================================

describe('climateCalculationEngine — idempotencia UPSERT (S172/S172b)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_IDEMPOTENCIA);
  });

  it('2 chamadas seguidas produzem MESMA linha (sem duplicata)', async () => {
    const trimestre = '2020-Q4';
    const now1 = new Date('2020-12-01T00:00:00Z');
    const now2 = new Date('2020-12-02T00:00:00Z');
    const emp = await createEmployee(companyId);
    await insertPlenitude(companyId, emp, trimestre, { scoreA: 70 });

    await recalculateAggregates(client.db, companyId, trimestre, now1);
    await recalculateAggregates(client.db, companyId, trimestre, now2);

    const rowsEmpresa = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(rowsEmpresa.length).toBe(1);
    const rowsDep = await selectClimateRow(companyId, 'departamento', trimestre, 'Comercial', null);
    expect(rowsDep.length).toBe(1);
  });

  it('escopo empresa (dep/liderId NULL) evita colisao NULL na UNIQUE (S172b)', async () => {
    const trimestre = '2021-Q2';
    const now = new Date('2021-06-30T00:00:00Z');
    const emp = await createEmployee(companyId);
    await insertPlenitude(companyId, emp, trimestre, { scoreA: 90 });

    // Duas chamadas seguidas: escopo empresa tem departamento=NULL e
    // liderId=NULL na UNIQUE `uq_climate_escopo`. Se o motor
    // dependesse do default MySQL de tratar NULL como distinto,
    // a segunda chamada duplicaria a linha. S172b canoniza SELECT
    // + UPDATE-or-INSERT NULL-safe — deve haver uma unica linha.
    await recalculateAggregates(client.db, companyId, trimestre, now);
    await recalculateAggregates(client.db, companyId, trimestre, now);
    const linhas = await selectClimateRow(companyId, 'empresa', trimestre, null, null);
    expect(linhas.length).toBe(1);
  });
});

// ============================================================
// BFS cadeia descendente (S173)
// ============================================================

describe('climateCalculationEngine — BFS cadeia descendente (S173)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_BFS_CADEIA);
  });

  it('escopo equipe cobre cadeia com diretos + indiretos (DOC 01 §8.9)', async () => {
    const trimestre = '2020-Q2';
    const now = new Date('2020-11-30T00:00:00Z');
    const lider = await createEmployee(companyId, { isLider: true });
    const subMeio = await createEmployee(companyId, { isLider: true });
    const subFolha1 = await createEmployee(companyId);
    const subFolha2 = await createEmployee(companyId);
    const inicio = new Date('2020-01-15');
    await linkLider(subMeio, lider, inicio);
    await linkLider(subFolha1, subMeio, inicio);
    await linkLider(subFolha2, subMeio, inicio);
    for (const eid of [subMeio, subFolha1, subFolha2]) {
      await insertPlenitude(companyId, eid, trimestre, { scoreA: 80 });
    }
    await recalculateAggregates(client.db, companyId, trimestre, now);

    const rows = await selectClimateRow(companyId, 'equipe', trimestre, null, lider);
    expect(rows.length).toBe(1);
    // Equipe do lider = cadeia completa (subMeio + 2 folhas).
    expect(rows[0]?.countTotal).toBe(3);
    expect(rows[0]?.countCobertura).toBe(3);
  });

  it('lider SEM subordinado direto NAO vira escopo equipe (S176)', async () => {
    const trimestre = '2020-Q3';
    const now = new Date('2020-11-30T00:00:00Z');
    const liderSolo = await createEmployee(companyId, { isLider: true });
    await recalculateAggregates(client.db, companyId, trimestre, now);
    const rows = await selectClimateRow(companyId, 'equipe', trimestre, null, liderSolo);
    expect(rows.length).toBe(0);
  });
});

// ============================================================
// UPSERT sem delete de orfaos (S172)
// ============================================================

describe('climateCalculationEngine — UPSERT sem delete de orfaos (S172)', () => {
  it('departamento removido de employees mantem linha historica', async () => {
    const companyId = await createCompany(CNPJ_ORFAOS);
    const trimestre = '2020-Q4';
    const now = new Date('2020-12-15T00:00:00Z');
    const empMkt = await createEmployee(companyId, { departamento: 'Marketing' });
    await insertPlenitude(companyId, empMkt, trimestre, { scoreA: 70 });
    await recalculateAggregates(client.db, companyId, trimestre, now);

    // Linha inicial de Marketing (Q4/2020) criada.
    const rowsMkt = await selectClimateRow(companyId, 'departamento', trimestre, 'Marketing', null);
    expect(rowsMkt.length).toBe(1);

    // Simula "sumico" do departamento no proximo trimestre:
    // employee inativado. Grid do 2021-Q1 nao vai gerar linha para
    // Marketing; a linha do 2020-Q4 deve permanecer intacta.
    await client.db.update(employees).set({ status: 'inativo' }).where(eq(employees.id, empMkt));

    const trimestre2 = '2021-Q1';
    const now2 = new Date('2021-03-31T00:00:00Z');
    await recalculateAggregates(client.db, companyId, trimestre2, now2);

    const rowsMktNovo = await selectClimateRow(
      companyId,
      'departamento',
      trimestre2,
      'Marketing',
      null,
    );
    expect(rowsMktNovo.length).toBe(0);

    const rowsMktHist = await selectClimateRow(
      companyId,
      'departamento',
      trimestre,
      'Marketing',
      null,
    );
    expect(rowsMktHist.length).toBe(1);
  });
});

// ============================================================
// Facade DI canonica (S168)
// ============================================================

describe('climateCalculationEngine — Facade DI (S168)', () => {
  it('DEFAULT_CLIMATE_ENGINE implementa ClimateEngineFacade', () => {
    const facade: ClimateEngineFacade = DEFAULT_CLIMATE_ENGINE;
    expect(typeof facade.recalculateAggregates).toBe('function');
  });

  it('spy mock em conformidade com o contrato', async () => {
    let chamadas = 0;
    let ultimo: { companyId: number; trimestre: string; agora: Date } | null = null;
    const spy: ClimateEngineFacade = {
      recalculateAggregates: async (_db, cId, tri, agora): Promise<ClimateCalculationResult> => {
        chamadas += 1;
        ultimo = { companyId: cId, trimestre: tri, agora };
        return {
          companyId: cId,
          trimestre: tri,
          escopos: [] as readonly ClimateEscopoAggregado[],
          calculadoEm: agora,
        };
      },
    };
    const now = new Date('2026-12-01T00:00:00Z');
    const result = await spy.recalculateAggregates(client.db, 42, '2020-Q2', now);
    expect(chamadas).toBe(1);
    expect(ultimo).toEqual({ companyId: 42, trimestre: '2020-Q2', agora: now });
    expect(result.calculadoEm).toBe(now);
  });
});
