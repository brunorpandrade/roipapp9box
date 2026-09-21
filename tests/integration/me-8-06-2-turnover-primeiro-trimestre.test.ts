// ROIP APP 9BOX — ME §8.06.2 — excecao do primeiro trimestre na plataforma
// no denominador do turnover (MySQL real).
//
// ESPEC_ORGANOGRAMAS_E_AGREGADOS §11.2 / DOC 03 §12.1: nao existindo
// trimestre anterior fechado (headcount zero no inicio do trimestre), o
// denominador do turnover trimestral e o headcount de fechamento do proprio
// trimestre. Cenario: 3 colaboradores admitidos no meio do Q3-2025 (sem
// ninguem antes do inicio do trimestre) e 1 desligamento involuntario no
// Q3. Inicio do trimestre = 0 -> a excecao usa o fechamento (2
// sobreviventes) -> taxa = 1/2 = 50%. Sem a excecao, o denominador seria 0
// e a taxa cairia para 0 (comportamento incorreto que a ME corrige).
//
// Faixa CNPJ reservada distinta (985) para nao colidir com outras suites.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employeeTerminationEvents, employees } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { computeTurnoverByCompany } from '../../src/server/services/turnoverEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ_EXC = '10000000000985';
let cpfSeq = 56000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330099',
  endereco: 'Rua Excecao',
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
  kickoffDate: new Date('2025-08-01'),
};

describe('ME §8.06.2 — turnover primeiro trimestre (MySQL real)', () => {
  let client: RoipDbClient;
  let companyExc = 0;

  async function seedEmployee(
    companyId: number,
    name: string,
    dataAdmissao: Date,
  ): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf: String(cpfSeq),
        email: `${cpfSeq}@roip.test`,
        dataNascimento: new Date('1990-05-20'),
        dataAdmissao,
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
      .where(inArray(companies.cnpj, [CNPJ_EXC]));
    const companyIds = rows.map((r) => r.id);
    if (companyIds.length === 0) {
      return;
    }
    await client.db
      .delete(employeeTerminationEvents)
      .where(inArray(employeeTerminationEvents.companyId, companyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, companyIds));
    await client.db.delete(companies).where(inArray(companies.id, companyIds));
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyExc = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP 8062 EXC LTDA',
      nomeFantasia: 'ROIP 8062 EXC',
      cnpj: CNPJ_EXC,
    });
    const admissao = new Date('2025-08-15');
    const e1 = await seedEmployee(companyExc, 'Exc E1', admissao);
    await seedEmployee(companyExc, 'Exc E2', admissao);
    await seedEmployee(companyExc, 'Exc E3', admissao);
    await client.db.insert(employeeTerminationEvents).values({
      employeeId: e1,
      companyId: companyExc,
      dataInativacao: new Date('2025-09-10'),
      motivo: 'involuntario',
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: 'Comercial',
      actorTipo: 'superAdmin',
      actorId: 1,
    });
    await client.db
      .update(employees)
      .set({ status: 'inativo' })
      .where(inArray(employees.id, [e1]));
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  it('sem trimestre anterior: denominador = fechamento do proprio trimestre', async () => {
    const r = await computeTurnoverByCompany(client.db, companyExc, '2025-Q3');
    // Inicio do trimestre (2025-07-01) tem headcount 0 (todos admitidos em
    // 2025-08-15). A excecao usa o fechamento (2025-10-01) = 2 sobreviventes.
    expect(r.totalHeadcountInicioTrimestre).toBe(2);
    expect(r.totalSaidasTrimestre).toBe(1);
    expect(r.aberturaPorMotivo).toEqual({ voluntario: 0, involuntario: 1 });
    // 1 saida / 2 no fechamento = 50%.
    expect(r.taxaTrimestral).toBe(50);
  });
});
