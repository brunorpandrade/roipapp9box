// ROIP APP 9BOX — teste integracao `runEmailQueueJob` (ME-060 §11.2).
// Cobre:
// - fluxo transacional Template 1 (Super Admin) → emailNotifications
//   gravado + emailQueue.status='enviado'.
// - retry policy CC051 §12.10: falha → status volta a pendente com
//   retries+1; falha final (retries=3) → status='falhou'.
// - claim otimista via UPDATE guard: transicao pendente → processando.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { emailNotifications, emailQueue, superAdmins } from '../../src/db/schema';
import { runEmailQueueJob } from '../../src/server/jobs/emailQueueJob';
import { enqueueTransactional } from '../../src/server/services/emailDispatcher';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

describe('runEmailQueueJob — fluxo transacional Super Admin (CC052)', () => {
  let client: RoipDbClient;
  let brunoEmail: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    // Fixture super_admin (id=1) e criada pelo setup global; garante email
    // canonico. Cria um segundo super_admin canonico para o teste.
    const email = 'bruno-me060@roip.local';
    await client.db.insert(superAdmins).values({
      name: 'Bruno Teste',
      email,
      passwordHash: 'x',
    });
    brunoEmail = email;
  });

  afterAll(async () => {
    await client.db
      .delete(emailNotifications)
      .where(eq(emailNotifications.destinatarioEmail, brunoEmail));
    await client.db.delete(emailQueue).where(eq(emailQueue.destinatarioEmail, brunoEmail));
    await client.db.delete(superAdmins).where(eq(superAdmins.email, brunoEmail));
    await closeDbClient(client);
  });

  it('processa Template 1 SA: envia + grava emailNotifications + marca enviado', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const queueId = await enqueueTransactional(client.db, {
      companyId: null,
      destinatarioEmail: brunoEmail,
      destinatarioTipo: 'bruno',
      destinatarioEmployeeId: null,
      now,
      templateId: '1',
      payload: {
        nomeDoUsuario: 'Bruno',
        baseUrl: 'https://app.roip.com.br',
        jwtToken: 't1.token',
      },
    });

    const sendEmail = vi.fn().mockResolvedValue({ smtpMessageId: '<msg-t1@smtp>' });
    const result = await runEmailQueueJob(client.db, now, { sendEmail });
    expect(result.outcomes.enviado).toBeGreaterThanOrEqual(1);
    expect(sendEmail).toHaveBeenCalled();
    const callArgs = sendEmail.mock.calls[0]?.[0];
    expect(callArgs.subject).toBe('[ROIP APP] Redefinição de senha');
    expect(callArgs.to).toBe(brunoEmail);

    // Verifica emailQueue: status='enviado' + emailNotificationId FK
    const qRows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, queueId));
    const q = qRows[0];
    if (q === undefined) throw new Error('emailQueue row missing');
    expect(q.status).toBe('enviado');
    expect(q.emailNotificationId).not.toBeNull();

    // Verifica emailNotifications: gravado com smtpMessageId
    const nRows = await client.db
      .select()
      .from(emailNotifications)
      .where(eq(emailNotifications.id, q.emailNotificationId ?? 0));
    const n = nRows[0];
    if (n === undefined) throw new Error('emailNotifications row missing');
    expect(n.assunto).toBe('[ROIP APP] Redefinição de senha');
    expect(n.smtpMessageId).toBe('<msg-t1@smtp>');
    expect(n.success).toBe(true);
    expect(n.companyId).toBeNull(); // CC052 preservado
  });

  it('retry policy CC051: falha SMTP com retries<3 → pendente com retries+1', async () => {
    const now = new Date('2026-01-05T12:00:00Z');
    const queueId = await enqueueTransactional(client.db, {
      companyId: null,
      destinatarioEmail: brunoEmail,
      destinatarioTipo: 'bruno',
      destinatarioEmployeeId: null,
      now,
      templateId: '1',
      payload: {
        nomeDoUsuario: 'Bruno',
        baseUrl: 'https://app.roip.com.br',
        jwtToken: 'retry1',
      },
    });

    const sendEmail = vi.fn().mockRejectedValue(new Error('SMTP timeout'));
    const result = await runEmailQueueJob(client.db, now, { sendEmail });
    expect(result.outcomes.retry_agendado).toBeGreaterThanOrEqual(1);

    const qRows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, queueId));
    const q = qRows[0];
    if (q === undefined) throw new Error('row missing');
    expect(q.status).toBe('pendente'); // CC051 volta a pendente
    expect(q.retries).toBe(1);
  });

  it('falha final: retries=2 → falha vira status=falhou (§12.10)', async () => {
    const now = new Date('2026-01-05T13:00:00Z');
    // Insere direto com retries=2 para simular a 3a tentativa iminente.
    const [inserted] = await client.db
      .insert(emailQueue)
      .values({
        companyId: null,
        destinatarioTipo: 'bruno',
        destinatarioEmail: brunoEmail,
        destinatarioEmployeeId: null,
        tipoEnvio: 'imediato',
        alertIds: [
          '__transactional__',
          '1',
          JSON.stringify({
            nomeDoUsuario: 'Bruno',
            baseUrl: 'https://app.roip.com.br',
            jwtToken: 'final',
          }),
        ],
        scheduledFor: now,
        retries: 2,
      })
      .$returningId();
    if (!inserted) throw new Error('insert falhou');
    const queueId = inserted.id;

    const sendEmail = vi.fn().mockRejectedValue(new Error('SMTP down'));
    const result = await runEmailQueueJob(client.db, now, { sendEmail });
    expect(result.outcomes.falha_final).toBeGreaterThanOrEqual(1);

    const qRows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, queueId));
    const q = qRows[0];
    if (q === undefined) throw new Error('row missing');
    expect(q.status).toBe('falhou');
    expect(q.retries).toBe(3);
  });
});
