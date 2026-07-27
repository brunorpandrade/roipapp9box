// ROIP APP 9BOX — Route Handler `POST /api/portal/save-profile-block`
// (ME-049a; DOC 03 §10.13 segunda proc + DOC 05 §7.5).
//
// Vigesima ME do Bloco B3 (ME-049a) — abre a superficie canonica de
// ESCRITA de progresso do questionario do Perfil Individual. Precedente
// direto: Route Handlers do Instrumento A e D. Escreve o progresso de
// UM bloco de 8 itens (DOC 05: "Bloco X de 10 · 8 itens"; DOC 01 §9.1:
// `blocoAtual 1..10`).
//
// Recebe `{ portalToken, assessmentId, bloco, respostas }` no body.
// Verifica assinatura + expiracao do portalToken. Valida guard cruzado
// (`companyId` + `userType`+`userId` do token contra a tentativa) e
// status `em_andamento`. Valida o `bloco` (1..10) e a completude dos 8
// itens do bloco (S102/S150 replicado). Grava o UPDATE canonico
// atomico: merge das respostas + append de `bloco` em
// `blocosCompletos` (se ainda nao completo) + avanco de `blocoAtual`
// para o proximo bloco.
//
// Regra canonica de "volta unica" (DOC 05 §7.5 literal — "Regra de
// volta unica preservada: retorna apenas 1 bloco, trava novamente ate
// avancar"): esta regra e de FRONT (o botao `[Bloco anterior]` fica
// disabled apos uso). O backend NAO precisa impor volta unica no save;
// impoe apenas: bloco ja `blocosCompletos` pode ser reescrito somente
// se o `blocoAtual` atual for exatamente `bloco + 1` (o colaborador
// esta editando o bloco imediatamente anterior). Reescrita fora dessa
// janela retorna 409 canonico `MSG_BLOCO_JA_COMPLETO_TRAVADO`.
//
// Sem chamada ao motor nesta proc — motor so roda no
// `submit-profile-assessment` (bloco 10). Nao ha OVERWRITE do bloco 10
// aqui: se `bloco === 10` a semantica canonica e "salvar respostas
// mas nao aciona motor" — o motor e disparado explicitamente pelo
// submit dedicado.
//
// Convencoes canonicas herdadas:
//   - DI setters (padrao S036): 2 hooks
//     `__setPortalSaveProfileBlockDbClient`,
//     `__setPortalSaveProfileBlockNow`.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador direto no teste
//     `tests/integration/portal-save-profile-block.test.ts`.

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../../../db/client';
import { individualProfileAssessments } from '../../../../db/schema';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  itemKey,
  NUM_BLOCOS_TOTAL,
  NUM_ITENS_POR_BLOCO,
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

function getDbClient(): RoipDbClient {
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
// Body parsing e helpers
// ============================================================

interface RequestBody {
  portalToken: unknown;
  assessmentId: unknown;
  bloco: unknown;
  respostas: unknown;
}

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

function normalizeRespostas(raw: unknown): Record<string, string | number> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
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

  const assessmentId = body.assessmentId;
  const bloco = body.bloco;
  const respostasBloco = normalizeRespostas(body.respostas);
  if (
    typeof assessmentId !== 'number' ||
    !Number.isInteger(assessmentId) ||
    assessmentId <= 0 ||
    typeof bloco !== 'number' ||
    !Number.isInteger(bloco) ||
    respostasBloco === null
  ) {
    return NextResponse.json({ msg: MSG_BODY_MALFORMED }, { status: 400 });
  }

  if (bloco < 1 || bloco > NUM_BLOCOS_TOTAL) {
    return NextResponse.json({ msg: MSG_BLOCO_FORA_DE_RANGE }, { status: 400 });
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
    // -------- 3) Guard cruzado da tentativa --------
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
      return NextResponse.json({ msg: MSG_ASSESSMENT_NAO_EM_ANDAMENTO }, { status: 409 });
    }

    // -------- 4) Completude do bloco --------
    if (!bloqueEstaCompleto(bloco, respostasBloco)) {
      return NextResponse.json({ msg: MSG_BLOCO_INCOMPLETO }, { status: 400 });
    }

    // -------- 5) Regra canonica de janela de volta --------
    const blocosCompletosAtual = Array.isArray(row.blocosCompletos)
      ? row.blocosCompletos.filter((v): v is number => typeof v === 'number' && Number.isInteger(v))
      : [];
    const jaEstavaCompleto = blocosCompletosAtual.includes(bloco);
    if (jaEstavaCompleto && row.blocoAtual !== bloco + 1) {
      return NextResponse.json({ msg: MSG_BLOCO_JA_COMPLETO_TRAVADO }, { status: 409 });
    }

    // -------- 6) Merge canonico das respostas --------
    const respostasAtuais =
      row.respostas !== null && typeof row.respostas === 'object'
        ? (row.respostas as Record<string, unknown>)
        : {};
    const respostasMescladas: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(respostasAtuais)) {
      if (typeof v === 'string' || typeof v === 'number') respostasMescladas[k] = v;
    }
    for (const [k, v] of Object.entries(respostasBloco)) {
      respostasMescladas[k] = v;
    }

    // -------- 7) blocosCompletos + blocoAtual --------
    const blocosCompletosNovo = blocosCompletosAtual.includes(bloco)
      ? blocosCompletosAtual
      : [...blocosCompletosAtual, bloco].sort((a, b) => a - b);
    // Avanca `blocoAtual` para o proximo (limitado a
    // `NUM_BLOCOS_TOTAL`, que sinaliza "todos os blocos concluidos —
    // pronto para o submit").
    const blocoAtualNovo = Math.min(bloco + 1, NUM_BLOCOS_TOTAL);

    // -------- 8) UPDATE atomico --------
    await db
      .update(individualProfileAssessments)
      .set({
        blocoAtual: blocoAtualNovo,
        blocosCompletos: blocosCompletosNovo,
        respostas: respostasMescladas,
        updatedAt: now,
      })
      .where(eq(individualProfileAssessments.id, assessmentId));

    const body200: SaveProfileBlockSuccess = {
      companyId,
      userType: titularType,
      userId: titularId,
      assessmentId,
      blocoAtual: blocoAtualNovo,
      blocosCompletos: blocosCompletosNovo,
      totalBlocos: NUM_BLOCOS_TOTAL,
    };
    return NextResponse.json(body200, { status: 200 });
  } catch {
    return NextResponse.json({ msg: MSG_UNEXPECTED }, { status: 500 });
  }
}
