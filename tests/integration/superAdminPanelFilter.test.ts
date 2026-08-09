// ROIP APP 9BOX — teste de integracao do filtro §5.3 do painel Super
// Admin (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact:
// - filter='active' → retorna apenas empresas com status='ativa'.
// - filter='inactive' → retorna apenas empresas com status='inativa'.
// - filter='all' → retorna ambas.
// - contagens `companiesActiveCount`/`companiesInactiveCount`
//   permanecem canonicas independentemente do filtro (sao stats globais).
//
// Reimplementa localmente a query canonica de `loadPanelData` (funcao
// nao exportada — page.tsx aceita apenas default export por Next 15
// App Router). A cobertura foca a **logica de filtro §5.3** (inArray
// + statusesForFilter), que e o coracao canonico bit-exact da G1+G2 D075.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import {
  DEFAULT_COMPANY_LIST_FILTER,
  resolveCompanyListFilter,
  type CompanyListFilter,
} from '../../src/lib/company/resolveCompanyListFilter';
import { createCompany } from '../../src/server/services/companies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_ATIVA_1 = '10000000000635';
const CNPJ_ATIVA_2 = '10000000000643';
const CNPJ_INATIVA_1 = '10000000000651';

function statusesForFilter(filter: CompanyListFilter): ('ativa' | 'inativa')[] {
  if (filter === 'active') return ['ativa'];
  if (filter === 'inactive') return ['inativa'];
  return ['ativa', 'inativa'];
}

async function queryCompaniesList(
  client: RoipDbClient,
  filter: CompanyListFilter,
): Promise<{ id: number; nomeFantasia: string; status: 'ativa' | 'inativa' | null }[]> {
  const statuses = statusesForFilter(filter);
  return client.db
    .select({
      id: companies.id,
      nomeFantasia: companies.nomeFantasia,
      status: companies.status,
    })
    .from(companies)
    .where(inArray(companies.status, statuses))
    .orderBy(companies.nomeFantasia);
}

describe('painel Super Admin — filtro §5.3 (ME-Rota-C-D075)', () => {
  let client: RoipDbClient;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    // 2 ativas + 1 inativa.
    const ativa1 = await createCompany(client.db, {
      razaoSocial: 'Empresa Ativa 1',
      nomeFantasia: 'Ativa 1',
      cnpj: CNPJ_ATIVA_1,
      telefone: '1633330001',
      endereco: 'Rua A',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'P1',
      contatoPrincipalEmail: 'p1@roip.test',
      contatoRHNome: 'RH1',
      contatoRHEmail: 'rh1@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'a',
      contextoMercado: 'a',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    const ativa2 = await createCompany(client.db, {
      razaoSocial: 'Empresa Ativa 2',
      nomeFantasia: 'Ativa 2',
      cnpj: CNPJ_ATIVA_2,
      telefone: '1633330002',
      endereco: 'Rua B',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'P2',
      contatoPrincipalEmail: 'p2@roip.test',
      contatoRHNome: 'RH2',
      contatoRHEmail: 'rh2@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'b',
      contextoMercado: 'b',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    const inativa1 = await createCompany(client.db, {
      razaoSocial: 'Empresa Inativa 1',
      nomeFantasia: 'Inativa 1',
      cnpj: CNPJ_INATIVA_1,
      telefone: '1633330003',
      endereco: 'Rua C',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'P3',
      contatoPrincipalEmail: 'p3@roip.test',
      contatoRHNome: 'RH3',
      contatoRHEmail: 'rh3@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'c',
      contextoMercado: 'c',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    // Todas nascem 'ativa' — marca uma como inativa.
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, ativa1));
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, ativa2));
    await client.db.update(companies).set({ status: 'inativa' }).where(eq(companies.id, inativa1));
  });

  it('DEFAULT_COMPANY_LIST_FILTER e o valor canonico "active"', () => {
    expect(DEFAULT_COMPANY_LIST_FILTER).toBe('active');
  });

  it("filter='active' → 2 empresas (ambas ativas), status='ativa' em todas", async () => {
    const filter = resolveCompanyListFilter(undefined);
    const rows = await queryCompaniesList(client, filter);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe('ativa');
    }
    // Ordem canonica bit-exact — ORDER BY nomeFantasia asc.
    expect(rows.map((r) => r.nomeFantasia)).toEqual(['Ativa 1', 'Ativa 2']);
  });

  it("filter='inactive' → 1 empresa (inativa), status='inativa'", async () => {
    const filter = resolveCompanyListFilter('inactive');
    const rows = await queryCompaniesList(client, filter);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('inativa');
    expect(rows[0]!.nomeFantasia).toBe('Inativa 1');
  });

  it("filter='all' → 3 empresas (mistas), status pode ser ativa OU inativa", async () => {
    const filter = resolveCompanyListFilter('all');
    const rows = await queryCompaniesList(client, filter);
    expect(rows).toHaveLength(3);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(['ativa', 'ativa', 'inativa']);
  });

  it('contagens globais permanecem canonicas independentemente do filtro', async () => {
    // As contagens de metric cards nao usam o filtro — sao COUNT(*).
    const [activeRows, inactiveRows] = await Promise.all([
      client.db
        .select({ count: sql<number>`count(*)` })
        .from(companies)
        .where(eq(companies.status, 'ativa')),
      client.db
        .select({ count: sql<number>`count(*)` })
        .from(companies)
        .where(eq(companies.status, 'inativa')),
    ]);
    expect(Number(activeRows[0]?.count ?? 0)).toBe(2);
    expect(Number(inactiveRows[0]?.count ?? 0)).toBe(1);
  });
});
