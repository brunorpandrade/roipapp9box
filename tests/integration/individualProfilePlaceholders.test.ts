// ROIP APP 9BOX — teste de integracao `individualProfilePlaceholders` (ME-011).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  individualProfilePlaceholders,
  leaderOnboardingNotes,
  leaderOnboardingStageLog,
  cLevelMembers,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import {
  getPlaceholderByUser,
  insertPlaceholder,
  listPlaceholdersByCompany,
  updatePlaceholderStatus,
} from '../../src/server/services/individualProfilePlaceholders';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '55555555000105';

describe('service individualProfilePlaceholders (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Placeholders Test LTDA',
        nomeFantasia: 'Empresa Placeholders Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330005',
        endereco: 'Rua Placeholders, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@placeholders.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@placeholders.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company');
    companyId = row.id;
  });

  afterAll(async () => {
    // Cleanup completo do escopo pessoas + delete da company local para
    // deixar `roip_test` no mesmo estado do inicio (fixtures do
    // globalSetup). Impede que este arquivo arraste employees / cLevels
    // remanescentes para arquivos que rodem depois (companyJobFamilies e
    // companies fazem delete de companies sem WHERE).
    await client.db.delete(leaderOnboardingStageLog);
    await client.db.delete(leaderOnboardingNotes);
    await client.db.delete(employeeTerminationEvents);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(leaderOnboardingStageLog);
    await client.db.delete(leaderOnboardingNotes);
    await client.db.delete(employeeTerminationEvents);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employeeGoals);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
  });

  it('insertPlaceholder cria placeholder com status pendente por default', async () => {
    const id = await insertPlaceholder(client.db, {
      companyId,
      userType: 'employee',
      userId: 42,
    });
    expect(typeof id).toBe('number');
    const row = await getPlaceholderByUser(client.db, companyId, 'employee', 42);
    if (!row) throw new Error('getPlaceholderByUser retornou undefined');
    expect(row.id).toBe(id);
    expect(row.status).toBe('pendente');
    expect(row.respondidoEm).toBeNull();
  });

  it('getPlaceholderByUser diferencia userType employee vs clevel', async () => {
    const idEmployee = await insertPlaceholder(client.db, {
      companyId,
      userType: 'employee',
      userId: 7,
    });
    const idClevel = await insertPlaceholder(client.db, {
      companyId,
      userType: 'clevel',
      userId: 7,
    });
    const emp = await getPlaceholderByUser(client.db, companyId, 'employee', 7);
    const cl = await getPlaceholderByUser(client.db, companyId, 'clevel', 7);
    if (!emp || !cl) throw new Error('placeholder nao encontrado');
    expect(emp.id).toBe(idEmployee);
    expect(cl.id).toBe(idClevel);
    expect(emp.id).not.toBe(cl.id);
  });

  it('getPlaceholderByUser retorna undefined quando nao existe', async () => {
    const row = await getPlaceholderByUser(client.db, companyId, 'employee', 999);
    expect(row).toBeUndefined();
  });

  it('listPlaceholdersByCompany retorna todos da empresa em ordem crescente de id', async () => {
    const idA = await insertPlaceholder(client.db, {
      companyId,
      userType: 'employee',
      userId: 1,
    });
    const idB = await insertPlaceholder(client.db, {
      companyId,
      userType: 'employee',
      userId: 2,
    });
    const idC = await insertPlaceholder(client.db, {
      companyId,
      userType: 'clevel',
      userId: 3,
    });
    const rows = await listPlaceholdersByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idA, idB, idC]);
  });

  it('updatePlaceholderStatus para respondido preenche respondidoEm', async () => {
    const id = await insertPlaceholder(client.db, {
      companyId,
      userType: 'employee',
      userId: 10,
    });
    const respondidoEm = new Date('2026-05-15T12:00:00Z');
    const affected = await updatePlaceholderStatus(client.db, id, 'respondido', respondidoEm);
    expect(affected).toBe(1);
    const row = await getPlaceholderByUser(client.db, companyId, 'employee', 10);
    if (!row) throw new Error('getPlaceholderByUser retornou undefined');
    expect(row.status).toBe('respondido');
    expect(row.respondidoEm).not.toBeNull();
  });

  it('updatePlaceholderStatus para inconsistente sem respondidoEm mantem campo null', async () => {
    const id = await insertPlaceholder(client.db, {
      companyId,
      userType: 'employee',
      userId: 11,
    });
    const affected = await updatePlaceholderStatus(client.db, id, 'inconsistente');
    expect(affected).toBe(1);
    const row = await getPlaceholderByUser(client.db, companyId, 'employee', 11);
    if (!row) throw new Error('getPlaceholderByUser retornou undefined');
    expect(row.status).toBe('inconsistente');
    expect(row.respondidoEm).toBeNull();
  });

  it('FK companyId invalido rejeita insert', async () => {
    await expect(
      insertPlaceholder(client.db, {
        companyId: 999999,
        userType: 'employee',
        userId: 1,
      }),
    ).rejects.toThrow();
  });
});
