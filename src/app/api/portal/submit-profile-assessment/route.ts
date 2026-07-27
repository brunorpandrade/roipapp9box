// ROIP APP 9BOX — Route Handler `POST /api/portal/submit-profile-assessment`
// (ME-049a; DOC 03 §10.13 terceira proc + §10.4-§10.6 + §10.12).
//
// Vigesima ME do Bloco B3 (ME-049a) — abre a superficie canonica de
// SUBMIT do questionario do Perfil Individual. Precedente direto:
// Route Handlers `save-instrument-a` (ME-039) e `save-instrument-d`
// (ME-046). Aciona o motor deterministico das 5 camadas do §5 do
// arquivo do instrumento apos validar completude dos 80 itens.
//
// Recebe `{ portalToken, assessmentId }` no body. Verifica assinatura
// + expiracao do portalToken. Valida guard cruzado + status
// `em_andamento` da tentativa. Valida `blocosCompletos == [1..10]`
// (todos os 10 blocos entregues) e presenca dos 80 itens em
// `respostas`. Aciona o motor via Facade DI in-band FORA de
// transacao (S102/S157 replicado): o motor executa as 5 camadas,
// grava resultado no assessment + insere `individualProfileScores`
// + transiciona placeholder. Retorna corpo tipado com o motivo
// canonico (`consistente` | `inconsistente_baixa_confiabilidade`) e
// os 5 indices.
//
// Semantica canonica de resubmit: uma tentativa `em_andamento` so
// pode ser submetida uma vez — apos o motor rodar, o status vira
// `enviado` ou `inconsistente`. Novo submit da mesma tentativa
// retorna 409 canonico `MSG_ASSESSMENT_JA_ENVIADA`. Reteste exige
// nova tentativa via `getFormState` (ME futura de reteste — §10.7).
//
// Convencoes canonicas herdadas:
//   - DI setters (padrao S036/S105): 3 hooks
//     `__setPortalSubmitProfileAssessmentDbClient`,
//     `__setPortalSubmitProfileAssessmentNow`,
//     `__setPortalSubmitProfileAssessmentEngine` (Facade DI do motor).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador direto no teste
//     `tests/integration/portal-submit-profile-assessment.test.ts`.
//   - L77: erros do mysql2 sobem embrulhados em DrizzleQueryError; o
//     try/catch do handler propaga como 500 canonico.

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { individualProfileAssessments } from '../../../../db/schema';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
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

function getDbClient(): RoipDbClient {
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

/** Hook interno para testes. */
export function __setPortalSubmitProfileAssessmentNow(next: (() => Date) | null): void {
  nowFn = next ?? (() => new Date());
}

// ============================================================
// Motor injetavel (Facade DI — S105/S060 replicado)
// ============================================================

let engine: IndividualProfileEngineFacade = DEFAULT_INDIVIDUAL_PROFILE_ENGINE;

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
// Body parsing
// ============================================================

interface RequestBody {
  portalToken: unknown;
  assessmentId: unknown;
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

  const assessmentId = body.assessmentId;
  if (typeof assessmentId !== 'number' || !Number.isInteger(assessmentId) || assessmentId <= 0) {
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
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

  try {
    // -------- 3) Guard cruzado --------
    const [row] = await db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, assessmentId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ msg: MSG_ASSESSMENT_NAO_ENCONTRADO }, { status: 404 });
    }
    if (row.companyId !== companyId || row.userType !== titularType || row.userId !== titularId) {
      return NextResponse.json({ msg: MSG_ASSESSMENT_TITULAR_MISMATCH }, { status: 403 });
    }
    if (row.status !== 'em_andamento') {
      return NextResponse.json({ msg: MSG_ASSESSMENT_JA_ENVIADA }, { status: 409 });
    }

    // -------- 4) Valida completude canonica --------
    const blocosCompletos = Array.isArray(row.blocosCompletos)
      ? row.blocosCompletos.filter((v): v is number => typeof v === 'number' && Number.isInteger(v))
      : [];
    const respostas =
      row.respostas !== null && typeof row.respostas === 'object'
        ? (row.respostas as Record<string, unknown>)
        : {};
    if (!todosOs10BlocosConcluidos(blocosCompletos) || !todosOs80Presentes(respostas)) {
      return NextResponse.json({ msg: MSG_ASSESSMENT_INCOMPLETO }, { status: 400 });
    }

    // -------- 5) Aciona motor in-band FORA de transacao (S102) --------
    // O motor executa 5 camadas + persistencia atomica canonica
    // (UPDATE assessment + INSERT scores + UPDATE placeholder).
    const result = await engine.runAssessment(db, assessmentId, now);

    const body200: SubmitProfileAssessmentSuccess = {
      companyId,
      userType: titularType,
      userId: titularId,
      assessmentId,
      tentativa: result.tentativa,
      motivo: result.motivo,
      status: result.status,
      confiabilidadeNivel: result.confiabilidadeNivel,
      ia_att: result.ia_att,
      ia_soc: result.ia_soc,
      ia_acq: result.ia_acq,
      ia_cons: result.ia_cons,
      ia_ext: result.ia_ext,
      enviadoEm: result.enviadoEm.toISOString(),
      exibirConfirmacaoAte: result.exibirConfirmacaoAte.toISOString(),
    };
    return NextResponse.json(body200, { status: 200 });
  } catch {
    return NextResponse.json({ msg: MSG_UNEXPECTED }, { status: 500 });
  }
}
