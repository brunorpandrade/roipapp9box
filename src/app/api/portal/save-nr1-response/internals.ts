// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/save-nr1-response/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, tipo `SaveNr1ResponseSuccess`, funcao auxiliar publica
// `normalizeRespostasNr1` e escape hatches de teste (`__set*`) migram
// para modulo irmao. Zero mudanca de comportamento, autorizacao, SQL
// ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*_NR1_SAVE` + variantes consumidos por `./route.ts` (POST).
// - `SaveNr1ResponseSuccess` consumido por `./route.ts` e
//   `tests/integration/portal-save-nr1-response.test.ts` (import tipo).
// - `normalizeRespostasNr1` consumida por `./route.ts` e teste.
// - `getDbClient` + `getNowFn` consumidos por `./route.ts` (POST).
// - `__setPortalSaveNr1ResponseDbClient` +
//   `__setPortalSaveNr1ResponseNow` consumidos por
//   `tests/integration/portal-save-nr1-response.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  type ItemRespostaNr1,
  VALOR_MAXIMO_NR1,
  VALOR_MINIMO_NR1,
} from '../../../../server/services/nr1CalculationEngine';

// ============================================================
// Mensagens canonicas
// ============================================================

/** Token ausente no body -> 400. */
export const MSG_MISSING_TOKEN_NR1_SAVE = 'Sessão ausente.';

/** Token invalido -> 401. */
export const MSG_INVALID_TOKEN_NR1_SAVE = 'Sessão inválida. Faça a identificação novamente.';

/** Token expirado -> 401. */
export const MSG_EXPIRED_TOKEN_NR1_SAVE = 'Sessão expirada. Faça a identificação novamente.';

/** Body malformado -> 400. */
export const MSG_BODY_MALFORMED_NR1_SAVE = 'Requisição malformada.';

/** §11.4 — grid incompleto ou fora da escala -> 400. */
export const MSG_ITENS_INCOMPLETOS_NR1 =
  'É necessário responder os 32 itens do Radar NR-1 com valores de 0 a 4.';

/** S239 — C-level nao participa -> 403. */
export const MSG_CLEVEL_NAO_RESPONDE_NR1_SAVE =
  'O Radar NR-1 é respondido apenas por colaboradores da empresa.';

/** §3.13 — colaborador inativado -> 403. */
export const MSG_EMPLOYEE_INATIVO_NR1_SAVE = 'Colaborador inativo não pode responder o Radar NR-1.';

/** Guard cruzado de empresa -> 403. */
export const MSG_COMPANY_MISMATCH_NR1_SAVE = 'Sessão fora do escopo da empresa.';

/** §11.2 — ciclo inexistente ou fora do escopo -> 404. */
export const MSG_CICLO_NAO_ENCONTRADO_NR1_SAVE = 'Ciclo do Radar NR-1 não encontrado.';

/** §11.2 — ciclo que nao esta aberto -> 409. */
export const MSG_CICLO_NAO_ABERTO_NR1 = 'O ciclo do Radar NR-1 não está aberto para respostas.';

/**
 * §11.15 — mensagem canonica EXATA da submissao apos 00:00 da data de
 * fechamento. HTTP 409.
 */
export const MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1 =
  'O ciclo do Radar NR-1 foi encerrado enquanto você preenchia. ' +
  'Suas respostas não puderam ser salvas.';

/** §11.2 — colaborador fora do snapshot de elegiveis -> 403. */
export const MSG_SEM_SNAPSHOT_NR1 = 'Colaborador não elegível para este ciclo do Radar NR-1.';

/** §11.4 — resposta ja registrada -> 409. */
export const MSG_JA_RESPONDIDO_NR1 = 'Você já respondeu o Radar NR-1 neste ciclo.';

/** Erro inesperado -> 500. */
export const MSG_UNEXPECTED_NR1_SAVE = 'Erro ao gravar a resposta.';

// ============================================================
// Cliente DB e DI para testes (S036)
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

/** Hook interno para testes substituirem o client (S036). */
export function __setPortalSaveNr1ResponseDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel (S100)
// ============================================================

let nowFn: () => Date = () => new Date();

export function getNowFn(): () => Date {
  return nowFn;
}

/** Hook interno para testes substituirem o relogio (S100). */
export function __setPortalSaveNr1ResponseNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 do save. `respostaInvalida` e `motivoInvalidade`
 * NAO viajam ao cliente: §11.5 canoniza que os controles sao
 * silenciosos e que o colaborador ve o toast padrao de sucesso.
 */
export interface SaveNr1ResponseSuccess {
  companyId: number;
  employeeId: number;
  cicloDbId: number;
  itensGravados: number;
  operacao: 'insert';
  respondidoEm: string;
}

// ============================================================
// Normalizador canonico das respostas
// ============================================================

/**
 * Normaliza a lista de respostas do body. Devolve `null` quando algum
 * item foge da forma canonica (inteiros nos ranges de §11.4).
 */
export function normalizeRespostasNr1(raw: unknown): ItemRespostaNr1[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ItemRespostaNr1[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const rec = item as Record<string, unknown>;
    const fator = rec.fator;
    const itemIndex = rec.itemIndex;
    const valor = rec.valor;
    if (typeof fator !== 'number' || !Number.isInteger(fator)) return null;
    if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex)) return null;
    if (
      typeof valor !== 'number' ||
      !Number.isInteger(valor) ||
      valor < VALOR_MINIMO_NR1 ||
      valor > VALOR_MAXIMO_NR1
    ) {
      return null;
    }
    out.push({ fator, itemIndex, valor });
  }
  return out;
}
