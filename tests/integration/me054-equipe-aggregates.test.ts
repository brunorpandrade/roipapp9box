// ROIP APP 9BOX — teste de integracao do motor de agregacao do
// contexto de equipe (ME-054, fecha D059). Contra MySQL real.
//
// Cobertura canonica §8.3.2:
//   - Medias dos diretos ativos no trimestre (desempenho, plenitude,
//     score A, capacidade ociosa, ROI, % meta, assiduidade) — media
//     dos presentes, ignorando NULL.
//   - Distribuicao 9-Box por quadrante canonico (D3 Opcao B) — chaves
//     snake_case dos 9 nomes do produto.
//   - Historico agregado dos 4 trimestres com nota de clima.
//   - Bloqueio financeiro §5.6: viewer lider -> roi_estimado_medio e
//     roi_medio (historico) = null.
//   - Sem diretos -> agregados null, distribuicao zerada, historico [].
//
// Padrao S009: company local com CNPJ unico da faixa principal
// 10060..10069. L32 cleanup em afterAll (todas as tabelas com FK
// compartilhada; fixture global superAdmins id=1 preservada).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  climateEngagementData,
  companies,
  employeeLeaderHistory,
  employees,
  nineBoxClassifications,
  performanceData,
  performanceQuarterlyData,
  plenitudeData,
} from '../../src/db/schema';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import { loadDashboardEquipeContext } from '../../src/server/services/_shared/dashboardEquipeContext';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const HASH_A = 'hash-fixo-me054-equipe';
const TRIMESTRE = '2026-Q2';
const TRIMESTRE_ANTERIOR = '2026-Q1';
const CNPJ_AGREGADOS = '10060000000060';
const CNPJ_SEM_DIRETOS = '10060000000061';

let cpfCounter = 60600000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}
let batchCounter = 0;
function nextBatchId(): string {
  batchCounter += 1;
  return `00000000-0000-0000-0000-me054${String(batchCounter).padStart(6, '0')}`;
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
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
      await client.db
        .delete(nineBoxClassifications)
        .where(inArray(nineBoxClassifications.employeeId, empIds));
      await client.db.delete(plenitudeData).where(inArray(plenitudeData.employeeId, empIds));
      await client.db
        .delete(performanceQuarterlyData)
        .where(inArray(performanceQuarterlyData.employeeId, empIds));
      await client.db.delete(performanceData).where(inArray(performanceData.employeeId, empIds));
    }
    await client.db
      .delete(climateEngagementData)
      .where(inArray(climateEngagementData.companyId, createdCompanyIds));
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
      razaoSocial: `ME054 Equipe ${cnpj} LTDA`,
      nomeFantasia: `ME054 Equipe ${cnpj}`,
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

async function createEmployee(companyId: number, isLider = false): Promise<number> {
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
      isLider,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) {
    throw new Error('createEmployee: sem id');
  }
  return row.id;
}

async function vincula(liderId: number, employeeId: number): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId,
    dataInicio: new Date('2025-01-01'),
    dataFim: null,
    reason: 'fixture ME-054',
    transferBatchId: nextBatchId(),
  });
}

interface QuarterlyOpts {
  trimestre?: string;
  scoreDesempenho: string | null;
  capacidadeOciosa?: string | null;
  roiEstimado?: string | null;
  percMetaAtingida?: string | null;
}

async function quarterly(
  employeeId: number,
  companyId: number,
  opts: QuarterlyOpts,
): Promise<void> {
  await client.db.insert(performanceQuarterlyData).values({
    companyId,
    employeeId,
    trimestre: opts.trimestre ?? TRIMESTRE,
    scoreDesempenho: opts.scoreDesempenho,
    capacidadeOciosa: opts.capacidadeOciosa ?? null,
    roiEstimado: opts.roiEstimado ?? null,
    percMetaAtingida: opts.percMetaAtingida ?? null,
  });
}

async function plenitude(
  employeeId: number,
  companyId: number,
  scoreA: string | null,
  plenitudeScore: string | null,
  trimestre = TRIMESTRE,
): Promise<void> {
  await client.db.insert(plenitudeData).values({
    companyId,
    employeeId,
    trimestre,
    scoreA,
    plenitudeScore,
  });
}

async function nineBox(employeeId: number, companyId: number, quadrante: string): Promise<void> {
  await client.db.insert(nineBoxClassifications).values({
    companyId,
    employeeId,
    trimestre: TRIMESTRE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- enum canonico do schema
    quadrante: quadrante as any,
    posicaoX: 'alto',
    posicaoY: 'alta',
  });
}

async function assiduidadeMes(employeeId: number, companyId: number, mes: string, valor: string) {
  await client.db.insert(performanceData).values({
    companyId,
    employeeId,
    mes,
    assiduidade: valor,
  });
}

async function climaEquipe(
  companyId: number,
  liderId: number,
  notaClima: string,
  trimestre = TRIMESTRE,
) {
  await client.db.insert(climateEngagementData).values({
    companyId,
    escopo: 'equipe',
    liderId,
    trimestre,
    notaClima,
    adesao: '80.00',
  });
}

// ============================================================
// Cenario principal — 1 lider + 3 diretos com dados completos
// ============================================================

describe('loadDashboardEquipeContext — agregacao canonica (ME-054)', () => {
  let companyId: number;
  let liderId: number;
  let d1: number;
  let d2: number;
  let d3: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_AGREGADOS);
    liderId = await createEmployee(companyId, true);
    d1 = await createEmployee(companyId);
    d2 = await createEmployee(companyId);
    d3 = await createEmployee(companyId);
    await vincula(liderId, d1);
    await vincula(liderId, d2);
    await vincula(liderId, d3);

    // Trimestre atual — scores 60/80/100 (media 80); capacidade
    // 30/40/50 (media 40); ROI 2/4/6 (media 4); % meta 90/100/110
    // (media 100). d3 sem plenitude para exercitar media dos presentes.
    await quarterly(d1, companyId, {
      scoreDesempenho: '60.00',
      capacidadeOciosa: '30.00',
      roiEstimado: '2.0000',
      percMetaAtingida: '90.00',
    });
    await quarterly(d2, companyId, {
      scoreDesempenho: '80.00',
      capacidadeOciosa: '40.00',
      roiEstimado: '4.0000',
      percMetaAtingida: '100.00',
    });
    await quarterly(d3, companyId, {
      scoreDesempenho: '100.00',
      capacidadeOciosa: '50.00',
      roiEstimado: '6.0000',
      percMetaAtingida: '110.00',
    });
    // Plenitude: d1=50, d2=70 (media 60); d3 sem linha.
    await plenitude(d1, companyId, '55.00', '50.00');
    await plenitude(d2, companyId, '65.00', '70.00');
    // 9-Box: 2x ALTO IMPACTO, 1x RISCO CRÍTICO.
    await nineBox(d1, companyId, 'ALTO IMPACTO');
    await nineBox(d2, companyId, 'ALTO IMPACTO');
    await nineBox(d3, companyId, 'RISCO CRÍTICO');
    // Assiduidade — meses do Q2 (abril/maio/junho): d1=90/90/90,
    // d2=100/100/100, d3 sem linha. Media geral dos presentes = 95.
    for (const mes of ['2026-04', '2026-05', '2026-06']) {
      await assiduidadeMes(d1, companyId, mes, '90.00');
      await assiduidadeMes(d2, companyId, mes, '100.00');
    }
    // Historico — trimestre anterior com desempenho e plenitude.
    await quarterly(d1, companyId, {
      trimestre: TRIMESTRE_ANTERIOR,
      scoreDesempenho: '40.00',
      roiEstimado: '1.0000',
    });
    await quarterly(d2, companyId, {
      trimestre: TRIMESTRE_ANTERIOR,
      scoreDesempenho: '60.00',
      roiEstimado: '3.0000',
    });
    await plenitude(d1, companyId, '45.00', '40.00', TRIMESTRE_ANTERIOR);
    await plenitude(d2, companyId, '55.00', '60.00', TRIMESTRE_ANTERIOR);
    await climaEquipe(companyId, liderId, '7.50');
    await climaEquipe(companyId, liderId, '7.00', TRIMESTRE_ANTERIOR);
  });

  it('computa as medias canonicas dos diretos (viewer RH)', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId,
      liderId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.trimestre_atual).toBe(TRIMESTRE);
    expect(ctx!.agregados.score_desempenho_medio).toBe(80);
    expect(ctx!.agregados.capacidade_ociosa_media).toBe(40);
    expect(ctx!.agregados.roi_estimado_medio).toBe(4);
    expect(ctx!.agregados.perc_meta_atingida_media).toBe(100);
    // Media dos presentes: plenitude só de d1/d2.
    expect(ctx!.agregados.plenitude_score_medio).toBe(60);
    expect(ctx!.agregados.score_a_medio).toBe(60);
    // Assiduidade: media de 6 registros (90x3 + 100x3) = 95.
    expect(ctx!.agregados.assiduidade_media).toBe(95);
  });

  it('computa a distribuicao 9-Box com chaves canonicas (D3 Opcao B)', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId,
      liderId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx!.distribuicao_9box.alto_impacto).toBe(2);
    expect(ctx!.distribuicao_9box.risco_critico).toBe(1);
    expect(ctx!.distribuicao_9box.alta_entrega).toBe(0);
    // Chaves genericas antigas nao existem mais.
    expect((ctx!.distribuicao_9box as Record<string, number>).estrela).toBeUndefined();
  });

  it('computa o historico agregado com nota de clima', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId,
      liderId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    const hist = ctx!.historico_4_trimestres;
    expect(hist.length).toBe(2);
    const atual = hist.find((h) => h.trimestre === TRIMESTRE);
    const anterior = hist.find((h) => h.trimestre === TRIMESTRE_ANTERIOR);
    expect(atual?.score_desempenho_medio).toBe(80);
    expect(atual?.plenitude_score_medio).toBe(60);
    expect(atual?.nota_clima).toBe(7.5);
    expect(anterior?.score_desempenho_medio).toBe(50);
    expect(anterior?.nota_clima).toBe(7);
  });

  it('bloqueia financeiro para viewer lider (§5.6): roi null em medias e historico', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId,
      liderId,
      viewerRole: 'lider',
      viewerUserId: liderId,
      viewerUserType: 'employee',
    });
    expect(ctx!.agregados.roi_estimado_medio).toBeNull();
    // Demais medias permanecem visiveis.
    expect(ctx!.agregados.score_desempenho_medio).toBe(80);
    for (const linha of ctx!.historico_4_trimestres) {
      expect(linha.roi_medio).toBeNull();
    }
  });
});

// ============================================================
// Cenario de borda — lider sem diretos
// ============================================================

describe('loadDashboardEquipeContext — lider sem diretos (ME-054)', () => {
  it('retorna agregados null, distribuicao zerada e historico vazio', async () => {
    const companyId = await createCompany(CNPJ_SEM_DIRETOS);
    const liderId = await createEmployee(companyId, true);
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId,
      liderId,
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.trimestre_atual).toBeNull();
    expect(ctx!.agregados.score_desempenho_medio).toBeNull();
    expect(ctx!.distribuicao_9box.alto_impacto).toBe(0);
    expect(ctx!.historico_4_trimestres).toEqual([]);
  });
});
