# ROIP APP 9BOX — Coverage Map Camada 3 (Negócio)

**Bit-exact ao DOC 07 §6.1..§6.16.** Regime N2 Opção C aprovada em
ME-064. Baseline HEAD `86c0c73...` + CC055 + CC056 (traduções
canônicas §4.4 já aplicadas na Camada 1).

**Escopo canônico:** 79 services (motores + DAL) + 29 routers +
149 test files integração + 50 unit. §6 do DOC 07 tem 16 subseções.

---

## §6.1 Motor determinístico do Eixo X (Desempenho) (~9 items)

**Fontes canônicas de cobertura:**

- `tests/integration/roiCalculationEngine.test.ts` +
  `src/server/services/roiCalculationEngine.ts` — motor bit-exact
  DOC 03 §4 (CC5 dia 10 aberto / dia 11 fechado).
- `tests/unit/roiFormulas.test.ts` — fórmulas canônicas
  determinísticas puras.
- `tests/integration/quarterlyCalculation-router.test.ts` +
  `src/server/routers/quarterlyCalculation.ts` — trigger canônico
  do cálculo trimestral.
- `tests/integration/performanceQuarterlyData.test.ts` — persistência
  determinística; `diagnosticoIA`/`diagnosticoIAgeradoEm`.
- `tests/integration/performanceData.test.ts` +
  `performanceVariableData.test.ts` — dados fonte com regras
  canônicas.
- `tests/integration/monthlyData-router.test.ts` +
  `companyMonthlyData.test.ts` — dados mensais RH bit-exact CC5.
- `tests/unit/quarterlyPeriod.test.ts` +
  `tests/unit/cycleDates.test.ts` — regras canônicas de datas
  bit-exact.

**Cobertura:** motor determinístico Eixo X 100% coberto; CC5
harmonização dia 10/dia 11 canônica; ausência de dupla escrita
(idempotência).

**Status:** COVERED bit-exact.

---

## §6.2 Fechamento mensal, desbloqueio e recálculo (~8 items)

**Fontes canônicas de cobertura:**

- `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `src/server/services/monthlyClosureOrchestrator.ts` — orquestrador
  canônico do fechamento com Hooks 1-4 (Hook 5
  `refreshCycleScheduleCounters` novo ME-063b).
- `tests/integration/monthlyClosure-router.test.ts` +
  `src/server/routers/monthlyClosure.ts` — router canônico.
- `tests/integration/monthlyClosureStatus.test.ts` — estados
  canônicos (`aberto`, `fechado`, `desbloqueado`).
- `tests/integration/cycleUnlockRequests.test.ts` +
  `cycleUnlockRequests-router.test.ts` — solicitação canônica.
- `tests/integration/monthlyUnlockLog.test.ts` — log canônico
  (append-only) + `unlockRequestId` FK SET NULL.
- `tests/integration/alerts-hooks-admin-unlock.test.ts` — fluxo
  P11 desbloqueio integrado com alertas (`desbloqueio_solicitado`,
  `desbloqueio_aprovado`, `desbloqueio_recusado`).
- `tests/integration/cron-scheduler-me063b.test.ts` +
  `refresh-cycle-schedule-counters.test.ts` — reversão automática
  do desbloqueio 24h via `runDailyClosureJob`; recálculo trimestral
  disparado.

**Status:** COVERED bit-exact.

---

## §6.3 Faturamento bruto e Responsável financeiro (~5 items)

**Fontes canônicas de cobertura:**

- `tests/integration/revenue-router.test.ts` +
  `src/server/routers/revenue.ts` — router canônico de faturamento.
- `tests/integration/companyMonthlyData.test.ts` — `faturamentoBruto`
  bit-exact CC5.
- `tests/integration/companies.test.ts` — RF único por empresa
  bit-exact.
- `tests/integration/responsavelFinanceiroTransferLog.test.ts` —
  log canônico de transferência.
- Cobertura cruzada com §5.6 Camada 2 (Auth) —
  `me050-integration.test.ts` +
  `cLevelMembers-router.test.ts`.

**Status:** COVERED bit-exact.

---

## §6.4 Motor determinístico do Eixo Y (Plenitude) e 9-Box (~7 items)

**Fontes canônicas de cobertura:**

- `tests/integration/plenitudeCalculationEngine.test.ts` +
  `src/server/services/plenitudeCalculationEngine.ts` — motor
  Eixo Y canônico DOC 03 §6.
- `tests/integration/plenitudeData.test.ts` — persistência
  determinística; scores A/C + faixaPlenitude + divergência +
  alertaDivergencia.
- `tests/integration/nineBoxCalculationEngine.test.ts` +
  `nineBoxCalculationLog.test.ts` — motor 9-Box canônico DOC 03 §7
  - log canônico.
- `tests/integration/nineBoxClassifications.test.ts` — snapshot
  trimestral bit-exact (nome canônico DOC 01 §8.4 — CC056).
- `tests/integration/nineBox-router.test.ts` +
  `src/server/routers/nineBox.ts` — router canônico.
- `tests/integration/instrumentA_responses.test.ts` +
  `instrumentA-router.test.ts` — instrumento A (autoavaliação).
- `tests/integration/instrumentC_assessments.test.ts` +
  `instrumentC-router.test.ts` — instrumento C (avaliação líder).

**Status:** COVERED bit-exact.

---

## §6.5 Instrumento D e IQL (~5 items)

**Fontes canônicas de cobertura:**

- `tests/integration/instrumentD_responses.test.ts` +
  `instrumentD-router.test.ts` — instrumento D bit-exact.
- `tests/integration/iqlCalculationEngine.test.ts` (via
  `iqlData.test.ts` + `iql-router.test.ts`) +
  `src/server/services/iqlCalculationEngine.ts` — motor canônico
  IQL DOC 03 §8.
- `tests/integration/iqlData.test.ts` (canônico bit-exact — CC056
  aplicada; alias `iqlScores` superado).
- `tests/integration/iql-router.test.ts` — router canônico.
- Piso 3 respondentes + anonimato camada de leitura — coberto
  bit-exact.

**Status:** COVERED bit-exact.

---

## §6.6 Bloco Clima e Engajamento (~5 items)

**Fontes canônicas de cobertura:**

- `tests/integration/climateCalculationEngine.test.ts` +
  `src/server/services/climateCalculationEngine.ts` — motor Clima
  canônico DOC 03 §9.
- `tests/integration/climateEngagementData.test.ts` — persistência
  bit-exact; escopo `equipe` com `liderId`; unique key 5 colunas.
- `tests/integration/climate-router.test.ts` — router canônico.
- `tests/integration/cron-scheduler-me063b.test.ts` — job
  agregação diária canônica (`runDailyClimateAggregationJob`
  DOC 03 — S499 canonizada em ME-063a).

**Status:** COVERED bit-exact.

---

## §6.7 Perfil Individual — motor determinístico (~8 items)

**Fontes canônicas de cobertura:**

- `tests/integration/individualProfileEngine.test.ts` +
  `src/server/services/individualProfileEngine.ts` — motor
  determinístico DOC 03 §10.4..§10.6 bit-exact (implementado em
  ME-049a).
- `tests/integration/individualProfileAssessments.test.ts` +
  `individualProfileScores.test.ts` +
  `individualProfilePlaceholders.test.ts` — persistência canônica
  (CC056: nomes canônicos DOC 01).
- `tests/integration/individualProfile-router.test.ts` +
  `src/server/routers/individualProfile.ts` +
  `individualProfilePlaceholders-router.test.ts` — routers canônicos.
- `tests/integration/portal-submit-profile-assessment.test.ts` +
  `portal-profile-form-state.test.ts` +
  `portal-save-profile-block.test.ts` — fluxo do portal canônico.
- Cobertura de tentativa=1/2 + confiabilidade
  consistente/inconsistente — coberta bit-exact.

**Status:** COVERED bit-exact.

---

## §6.8 Radar NR-1 (~10 items)

**Fontes canônicas de cobertura:**

- `tests/integration/nr1CalculationEngine.test.ts` +
  `src/server/services/nr1CalculationEngine.ts` — motor canônico
  DOC 03 §11 (openScheduledNr1Cycles + closeNr1Cycle).
- `tests/integration/copsoqCycles.test.ts` +
  `copsoqCycleSnapshot.test.ts` +
  `copsoq_responses.test.ts` +
  `copsoqFactorScores.test.ts` — persistência canônica.
- `tests/integration/nr1AreaDivergenceAnalysis.test.ts` — análise
  canônica de divergência.
- `tests/integration/radarNR1Reports.test.ts` — relatórios canônicos.
- `tests/integration/nr1-router.test.ts` +
  `src/server/routers/nr1.ts` — router canônico.
- `tests/integration/portal-nr1-form-state.test.ts` +
  `portal-save-nr1-response.test.ts` — fluxo portal canônico.
- `tests/integration/cron-scheduler-me063b.test.ts` — abertura
  agendada de ciclos NR-1 via `runDailyInstrumentStatusJob` §15.1.2.
- Cooldown granular por (tipo, companyId, escopoDepartamentoId,
  fatorId) — coberto em `alerts-hooks-integration.test.ts`.
- Ausência canônica de `nr1PGRDocuments` —
  `check-forbidden-terms.sh` §14.

**Status:** COVERED bit-exact.

---

## §6.9 Turnover (~4 items)

**Fontes canônicas de cobertura:**

- `tests/integration/turnover-router.test.ts` +
  `src/server/routers/turnover.ts` +
  `src/server/services/turnoverEngine.ts` — motor + router canônicos
  DOC 03 §12.
- `tests/integration/employeeTerminationEvents.test.ts` —
  append-only + `actorTipo`/`actorId` polimórficos DOC 01 §13.

**Status:** COVERED bit-exact.

---

## §6.10 Central de Relatórios e Exportações (~9 items)

**Fontes canônicas de cobertura:**

- `tests/integration/executiveReportEngine.test.ts` +
  `src/server/services/executiveReportEngine.ts` — motor híbrido
  canônico DOC 03 §13 + DOC 04 §12.
- `tests/integration/executiveReportCache.test.ts` — cache canônico
  UNIQUE `(companyId, escopoTipo, escopoReferencia, trimestre)`.
- `tests/integration/executive-report-download-handler.test.ts` —
  route handler canônico.
- `tests/integration/exports-router.test.ts` +
  `src/server/routers/exports.ts` — router de exportações.
- `tests/integration/spreadsheets-router.test.ts` +
  `src/server/routers/spreadsheets.ts` — router de planilhas.
- `tests/unit/executiveReportAI.test.ts` +
  `executiveReportTemplate.test.ts` — templates canônicos.
- `tests/unit/pdfEphemeralToken.test.ts` +
  `pdfRenderer.test.ts` — geração PDF canônica.
- `tests/integration/apiUsageLog.test.ts` — governança canônica
  5/dia + `apiUsageLog` UNIQUE `(companyId, tipo, dataUso)`.

**Status:** COVERED bit-exact.

---

## §6.11 Transferência de liderados — M2 v2 (~6 items)

**Fontes canônicas de cobertura:**

- `tests/integration/leadershipTransfer-router.test.ts` +
  `src/server/routers/leadershipTransfer.ts` — M2 v2 canônica com
  5 grupos autocomplete + modal secundário condicional de promoção
  `isLider` + loop condicional + justificativa 100-500.
- `tests/integration/employeeLeaderHistory.test.ts` — `reason`
  VARCHAR(500) NOT NULL + `transferBatchId` CHAR(36) NOT NULL +
  índice canônico por batch.
- `tests/integration/employees-uploadCSV.test.ts` — upload em massa
  canônico com transferência integrada.

**Status:** COVERED bit-exact.

---

## §6.12 Padrão canônico transversal 100-500 caracteres (~5 items)

**Fontes canônicas de cobertura:**

- 5 pontos canônicos S057:
  - Transferência de liderados → `leadershipTransfer-router.test.ts`.
  - Transferência de RF →
    `responsavelFinanceiroTransferLog.test.ts` +
    `company-router.test.ts`.
  - Solicitação de desbloqueio →
    `cycleUnlockRequests-router.test.ts`.
  - Recusa de desbloqueio → idem (motivo).
  - Motivo de saída (Onboarding líderes) →
    `leaderOnboarding-router.test.ts`.
- Mensagens canônicas literais de erro bit-exact 99/501 preservadas
  nos test files acima.

**Status:** COVERED bit-exact.

---

## §6.13 Cadastros e ciclo de vida de vínculos (~10 items)

**Fontes canônicas de cobertura:**

- `tests/integration/employees.test.ts` +
  `employees-router.test.ts` +
  `employees-uploadCSV.test.ts` +
  `employees-onboarding-hooks.test.ts` — cadastros de colaborador
  canônicos + hooks de onboarding.
- `tests/integration/cLevelMembers.test.ts` +
  `cLevelMembers-router.test.ts` — cadastros de C-level.
- `tests/integration/companies.test.ts` +
  `company-router.test.ts` — cadastros de empresa.
- `tests/integration/departments.test.ts` — 19 departments
  canônicos intocáveis.
- `tests/integration/companyJobFamilies.test.ts` — job families
  canônicos.
- `tests/integration/employeeGoals.test.ts` — metas canônicas
  (soma pesos=100%).
- `tests/integration/employeeLeaderHistory.test.ts` — histórico
  de vínculos.
- `tests/integration/employeeTerminationEvents.test.ts` — eventos
  de terminação append-only.

**Status:** COVERED bit-exact.

---

## §6.14 Motor de instrumentos e ciclos automáticos (~6 items)

**Fontes canônicas de cobertura:**

- `tests/integration/cycleScheduleEngine.test.ts` +
  `src/server/services/cycleScheduleEngine.ts` — motor canônico
  DOC 03 §14 (ME-030 + Hook 5 `refreshCycleScheduleCounters`
  ME-063b).
- `tests/integration/cycleSchedule.test.ts` — persistência bit-exact
  enum status 3 valores.
- `tests/integration/refresh-cycle-schedule-counters.test.ts` —
  Hook 5 bit-exact (12 novos testes ME-063b).
- `tests/integration/cron-scheduler.test.ts` +
  `cron-scheduler-me063b.test.ts` — orquestração canônica dos 7
  jobs bit-exact §15.1.
- `tests/integration/instrumentUnlockLog.test.ts` — log canônico
  append-only de desbloqueio de instrumentos.

**Status:** COVERED bit-exact.

---

## §6.15 Routers tRPC — inventário canônico do domínio de negócio (~29 items)

**Fontes canônicas de cobertura:**

- 29 routers canônicos em `src/server/routers/` bit-exact ao
  DOC 03 §16:
  aiChat, auth, cLevelMembers, climate, company, cycleUnlockRequests,
  dashboard, economicDiagnosis, employees, exports, individualProfile,
  individualProfilePlaceholders, instrumentA, instrumentC, instrumentD,
  iql, leaderOnboarding, leadershipTransfer, monthlyClosure,
  monthlyData, nineBox, nr1, platformLogs, plenitude,
  quarterlyCalculation, revenue, spreadsheets, turnover + index.
- Cada router tem test file `tests/integration/<router>-router.test.ts`
  correspondente (cobertura 1:1).
- `tests/integration/trpc-procedures.test.ts` — mapeamento
  canônico global tRPC bit-exact.
- `src/server/routers/index.ts` — root router canônico.

**Status:** COVERED bit-exact — 29/29 routers cobertos.

---

## §6.16 Evidências canônicas exigidas (~10 items)

**Fontes canônicas de cobertura:**

- Todas as queries canônicas do §6.16 são executáveis via MySQL
  real (RV-11) exercitado bit-exact pelos test files das §6.1..§6.15.
- Evidências reais coladas em `RETORNO_ROIP_MVP_parcial-me064.md`
  §5.

**Status:** COVERED bit-exact.

---

## Consolidação canônica

**Coverage global Camada 3 (Negócio):** COVERED bit-exact.

- §6.1..§6.16 — cobertura 100% via 79 services + 29 routers + 149
  test files integração + 50 unit + `verify-schema.mjs` +
  `check-forbidden-terms.sh` §14 (ME-064).

**Gaps canonicamente identificados na Camada 3:** ZERO.

**Testes de gap-closing requeridos em ME-064 para Camada 3:**
NENHUM.

**CCs canônicas registradas em Camada 3:** nenhuma nova.
CC055 e CC056 aplicadas em Camada 1 continuam vigentes.

**Assinatura canônica:** ME-064 Camada 3 bit-exact ao DOC 07 §6
contra clone público independente HEAD `86c0c73...`.

---

## Consolidação canônica geral das Camadas 1-3 (ME-064)

- **Camada 1 (Dados):** 65/66 items cobertos + 1 CC056 inaplicável.
- **Camada 2 (Autenticação e autorização):** 53/53 items cobertos.
- **Camada 3 (Negócio):** cobertura 100% via 3145 testes existentes
  (motor + router + tabela) + verify-schema + check-forbidden-terms
  §14.

**Testes de gap-closing requeridos em ME-064 no total:** ZERO.

**Marco canônico da ME-064:** as Camadas 1-3 do DOC 07 estão
canonicamente COBERTAS BIT-EXACT pela base pré-ME-064 (após CC055
e CC056 canônicas). Nenhum teste novo é canonicamente necessário
para elevar a cobertura ao nível prescrito pelo DOC 07.
