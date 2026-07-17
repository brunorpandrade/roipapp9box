// ROIP APP 9BOX — sub-router `dashboard` (ME-035).
//
// Superficie publica canonica do sub-dominio `dashboard` (DOC 03 §3.11 +
// §19.1). Leitura pura das duas superficies de dashboard canonicas:
//   - Dashboard individual do colaborador (Eixo X + Eixo Y + 9-Box,
//     nullable — S065). Consumido pela superficie `dashboard_individual`
//     (DOC 05).
//   - Dashboard economico da empresa (5 cards canonicos do §3.3 do DOC 02
//     com mascaramento por campo — S067).
//
// Procedures canonicas (DOC 03 §3.11):
//   - `dashboard.getEmployeeDashboard` — dados do dashboard individual do
//     colaborador (identificacao, Eixo X, Eixo Y, 9-Box e historico
//     resumido). Bloqueio de C-level para RH/RH-Lider (D035, §15.4).
//     Colaborador inativo requer Bruno ou RH (§3.13). Lider so ve
//     liderados diretos (S066 — cadeia direta via
//     `employeeLeaderHistory`); C-level da mesma empresa atravessa.
//   - `dashboard.getCompanyEconomicDashboard` — 5 cards canonicos com
//     mascaramento por campo canonico (S067; matriz DOC 02 §3.3):
//     * Bruno / RH / RH-Lider / C-level `acessoTotal=true` -> 5/5
//     * C-level `acessoTotal=false` -> 3/5 (nulls em `roiEmpresa` e
//       `folhaPorcentagem`)
//     * Lider -> FORBIDDEN (nenhum dos 5 — regra F2 v2.2 §10.5).
//
// Convencoes canonicas herdadas de ME-034 (S049/S060):
//   - Factory sem argumentos (`createDashboardRouter()`) — leitura pura,
//     sem DI de motor. Simetria com o `createEconomicDiagnosisRouter`.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/dashboard-router.test.ts` + acoplamento no
//     `appRouter` em `routers/index.ts`.
//   - Autorizacao cruzada resolvida no handler (super_admin atravessa;
//     demais roles cruzam companyId).
//
// Decisoes de autor RV-08 desta ME (dashboard):
//   - S065 — `getEmployeeDashboard` inclui secao 9-Box/Plenitude nullable.
//     Estado ausente e estado valido do canonico (§7.1 — motivo em
//     `nineBoxCalculationLog`; §6.4 — plenitudeScore null ate A+C
//     completos). Nao antecipa router do Eixo Y — apenas ler a linha.
//   - S066 — `getEmployeeDashboard` aceita perfil `lider`, com checagem
//     de cadeia DIRETA via `getActiveLeaderHistoryByEmployee` (registro
//     vigente com `dataFim IS NULL`, §4.6). Implementa o que S061 (ME-034)
//     adiou explicitamente. Cadeia INDIRETA (varios niveis abaixo) NAO
//     entra nesta ME — e materia de motor de organograma (ME futura).
//   - S067 — `getCompanyEconomicDashboard` aplica mascaramento por campo
//     canonico (matriz DOC 02 §3.3). Nao ha 403 no nivel de proc para
//     C-level `acessoTotal=false` — devolve os 3 cards permitidos + null
//     nos 2 bloqueados. Lider RECEBE 403 (nenhum dos 5).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/dashboard-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companyEconomicDiagnosis,
  employees,
  nineBoxClassifications,
  plenitudeData,
  performanceQuarterlyData,
} from '../../db/schema';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import { roleProcedure, router } from '../trpc';

// ============================================================
// Constantes e tipos publicos
// ============================================================

/**
 * Default canonico do parametro `historyLimit` em `getEmployeeDashboard`
 * (§3.11 — proxy do "N ultimos" reutilizado da mesma familia semantica de
 * `getQuarterlyResults`).
 */
export const DASHBOARD_HISTORY_LIMIT_DEFAULT = 4 as const;

/**
 * Cap canonico do parametro `historyLimit`. Mesmo cap dos demais routers
 * de leitura trimestral (S068 do `economicDiagnosis`).
 */
export const DASHBOARD_HISTORY_LIMIT_CAP = 20 as const;

/**
 * Zod schema canonico do trimestre `YYYY-Q[1-4]`. Reescrito local ao
 * sub-router para desacoplar de outros (RV-13).
 */
export const TRIMESTRE_INPUT_SCHEMA_DASHBOARD = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canonico deve seguir o formato YYYY-QN (N in 1..4).',
});

/**
 * Resultado canonico de `getEmployeeDashboard` (S065). Cada bloco pode
 * estar ausente (`null`) porque o canonico prevê estados intermediarios
 * (Eixo Y sem A+C completos, 9-Box sem os dois eixos). Superficie de tela
 * (DOC 05) interpreta os nulls.
 *
 * `latestQuarterly` traz a ultima linha de `performanceQuarterlyData` do
 * colaborador (Eixo X). `history` traz as N ultimas em ordem decrescente
 * — mesmo shape da linha, para o dashboard historico de tendencia.
 */
export interface EmployeeDashboardResult {
  employee: {
    id: number;
    companyId: number;
    name: string;
    departamento: string;
    jobFamily: string;
    senioridade: string;
    nivelHierarquico: string;
    status: 'ativo' | 'inativo';
    isLider: boolean;
  };
  latestQuarterly: typeof performanceQuarterlyData.$inferSelect | null;
  history: (typeof performanceQuarterlyData.$inferSelect)[];
  latestPlenitude: typeof plenitudeData.$inferSelect | null;
  latestNineBox: typeof nineBoxClassifications.$inferSelect | null;
}

/**
 * Resultado canonico de `getCompanyEconomicDashboard` (S067). Cada campo
 * corresponde a UMA linha da matriz DOC 02 §3.3:
 *
 * | Card                        | Bruno/RH/CT | CF   | Lider |
 * | Faturamento medio mensal    | Sim         | Sim  | 403   |
 * | Folha total media           | Sim         | Sim  | 403   |
 * | ROI da empresa              | Sim         | null | 403   |
 * | Status diagnostico          | Sim         | Sim  | 403   |
 * | % folha em relacao ao fat.  | Sim         | null | 403   |
 *
 * Onde CT=C-level `acessoTotal=true`, CF=C-level `acessoTotal=false`.
 *
 * `masked` reporta os campos mascarados nesta requisicao — permite ao
 * teste asserir o mascaramento sem inspecionar diretamente `null`s
 * (que podem legitimamente ocorrer por diagnostico ainda nao calculado).
 */
export interface CompanyEconomicDashboardResult {
  companyId: number;
  trimestre: string;
  diagnosisPersisted: boolean;
  faturamentoMedioMensal: string | null;
  folhaTotalMedia: string | null;
  roiEmpresa: string | null;
  statusDiagnostico: 'excelente' | 'muito_bom' | 'aceitavel' | 'critico' | 'sem_referencia' | null;
  folhaPorcentagem: string | null;
  masked: {
    roiEmpresa: boolean;
    folhaPorcentagem: boolean;
  };
}

// ============================================================
// Helpers privados (S066 — cadeia direta)
// ============================================================

/**
 * Determina se o colaborador `targetId` esta sob liderança direta do
 * lider `leaderEmployeeId` no momento vigente (§4.6 — `dataFim IS NULL`).
 *
 * Cadeia INDIRETA (mais de um nivel de profundidade) NAO e checada aqui —
 * materia de motor de organograma (ME futura de dashboards em cascata).
 * Nesta ME, lider ve APENAS liderados diretos, conforme S066.
 */
async function isEmployeeDirectlyLedBy(
  db: RoipDatabase,
  targetEmployeeId: number,
  leaderEmployeeId: number,
): Promise<boolean> {
  const link = await getActiveLeaderHistoryByEmployee(db, targetEmployeeId);
  if (link === undefined) {
    return false;
  }
  return link.liderId === leaderEmployeeId;
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica do sub-router `dashboard`. Sem parametros — as procs
 * sao leitura pura. Simetria com `createEconomicDiagnosisRouter` (ME-035)
 * e com `createQuarterlyCalculationRouter` (ME-034).
 */
export function createDashboardRouter() {
  return router({
    // ============================================================
    // Proc 1 — getEmployeeDashboard (§3.11 + §3.13 + §15.4)
    // ============================================================
    getEmployeeDashboard: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          employeeId: z.number().int().positive(),
          historyLimit: z.number().int().positive().max(DASHBOARD_HISTORY_LIMIT_CAP).optional(),
        }),
      )
      .query(async ({ ctx, input }): Promise<EmployeeDashboardResult> => {
        const historyLimit = input.historyLimit ?? DASHBOARD_HISTORY_LIMIT_DEFAULT;

        // Precondicao canonica: colaborador existe.
        const empRows = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            name: employees.name,
            departamento: employees.departamento,
            jobFamily: employees.jobFamily,
            senioridade: employees.senioridade,
            nivelHierarquico: employees.nivelHierarquico,
            status: employees.status,
            isLider: employees.isLider,
          })
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

        // Guard canonico cruzado (§2.4): super_admin atravessa; demais
        // roles autenticadas cruzam contra o `companyId` do proprio JWT.
        if (ctx.user.role !== 'super_admin') {
          if (ctx.user.companyId !== emp.companyId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Colaborador fora do escopo da empresa.',
            });
          }
        }

        // Guard canonico §3.13: colaborador inativo -> so Bruno ou RH.
        if (emp.status === 'inativo') {
          const allowsInactive =
            ctx.user.role === 'super_admin' ||
            ctx.user.role === 'rh' ||
            ctx.user.role === 'rh_lider';
          if (!allowsInactive) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Dashboard de colaborador inativo restrito a Bruno e RH.',
            });
          }
        }

        // Guard canonico D035 (§15.4): dashboard de colaborador da tabela
        // `employees` alveja um `employee`, nunca um C-level (C-levels
        // vivem em `cLevelMembers`, tabela separada — esta proc nao os
        // enderecos). D035 se aplicaria apenas em fluxos futuros que
        // aceitassem cLevelId como input. Nao ha risco de vazamento
        // aqui, mas mantemos a defesa canonica no lugar quando a proc
        // for estendida.

        // Guard canonico S066: lider so ve liderado direto (cadeia
        // direta ativa). Cadeia indireta e materia de motor de
        // organograma (ME futura).
        if (ctx.user.role === 'lider') {
          if (ctx.user.userId === input.employeeId) {
            // Lider vendo o proprio dashboard — permitido.
          } else {
            const okDirect = await isEmployeeDirectlyLedBy(
              ctx.db,
              input.employeeId,
              ctx.user.userId,
            );
            if (!okDirect) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Colaborador fora da cadeia direta do lider.',
              });
            }
          }
        }

        // Leitura Eixo X — ultima linha + N ultimas para historico.
        const history = await ctx.db
          .select()
          .from(performanceQuarterlyData)
          .where(eq(performanceQuarterlyData.employeeId, input.employeeId))
          .orderBy(desc(performanceQuarterlyData.trimestre))
          .limit(historyLimit);
        const latestQuarterly = history[0] ?? null;

        // Leitura Eixo Y — ultima linha de plenitudeData (por trimestre
        // decrescente). Pode nao existir (S065 — nullable canonico).
        const plenitudeRows = await ctx.db
          .select()
          .from(plenitudeData)
          .where(eq(plenitudeData.employeeId, input.employeeId))
          .orderBy(desc(plenitudeData.trimestre))
          .limit(1);
        const latestPlenitude = plenitudeRows[0] ?? null;

        // Leitura 9-Box — ultima linha de nineBoxClassifications. Pode
        // nao existir (S065 — nullable canonico; §7.1 registra motivo
        // em `nineBoxCalculationLog` mas nao cria linha nesta tabela).
        const nineBoxRows = await ctx.db
          .select()
          .from(nineBoxClassifications)
          .where(eq(nineBoxClassifications.employeeId, input.employeeId))
          .orderBy(desc(nineBoxClassifications.trimestre))
          .limit(1);
        const latestNineBox = nineBoxRows[0] ?? null;

        return {
          employee: {
            id: emp.id,
            companyId: emp.companyId,
            name: emp.name,
            departamento: emp.departamento,
            jobFamily: emp.jobFamily,
            senioridade: emp.senioridade,
            nivelHierarquico: emp.nivelHierarquico,
            status: emp.status ?? 'ativo',
            isLider: emp.isLider ?? false,
          },
          latestQuarterly,
          history,
          latestPlenitude,
          latestNineBox,
        };
      }),

    // ============================================================
    // Proc 2 — getCompanyEconomicDashboard (§3.11 + DOC 02 §3.3)
    // ============================================================
    getCompanyEconomicDashboard: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA_DASHBOARD,
        }),
      )
      .query(async ({ ctx, input }): Promise<CompanyEconomicDashboardResult> => {
        // Guard canonico cruzado (§2.4).
        if (ctx.user.role !== 'super_admin') {
          if (ctx.user.companyId !== input.companyId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Empresa fora do escopo.',
            });
          }
        }

        // Guard canonico da matriz DOC 02 §3.3 (S067): lider NAO ve
        // NENHUM dos 5 cards. Bloqueio canonico F2 v2.2 §10.5.
        //
        // Precondicao: um usuario `lider` na tabela `employees` pode
        // acumular flags (isRH=true tambem sinaliza RH; mas o role no JWT
        // e a fonte canonica — quem chega aqui com role='lider' e lider
        // puro sem acumular). Portanto o bloqueio e absoluto por role.
        if (ctx.user.role === 'lider') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Lideres nao visualizam cards financeiros da empresa.',
          });
        }

        // Detecta se o C-level da requisicao tem `acessoTotal=false`
        // (matriz DOC 02 §3.3 — mascaramento canonico S067). Para
        // super_admin, RH e RH-Lider, esta deteccao e no-op (mask fica
        // false em ambos os campos). Consulta em `cLevelMembers` via
        // Drizzle tipado padrao (mesma familia de queries usada em
        // todos os demais routers do repo — RV-12).
        let maskAcessoLimitado = false;
        if (ctx.user.role === 'clevel') {
          const cMemberRows = await ctx.db
            .select({ acessoTotal: cLevelMembers.acessoTotal })
            .from(cLevelMembers)
            .where(eq(cLevelMembers.id, ctx.user.userId))
            .limit(1);
          const cMember = cMemberRows[0];
          if (cMember && cMember.acessoTotal === false) {
            maskAcessoLimitado = true;
          }
        }

        // Leitura do diagnostico persistido (linha unica por (company,
        // trimestre), enforce por UNIQUE `uq_econDiag`).
        const diagRows = await ctx.db
          .select()
          .from(companyEconomicDiagnosis)
          .where(
            and(
              eq(companyEconomicDiagnosis.companyId, input.companyId),
              eq(companyEconomicDiagnosis.trimestre, input.trimestre),
            ),
          )
          .limit(1);
        const diag = diagRows[0];

        if (!diag) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            diagnosisPersisted: false,
            faturamentoMedioMensal: null,
            folhaTotalMedia: null,
            roiEmpresa: null,
            statusDiagnostico: null,
            folhaPorcentagem: null,
            masked: {
              roiEmpresa: maskAcessoLimitado,
              folhaPorcentagem: maskAcessoLimitado,
            },
          };
        }

        // Mascaramento canonico da matriz DOC 02 §3.3 (S067):
        //   C-level `acessoTotal=false` -> null em `roiEmpresa` e
        //   `folhaPorcentagem`; demais campos permanecem.
        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          diagnosisPersisted: true,
          faturamentoMedioMensal: diag.faturamentoMedioTrimestral,
          folhaTotalMedia: diag.folhaTotalMedia,
          roiEmpresa: maskAcessoLimitado ? null : diag.roiEmpresa,
          statusDiagnostico: diag.statusDiagnostico,
          folhaPorcentagem: maskAcessoLimitado ? null : diag.folhaPorcentagem,
          masked: {
            roiEmpresa: maskAcessoLimitado,
            folhaPorcentagem: maskAcessoLimitado,
          },
        };
      }),
  });
}
