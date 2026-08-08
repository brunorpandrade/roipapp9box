// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/submit-profile-assessment/route.ts` (ME-070, padrao
// S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, motor (Facade DI), tipo `SubmitProfileAssessmentSuccess`,
// funcoes puras `todosOs80Presentes` e `todosOs10BlocosConcluidos`,
// junto com escape hatches de teste (`__set*`), migram para modulo
// irmao. Zero mudanca de comportamento, autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*` consumidos por `./route.ts` (POST).
// - `SubmitProfileAssessmentSuccess` consumido por `./route.ts` e
//   `tests/integration/portal-submit-profile-assessment.test.ts`
//   (import tipo).
// - `todosOs80Presentes` + `todosOs10BlocosConcluidos` consumidas por
//   `./route.ts` e teste.
// - `getDbClient` + `getNowFn` + `getPortalSubmitProfileAssessmentEngine`
//   consumidos por `./route.ts` (POST).
// - `__setPortalSubmitProfileAssessmentDbClient` +
//   `__setPortalSubmitProfileAssessmentNow` +
//   `__setPortalSubmitProfileAssessmentEngine` consumidos por
//   `tests/integration/portal-submit-profile-assessment.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  DEFAULT_INDIVIDUAL_PROFILE_ENGINE,
  itemKey,
  NUM_BLOCOS_TOTAL,
  NUM_ITENS_TOTAL,
  type IndividualProfileEngineFacade,
  type IndividualProfileEngineMotivo,
} from '../../../../server/services/individualProfileEngine';

// ============================================================
// Mensagens canonicas
// ============================================================

export const MSG_MISSING_TOKEN = 'Sessão ausente.';
export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';
export const MSG_BODY_MALFORMED = 'Requisição malformada.';
export const MSG_ASSESSMENT_NAO_ENCONTRADO = 'Tentativa não encontrada.';
export const MSG_ASSESSMENT_TITULAR_MISMATCH = 'Tentativa não pertence ao titular.';
export const MSG_ASSESSMENT_JA_ENVIADA = 'Tentativa já foi enviada.';
export const MSG_ASSESSMENT_INCOMPLETO =
  'Todos os 10 blocos precisam estar concluídos antes do envio.';
export const MSG_UNEXPECTED = 'Erro ao processar o envio do questionário.';

// ============================================================
// Cliente DB e DI para testes
// ============================================================

let dbClient: RoipDbClient | null = null;

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

export function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

/** Hook interno para testes. */
export function __setPortalSubmitProfileAssessmentDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

/** Hook interno para testes. */
export function __setPortalSubmitProfileAssessmentNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Motor injetavel (Facade DI — S105/S060 replicado)
// ============================================================

let engine: IndividualProfileEngineFacade = DEFAULT_INDIVIDUAL_PROFILE_ENGINE;

export function getPortalSubmitProfileAssessmentEngine(): IndividualProfileEngineFacade {
  return engine;
}

/**
 * Hook interno para testes substituirem o motor por spy/isolamento.
 * Passar `null` restaura o `DEFAULT_INDIVIDUAL_PROFILE_ENGINE`.
 */
export function __setPortalSubmitProfileAssessmentEngine(
  next: IndividualProfileEngineFacade | null,
): void {
  engine = next ?? DEFAULT_INDIVIDUAL_PROFILE_ENGINE;
}

// ============================================================
// Retornos canonicos
// ============================================================

/** Corpo canonico 200 do submit. */
export interface SubmitProfileAssessmentSuccess {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  assessmentId: number;
  tentativa: number;
  motivo: IndividualProfileEngineMotivo;
  status: 'enviado' | 'inconsistente';
  confiabilidadeNivel: 'alta' | 'moderada' | 'baixa';
  ia_att: number;
  ia_soc: number;
  ia_acq: number;
  ia_cons: number;
  ia_ext: number;
  enviadoEm: string;
  exibirConfirmacaoAte: string;
}

// ============================================================
// Helpers de completude
// ============================================================

/**
 * Valida que os 80 itens estao presentes no record de respostas.
 * Nao valida tipo/valor por item — o motor faz o dispatch canonico
 * na Camada 2 (defesa canonica: itens fora de range viram 0 pontos
 * no `computeItemScoreLikert`).
 */
export function todosOs80Presentes(respostas: Record<string, unknown>): boolean {
  for (let item = 1; item <= NUM_ITENS_TOTAL; item += 1) {
    if (!(itemKey(item) in respostas)) return false;
  }
  return true;
}

/**
 * Valida que os 10 blocos foram concluidos (`blocosCompletos` cobre
 * [1..10]).
 */
export function todosOs10BlocosConcluidos(blocosCompletos: readonly number[]): boolean {
  const set = new Set(blocosCompletos);
  for (let b = 1; b <= NUM_BLOCOS_TOTAL; b += 1) {
    if (!set.has(b)) return false;
  }
  return true;
}
