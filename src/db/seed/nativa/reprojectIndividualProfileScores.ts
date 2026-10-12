// ME-1.4a: reprojecao canonica restrita de `individualProfileScores` da
// Nativa (companyId=1) a partir do fixture bit-exact imutavel
// `tests/fixtures/nativa/individual_profile_scores.json`.
//
// Enquadramento canonico: §5.1 de REGRA_GERAL_RESEED_INCREMENTAL_APPEND_ONLY
// (correcao de defeito de carga por re-abertura restrita). Condicoes
// invioláveis atendidas:
//   1. Nenhum JSON de fixture e nenhuma entrada de manifest.sha256.ts e
//      alterada. A causa raiz corrigida em `normalizeScoresKeys.ts` e
//      case-mismatch no leitor, nao defeito do fixture.
//   2. Restrito a `companyId=1`. DELETE opera apenas sobre linhas da Nativa
//      em `individualProfileScores`. `individualProfileAssessments` e todas
//      as demais tabelas permanecem intactas; `assessmentId` FKs sao
//      reaproveitadas via SELECT previo.
//   3. Nativa e demo pré-primeiro-cliente, nao ha dado real de cliente.
//   4. O conserto do loader (`normalizeScoresKeys` + alteracao em
//      `mapScoreToRow`) e commitado no repositorio; esta reprojecao e
//      operacao de dados, nao vai ao repositorio.
//   5. Auditoria SQL antes/depois obrigatoria: contagens de linhas
//      inalteradas em `individualProfileAssessments`, `employees`,
//      `cLevelMembers`; colunas antes com fallback '50.00' agora populadas.
//   6. CC registrada: ME-1.4a + anexo de reconciliacao no HISTORICO POS_B8
//      V11 (apos aprovacao do gate CC067).
//
// Idempotencia canonica: antes do DELETE, verifica se o estado ja esta
// corrigido (soma de desvios padrao > 0.0 no top5/bottom5 em relacao a
// 50.00). Se ja esta diferenciado, retorna {alreadyFixed: true, ...}.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../client';
import { individualProfileAssessments, individualProfileScores } from '../../schema';
import { buildIdIndex, mapScoreToRow, NATIVA_COMPANY_ID } from './loadFixtures';
import { loadFixture } from './loadJsonFixtures';

export interface ReprojectResult {
  readonly alreadyFixed: boolean;
  readonly scoresDeletados: number;
  readonly scoresInseridos: number;
  readonly assessmentsPreservados: number;
}

/**
 * Reprojeta canonicamente a tabela `individualProfileScores` da Nativa
 * a partir do fixture bit-exact imutavel, agora via loader corrigido
 * (ME-1.4a). Operacao idempotente, restrita a `companyId=1`.
 */
export async function reprojectNativaIndividualProfileScores(
  db: RoipDatabase,
): Promise<ReprojectResult> {
  // Idempotencia: se alguma linha ja tem post_assert != 50.00, a demo esta
  // corrigida. Nenhum teardown; retorna estado atual.
  const amostraPreExistente = await db
    .select({
      id: individualProfileScores.id,
      post_assert: individualProfileScores.post_assert,
    })
    .from(individualProfileScores)
    .where(eq(individualProfileScores.companyId, NATIVA_COMPANY_ID));

  const temDiferenciacao = amostraPreExistente.some(
    (r) => r.post_assert !== null && r.post_assert !== '50.00',
  );
  if (temDiferenciacao) {
    return {
      alreadyFixed: true,
      scoresDeletados: 0,
      scoresInseridos: 0,
      assessmentsPreservados: amostraPreExistente.length,
    };
  }

  // Carrega fixture canonico bit-exact imutavel (SHA-256 revalidado).
  const scoresJson = loadFixture<Array<Record<string, unknown>>>('individual_profile_scores.json');

  // Idx canonico derivado das constantes TS (NAO toca o banco).
  const idIdx = buildIdIndex();

  // Reconstroi `assessmentIdIndex` a partir do banco preservando FKs.
  const assessmentIdRows = await db
    .select({
      id: individualProfileAssessments.id,
      userType: individualProfileAssessments.userType,
      userId: individualProfileAssessments.userId,
      tentativa: individualProfileAssessments.tentativa,
    })
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.companyId, NATIVA_COMPANY_ID));

  const assessmentIdIndex = new Map<string, number>();
  for (const a of assessmentIdRows) {
    assessmentIdIndex.set(`${a.userType}:${a.userId}:${a.tentativa}`, a.id);
  }

  // Monta as 66 linhas via mapper CORRIGIDO (normalizeScoresKeys ativo).
  const scoresRows = scoresJson.data.map((r) => mapScoreToRow(r, idIdx, assessmentIdIndex));

  // Reprojecao atomica: DELETE + INSERT na mesma transacao.
  let deletados = 0;
  let inseridos = 0;
  await db.transaction(async (tx) => {
    const deleteResult = await tx
      .delete(individualProfileScores)
      .where(eq(individualProfileScores.companyId, NATIVA_COMPANY_ID));
    deletados = (deleteResult as unknown as { rowsAffected?: number }).rowsAffected ?? 0;

    await tx.insert(individualProfileScores).values(scoresRows);
    inseridos = scoresRows.length;
  });

  return {
    alreadyFixed: false,
    scoresDeletados: deletados,
    scoresInseridos: inseridos,
    assessmentsPreservados: assessmentIdRows.length,
  };
}
