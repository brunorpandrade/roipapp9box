// ROIP APP 9BOX — teste de integracao `copsoq_responses` (ME-016).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico (S009) + employee local
// e usa o proprio service ME-016 `insertCopsoqCycle` para materializar
// o ciclo pai (dogfood RV-13).
//
// Cobre: INSERT com default `versaoInstrumento='placeholder_MVP_v1'`
// (§11.3); lookup pela UNIQUE `uq_resposta` e colisao; os 3 CHECKs
// canonicos da migration §S004 (`chk_fator` 1-8, `chk_itemIndex` 1-4,
// `chk_valor` 0-4) via INSERT fora do dominio; valores extremos 0 e 4
// da escala; listagens ordenadas por (fator, itemIndex) e por
// (employeeId, itemIndex) cobrindo os 2 indices canonicos; overwrite
// item-a-item como unica mutacao autorizada (§16.2 — existente retorna
// 1 e atualiza; inexistente retorna 0); FK RESTRICT em `employeeId`;
// CASCADE do ciclo pai apagando as respostas.
//
// Cleanup:
// - `beforeEach`: apaga as respostas do ciclo pai.
// - `afterAll`: apaga ciclos (CASCADE leva respostas) + employee +
//   company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoq_responses, copsoqCycles, employees } from '../../src/db/schema';
import { deleteCopsoqCycleById, insertCopsoqCycle } from '../../src/server/services/copsoqCycles';
import {
  getCopsoqResponseById,
  getCopsoqResponseByKey,
  insertCopsoqResponse,
  listCopsoqResponsesByCicloEmployee,
  listCopsoqResponsesByCicloFator,
  type NewCopsoqResponse,
  overwriteCopsoqResponseValor,
} from '../../src/server/services/copsoq_responses';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000131';

describe('service copsoq_responses (ME-016)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let cicloDbId: number;

  function buildValidResponse(overrides: Partial<NewCopsoqResponse> = {}): NewCopsoqResponse {
    return {
      cicloDbId,
      companyId,
      employeeId,
      fator: 1,
      itemIndex: 1,
      valor: 3,
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CopsoqResp Test LTDA',
        nomeFantasia: 'Empresa CopsoqResp Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330031',
        endereco: 'Rua CopsoqResp, 31',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@copsoqresp.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@copsoqresp.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colaborador CopsoqResp',
        cpf: '10101010132',
        email: 'colab.cresp@roip.local',
        dataNascimento: new Date('1994-07-30'),
        dataAdmissao: new Date('2023-02-13'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee');
    employeeId = emp.id;

    // Dogfood RV-13: ciclo pai via service da propria ME-016.
    cicloDbId = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-05-04',
      dataAbertura: new Date('2026-05-04'),
      dataFechamento: new Date('2026-05-18'),
    });
  });

  afterAll(async () => {
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, employeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(copsoq_responses).where(eq(copsoq_responses.cicloDbId, cicloDbId));
  });

  it('insere item com default de versaoInstrumento e retorna id positivo', async () => {
    const id = await insertCopsoqResponse(client.db, buildValidResponse());
    expect(id).toBeGreaterThan(0);

    const row = await getCopsoqResponseById(client.db, id);
    expect(row?.valor).toBe(3);
    expect(row?.versaoInstrumento).toBe('placeholder_MVP_v1');
    expect(row?.createdAt).not.toBeNull();
  });

  it('getCopsoqResponseByKey localiza pela chave logica UNIQUE', async () => {
    const id = await insertCopsoqResponse(client.db, buildValidResponse());
    const row = await getCopsoqResponseByKey(client.db, cicloDbId, employeeId, 1, 1);
    expect(row?.id).toBe(id);
    const missing = await getCopsoqResponseByKey(client.db, cicloDbId, employeeId, 8, 4);
    expect(missing).toBeUndefined();
  });

  it('UNIQUE uq_resposta bloqueia o mesmo item duas vezes', async () => {
    await insertCopsoqResponse(client.db, buildValidResponse());
    await expect(insertCopsoqResponse(client.db, buildValidResponse())).rejects.toThrow();
  });

  it('CHECK chk_fator bloqueia fator fora de 1-8', async () => {
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ fator: 0 })),
    ).rejects.toThrow();
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ fator: 9 })),
    ).rejects.toThrow();
  });

  it('CHECK chk_itemIndex bloqueia itemIndex fora de 1-4', async () => {
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ itemIndex: 0 })),
    ).rejects.toThrow();
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ itemIndex: 5 })),
    ).rejects.toThrow();
  });

  it('CHECK chk_valor bloqueia valor fora de 0-4', async () => {
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ valor: -1 })),
    ).rejects.toThrow();
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ valor: 5 })),
    ).rejects.toThrow();
  });

  it('aceita os valores extremos 0 e 4 da escala', async () => {
    const idMin = await insertCopsoqResponse(client.db, buildValidResponse({ valor: 0 }));
    const idMax = await insertCopsoqResponse(
      client.db,
      buildValidResponse({ itemIndex: 2, valor: 4 }),
    );
    expect((await getCopsoqResponseById(client.db, idMin))?.valor).toBe(0);
    expect((await getCopsoqResponseById(client.db, idMax))?.valor).toBe(4);
  });

  it('listagens cobrem os indices canonicos com ordenacao estavel', async () => {
    await insertCopsoqResponse(client.db, buildValidResponse({ fator: 2, itemIndex: 2 }));
    await insertCopsoqResponse(client.db, buildValidResponse({ fator: 1, itemIndex: 2 }));
    await insertCopsoqResponse(client.db, buildValidResponse({ fator: 1, itemIndex: 1 }));

    const porEmployee = await listCopsoqResponsesByCicloEmployee(client.db, cicloDbId, employeeId);
    expect(porEmployee.map((r) => `${r.fator}.${r.itemIndex}`)).toEqual(['1.1', '1.2', '2.2']);

    const porFator = await listCopsoqResponsesByCicloFator(client.db, cicloDbId, 1);
    expect(porFator).toHaveLength(2);
    expect(porFator.every((r) => r.fator === 1)).toBe(true);
  });

  it('overwriteCopsoqResponseValor e a unica mutacao autorizada (§16.2)', async () => {
    const id = await insertCopsoqResponse(client.db, buildValidResponse());

    const afetadas = await overwriteCopsoqResponseValor(client.db, cicloDbId, employeeId, 1, 1, 4);
    expect(afetadas).toBe(1);
    expect((await getCopsoqResponseById(client.db, id))?.valor).toBe(4);

    const inexistente = await overwriteCopsoqResponseValor(
      client.db,
      cicloDbId,
      employeeId,
      8,
      4,
      2,
    );
    expect(inexistente).toBe(0);
  });

  it('FK RESTRICT bloqueia employeeId inexistente', async () => {
    await expect(
      insertCopsoqResponse(client.db, buildValidResponse({ employeeId: 999999 })),
    ).rejects.toThrow();
  });

  it('CASCADE do ciclo pai apaga as respostas filhas', async () => {
    const cicloTemp = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-10-05',
      dataAbertura: new Date('2026-10-05'),
      dataFechamento: new Date('2026-10-19'),
    });
    const respId = await insertCopsoqResponse(
      client.db,
      buildValidResponse({ cicloDbId: cicloTemp }),
    );

    expect(await deleteCopsoqCycleById(client.db, cicloTemp)).toBe(1);
    expect(await getCopsoqResponseById(client.db, respId)).toBeUndefined();
  });
});
