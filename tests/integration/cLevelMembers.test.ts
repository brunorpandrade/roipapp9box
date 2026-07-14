// ROIP APP 9BOX — teste de integracao `cLevelMembers` (ME-011).

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
  createCLevelMember,
  deleteCLevelMemberById,
  getCLevelMemberById,
  getCLevelMemberByCpf,
  listCLevelMembersByCompany,
  setCLevelIsResponsavelFinanceiro,
  updateCLevelStatus,
  type NewCLevelMember,
} from '../../src/server/services/cLevelMembers';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '22222222000102';

function buildValidCLevel(
  companyId: number,
  overrides: Partial<NewCLevelMember> = {},
): NewCLevelMember {
  return {
    companyId,
    name: 'CEO Teste',
    cpf: '10000000001',
    email: 'ceo.teste@roip.local',
    dataNascimento: new Date('1975-05-20'),
    dataAdmissao: new Date('2015-03-01'),
    cargo: 'CEO',
    descricaoCargo: 'Chief Executive Officer',
    departamento: 'Diretoria',
    custoMensal: '35000.00',
    ...overrides,
  };
}

describe('service cLevelMembers (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CLevel Test LTDA',
        nomeFantasia: 'Empresa CLevel Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330002',
        endereco: 'Rua CLevel, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@clevel.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@clevel.local',
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

  it('createCLevelMember insere e retorna id numerico', async () => {
    const id = await createCLevelMember(client.db, buildValidCLevel(companyId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getCLevelMemberById retorna a linha com defaults canonicos §4.4', async () => {
    const id = await createCLevelMember(client.db, buildValidCLevel(companyId));
    const row = await getCLevelMemberById(client.db, id);
    if (!row) throw new Error('getCLevelMemberById retornou undefined');
    expect(row.id).toBe(id);
    expect(row.cpf).toBe('10000000001');
    expect(row.departamento).toBe('Diretoria');
    // Defaults canonicos §4.4:
    expect(row.acessoTotal).toBe(true);
    expect(row.isResponsavelFinanceiro).toBe(false);
    expect(row.status).toBe('ativo');
    expect(row.passwordSet).toBe(false);
  });

  it('getCLevelMemberByCpf resolve pelo par (companyId, cpf)', async () => {
    const id = await createCLevelMember(
      client.db,
      buildValidCLevel(companyId, { cpf: '10000000002' }),
    );
    const row = await getCLevelMemberByCpf(client.db, companyId, '10000000002');
    if (!row) throw new Error('getCLevelMemberByCpf retornou undefined');
    expect(row.id).toBe(id);
  });

  it('getCLevelMemberByCpf retorna undefined para cpf inexistente na company', async () => {
    const row = await getCLevelMemberByCpf(client.db, companyId, '00000000099');
    expect(row).toBeUndefined();
  });

  it('listCLevelMembersByCompany retorna c-levels da company em ordem de id', async () => {
    const idA = await createCLevelMember(
      client.db,
      buildValidCLevel(companyId, { cpf: '10000000003', name: 'A' }),
    );
    const idB = await createCLevelMember(
      client.db,
      buildValidCLevel(companyId, { cpf: '10000000004', name: 'B' }),
    );
    const rows = await listCLevelMembersByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idA, idB]);
  });

  it('updateCLevelStatus altera status de ativo para inativo', async () => {
    const id = await createCLevelMember(client.db, buildValidCLevel(companyId));
    const affected = await updateCLevelStatus(client.db, id, 'inativo');
    expect(affected).toBe(1);
    const row = await getCLevelMemberById(client.db, id);
    if (!row) throw new Error('getCLevelMemberById retornou undefined');
    expect(row.status).toBe('inativo');
  });

  it('setCLevelIsResponsavelFinanceiro alterna o flag isoladamente', async () => {
    const id = await createCLevelMember(client.db, buildValidCLevel(companyId));
    const affected = await setCLevelIsResponsavelFinanceiro(client.db, id, true);
    expect(affected).toBe(1);
    const row = await getCLevelMemberById(client.db, id);
    if (!row) throw new Error('getCLevelMemberById retornou undefined');
    expect(row.isResponsavelFinanceiro).toBe(true);
  });

  it('deleteCLevelMemberById remove quando nao ha dependentes', async () => {
    const id = await createCLevelMember(client.db, buildValidCLevel(companyId));
    const affected = await deleteCLevelMemberById(client.db, id);
    expect(affected).toBe(1);
    const row = await getCLevelMemberById(client.db, id);
    expect(row).toBeUndefined();
  });

  it('uq_clevel_cpf (§4.4) rejeita cpf duplicado na mesma empresa', async () => {
    await createCLevelMember(client.db, buildValidCLevel(companyId, { cpf: '10000000005' }));
    await expect(
      createCLevelMember(client.db, buildValidCLevel(companyId, { cpf: '10000000005' })),
    ).rejects.toThrow();
  });

  it('FK companyId invalido rejeita insert', async () => {
    const invalidCompanyId = 999999;
    await expect(
      createCLevelMember(client.db, buildValidCLevel(invalidCompanyId)),
    ).rejects.toThrow();
  });
});
