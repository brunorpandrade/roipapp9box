// ROIP APP 9BOX — router raiz (ME-021).
//
// `appRouter` e a raiz da arvore de procedures. Na ME-021 ele existe para
// (a) ser o ponto de montagem que o adapter fetch do Next 15 serve e (b)
// ser o chamador real das procedures base do bootstrap (RV-13: todo export
// do `trpc.ts` tem consumidor na MESMA ME). Os routers de dominio do Bloco
// B3 serao acoplados aqui, um por sub-namespace.
//
// A procedure `health.status` exercita `publicProcedure` (sessao nao
// exigida). A procedure `session.whoami` exercita `protectedProcedure`
// (qualquer sessao valida) e devolve a identidade autenticada — util para o
// front confirmar o perfil vigente. `admin.ping` exercita
// `roleProcedure` com o subconjunto administrativo, comprovando o guard de
// perfil. Nenhuma delas persiste dado; sao os chamadores minimos que
// mantem o bootstrap vivo e testavel sem antecipar dominio do Bloco B3.

import { protectedProcedure, publicProcedure, roleProcedure, router } from '../trpc';
import { authRouter } from './auth';
import { createCycleUnlockRequestsRouter } from './cycleUnlockRequests';
import { createDashboardRouter } from './dashboard';
import { createEconomicDiagnosisRouter } from './economicDiagnosis';
import { createInstrumentARouter } from './instrumentA';
import { createInstrumentCRouter } from './instrumentC';
import { createMonthlyClosureRouter } from './monthlyClosure';
import { createMonthlyDataRouter } from './monthlyData';
import { createQuarterlyCalculationRouter } from './quarterlyCalculation';

/** Sub-router de saude: liveness sem sessao. */
const healthRouter = router({
  status: publicProcedure.query(() => {
    return { ok: true as const };
  }),
});

/** Sub-router de sessao: identidade do titular autenticado. */
const sessionRouter = router({
  whoami: protectedProcedure.query(({ ctx }) => {
    return { user: ctx.user };
  }),
});

/**
 * Sub-router administrativo minimo: exercita `roleProcedure` com os quatro
 * perfis administrativos de empresa. Super Admin atravessa por estar na
 * lista. Perfis fora recebem FORBIDDEN (nao ha perfil fora dos 5 canonicos
 * capaz de emitir JWT, mas o guard existe para o Bloco B3).
 */
const adminRouter = router({
  ping: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel']).query(({ ctx }) => {
    return { role: ctx.user.role };
  }),
});

/**
 * Sub-router `cycleUnlockRequests` (ME-032, Bloco B3). Factory instanciada
 * com defaults no-op — motor de alertas administrativos ainda nao existe
 * (DOC 06 §8, Bloco B6). Quando nascer, o `appRouter` sera atualizado com
 * `createCycleUnlockRequestsRouter({ evaluateAdminAlerts: motorReal })`
 * sem editar o sub-router. Padrao S049 (S043/S046 estendido).
 */
const cycleUnlockRequestsRouter = createCycleUnlockRequestsRouter();

/**
 * Sub-router `quarterlyCalculation` (ME-034, Bloco B3). Factory instanciada
 * com defaults reais — o motor `roiCalculationEngine` (ME-033) ja existe
 * e a DI canonica S060 aponta para ele por default. Cobre 3 procs publicas
 * do §3.11 (`triggerRetroactiveRecalculation`, `getQuarterlyResults`,
 * `getCompanyQuarterlyStatus`). Procs internas do §3.11
 * (`triggerQuarterlyCalculation`, `recalculateAfterUnlock`) sao hooks do
 * motor consumidos por orchestrator/cron via DI — precedente canonico
 * ME-030 §19.13.
 */
const quarterlyCalculationRouter = createQuarterlyCalculationRouter();

/**
 * Sub-router `economicDiagnosis` (ME-035, Bloco B3). Leitura pura de
 * `companyEconomicDiagnosis` — 2 procs canonicas do §3.11
 * (`getCompanyDiagnosis`, `getDiagnosisHistory`). Factory sem parametros
 * (nao consome motor, apenas a tabela canonica).
 */
const economicDiagnosisRouter = createEconomicDiagnosisRouter();

/**
 * Sub-router `dashboard` (ME-035, Bloco B3). Leitura pura das superficies
 * de dashboard canonicas — 2 procs do §3.11
 * (`getEmployeeDashboard`, `getCompanyEconomicDashboard`). Aplica os
 * guards canonicos: D035 (§15.4), inativo (§3.13), cadeia direta de
 * lider (S066) e mascaramento canonico da matriz DOC 02 §3.3 (S067).
 */
const dashboardRouter = createDashboardRouter();

/**
 * Sub-router `monthlyData` (ME-036, Bloco B3). Superficie principal de
 * escrita mensal do Eixo X — 5 procs canonicas do §3.11:
 * `getMonthlyInputForm`, `saveMonthlyRHData`, `saveMonthlyLeaderData`,
 * `getLeadersStatus`, `getPendentLeaders`. Factory sem parametros —
 * router de escrita direta sem DI de motor (motores sao acionados por
 * `monthlyClosure.*`, escopo de ME futura). Fecha o circuito Eixo X:
 * RH escreve mensal -> motor ME-031 fecha mes -> motor ME-033 calcula
 * ROI trimestral -> routers ME-034/ME-035 leem tudo.
 */
const monthlyDataRouter = createMonthlyDataRouter();

/**
 * Sub-router `monthlyClosure` (ME-037, Bloco B3). Superficie tRPC de
 * transicao de estado do mes — 4 procs canonicas do §3.11:
 * `getClosureStatus`, `unlockMonth`, `closeMonthScheduled`,
 * `triggerMonthlyProcessing`. Factory com DI (S084): os hooks
 * `processClosedMonth`/`runDailyClosureJob` apontam por default REAL ao
 * motor `monthlyClosureOrchestrator` (ME-031) — que ganha aqui seu
 * primeiro chamador de router (antes so exercitado por teste). Fecha o
 * loop operacional do Eixo X: monthlyData escreve -> monthlyClosure
 * transiciona -> motor ME-031/ME-033 calcula -> ME-034/ME-035 leem.
 */
const monthlyClosureRouter = createMonthlyClosureRouter();

/**
 * Sub-router `instrumentC` (ME-038, Bloco B3). Primeira superficie tRPC
 * de escrita do Eixo Y — 3 procs canonicas do §6.8 sob a estreitura de
 * escopo S089: `saveInstrumentCAssessment`, `getAssessment`,
 * `reopenAssessment`. Factory com DI limitada ao relogio (S084
 * estendido; S088: sem hook de motor de plenitude — motor futuro fara
 * [EDIT] neste router para injetar `onAssessmentSaved` real). Consome
 * services ja existentes (`instrumentC_assessments`,
 * `instrumentUnlockLog`, `employeeLeaderHistory`) com chamador real —
 * RV-13 estrito. Abre a pre-condicao canonica que o motor de plenitude
 * (§6.4) e o 9-Box (§7.1) exigem.
 */
const instrumentCRouter = createInstrumentCRouter();

/**
 * Sub-router `instrumentA` (ME-039, Bloco B3). Fecha a SEGUNDA e ULTIMA
 * perna canonica de escrita do Eixo Y — par simetrico ao `instrumentC`
 * entregue na ME-038. Escopo canonico enxuto (S089/S093 estreitados):
 * apenas `reopenResponse` (§6.8 sexta linha — desbloqueio manual por
 * Bruno). A ponta de escrita "normal" do A vive no Route Handler
 * canonico `POST /api/portal/save-instrument-a` (§6.8 primeira linha —
 * portal autenticado por CPF via `portalToken`, NAO via tRPC). Factory
 * com DI limitada ao relogio (S100, S084 estendido; S094: sem hook de
 * motor de plenitude — motor futuro fara [EDIT] tanto neste router
 * quanto no Route Handler para injetar `onResponseSaved` real). Com A
 * escrito, o motor de plenitude (§6.4) pode nascer na ME seguinte ja
 * com AMBAS as fontes (A e C) disponiveis — RV-13 satisfeito
 * naturalmente sem hook no-op.
 */
const instrumentARouter = createInstrumentARouter();

/** Router raiz da plataforma. */
export const appRouter = router({
  health: healthRouter,
  session: sessionRouter,
  admin: adminRouter,
  auth: authRouter,
  cycleUnlockRequests: cycleUnlockRequestsRouter,
  quarterlyCalculation: quarterlyCalculationRouter,
  economicDiagnosis: economicDiagnosisRouter,
  dashboard: dashboardRouter,
  monthlyData: monthlyDataRouter,
  monthlyClosure: monthlyClosureRouter,
  instrumentC: instrumentCRouter,
  instrumentA: instrumentARouter,
});

/** Tipo do router raiz — consumido pelo cliente tipado (Bloco B3/UI). */
export type AppRouter = typeof appRouter;
