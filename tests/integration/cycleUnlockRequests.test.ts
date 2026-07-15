// ROIP APP 9BOX — teste de integracao `cycleUnlockRequests` (ME-017).
//
// Cobre §12.9: INSERT com default status=pendente; decisao com WHERE
// guard (transicao valida so a partir de 'pendente'; repeticao retorna
// 0); 3 destinos possiveis (aprovada/recusada/cancelada);
// hasPendingUnlockRequest com liderId nullable (IS NULL); 3 valores
// canonicos de aba (rh/lider/faturamento); FK CASCADE em companyId
// (escopo teste); delete por company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, cycleUnlockRequests } from '../../src/db/schema';
import {
  type CycleUnlockDecisao,
  decidirCycleUnlockRequest,
  deleteCycleUnlockRequestsByCompany,
  getCycleUnlockRequestById,
  hasPendingUnlockRequest,
  insertCycleUnlockRequest,
  listCycleUnlockRequestsByCompanyMes,
  listCycleUnlockRequestsByStatus,
  type NewCycleUnlockRequest,
} from '../../src/server/services/cycleUnlockRequests';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000144';

describe('service cycleUnlockRequests (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;

  function baseRh(overrides: Partial<NewCycleUnlockRequest> = {}): NewCycleUnlockRequest {
    return {
      companyId,
      solicitanteTipo: 'employee',
      solicitanteId: 42,
      mes: '2026-06',
      aba: 'rh',
      justificativa:
        'Justificativa canonica com o minimo de 100 caracteres para atender o padrao ' +
        'do DOC 01. Preenchemos o suficiente para nao ser rejeitada em nenhum caso.',
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CUR Test LTDA',
        nomeFantasia: 'Empresa CUR Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330044',
        endereco: 'Rua CUR, 44',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@cur.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@cur.local',
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
    await client.db.delete(cycleUnlockRequests).where(eq(cycleUnlockRequests.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleUnlockRequests).where(eq(cycleUnlockRequests.companyId, companyId));
  });

  it('insere solicitacao com default status=pendente', async () => {
    const id = await insertCycleUnlockRequest(client.db, baseRh());
    expect(id).toBeGreaterThan(0);
    const row = await getCycleUnlockRequestById(client.db, id);
    expect(row?.status).toBe('pendente');
    expect(row?.aba).toBe('rh');
  });

  it('aceita as 3 abas canonicas (rh/lider/faturamento)', async () => {
    const idRh = await insertCycleUnlockRequest(client.db, baseRh({ aba: 'rh', mes: '2026-01' }));
    const idLid = await insertCycleUnlockRequest(
      client.db,
      baseRh({ aba: 'lider', mes: '2026-02', liderId: 42, liderTipo: 'employee' }),
    );
    const idFat = await insertCycleUnlockRequest(
      client.db,
      baseRh({ aba: 'faturamento', mes: '2026-03' }),
    );
    expect(idRh).toBeGreaterThan(0);
    expect(idLid).toBeGreaterThan(0);
    expect(idFat).toBeGreaterThan(0);
  });

  it('decidirCycleUnlockRequest aprovada com WHERE guard status=pendente', async () => {
    const id = await insertCycleUnlockRequest(client.db, baseRh());
    const decisao: CycleUnlockDecisao = {
      novoStatus: 'aprovada',
      decididoPor: 1,
      decididoEm: new Date(),
      comentarioAprovacao: 'Aprovacao com comentario canonico da decisao operacional.',
    };
    expect(await decidirCycleUnlockRequest(client.db, id, decisao)).toBe(1);
    const row = await getCycleUnlockRequestById(client.db, id);
    expect(row?.status).toBe('aprovada');
    expect(row?.decididoPor).toBe(1);
    expect(row?.comentarioAprovacao).not.toBeNull();
  });

  it('decidirCycleUnlockRequest sobre nao-pendente retorna 0 (guard)', async () => {
    const id = await insertCycleUnlockRequest(client.db, baseRh());
    const dec1: CycleUnlockDecisao = {
      novoStatus: 'recusada',
      decididoPor: 1,
      decididoEm: new Date(),
      motivoRecusa: 'Motivo canonico da recusa com o minimo requerido de caracteres.',
    };
    expect(await decidirCycleUnlockRequest(client.db, id, dec1)).toBe(1);
    const dec2: CycleUnlockDecisao = {
      novoStatus: 'aprovada',
      decididoPor: 1,
      decididoEm: new Date(),
      comentarioAprovacao: 'Tentativa de re-decidir apos ja estar decidida.',
    };
    expect(await decidirCycleUnlockRequest(client.db, id, dec2)).toBe(0);
    const row = await getCycleUnlockRequestById(client.db, id);
    expect(row?.status).toBe('recusada');
  });

  it('decidirCycleUnlockRequest cancelamento', async () => {
    const id = await insertCycleUnlockRequest(client.db, baseRh());
    const dec: CycleUnlockDecisao = {
      novoStatus: 'cancelada',
      decididoPor: null,
      decididoEm: new Date(),
    };
    expect(await decidirCycleUnlockRequest(client.db, id, dec)).toBe(1);
    const row = await getCycleUnlockRequestById(client.db, id);
    expect(row?.status).toBe('cancelada');
  });

  it('hasPendingUnlockRequest retorna true com pending; false apos decisao', async () => {
    await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-07' }));
    const antes = await hasPendingUnlockRequest(client.db, companyId, '2026-07', 'rh', null);
    expect(antes).toBe(true);
    const [aberta] = await client.db
      .select()
      .from(cycleUnlockRequests)
      .where(eq(cycleUnlockRequests.mes, '2026-07'))
      .limit(1);
    if (!aberta) throw new Error('setup do teste: sem solicitacao');
    await decidirCycleUnlockRequest(client.db, aberta.id, {
      novoStatus: 'aprovada',
      decididoPor: 1,
      decididoEm: new Date(),
    });
    const depois = await hasPendingUnlockRequest(client.db, companyId, '2026-07', 'rh', null);
    expect(depois).toBe(false);
  });

  it('hasPendingUnlockRequest liderId nao-nulo vs IS NULL', async () => {
    await insertCycleUnlockRequest(
      client.db,
      baseRh({ aba: 'lider', mes: '2026-08', liderId: 42, liderTipo: 'employee' }),
    );
    const comLider = await hasPendingUnlockRequest(client.db, companyId, '2026-08', 'lider', 42);
    expect(comLider).toBe(true);
    const semLider = await hasPendingUnlockRequest(client.db, companyId, '2026-08', 'lider', null);
    expect(semLider).toBe(false);
  });

  it('listCycleUnlockRequestsByStatus filtra apenas do status', async () => {
    const idPend = await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-04' }));
    const idAprov = await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-05' }));
    await decidirCycleUnlockRequest(client.db, idAprov, {
      novoStatus: 'aprovada',
      decididoPor: 1,
      decididoEm: new Date(),
    });
    const pendentes = await listCycleUnlockRequestsByStatus(client.db, 'pendente');
    expect(pendentes.some((r) => r.id === idPend)).toBe(true);
    expect(pendentes.some((r) => r.id === idAprov)).toBe(false);
  });

  it('listCycleUnlockRequestsByCompanyMes filtra por (company, mes)', async () => {
    const idA = await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-09' }));
    const idB = await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-10' }));
    const setembro = await listCycleUnlockRequestsByCompanyMes(client.db, companyId, '2026-09');
    expect(setembro.map((r) => r.id)).toEqual([idA]);
    expect(idB).toBeGreaterThan(0);
  });

  it('deleteCycleUnlockRequestsByCompany remove tudo da empresa', async () => {
    await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-11' }));
    await insertCycleUnlockRequest(client.db, baseRh({ mes: '2026-12' }));
    const afetadas = await deleteCycleUnlockRequestsByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
