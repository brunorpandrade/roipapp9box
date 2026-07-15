// ROIP APP 9BOX — teste de integracao `portalReminderLog` (ME-017).
//
// Cobre §12.1: INSERT append-only com PK CHAR(36) UUID fornecido pelo
// caller; 4 valores canonicos de `instrumentType`; sentByType employee
// vs superAdmin; cycleReference NULL (Meu perfil, sem ciclo);
// countRemindersInCooldownWindow filtra (employeeId, instrumentType,
// cycleReference) e `since`; FK CASCADE de employeeId; PK collision
// gera excecao.

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, portalReminderLog } from '../../src/db/schema';
import {
  countRemindersInCooldownWindow,
  deletePortalReminderLogByEmployee,
  getPortalReminderLogById,
  insertPortalReminderLog,
  listRemindersByEmployeeSince,
  type NewPortalReminderLog,
} from '../../src/server/services/portalReminderLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000139';

describe('service portalReminderLog (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;

  function baseReminder(overrides: Partial<NewPortalReminderLog> = {}): NewPortalReminderLog {
    return {
      id: randomUUID(),
      employeeId,
      instrumentType: 'autoAvaliacao',
      cycleReference: '2026-Q1',
      sentBy: String(employeeId),
      sentByType: 'employee',
      success: true,
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa PRL Test LTDA',
        nomeFantasia: 'Empresa PRL Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330039',
        endereco: 'Rua PRL, 39',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@prl.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@prl.local',
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
        name: 'Colab PRL',
        cpf: '10101010139',
        email: 'colab.prl@roip.local',
        dataNascimento: new Date('1990-05-10'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee');
    employeeId = emp.id;
  });

  afterAll(async () => {
    await client.db.delete(portalReminderLog).where(eq(portalReminderLog.employeeId, employeeId));
    await client.db.delete(employees).where(eq(employees.id, employeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(portalReminderLog).where(eq(portalReminderLog.employeeId, employeeId));
  });

  it('insere lembrete com UUID e retorna o proprio UUID', async () => {
    const uuid = randomUUID();
    const returned = await insertPortalReminderLog(client.db, baseReminder({ id: uuid }));
    expect(returned).toBe(uuid);
    const row = await getPortalReminderLogById(client.db, uuid);
    expect(row?.id).toBe(uuid);
    expect(row?.success).toBe(true);
  });

  it('aceita os 4 valores canonicos de instrumentType', async () => {
    const tipos: Array<'meuPerfil' | 'autoAvaliacao' | 'avaliacaoLiderancaDireta' | 'radarNR1'> = [
      'meuPerfil',
      'autoAvaliacao',
      'avaliacaoLiderancaDireta',
      'radarNR1',
    ];
    for (const t of tipos) {
      await insertPortalReminderLog(
        client.db,
        baseReminder({
          instrumentType: t,
          cycleReference: t === 'meuPerfil' ? null : '2026-Q1',
        }),
      );
    }
  });

  it('grava failReason quando success=false', async () => {
    const uuid = await insertPortalReminderLog(
      client.db,
      baseReminder({ success: false, failReason: 'smtp_falha' }),
    );
    const row = await getPortalReminderLogById(client.db, uuid);
    expect(row?.failReason).toBe('smtp_falha');
  });

  it('sentByType=superAdmin com sentBy=id do super admin', async () => {
    const uuid = await insertPortalReminderLog(
      client.db,
      baseReminder({ sentBy: '1', sentByType: 'superAdmin' }),
    );
    const row = await getPortalReminderLogById(client.db, uuid);
    expect(row?.sentByType).toBe('superAdmin');
  });

  it('cycleReference NULL cobre caso Meu perfil', async () => {
    const uuid = await insertPortalReminderLog(
      client.db,
      baseReminder({ instrumentType: 'meuPerfil', cycleReference: null }),
    );
    const row = await getPortalReminderLogById(client.db, uuid);
    expect(row?.cycleReference).toBeNull();
  });

  it('countRemindersInCooldownWindow filtra por chave e janela', async () => {
    const since = new Date();
    await new Promise((r) => setTimeout(r, 1100));
    await insertPortalReminderLog(client.db, baseReminder({ instrumentType: 'autoAvaliacao' }));
    await insertPortalReminderLog(
      client.db,
      baseReminder({ instrumentType: 'avaliacaoLiderancaDireta' }),
    );

    const contaAuto = await countRemindersInCooldownWindow(
      client.db,
      employeeId,
      'autoAvaliacao',
      '2026-Q1',
      since,
    );
    expect(contaAuto).toBe(1);
    const contaLid = await countRemindersInCooldownWindow(
      client.db,
      employeeId,
      'avaliacaoLiderancaDireta',
      '2026-Q1',
      since,
    );
    expect(contaLid).toBe(1);
  });

  it('countRemindersInCooldownWindow com cycleReference NULL usa IS NULL', async () => {
    const since = new Date();
    await new Promise((r) => setTimeout(r, 1100));
    await insertPortalReminderLog(
      client.db,
      baseReminder({ instrumentType: 'meuPerfil', cycleReference: null }),
    );
    const n = await countRemindersInCooldownWindow(client.db, employeeId, 'meuPerfil', null, since);
    expect(n).toBe(1);
  });

  it('listRemindersByEmployeeSince ordena por sentAt DESC', async () => {
    const since = new Date();
    await new Promise((r) => setTimeout(r, 1100));
    const uuid1 = await insertPortalReminderLog(client.db, baseReminder());
    await new Promise((r) => setTimeout(r, 1100));
    const uuid2 = await insertPortalReminderLog(client.db, baseReminder());

    const lista = await listRemindersByEmployeeSince(
      client.db,
      employeeId,
      'autoAvaliacao',
      '2026-Q1',
      since,
    );
    expect(lista.map((r) => r.id)).toEqual([uuid2, uuid1]);
  });

  it('PK duplicada gera excecao (UUID reaproveitado)', async () => {
    const uuid = randomUUID();
    await insertPortalReminderLog(client.db, baseReminder({ id: uuid }));
    await expect(insertPortalReminderLog(client.db, baseReminder({ id: uuid }))).rejects.toThrow();
  });

  it('FK CASCADE em employeeId propaga delete', async () => {
    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colab Cascade PRL',
        cpf: '99999999139',
        email: 'cascade.prl@roip.local',
        dataNascimento: new Date('1990-05-10'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!emp) throw new Error('falha ao criar employee de cascade');
    const uuid = await insertPortalReminderLog(client.db, baseReminder({ employeeId: emp.id }));
    await client.db.delete(employees).where(eq(employees.id, emp.id));
    const rows = await client.db
      .select()
      .from(portalReminderLog)
      .where(and(eq(portalReminderLog.id, uuid)));
    expect(rows.length).toBe(0);
  });

  it('deletePortalReminderLogByEmployee remove tudo do employee', async () => {
    await insertPortalReminderLog(client.db, baseReminder());
    await insertPortalReminderLog(client.db, baseReminder());
    const afetadas = await deletePortalReminderLogByEmployee(client.db, employeeId);
    expect(afetadas).toBe(2);
  });
});
