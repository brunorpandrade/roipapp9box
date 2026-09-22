// ROIP APP 9BOX — ME §8.06.5 — recortes dos dashboards agregados contra
// MySQL real (RV-11). Semeia uma hierarquia (e1 líder de e2/e4; e2 líder
// de e3), um membro do departamento sem classificacao (e5) e um de outro
// departamento (e6), e verifica: resolucao de membros (departamento,
// equipe direta, cadeia total) e a agregacao do recorte com intersecao
// pelos classificados (§8.06.5 D2), sem financeiro nem turnover.
//
// Faixa CNPJ reservada distinta (985).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeLeaderHistory,
  employees,
  monthlyClosureStatus,
  performanceQuarterlyData,
  plenitudeData,
} from '../../src/db/schema';
import type { Departamento } from '../../src/db/schema/enums';
import { createCompany } from '../../src/server/services/companies';
import { loadRecorteAggregatePage } from '../../src/server/services/companyAggregate';
import { loadActiveLeaderLinks } from '../../src/server/services/leaderGraph';
import {
  listChainEmployeeIds,
  listDepartmentEmployeeIds,
  listDirectReportEmployeeIds,
  type RecorteLeader,
} from '../../src/server/services/recorteScope';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ = '10000000000985';
let cpfSeq = 58000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330098',
  endereco: 'Rua Recorte',
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

describe('ME §8.06.5 — recortes (MySQL real)', () => {
  let client: RoipDbClient;
  let companyId = 0;
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;
  let e4 = 0;
  let e5 = 0;
  let e6 = 0;

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
      reason: 'seed §8.06.5',
      transferBatchId: '00000000-0000-0000-0000-000000000000',
    });
  }

  async function classificar(employeeId: number, score: string, plen: string): Promise<void> {
    await client.db.insert(performanceQuarterlyData).values({
      companyId,
      employeeId,
      trimestre: '2025-Q3',
      indiceDesempenho: '1.0000',
      scoreDesempenho: score,
      capacidadeOciosa: '10.00',
      retornoEstimado: '10000.00',
      custoMedioTrimestral: '5000.00',
    });
    await client.db.insert(plenitudeData).values({
      companyId,
      employeeId,
      trimestre: '2025-Q3',
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
      razaoSocial: 'ROIP 8065 REC LTDA',
      nomeFantasia: 'ROIP 8065 REC',
      cnpj: CNPJ,
    });
    e1 = await seedEmployee('Rec E1', 'Comercial', true);
    e2 = await seedEmployee('Rec E2', 'Comercial', true);
    e3 = await seedEmployee('Rec E3', 'Comercial', false);
    e4 = await seedEmployee('Rec E4', 'Comercial', false);
    e5 = await seedEmployee('Rec E5', 'Comercial', false);
    e6 = await seedEmployee('Rec E6', 'Marketing', false);
    await link(e2, e1);
    await link(e4, e1);
    await link(e3, e2);
    await classificar(e1, '90.00', '80.00');
    await classificar(e2, '88.00', '78.00');
    await classificar(e3, '60.00', '55.00');
    await classificar(e4, '70.00', '65.00');
    // e5 (Comercial) e e6 (Marketing) sem perf/plen — nao classificados.
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

  it('resolve membros por recorte (departamento, equipe direta, cadeia total)', async () => {
    const dep = await listDepartmentEmployeeIds(client.db, companyId, 'Comercial');
    expect(dep).toEqual([e1, e2, e3, e4, e5].sort((a, b) => a - b));
    expect(dep).not.toContain(e6);
    const lider: RecorteLeader = { tipo: 'employee', id: e1 };
    const equipe = await listDirectReportEmployeeIds(client.db, companyId, lider);
    expect(equipe).toEqual([e2, e4].sort((a, b) => a - b));
    const cadeia = await listChainEmployeeIds(client.db, companyId, lider);
    expect(cadeia).toEqual([e2, e3, e4].sort((a, b) => a - b));
    const links = await loadActiveLeaderLinks(client.db, companyId);
    expect(links.length).toBe(3);
  });

  it('agrega o departamento com intersecao pelos classificados (e5 fora)', async () => {
    const page = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'departamento',
      departamento: 'Comercial',
    });
    expect(page.trimestre).toBe('2025-Q3');
    expect(page.aggregate?.headcount).toBe(4);
    expect(page.aggregate?.abaixoDoPiso).toBe(false);
  });

  it('agrega equipe direta e cadeia total do líder', async () => {
    const equipe = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'equipe',
      leader: { tipo: 'employee', id: e1 },
    });
    expect(equipe.aggregate?.headcount).toBe(2);
    const cadeia = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'cadeia',
      leader: { tipo: 'employee', id: e1 },
    });
    expect(cadeia.aggregate?.headcount).toBe(3);
  });
});
