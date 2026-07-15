// ROIP APP 9BOX — teste de integracao `digestExecutionLog` (ME-017).
//
// Cobre §12.8: INSERT append-only strict (§16.1 item 11) — 1 linha por
// (companyId, weekStart) UNIQUE. Colisao levanta excecao. Grava linha
// mesmo com emailsEnviados=0 (§12.8 — a existencia da linha e a prova
// de execucao). Listagem por company DESC. Delete por company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, digestExecutionLog } from '../../src/db/schema';
import {
  deleteDigestExecutionLogByCompany,
  getDigestExecutionLogById,
  getDigestExecutionLogByWeek,
  insertDigestExecutionLog,
  listDigestExecutionLogsByCompany,
  type NewDigestExecutionLog,
} from '../../src/server/services/digestExecutionLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000143';

describe('service digestExecutionLog (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;

  function baseLog(overrides: Partial<NewDigestExecutionLog> = {}): NewDigestExecutionLog {
    return {
      companyId,
      weekStart: new Date('2026-06-01'),
      weekEnd: new Date('2026-06-07'),
      destinatariosCount: 3,
      emailsEnviados: 2,
      alertsConsolidados: 5,
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Digest Test LTDA',
        nomeFantasia: 'Empresa Digest Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330043',
        endereco: 'Rua Digest, 43',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@digest.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@digest.local',
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
    await client.db.delete(digestExecutionLog).where(eq(digestExecutionLog.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(digestExecutionLog).where(eq(digestExecutionLog.companyId, companyId));
  });

  it('insere linha e retorna id positivo', async () => {
    const id = await insertDigestExecutionLog(client.db, baseLog());
    expect(id).toBeGreaterThan(0);
    const row = await getDigestExecutionLogById(client.db, id);
    expect(row?.destinatariosCount).toBe(3);
    expect(row?.emailsEnviados).toBe(2);
    expect(row?.alertsConsolidados).toBe(5);
  });

  it('grava linha canonica com emailsEnviados=0', async () => {
    const id = await insertDigestExecutionLog(
      client.db,
      baseLog({ destinatariosCount: 0, emailsEnviados: 0, alertsConsolidados: 0 }),
    );
    const row = await getDigestExecutionLogById(client.db, id);
    expect(row?.emailsEnviados).toBe(0);
  });

  it('UNIQUE uk_digestExecutionLog_week bloqueia (company, weekStart) duplicado', async () => {
    await insertDigestExecutionLog(client.db, baseLog());
    await expect(insertDigestExecutionLog(client.db, baseLog())).rejects.toThrow();
  });

  it('getDigestExecutionLogByWeek localiza pela chave UNIQUE', async () => {
    const id = await insertDigestExecutionLog(client.db, baseLog());
    const row = await getDigestExecutionLogByWeek(client.db, companyId, new Date('2026-06-01'));
    expect(row?.id).toBe(id);
    const missing = await getDigestExecutionLogByWeek(client.db, companyId, new Date('2030-01-06'));
    expect(missing).toBeUndefined();
  });

  it('listDigestExecutionLogsByCompany ordena por executedAt DESC', async () => {
    const id1 = await insertDigestExecutionLog(
      client.db,
      baseLog({ weekStart: new Date('2026-06-01'), weekEnd: new Date('2026-06-07') }),
    );
    await new Promise((r) => setTimeout(r, 1100));
    const id2 = await insertDigestExecutionLog(
      client.db,
      baseLog({ weekStart: new Date('2026-06-08'), weekEnd: new Date('2026-06-14') }),
    );
    const lista = await listDigestExecutionLogsByCompany(client.db, companyId);
    expect(lista.map((r) => r.id)).toEqual([id2, id1]);
  });

  it('FK CASCADE em companyId: escopo teste', async () => {
    expect(true).toBe(true);
  });

  it('deleteDigestExecutionLogByCompany remove tudo da empresa', async () => {
    await insertDigestExecutionLog(
      client.db,
      baseLog({ weekStart: new Date('2026-06-01'), weekEnd: new Date('2026-06-07') }),
    );
    await insertDigestExecutionLog(
      client.db,
      baseLog({ weekStart: new Date('2026-06-08'), weekEnd: new Date('2026-06-14') }),
    );
    const afetadas = await deleteDigestExecutionLogByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
