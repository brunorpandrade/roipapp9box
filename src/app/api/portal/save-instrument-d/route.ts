// ROIP APP 9BOX — Route Handler `POST /api/portal/save-instrument-d`
// (ME-046; DOC 03 §8.8 primeira linha).
//
// Decima-setima ME do Bloco B3 (ME-046) — abre a superficie canonica
// de ESCRITA do Instrumento D. Precedente direto: Route Handler
// `POST /api/portal/save-instrument-a` da ME-039 (§6.8 primeira
// linha). Estrutura simetrica com uma diferenca crucial: o D nao
// fecha (§8.1 literal — "nao ha fechamento"), portanto NAO ha
// OVERWRITE, NAO ha `reopenResponse` e NAO ha `MSG_TRIMESTRE_FECHADO`.
// Uma vez respondido, o par (respondenteId, trimestre) e imutavel.
//
// Recebe `{ portalToken, trimestre, respostas: [{ dimensao, itemIndex,
// valor }] x 20 }` no body. Verifica assinatura + expiracao do
// portalToken, valida titular (`titularType === 'employee'` — §8.6
// Bloqueio 3 canoniza "C-level nao responde D") e status do employee
// (`ativo`), resolve o dia 16 canonico do snapshot §8.3 (S150) no
// fuso da empresa, valida elegibilidade do respondente por vinculo
// direto ativo no snapshot, rejeita 409 duplicidade e grava a
// resposta atomica de 20 registros com o avaliado (liderId OU
// clevelId) resolvido pelo snapshot.
//
// Hook canonico do motor IQL (S152/S157 herdado do S060/S105 do
// plenitude): setter `__setPortalSaveInstrumentDIqlEngine` permite
// substituir o default `DEFAULT_IQL_ENGINE` (mesma ME-046) em
// testes. Producao aponta para o motor real desta ME. Chamado
// sincrono in-band FORA da transacao (S157) apos INSERT: le todas
// as respostas de D do (avaliado, trimestre) e UPSERT em `iqlData`
// (§8.5). Reexecucao idempotente canonica (§8.5 "Reprocessamento
// retroativo").
//
// Sem rate limit dedicado — mesmo raciocinio do save do A (o gate
// LGPD e o `/api/portal/login` ja rate-limitados na ME-023 sao os
// pontos de trafego alto do portal; save do D e acao de usuario
// deliberada, nao ponto de bruteforce).
//
// Sem `getInstrumentDResponse` complementar aqui: a visao agregada
// administrativa (`getInstrumentDStatus` §8.8 segunda linha) vive
// no router `instrumentD.ts` (mesma ME). A leitura por respondente
// individual, se necessaria em ME futura, nasce como proc dedicada
// (padrao portal auto-suficiente — S095 estendido).
//
// Convencoes canonicas herdadas:
//   - DI setters (padrao S036/S105 herdado da ME-023 e ME-040): 3
//     hooks canonicos `__setPortalSaveInstrumentDDbClient`,
//     `__setPortalSaveInstrumentDNow`,
//     `__setPortalSaveInstrumentDIqlEngine`. Producao usa defaults
//     reais; testes substituem por spy/isolamento.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Transacao atomica
//     do INSERT via `db.transaction(async (tx) => ...)` (L54).
//   - Zero code dead: cada export tem chamador direto no teste
//     `tests/integration/portal-save-instrument-d.test.ts` (RV-13).
//   - L77: erros do mysql2 dentro da transacao chegam ao caller
//     externo embrulhados em DrizzleQueryError. O `try/catch` do
//     handler propaga como 500; nao ha conversao para CONFLICT
//     canonico (o cinto de duplicidade `MSG_JA_RESPONDIDO_D` e
//     verificado ANTES da transacao — a UNIQUE canonica
//     `uq_iD_unica_resposta` e defesa em ultima instancia).

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { companies, employees, instrumentD_responses } from '../../../../db/schema';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  isRespondenteValidoDia16D,
  itensCobremGridCanonicoD,
  MSG_CLEVEL_NAO_RESPONDE_D_B3,
  MSG_COMPANY_MISMATCH_D,
  MSG_EMPLOYEE_INATIVO_D,
  MSG_ITENS_INCOMPLETOS_D,
  MSG_JA_RESPONDIDO_D,
  MSG_SEM_VINCULO_SNAPSHOT_D,
  NUM_ITENS_TOTAL_D,
  resolveAvaliadoDia16D,
  resolveDia16InstrumentD,
  TRIMESTRE_SCHEMA_INSTRUMENT_D,
} from '../../../../server/routers/instrumentD';
import {
  DEFAULT_IQL_ENGINE,
  type IqlEngineFacade,
} from '../../../../server/services/iqlCalculationEngine';

// ============================================================
// Mensagens canonicas de token (paralelas ao save-instrument-a)
// ============================================================

/** Token ausente no body -> 400 (§4.3 padrao portal). */
export const MSG_MISSING_TOKEN = 'Sessão ausente.';

/** Token invalido -> 401 (§4.3 padrao portal). */
export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';

/** Token expirado -> 401 (§4.3 padrao portal). */
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';

/** Body malformado (payload nao-JSON, campos ausentes, tipos errados) -> 400. */
export const MSG_BODY_MALFORMED = 'Requisição malformada.';

// ============================================================
// Cliente DB e DI para testes (padrao S036 herdado da ME-023)
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

/**
 * Hook interno para testes de integracao substituirem o client
 * (padrao S036 da ME-023 — `__setPortalXxxDbClient`). Consumido por
 * `tests/integration/portal-save-instrument-d.test.ts`. Passar `null`
 * restaura o comportamento default.
 */
export function __setPortalSaveInstrumentDDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel (paralelo a S100 do router A)
// ============================================================

let nowFn: () => Date = () => new Date();

/**
 * Hook interno para testes substituirem o relogio, permitindo
 * cobertura deterministica dos ramos de snapshot dia 16 (§8.3) e
 * classificacao de status (§8.1). Passar `null` restaura o default
 * `() => new Date()`.
 */
export function __setPortalSaveInstrumentDNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Motor IQL injetavel (S152 herdado do S060/S105)
// ============================================================

let iqlEngine: IqlEngineFacade = DEFAULT_IQL_ENGINE;

/**
 * Hook interno para testes substituirem o motor IQL, permitindo
 * assertividade de acoplamento (spy que conta chamadas / valida
 * input) e isolamento de defeitos do motor durante o teste do Route
 * Handler. Passar `null` restaura o default `DEFAULT_IQL_ENGINE`.
 */
export function __setPortalSaveInstrumentDIqlEngine(next: IqlEngineFacade | null): void {
  iqlEngine = next ?? DEFAULT_IQL_ENGINE;
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 do save. Diferente do A, o D so tem operacao
 * `insert` — nao ha OVERWRITE porque o D nao fecha (§8.1) e a
 * resposta e imutavel apos gravada. Reflete o par avaliado
 * resolvido pelo snapshot §8.3 para consumo pelo cliente do portal.
 */
export interface SaveInstrumentDSuccess {
  companyId: number;
  respondenteId: number;
  avaliadoTipo: 'employee' | 'clevel';
  avaliadoId: number;
  trimestre: string;
  itensGravados: number;
  operacao: 'insert';
  respondidoEm: string;
}

// ============================================================
// Body parsing
// ============================================================

interface RequestBody {
  portalToken: unknown;
  trimestre: unknown;
  respostas: unknown;
}

interface RespostaItemNormalizada {
  dimensao: number;
  itemIndex: number;
  valor: number;
}

/**
 * Normaliza a lista de respostas do body em uma lista tipada.
 * Retorna `null` quando algum item nao respeita a forma canonica
 * (dimensao/itemIndex/valor inteiros dentro dos ranges). Precedente
 * direto do `normalizeRespostas` do save-instrument-a.
 */
function normalizeRespostas(raw: unknown): RespostaItemNormalizada[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RespostaItemNormalizada[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const rec = item as Record<string, unknown>;
    const d = rec.dimensao;
    const i = rec.itemIndex;
    const v = rec.valor;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 4) return null;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 1 || i > 5) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 4) return null;
    out.push({ dimensao: d, itemIndex: i, valor: v });
  }
  return out;
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
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
  }

  const rawToken = body.portalToken;
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN }, { status: 400 });
  }

  // -------- 2) Verifica portalToken --------
  const verified = await verifyPortalToken(rawToken);
  if (!verified.valid) {
    const msg = verified.reason === 'expired' ? MSG_EXPIRED_TOKEN : MSG_INVALID_TOKEN;
    return NextResponse.json({ msg }, { status: 401 });
  }

  const { companyId, titularType, titularId } = verified.claims;

  // -------- 3) §8.6 Bloqueio 3: C-level nunca responde D --------
  if (titularType !== 'employee') {
    return NextResponse.json({ msg: MSG_CLEVEL_NAO_RESPONDE_D_B3 }, { status: 403 });
  }

  // -------- 4) Valida trimestre (S156: apenas Q1|Q3) e respostas --------
  const trimestreParse = TRIMESTRE_SCHEMA_INSTRUMENT_D.safeParse(body.trimestre);
  if (!trimestreParse.success) {
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
  }
  const trimestre = trimestreParse.data;

  const respostas = normalizeRespostas(body.respostas);
  if (respostas === null || !itensCobremGridCanonicoD(respostas)) {
    return NextResponse.json({ msg: MSG_ITENS_INCOMPLETOS_D }, { status: 400 });
  }

  const { db } = getDbClient();

  // -------- 5) Guard cruzado companyId e status ativo (§2.4 + §3.13) --------
  const [emp] = await db.select().from(employees).where(eq(employees.id, titularId)).limit(1);
  if (!emp || emp.companyId !== companyId) {
    return NextResponse.json({ msg: MSG_COMPANY_MISMATCH_D }, { status: 403 });
  }
  if (emp.status === 'inativo') {
    return NextResponse.json({ msg: MSG_EMPLOYEE_INATIVO_D }, { status: 403 });
  }

  // -------- 6) Resolve fuso e snapshot §8.3 (S150) --------
  const [comp] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!comp) {
    // Portal token com companyId inconsistente — trata como mismatch.
    return NextResponse.json({ msg: MSG_COMPANY_MISMATCH_D }, { status: 403 });
  }
  const timeZone = comp.timezone ?? 'America/Sao_Paulo';
  const dia16 = resolveDia16InstrumentD(trimestre, timeZone);
  if (dia16 === null) {
    // Cinto de seguranca — o regex do Zod ja pega. Guard para
    // narrowing do TS.
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
  }

  // Resolve avaliado do snapshot: liderId OU clevelId ativo no dia
  // 16. Sem vinculo canonico -> nao elegivel (§8.4 orfao).
  const avaliado = await resolveAvaliadoDia16D(db, titularId, dia16);
  if (avaliado === null) {
    return NextResponse.json({ msg: MSG_SEM_VINCULO_SNAPSHOT_D }, { status: 403 });
  }

  // Defesa em profundidade: revalida com o helper canonico.
  const valido = await isRespondenteValidoDia16D(
    db,
    titularId,
    avaliado.avaliadoTipo,
    avaliado.avaliadoId,
    dia16,
  );
  if (!valido) {
    // Cinto de seguranca — nao deveria acontecer se `resolveAvaliado`
    // retornou nao-nulo, mas mantem coerencia diante de race.
    return NextResponse.json({ msg: MSG_SEM_VINCULO_SNAPSHOT_D }, { status: 403 });
  }

  const now = nowFn();

  // §8.1 canoniza que o D NAO fecha — resposta tardia e comportamento
  // normal (nao gera marca de atraso persistida; o status "atrasado"
  // e apenas visual pos dia 11 do mes subsequente). Portanto sem
  // rejeicao por corte tardio aqui.

  // -------- 7) Semantica canonica de submit repetido (imutavel) --------
  //
  // §8.2 "sem salvamento parcial" + §8.1 "sem fechamento" +
  // UNIQUE canonica `uq_iD_unica_resposta` implicam: uma vez
  // respondido o par (respondenteId, trimestre), o mesmo respondente
  // NAO reenvia. Diferente do A (que tem `reopenResponse` para
  // desbloqueio), o D NAO desbloqueia. Se ja existe resposta,
  // retorna 409 MSG_JA_RESPONDIDO_D.
  const jaExistemRows = await db
    .select({ id: instrumentD_responses.id })
    .from(instrumentD_responses)
    .where(
      and(
        eq(instrumentD_responses.respondenteId, titularId),
        eq(instrumentD_responses.trimestre, trimestre),
      ),
    )
    .limit(1);
  if (jaExistemRows.length > 0) {
    return NextResponse.json({ msg: MSG_JA_RESPONDIDO_D }, { status: 409 });
  }

  // -------- 8) INSERT canonico dos 20 itens em transacao atomica --------
  //
  // Padrao canonico do router C/A: usar `tx.insert` direto (evita
  // incompatibilidade MySql2Transaction x MySql2Database — precedente
  // ME-038/ME-039). 20 INSERTs em ordem canonica (dimensao,
  // itemIndex). Coluna `respondidoEm` = `now` fixo do handler.
  try {
    await db.transaction(async (tx) => {
      for (const item of respostas) {
        await tx.insert(instrumentD_responses).values({
          companyId,
          respondenteId: titularId,
          liderId: avaliado.avaliadoTipo === 'employee' ? avaliado.avaliadoId : null,
          clevelId: avaliado.avaliadoTipo === 'clevel' ? avaliado.avaliadoId : null,
          trimestre,
          dimensao: item.dimensao,
          itemIndex: item.itemIndex,
          valor: item.valor,
          respondidoEm: now,
          createdAt: now,
        });
      }
    });
  } catch {
    return handleUnexpected();
  }

  // -------- 9) Hook canonico do motor IQL (S152/S157) --------
  //
  // Motor in-band FORA da transacao. Le todas as respostas do (
  // avaliado, trimestre) e UPSERT em `iqlData` (§8.5). Reexecucao
  // idempotente canonica. Falha do motor propaga como 500 (a
  // resposta ja foi persistida; motor pode ser reexecutado no
  // proximo save ou via `iql.calculateIQL` de Bruno).
  try {
    if (avaliado.avaliadoTipo === 'employee') {
      await iqlEngine.recalculateForLeader(db, companyId, avaliado.avaliadoId, trimestre, now);
    } else {
      await iqlEngine.recalculateForClevel(db, companyId, avaliado.avaliadoId, trimestre, now);
    }
  } catch {
    return handleUnexpected();
  }

  const body200: SaveInstrumentDSuccess = {
    companyId,
    respondenteId: titularId,
    avaliadoTipo: avaliado.avaliadoTipo,
    avaliadoId: avaliado.avaliadoId,
    trimestre,
    itensGravados: NUM_ITENS_TOTAL_D,
    operacao: 'insert',
    respondidoEm: now.toISOString(),
  };
  return NextResponse.json(body200, { status: 200 });
}

/**
 * Superficie defensiva para erros inesperados (ex.: violacao de
 * UNIQUE por corrida improvavel apos check inicial `jaExiste`;
 * falha de infraestrutura no motor IQL). Retorna 500 com corpo
 * canonico. Nunca vaza detalhe do driver — a mensagem canonica e
 * uniforme (precedente ME-039).
 */
function handleUnexpected(): NextResponse {
  return NextResponse.json({ msg: 'Erro ao gravar a resposta.' }, { status: 500 });
}
