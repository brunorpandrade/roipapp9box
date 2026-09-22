// ROIP APP 9BOX — ME §8.06.5b — turnover no recorte de departamento
// (ESPEC §11.2 recortada por `departamentoSnapshot`; empresa + departamento,
// equipe e cadeia sem). MySQL real (RV-11). Semeia Comercial e Marketing
// com desligamentos no trimestre e verifica: turnover da empresa (todos),
// turnover do departamento (só o do snapshot, base recortada) e ausência
// de turnover em equipe/cadeia.
//
// Faixa CNPJ reservada distinta (986).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeTerminationEvents,
  employees,
  monthlyClosureStatus,
} from '../../src/db/schema';
import type { Departamento, MotivoTermination } from '../../src/db/schema/enums';
import { loadRecorteAggregatePage } from '../../src/server/services/companyAggregate';
import { createCompany } from '../../src/server/services/companies';
import { loadTurnoverPage } from '../../src/server/services/turnoverPanel';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ = '10000000000986';
let cpfSeq = 59000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330099',
  endereco: 'Rua Turnover',
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

describe('ME §8.06.5b — turnover no recorte de departamento (MySQL real)', () => {
  let client: RoipDbClient;
  let companyId = 0;
  let liderComercial = 0;

  async function seedEmployee(dept: Departamento, status: 'ativo' | 'inativo'): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: `T ${cpfSeq}`,
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
        isLider: false,
        isRH: false,
        isResponsavelFinanceiro: false,
        status,
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function desligar(
    employeeId: number,
    dept: Departamento,
    motivo: MotivoTermination,
  ): Promise<void> {
    await client.db.insert(employeeTerminationEvents).values({
      employeeId,
      companyId,
      dataInativacao: new Date('2025-08-15T10:00:00.000Z'),
      motivo,
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: dept,
      actorTipo: 'superAdmin',
      actorId: 1,
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
    await client.db
      .delete(employeeTerminationEvents)
      .where(inArray(employeeTerminationEvents.companyId, cids));
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
      razaoSocial: 'ROIP 8065B TURN LTDA',
      nomeFantasia: 'ROIP 8065B TURN',
      cnpj: CNPJ,
    });
    // Comercial: 5 ativos + 2 desligados no Q3 (1 vol, 1 invol) → base 7.
    for (let i = 0; i < 5; i += 1) {
      const id = await seedEmployee('Comercial', 'ativo');
      if (i === 0) {
        liderComercial = id;
      }
    }
    const c1 = await seedEmployee('Comercial', 'inativo');
    const c2 = await seedEmployee('Comercial', 'inativo');
    await desligar(c1, 'Comercial', 'voluntario');
    await desligar(c2, 'Comercial', 'involuntario');
    // Marketing: 2 ativos + 1 desligado no Q3 (invol) → base 3.
    await seedEmployee('Marketing', 'ativo');
    await seedEmployee('Marketing', 'ativo');
    const m1 = await seedEmployee('Marketing', 'inativo');
    await desligar(m1, 'Marketing', 'involuntario');
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

  it('turnover da empresa conta todos os desligamentos do trimestre', async () => {
    const page = await loadTurnoverPage(client.db, companyId, '2025-Q3');
    expect(page.resumo?.total.saidas).toBe(3);
    expect(page.resumo?.total.headcountBase).toBe(10);
  });

  it('turnover do departamento conta só o do snapshot, com base recortada', async () => {
    const com = await loadTurnoverPage(client.db, companyId, '2025-Q3', 'Comercial');
    expect(com.resumo?.total.saidas).toBe(2);
    expect(com.resumo?.voluntario.saidas).toBe(1);
    expect(com.resumo?.involuntario.saidas).toBe(1);
    expect(com.resumo?.total.headcountBase).toBe(7);
    const mkt = await loadTurnoverPage(client.db, companyId, '2025-Q3', 'Marketing');
    expect(mkt.resumo?.total.saidas).toBe(1);
    expect(mkt.resumo?.total.headcountBase).toBe(3);
  });

  it('recorte de departamento traz turnover; equipe e cadeia não', async () => {
    const dep = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'departamento',
      departamento: 'Comercial',
    });
    expect(dep.turnover?.resumo?.total.saidas).toBe(2);
    const equipe = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'equipe',
      leader: { tipo: 'employee', id: liderComercial },
    });
    expect(equipe.turnover).toBeNull();
    const cadeia = await loadRecorteAggregatePage(client.db, companyId, null, {
      tipo: 'cadeia',
      leader: { tipo: 'employee', id: liderComercial },
    });
    expect(cadeia.turnover).toBeNull();
  });
});
