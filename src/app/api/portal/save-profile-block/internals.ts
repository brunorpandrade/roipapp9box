// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/save-profile-block/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, tipo `SaveProfileBlockSuccess`, funcoes auxiliares publicas
// `itensDoBloco` e `bloqueEstaCompleto`, junto com escape hatches de
// teste (`__set*`), migram para modulo irmao. Zero mudanca de
// comportamento, autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*` consumidos por `./route.ts` (POST).
// - `SaveProfileBlockSuccess` consumido por `./route.ts` e
//   `tests/integration/portal-save-profile-block.test.ts` (import tipo).
// - `itensDoBloco` + `bloqueEstaCompleto` consumidas por `./route.ts`
//   e teste.
// - `getDbClient` + `getNowFn` consumidos por `./route.ts`.
// - `__setPortalSaveProfileBlockDbClient` +
//   `__setPortalSaveProfileBlockNow` consumidos por
//   `tests/integration/portal-save-profile-block.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { itemKey, NUM_ITENS_POR_BLOCO } from '../../../../server/services/individualProfileEngine';

// ============================================================
// Mensagens canonicas
// ============================================================

export const MSG_MISSING_TOKEN = 'Sessão ausente.';
export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';
export const MSG_BODY_MALFORMED = 'Requisição malformada.';
export const MSG_ASSESSMENT_NAO_ENCONTRADO = 'Tentativa não encontrada.';
export const MSG_ASSESSMENT_TITULAR_MISMATCH = 'Tentativa não pertence ao titular.';
export const MSG_ASSESSMENT_NAO_EM_ANDAMENTO =
  'Tentativa não está em preenchimento (já enviada ou inconsistente).';
export const MSG_BLOCO_FORA_DE_RANGE = 'Bloco fora do intervalo canônico (1 a 10).';
export const MSG_BLOCO_INCOMPLETO = 'Todos os 8 itens do bloco precisam estar respondidos.';
export const MSG_BLOCO_JA_COMPLETO_TRAVADO =
  'Bloco já concluído. Só é possível voltar 1 bloco a partir do bloco atual.';
export const MSG_UNEXPECTED = 'Erro ao gravar o progresso do bloco.';

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
export function __setPortalSaveProfileBlockDbClient(next: RoipDbClient | null): void {
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
export function __setPortalSaveProfileBlockNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos
// ============================================================

export interface SaveProfileBlockSuccess {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  assessmentId: number;
  blocoAtual: number;
  blocosCompletos: readonly number[];
  totalBlocos: number;
}

// ============================================================
// Helpers de bloco (puros)
// ============================================================

/**
 * Retorna o intervalo canonico de itens (1..80) que o bloco N cobre.
 * Bloco 1 -> [1..8]; Bloco 2 -> [9..16]; ...; Bloco 10 -> [73..80].
 */
export function itensDoBloco(bloco: number): readonly number[] {
  const inicio = (bloco - 1) * NUM_ITENS_POR_BLOCO + 1;
  const out: number[] = [];
  for (let i = 0; i < NUM_ITENS_POR_BLOCO; i += 1) out.push(inicio + i);
  return out;
}

/**
 * Valida que todos os 8 itens do bloco estao presentes no payload
 * de respostas do bloco (record de `ITEM_XXX` -> `string | number`).
 * Nao valida tipo/valor por item — a Camada 2 do motor faz o dispatch.
 */
export function bloqueEstaCompleto(
  bloco: number,
  respostasBloco: Record<string, unknown>,
): boolean {
  const itens = itensDoBloco(bloco);
  for (const item of itens) {
    if (!(itemKey(item) in respostasBloco)) return false;
    const v = respostasBloco[itemKey(item)];
    if (v === null || v === undefined) return false;
  }
  return true;
}
