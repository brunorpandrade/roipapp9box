// ROIP APP 9BOX — teste de integracao `responsavelFinanceiroTransferLog` (ME-011).
//
// FK actorSuperAdminId depende do superAdmin (id=1) semeado pelo
// globalSetup (setup.ts da ME-010) — reutilizado.

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
  getLatestTransferLogByCompany,
  insertTransferLogEntry,
  listTransferLogByCompany,
} from '../../src/server/services/responsavelFinanceiroTransferLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '66666666000106';
const SUPER_ADMIN_ID = 1;

describe('service responsavelFinanceiroTransferLog (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa RFTransferLog Test LTDA',
        nomeFantasia: 'Empresa RFTransferLog Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330006',
        endereco: 'Rua RF, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@rf.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@rf.local',
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

  it('insertTransferLogEntry cria evento inicial de atribuicao', async () => {
    const id = await insertTransferLogEntry(client.db, {
      companyId,
      previousHolderType: 'none',
      newHolderType: 'employee',
      newHolderId: 100,
      actorSuperAdminId: SUPER_ADMIN_ID,
      eventType: 'atribuido',
      reason: 'Primeira atribuição do responsável financeiro no cadastro da empresa',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('listTransferLogByCompany retorna eventos em ordem cronologica crescente', async () => {
    const id1 = await insertTransferLogEntry(client.db, {
      companyId,
      previousHolderType: 'none',
      newHolderType: 'employee',
      newHolderId: 100,
      actorSuperAdminId: SUPER_ADMIN_ID,
      eventType: 'atribuido',
      reason: 'Primeira atribuição do responsável financeiro no cadastro da empresa',
    });
    const id2 = await insertTransferLogEntry(client.db, {
      companyId,
      previousHolderType: 'employee',
      previousHolderId: 100,
      newHolderType: 'cLevel',
      newHolderId: 200,
      actorSuperAdminId: SUPER_ADMIN_ID,
      eventType: 'transferido',
      reason: 'Transferência para o CFO por reorganização da governança financeira',
    });
    const id3 = await insertTransferLogEntry(client.db, {
      companyId,
      previousHolderType: 'cLevel',
      previousHolderId: 200,
      newHolderType: 'none',
      actorSuperAdminId: SUPER_ADMIN_ID,
      eventType: 'removido',
      reason: 'Remoção temporária durante transição de governança financeira',
    });
    const rows = await listTransferLogByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([id1, id2, id3]);
    expect(rows.map((r) => r.eventType)).toEqual(['atribuido', 'transferido', 'removido']);
  });

  it('getLatestTransferLogByCompany retorna o evento mais recente', async () => {
    await insertTransferLogEntry(client.db, {
      companyId,
      previousHolderType: 'none',
      newHolderType: 'employee',
      newHolderId: 100,
      actorSuperAdminId: SUPER_ADMIN_ID,
      eventType: 'atribuido',
      reason: 'Primeira atribuição do responsável financeiro no cadastro da empresa',
    });
    const idLatest = await insertTransferLogEntry(client.db, {
      companyId,
      previousHolderType: 'employee',
      previousHolderId: 100,
      newHolderType: 'cLevel',
      newHolderId: 200,
      actorSuperAdminId: SUPER_ADMIN_ID,
      eventType: 'transferido',
      reason: 'Transferência para o CFO por reorganização da governança financeira',
    });
    const latest = await getLatestTransferLogByCompany(client.db, companyId);
    if (!latest) throw new Error('getLatestTransferLogByCompany retornou undefined');
    expect(latest.id).toBe(idLatest);
    expect(latest.eventType).toBe('transferido');
  });

  it('getLatestTransferLogByCompany retorna undefined para empresa sem eventos', async () => {
    const latest = await getLatestTransferLogByCompany(client.db, companyId);
    expect(latest).toBeUndefined();
  });

  it('FK actorSuperAdminId invalido rejeita insert', async () => {
    await expect(
      insertTransferLogEntry(client.db, {
        companyId,
        previousHolderType: 'none',
        newHolderType: 'employee',
        newHolderId: 100,
        actorSuperAdminId: 999999,
        eventType: 'atribuido',
        reason: 'Primeira atribuição do responsável financeiro no cadastro da empresa',
      }),
    ).rejects.toThrow();
  });

  it('FK companyId invalido rejeita insert', async () => {
    await expect(
      insertTransferLogEntry(client.db, {
        companyId: 999999,
        previousHolderType: 'none',
        newHolderType: 'employee',
        newHolderId: 100,
        actorSuperAdminId: SUPER_ADMIN_ID,
        eventType: 'atribuido',
        reason: 'Primeira atribuição do responsável financeiro no cadastro da empresa',
      }),
    ).rejects.toThrow();
  });
});
