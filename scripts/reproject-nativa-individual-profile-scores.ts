// ROIP APP 9BOX — reprojecao canonica restrita de individualProfileScores
// da Nativa (ME-1.4a — correcao de defeito de carga por re-abertura
// restrita §5.1 de REGRA_GERAL_RESEED_INCREMENTAL_APPEND_ONLY).
//
// Escopo: apagar as linhas de individualProfileScores onde companyId=1 e
// reinserir as 66 linhas canonicas via loader corrigido
// (normalizeScoresKeys + mapScoreToRow). NAO toca em
// individualProfileAssessments, individualProfilePlaceholders,
// individualProfileResponses, employees, cLevelMembers, nem qualquer outra
// tabela.
//
// NAO TOCA na Ubatuba (companyId=2) nem na Embrastec (companyId=3) nem no
// super-admin. Todo DELETE e restrito por WHERE companyId=1.
//
// Idempotente (CC079 patch): segunda execucao detecta estado ja corrigido
// (zero linhas com post_assert = '50.00') e retorna sem tocar o banco. A
// primeira versao da regua gerava falso positivo porque os 7 overrides
// canonicos ja gravam post_assert != 50 mesmo no estado antigo.
//
// Prerrequisito: DATABASE_URL obrigatoria; aborta com RC=2 se ausente.
// Uso: `npm run reproject:nativa:individual-profile-scores`.
//
// IMPORTANTE: Nativa e demo pre-primeiro-cliente; nenhum dado real de
// cliente nessa companyId.

import { closeDbClient, createDbClient } from '../src/db/client';
import {
  reprojectNativaIndividualProfileScores,
  type ReprojectResult,
} from '../src/db/seed/nativa/reprojectIndividualProfileScores';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('FAIL: variavel de ambiente DATABASE_URL nao definida. Impossivel prosseguir.');
    process.exit(2);
  }

  console.log(
    '[reproject-nativa-ips] iniciando reprojecao de individualProfileScores (companyId=1)...',
  );

  const client = createDbClient(databaseUrl);
  try {
    const result: ReprojectResult = await reprojectNativaIndividualProfileScores(client.db);
    if (result.alreadyFixed) {
      console.log(
        `[reproject-nativa-ips] IDEMPOTENTE: estado ja corrigido ` +
          `(${result.linhasPreExistentes} linhas pre-existentes, ` +
          `0 em 50.00). ${result.assessmentsPreservados} assessments ` +
          `preservados. Nada a fazer.`,
      );
    } else {
      console.log(
        `[reproject-nativa-ips] OK: ${result.linhasEm5000Pre} linhas em 50.00 ` +
          `detectadas antes do fix; ${result.scoresDeletados} linhas deletadas, ` +
          `${result.scoresInseridos} linhas inseridas. ` +
          `${result.assessmentsPreservados} assessments preservados bit-exact.`,
      );
    }
  } finally {
    await closeDbClient(client);
  }
}

main().catch((err: unknown) => {
  console.error(`FAIL reproject-nativa-ips: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
