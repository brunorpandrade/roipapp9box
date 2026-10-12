// ME-1.4b: reprojecao canonica restrita de `performanceQuarterlyData` da
// Nativa (companyId=1) a partir do fixture regenerado via motor v2 TS
// (`tests/fixtures/nativa/performance_trimestral.json`, novo SHA
// `13fd3be1...` canonizado em ME-1.4b).
//
// Enquadramento canonico: §5.1 de REGRA_GERAL_RESEED_INCREMENTAL_APPEND_ONLY
// (correcao de defeito de carga por re-abertura restrita), com CC dedicada
// de regeneracao do fixture:
//   1. O fixture foi regenerado via motor v2 TS canonico (ME-1.2) — 4
//      campos recalculados por registro, 12 campos preservados bit-exact.
//      SHA-256 novo pinado em `manifest.sha256.ts`.
//   2. Restrito a `companyId=1`. DELETE opera apenas sobre linhas da Nativa
//      em `performanceQuarterlyData`. Nenhuma outra tabela e tocada.
//   3. Nativa e demo pre-primeiro-cliente, nao ha dado real de cliente.
//   4. Reprojecao e operacao de dados; a mudanca canonica do fixture +
//      manifest.sha256.ts e commitada no repositorio.
//   5. Auditoria SQL antes/depois: amplitude de `percMetaAtingida` sai de
//      168.42-168.43 (platô) para ~101-201 (dispersao canonica real).
//   6. CC registrada em `manifest.sha256.ts` cabecalho + HISTORICO POS_B8
//      V11 (apos aprovacao do gate CC067).
//
// Idempotencia canonica: antes do DELETE, conta quantas linhas de 2026-Q4
// estao no platô anterior (168.40-168.45). Se zero, a demo esta corrigida.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import { performanceQuarterlyData } from '../../schema';
import { mapPerfTrimToRow, NATIVA_COMPANY_ID } from './loadFixtures';
import { loadFixture } from './loadJsonFixtures';

export interface ReprojectPerformanceQuarterlyResult {
  readonly alreadyFixed: boolean;
  readonly linhasPreExistentes: number;
  readonly linhasEmPlatoAnterior: number;
  readonly scoresDeletados: number;
  readonly scoresInseridos: number;
}

/**
 * Reprojeta canonicamente a tabela `performanceQuarterlyData` da Nativa
 * a partir do fixture regenerado via motor v2 TS, agora com dispersao
 * canonica real por `scoreDesempenho`, `custoMedioTrimestral` e
 * `nivelHierarquico` individual. Operacao idempotente, restrita a
 * `companyId=1`.
 */
export async function reprojectNativaPerformanceQuarterly(
  db: RoipDatabase,
): Promise<ReprojectPerformanceQuarterlyResult> {
  // Idempotencia: conta quantas linhas de 2026-Q4 estao no platô anterior
  // (168.40-168.45). Zero = demo corrigida; > 0 = aplica fix. Nenhum valor
  // pos-motor-v2 cai nessa faixa estreita (confirmado via histograma do
  // fixture regenerado em ME-1.4b).
  const linhasPre = await db
    .select({
      id: performanceQuarterlyData.id,
      trimestre: performanceQuarterlyData.trimestre,
      percMetaAtingida: performanceQuarterlyData.percMetaAtingida,
    })
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.companyId, NATIVA_COMPANY_ID));

  // Regua bit-exact ao plato antigo observado empiricamente em producao
  // (SQL 12/10/2026): 2026-Q4 tinha apenas 2 valores distintos, 168.42 e
  // 168.43. Pos-regeneracao canonica pelo motor v2, 2026-Q4 tem 48 valores
  // distintos em [101.41, 201.06] — nenhum em [168.42, 168.43] por
  // construcao do histograma do fixture regenerado (confirmado em testes
  // unit).
  const linhasEmPlatoAnterior = linhasPre.filter((r) => {
    if (r.trimestre !== '2026-Q4' || r.percMetaAtingida === null) {
      return false;
    }
    const n = Number(r.percMetaAtingida);
    return Number.isFinite(n) && n >= 168.42 && n <= 168.43;
  }).length;

  if (linhasEmPlatoAnterior === 0) {
    return {
      alreadyFixed: true,
      linhasPreExistentes: linhasPre.length,
      linhasEmPlatoAnterior,
      scoresDeletados: 0,
      scoresInseridos: 0,
    };
  }

  // Carrega fixture canonico pos-ME-1.4b bit-exact (SHA-256 revalidado
  // automaticamente pelo loader via manifest.sha256.ts).
  const perfTrimJson = loadFixture<Array<Record<string, unknown>>>('performance_trimestral.json');

  // Reaproveita o mapper canonico de `loadFixtures.ts` (L125 RV-14 —
  // fonte unica de verdade para o shape de cada linha).
  const scoresRows = perfTrimJson.data.map((r) => mapPerfTrimToRow(r));

  let deletados = 0;
  let inseridos = 0;
  await db.transaction(async (tx) => {
    const deleteResult = await tx
      .delete(performanceQuarterlyData)
      .where(eq(performanceQuarterlyData.companyId, NATIVA_COMPANY_ID));
    deletados = (deleteResult as unknown as { rowsAffected?: number }).rowsAffected ?? 0;

    await tx.insert(performanceQuarterlyData).values(scoresRows);
    inseridos = scoresRows.length;
  });

  return {
    alreadyFixed: false,
    linhasPreExistentes: linhasPre.length,
    linhasEmPlatoAnterior,
    scoresDeletados: deletados,
    scoresInseridos: inseridos,
  };
}
