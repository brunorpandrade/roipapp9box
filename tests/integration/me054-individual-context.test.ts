// ROIP APP 9BOX — teste de integracao do enriquecimento do contexto
// individual (ME-054, fecha D059). Contra MySQL real.
//
// Cobertura canonica §8.3.1:
//   - `detalhamento_variaveis`: join performanceVariableData x
//     employeeGoals do mes mais recente com dados do trimestre;
//     `percentual` = razao (desempenho) x 100.
//   - `assiduidade`: media de performanceData.assiduidade dos meses
//     do trimestre.
//   - `dx`/`dy`: delta ordinal de posicao 9-Box vs trimestre anterior.
//   - `historico_4_trimestres` enriquecido: plenitude, quadrante,
//     assiduidade e financeiro por linha.
//   - `dialogos_desenvolvimento_recentes`: nao arquivados, recentes.
//   - eixo_y dimensoes pertencimento/realizacao populadas.
//   - Bloqueio financeiro §5.6 (viewer lider).
//
// Padrao S009: CNPJ unico da faixa principal 10061. L32 cleanup.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  developmentDialogs,
  employeeGoals,
  employees,
  nineBoxClassifications,
  performanceData,
  performanceQuarterlyData,
  performanceVariableData,
  plenitudeData,
} from '../../src/db/schema';
import { loadDashboardIndividualContext } from '../../src/server/services/_shared/dashboardIndividualContext'; // eslint-disable-line @stylistic/max-len

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const HASH_A = 'hash-fixo-me054-individual';
const TRIMESTRE = '2026-Q2';
const TRIMESTRE_ANTERIOR = '2026-Q1';
const CNPJ = '10061000000061';

let cpfCounter = 61600000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) {
    return;
  }
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db
        .delete(developmentDialogs)
        .where(inArray(developmentDialogs.employeeId, empIds));
      await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
      await client.db
        .delete(nineBoxClassifications)
        .where(inArray(nineBoxClassifications.employeeId, empIds));
      await client.db.delete(plenitudeData).where(inArray(plenitudeData.employeeId, empIds));
      // performanceVariableData tem FK cascade em performanceData.
      const perfRows = await client.db
        .select({ id: performanceData.id })
        .from(performanceData)
        .where(inArray(performanceData.employeeId, empIds));
      const perfIds = perfRows.map((r) => r.id);
      if (perfIds.length > 0) {
        await client.db
          .delete(performanceVariableData)
          .where(inArray(performanceVariableData.performanceDataId, perfIds));
      }
      await client.db.delete(performanceData).where(inArray(performanceData.employeeId, empIds));
      await client.db
        .delete(performanceQuarterlyData)
        .where(inArray(performanceQuarterlyData.employeeId, empIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME054 Individual ${cnpj} LTDA`,
      nomeFantasia: `ME054 Individual ${cnpj}`,
      cnpj,
      telefone: '1633330054',
      endereco: `Rua ME-054, ${cnpj}`,
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
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  if (!row) {
    throw new Error('createCompany: sem id');
  }
  createdCompanyIds.push(row.id);
  return row.id;
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Emp ${nextCpf()}`,
      cpf: nextCpf(),
      email: `emp-${companyId}-${nextCpf()}@example.com`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '252105',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

let companyId: number;
let empId: number;

describe('loadDashboardIndividualContext — enriquecimento canonico (ME-054)', () => {
  beforeAll(async () => {
    companyId = await createCompany(CNPJ);
    empId = await createEmployee(companyId);

    // Quarterly atual + anterior.
    await client.db.insert(performanceQuarterlyData).values({
      companyId,
      employeeId: empId,
      trimestre: TRIMESTRE,
      scoreDesempenho: '82.00',
      indiceDesempenho: '0.8200',
      capacidadeOciosa: '45.00',
      roiEstimado: '4.5000',
      metaROI: '3.00',
      retornoEstimado: '15000.00',
      percMetaAtingida: '105.00',
    });
    await client.db.insert(performanceQuarterlyData).values({
      companyId,
      employeeId: empId,
      trimestre: TRIMESTRE_ANTERIOR,
      scoreDesempenho: '70.00',
      capacidadeOciosa: '55.00',
      roiEstimado: '3.0000',
      percMetaAtingida: '90.00',
    });

    // Plenitude atual com dimensoes pertencimento/realizacao.
    await client.db.insert(plenitudeData).values({
      companyId,
      employeeId: empId,
      trimestre: TRIMESTRE,
      scoreA: '75.00',
      scoreC: '70.00',
      plenitudeScore: '72.00',
      alertaDivergencia: false,
      pertencimentoA: '80.00',
      pertencimentoC: '76.00',
      realizacaoA: '68.00',
      realizacaoC: '64.00',
    });
    await client.db.insert(plenitudeData).values({
      companyId,
      employeeId: empId,
      trimestre: TRIMESTRE_ANTERIOR,
      scoreA: '65.00',
      plenitudeScore: '60.00',
    });

    // 9-Box: atual alto/alta; anterior medio/media -> dx=+1, dy=+1.
    await client.db.insert(nineBoxClassifications).values({
      companyId,
      employeeId: empId,
      trimestre: TRIMESTRE,
      quadrante: 'ALTO IMPACTO',
      posicaoX: 'alto',
      posicaoY: 'alta',
    });
    await client.db.insert(nineBoxClassifications).values({
      companyId,
      employeeId: empId,
      trimestre: TRIMESTRE_ANTERIOR,
      quadrante: 'EQUILÍBRIO FRÁGIL',
      posicaoX: 'medio',
      posicaoY: 'media',
    });

    // performanceData dos meses do Q2 + variaveis no mes mais recente.
    for (const mes of ['2026-04', '2026-05']) {
      await client.db.insert(performanceData).values({
        companyId,
        employeeId: empId,
        mes,
        assiduidade: mes === '2026-04' ? '90.00' : '100.00',
      });
    }
    const [pdJun] = await client.db
      .insert(performanceData)
      .values({ companyId, employeeId: empId, mes: '2026-06', assiduidade: '98.00' })
      .$returningId();
    if (!pdJun) {
      throw new Error('fixture: performanceData junho sem id');
    }
    // Variaveis do mes mais recente (junho).
    await client.db.insert(performanceVariableData).values({
      performanceDataId: pdJun.id,
      variableIndex: 1,
      demanda: '100.00',
      executado: '120.00',
      desempenho: '1.2000',
      peso: '60.00',
    });
    await client.db.insert(performanceVariableData).values({
      performanceDataId: pdJun.id,
      variableIndex: 2,
      demanda: '50.00',
      executado: '40.00',
      desempenho: '0.8000',
      peso: '40.00',
    });
    // Goals (nome + meta por variavel).
    await client.db.insert(employeeGoals).values({
      employeeId: empId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Vendas fechadas',
      unit: 'un',
      weight: '60.00',
      goal: '100.00',
      updatedBy: 'rh',
    });
    await client.db.insert(employeeGoals).values({
      employeeId: empId,
      jobFamily: 'vendas_comercial',
      variableIndex: 2,
      variableName: 'Follow-ups',
      unit: 'un',
      weight: '40.00',
      goal: '50.00',
      updatedBy: 'rh',
    });

    // Dialogos: 1 nao arquivado + 1 arquivado (deve ser excluido).
    await client.db.insert(developmentDialogs).values({
      companyId,
      liderId: empId,
      employeeId: empId,
      titulo: 'Feedback trimestral',
      status: 'verde',
      pendencia: false,
      arquivado: false,
    });
    await client.db.insert(developmentDialogs).values({
      companyId,
      liderId: empId,
      employeeId: empId,
      titulo: 'Antigo arquivado',
      status: 'vermelho',
      pendencia: true,
      arquivado: true,
    });
  });

  it('popula detalhamento_variaveis com nome, meta e percentual', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx).not.toBeNull();
    const vars = ctx!.eixo_x.detalhamento_variaveis;
    expect(vars.length).toBe(2);
    const v1 = vars.find((v) => v.nome === 'Vendas fechadas');
    expect(v1?.meta).toBe(100);
    expect(v1?.demanda).toBe(100);
    expect(v1?.executado).toBe(120);
    expect(v1?.percentual).toBe(120);
    expect(v1?.peso).toBe(60);
  });

  it('computa assiduidade media do trimestre', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    // (90 + 100 + 98) / 3 = 96.
    expect(ctx!.assiduidade).toBe(96);
  });

  it('computa dx/dy ordinal vs trimestre anterior', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    // atual alto/alta (2/2) - anterior medio/media (1/1) = +1/+1.
    expect(ctx!['9box'].dx).toBe(1);
    expect(ctx!['9box'].dy).toBe(1);
  });

  it('popula eixo_y pertencimento e realizacao', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx!.eixo_y.por_dimensao.pertencimento.a).toBe(80);
    expect(ctx!.eixo_y.por_dimensao.pertencimento.c).toBe(76);
    expect(ctx!.eixo_y.por_dimensao.realizacao.a).toBe(68);
    expect(ctx!.eixo_y.por_dimensao.realizacao.c).toBe(64);
  });

  it('enriquece historico com plenitude, quadrante, assiduidade e financeiro', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    const atual = ctx!.historico_4_trimestres.find((h) => h.trimestre === TRIMESTRE);
    expect(atual?.plenitude_score).toBe(72);
    expect(atual?.quadrante).toBe('ALTO IMPACTO');
    expect(atual?.assiduidade).toBe(96);
    expect(atual?.financeiro?.roi_estimado).toBe(4.5);
  });

  it('lista dialogos nao arquivados e exclui arquivados', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    const dialogos = ctx!.dialogos_desenvolvimento_recentes;
    expect(dialogos.length).toBe(1);
    expect(dialogos[0]?.titulo).toBe('Feedback trimestral');
    expect(dialogos[0]?.status).toBe('verde');
  });

  it('bloqueia financeiro no historico para viewer lider (§5.6)', async () => {
    const ctx = await loadDashboardIndividualContext(client.db, {
      companyId,
      employeeId: empId,
      viewerRole: 'lider',
      viewerUserId: 888,
      viewerUserType: 'employee',
    });
    expect(ctx!.financeiro).toBeNull();
    for (const linha of ctx!.historico_4_trimestres) {
      expect(linha.financeiro).toBeNull();
    }
  });
});
