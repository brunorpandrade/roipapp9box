// ROIP APP 9BOX — script one-shot canonico de reprocessamento
// dos agregados de Clima e Engajamento da Bebidas Ubatuba
// (ME-B2-01a.3).
//
// Origem canonica: os dados persistidos em `climateEngagementData` da
// Ubatuba em producao foram gravados antes da correcao canonica
// §9.4 (ME-B2-01a.1.2 — motor `climateCalculationEngine` passou a
// usar `notaClima = media(scoreA)/10` em escala 0-10 em vez de
// media das respostas Likert brutas em escala 0-4). Como o motor
// so regrava agregados quando disparado (hook §9.10 S170 apos
// gravacao de scoreA OU proc admin `recalculateAggregates`), os
// agregados anteriores permanecem na escala antiga ate que este
// reprocessamento seja executado.
//
// Este script chama `recalculateAggregates` para os 4 trimestres
// canonicos da fixture Ubatuba (§9.10 idempotente por construcao).
// Cada chamada substitui bit-a-bit os agregados vigentes pela
// versao canonica atual do motor, alinhando os dados de producao
// com a escala 0-10 §9.4 e com o grid canonico S176 estendido
// (empresa + departamentos + equipes employee + equipes C-level).
//
// Idempotencia canonica (S172/S172b): rodar 2x produz o mesmo grid
// bit-a-bit. Seguro contra re-execucao acidental.
//
// Execucao canonica (Bruno):
//   DATABASE_URL="mysql://..." npx tsx scripts/reprocess-climate-ubatuba.ts
//
// Validacao empirica canonica pos-execucao (Railway Console):
//   SELECT notaClima FROM climateEngagementData
//   WHERE companyId = 2 AND escopo = 'empresa'
//   ORDER BY trimestre;
//   -- Esperado: notaClima em torno de 7.44 (0-10), nao ~3.9 (0-4).
//
// RV-13: chamador direto (auto-executavel via IIFE async — mesmo
// padrao canonico de `scripts/reset-reseed-ubatuba.ts`).

import { closeDbClient, createDbClient } from '../src/db/client';
import { UBATUBA_CLIMATE_TRIMESTRES } from '../src/db/seed/ubatuba/deriveClimateEngagementData';
import { UBATUBA_COMPANY_ID } from '../src/db/seed/ubatuba/constants';
import { recalculateAggregates } from '../src/server/services/climateCalculationEngine';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log(
    `[reprocess-climate-ubatuba] Iniciando. Company alvo: id=${UBATUBA_COMPANY_ID} ` +
      `(Bebidas Ubatuba). Trimestres canonicos: ${UBATUBA_CLIMATE_TRIMESTRES.join(', ')}.`,
  );

  const client = createDbClient(url);
  const now = new Date();

  try {
    for (const trimestre of UBATUBA_CLIMATE_TRIMESTRES) {
      console.log(`[reprocess-climate-ubatuba] Reprocessando trimestre ${trimestre}...`);
      const result = await recalculateAggregates(client.db, UBATUBA_COMPANY_ID, trimestre, now);
      console.log(
        `[reprocess-climate-ubatuba]   OK ${trimestre}: ${result.escopos.length} escopo(s) ` +
          `canonicamente processado(s).`,
      );
    }

    console.log('[reprocess-climate-ubatuba] Reprocessamento canonico concluido.');
    console.log('[reprocess-climate-ubatuba] Validar em producao via query:');
    console.log(
      '[reprocess-climate-ubatuba]   SELECT notaClima FROM climateEngagementData ' +
        "WHERE companyId = 2 AND escopo = 'empresa' ORDER BY trimestre;",
    );
    console.log('[reprocess-climate-ubatuba] Esperado: notaClima em torno de 7.4 (escala 0-10).');
  } catch (err) {
    console.error('[reprocess-climate-ubatuba] FAIL: excecao durante reprocessamento.');
    console.error(err);
    await closeDbClient(client);
    process.exit(3);
  }

  await closeDbClient(client);
  process.exit(0);
}

main().catch((err) => {
  console.error('[reprocess-climate-ubatuba] FAIL: excecao nao tratada no main.');
  console.error(err);
  process.exit(1);
});
