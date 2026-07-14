// ROIP APP 9BOX — teste de integracao `individualProfileAssessments` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e reusa a fixture
// `superAdmins.id=1` como executor do reteste variante super_admin.
//
// Cobre: INSERT com defaults (`tentativa=1`, `status='em_andamento'`,
// `blocoAtual=1`), padrao polimorfico B (`userType` +`userId`, sem FK
// formal — `userId=99999` NAO gera erro de FK), UNIQUE
// `uq_ipa_tentativa` bloqueando duplicidade, listagens (por titular
// ordenada por tentativa asc; por company/status), setters em cadeia
// (`updateIndividualProfileProgresso` -> `updateIndividualProfileEnvio`
// -> `updateIndividualProfileResultado` -> `updateIndividualProfileReteste`),
// FK RESTRICT em companyId, delete de teardown.
//
// Cleanup:
// - `beforeEach`: apaga `individualProfileAssessments` do escopo.
// - `afterAll`: apaga o escopo + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, individualProfileAssessments } from '../../src/db/schema';
import {
  deleteIndividualProfileAssessmentById,
  getIndividualProfileAssessmentById,
  getIndividualProfileAssessmentByTentativa,
  insertIndividualProfileAssessment,
  listIndividualProfileAssessmentsByCompanyStatus,
  listIndividualProfileAssessmentsByUser,
  type NewIndividualProfileAssessment,
  updateIndividualProfileEnvio,
  updateIndividualProfileProgresso,
  updateIndividualProfileResultado,
  updateIndividualProfileReteste,
} from '../../src/server/services/individualProfileAssessments';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000127';
const SUPER_ADMIN_FIXTURE_ID = 1;

// userId polimorfico (padrao B) — nao ha FK formal, valor puramente
// logico. Uso ids fixos disjuntos dos empregados criados em outros
// arquivos.
const USER_EMPLOYEE_ID = 900101;
const USER_CLEVEL_ID = 900102;

function buildValidAssessment(
  companyId: number,
  overrides: Partial<NewIndividualProfileAssessment> = {},
): NewIndividualProfileAssessment {
  return {
    companyId,
    userType: 'employee',
    userId: USER_EMPLOYEE_ID,
    ...overrides,
  };
}

describe('service individualProfileAssessments (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa IPA Test LTDA',
        nomeFantasia: 'Empresa IPA Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330027',
        endereco: 'Rua IPA, 27',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@ipa.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@ipa.local',
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
    await client.db
      .delete(individualProfileAssessments)
      .where(eq(individualProfileAssessments.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(individualProfileAssessments)
      .where(eq(individualProfileAssessments.companyId, companyId));
  });

  it('insere tentativa com defaults canonicos', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    expect(id).toBeGreaterThan(0);

    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row?.tentativa).toBe(1);
    expect(row?.status).toBe('em_andamento');
    expect(row?.blocoAtual).toBe(1);
    expect(row?.enviadoEm).toBeNull();
  });

  it('padrao B: aceita userId sem FK formal para os dois userType', async () => {
    const idEmp = await insertIndividualProfileAssessment(
      client.db,
      buildValidAssessment(companyId),
    );
    const idCle = await insertIndividualProfileAssessment(
      client.db,
      buildValidAssessment(companyId, { userType: 'clevel', userId: USER_CLEVEL_ID }),
    );
    const rowEmp = await getIndividualProfileAssessmentById(client.db, idEmp);
    const rowCle = await getIndividualProfileAssessmentById(client.db, idCle);
    expect(rowEmp?.userType).toBe('employee');
    expect(rowCle?.userType).toBe('clevel');
  });

  it('UNIQUE uq_ipa_tentativa bloqueia duplicidade da mesma tentativa', async () => {
    await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    await expect(
      insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId)),
    ).rejects.toThrow();
  });

  it('permite nova tentativa incrementando tentativa', async () => {
    const id1 = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    const id2 = await insertIndividualProfileAssessment(
      client.db,
      buildValidAssessment(companyId, { tentativa: 2 }),
    );
    expect(id2).not.toBe(id1);

    const row2 = await getIndividualProfileAssessmentByTentativa(
      client.db,
      companyId,
      'employee',
      USER_EMPLOYEE_ID,
      2,
    );
    expect(row2?.tentativa).toBe(2);
  });

  it('listIndividualProfileAssessmentsByUser ordena por tentativa asc', async () => {
    await insertIndividualProfileAssessment(
      client.db,
      buildValidAssessment(companyId, { tentativa: 3 }),
    );
    await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    await insertIndividualProfileAssessment(
      client.db,
      buildValidAssessment(companyId, { tentativa: 2 }),
    );
    const rows = await listIndividualProfileAssessmentsByUser(
      client.db,
      companyId,
      'employee',
      USER_EMPLOYEE_ID,
    );
    expect(rows.map((r) => r.tentativa)).toEqual([1, 2, 3]);
  });

  it('listIndividualProfileAssessmentsByCompanyStatus filtra pelo status', async () => {
    await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    await insertIndividualProfileAssessment(
      client.db,
      buildValidAssessment(companyId, {
        userType: 'clevel',
        userId: USER_CLEVEL_ID,
        status: 'inconsistente',
      }),
    );
    const emAndamento = await listIndividualProfileAssessmentsByCompanyStatus(
      client.db,
      companyId,
      'em_andamento',
    );
    const inconsistentes = await listIndividualProfileAssessmentsByCompanyStatus(
      client.db,
      companyId,
      'inconsistente',
    );
    expect(emAndamento).toHaveLength(1);
    expect(inconsistentes).toHaveLength(1);
    expect(inconsistentes[0]?.userType).toBe('clevel');
  });

  it('updateIndividualProfileProgresso grava bloco atual, completos e respostas', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    const afetadas = await updateIndividualProfileProgresso(client.db, id, {
      blocoAtual: 5,
      blocosCompletos: [1, 2, 3, 4],
      respostas: { ITEM_001: 4, ITEM_002: 3, ITEM_003: 2, ITEM_004: 1 },
    });
    expect(afetadas).toBe(1);

    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row?.blocoAtual).toBe(5);
    expect(row?.blocosCompletos).toEqual([1, 2, 3, 4]);
    expect(row?.respostas).toMatchObject({ ITEM_001: 4 });
  });

  it('updateIndividualProfileEnvio marca status=enviado e enviadoEm', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    const afetadas = await updateIndividualProfileEnvio(
      client.db,
      id,
      new Date('2026-05-10T15:00:00Z'),
    );
    expect(afetadas).toBe(1);

    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row?.status).toBe('enviado');
    expect(row?.enviadoEm).not.toBeNull();
  });

  it('updateIndividualProfileResultado grava confiabilidade e status derivado', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    await updateIndividualProfileEnvio(client.db, id, new Date('2026-05-10T15:00:00Z'));

    const afetadas = await updateIndividualProfileResultado(client.db, id, {
      status: 'enviado',
      confiabilidadeNivel: 'alta',
      ia_att: '10.50',
      ia_soc: '12.00',
      ia_acq: '9.75',
      ia_cons: '11.20',
      ia_ext: '8.90',
      calculadoEm: new Date('2026-05-10T15:05:00Z'),
    });
    expect(afetadas).toBe(1);

    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row?.confiabilidadeNivel).toBe('alta');
    expect(row?.ia_att).toBe('10.50');
    expect(row?.ia_soc).toBe('12.00');
    expect(row?.ia_acq).toBe('9.75');
    expect(row?.ia_cons).toBe('11.20');
    expect(row?.ia_ext).toBe('8.90');
    expect(row?.calculadoEm).not.toBeNull();
  });

  it('updateIndividualProfileResultado com status=inconsistente (Camada 1 parou)', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    await updateIndividualProfileEnvio(client.db, id, new Date('2026-05-11T09:00:00Z'));
    await updateIndividualProfileResultado(client.db, id, {
      status: 'inconsistente',
      confiabilidadeNivel: 'baixa',
      ia_att: '2.00',
      ia_soc: '3.00',
      ia_acq: '1.50',
      ia_cons: '2.50',
      ia_ext: '1.90',
      calculadoEm: new Date('2026-05-11T09:05:00Z'),
    });
    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row?.status).toBe('inconsistente');
    expect(row?.confiabilidadeNivel).toBe('baixa');
  });

  it('updateIndividualProfileReteste registra liberacao variante super_admin', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    const afetadas = await updateIndividualProfileReteste(client.db, id, {
      retesteLiberadoPor: SUPER_ADMIN_FIXTURE_ID,
      retesteLiberadoTipo: 'super_admin',
      retesteLiberadoEm: new Date('2026-05-12T10:00:00Z'),
    });
    expect(afetadas).toBe(1);

    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row?.retesteLiberadoTipo).toBe('super_admin');
    expect(row?.retesteLiberadoPor).toBe(SUPER_ADMIN_FIXTURE_ID);
    expect(row?.retesteLiberadoEm).not.toBeNull();
  });

  it('FK RESTRICT reprova companyId invalido', async () => {
    await expect(
      insertIndividualProfileAssessment(client.db, buildValidAssessment(99999)),
    ).rejects.toThrow();
  });

  it('deleteIndividualProfileAssessmentById remove pelo id (teardown)', async () => {
    const id = await insertIndividualProfileAssessment(client.db, buildValidAssessment(companyId));
    const afetadas = await deleteIndividualProfileAssessmentById(client.db, id);
    expect(afetadas).toBe(1);

    const row = await getIndividualProfileAssessmentById(client.db, id);
    expect(row).toBeUndefined();
  });
});
