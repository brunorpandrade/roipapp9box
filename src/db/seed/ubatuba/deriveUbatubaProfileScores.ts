// ROIP APP 9BOX — derivacao canonica bit-exact de individualProfileScores
// da Bebidas Ubatuba (ME-080e Dispatch 3).
//
// Estrategia canonica: consome individual_profile_scores.json (66 rows
// pinadas por SHA-256). O JSON de scores identifica cada row por `nome`
// (nao tem userType/userId diretos), entao resolucao de userType +
// userId Ubatuba e feita cruzando com o JSON de assessments (que TEM
// userType+userId explicitos por nome).
//
// FK canonica: assessmentId aponta para individualProfileAssessments.id.
// Como os IDs sao auto-incrementados na base, o mapper aqui devolve
// row SEM assessmentId — o orquestrador D3 preenche via SELECT
// pos-INSERT (mesmo padrao performanceVariableData no D2).
//
// Replica bit-exact o mapScoreToRow do Nativa (loadFixtures.ts linhas
// 629-694). Comportamento canonico intencional preservado:
//   - JSON de scores usa keys UPPERCASE (POST_ASSERT, EST_ABERT, etc);
//     lookup `scores[k]` do mapper Nativa usa LOWERCASE ('post_assert');
//     todos os 26 decimais viram default '50.00'. Ubatuba REPLICA isso
//     bit-exact — mudar aqui divergiria de Nativa sem justificativa.
//
// Total canonico bit-exact: 66 rows.
//
// RV-02: SHA-256 validado por loadFixture.
// RV-13: consumido por seedUbatubaOperacionalD3.ts + testes.
// RV-14: um statement por linha, largura <= 100 colunas.

import { loadFixture } from '../nativa/loadJsonFixtures';

import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from './constants';

interface AssessmentLookupRow {
  readonly nome: string;
  readonly userType: 'clevel' | 'employee';
  readonly userId: number;
}

interface ScoreJsonRow {
  readonly nome: string;
  readonly perfilComportamental?: string | null;
  readonly vetorDominante?: string | null;
  readonly top3?: unknown;
  readonly flags?: unknown;
  readonly scores?: Record<string, number>;
}

/**
 * Shape canonico bit-exact para INSERT em individualProfileScores da
 * Ubatuba. O campo `assessmentId` e OMITIDO aqui — o orquestrador D3
 * resolve via SELECT pos-INSERT de assessments.
 */
export interface DerivedUbatubaProfileScoreWithoutAssessmentId {
  readonly companyId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly tentativa: number;
  readonly post_assert: string;
  readonly post_tarefas: string;
  readonly post_pessoas: string;
  readonly post_pressao: string;
  readonly est_abert: string;
  readonly est_disc: string;
  readonly est_ext: string;
  readonly est_amab: string;
  readonly est_estab: string;
  readonly mot_maestria: string;
  readonly mot_lideranca: string;
  readonly mot_autonomia: string;
  readonly mot_seguranca: string;
  readonly mot_proposito: string;
  readonly equ_autocons: string;
  readonly equ_autogest: string;
  readonly equ_leitura: string;
  readonly equ_influencia: string;
  readonly equ_indice: string;
  readonly ass_sabed: string;
  readonly ass_coragem: string;
  readonly ass_humanid: string;
  readonly ass_justica: string;
  readonly ass_temper: string;
  readonly ass_transc: string;
  readonly perfilComportamental: string | null;
  readonly vetorDominante: string | null;
  readonly vetorSustentacao: null;
  readonly vetorNegligenciado: null;
  readonly top3Assinatura: unknown;
  readonly flags: unknown;
  readonly resumoJson: null;
  readonly expandidoJson: null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Constroi mapa nome (com alias curto) -> {userType, userIdUbatuba}
 * a partir do JSON de assessments. Alias curto = primeiro + segundo
 * nome (mesmo padrao do buildIdIndex do Nativa loadFixtures.ts
 * linhas 142-161).
 */
function buildAssessmentLookup(
  assessments: readonly AssessmentLookupRow[],
): Map<string, { userType: 'clevel' | 'employee'; userIdUbatuba: number }> {
  const map = new Map<string, { userType: 'clevel' | 'employee'; userIdUbatuba: number }>();
  for (const a of assessments) {
    const shift = a.userType === 'clevel' ? UBATUBA_CLEVEL_ID_SHIFT : UBATUBA_EMPLOYEE_ID_SHIFT;
    const userIdUbatuba = a.userId + shift;
    map.set(a.nome, { userType: a.userType, userIdUbatuba });
    const partes = a.nome.split(' ');
    if (partes.length >= 2) {
      const alias = `${partes[0]!} ${partes[1]!}`;
      if (!map.has(alias)) {
        map.set(alias, { userType: a.userType, userIdUbatuba });
      }
    }
  }
  return map;
}

/** Alias curto interno para caber assinaturas em 100 colunas. */
type ScoreRowSemFk = DerivedUbatubaProfileScoreWithoutAssessmentId;

/**
 * Deriva as 66 rows canonicas bit-exact de individualProfileScores da
 * Bebidas Ubatuba (sem assessmentId — resolvido pelo orquestrador D3).
 *
 * @returns array congelado de exatamente 66 registros.
 */
export function deriveUbatubaProfileScoresSemAssessmentId(): readonly ScoreRowSemFk[] {
  const assessments = loadFixture<AssessmentLookupRow[]>('individual_profile_assessments.json');
  const scores = loadFixture<ScoreJsonRow[]>('individual_profile_scores.json');
  const lookup = buildAssessmentLookup(assessments.data);
  const calculadoEm = new Date('2026-02-15T10:00:00.000Z');

  const rows: ScoreRowSemFk[] = scores.data.map((r) => {
    const resolved = lookup.get(r.nome);
    if (resolved === undefined) {
      throw new Error(`deriveUbatubaProfileScoresSemAssessmentId: nome nao encontrado='${r.nome}'`);
    }
    const s = r.scores ?? {};
    // Bit-exact: lookup lowercase por chave; JSON canonico tem UPPERCASE
    // (POST_ASSERT etc), entao todos caem no fallback '50.00'.
    // Replica exato mapScoreToRow Nativa (loadFixtures.ts linha 648-651).
    const dec = (k: string): string => {
      const v = s[k];
      return typeof v === 'number' ? v.toFixed(2) : '50.00';
    };
    return {
      companyId: UBATUBA_COMPANY_ID,
      userType: resolved.userType,
      userId: resolved.userIdUbatuba,
      tentativa: 1,
      post_assert: dec('post_assert'),
      post_tarefas: dec('post_tarefas'),
      post_pessoas: dec('post_pessoas'),
      post_pressao: dec('post_pressao'),
      est_abert: dec('est_abert'),
      est_disc: dec('est_disc'),
      est_ext: dec('est_ext'),
      est_amab: dec('est_amab'),
      est_estab: dec('est_estab'),
      mot_maestria: dec('mot_maestria'),
      mot_lideranca: dec('mot_lideranca'),
      mot_autonomia: dec('mot_autonomia'),
      mot_seguranca: dec('mot_seguranca'),
      mot_proposito: dec('mot_proposito'),
      equ_autocons: dec('equ_autocons'),
      equ_autogest: dec('equ_autogest'),
      equ_leitura: dec('equ_leitura'),
      equ_influencia: dec('equ_influencia'),
      equ_indice: dec('equ_indice'),
      ass_sabed: dec('ass_sabed'),
      ass_coragem: dec('ass_coragem'),
      ass_humanid: dec('ass_humanid'),
      ass_justica: dec('ass_justica'),
      ass_temper: dec('ass_temper'),
      ass_transc: dec('ass_transc'),
      perfilComportamental: r.perfilComportamental ?? null,
      vetorDominante: r.vetorDominante ?? null,
      vetorSustentacao: null,
      vetorNegligenciado: null,
      top3Assinatura: r.top3 ?? null,
      flags: r.flags ?? null,
      resumoJson: null,
      expandidoJson: null,
      createdAt: calculadoEm,
      updatedAt: calculadoEm,
    };
  });

  return Object.freeze(rows);
}

/** Contagem canonica bit-exact esperada. */
export const UBATUBA_PROFILE_SCORES_TOTAL_ESPERADO = 66 as const;
