// ROIP APP 9BOX — teste de integracao `employees` (ME-011).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup (ME-010).
// Cria a propria company no beforeAll (CNPJ unico deste arquivo) e faz
// reset apenas das tabelas do escopo pessoas no beforeEach, na ordem
// canonica de FKs. Nao apaga companies nem superAdmins (fixtures do setup
// e da propria company local).

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
  createEmployee,
  deleteEmployeeById,
  getEmployeeById,
  getEmployeeByCpf,
  listEmployeesByCompany,
  setEmployeeIsResponsavelFinanceiro,
  updateEmployeeStatus,
  updateOnboardingEstagio,
  type NewEmployee,
} from '../../src/server/services/employees';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '11111111000101';

function buildValidEmployee(companyId: number, overrides: Partial<NewEmployee> = {}): NewEmployee {
  return {
    companyId,
    name: 'Colab Teste',
    cpf: '11111111111',
    email: 'colab.teste@roip.local',
    dataNascimento: new Date('1990-01-01'),
    dataAdmissao: new Date('2020-01-15'),
    cbo: '141405',
    descricaoCBO: 'Analista de RH',
    jobFamily: 'administrativo_suporte',
    senioridade: 'pleno',
    nivelHierarquico: 'tatico',
    departamento: 'Recursos Humanos',
    ...overrides,
  };
}

describe('service employees (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    // Cria company local com CNPJ unico deste arquivo — isolada de outros
    // arquivos e resistente ao beforeEach de companies.test.ts.
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Employees Test LTDA',
        nomeFantasia: 'Empresa Employees Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330001',
        endereco: 'Rua Employees, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@employees.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@employees.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company local');
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

  // Ordem de delete respeita FKs RESTRICT/CASCADE do escopo pessoas.
  // employees e cLevelMembers ficam por ultimo porque outras tabelas os
  // referenciam. companies nao e apagada (fixture local).
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

  it('createEmployee insere e retorna id numerico', async () => {
    const id = await createEmployee(client.db, buildValidEmployee(companyId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getEmployeeById retorna a linha semeada com defaults canonicos §4.5', async () => {
    const id = await createEmployee(client.db, buildValidEmployee(companyId));
    const row = await getEmployeeById(client.db, id);
    if (!row) throw new Error('getEmployeeById retornou undefined');
    expect(row.id).toBe(id);
    expect(row.cpf).toBe('11111111111');
    expect(row.jobFamily).toBe('administrativo_suporte');
    // Defaults canonicos da §4.5:
    expect(row.status).toBe('ativo');
    expect(row.isRH).toBe(false);
    expect(row.isLider).toBe(false);
    expect(row.isResponsavelFinanceiro).toBe(false);
    expect(row.onboardingEstagio).toBe('treinar');
    expect(row.onboardingUltimoEstagio).toBeNull();
    expect(row.passwordSet).toBe(false);
  });

  it('getEmployeeByCpf resolve pelo par (companyId, cpf)', async () => {
    const id = await createEmployee(
      client.db,
      buildValidEmployee(companyId, { cpf: '22222222222' }),
    );
    const row = await getEmployeeByCpf(client.db, companyId, '22222222222');
    if (!row) throw new Error('getEmployeeByCpf retornou undefined');
    expect(row.id).toBe(id);
  });

  it('getEmployeeByCpf retorna undefined para cpf inexistente na company', async () => {
    const row = await getEmployeeByCpf(client.db, companyId, '99999999999');
    expect(row).toBeUndefined();
  });

  it('listEmployeesByCompany retorna apenas os employees da company em ordem de id', async () => {
    const idA = await createEmployee(
      client.db,
      buildValidEmployee(companyId, { cpf: '33333333333', name: 'A' }),
    );
    const idB = await createEmployee(
      client.db,
      buildValidEmployee(companyId, { cpf: '44444444444', name: 'B' }),
    );
    const rows = await listEmployeesByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idA, idB]);
  });

  it('updateEmployeeStatus altera status de ativo para inativo', async () => {
    const id = await createEmployee(client.db, buildValidEmployee(companyId));
    const affected = await updateEmployeeStatus(client.db, id, 'inativo');
    expect(affected).toBe(1);
    const row = await getEmployeeById(client.db, id);
    if (!row) throw new Error('getEmployeeById retornou undefined apos updateEmployeeStatus');
    expect(row.status).toBe('inativo');
  });

  it('updateOnboardingEstagio troca o estagio para em_treinamento', async () => {
    const id = await createEmployee(client.db, buildValidEmployee(companyId, { isLider: true }));
    const affected = await updateOnboardingEstagio(client.db, id, 'em_treinamento');
    expect(affected).toBe(1);
    const row = await getEmployeeById(client.db, id);
    if (!row) throw new Error('getEmployeeById retornou undefined');
    expect(row.onboardingEstagio).toBe('em_treinamento');
  });

  it('setEmployeeIsResponsavelFinanceiro alterna o flag (sem regra global)', async () => {
    // A ME-011 nao imposta cardinalidade global; o setter e um primitivo
    // isolado (§4.5 — a garantia global fica no Bloco B3).
    const id = await createEmployee(client.db, buildValidEmployee(companyId, { isRH: true }));
    const affected = await setEmployeeIsResponsavelFinanceiro(client.db, id, true);
    expect(affected).toBe(1);
    const row = await getEmployeeById(client.db, id);
    if (!row) throw new Error('getEmployeeById retornou undefined');
    expect(row.isResponsavelFinanceiro).toBe(true);
  });

  it('deleteEmployeeById remove o colaborador quando nao ha dependentes', async () => {
    const id = await createEmployee(client.db, buildValidEmployee(companyId));
    const affected = await deleteEmployeeById(client.db, id);
    expect(affected).toBe(1);
    const row = await getEmployeeById(client.db, id);
    expect(row).toBeUndefined();
  });

  it('uq_employee_cpf (§4.5) rejeita cpf duplicado na mesma empresa', async () => {
    await createEmployee(client.db, buildValidEmployee(companyId, { cpf: '55555555555' }));
    await expect(
      createEmployee(client.db, buildValidEmployee(companyId, { cpf: '55555555555' })),
    ).rejects.toThrow();
  });

  it('FK companyId invalido rejeita insert', async () => {
    const invalidCompanyId = 999999;
    await expect(createEmployee(client.db, buildValidEmployee(invalidCompanyId))).rejects.toThrow();
  });
});
