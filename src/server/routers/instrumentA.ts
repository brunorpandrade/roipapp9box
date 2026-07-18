// ROIP APP 9BOX — sub-router `instrumentA` (ME-039).
//
// Decima ME do Bloco B3. Fecha a SEGUNDA e ULTIMA perna canonica de
// escrita do Eixo Y: par simetrico ao Instrumento C entregue na ME-038.
// A ponta de escrita "normal" do Instrumento A vive no Route Handler
// canonico `POST /api/portal/save-instrument-a` (§6.8 primeira linha —
// portal autenticado por CPF via `portalToken`, NAO via tRPC); este
// sub-router expoe apenas o desbloqueio manual por Bruno (§6.8 sexta
// linha). Depois desta ME, o motor de plenitude (§6.4) pode nascer na
// ME seguinte ja com ambas as fontes disponiveis (A e C respondidos) —
// RV-13 satisfeito naturalmente, sem hook no-op (S094 refutado com o
// mesmo racional S088 do C).
//
// Procedure canonica (DOC 03 §6.8 sexta linha):
//   - `instrumentA.reopenResponse` — desbloqueio manual do A por Bruno.
//     Padrao canonico 100-500 (§2). Cria linha em `instrumentUnlockLog`
//     com `instrumento='A'`, `expiraEm=now+24h`, `houveAlteracao=false`.
//     Exclusivo super_admin (S086 estendido a A, analogo ao C).
//
// NAO pertence ao escopo desta ME (S089 pattern replicado da ME-038):
//   - `getInstrumentAStatus` (§6.8 segunda linha) — agregacao por
//     empresa/trimestre com JOIN em employees e escopo hierarquico.
//     Merece ME propria (analogo a `getPendencies` do C, que tambem
//     ficou fora da ME-038). Incluir aqui inflaria a ME sem novo
//     chamador de service.
//   - `saveInstrumentAResponse` (§6.8 primeira linha) — canonicamente
//     via portal (nao tRPC). Vive no Route Handler
//     `POST /api/portal/save-instrument-a/route.ts` (S097 revisada).
//
// Convencoes canonicas herdadas:
//   - DI factory `createInstrumentARouter(deps)` (S100, S084 estendido):
//     `now` injetavel (default `() => new Date()`) para testes
//     deterministicos. NAO ha hook de motor de plenitude (S094 — motor
//     futuro fara [EDIT] neste router para injetar hook real, mesma
//     cirurgia que fara no `instrumentC`).
//   - `reopenResponse` (S093): pre-condicao de resposta previa existente
//     (`MSG_REOPEN_SEM_RESPOSTA`); rejeita janela vigente empilhada
//     (`MSG_REOPEN_JA_VIGENTE_A`); guard cruzado companyId (§2.4).
//     Justificativa canonica 100-500 (§2). INSERT em
//     `instrumentUnlockLog` com `instrumento='A'` — o `saveInstrumentA`
//     do portal fara OVERWRITE dentro da janela de 24h aberta aqui
//     (semantica S095).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13). As
//     constantes e schemas Zod exportados sao consumidos pelo Route
//     Handler do portal (`src/app/api/portal/save-instrument-a/route.ts`).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`) +
// Route Handler `POST /api/portal/save-instrument-a/route.ts` (para os
// exports canonicos compartilhados — constantes, schemas e mensagens).
// Testes tRPC: `tests/integration/instrumentA-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { employees, instrumentA_responses, instrumentUnlockLog } from '../../db/schema';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/** §6.2 — 4 dimensoes (Engajamento/Desenvolvimento/Pertencimento/Realizacao). */
export const NUM_DIMENSOES_A = 4 as const;

/** §6.2 — 5 itens por dimensao. */
export const NUM_ITENS_POR_DIMENSAO_A = 5 as const;

/** §6.2 — total de 20 itens por resposta completa. */
export const NUM_ITENS_TOTAL_A = 20 as const;

/** §6.2 — escala canonica: 0 Nunca .. 4 Sempre. */
export const VALOR_MIN_A = 0 as const;
/** §6.2 — teto da escala 0-4. */
export const VALOR_MAX_A = 4 as const;

/** §6.7 — janela canonica de edicao pos-desbloqueio: 24 horas. */
export const UNLOCK_WINDOW_HOURS_A = 24 as const;

/** Milissegundos em 24 horas — usado no calculo de `expiraEm`. */
const UNLOCK_WINDOW_MS_A = UNLOCK_WINDOW_HOURS_A * 60 * 60 * 1000;

// ============================================================
// Mensagens canonicas literais (testadas verbatim — S091 estendido)
// ============================================================

/**
 * §6.7 combinado com S095 — Instrumento A ja foi enviado sem
 * desbloqueio vigente. Diferente do C, o A NAO fecha (§6.7 canoniza
 * explicitamente "Resposta tardia ao Instrumento A NAO e desbloqueio":
 * o card permanece aberto ate ser respondido; uma vez respondido,
 * imutavel ate desbloqueio). Semanticamente distinto do
 * `MSG_TRIMESTRE_FECHADO` do C, portanto texto proprio (S095).
 */
export const MSG_A_JA_ENVIADA =
  'Instrumento A já enviado para este trimestre. Solicite desbloqueio a Bruno se necessário.';

/** §6.1 — antes do dia 16 do ultimo mes do trimestre (S091 estendido). */
export const MSG_TRIMESTRE_NAO_ABERTO_A = 'Instrumento A ainda não disponível para este trimestre.';

/** §6.2 — 20 itens obrigatorios com valor 0-4 (S091 estendido, S101). */
export const MSG_ITENS_INCOMPLETOS_A =
  'O Instrumento A exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.';

/**
 * §6.2 canoniza EXPLICITAMENTE: "C-level nao responde o Instrumento A".
 * Retornado como 403 pelo Route Handler quando `titularType === 'clevel'`
 * no portalToken. Mensagem canonica nova (S099).
 */
export const MSG_CLEVEL_NAO_RESPONDE_A = 'C-level não responde ao Instrumento A.';

/**
 * §2.4 — guard cruzado companyId. Retornado quando o employee resolvido
 * pelo `portalToken.titularId` nao pertence a `portalToken.companyId`
 * (cenario raro mas possivel — token emitido antes de transferencia,
 * ou emissao com companyId inconsistente).
 */
export const MSG_COMPANY_MISMATCH_A = 'Colaborador não pertence à sua empresa.';

/** §4.3 (padrao login) estendido a A — colaborador inativo nao responde. */
export const MSG_EMPLOYEE_INATIVO_A = 'Colaborador inativo não responde ao Instrumento A.';

/** §6.7 — pre-condicao do reopen (resposta previa existente) — S091 estendido. */
export const MSG_REOPEN_SEM_RESPOSTA =
  'Não há resposta registrada para este colaborador neste trimestre.';

/** §6.7 — desbloqueio ja vigente (S091 estendido). */
export const MSG_REOPEN_JA_VIGENTE_A =
  'Já existe desbloqueio vigente para este colaborador neste trimestre.';

// ============================================================
// Schemas Zod canonicos (consumidos pelo router tRPC + Route Handler)
// ============================================================

/** §6.1 — trimestre canonico `YYYY-QN` (S096 replica S092). */
export const TRIMESTRE_SCHEMA_INSTRUMENT_A = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
});

/** §6.2 — dimensao 1..4 (canonica). */
export const DIMENSAO_SCHEMA_INSTRUMENT_A = z.number().int().min(1).max(NUM_DIMENSOES_A);

/** §6.2 — itemIndex 1..5 (canonico, dentro da dimensao). */
export const ITEM_INDEX_SCHEMA_INSTRUMENT_A = z.number().int().min(1).max(NUM_ITENS_POR_DIMENSAO_A);

/** §6.2 — valor 0..4 (canonico). */
export const VALOR_SCHEMA_INSTRUMENT_A = z.number().int().min(VALOR_MIN_A).max(VALOR_MAX_A);

/** §6.2 — item unitario (dimensao, itemIndex, valor). */
export const ITEM_SCHEMA_INSTRUMENT_A = z.object({
  dimensao: DIMENSAO_SCHEMA_INSTRUMENT_A,
  itemIndex: ITEM_INDEX_SCHEMA_INSTRUMENT_A,
  valor: VALOR_SCHEMA_INSTRUMENT_A,
});

/** §2 — justificativa administrativa 100-500 (padrao canonico transversal). */
export const JUSTIFICATIVA_SCHEMA_INSTRUMENT_A = z
  .string()
  .min(100, { message: 'A justificativa deve ter no mínimo 100 caracteres.' })
  .max(500, { message: 'A justificativa deve ter no máximo 500 caracteres.' });

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §6.2 + §6.7 — status canonico da janela do trimestre para o par
 * (employee, trimestre) para o Instrumento A. DIFERENTE do C: A NAO
 * fecha. Apenas 3 estados canonicos possiveis:
 *   - `nao_aberta`: antes do dia 16 do ultimo mes do trimestre;
 *   - `aberta`: apos abertura, sem resposta previa (ou com resposta
 *     previa apenas — a mera existencia de resposta previa NAO fecha
 *     o A canonico; o card some do portal apos responder e fica
 *     imutavel ate desbloqueio, mas a janela permanece "aberta" no
 *     sentido de que resposta tardia ainda pode acontecer se nao houve
 *     envio previo);
 *   - `desbloqueada`: com `instrumentUnlockLog` vigente (edicao dentro
 *     da janela de 24h aberta pelo `reopenResponse`).
 * NAO existe `fechada` para A (§6.7 explicito).
 */
export const STATUS_JANELA_INSTRUMENT_A_VALUES = ['nao_aberta', 'aberta', 'desbloqueada'] as const;

/** Estado canonico da janela do trimestre para o Instrumento A. */
export type StatusJanelaInstrumentA = (typeof STATUS_JANELA_INSTRUMENT_A_VALUES)[number];

/**
 * Resumo canonico do desbloqueio A vigente. Analogo ao
 * `DesbloqueioVigenteResumo` do C, mas tipo proprio para evitar imports
 * cruzados entre routers de dominio distintos.
 */
export interface DesbloqueioVigenteResumoA {
  unlockLogId: number;
  desbloqueadoPor: number;
  desbloqueadoEm: Date | null;
  expiraEm: Date;
  justificativa: string;
}

/** Retorno canonico de `reopenResponse` (analogo a `reopenAssessment` do C). */
export interface ReopenResponseResult {
  unlockLogId: number;
  expiraEm: Date;
}

// ============================================================
// Dependencias injetaveis (S100 — sem hook de motor S094)
// ============================================================

/**
 * Relogio injetavel para testes deterministicos. Sem hook de motor de
 * plenitude (S094 — mesmo racional S088): o motor sera introduzido em
 * ME futura com [EDIT] neste router para injetar `onResponseSaved` real.
 * Hook no-op cria superficie sem chamador real (RV-13 estrito).
 */
export interface InstrumentARouterDeps {
  now?: () => Date;
}

interface ResolvedDepsA {
  now: () => Date;
}

function resolveDepsA(deps: InstrumentARouterDeps): ResolvedDepsA {
  return {
    now: deps.now ?? (() => new Date()),
  };
}

// ============================================================
// Guards e helpers canonicos (compartilhaveis com o Route Handler)
// ============================================================

/**
 * Resolve o `superAdminId` do titular. Usado por `reopenResponse` (proc
 * exclusiva de super_admin — §6.8 sexta linha).
 */
function requireSuperAdminIdA(user: AuthenticatedUser): number {
  if (user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Esta operação é exclusiva do Super Admin.',
    });
  }
  return user.superAdminId;
}

/**
 * Verifica que a lista de itens do submit cobre exatamente as 20
 * combinacoes canonicas (dimensao 1..4 x itemIndex 1..5), sem duplicatas
 * e sem lacunas. Retorna `true` se cobre; `false` caso contrario.
 * Consumido pelo Route Handler do portal (o router tRPC nao expoe save,
 * mas mantemos o helper exportavel para reuso — RV-13 exige chamador
 * real, satisfeito pelo Route Handler e pelo teste tRPC unitario).
 */
export function itensCobremGridCanonicoA(
  itens: readonly { dimensao: number; itemIndex: number }[],
): boolean {
  if (itens.length !== NUM_ITENS_TOTAL_A) {
    return false;
  }
  const chaves = new Set<string>();
  for (const item of itens) {
    chaves.add(`${item.dimensao}-${item.itemIndex}`);
  }
  if (chaves.size !== NUM_ITENS_TOTAL_A) {
    return false;
  }
  for (let d = 1; d <= NUM_DIMENSOES_A; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_A; i++) {
      if (!chaves.has(`${d}-${i}`)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Resolve o `instrumentUnlockLog` do tipo 'A' vigente (`expiraEm > now`)
 * para o par (employeeId, trimestre), se houver. Ordenado por
 * `desbloqueadoEm DESC, id DESC` — o mais recente vence. Retorna
 * `undefined` quando nao ha janela vigente. Exportado para consumo
 * pelo Route Handler do portal (semantica S095 — OVERWRITE quando
 * desbloqueio vigente).
 */
export async function findVigenteInstrumentUnlockA(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  now: Date,
) {
  const rows = await db
    .select()
    .from(instrumentUnlockLog)
    .where(
      and(
        eq(instrumentUnlockLog.employeeId, employeeId),
        eq(instrumentUnlockLog.trimestre, trimestre),
        eq(instrumentUnlockLog.instrumento, 'A'),
        gt(instrumentUnlockLog.expiraEm, now),
      ),
    )
    .orderBy(desc(instrumentUnlockLog.desbloqueadoEm), desc(instrumentUnlockLog.id))
    .limit(1);
  return rows[0];
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `instrumentA` com dependencias injetadas
 * (S100, S084 estendido). Producao chama sem argumentos — o unico
 * default e o relogio. Testes injetam `now` fixo para determinismo.
 * Sem hook de motor (S094 — motor futuro fara [EDIT] deste router para
 * plugar `onResponseSaved` real, mesma cirurgia analoga que fara no
 * `instrumentC`).
 */
export function createInstrumentARouter(deps: InstrumentARouterDeps = {}) {
  const resolved = resolveDepsA(deps);

  return router({
    /**
     * §6.7 + §6.8 sexta linha — desbloqueio manual DIRETO por Bruno
     * (exclusivo super_admin). Cria linha em `instrumentUnlockLog` com
     * `instrumento='A'`, `expiraEm=now+24h`, `houveAlteracao=false`.
     * Pre-condicoes: resposta previa existente
     * (`MSG_REOPEN_SEM_RESPOSTA` se nenhum registro) e ausencia de
     * janela vigente para o mesmo par (`MSG_REOPEN_JA_VIGENTE_A`).
     * Justificativa canonica 100-500 (§2). Nao transiciona nenhum flag
     * na tabela de respostas — o reopen abre a janela por 24h e o
     * Route Handler `save-instrument-a` faz OVERWRITE dentro dela
     * (semantica S095).
     */
    reopenResponse: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          employeeId: z.number().int().positive(),
          trimestre: TRIMESTRE_SCHEMA_INSTRUMENT_A,
          justificativa: JUSTIFICATIVA_SCHEMA_INSTRUMENT_A,
        }),
      )
      .mutation(async ({ ctx, input }): Promise<ReopenResponseResult> => {
        const superAdminId = requireSuperAdminIdA(ctx.user);
        const now = resolved.now();
        const expiraEm = new Date(now.getTime() + UNLOCK_WINDOW_MS_A);

        // §2.4 — guard cruzado. Colaborador deve pertencer a companyId.
        const [emp] = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        if (!emp || emp.companyId !== input.companyId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_A });
        }

        // §6.7 — pre-condicao: resposta previa. Sem registro, nao ha o
        // que reabrir. Diferente do C, Bruno nao pode "abrir para
        // receber pela primeira vez" via reopen: para o A, resposta
        // tardia sem envio previo NAO e desbloqueio (§6.7 literal —
        // A nao fecha; portal aceita tardia como comportamento normal).
        const [previa] = await ctx.db
          .select({ id: instrumentA_responses.id })
          .from(instrumentA_responses)
          .where(
            and(
              eq(instrumentA_responses.employeeId, input.employeeId),
              eq(instrumentA_responses.trimestre, input.trimestre),
            ),
          )
          .limit(1);
        if (!previa) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_REOPEN_SEM_RESPOSTA });
        }

        // §6.7 — nao empilha janelas. Se ha desbloqueio vigente, rejeita
        // 409 (Bruno aguarda ou o job de expiracao ME futura fecha).
        const vigente = await findVigenteInstrumentUnlockA(
          ctx.db,
          input.employeeId,
          input.trimestre,
          now,
        );
        if (vigente) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_REOPEN_JA_VIGENTE_A });
        }

        // INSERT canonico em instrumentUnlockLog (§6.7).
        const [inserted] = await ctx.db
          .insert(instrumentUnlockLog)
          .values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            trimestre: input.trimestre,
            instrumento: 'A',
            desbloqueadoPor: superAdminId,
            justificativa: input.justificativa,
            desbloqueadoEm: now,
            expiraEm,
            houveAlteracao: false,
            ajusteRetroativo: false,
            createdAt: now,
          })
          .$returningId();
        if (!inserted) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Falha ao registrar o desbloqueio (insert sem id).',
          });
        }
        return { unlockLogId: inserted.id, expiraEm };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type InstrumentARouter = ReturnType<typeof createInstrumentARouter>;
