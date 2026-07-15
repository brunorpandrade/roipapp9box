// ROIP APP 9BOX — teste de integracao `copsoqFactorScores` (ME-016).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico (S009) e usa o proprio
// service ME-016 `insertCopsoqCycle` para materializar o ciclo pai
// (dogfood RV-13). Os `departments` (ids 1..19) sao semeados pela
// migration.
//
// Cobre: INSERT nos 3 escopos canonicos ('empresa' | 'departamento' |
// 'agregacao'); os 2 CHECKs canonicos da migration §S004
// (`chk_score_fator` 1-8, `chk_score_range` 0-100) via INSERT fora do
// dominio; a SEMANTICA da UNIQUE `uq_score` com colunas nullaveis —
// no MySQL, NULL em indice UNIQUE nao colide, entao duplicatas do
// mesmo escopo/fator SAO aceitas pelo banco e a coerencia e do caller
// (documentado no service, confirmado aqui por execucao real);
// lookups por escopo ordenados por fator; listagem geral ordenada pela
// posicao do enum (L28); historico por company+fator; FK RESTRICT em
// `companyId`; CASCADE do ciclo pai.
//
// Cleanup:
// - `beforeEach`: apaga os scores do ciclo pai.
// - `afterAll`: apaga ciclos (CASCADE leva scores) + company local
//   (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoqCycles, copsoqFactorScores } from '../../src/db/schema';
import { deleteCopsoqCycleById, insertCopsoqCycle } from '../../src/server/services/copsoqCycles';
import {
  getCopsoqFactorScoreById,
  insertCopsoqFactorScore,
  listCopsoqFactorScoresByCiclo,
  listCopsoqFactorScoresByCicloDepartamento,
  listCopsoqFactorScoresByCicloEmpresa,
  listCopsoqFactorScoresByCompanyFator,
  type NewCopsoqFactorScore,
} from '../../src/server/services/copsoqFactorScores';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000132';

describe('service copsoqFactorScores (ME-016)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let cicloDbId: number;

  function buildValidScore(overrides: Partial<NewCopsoqFactorScore> = {}): NewCopsoqFactorScore {
    return {
      cicloDbId,
      companyId,
      escopo: 'empresa',
      fator: 1,
      score: '72.50',
      countRespondentes: 34,
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CopsoqScores Test LTDA',
        nomeFantasia: 'Empresa CopsoqScores Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330032',
        endereco: 'Rua CopsoqScores, 32',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@copsoqscores.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@copsoqscores.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Dogfood RV-13: ciclo pai via service da propria ME-016.
    cicloDbId = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-06-01',
      dataAbertura: new Date('2026-06-01'),
      dataFechamento: new Date('2026-06-15'),
    });
  });

  afterAll(async () => {
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(copsoqFactorScores).where(eq(copsoqFactorScores.cicloDbId, cicloDbId));
  });

  it('insere score de escopo empresa e retorna id positivo', async () => {
    const id = await insertCopsoqFactorScore(client.db, buildValidScore());
    expect(id).toBeGreaterThan(0);

    const row = await getCopsoqFactorScoreById(client.db, id);
    expect(row?.escopo).toBe('empresa');
    expect(row?.score).toBe('72.50');
    expect(row?.countRespondentes).toBe(34);
    expect(row?.escopoDepartamentoId).toBeNull();
    expect(row?.escopoNomeAgregacao).toBeNull();
    expect(row?.agregadoDe).toBeNull();
  });

  it('insere score de escopo departamento com escopoDepartamentoId', async () => {
    const id = await insertCopsoqFactorScore(
      client.db,
      buildValidScore({ escopo: 'departamento', escopoDepartamentoId: 1, score: '55.00' }),
    );
    const row = await getCopsoqFactorScoreById(client.db, id);
    expect(row?.escopo).toBe('departamento');
    expect(row?.escopoDepartamentoId).toBe(1);
    expect(row?.escopoNomeAgregacao).toBeNull();
  });

  it('insere score de escopo agregacao com nome e agregadoDe', async () => {
    const id = await insertCopsoqFactorScore(
      client.db,
      buildValidScore({
        escopo: 'agregacao',
        escopoNomeAgregacao: 'Agregação de: Comercial, Financeiro',
        agregadoDe: [1, 2],
        score: '61.25',
      }),
    );
    const row = await getCopsoqFactorScoreById(client.db, id);
    expect(row?.escopo).toBe('agregacao');
    expect(row?.escopoNomeAgregacao).toBe('Agregação de: Comercial, Financeiro');
    expect(row?.agregadoDe).toEqual([1, 2]);
    expect(row?.escopoDepartamentoId).toBeNull();
  });

  it('UNIQUE uq_score com colunas nullaveis NAO colide (coerencia do caller)', async () => {
    // Semantica do MySQL: NULL em indice UNIQUE nunca colide. Como cada
    // escopo deixa ao menos uma coluna do indice nula, o banco ACEITA a
    // duplicata do mesmo (ciclo, escopo, fator) — a unicidade logica e
    // responsabilidade do motor de fechamento (Bloco B3).
    const id1 = await insertCopsoqFactorScore(client.db, buildValidScore());
    const id2 = await insertCopsoqFactorScore(client.db, buildValidScore());
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(id1);
  });

  it('CHECK chk_score_fator bloqueia fator fora de 1-8', async () => {
    await expect(
      insertCopsoqFactorScore(client.db, buildValidScore({ fator: 0 })),
    ).rejects.toThrow();
    await expect(
      insertCopsoqFactorScore(client.db, buildValidScore({ fator: 9 })),
    ).rejects.toThrow();
  });

  it('CHECK chk_score_range bloqueia score fora de 0-100', async () => {
    await expect(
      insertCopsoqFactorScore(client.db, buildValidScore({ score: '100.01' })),
    ).rejects.toThrow();
    await expect(
      insertCopsoqFactorScore(client.db, buildValidScore({ score: '-0.01' })),
    ).rejects.toThrow();
  });

  it('aceita os valores extremos 0.00 e 100.00 do score', async () => {
    const idMin = await insertCopsoqFactorScore(client.db, buildValidScore({ score: '0.00' }));
    const idMax = await insertCopsoqFactorScore(
      client.db,
      buildValidScore({ fator: 2, score: '100.00' }),
    );
    expect((await getCopsoqFactorScoreById(client.db, idMin))?.score).toBe('0.00');
    expect((await getCopsoqFactorScoreById(client.db, idMax))?.score).toBe('100.00');
  });

  it('lookups por escopo retornam fatores ordenados', async () => {
    await insertCopsoqFactorScore(client.db, buildValidScore({ fator: 3, score: '60.00' }));
    await insertCopsoqFactorScore(client.db, buildValidScore({ fator: 1, score: '70.00' }));
    await insertCopsoqFactorScore(
      client.db,
      buildValidScore({ escopo: 'departamento', escopoDepartamentoId: 1, fator: 2 }),
    );

    const empresa = await listCopsoqFactorScoresByCicloEmpresa(client.db, cicloDbId);
    expect(empresa.map((s) => s.fator)).toEqual([1, 3]);

    const dept = await listCopsoqFactorScoresByCicloDepartamento(client.db, cicloDbId, 1);
    expect(dept).toHaveLength(1);
    expect(dept[0]?.fator).toBe(2);
  });

  it('listagem geral ordena pela posicao declarada do enum (L28)', async () => {
    await insertCopsoqFactorScore(
      client.db,
      buildValidScore({
        escopo: 'agregacao',
        escopoNomeAgregacao: 'Agregação de: Comercial, Financeiro',
        fator: 1,
      }),
    );
    await insertCopsoqFactorScore(
      client.db,
      buildValidScore({ escopo: 'departamento', escopoDepartamentoId: 1, fator: 1 }),
    );
    await insertCopsoqFactorScore(client.db, buildValidScore({ fator: 1 }));

    const todos = await listCopsoqFactorScoresByCiclo(client.db, cicloDbId);
    expect(todos.map((s) => s.escopo)).toEqual(['empresa', 'departamento', 'agregacao']);
  });

  it('historico por company+fator cobre o indice idx_scores_company_fator', async () => {
    await insertCopsoqFactorScore(client.db, buildValidScore({ fator: 5, score: '48.00' }));
    await insertCopsoqFactorScore(client.db, buildValidScore({ fator: 6, score: '52.00' }));

    const fator5 = await listCopsoqFactorScoresByCompanyFator(client.db, companyId, 5);
    expect(fator5).toHaveLength(1);
    expect(fator5[0]?.score).toBe('48.00');
  });

  it('FK RESTRICT bloqueia companyId inexistente', async () => {
    await expect(
      insertCopsoqFactorScore(client.db, buildValidScore({ companyId: 999999 })),
    ).rejects.toThrow();
  });

  it('CASCADE do ciclo pai apaga os scores filhos', async () => {
    const cicloTemp = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-11-02',
      dataAbertura: new Date('2026-11-02'),
      dataFechamento: new Date('2026-11-16'),
    });
    const scoreId = await insertCopsoqFactorScore(
      client.db,
      buildValidScore({ cicloDbId: cicloTemp }),
    );

    expect(await deleteCopsoqCycleById(client.db, cicloTemp)).toBe(1);
    expect(await getCopsoqFactorScoreById(client.db, scoreId)).toBeUndefined();
  });
});
