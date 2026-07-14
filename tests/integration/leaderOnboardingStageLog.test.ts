// ROIP APP 9BOX — teste de integracao `leaderOnboardingStageLog` (ME-011).

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
import { createEmployee } from '../../src/server/services/employees';
import {
  getLatestStageLogByEmployee,
  insertStageLogEntry,
  listStageLogByEmployee,
} from '../../src/server/services/leaderOnboardingStageLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '99999999000109';

describe('service leaderOnboardingStageLog (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa StageLog Test LTDA',
        nomeFantasia: 'Empresa StageLog Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330009',
        endereco: 'Rua StageLog, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@stagelog.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@stagelog.local',
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

    liderId = await createEmployee(client.db, {
      companyId,
      name: 'Lider StageLog',
      cpf: '60000000001',
      dataNascimento: new Date('1985-06-01'),
      dataAdmissao: new Date('2018-06-01'),
      cbo: '141405',
      descricaoCBO: 'Coordenador',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Logística',
      isLider: true,
    });
  });

  it('insertStageLogEntry grava primeira mudanca com estagioAnterior NULL', async () => {
    const id = await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: null,
      estagioNovo: 'treinar',
      autorTipo: 'super_admin',
      autorId: 1,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const rows = await listStageLogByEmployee(client.db, liderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.estagioAnterior).toBeNull();
    expect(rows[0]?.estagioNovo).toBe('treinar');
  });

  it('listStageLogByEmployee ordena do mais antigo ao mais recente', async () => {
    const id1 = await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: null,
      estagioNovo: 'treinar',
      autorTipo: 'super_admin',
      autorId: 1,
    });
    await new Promise((r) => setTimeout(r, 1100));
    const id2 = await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: 'treinar',
      estagioNovo: 'em_treinamento',
      autorTipo: 'rh',
      autorId: 1,
    });
    await new Promise((r) => setTimeout(r, 1100));
    const id3 = await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: 'em_treinamento',
      estagioNovo: 'treinado',
      autorTipo: 'rh',
      autorId: 1,
    });
    const rows = await listStageLogByEmployee(client.db, liderId);
    expect(rows.map((r) => r.id)).toEqual([id1, id2, id3]);
    expect(rows.map((r) => r.estagioNovo)).toEqual(['treinar', 'em_treinamento', 'treinado']);
  });

  it('getLatestStageLogByEmployee retorna a mudanca mais recente', async () => {
    await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: null,
      estagioNovo: 'treinar',
      autorTipo: 'super_admin',
      autorId: 1,
    });
    await new Promise((r) => setTimeout(r, 1100));
    const idLatest = await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: 'treinar',
      estagioNovo: 'reciclagem',
      autorTipo: 'super_admin',
      autorId: 1,
    });
    const latest = await getLatestStageLogByEmployee(client.db, liderId);
    if (!latest) throw new Error('getLatestStageLogByEmployee retornou undefined');
    expect(latest.id).toBe(idLatest);
    expect(latest.estagioNovo).toBe('reciclagem');
  });

  it('getLatestStageLogByEmployee retorna undefined quando nao ha historico', async () => {
    const latest = await getLatestStageLogByEmployee(client.db, liderId);
    expect(latest).toBeUndefined();
  });

  it('FK employeeId invalido rejeita insert', async () => {
    await expect(
      insertStageLogEntry(client.db, {
        companyId,
        employeeId: 999999,
        estagioAnterior: null,
        estagioNovo: 'treinar',
        autorTipo: 'super_admin',
        autorId: 1,
      }),
    ).rejects.toThrow();
  });

  it('ON DELETE CASCADE (§14.4) — deletar o employee apaga o log', async () => {
    await insertStageLogEntry(client.db, {
      companyId,
      employeeId: liderId,
      estagioAnterior: null,
      estagioNovo: 'treinar',
      autorTipo: 'super_admin',
      autorId: 1,
    });
    const before = await listStageLogByEmployee(client.db, liderId);
    expect(before).toHaveLength(1);
    await client.db.delete(employees);
    const after = await listStageLogByEmployee(client.db, liderId);
    expect(after).toHaveLength(0);
  });
});
