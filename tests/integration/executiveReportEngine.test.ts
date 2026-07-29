// ROIP APP 9BOX — teste integracao `executiveReportEngine`
// (ME-053, S275). Contra MySQL real.
//
// Cobertura canonica:
//   - Escopo empresa vazio: payload consistente com colaboradoresAtivos=0.
//   - Escopo empresa com dados: agregacoes de performance/plenitude.
//   - Escopo departamento: filtro por departamento aplicado.
//   - Piso canonico Clima §7.6: cascata equipe->depto->empresa.
//   - Bloco Turnover omitido (null) quando escopo=equipe.
//
// Faixa CNPJ desta ME: principal 10040..10049.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  climateEngagementData,
  companies,
  employees,
  performanceQuarterlyData,
  plenitudeData,
} from '../../src/db/schema';
import { buildExecutiveReportPayload } from '../../src/server/services/executiveReportEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
let cpfCounter = 41000000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string, nomeFantasia: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nomeFantasia} LTDA`,
      nomeFantasia,
      cnpj,
      telefone: '1633330053',
      endereco: `Rua ME-053, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!row) throw new Error('seed company failed');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function seedEmployee(
  companyId: number,
  name: string,
  departamento: 'Comercial' | 'Marketing',
): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'tecnico_especialista',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento,
      status: 'ativo',
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  return row.id;
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await db
      .delete(climateEngagementData)
      .where(inArray(climateEngagementData.companyId, createdCompanyIds));
    await db
      .delete(performanceQuarterlyData)
      .where(inArray(performanceQuarterlyData.companyId, createdCompanyIds));
    await db.delete(plenitudeData).where(inArray(plenitudeData.companyId, createdCompanyIds));
    await db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

describe('executiveReportEngine — escopo empresa', () => {
  it('empresa recem-criada retorna payload com colaboradoresAtivos=0', async () => {
    const companyId = await seedCompany('10041000000001', 'Vazio LTDA');
    const payload = await buildExecutiveReportPayload(db, {
      companyId,
      nomeFantasia: 'Vazio',
      razaoSocialSanitizada: 'VAZIO',
      escopo: { tipo: 'empresa', referencia: null, rotulo: 'Empresa' },
      trimestre: '2026-Q1',
    });
    expect(payload.blocoFinanceiro.trimestreAtual.colaboradoresAtivos).toBe(0);
    expect(payload.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado).toBeNull();
    expect(payload.blocoPlenitude.trimestreAtual.plenitudeScoreMedioAgregado).toBeNull();
    expect(payload.blocoClima.disponivel).toBe(false);
    expect(payload.blocoTurnover).not.toBeNull();
    expect(payload.detalhamentoCapilar.departamentos).toEqual([]);
  });

  it('empresa com dados: agrega performance + plenitude no bloco', async () => {
    const companyId = await seedCompany('10041000000002', 'ComDados LTDA');
    const emp1 = await seedEmployee(companyId, 'Ana', 'Comercial');
    const emp2 = await seedEmployee(companyId, 'Bruno', 'Comercial');
    await db.insert(performanceQuarterlyData).values([
      {
        companyId,
        employeeId: emp1,
        trimestre: '2026-Q1',
        scoreDesempenho: '80.00',
        percMetaAtingida: '100.00',
        roiEstimado: '1.2000',
      },
      {
        companyId,
        employeeId: emp2,
        trimestre: '2026-Q1',
        scoreDesempenho: '90.00',
        percMetaAtingida: '95.00',
        roiEstimado: '1.4000',
      },
    ]);
    await db.insert(plenitudeData).values([
      {
        companyId,
        employeeId: emp1,
        trimestre: '2026-Q1',
        scoreA: '75.00',
        scoreC: '75.00',
        plenitudeScore: '75.00',
        alertaDivergencia: false,
      },
      {
        companyId,
        employeeId: emp2,
        trimestre: '2026-Q1',
        scoreA: '85.00',
        scoreC: '85.00',
        plenitudeScore: '85.00',
        alertaDivergencia: true,
      },
    ]);
    const payload = await buildExecutiveReportPayload(db, {
      companyId,
      nomeFantasia: 'ComDados',
      razaoSocialSanitizada: 'COMDADOS',
      escopo: { tipo: 'empresa', referencia: null, rotulo: 'Empresa' },
      trimestre: '2026-Q1',
    });
    expect(payload.blocoDesempenho.trimestreAtual.colaboradoresAtivos).toBe(2);
    expect(payload.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado).toBe(85);
    expect(payload.blocoDesempenho.trimestreAtual.percMetaAtingidaAgregada).toBe(97.5);
    expect(payload.blocoPlenitude.trimestreAtual.plenitudeScoreMedioAgregado).toBe(80);
    expect(payload.blocoPlenitude.trimestreAtual.percColaboradoresComAlertaDivergencia).toBe(50);
  });
});

describe('executiveReportEngine — escopo departamento e piso Clima', () => {
  it('filtra por departamento e clima <3 respondentes vira indisponivel', async () => {
    const companyId = await seedCompany('10041000000003', 'FiltroDept LTDA');
    const emp1 = await seedEmployee(companyId, 'Carlos', 'Comercial');
    const emp2 = await seedEmployee(companyId, 'Diana', 'Marketing');
    void emp2;
    await db.insert(performanceQuarterlyData).values([
      {
        companyId,
        employeeId: emp1,
        trimestre: '2026-Q1',
        scoreDesempenho: '70.00',
        percMetaAtingida: '90.00',
      },
    ]);
    // Clima abaixo do piso (2 respondentes).
    await db.insert(climateEngagementData).values({
      companyId,
      escopo: 'empresa',
      trimestre: '2026-Q1',
      notaClima: '3.50',
      adesao: '50.00',
      countCobertura: 2,
      countTotal: 4,
    });
    const payload = await buildExecutiveReportPayload(db, {
      companyId,
      nomeFantasia: 'FiltroDept',
      razaoSocialSanitizada: 'FILTRODEPT',
      escopo: { tipo: 'departamento', referencia: 'Comercial', rotulo: 'Comercial' },
      trimestre: '2026-Q1',
    });
    // Apenas o funcionario Comercial deve entrar no agregado.
    expect(payload.blocoDesempenho.trimestreAtual.colaboradoresAtivos).toBe(1);
    expect(payload.blocoDesempenho.trimestreAtual.scoreDesempenhoMedioAgregado).toBe(70);
    // Clima abaixo do piso -> disponivel=false.
    expect(payload.blocoClima.disponivel).toBe(false);
  });

  it('escopo=equipe omite bloco Turnover (null) e detalhamento vazio', async () => {
    const companyId = await seedCompany('10041000000004', 'EquipeTest LTDA');
    const lider = await seedEmployee(companyId, 'Lider1', 'Comercial');
    const payload = await buildExecutiveReportPayload(db, {
      companyId,
      nomeFantasia: 'EquipeTest',
      razaoSocialSanitizada: 'EQUIPETEST',
      escopo: {
        tipo: 'equipe',
        referencia: String(lider),
        rotulo: `Equipe Lider1`,
      },
      trimestre: '2026-Q1',
    });
    expect(payload.blocoTurnover).toBeNull();
    expect(payload.detalhamentoCapilar.departamentos).toEqual([]);
  });
});
