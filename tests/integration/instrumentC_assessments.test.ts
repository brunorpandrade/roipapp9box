// ROIP APP 9BOX — teste de integracao `instrumentC_assessments` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009), employee avaliado, employee
// lider (avaliador variante employee) e cLevelMember (avaliador
// variante C-level).
//
// Cobre: INSERT nas duas variantes do padrao A no avaliador (liderId
// XOR clevelId), CHECK `chk_iC_avaliador_unico` bloqueando linha com
// ambos ou nenhum preenchido, lookup pela chave logica UNIQUE,
// listagens por (employee, trimestre) e por (company, trimestre)
// ordenadas, colisao da UNIQUE `uq_iC_unica_avaliacao`, FK RESTRICT em
// liderId, e a unica mutacao autorizada (§16.2):
// `overwriteInstrumentCAssessmentValor` (existente -> 1; ausente -> 0).
//
// Cleanup:
// - `beforeEach`: apaga `instrumentC_assessments` do escopo.
// - `afterAll`: apaga o escopo + employees + cLevel + company (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, instrumentC_assessments } from '../../src/db/schema';
import {
  getInstrumentCAssessmentById,
  getInstrumentCAssessmentByKey,
  insertInstrumentCAssessment,
  listInstrumentCAssessmentsByCompanyQuarter,
  listInstrumentCAssessmentsByEmployeeQuarter,
  type NewInstrumentCAssessment,
  overwriteInstrumentCAssessmentValor,
} from '../../src/server/services/instrumentC_assessments';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000123';

function buildValidAssessment(
  companyId: number,
  employeeId: number,
  liderId: number,
  overrides: Partial<NewInstrumentCAssessment> = {},
): NewInstrumentCAssessment {
  return {
    companyId,
    employeeId,
    liderId,
    trimestre: '2026-Q1',
    dimensao: 1,
    itemIndex: 1,
    valor: 2,
    ...overrides,
  };
}

describe('service instrumentC_assessments (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let avaliadoId: number;
  let liderEmployeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa InstrumentC Test LTDA',
        nomeFantasia: 'Empresa InstrumentC Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330023',
        endereco: 'Rua InstrumentC, 23',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@instrumentc.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@instrumentc.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [avaliado] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Avaliado IC',
        cpf: '10101010128',
        email: 'avaliado.ic@roip.local',
        dataNascimento: new Date('1994-01-08'),
        dataAdmissao: new Date('2021-03-01'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!avaliado) throw new Error('beforeAll: falha ao criar employee avaliado');
    avaliadoId = avaliado.id;

    const [lider] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider IC',
        cpf: '10101010129',
        email: 'lider.ic@roip.local',
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
    if (!lider) throw new Error('beforeAll: falha ao criar employee lider');
    liderEmployeeId = lider.id;

    const [cle] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level IC',
        cpf: '10101010130',
        email: 'clevel.ic@roip.local',
        dataNascimento: new Date('1972-11-02'),
        dataAdmissao: new Date('2012-04-01'),
        cargo: 'COO',
        descricaoCargo: 'Chief Operating Officer',
        departamento: 'Diretoria',
        custoMensal: '35000.00',
      })
      .$returningId();
    if (!cle) throw new Error('beforeAll: falha ao criar cLevelMember');
    clevelId = cle.id;
  });

  afterAll(async () => {
    await client.db
      .delete(instrumentC_assessments)
      .where(eq(instrumentC_assessments.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(instrumentC_assessments)
      .where(eq(instrumentC_assessments.companyId, companyId));
  });

  it('insere avaliacao com avaliador employee (liderId) e retorna id', async () => {
    const id = await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId),
    );
    expect(id).toBeGreaterThan(0);

    const row = await getInstrumentCAssessmentById(client.db, id);
    expect(row?.liderId).toBe(liderEmployeeId);
    expect(row?.clevelId).toBeNull();
    expect(row?.respondidoEm).not.toBeNull();
  });

  it('insere avaliacao com avaliador C-level (clevelId)', async () => {
    const id = await insertInstrumentCAssessment(client.db, {
      companyId,
      employeeId: avaliadoId,
      clevelId,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 2,
      valor: 4,
    });
    const row = await getInstrumentCAssessmentById(client.db, id);
    expect(row?.clevelId).toBe(clevelId);
    expect(row?.liderId).toBeNull();
  });

  it('CHECK chk_iC_avaliador_unico bloqueia liderId e clevelId juntos', async () => {
    await expect(
      insertInstrumentCAssessment(
        client.db,
        buildValidAssessment(companyId, avaliadoId, liderEmployeeId, { clevelId }),
      ),
    ).rejects.toThrow();
  });

  it('CHECK chk_iC_avaliador_unico bloqueia linha sem avaliador', async () => {
    await expect(
      insertInstrumentCAssessment(client.db, {
        companyId,
        employeeId: avaliadoId,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 3,
        valor: 2,
      }),
    ).rejects.toThrow();
  });

  it('getInstrumentCAssessmentByKey localiza pela chave logica UNIQUE', async () => {
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId, { dimensao: 3, itemIndex: 2 }),
    );
    const row = await getInstrumentCAssessmentByKey(client.db, avaliadoId, '2026-Q1', 3, 2);
    expect(row).toBeDefined();
    expect(row?.valor).toBe(2);
  });

  it('listInstrumentCAssessmentsByEmployeeQuarter ordena por dimensao/item', async () => {
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId, { dimensao: 2, itemIndex: 5 }),
    );
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId, { dimensao: 1, itemIndex: 4 }),
    );
    const rows = await listInstrumentCAssessmentsByEmployeeQuarter(
      client.db,
      avaliadoId,
      '2026-Q1',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.dimensao).toBe(1);
    expect(rows[1]?.dimensao).toBe(2);
  });

  it('listInstrumentCAssessmentsByCompanyQuarter retorna o escopo do trimestre', async () => {
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId),
    );
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId, {
        trimestre: '2026-Q2',
        itemIndex: 1,
      }),
    );
    const rows = await listInstrumentCAssessmentsByCompanyQuarter(client.db, companyId, '2026-Q1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trimestre).toBe('2026-Q1');
  });

  it('UNIQUE uq_iC_unica_avaliacao bloqueia item duplicado do avaliado', async () => {
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId),
    );
    await expect(
      insertInstrumentCAssessment(client.db, {
        companyId,
        employeeId: avaliadoId,
        clevelId,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 0,
      }),
    ).rejects.toThrow();
  });

  it('overwriteInstrumentCAssessmentValor grava por cima na janela (§16.2)', async () => {
    await insertInstrumentCAssessment(
      client.db,
      buildValidAssessment(companyId, avaliadoId, liderEmployeeId, { valor: 1 }),
    );
    const afetadas = await overwriteInstrumentCAssessmentValor(
      client.db,
      avaliadoId,
      '2026-Q1',
      1,
      1,
      3,
      new Date('2026-02-11T09:00:00Z'),
    );
    expect(afetadas).toBe(1);

    const row = await getInstrumentCAssessmentByKey(client.db, avaliadoId, '2026-Q1', 1, 1);
    expect(row?.valor).toBe(3);
  });

  it('overwriteInstrumentCAssessmentValor de chave inexistente retorna 0', async () => {
    const afetadas = await overwriteInstrumentCAssessmentValor(
      client.db,
      avaliadoId,
      '2026-Q3',
      1,
      1,
      2,
      new Date(),
    );
    expect(afetadas).toBe(0);
  });

  it('FK RESTRICT reprova liderId invalido', async () => {
    await expect(
      insertInstrumentCAssessment(client.db, buildValidAssessment(companyId, avaliadoId, 99999)),
    ).rejects.toThrow();
  });
});
