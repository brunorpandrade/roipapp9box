/* eslint-disable @stylistic/max-len -- describe/it com contexto S/§/canonizacoes tornam labels longas por design */
// ROIP APP 9BOX — teste integracao dispatcher expandido para templates
// 2 e L (§12.9 + §12.3 + §12.8) — ME-063a.
//
// Cobre:
// - `enqueueTransactional` com `templateId='2'` e `'L'` grava marker
//   canonico bit-exact.
// - Worker `runEmailQueueJob` processa marker de templates 2 e L, renderiza
//   e envia via stub (end-to-end contra MySQL real).
// - Payload JSON round-trip: JSON.stringify → JSON.parse preserva
//   estrutura canonica (inclusive `listaInstrumentos` do Template L).

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, emailQueue } from '../../src/db/schema';
import {
  TRANSACTIONAL_MARKER_HEAD,
  type SmtpEnvelope,
  type SmtpSendResult,
  type Template2Payload,
  type TemplateLPayload,
} from '../../src/lib/email';
import { enqueueTransactional } from '../../src/server/services/emailDispatcher';
import { runEmailQueueJob } from '../../src/server/jobs/emailQueueJob';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

interface StubCall {
  readonly envelope: SmtpEnvelope;
}

function makeStubSendEmail(): {
  readonly sendEmail: (envelope: SmtpEnvelope) => Promise<SmtpSendResult>;
  readonly calls: readonly StubCall[];
} {
  const calls: StubCall[] = [];
  const sendEmail = async (envelope: SmtpEnvelope): Promise<SmtpSendResult> => {
    calls.push({ envelope });
    return { smtpMessageId: `<stub-${calls.length}@test.local>` };
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

describe('enqueueTransactional — templateId="2" grava marker canonico §12.9', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10300000000001');
  });

  afterEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('grava marker canonico bit-exact ["__transactional__", "2", payloadJson]', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const payload: Template2Payload = {
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH (rh@empresa.com)',
      identificador: '123.456.789-00',
    };
    const id = await enqueueTransactional(client.db, {
      companyId: empresaId,
      destinatarioEmail: 'ana@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now,
      templateId: '2',
      payload,
    });

    const [row] = await client.db
      .select({
        alertIds: emailQueue.alertIds,
        tipoEnvio: emailQueue.tipoEnvio,
        status: emailQueue.status,
        scheduledFor: emailQueue.scheduledFor,
      })
      .from(emailQueue)
      .where(eq(emailQueue.id, id))
      .limit(1);
    expect(row).toBeDefined();
    const alertIds = row?.alertIds as readonly [string, string, string];
    expect(alertIds[0]).toBe(TRANSACTIONAL_MARKER_HEAD);
    expect(alertIds[1]).toBe('2');
    const parsed = JSON.parse(alertIds[2]) as Template2Payload;
    expect(parsed).toEqual(payload);
    expect(row?.tipoEnvio).toBe('imediato');
    expect(row?.status).toBe('pendente');
  });
});

describe('enqueueTransactional — templateId="L" grava marker canonico §12.9', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10300000000002');
  });

  afterEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('grava marker canonico bit-exact ["__transactional__", "L", payloadJson] com listaInstrumentos', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const payload: TemplateLPayload = {
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [
        { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
        { tipo: 'B_NR1', status: 'Atrasado', prazoDdMmYyyy: '25/03/2026' },
        { tipo: 'PerfilIndividual', status: 'Pendente' },
      ],
    };
    const id = await enqueueTransactional(client.db, {
      companyId: empresaId,
      destinatarioEmail: 'carla@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now,
      templateId: 'L',
      payload,
    });

    const [row] = await client.db
      .select({ alertIds: emailQueue.alertIds })
      .from(emailQueue)
      .where(eq(emailQueue.id, id))
      .limit(1);
    const alertIds = row?.alertIds as readonly [string, string, string];
    expect(alertIds[0]).toBe(TRANSACTIONAL_MARKER_HEAD);
    expect(alertIds[1]).toBe('L');
    const parsed = JSON.parse(alertIds[2]) as TemplateLPayload;
    expect(parsed).toEqual(payload);
    expect(parsed.listaInstrumentos).toHaveLength(3);
  });

  it('payload com listaInstrumentos vazia preserva estrutura canonica no round-trip JSON', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const payload: TemplateLPayload = {
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    };
    const id = await enqueueTransactional(client.db, {
      companyId: empresaId,
      destinatarioEmail: 'carla@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now,
      templateId: 'L',
      payload,
    });
    const [row] = await client.db
      .select({ alertIds: emailQueue.alertIds })
      .from(emailQueue)
      .where(eq(emailQueue.id, id))
      .limit(1);
    const alertIds = row?.alertIds as readonly [string, string, string];
    const parsed = JSON.parse(alertIds[2]) as TemplateLPayload;
    expect(parsed.listaInstrumentos).toEqual([]);
  });
});

describe('runEmailQueueJob — processa Template 2 end-to-end (renderiza + envia via stub)', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10300000000003');
  });

  afterEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('worker processa marker Template 2 e chama stub SMTP com assunto canonico §12.3', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const payload: Template2Payload = {
      nomeDoUsuario: 'Ana',
      baseUrl: 'https://app.roip.com.br',
      jwtToken: 'aaa.bbb.ccc',
      contatoAdmin: 'RH (rh@empresa.com)',
      identificador: '123.456.789-00',
    };
    await enqueueTransactional(client.db, {
      companyId: empresaId,
      destinatarioEmail: 'ana@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now: new Date(now.getTime() - 30_000),
      templateId: '2',
      payload,
    });

    const stub = makeStubSendEmail();
    const result = await runEmailQueueJob(client.db, now, { sendEmail: stub.sendEmail });
    expect(result.candidatosLidos).toBe(1);
    expect(result.outcomes.enviado).toBe(1);
    expect(stub.calls).toHaveLength(1);

    const firstCall = stub.calls[0];
    if (!firstCall) throw new Error('stub.calls[0] ausente — teste canonico presume 1 chamada');
    const envelope = firstCall.envelope;
    expect(envelope.to).toBe('ana@empresa.com');
    expect(envelope.subject).toBe('[ROIP APP] Bem-vindo(a) — defina sua senha');
    expect(envelope.text).toContain('Olá, Ana!');
    expect(envelope.text).toContain('https://app.roip.com.br/first-access?token=aaa.bbb.ccc');
    expect(envelope.text).toContain('123.456.789-00');
    expect(envelope.html).toContain(
      'href="https://app.roip.com.br/first-access?token=aaa.bbb.ccc"',
    );
  });
});

describe('runEmailQueueJob — processa Template L end-to-end (renderiza + envia via stub)', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10300000000004');
  });

  afterEach(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('worker processa marker Template L e chama stub SMTP com assunto canonico §12.8', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const payload: TemplateLPayload = {
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [
        { tipo: 'A', status: 'Pendente', prazoDdMmYyyy: '10/04/2026' },
        { tipo: 'B_NR1', status: 'Atrasado', prazoDdMmYyyy: '25/03/2026' },
        { tipo: 'PerfilIndividual', status: 'Pendente' },
      ],
    };
    await enqueueTransactional(client.db, {
      companyId: empresaId,
      destinatarioEmail: 'carla@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now: new Date(now.getTime() - 30_000),
      templateId: 'L',
      payload,
    });

    const stub = makeStubSendEmail();
    const result = await runEmailQueueJob(client.db, now, { sendEmail: stub.sendEmail });
    expect(result.candidatosLidos).toBe(1);
    expect(result.outcomes.enviado).toBe(1);
    expect(stub.calls).toHaveLength(1);

    const firstCall = stub.calls[0];
    if (!firstCall) throw new Error('stub.calls[0] ausente — teste canonico presume 1 chamada');
    const envelope = firstCall.envelope;
    expect(envelope.to).toBe('carla@empresa.com');
    expect(envelope.subject).toBe('Você tem instrumentos pendentes no portal ROIP APP');
    expect(envelope.text).toContain('Olá, Carla,');
    expect(envelope.text).toContain('• Autoavaliação — Pendente · Prazo original: 10/04/2026');
    expect(envelope.text).toContain('• Radar NR-1 — Atrasado · Prazo original: 25/03/2026');
    expect(envelope.text).toContain('• Meu perfil — Pendente');
    expect(envelope.html).toContain('href="https://app.roip.com.br/colaborador"');
    expect(envelope.html).toContain(
      '<li>Autoavaliação — Pendente · Prazo original: 10/04/2026</li>',
    );
  });

  it('template L com lista vazia: assunto canonico ainda é enviado', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const payload: TemplateLPayload = {
      primeiroNome: 'Carla',
      baseUrl: 'https://app.roip.com.br',
      listaInstrumentos: [],
    };
    await enqueueTransactional(client.db, {
      companyId: empresaId,
      destinatarioEmail: 'carla@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now: new Date(now.getTime() - 30_000),
      templateId: 'L',
      payload,
    });
    const stub = makeStubSendEmail();
    const result = await runEmailQueueJob(client.db, now, { sendEmail: stub.sendEmail });
    expect(result.candidatosLidos).toBe(1);
    expect(result.outcomes.enviado).toBe(1);
    const firstCall = stub.calls[0];
    if (!firstCall) throw new Error('stub.calls[0] ausente — teste canonico presume 1 chamada');
    expect(firstCall.envelope.subject).toBe('Você tem instrumentos pendentes no portal ROIP APP');
  });
});
