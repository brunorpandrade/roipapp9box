// ROIP APP 9BOX — Route Handler `POST /api/portal/nr1-form-state`
// (ME-049cd; DOC 03 §11.4 estados canonicos do questionario no portal).
//
// Precedente direto: `POST /api/portal/profile-form-state` da ME-049a
// (S197/S207 — o portal e autenticado por `portalToken`, nunca por
// tRPC). Este handler carrega a tela do questionario do Radar NR-1 e,
// no mesmo retorno, EMITE o `nr1StartToken` assinado que sustenta o
// controle anti-fraude "tempo baixo" do §11.5 (S236, estreitamento de
// S215 aprovado por Bruno): o instante de abertura da tela viaja
// assinado (HS256) em vez de ser persistido em coluna inexistente no
// DOC 01, e o `save-nr1-response` calcula o tempo decorrido no
// servidor.
//
// Escopo canonico devolvido (§11.4):
//   - `disponivel`: ha ciclo `aberto` na empresa E o titular esta no
//     snapshot de elegiveis E ainda nao respondeu. So nesse caso o
//     `startToken` e emitido — o card `[Radar NR-1]` do portal aparece
//     exatamente sob essas condicoes (§11.2 itens 4 e 3).
//   - grid canonico dos 32 itens (8 fatores x 4 itens) com o nome
//     literal de cada fator (§11.6) e a escala 0-4 (§11.4), para que a
//     tela renderize os 8 blocos sem duplicar a tabela canonica.
//
// S239 — C-level nao responde o Radar NR-1: restricao ARQUITETURAL do
// DOC 01 (`copsoqCycleSnapshot.employeeId` e `copsoq_responses.
// employeeId` sao FK NOT NULL para `employees.id`, e C-level vive em
// `cLevelMembers`). Titular `clevel` recebe 403 canonico — mesmo
// tratamento do Bloqueio 3 do Instrumento D (ME-046).
//
// Sem salvamento parcial (§11.4): este handler NAO cria linha alguma.
// Ele so le estado e assina o token de inicio.
//
// Convencoes canonicas herdadas:
//   - DI setters (S036): `__setPortalNr1FormStateDbClient` e
//     `__setPortalNr1FormStateNow`.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador em
//     `tests/integration/portal-nr1-form-state.test.ts` (RV-13).

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { copsoqCycles, copsoqCycleSnapshot, employees } from '../../../../db/schema';
import { signNr1StartToken } from '../../../../server/auth/nr1StartToken';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  dataCivilDeColunaNr1,
  FATORES_NR1,
  NUM_ITENS_POR_FATOR_NR1,
  NUM_ITENS_TOTAL_NR1,
  TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1,
  VALOR_MAXIMO_NR1,
  VALOR_MINIMO_NR1,
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

function getDbClient(): RoipDbClient {
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

// ============================================================
// Body parsing
// ============================================================

interface RequestBody {
  portalToken: unknown;
}

// ============================================================
// Handler canonico
// ============================================================

export async function POST(req: Request): Promise<NextResponse> {
  // -------- 1) Parse body --------
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ msg: MSG_BODY_MALFORMED_NR1_FORM }, { status: 400 });
  }

  const rawToken = body.portalToken;
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN_NR1_FORM }, { status: 400 });
  }

  // -------- 2) Verifica portalToken --------
  const verified = await verifyPortalToken(rawToken);
  if (!verified.valid) {
    const msg =
      verified.reason === 'expired' ? MSG_EXPIRED_TOKEN_NR1_FORM : MSG_INVALID_TOKEN_NR1_FORM;
    return NextResponse.json({ msg }, { status: 401 });
  }

  const { companyId, titularType, titularId } = verified.claims;

  // -------- 3) S239 — C-level nao participa --------
  if (titularType !== 'employee') {
    return NextResponse.json({ msg: MSG_CLEVEL_NAO_RESPONDE_NR1 }, { status: 403 });
  }

  const { db } = getDbClient();
  const now = nowFn();

  try {
    // -------- 4) Guard cruzado e status do colaborador --------
    const [emp] = await db.select().from(employees).where(eq(employees.id, titularId)).limit(1);
    if (!emp || emp.companyId !== companyId) {
      return NextResponse.json({ msg: MSG_COMPANY_MISMATCH_NR1 }, { status: 403 });
    }
    if (emp.status === 'inativo') {
      return NextResponse.json({ msg: MSG_EMPLOYEE_INATIVO_NR1 }, { status: 403 });
    }

    const grid = montarGridCanonicoNr1();
    const base = {
      companyId,
      employeeId: titularId,
      avisoInicio: MSG_AVISO_INICIO_NR1,
      tempoMinimoSegundos: TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1,
      totalItens: NUM_ITENS_TOTAL_NR1,
      itensPorFator: NUM_ITENS_POR_FATOR_NR1,
      escalaMinima: VALOR_MINIMO_NR1,
      escalaMaxima: VALOR_MAXIMO_NR1,
      grid,
    };

    // -------- 5) Ciclo aberto da empresa (§11.2) --------
    const [ciclo] = await db
      .select()
      .from(copsoqCycles)
      .where(and(eq(copsoqCycles.companyId, companyId), eq(copsoqCycles.status, 'aberto')))
      .limit(1);

    if (!ciclo) {
      const semCiclo: Nr1FormStateSuccess = {
        ...base,
        disponivel: false,
        cicloDbId: null,
        ciclo: null,
        dataFechamento: null,
        elegivel: false,
        jaRespondeu: false,
        startToken: null,
      };
      return NextResponse.json(semCiclo, { status: 200 });
    }

    // -------- 6) Elegibilidade pelo snapshot (§11.2) --------
    const [linhaSnapshot] = await db
      .select()
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.cicloDbId, ciclo.id),
          eq(copsoqCycleSnapshot.employeeId, titularId),
        ),
      )
      .limit(1);

    const elegivel = linhaSnapshot !== undefined && linhaSnapshot.inativadoAposSnapshot !== true;
    const jaRespondeu = linhaSnapshot?.respondeu === true;
    const disponivel = elegivel && !jaRespondeu;

    // -------- 7) Token de inicio assinado (§11.5 / S236) --------
    const startToken = disponivel
      ? await signNr1StartToken({ companyId, employeeId: titularId, cicloDbId: ciclo.id }, now)
      : null;

    const corpo: Nr1FormStateSuccess = {
      ...base,
      disponivel,
      cicloDbId: ciclo.id,
      ciclo: ciclo.ciclo,
      dataFechamento: dataCivilDeColunaNr1(ciclo.dataFechamento),
      elegivel,
      jaRespondeu,
      startToken,
    };
    return NextResponse.json(corpo, { status: 200 });
  } catch {
    return NextResponse.json({ msg: MSG_UNEXPECTED_NR1_FORM }, { status: 500 });
  }
}
