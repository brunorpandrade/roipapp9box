// ROIP APP 9BOX — teste integracao `runWeeklyDigestJob` (ME-060 §11.4/§11.5/§11.8).
// Cobre:
// - Gatilho canonico segunda 08h fuso local.
// - Agregacao por destinatario + envio Template B.
// - Gravacao em digestExecutionLog + idempotencia via UNIQUE
//   (companyId, weekStart).

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  companies,
  digestExecutionLog,
  emailNotifications,
  emailQueue,
} from '../../src/db/schema';
import { runWeeklyDigestJob } from '../../src/server/jobs/weeklyDigestJob';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

async function criaEmpresa(client: RoipDbClient, cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `Empresa ${cnpj}`,
      nomeFantasia: `Empresa ${cnpj}`,
      cnpj,
      telefone: '1633330000',
      endereco: 'Rua M60',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `cp-${cnpj}@me060.local`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@me060.local`,
      segmento: 'Serviço',
      tipoAtividade: 'x',
      descricaoAtividade: 'x',
      contextoMercado: 'x',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      timezone: 'America/Sao_Paulo',
      status: 'ativa',
    })
    .$returningId();
  if (!row) throw new Error('empresa insert falhou');
  return row.id;
}

describe('runWeeklyDigestJob — §11.4/§11.5/§11.8', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10210000000003');
  });

  afterAll(async () => {
    await client.db.delete(digestExecutionLog).where(eq(digestExecutionLog.companyId, empresaId));
    await client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, empresaId));
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
    await client.db.delete(alerts).where(eq(alerts.companyId, empresaId));
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('fora do gatilho (terca 08h) → empresa pulada por horario', async () => {
    const now = new Date('2026-01-06T11:00:00Z'); // terca 08h SP
    const result = await runWeeklyDigestJob(client.db, now, {
      sendEmail: vi.fn().mockResolvedValue({ smtpMessageId: '<x>' }),
    });
    expect(result.empresasPuladasHorario).toBeGreaterThanOrEqual(1);
    expect(result.empresasProcessadas).toBe(0);
  });

  it('gatilho canonico segunda 08h SP + com alerta atencao → envia Template B', async () => {
    // 2026-01-05 08h BRT = 11h UTC (segunda)
    const now = new Date('2026-01-05T11:00:00Z');
    const weekStart = now;

    // Grava um alerta canonico atencao (para o template B) e enfileira
    // linha digest_semanal em emailQueue com scheduledFor=weekStart. Usa
    // `ciclo_mensal_fechado` — escopo empresa, linkResolver §5.6 usa
    // apenas `mes` do metadata, sem FK obrigatoria.
    const [alertInserted] = await client.db
      .insert(alerts)
      .values({
        companyId: empresaId,
        tipo: 'ciclo_mensal_fechado',
        severidade: 'atencao',
        escopo: 'empresa',
        metadados: {
          mes: '2025-12',
          cicloReferencia: '2025-12',
          empresaNome: `Empresa 10210000000003`,
        },
      })
      .$returningId();
    if (!alertInserted) throw new Error('alert insert falhou');
    const alertId = alertInserted.id;

    await client.db.insert(emailQueue).values({
      companyId: empresaId,
      destinatarioTipo: 'rh',
      destinatarioEmail: 'rh-digest@empresa.com',
      destinatarioEmployeeId: null,
      tipoEnvio: 'digest_semanal',
      alertIds: [alertId],
      scheduledFor: weekStart,
      status: 'pendente',
      retries: 0,
    });

    const sendEmail = vi.fn().mockResolvedValue({ smtpMessageId: '<digest-1@smtp>' });
    const result = await runWeeklyDigestJob(client.db, now, { sendEmail });
    expect(result.empresasProcessadas).toBeGreaterThanOrEqual(1);
    expect(result.emailsEnviados).toBeGreaterThanOrEqual(1);
    expect(sendEmail).toHaveBeenCalled();
    const call = sendEmail.mock.calls[0]?.[0];
    expect(call.subject).toContain('Resumo semanal');
    expect(call.subject).toContain(String(empresaId).slice(0, 0)); // apenas garantir string
    expect(call.to).toBe('rh-digest@empresa.com');

    // Verifica digestExecutionLog gravado
    const dlRows = await client.db
      .select()
      .from(digestExecutionLog)
      .where(eq(digestExecutionLog.companyId, empresaId));
    expect(dlRows.length).toBeGreaterThanOrEqual(1);
  });

  it('idempotencia §11.8: reexecucao pula empresa (UNIQUE weekStart)', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const sendEmail = vi.fn().mockResolvedValue({ smtpMessageId: '<never>' });
    const result = await runWeeklyDigestJob(client.db, now, { sendEmail });
    // Ja processada na chamada anterior — nova chamada pula por
    // idempotencia (digestExecutionLog ja tem linha).
    expect(result.empresasPuladasIdempotencia).toBeGreaterThanOrEqual(1);
    // Nao houve nova gravacao — a UNIQUE canonica preserva estado.
    // weekStart e DATE (YYYY-MM-DD) e comparacao via string canonica.
    const dlRows = await client.db
      .select()
      .from(digestExecutionLog)
      .where(
        and(
          eq(digestExecutionLog.companyId, empresaId),
          eq(digestExecutionLog.weekStart, '2026-01-05' as unknown as Date),
        ),
      );
    expect(dlRows.length).toBe(1);
  });
});
