// ROIP APP 9BOX — teste de integracao do motor `nr1CalculationEngine`
// (ME-049cd).
//
// Cobre o motor deterministico do Radar NR-1 (DOC 03 §11.2-§11.15):
//   - Formulas puras: score por fator (§11.6), semaforo (§11.8),
//     uniformidade (§11.5), adesao (§11.11), agregacao deterministica
//     (§11.7), divergencia (§11.9), departamento critico (§11.10),
//     grid canonico (§11.4) e trimestre derivado (S238).
//   - `openScheduledNr1Cycles` (§11.2 / S237): transicao
//     `agendado -> aberto` com snapshot de elegiveis, filtro de
//     inativos, respeito a `dataAbertura` futura e idempotencia.
//   - `closeNr1Cycle` (§11.2, §11.6-§11.14): escopos empresa,
//     departamento e agregacao; piso 5; divergencia; departamento
//     critico; alertas em `alerts`; notificacoes em `notifications`
//     com `alertId` populado; transicao para `fechado`; hook
//     `emitAlertPostGravacao` (S217) chamado FORA da transacao.
//
// Padrao S009/S204: uma company local por describe, CNPJ unico da
// faixa 10000000000980..984 (faixa principal desta ME). L32 cleanup em
// afterAll cobrindo as FK-dependentes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoqFactorScores,
  copsoq_responses,
  employees,
  notifications,
  nr1AreaDivergenceAnalysis,
} from '../../src/db/schema';
import type {
  CandidatoCriticoNr1,
  ClassificacaoDivergenciaNr1,
  CloseNr1CycleDeps,
  ContagemDepartamentoNr1,
  EscopoCalculadoNr1,
  FatorDivergenteNr1,
  FatorNr1,
  GrupoAgregacaoNr1,
  OpenScheduledNr1CyclesResult,
  PlanoAgregacaoNr1,
  TipoFatorNr1,
} from '../../src/server/services/nr1CalculationEngine';
import {
  adesaoPercentualNr1,
  BANDA_CONVERGENCIA_NR1,
  classificarDivergenciaNr1,
  closeNr1Cycle,
  dataCivilDeColunaNr1,
  DEFAULT_NR1_ALERT_FACADE,
  type EmitAlertPostGravacaoInput,
  FATORES_NR1,
  getFatorNr1,
  identificarDepartamentoCriticoNr1,
  itensCobremGridCanonicoNr1,
  JANELA_MINIMA_CICLO_DIAS_NR1,
  nomeAgregacaoNr1,
  NUM_FATORES_NR1,
  NUM_ITENS_POR_FATOR_NR1,
  NUM_ITENS_TOTAL_NR1,
  openScheduledNr1Cycles,
  PISO_AMOSTRA_NR1,
  planejarAgregacaoNr1,
  respostasUniformesNr1,
  SCORE_FATOR_CRITICO_NR1,
  scoreFatorNr1,
  semaforoFatorNr1,
  SOMA_BRUTA_MAXIMA_NR1,
  TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1,
  trimestreDeDataNr1,
  VALOR_MAXIMO_NR1,
  VALOR_MINIMO_NR1,
} from '../../src/server/services/nr1CalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const HASH_NR1_ENGINE = 'hash-fixo-me049cd-nr1-engine';
// Faixa CNPJ principal desta ME (S204): 980..989.
const CNPJ_ABERTURA = '10000000000980';
const CNPJ_FECHAMENTO = '10000000000981';
const CNPJ_PISO = '10000000000982';

// Ids canonicos semeados pela migration (§15.1 do DOC 01).
const DEPT_COMERCIAL = 1;
const DEPT_MARKETING = 2;
const DEPT_LOGISTICA = 5;
const DEPT_FINANCEIRO = 7;

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(notifications)
      .where(inArray(notifications.companyId, createdCompanyIds));
    await client.db.delete(alerts).where(inArray(alerts.companyId, createdCompanyIds));
    await client.db
      .delete(nr1AreaDivergenceAnalysis)
      .where(inArray(nr1AreaDivergenceAnalysis.companyId, createdCompanyIds));
    await client.db
      .delete(copsoqFactorScores)
      .where(inArray(copsoqFactorScores.companyId, createdCompanyIds));
    await client.db
      .delete(copsoq_responses)
      .where(inArray(copsoq_responses.companyId, createdCompanyIds));
    await client.db
      .delete(copsoqCycleSnapshot)
      .where(inArray(copsoqCycleSnapshot.companyId, createdCompanyIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
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
      razaoSocial: `ME049CD ENGINE ${cnpj} LTDA`,
      nomeFantasia: `ME049CD ENGINE ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049cd, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `pr-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      timezone: 'UTC',
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49800000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

type DepartamentoCanonico =
  'Comercial' | 'Marketing' | 'Logística' | 'Financeiro' | 'Recursos Humanos';

async function createEmployee(
  companyId: number,
  opts: { departamento?: DepartamentoCanonico; status?: 'ativo' | 'inativo'; isRH?: boolean } = {},
): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Emp ${cpf}`,
      cpf,
      email: `emp-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: opts.departamento ?? 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: false,
      isRH: opts.isRH ?? false,
      passwordHash: HASH_NR1_ENGINE,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

function dataCivil(offsetDias: number, base = new Date('2026-07-01T12:00:00.000Z')): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return dataCivilDeColunaNr1(d);
}

async function createCiclo(
  companyId: number,
  opts: { dataAbertura: string; dataFechamento: string; status?: 'agendado' | 'aberto' },
): Promise<number> {
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo: opts.dataAbertura,
      dataAbertura: new Date(`${opts.dataAbertura}T00:00:00.000Z`),
      dataFechamento: new Date(`${opts.dataFechamento}T00:00:00.000Z`),
      status: opts.status ?? 'agendado',
    })
    .$returningId();
  return row!.id;
}

/** Grava resposta completa (32 itens) com valor constante `valor`. */
async function responderCiclo(
  cicloDbId: number,
  companyId: number,
  employeeId: number,
  valor: number,
  now: Date,
): Promise<void> {
  for (const fator of FATORES_NR1) {
    for (let itemIndex = 1; itemIndex <= NUM_ITENS_POR_FATOR_NR1; itemIndex += 1) {
      await client.db.insert(copsoq_responses).values({
        cicloDbId,
        companyId,
        employeeId,
        fator: fator.id,
        itemIndex,
        valor,
        createdAt: now,
      });
    }
  }
  await client.db
    .update(copsoqCycleSnapshot)
    .set({ respondeu: true, respondidoEm: now, tempoRespostaSegundos: 600 })
    .where(
      and(
        eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
        eq(copsoqCycleSnapshot.employeeId, employeeId),
      ),
    );
}

// ============================================================
// Contratos publicos e formulas puras (RV-13)
// ============================================================

describe('nr1CalculationEngine — constantes canonicas §11', () => {
  it('expoe a tabela canonica dos 8 fatores com nome e tipo literais', () => {
    expect(NUM_FATORES_NR1).toBe(8);
    expect(NUM_ITENS_POR_FATOR_NR1).toBe(4);
    expect(NUM_ITENS_TOTAL_NR1).toBe(32);
    expect(SOMA_BRUTA_MAXIMA_NR1).toBe(16);
    expect(FATORES_NR1.map((f) => f.nome)).toEqual([
      'Exigências quantitativas',
      'Ritmo de trabalho',
      'Conflitos de papel',
      'Autonomia',
      'Suporte social do líder',
      'Suporte social de colegas',
      'Insegurança no trabalho',
      'Saúde geral autopercebida',
    ]);
    expect(FATORES_NR1.map((f) => f.tipo)).toEqual([
      'risco',
      'risco',
      'risco',
      'recurso',
      'recurso',
      'recurso',
      'risco',
      'recurso',
    ]);
    const fator5: FatorNr1 | undefined = getFatorNr1(5);
    expect(fator5?.nome).toBe('Suporte social do líder');
    const tipos: readonly TipoFatorNr1[] = FATORES_NR1.map((f) => f.tipo);
    expect(new Set(tipos).size).toBe(2);
    expect(getFatorNr1(99)).toBeUndefined();
  });

  it('expoe os limiares canonicos §11.5, §11.7, §11.13 e §11.2', () => {
    expect(PISO_AMOSTRA_NR1).toBe(5);
    expect(TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1).toBe(180);
    expect(SCORE_FATOR_CRITICO_NR1).toBe(50);
    expect(BANDA_CONVERGENCIA_NR1).toBe(10);
    expect(JANELA_MINIMA_CICLO_DIAS_NR1).toBe(30);
    expect(VALOR_MINIMO_NR1).toBe(0);
    expect(VALOR_MAXIMO_NR1).toBe(4);
  });
});

describe('nr1CalculationEngine — formulas §11.6 e §11.8', () => {
  it('aplica a direcao canonica por tipo de fator', () => {
    expect(scoreFatorNr1(16, 'recurso')).toBe(100);
    expect(scoreFatorNr1(16, 'risco')).toBe(0);
    expect(scoreFatorNr1(0, 'recurso')).toBe(0);
    expect(scoreFatorNr1(0, 'risco')).toBe(100);
    expect(scoreFatorNr1(8, 'recurso')).toBe(50);
    expect(scoreFatorNr1(8, 'risco')).toBe(50);
    expect(scoreFatorNr1(96 / 14, 'recurso')).toBe(42.86);
    expect(scoreFatorNr1(96 / 14, 'risco')).toBe(57.14);
  });

  it('aplica as faixas canonicas do semaforo', () => {
    expect(semaforoFatorNr1(0)).toBe('vermelho');
    expect(semaforoFatorNr1(49.99)).toBe('vermelho');
    expect(semaforoFatorNr1(50)).toBe('amarelo');
    expect(semaforoFatorNr1(65)).toBe('amarelo');
    expect(semaforoFatorNr1(65.01)).toBe('verde');
    expect(semaforoFatorNr1(100)).toBe('verde');
  });
});

describe('nr1CalculationEngine — controles §11.5 e grid §11.4', () => {
  it('detecta uniformidade apenas quando todos os valores coincidem', () => {
    expect(respostasUniformesNr1([2, 2, 2, 2])).toBe(true);
    expect(respostasUniformesNr1([0, 0, 0, 1])).toBe(false);
    expect(respostasUniformesNr1([])).toBe(false);
  });

  it('valida o grid canonico de 32 itens sem falta, repeticao ou excedente', () => {
    const completo = FATORES_NR1.flatMap((f) =>
      [1, 2, 3, 4].map((itemIndex) => ({ fator: f.id, itemIndex, valor: 2 })),
    );
    expect(itensCobremGridCanonicoNr1(completo)).toBe(true);

    const faltando = completo.slice(0, 31);
    expect(itensCobremGridCanonicoNr1(faltando)).toBe(false);

    const repetido = [...completo.slice(0, 31), { fator: 1, itemIndex: 1, valor: 2 }];
    expect(itensCobremGridCanonicoNr1(repetido)).toBe(false);

    const foraDoGrid = [...completo.slice(0, 31), { fator: 9, itemIndex: 1, valor: 2 }];
    expect(itensCobremGridCanonicoNr1(foraDoGrid)).toBe(false);
  });
});

describe('nr1CalculationEngine — adesao §11.11 e trimestre S238', () => {
  it('arredonda a adesao para o inteiro mais proximo e protege denominador zero', () => {
    expect(adesaoPercentualNr1(14, 14)).toBe(100);
    expect(adesaoPercentualNr1(1, 3)).toBe(33);
    expect(adesaoPercentualNr1(2, 3)).toBe(67);
    expect(adesaoPercentualNr1(0, 0)).toBe(0);
  });

  it('deriva o trimestre canonico da data de abertura (S238)', () => {
    expect(trimestreDeDataNr1(new Date('2026-01-15T00:00:00.000Z'))).toBe('2026-Q1');
    expect(trimestreDeDataNr1(new Date('2026-04-01T00:00:00.000Z'))).toBe('2026-Q2');
    expect(trimestreDeDataNr1(new Date('2026-07-31T00:00:00.000Z'))).toBe('2026-Q3');
    expect(trimestreDeDataNr1(new Date('2026-12-31T00:00:00.000Z'))).toBe('2026-Q4');
  });
});

describe('nr1CalculationEngine — agregacao deterministica §11.7', () => {
  it('acumula em ordem crescente e fecha o grupo ao atingir o piso', () => {
    const entradas: readonly ContagemDepartamentoNr1[] = [
      { departamentoId: DEPT_MARKETING, count: 2 },
      { departamentoId: DEPT_FINANCEIRO, count: 3 },
      { departamentoId: DEPT_LOGISTICA, count: 3 },
    ];
    const plano: PlanoAgregacaoNr1 = planejarAgregacaoNr1(entradas);
    const primeiro: GrupoAgregacaoNr1 | undefined = plano.grupos[0];
    expect(primeiro?.total).toBe(5);
    expect(plano.grupos).toHaveLength(1);
    expect(plano.grupos[0]!.departamentoIds).toEqual([DEPT_MARKETING, DEPT_LOGISTICA]);
    expect(plano.grupos[0]!.total).toBe(5);
    expect(plano.insuficientes).toEqual([DEPT_FINANCEIRO]);
  });

  it('desempata contagem igual pelo departamentoId ascendente', () => {
    const plano = planejarAgregacaoNr1([
      { departamentoId: DEPT_FINANCEIRO, count: 3 },
      { departamentoId: DEPT_LOGISTICA, count: 3 },
    ]);
    expect(plano.grupos[0]!.departamentoIds).toEqual([DEPT_LOGISTICA, DEPT_FINANCEIRO]);
  });

  it('devolve tudo como insuficiente quando a soma nunca atinge o piso', () => {
    const plano = planejarAgregacaoNr1([
      { departamentoId: DEPT_MARKETING, count: 1 },
      { departamentoId: DEPT_LOGISTICA, count: 2 },
    ]);
    expect(plano.grupos).toHaveLength(0);
    expect(plano.insuficientes).toEqual([DEPT_MARKETING, DEPT_LOGISTICA]);
  });

  it('compoe o nome canonico do escopo agregado', () => {
    expect(nomeAgregacaoNr1(['Marketing', 'Logística'])).toBe('Agregação de: Marketing, Logística');
  });
});

describe('nr1CalculationEngine — divergencia §11.9 e critico §11.10', () => {
  it('classifica convergente dentro da banda de 10 pontos', () => {
    const empresa = new Map(FATORES_NR1.map((f) => [f.id, 50]));
    const escopo = new Map(FATORES_NR1.map((f) => [f.id, 58]));
    const resultado: ClassificacaoDivergenciaNr1 = classificarDivergenciaNr1(escopo, empresa);
    const criticos: readonly FatorDivergenteNr1[] = resultado.criticos;
    expect(criticos).toHaveLength(0);
    expect(resultado.classificacao).toBe('convergente');
    expect(resultado.criticos).toHaveLength(0);
    expect(resultado.positivos).toHaveLength(0);
  });

  it('classifica divergencia critica quando ha ao menos um fator abaixo de -10', () => {
    const empresa = new Map(FATORES_NR1.map((f) => [f.id, 50]));
    const escopo = new Map(FATORES_NR1.map((f) => [f.id, 50]));
    escopo.set(3, 20);
    escopo.set(4, 90);
    const resultado = classificarDivergenciaNr1(escopo, empresa);
    expect(resultado.classificacao).toBe('divergencia_critica');
    expect(resultado.criticos.map((c) => c.fator)).toEqual([3]);
    expect(resultado.positivos.map((c) => c.fator)).toEqual([4]);
    expect(resultado.criticos[0]!.diferenca).toBe(-30);
  });

  it('classifica divergencia positiva apenas na ausencia de criticos', () => {
    const empresa = new Map(FATORES_NR1.map((f) => [f.id, 50]));
    const escopo = new Map(FATORES_NR1.map((f) => [f.id, 50]));
    escopo.set(6, 80);
    const resultado = classificarDivergenciaNr1(escopo, empresa);
    expect(resultado.classificacao).toBe('divergencia_positiva');
  });

  it('ordena o departamento critico por contagem, depois pela pior divergencia', () => {
    const candidatos: readonly CandidatoCriticoNr1[] = [
      {
        departamentoId: DEPT_MARKETING,
        criticos: [{ fator: 1, scoreDept: 10, scoreEmpresa: 50, diferenca: -40 }],
      },
      {
        departamentoId: DEPT_COMERCIAL,
        criticos: [
          { fator: 1, scoreDept: 30, scoreEmpresa: 50, diferenca: -20 },
          { fator: 2, scoreDept: 35, scoreEmpresa: 50, diferenca: -15 },
        ],
      },
    ];
    const escolhido = identificarDepartamentoCriticoNr1(candidatos);
    expect(escolhido).toBe(DEPT_COMERCIAL);

    const empate = identificarDepartamentoCriticoNr1([
      {
        departamentoId: DEPT_MARKETING,
        criticos: [{ fator: 1, scoreDept: 10, scoreEmpresa: 50, diferenca: -40 }],
      },
      {
        departamentoId: DEPT_COMERCIAL,
        criticos: [{ fator: 1, scoreDept: 30, scoreEmpresa: 50, diferenca: -20 }],
      },
    ]);
    expect(empate).toBe(DEPT_MARKETING);

    expect(identificarDepartamentoCriticoNr1([])).toBeNull();
  });
});

// ============================================================
// openScheduledNr1Cycles — §11.2 / S237
// ============================================================

describe('openScheduledNr1Cycles — transicao agendado -> aberto (§11.2)', () => {
  it('abre o ciclo vencido, congela o snapshot dos ativos e ignora o futuro', async () => {
    const companyId = await createCompany(CNPJ_ABERTURA);
    const ativo1 = await createEmployee(companyId, { departamento: 'Comercial' });
    const ativo2 = await createEmployee(companyId, { departamento: 'Marketing' });
    const inativo = await createEmployee(companyId, { status: 'inativo' });

    const now = new Date('2026-07-01T03:00:00.000Z');
    const cicloVencido = await createCiclo(companyId, {
      dataAbertura: dataCivil(0),
      dataFechamento: dataCivil(45),
    });
    const cicloFuturo = await createCiclo(companyId, {
      dataAbertura: dataCivil(120),
      dataFechamento: dataCivil(180),
    });

    const resultado: OpenScheduledNr1CyclesResult = await openScheduledNr1Cycles(client.db, now);

    expect(resultado.ciclosAbertos).toContain(cicloVencido);
    expect(resultado.ciclosAbertos).not.toContain(cicloFuturo);

    const [aberto] = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, cicloVencido));
    expect(aberto!.status).toBe('aberto');
    expect(aberto!.abertoEm).not.toBeNull();

    const [futuro] = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, cicloFuturo));
    expect(futuro!.status).toBe('agendado');

    const snapshot = await client.db
      .select()
      .from(copsoqCycleSnapshot)
      .where(eq(copsoqCycleSnapshot.cicloDbId, cicloVencido));
    const ids = snapshot.map((s) => s.employeeId).sort((a, b) => a - b);
    expect(ids).toEqual([ativo1, ativo2].sort((a, b) => a - b));
    expect(ids).not.toContain(inativo);

    // §11.2 — `departamentoId` resolvido pelo nome do departamento.
    const linhaComercial = snapshot.find((s) => s.employeeId === ativo1);
    expect(linhaComercial!.departamentoId).toBe(DEPT_COMERCIAL);
    const linhaMarketing = snapshot.find((s) => s.employeeId === ativo2);
    expect(linhaMarketing!.departamentoId).toBe(DEPT_MARKETING);

    // Idempotencia: reexecucao nao reabre nem duplica snapshot.
    const segunda = await openScheduledNr1Cycles(client.db, now);
    expect(segunda.ciclosAbertos).not.toContain(cicloVencido);
    const snapshotDepois = await client.db
      .select()
      .from(copsoqCycleSnapshot)
      .where(eq(copsoqCycleSnapshot.cicloDbId, cicloVencido));
    expect(snapshotDepois).toHaveLength(2);
  });
});

// ============================================================
// closeNr1Cycle — §11.2, §11.6-§11.14
// ============================================================

describe('closeNr1Cycle — fechamento canonico completo', () => {
  it('calcula escopos, divergencia, critico, alertas e notificacoes em uma transacao', async () => {
    const companyId = await createCompany(CNPJ_FECHAMENTO);
    const rh = await createEmployee(companyId, {
      departamento: 'Recursos Humanos',
      isRH: true,
    });

    // Comercial 6 (escopo proprio), Marketing 2 + Logistica 3
    // (agregacao = 5), Financeiro 3 (sobra insuficiente).
    const comerciais: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      comerciais.push(await createEmployee(companyId, { departamento: 'Comercial' }));
    }
    const marketing: number[] = [];
    for (let i = 0; i < 2; i += 1) {
      marketing.push(await createEmployee(companyId, { departamento: 'Marketing' }));
    }
    const logistica: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      logistica.push(await createEmployee(companyId, { departamento: 'Logística' }));
    }
    const financeiro: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      financeiro.push(await createEmployee(companyId, { departamento: 'Financeiro' }));
    }

    const abertura = new Date('2026-07-01T03:00:00.000Z');
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: dataCivil(0),
      dataFechamento: dataCivil(40),
    });
    await openScheduledNr1Cycles(client.db, abertura);

    // O RH tambem esta no snapshot; para nao contaminar a aritmetica
    // dos escopos, ele nao responde (fica pendente).
    const respondidoEm = new Date('2026-07-10T12:00:00.000Z');
    for (const employeeId of comerciais) {
      await responderCiclo(cicloDbId, companyId, employeeId, 0, respondidoEm);
    }
    for (const employeeId of [...marketing, ...logistica, ...financeiro]) {
      await responderCiclo(cicloDbId, companyId, employeeId, 3, respondidoEm);
    }

    const emitidos: EmitAlertPostGravacaoInput[] = [];
    const fechamento = new Date('2026-08-11T03:00:00.000Z');
    const deps: CloseNr1CycleDeps = {
      alertFacade: {
        emitAlertPostGravacao: async (input) => {
          emitidos.push(input);
        },
      },
    };
    const resultado = await closeNr1Cycle(client.db, cicloDbId, fechamento, deps);

    expect(resultado.fechado).toBe(true);
    expect(resultado.respondentesEfetivos).toBe(14);
    expect(resultado.elegiveis).toBe(15); // 14 respondentes + RH pendente
    expect(resultado.adesaoPercentual).toBe(adesaoPercentualNr1(14, 15));

    // §11.6/§11.7 — 3 escopos: empresa, Comercial e a agregacao.
    expect(resultado.escoposCalculados).toBe(3);
    expect(resultado.scoresGravados).toBe(24);
    expect(resultado.departamentosAmostraInsuficiente).toEqual([DEPT_FINANCEIRO]);

    const scores = await client.db
      .select()
      .from(copsoqFactorScores)
      .where(eq(copsoqFactorScores.cicloDbId, cicloDbId));

    const empresaAutonomia = scores.find((s) => s.escopo === 'empresa' && s.fator === 4);
    expect(Number(empresaAutonomia!.score)).toBe(42.86);
    expect(empresaAutonomia!.countRespondentes).toBe(14);

    const empresaRitmo = scores.find((s) => s.escopo === 'empresa' && s.fator === 2);
    expect(Number(empresaRitmo!.score)).toBe(57.14);

    const comercialAutonomia = scores.find(
      (s) =>
        s.escopo === 'departamento' && s.escopoDepartamentoId === DEPT_COMERCIAL && s.fator === 4,
    );
    expect(Number(comercialAutonomia!.score)).toBe(0);

    const agregacao = scores.filter((s) => s.escopo === 'agregacao');
    expect(agregacao).toHaveLength(8);
    // RV-13 — consumo real do tipo publico exportado pelo motor.
    const primeiroAgregado: EscopoCalculadoNr1 = {
      escopo: 'agregacao',
      escopoDepartamentoId: agregacao[0]!.escopoDepartamentoId,
      escopoNomeAgregacao: agregacao[0]!.escopoNomeAgregacao,
      agregadoDe: (agregacao[0]!.agregadoDe as readonly number[]) ?? null,
      countRespondentes: agregacao[0]!.countRespondentes,
      scores: new Map(),
    };
    expect(primeiroAgregado.escopoNomeAgregacao).toBe('Agregação de: Marketing, Logística');
    expect(primeiroAgregado.agregadoDe).toEqual([DEPT_MARKETING, DEPT_LOGISTICA]);
    expect(primeiroAgregado.countRespondentes).toBe(5);

    // §11.9 — duas analises (Comercial e agregacao), ambas criticas.
    expect(resultado.divergenciasGravadas).toBe(2);
    const divergencias = await client.db
      .select()
      .from(nr1AreaDivergenceAnalysis)
      .where(eq(nr1AreaDivergenceAnalysis.cicloDbId, cicloDbId));
    expect(divergencias).toHaveLength(2);
    expect(divergencias.every((d) => d.classificacao === 'divergencia_critica')).toBe(true);

    // §11.10 — apenas escopo 'departamento' concorre.
    expect(resultado.departamentoCriticoDepartamentoId).toBe(DEPT_COMERCIAL);
    const [cicloFechado] = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, cicloDbId));
    expect(cicloFechado!.status).toBe('fechado');
    expect(cicloFechado!.fechadoEm).not.toBeNull();
    expect(cicloFechado!.departamentoCriticoDepartamentoNome).toBe('Comercial');

    // §11.13 — 4 fatores de recurso < 50 na empresa + 4 no Comercial,
    // mais 1 alerta de fechamento.
    expect(resultado.alertasGravados).toBe(9);
    const linhasAlerta = await client.db
      .select()
      .from(alerts)
      .where(eq(alerts.companyId, companyId));
    const fatorCritico = linhasAlerta.filter((a) => a.tipo === 'nr1_fator_critico');
    expect(fatorCritico).toHaveLength(8);
    expect(fatorCritico.every((a) => a.severidade === 'atencao')).toBe(true);
    expect(fatorCritico.every((a) => a.escopoEmployeeId === null)).toBe(true);
    expect(fatorCritico.every((a) => a.suprimidoPorCooldown === false)).toBe(true);
    expect(fatorCritico.every((a) => a.cicloDbId === cicloDbId)).toBe(true);

    const alertaEmpresaAutonomia = fatorCritico.find(
      (a) => a.escopo === 'empresa' && a.fatorId === 4,
    );
    expect(Number(alertaEmpresaAutonomia!.scoreValor)).toBe(42.86);
    const metadados = alertaEmpresaAutonomia!.metadados as Record<string, unknown>;
    expect(metadados.trimestre).toBe('2026-Q3');
    expect(metadados.fatorNome).toBe('Autonomia');
    expect(metadados.escopo).toBe('empresa');
    expect(metadados.departamentoNome).toBeNull();
    expect(metadados.cicloDbId).toBe(cicloDbId);

    const alertaDeptAutonomia = fatorCritico.find(
      (a) => a.escopo === 'departamento' && a.fatorId === 4,
    );
    expect(alertaDeptAutonomia!.escopoDepartamentoId).toBe(DEPT_COMERCIAL);
    expect((alertaDeptAutonomia!.metadados as Record<string, unknown>).departamentoNome).toBe(
      'Comercial',
    );

    const alertaFechamento = linhasAlerta.filter((a) => a.tipo === 'nr1_ciclo_fechado');
    expect(alertaFechamento).toHaveLength(1);
    expect(alertaFechamento[0]!.fatorId).toBeNull();

    // §11.14 — 1 RH ativo: 8 notificacoes de fator + 1 de fechamento
    // + 1 de Bruno.
    expect(resultado.notificacoesGravadas).toBe(10);
    const linhasNotificacao = await client.db
      .select()
      .from(notifications)
      .where(eq(notifications.companyId, companyId));
    expect(linhasNotificacao).toHaveLength(10);
    expect(linhasNotificacao.every((n) => n.alertId !== null)).toBe(true);

    const paraRh = linhasNotificacao.filter((n) => n.destinatarioTipo === 'rh');
    expect(paraRh).toHaveLength(9);
    expect(paraRh.every((n) => n.destinatarioEmployeeId === rh)).toBe(true);

    const notifEmpresaAutonomia = paraRh.find((n) => n.alertId === alertaEmpresaAutonomia!.id);
    expect(notifEmpresaAutonomia!.titulo).toBe('Fator Autonomia em alerta: score 42.86');
    expect(notifEmpresaAutonomia!.linkDestino).toBe(`/nr1?ciclo=${cicloDbId}&fator=4`);

    const notifDeptAutonomia = paraRh.find((n) => n.alertId === alertaDeptAutonomia!.id);
    expect(notifDeptAutonomia!.titulo).toBe(
      'Fator Autonomia em alerta no departamento Comercial: score 0.00',
    );

    const notifFechamentoRh = paraRh.find((n) => n.tipo === 'nr1_ciclo_fechado');
    expect(notifFechamentoRh!.titulo).toBe(
      `Radar NR-1 — ciclo ${cicloFechado!.ciclo} encerrado. Relatório disponível.`,
    );
    expect(notifFechamentoRh!.linkDestino).toBe(`/nr1?ciclo=${cicloDbId}`);

    const paraBruno = linhasNotificacao.filter((n) => n.destinatarioTipo === 'bruno');
    expect(paraBruno).toHaveLength(1);
    expect(paraBruno[0]!.destinatarioEmployeeId).toBeNull();
    expect(paraBruno[0]!.titulo).toBe(
      `ME049CD ENGINE ${CNPJ_FECHAMENTO} — ciclo do Radar NR-1 encerrado com 4 fatores em alerta.`,
    );
    expect(paraBruno[0]!.linkDestino).toBe(
      `/super-admin/empresa/${companyId}/nr1?ciclo=${cicloDbId}`,
    );

    // S217 — hook chamado uma vez por alerta, apos a persistencia.
    expect(emitidos).toHaveLength(9);
    expect(emitidos.filter((e) => e.tipo === 'nr1_fator_critico')).toHaveLength(8);
    expect(emitidos.filter((e) => e.tipo === 'nr1_ciclo_fechado')).toHaveLength(1);
    expect(emitidos.every((e) => e.cicloDbId === cicloDbId)).toBe(true);

    // §11.2 — fechamento e irreversivel: reexecucao nao faz nada.
    const repetido = await closeNr1Cycle(client.db, cicloDbId, fechamento);
    expect(repetido.fechado).toBe(false);
    expect(repetido.scoresGravados).toBe(0);
  });

  it('nao calcula escopo algum quando a empresa nao atinge o piso de 5 (§11.7)', async () => {
    const companyId = await createCompany(CNPJ_PISO);
    const ids: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push(await createEmployee(companyId, { departamento: 'Comercial' }));
    }

    const abertura = new Date('2026-07-01T03:00:00.000Z');
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: dataCivil(0),
      dataFechamento: dataCivil(35),
    });
    await openScheduledNr1Cycles(client.db, abertura);

    const respondidoEm = new Date('2026-07-05T12:00:00.000Z');
    for (const employeeId of ids) {
      await responderCiclo(cicloDbId, companyId, employeeId, 2, respondidoEm);
    }

    const resultado = await closeNr1Cycle(
      client.db,
      cicloDbId,
      new Date('2026-08-06T03:00:00.000Z'),
    );

    expect(resultado.fechado).toBe(true);
    expect(resultado.escoposCalculados).toBe(0);
    expect(resultado.scoresGravados).toBe(0);
    expect(resultado.divergenciasGravadas).toBe(0);
    expect(resultado.departamentoCriticoDepartamentoId).toBeNull();
    // Sem score de empresa nao ha fator critico; so o alerta de
    // fechamento e gravado.
    expect(resultado.alertasGravados).toBe(1);
    expect(resultado.departamentosAmostraInsuficiente).toEqual([DEPT_COMERCIAL]);
  });

  it('devolve `fechado: false` para ciclo inexistente sem efeito colateral', async () => {
    const resultado = await closeNr1Cycle(client.db, 999999999, new Date());
    expect(resultado.fechado).toBe(false);
    expect(resultado.companyId).toBe(0);
  });

  it('expoe a Facade no-op default do pipeline pos-gravacao (S217)', async () => {
    await expect(
      DEFAULT_NR1_ALERT_FACADE.emitAlertPostGravacao({
        alertId: 1,
        companyId: 1,
        tipo: 'nr1_ciclo_fechado',
        escopoDepartamentoId: null,
        fatorId: null,
        cicloDbId: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
