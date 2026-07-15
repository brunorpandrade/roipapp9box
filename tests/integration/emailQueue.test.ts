// ROIP APP 9BOX — teste de integracao `emailQueue` (ME-017).
//
// Cobre §12.7: INSERT com defaults (status='pendente', retries=0);
// transicoes com WHERE guard de status:
//   pendente → processando (markEmailQueueProcessing)
//   processando → enviado (markEmailQueueSent)
//   processando → falhou  (markEmailQueueFailed)
// Cada transicao invalida retorna 0 e preserva registro. alertIds JSON
// nao nulo. FK SET NULL de emailNotificationId. Listagens por status
// e por status/scheduledFor. Delete por company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, emailNotifications, emailQueue } from '../../src/db/schema';
import { insertEmailNotification } from '../../src/server/services/emailNotifications';
import {
  deleteEmailQueueByCompany,
  getEmailQueueItemById,
  insertEmailQueueItem,
  listEmailQueueByStatus,
  listEmailQueuePendingReady,
  markEmailQueueFailed,
  markEmailQueueProcessing,
  markEmailQueueSent,
  type NewEmailQueueItem,
} from '../../src/server/services/emailQueue';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000142';

describe('service emailQueue (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;

  function baseItem(overrides: Partial<NewEmailQueueItem> = {}): NewEmailQueueItem {
    return {
      companyId,
      destinatarioTipo: 'rh',
      destinatarioEmail: 'rh.eq@roip.local',
      tipoEnvio: 'imediato',
      alertIds: [1, 2, 3],
      scheduledFor: new Date('2026-06-01T09:00:00Z'),
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa EmailQueue Test LTDA',
        nomeFantasia: 'Empresa EQ Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330042',
        endereco: 'Rua EQ, 42',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@eq.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@eq.local',
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
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, companyId));
  });

  it('insere item com defaults status=pendente e retries=0', async () => {
    const id = await insertEmailQueueItem(client.db, baseItem());
    const row = await getEmailQueueItemById(client.db, id);
    expect(row?.status).toBe('pendente');
    expect(row?.retries).toBe(0);
  });

  it('markEmailQueueProcessing transita pendente -> processando; repeticao retorna 0', async () => {
    const id = await insertEmailQueueItem(client.db, baseItem());
    const now = new Date();
    expect(await markEmailQueueProcessing(client.db, id, now)).toBe(1);
    expect((await getEmailQueueItemById(client.db, id))?.status).toBe('processando');
    expect(await markEmailQueueProcessing(client.db, id, now)).toBe(0);
  });

  it('markEmailQueueSent exige status=processando; grava emailNotificationId', async () => {
    const id = await insertEmailQueueItem(client.db, baseItem());
    // Sobre status=pendente nao afeta.
    const sobrePendente = await markEmailQueueSent(client.db, id, 999);
    expect(sobrePendente).toBe(0);
    await markEmailQueueProcessing(client.db, id, new Date());
    const emailNotificationId = await insertEmailNotification(client.db, {
      companyId,
      destinatarioTipo: 'rh',
      destinatarioEmail: 'rh.eq@roip.local',
      assunto: 'Assunto teste',
      corpoTexto: 'Corpo teste',
      tipoEnvio: 'imediato',
      success: true,
      enviadoEm: new Date(),
    });
    const afetadas = await markEmailQueueSent(client.db, id, emailNotificationId);
    expect(afetadas).toBe(1);
    const row = await getEmailQueueItemById(client.db, id);
    expect(row?.status).toBe('enviado');
    expect(row?.emailNotificationId).toBe(emailNotificationId);
  });

  it('markEmailQueueFailed exige status=processando; incrementa retries fornecido', async () => {
    const id = await insertEmailQueueItem(client.db, baseItem());
    // Sobre pendente nao afeta.
    expect(await markEmailQueueFailed(client.db, id, 1)).toBe(0);
    await markEmailQueueProcessing(client.db, id, new Date());
    expect(await markEmailQueueFailed(client.db, id, 1)).toBe(1);
    const row = await getEmailQueueItemById(client.db, id);
    expect(row?.status).toBe('falhou');
    expect(row?.retries).toBe(1);
  });

  it('listEmailQueueByStatus retorna apenas do status pedido', async () => {
    const id1 = await insertEmailQueueItem(client.db, baseItem());
    const id2 = await insertEmailQueueItem(client.db, baseItem());
    await markEmailQueueProcessing(client.db, id1, new Date());
    const pendentes = await listEmailQueueByStatus(client.db, 'pendente');
    expect(pendentes.some((i) => i.id === id2)).toBe(true);
    expect(pendentes.some((i) => i.id === id1)).toBe(false);
  });

  it('listEmailQueuePendingReady filtra scheduledFor <= now', async () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const future = new Date('2037-12-01T00:00:00Z');
    const idPast = await insertEmailQueueItem(client.db, baseItem({ scheduledFor: past }));
    const idFuture = await insertEmailQueueItem(client.db, baseItem({ scheduledFor: future }));
    const prontos = await listEmailQueuePendingReady(client.db, new Date());
    expect(prontos.some((i) => i.id === idPast)).toBe(true);
    expect(prontos.some((i) => i.id === idFuture)).toBe(false);
  });

  it('aceita alertIds JSON com array vazio', async () => {
    const id = await insertEmailQueueItem(client.db, baseItem({ alertIds: [] }));
    const row = await getEmailQueueItemById(client.db, id);
    expect(row?.alertIds).toEqual([]);
  });

  it('deleteEmailQueueByCompany remove tudo da empresa', async () => {
    await insertEmailQueueItem(client.db, baseItem());
    await insertEmailQueueItem(client.db, baseItem());
    const afetadas = await deleteEmailQueueByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
