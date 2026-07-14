// ROIP APP 9BOX — teste de integracao `nineBoxClassifications` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e employee local, cobre o §8.4:
// insert, lookup pelo UNIQUE trio, listagens por employee e por company,
// setter do motor 9-Box (`updateNineBoxCalculo`), varredura dos 9
// quadrantes canonicos (com acentos e caixa alta literais), enum
// `direcaoMovimento`, colisao de UNIQUE, FKs RESTRICT, delete.
//
// Cleanup:
// - `beforeEach`: apaga `nineBoxClassifications` do escopo.
// - `afterAll`: apaga employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, nineBoxClassifications } from '../../src/db/schema';
import { createEmployee } from '../../src/server/services/employees';
import {
  deleteNineBoxClassificationById,
  getNineBoxClassificationById,
  getNineBoxClassificationByQuarter,
  insertNineBoxClassification,
  listNineBoxClassificationsByCompany,
  listNineBoxClassificationsByEmployee,
  type NewNineBoxClassification,
  type QuadranteNineBox,
  updateNineBoxCalculo,
} from '../../src/server/services/nineBoxClassifications';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000119';

/** Os 9 quadrantes canonicos na ordem declarada no schema (§8.4). */
const QUADRANTES_CANONICOS: readonly QuadranteNineBox[] = [
  'ALTO IMPACTO',
  'DESEMPENHO REPRESADO',
  'POTENCIAL SUBUTILIZADO',
  'ALTA ENTREGA',
  'EQUILÍBRIO FRÁGIL',
  'DESEMPENHO CRÍTICO',
  'RISCO DE ESGOTAMENTO',
  'DESGASTE OCULTO',
  'RISCO CRÍTICO',
];

function buildValidNineBox(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewNineBoxClassification> = {},
): NewNineBoxClassification {
  return {
    companyId,
    employeeId,
    trimestre: '2026-Q1',
    posicaoX: 'medio',
    posicaoY: 'media',
    quadrante: 'ALTA ENTREGA',
    ...overrides,
  };
}

describe('service nineBoxClassifications (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let employee2Id: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa NineBoxClass Test LTDA',
        nomeFantasia: 'Empresa NineBoxClass Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330019',
        endereco: 'Rua NineBoxClass, 19',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@nineboxclass.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@nineboxclass.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    employeeId = await createEmployee(client.db, {
      companyId,
      name: 'Colab NineBoxClass 1',
      cpf: '10101010120',
      dataNascimento: new Date('1988-01-01'),
      dataAdmissao: new Date('2018-04-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
    });
    employee2Id = await createEmployee(client.db, {
      companyId,
      name: 'Colab NineBoxClass 2',
      cpf: '10101010121',
      dataNascimento: new Date('1992-08-01'),
      dataAdmissao: new Date('2021-05-01'),
      cbo: '354125',
      descricaoCBO: 'Vendedor',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
    });
  });

  afterAll(async () => {
    await client.db.delete(nineBoxClassifications);
    await client.db.delete(employees);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(nineBoxClassifications);
  });

  it('insertNineBoxClassification insere e retorna id positivo', async () => {
    const id = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId),
    );
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getNineBoxClassificationById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.companyId).toBe(companyId);
    expect(row.employeeId).toBe(employeeId);
    expect(row.trimestre).toBe('2026-Q1');
    expect(row.posicaoX).toBe('medio');
    expect(row.posicaoY).toBe('media');
    expect(row.quadrante).toBe('ALTA ENTREGA');
    // scoreDesempenho/plenitudeScore/quadranteAnterior/direcaoMovimento nascem NULL.
    expect(row.scoreDesempenho).toBeNull();
    expect(row.plenitudeScore).toBeNull();
    expect(row.quadranteAnterior).toBeNull();
    expect(row.direcaoMovimento).toBeNull();
  });

  it('quadrante aceita os 9 valores canonicos com acentos e caixa alta literais', async () => {
    for (let i = 0; i < QUADRANTES_CANONICOS.length; i++) {
      const q = QUADRANTES_CANONICOS[i];
      if (!q) throw new Error(`quadrante[${i}] indefinido`);
      const trimestre = `2027-Q${(i % 4) + 1}`;
      const employeeAlvo = i % 2 === 0 ? employeeId : employee2Id;
      // Limpa a linha anterior daquele trio caso ja exista.
      await client.db.delete(nineBoxClassifications);
      const id = await insertNineBoxClassification(
        client.db,
        buildValidNineBox(companyId, employeeAlvo, { trimestre, quadrante: q }),
      );
      const row = await getNineBoxClassificationById(client.db, id);
      expect(row?.quadrante).toBe(q);
    }
  });

  it('getNineBoxClassificationByQuarter resolve pelo UNIQUE trio', async () => {
    const id = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const row = await getNineBoxClassificationByQuarter(
      client.db,
      companyId,
      employeeId,
      '2026-Q2',
    );
    if (!row) throw new Error('linha nao encontrada pelo trio');
    expect(row.id).toBe(id);
    const miss = await getNineBoxClassificationByQuarter(
      client.db,
      companyId,
      employeeId,
      '2099-Q4',
    );
    expect(miss).toBeUndefined();
  });

  it('listNineBoxClassificationsByEmployee ordena por trimestre crescente', async () => {
    const idQ3 = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId, { trimestre: '2026-Q3' }),
    );
    const idQ1 = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ2 = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listNineBoxClassificationsByEmployee(client.db, employeeId);
    expect(rows.map((r) => r.id)).toEqual([idQ1, idQ2, idQ3]);
  });

  it('listNineBoxClassificationsByCompany ordena por trimestre e employeeId', async () => {
    const idQ1E1 = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId, { trimestre: '2026-Q1' }),
    );
    const idQ1E2 = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employee2Id, { trimestre: '2026-Q1' }),
    );
    const idQ2E1 = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listNineBoxClassificationsByCompany(client.db, companyId);
    const e1Order = employeeId < employee2Id ? [idQ1E1, idQ1E2] : [idQ1E2, idQ1E1];
    expect(rows.map((r) => r.id)).toEqual([...e1Order, idQ2E1]);
  });

  it('updateNineBoxCalculo grava eixos, quadrante e movimento', async () => {
    const id = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId),
    );
    const calculadoEm = new Date('2026-04-15T12:00:00Z');
    const affected = await updateNineBoxCalculo(client.db, id, {
      scoreDesempenho: '125.00',
      plenitudeScore: '82.50',
      posicaoX: 'alto',
      posicaoY: 'alta',
      quadrante: 'ALTO IMPACTO',
      quadranteAnterior: 'ALTA ENTREGA',
      direcaoMovimento: 'subiu',
      calculadoEm,
    });
    expect(affected).toBe(1);
    const row = await getNineBoxClassificationById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.scoreDesempenho).toBe('125.00');
    expect(row.plenitudeScore).toBe('82.50');
    expect(row.posicaoX).toBe('alto');
    expect(row.posicaoY).toBe('alta');
    expect(row.quadrante).toBe('ALTO IMPACTO');
    expect(row.quadranteAnterior).toBe('ALTA ENTREGA');
    expect(row.direcaoMovimento).toBe('subiu');
  });

  it('updateNineBoxCalculo aceita primeira_vez com quadranteAnterior null', async () => {
    const id = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId),
    );
    const affected = await updateNineBoxCalculo(client.db, id, {
      scoreDesempenho: '100.00',
      plenitudeScore: '70.00',
      posicaoX: 'medio',
      posicaoY: 'media',
      quadrante: 'ALTA ENTREGA',
      quadranteAnterior: null,
      direcaoMovimento: 'primeira_vez',
      calculadoEm: new Date('2026-04-15T12:00:00Z'),
    });
    expect(affected).toBe(1);
    const row = await getNineBoxClassificationById(client.db, id);
    expect(row?.quadranteAnterior).toBeNull();
    expect(row?.direcaoMovimento).toBe('primeira_vez');
  });

  it('UNIQUE uq_nineBox impede duplicidade do trio', async () => {
    await insertNineBoxClassification(client.db, buildValidNineBox(companyId, employeeId));
    await expect(
      insertNineBoxClassification(client.db, buildValidNineBox(companyId, employeeId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em employeeId impede insert com employee inexistente', async () => {
    await expect(
      insertNineBoxClassification(client.db, buildValidNineBox(companyId, 99999)),
    ).rejects.toThrow();
  });

  it('deleteNineBoxClassificationById remove e retorna 1', async () => {
    const id = await insertNineBoxClassification(
      client.db,
      buildValidNineBox(companyId, employeeId),
    );
    const affected = await deleteNineBoxClassificationById(client.db, id);
    expect(affected).toBe(1);
    const row = await getNineBoxClassificationById(client.db, id);
    expect(row).toBeUndefined();
  });
});
