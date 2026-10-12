// ROIP APP 9BOX — reprojecao canonica restrita de performanceQuarterlyData
// da Nativa (ME-1.4b — regeneracao do fixture via motor v2 TS canonico).
//
// Escopo: apagar as linhas de performanceQuarterlyData onde companyId=1 e
// reinserir as 415 linhas canonicas via mapper + fixture regenerado em
// ME-1.4b (dispersao real por scoreDesempenho / nivelHierarquico).
//
// NAO TOCA na Ubatuba (companyId=2) nem na Embrastec (companyId=3). Todo
// DELETE e restrito por WHERE companyId=1.
//
// Idempotente: segunda execucao detecta estado ja corrigido (zero linhas
// em 2026-Q4 na faixa 168.40-168.45) e retorna sem tocar o banco.
//
// Prerrequisito: DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// Uso: `npm run reproject:nativa:performance-quarterly`.
//
// IMPORTANTE: Nativa e demo pre-primeiro-cliente; nenhum dado real de
// cliente nessa companyId.

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  reprojectNativaPerformanceQuarterly,
  type ReprojectPerformanceQuarterlyResult,
} from '../src/db/seed/nativa/reprojectPerformanceQuarterly';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log(
    '[reproject-nativa-pq] iniciando reprojecao de performanceQuarterlyData (companyId=1)...',
  );

  const client = createDbClient(databaseUrl);
  try {
    const result: ReprojectPerformanceQuarterlyResult = await reprojectNativaPerformanceQuarterly(
      client.db,
    );
    if (result.alreadyFixed) {
      console.log(
        `[reproject-nativa-pq] IDEMPOTENTE: estado ja corrigido ` +
          `(${result.linhasPreExistentes} linhas pre-existentes, ` +
          `0 em plato 168.40-168.45). Nada a fazer.`,
      );
    } else {
      console.log(
        `[reproject-nativa-pq] OK: ${result.linhasEmPlatoAnterior} linhas em plato 168.4 ` +
          `detectadas antes do fix; ${result.scoresDeletados} linhas deletadas, ` +
          `${result.scoresInseridos} linhas inseridas via motor v2 canonico.`,
      );
    }
  } finally {
    await closeDbClient(client);
  }
}

main().catch((err: unknown) => {
  console.error(`FAIL reproject-nativa-pq: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
