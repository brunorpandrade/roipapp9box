// ROIP APP 9BOX — teste de integracao `monthlyClosureStatus` (ME-013).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria a propria company local com CNPJ unico do arquivo
// (S009). Nao depende de employees.
//
// Cobre: INSERT (com default de status), lookup por id, lookup pelo
// UNIQUE (companyId, mes), listagem por empresa em ordem cronologica,
// transicoes canonicas via `updateMonthlyClosureStatus` (aberto ->
// fechado -> desbloqueado -> fechado), colisao de UNIQUE, FK RESTRICT
// em companyId e delete de teardown.
//
// Cleanup:
// - `beforeEach`: apaga apenas `monthlyClosureStatus` (isolamento).
// - `afterAll`: apaga o escopo + a company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, monthlyClosureStatus } from '../../src/db/schema';
import {
  deleteMonthlyClosureStatusById,
  getMonthlyClosureStatusById,
  getMonthlyClosureStatusByMonth,
  insertMonthlyClosureStatus,
  listMonthlyClosureStatusByCompany,
  type NewMonthlyClosureStatus,
  updateMonthlyClosureStatus,
} from '../../src/server/services/monthlyClosureStatus';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000113';

function buildValidClosure(
  companyId: number,
  overrides: Partial<NewMonthlyClosureStatus> = {},
): NewMonthlyClosureStatus {
  return {
    companyId,
    mes: '2026-01',
    ...overrides,
  };
}

describe('service monthlyClosureStatus (ME-013)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa MonthlyClosure Test LTDA',
        nomeFantasia: 'Empresa MonthlyClosure Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330013',
        endereco: 'Rua MonthlyClosure, 13',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@monthlyclosure.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@monthlyclosure.local',
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
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(monthlyClosureStatus);
  });

  it('insertMonthlyClosureStatus insere com status default aberto', async () => {
    const id = await insertMonthlyClosureStatus(client.db, buildValidClosure(companyId));
    const row = await getMonthlyClosureStatusById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.status).toBe('aberto');
    expect(row.dataFechamento).toBeNull();
    expect(row.processadoEm).toBeNull();
  });

  it('insertMonthlyClosureStatus aceita status explicito', async () => {
    const id = await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-02', status: 'fechado' }),
    );
    const row = await getMonthlyClosureStatusById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.status).toBe('fechado');
  });

  it('getMonthlyClosureStatusByMonth resolve pelo par (companyId, mes)', async () => {
    const id = await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-03' }),
    );
    const row = await getMonthlyClosureStatusByMonth(client.db, companyId, '2026-03');
    if (!row) throw new Error('getMonthlyClosureStatusByMonth retornou undefined');
    expect(row.id).toBe(id);
  });

  it('getMonthlyClosureStatusByMonth retorna undefined para mes inexistente', async () => {
    const row = await getMonthlyClosureStatusByMonth(client.db, companyId, '2099-12');
    expect(row).toBeUndefined();
  });

  it('listMonthlyClosureStatusByCompany ordena por mes crescente', async () => {
    const idJan = await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-01' }),
    );
    const idMar = await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-03' }),
    );
    const idFev = await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-02' }),
    );
    const rows = await listMonthlyClosureStatusByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idJan, idFev, idMar]);
  });

  it('updateMonthlyClosureStatus: transicao aberto -> fechado grava dataFechamento', async () => {
    await insertMonthlyClosureStatus(client.db, buildValidClosure(companyId, { mes: '2026-04' }));
    const dataFechamento = new Date('2026-05-11T00:00:00Z');
    const affected = await updateMonthlyClosureStatus(client.db, companyId, '2026-04', {
      status: 'fechado',
      dataFechamento,
    });
    expect(affected).toBe(1);
    const row = await getMonthlyClosureStatusByMonth(client.db, companyId, '2026-04');
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.status).toBe('fechado');
    expect(row.dataFechamento).not.toBeNull();
  });

  it('updateMonthlyClosureStatus aplica transicao fechado -> desbloqueado (manual)', async () => {
    await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-05', status: 'fechado' }),
    );
    const affected = await updateMonthlyClosureStatus(client.db, companyId, '2026-05', {
      status: 'desbloqueado',
    });
    expect(affected).toBe(1);
    const row = await getMonthlyClosureStatusByMonth(client.db, companyId, '2026-05');
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.status).toBe('desbloqueado');
  });

  it('updateMonthlyClosureStatus grava processadoEm sem alterar dataFechamento', async () => {
    const dataFechamentoInicial = new Date('2026-06-11T00:00:00Z');
    await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, {
        mes: '2026-06',
        status: 'fechado',
        dataFechamento: dataFechamentoInicial,
      }),
    );
    const processadoEm = new Date('2026-06-11T00:05:00Z');
    const affected = await updateMonthlyClosureStatus(client.db, companyId, '2026-06', {
      status: 'fechado',
      processadoEm,
    });
    expect(affected).toBe(1);
    const row = await getMonthlyClosureStatusByMonth(client.db, companyId, '2026-06');
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.status).toBe('fechado');
    expect(row.dataFechamento).not.toBeNull();
    expect(row.processadoEm).not.toBeNull();
  });

  it('UNIQUE (companyId, mes) impede duas linhas para o mesmo mes', async () => {
    await insertMonthlyClosureStatus(client.db, buildValidClosure(companyId, { mes: '2026-07' }));
    await expect(
      insertMonthlyClosureStatus(
        client.db,
        buildValidClosure(companyId, { mes: '2026-07', status: 'fechado' }),
      ),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em companyId impede insert com companyId invalido', async () => {
    await expect(
      insertMonthlyClosureStatus(client.db, buildValidClosure(99999, { mes: '2026-08' })),
    ).rejects.toThrow();
  });

  it('deleteMonthlyClosureStatusById remove a linha e retorna affectedRows=1', async () => {
    const id = await insertMonthlyClosureStatus(
      client.db,
      buildValidClosure(companyId, { mes: '2026-09' }),
    );
    const affected = await deleteMonthlyClosureStatusById(client.db, id);
    expect(affected).toBe(1);
    const row = await getMonthlyClosureStatusById(client.db, id);
    expect(row).toBeUndefined();
  });
});
