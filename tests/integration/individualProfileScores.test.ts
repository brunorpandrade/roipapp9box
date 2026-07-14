// ROIP APP 9BOX — teste de integracao `individualProfileScores` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e usa o proprio service ME-015
// `insertIndividualProfileAssessment` para materializar as tentativas
// pai (dogfood RV-13; precedente `performanceVariableData` em ME-013 e
// `performanceMultiplierLog` em ME-014).
//
// Cobre: INSERT com vetor de 24 dimensoes preenchido, defaults JSON
// nulos, lookups por id, por chave logica UNIQUE e por assessmentId;
// listagem por titular ordenada por tentativa asc; imutabilidade do
// cache (§16.2) via guarda `IS NULL` nos setters
// `setIndividualProfileResumoCache` e `setIndividualProfileExpandidoCache`
// (segunda tentativa retorna 0 e preserva o conteudo original); UNIQUE
// `uq_ips_tentativa` bloqueando duplicidade; FKs RESTRICT em
// `companyId` e `assessmentId`; delete de teardown.
//
// Cleanup:
// - `beforeEach`: apaga `individualProfileScores` do escopo (mantem as
//   tentativas pai — o teardown final pega tudo).
// - `afterAll`: apaga scores + tentativas pai + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  individualProfileAssessments,
  individualProfileScores,
} from '../../src/db/schema';
import * as ipaService from '../../src/server/services/individualProfileAssessments';
import {
  deleteIndividualProfileScoreById,
  getIndividualProfileScoreByAssessment,
  getIndividualProfileScoreById,
  getIndividualProfileScoreByTentativa,
  insertIndividualProfileScore,
  listIndividualProfileScoresByUser,
  setIndividualProfileExpandidoCache,
  setIndividualProfileResumoCache,
  type NewIndividualProfileScore,
} from '../../src/server/services/individualProfileScores';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000128';
const USER_EMPLOYEE_ID = 900201;

function buildValidScore(
  companyId: number,
  assessmentId: number,
  overrides: Partial<NewIndividualProfileScore> = {},
): NewIndividualProfileScore {
  return {
    companyId,
    userType: 'employee',
    userId: USER_EMPLOYEE_ID,
    assessmentId,
    tentativa: 1,
    post_assert: '65.00',
    post_tarefas: '70.00',
    post_pessoas: '55.00',
    post_pressao: '60.00',
    est_abert: '72.00',
    est_disc: '68.00',
    est_ext: '58.00',
    est_amab: '80.00',
    est_estab: '75.00',
    mot_maestria: '62.00',
    mot_lideranca: '70.00',
    mot_autonomia: '66.00',
    mot_seguranca: '55.00',
    mot_proposito: '78.00',
    equ_autocons: '60.00',
    equ_autogest: '62.00',
    equ_leitura: '58.00',
    equ_influencia: '64.00',
    equ_indice: '61.00',
    ass_sabed: '70.00',
    ass_coragem: '68.00',
    ass_humanid: '82.00',
    ass_justica: '76.00',
    ass_temper: '65.00',
    ass_transc: '58.00',
    perfilComportamental: 'mobilizacao_engajamento',
    vetorDominante: 'lideranca_engajadora',
    vetorSustentacao: 'suporte_relacional',
    vetorNegligenciado: 'analise_metodica',
    top3Assinatura: ['humanidade', 'justica', 'sabedoria'],
    flags: {
      flagRiscoBurnout: false,
      flagAssertividadeAlta: true,
      flagIsolamento: false,
      flagRigidez: false,
      flagInstabilidade: false,
      flagPropositoDifuso: false,
    },
    ...overrides,
  };
}

describe('service individualProfileScores (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let assessment1Id: number;
  let assessment2Id: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa IPS Test LTDA',
        nomeFantasia: 'Empresa IPS Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330028',
        endereco: 'Rua IPS, 28',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@ips.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@ips.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Dogfood RV-13: tentativa pai via service da propria ME-015.
    assessment1Id = await ipaService.insertIndividualProfileAssessment(client.db, {
      companyId,
      userType: 'employee',
      userId: USER_EMPLOYEE_ID,
      tentativa: 1,
      status: 'enviado',
    });
    assessment2Id = await ipaService.insertIndividualProfileAssessment(client.db, {
      companyId,
      userType: 'employee',
      userId: USER_EMPLOYEE_ID,
      tentativa: 2,
      status: 'enviado',
    });
  });

  afterAll(async () => {
    await client.db
      .delete(individualProfileScores)
      .where(eq(individualProfileScores.companyId, companyId));
    await client.db
      .delete(individualProfileAssessments)
      .where(eq(individualProfileAssessments.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(individualProfileScores)
      .where(eq(individualProfileScores.companyId, companyId));
  });

  it('insere score com vetor de 24 dimensoes e retorna id positivo', async () => {
    const id = await insertIndividualProfileScore(
      client.db,
      buildValidScore(companyId, assessment1Id),
    );
    expect(id).toBeGreaterThan(0);

    const row = await getIndividualProfileScoreById(client.db, id);
    expect(row?.post_assert).toBe('65.00');
    expect(row?.equ_indice).toBe('61.00');
    expect(row?.ass_transc).toBe('58.00');
    expect(row?.perfilComportamental).toBe('mobilizacao_engajamento');
    expect(row?.resumoJson).toBeNull();
    expect(row?.expandidoJson).toBeNull();
  });

  it('getIndividualProfileScoreByAssessment localiza pela FK', async () => {
    const id = await insertIndividualProfileScore(
      client.db,
      buildValidScore(companyId, assessment1Id),
    );
    const row = await getIndividualProfileScoreByAssessment(client.db, assessment1Id);
    expect(row?.id).toBe(id);
  });

  it('getIndividualProfileScoreByTentativa localiza pela chave logica UNIQUE', async () => {
    await insertIndividualProfileScore(client.db, buildValidScore(companyId, assessment1Id));
    const row = await getIndividualProfileScoreByTentativa(
      client.db,
      companyId,
      'employee',
      USER_EMPLOYEE_ID,
      1,
    );
    expect(row?.assessmentId).toBe(assessment1Id);
  });

  it('listIndividualProfileScoresByUser ordena por tentativa asc', async () => {
    await insertIndividualProfileScore(
      client.db,
      buildValidScore(companyId, assessment2Id, { tentativa: 2 }),
    );
    await insertIndividualProfileScore(client.db, buildValidScore(companyId, assessment1Id));
    const rows = await listIndividualProfileScoresByUser(
      client.db,
      companyId,
      'employee',
      USER_EMPLOYEE_ID,
    );
    expect(rows.map((r) => r.tentativa)).toEqual([1, 2]);
  });

  it('UNIQUE uq_ips_tentativa bloqueia score duplicado da mesma tentativa', async () => {
    await insertIndividualProfileScore(client.db, buildValidScore(companyId, assessment1Id));
    await expect(
      insertIndividualProfileScore(client.db, buildValidScore(companyId, assessment1Id)),
    ).rejects.toThrow();
  });

  it('setIndividualProfileResumoCache grava na primeira; segunda tentativa retorna 0', async () => {
    const id = await insertIndividualProfileScore(
      client.db,
      buildValidScore(companyId, assessment1Id),
    );
    const primeira = await setIndividualProfileResumoCache(
      client.db,
      id,
      { resumo: 'texto canonico gerado uma unica vez' },
      new Date('2026-06-01T10:00:00Z'),
    );
    expect(primeira).toBe(1);

    const rowApos = await getIndividualProfileScoreById(client.db, id);
    expect(rowApos?.resumoJson).toMatchObject({ resumo: 'texto canonico gerado uma unica vez' });

    // Segunda tentativa: guarda IS NULL bloqueia; conteudo preservado.
    const segunda = await setIndividualProfileResumoCache(
      client.db,
      id,
      { resumo: 'tentativa de sobrescrita' },
      new Date('2026-06-02T10:00:00Z'),
    );
    expect(segunda).toBe(0);

    const rowFinal = await getIndividualProfileScoreById(client.db, id);
    expect(rowFinal?.resumoJson).toMatchObject({ resumo: 'texto canonico gerado uma unica vez' });
  });

  it('setIndividualProfileExpandidoCache imutavel (mesma logica sobre expandidoJson)', async () => {
    const id = await insertIndividualProfileScore(
      client.db,
      buildValidScore(companyId, assessment1Id),
    );
    const primeira = await setIndividualProfileExpandidoCache(
      client.db,
      id,
      { expandido: 'relatorio longo' },
      new Date('2026-06-05T10:00:00Z'),
    );
    expect(primeira).toBe(1);

    const segunda = await setIndividualProfileExpandidoCache(
      client.db,
      id,
      { expandido: 'sobrescrita indevida' },
      new Date('2026-06-06T10:00:00Z'),
    );
    expect(segunda).toBe(0);

    const row = await getIndividualProfileScoreById(client.db, id);
    expect(row?.expandidoJson).toMatchObject({ expandido: 'relatorio longo' });
  });

  it('FK RESTRICT reprova assessmentId invalido', async () => {
    await expect(
      insertIndividualProfileScore(client.db, buildValidScore(companyId, 99999)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT reprova companyId invalido', async () => {
    await expect(
      insertIndividualProfileScore(client.db, buildValidScore(99999, assessment1Id)),
    ).rejects.toThrow();
  });

  it('deleteIndividualProfileScoreById remove pelo id (teardown)', async () => {
    const id = await insertIndividualProfileScore(
      client.db,
      buildValidScore(companyId, assessment1Id),
    );
    const afetadas = await deleteIndividualProfileScoreById(client.db, id);
    expect(afetadas).toBe(1);

    const row = await getIndividualProfileScoreById(client.db, id);
    expect(row).toBeUndefined();
  });
});
