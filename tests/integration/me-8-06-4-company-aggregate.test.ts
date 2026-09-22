// ROIP APP 9BOX — ME §8.06.4 — dashboard agregado da empresa (loader)
// contra MySQL real (RV-11). Semeia 2 colaboradores com desempenho e
// plenitude no 2025-Q3, fecha o trimestre e verifica a composicao do
// motor via `loadCompanyAggregatePage`: media ponderada, ROI dos brutos,
// heatmap, centro de massa e o gate de trimestre fechado.
//
// Faixa CNPJ reservada distinta (984).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  monthlyClosureStatus,
  performanceQuarterlyData,
  plenitudeData,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { loadCompanyAggregatePage } from '../../src/server/services/companyAggregate';
import { readThresholds } from '../../src/server/services/nineBoxCalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ = '10000000000984';
let cpfSeq = 57000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330098',
  endereco: 'Rua Agregado',
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

describe('ME §8.06.4 — dashboard agregado da empresa (MySQL real)', () => {
  let client: RoipDbClient;
  let companyId = 0;

  async function seedEmployee(name: string): Promise<number> {
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
        departamento: 'Comercial',
        isLider: false,
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

  async function cleanup(): Promise<void> {
    const rows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.cnpj, [CNPJ]));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      return;
    }
    await client.db
      .delete(performanceQuarterlyData)
      .where(inArray(performanceQuarterlyData.companyId, ids));
    await client.db.delete(plenitudeData).where(inArray(plenitudeData.companyId, ids));
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, ids));
    await client.db.delete(employees).where(inArray(employees.companyId, ids));
    await client.db.delete(companies).where(inArray(companies.id, ids));
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP 8064 AGG LTDA',
      nomeFantasia: 'ROIP 8064 AGG',
      cnpj: CNPJ,
    });
    const e1 = await seedEmployee('Agg E1');
    const e2 = await seedEmployee('Agg E2');

    await client.db.insert(performanceQuarterlyData).values([
      {
        companyId,
        employeeId: e1,
        trimestre: '2025-Q3',
        indiceDesempenho: '1.1000',
        scoreDesempenho: '90.00',
        capacidadeOciosa: '10.00',
        retornoEstimado: '10000.00',
        custoMedioTrimestral: '5000.00',
      },
      {
        companyId,
        employeeId: e2,
        trimestre: '2025-Q3',
        indiceDesempenho: '0.7000',
        scoreDesempenho: '50.00',
        capacidadeOciosa: '30.00',
        retornoEstimado: '4000.00',
        custoMedioTrimestral: '4000.00',
      },
    ]);

    await client.db.insert(plenitudeData).values([
      {
        companyId,
        employeeId: e1,
        trimestre: '2025-Q3',
        plenitudeScore: '80.00',
        scoreA: '80.00',
        scoreC: '80.00',
        engajamentoA: '80.00',
        engajamentoC: '80.00',
        desenvolvimentoA: '80.00',
        desenvolvimentoC: '80.00',
        pertencimentoA: '80.00',
        pertencimentoC: '80.00',
        realizacaoA: '80.00',
        realizacaoC: '80.00',
      },
      {
        companyId,
        employeeId: e2,
        trimestre: '2025-Q3',
        plenitudeScore: '45.00',
        scoreA: '45.00',
        scoreC: '45.00',
        engajamentoA: '45.00',
        engajamentoC: '45.00',
        desenvolvimentoA: '45.00',
        desenvolvimentoC: '45.00',
        pertencimentoA: '45.00',
        pertencimentoC: '45.00',
        realizacaoA: '45.00',
        realizacaoC: '45.00',
      },
    ]);

    await client.db.insert(monthlyClosureStatus).values([
      { companyId, mes: '2025-07', status: 'fechado' },
      { companyId, mes: '2025-08', status: 'fechado' },
      { companyId, mes: '2025-09', status: 'fechado' },
    ]);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  it('agrega a empresa no trimestre fechado', async () => {
    const page = await loadCompanyAggregatePage(client.db, companyId, null);
    expect(page.trimestre).toBe('2025-Q3');
    const agg = page.aggregate;
    expect(agg).not.toBeNull();
    if (agg === null) {
      return;
    }
    expect(agg.headcount).toBe(2);
    expect(agg.abaixoDoPiso).toBe(false);
    expect(agg.desempenhoScore).toBe(70);
    expect(agg.eixoY).toBe(62.5);
    // Centro de massa: 70 -> medio, 62.5 -> media.
    expect(agg.centroMassa.quadrante).toBe('EQUILÍBRIO FRÁGIL');
    expect(agg.heatmapClassificados).toBe(2);
    expect(agg.heatmap[0]![2]).toBe(1);
    expect(agg.heatmap[2]![0]).toBe(1);
  });

  it('usa os thresholds default da empresa (9-Box)', async () => {
    const th = await readThresholds(client.db, companyId);
    expect(th).toEqual({
      desempenhoBaixo: 60,
      desempenhoMedio: 85,
      plenitudeBaixo: 50,
      plenitudeMedio: 75,
    });
  });
});
