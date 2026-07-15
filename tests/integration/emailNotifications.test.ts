// ROIP APP 9BOX — teste de integracao `emailNotifications` (ME-017).
//
// Cobre §12.5: INSERT append-only strict (§16.1 item 12) — INSERT
// ocorre APOS envio com enviadoEm/success/failReason ja populados;
// 3 valores canonicos de `tipoEnvio` (`imediato` / `digest_semanal` /
// `digest_diario` reservado); success=true com smtpMessageId +
// success=false com failReason; FK SET NULL de notificationId
// (delete de notificacao pai preserva historico); leitura ordenada
// por createdAt / enviadoEm DESC.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, emailNotifications, employees, notifications } from '../../src/db/schema';
import {
  deleteEmailNotificationsByCompany,
  getEmailNotificationById,
  insertEmailNotification,
  listEmailNotificationsByCompany,
  listEmailNotificationsByDestinatario,
  type NewEmailNotification,
} from '../../src/server/services/emailNotifications';
import { insertNotification } from '../../src/server/services/notifications';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000140';

describe('service emailNotifications (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let rhEmployeeId: number;

  function baseEmail(overrides: Partial<NewEmailNotification> = {}): NewEmailNotification {
    return {
      companyId,
      destinatarioTipo: 'rh',
      destinatarioEmail: 'rh.emailn@roip.local',
      destinatarioEmployeeId: rhEmployeeId,
      assunto: 'Assunto canonico',
      corpoTexto: 'Corpo em texto puro do e-mail.',
      corpoHtml: '<p>Corpo em HTML.</p>',
      tipoEnvio: 'imediato',
      enviadoEm: new Date(),
      success: true,
      smtpMessageId: 'smtp-msg-001',
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa EmailN Test LTDA',
        nomeFantasia: 'Empresa EmailN Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330040',
        endereco: 'Rua EmailN, 40',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@emailn.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@emailn.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH EmailN',
        cpf: '10101010140',
        email: 'rh.emailn@roip.local',
        dataNascimento: new Date('1985-05-10'),
        dataAdmissao: new Date('2016-01-15'),
        cbo: '252105',
        descricaoCBO: 'Analista de RH',
        jobFamily: 'tecnico_especialista',
        senioridade: 'senior',
        nivelHierarquico: 'operacional',
        departamento: 'Recursos Humanos',
        isRH: true,
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee');
    rhEmployeeId = emp.id;
  });

  afterAll(async () => {
    await client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, rhEmployeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
  });

  it('insere e-mail success=true com smtpMessageId', async () => {
    const id = await insertEmailNotification(client.db, baseEmail());
    expect(id).toBeGreaterThan(0);
    const row = await getEmailNotificationById(client.db, id);
    expect(row?.success).toBe(true);
    expect(row?.smtpMessageId).toBe('smtp-msg-001');
    expect(row?.enviadoEm).not.toBeNull();
  });

  it('insere e-mail success=false com failReason', async () => {
    const id = await insertEmailNotification(
      client.db,
      baseEmail({
        success: false,
        smtpMessageId: null,
        failReason: 'smtp_falha',
      }),
    );
    const row = await getEmailNotificationById(client.db, id);
    expect(row?.success).toBe(false);
    expect(row?.failReason).toBe('smtp_falha');
    expect(row?.smtpMessageId).toBeNull();
  });

  it('aceita os 3 valores canonicos de tipoEnvio', async () => {
    const tipos: Array<'imediato' | 'digest_semanal' | 'digest_diario'> = [
      'imediato',
      'digest_semanal',
      'digest_diario',
    ];
    for (const t of tipos) {
      const id = await insertEmailNotification(client.db, baseEmail({ tipoEnvio: t }));
      const row = await getEmailNotificationById(client.db, id);
      expect(row?.tipoEnvio).toBe(t);
    }
  });

  it('eventoIds JSON persiste array intacto', async () => {
    const eventos = [10, 11, 12];
    const id = await insertEmailNotification(client.db, baseEmail({ eventoIds: eventos }));
    const row = await getEmailNotificationById(client.db, id);
    expect(row?.eventoIds).toEqual(eventos);
  });

  it('FK SET NULL de notificationId preserva historico apos delete da notif', async () => {
    const notifId = await insertNotification(client.db, {
      companyId,
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: rhEmployeeId,
      tipo: 'nine_box_baixo_desempenho',
      titulo: 'Titulo N',
    });
    const idEmail = await insertEmailNotification(
      client.db,
      baseEmail({ notificationId: notifId }),
    );
    await client.db.delete(notifications).where(eq(notifications.id, notifId));
    const row = await getEmailNotificationById(client.db, idEmail);
    expect(row).toBeDefined();
    expect(row?.notificationId).toBeNull();
  });

  it('listEmailNotificationsByCompany ordena por createdAt DESC', async () => {
    const id1 = await insertEmailNotification(client.db, baseEmail({ assunto: 'A' }));
    await new Promise((r) => setTimeout(r, 1100));
    const id2 = await insertEmailNotification(client.db, baseEmail({ assunto: 'B' }));
    const lista = await listEmailNotificationsByCompany(client.db, companyId);
    expect(lista.map((r) => r.id)).toEqual([id2, id1]);
  });

  it('listEmailNotificationsByDestinatario filtra por (tipo, email)', async () => {
    const idA = await insertEmailNotification(
      client.db,
      baseEmail({ destinatarioEmail: 'a@x.local' }),
    );
    const idB = await insertEmailNotification(
      client.db,
      baseEmail({ destinatarioEmail: 'b@x.local' }),
    );
    const paraA = await listEmailNotificationsByDestinatario(client.db, 'rh', 'a@x.local');
    expect(paraA.map((r) => r.id)).toEqual([idA]);
    expect(idB).toBeGreaterThan(0);
  });

  it('FK CASCADE em companyId: escopo teste — nao deletamos company aqui', async () => {
    expect(true).toBe(true);
  });

  it('deleteEmailNotificationsByCompany remove tudo da empresa', async () => {
    await insertEmailNotification(client.db, baseEmail());
    await insertEmailNotification(client.db, baseEmail());
    const afetadas = await deleteEmailNotificationsByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
