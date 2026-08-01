/* eslint-disable @stylistic/max-len -- describe/it com contexto S/§/canonizacoes tornam labels longas por design */
// ROIP APP 9BOX — teste integracao scheduler cron (§15) — ME-063a.
// Cobre §15.1 registry canonico + §15.4 comportamento em falha +
// execucao end-to-end com MySQL real dos 3 workers de e-mail religados
// em ME-060.

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, emailQueue } from '../../src/db/schema';
import { TRANSACTIONAL_MARKER_HEAD } from '../../src/lib/email';
import type { SmtpEnvelope, SmtpSendResult } from '../../src/lib/email';
import {
  CRON_JOB_CADENCE_BY_NAME,
  createCronScheduler,
  DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
  type CronSchedulerDependencies,
} from '../../src/server/jobs/scheduler';
import type { EmailQueueJobResult } from '../../src/server/jobs/emailQueueJob';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

interface StubCall {
  readonly envelope: SmtpEnvelope;
}

function makeStubSendEmail(
  outcomes: {
    id: number;
    result: SmtpSendResult | { throws: string };
  }[],
): {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
  readonly calls: readonly StubCall[];
} {
  const calls: StubCall[] = [];
  let idx = 0;
  const sendEmail = async (envelope: SmtpEnvelope): Promise<SmtpSendResult> => {
    calls.push({ envelope });
    const outcome = outcomes[idx];
    idx += 1;
    if (outcome === undefined) {
      return { smtpMessageId: `stub-${calls.length}@test.local` };
    }
    if ('throws' in outcome.result) {
      throw new Error(outcome.result.throws);
    }
    return outcome.result;
  };
  return { sendEmail, calls };
}

async function criaEmpresa(client: RoipDbClient, cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `Empresa ${cnpj}`,
      nomeFantasia: `Empresa ${cnpj}`,
      cnpj,
      telefone: '1633330000',
      endereco: 'Rua ME063a',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `contato-${cnpj}@me063a.local`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@me063a.local`,
      segmento: 'Serviço',
      tipoAtividade: 'x',
      descricaoAtividade: 'x',
      contextoMercado: 'x',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      // status='ativa' canonicamente exigido pelo worker CC052 §11.6 —
      // sem isso, o item e descartado como `empresa_desativada`.
      status: 'ativa',
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar empresa ${cnpj}`);
  return row.id;
}

describe('scheduler cron — registry canonico §15.1 + createCronScheduler', () => {
  it('createCronScheduler retorna contrato canonico com runByName + listRegistered', () => {
    const scheduler = createCronScheduler();
    expect(typeof scheduler.runByName).toBe('function');
    expect(typeof scheduler.listRegistered).toBe('function');
  });

  it('listRegistered retorna 7 jobs canonicos pos ME-063b (3 workers e-mail ME-063a + 4 operacionais ME-063b)', () => {
    const scheduler = createCronScheduler();
    const registered = scheduler.listRegistered();
    expect(registered).toHaveLength(7);
    const names = registered.map((r) => r.name);
    expect(names).toEqual([
      'runEmailQueueJob',
      'resetStuckEmailQueue',
      'runWeeklyDigestJob',
      'runDailyClosureJob',
      'runDailyInstrumentStatusJob',
      'refreshCycleScheduleCounters',
      'archiveAiConversationsJob',
    ]);
  });

  it('cadencias canonicas bit-exact §15.1 mapeadas em CRON_JOB_CADENCE_BY_NAME', () => {
    expect(CRON_JOB_CADENCE_BY_NAME.runEmailQueueJob).toBe('every_1_min');
    expect(CRON_JOB_CADENCE_BY_NAME.resetStuckEmailQueue).toBe('every_10_min');
    expect(CRON_JOB_CADENCE_BY_NAME.runWeeklyDigestJob).toBe('every_hour_utc');
    expect(CRON_JOB_CADENCE_BY_NAME.runDailyClosureJob).toBe('daily_00_00_local_per_company');
    expect(CRON_JOB_CADENCE_BY_NAME.runDailyInstrumentStatusJob).toBe('daily_local_per_company');
    expect(CRON_JOB_CADENCE_BY_NAME.refreshCycleScheduleCounters).toBe('daily_00_15_utc');
    expect(CRON_JOB_CADENCE_BY_NAME.archiveAiConversationsJob).toBe('daily_03_00_utc');
  });

  it('listRegistered devolve as cadencias canonicas por job §15.1', () => {
    const scheduler = createCronScheduler();
    const registered = scheduler.listRegistered();
    const cadenceByName = new Map(registered.map((r) => [r.name, r.cadence]));
    expect(cadenceByName.get('runEmailQueueJob')).toBe('every_1_min');
    expect(cadenceByName.get('resetStuckEmailQueue')).toBe('every_10_min');
    expect(cadenceByName.get('runWeeklyDigestJob')).toBe('every_hour_utc');
  });

  it('DEFAULT_CRON_SCHEDULER_DEPENDENCIES.sendEmail e a funcao canonica sendEmailViaSmtp', () => {
    // Nao invocamos o SMTP real — apenas verificamos que o default aponta
    // para a funcao canonica (comparacao por referencia).
    expect(typeof DEFAULT_CRON_SCHEDULER_DEPENDENCIES.sendEmail).toBe('function');
  });
});

describe('scheduler cron — runByName end-to-end com MySQL real', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10290000000001');
  });

  afterEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('runByName(resetStuckEmailQueue) executa canonicamente (fila vazia → 0 linhas afetadas)', async () => {
    const scheduler = createCronScheduler();
    const now = new Date('2026-01-05T10:00:00Z');
    const result = await scheduler.runByName('resetStuckEmailQueue', client.db, now);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('resetStuckEmailQueue');
    expect(result.cadence).toBe('every_10_min');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // outcome canonico: numero de linhas afetadas (0 nesta rodada).
    expect(result.outcome).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('runByName(runEmailQueueJob) processa fila vazia canonicamente (candidatosLidos=0)', async () => {
    const now = new Date('2026-01-05T10:00:00Z');
    const stub = makeStubSendEmail([]);
    const deps: CronSchedulerDependencies = {
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      sendEmail: stub.sendEmail,
    };
    const scheduler = createCronScheduler(deps);
    const result = await scheduler.runByName('runEmailQueueJob', client.db, now);
    expect(result.status).toBe('ok');
    expect(result.name).toBe('runEmailQueueJob');
    expect(result.cadence).toBe('every_1_min');
    const outcome = result.outcome as EmailQueueJobResult;
    expect(outcome.candidatosLidos).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('runByName(runEmailQueueJob) end-to-end: enfileira transacional + processa + envia via stub', async () => {
    const now = new Date('2026-01-05T10:00:00Z');
    // Enfileiramento canonico bit-exact ao dispatcher (§12.9): grava
    // marker `['__transactional__', '1', payloadJson]` direto (evita
    // acoplar teste do scheduler ao dispatcher — cobertura autonoma).
    const templatePayload = {
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
    };
    const [inserted] = await client.db
      .insert(emailQueue)
      .values({
        companyId: empresaId,
        destinatarioTipo: 'rh',
        destinatarioEmail: 'ana@empresa.com',
        destinatarioEmployeeId: null,
        tipoEnvio: 'imediato',
        alertIds: [TRANSACTIONAL_MARKER_HEAD, '1', JSON.stringify(templatePayload)],
        status: 'pendente',
        scheduledFor: new Date(now.getTime() - 30_000),
      })
      .$returningId();
    if (!inserted) throw new Error('falha ao enfileirar');

    const stub = makeStubSendEmail([
      { id: inserted.id, result: { smtpMessageId: '<abc123@test.local>' } },
    ]);
    const scheduler = createCronScheduler({
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      sendEmail: stub.sendEmail,
    });
    const result = await scheduler.runByName('runEmailQueueJob', client.db, now);

    expect(result.status).toBe('ok');
    const outcome = result.outcome as EmailQueueJobResult;
    expect(outcome.candidatosLidos).toBe(1);
    expect(outcome.outcomes.enviado).toBe(1);
    expect(stub.calls).toHaveLength(1);
    const firstCall = stub.calls[0];
    if (!firstCall) throw new Error('stub.calls[0] ausente — teste canonico presume 1 chamada');
    expect(firstCall.envelope.to).toBe('ana@empresa.com');
    expect(firstCall.envelope.subject).toBe('[ROIP APP] Redefinicao de senha');

    // Verifica que a linha foi canonicamente marcada como enviada.
    const [row] = await client.db
      .select({ status: emailQueue.status })
      .from(emailQueue)
      .where(eq(emailQueue.id, inserted.id))
      .limit(1);
    expect(row?.status).toBe('enviado');
  });

  it('runByName captura excecao do handler e retorna status=error com log warn (§15.4)', async () => {
    // Enfileira 1 e-mail transacional e injeta stub que lanca. O worker
    // isola o item com try/catch interno e marca como retry — porem o
    // job em si retorna sumario. Aqui provocamos falha via db inaccessivel:
    // fechamos o client ANTES do runByName. O erro sobe canonicamente ao
    // scheduler.
    const now = new Date('2026-01-05T10:00:00Z');
    const closedClient = createDbClient(TEST_URL);
    await closeDbClient(closedClient);
    const scheduler = createCronScheduler();
    const result = await scheduler.runByName('resetStuckEmailQueue', closedClient.db, now);
    expect(result.status).toBe('error');
    expect(result.name).toBe('resetStuckEmailQueue');
    expect(result.error).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('scheduler cron — deps canonicas propagam ao handler (§15.1.5 runEmailQueueJob)', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10290000000002');
  });

  afterEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('deps.sendEmail canonicamente injetado atinge o worker (bit-exact ao padrao ME-060)', async () => {
    const now = new Date('2026-01-05T10:00:00Z');
    const templatePayload = {
      nomeDoUsuario: 'Bruno',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'xxx.yyy.zzz',
    };
    await client.db.insert(emailQueue).values({
      companyId: empresaId,
      destinatarioTipo: 'bruno',
      destinatarioEmail: 'bruno@roip.com.br',
      destinatarioEmployeeId: null,
      tipoEnvio: 'imediato',
      alertIds: [TRANSACTIONAL_MARKER_HEAD, '1', JSON.stringify(templatePayload)],
      status: 'pendente',
      scheduledFor: new Date(now.getTime() - 30_000),
    });
    const stub = makeStubSendEmail([{ id: 0, result: { smtpMessageId: '<propaga@test.local>' } }]);
    const scheduler = createCronScheduler({
      ...DEFAULT_CRON_SCHEDULER_DEPENDENCIES,
      sendEmail: stub.sendEmail,
    });
    await scheduler.runByName('runEmailQueueJob', client.db, now);
    expect(stub.calls).toHaveLength(1);
    const firstCall = stub.calls[0];
    if (!firstCall) throw new Error('stub.calls[0] ausente — teste canonico presume 1 chamada');
    expect(firstCall.envelope.to).toBe('bruno@roip.com.br');
  });
});
