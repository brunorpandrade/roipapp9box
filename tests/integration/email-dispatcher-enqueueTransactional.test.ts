// ROIP APP 9BOX — teste integracao `enqueueTransactional` (ME-060 §12.9).
// Cobre gravacao canonica do marker `['__transactional__', templateId,
// payloadJson]` em emailQueue + companyId nullable (CC052 Super Admin).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, emailQueue } from '../../src/db/schema';
import { TRANSACTIONAL_MARKER_HEAD } from '../../src/lib/email';
import {
  enqueueTransactional,
  type EnqueueTransactionalInput,
} from '../../src/server/services/emailDispatcher';

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
      endereco: 'Rua ME060',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `contato-${cnpj}@me060.local`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@me060.local`,
      segmento: 'Serviço',
      tipoAtividade: 'x',
      descricaoAtividade: 'x',
      contextoMercado: 'x',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar empresa ${cnpj}`);
  return row.id;
}

describe('enqueueTransactional — §12.9 marker canonico', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10210000000001');
  });

  afterAll(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('Template 1 (rh) grava marker canonico com companyId', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const input: EnqueueTransactionalInput = {
      companyId: empresaId,
      destinatarioEmail: 'rh@empresa.com',
      destinatarioTipo: 'rh',
      destinatarioEmployeeId: null,
      now,
      templateId: '1',
      payload: {
        nomeDoUsuario: 'Alice',
        baseUrl: 'https://app.roip.com.br',
        jwtToken: 'abc.def.ghi',
      },
    };
    const id = await enqueueTransactional(client.db, input);
    const rows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, id));
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) throw new Error('row undefined');
    expect(row.companyId).toBe(empresaId);
    expect(row.tipoEnvio).toBe('imediato');
    expect(row.status).toBe('pendente');
    expect(Array.isArray(row.alertIds)).toBe(true);
    const marker = row.alertIds as unknown as [string, string, string];
    expect(marker[0]).toBe(TRANSACTIONAL_MARKER_HEAD);
    expect(marker[1]).toBe('1');
    const parsedPayload = JSON.parse(marker[2]) as { nomeDoUsuario: string };
    expect(parsedPayload.nomeDoUsuario).toBe('Alice');
  });

  it('Template 3 (bruno) grava companyId=null (CC052 Super Admin)', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const id = await enqueueTransactional(client.db, {
      companyId: null,
      destinatarioEmail: 'bruno@roip.com',
      destinatarioTipo: 'bruno',
      destinatarioEmployeeId: null,
      now,
      templateId: '3',
      payload: {
        nomeDoBruno: 'Bruno',
        baseUrl: 'https://app.roip.com.br',
        jwtToken: 't3.token',
      },
    });
    const rows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, id));
    const row = rows[0];
    if (row === undefined) throw new Error('row undefined');
    expect(row.companyId).toBeNull();
    expect(row.destinatarioTipo).toBe('bruno');
    const marker = row.alertIds as unknown as [string, string, string];
    expect(marker[1]).toBe('3');
  });

  it('Template 4 (bruno) preserva payload dataHora + novoEmail', async () => {
    const now = new Date('2026-01-05T11:00:00Z');
    const id = await enqueueTransactional(client.db, {
      companyId: null,
      destinatarioEmail: 'antigo@roip.com',
      destinatarioTipo: 'bruno',
      destinatarioEmployeeId: null,
      now,
      templateId: '4',
      payload: {
        nomeDoBruno: 'Bruno',
        dataHora: '31/07/2026 às 14:30',
        novoEmail: 'novo@roip.com',
      },
    });
    const rows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, id));
    const row = rows[0];
    if (row === undefined) throw new Error('row undefined');
    const marker = row.alertIds as unknown as [string, string, string];
    const parsed = JSON.parse(marker[2]) as { dataHora: string; novoEmail: string };
    expect(parsed.dataHora).toBe('31/07/2026 às 14:30');
    expect(parsed.novoEmail).toBe('novo@roip.com');
  });
});
