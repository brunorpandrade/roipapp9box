// ROIP APP 9BOX — teste de integracao `instrumentA_responses` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico do arquivo (S009) e dois
// employees locais (o segundo cobre a listagem por empresa).
//
// Cobre: INSERT com defaults (`respondidoEm`, `createdAt`), lookup por
// id e pela chave logica UNIQUE, listagem dos 20 itens por
// (employee, trimestre) ordenada por (dimensao, itemIndex), listagem
// por (company, trimestre), colisao da UNIQUE `uq_iA_unica_resposta`,
// FKs RESTRICT (companyId, employeeId), valores extremos 0 e 4, e a
// unica mutacao autorizada (§16.2): `overwriteInstrumentAResponseValor`
// pelo fluxo de desbloqueio (linha existente -> 1; inexistente -> 0).
//
// Cleanup:
// - `beforeEach`: apaga `instrumentA_responses` do escopo.
// - `afterAll`: apaga o escopo + employees + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, instrumentA_responses } from '../../src/db/schema';
import {
  getInstrumentAResponseById,
  getInstrumentAResponseByKey,
  insertInstrumentAResponse,
  listInstrumentAResponsesByCompanyQuarter,
  listInstrumentAResponsesByEmployeeQuarter,
  type NewInstrumentAResponse,
  overwriteInstrumentAResponseValor,
} from '../../src/server/services/instrumentA_responses';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000122';

function buildValidResponse(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewInstrumentAResponse> = {},
): NewInstrumentAResponse {
  return {
    companyId,
    employeeId,
    trimestre: '2026-Q1',
    dimensao: 1,
    itemIndex: 1,
    valor: 3,
    ...overrides,
  };
}

describe('service instrumentA_responses (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let employee2Id: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa InstrumentA Test LTDA',
        nomeFantasia: 'Empresa InstrumentA Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330022',
        endereco: 'Rua InstrumentA, 22',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@instrumenta.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@instrumenta.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp1] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colaborador IA 1',
        cpf: '10101010126',
        email: 'colab.ia1@roip.local',
        dataNascimento: new Date('1992-05-11'),
        dataAdmissao: new Date('2020-02-03'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!emp1) throw new Error('beforeAll: falha ao criar employee 1');
    employeeId = emp1.id;

    const [emp2] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colaborador IA 2',
        cpf: '10101010127',
        email: 'colab.ia2@roip.local',
        dataNascimento: new Date('1990-09-25'),
        dataAdmissao: new Date('2019-07-20'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'senior',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!emp2) throw new Error('beforeAll: falha ao criar employee 2');
    employee2Id = emp2.id;
  });

  afterAll(async () => {
    await client.db
      .delete(instrumentA_responses)
      .where(eq(instrumentA_responses.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(instrumentA_responses)
      .where(eq(instrumentA_responses.companyId, companyId));
  });

  it('insertInstrumentAResponse insere item e retorna id positivo com defaults', async () => {
    const id = await insertInstrumentAResponse(
      client.db,
      buildValidResponse(companyId, employeeId),
    );
    expect(id).toBeGreaterThan(0);

    const row = await getInstrumentAResponseById(client.db, id);
    expect(row).toBeDefined();
    expect(row?.valor).toBe(3);
    expect(row?.respondidoEm).not.toBeNull();
    expect(row?.createdAt).not.toBeNull();
  });

  it('getInstrumentAResponseByKey localiza pela chave logica UNIQUE', async () => {
    await insertInstrumentAResponse(
      client.db,
      buildValidResponse(companyId, employeeId, { dimensao: 2, itemIndex: 4, valor: 1 }),
    );
    const row = await getInstrumentAResponseByKey(client.db, employeeId, '2026-Q1', 2, 4);
    expect(row).toBeDefined();
    expect(row?.valor).toBe(1);

    const ausente = await getInstrumentAResponseByKey(client.db, employeeId, '2026-Q1', 3, 5);
    expect(ausente).toBeUndefined();
  });

  it('listInstrumentAResponsesByEmployeeQuarter retorna 20 itens ordenados', async () => {
    for (let dimensao = 4; dimensao >= 1; dimensao -= 1) {
      for (let itemIndex = 5; itemIndex >= 1; itemIndex -= 1) {
        await insertInstrumentAResponse(
          client.db,
          buildValidResponse(companyId, employeeId, { dimensao, itemIndex, valor: 2 }),
        );
      }
    }
    const rows = await listInstrumentAResponsesByEmployeeQuarter(client.db, employeeId, '2026-Q1');
    expect(rows).toHaveLength(20);
    expect(rows[0]?.dimensao).toBe(1);
    expect(rows[0]?.itemIndex).toBe(1);
    expect(rows[19]?.dimensao).toBe(4);
    expect(rows[19]?.itemIndex).toBe(5);
  });

  it('listInstrumentAResponsesByCompanyQuarter agrega employees ordenados', async () => {
    await insertInstrumentAResponse(client.db, buildValidResponse(companyId, employee2Id));
    await insertInstrumentAResponse(client.db, buildValidResponse(companyId, employeeId));
    const rows = await listInstrumentAResponsesByCompanyQuarter(client.db, companyId, '2026-Q1');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.employeeId).toBe(Math.min(employeeId, employee2Id));
    expect(rows[1]?.employeeId).toBe(Math.max(employeeId, employee2Id));
  });

  it('UNIQUE uq_iA_unica_resposta bloqueia item duplicado', async () => {
    await insertInstrumentAResponse(client.db, buildValidResponse(companyId, employeeId));
    await expect(
      insertInstrumentAResponse(client.db, buildValidResponse(companyId, employeeId, { valor: 0 })),
    ).rejects.toThrow();
  });

  it('aceita os valores extremos 0 e 4 da escala canonica', async () => {
    const idZero = await insertInstrumentAResponse(
      client.db,
      buildValidResponse(companyId, employeeId, { itemIndex: 1, valor: 0 }),
    );
    const idQuatro = await insertInstrumentAResponse(
      client.db,
      buildValidResponse(companyId, employeeId, { itemIndex: 2, valor: 4 }),
    );
    const rowZero = await getInstrumentAResponseById(client.db, idZero);
    const rowQuatro = await getInstrumentAResponseById(client.db, idQuatro);
    expect(rowZero?.valor).toBe(0);
    expect(rowQuatro?.valor).toBe(4);
  });

  it('FK RESTRICT reprova employeeId invalido', async () => {
    await expect(
      insertInstrumentAResponse(client.db, buildValidResponse(companyId, 99999)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT reprova companyId invalido', async () => {
    await expect(
      insertInstrumentAResponse(client.db, buildValidResponse(99999, employeeId)),
    ).rejects.toThrow();
  });

  it('overwriteInstrumentAResponseValor grava por cima na janela (§16.2)', async () => {
    await insertInstrumentAResponse(
      client.db,
      buildValidResponse(companyId, employeeId, { valor: 1 }),
    );
    const novoMomento = new Date('2026-02-10T12:00:00Z');
    const afetadas = await overwriteInstrumentAResponseValor(
      client.db,
      employeeId,
      '2026-Q1',
      1,
      1,
      4,
      novoMomento,
    );
    expect(afetadas).toBe(1);

    const row = await getInstrumentAResponseByKey(client.db, employeeId, '2026-Q1', 1, 1);
    expect(row?.valor).toBe(4);
    expect(row?.respondidoEm).not.toBeNull();
  });

  it('overwriteInstrumentAResponseValor de chave inexistente retorna 0', async () => {
    const afetadas = await overwriteInstrumentAResponseValor(
      client.db,
      employeeId,
      '2026-Q4',
      1,
      1,
      2,
      new Date(),
    );
    expect(afetadas).toBe(0);
  });
});
