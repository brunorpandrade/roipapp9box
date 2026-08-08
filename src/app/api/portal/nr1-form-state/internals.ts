// ROIP APP 9BOX — Modulo canonico `internals.ts` irmao de
// `/api/portal/nr1-form-state/route.ts` (ME-070, padrao S366).
//
// Origem canonica S366 (ME-069, aplicacao bulk ME-070): Route Handler
// Next 15 App Router aceita apenas exports HTTP canonicos + Route
// Segment Config. Constantes de mensagem, estado privado dbClient,
// relogio, tipos de payload, funcao auxiliar publica `montarGridCanonicoNr1`
// e escape hatches de teste (`__set*`) migram para modulo irmao. Zero
// mudanca de comportamento, autorizacao, SQL ou payload.
//
// RV-13: cada export tem chamador:
// - `MSG_*_NR1_FORM` + `MSG_AVISO_INICIO_NR1` consumidos por `./route.ts`.
// - `ItemGridNr1` + `Nr1FormStateSuccess` consumidos por `./route.ts`
//   e `tests/integration/portal-nr1-form-state.test.ts` (import de tipo).
// - `montarGridCanonicoNr1` consumida por `./route.ts` e teste.
// - `getDbClient` + `getNowFn` consumidos por `./route.ts`.
// - `__setPortalNr1FormStateDbClient` + `__setPortalNr1FormStateNow`
//   consumidos por `tests/integration/portal-nr1-form-state.test.ts`.
// - `resolveDatabaseUrl` consumido por `getDbClient` (mesmo modulo).

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import {
  FATORES_NR1,
  NUM_ITENS_POR_FATOR_NR1,
} from '../../../../server/services/nr1CalculationEngine';

// ============================================================
// Mensagens canonicas (paralelas aos demais handlers de portal)
// ============================================================

/** Token ausente no body -> 400. */
export const MSG_MISSING_TOKEN_NR1_FORM = 'Sessão ausente.';

/** Token invalido -> 401. */
export const MSG_INVALID_TOKEN_NR1_FORM = 'Sessão inválida. Faça a identificação novamente.';

/** Token expirado -> 401. */
export const MSG_EXPIRED_TOKEN_NR1_FORM = 'Sessão expirada. Faça a identificação novamente.';

/** Body malformado -> 400. */
export const MSG_BODY_MALFORMED_NR1_FORM = 'Requisição malformada.';

/** S239 — C-level nao participa do Radar NR-1 -> 403. */
export const MSG_CLEVEL_NAO_RESPONDE_NR1 =
  'O Radar NR-1 é respondido apenas por colaboradores da empresa.';

/** §3.13 — colaborador inativado -> 403. */
export const MSG_EMPLOYEE_INATIVO_NR1 = 'Colaborador inativo não pode responder o Radar NR-1.';

/** Guard cruzado de empresa -> 403. */
export const MSG_COMPANY_MISMATCH_NR1 = 'Sessão fora do escopo da empresa.';

/** Erro inesperado -> 500. */
export const MSG_UNEXPECTED_NR1_FORM = 'Erro ao ler o estado do questionário.';

/**
 * §11.4 — modal de aviso obrigatorio ao iniciar. O texto canonico da
 * superficie pertence ao DOC 05; o backend devolve a reserva de tempo
 * minima em segundos para que a tela componha o aviso sem duplicar a
 * constante do §11.5.
 */
export const MSG_AVISO_INICIO_NR1 =
  'Reserve tempo suficiente para responder de uma só vez. ' +
  'Não há salvamento parcial: ao fechar a aba, as respostas são perdidas.';

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
export function __setPortalNr1FormStateDbClient(next: RoipDbClient | null): void {
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
export function __setPortalNr1FormStateNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos
// ============================================================

/** Item do grid canonico devolvido a tela (§11.4, §11.6). */
export interface ItemGridNr1 {
  fator: number;
  fatorNome: string;
  itemIndex: number;
  itemGlobal: number;
}

/** Corpo canonico 200 de `nr1-form-state`. */
export interface Nr1FormStateSuccess {
  companyId: number;
  employeeId: number;
  disponivel: boolean;
  cicloDbId: number | null;
  ciclo: string | null;
  dataFechamento: string | null;
  elegivel: boolean;
  jaRespondeu: boolean;
  startToken: string | null;
  avisoInicio: string;
  tempoMinimoSegundos: number;
  totalItens: number;
  itensPorFator: number;
  escalaMinima: number;
  escalaMaxima: number;
  grid: readonly ItemGridNr1[];
}

// ============================================================
// Grid canonico (§11.4 + §11.6)
// ============================================================

/**
 * Monta o grid canonico dos 32 itens na ordem de leitura da tela: 8
 * blocos de 4 itens, `itemGlobal = (fator - 1) * 4 + itemIndex`
 * (DOC 01 §11.3).
 */
export function montarGridCanonicoNr1(): readonly ItemGridNr1[] {
  const grid: ItemGridNr1[] = [];
  for (const fator of FATORES_NR1) {
    for (let itemIndex = 1; itemIndex <= NUM_ITENS_POR_FATOR_NR1; itemIndex += 1) {
      grid.push({
        fator: fator.id,
        fatorNome: fator.nome,
        itemIndex,
        itemGlobal: (fator.id - 1) * NUM_ITENS_POR_FATOR_NR1 + itemIndex,
      });
    }
  }
  return grid;
}
