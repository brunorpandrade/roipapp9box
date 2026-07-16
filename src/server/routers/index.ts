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

/** Router raiz da plataforma. */
export const appRouter = router({
  health: healthRouter,
  session: sessionRouter,
  admin: adminRouter,
  auth: authRouter,
  cycleUnlockRequests: cycleUnlockRequestsRouter,
  quarterlyCalculation: quarterlyCalculationRouter,
});

/** Tipo do router raiz — consumido pelo cliente tipado (Bloco B3/UI). */
export type AppRouter = typeof appRouter;
