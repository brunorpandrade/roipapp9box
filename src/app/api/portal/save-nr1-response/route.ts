// ROIP APP 9BOX — Route Handler `POST /api/portal/save-nr1-response`
// (ME-049cd; DOC 03 §11.17 quarta linha — `nr1.saveResponse`; ME-070
// refactor S366).
//
// S214 (aplicacao de S207 ao §11.17): o §11.17 rotula a escrita como
// procedure tRPC, mas ela e "via portal (autenticacao por CPF)" — e no
// roipapp9box toda escrita de portal e Route Handler POST autenticado
// por `portalToken`. Precedentes executados: `save-instrument-a`
// (ME-039), `save-instrument-d` (ME-046), `save-profile-block` e
// `submit-profile-assessment` (ME-049a).
//
// Fluxo canonico:
//   1. Verifica `portalToken` (assinatura + expiracao).
//   2. S239 — titular `clevel` recebe 403: C-level nao participa do
//      Radar NR-1 por restricao arquitetural do DOC 01
//      (`copsoq_responses.employeeId` FK NOT NULL -> `employees.id`).
//   3. Colaborador existe, e da empresa do token e esta `ativo`.
//   4. Ciclo existe, e da mesma empresa e esta `aberto`.
//   5. §11.15 — submissao apos 00:00 da data de fechamento: 409 com
//      mensagem canonica exata.
//   6. Elegibilidade pelo snapshot congelado na abertura (§11.2).
//   7. Ausencia de resposta previa (§11.4 — sem reenvio).
//   8. Grid canonico completo: 32 itens, escala 0-4 (§11.4).
//   9. §11.5 — controles anti-fraude SILENCIOSOS, calculados no
//      servidor e aplicados apos a gravacao:
//        - uniformidade: os 32 itens com o mesmo valor.
//        - tempo baixo: `now - iat(nr1StartToken) < 180s` (S236).
//      Em ambos os casos a resposta E GRAVADA e o colaborador recebe o
//      toast padrao de sucesso — a invalidacao nunca e sinalizada.
//  10. Transacao atomica (§11.4): 32 INSERTs em `copsoq_responses` +
//      atualizacao do snapshot (`respondeu`, `respondidoEm`,
//      `tempoRespostaSegundos`) + marca de invalidade quando aplicavel.
//
// Ausencia ou invalidade do `nr1StartToken` NAO libera a resposta do
// controle: sem medicao confiavel do inicio, o servidor trata o envio
// como `tempo_baixo`. Tratar a ausencia como "valido por omissao"
// entregaria o bypass trivial (basta nao enviar o token), o que
// esvaziaria o §11.5.
//
// Sem hook de motor: o Radar NR-1 nao recalcula nada a cada resposta —
// os escores nascem apenas no fechamento do ciclo (§11.2, §11.6). Por
// isso este handler nao tem Facade de motor, ao contrario do
// `save-instrument-d` (que aciona o IQL a cada submit).
//
// Convencoes canonicas herdadas:
//   - DI setters (S036): `__setPortalSaveNr1ResponseDbClient` e
//     `__setPortalSaveNr1ResponseNow` (agora em `./internals.ts` sob
//     S366).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Transacao via
//     `db.transaction(async (tx) => ...)` com `tx.insert` direto (L54).
//   - L77: erro do mysql2 dentro da transacao chega embrulhado em
//     `DrizzleQueryError`; o `catch` do handler devolve 500 canonico. O
//     cinto de duplicidade e verificado ANTES da transacao — a UNIQUE
//     `uq_resposta` e defesa de ultima instancia.
//   - Zero code dead: cada export tem chamador em
//     `tests/integration/portal-save-nr1-response.test.ts` (RV-13).
//
// S366 canonizada (ME-069, aplicacao bulk ME-070): constantes de
// mensagem, tipo `SaveNr1ResponseSuccess`, funcao `normalizeRespostasNr1`,
// estado privado dbClient, relogio e escape hatches migraram para
// `./internals.ts` irmao. Este arquivo exporta apenas POST para
// conformidade Next 15 App Router.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import {
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoq_responses,
  employees,
} from '../../../../db/schema';
import type {
  Nr1StartTokenClaims,
  Nr1StartVerifyResult,
} from '../../../../server/auth/nr1StartToken';
import { verifyNr1StartToken } from '../../../../server/auth/nr1StartToken';
import { verifyPortalToken } from '../../../../server/auth/portalToken';
import {
  dataCivilDeColunaNr1,
  itensCobremGridCanonicoNr1,
  NUM_ITENS_TOTAL_NR1,
  respostasUniformesNr1,
  TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1,
} from '../../../../server/services/nr1CalculationEngine';

import {
  MSG_BODY_MALFORMED_NR1_SAVE,
  MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1,
  MSG_CICLO_NAO_ABERTO_NR1,
  MSG_CICLO_NAO_ENCONTRADO_NR1_SAVE,
  MSG_CLEVEL_NAO_RESPONDE_NR1_SAVE,
  MSG_COMPANY_MISMATCH_NR1_SAVE,
  MSG_EMPLOYEE_INATIVO_NR1_SAVE,
  MSG_EXPIRED_TOKEN_NR1_SAVE,
  MSG_INVALID_TOKEN_NR1_SAVE,
  MSG_ITENS_INCOMPLETOS_NR1,
  MSG_JA_RESPONDIDO_NR1,
  MSG_MISSING_TOKEN_NR1_SAVE,
  MSG_SEM_SNAPSHOT_NR1,
  MSG_UNEXPECTED_NR1_SAVE,
  getDbClient,
  getNowFn,
  normalizeRespostasNr1,
  type SaveNr1ResponseSuccess,
} from './internals';

// ============================================================
// Body parsing
// ============================================================

interface RequestBody {
  portalToken: unknown;
  startToken: unknown;
  cicloDbId: unknown;
  respostas: unknown;
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
    return NextResponse.json({ msg: MSG_BODY_MALFORMED_NR1_SAVE }, { status: 400 });
  }

  const rawToken = body.portalToken;
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    return NextResponse.json({ msg: MSG_MISSING_TOKEN_NR1_SAVE }, { status: 400 });
  }

  // -------- 2) Verifica portalToken --------
  const verified = await verifyPortalToken(rawToken);
  if (!verified.valid) {
    const msg =
      verified.reason === 'expired' ? MSG_EXPIRED_TOKEN_NR1_SAVE : MSG_INVALID_TOKEN_NR1_SAVE;
    return NextResponse.json({ msg }, { status: 401 });
  }

  const { companyId, titularType, titularId } = verified.claims;

  // -------- 3) S239 — C-level nao participa --------
  if (titularType !== 'employee') {
    return NextResponse.json({ msg: MSG_CLEVEL_NAO_RESPONDE_NR1_SAVE }, { status: 403 });
  }

  // -------- 4) Valida ciclo e respostas do corpo --------
  const cicloDbId = body.cicloDbId;
  if (typeof cicloDbId !== 'number' || !Number.isInteger(cicloDbId) || cicloDbId <= 0) {
    return NextResponse.json({ msg: MSG_BODY_MALFORMED_NR1_SAVE }, { status: 400 });
  }

  const respostas = normalizeRespostasNr1(body.respostas);
  if (respostas === null || !itensCobremGridCanonicoNr1(respostas)) {
    return NextResponse.json({ msg: MSG_ITENS_INCOMPLETOS_NR1 }, { status: 400 });
  }

  const { db } = getDbClient();
  const now = getNowFn()();

  // -------- 5) Guard cruzado e status do colaborador --------
  const [emp] = await db.select().from(employees).where(eq(employees.id, titularId)).limit(1);
  if (!emp || emp.companyId !== companyId) {
    return NextResponse.json({ msg: MSG_COMPANY_MISMATCH_NR1_SAVE }, { status: 403 });
  }
  if (emp.status === 'inativo') {
    return NextResponse.json({ msg: MSG_EMPLOYEE_INATIVO_NR1_SAVE }, { status: 403 });
  }

  // -------- 6) Ciclo canonico --------
  const [ciclo] = await db
    .select()
    .from(copsoqCycles)
    .where(eq(copsoqCycles.id, cicloDbId))
    .limit(1);
  if (!ciclo || ciclo.companyId !== companyId) {
    return NextResponse.json({ msg: MSG_CICLO_NAO_ENCONTRADO_NR1_SAVE }, { status: 404 });
  }
  if (ciclo.status !== 'aberto') {
    return NextResponse.json({ msg: MSG_CICLO_NAO_ABERTO_NR1 }, { status: 409 });
  }

  // -------- 7) §11.15 — corte de 00:00 da data de fechamento --------
  //
  // §11.2 canoniza que as datas do ciclo sao lidas no fuso local da
  // empresa; o corte do §11.15 segue o mesmo relogio.
  const [comp] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const timeZone = comp?.timezone ?? 'America/Sao_Paulo';
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (hoje >= dataCivilDeColunaNr1(ciclo.dataFechamento)) {
    return NextResponse.json(
      { msg: MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1 },
      { status: 409 },
    );
  }

  // -------- 8) Elegibilidade e ausencia de resposta previa --------
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
  if (!linhaSnapshot || linhaSnapshot.inativadoAposSnapshot === true) {
    return NextResponse.json({ msg: MSG_SEM_SNAPSHOT_NR1 }, { status: 403 });
  }
  if (linhaSnapshot.respondeu === true) {
    return NextResponse.json({ msg: MSG_JA_RESPONDIDO_NR1 }, { status: 409 });
  }

  // -------- 9) §11.5 — controles anti-fraude silenciosos (S236) --------
  const tempoRespostaSegundos = await resolverTempoRespostaNr1(
    body.startToken,
    { companyId, employeeId: titularId, cicloDbId: ciclo.id },
    now,
  );
  const uniforme = respostasUniformesNr1(respostas.map((r) => r.valor));
  const tempoBaixo = tempoRespostaSegundos < TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1;
  const motivoInvalidade: 'uniformidade' | 'tempo_baixo' | null = uniforme
    ? 'uniformidade'
    : tempoBaixo
      ? 'tempo_baixo'
      : null;

  // -------- 10) Transacao atomica (§11.4) --------
  try {
    await db.transaction(async (tx) => {
      for (const item of respostas) {
        await tx.insert(copsoq_responses).values({
          cicloDbId: ciclo.id,
          companyId,
          employeeId: titularId,
          fator: item.fator,
          itemIndex: item.itemIndex,
          valor: item.valor,
          createdAt: now,
        });
      }
      await tx
        .update(copsoqCycleSnapshot)
        .set({
          respondeu: true,
          respondidoEm: now,
          tempoRespostaSegundos,
          respostaInvalida: motivoInvalidade !== null,
          motivoInvalidade,
        })
        .where(
          and(
            eq(copsoqCycleSnapshot.cicloDbId, ciclo.id),
            eq(copsoqCycleSnapshot.employeeId, titularId),
          ),
        );
    });
  } catch {
    return NextResponse.json({ msg: MSG_UNEXPECTED_NR1_SAVE }, { status: 500 });
  }

  const corpo: SaveNr1ResponseSuccess = {
    companyId,
    employeeId: titularId,
    cicloDbId: ciclo.id,
    itensGravados: NUM_ITENS_TOTAL_NR1,
    operacao: 'insert',
    respondidoEm: now.toISOString(),
  };
  return NextResponse.json(corpo, { status: 200 });
}

/**
 * §11.5 + S236 — deriva o tempo de resposta EXCLUSIVAMENTE no servidor,
 * a partir do `iat` assinado do `nr1StartToken`. Token ausente,
 * malformado, expirado ou emitido para outro par (colaborador, ciclo,
 * empresa) devolve `0` — o envio cai na faixa `tempo_baixo`, fechando o
 * bypass de simplesmente omitir o token.
 */
async function resolverTempoRespostaNr1(
  rawStartToken: unknown,
  esperado: { companyId: number; employeeId: number; cicloDbId: number },
  now: Date,
): Promise<number> {
  if (typeof rawStartToken !== 'string' || rawStartToken.length === 0) {
    return 0;
  }
  const verificado: Nr1StartVerifyResult = await verifyNr1StartToken(rawStartToken, now);
  if (!verificado.valid) {
    return 0;
  }
  const claims: Nr1StartTokenClaims = verificado.claims;
  const { companyId, employeeId, cicloDbId, issuedAtEpochSeconds } = claims;
  if (
    companyId !== esperado.companyId ||
    employeeId !== esperado.employeeId ||
    cicloDbId !== esperado.cicloDbId
  ) {
    return 0;
  }
  const decorrido = Math.floor(now.getTime() / 1000) - issuedAtEpochSeconds;
  return decorrido > 0 ? decorrido : 0;
}
