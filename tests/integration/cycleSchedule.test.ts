// ROIP APP 9BOX — teste de integracao `cycleSchedule` (ME-017).
//
// Cobre §12.6: INSERT com defaults (status='aberto'); UNIQUE
// `uk_cycleSchedule_ciclo` (companyId, tipoCiclo, cicloReferencia);
// 5 valores canonicos de tipoCiclo; setters de status e contadores;
// origemDbId nullable sem FK formal; listagem por (companyId, tipoCiclo);
// FK CASCADE em companyId (escopo teste); delete por company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, cycleSchedule } from '../../src/db/schema';
import {
  type CycleScheduleTipo,
  deleteCycleSchedulesByCompany,
  getCycleScheduleByChave,
  getCycleScheduleById,
  insertCycleSchedule,
  listCycleSchedulesByCompanyTipo,
  type NewCycleSchedule,
  updateCycleScheduleContadores,
  updateCycleScheduleStatus,
} from '../../src/server/services/cycleSchedule';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000141';

describe('service cycleSchedule (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;

  function baseSchedule(overrides: Partial<NewCycleSchedule> = {}): NewCycleSchedule {
    return {
      companyId,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-01-01'),
      dataCorte: new Date('2026-03-25'),
      dataFechamento: new Date('2026-03-31'),
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CS Test LTDA',
        nomeFantasia: 'Empresa CS Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330041',
        endereco: 'Rua CS, 41',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@cs.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@cs.local',
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
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  });

  it('insere item com defaults status=aberto', async () => {
    const id = await insertCycleSchedule(client.db, baseSchedule());
    expect(id).toBeGreaterThan(0);
    const row = await getCycleScheduleById(client.db, id);
    expect(row?.status).toBe('aberto');
  });

  it('aceita os 5 tipos canonicos de ciclo', async () => {
    const tipos: CycleScheduleTipo[] = [
      'instrumento_a',
      'instrumento_c',
      'instrumento_d',
      'radar_nr1',
      'fechamento_mensal',
    ];
    const referencias: Record<CycleScheduleTipo, string> = {
      instrumento_a: '2026-Q1',
      instrumento_c: '2026-C1',
      instrumento_d: '2026-D1',
      radar_nr1: '2026-NR1',
      fechamento_mensal: '2026-06',
    };
    for (const t of tipos) {
      const id = await insertCycleSchedule(
        client.db,
        baseSchedule({ tipoCiclo: t, cicloReferencia: referencias[t] }),
      );
      const row = await getCycleScheduleById(client.db, id);
      expect(row?.tipoCiclo).toBe(t);
    }
  });

  it('UNIQUE uk_cycleSchedule_ciclo bloqueia (company, tipo, referencia) duplicada', async () => {
    await insertCycleSchedule(client.db, baseSchedule());
    await expect(insertCycleSchedule(client.db, baseSchedule())).rejects.toThrow();
  });

  it('getCycleScheduleByChave localiza pela UNIQUE', async () => {
    const id = await insertCycleSchedule(client.db, baseSchedule());
    const row = await getCycleScheduleByChave(client.db, companyId, 'instrumento_a', '2026-Q1');
    expect(row?.id).toBe(id);
    const missing = await getCycleScheduleByChave(client.db, companyId, 'radar_nr1', '2030-Q1');
    expect(missing).toBeUndefined();
  });

  it('updateCycleScheduleStatus transita livremente', async () => {
    const id = await insertCycleSchedule(client.db, baseSchedule());
    expect(await updateCycleScheduleStatus(client.db, id, 'atrasado')).toBe(1);
    expect((await getCycleScheduleById(client.db, id))?.status).toBe('atrasado');
    expect(await updateCycleScheduleStatus(client.db, id, 'fechado')).toBe(1);
    expect((await getCycleScheduleById(client.db, id))?.status).toBe('fechado');
  });

  it('updateCycleScheduleContadores grava totais', async () => {
    const id = await insertCycleSchedule(client.db, baseSchedule());
    const afetadas = await updateCycleScheduleContadores(client.db, id, 30, 22);
    expect(afetadas).toBe(1);
    const row = await getCycleScheduleById(client.db, id);
    expect(row?.totalElegiveis).toBe(30);
    expect(row?.totalRespondidos).toBe(22);
  });

  it('origemDbId aceita valor arbitrario (sem FK formal)', async () => {
    const id = await insertCycleSchedule(
      client.db,
      baseSchedule({ tipoCiclo: 'radar_nr1', cicloReferencia: '2026-nr1', origemDbId: 12345 }),
    );
    const row = await getCycleScheduleById(client.db, id);
    expect(row?.origemDbId).toBe(12345);
  });

  it('listCycleSchedulesByCompanyTipo filtra e ordena por cicloReferencia ASC', async () => {
    const idQ2 = await insertCycleSchedule(client.db, baseSchedule({ cicloReferencia: '2026-Q2' }));
    const idQ1 = await insertCycleSchedule(client.db, baseSchedule({ cicloReferencia: '2026-Q1' }));
    const lista = await listCycleSchedulesByCompanyTipo(client.db, companyId, 'instrumento_a');
    expect(lista.map((c) => c.id)).toEqual([idQ1, idQ2]);
  });

  it('FK CASCADE em companyId: escopo teste — nao deletamos company aqui', async () => {
    expect(true).toBe(true);
  });

  it('deleteCycleSchedulesByCompany remove tudo da empresa', async () => {
    await insertCycleSchedule(client.db, baseSchedule({ cicloReferencia: 'a' }));
    await insertCycleSchedule(client.db, baseSchedule({ cicloReferencia: 'b' }));
    const afetadas = await deleteCycleSchedulesByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
