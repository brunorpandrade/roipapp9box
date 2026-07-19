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
import { createCLevelMembersRouter } from './cLevelMembers';
import { createCompanyRouter } from './company';
import { createCycleUnlockRequestsRouter } from './cycleUnlockRequests';
import { createDashboardRouter } from './dashboard';
import { createEconomicDiagnosisRouter } from './economicDiagnosis';
import { createEmployeesRouter } from './employees';
import { createInstrumentARouter } from './instrumentA';
import { createInstrumentCRouter } from './instrumentC';
import { createInstrumentDRouter } from './instrumentD';
import { createIqlRouter } from './iql';
import { createLeadershipTransferRouter } from './leadershipTransfer';
import { createMonthlyClosureRouter } from './monthlyClosure';
import { createMonthlyDataRouter } from './monthlyData';
import { createNineBoxRouter } from './nineBox';
import { createPlatformLogsRouter } from './platformLogs';
import { createPlenitudeRouter } from './plenitude';
import { createQuarterlyCalculationRouter } from './quarterlyCalculation';
import { createRevenueRouter } from './revenue';
import { createTurnoverRouter } from './turnover';

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

/**
 * Sub-router `plenitude` (ME-042, Bloco B3). Primeira superficie tRPC
 * de leitura publica do Eixo Y — 1 proc canonica do §6.8 setima linha
 * + §19.4 nona linha: `getPlenitudeData`. Factory sem parametros —
 * leitura pura, sem motor. O motor de plenitude (§6.4) foi entregue
 * na ME-040 e materializa `plenitudeData` a cada submit do A ou C;
 * este sub-router expoe a leitura da linha ja calculada. Guards
 * canonicos: escopo empresa (§2.4), cadeia direta de lider (S066)
 * quando `role === 'lider'`, colaborador inativo restrito a Bruno +
 * RH (§3.13). PC1e §15.5 satisfeita por construcao arquitetural
 * (C-levels nao tem entrada em `plenitudeData`).
 */
const plenitudeRouter = createPlenitudeRouter();

/**
 * Sub-router `nineBox` (ME-042, Bloco B3). Segunda superficie tRPC
 * de leitura publica do Eixo Y — 2 procs canonicas do §7.9 + §19.4
 * decima e decima-primeira linhas: `getNineBoxSnapshot` (S119 —
 * discriminated union por `mode: 'employee'|'company'`) e
 * `getNineBoxTrajectory` (S120 — N default 4, cap 20). Factory sem
 * parametros — leitura pura, sem motor. O motor 9-Box (§7.1-7.8) foi
 * entregue na ME-041 e materializa `nineBoxClassifications` a cada
 * escrita do plenitude em que os dois eixos estao disponiveis; este
 * sub-router expoe a leitura da linha ja calculada. Guards canonicos:
 * escopo empresa (§2.4), cadeia direta (S066) quando `role ===
 * 'lider'`, inativo restrito a Bruno + RH (§3.13). S122: modo empresa
 * do snapshot restrito a Bruno + RH.
 */
const nineBoxRouter = createNineBoxRouter();

/**
 * Sub-router `employees` (ME-043, Bloco B3). Primeira superficie tRPC
 * de ESCRITA canonica sobre a tabela `employees` (DOC 01 §4.5) — 5 das
 * 8 procs canonicas do §16.7 do DOC 03 (`create`, `update`,
 * `inactivate`, `reactivate`, `delete`). Factory sem dependencias
 * externas de motor: o placeholder do Perfil Individual (§10.12) e
 * criado por INSERT canonico DIRETO na transacao do `create` — nao
 * ha hook DI porque o motor de assessment do §10 (ME-049a) le
 * `individualProfilePlaceholders`, nao emite. Guards canonicos:
 * `roleProcedure(['super_admin','rh','rh_lider'])` nas 4 primeiras;
 * `roleProcedure(['super_admin'])` no `delete` (§16.4). Escopo por
 * empresa via `assertCompanyScope` (§2.4). RF explicitamente fora do
 * escopo (S127) — reativado em ME-044 via
 * `company.setResponsavelFinanceiro`.
 */
const employeesRouter = createEmployeesRouter();

/**
 * Sub-router `cLevelMembers` (ME-043, Bloco B3). Segunda superficie
 * tRPC de ESCRITA canonica sobre `cLevelMembers` (DOC 01 §4.4) — 5
 * procs canonicas do §16.7, TODAS Bruno EXCLUSIVO (DOC 02 §12):
 * `create`, `update`, `inactivate` (S128 semantica seca — sem
 * `motivoSaida`, sem `employeeTerminationEvents`, §12.2 exclui C-level
 * de turnover), `reactivate` e `delete` (§16.4). Placeholder do
 * §10.12 tambem por INSERT canonico direto. RF fora do escopo (S127).
 */
const cLevelMembersRouter = createCLevelMembersRouter();

/**
 * Sub-router `company` (ME-044, Bloco B3). Primeira superficie tRPC
 * de escrita canonica de PAPEIS FUNCIONAIS de empresa (DOC 03 §5.5) —
 * 1 proc: `setResponsavelFinanceiro` Bruno EXCLUSIVO. Transacao atomica
 * canonica: resolve titular vigente (varredura em `employees` +
 * `cLevelMembers` com `.for('update')`), UPDATE flag do anterior (se
 * houver) + UPDATE flag do novo + INSERT em
 * `responsavelFinanceiroTransferLog` via service canonico
 * `insertTransferLogEntry`. Discriminacao canonica de cenario:
 * `atribuido` (sem RF vigente, `reason` = literal canonico) ou
 * `transferido` (com RF vigente, `reason` = justificativa 100-500 do
 * payload). Hook D050 (`EmitD050Facade`) por default no-op — motor
 * canonico de notificacoes vira em ME futura do Bloco B6 (padrao S049).
 */
const companyRouter = createCompanyRouter();

/**
 * Sub-router `revenue` (ME-044, Bloco B3). Superficie tRPC de escrita e
 * leitura canonica do faturamento mensal (DOC 03 §5.10, §5.12) — 3 procs:
 * `saveFaturamento` (Bruno OU Responsavel financeiro; UPSERT canonico
 * `.onDuplicateKeyUpdate({set})` na linha `companyMonthlyData(companyId,
 * mes)`; pre-condicao `monthlyClosureStatus.status !== 'fechado'`),
 * `getFaturamento` (leitura pura por perfil administrativo da mesma
 * empresa) e `getCardResumoPendente` (§5.12 — janela de 12 meses do
 * relogio injetavel; retorna meses sem `faturamentoBruto`). Guard fino
 * RF (SELECT `isResponsavelFinanceiro`) vive no handler para nao-Bruno.
 */
const revenueRouter = createRevenueRouter();

/**
 * Sub-router `platformLogs` (ME-044, Bloco B3). Superficie tRPC de
 * LEITURA canonica de logs de plataforma acessiveis EXCLUSIVAMENTE por
 * Bruno (DOC 06) — 1 proc: `listResponsavelFinanceiroTransfers` que
 * retorna o historico completo do `responsavelFinanceiroTransferLog` de
 * uma empresa ordenado do mais recente ao mais antigo (DESC). Reutiliza
 * o service canonico `listTransferLogByCompany` (ordem ASC canonica) e
 * aplica `.reverse()` — zero edicao do service.
 */
const platformLogsRouter = createPlatformLogsRouter();

/**
 * Sub-router `leadershipTransfer` (ME-045, Bloco B3). Padrao canonico
 * UNICO de transferencia de liderados M2 v2 (§14). 4 procs canonicas
 * §14.12 — Bruno + RH em todas: `canInactivate`, `getCandidates`,
 * `checkEmailForPromotion`, `execute`. Encapsulamento canonico §14.8
 * (S146): SEM `notifications`/`alerts`; `employeeLeaderHistory` e a
 * unica superficie de auditoria. Fusao canonica E01 aprovada com
 * §12.6: `execute` recebe `motivoSaida` obrigatorio e a transacao
 * atomica §14.9 estende o Passo 6 com INSERT em
 * `employeeTerminationEvents`. Factory com DI de `now` e
 * `generateBatchId` (S144) para testes deterministicos; defaults reais
 * (`crypto.randomUUID`). Fecha o restante R1 da ME-043 em conjunto com
 * o [EDIT] `employees.inactivate` (S148 — bloqueio backend canonico
 * como salvaguarda para chamadas API diretas).
 */
const leadershipTransferRouter = createLeadershipTransferRouter();

/**
 * Sub-router `turnover` (ME-045, Bloco B3). Superficie tRPC de leitura
 * canonica das taxas trimestral e rolling 12m — 2 procs canonicas
 * §12.8: `getByCompany` (com abertura pelos 3 niveis hierarquicos
 * canonicos e por motivo) e `getByDepartamento` (sem abertura por
 * nivel, §12.3). Autorizacao S147: Bruno + RH + RH-Lider + C-level
 * (matriz administrativa canonica de leitura). Consome motor
 * deterministico `turnoverEngine` (S141 aprovado — headcount por
 * proxy admissao + termination futura). Reusa `TRIMESTRE_INPUT_SCHEMA`
 * de `quarterlyCalculation` (S142). Factory sem parametros — motor puro.
 */
const turnoverRouter = createTurnoverRouter();

/**
 * Sub-router `instrumentD` (ME-046, Bloco B3). Primeira superficie
 * tRPC de leitura publica de status de coleta do Instrumento D —
 * 1 proc canonica do §8.8 segunda linha + §19.5 segunda linha:
 * `getInstrumentDStatus`. Factory com DI limitada ao relogio
 * (S155, S100/S084 estendido; SEM hook de motor IQL — motor
 * canonico vive no Route Handler `POST /api/portal/save-
 * instrument-d` para o D e na proc `iql.calculateIQL` do router
 * `iql`, S154). A ponta de escrita "normal" do Instrumento D vive
 * no Route Handler `POST /api/portal/save-instrument-d` (§8.8
 * primeira linha — portal autenticado por CPF via `portalToken`,
 * NAO via tRPC — precedente ME-039). SEM `reopenResponse`: §8.1
 * canoniza que o D nao fecha, portanto nao ha janela a reabrir.
 * Cadencia canonica SEMESTRAL (S156) — regex Zod `^\d{4}-Q[13]$`.
 * §8.6 Bloqueio 3 (C-level nao responde D) e arquitetural (FK
 * `respondenteId → employees.id`).
 */
const instrumentDRouter = createInstrumentDRouter();

/**
 * Sub-router `iql` (ME-046, Bloco B3). Superficie tRPC canonica do
 * IQL — 3 procs do §8.8 e §19.5: `calculateIQL` (S154 — Bruno
 * exclusivo, reprocessamento manual, paralelo a
 * `plenitude.calculatePlenitudeScore` e
 * `nineBox.calculateNineBoxClassification`), `getIQLData` (leitura
 * do agregado por par avaliado x trimestre, aplica Bloqueios 1 e
 * 4 §8.6 + piso 3 §8.5 na CAMADA DE LEITURA S158) e `getTabelaIQL`
 * (leitura consolidada com visibilidade §8.7: Bruno + RH empresa;
 * C-level `acessoTotal=true` todos os lideres; C-level parcial ou
 * Lider Cenario 2 cadeia propria; Lider Cenario 1 FORBIDDEN).
 * Factory com DI de `now` e `iqlEngine` (S154, defaults reais);
 * default `DEFAULT_IQL_ENGINE` aponta ao motor
 * `iqlCalculationEngine` (S149) da mesma ME. Nome canonico unico
 * `iql` — o alias historico superado pelo §19 do DOC 01 e
 * bloqueado pelo check-forbidden-terms. Fecha o dominio
 * de leitura publica do Eixo IQL para as matrizes de dashboards
 * (§3.11, §19.5).
 */
const iqlRouter = createIqlRouter();

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
  plenitude: plenitudeRouter,
  nineBox: nineBoxRouter,
  employees: employeesRouter,
  cLevelMembers: cLevelMembersRouter,
  company: companyRouter,
  revenue: revenueRouter,
  platformLogs: platformLogsRouter,
  leadershipTransfer: leadershipTransferRouter,
  turnover: turnoverRouter,
  instrumentD: instrumentDRouter,
  iql: iqlRouter,
});

/** Tipo do router raiz — consumido pelo cliente tipado (Bloco B3/UI). */
export type AppRouter = typeof appRouter;
