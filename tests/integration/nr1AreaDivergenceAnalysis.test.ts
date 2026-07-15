// ROIP APP 9BOX — teste de integracao `nr1AreaDivergenceAnalysis`
// (ME-016).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico (S009) e usa o proprio
// service ME-016 `insertCopsoqCycle` para materializar o ciclo pai
// (dogfood RV-13). Os `departments` (ids 1..19) sao semeados pela
// migration.
//
// Cobre: INSERT nos 2 escopos canonicos ('departamento' |
// 'agregacao') e nas 3 classificacoes ('convergente' |
// 'divergencia_critica' | 'divergencia_positiva'); payloads JSON de
// fatores criticos e positivos com a forma canonica { fator,
// scoreDept, scoreEmpresa, diferenca }; a semantica da UNIQUE
// `uq_divergence` com colunas nullaveis (NULL nao colide — coerencia
// do caller, mesmo regime de `copsoqFactorScores`); listagens por
// ciclo (ordenadas pela posicao do enum, L28) e por
// ciclo+classificacao; FK RESTRICT em `companyId`; CASCADE do ciclo
// pai.
//
// Cleanup:
// - `beforeEach`: apaga as analises do ciclo pai.
// - `afterAll`: apaga ciclos (CASCADE leva analises) + company local
//   (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoqCycles, nr1AreaDivergenceAnalysis } from '../../src/db/schema';
import { deleteCopsoqCycleById, insertCopsoqCycle } from '../../src/server/services/copsoqCycles';
import {
  getNr1AreaDivergenceAnalysisById,
  insertNr1AreaDivergenceAnalysis,
  listNr1AreaDivergenceAnalysisByCiclo,
  listNr1AreaDivergenceAnalysisByCicloClassificacao,
  type NewNr1AreaDivergenceAnalysis,
} from '../../src/server/services/nr1AreaDivergenceAnalysis';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000133';

describe('service nr1AreaDivergenceAnalysis (ME-016)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let cicloDbId: number;

  function buildValidAnalysis(
    overrides: Partial<NewNr1AreaDivergenceAnalysis> = {},
  ): NewNr1AreaDivergenceAnalysis {
    return {
      cicloDbId,
      companyId,
      escopo: 'departamento',
      escopoDepartamentoId: 1,
      classificacao: 'convergente',
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Nr1Divergence Test LTDA',
        nomeFantasia: 'Empresa Nr1Divergence Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330033',
        endereco: 'Rua Nr1Divergence, 33',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@nr1div.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@nr1div.local',
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
      ciclo: '2026-07-06',
      dataAbertura: new Date('2026-07-06'),
      dataFechamento: new Date('2026-07-20'),
    });
  });

  afterAll(async () => {
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(nr1AreaDivergenceAnalysis)
      .where(eq(nr1AreaDivergenceAnalysis.cicloDbId, cicloDbId));
  });

  it('insere analise convergente de departamento e retorna id positivo', async () => {
    const id = await insertNr1AreaDivergenceAnalysis(client.db, buildValidAnalysis());
    expect(id).toBeGreaterThan(0);

    const row = await getNr1AreaDivergenceAnalysisById(client.db, id);
    expect(row?.escopo).toBe('departamento');
    expect(row?.classificacao).toBe('convergente');
    expect(row?.escopoDepartamentoId).toBe(1);
    expect(row?.escopoNomeAgregacao).toBeNull();
    expect(row?.fatoresDivergentesCriticos).toBeNull();
    expect(row?.fatoresDivergentesPositivos).toBeNull();
  });

  it('insere analise de agregacao com payloads JSON canonicos', async () => {
    const criticos = [{ fator: 3, scoreDept: 38.5, scoreEmpresa: 62.0, diferenca: -23.5 }];
    const positivos = [{ fator: 7, scoreDept: 88.0, scoreEmpresa: 66.5, diferenca: 21.5 }];
    const id = await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({
        escopo: 'agregacao',
        escopoDepartamentoId: null,
        escopoNomeAgregacao: 'Agregação de: Comercial, Financeiro',
        classificacao: 'divergencia_critica',
        fatoresDivergentesCriticos: criticos,
        fatoresDivergentesPositivos: positivos,
      }),
    );

    const row = await getNr1AreaDivergenceAnalysisById(client.db, id);
    expect(row?.escopo).toBe('agregacao');
    expect(row?.escopoNomeAgregacao).toBe('Agregação de: Comercial, Financeiro');
    expect(row?.fatoresDivergentesCriticos).toEqual(criticos);
    expect(row?.fatoresDivergentesPositivos).toEqual(positivos);
  });

  it('aceita as 3 classificacoes canonicas', async () => {
    const idConv = await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({ escopoDepartamentoId: 1, classificacao: 'convergente' }),
    );
    const idCrit = await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({ escopoDepartamentoId: 2, classificacao: 'divergencia_critica' }),
    );
    const idPos = await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({ escopoDepartamentoId: 3, classificacao: 'divergencia_positiva' }),
    );

    expect((await getNr1AreaDivergenceAnalysisById(client.db, idConv))?.classificacao).toBe(
      'convergente',
    );
    expect((await getNr1AreaDivergenceAnalysisById(client.db, idCrit))?.classificacao).toBe(
      'divergencia_critica',
    );
    expect((await getNr1AreaDivergenceAnalysisById(client.db, idPos))?.classificacao).toBe(
      'divergencia_positiva',
    );
  });

  it('UNIQUE uq_divergence com colunas nullaveis NAO colide (coerencia do caller)', async () => {
    // Mesma semantica documentada em copsoqFactorScores: NULL em indice
    // UNIQUE do MySQL nunca colide; `escopoNomeAgregacao` e nulo no
    // escopo departamento, entao a duplicata e aceita pelo banco.
    const id1 = await insertNr1AreaDivergenceAnalysis(client.db, buildValidAnalysis());
    const id2 = await insertNr1AreaDivergenceAnalysis(client.db, buildValidAnalysis());
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(id1);
  });

  it('listagens ordenam pela posicao do enum (L28) e filtram por classificacao', async () => {
    await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({
        escopo: 'agregacao',
        escopoDepartamentoId: null,
        escopoNomeAgregacao: 'Agregação de: Operações, Logística',
        classificacao: 'divergencia_positiva',
      }),
    );
    await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({ escopoDepartamentoId: 2, classificacao: 'divergencia_critica' }),
    );
    await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({ escopoDepartamentoId: 1, classificacao: 'convergente' }),
    );

    const todas = await listNr1AreaDivergenceAnalysisByCiclo(client.db, cicloDbId);
    expect(todas.map((a) => a.escopo)).toEqual(['departamento', 'departamento', 'agregacao']);

    const criticas = await listNr1AreaDivergenceAnalysisByCicloClassificacao(
      client.db,
      cicloDbId,
      'divergencia_critica',
    );
    expect(criticas).toHaveLength(1);
    expect(criticas[0]?.escopoDepartamentoId).toBe(2);
  });

  it('FK RESTRICT bloqueia companyId inexistente', async () => {
    await expect(
      insertNr1AreaDivergenceAnalysis(client.db, buildValidAnalysis({ companyId: 999999 })),
    ).rejects.toThrow();
  });

  it('CASCADE do ciclo pai apaga as analises filhas', async () => {
    const cicloTemp = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-12-07',
      dataAbertura: new Date('2026-12-07'),
      dataFechamento: new Date('2026-12-21'),
    });
    const analiseId = await insertNr1AreaDivergenceAnalysis(
      client.db,
      buildValidAnalysis({ cicloDbId: cicloTemp }),
    );

    expect(await deleteCopsoqCycleById(client.db, cicloTemp)).toBe(1);
    expect(await getNr1AreaDivergenceAnalysisById(client.db, analiseId)).toBeUndefined();
  });
});
