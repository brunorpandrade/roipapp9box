// ROIP APP 9BOX — teste de integracao `employeeLeaderHistory` (ME-011).
//
// Cria company + employees (liderado + lider) + c-level localmente. Testa
// os primitivos: insert com liderId, insert com clevelId, fechamento de
// vinculo por dataFim, historico ordenado e agrupamento por
// transferBatchId.

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
import { createCLevelMember } from '../../src/server/services/cLevelMembers';
import {
  closeLeaderHistoryEntry,
  getActiveLeaderHistoryByEmployee,
  insertLeaderHistoryEntry,
  listLeaderHistoryByBatch,
  listLeaderHistoryByEmployee,
} from '../../src/server/services/employeeLeaderHistory';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '33333333000103';
const BATCH_A = '11111111-2222-4333-8444-555555555555';
const BATCH_B = '66666666-7777-4888-8999-aaaaaaaaaaaa';

describe('service employeeLeaderHistory (ME-011)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderId: number;
  let liderado1Id: number;
  let liderado2Id: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa LeaderHistory Test LTDA',
        nomeFantasia: 'Empresa LeaderHistory Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330003',
        endereco: 'Rua LH, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@lh.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@lh.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company');
    companyId = companyRow.id;
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

    // Semeia atores locais para cada teste: lider comum, dois liderados e
    // um c-level. Assim cada caso comeca com um ambiente consistente e o
    // teste anterior nao arrasta ids.
    liderId = await createEmployee(client.db, {
      companyId,
      name: 'Lider Local',
      cpf: '20000000001',
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2018-06-01'),
      cbo: '141405',
      descricaoCBO: 'Coordenador',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Operações',
      isLider: true,
    });
    liderado1Id = await createEmployee(client.db, {
      companyId,
      name: 'Liderado 1',
      cpf: '20000000002',
      dataNascimento: new Date('1990-02-02'),
      dataAdmissao: new Date('2020-01-15'),
      cbo: '414110',
      descricaoCBO: 'Auxiliar',
      jobFamily: 'administrativo_suporte',
      senioridade: 'junior',
      nivelHierarquico: 'operacional',
      departamento: 'Operações',
    });
    liderado2Id = await createEmployee(client.db, {
      companyId,
      name: 'Liderado 2',
      cpf: '20000000003',
      dataNascimento: new Date('1990-03-03'),
      dataAdmissao: new Date('2020-01-15'),
      cbo: '414110',
      descricaoCBO: 'Auxiliar',
      jobFamily: 'administrativo_suporte',
      senioridade: 'junior',
      nivelHierarquico: 'operacional',
      departamento: 'Operações',
    });
    clevelId = await createCLevelMember(client.db, {
      companyId,
      name: 'COO Local',
      cpf: '20000000099',
      email: 'coo@lh.local',
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'COO',
      descricaoCargo: 'Chief Operating Officer',
      departamento: 'Diretoria',
      custoMensal: '40000.00',
    });
  });

  it('insertLeaderHistoryEntry com liderId retorna id numerico', async () => {
    const id = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2024-01-01'),
      reason: 'Atribuição inicial no cadastro',
      transferBatchId: BATCH_A,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('insertLeaderHistoryEntry com clevelId retorna id numerico', async () => {
    const id = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      clevelId,
      dataInicio: new Date('2024-01-01'),
      reason: 'Atribuição inicial no cadastro',
      transferBatchId: BATCH_A,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getActiveLeaderHistoryByEmployee(client.db, liderado1Id);
    if (!row) throw new Error('getActiveLeaderHistoryByEmployee retornou undefined');
    expect(row.clevelId).toBe(clevelId);
    expect(row.liderId).toBeNull();
  });

  it('getActiveLeaderHistoryByEmployee retorna o vinculo com dataFim NULL', async () => {
    await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2023-01-01'),
      dataFim: new Date('2023-12-31'),
      reason: 'Transferência de líder por reorganização de área',
      transferBatchId: BATCH_A,
    });
    const idAtivo = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2024-01-01'),
      reason: 'Atribuição inicial no cadastro',
      transferBatchId: BATCH_B,
    });
    const active = await getActiveLeaderHistoryByEmployee(client.db, liderado1Id);
    if (!active) throw new Error('nenhum vinculo ativo retornado');
    expect(active.id).toBe(idAtivo);
    expect(active.dataFim).toBeNull();
  });

  it('getActiveLeaderHistoryByEmployee retorna undefined quando todos estao fechados', async () => {
    await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2023-01-01'),
      dataFim: new Date('2023-12-31'),
      reason: 'Transferência de líder por reorganização de área',
      transferBatchId: BATCH_A,
    });
    const active = await getActiveLeaderHistoryByEmployee(client.db, liderado1Id);
    expect(active).toBeUndefined();
  });

  it('closeLeaderHistoryEntry preenche dataFim e passa a retornar do historico', async () => {
    const id = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2024-01-01'),
      reason: 'Atribuição inicial no cadastro',
      transferBatchId: BATCH_A,
    });
    const affected = await closeLeaderHistoryEntry(client.db, id, new Date('2024-06-30'));
    expect(affected).toBe(1);
    const active = await getActiveLeaderHistoryByEmployee(client.db, liderado1Id);
    expect(active).toBeUndefined();
    const history = await listLeaderHistoryByEmployee(client.db, liderado1Id);
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(id);
    expect(history[0]?.dataFim).not.toBeNull();
  });

  it('listLeaderHistoryByEmployee retorna do mais recente ao mais antigo', async () => {
    const idAntigo = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2022-01-01'),
      dataFim: new Date('2022-12-31'),
      reason: 'Transferência de líder por reorganização de área',
      transferBatchId: BATCH_A,
    });
    const idNovo = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2023-01-01'),
      reason: 'Atribuição inicial no cadastro',
      transferBatchId: BATCH_B,
    });
    const history = await listLeaderHistoryByEmployee(client.db, liderado1Id);
    expect(history.map((r) => r.id)).toEqual([idNovo, idAntigo]);
  });

  it('listLeaderHistoryByBatch agrupa registros do mesmo batch em ordem de id', async () => {
    const id1 = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2024-01-01'),
      reason: 'Transferência atômica: promoção de novo líder',
      transferBatchId: BATCH_A,
    });
    const id2 = await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado2Id,
      liderId,
      dataInicio: new Date('2024-01-01'),
      reason: 'Transferência atômica: promoção de novo líder',
      transferBatchId: BATCH_A,
    });
    // Batch B — nao entra no filtro do BATCH_A.
    await insertLeaderHistoryEntry(client.db, {
      employeeId: liderado1Id,
      liderId,
      dataInicio: new Date('2024-06-01'),
      reason: 'Transferência subsequente por mudança de área',
      transferBatchId: BATCH_B,
    });
    const batchRows = await listLeaderHistoryByBatch(client.db, BATCH_A);
    expect(batchRows.map((r) => r.id)).toEqual([id1, id2]);
  });

  it('FK employeeId invalido rejeita insert', async () => {
    await expect(
      insertLeaderHistoryEntry(client.db, {
        employeeId: 999999,
        liderId,
        dataInicio: new Date('2024-01-01'),
        reason: 'Atribuição inicial no cadastro',
        transferBatchId: BATCH_A,
      }),
    ).rejects.toThrow();
  });
});
