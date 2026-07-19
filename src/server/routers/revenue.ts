// ROIP APP 9BOX — sub-router `revenue` (ME-044).
//
// Superficie tRPC de escrita e leitura canonica do faturamento mensal
// da empresa (DOC 03 §5.10, §5.12). Cobre 3 procs canonicas:
//
//   - `revenue.saveFaturamento` — Bruno OU Responsavel financeiro da
//     empresa. UPSERT (`.insert().onDuplicateKeyUpdate({set})`) na
//     linha canonica `companyMonthlyData(companyId, mes)`. Normaliza
//     `faturamentoBruto` para string decimal(15,2). Pre-condicao:
//     `monthlyClosureStatus.status !== 'fechado'` (aceita `aberto`,
//     `desbloqueado` E linha ausente).
//   - `revenue.getFaturamento` — Bruno OU perfil administrativo da
//     mesma empresa. Leitura pura do par (companyId, mes).
//   - `revenue.getCardResumoPendente` — Bruno OU Responsavel financeiro.
//     Retorna a lista dos ultimos 12 meses cronologicos (relativos ao
//     `now` injetavel) que ainda nao tem `faturamentoBruto` gravado, para
//     o card canonico de resumo do §5.12.
//
// Convencoes canonicas herdadas:
//   - `roleProcedure(['super_admin','rh','rh_lider','clevel','lider'])`
//     para saveFaturamento e getCardResumoPendente: o guard fino
//     Responsavel financeiro (SELECT `isResponsavelFinanceiro`) vive no
//     handler (§5.6 canonico — o RF pode ser employee OU cLevel).
//   - `roleProcedure(['super_admin','rh','rh_lider','clevel','lider'])`
//     em `getFaturamento`: leitura por qualquer perfil administrativo
//     da mesma empresa. Guard cross-company canonico.
//   - Todas as procs Bruno atravessa (`super_admin` na lista + guard
//     empresa que pula super_admin).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). UPSERT canonico
//     `.insert(...).onDuplicateKeyUpdate({set: {...}})`.
//   - `now` injetavel (padrao S049/S100) para testes deterministicos
//     de janela de 12 meses.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/revenue-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, eq, gte } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companyMonthlyData,
  companies,
  employees,
  monthlyClosureStatus,
} from '../../db/schema';

import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas (§5.10 / §5.12)
// ============================================================

/**
 * §5.12 — janela canonica de 12 meses passados (incluindo o mes atual)
 * do card de resumo pendente. Ajustavel por MEs futuras via DI se a
 * norma canonica evoluir.
 */
export const RESUMO_PENDENTE_JANELA_MESES = 12 as const;

/** §5.10 — piso de decimal(15,2) canonico do schema. */
export const FATURAMENTO_MAX_PRECISION = 15 as const;

/** §5.10 — escala canonica do schema (decimal(15,2)). */
export const FATURAMENTO_SCALE = 2 as const;

// ============================================================
// Mensagens canonicas literais (testadas verbatim)
// ============================================================

/** §2.4 — guard cruzado companyId. */
export const MSG_COMPANY_MISMATCH_REV = 'Empresa nao pertence ao seu escopo.' as const;

/** §5.10 — empresa alvo nao encontrada. */
export const MSG_COMPANY_NAO_ENCONTRADA_REV = 'Empresa nao encontrada.' as const;

/** §5.10 — mes fechado e nao pode receber faturamento sem desbloqueio. */
export const MSG_MES_FECHADO_REV =
  'Mes fechado. Solicite desbloqueio antes de gravar faturamento.' as const;

/** §5.6 — perfil sem RF tentando gravar faturamento. */
export const MSG_SAVE_FATURAMENTO_NAO_RF =
  'Apenas o Responsavel financeiro pode gravar o faturamento mensal.' as const;

/** §5.10 — faturamento invalido (nao numerico ou <= 0). */
export const MSG_FATURAMENTO_INVALIDO =
  'Faturamento invalido; informe um valor numerico maior que zero.' as const;

/** §5.10 — mes fora do formato canonico YYYY-MM. */
export const MSG_MES_FORMATO_INVALIDO = 'Mes deve estar no formato YYYY-MM.' as const;

// ============================================================
// Zod schemas de entrada
// ============================================================

const mesSchemaRev = z.string().regex(/^\d{4}-\d{2}$/, { message: MSG_MES_FORMATO_INVALIDO });

const faturamentoSchema = z.union([
  z.number(),
  z.string().refine((v) => v.trim().length > 0 && !Number.isNaN(Number(v)), {
    message: 'faturamentoBruto invalido.',
  }),
]);

export const SAVE_FATURAMENTO_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  mes: mesSchemaRev,
  faturamentoBruto: faturamentoSchema,
});

export const GET_FATURAMENTO_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  mes: mesSchemaRev,
});

export const GET_CARD_RESUMO_PENDENTE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
});

// ============================================================
// Contratos publicos exportados (RV-13 — testados)
// ============================================================

/** Retorno canonico do `saveFaturamento`. `created=true` quando UPSERT
 *  inseriu nova linha; `false` quando atualizou. */
export interface SaveFaturamentoResult {
  companyId: number;
  mes: string;
  faturamentoBruto: string;
  created: boolean;
}

/** Retorno canonico do `getFaturamento`. */
export interface GetFaturamentoResult {
  companyId: number;
  mes: string;
  faturamentoBruto: string | null;
  linhaExiste: boolean;
}

/** Retorno canonico do `getCardResumoPendente` (§5.12). */
export interface GetCardResumoPendenteResult {
  companyId: number;
  mesesPendentes: string[];
  count: number;
}

// ============================================================
// DI (padrao S049/S100)
// ============================================================

export interface RevenueRouterDeps {
  now?: () => Date;
}

/** DI default. */
export const DEFAULT_REVENUE_ROUTER_DEPS: Required<RevenueRouterDeps> = {
  now: () => new Date(),
};

// ============================================================
// Helpers (RV-13)
// ============================================================

/** §2.4 guard cruzado companyId — super_admin atravessa. */
export function assertCompanyScopeRev(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_REV });
  }
}

/**
 * §5.10 — normaliza `faturamentoBruto` para string decimal(15,2)
 * canonica. Aceita number (positivo) e string (representando numero).
 * Rejeita <= 0 e nao numerico. Retorna string com 2 casas decimais
 * fixas (formato canonico esperado pelo schema Drizzle).
 */
export function normalizeFaturamentoBruto(raw: number | string): string {
  const asNumber = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_FATURAMENTO_INVALIDO });
  }
  return asNumber.toFixed(FATURAMENTO_SCALE);
}

/**
 * §5.10 — pre-condicao canonica. Aceita `status IN ('aberto',
 * 'desbloqueado')` E linha ausente (mes novo). Rejeita `status='fechado'`.
 */
export async function assertMesNaoFechado(
  db: RoipDatabase,
  companyId: number,
  mes: string,
): Promise<void> {
  const rows = await db
    .select({ status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)))
    .limit(1);
  const status = rows[0]?.status;
  if (status === 'fechado') {
    throw new TRPCError({ code: 'CONFLICT', message: MSG_MES_FECHADO_REV });
  }
}

/**
 * §5.6 — verifica se o caller autenticado nao-Bruno e o Responsavel
 * financeiro vigente da empresa. Bruno (super_admin) NAO passa por
 * aqui — quem chama ja o filtra. Retorna boolean; o handler converte
 * em FORBIDDEN quando false.
 *
 * Regra canonica: para `role='clevel'` consulta `cLevelMembers` cruzando
 * `id === userId + companyId === companyId + isResponsavelFinanceiro=true
 * + status='ativo'`. Para os demais perfis administrativos (`rh`,
 * `rh_lider`, `lider`) consulta `employees` com criterio analogo.
 */
export async function isCallerResponsavelFinanceiroRev(
  db: RoipDatabase,
  user: AuthenticatedUser,
  companyId: number,
): Promise<boolean> {
  if (user.role === 'super_admin') {
    // Bruno atravessa por definicao — este helper existe para nao-Bruno.
    return true;
  }
  if (user.companyId !== companyId) {
    return false;
  }
  if (user.role === 'clevel') {
    const rows = await db
      .select({ id: cLevelMembers.id })
      .from(cLevelMembers)
      .where(
        and(
          eq(cLevelMembers.id, user.userId),
          eq(cLevelMembers.companyId, companyId),
          eq(cLevelMembers.isResponsavelFinanceiro, true),
          eq(cLevelMembers.status, 'ativo'),
        ),
      )
      .limit(1);
    return rows[0] !== undefined;
  }
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.id, user.userId),
        eq(employees.companyId, companyId),
        eq(employees.isResponsavelFinanceiro, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(1);
  return rows[0] !== undefined;
}

/**
 * §5.12 — enumera os ultimos N meses (padrao 12) contando de `now` para
 * tras, inclusivo. Retorna array em ordem cronologica CRESCENTE. Formato
 * `YYYY-MM`. Deterministico dado o `now` (importante para testes).
 */
export function enumerateJanelaMeses(now: Date, janela: number): string[] {
  const out: string[] = [];
  const anoBase = now.getUTCFullYear();
  const mesBase = now.getUTCMonth() + 1;
  for (let i = janela - 1; i >= 0; i -= 1) {
    const anoDelta = Math.floor((mesBase - 1 - i) / 12);
    const mesRaw = ((((mesBase - 1 - i) % 12) + 12) % 12) + 1;
    const ano = anoBase + anoDelta;
    const mesStr = String(mesRaw).padStart(2, '0');
    out.push(`${ano}-${mesStr}`);
  }
  return out;
}

/**
 * §5.10 — verifica existencia da empresa alvo. Consumido antes do UPSERT
 * para retornar NOT_FOUND semantico caso Bruno tente gravar em empresa
 * inexistente (o UPSERT em si dispararia FK error do mysql2).
 */
export async function assertCompanyExistsRev(db: RoipDatabase, companyId: number): Promise<void> {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (rows[0] === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: MSG_COMPANY_NAO_ENCONTRADA_REV });
  }
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica de `revenue` (S049/S100). Instanciada com
 * `DEFAULT_REVENUE_ROUTER_DEPS` no `appRouter`. Testes injetam `now` fixo
 * para exercitar a janela de 12 meses de forma deterministica.
 */
export function createRevenueRouter(deps: RevenueRouterDeps = {}) {
  const now = deps.now ?? (() => new Date());
  return router({
    // --------------------------------------------------------
    // revenue.saveFaturamento — Bruno OU RF da empresa
    // --------------------------------------------------------
    saveFaturamento: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(SAVE_FATURAMENTO_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<SaveFaturamentoResult> => {
        // (1) Guard cruzado empresa (salvaguarda; Bruno atravessa).
        assertCompanyScopeRev(ctx.user, input.companyId);

        // (2) Verifica existencia canonica da empresa.
        await assertCompanyExistsRev(ctx.db, input.companyId);

        // (3) Guard fino RF para nao-Bruno.
        if (ctx.user.role !== 'super_admin') {
          const isRF = await isCallerResponsavelFinanceiroRev(ctx.db, ctx.user, input.companyId);
          if (!isRF) {
            throw new TRPCError({ code: 'FORBIDDEN', message: MSG_SAVE_FATURAMENTO_NAO_RF });
          }
        }

        // (4) Pre-condicao canonica: mes nao pode estar `fechado`.
        await assertMesNaoFechado(ctx.db, input.companyId, input.mes);

        // (5) Normaliza valor canonico decimal(15,2).
        const faturamentoBruto = normalizeFaturamentoBruto(input.faturamentoBruto);

        // (6) Verifica se linha ja existe (para reportar `created`).
        const existing = await ctx.db
          .select({ id: companyMonthlyData.id })
          .from(companyMonthlyData)
          .where(
            and(
              eq(companyMonthlyData.companyId, input.companyId),
              eq(companyMonthlyData.mes, input.mes),
            ),
          )
          .limit(1);
        const created = existing[0] === undefined;

        // (7) UPSERT canonico (`.onDuplicateKeyUpdate({set})` — padrao
        //     estabelecido em roiCalculationEngine.ts / cycleScheduleEngine.ts).
        await ctx.db
          .insert(companyMonthlyData)
          .values({
            companyId: input.companyId,
            mes: input.mes,
            faturamentoBruto,
          })
          .onDuplicateKeyUpdate({
            set: {
              faturamentoBruto,
            },
          });

        // `now` reservado para simetria com outros routers (RV-13 consumo).
        void now;

        return {
          companyId: input.companyId,
          mes: input.mes,
          faturamentoBruto,
          created,
        };
      }),

    // --------------------------------------------------------
    // revenue.getFaturamento — leitura por perfil administrativo
    // --------------------------------------------------------
    getFaturamento: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_FATURAMENTO_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetFaturamentoResult> => {
        assertCompanyScopeRev(ctx.user, input.companyId);
        const rows = await ctx.db
          .select({
            faturamentoBruto: companyMonthlyData.faturamentoBruto,
          })
          .from(companyMonthlyData)
          .where(
            and(
              eq(companyMonthlyData.companyId, input.companyId),
              eq(companyMonthlyData.mes, input.mes),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) {
          return {
            companyId: input.companyId,
            mes: input.mes,
            faturamentoBruto: null,
            linhaExiste: false,
          };
        }
        return {
          companyId: input.companyId,
          mes: input.mes,
          faturamentoBruto: row.faturamentoBruto,
          linhaExiste: true,
        };
      }),

    // --------------------------------------------------------
    // revenue.getCardResumoPendente — §5.12 (Bruno OU RF)
    // --------------------------------------------------------
    getCardResumoPendente: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_CARD_RESUMO_PENDENTE_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetCardResumoPendenteResult> => {
        assertCompanyScopeRev(ctx.user, input.companyId);

        if (ctx.user.role !== 'super_admin') {
          const isRF = await isCallerResponsavelFinanceiroRev(ctx.db, ctx.user, input.companyId);
          if (!isRF) {
            throw new TRPCError({ code: 'FORBIDDEN', message: MSG_SAVE_FATURAMENTO_NAO_RF });
          }
        }

        // Janela cronologica de 12 meses a partir de `now`.
        const janela = enumerateJanelaMeses(now(), RESUMO_PENDENTE_JANELA_MESES);
        const mesMin = janela[0];
        if (mesMin === undefined) {
          return {
            companyId: input.companyId,
            mesesPendentes: [],
            count: 0,
          };
        }

        // SELECT tipado dos meses da janela com faturamentoBruto gravado
        // (nao nulo). Comparacao lexicografica em `mes` (YYYY-MM ordena
        // igual a cronologico). Filtro adicional aplicado no JS por
        // simplicidade — o volume de 12 linhas por empresa e trivial.
        const rows = await ctx.db
          .select({
            mes: companyMonthlyData.mes,
            faturamentoBruto: companyMonthlyData.faturamentoBruto,
          })
          .from(companyMonthlyData)
          .where(
            and(
              eq(companyMonthlyData.companyId, input.companyId),
              gte(companyMonthlyData.mes, mesMin),
            ),
          );
        const gravados = new Set<string>();
        for (const r of rows) {
          if (r.faturamentoBruto !== null) {
            gravados.add(r.mes);
          }
        }
        const mesesPendentes = janela.filter((m) => !gravados.has(m));
        return {
          companyId: input.companyId,
          mesesPendentes,
          count: mesesPendentes.length,
        };
      }),
  });
}

/** Tipo canonico do sub-router. */
export type RevenueRouter = ReturnType<typeof createRevenueRouter>;
