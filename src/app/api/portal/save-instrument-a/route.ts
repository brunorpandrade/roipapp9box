// ROIP APP 9BOX — Route Handler `POST /api/portal/save-instrument-a`
// (ME-039, editado em ME-040; §6.8 primeira linha do DOC 03).
//
// Decima ME do Bloco B3 (ME-039) — abriu a superficie canonica de
// ESCRITA do Instrumento A. Decima primeira ME do Bloco B3 (ME-040) —
// pluga o hook canonico do motor de plenitude (§6.4). Com o motor
// entregue na ME-040, S094 e satisfeito naturalmente: o hook
// `plenitudeEngine.recalculatePlenitude` e chamado apos as transacoes
// atomicas de INSERT e OVERWRITE (padrao S036 herdado da ME-023
// estendido com setter DI dedicado).
//
// Recebe `{ portalToken, trimestre, respostas: [{ dimensao, itemIndex,
// valor }] × 20 }` no body. Verifica assinatura + expiracao do
// portalToken, valida titular (`titularType === 'employee'` — S099:
// §6.2 canoniza EXPLICITAMENTE "C-level nao responde o Instrumento A")
// e status do employee (`ativo`), resolve a janela canonica do
// trimestre no timezone da empresa (§6.1: dia 16 do ultimo mes em
// diante — sem fechamento porque A nao fecha, §6.7 literal), aplica a
// semantica canonica S095 de submit repetido:
//   - `nao_aberta` (antes do dia 16 do ultimo mes) -> 409
//     `MSG_TRIMESTRE_NAO_ABERTO_A`;
//   - sem resposta previa -> INSERT transacional dos 20 itens (com
//     valor 0-4, grid 4x5 canonico);
//   - com resposta previa + `instrumentUnlockLog` do tipo 'A' vigente
//     -> OVERWRITE linha a linha via
//     `overwriteInstrumentAResponseValor` em transacao atomica;
//   - com resposta previa SEM desbloqueio vigente -> 409
//     `MSG_A_JA_ENVIADA` (texto proprio, distinto do
//     `MSG_TRIMESTRE_FECHADO` do C — A nao fecha; a mensagem canoniza
//     "ja enviado, imutavel sem desbloqueio").
//
// Hook canonico do motor de plenitude (S105 herdado do S060 do Eixo X):
// setter `__setPortalSaveInstrumentAPlenitudeEngine` permite substituir
// o default `DEFAULT_PLENITUDE_ENGINE` (ME-040) em testes. Producao
// aponta para o motor real desta ME. Chamado sincrono in-band FORA da
// transacao (S102) apos INSERT e OVERWRITE: le A + C do trio canonico
// e upserta `plenitudeData` (§6.4). Se A ou C esta incompleto, o motor
// upserta com scores nulos (§6.4 literal — "campos de score nulos");
// se ambos completos, calcula e persiste os scores.
//
// Sem rate limit dedicado (canonico §5.8 nao contempla — o gate LGPD
// e o login `/api/portal/login` ja rate-limitados na ME-023 sao os
// pontos de trafego alto do portal; o save do A e uma acao de usuario
// deliberada, nao um ponto de bruteforce).
//
// Sem `getInstrumentAResponse` complementar aqui: se o front precisar
// diferenciar "primeiro envio" de "ja enviou" para renderizar UI, ele
// tenta o POST e le a mensagem canonica retornada — padrao portal
// auto-suficiente (mesmo padrao de `consent-lgpd`). A visao agregada
// administrativa (`getInstrumentAStatus` §6.8 segunda linha) vive na
// plataforma admin e nasce em ME futura.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { companies, employees, instrumentA_responses } from '../../../../db/schema';
import {
  getInstrumentoABDataAbertura,
  parseTrimestreCicloReferencia,
} from '../../../../lib/cycleDates';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  DEFAULT_PLENITUDE_ENGINE,
  type PlenitudeEngineFacade,
} from '../../../../server/services/plenitudeCalculationEngine';
import {
  findVigenteInstrumentUnlockA,
  itensCobremGridCanonicoA,
  MSG_A_JA_ENVIADA,
  MSG_CLEVEL_NAO_RESPONDE_A,
  MSG_COMPANY_MISMATCH_A,
  MSG_EMPLOYEE_INATIVO_A,
  MSG_ITENS_INCOMPLETOS_A,
  MSG_TRIMESTRE_NAO_ABERTO_A,
  NUM_ITENS_TOTAL_A,
  TRIMESTRE_SCHEMA_INSTRUMENT_A,
} from '../../../../server/routers/instrumentA';

// ============================================================
// Mensagens canonicas de token (paralelas a ME-023, S036 literal)
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
 * `tests/integration/portal-save-instrument-a.test.ts`.
 */
export function __setPortalSaveInstrumentADbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel (paralelo a S100 do router A)
// ============================================================

let nowFn: () => Date = () => new Date();

/**
 * Hook interno para testes substituirem o relogio, permitindo cobertura
 * deterministica dos ramos de janela (`nao_aberta`, `aberta`,
 * `desbloqueada`). Passar `null` restaura o default `() => new Date()`.
 */
export function __setPortalSaveInstrumentANow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Motor de plenitude injetavel (S105 herdado do S060 do Eixo X)
// ============================================================

let plenitudeEngine: PlenitudeEngineFacade = DEFAULT_PLENITUDE_ENGINE;

/**
 * Hook interno para testes substituirem o motor de plenitude, permitindo
 * assertividade de acoplamento (spy que conta chamadas / valida input) e
 * isolamento de defeitos do motor durante o teste do Route Handler.
 * Passar `null` restaura o default `DEFAULT_PLENITUDE_ENGINE` (ME-040).
 */
export function __setPortalSaveInstrumentAPlenitudeEngine(
  next: PlenitudeEngineFacade | null,
): void {
  plenitudeEngine = next ?? DEFAULT_PLENITUDE_ENGINE;
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 do save. `operacao` distingue INSERT (primeiro
 * envio) de OVERWRITE (dentro de desbloqueio vigente).
 */
export interface SaveInstrumentASuccess {
  companyId: number;
  employeeId: number;
  trimestre: string;
  itensGravados: number;
  operacao: 'insert' | 'overwrite';
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
 * (dimensao/itemIndex/valor inteiros dentro dos ranges). A cobertura
 * canonica do grid 4x5 e verificada separadamente por
 * `itensCobremGridCanonicoA` — este helper garante apenas a forma
 * unitaria dos itens.
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

  // -------- 3) S099: bloqueio canonico C-level (§6.2 literal) --------
  if (titularType !== 'employee') {
    return NextResponse.json({ msg: MSG_CLEVEL_NAO_RESPONDE_A }, { status: 403 });
  }

  // -------- 4) Valida trimestre e respostas --------
  const trimestreParse = TRIMESTRE_SCHEMA_INSTRUMENT_A.safeParse(body.trimestre);
  if (!trimestreParse.success) {
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
  }
  const trimestre = trimestreParse.data;

  const respostas = normalizeRespostas(body.respostas);
  if (respostas === null || !itensCobremGridCanonicoA(respostas)) {
    return NextResponse.json({ msg: MSG_ITENS_INCOMPLETOS_A }, { status: 400 });
  }

  const { db } = getDbClient();

  // -------- 5) Guard cruzado companyId e status ativo (§2.4 + §3.13) --------
  const [emp] = await db.select().from(employees).where(eq(employees.id, titularId)).limit(1);
  if (!emp || emp.companyId !== companyId) {
    return NextResponse.json({ msg: MSG_COMPANY_MISMATCH_A }, { status: 403 });
  }
  if (emp.status === 'inativo') {
    return NextResponse.json({ msg: MSG_EMPLOYEE_INATIVO_A }, { status: 403 });
  }

  // -------- 6) Resolve janela canonica do trimestre (§6.1) --------
  const [comp] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!comp) {
    // Portal token com companyId inconsistente — trata como mismatch.
    return NextResponse.json({ msg: MSG_COMPANY_MISMATCH_A }, { status: 403 });
  }
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    // Cinto de seguranca — o regex do Zod ja pega isso; guard para
    // narrowing do TS.
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
  }
  const dataAbertura = getInstrumentoABDataAbertura(parsed.ano, parsed.trimestre, comp.timezone);
  const now = nowFn();

  // §6.1 — antes do dia 16 do ultimo mes -> nao aberto (S095).
  if (now < dataAbertura) {
    return NextResponse.json({ msg: MSG_TRIMESTRE_NAO_ABERTO_A }, { status: 409 });
  }
  // §6.7 — A NAO fecha. Nao ha rejeicao por corte tardio; resposta
  // tardia e comportamento normal (nao gera marca, nao exige
  // justificativa). O sistema apenas grava `respondidoEm` real.

  // -------- 7) Semantica canonica S095 de submit repetido --------
  const jaExistemRows = await db
    .select({ id: instrumentA_responses.id })
    .from(instrumentA_responses)
    .where(
      and(
        eq(instrumentA_responses.employeeId, titularId),
        eq(instrumentA_responses.trimestre, trimestre),
      ),
    )
    .limit(1);
  const jaExiste = jaExistemRows.length > 0;

  const desbloqueioVigente = await findVigenteInstrumentUnlockA(db, titularId, trimestre, now);

  if (jaExiste) {
    if (!desbloqueioVigente) {
      // §6.7 — A ja enviado, imutavel sem desbloqueio (S095).
      return NextResponse.json({ msg: MSG_A_JA_ENVIADA }, { status: 409 });
    }
    // OVERWRITE — 20 UPDATEs por chave logica em transacao atomica.
    // Padrao canonico do router C: usar `tx.update` direto ao inves de
    // chamar service (evita incompatibilidade
    // MySql2Transaction × MySql2Database).
    try {
      await db.transaction(async (tx) => {
        for (const item of respostas) {
          await tx
            .update(instrumentA_responses)
            .set({ valor: item.valor, respondidoEm: now })
            .where(
              and(
                eq(instrumentA_responses.employeeId, titularId),
                eq(instrumentA_responses.trimestre, trimestre),
                eq(instrumentA_responses.dimensao, item.dimensao),
                eq(instrumentA_responses.itemIndex, item.itemIndex),
              ),
            );
        }
      });
    } catch {
      return handleUnexpected();
    }
    // Hook canonico ME-040 (§6.4): motor de plenitude in-band FORA da
    // transacao (S102). Le A e C do trio canonico e upserta
    // `plenitudeData`. Reexecucao idempotente canonica. Falha do motor
    // propaga como 500 (o instrumento ja foi persistido; motor pode ser
    // reexecutado no proximo submit).
    try {
      await plenitudeEngine.recalculatePlenitude(db, companyId, titularId, trimestre, now);
    } catch {
      return handleUnexpected();
    }
    const body200: SaveInstrumentASuccess = {
      companyId,
      employeeId: titularId,
      trimestre,
      itensGravados: NUM_ITENS_TOTAL_A,
      operacao: 'overwrite',
      respondidoEm: now.toISOString(),
    };
    return NextResponse.json(body200, { status: 200 });
  }

  // Sem resposta previa: INSERT canonico dos 20 itens em transacao
  // atomica (§6.2 acao 1). Padrao canonico do router C: usar
  // `tx.insert` direto (mesma justificativa acima).
  try {
    await db.transaction(async (tx) => {
      for (const item of respostas) {
        await tx.insert(instrumentA_responses).values({
          companyId,
          employeeId: titularId,
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
  // Hook canonico ME-040 (§6.4): motor de plenitude in-band FORA da
  // transacao (S102). Le A e C do trio canonico e upserta `plenitudeData`.
  // Se C tambem esta completo (§6.2 acao 2 combinada com esta), preenche
  // scores; senao, mantem nulos (§6.4 literal). Reexecucao idempotente.
  try {
    await plenitudeEngine.recalculatePlenitude(db, companyId, titularId, trimestre, now);
  } catch {
    return handleUnexpected();
  }
  const body200: SaveInstrumentASuccess = {
    companyId,
    employeeId: titularId,
    trimestre,
    itensGravados: NUM_ITENS_TOTAL_A,
    operacao: 'insert',
    respondidoEm: now.toISOString(),
  };
  return NextResponse.json(body200, { status: 200 });
}

/**
 * Superficie defensiva para erros inesperados (ex.: violacao de UNIQUE
 * por corrida improvavel apos check inicial `jaExiste`). Retorna 500
 * com corpo canonico. Nunca vaza detalhe do driver — a mensagem
 * canonica e uniforme.
 */
function handleUnexpected(): NextResponse {
  return NextResponse.json({ msg: 'Erro ao gravar a resposta.' }, { status: 500 });
}
