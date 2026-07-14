// ROIP APP 9BOX — teste de integracao `instrumentD_responses` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009), employee respondente, employee
// lider (avaliado variante employee) e cLevelMember (avaliado variante
// C-level).
//
// Cobre: INSERT nas duas variantes do padrao A no avaliado (liderId
// XOR clevelId), default `versaoInstrumento=1`, CHECK
// `chk_iD_avaliado_unico` bloqueando ambos preenchidos ou ambos nulos,
// lookup pela chave logica UNIQUE, listagens por respondente, por
// lider e por clevel (cobrindo os 3 indices canonicos), colisao da
// UNIQUE `uq_iD_unica_resposta`, FKs RESTRICT, e a unica mutacao
// autorizada (§16.2): `overwriteInstrumentDResponseValor` (existente
// -> 1; ausente -> 0).
//
// Cleanup:
// - `beforeEach`: apaga `instrumentD_responses` do escopo.
// - `afterAll`: apaga o escopo + employees + cLevel + company (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, instrumentD_responses } from '../../src/db/schema';
import {
  getInstrumentDResponseById,
  getInstrumentDResponseByKey,
  insertInstrumentDResponse,
  listInstrumentDResponsesByClevelQuarter,
  listInstrumentDResponsesByLiderQuarter,
  listInstrumentDResponsesByRespondenteQuarter,
  type NewInstrumentDResponse,
  overwriteInstrumentDResponseValor,
} from '../../src/server/services/instrumentD_responses';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000124';

function buildValidResponseLider(
  companyId: number,
  respondenteId: number,
  liderId: number,
  overrides: Partial<NewInstrumentDResponse> = {},
): NewInstrumentDResponse {
  return {
    companyId,
    respondenteId,
    liderId,
    trimestre: '2026-Q1',
    dimensao: 1,
    itemIndex: 1,
    valor: 3,
    ...overrides,
  };
}

function buildValidResponseClevel(
  companyId: number,
  respondenteId: number,
  clevelId: number,
  overrides: Partial<NewInstrumentDResponse> = {},
): NewInstrumentDResponse {
  return {
    companyId,
    respondenteId,
    clevelId,
    trimestre: '2026-Q1',
    dimensao: 1,
    itemIndex: 1,
    valor: 3,
    ...overrides,
  };
}

describe('service instrumentD_responses (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let respondenteId: number;
  let liderEmployeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa InstrumentD Test LTDA',
        nomeFantasia: 'Empresa InstrumentD Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330024',
        endereco: 'Rua InstrumentD, 24',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@instrumentd.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@instrumentd.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [resp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Respondente ID',
        cpf: '10101010131',
        email: 'resp.id@roip.local',
        dataNascimento: new Date('1993-06-14'),
        dataAdmissao: new Date('2020-08-10'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!resp) throw new Error('beforeAll: falha ao criar employee respondente');
    respondenteId = resp.id;

    const [lider] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider ID',
        cpf: '10101010132',
        email: 'lider.id@roip.local',
        dataNascimento: new Date('1984-11-30'),
        dataAdmissao: new Date('2015-05-05'),
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
        name: 'C-Level ID',
        cpf: '10101010133',
        email: 'clevel.id@roip.local',
        dataNascimento: new Date('1971-04-19'),
        dataAdmissao: new Date('2011-09-15'),
        cargo: 'CTO',
        descricaoCargo: 'Chief Technology Officer',
        departamento: 'Diretoria',
        custoMensal: '38000.00',
      })
      .$returningId();
    if (!cle) throw new Error('beforeAll: falha ao criar cLevelMember');
    clevelId = cle.id;
  });

  afterAll(async () => {
    await client.db
      .delete(instrumentD_responses)
      .where(eq(instrumentD_responses.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(instrumentD_responses)
      .where(eq(instrumentD_responses.companyId, companyId));
  });

  it('insere resposta avaliando lider employee com default versaoInstrumento=1', async () => {
    const id = await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId),
    );
    expect(id).toBeGreaterThan(0);

    const row = await getInstrumentDResponseById(client.db, id);
    expect(row?.liderId).toBe(liderEmployeeId);
    expect(row?.clevelId).toBeNull();
    expect(row?.versaoInstrumento).toBe(1);
  });

  it('insere resposta avaliando C-level', async () => {
    const id = await insertInstrumentDResponse(
      client.db,
      buildValidResponseClevel(companyId, respondenteId, clevelId, { itemIndex: 2 }),
    );
    const row = await getInstrumentDResponseById(client.db, id);
    expect(row?.clevelId).toBe(clevelId);
    expect(row?.liderId).toBeNull();
  });

  it('CHECK chk_iD_avaliado_unico bloqueia liderId e clevelId juntos', async () => {
    await expect(
      insertInstrumentDResponse(client.db, {
        companyId,
        respondenteId,
        liderId: liderEmployeeId,
        clevelId,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 2,
      }),
    ).rejects.toThrow();
  });

  it('CHECK chk_iD_avaliado_unico bloqueia linha sem avaliado', async () => {
    await expect(
      insertInstrumentDResponse(client.db, {
        companyId,
        respondenteId,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 2,
      }),
    ).rejects.toThrow();
  });

  it('getInstrumentDResponseByKey localiza pela chave logica UNIQUE', async () => {
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId, {
        dimensao: 4,
        itemIndex: 3,
        valor: 1,
      }),
    );
    const row = await getInstrumentDResponseByKey(client.db, respondenteId, '2026-Q1', 4, 3);
    expect(row?.valor).toBe(1);
  });

  it('listInstrumentDResponsesByRespondenteQuarter ordena por dimensao/item', async () => {
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId, {
        dimensao: 3,
        itemIndex: 2,
      }),
    );
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId, {
        dimensao: 1,
        itemIndex: 5,
      }),
    );
    const rows = await listInstrumentDResponsesByRespondenteQuarter(
      client.db,
      respondenteId,
      '2026-Q1',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.dimensao).toBe(1);
    expect(rows[1]?.dimensao).toBe(3);
  });

  it('listInstrumentDResponsesByLiderQuarter retorna respostas do avaliado employee', async () => {
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId),
    );
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseClevel(companyId, respondenteId, clevelId, { itemIndex: 2 }),
    );
    const rows = await listInstrumentDResponsesByLiderQuarter(
      client.db,
      liderEmployeeId,
      '2026-Q1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.liderId).toBe(liderEmployeeId);
  });

  it('listInstrumentDResponsesByClevelQuarter retorna respostas do avaliado C-level', async () => {
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId),
    );
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseClevel(companyId, respondenteId, clevelId, { itemIndex: 2 }),
    );
    const rows = await listInstrumentDResponsesByClevelQuarter(client.db, clevelId, '2026-Q1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.clevelId).toBe(clevelId);
  });

  it('UNIQUE uq_iD_unica_resposta bloqueia item duplicado do respondente', async () => {
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId),
    );
    await expect(
      insertInstrumentDResponse(
        client.db,
        buildValidResponseClevel(companyId, respondenteId, clevelId),
      ),
    ).rejects.toThrow();
  });

  it('overwriteInstrumentDResponseValor grava por cima na janela (§16.2)', async () => {
    await insertInstrumentDResponse(
      client.db,
      buildValidResponseLider(companyId, respondenteId, liderEmployeeId, { valor: 0 }),
    );
    const afetadas = await overwriteInstrumentDResponseValor(
      client.db,
      respondenteId,
      '2026-Q1',
      1,
      1,
      4,
      new Date('2026-02-12T10:00:00Z'),
    );
    expect(afetadas).toBe(1);

    const row = await getInstrumentDResponseByKey(client.db, respondenteId, '2026-Q1', 1, 1);
    expect(row?.valor).toBe(4);
  });

  it('overwriteInstrumentDResponseValor de chave inexistente retorna 0', async () => {
    const afetadas = await overwriteInstrumentDResponseValor(
      client.db,
      respondenteId,
      '2026-Q4',
      1,
      1,
      2,
      new Date(),
    );
    expect(afetadas).toBe(0);
  });

  it('FK RESTRICT reprova respondenteId invalido', async () => {
    await expect(
      insertInstrumentDResponse(
        client.db,
        buildValidResponseLider(companyId, 99999, liderEmployeeId),
      ),
    ).rejects.toThrow();
  });
});
