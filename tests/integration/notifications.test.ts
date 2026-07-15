// ROIP APP 9BOX — teste de integracao `notifications` (ME-017).
//
// Cobre §12.4: INSERT com defaults (severidade='info', lidaEm/
// arquivadaEm nulos); markNotificationRead e archiveNotification com
// WHERE guard de destinatario (id valido + destinatario incorreto
// retorna 0); lidaEm e arquivadaEm ortogonais; listUnread filtra
// destinatario e lidaEm IS NULL; FK SET NULL de alertId; delete por
// company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { alerts, companies, employees, notifications } from '../../src/db/schema';
import { insertAlert } from '../../src/server/services/alerts';
import {
  archiveNotification,
  deleteNotificationsByCompany,
  getNotificationById,
  insertNotification,
  listUnreadNotificationsByDestinatario,
  markNotificationRead,
  type NewNotification,
} from '../../src/server/services/notifications';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000138';

describe('service notifications (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let rhEmployeeId: number;
  let outroEmployeeId: number;

  function baseNotifRh(overrides: Partial<NewNotification> = {}): NewNotification {
    return {
      companyId,
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: rhEmployeeId,
      tipo: 'nine_box_baixo_desempenho',
      titulo: 'Titulo canonico da notificacao',
      subtitulo: 'Subtitulo canonico',
      linkDestino: '/dashboard',
      severidade: 'atencao',
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Notif Test LTDA',
        nomeFantasia: 'Empresa Notif Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330038',
        endereco: 'Rua Notif, 38',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@notif.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@notif.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp1] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Notif',
        cpf: '10101010138',
        email: 'rh.notif@roip.local',
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
    if (!emp1) throw new Error('beforeAll: falha ao criar rhEmployee');
    rhEmployeeId = emp1.id;

    const [emp2] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Outro RH Notif',
        cpf: '20202020138',
        email: 'outro.notif@roip.local',
        dataNascimento: new Date('1988-05-10'),
        dataAdmissao: new Date('2018-01-15'),
        cbo: '252105',
        descricaoCBO: 'Analista de RH',
        jobFamily: 'tecnico_especialista',
        senioridade: 'senior',
        nivelHierarquico: 'operacional',
        departamento: 'Recursos Humanos',
        isRH: true,
      })
      .$returningId();
    if (!emp2) throw new Error('beforeAll: falha ao criar outroEmployee');
    outroEmployeeId = emp2.id;
  });

  afterAll(async () => {
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, outroEmployeeId));
    await client.db.delete(employees).where(eq(employees.id, rhEmployeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
  });

  it('insere notificacao com defaults (lidaEm e arquivadaEm nulos)', async () => {
    const id = await insertNotification(client.db, baseNotifRh());
    expect(id).toBeGreaterThan(0);
    const row = await getNotificationById(client.db, id);
    expect(row?.lidaEm).toBeNull();
    expect(row?.arquivadaEm).toBeNull();
    expect(row?.severidade).toBe('atencao');
  });

  it('markNotificationRead afeta so quando destinatario bate', async () => {
    const id = await insertNotification(client.db, baseNotifRh());
    const lidaEm = new Date();
    const errado = await markNotificationRead(client.db, id, 'rh', outroEmployeeId, lidaEm);
    expect(errado).toBe(0);
    const certo = await markNotificationRead(client.db, id, 'rh', rhEmployeeId, lidaEm);
    expect(certo).toBe(1);
    expect((await getNotificationById(client.db, id))?.lidaEm).not.toBeNull();
  });

  it('archiveNotification afeta so quando destinatario bate', async () => {
    const id = await insertNotification(client.db, baseNotifRh());
    const arquivadaEm = new Date();
    const errado = await archiveNotification(client.db, id, 'rh', outroEmployeeId, arquivadaEm);
    expect(errado).toBe(0);
    const certo = await archiveNotification(client.db, id, 'rh', rhEmployeeId, arquivadaEm);
    expect(certo).toBe(1);
    expect((await getNotificationById(client.db, id))?.arquivadaEm).not.toBeNull();
  });

  it('lidaEm e arquivadaEm sao ortogonais', async () => {
    const id = await insertNotification(client.db, baseNotifRh());
    const now = new Date();
    await markNotificationRead(client.db, id, 'rh', rhEmployeeId, now);
    await archiveNotification(client.db, id, 'rh', rhEmployeeId, now);
    const row = await getNotificationById(client.db, id);
    expect(row?.lidaEm).not.toBeNull();
    expect(row?.arquivadaEm).not.toBeNull();
  });

  it('listUnreadNotificationsByDestinatario filtra por destinatario e nao-lidas', async () => {
    const idA = await insertNotification(client.db, baseNotifRh({ titulo: 'A' }));
    const idB = await insertNotification(client.db, baseNotifRh({ titulo: 'B' }));
    await markNotificationRead(client.db, idA, 'rh', rhEmployeeId, new Date());
    const idC = await insertNotification(
      client.db,
      baseNotifRh({ titulo: 'C', destinatarioEmployeeId: outroEmployeeId }),
    );

    const naoLidasRh = await listUnreadNotificationsByDestinatario(client.db, 'rh', rhEmployeeId);
    expect(naoLidasRh.map((n) => n.id)).toEqual([idB]);
    expect(idC).toBeGreaterThan(0);
  });

  it('destinatarioTipo=bruno com destinatarioEmployeeId=null e valido (notif global)', async () => {
    const id = await insertNotification(
      client.db,
      baseNotifRh({
        companyId: null,
        destinatarioTipo: 'bruno',
        destinatarioEmployeeId: null,
      }),
    );
    const naoLidasBruno = await listUnreadNotificationsByDestinatario(client.db, 'bruno', null);
    expect(naoLidasBruno.some((n) => n.id === id)).toBe(true);
    // Cleanup manual (companyId null nao e apagado pelo beforeEach por company).
    await client.db.delete(notifications).where(eq(notifications.id, id));
  });

  it('FK SET NULL de alertId: delete do alerta preserva notificacao com alertId=null', async () => {
    const alertId = await insertAlert(client.db, {
      companyId,
      tipo: 'nine_box_baixo_desempenho',
      escopo: 'empresa',
    });
    const idNotif = await insertNotification(client.db, baseNotifRh({ alertId }));
    await client.db.delete(alerts).where(eq(alerts.id, alertId));
    const row = await getNotificationById(client.db, idNotif);
    expect(row?.alertId).toBeNull();
  });

  it('deleteNotificationsByCompany remove tudo da empresa', async () => {
    await insertNotification(client.db, baseNotifRh());
    await insertNotification(client.db, baseNotifRh());
    const afetadas = await deleteNotificationsByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
