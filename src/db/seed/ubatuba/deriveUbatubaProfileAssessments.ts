// ROIP APP 9BOX — derivacao canonica bit-exact de individualProfileAssessments
// da Bebidas Ubatuba (ME-080e Dispatch 3).
//
// Estrategia canonica: consome dois JSONs pinados por SHA-256:
//   1. individual_profile_assessments.json (66 rows: 3 clevels + 63 employees)
//   2. individual_profile_responses.json (5280 rows embutidas via
//      buildRespostasIndex — 80 respostas por assessment)
// Aplica shift no userId conforme userType (clevel: +1000 sobre 1..3;
// employee: +1000 sobre 4..69). companyId=2.
//
// Replica bit-exact o mapAssessmentToRow do Nativa (loadFixtures.ts
// linhas 585-619): preserva os campos ia_att/soc/acq/cons/ext como
// nulos (comportamento canonico Nativa — esses valores so aparecem em
// scores, nao em assessments).
//
// Nota bit-exact: JSON canonico usa status='respondido' para
// questionarios enviados; schema aceita apenas 'em_andamento' |
// 'enviado' | 'inconsistente'. Normalizacao: 'respondido' -> 'enviado'.
//
// Total canonico bit-exact: 66 rows.
//
// RV-02: SHA-256 validado por loadFixture antes de retornar.
// RV-13: consumido por seedUbatubaOperacionalD3.ts + testes.
// RV-14: um statement por linha, largura <= 100 colunas.

import { loadFixture } from '../nativa/loadJsonFixtures';

import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from './constants';

/**
 * Shape de row do individual_profile_assessments.json.
 */
interface AssessmentJsonRow {
  readonly nome: string;
  readonly userType: 'clevel' | 'employee';
  readonly userId: number;
  readonly status?: string;
  readonly confiabilidadeNivel?: 'alta' | 'moderada' | 'baixa';
  readonly respondidoEm?: string | null;
}

/**
 * Shape de row do individual_profile_responses.json.
 */
interface ResponseJsonRow {
  readonly nome: string;
  readonly userType: 'clevel' | 'employee';
  readonly userId: number;
  readonly itemIndex: number;
  readonly valor: number;
}

/**
 * Shape canonico bit-exact para INSERT em individualProfileAssessments
 * da Ubatuba.
 */
export interface DerivedUbatubaProfileAssessment {
  readonly companyId: number;
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly tentativa: number;
  readonly status: 'em_andamento' | 'enviado' | 'inconsistente';
  readonly blocoAtual: number;
  readonly blocosCompletos: number[];
  readonly respostas: Record<string, number>;
  readonly confiabilidadeNivel: 'alta' | 'moderada' | 'baixa';
  readonly enviadoEm: Date | null;
  readonly calculadoEm: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Aplica shift canonico no userId conforme userType.
 */
function applyUserIdShift(userType: 'clevel' | 'employee', userId: number): number {
  return userType === 'clevel'
    ? userId + UBATUBA_CLEVEL_ID_SHIFT
    : userId + UBATUBA_EMPLOYEE_ID_SHIFT;
}

/**
 * Constroi o indice `{userType:userIdUbatuba} -> {ITEM_XXX -> valor}`
 * a partir das 5280 respostas do JSON, aplicando shift ja no userId.
 */
function buildRespostasIndexUbatuba(
  responses: readonly ResponseJsonRow[],
): Map<string, Record<string, number>> {
  const idx = new Map<string, Record<string, number>>();
  for (const r of responses) {
    const userIdShift = applyUserIdShift(r.userType, r.userId);
    const key = `${r.userType}:${userIdShift}`;
    let bucket = idx.get(key);
    if (bucket === undefined) {
      bucket = {};
      idx.set(key, bucket);
    }
    const itemKey = `ITEM_${String(r.itemIndex).padStart(3, '0')}`;
    bucket[itemKey] = r.valor;
  }
  return idx;
}

/**
 * Deriva as 66 rows canonicas bit-exact de individualProfileAssessments
 * da Bebidas Ubatuba. Consome os 2 JSONs pinados e aplica shift.
 *
 * @returns array congelado de exatamente 66 registros.
 */
export function deriveUbatubaProfileAssessments(): readonly DerivedUbatubaProfileAssessment[] {
  const assessments = loadFixture<AssessmentJsonRow[]>('individual_profile_assessments.json');
  const responses = loadFixture<ResponseJsonRow[]>('individual_profile_responses.json');
  const respostasIdx = buildRespostasIndexUbatuba(responses.data);

  const rows: DerivedUbatubaProfileAssessment[] = assessments.data.map((r) => {
    const userType = r.userType;
    const userIdShift = applyUserIdShift(userType, r.userId);
    const key = `${userType}:${userIdShift}`;
    const respostas = respostasIdx.get(key) ?? {};
    const enviadoEm = r.respondidoEm ? new Date(String(r.respondidoEm) + 'T10:00:00.000Z') : null;
    // Normalizacao canonica: 'respondido' -> 'enviado' (schema).
    const rawStatus = r.status ?? 'enviado';
    const normalized = rawStatus === 'respondido' ? 'enviado' : rawStatus;
    return {
      companyId: UBATUBA_COMPANY_ID,
      userType,
      userId: userIdShift,
      tentativa: 1,
      status: normalized as 'em_andamento' | 'enviado' | 'inconsistente',
      blocoAtual: 10,
      blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      respostas,
      confiabilidadeNivel: (r.confiabilidadeNivel ?? 'alta') as 'alta' | 'moderada' | 'baixa',
      enviadoEm,
      calculadoEm: enviadoEm,
      createdAt: enviadoEm ?? new Date('2026-02-15T10:00:00.000Z'),
      updatedAt: enviadoEm ?? new Date('2026-02-15T10:00:00.000Z'),
    };
  });

  return Object.freeze(rows);
}

/** Contagem canonica bit-exact esperada. */
export const UBATUBA_PROFILE_ASSESSMENTS_TOTAL_ESPERADO = 66 as const;

/** Contagem canonica bit-exact das respostas embutidas nos assessments. */
export const UBATUBA_PROFILE_RESPONSES_EMBEDDED_TOTAL_ESPERADO = 5280 as const;
