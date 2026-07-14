// ROIP APP 9BOX — teste de integracao `leaderOnboardingNotes` (ME-011).

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
  insertOnboardingNote,
  listOnboardingNotesByEmployee,
} from '../../src/server/services/leaderOnboardingNotes';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '88888888000108';

describe('service leaderOnboardingNotes (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa OnbNotes Test LTDA',
        nomeFantasia: 'Empresa OnbNotes Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330008',
        endereco: 'Rua Notes, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@notes.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@notes.local',
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
      name: 'Lider Onboarding',
      cpf: '50000000001',
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cbo: '141405',
      descricaoCBO: 'Coordenador',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Produção',
      isLider: true,
    });
  });

  it('insertOnboardingNote grava e retorna id numerico', async () => {
    const id = await insertOnboardingNote(client.db, {
      companyId,
      employeeId: liderId,
      autorTipo: 'super_admin',
      autorId: 1,
      texto: 'Início do onboarding: foco em rituais de gestão da rotina',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('listOnboardingNotesByEmployee ordena do mais recente ao mais antigo', async () => {
    const id1 = await insertOnboardingNote(client.db, {
      companyId,
      employeeId: liderId,
      autorTipo: 'super_admin',
      autorId: 1,
      texto: 'Anotação 1 (mais antiga)',
    });
    // Pequena espera para dar diferenca de createdAt entre inserts.
    await new Promise((r) => setTimeout(r, 1100));
    const id2 = await insertOnboardingNote(client.db, {
      companyId,
      employeeId: liderId,
      autorTipo: 'super_admin',
      autorId: 1,
      texto: 'Anotação 2 (mais recente)',
    });
    const rows = await listOnboardingNotesByEmployee(client.db, liderId);
    expect(rows.map((r) => r.id)).toEqual([id2, id1]);
  });

  it('FK employeeId invalido rejeita insert', async () => {
    await expect(
      insertOnboardingNote(client.db, {
        companyId,
        employeeId: 999999,
        autorTipo: 'super_admin',
        autorId: 1,
        texto: 'Nota qualquer',
      }),
    ).rejects.toThrow();
  });

  it('ON DELETE CASCADE (§14.3) — deletar o employee apaga as notas', async () => {
    const noteId = await insertOnboardingNote(client.db, {
      companyId,
      employeeId: liderId,
      autorTipo: 'rh',
      autorId: 1,
      texto: 'Nota que sera cascateada',
    });
    // Verificar que existe.
    const before = await listOnboardingNotesByEmployee(client.db, liderId);
    expect(before.some((r) => r.id === noteId)).toBe(true);
    // Deletar o employee — o cascade sobre leaderOnboardingNotes remove a
    // nota. Chamamos delete direto para ficar isolado do service employees.
    await client.db.delete(employees);
    const after = await listOnboardingNotesByEmployee(client.db, liderId);
    expect(after).toHaveLength(0);
  });
});
