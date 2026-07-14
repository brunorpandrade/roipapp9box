// ROIP APP 9BOX — teste de integracao `iqlData` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009), employee lider e cLevelMember
// avaliado. Cobre o §8.8 e o padrao A polimorfico (§2.3): insert nas
// duas variantes (liderId XOR clevelId), lookup por cada UNIQUE parcial,
// listagem por company, setter `updateIqlCalculo` (scores dimensionais
// e agregado, contagens de respondentes), CHECK `chk_iqlData_avaliado_unico`
// bloqueando linhas com ambos ou nenhum preenchido, FK RESTRICT em
// liderId / clevelId / companyId, delete.
//
// Cleanup:
// - `beforeEach`: apaga `iqlData` do escopo.
// - `afterAll`: apaga o escopo + employee + cLevel + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, iqlData } from '../../src/db/schema';
import {
  deleteIqlDataById,
  getIqlDataByClevelQuarter,
  getIqlDataById,
  getIqlDataByLiderQuarter,
  insertIqlData,
  listIqlDataByCompany,
  type NewIqlData,
  updateIqlCalculo,
} from '../../src/server/services/iqlData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000121';

function buildValidIqlLider(
  companyId: number,
  liderId: number,
  overrides: Partial<NewIqlData> = {},
): NewIqlData {
  return {
    companyId,
    liderId,
    trimestre: '2026-Q1',
    countRespondentes: 5,
    countRespondentesElegiveis: 6,
    ...overrides,
  };
}

function buildValidIqlClevel(
  companyId: number,
  clevelId: number,
  overrides: Partial<NewIqlData> = {},
): NewIqlData {
  return {
    companyId,
    clevelId,
    trimestre: '2026-Q1',
    countRespondentes: 4,
    countRespondentesElegiveis: 5,
    ...overrides,
  };
}

describe('service iqlData (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderEmployeeId: number;
  let liderEmployee2Id: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa IQL Test LTDA',
        nomeFantasia: 'Empresa IQL Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330021',
        endereco: 'Rua IQL, 21',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@iql.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@iql.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Lider tipo employee — cria dois para cobrir UNIQUE por par.
    const [emp1] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider IQL 1',
        cpf: '10101010123',
        email: 'lider.iql1@roip.local',
        dataNascimento: new Date('1985-03-10'),
        dataAdmissao: new Date('2016-01-15'),
        cbo: '142105',
        descricaoCBO: 'Gerente Comercial',
        jobFamily: 'lideranca_gestao',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Comercial',
        isLider: true,
      })
      .$returningId();
    if (!emp1) throw new Error('beforeAll: falha ao criar liderEmployee 1');
    liderEmployeeId = emp1.id;

    const [emp2] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider IQL 2',
        cpf: '10101010124',
        email: 'lider.iql2@roip.local',
        dataNascimento: new Date('1980-11-20'),
        dataAdmissao: new Date('2012-08-01'),
        cbo: '142105',
        descricaoCBO: 'Gerente Comercial',
        jobFamily: 'lideranca_gestao',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Operações',
        isLider: true,
      })
      .$returningId();
    if (!emp2) throw new Error('beforeAll: falha ao criar liderEmployee 2');
    liderEmployee2Id = emp2.id;

    // C-level.
    const [cle] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'CFO IQL',
        cpf: '10101010125',
        email: 'cfo.iql@roip.local',
        dataNascimento: new Date('1970-08-20'),
        dataAdmissao: new Date('2010-06-01'),
        cargo: 'CFO',
        descricaoCargo: 'Chief Financial Officer',
        departamento: 'Diretoria',
        custoMensal: '40000.00',
      })
      .$returningId();
    if (!cle) throw new Error('beforeAll: falha ao criar cLevelMember');
    clevelId = cle.id;
  });

  afterAll(async () => {
    await client.db.delete(iqlData);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(iqlData);
  });

  it('insertIqlData com liderId cobre a variante employee (Padrao A)', async () => {
    const id = await insertIqlData(client.db, buildValidIqlLider(companyId, liderEmployeeId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getIqlDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.liderId).toBe(liderEmployeeId);
    expect(row.clevelId).toBeNull();
    expect(row.countRespondentes).toBe(5);
    expect(row.countRespondentesElegiveis).toBe(6);
    // Scores e iql nascem NULL.
    expect(row.iql).toBeNull();
    expect(row.scoreDirecionamentoClareza).toBeNull();
  });

  it('insertIqlData com clevelId cobre a variante C-level (Padrao A)', async () => {
    const id = await insertIqlData(client.db, buildValidIqlClevel(companyId, clevelId));
    const row = await getIqlDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.clevelId).toBe(clevelId);
    expect(row.liderId).toBeNull();
    expect(row.countRespondentes).toBe(4);
  });

  it('getIqlDataByLiderQuarter resolve pelo UNIQUE parcial uq_iqlData_lider', async () => {
    const id = await insertIqlData(
      client.db,
      buildValidIqlLider(companyId, liderEmployeeId, { trimestre: '2026-Q2' }),
    );
    const row = await getIqlDataByLiderQuarter(client.db, companyId, liderEmployeeId, '2026-Q2');
    if (!row) throw new Error('linha nao encontrada pelo trio lider');
    expect(row.id).toBe(id);
    const miss = await getIqlDataByLiderQuarter(client.db, companyId, liderEmployeeId, '2099-Q4');
    expect(miss).toBeUndefined();
  });

  it('getIqlDataByClevelQuarter resolve pelo UNIQUE parcial uq_iqlData_clevel', async () => {
    const id = await insertIqlData(
      client.db,
      buildValidIqlClevel(companyId, clevelId, { trimestre: '2026-Q3' }),
    );
    const row = await getIqlDataByClevelQuarter(client.db, companyId, clevelId, '2026-Q3');
    if (!row) throw new Error('linha nao encontrada pelo trio clevel');
    expect(row.id).toBe(id);
  });

  it('listIqlDataByCompany traz linhas de lider e C-level ordenadas por trimestre', async () => {
    const idQ1L = await insertIqlData(
      client.db,
      buildValidIqlLider(companyId, liderEmployeeId, { trimestre: '2026-Q1' }),
    );
    const idQ1C = await insertIqlData(
      client.db,
      buildValidIqlClevel(companyId, clevelId, { trimestre: '2026-Q1' }),
    );
    const idQ2L2 = await insertIqlData(
      client.db,
      buildValidIqlLider(companyId, liderEmployee2Id, { trimestre: '2026-Q2' }),
    );
    const rows = await listIqlDataByCompany(client.db, companyId);
    expect(rows.length).toBe(3);
    // Ordem por trimestre asc, id asc.
    expect(rows.map((r) => r.id)).toEqual([idQ1L, idQ1C, idQ2L2]);
  });

  it('updateIqlCalculo grava subscores dimensionais e agregado', async () => {
    const id = await insertIqlData(client.db, buildValidIqlLider(companyId, liderEmployeeId));
    const calculadoEm = new Date('2026-04-15T12:00:00Z');
    const affected = await updateIqlCalculo(client.db, id, {
      scoreDirecionamentoClareza: '82.50',
      scoreDesenvolvimentoApoio: '75.00',
      scoreRelacionamentoConfianca: '88.00',
      scoreGestaoResultados: '80.00',
      iql: '81.38',
      countRespondentes: 6,
      countRespondentesElegiveis: 6,
      calculadoEm,
    });
    expect(affected).toBe(1);
    const row = await getIqlDataById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.scoreDirecionamentoClareza).toBe('82.50');
    expect(row.scoreDesenvolvimentoApoio).toBe('75.00');
    expect(row.scoreRelacionamentoConfianca).toBe('88.00');
    expect(row.scoreGestaoResultados).toBe('80.00');
    expect(row.iql).toBe('81.38');
    expect(row.countRespondentes).toBe(6);
    expect(row.countRespondentesElegiveis).toBe(6);
  });

  it('updateIqlCalculo aceita scores null (piso de respondentes nao atingido)', async () => {
    const id = await insertIqlData(client.db, buildValidIqlLider(companyId, liderEmployeeId));
    const affected = await updateIqlCalculo(client.db, id, {
      scoreDirecionamentoClareza: null,
      scoreDesenvolvimentoApoio: null,
      scoreRelacionamentoConfianca: null,
      scoreGestaoResultados: null,
      iql: null,
      countRespondentes: 2,
      countRespondentesElegiveis: 6,
      calculadoEm: new Date('2026-04-15T12:00:00Z'),
    });
    expect(affected).toBe(1);
    const row = await getIqlDataById(client.db, id);
    expect(row?.iql).toBeNull();
    expect(row?.countRespondentes).toBe(2);
  });

  it('CHECK chk_iqlData_avaliado_unico bloqueia linha com liderId e clevelId juntos', async () => {
    await expect(
      insertIqlData(client.db, {
        companyId,
        liderId: liderEmployeeId,
        clevelId,
        trimestre: '2026-Q4',
        countRespondentes: 3,
        countRespondentesElegiveis: 5,
      }),
    ).rejects.toThrow();
  });

  it('CHECK chk_iqlData_avaliado_unico bloqueia linha com ambos nulos', async () => {
    await expect(
      insertIqlData(client.db, {
        companyId,
        trimestre: '2026-Q4',
        countRespondentes: 3,
        countRespondentesElegiveis: 5,
      }),
    ).rejects.toThrow();
  });

  it('uq_iqlData_lider impede duplicidade (companyId, liderId, trimestre)', async () => {
    await insertIqlData(client.db, buildValidIqlLider(companyId, liderEmployeeId));
    await expect(
      insertIqlData(client.db, buildValidIqlLider(companyId, liderEmployeeId)),
    ).rejects.toThrow();
  });

  it('uq_iqlData_clevel impede duplicidade (companyId, clevelId, trimestre)', async () => {
    await insertIqlData(client.db, buildValidIqlClevel(companyId, clevelId));
    await expect(
      insertIqlData(client.db, buildValidIqlClevel(companyId, clevelId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em liderId impede insert com employee inexistente', async () => {
    await expect(insertIqlData(client.db, buildValidIqlLider(companyId, 99999))).rejects.toThrow();
  });

  it('FK RESTRICT em clevelId impede insert com cLevelMember inexistente', async () => {
    await expect(insertIqlData(client.db, buildValidIqlClevel(companyId, 99999))).rejects.toThrow();
  });

  it('deleteIqlDataById remove e retorna 1', async () => {
    const id = await insertIqlData(client.db, buildValidIqlLider(companyId, liderEmployeeId));
    const affected = await deleteIqlDataById(client.db, id);
    expect(affected).toBe(1);
    const row = await getIqlDataById(client.db, id);
    expect(row).toBeUndefined();
  });
});
