// ROIP APP 9BOX — teste de integracao `employeeTerminationEvents` (ME-011).

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
  insertTerminationEvent,
  listTerminationsByCompany,
  listTerminationsByEmployee,
} from '../../src/server/services/employeeTerminationEvents';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '77777777000107';

describe('service employeeTerminationEvents (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeAId: number;
  let employeeBId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Termination Test LTDA',
        nomeFantasia: 'Empresa Termination Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330007',
        endereco: 'Rua Term, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@term.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@term.local',
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

    employeeAId = await createEmployee(client.db, {
      companyId,
      name: 'Colab A',
      cpf: '40000000001',
      dataNascimento: new Date('1988-01-01'),
      dataAdmissao: new Date('2019-01-01'),
      cbo: '414110',
      descricaoCBO: 'Auxiliar',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Administrativo',
    });
    employeeBId = await createEmployee(client.db, {
      companyId,
      name: 'Colab B',
      cpf: '40000000002',
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2021-01-01'),
      cbo: '414110',
      descricaoCBO: 'Auxiliar',
      jobFamily: 'administrativo_suporte',
      senioridade: 'junior',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });
  });

  it('insertTerminationEvent grava e retorna id numerico', async () => {
    const id = await insertTerminationEvent(client.db, {
      employeeId: employeeAId,
      companyId,
      dataInativacao: new Date('2026-06-15T10:00:00Z'),
      motivo: 'voluntario',
      nivelHierarquicoSnapshot: 'tatico',
      departamentoSnapshot: 'Administrativo',
      actorTipo: 'employee',
      actorId: employeeAId,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('listTerminationsByCompany ordena por dataInativacao decrescente', async () => {
    const idAntigo = await insertTerminationEvent(client.db, {
      employeeId: employeeAId,
      companyId,
      dataInativacao: new Date('2025-01-10T09:00:00Z'),
      motivo: 'involuntario',
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: 'Comercial',
      actorTipo: 'superAdmin',
      actorId: 1,
    });
    const idRecente = await insertTerminationEvent(client.db, {
      employeeId: employeeBId,
      companyId,
      dataInativacao: new Date('2026-05-20T09:00:00Z'),
      motivo: 'voluntario',
      nivelHierarquicoSnapshot: 'tatico',
      departamentoSnapshot: 'Administrativo',
      actorTipo: 'employee',
      actorId: employeeBId,
    });
    const rows = await listTerminationsByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idRecente, idAntigo]);
  });

  it('listTerminationsByEmployee suporta reativacao e nova saida (§13.1)', async () => {
    // Primeira inativacao.
    const idPrimeira = await insertTerminationEvent(client.db, {
      employeeId: employeeAId,
      companyId,
      dataInativacao: new Date('2024-03-01T09:00:00Z'),
      motivo: 'voluntario',
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: 'Comercial',
      actorTipo: 'employee',
      actorId: employeeAId,
    });
    // Reativacao ocorre no fluxo de negocio (updateEmployeeStatus =
    // 'ativo'); aqui apenas nova inativacao subsequente.
    const idSegunda = await insertTerminationEvent(client.db, {
      employeeId: employeeAId,
      companyId,
      dataInativacao: new Date('2026-02-15T09:00:00Z'),
      motivo: 'involuntario',
      nivelHierarquicoSnapshot: 'tatico',
      departamentoSnapshot: 'Administrativo',
      actorTipo: 'superAdmin',
      actorId: 1,
    });
    const rows = await listTerminationsByEmployee(client.db, employeeAId);
    // Ordem crescente por dataInativacao — a primeira aparece antes.
    expect(rows.map((r) => r.id)).toEqual([idPrimeira, idSegunda]);
    expect(rows.map((r) => r.motivo)).toEqual(['voluntario', 'involuntario']);
  });

  it('snapshots congelam nivel e departamento (independem de mudancas futuras)', async () => {
    // Insere com snapshot "operacional/Comercial".
    const id = await insertTerminationEvent(client.db, {
      employeeId: employeeAId,
      companyId,
      dataInativacao: new Date('2026-01-01T09:00:00Z'),
      motivo: 'voluntario',
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: 'Comercial',
      actorTipo: 'employee',
      actorId: employeeAId,
    });
    const rows = await listTerminationsByEmployee(client.db, employeeAId);
    const target = rows.find((r) => r.id === id);
    if (!target) throw new Error('registro nao encontrado');
    expect(target.nivelHierarquicoSnapshot).toBe('operacional');
    expect(target.departamentoSnapshot).toBe('Comercial');
  });

  it('FK employeeId invalido rejeita insert', async () => {
    await expect(
      insertTerminationEvent(client.db, {
        employeeId: 999999,
        companyId,
        dataInativacao: new Date('2026-06-15T10:00:00Z'),
        motivo: 'voluntario',
        nivelHierarquicoSnapshot: 'operacional',
        departamentoSnapshot: 'Comercial',
        actorTipo: 'employee',
        actorId: 1,
      }),
    ).rejects.toThrow();
  });
});
