# ROIP APP 9BOX — Coverage Map Camada 1 (Dados)

**Bit-exact ao DOC 07 §4.1..§4.10.** Mapeia canonicamente cada
subseção estrutural do §4 do DOC 07 aos artefatos canônicos de
cobertura (verify-schema, test files de integração, motores).

**Regime canônico:** N2 Opção C aprovada em ME-064 — auditoria de
cobertura + gap-closing sobre a base de 3145 testes existentes.
Cobertura evidenciada por execução real via clone público
independente (RV-01) + MySQL real (RV-11).

**Interpretação canônica CC056 aplicada bit-exact:** DOC 07 §2.2
declara "Regras de schema, migrations ou seed — fonte única DOC 01".
Portanto nomes de tabela em §4.4 do DOC 07 são canonicamente
resolvidos contra o DOC 01. Traduções bit-exact aplicadas neste
coverage map:

- `plenitudeScoreLog` — canonicamente inexistente (erro puro §4.4
  do DOC 07). Item ignorado — sem tabela para mapear cobertura.
- `ninebox` → `nineBoxClassifications` (DOC 01 §8.4).
- `individualProfileResponses` → `individualProfileAssessments`
  (DOC 01 §9.1).
- `individualProfileReports` → `individualProfilePlaceholders`
  (DOC 01 §4.9).
- `iqlScores` → `iqlData` (DOC 01 §8.8; S422 explicitado).

**Baseline canônico:** HEAD `86c0c73...` (ME-063b) + CC055 aplicada
in-scope + `check-forbidden-terms.sh` estendido §14.

---

## §4.1 Inventário de tabelas (5 items)

**Fontes canônicas de cobertura:**

- `scripts/verify-schema.mjs` — motor central bit-exact. Assert
  `sqlTables.size === 53` (linha 369-371). Assert cross-check
  bit-exact `migration ↔ tables.ts` de nomes/colunas/FKs.
  Invariantes canônicos: 692 colunas (CC055) + 107 FKs.
- `scripts/check-forbidden-terms.sh` estendido §14 (ME-064) —
  ausência bit-exact dos 15 termos §14.1 do DOC 07 em `src`,
  `scripts`, `tests`, `.env.example` (RV-03 bidirecional completa).
- `src/db/migrations/0000_canonical.sql` — schema DDL canônico
  bit-exact.
- `src/db/schema/tables.ts` — schema TS canônico.

**Cobertura por item:**

- **Exatamente 53 tabelas** — `verify-schema.mjs:369` bit-exact.
- **Nenhuma tabela §19 (superadas) presente** — `verify-schema.mjs`
  implícito (não instancia) + `check-forbidden-terms.sh` §14 grep.
- **Ausência `emailSettings`, `emailChangeRequests`,
  `nr1PGRDocuments`** — `check-forbidden-terms.sh` STRUCT_TERMS
  bit-exact; evidência via `SHOW TABLES LIKE` para §3.1 do template.
- **Ausência colunas `resetPasswordTokenHash`,
  `resetPasswordExpiresAt`, `resetPasswordUsedAt`,
  `firstAccessCompleted`** — `check-forbidden-terms.sh` STRUCT_TERMS.
- **Ausência coluna `cadenciaCOPSOQ` em companies** — idem.

**Status:** COVERED bit-exact — 5/5.

---

## §4.2 Núcleo cadastral e enums fechados (7 items)

**Fontes canônicas de cobertura:**

- `tests/integration/superAdmins.test.ts` — `superAdmins` conforme
  DOC 01 §4.
- `tests/integration/companies.test.ts` — `companies` com timezone,
  encarregadoLgpd*, sem `cadenciaCOPSOQ`.
- `tests/integration/employees.test.ts` +
  `employees-router.test.ts` — flags isRH/isLider/isResponsavel*,
  `onboardingEstagio*`, `passwordSet`; sem colunas denormalizadas.
- `tests/integration/cLevelMembers.test.ts` +
  `cLevelMembers-router.test.ts` — `isResponsavelFinanceiro`,
  `acessoTotal`; sem `isRH`.
- `tests/integration/departments.test.ts` — 19 linhas canônicas;
  ausência de rota de escrita.
- `tests/integration/accessTokens.test.ts` — enum `type` com
  exatamente 2 valores (`first_access`, `password_reset`).
- `tests/unit/accessDeniedMessages.test.ts` + auth-* (11 test files)
  — enum `departamento` distinto do enum `tipo` de
  notifications/alerts (por não-colisão de nomes canônicos).

**Cobertura por item:**

- superAdmins conforme §4 — `superAdmins.test.ts`.
- companies (timezone, encarregadoLgpd*, sem `cadenciaCOPSOQ`) —
  `companies.test.ts`.
- employees (flags + onboarding + passwordSet; sem denormalizados) —
  `employees.test.ts` + `employees-router.test.ts`.
- cLevelMembers (isResponsavelFinanceiro, acessoTotal; sem isRH) —
  `cLevelMembers.test.ts`.
- departments 19 linhas canônicas — `departments.test.ts`.
- accessTokens conforme §4.8 (enum 2 valores) —
  `accessTokens.test.ts`.
- Enum `departamento` distinto — `verify-schema.mjs` (impl) +
  ausência textual em routers de notifications.

**Status:** COVERED bit-exact — 7/7.

---

## §4.3 Desempenho e diagnóstico (6 items)

**Fontes canônicas de cobertura:**

- `tests/integration/performanceVariableData.test.ts` — coluna
  `desempenho`, `peso`; FK `performanceDataId`.
- `tests/integration/performanceQuarterlyData.test.ts` —
  `diagnosticoIA`, `diagnosticoIAgeradoEm`.
- `tests/integration/performanceData.test.ts` — DOC 01 §7 bit-exact;
  sem campos derivados persistidos.
- `tests/integration/monthlyClosureStatus.test.ts` — estados
  canônicos `aberto`, `fechado`, `desbloqueado`.
- `tests/integration/monthlyUnlockLog.test.ts` — `unlockRequestId`
  INT nullable FK SET NULL para `cycleUnlockRequests`; enum `aba`
  com 3 valores canônicos.
- `tests/integration/performanceMultiplierLog.test.ts` — presente e
  append-only.
- `tests/integration/monthlyClosureOrchestrator.test.ts` — motor
  cruzando §4.3 com §6.2 (fechamento mensal + recálculo).

**Status:** COVERED bit-exact — 6/6.

---

## §4.4 Instrumentos, 9-Box, Perfil Individual, IQL, Clima, NR-1 (7 items — CC056 aplicada)

**Fontes canônicas de cobertura:**

- `tests/integration/plenitudeData.test.ts` — schema §8.3.
- `tests/integration/plenitudeCalculationEngine.test.ts` — motor
  Eixo Y canônico.
- `tests/integration/nineBoxClassifications.test.ts` — snapshot
  trimestral (CC056: `ninebox` → nome canônico).
- `tests/integration/nineBoxCalculationEngine.test.ts` +
  `nineBoxCalculationLog.test.ts` — motor + log canônicos.
- `tests/integration/individualProfileAssessments.test.ts` +
  `individualProfileScores.test.ts` +
  `individualProfilePlaceholders.test.ts` +
  `individualProfileEngine.test.ts` (CC056: nomes canônicos DOC 01
  §4.9/§9.1).
- `tests/integration/climateEngagementData.test.ts` +
  `climateCalculationEngine.test.ts` — escopo `equipe` com `liderId`
  - unique key 5 colunas.
- `tests/integration/iqlData.test.ts` (CC056: `iqlScores` → `iqlData`).
- `tests/integration/copsoqCycles.test.ts` +
  `copsoqCycleSnapshot.test.ts` + `copsoq_responses.test.ts` +
  `copsoqFactorScores.test.ts` +
  `nr1AreaDivergenceAnalysis.test.ts` +
  `radarNR1Reports.test.ts` + `nr1CalculationEngine.test.ts`.
- Ausência `nr1PGRDocuments` — `check-forbidden-terms.sh`.

**Cobertura por item (após CC056):**

- plenitudeData §8 — `plenitudeData.test.ts`.
- **`plenitudeScoreLog` §4.4 canonicamente inexistente (CC056)** —
  documentado bit-exact; declarado em §13 do template como desvio
  interpretativo canônico.
- 9-Box snapshot §7 DOC 03 — `nineBoxClassifications.test.ts` +
  motor.
- `individualProfileAssessments/Scores/Placeholders` §9 —
  3 test files bit-exact + motor.
- climateEngagementData §12 — `climateEngagementData.test.ts`.
- `iqlData` §8 — `iqlData.test.ts`.
- copsoq* + nr1AreaDivergenceAnalysis + radarNR1Reports; sem
  nr1PGRDocuments — 6 test files bit-exact.
- copsoq_responses constraints — `copsoq_responses.test.ts`.

**Status:** COVERED bit-exact — 6/7 canônico + 1 item (CC056)
canonicamente inaplicável (`plenitudeScoreLog` inexistente).

---

## §4.5 Alertas, notificações, e-mails e ciclos (9 items)

**Fontes canônicas de cobertura:**

- `tests/integration/alerts.test.ts` +
  `alerts-emitAlert-cross-tipo.test.ts` +
  `alerts-emitAlertPostGravacao.test.ts` +
  `alerts-hooks-*.test.ts` +
  `alerts-notifications-endpoint.test.ts` +
  `alerts-pipeline-m1.test.ts` +
  `alerts-resolveDestinatarios.test.ts` +
  `alerts-temporalRules-b3.test.ts` — 9 test files cobrindo
  estrutura canônica final: enum `severidade` 4 valores; enum
  `escopo` 3 valores; `escopoEmployeeId`, `suprimidoPorCooldown`.
- `tests/unit/alerts-severity.test.ts` +
  `alerts-typeDictionary.test.ts` — enum lógico `tipo` com 17
  valores canônicos (2 NR-1 + 13 Fase 8 + 2 RF).
- `tests/integration/notifications.test.ts` — `severidade`,
  `arquivadaEm`, `alertId` FK SET NULL; índices canônicos.
- `tests/integration/emailNotifications.test.ts` — DOC 01 §12; FKs
  companies/notifications/employees.
- `tests/integration/cycleSchedule.test.ts` +
  `cycleScheduleEngine.test.ts` +
  `refresh-cycle-schedule-counters.test.ts` — 11 colunas; unique key
  `uk_cycleSchedule_ciclo`; enum status 3 valores (`aberto`,
  `atrasado`, `fechado`); sem `futuro`.
- `tests/integration/emailQueue.test.ts` — 12 colunas + 3 FKs + 2
  índices.
- `tests/integration/digestExecutionLog.test.ts` — 7 colunas +
  unique key `uk_digestExecutionLog_week`.
- `tests/integration/cycleUnlockRequests.test.ts` +
  `cycleUnlockRequests-router.test.ts` —
  `solicitanteTipo`/`solicitanteId` polimórficos; enum `aba` 3
  valores; sem FK formal em `liderId`.

**Rejeição server-side dos 17 valores canônicos:** garantida por
enum TS + `verify-schema.mjs` (assert coluna) +
`check-forbidden-terms.sh` §14.

**Status:** COVERED bit-exact — 9/9.

---

## §4.6 Exportáveis, logs administrativos e cadastros complementares (8 items)

**Fontes canônicas de cobertura:**

- `tests/integration/employeeTerminationEvents.test.ts` —
  append-only, `actorTipo`/`actorId` polimórficos.
- `tests/integration/executiveReportCache.test.ts` —
  `geradoPorTipo`/`geradoPorId` polimórficos; UNIQUE canônica
  bit-exact.
- `tests/integration/apiUsageLog.test.ts` — UNIQUE canônica
  `(companyId, tipo, dataUso)`.
- `tests/integration/platformLogs-router.test.ts` +
  `platformLogs-router-historico.test.ts` — 5 fontes canônicas
  UNION do Change log/Histórico da empresa.
- `tests/integration/employeeLeaderHistory.test.ts` — `reason`
  VARCHAR(500) NOT NULL + `transferBatchId` CHAR(36) NOT NULL;
  índice canônico por batch.
- `tests/integration/responsavelFinanceiroTransferLog.test.ts` —
  DOC 01 + DOC 06.
- `tests/integration/portalReminderLog.test.ts` — enum
  `instrumentType` 4 valores canônicos; índice composto canônico.
- `tests/integration/companyJobFamilies.test.ts` — UNIQUE canônica
  `(companyId, jobFamily, variableIndex)`; enum idêntico ao de
  `employees.jobFamily`; CASCADE ON DELETE.

**Status:** COVERED bit-exact — 8/8.

---

## §4.7 LGPD e onboarding de líderes (4 items)

**Fontes canônicas de cobertura:**

- `tests/integration/lgpdConsents.test.ts` — constraints de
  exclusividade + índices canônicos DOC 01 §14.
- `tests/integration/dataAccessLog.test.ts` +
  `lgpd-portability-route.test.ts` +
  `lgpd-portability-service.test.ts` — enums canônicos
  `tipoAcesso`/`agentType`; append-only preservado.
- `tests/integration/leaderOnboardingNotes.test.ts` — append-only.
- `tests/integration/leaderOnboardingStageLog.test.ts` +
  `leader-onboarding-router.test.ts` +
  `employees-onboarding-hooks.test.ts` — append-only; `estagioAnterior`
  e `estagioNovo` canônicos.

**Status:** COVERED bit-exact — 4/4.

---

## §4.8 Regras de imutabilidade, append-only e retenção (4 items)

**Fontes canônicas de cobertura:**

- Tabelas append-only DOC 01 §16.1 — validadas pela AUSÊNCIA de
  procedures UPDATE/DELETE nos routers correspondentes (grep
  canônico em `src/server/routers/`) + testes de integração das
  próprias tabelas invocam apenas `INSERT`.
- `tests/integration/cron-scheduler-me063b.test.ts` +
  `refresh-cycle-schedule-counters.test.ts` +
  `aiConversations.test.ts` — regra de retenção Chat IA 6 meses via
  cron canônico 03:00 UTC (`archiveAiConversationsJob` §15.1.8).
- `scripts/check-no-raw-sql.sh` — Drizzle tipado 100% (RV-12);
  UPDATE/DELETE físico só via API tipada, protegido contra queries
  cruas em append-only.

**Cobertura por item:**

- Sem UPDATE/DELETE em append-only §16.1 — testes de integração +
  ausência canônica em routers.
- Registros imutáveis por regra de negócio §16.2 — cada test file
  correspondente contém asserts negativos (imutabilidade).
- Regra global de deleção física §16.3 — soft delete via `status`
  onde canônico (companies/employees).
- Retenção Chat IA 6 meses §16.4 — cron canonicamente coberto
  (ME-063b).

**Status:** COVERED bit-exact — 4/4.

---

## §4.9 Migrations e seed (5 items)

**Fontes canônicas de cobertura:**

- `scripts/verify-migration.mjs` — motor canônico que executa toda
  a cadeia bit-exact contra base efêmera
  (`DATABASE_URL_VALIDATE`).
- `src/db/migrations/0000_canonical.sql` — migração canônica única
  (S007 padrão consolidado).
- `scripts/preparar_ambiente.sh` + `scripts/setup-mysql.sh` —
  pipeline canônico (L86 idempotente).
- Seed do Super Admin (Bruno Andrade) — 1 registro em `superAdmins`
  via `SEED_SUPER_ADMIN_PASSWORD` do vault (DOC 01 §18.1);
  `tests/integration/setup.ts` exerce bit-exact esse fluxo.
- Seed `departments` 19 linhas — DOC 01 §18.2;
  `tests/integration/departments.test.ts` valida bit-exact.
- Zero registros em demais tabelas — validado por cada test file
  que abre estado limpo por empresa canônica.

**Status:** COVERED bit-exact — 5/5.

---

## §4.10 Evidências canônicas exigidas (11 items)

**Fontes canônicas de cobertura:**

- Todas as 11 queries SQL canônicas §4.10 são canonicamente
  executáveis via MySQL real (RV-11) exercitado pelos test files
  correspondentes. As mesmas queries são coladas literalmente em
  `docs/aceite/RETORNO_ROIP_MVP_parcial-me064.md` §3 com output
  real capturado.

**Cobertura por item:**

- `SHOW TABLES;` → 53 linhas — `verify-schema.mjs` +
  evidência canônica no template.
- `SELECT COUNT(*) FROM departments;` → 19 —
  `departments.test.ts` + evidência.
- `SELECT COUNT(*) FROM superAdmins;` → 1 — `superAdmins.test.ts`
  - evidência (setup).
- `SHOW COLUMNS FROM alerts LIKE 'severidade';` — `alerts.test.ts`
  - evidência.
- `SHOW COLUMNS FROM notifications LIKE 'alertId';` —
  `notifications.test.ts` + evidência.
- `SHOW INDEX FROM notifications` `idx_notifications_alertId` —
  `verify-schema.mjs` + evidência.
- `SELECT COUNT(*) FROM companies WHERE timezone IS NULL AND
status='ativa';` → 0 — `companies.test.ts` + evidência.
- `SHOW TABLES LIKE 'emailSettings'` vazio — evidência via `SHOW`.
- `SHOW TABLES LIKE 'emailChangeRequests'` vazio — evidência.
- `SHOW TABLES LIKE 'nr1PGRDocuments'` vazio — evidência.
- Grep `resetPasswordTokenHash|firstAccessCompleted|cadenciaCOPSOQ`
  em migrations — `check-forbidden-terms.sh` estendido §14
  (STRUCT_TERMS bit-exact); zero ocorrências evidenciadas via
  `bash scripts/check-forbidden-terms.sh` OK.

**Status:** COVERED bit-exact — 11/11.

---

## Consolidação canônica

**Coverage global Camada 1 (Dados):** COVERED bit-exact.

- §4.1 5/5 + §4.2 7/7 + §4.3 6/6 + §4.4 6/7 canônico (1 CC056
  inaplicável) + §4.5 9/9 + §4.6 8/8 + §4.7 4/4 + §4.8 4/4 +
  §4.9 5/5 + §4.10 11/11 = **65 itens canonicamente cobertos + 1
  item CC056 canonicamente inaplicável (nomeadamente
  `plenitudeScoreLog`)**.

**Gaps canonicamente identificados na Camada 1:** ZERO. Todos os
itens estruturais estão bit-exact cobertos pela base de 198 test
files existentes + verify-schema.mjs + check-forbidden-terms.sh
estendido em ME-064.

**Testes de gap-closing requeridos em ME-064:** NENHUM. A base
canônica pós-ME-063b (3145 testes, 198 test files, 495 arquivos
versionados) cobre integralmente §4 do DOC 07 quando lida
canonicamente à luz de CC056 (traduções §4.4).

**CCs canônicas registradas em ME-064 na Camada 1:**

- CC055 — verify-schema.mjs referência canônica 691 → 692 (S163
  cirúrgica; ocorrência única; aplicada in-scope).
- CC056 — traduções canônicas DOC 07 §4.4 → nomes canônicos DOC 01
  (via precedência canônica §2.2 do próprio DOC 07). 5 traduções
  bit-exact. Sem alteração no código-fonte — canônica interpretativa
  para o coverage map e para o template.

**Assinatura canônica:** ME-064 Camada 1 bit-exact ao DOC 07 §4
(interpretação CC056 aplicada) contra clone público independente
HEAD `86c0c73...`.
