// ROIP APP 9BOX — Route Handler `POST /api/portal/save-profile-block`
// (ME-049a; DOC 03 §10.13 segunda proc + DOC 05 §7.5; ME-070 refactor
// S366).
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
//     `__setPortalSaveProfileBlockNow` (agora em `./internals.ts` sob
//     S366).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador direto no teste
//     `tests/integration/portal-save-profile-block.test.ts`.
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): constantes de
// mensagem, tipo `SaveProfileBlockSuccess`, funcoes `itensDoBloco` e
// `bloqueEstaCompleto`, estado privado dbClient, relogio e escape
// hatches migraram para `./internals.ts` irmao. Este arquivo exporta
// apenas POST para conformidade Next 15 App Router.

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { individualProfileAssessments } from '../../../../db/schema';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import { NUM_BLOCOS_TOTAL } from '../../../../server/services/individualProfileEngine';

import {
  MSG_ASSESSMENT_NAO_EM_ANDAMENTO,
  MSG_ASSESSMENT_NAO_ENCONTRADO,
  MSG_ASSESSMENT_TITULAR_MISMATCH,
  MSG_BLOCO_FORA_DE_RANGE,
  MSG_BLOCO_INCOMPLETO,
  MSG_BLOCO_JA_COMPLETO_TRAVADO,
  MSG_BODY_MALFORMED,
  MSG_EXPIRED_TOKEN,
  MSG_INVALID_TOKEN,
  MSG_MISSING_TOKEN,
  MSG_UNEXPECTED,
  bloqueEstaCompleto,
  getDbClient,
  getNowFn,
  type SaveProfileBlockSuccess,
} from './internals';

// ============================================================
// Body parsing e helpers privados
// ============================================================

interface RequestBody {
  portalToken: unknown;
  assessmentId: unknown;
  bloco: unknown;
  respostas: unknown;
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
  const now = getNowFn()();

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
