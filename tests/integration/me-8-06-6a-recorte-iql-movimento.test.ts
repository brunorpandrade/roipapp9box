// ROIP APP 9BOX — ME §8.06.6a — IQL do lider-dono + movimento no 9-Box
// nos recortes de equipe/cadeia, contra MySQL real (RV-11). Semeia uma
// hierarquia (e1 lider de e2/e4; e2 lider de e3), classifica dois
// trimestres fechados (2025-Q2 e 2025-Q3) e grava IQL do e1 (>= 3
// respondentes) e do e2 (< 3). Verifica: IQL preenchido em equipe/cadeia
// de e1 (geral + 4 dimensoes), anonimizacao em e2, movimento com base no
// trimestre anterior, e ausencia de ambos no departamento.
//
// Faixa CNPJ reservada distinta (986).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeLeaderHistory,
  employees,
  iqlData,
  monthlyClosureStatus,
  performanceQuarterlyData,
  plenitudeData,
} from '../../src/db/schema';
import type { Departamento } from '../../src/db/schema/enums';
import { createCompany } from '../../src/server/services/companies';
import { loadRecorteAggregatePage } from '../../src/server/services/companyAggregate';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ = '10000000000986';
let cpfSeq = 59000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330099',
  endereco: 'Rua Movimento',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  contatoPrincipalNome: 'Principal',
  contatoPrincipalEmail: 'p@roip.test',
  contatoRHNome: 'RH',
  contatoRHEmail: 'rh@roip.test',
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'A',
  contextoMercado: 'A',
  mesKickoff: 1,
  kickoffDate: new Date('2025-01-01'),
};

describe('ME §8.06.6a — IQL do lider e movimento no recorte (MySQL real)', () => {
  let client: RoipDbClient;
  let companyId = 0;
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;
  let e4 = 0;

  async function seedEmployee(name: string, dept: Departamento, lider: boolean): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf: String(cpfSeq),
        email: `${cpfSeq}@roip.test`,
        dataNascimento: new Date('1990-05-20'),
        dataAdmissao: new Date('2024-01-10'),
        cargo: 'Analista',
        cbo: '252105',
        descricaoCBO: 'Analista de negócios',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: dept,
        isLider: lider,
        isRH: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function link(employeeId: number, liderId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2024-01-15'),
      dataFim: null,
      reason: 'seed §8.06.6a',
      transferBatchId: '00000000-0000-0000-0000-000000000000',
    });
  }

  async function classificar(
    employeeId: number,
    trimestre: string,
    score: string,
    plen: string,
  ): Promise<void> {
    await client.db.insert(performanceQuarterlyData).values({
      companyId,
      employeeId,
      trimestre,
      indiceDesempenho: '1.0000',
      scoreDesempenho: score,
      capacidadeOciosa: '10.00',
      retornoEstimado: '10000.00',
      custoMedioTrimestral: '5000.00',
    });
    await client.db.insert(plenitudeData).values({
      companyId,
      employeeId,
      trimestre,
      plenitudeScore: plen,
      scoreA: plen,
      scoreC: plen,
      engajamentoA: plen,
      engajamentoC: plen,
      desenvolvimentoA: plen,
      desenvolvimentoC: plen,
      pertencimentoA: plen,
      pertencimentoC: plen,
      realizacaoA: plen,
      realizacaoC: plen,
    });
  }

  async function seedIql(liderId: number, respondentes: number): Promise<void> {
    await client.db.insert(iqlData).values({
      companyId,
      liderId,
      clevelId: null,
      trimestre: '2025-Q3',
      scoreDirecionamentoClareza: '72.00',
      scoreDesenvolvimentoApoio: '74.00',
      scoreRelacionamentoConfianca: '76.00',
      scoreGestaoResultados: '78.00',
      iql: '75.00',
      countRespondentes: respondentes,
      countRespondentesElegiveis: respondentes,
    });
  }

  async function cleanup(): Promise<void> {
    const rows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.cnpj, [CNPJ]));
    const cids = rows.map((r) => r.id);
    if (cids.length === 0) {
      return;
    }
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, cids));
    const eids = emps.map((r) => r.id);
    if (eids.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, eids));
    }
    await client.db.delete(iqlData).where(inArray(iqlData.companyId, cids));
    await client.db
      .delete(performanceQuarterlyData)
      .where(inArray(performanceQuarterlyData.companyId, cids));
    await client.db.delete(plenitudeData).where(inArray(plenitudeData.companyId, cids));
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, cids));
    await client.db.delete(employees).where(inArray(employees.companyId, cids));
    await client.db.delete(companies).where(inArray(companies.id, cids));
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP 8066A LTDA',
      nomeFantasia: 'ROIP 8066A',
      cnpj: CNPJ,
    });
    e1 = await seedEmployee('Mov E1', 'Comercial', true);
    e2 = await seedEmployee('Mov E2', 'Comercial', true);
    e3 = await seedEmployee('Mov E3', 'Comercial', false);
    e4 = await seedEmployee('Mov E4', 'Comercial', false);
    await link(e2, e1);
    await link(e4, e1);
    await link(e3, e2);
    // Q3 (atual) — valores maiores; Q2 (anterior) — menores: coletivo sobe.
    await classificar(e1, '2025-Q3', '92.00', '86.00');
    await classificar(e2, '2025-Q3', '88.00', '78.00');
    await classificar(e3, '2025-Q3', '60.00', '55.00');
    await classificar(e4, '2025-Q3', '70.00', '65.00');
    await classificar(e2, '2025-Q2', '70.00', '62.00');
    await classificar(e3, '2025-Q2', '50.00', '48.00');
    await classificar(e4, '2025-Q2', '60.00', '52.00');
    await seedIql(e1, 3);
    await seedIql(e2, 2);
    await client.db.insert(monthlyClosureStatus).values([
      { companyId, mes: '2025-04', status: 'fechado' },
      { companyId, mes: '2025-05', status: 'fechado' },
      { companyId, mes: '2025-06', status: 'fechado' },
      { companyId, mes: '2025-07', status: 'fechado' },
      { companyId, mes: '2025-08', status: 'fechado' },
      { companyId, mes: '2025-09', status: 'fechado' },
    ]);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  it('equipe direta de e1: IQL do lider (geral + 4 dimensoes) e movimento com base', async () => {
    const page = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'equipe',
      leader: { tipo: 'employee', id: e1 },
    });
    expect(page.trimestre).toBe('2025-Q3');
    expect(page.iqlLider).not.toBeNull();
    expect(page.iqlLider?.iql).toBe(75);
    expect(page.iqlLider?.direcionamentoClareza).toBe(72);
    expect(page.iqlLider?.desenvolvimentoApoio).toBe(74);
    expect(page.iqlLider?.relacionamentoConfianca).toBe(76);
    expect(page.iqlLider?.gestaoResultados).toBe(78);
    expect(page.iqlLider?.countRespondentes).toBe(3);
    expect(page.movimento9box).not.toBeNull();
    expect(page.movimento9box?.trimestreAnterior).toBe('2025-Q2');
    expect(page.movimento9box?.quadranteAtual).not.toBeNull();
    expect((page.movimento9box?.deltaX ?? 0) > 0).toBe(true);
    expect((page.movimento9box?.deltaY ?? 0) > 0).toBe(true);
  });

  it('cadeia total de e1: IQL do mesmo lider-dono preenchido', async () => {
    const page = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'cadeia',
      leader: { tipo: 'employee', id: e1 },
    });
    expect(page.iqlLider?.iql).toBe(75);
    expect(page.movimento9box).not.toBeNull();
  });

  it('equipe de e2: IQL anonimizado (< 3 respondentes) — iqlLider null', async () => {
    const page = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'equipe',
      leader: { tipo: 'employee', id: e2 },
    });
    expect(page.iqlLider).toBeNull();
  });

  it('departamento: sem IQL de lider e sem movimento (nao ha lider unico)', async () => {
    const page = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'departamento',
      departamento: 'Comercial',
    });
    expect(page.iqlLider).toBeNull();
    expect(page.movimento9box).toBeNull();
  });
});
