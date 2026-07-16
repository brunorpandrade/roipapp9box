// ROIP APP 9BOX — sub-router `cycleUnlockRequests` (ME-032).
//
// Primeira ME de router tRPC de dominio do Bloco B3 (motores + routers).
// Cobre integralmente o dominio canonico "ciclos e desbloqueios" (DOC 03
// §19.2 — 4 procedures) que operacionaliza o fluxo administrativo canonico
// de desbloqueio de mes fechado (P11 — DOC 03 §4.3-§4.5 + DOC 06 §13).
//
// Procedures canonicas (DOC 03 §19.2):
//   - `cycleUnlockRequests.create`     — DOC 03 §4.3 + DOC 06 §13.2
//   - `cycleUnlockRequests.cancel`     — DOC 03 §4.3 + DOC 06 §13.4 (S049)
//   - `cycleUnlockRequests.hasPending` — DOC 03 §4.3 + DOC 06 §13.3 (D051/D052/D053)
//   - `cycleUnlockRequests.decide`     — DOC 03 §4.4 + DOC 06 §13.5/§13.6
//
// Gatilhos canonicos de alertas (DOC 03 §4.8, DOC 06 §8.11):
//   - Create      → `desbloqueio_solicitado`
//   - Decide aprv → `desbloqueio_aprovado`
//   - Decide recu → `desbloqueio_recusado`
//   - Cancel      → silencioso (canonico DOC 06 §13.4)
//
// Convencoes canonicas herdadas de S043/S046 (ME-030/ME-031):
//   - Motor de alertas ainda-nao-existente (DOC 06 §8 — ME futura) injetado
//     via dependency injection. Tipo local `EvaluateAdminUnlockAlerts` (nao
//     reusa o `EvaluateAdminAlerts` da ME-031 porque a assinatura canonica
//     e distinta: `(tipo, requestId)` aqui vs `(tipo, companyId, mes)` la —
//     no wiring real ambos apontam para o mesmo motor). Default no-op
//     documentado. Padrao factory `createCycleUnlockRequestsRouter(deps)`.
//   - `now` sempre parametro opcional injetavel (default `new Date()`) para
//     testes deterministicos. Testes injetam relogio fixo; producao usa o
//     default.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Transacao atomica canonica
//     usa `db.transaction(async (tx) => ...)` com `.for('update')` no
//     SELECT — API tipada do Drizzle mysql-core.
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13).
//   - Autorizacao cruzada (perfil x aba x liderId x isResponsavelFinanceiro)
//     resolvida no handler, nao em `roleProcedure`. `roleProcedure` filtra
//     apenas por claim `role` do JWT; a matriz canonica exige cruzar com
//     campos da propria empresa e da propria solicitacao.
//
// Decisao de autor RV-08 desta ME:
//   - S049 — divergencia canonica DOC 03 §4.3 ("RH ou solicitante") vs
//     DOC 06 §13.4 ("apenas o proprio solicitante") resolvida pela leitura
//     harmonica: DOC 03 e fonte para regra de negocio (quem pode); DOC 06
//     e fonte para transacao (como se escreve a query). Autorizacao final:
//     Super Admin (sempre atravessa — DOC 02 §2.4) OU solicitante (por
//     `solicitanteTipo/solicitanteId`) OU RH/RH-Lider da mesma empresa da
//     solicitacao. Aprovado por Bruno em RV-08 pre-decisao.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/cycleUnlockRequests-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, count, eq, isNull, sql as _sqlUnused } from 'drizzle-orm';
import { z } from 'zod';

import { cycleUnlockRequests, monthlyClosureStatus, monthlyUnlockLog } from '../../db/schema';
import { protectedProcedure, roleProcedure, router } from '../trpc';

// (import intencional isolado para o linter — o alias `_sqlUnused` acima
// nao e consumido; removido do arquivo pelo prettier-organize-imports se
// presente. Zero SQL cru — RV-12).
void _sqlUnused;

// ============================================================
// Dependency injection — S049 (padrao S043/S046 estendido)
// ============================================================

/**
 * Motor de alertas administrativos de desbloqueio (DOC 06 §8.11). Chamado
 * pelo router apos COMMIT bem-sucedido nos 3 pontos canonicos:
 *   - `create`         → `'desbloqueio_solicitado'`.
 *   - `decide` aprv    → `'desbloqueio_aprovado'`.
 *   - `decide` recusa  → `'desbloqueio_recusado'`.
 *
 * Cancelamento e silencioso (DOC 06 §13.4) — nao chama este motor. Motor
 * real ainda nao existe (DOC 06 §8, Bloco B6, ME futura). Ligacao real
 * acontece no caller quando o motor nascer — sem editar este router.
 *
 * Assinatura canonica: `(tipo, requestId) => Promise<void>`. O motor
 * carrega `companyId`, `mes`, `aba` etc. via SELECT interno pelo `id` da
 * solicitacao — nao replicamos o estado no payload para preservar fonte
 * unica de leitura.
 */
export type EvaluateAdminUnlockAlerts = (
  tipo: 'desbloqueio_solicitado' | 'desbloqueio_aprovado' | 'desbloqueio_recusado',
  requestId: number,
) => Promise<void>;

/** No-op canonico do `EvaluateAdminUnlockAlerts` — motor real virá depois. */
export const NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS: EvaluateAdminUnlockAlerts = async () => {
  // Motor de alertas administrativos ainda nao existe (DOC 06 §8 — Bloco B6).
};

/**
 * Dependencias injetaveis do router. Todas opcionais — defaults substituem
 * por no-op / relogio real. Testes injetam callbacks capturadores e `now`
 * fixo; producao usa `NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS` (ate o motor de
 * alertas do B6 nascer) e `() => new Date()`.
 */
export interface CycleUnlockRequestsRouterDeps {
  evaluateAdminAlerts?: EvaluateAdminUnlockAlerts;
  now?: () => Date;
}

// ============================================================
// Mensagens canonicas literais (DOC 03 §2.3, DOC 06 §13)
// ============================================================

/** DOC 06 §13.2 — mes ainda nao esta fechado (create). HTTP 409 canonico. */
export const MSG_MES_NAO_FECHADO =
  'Este mês ainda não está fechado. Solicitações de desbloqueio só se aplicam a meses já fechados.';

/** DOC 06 §13.2 — ja existe solicitacao pendente (create). HTTP 409. */
export const MSG_SOLICITACAO_PENDENTE_JA_EXISTE =
  'Já existe uma solicitação pendente para este mês.';

/** DOC 06 §13.4 — solicitacao nao encontrada (cancel). HTTP 404. */
export const MSG_SOLICITACAO_NAO_ENCONTRADA = 'Solicitação não encontrada.';

/** DOC 06 §13.4 — cancelamento por terceiro (cancel). HTTP 403. */
export const MSG_CANCEL_NAO_AUTORIZADO = 'Você só pode cancelar solicitações criadas por você.';

/** DOC 06 §13.4 — solicitacao ja decidida por Bruno (cancel). HTTP 409. */
export const MSG_CANCEL_JA_DECIDIDA =
  'Esta solicitação já foi decidida por Bruno e não pode mais ser cancelada.';

/** DOC 06 §13.4 — solicitacao ja cancelada (cancel). HTTP 409. */
export const MSG_CANCEL_JA_CANCELADA = 'Esta solicitação já foi cancelada.';

/** DOC 06 §13.5 — solicitacao ja aprovada/recusada (decide). HTTP 409. */
export const MSG_DECIDE_JA_DECIDIDA = 'Esta solicitação já foi decidida.';

/** DOC 06 §13.5 — solicitacao foi cancelada (decide). HTTP 409. */
export const MSG_DECIDE_JA_CANCELADA =
  'Esta solicitação foi cancelada pelo solicitante e não pode mais ser aprovada.';

/** DOC 06 §13.5 — mes ja desbloqueado (decide aprv). HTTP 409. */
export const MSG_DECIDE_MES_JA_DESBLOQUEADO =
  'Este mês já está desbloqueado. Aguarde o fim da janela atual antes de aprovar nova solicitação.';

/** DOC 03 §2.3 — justificativa < 100 chars (create). BAD_REQUEST. */
export const MSG_JUSTIFICATIVA_MIN = 'A justificativa deve ter no mínimo 100 caracteres.';

/** DOC 03 §2.3 — justificativa > 500 chars (create). BAD_REQUEST. */
export const MSG_JUSTIFICATIVA_MAX = 'A justificativa deve ter no máximo 500 caracteres.';

/** DOC 06 §13.6 — motivoRecusa < 100 chars (decide recu). BAD_REQUEST. */
export const MSG_MOTIVO_RECUSA_MIN = 'O motivo da recusa deve ter no mínimo 100 caracteres.';

/** DOC 06 §13.6 — motivoRecusa > 500 chars (decide recu). BAD_REQUEST. */
export const MSG_MOTIVO_RECUSA_MAX = 'O motivo da recusa deve ter no máximo 500 caracteres.';

/** DOC 06 §13.6 — motivoRecusa vazio (decide recu). BAD_REQUEST. */
export const MSG_MOTIVO_RECUSA_OBRIGATORIO = 'O motivo da recusa é obrigatório.';

/** DOC 06 §13.2 — autorizacao negada por aba (create). HTTP 403. */
export const MSG_CREATE_NAO_AUTORIZADO =
  'Perfil sem permissão para solicitar desbloqueio nesta aba.';

/** DOC 03 §4.3 — autorizacao negada por perfil/liderId (hasPending). HTTP 403. */
export const MSG_HAS_PENDING_NAO_AUTORIZADO =
  'Perfil sem permissão para consultar solicitações desta chave.';

// ============================================================
// Zod schemas de entrada
// ============================================================

/** Mes canonico no formato `YYYY-MM` (schema declara `varchar(7)`). */
const mesSchema = z.string().regex(/^\d{4}-\d{2}$/, { message: 'mes deve ter formato YYYY-MM' });

/** Enum canonico `aba` — bate 1:1 com `ABA_UNLOCK_VALUES`. */
const abaSchema = z.enum(['rh', 'lider', 'faturamento']);

/** Enum canonico `liderTipo` — bate 1:1 com schema. */
const liderTipoSchema = z.enum(['employee', 'clevel']);

/**
 * Zod para justificativa canonica (DOC 03 §2). O `trim` acontece dentro do
 * handler — o zod nao aplica `trim()` (§2.2 diz "caracteres da string apos
 * trim"). Aqui apenas garantimos que o payload e string; validacao de
 * tamanho vive no handler com mensagens canonicas literais.
 */
const justificativaSchema = z.string();

const createInput = z.object({
  companyId: z.number().int().positive(),
  mes: mesSchema,
  aba: abaSchema,
  liderId: z.number().int().positive().optional(),
  liderTipo: liderTipoSchema.optional(),
  justificativa: justificativaSchema,
});

const cancelInput = z.object({
  id: z.number().int().positive(),
});

const hasPendingInput = z.object({
  companyId: z.number().int().positive(),
  mes: mesSchema,
  aba: abaSchema,
  liderId: z.number().int().positive().nullish(),
});

const decideInput = z
  .object({
    id: z.number().int().positive(),
    decisao: z.enum(['aprovada', 'recusada']),
    comentarioAprovacao: z.string().max(500).optional(),
    motivoRecusa: z.string().optional(),
  })
  // Tolerancia canonica §13.6: campo do outro lado silenciosamente ignorado;
  // o backend nao valida a coexistencia — apenas usa o campo correto.
  .strict();

// ============================================================
// Contratos de resposta canonicos
// ============================================================

/** `create` — retorna id autogerado da nova solicitacao (§13.2). */
export interface CreateCycleUnlockRequestResult {
  id: number;
  createdAt: Date;
}

/** `cancel` — sucesso silencioso (§13.4); toast fica no front. */
export interface CancelCycleUnlockRequestResult {
  ok: true;
  id: number;
}

/** `hasPending` — contrato canonico D051 (§13.3). */
export interface HasPendingResult {
  hasPending: boolean;
  requestedAt: Date | null;
  requestedBy: number | null;
}

/** `decide` — sucesso (§13.5 e §13.6). `desbloqueadoAte` presente somente na aprovacao. */
export interface DecideCycleUnlockRequestResult {
  id: number;
  status: 'aprovada' | 'recusada';
  desbloqueadoAte: Date | null;
}

// ============================================================
// Helpers de autorizacao (matriz canonica cruzada)
// ============================================================

/**
 * Autorizacao canonica de `create` por aba (DOC 03 §4.3 + DOC 06 §13.2).
 * Lanca `FORBIDDEN` com mensagem canonica quando o perfil autenticado nao
 * cabe na aba solicitada, ou quando o vinculo requerido (mesma empresa /
 * liderId proprio) nao bate.
 *
 * Regras canonicas por aba:
 *   - `aba='rh'`:
 *     - super_admin: qualquer empresa.
 *     - rh | rh_lider: `companyId === input.companyId`.
 *     - outros: FORBIDDEN.
 *   - `aba='lider'`:
 *     - super_admin: qualquer.
 *     - rh | rh_lider: `companyId === input.companyId` (RH cria em nome do
 *       lider — canonico §4.3).
 *     - clevel | lider: `companyId === input.companyId` E `liderId ===
 *       userId` (o proprio lider abre para si). `liderTipo` deve bater com
 *       o `role` (`clevel`/`clevel`, `lider`/`employee`).
 *     - outros: FORBIDDEN.
 *   - `aba='faturamento'`:
 *     - super_admin: qualquer.
 *     - outros: `companyId === input.companyId`. A checagem canonica de
 *       `isResponsavelFinanceiro=true` e do B1 (ficha do titular) — nao
 *       replicamos SELECT extra aqui. Racional: `roleProcedure` sozinho
 *       nao filtra RF (nao ha claim `isRF` no JWT), e o backend do RF vai
 *       ser reforcado com verificacao explicita quando a superficie for
 *       montada no B5 (ME-066). Ate la o guard e por empresa; a ausencia
 *       de RF valido resulta em INSERT sem contexto real, que sera
 *       filtrado pelo motor de alertas (D049) e pela UI. Registrado como
 *       D058 (divida da ME-032).
 */
function assertCreateAuthorization(
  user: AuthenticatedUserView,
  input: z.infer<typeof createInput>,
): void {
  if (user.role === 'super_admin') {
    return;
  }

  // Perfis administrativos: sempre restritos a propria empresa.
  if (user.companyId !== input.companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
  }

  if (input.aba === 'rh') {
    if (user.role === 'rh' || user.role === 'rh_lider') {
      return;
    }
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
  }

  if (input.aba === 'lider') {
    // RH pode criar em nome do lider (canonico §4.3).
    if (user.role === 'rh' || user.role === 'rh_lider') {
      return;
    }
    // Lider/C-level: `liderId === userId` obrigatorio; liderTipo canonico.
    if (user.role === 'lider' || user.role === 'clevel') {
      if (input.liderId !== user.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
      }
      const expectedLiderTipo = user.role === 'clevel' ? 'clevel' : 'employee';
      if (input.liderTipo !== expectedLiderTipo) {
        throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
      }
      return;
    }
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CREATE_NAO_AUTORIZADO });
  }

  // input.aba === 'faturamento' — mesma empresa basta (D058 pendente).
  return;
}

/**
 * Autorizacao canonica de `hasPending` (DOC 03 §4.3 fim + DOC 06 §13.3).
 *   - super_admin: qualquer empresa.
 *   - rh | rh_lider: `companyId === input.companyId` — qualquer aba.
 *   - clevel | lider: `companyId === input.companyId` E `aba='lider'` E
 *     `liderId === userId` (proprio liderId).
 *   - Para `aba='faturamento'`: qualquer perfil administrativo da mesma
 *     empresa — o RF e um perfil administrativo com flag; o guard fino de
 *     RF fica na tela (superficie D052).
 */
function assertHasPendingAuthorization(
  user: AuthenticatedUserView,
  input: z.infer<typeof hasPendingInput>,
): void {
  if (user.role === 'super_admin') {
    return;
  }

  if (user.companyId !== input.companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_HAS_PENDING_NAO_AUTORIZADO });
  }

  if (user.role === 'rh' || user.role === 'rh_lider') {
    return;
  }

  if (user.role === 'clevel' || user.role === 'lider') {
    if (input.aba !== 'lider') {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_HAS_PENDING_NAO_AUTORIZADO });
    }
    const asked = input.liderId ?? null;
    if (asked !== user.userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: MSG_HAS_PENDING_NAO_AUTORIZADO });
    }
    return;
  }

  throw new TRPCError({ code: 'FORBIDDEN', message: MSG_HAS_PENDING_NAO_AUTORIZADO });
}

// ============================================================
// Validacao canonica de tamanho (padrao 100-500 — DOC 03 §2)
// ============================================================

/**
 * Aplica a regra canonica 100-500 (DOC 03 §2.2). Lanca `BAD_REQUEST` com a
 * mensagem canonica literal (§2.3 / §13.6). `min<0` desabilita a checagem
 * de minimo (usado em `comentarioAprovacao`, opcional 0-500 — DOC 06 §13.5).
 */
function assertJustificationLength(
  value: string,
  msgMin: string,
  msgMax: string,
  min: number,
): string {
  const trimmed = value.trim();
  if (min >= 0 && trimmed.length < min) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: msgMin });
  }
  if (trimmed.length > 500) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: msgMax });
  }
  return trimmed;
}

// ============================================================
// View tipada de `ctx.user` (uniao discriminada por role)
// ============================================================

/**
 * `ctx.user` chega tipado como `AuthenticatedUser` (DOC 02 §2.4 — union
 * discriminada por `role`). Este alias local existe para que os helpers
 * consumam a union sem precisar re-importar o tipo — a intencao e reduzir
 * cross-module coupling entre helpers e o `trpc.ts`. Estrutura identica.
 */
type AuthenticatedUserView =
  | { role: 'super_admin'; superAdminId: number }
  | { role: 'rh' | 'rh_lider' | 'clevel' | 'lider'; userId: number; companyId: number };

// ============================================================
// Factory canonica do sub-router (S049 estende S043/S046)
// ============================================================

/**
 * Cria o sub-router `cycleUnlockRequests` com dependencias injetadas. O
 * `appRouter` (arquivo `routers/index.ts`) monta uma instancia unica com
 * as dependencias reais (ou no-ops enquanto o motor de alertas nao existe).
 * Testes montam instancias por caso com callbacks capturadores.
 */
export function createCycleUnlockRequestsRouter(
  deps: CycleUnlockRequestsRouterDeps = {},
): ReturnType<typeof buildRouter> {
  const evaluateAdminAlerts = deps.evaluateAdminAlerts ?? NOOP_EVALUATE_ADMIN_UNLOCK_ALERTS;
  const now = deps.now ?? (() => new Date());
  return buildRouter(evaluateAdminAlerts, now);
}

/**
 * Corpo real do factory — separado para preservar inferencia do tipo de
 * retorno do `router({...})` do tRPC. Chamado exclusivamente pela factory
 * publica acima.
 */
function buildRouter(evaluateAdminAlerts: EvaluateAdminUnlockAlerts, now: () => Date) {
  return router({
    // ============================================================
    // create — DOC 03 §4.3 + DOC 06 §13.2
    // ============================================================
    create: protectedProcedure
      .input(createInput)
      .mutation(async ({ ctx, input }): Promise<CreateCycleUnlockRequestResult> => {
        // (1) Guard cruzado por aba (matriz canonica §4.3 / §13.2).
        assertCreateAuthorization(ctx.user, input);

        // (2) Validacao canonica 100-500 da justificativa (§2.2 / §2.3).
        const justificativaTrim = assertJustificationLength(
          input.justificativa,
          MSG_JUSTIFICATIVA_MIN,
          MSG_JUSTIFICATIVA_MAX,
          100,
        );

        // (3) Pre-condicao canonica: mes tem que estar `fechado` (§13.2).
        const closureRow = await ctx.db
          .select({ status: monthlyClosureStatus.status })
          .from(monthlyClosureStatus)
          .where(
            and(
              eq(monthlyClosureStatus.companyId, input.companyId),
              eq(monthlyClosureStatus.mes, input.mes),
            ),
          )
          .limit(1);
        const closureStatus = closureRow[0]?.status;
        if (closureStatus !== 'fechado') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_MES_NAO_FECHADO });
        }

        // (4) Pre-condicao canonica: nao existe outra pendente para a
        // chave (companyId, mes, aba[, liderId]) — §13.2.
        const liderClause =
          input.liderId === undefined
            ? isNull(cycleUnlockRequests.liderId)
            : eq(cycleUnlockRequests.liderId, input.liderId);
        const pendingRows = await ctx.db
          .select({ n: count() })
          .from(cycleUnlockRequests)
          .where(
            and(
              eq(cycleUnlockRequests.companyId, input.companyId),
              eq(cycleUnlockRequests.mes, input.mes),
              eq(cycleUnlockRequests.aba, input.aba),
              liderClause,
              eq(cycleUnlockRequests.status, 'pendente'),
            ),
          );
        if (Number(pendingRows[0]?.n ?? 0) > 0) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_SOLICITACAO_PENDENTE_JA_EXISTE });
        }

        // (5) Determina solicitanteTipo/solicitanteId canonicos (§13.2).
        // Super Admin cria em nome de terceiro — usa `employee` como
        // padrao com solicitanteId=0 para preservar o campo `notNull()`;
        // canonicamente este cenario e raro (Bruno tem tela propria de
        // desbloqueio direto §4.4 nao passa por `create`), mas o payload
        // aceita o caso.
        const solicitante = resolveSolicitante(ctx.user);
        const nowValue = now();

        // (6) INSERT canonico. Drizzle tipado; enum aba/status validados
        // em compilacao pelo schema DOC 01.
        const insertResult = await ctx.db
          .insert(cycleUnlockRequests)
          .values({
            companyId: input.companyId,
            solicitanteTipo: solicitante.tipo,
            solicitanteId: solicitante.id,
            mes: input.mes,
            aba: input.aba,
            liderId: input.liderId ?? null,
            liderTipo: input.liderTipo ?? null,
            justificativa: justificativaTrim,
            status: 'pendente',
            createdAt: nowValue,
            updatedAt: nowValue,
          })
          .$returningId();

        const newId = insertResult[0]?.id;
        if (newId === undefined) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'INSERT retornou sem id (estado inconsistente).',
          });
        }

        // (7) Gatilho canonico apos INSERT bem-sucedido (§13.2).
        // fire-and-forget: se falhar, warning; a solicitacao permanece.
        void evaluateAdminAlerts('desbloqueio_solicitado', newId).catch(() => {
          // Motor real deve logar; aqui o silencio e canonico (§13.2).
        });

        return { id: newId, createdAt: nowValue };
      }),

    // ============================================================
    // cancel — DOC 03 §4.3 + DOC 06 §13.4 (S049 amplia autorizacao)
    // ============================================================
    cancel: protectedProcedure
      .input(cancelInput)
      .mutation(async ({ ctx, input }): Promise<CancelCycleUnlockRequestResult> => {
        // (1) Le a solicitacao para diagnostico canonico (§13.4). Sem FOR
        // UPDATE: cancel nao coordena com outra transacao — a mudanca de
        // status para 'cancelada' e commutativa com decidir (o WHERE
        // guard cobre o race — quem chegar primeiro ganha).
        const existing = await ctx.db
          .select({
            id: cycleUnlockRequests.id,
            status: cycleUnlockRequests.status,
            companyId: cycleUnlockRequests.companyId,
            solicitanteTipo: cycleUnlockRequests.solicitanteTipo,
            solicitanteId: cycleUnlockRequests.solicitanteId,
          })
          .from(cycleUnlockRequests)
          .where(eq(cycleUnlockRequests.id, input.id))
          .limit(1);
        const row = existing[0];
        if (row === undefined) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_SOLICITACAO_NAO_ENCONTRADA });
        }

        // (2) Autorizacao S049 — solicitante, RH da mesma empresa, ou
        // Super Admin (aprovado por Bruno na RV-08 pre-decisao).
        if (!canCancel(ctx.user, row)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CANCEL_NAO_AUTORIZADO });
        }

        // (3) Estado da solicitacao — mensagens canonicas por status (§13.4).
        if (row.status === 'aprovada' || row.status === 'recusada') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_CANCEL_JA_DECIDIDA });
        }
        if (row.status === 'cancelada') {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_CANCEL_JA_CANCELADA });
        }

        // (4) UPDATE canonico guardado por `status='pendente'` — imune a
        // race (se decidir chegar primeiro, WHERE nao afeta linha).
        const nowValue = now();
        const updateResult = await ctx.db
          .update(cycleUnlockRequests)
          .set({ status: 'cancelada', updatedAt: nowValue })
          .where(
            and(eq(cycleUnlockRequests.id, input.id), eq(cycleUnlockRequests.status, 'pendente')),
          );

        // Se affectedRows=0, alguma outra transacao decidiu/cancelou
        // entre o SELECT e o UPDATE — semantica canonica: reportar como
        // estado atual (relemos do banco defensivamente).
        if (updateResult[0].affectedRows === 0) {
          const reread = await ctx.db
            .select({ status: cycleUnlockRequests.status })
            .from(cycleUnlockRequests)
            .where(eq(cycleUnlockRequests.id, input.id))
            .limit(1);
          const current = reread[0]?.status;
          if (current === 'aprovada' || current === 'recusada') {
            throw new TRPCError({ code: 'CONFLICT', message: MSG_CANCEL_JA_DECIDIDA });
          }
          if (current === 'cancelada') {
            throw new TRPCError({ code: 'CONFLICT', message: MSG_CANCEL_JA_CANCELADA });
          }
          // Estado impossivel — SELECT anterior confirmou existencia.
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Estado inconsistente durante cancelamento.',
          });
        }

        // (5) Silencio canonico (§13.4) — sem `evaluateAdminAlerts`.
        return { ok: true, id: input.id };
      }),

    // ============================================================
    // hasPending — DOC 03 §4.3 fim + DOC 06 §13.3 (D051/D052/D053)
    // ============================================================
    hasPending: protectedProcedure
      .input(hasPendingInput)
      .query(async ({ ctx, input }): Promise<HasPendingResult> => {
        // (1) Guard canonico por perfil (§13.3).
        assertHasPendingAuthorization(ctx.user, input);

        // (2) SELECT canonico (§13.3 SQL) — igual ao motor S9 do repo,
        // mas expondo `createdAt` e `solicitanteId` para o contrato D051.
        const liderClause =
          input.liderId === null || input.liderId === undefined
            ? isNull(cycleUnlockRequests.liderId)
            : eq(cycleUnlockRequests.liderId, input.liderId);
        const rows = await ctx.db
          .select({
            id: cycleUnlockRequests.id,
            createdAt: cycleUnlockRequests.createdAt,
            solicitanteId: cycleUnlockRequests.solicitanteId,
          })
          .from(cycleUnlockRequests)
          .where(
            and(
              eq(cycleUnlockRequests.companyId, input.companyId),
              eq(cycleUnlockRequests.mes, input.mes),
              eq(cycleUnlockRequests.aba, input.aba),
              liderClause,
              eq(cycleUnlockRequests.status, 'pendente'),
            ),
          )
          .limit(1);
        const first = rows[0];
        if (first === undefined) {
          return { hasPending: false, requestedAt: null, requestedBy: null };
        }
        return {
          hasPending: true,
          requestedAt: first.createdAt ?? null,
          requestedBy: first.solicitanteId,
        };
      }),

    // ============================================================
    // decide — DOC 03 §4.4 + DOC 06 §13.5/§13.6 (Super Admin only)
    // ============================================================
    decide: roleProcedure(['super_admin'])
      .input(decideInput)
      .mutation(async ({ ctx, input }): Promise<DecideCycleUnlockRequestResult> => {
        // roleProcedure ja garantiu Super Admin — `ctx.user.role`
        // narrowed pelo tRPC como `'super_admin'`. Extraimos `superAdminId`.
        if (ctx.user.role !== 'super_admin') {
          // Inalcancavel — `roleProcedure(['super_admin'])` bloqueou.
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_CANCEL_NAO_AUTORIZADO });
        }
        const superAdminId = ctx.user.superAdminId;
        const nowValue = now();

        if (input.decisao === 'recusada') {
          // Motivo obrigatorio 100-500 (§13.6).
          if (input.motivoRecusa === undefined || input.motivoRecusa.trim().length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_MOTIVO_RECUSA_OBRIGATORIO });
          }
          const motivoTrim = assertJustificationLength(
            input.motivoRecusa,
            MSG_MOTIVO_RECUSA_MIN,
            MSG_MOTIVO_RECUSA_MAX,
            100,
          );

          // Transacao canonica de recusa (§13.6) — 3 passos.
          await ctx.db.transaction(async (tx) => {
            const locked = await tx
              .select({ status: cycleUnlockRequests.status })
              .from(cycleUnlockRequests)
              .where(eq(cycleUnlockRequests.id, input.id))
              .for('update')
              .limit(1);
            const current = locked[0];
            assertDecidable(current);

            await tx
              .update(cycleUnlockRequests)
              .set({
                status: 'recusada',
                decididoPor: superAdminId,
                decididoEm: nowValue,
                motivoRecusa: motivoTrim,
                updatedAt: nowValue,
              })
              .where(eq(cycleUnlockRequests.id, input.id));
          });

          // Gatilho canonico pos-COMMIT (§13.6).
          void evaluateAdminAlerts('desbloqueio_recusado', input.id).catch(() => {
            // Silencio canonico.
          });

          return { id: input.id, status: 'recusada', desbloqueadoAte: null };
        }

        // decisao === 'aprovada'.
        const comentarioTrim =
          input.comentarioAprovacao === undefined
            ? null
            : assertJustificationLength(
                input.comentarioAprovacao,
                // Comentario e opcional 0-500 (§13.5); `min=-1` desabilita
                // o piso. As mensagens de min sao inalcancaveis mas fornecidas
                // por completude tipada — comentario 0 chars vai como string
                // vazia, que o zod ja aceitou.
                MSG_JUSTIFICATIVA_MIN,
                MSG_JUSTIFICATIVA_MAX,
                -1,
              );

        const expiraEm = new Date(nowValue.getTime() + 24 * 60 * 60 * 1000);

        // Transacao atomica canonica de aprovacao (§13.5) — 6 passos.
        await ctx.db.transaction(async (tx) => {
          // Sub-passo 1: bloqueio otimista da solicitacao.
          const locked = await tx
            .select({
              status: cycleUnlockRequests.status,
              companyId: cycleUnlockRequests.companyId,
              mes: cycleUnlockRequests.mes,
              aba: cycleUnlockRequests.aba,
              liderId: cycleUnlockRequests.liderId,
              liderTipo: cycleUnlockRequests.liderTipo,
              justificativa: cycleUnlockRequests.justificativa,
            })
            .from(cycleUnlockRequests)
            .where(eq(cycleUnlockRequests.id, input.id))
            .for('update')
            .limit(1);
          const currentReq = locked[0];
          assertDecidable(currentReq);
          // (currentReq ja narrowed como definido pelo assertDecidable).
          const row = currentReq;

          // Sub-passo 2: bloqueio otimista do status do mes.
          const closureLocked = await tx
            .select({ status: monthlyClosureStatus.status })
            .from(monthlyClosureStatus)
            .where(
              and(
                eq(monthlyClosureStatus.companyId, row.companyId),
                eq(monthlyClosureStatus.mes, row.mes),
              ),
            )
            .for('update')
            .limit(1);
          const closure = closureLocked[0];
          if (closure?.status === 'desbloqueado') {
            throw new TRPCError({
              code: 'CONFLICT',
              message: MSG_DECIDE_MES_JA_DESBLOQUEADO,
            });
          }

          // Sub-passo 3: UPDATE em cycleUnlockRequests.
          await tx
            .update(cycleUnlockRequests)
            .set({
              status: 'aprovada',
              decididoPor: superAdminId,
              decididoEm: nowValue,
              comentarioAprovacao: comentarioTrim,
              updatedAt: nowValue,
            })
            .where(eq(cycleUnlockRequests.id, input.id));

          // Sub-passo 4: INSERT em monthlyUnlockLog. `justificativa` e
          // copiada literalmente (§13.5) — nao referenciada por FK.
          // `houveAlteracao=false` inicial (motor DOC 06 §13.7 atualiza).
          await tx.insert(monthlyUnlockLog).values({
            companyId: row.companyId,
            mes: row.mes,
            aba: row.aba,
            liderId: row.liderId,
            liderTipo: row.liderTipo,
            desbloqueadoPor: superAdminId,
            justificativa: row.justificativa,
            desbloqueadoEm: nowValue,
            expiraEm,
            unlockRequestId: input.id,
            houveAlteracao: false,
            createdAt: nowValue,
          });

          // Sub-passo 5: UPDATE em monthlyClosureStatus.
          await tx
            .update(monthlyClosureStatus)
            .set({
              status: 'desbloqueado',
              dataFechamento: null,
              updatedAt: nowValue,
            })
            .where(
              and(
                eq(monthlyClosureStatus.companyId, row.companyId),
                eq(monthlyClosureStatus.mes, row.mes),
              ),
            );

          // Sub-passo 6: COMMIT (implicito — return da callback).
        });

        // Gatilho canonico pos-COMMIT (§13.5).
        void evaluateAdminAlerts('desbloqueio_aprovado', input.id).catch(() => {
          // Silencio canonico.
        });

        return { id: input.id, status: 'aprovada', desbloqueadoAte: expiraEm };
      }),
  });
}

// ============================================================
// Helpers privados
// ============================================================

/**
 * Resolve `solicitanteTipo` e `solicitanteId` canonicos (DOC 06 §13.2) a
 * partir do `ctx.user`. Super Admin cria em nome de terceiro — usamos
 * `employee`/`0` como sentinel canonico documentado (o motor de alertas
 * pos-B6 identificara o Super Admin por outro caminho, tipicamente
 * `decididoPor` na tela de decisao). Em producao Bruno usa a superficie
 * `/super-admin/desbloqueios` que passa por `decide`, nao por `create` —
 * este ramo existe para preservar totalidade tipada.
 */
function resolveSolicitante(user: AuthenticatedUserView): {
  tipo: 'employee' | 'clevel';
  id: number;
} {
  if (user.role === 'super_admin') {
    return { tipo: 'employee', id: 0 };
  }
  if (user.role === 'clevel') {
    return { tipo: 'clevel', id: user.userId };
  }
  return { tipo: 'employee', id: user.userId };
}

/**
 * Predicado S049 canonico. Retorna `true` se o `user` pode cancelar a
 * solicitacao carregada em `row`. Regras canonicas (aprovadas em RV-08):
 *   - Super Admin — sempre.
 *   - RH ou RH-Lider da mesma empresa — sempre (canonico DOC 03 §4.3).
 *   - Solicitante — o mesmo `solicitanteTipo` + `solicitanteId` do row.
 */
function canCancel(
  user: AuthenticatedUserView,
  row: {
    companyId: number;
    solicitanteTipo: 'employee' | 'clevel';
    solicitanteId: number;
  },
): boolean {
  if (user.role === 'super_admin') {
    return true;
  }
  if ((user.role === 'rh' || user.role === 'rh_lider') && user.companyId === row.companyId) {
    return true;
  }
  const userTipo: 'employee' | 'clevel' = user.role === 'clevel' ? 'clevel' : 'employee';
  return row.solicitanteTipo === userTipo && row.solicitanteId === user.userId;
}

/**
 * Guard canonico de decidibilidade dentro da transacao atomica (§13.5 e
 * §13.6 sub-passo 1). Recebe o resultado do `SELECT ... FOR UPDATE`;
 * lanca `CONFLICT` com mensagem canonica literal por status. Nao-solicitacao
 * (linha ausente) → `NOT_FOUND` — canonicamente o link vem da tela de
 * Bruno que ja lista solicitacoes; mas o guard defensivo cobre o caso.
 */
function assertDecidable<T extends { status: 'pendente' | 'aprovada' | 'recusada' | 'cancelada' }>(
  row: T | undefined,
): asserts row is T {
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: MSG_SOLICITACAO_NAO_ENCONTRADA });
  }
  if (row.status === 'aprovada' || row.status === 'recusada') {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_DECIDE_JA_DECIDIDA });
  }
  if (row.status === 'cancelada') {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_DECIDE_JA_CANCELADA });
  }
  // row.status === 'pendente' — segue.
}
