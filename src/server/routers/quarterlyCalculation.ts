// ROIP APP 9BOX — sub-router `quarterlyCalculation` (ME-034).
//
// Superficie publica canonica do sub-dominio `quarterlyCalculation` (DOC 03
// §19.1). Consome o motor `roiCalculationEngine.ts` (ME-033) via DI. Nao
// edita `monthlyClosureOrchestrator.ts` — o wiring real dos hooks internos
// (`triggerQuarterlyCalculation`, `recalculateAfterUnlock`) fica em ME
// futura de jobs cron (DOC 06 §15.1); aqui apenas as 3 procs publicas.
//
// Procedures canonicas (DOC 03 §3.11):
//   - `quarterlyCalculation.triggerRetroactiveRecalculation` — §3.9,
//     mutation, apenas super_admin (Bruno). Automatica quando `metaROI`
//     do cadastro da empresa muda (disparo pos-B5 via router de cadastro)
//     e manual em cenarios canonicos.
//   - `quarterlyCalculation.getQuarterlyResults` — §3.11, query, N ultimas
//     linhas do trimestre por colaborador (default N=4). Roles admin da
//     mesma empresa.
//   - `quarterlyCalculation.getCompanyQuarterlyStatus` — §3.11, query,
//     status do trimestre da empresa (meses fechados, colaboradores
//     calculados, diagnostico).
//
// Procedures marcadas "(interna)" no §19.1 NAO viram tRPC — sao hooks do
// motor consumidos por orchestrator/cron via DI. Precedente canonico
// ME-030 §19.13 (motor `cycleSchedule` — 4 procs internas nunca tRPC).
//
// Convencoes canonicas herdadas de S049 (ME-032):
//   - Motor `roiCalculationEngine` injetado via `deps.roiEngine` (S060,
//     estende S049). Default aponta para o motor real do ME-033. Teste
//     injeta mock quando conveniente.
//   - `now` derivado de `new Date()` no handler (nao ha proc interna com
//     relogio injetavel nesta ME; motor recebe `now` explicito).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Uso de `count()` da
//     drizzle-orm para contagem.
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/quarterlyCalculation-router.test.ts` + acoplamento
//     no `appRouter` em `routers/index.ts`.
//   - Autorizacao cruzada (perfil x companyId) resolvida no handler para
//     as procs `getQuarterlyResults` e `getCompanyQuarterlyStatus`.
//     `roleProcedure` so filtra por claim `role` do JWT.
//
// Decisoes de autor RV-08 desta ME:
//   - S059 — router publico com 3 procs (nao 5). As duas marcadas
//     "(interna)" no §19.1 nao viram tRPC.
//   - S060 — DI do motor como parametro da factory (padrao S049 estendido).
//   - S061 — `getQuarterlyResults` sem `lider`. Escopo de cadeia direta
//     e materia da ME de dashboards individuais (Bloco B5).
//   - S062 — `triggerRetroactiveRecalculation.nivelHierarquico` opcional;
//     omitido recalcula todos os trimestres da empresa.
//   - S063 — retorno consolidado `TriggerRetroactiveResult` com
//     `perTrimestre` auditavel.
//   - S064 — ME-034 unica (3 procs + wiring appRouter).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/quarterlyCalculation-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  companies,
  companyEconomicDiagnosis,
  employees,
  monthlyClosureStatus,
  performanceQuarterlyData,
} from '../../db/schema';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';
import { recalculateQuarter, type RoiCalculationResult } from '../services/roiCalculationEngine';
import { roleProcedure, router } from '../trpc';

// ============================================================
// Dependency injection — motor `roiCalculationEngine` (S060)
// ============================================================

/**
 * Fachada canonica do motor de ROI. Contrato minimo que este router
 * consome. Producao aponta para `roiCalculationEngine.recalculateQuarter`
 * do ME-033. Teste injeta mock que apenas conta chamadas / valida input.
 */
export interface RoiEngineFacade {
  recalculateQuarter: (
    db: RoipDatabase,
    companyId: number,
    trimestre: string,
    now: Date,
  ) => Promise<RoiCalculationResult>;
}

/**
 * DI default canonica: aponta para o motor real do ME-033. O appRouter
 * usa este default; testes que injetam mock passam `roiEngine` explicito.
 */
export const DEFAULT_ROI_ENGINE: RoiEngineFacade = {
  recalculateQuarter,
};

// ============================================================
// Constantes e tipos publicos
// ============================================================

/**
 * Valores canonicos de `nivelHierarquico` (schema
 * `companies.metaROI{Operacional,Tatico,Estrategico}` + `employees.nivelHierarquico`).
 * Reexportado aqui para tipar o input do Zod sem depender do enum do
 * schema (evita import cruzado desnecessario no bloco `.input(...)`).
 */
export const NIVEL_HIERARQUICO_VALUES = ['operacional', 'tatico', 'estrategico'] as const;
export type NivelHierarquicoInput = (typeof NIVEL_HIERARQUICO_VALUES)[number];

/**
 * Valores canonicos de `statusDiagnostico` (schema
 * `companyEconomicDiagnosis.statusDiagnostico`). Reexportado como literal
 * union para tipagem do retorno de `getCompanyQuarterlyStatus`.
 */
export type StatusDiagnosticoOutput =
  'excelente' | 'muito_bom' | 'aceitavel' | 'critico' | 'sem_referencia';

/**
 * Resultado canonico de `triggerRetroactiveRecalculation` (S063).
 *
 * `nivelHierarquico`:
 *   - Preenchido quando o input filtrou por nivel (disparo automatico
 *     canonico do §3.9 quando `metaROI` do nivel muda).
 *   - `null` quando o input veio sem filtro (manual Bruno, S062).
 *
 * `perTrimestre` traz o inventario canonico por trimestre para auditoria
 * (quantos colaboradores calcularam / quantos erros isolados) — consumido
 * pelo UI do Bloco B5.
 */
export interface TriggerRetroactiveResult {
  companyId: number;
  nivelHierarquico: NivelHierarquicoInput | null;
  trimestresProcessados: string[];
  employeesCalculatedTotal: number;
  errorsTotal: number;
  perTrimestre: Array<{
    trimestre: string;
    employeesCalculated: number;
    errors: number;
  }>;
}

/**
 * Resultado canonico de `getCompanyQuarterlyStatus`. Inventario do
 * trimestre da empresa — meses fechados/abertos, contagem de colaboradores
 * ja calculados, presenca do diagnostico economico e status atual.
 *
 * `statusDiagnostico = null` quando o diagnostico ainda nao foi persistido
 * (trimestre incompleto, faturamento nao lancado, etc — motor propaga
 * `RoiSkipLog` no proprio calculo; aqui reportamos apenas a ausencia).
 */
export interface CompanyQuarterlyStatus {
  companyId: number;
  trimestre: string;
  mesesFechados: string[];
  mesesAbertos: string[];
  employeesCalculated: number;
  diagnosisPersisted: boolean;
  statusDiagnostico: StatusDiagnosticoOutput | null;
}

/**
 * Zod schema canonico do trimestre `YYYY-Q[1-4]`. Reusado pelos handlers
 * que aceitam trimestre como input. Exportado para permitir que testes
 * assertem contra o mesmo schema (nao para consumir em outra ME —
 * reencapsulamento aqui protege a semantica canonica).
 */
export const TRIMESTRE_INPUT_SCHEMA = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canonico deve seguir o formato YYYY-QN (N in 1..4).',
});

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica do sub-router `quarterlyCalculation`. Recebe o motor
 * de ROI via DI (S060). Producao instancia sem args (default = motor real);
 * testes injetam mock para isolar acoplamento com o motor.
 */
export function createQuarterlyCalculationRouter(deps: { roiEngine?: RoiEngineFacade } = {}) {
  const roiEngine = deps.roiEngine ?? DEFAULT_ROI_ENGINE;

  return router({
    // ============================================================
    // Proc 1 — triggerRetroactiveRecalculation (§3.9)
    // ============================================================
    triggerRetroactiveRecalculation: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          nivelHierarquico: z.enum(NIVEL_HIERARQUICO_VALUES).optional(),
        }),
      )
      .mutation(async ({ ctx, input }): Promise<TriggerRetroactiveResult> => {
        const now = new Date();

        // Precondicao canonica: empresa existe. Sem RV-01 aqui — o
        // super_admin pode operar globalmente, mas passar companyId
        // invalido e defeito de UI/script; devolver NOT_FOUND canonico.
        const companyRows = await ctx.db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (companyRows.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Empresa nao encontrada.',
          });
        }

        // Trimestres canonicos a recalcular. Query base tipada Drizzle
        // com JOIN condicional pelo filtro de nivel (S062). Sem SQL cru.
        const trimestreRows = input.nivelHierarquico
          ? await ctx.db
              .selectDistinct({ trimestre: performanceQuarterlyData.trimestre })
              .from(performanceQuarterlyData)
              .innerJoin(employees, eq(performanceQuarterlyData.employeeId, employees.id))
              .where(
                and(
                  eq(performanceQuarterlyData.companyId, input.companyId),
                  eq(employees.nivelHierarquico, input.nivelHierarquico),
                ),
              )
              .orderBy(asc(performanceQuarterlyData.trimestre))
          : await ctx.db
              .selectDistinct({ trimestre: performanceQuarterlyData.trimestre })
              .from(performanceQuarterlyData)
              .where(eq(performanceQuarterlyData.companyId, input.companyId))
              .orderBy(asc(performanceQuarterlyData.trimestre));

        const trimestres = trimestreRows.map((r) => r.trimestre);

        // Loop canonico: cada trimestre chama o motor via DI. Erros
        // isolados NAO abortam o batch — a tolerancia canonica a falha
        // parcial (§18.2, S055) e responsabilidade do proprio motor;
        // aqui apenas somamos os agregados canonicos.
        const perTrimestre: TriggerRetroactiveResult['perTrimestre'] = [];
        let employeesCalculatedTotal = 0;
        let errorsTotal = 0;

        for (const trimestre of trimestres) {
          const result = await roiEngine.recalculateQuarter(
            ctx.db,
            input.companyId,
            trimestre,
            now,
          );
          const employeesCalculated = result.employeesCalculated.length;
          const errors = result.errors.length;
          perTrimestre.push({ trimestre, employeesCalculated, errors });
          employeesCalculatedTotal += employeesCalculated;
          errorsTotal += errors;
        }

        return {
          companyId: input.companyId,
          nivelHierarquico: input.nivelHierarquico ?? null,
          trimestresProcessados: trimestres,
          employeesCalculatedTotal,
          errorsTotal,
          perTrimestre,
        };
      }),

    // ============================================================
    // Proc 2 — getQuarterlyResults (§3.11)
    // ============================================================
    getQuarterlyResults: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(
        z.object({
          employeeId: z.number().int().positive(),
          limit: z.number().int().positive().max(20).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 4;

        // Precondicao canonica: colaborador existe. Sem esta verificacao
        // o guard cruzado abaixo nao teria como comparar `companyId`.
        const empRows = await ctx.db
          .select({ id: employees.id, companyId: employees.companyId })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const emp = empRows[0];
        if (!emp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Colaborador nao encontrado.',
          });
        }

        // Guard canonico cruzado (§2.4 isolamento por empresa):
        // super_admin atravessa (nao tem `companyId` no ctx); demais
        // roles autenticadas cruzam contra o `companyId` do proprio JWT.
        if (ctx.user.role !== 'super_admin') {
          if (ctx.user.companyId !== emp.companyId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Colaborador fora do escopo da empresa.',
            });
          }
        }

        const rows = await ctx.db
          .select()
          .from(performanceQuarterlyData)
          .where(eq(performanceQuarterlyData.employeeId, input.employeeId))
          .orderBy(desc(performanceQuarterlyData.trimestre))
          .limit(limit);

        return {
          employeeId: input.employeeId,
          quarterlyResults: rows,
        };
      }),

    // ============================================================
    // Proc 3 — getCompanyQuarterlyStatus (§3.11)
    // ============================================================
    getCompanyQuarterlyStatus: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA,
        }),
      )
      .query(async ({ ctx, input }): Promise<CompanyQuarterlyStatus> => {
        // Guard canonico cruzado (§2.4 isolamento por empresa).
        if (ctx.user.role !== 'super_admin') {
          if (ctx.user.companyId !== input.companyId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Empresa fora do escopo.',
            });
          }
        }

        // Precondicao canonica: trimestre valido. O regex do
        // `TRIMESTRE_INPUT_SCHEMA` ja restringe formato, mas a semantica
        // canonica (Q1..Q4) e resolvida por `getQuarterMonths` (ME-031).
        const meses = getQuarterMonths(input.trimestre);
        if (!meses) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Trimestre canonico invalido.',
          });
        }

        // Status dos 3 meses do trimestre.
        const closureRows = await ctx.db
          .select({
            mes: monthlyClosureStatus.mes,
            status: monthlyClosureStatus.status,
          })
          .from(monthlyClosureStatus)
          .where(
            and(
              eq(monthlyClosureStatus.companyId, input.companyId),
              inArray(monthlyClosureStatus.mes, meses),
            ),
          );
        const closureByMes = new Map<string, string>();
        for (const c of closureRows) {
          closureByMes.set(c.mes, c.status);
        }
        const mesesFechados: string[] = [];
        const mesesAbertos: string[] = [];
        for (const mes of meses) {
          if (closureByMes.get(mes) === 'fechado') {
            mesesFechados.push(mes);
          } else {
            mesesAbertos.push(mes);
          }
        }

        // Contagem de colaboradores calculados neste trimestre.
        const countRows = await ctx.db
          .select({ n: count() })
          .from(performanceQuarterlyData)
          .where(
            and(
              eq(performanceQuarterlyData.companyId, input.companyId),
              eq(performanceQuarterlyData.trimestre, input.trimestre),
            ),
          );
        const employeesCalculated = Number(countRows[0]?.n ?? 0);

        // Diagnostico economico (LEFT JOIN semantico — retorna vazio
        // quando ainda nao ha diagnostico persistido).
        const diagRows = await ctx.db
          .select({
            statusDiagnostico: companyEconomicDiagnosis.statusDiagnostico,
          })
          .from(companyEconomicDiagnosis)
          .where(
            and(
              eq(companyEconomicDiagnosis.companyId, input.companyId),
              eq(companyEconomicDiagnosis.trimestre, input.trimestre),
            ),
          )
          .limit(1);
        const diag = diagRows[0];

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          mesesFechados,
          mesesAbertos,
          employeesCalculated,
          diagnosisPersisted: !!diag,
          statusDiagnostico: (diag?.statusDiagnostico as StatusDiagnosticoOutput) ?? null,
        };
      }),
  });
}
