// ROIP APP 9BOX — Route Handler `POST /api/portal/profile-form-state`
// (ME-049a; DOC 03 §10.13 primeira proc + DOC 05 §7.5).
//
// Vigesima ME do Bloco B3 (ME-049a) — abre a superficie canonica de
// LEITURA do questionario do Perfil Individual via portal. Precedente
// canonizado: Route Handlers `POST /api/portal/save-instrument-a`
// (ME-039, S091-S097) e `POST /api/portal/save-instrument-d` (ME-046,
// S150-S157) — escrita via portal autenticado por `portalToken` sempre
// como POST /api/portal/*, NAO via tRPC. Extensao logica direta: a
// LEITURA do estado de preenchimento tambem vive como Route Handler
// (mesma superficie do save; auto-suficiencia canonica S095/S150).
//
// Recebe `{ portalToken }` no body. Verifica assinatura + expiracao
// do portalToken. Localiza a tentativa canonica `em_andamento` do
// titular; se nao existir, cria-a com `blocoAtual=1`, `respostas={}`,
// `blocosCompletos=[]`, `tentativa` = maior tentativa existente + 1
// (ou 1 na primeira vez). Retorna o estado tipado. Reexecucao
// idempotente canonica: chamadas repetidas retornam o mesmo estado
// da tentativa vigente.
//
// Regra canonica de "estado unico em_andamento": um titular tem no
// maximo uma tentativa em `em_andamento` por vez (implicito da
// UNIQUE `uq_ipa_tentativa` + regra §10.7 de que reteste so libera
// nova tentativa apos a anterior estar `enviado`/`inconsistente`).
// O handler prioriza a tentativa `em_andamento`; se nao houver,
// procura a mais recente por `tentativa` — se o status for
// terminal, cria a proxima tentativa; se nao houver historico algum,
// abre `tentativa=1`.
//
// Convencoes canonicas herdadas:
//   - DI setters (padrao S036/S105): 2 hooks canonicos
//     `__setPortalProfileFormStateDbClient`,
//     `__setPortalProfileFormStateNow`.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador direto no teste
//     `tests/integration/portal-profile-form-state.test.ts`.
//   - L77: erros do mysql2 propagam ao caller externo embrulhados em
//     DrizzleQueryError; o `try/catch` do handler converte em 500
//     canonico (`MSG_UNEXPECTED`).

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { individualProfileAssessments } from '../../../../db/schema';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  NUM_BLOCOS_TOTAL,
  NUM_ITENS_POR_BLOCO,
} from '../../../../server/services/individualProfileEngine';

// ============================================================
// Mensagens canonicas (paralelas a save-instrument-a)
// ============================================================

/** Token ausente no body -> 400. */
export const MSG_MISSING_TOKEN = 'Sessão ausente.';

/** Token invalido -> 401. */
export const MSG_INVALID_TOKEN = 'Sessão inválida. Faça a identificação novamente.';

/** Token expirado -> 401. */
export const MSG_EXPIRED_TOKEN = 'Sessão expirada. Faça a identificação novamente.';

/** Body malformado -> 400. */
export const MSG_BODY_MALFORMED = 'Requisição malformada.';

/** Erro inesperado -> 500. */
export const MSG_UNEXPECTED = 'Erro ao ler o estado do questionário.';

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

function getDbClient(): RoipDbClient {
  if (dbClient === null) {
    dbClient = createDbClient(resolveDatabaseUrl());
  }
  return dbClient;
}

/** Hook interno para testes (padrao S036). */
export function __setPortalProfileFormStateDbClient(next: RoipDbClient | null): void {
  dbClient = next;
}

// ============================================================
// Relogio injetavel
// ============================================================

let nowFn: () => Date = () => new Date();

/** Hook interno para testes (padrao S100 replicado). */
export function __setPortalProfileFormStateNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Retornos canonicos
// ============================================================

/**
 * Corpo canonico 200 de `profile-form-state`. Contrato tipado
 * (DOC 05 §7.5: pop-up abre em `blocoAtual`, respostas de blocos
 * anteriores pre-preenchidas visualmente, barra de progresso mostra
 * `blocoAtual - 1` de 10 concluidos).
 */
export interface ProfileFormStateSuccess {
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  assessmentId: number;
  tentativa: number;
  blocoAtual: number;
  blocosCompletos: readonly number[];
  respostas: Record<string, string | number>;
  totalBlocos: number;
  itensPorBloco: number;
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
  const now = nowFn();

  const { db } = getDbClient();

  // -------- 3) Busca tentativa vigente --------
  try {
    // Prioriza `em_andamento`; se ausente, resolve pela ultima
    // tentativa por `tentativa` decrescente.
    const emAndamento = await db
      .select()
      .from(individualProfileAssessments)
      .where(
        and(
          eq(individualProfileAssessments.companyId, companyId),
          eq(individualProfileAssessments.userType, titularType),
          eq(individualProfileAssessments.userId, titularId),
          eq(individualProfileAssessments.status, 'em_andamento'),
        ),
      )
      .orderBy(desc(individualProfileAssessments.tentativa))
      .limit(1);

    if (emAndamento.length > 0) {
      const row = emAndamento[0];
      if (!row) {
        return NextResponse.json({ msg: MSG_UNEXPECTED }, { status: 500 });
      }
      return NextResponse.json(rowToSuccess(row), { status: 200 });
    }

    // Nao ha em_andamento — busca a maior tentativa (para decidir
    // a proxima) e cria a proxima.
    const ultima = await db
      .select({ tentativa: individualProfileAssessments.tentativa })
      .from(individualProfileAssessments)
      .where(
        and(
          eq(individualProfileAssessments.companyId, companyId),
          eq(individualProfileAssessments.userType, titularType),
          eq(individualProfileAssessments.userId, titularId),
        ),
      )
      .orderBy(desc(individualProfileAssessments.tentativa))
      .limit(1);

    const proximaTentativa = ultima.length > 0 && ultima[0] ? ultima[0].tentativa + 1 : 1;

    const [inserted] = await db
      .insert(individualProfileAssessments)
      .values({
        companyId,
        userType: titularType,
        userId: titularId,
        tentativa: proximaTentativa,
        status: 'em_andamento',
        blocoAtual: 1,
        blocosCompletos: [],
        respostas: {},
        createdAt: now,
        updatedAt: now,
      })
      .$returningId();

    if (!inserted) {
      return NextResponse.json({ msg: MSG_UNEXPECTED }, { status: 500 });
    }

    const [created] = await db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, inserted.id))
      .limit(1);

    if (!created) {
      return NextResponse.json({ msg: MSG_UNEXPECTED }, { status: 500 });
    }

    return NextResponse.json(rowToSuccess(created), { status: 200 });
  } catch {
    return NextResponse.json({ msg: MSG_UNEXPECTED }, { status: 500 });
  }
}

/**
 * Converte uma linha canonica de `individualProfileAssessments` no
 * corpo tipado 200. Normaliza os JSON MySQL para as formas canonicas
 * (`blocosCompletos` = array de int; `respostas` = record).
 */
function rowToSuccess(
  row: typeof individualProfileAssessments.$inferSelect,
): ProfileFormStateSuccess {
  const blocosCompletos = Array.isArray(row.blocosCompletos)
    ? row.blocosCompletos.filter((v): v is number => typeof v === 'number' && Number.isInteger(v))
    : [];
  const respostas =
    row.respostas !== null && typeof row.respostas === 'object'
      ? normalizeRespostas(row.respostas as Record<string, unknown>)
      : {};
  return {
    companyId: row.companyId,
    userType: row.userType,
    userId: row.userId,
    assessmentId: row.id,
    tentativa: row.tentativa,
    blocoAtual: row.blocoAtual,
    blocosCompletos,
    respostas,
    totalBlocos: NUM_BLOCOS_TOTAL,
    itensPorBloco: NUM_ITENS_POR_BLOCO,
  };
}

function normalizeRespostas(raw: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}
