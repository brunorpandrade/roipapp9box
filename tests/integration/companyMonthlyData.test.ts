// ROIP APP 9BOX — teste de integracao `companyMonthlyData` (ME-013).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria a propria company local com CNPJ unico do arquivo
// (S009). Nao depende de employees nem de cLevelMembers — a tabela e
// puramente por empresa.
//
// Cobre: INSERT, lookup por id, lookup pelo UNIQUE (companyId, mes),
// listagem por empresa em ordem cronologica, setters dedicados por dono
// (faturamento vs diasUteis), colisao de UNIQUE e FK RESTRICT em
// companyId.
//
// Cleanup:
// - `beforeEach`: apaga apenas `companyMonthlyData` (isolamento entre
//   casos).
// - `afterAll`: apaga o escopo + a company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, companyMonthlyData } from '../../src/db/schema';
import {
  deleteCompanyMonthlyDataById,
  getCompanyMonthlyDataById,
  getCompanyMonthlyDataByMonth,
  insertCompanyMonthlyData,
  listCompanyMonthlyDataByCompany,
  type NewCompanyMonthlyData,
  updateCompanyMonthlyDataDiasUteis,
  updateCompanyMonthlyDataFaturamento,
} from '../../src/server/services/companyMonthlyData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000110';

function buildValidCompanyMonthlyData(
  companyId: number,
  overrides: Partial<NewCompanyMonthlyData> = {},
): NewCompanyMonthlyData {
  return {
    companyId,
    mes: '2026-01',
    faturamentoBruto: '150000.00',
    diasUteis: 22,
    ...overrides,
  };
}

describe('service companyMonthlyData (ME-013)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CompanyMonthlyData Test LTDA',
        nomeFantasia: 'Empresa CompanyMonthlyData Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330010',
        endereco: 'Rua CompanyMonthlyData, 10',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@companymonthlydata.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@companymonthlydata.local',
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
    await client.db.delete(companyMonthlyData);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(companyMonthlyData);
  });

  it('insertCompanyMonthlyData insere e retorna id numerico positivo', async () => {
    const id = await insertCompanyMonthlyData(client.db, buildValidCompanyMonthlyData(companyId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getCompanyMonthlyDataById retorna a linha inserida', async () => {
    const id = await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-02', diasUteis: 20 }),
    );
    const row = await getCompanyMonthlyDataById(client.db, id);
    if (!row) throw new Error('getCompanyMonthlyDataById retornou undefined');
    expect(row.companyId).toBe(companyId);
    expect(row.mes).toBe('2026-02');
    expect(row.diasUteis).toBe(20);
  });

  it('getCompanyMonthlyDataById retorna undefined para id inexistente', async () => {
    const row = await getCompanyMonthlyDataById(client.db, 999999);
    expect(row).toBeUndefined();
  });

  it('getCompanyMonthlyDataByMonth resolve pelo par (companyId, mes)', async () => {
    const id = await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-03' }),
    );
    const row = await getCompanyMonthlyDataByMonth(client.db, companyId, '2026-03');
    if (!row) throw new Error('getCompanyMonthlyDataByMonth retornou undefined');
    expect(row.id).toBe(id);
  });

  it('getCompanyMonthlyDataByMonth retorna undefined para mes inexistente', async () => {
    const row = await getCompanyMonthlyDataByMonth(client.db, companyId, '2099-12');
    expect(row).toBeUndefined();
  });

  it('listCompanyMonthlyDataByCompany ordena por mes crescente', async () => {
    // Insercao fora de ordem para forcar o sort do service.
    const idJan = await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-01' }),
    );
    const idMar = await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-03' }),
    );
    const idFev = await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-02' }),
    );
    const rows = await listCompanyMonthlyDataByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idJan, idFev, idMar]);
    expect(rows.map((r) => r.mes)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('updateCompanyMonthlyDataFaturamento atualiza apenas faturamentoBruto', async () => {
    await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, {
        mes: '2026-04',
        faturamentoBruto: '100000.00',
        diasUteis: 21,
      }),
    );
    const affected = await updateCompanyMonthlyDataFaturamento(
      client.db,
      companyId,
      '2026-04',
      '250000.50',
    );
    expect(affected).toBe(1);
    const row = await getCompanyMonthlyDataByMonth(client.db, companyId, '2026-04');
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.faturamentoBruto).toBe('250000.50');
    expect(row.diasUteis).toBe(21);
  });

  it('updateCompanyMonthlyDataDiasUteis atualiza apenas diasUteis', async () => {
    await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, {
        mes: '2026-05',
        faturamentoBruto: '100000.00',
        diasUteis: 22,
      }),
    );
    const affected = await updateCompanyMonthlyDataDiasUteis(client.db, companyId, '2026-05', 19);
    expect(affected).toBe(1);
    const row = await getCompanyMonthlyDataByMonth(client.db, companyId, '2026-05');
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.diasUteis).toBe(19);
    expect(row.faturamentoBruto).toBe('100000.00');
  });

  it('UNIQUE (companyId, mes) impede duas linhas para o mesmo mes', async () => {
    await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-06' }),
    );
    await expect(
      insertCompanyMonthlyData(
        client.db,
        buildValidCompanyMonthlyData(companyId, { mes: '2026-06', faturamentoBruto: '999999.00' }),
      ),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em companyId impede insert com companyId invalido', async () => {
    await expect(
      insertCompanyMonthlyData(client.db, buildValidCompanyMonthlyData(99999, { mes: '2026-07' })),
    ).rejects.toThrow();
  });

  it('deleteCompanyMonthlyDataById remove a linha e retorna affectedRows=1', async () => {
    const id = await insertCompanyMonthlyData(
      client.db,
      buildValidCompanyMonthlyData(companyId, { mes: '2026-08' }),
    );
    const affected = await deleteCompanyMonthlyDataById(client.db, id);
    expect(affected).toBe(1);
    const row = await getCompanyMonthlyDataById(client.db, id);
    expect(row).toBeUndefined();
  });
});
