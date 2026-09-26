// ROIP APP 9BOX — sub-router `economicDiagnosis` (ME-035).
//
// Superficie publica canonica do sub-dominio `economicDiagnosis` (DOC 03
// §3.11 + §19.1). Leitura pura do diagnostico economico trimestral da
// empresa persistido em `companyEconomicDiagnosis` (§3.6). Nao ha motor
// injetado — todas as duas procs sao query pura sobre a tabela canonica.
//
// Procedures canonicas (DOC 03 §3.11):
//   - `economicDiagnosis.getCompanyDiagnosis` — registro da empresa para
//     o trimestre; NULL se ainda nao calculado. RH, RH-Lider, C-level (na
//     empresa) e Bruno.
//   - `economicDiagnosis.getDiagnosisHistory` — ultimos N trimestres.
//     Default N = 4. Cap canonico N = 20 (S068 — mesmo cap de
//     `quarterlyCalculation.getQuarterlyResults` para proteger payload).
//
// Convencoes canonicas herdadas de ME-034 (S049/S060):
//   - Factory sem argumentos (`createEconomicDiagnosisRouter()`). Sem DI
//     de motor porque estas procs sao leitura pura sobre a tabela — nao
//     dependem de `roiCalculationEngine`. A factory existe apenas para
//     manter simetria com os demais sub-routers e para permitir consumo
//     via `createCallerFactory` no teste sem depender do appRouter.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/economicDiagnosis-router.test.ts` + acoplamento
//     no `appRouter` em `routers/index.ts`.
//   - Autorizacao cruzada (perfil x companyId) resolvida no handler.
//     `roleProcedure` filtra por claim `role` do JWT; o handler garante
//     que o companyId do input coincide com o companyId do token para
//     perfis administrativos (super_admin atravessa — §2.4).
//
// Decisoes de autor RV-08 desta ME (economicDiagnosis):
//   - S068 — `getDiagnosisHistory.limit` opcional (default 4, cap 20). O
//     canonico define apenas "default N=4"; o cap e decisao de autor,
//     consistente com o cap de `getQuarterlyResults`.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/economicDiagnosis-router.test.ts`.

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { companyEconomicDiagnosis } from '../../db/schema';
import { assertAgregadoEmpresa } from '../services/cadeiaScopeGuard';
import { roleProcedure, router } from '../trpc';
import { assertUserCompanyScope } from '../../lib/scope/userCompanyScope';

// ============================================================
// Constantes e tipos publicos
// ============================================================

/**
 * Zod schema canonico do trimestre `YYYY-Q[1-4]`. Reutilizado do padrao
 * ME-034 (`quarterlyCalculation.TRIMESTRE_INPUT_SCHEMA`), reescrito
 * localmente para evitar acoplamento entre sub-routers (cada um dono do
 * proprio schema de input canonico — RV-13).
 */
export const TRIMESTRE_INPUT_SCHEMA_ECON = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canonico deve seguir o formato YYYY-QN (N in 1..4).',
});

/**
 * Cap canonico do parametro `limit` em `getDiagnosisHistory` (S068). Mesmo
 * valor de `quarterlyCalculation.getQuarterlyResults` para consistencia de
 * payload. Exportado como constante nomeada para permitir que o teste
 * asserte o cap sem replicar o literal.
 */
export const DIAGNOSIS_HISTORY_LIMIT_CAP = 20 as const;

/** Default canonico do parametro `limit` em `getDiagnosisHistory` (§3.11). */
export const DIAGNOSIS_HISTORY_LIMIT_DEFAULT = 4 as const;

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica do sub-router `economicDiagnosis`. Sem parametros — as
 * procs sao leitura pura sobre `companyEconomicDiagnosis`. A factory
 * existe para permitir consumo isolado no teste via `createCallerFactory`
 * (mesmo padrao S060 do ME-034, mas sem DI porque nao ha motor).
 */
export function createEconomicDiagnosisRouter() {
  return router({
    // ============================================================
    // Proc 1 — getCompanyDiagnosis (§3.11)
    // ============================================================
    getCompanyDiagnosis: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA_ECON,
        }),
      )
      .query(async ({ ctx, input }) => {
        // Guard canonico cruzado (§2.4 isolamento por empresa):
        // super_admin atravessa (nao tem `companyId` no ctx); demais
        // roles autenticadas cruzam contra o `companyId` do proprio JWT.
        assertUserCompanyScope(ctx.user, input.companyId);
        // Bateria de seguranca (Etapa 0, item 2) — S7: o diagnostico
        // economico e agregado da empresa (ROI, folha); C-level restrito
        // nao o alcanca (§3.3 mascara; aqui nega a linha integral).
        await assertAgregadoEmpresa(ctx.db, ctx.user);

        const rows = await ctx.db
          .select()
          .from(companyEconomicDiagnosis)
          .where(
            and(
              eq(companyEconomicDiagnosis.companyId, input.companyId),
              eq(companyEconomicDiagnosis.trimestre, input.trimestre),
            ),
          )
          .limit(1);

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          diagnosis: rows[0] ?? null,
        };
      }),

    // ============================================================
    // Proc 2 — getDiagnosisHistory (§3.11)
    // ============================================================
    getDiagnosisHistory: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          limit: z.number().int().positive().max(DIAGNOSIS_HISTORY_LIMIT_CAP).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        // Guard canonico cruzado (§2.4).
        assertUserCompanyScope(ctx.user, input.companyId);
        // Bateria de seguranca (Etapa 0, item 2) — S7: o diagnostico
        // economico e agregado da empresa (ROI, folha); C-level restrito
        // nao o alcanca (§3.3 mascara; aqui nega a linha integral).
        await assertAgregadoEmpresa(ctx.db, ctx.user);

        const limit = input.limit ?? DIAGNOSIS_HISTORY_LIMIT_DEFAULT;

        const rows = await ctx.db
          .select()
          .from(companyEconomicDiagnosis)
          .where(eq(companyEconomicDiagnosis.companyId, input.companyId))
          .orderBy(desc(companyEconomicDiagnosis.trimestre))
          .limit(limit);

        return {
          companyId: input.companyId,
          diagnosisHistory: rows,
        };
      }),
  });
}
