// ROIP APP 9BOX — teste de integracao `executiveReportCache` (ME-017).
//
// Cobre §13.2: upsert por chave UNIQUE (companyId, escopoTipo,
// escopoReferencia, trimestre) — sobrescrita por UPDATE quando a chave
// ja existe (§13.2); 3 escopos canonicos (empresa/departamento/equipe);
// escopoReferencia NULL para escopoTipo='empresa' (IS NULL); 3 geradores
// polimorficos (employee/clevel/superAdmin); FK RESTRICT em companyId.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, executiveReportCache } from '../../src/db/schema';
import {
  deleteExecutiveReportCacheByCompany,
  getExecutiveReportCacheByChave,
  getExecutiveReportCacheById,
  listExecutiveReportCacheByCompany,
  type NewExecutiveReportCache,
  upsertExecutiveReportCache,
} from '../../src/server/services/executiveReportCache';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000145';

describe('service executiveReportCache (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;

  function baseEmpresa(overrides: Partial<NewExecutiveReportCache> = {}): NewExecutiveReportCache {
    return {
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
      conteudoPdfUrl: 'https://cdn.local/relatorios/empresa_2026Q1.pdf',
      geradoPorTipo: 'superAdmin',
      geradoPorId: 1,
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa ERC Test LTDA',
        nomeFantasia: 'Empresa ERC Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330045',
        endereco: 'Rua ERC, 45',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@erc.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@erc.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;
  });

  afterAll(async () => {
    await client.db
      .delete(executiveReportCache)
      .where(eq(executiveReportCache.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(executiveReportCache)
      .where(eq(executiveReportCache.companyId, companyId));
  });

  it('upsertExecutiveReportCache insere entrada nova retornando id positivo', async () => {
    const id = await upsertExecutiveReportCache(client.db, baseEmpresa());
    expect(id).toBeGreaterThan(0);
    const row = await getExecutiveReportCacheById(client.db, id);
    expect(row?.escopoTipo).toBe('empresa');
    expect(row?.conteudoPdfUrl).toBe('https://cdn.local/relatorios/empresa_2026Q1.pdf');
  });

  it('upsertExecutiveReportCache sobrescreve por UPDATE quando chave ja existe', async () => {
    const id1 = await upsertExecutiveReportCache(client.db, baseEmpresa());
    const id2 = await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({ conteudoPdfUrl: 'https://cdn.local/relatorios/v2.pdf' }),
    );
    expect(id2).toBe(id1);
    const row = await getExecutiveReportCacheById(client.db, id1);
    expect(row?.conteudoPdfUrl).toBe('https://cdn.local/relatorios/v2.pdf');
  });

  it('aceita os 3 escopos canonicos com escopoReferencia coerente', async () => {
    const idE = await upsertExecutiveReportCache(client.db, baseEmpresa());
    const idD = await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({
        escopoTipo: 'departamento',
        escopoReferencia: 'Comercial',
        conteudoPdfUrl: 'https://cdn.local/dept.pdf',
      }),
    );
    const idQ = await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({
        escopoTipo: 'equipe',
        escopoReferencia: 'lider_42',
        conteudoPdfUrl: 'https://cdn.local/equipe.pdf',
      }),
    );
    expect(idE).toBeGreaterThan(0);
    expect(idD).toBeGreaterThan(0);
    expect(idQ).toBeGreaterThan(0);
  });

  it('aceita os 3 geradores polimorficos (employee/clevel/superAdmin)', async () => {
    const casos: Array<{ tipo: 'employee' | 'clevel' | 'superAdmin'; tri: string }> = [
      { tipo: 'employee', tri: '2027-Q1' },
      { tipo: 'clevel', tri: '2027-Q2' },
      { tipo: 'superAdmin', tri: '2027-Q3' },
    ];
    for (const c of casos) {
      const id = await upsertExecutiveReportCache(
        client.db,
        baseEmpresa({ trimestre: c.tri, geradoPorTipo: c.tipo, geradoPorId: 10 }),
      );
      const row = await getExecutiveReportCacheById(client.db, id);
      expect(row?.geradoPorTipo).toBe(c.tipo);
    }
  });

  it('getByChave localiza pela UNIQUE (escopoReferencia null via IS NULL)', async () => {
    const id = await upsertExecutiveReportCache(client.db, baseEmpresa());
    const row = await getExecutiveReportCacheByChave(
      client.db,
      companyId,
      'empresa',
      null,
      '2026-Q1',
    );
    expect(row?.id).toBe(id);
    const missing = await getExecutiveReportCacheByChave(
      client.db,
      companyId,
      'empresa',
      null,
      '2030-Q1',
    );
    expect(missing).toBeUndefined();
  });

  it('chaves distintas por escopoTipo/escopoReferencia coexistem', async () => {
    const idEmpresa = await upsertExecutiveReportCache(client.db, baseEmpresa());
    const idComercial = await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({ escopoTipo: 'departamento', escopoReferencia: 'Comercial' }),
    );
    const idOperacoes = await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({ escopoTipo: 'departamento', escopoReferencia: 'Operações' }),
    );
    expect(new Set([idEmpresa, idComercial, idOperacoes]).size).toBe(3);
  });

  it('listExecutiveReportCacheByCompany retorna todas as entradas', async () => {
    await upsertExecutiveReportCache(client.db, baseEmpresa());
    await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({ escopoTipo: 'departamento', escopoReferencia: 'Comercial' }),
    );
    const lista = await listExecutiveReportCacheByCompany(client.db, companyId);
    expect(lista.length).toBe(2);
  });

  it('deleteExecutiveReportCacheByCompany remove tudo da empresa', async () => {
    await upsertExecutiveReportCache(client.db, baseEmpresa());
    await upsertExecutiveReportCache(
      client.db,
      baseEmpresa({ escopoTipo: 'departamento', escopoReferencia: 'X' }),
    );
    const afetadas = await deleteExecutiveReportCacheByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
