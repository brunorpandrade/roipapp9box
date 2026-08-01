// ROIP APP 9BOX — teste integracao `resetStuckEmailQueue` (ME-060 §11.3).
// Cobre devolucao canonica de linhas presas em `processando` por >10 min
// ao estado `pendente`.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, emailQueue } from '../../src/db/schema';
import { resetStuckEmailQueue } from '../../src/server/jobs/resetStuckEmailQueueJob';

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
    })
    .$returningId();
  if (!row) throw new Error('empresa insert falhou');
  return row.id;
}

describe('resetStuckEmailQueue — §11.3', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresa(client, '10210000000002');
  });

  afterAll(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, empresaId));
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('devolve linha processando >10min a pendente', async () => {
    const now = new Date('2026-01-05T12:00:00Z');
    // Insere linha em processando com updatedAt de 15 min atras.
    const [inserted] = await client.db
      .insert(emailQueue)
      .values({
        companyId: empresaId,
        destinatarioTipo: 'rh',
        destinatarioEmail: 'preso@empresa.com',
        destinatarioEmployeeId: null,
        tipoEnvio: 'imediato',
        alertIds: [1, 2],
        scheduledFor: new Date('2026-01-05T11:00:00Z'),
        status: 'processando',
        retries: 0,
      })
      .$returningId();
    if (!inserted) throw new Error('insert falhou');
    const stuckId = inserted.id;

    // Force updatedAt para 15 min antes do now via update direto.
    await client.db
      .update(emailQueue)
      .set({ updatedAt: new Date('2026-01-05T11:45:00Z') })
      .where(eq(emailQueue.id, stuckId));

    const affected = await resetStuckEmailQueue(client.db, now);
    expect(affected).toBeGreaterThanOrEqual(1);

    const rows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, stuckId));
    const row = rows[0];
    if (row === undefined) throw new Error('row missing');
    expect(row.status).toBe('pendente');
  });

  it('nao devolve linha processando <10min (dentro da tolerancia)', async () => {
    const now = new Date('2026-01-05T14:00:00Z');
    const [inserted] = await client.db
      .insert(emailQueue)
      .values({
        companyId: empresaId,
        destinatarioTipo: 'rh',
        destinatarioEmail: 'recente@empresa.com',
        destinatarioEmployeeId: null,
        tipoEnvio: 'imediato',
        alertIds: [3],
        scheduledFor: new Date('2026-01-05T13:00:00Z'),
        status: 'processando',
        retries: 0,
      })
      .$returningId();
    if (!inserted) throw new Error('insert falhou');
    const recentId = inserted.id;

    // updatedAt = 5 min antes.
    await client.db
      .update(emailQueue)
      .set({ updatedAt: new Date('2026-01-05T13:55:00Z') })
      .where(eq(emailQueue.id, recentId));

    await resetStuckEmailQueue(client.db, now);

    const rows = await client.db.select().from(emailQueue).where(eq(emailQueue.id, recentId));
    const row = rows[0];
    if (row === undefined) throw new Error('row missing');
    expect(row.status).toBe('processando'); // preservado
  });
});
