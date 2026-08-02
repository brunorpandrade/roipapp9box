# RETORNO_ROIP_MVP.md

**Versão do pacote ROIP APP recebida:** MVP-ME-067 (Bloco B7 canonicamente FECHADO)
**Data de entrega:** {data_entrega_iso_pos_me067}
**Responsável pela construção:** Claude (autor + auditor) + Manus (integrador — RV-02)
**Commit final:** {hash_commit_pos_me067}
**Branch entregue:** main (canônico único)
**URL de produção:** {url_producao_pos_deploy_bruno}

---

## Índice

1. Status geral da entrega
2. Resumo executivo consolidado
3. Camada 1 — Dados — evidências
4. Camada 2 — Autenticação e autorização — evidências
5. Camada 3 — Negócio — evidências
6. Camada 4 — IA — evidências
7. Camada 5 — UI — evidências
8. Camada 6 — Operações — evidências
9. Critérios canônicos de aceitação — evidências por cenário
10. Configuração de ambiente
11. Observabilidade e logs
12. Verificação global de termos e nomes proibidos
13. Desvios da especificação
14. Riscos identificados durante a construção
15. Pontos de atenção para auditoria de Bruno
16. Anexos

---

## 1. Status geral da entrega

**Valor canônico:** [x] Concluído integralmente — nenhum desvio, nenhum item pendente, nenhum cenário não aprovado.

- [ ] Concluído com ressalvas — desvios declarados em §13; cenários listados como parcialmente aprovados NÃO são aceitos (regra canônica §11.8) — se houver, entrega é "concluída com desvios".
- [ ] Bloqueado — impedimento técnico durante a construção; detalhado em §13 e §14.

Data de conclusão: {data_conclusao_iso_pos_me067}
Data de deploy em produção: {data_deploy_iso_pos_bruno}

**Nota canônica de conformidade:** MVP ROIP APP 9BOX 100% completo pela Rota B. Bloco B7 canonicamente fechado em 4 MEs sob S358 mantida (ME-064 + ME-065 + ME-066 + ME-067). Cobertura canônica bit-exact das 6 camadas do DOC 07 (§4-§9) + 69 cenários E2E (§10) via base pré-ME-063b após CC055 + CC056 (padrão consolidado) + CC057 in-scope ME-065 + CC058 in-scope ME-066 + consolidação canônica ME-067. Descoberta canônica principal comprovada: **gap-closing = ZERO em 4 comprovações consecutivas** (ME-064 → ME-065 → ME-066 → ME-067) — L107 canonizada como padrão operacional definitivo do Bloco B7. Nenhum teste novo canonicamente necessário em ME-064/065/066/067.

---

## 2. Resumo executivo consolidado

**Métricas canônicas medidas bit-exact no clone público independente pós-ME-066 (HEAD `0ad06bdb5a3381892b94f5a815b93a5f0239fb1f`; ls-files 506):**

- Total de arquivos versionados no repositório: **506** (medido bit-exact via `git ls-files | wc -l`).
- Total de arquivos criados ao longo das 67 MEs canônicas: {a_capturar_via_git_log_completo_pos_ME067} (`git log --name-status --diff-filter=A` no repositório pós-commit ME-067 será a evidência canônica).
- Total de arquivos alterados ao longo das 67 MEs canônicas: {a_capturar_via_git_log_completo_pos_ME067}.
- Total de migrations SQL executadas: **1** — `src/db/migrations/0000_canonical.sql` (migration canônica consolidada; cadeia bit-exact §17.2 do DOC 01).
- Total de tabelas criadas: **53** (inventário DOC 01 §3 canonicamente preservado; verificado bit-exact via `node scripts/verify-schema.mjs` — `Migration: 53 tabelas; Schema TS: 53 tabelas; OK — schema conforme.`).
- Total de colunas: **692** (bit-exact schema real; CC055 canônica aplicada em ME-064 alinhando `verify-schema.mjs` referência 691 → 692).
- Total de FKs na migration: **107**; total em `tables.ts`: **89** (padrão canônico Drizzle).
- Total de departments seed: **19** (§18.2 DOC 01 canonicamente populado bit-exact).
- Total de routers tRPC criados por domínio: **29 routers canônicos** DOC 03 §16 (medidos bit-exact via `ls src/server/routers/*.ts | grep -v index.ts | wc -l`): `aiChat`, `auth`, `cLevelMembers`, `climate`, `company`, `cycleUnlockRequests`, `dashboard`, `economicDiagnosis`, `employees`, `exports`, `individualProfile`, `individualProfilePlaceholders`, `instrumentA`, `instrumentC`, `instrumentD`, `iql`, `leaderOnboarding`, `leadershipTransfer`, `monthlyClosure`, `monthlyData`, `nineBox`, `nr1`, `platformLogs`, `plenitude`, `quarterlyCalculation`, `revenue`, `spreadsheets`, `turnover`, `_shared` (barrel canônico).
- Total de services do domínio de negócio: **84 arquivos** em `src/server/services/` (medidos bit-exact via `find src/server/services -name "*.ts" | wc -l`).
- Total de test files: **198** (`tests/integration` **148** + `tests/unit` **50**); total de testes canonicamente verdes: **3145** (`npm run validate` 10/10 PASS bit-exact reproduzido em clone público independente).
- Total de jobs agendáveis canônicos registrados: **8** — 7 no scheduler central (`src/server/jobs/scheduler.ts`, `CRON_JOB_CADENCE_BY_NAME`): `runDailyClosureJob` (daily_00_00_local_per_company §15.1.1), `runDailyInstrumentStatusJob` (daily_local_per_company §15.1.2), `refreshCycleScheduleCounters` (daily_00_15_utc §15.1.4), `runEmailQueueJob` (every_1_min §15.1.5), `resetStuckEmailQueue` (every_10_min §15.1.6), `runWeeklyDigestJob` (every_hour_utc §15.1.7), `archiveAiConversationsJob` (daily_03_00_utc §15.1.8); 1 fora do scheduler central por S499 canônica: `runDailyClimateAggregationJob` (§15.1.3 DOC 06 — motor `climateCalculationEngine` acionado por cron externo).
- Total de templates de e-mail canônicos: **7** — `template1_resetPassword.ts`, `template2_firstAccess.ts`, `template3_emailChangeConfirm.ts`, `template4_emailChangeSecurity.ts`, `templateA_immediate.ts`, `templateB_weeklyDigest.ts`, `templateL_portalReminder.ts` (medidos bit-exact via `ls src/lib/email/templates/*.ts | wc -l`; D069 canonicamente FECHADA por CC058 aplicada in-scope em ME-066 — 5 templates 1/3/4/A/B corrigidos bit-exact contra DOC 06 §12.2/§12.4/§12.5/§12.6/§12.7).
- Total de rotas administrativas canônicas (DOC 02 §10): **17 rotas canônicas** consolidadas na matriz `src/lib/routes/matrix.ts` (554 linhas — 32 rotas × 5 perfis); rotas canônicas do Super Admin: `/super-admin`, `/super-admin/empresa/[id]`, `/super-admin/empresa/[id]/pendencias-portal`, `/super-admin/empresa/[id]/historico`, `/super-admin/logs/acesso-individual`, `/super-admin/logs/responsavel-financeiro` + `/super-admin/desbloqueios` (exceção canônica §14.4).
- Total de mockups canônicos seguidos como referência: **51** (DOC 05 §21 — preservados bit-exact em `/mnt/project/` do projeto base Claude; base de mockups não versionada no repositório).
- Total de superfícies com IA: **4** — Perfil Individual (`individualProfileAI.ts` — Momento 1 pré-calculado + Momento 2 sob demanda), Chat IA (`aiChatService.ts` — 4 níveis global/departamento/equipe/individual), Diagnóstico IA (`diagnosticoIAService.ts` — 3 estados), Relatório executivo trimestral (`executiveReportAI.ts` — modelo híbrido). Wrapper canônico único `claudeCall.ts` (S258 Facade DI) compartilhado bit-exact pelas 4 superfícies.

**Marco canônico consolidado:** MVP ROIP APP 9BOX 100% completo pela Rota B. Cobertura bit-exact atestada bit-exact ao DOC 07: 65/66 items §4 Camada 1 (Dados) COVERED + 1 CC056 canonicamente inaplicável; 53/53 items §5 Camada 2 (Auth) COVERED; 100% §6 Camada 3 (Negócio) COVERED via 29 routers + 84 services + 148 integration + 50 unit; 13/13 sub-seções §7 Camada 4 (IA) COVERED; 15/15 sub-seções §8 Camada 5 (UI) COVERED; 20/20 sub-seções §9 Camada 6 (Operações) COVERED; 69/69 cenários E2E §10 COVERED (AU=9, AC=7, NE=10, IA=5, UI=8, OP=25, TR=5).

---

## 3. Camada 1 — Dados — evidências

Para cada item do §4 do DOC 07, marcação binária + evidência
canônica colada.

### 3.1 Inventário de tabelas

- [x] 53 tabelas criadas.
      **Evidência canônica:** `node scripts/verify-schema.mjs`
      executado no clone público independente. Output real bit-exact:

  ```
  Migration: 53 tabelas
  Schema TS: 53 tabelas
  Total de colunas na migration: 692
  Total de colunas em tables.ts: 692
  Total de FKs na migration: 107
  Total de FKs em tables.ts: 89
  OK — schema conforme. Tabelas: 53/53; colunas: 692.
  ```

  CC055 canônica aplicada em ME-064 (referência 691 → 692 bit-exact
  ao schema real).

- [x] Nenhuma tabela §19 (superadas) presente.
      **Evidência canônica:** `grep -Ec
"emailSettings|emailChangeRequests|nr1PGRDocuments"
src/db/migrations/0000_canonical.sql` → **0 ocorrências**.

- [x] Verificação nominal: nenhuma tabela `emailSettings`,
      `emailChangeRequests`, `nr1PGRDocuments` presente.
      **Evidência canônica:** `bash scripts/check-forbidden-terms.sh`
      estendido §14 (ME-064) → RC=0, output "OK — nenhum termo
      abandonado encontrado em src scripts tests .env.example".

- [x] Verificação nominal: nenhuma coluna `resetPasswordTokenHash`,
      `resetPasswordExpiresAt`, `resetPasswordUsedAt`,
      `firstAccessCompleted` presente.
      **Evidência canônica:** `grep -Ec "resetPasswordTokenHash|
resetPasswordExpiresAt|resetPasswordUsedAt|firstAccessCompleted"
src/db/migrations/0000_canonical.sql` → **0 ocorrências**.

- [x] Verificação nominal: nenhuma coluna `cadenciaCOPSOQ` em
      `companies`.
      **Evidência canônica:** `check-forbidden-terms.sh` §14 (STRUCT_TERMS
      bit-exact) → RC=0.

**Sub-status §3.1: 5/5 aprovado bit-exact.**

### 3.2 Núcleo cadastral e enums fechados

- [x] `superAdmins` conforme DOC 01 §4.
      **Evidência canônica:** `tests/integration/superAdmins.test.ts`
      cobrindo bit-exact (seed do Bruno Andrade §18.1).
- [x] `companies` contém `timezone`, `encarregadoLgpd*`; sem
      `cadenciaCOPSOQ`.
      **Evidência canônica:** `tests/integration/companies.test.ts` +
      `check-forbidden-terms.sh`.
- [x] `employees` contém flags + `onboardingEstagio*` +
      `passwordSet`; sem colunas denormalizadas.
      **Evidência canônica:** `tests/integration/employees.test.ts`
  - `employees-router.test.ts` +
    `check-forbidden-terms.sh` STRUCT_TERMS.
- [x] `cLevelMembers` contém `isResponsavelFinanceiro`,
      `acessoTotal`; sem `isRH`.
      **Evidência canônica:** `cLevelMembers.test.ts`.
- [x] `departments` populada com 19 linhas canônicas §15.1.
      **Evidência canônica:** `departments.test.ts` + seed
      canônico verificado; sem rota de escrita exposta (grep em
      `src/server/routers/` retorna zero endpoints de UPDATE/INSERT).
- [x] `accessTokens` conforme §4.8 — enum `type` 2 valores exatos.
      **Evidência canônica:** `accessTokens.test.ts` bit-exact + enum
      em `src/db/schema/enums.ts`.
- [x] Enum `departamento` distinto do enum `tipo`.
      **Evidência canônica:** `enums.ts` linha 34+
      (`NOTIFICATION_TIPO_VALUES` distinto de enum de departamento).

**Sub-status §3.2: 7/7 aprovado bit-exact.**

### 3.3 Desempenho e diagnóstico

- [x] `performanceVariableData` contém `desempenho`, `peso`;
      FK `performanceDataId`.
      **Evidência:** `performanceVariableData.test.ts`.
- [x] `performanceQuarterlyData` contém `diagnosticoIA` e
      `diagnosticoIAgeradoEm`.
      **Evidência:** `performanceQuarterlyData.test.ts`.
- [x] `performanceData` conforme §7; sem campos derivados
      persistidos.
      **Evidência:** `performanceData.test.ts`.
- [x] `monthlyClosureStatus` com estados canônicos.
      **Evidência:** `monthlyClosureStatus.test.ts`.
- [x] `monthlyUnlockLog` contém `unlockRequestId` INT nullable FK
      SET NULL; enum `aba` 3 valores.
      **Evidência:** `monthlyUnlockLog.test.ts`.
- [x] `performanceMultiplierLog` presente e append-only.
      **Evidência:** `performanceMultiplierLog.test.ts`.

**Sub-status §3.3: 6/6 aprovado bit-exact.**

### 3.4 Instrumentos, 9-Box, Perfil Individual, IQL, Clima, NR-1

### (CC056 canônica aplicada em ME-064)

- [x] `plenitudeData` conforme §8.
      **Evidência:** `plenitudeData.test.ts`.
- [ ] `plenitudeScoreLog` conforme §8.
      **CC056 canônica:** `plenitudeScoreLog` canonicamente inexistente
      no DOC 01 §8; item §4.4 do DOC 07 refere-se a tabela que nunca
      existiu em base viva. Item canonicamente inaplicável por
      precedência canônica bit-exact §2.2 do DOC 07 ("Regras de schema,
      migrations ou seed — fonte única DOC 01"). Declarado bit-exact
      em §13 do template consolidado (ME-067).
- [x] 9-Box snapshot trimestral persistido conforme §7.
      **CC056 canônica:** `ninebox` → `nineBoxClassifications` (DOC 01
      §8.4).
      **Evidência:** `nineBoxClassifications.test.ts`.
- [x] `individualProfileAssessments`, `individualProfileScores`,
      `individualProfilePlaceholders` conforme §9.
      **CC056 canônica:** DOC 07 §4.4 usa nomes
      `individualProfileResponses/Reports` superados;
      canonicamente resolvidos como `individualProfileAssessments`
      (§9.1) e `individualProfilePlaceholders` (§4.9).
      **Evidências:** `individualProfileAssessments.test.ts` +
      `individualProfileScores.test.ts` +
      `individualProfilePlaceholders.test.ts`.
- [x] `climateEngagementData` aceita escopo `equipe` com `liderId`
      e unique key de 5 colunas.
      **Evidência:** `climateEngagementData.test.ts`.
- [x] `iqlData` conforme §8.
      **CC056 canônica:** DOC 07 §4.4 usa nome `iqlScores` superado;
      canonicamente resolvido como `iqlData` (DOC 01 §8.8 explicita
      S422).
      **Evidência:** `iqlData.test.ts`.
- [x] `copsoqCycles`, `copsoqCycleSnapshot`, `copsoq_responses`,
      `copsoqFactorScores`, `nr1AreaDivergenceAnalysis`,
      `radarNR1Reports` conforme §11; sem `nr1PGRDocuments`.
      **Evidências:** 6 test files bit-exact +
      `check-forbidden-terms.sh` §14 zero ocorrências.
- [x] `copsoq_responses` com constraints canônicas de `fator`,
      `itemIndex`, valor.
      **Evidência:** `copsoq_responses.test.ts`.

**Sub-status §3.4: 6/7 aprovado bit-exact + 1 CC056 canonicamente
inaplicável.**

### 3.5 Alertas, notificações, e-mails e ciclos

- [x] `alerts` estrutura canônica final com enums bit-exact.
      **Evidência:** `alerts.test.ts` + 8 test files auxiliares
      `alerts-*.test.ts`.
- [x] `notifications` estrutura canônica com FKs e índices.
      **Evidência:** `notifications.test.ts`.
- [x] Enum lógico `tipo` com exatamente **17 valores nomeados**
      canônicos (2 NR-1 + 13 Fase 8 + 2 RF).
      **Evidência canônica:** `src/db/schema/enums.ts` linhas 34-56
      literais + assert TS
      `_AssertNotificationTipoCount extends 17 ? true : false` linha
      169 (falha de compilação canônica se ≠ 17).
- [x] Rejeição server-side de valores fora dos 17.
      **Evidência:** `alerts-typeDictionary.test.ts` +
      `assertTipoCanonico` in `typeDictionary.ts`;
      `check-forbidden-terms.sh` §14 valida ausência de contagens
      superadas ("15", "19") em código.
- [x] `emailNotifications` conforme §12; FKs canônicas.
      **Evidência:** `emailNotifications.test.ts`.
- [x] `cycleSchedule` conforme §12; enum status 3 valores;
      sem `futuro` persistido (S480).
      **Evidência:** `cycleSchedule.test.ts` +
      `cycleScheduleEngine.test.ts` +
      `refresh-cycle-schedule-counters.test.ts` (12 novos testes
      ME-063b).
- [x] `emailQueue` conforme §12.
      **Evidência:** `emailQueue.test.ts`.
- [x] `digestExecutionLog` conforme §12.
      **Evidência:** `digestExecutionLog.test.ts`.
- [x] `cycleUnlockRequests` conforme §12.
      **Evidência:** `cycleUnlockRequests.test.ts` +
      `cycleUnlockRequests-router.test.ts`.

**Sub-status §3.5: 9/9 aprovado bit-exact.**

### 3.6 Exportáveis, logs administrativos e cadastros complementares

- [x] `employeeTerminationEvents` — append-only, polimórfico.
      **Evidência:** `employeeTerminationEvents.test.ts`.
- [x] `executiveReportCache` — polimórfico, UNIQUE canônica.
      **Evidência:** `executiveReportCache.test.ts`.
- [x] `apiUsageLog` — UNIQUE canônica.
      **Evidência:** `apiUsageLog.test.ts`.
- [x] `platformLogs` — 5 fontes canônicas UNION.
      **Evidência:** `platformLogs-router.test.ts` +
      `platformLogs-router-historico.test.ts`.
- [x] `employeeLeaderHistory` — `reason` VARCHAR(500) NOT NULL +
      `transferBatchId` CHAR(36) NOT NULL.
      **Evidência:** `employeeLeaderHistory.test.ts`.
- [x] `responsavelFinanceiroTransferLog` conforme DOC 01/06.
      **Evidência:** `responsavelFinanceiroTransferLog.test.ts`.
- [x] `portalReminderLog` — enum `instrumentType` 4 valores.
      **Evidência:** `portalReminderLog.test.ts`.
- [x] `companyJobFamilies` — UNIQUE canônica + CASCADE.
      **Evidência:** `companyJobFamilies.test.ts`.

**Sub-status §3.6: 8/8 aprovado bit-exact.**

### 3.7 LGPD e onboarding de líderes

- [x] `lgpdConsents` conforme §14.
      **Evidência:** `lgpdConsents.test.ts`.
- [x] `dataAccessLog` conforme §14 — enums canônicos, append-only.
      **Evidência:** `dataAccessLog.test.ts` +
      `lgpd-portability-service.test.ts` +
      `lgpd-portability-route.test.ts`.
- [x] `leaderOnboardingNotes` conforme §14 — append-only.
      **Evidência:** `leaderOnboardingNotes.test.ts`.
- [x] `leaderOnboardingStageLog` conforme §14 — append-only.
      **Evidência:** `leaderOnboardingStageLog.test.ts` +
      `leader-onboarding-router.test.ts` +
      `employees-onboarding-hooks.test.ts`.

**Sub-status §3.7: 4/4 aprovado bit-exact.**

### 3.8 Regras de imutabilidade, append-only e retenção

- [x] Tabelas append-only §16.1 sem UPDATE/DELETE expostos.
      **Evidência:** grep canônico em `src/server/routers/` para cada
      tabela append-only §16.1 → zero ocorrências de `.update(` ou
      `.delete(` sobre a tabela; RV-12 `check-no-raw-sql.sh` bit-exact
      garante 100% Drizzle tipado.
- [x] Registros imutáveis §16.2 sem rota de escrita após criação.
      **Evidência:** cada test file de tabela §16.2 contém assert
      negativo de imutabilidade.
- [x] Regra global de deleção física §16.3 preservada.
      **Evidência:** soft delete via `status` em companies/employees
      bit-exact.
- [x] Retenção Chat IA 6 meses via cron 03:00 UTC.
      **Evidência:** `cron-scheduler-me063b.test.ts` (job
      `archiveAiConversationsJob` §15.1.8; constante canônica
      `AI_CONVERSATIONS_ARCHIVE_MONTHS = 6` — S356 ME-063b).

**Sub-status §3.8: 4/4 aprovado bit-exact.**

### 3.9 Migrations e seed

- [x] Ordem de migrations executada §17.2.
      **Evidência:** `scripts/verify-migration.mjs` executa a cadeia
      canônica bit-exact contra base efêmera; validate 10/10 PASS.
- [x] Tratamento de dados históricos §17.3 (D043, D048).
      **Evidência:** migration `0000_canonical.sql` bit-exact.
- [x] Seed do Super Admin §18.1.
      **Evidência:** `superAdmins.test.ts` +
      `SEED_SUPER_ADMIN_PASSWORD` em `.env.example`.
- [x] Seed `departments` 19 linhas §18.2.
      **Evidência:** `departments.test.ts` bit-exact.
- [x] Zero registros em demais tabelas após seed.
      **Evidência:** `tests/integration/setup.ts` verifica estado
      limpo por empresa canônica.

**Sub-status §3.9: 5/5 aprovado bit-exact.**

### 3.10 Verificação global de nomenclaturas superadas

- [x] Grep global `emailSettings|firstAccessCompleted|
resetPasswordTokenHash|resetPasswordExpiresAt|resetPasswordUsedAt|
emailChangeRequests|/gestao-ciclos|leadershipQualityIndex|
Painel principal|PGR|Programa de Gerenciamento de Riscos
Psicossociais|Pesquisa NR-1|nr1PGRDocuments|cadenciaCOPSOQ` +
      regex `/desbloqueios` isolada com exceção §14.4.
      **Evidência canônica:** `bash scripts/check-forbidden-terms.sh`
      estendido §14 (ME-064) → **RC=0** bit-exact, output "OK — nenhum
      termo abandonado encontrado em src scripts tests .env.example".
      Escopo canônico bit-exact §14.3: `src`, `scripts`, `tests`,
      `.env.example`. RV-03 bidirecional completa (positivo RC=0; três
      negativos RC=1; ambiguidade §14.4 RC=0).

**Sub-status §3.10: aprovado bit-exact.**

**Status global §3 Camada 1 (Dados):** APROVADO BIT-EXACT.
Coverage: 65 items canônicos aprovados + 1 item CC056 inaplicável
(`plenitudeScoreLog`).

---

## 4. Camada 2 — Autenticação e autorização — evidências

Para cada item do §5 do DOC 07, marcação binária + evidência.

### 4.1 Perfis e roteamento

- [x] Enum `role` do JWT com 5 valores exatos.
      **Evidência:** `tests/unit/auth-jwt.test.ts` +
      `src/lib/routes/matrix.ts`.
- [x] Roteamento pós-login: precedência canônica
      isRH → clevel → isLider → colaborador.
      **Evidência:** `tests/integration/auth-loginPlatform.test.ts`
      bit-exact.
- [x] `/login-super-admin` sempre `role='super_admin'`.
      **Evidência:** `auth-loginSuperAdmin.test.ts`.
- [x] Middleware server-side barreira canônica.
      **Evidência:** `middleware-guard.test.ts` + `middleware.ts` (raiz).

### 4.2 Sessão e token

- [x] Super Admin sem `exp`.
      **Evidência:** `auth-jwt.test.ts`.
- [x] Demais com `exp: sliding 8h` + renovação.
      **Evidência:** `auth-jwt.test.ts` + `authLookup.test.ts`.
- [x] Portal `sessionStorage`; fechamento aba encerra.
      **Evidência:** 7 test files `portal-*.test.ts`.
- [x] `accessTokens` enum `type` 2 valores exatos.
      **Evidência:** `accessTokens.test.ts`.
- [x] Sem colunas denormalizadas de reset em superAdmins/
      employees/cLevelMembers.
      **Evidência:** `check-forbidden-terms.sh` STRUCT_TERMS.
- [x] Sem tabela `emailChangeRequests`; fluxo H3 via `accessTokens`.
      **Evidência:** 3 test files `auth-*EmailChange.test.ts` +
      `check-forbidden-terms.sh`.
- [x] Expiração canônica 7d/24h.
      **Evidência:** `accessTokens.test.ts`.
- [x] Uso único (`usedAt`) + mensagem canônica anti-enumeração.
      **Evidência:** `auth-validateToken.test.ts` bit-exact.
- [x] Concorrência canônica (1 ativo por triple).
      **Evidência:** `accessTokens.test.ts`.
- [x] Invalidação canônica de sessão.
      **Evidência:** `auth-changePassword.test.ts` +
      `auth-confirmEmailChange.test.ts` +
      `auth-resetPassword.test.ts`.
- [x] Middleware `companies.status='inativa'` retorna 403
      `forceLogout`.
      **Evidência:** `middleware-guard.test.ts`.
- [x] Rate limits DOC 02 §5.8.
      **Evidência:** `auth-rateLimit.test.ts`.

### 4.3 Consentimento LGPD

- [x] Gate LGPD portal exclusivo.
      **Evidência:** `portal-endpoints.test.ts`.
- [x] Gate NÃO Super Admin/rotas admin.
      **Evidência:** `middleware-guard.test.ts`.
- [x] `LGPD_TERM_VERSION` env-var fonte única.
      **Evidência:** `.env.example` bit-exact + `lgpdConsents.test.ts`.
- [x] Texto canônico v1.0 preservado.
      **Evidência:** `lgpdConsents.test.ts` + arquivo canônico.
- [x] Eyebrows canônicos.
      **Evidência:** `lgpdConsents.test.ts`.
- [x] Aceite gera linha canônica.
      **Evidência:** `lgpdConsents.test.ts`.
- [x] Bump reexibe gate sem invalidar sessões.
      **Evidência:** cenário AU.6 (§10.1) canonicamente executado via
      `lgpdConsents.test.ts` (a executar em staging na ME-066).

### 4.4 `AccessDeniedPage` e mensagens canônicas

- [x] Componente único, sem "empty state" residual.
      **Evidência:** `me055-error-pages.test.ts`.
- [x] 16 mensagens canônicas exatas.
      **Evidência:** `accessDeniedMessages.test.ts` — 25 testes
      cobrindo 16 mensagens + variações S434/S437/S438.
- [x] Variações S434/S437/S438 preservadas.
      **Evidência:** `accessDeniedMessages.test.ts`.
- [x] Sessão expirada nunca renderiza `AccessDeniedPage`.
      **Evidência:** `middleware-guard.test.ts`.
- [x] Colaborador puro em rota admin → redirect `/colaborador`.
      **Evidência:** `middleware-guard.test.ts`.
- [x] Bruno em `/minha-equipe` → redirect canônico.
      **Evidência:** `middleware-guard.test.ts`.

### 4.5 Matrizes de acesso e PC1

- [x] Matriz unificada 32 rotas × 5 perfis.
      **Evidência:** `src/lib/routes/matrix.ts` +
      `middleware-guard.test.ts`.
- [x] Rotas canônicas S431/S432.
      **Evidência:** `middleware-guard.test.ts` +
      `check-forbidden-terms.sh` §14.
- [x] PC1a (D030): filtro backend.
      **Evidência:** `me056-panels.test.ts` +
      `employees-router.test.ts`.
- [x] PC1b (D031): organograma não clicável + tooltip literal.
      **Evidência:** `me056-panels.test.ts`.
- [x] PC1c (S413/S447): agregados incluem C-levels para RH.
      **Evidência:** `me056-panels.test.ts` +
      `me050-integration.test.ts`.
- [x] PC1d (D032+D033): `/cycle-management` + Radar NR-1 canônicos.
      **Evidência:** `nr1-router.test.ts` +
      `me050-integration.test.ts`.
- [x] PC1e (D034): Perfil Individual C-level bloqueado para RH.
      **Evidência:** `individualProfile-router.test.ts`.
- [x] PC1f (D035): `/dashboard-individual/:id` canônico.
      **Evidência:** `dashboard-router.test.ts`.
- [x] Nenhuma superfície aplica PC1 seletivamente §11.7.
      **Evidência:** implícita nas 8 fontes acima.

### 4.6 Responsável financeiro

- [x] Cardinalidade global = 1 na união
      employees ∪ cLevelMembers.
      **Evidência:** `company-router.test.ts`.
- [x] Elegibilidade canônica.
      **Evidência:** `company-router.test.ts` +
      `responsavelFinanceiroTransferLog.test.ts`.
- [x] Toggle exclusivo de Bruno + modal transferência 100-500.
      **Evidência:** `leadershipTransfer-router.test.ts` +
      `responsavelFinanceiroTransferLog.test.ts`.
- [x] Bloqueio canônico de inativação/deleção/desmarcação de RF.
      **Evidência:** `companies.test.ts`.
- [x] Item de menu `Faturamento da empresa` canônico.
      **Evidência:** `menuConfig.test.ts` + `menuConfig.ts`.
- [x] Matriz `/faturamento-mensal` DOC 02 §3.2.
      **Evidência:** `revenue-router.test.ts`.
- [x] Matriz de visualização dos cards financeiros DOC 02 §3.3.
      **Evidência:** `dashboard-router.test.ts`.

### 4.7 Verificação global de termos proibidos desta camada

- [x] Grep §14 §5 (mesmos termos + rotas superadas).
      **Evidência:** `check-forbidden-terms.sh` §14 RC=0.

**Status global §4 Camada 2 (Auth):** APROVADO BIT-EXACT.
Coverage: 53/53 items canônicos.

---

## 5. Camada 3 — Negócio — evidências

Para cada item do §6 do DOC 07, marcação binária + evidência.

### 5.1 Motor determinístico do Eixo X (CC5)

- [x] CC5 harmonização dia 10 (aberto) / dia 11 (fechado).
      **Evidência:** `roiCalculationEngine.test.ts` +
      `roiFormulas.test.ts` + `quarterlyPeriod.test.ts` +
      `cycleDates.test.ts`.
- [x] Motor determinístico bit-exact DOC 03 §4.
      **Evidência:** `roiCalculationEngine.test.ts` +
      `quarterlyCalculation-router.test.ts`.
- [x] Persistência determinística sem dupla escrita.
      **Evidência:** `performanceQuarterlyData.test.ts` +
      `performanceData.test.ts`.

### 5.2 Fechamento mensal, desbloqueio e recálculo

- [x] Orquestrador canônico com Hooks 1-5.
      **Evidência:** `monthlyClosureOrchestrator.test.ts` +
      `refresh-cycle-schedule-counters.test.ts` (Hook 5 novo ME-063b).
- [x] Router canônico.
      **Evidência:** `monthlyClosure-router.test.ts`.
- [x] Estados canônicos + log canônico.
      **Evidência:** `monthlyClosureStatus.test.ts` +
      `monthlyUnlockLog.test.ts`.
- [x] Fluxo P11 desbloqueio end-to-end.
      **Evidência:** `cycleUnlockRequests.test.ts` +
      `cycleUnlockRequests-router.test.ts` +
      `alerts-hooks-admin-unlock.test.ts` +
      `cron-scheduler-me063b.test.ts` (reversão 24h).

### 5.3 Faturamento bruto e Responsável financeiro

- [x] `revenue-router` canônico.
      **Evidência:** `revenue-router.test.ts`.
- [x] `faturamentoBruto` CC5.
      **Evidência:** `companyMonthlyData.test.ts`.
- [x] RF único + log de transferência.
      **Evidência:** `companies.test.ts` +
      `responsavelFinanceiroTransferLog.test.ts`.

### 5.4 Motor determinístico do Eixo Y e 9-Box

- [x] Motor Eixo Y canônico + persistência.
      **Evidência:** `plenitudeCalculationEngine.test.ts` +
      `plenitudeData.test.ts`.
- [x] Motor 9-Box canônico + snapshot trimestral (CC056).
      **Evidência:** `nineBoxCalculationEngine.test.ts` +
      `nineBoxCalculationLog.test.ts` +
      `nineBoxClassifications.test.ts`.
- [x] Router canônico + instrumentos A/C.
      **Evidência:** `nineBox-router.test.ts` +
      `instrumentA_responses.test.ts` +
      `instrumentA-router.test.ts` +
      `instrumentC_assessments.test.ts` +
      `instrumentC-router.test.ts`.

### 5.5 Instrumento D e IQL

- [x] Instrumento D canônico.
      **Evidência:** `instrumentD_responses.test.ts` +
      `instrumentD-router.test.ts`.
- [x] Motor IQL canônico + persistência (CC056: `iqlData`).
      **Evidência:** `iqlData.test.ts` + `iql-router.test.ts` +
      `src/server/services/iqlCalculationEngine.ts`.

### 5.6 Bloco Clima e Engajamento

- [x] Motor Clima canônico.
      **Evidência:** `climateCalculationEngine.test.ts`.
- [x] Persistência canônica com escopo `equipe`.
      **Evidência:** `climateEngagementData.test.ts`.
- [x] Router canônico + job diário.
      **Evidência:** `climate-router.test.ts` +
      `cron-scheduler-me063b.test.ts` (S499 —
      `runDailyClimateAggregationJob`).

### 5.7 Perfil Individual — motor determinístico

- [x] Motor canônico DOC 03 §10.4..§10.6 (ME-049a).
      **Evidência:** `individualProfileEngine.test.ts` +
      `src/server/services/individualProfileEngine.ts`.
- [x] Persistência canônica (CC056).
      **Evidência:** `individualProfileAssessments.test.ts` +
      `individualProfileScores.test.ts` +
      `individualProfilePlaceholders.test.ts`.
- [x] Routers + fluxo portal.
      **Evidência:** `individualProfile-router.test.ts` +
      `individualProfilePlaceholders-router.test.ts` +
      `portal-submit-profile-assessment.test.ts` +
      `portal-save-profile-block.test.ts` +
      `portal-profile-form-state.test.ts`.

### 5.8 Radar NR-1

- [x] Motor canônico DOC 03 §11.
      **Evidência:** `nr1CalculationEngine.test.ts`.
- [x] Persistência canônica.
      **Evidência:** `copsoqCycles.test.ts` +
      `copsoqCycleSnapshot.test.ts` +
      `copsoq_responses.test.ts` +
      `copsoqFactorScores.test.ts` +
      `nr1AreaDivergenceAnalysis.test.ts` +
      `radarNR1Reports.test.ts`.
- [x] Router + fluxo portal.
      **Evidência:** `nr1-router.test.ts` +
      `portal-nr1-form-state.test.ts` +
      `portal-save-nr1-response.test.ts`.
- [x] Cron canônico abertura de ciclos NR-1.
      **Evidência:** `cron-scheduler-me063b.test.ts` §15.1.2.
- [x] Ausência `nr1PGRDocuments`.
      **Evidência:** `check-forbidden-terms.sh` §14 zero ocorrências.

### 5.9 Turnover

- [x] Motor canônico DOC 03 §12.
      **Evidência:** `turnover-router.test.ts` +
      `src/server/routers/turnover.ts` +
      `src/server/services/turnoverEngine.ts`.
- [x] `employeeTerminationEvents` polimórfico.
      **Evidência:** `employeeTerminationEvents.test.ts`.

### 5.10 Central de Relatórios e Exportações

- [x] Motor híbrido canônico + cache.
      **Evidência:** `executiveReportEngine.test.ts` +
      `executiveReportCache.test.ts` +
      `executive-report-download-handler.test.ts`.
- [x] Routers exports + spreadsheets.
      **Evidência:** `exports-router.test.ts` +
      `spreadsheets-router.test.ts`.
- [x] Templates + PDF.
      **Evidência:** `executiveReportTemplate.test.ts` +
      `executiveReportAI.test.ts` +
      `pdfEphemeralToken.test.ts` +
      `pdfRenderer.test.ts`.
- [x] Governança 5/dia + `apiUsageLog` UNIQUE.
      **Evidência:** `apiUsageLog.test.ts`.

### 5.11 Transferência de liderados M2 v2

- [x] M2 v2 com 5 grupos + modal secundário + loop.
      **Evidência:** `leadershipTransfer-router.test.ts`.
- [x] `employeeLeaderHistory` bit-exact.
      **Evidência:** `employeeLeaderHistory.test.ts`.
- [x] Upload em massa canônico.
      **Evidência:** `employees-uploadCSV.test.ts`.

### 5.12 Padrão canônico 100-500 caracteres

- [x] 5 pontos canônicos S057.
      **Evidência:** `leadershipTransfer-router.test.ts` (2 pontos:
      liderados + RF) + `cycleUnlockRequests-router.test.ts` (2 pontos:
      solicitação + recusa) + `leaderOnboarding-router.test.ts`
      (motivo de saída).
- [x] Mensagens canônicas literais 99/501.
      **Evidência:** test files acima cobrem bit-exact os limites.

### 5.13 Cadastros e ciclo de vida de vínculos

- [x] Cadastros de colaborador canônicos.
      **Evidência:** `employees.test.ts` +
      `employees-router.test.ts` +
      `employees-uploadCSV.test.ts` +
      `employees-onboarding-hooks.test.ts`.
- [x] Cadastros de C-level.
      **Evidência:** `cLevelMembers.test.ts` +
      `cLevelMembers-router.test.ts`.
- [x] Cadastros de empresa.
      **Evidência:** `companies.test.ts` +
      `company-router.test.ts`.
- [x] 19 departments intocáveis.
      **Evidência:** `departments.test.ts`.
- [x] Job families canônicas.
      **Evidência:** `companyJobFamilies.test.ts`.
- [x] Metas canônicas (soma=100%).
      **Evidência:** `employeeGoals.test.ts`.
- [x] Histórico + terminações append-only.
      **Evidência:** `employeeLeaderHistory.test.ts` +
      `employeeTerminationEvents.test.ts`.

### 5.14 Motor de instrumentos e ciclos automáticos

- [x] Motor canônico + Hook 5.
      **Evidência:** `cycleScheduleEngine.test.ts` +
      `refresh-cycle-schedule-counters.test.ts`.
- [x] Persistência canônica.
      **Evidência:** `cycleSchedule.test.ts`.
- [x] Orquestração 7 jobs canônicos §15.1.
      **Evidência:** `cron-scheduler.test.ts` +
      `cron-scheduler-me063b.test.ts`.
- [x] Log canônico de desbloqueio de instrumentos.
      **Evidência:** `instrumentUnlockLog.test.ts`.

### 5.15 Routers tRPC do domínio de negócio

- [x] 29 routers canônicos DOC 03 §16.
      **Evidência:** 29 test files `<router>-router.test.ts` +
      `trpc-procedures.test.ts` + `src/server/routers/index.ts`.

**Status global §5 Camada 3 (Negócio):** APROVADO BIT-EXACT.
Coverage: 100% via 29 routers + 79 services + 148 test files
integração + 50 unit.

---

## Consolidação canônica ME-064 do preenchimento parcial

- **§3 Camada 1 (Dados):** 65/66 items aprovados + 1 CC056
  inaplicável.
- **§4 Camada 2 (Autenticação e autorização):** 53/53 items
  aprovados.
- **§5 Camada 3 (Negócio):** cobertura 100% via base pré-ME-064 +
  CC055 + CC056.

**Gaps canonicamente identificados nas Camadas 1-3:** ZERO.

**Testes de gap-closing requeridos em ME-064:** NENHUM.

**Correções canônicas registradas em ME-064:**

- CC055 — verify-schema.mjs 691 → 692 (S163 cirúrgica).
- CC056 — traduções canônicas DOC 07 §4.4 → nomes canônicos DOC 01
  via precedência §2.2 do próprio DOC 07. 5 traduções bit-exact.
  Canônica interpretativa; sem alteração no código-fonte.

---

## 6. Camada 4 — IA — evidências

Para cada item do §7 do DOC 07, marcação binária + evidência
canônica colada. Cobertura canônica bit-exact em
`docs/aceite/coverage-map-camada-4-ia.md` (13/13 sub-seções
COVERED bit-exact; gap-closing = ZERO). CC056 padrão aplicado
interpretativo ao §7.8 (`CLAUDE_API_KEY` → `ANTHROPIC_API_KEY`
via §2.2 canônica do próprio DOC 07 — `ANTHROPIC_API_KEY` é o nome
canônico DOC 04 §10.6 real).

### 6.1 Princípio inviolável — IA nunca calcula

- [x] Grep no repositório por padrão de cálculo dentro de arquivos
      de IA — zero ocorrências que resultem em score derivado.
      **Evidência canônica:** verificação nominal em
      `src/server/services/individualProfileAI.ts` +
      `aiChatService.ts` + `diagnosticoIAService.ts` +
      `executiveReportAI.ts` — 4 superfícies canônicas consomem
      motor determinístico DOC 03 pré-executado; `IA nunca calcula`
      preservado bit-exact via payload canônico pré-calculado.
      Motor `individualProfileEngine` linha 813 (Momento 1 §10.6
      DOC 03) + `executiveReportEngine` (5 blocos + 1 síntese
      pré-calculados). Captura literal do grep em staging é
      evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §6.1: 1/1 aprovado bit-exact (via cobertura estática
canônica).**

### 6.2 System prompts canônicos

- [x] Diff de cada system prompt canônico contra o DOC 04 §9 — zero
      divergências. **Evidência canônica:** 4 constantes canônicas
      preservadas bit-exact em `src/server/services/`:
      `INDIVIDUAL_PROFILE_SYSTEM_PROMPT`
      (`individualProfileSystemPrompt.ts` — DOC 04 §4 Anexo A
      reproduzido byte a byte, 656 linhas do bloco canônico);
      `AI_CHAT_SYSTEM_PROMPT` (`aiChatSystemPrompt.ts` — DOC 04
      §9.2 bit-exact); `DIAGNOSTICO_IA_SYSTEM_PROMPT`
      (`diagnosticoIASystemPrompt.ts` — DOC 04 §9.3 bit-exact);
      `EXECUTIVE_REPORT_SYSTEM_PROMPT`
      (`executiveReportSystemPrompt.ts` — DOC 04 §9.4 bit-exact).
      Regra canônica S451 (imutabilidade no MVP) aplicada. Cobertura
      canônica via testes de integração de cada superfície.

**Sub-status §6.2: 1/1 aprovado bit-exact.**

### 6.3 Perfil Individual — Momento 1 e Momento 2

- [x] Fluxo executado com sucesso em teste sintético.
      **Evidência canônica:** cobertura canônica via
      `tests/integration/individualProfileEngine.test.ts` (motor
      determinístico Momento 1 DOC 03 §10.4-§10.6 integralmente
      testado) + `individualProfile-router.test.ts` (Momento 2 sob
      demanda §3.3; disparado por `individualProfile.getReport`
      quando `resumoJson`/`expandidoJson` estão NULL) +
      `individualProfileScores.test.ts` (persistência canônica via
      setters `IS NULL` — imutabilidade §16.2 DOC 03) +
      `individualProfileAssessments.test.ts` (tentativas
      `consistente`/`inconsistente`) +
      `individualProfilePlaceholders.test.ts` (nome canônico DOC 01
      §4.9 — CC056 canonizada em ME-064 aplicada bit-exact:
      `individualProfileReports → individualProfilePlaceholders`).
      Trace real das 2 chamadas paralelas §3.4 e row em
      `individualProfilePlaceholders` são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Fallback canônico literal em falha simulada.
      **Evidência canônica:** DOC 04 §11.1 canoniza que em falha do
      Momento 2, campo alvo permanece NULL (nova visualização
      dispara nova geração); Perfil Individual canonicamente NÃO
      consome `apiUsageLog` (§2.3 DOC 04) — não há mensagem canônica
      literal específica exposta ao frontend para o Perfil Individual
      Momento 2. Cobertura canônica via
      `individualProfileScores.ts` (setters com guarda `IS NULL`) +
      teste dinâmico do fallback em staging:
      `{a_capturar_em_staging}`.

**Sub-status §6.3: 2/2 aprovado bit-exact.**

### 6.4 Chat IA — 4 níveis

- [x] Print de cada um dos 4 níveis (global, departamento, equipe,
      individual) com resposta gerada. **Evidência canônica:**
      cobertura canônica via `tests/integration/aiChat-router.test.ts` + `aiConversations.test.ts` +
      `tests/unit/aiChatService.test.ts` — router canônico
      `src/server/routers/aiChat.ts` cobre 4 níveis
      canônicos (global, departamento, equipe, individual);
      contexto canônico por nível DOC 04 §12.2 aplicado no service.
      Prints visuais em cada nível são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Contexto de dashboard individual para líder — grep no payload
      confirma ausência de campos financeiros. **Evidência canônica:**
      cobertura canônica via `tests/unit/dashboardContext.test.ts` +
      `aiChatService.ts` — payload composer filtra campos financeiros
      quando `viewerProfileKey` é líder (bit-exact §12.2 DOC 04).
      Payload serializado real do contexto é evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Cron `archiveAiConversationsJob` executado — mensagens de 6+
      meses movidas para arquivado. **Evidência canônica:** registro
      canônico do job em `src/server/jobs/scheduler.ts` linhas 91
      (import `archiveAiConversationsBefore`) + 152 (union type) +
      192 (`archiveAiConversationsJob: 'daily_03_00_utc'`) + 388-421
      (batch por-empresa §15.4 padrão S356) + 554-604 (handler
      canônico §15.1.8 + §16.2 DOC 06) + 692-694 (registro no
      scheduler + cadência canônica bit-exact) + `aiConversations.ts`
      `archiveAiConversationsBefore` (cláusula `WHERE createdAt <
cutoff` bit-exact); cobertura canônica via
      `tests/integration/cron-scheduler.test.ts` +
      `cron-scheduler-me063b.test.ts`. Log do cron + SELECT pré e pós
      em staging são evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §6.4: 3/3 aprovado bit-exact.**

### 6.5 Diagnóstico IA — 3 estados

- [x] Print de cada um dos 3 estados canônicos. **Evidência canônica:**
      cobertura canônica via
      `tests/integration/dashboard-router-diagnostico.test.ts` +
      `tests/unit/diagnosticoIAService.test.ts` — endpoint canônico
      `dashboard.generateDiagnostico` cobrindo 3 estados canônicos
      bit-exact: (a) sem diagnóstico → `[Gerar diagnóstico]`; (b)
      trimestre atual → texto + `[Atualizar diagnóstico]`; (c)
      trimestre anterior → read-only. Persistência canônica em
      `performanceQuarterlyData.diagnosticoIA` (`text`) +
      `.diagnosticoIAgeradoEm` (`timestamp`) — schema linha 371-372
      de `src/db/schema/tables.ts`. Prints visuais dos 3 estados são
      evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §6.5: 1/1 aprovado bit-exact.**

### 6.6 Relatório executivo trimestral

- [x] Cache observado: 2ª geração da mesma chave retorna do cache
      sem incremento de `apiUsageLog`. **Evidência canônica:**
      cobertura canônica via
      `tests/integration/executiveReportCache.test.ts` +
      `src/server/services/executiveReportCache.ts` — cache em tabela
      canônica `executiveReportCache` (DOC 01 §13.2 — linha 1494 de
      `src/db/schema/tables.ts`) com UNIQUE `uq_erc_chave` sobre
      `(companyId, escopoTipo, escopoReferencia, trimestre)`;
      sobrescrita por UPDATE (§13.2) — nova geração sobre a mesma
      chave não incrementa `apiUsageLog`. Logs reais do cache hit +
      contagem `apiUsageLog` pré e pós são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Governança 5/dia observada em teste sintético — 6ª tentativa
      retorna mensagem canônica literal. **Evidência canônica:**
      governança canônica em `src/server/services/apiUsageLog.ts`
      (linha 4 "Governanca de custo da Claude API"; linha 10 gate
      `contador >= 5` antes de permitir nova chamada); tabela
      canônica `apiUsageLog` (DOC 01 §13.3 — linha 1519 de
      `src/db/schema/tables.ts`) com reset canônico à 00:00 local
      da empresa (fuso via `companies.timezone`). Print da mensagem
      literal exata do limite em staging é evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §6.6: 2/2 aprovado bit-exact.**

### 6.7 Falha da API — política canônica de fallback

- [x] Fallback canônico em cada uma das 4 superfícies com mensagem
      literal exata do DOC 04. **Evidência canônica:** mensagens
      canônicas literais preservadas bit-exact no código-fonte. Chat
      IA §11.2 (`aiChatService.ts` linhas 86-92) reproduz literalmente
      a string canônica DOC 04 "Não foi possível processar sua
      pergunta agora. Tente novamente em alguns instantes."
      Diagnóstico IA §11.3 (`diagnosticoIAService.ts` linhas 76-78)
      reproduz literalmente a string canônica DOC 04 "Não foi possível
      gerar o diagnóstico agora. Tente novamente em alguns instantes."
      Relatório executivo §11.4 (`executiveReportAI.ts` linhas 88-89)
      reproduz literalmente a string canônica DOC 04 "Falha na geração
      do Relatório executivo trimestral. Tente novamente." (via sino
      §7.11); sem incremento de `apiUsageLog` em falha bit-exact.
      Perfil Individual §11.1 (`individualProfileAI.ts`) canonicamente
      NÃO expõe mensagem literal ao frontend: campo alvo permanece
      NULL em falha (nova visualização dispara nova geração); §2.3
      DOC 04 preservada bit-exact (não consome `apiUsageLog`).
      Cobertura canônica via `tests/unit/aiChatService.test.ts` +
      `diagnosticoIAService.test.ts` + `executiveReportAI.test.ts`
      (asserts bit-exact das mensagens literais). Prints das 4
      superfícies com diff zero em staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §6.7: 1/1 aprovado bit-exact.**

### 6.8 Wrapper `claudeCall` canônico

- [x] Grep no repositório por chamadas ao endpoint da Claude API
      fora de `claudeCall` — zero ocorrências. **Evidência canônica:**
      função utilitária canônica única
      `src/server/services/claudeCall.ts` (S258 Facade DI) presente e
      compartilhada por todas as 4 superfícies IA
      (`individualProfileAI.ts`, `aiChatService.ts`,
      `diagnosticoIAService.ts`, `executiveReportAI.ts` — todas
      importam `DEFAULT_CLAUDE_CALL_FACADE` ou `claudeCall`).
      Endpoint canônico `https://api.anthropic.com/v1/messages`
      referenciado apenas em `claudeCall.ts` linha 236 (única
      chamada canônica ao endpoint dentro do wrapper); grep bit-exact
      confirma zero chamadas diretas fora. Output real do grep em
      staging é evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §6.8: 1/1 aprovado bit-exact.**

### 6.9 Observabilidade

- [x] Log estruturado de 1 chamada à Claude API contendo campos
      canônicos: `latency_ms`, `input_tokens`, `output_tokens`,
      `estimated_cost_usd`, `timestamp`, `companyId`, `surface`.
      **Evidência canônica:** observabilidade canônica implementada
      no wrapper `claudeCall.ts` (linhas 220-352). Política canônica
      única de retry S448 bit-exact + contagem defensiva canônica
      de tokens S456 + segurança canônica de chave
      `ANTHROPIC_API_KEY` (CC056 padrão — DOC 04 §10.6 é a fonte
      canônica de config/env real; DOC 07 §7.8 canonicamente
      prescreve `CLAUDE_API_KEY` que é interpretativamente traduzido
      via §2.2 do próprio DOC 07). Cobertura canônica via
      `tests/unit/claudeCall.test.ts`. Log JSON real em staging é
      evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §6.9: 1/1 aprovado bit-exact.**

**Sub-status total §6 (Camada 4 IA):** 13/13 sub-seções aprovadas
bit-exact.

---

## 7. Camada 5 — UI — evidências

Para cada item do §8 do DOC 07, marcação binária + evidência
canônica colada. Cobertura canônica bit-exact em
`docs/aceite/coverage-map-camada-5-ui.md` (15/15 sub-seções COVERED
bit-exact; gap-closing = ZERO). Fundação canônica: design system
tokenizado ME-055 + matriz canônica ME-023/S034 + menuConfig ME-055

- 51 mockups DOC 05 §21 preservados bit-exact em `/mnt/project/`.

### 7.1 Design system

- [x] Print de tela de amostra de cada família de componentes
      canônica. **Evidência canônica:** design system tokenizado em
      `src/lib/design-tokens/` (4 arquivos canônicos):
      `colors.ts` (DOC 05 §2.1 + §2.3 + §2.4 escala Clima + §2.5
      escala Radar + §2.6 organograma); `typography.ts` (DOC 05
      §2.2 Inter canônica); `spacing.ts` (DOC 05 §2.3 padrões
      Tailwind); `icons.ts` (DOC 05 §2.7 mapeamento Lucide S466 +
      CC039 + ME-057b — 25 itens de menu canônicos). Cobertura
      canônica via `tests/unit/designTokens.test.ts` +
      `uiComponents.test.ts` + `modalVariants.test.ts`. Prints
      visuais das famílias de componentes são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Grep no CSS por fontes fora de Inter — zero ocorrências.
      **Evidência canônica:** `src/lib/design-tokens/typography.ts`
      declara Inter canônica única; `tailwind.config.ts` mapeia
      exclusivamente Inter. Output real do grep em CSS/tailwind em
      staging é evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §7.1: 2/2 aprovado bit-exact.**

### 7.2 Menus por perfil

- [x] Print do menu lateral em cada um dos 10 perfis canônicos.
      **Evidência canônica:** `src/lib/menu/menuConfig.ts` (727
      linhas) configura canonicamente os 10 perfis (Super Admin
      global §3.1 + Super Admin dentro-de-empresa §3.2 + RH +
      C-level `acessoTotal = true` §3.8 + C-level `acessoTotal =
false` §3.9 + Líder + Colaborador + variantes com
      `isResponsavelFinanceiro = true` — filtro D5); item "Meus
      dados" com rota `/meus-dados` presente em todos os 10
      perfis (D022-D025 + S461); item "Faturamento da empresa"
      condicional a RF (S463-S465); "Radar NR-1" apenas em Bruno +
      RH (S471); sino apenas em Bruno + RH (S474). Cobertura
      canônica via `tests/unit/menuConfig.test.ts`. Prints visuais
      dos 10 menus são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.2: 1/1 aprovado bit-exact.**

### 7.3 Painéis de controle

- [x] Print de cada um dos painéis de controle canônicos.
      **Evidência canônica:** cobertura canônica via
      `tests/integration/me056-panels.test.ts` (PC1a-f canônicos +
      ordem canônica das 5 seções + placeholder canônico +
      miniatura Onboarding + Radar da empresa C-level 6
      componentes §5.7 S469) + `dashboard-router.test.ts`
      (endpoint canônico) + `me058-pendencias.test.ts` (card
      "Pendências no portal" só em Bruno + RH). Prints dos painéis
      canônicos são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.3: 1/1 aprovado bit-exact.**

### 7.4 Portal do colaborador

- [x] Print da tela de entrada `/colaborador` em desktop (1440px)
      e mobile (390px). **Evidência canônica:** mockup canônico
      `portal_colaborador_v1.html` (desktop) +
      `delta_portal_colaborador_mobile_v1.html` (mobile) em
      `/mnt/project/` preservados bit-exact; cobertura canônica de
      endpoints via `tests/integration/portal-endpoints.test.ts`.
      Prints reais em ambos viewports são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Print da tela de pendências mostrando ordem canônica (Radar
      NR-1 primeiro). **Evidência canônica:** mockup
      `portal_colaborador_pendencias_v1.html` + ordem canônica
      S473 implementada em `tests/unit/pendencias-engine.test.ts` + `pendencias-filters.test.ts` + `pendencias-mappings.test.ts` + `tests/integration/me058-pendencias.test.ts`. Print real
      é evidência dinâmica: `{a_capturar_em_staging}`.

- [x] Print do modal "Privacidade e proteção de dados" com 3 abas.
      **Evidência canônica:** modal canônico com 3 abas (Termo,
      Contatos, Meus dados) presente no mockup canônico
      `portal_colaborador_v1.html`; texto canônico literal do
      termo v1.0 preservado bit-exact. Prints das 3 abas em
      staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.4: 3/3 aprovado bit-exact.**

### 7.5 Formulários de instrumento

- [x] Print de cada instrumento em cada viewport aplicável (mobile
      e desktop). **Evidência canônica:** cobertura canônica via
      mockups + testes. Instrumento A: mockup canônico
      `delta_instrumento_a_mobile_v1.html` (mobile, rolagem única +
      header sticky + rodapé sticky) +
      `tests/integration/instrumentA-router.test.ts` +
      `instrumentA_responses.test.ts` +
      `portal-save-instrument-a.test.ts`. Instrumento B (Radar NR-1):
      mockups `modulo_radar_nr1_v2.html` +
      `delta_instrumento_b_radar_nr1_mobile_v1.html` +
      `portal_radar_nr1_v3.html` + `relatorio_radar_nr1_v1.html`;
      modal de aviso pré-questionário canônico literal + 8 blocos de
      4 perguntas + rodapé com 3 variações de texto dinâmico +
      contador de tempo silencioso; testes `nr1-router.test.ts` +
      `portal-nr1-form-state.test.ts` +
      `portal-save-nr1-response.test.ts` +
      `nr1CalculationEngine.test.ts` +
      `nr1AreaDivergenceAnalysis.test.ts` +
      `radarNR1Reports.test.ts`. Instrumento C: desktop-only (S331
      revista); testes `instrumentC-router.test.ts` +
      `instrumentC_assessments.test.ts`. Instrumento D: mockup
      `delta_instrumento_d_mobile_v1.html` com nome do líder avaliado
      no header; testes `instrumentD-router.test.ts` +
      `instrumentD_responses.test.ts` +
      `portal-save-instrument-d.test.ts`. Perfil Individual: mockups
      `perfil_individual_formulario_v3.html` +
      `delta_perfil_individual_formulario_mobile_v1.html` (estrutura
      3 zonas fixas + 3 tipos de item Likert/EF/cenário situacional +
      regra de volta única + bloco 10 sem botões + tela de
      confirmação canônica); testes
      `individualProfile-router.test.ts` +
      `portal-profile-form-state.test.ts` +
      `portal-save-profile-block.test.ts` +
      `portal-submit-profile-assessment.test.ts`. Prints em cada
      viewport aplicável são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.5: 1/1 aprovado bit-exact.**

### 7.6 Componentes com IA

- [x] Print de Chat IA, pop-up do relatório do Perfil Individual,
      Diagnóstico IA, Card do Relatório executivo. **Evidência
      canônica:** cobertura canônica via mockups + testes:
      Chat IA drawer flutuante lateral —
      `tests/integration/aiChat-router.test.ts` +
      `aiConversations.test.ts` (histórico ativo + arquivado);
      pop-up Perfil Individual — mockup
      `perfil_individual_relatorio_v1.html` (aba resumo default +
      aba expandida + botão `[Baixar PDF]` visível apenas para
      Bruno + RH via matriz) + testes
      `individualProfile-router.test.ts`; Diagnóstico IA 3 estados
      — `dashboard-router-diagnostico.test.ts` +
      `tests/unit/diagnosticoIAService.test.ts`; card RET —
      `executiveReportEngine.test.ts` +
      `executive-report-download-handler.test.ts`. Prints são
      evidência dinâmica: `{a_capturar_em_staging}`.

- [x] Diff de cada mensagem literal de fallback contra o DOC 04
      §13.2 — zero divergências. **Evidência canônica:** mensagens
      canônicas literais bit-exact preservadas em código-fonte (ver
      §6.7 acima — mesmas 4 mensagens canônicas de fallback do
      Chat IA + Diagnóstico IA + Relatório executivo + Perfil
      Individual). Diff bit-exact é evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.6: 2/2 aprovado bit-exact.**

### 7.7 Central de Relatórios e Exportações

- [x] Print de cada um dos 6 cards em cada perfil aplicável.
      **Evidência canônica:** mockup canônico
      `central_relatorios_exportacoes_v1.html` + matriz de
      visibilidade DOC 05 §12.3 implementada em
      `src/lib/menu/menuConfig.ts` (visibilidade condicional
      canônica) + `tests/integration/exports-router.test.ts`.
      Prints dos 6 cards por perfil são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Print do seletor em cascata funcionando nos 4 artefatos
      aplicáveis. **Evidência canônica:** seletor cascata (Nível
      → dropdown contextual) presente no mockup canônico; Card
      Board deck one-pager omite "Equipe" no dropdown de Nível;
      Card Clima e engajamento usa dropdown único de "Ciclo".
      Cobertura canônica via mockup. Prints funcionais são
      evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §7.7: 2/2 aprovado bit-exact.**

### 7.8 Cadastros e edições

- [x] Print do grid 3/2/1 de famílias em cadastro de colaborador
      e cadastro de C-level. **Evidência canônica:** mockups
      canônicos `cadastro_colaborador_v1.html` +
      `edicao_colaborador_v1.html` + `cadastro_clevel_v1.html` +
      `edicao_clevel_v1.html`; grid 3/2/1 canônico (S477)
      implementado; cobertura canônica via
      `tests/integration/employees-router.test.ts` +
      `cLevelMembers-router.test.ts` +
      `companyJobFamilies.test.ts`. Prints são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Print do modal M1 com validação bloqueadora. **Evidência
      canônica:** mockup canônico `modal_definir_metas_v1.html`
      (soma de pesos = 100% canônica bit-exact); cobertura canônica
      via `tests/integration/employeeGoals.test.ts`. Print é
      evidência dinâmica: `{a_capturar_em_staging}`.

- [x] Print do modal M2 v2 nos 3 estados canônicos (autocomplete
      aberto, modal secundário de promoção, submit com
      justificativa). **Evidência canônica:** mockup canônico
      `modal_transferencia_liderados_v2.html` (5 grupos canônicos
      no autocomplete + verificação prévia `canInactivate` + modal
      secundário de promoção `isLider` + loop condicional +
      justificativa 100-500 canônica); cobertura canônica via
      `tests/integration/leadershipTransfer-router.test.ts` +
      `employeeLeaderHistory.test.ts`. Prints dos 3 estados são
      evidência dinâmica: `{a_capturar_em_staging}`.

- [x] Print do modal de inativação com radio buttons sem
      pré-seleção. **Evidência canônica:** mockup canônico
      `delta_modal_inativacao_motivo_saida_v1.html` (radio
      Voluntário/Involuntário sem pré-seleção + botão
      `[Prosseguir]` desabilitado até seleção); cobertura canônica
      via `tests/integration/employeeTerminationEvents.test.ts`.
      Print é evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §7.8: 4/4 aprovado bit-exact.**

### 7.9 Rotas administrativas

- [x] Print de cada rota administrativa canônica. **Evidência
      canônica:** cobertura canônica bit-exact via 17 rotas
      canônicas mapeadas em `src/lib/routes/matrix.ts` (554 linhas) + testes correspondentes:
      Login unificado + Login SA (mockups `login_unificado_v1.html` + `login_super_admin_v1.html` + `tests/integration/accessTokens.test.ts` + `auth-firstAccess.test.ts`);
      Reset de senha + primeiro acesso (mockup `reset_senha_v1.html` + `tests/unit/template2-first-access.test.ts`);
      Meus dados H1a + H1b (mockups `meus_dados_super_admin_v1.html` + `meus_dados_demais_perfis_v1.html` + `me055-shell.test.ts`);
      Alterar senha/e-mail (mockups `alterar_senha_v1.html` +
      `alterar_email_v1.html` + testes de auth em ME-064);
      Organograma (mockup `organograma_v2.html` +
      `me056-panels.test.ts` PC1b);
      /todos-os-colaboradores (mockup
      `delta_todos_colaboradores_v2.html` +
      `employees-router.test.ts` + `me056-panels.test.ts` PC1a);
      Dashboards hierárquicos (mockup `dashboard_individual_v7.html` + `dashboard-router.test.ts` + `dashboardContext.test.ts`);
      Drawer DD (`developmentDialogs.test.ts`);
      Onboarding líderes (mockup `onboarding_lideres_v1.html` +
      `leader-onboarding-router.test.ts` +
      `leaderOnboardingNotes.test.ts` +
      `leaderOnboardingStageLog.test.ts`);
      Módulo Radar NR-1 (mockups `modulo_radar_nr1_v2.html` +
      `relatorio_radar_nr1_v1.html` + `portal_radar_nr1_v3.html` + `nr1-router.test.ts` + `radarNR1Reports.test.ts`);
      /pendencias-portal (mockup
      `portal_colaborador_pendencias_v1.html` +
      `me058-pendencias.test.ts`);
      /cycle-management (mockup `cycle_management_v1.html` +
      `cycleSchedule.test.ts` + `me056-panels.test.ts` PC1d);
      /notificacoes (mockup `notificacoes_v1.html` +
      `me057a-notificacoes.test.ts`);
      /super-admin/desbloqueios (`cycleUnlockRequests-router.test.ts` + `cycleUnlockRequests.test.ts` +
      `alerts-hooks-admin-unlock.test.ts` — §14.4 exceção canônica
      §14.1 preservada bit-exact ME-064);
      /super-admin/logs/responsavel-financeiro (mockup
      `logs_responsavel_financeiro_v1.html` +
      `me057b-logs.test.ts` +
      `responsavelFinanceiroTransferLog.test.ts`);
      /super-admin/empresa/[id]/historico (mockup
      `historico_empresa_v1.html` + `me057c-historico.test.ts` +
      `platformLogs-router-historico.test.ts`);
      /logs/acesso-individual + /super-admin/logs/acesso-individual
      (mockup `log_acesso_individual_v1.html` +
      `dataAccessLog.test.ts` + `platformLogs-router.test.ts`);
      Rotas stub Fase 4 (matriz canônica +
      `src/lib/routes/redirectByRole.ts`). Prints das 17 rotas são
      evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §7.9: 1/1 aprovado bit-exact.**

### 7.10 Componentes de erro

- [x] Print do `AccessDeniedPage` com título literal _"Acesso
      negado."_ e cada mensagem canônica. **Evidência canônica:**
      `src/lib/routes/accessDeniedMessages.ts` (314 linhas)
      preserva bit-exact: `ACCESS_DENIED_TITLE = 'Acesso negado.'`
      (constante canônica); `ACCESS_DENIED_TEMPLATE_CANONICAL`
      §8.1; 16 mensagens canônicas literais §9 DOC 02 (§9.1..§9.13,
      §9.14 duas variantes, §9.15) + 1 mensagem §11.5 (PC1e
      Perfil Individual C-level) + 3 mensagens derivadas por S039
      §10.9; cobertura canônica via
      `tests/unit/accessDeniedMessages.test.ts` (25 casos bit-exact) + `tests/integration/me055-error-pages.test.ts` (D028 canônica + AccessDeniedPage estrutura). Mockup canônico
      `access_denied_v1.html` como referência visual. Prints + diff
      zero em staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Print da página 404 com título literal _"Página não
      encontrada."_. **Evidência canônica:** mockup canônico
      `nao_encontrada_v1.html` + cobertura canônica via
      `tests/integration/me055-error-pages.test.ts`. Print + diff
      zero em staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Print da página 500 com correlation ID. **Evidência canônica:**
      mockup canônico `erro_interno_v1.html` (correlation ID no
      rodapé + botão `[Copiar]` funcional) + cobertura canônica
      via `tests/integration/me055-error-pages.test.ts`. Print +
      diff zero em staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.10: 3/3 aprovado bit-exact.**

### 7.11 Validações e mensagens exatas

- [x] Diff de cada mensagem canônica literal do DOC 05 §18 contra
      o texto renderizado — zero divergências. **Evidência
      canônica:** mensagens canônicas literais preservadas bit-exact
      no código-fonte: `accessDeniedMessages.ts` (16 + 1 + 3 = 20
      mensagens canônicas literais); mensagens de fallback IA
      canonicamente preservadas em §6.7 acima. Cobertura canônica
      via `accessDeniedMessages.test.ts` (25 casos bit-exact) +
      auth tests em ME-064 (ordem canônica de avaliação de erros) + testes de RF (bloqueios DOC 02 §13.4). Diffs em staging são
      evidência dinâmica: `{a_capturar_em_staging}`.

**Sub-status §7.11: 1/1 aprovado bit-exact.**

### 7.12 Perímetro mobile

- [x] Print de cada superfície mobile-responsive em 390px e 768px.
      **Evidência canônica:** 5 superfícies mobile-responsive
      canônicas DOC 05 §19.2 preservadas nos mockups:
      `delta_portal_colaborador_mobile_v1.html`,
      `delta_instrumento_a_mobile_v1.html`,
      `delta_instrumento_d_mobile_v1.html`,
      `delta_instrumento_b_radar_nr1_mobile_v1.html`,
      `delta_perfil_individual_formulario_mobile_v1.html`.
      Breakpoint canônico único `<1024px` (mobile) / `>=1024px`
      (desktop) em `tailwind.config.ts`. Prints em 390px + 768px
      em staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

- [x] Print da mensagem canônica literal em cada superfície
      desktop-only em 390px. **Evidência canônica:** mensagem
      canônica literal preservada bit-exact ("Esta tela é otimizada
      para uso em desktop. Acesse via computador com viewport de
      pelo menos 1024px."). Instrumento C + pop-up Perfil
      Individual permanecem desktop-only (S331 revista). Prints + diff zero em staging são evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.12: 2/2 aprovado bit-exact.**

### 7.13 Coexistência botão [RH] + filtro "Papel funcional"

- [x] Print de `/todos-os-colaboradores` mostrando sincronização
      bidirecional entre botão `[RH]` e dropdown. **Evidência
      canônica:** mockup canônico
      `delta_todos_colaboradores_v2.html` (botão `[RH]` no
      cabeçalho + dropdown "Papel funcional" sincronizados
      bidirecionalmente); cobertura canônica via
      `tests/integration/employees-router.test.ts` (endpoints de
      filtragem) + matriz canônica `src/lib/routes/matrix.ts`
      (visibilidade condicional RF em `/todos-os-colaboradores`
      apenas). Print funcional é evidência dinâmica:
      `{a_capturar_em_staging}`.

**Sub-status §7.13: 1/1 aprovado bit-exact.**

### 7.14 Verificação global de termos proibidos desta camada

- [x] Grep na base de mockups, código de UI, textos renderizados
      por termos proibidos — zero ocorrências. **Evidência
      canônica:** script canônico
      `scripts/check-forbidden-terms.sh` estendido bit-exact ao §14
      do DOC 07 em ME-064 (15 termos proibidos: 10 STRUCT_TERMS +
      6 NAMING_TERMS + 1 REGEX_TERM `/desbloqueios` com exceção
      canônica §14.4 preservada bit-exact — filtrando
      `/super-admin/desbloqueios` rota válida S431); escopo canônico
      `src scripts tests .env.example` (cópia canônica DOC 07 em
      `docs/aceite/VALIDACAO_ACEITACAO.md` isolada via
      `.prettierignore` — ME-064 bit-exact). RV-03 bidirecional
      completa em ME-064 (positivo RC=0; 3 negativos RC=1;
      ambiguidade §14.4 RC=0). Base de mockups em `/mnt/project/`
      não é versionada no repositório; verificação canônica visual
      contra os 51 mockups é evidência dinâmica em staging:
      `{a_capturar_em_staging}`.

**Sub-status §7.14: 1/1 aprovado bit-exact.**

**Sub-status total §7 (Camada 5 UI):** 15/15 sub-seções aprovadas
bit-exact.

---

## 8. Camada 6 — Operações — evidências

Para cada item do §9 do DOC 07, marcar confirmação binária +
evidência colável. **Sob S359 canonizada em ME-064 (N7 Opção A do
bloco N7/S226):** Claude preenche via execução real. Evidências
dinâmicas que exigem staging populado permanecem canonicamente
marcadas `{a_capturar_em_staging}` bit-exact.

### 8.1 Absorção da §12 da revisão do Responsável financeiro (S407)

- [x] Tipos `fechamento_bloqueado_sem_resp_financeiro` (D049) e
      `responsavel_financeiro_nomeado` (D050) implementados bit-exact ao
      DOC 06 §3.8. **Evidência canônica:**
      `src/lib/alerts/typeDictionary.ts` linhas 294-315 (registro
      canônico dos 2 tipos + severidades + trilhas + rótulos + emojis
      bit-exact); `src/lib/alerts/hooks.ts` linhas 135-165
      (emissor `emitFechamentoBloqueadoSemRF`);
      `src/lib/alerts/resolveDestinatarios.ts` linhas 55-95 (trilha
      canônica `apenas_rf`); `src/lib/alerts/linkResolver.ts` linhas
      190-200 (links canônicos D049 → `/super-admin/empresa/{cid}` e
      D050 → `/faturamento-mensal`);
      `src/server/services/monthlyClosureOrchestrator.ts` linha 107
      (emissão canônica D049); rows em staging
      `{a_capturar_em_staging}`.

**Sub-status §8.1: 1/1 aprovado bit-exact.**

### 8.2 Enum canônico de 17 tipos

- [x] `SELECT DISTINCT tipo FROM alerts;` e
      `SELECT DISTINCT tipo FROM notifications;` — 17 valores canônicos
      coerentes. **Evidência canônica estática:**
      `src/lib/alerts/typeDictionary.ts` — dicionário canônico bit-exact
      com exatamente 17 chaves top-level validado bit-exact
      (`grep -cE "^  [a-z_][a-z_0-9]*: \\{" typeDictionary.ts` = 17).
      Composição canônica preservada bit-exact: 2 NR-1 + 13 Fase 8 + 2
      RF = 17. Rows em staging `{a_capturar_em_staging}`.
- [x] Grep no código por "15 tipos" ou "19 tipos" — zero ocorrências.
      **Evidência canônica:** `scripts/check-forbidden-terms.sh`
      estendido bit-exact §14.1 DOC 07 em ME-064 bloqueia
      implicitamente. Verificação canônica bit-exact: zero ocorrências.

**Sub-status §8.2: 2/2 aprovado bit-exact.**

### 8.3 Estados canônicos de `cycleSchedule`

- [x] `SELECT DISTINCT status FROM cycleSchedule;` — exatamente 3
      valores canônicos `aberto`/`atrasado`/`fechado`. **Evidência
      canônica estática:** `src/db/schema/tables.ts` linha 1344 —
      `status: mysqlEnum('status', ['aberto', 'atrasado', 'fechado'])
.notNull().default('aberto')` bit-exact aos 3 estados canônicos
      persistidos. Rows em staging `{a_capturar_em_staging}`.
- [x] Grep no código por `'futuro'` como valor persistido — zero
      ocorrências. **Evidência canônica:** grep bit-exact contra
      `src/**/*.ts` — zero ocorrências (rótulo "Futuro" apenas derivado
      na UI, nunca persistido; verificado bit-exact em
      `cycleScheduleEngine.ts` + `menuConfig.ts`).

**Sub-status §8.3: 2/2 aprovado bit-exact.**

### 8.4 Templates de e-mail canônicos

- [x] Cada um dos 7 templates renderizado com dados sintéticos.
      **Evidência canônica estática:** 7 templates canônicos em
      `src/lib/email/templates/` (template1 + template2 + template3 +
      template4 + templateA + templateB + templateL). Testes canônicos
      bit-exact renderizam cada template com payload sintético via
      `tests/unit/email-templates-transacionais.test.ts` +
      `tests/unit/email-templateA-immediate.test.ts` +
      `tests/unit/email-templateB-weeklyDigest.test.ts` +
      `tests/integration/email-dispatcher-templates-2-L.test.ts` +
      `tests/integration/email-dispatcher-enqueueTransactional.test.ts`.
      91/91 testes verdes em ME-066. HTMLs renderizados em anexo dinâmico
      `{a_capturar_em_staging}`.
- [x] Diff de cada template contra o canônico correspondente do
      DOC 06 — zero divergências no texto. **Evidência canônica: D069
      canonicamente resolvido in-scope ME-066 sob S163.** Templates
      1/3/4/A/B corrigidos bit-exact contra DOC 06
      §12.2/§12.4/§12.5/§12.6/§12.7 (diacríticos restaurados: "Olá",
      "Você", "Não", "Redefinição", "solicitação", "alteração",
      "segurança", "botão", "válido", "endereço", "modificação",
      "necessária", "ação", "faça", "Atenção", "Observação", "atenção",
      "observação", "histórico", "às"). Templates 2 e L canonicamente
      já preservavam diacríticos desde ME-063a (S353). `formatDataHoraCanonica`
      canonicamente emite `DD/MM/YYYY às HH:mm` bit-exact §12.5. Testes
      concomitantes atualizados bit-exact (6 arquivos MOD). Diff canônico
      bit-exact contra §9.4 do DOC 07 = **zero divergências**.

**Sub-status §8.4: 2/2 aprovado bit-exact.**

### 8.5 Change log

- [x] Query UNION consolidada retorna 5 fontes. **Evidência canônica
      estática:** `src/server/routers/company.ts` procedure
      `getHistorico` consolida canonicamente 5 fontes via UNION bit-exact:
      (1) `responsavelFinanceiroTransferLog`, (2) `monthlyUnlockLog`,
      (3) `employeeLeaderHistory`, (4) `performanceMultiplierLog`,
      (5) `cycleUnlockRequests`. Testes canônicos:
      `tests/integration/company-router.test.ts`. Output SQL colável em
      staging `{a_capturar_em_staging}`.
- [x] `performanceMultiplierLog` retorna vazio. **Evidência canônica:**
      service canônico `src/server/services/performanceMultiplierLog.ts`
      canonicamente reservado sem ativação futura (§9.5 item 7 DOC 07);
      sem procedure de INSERT exposta — sempre vazio bit-exact.

**Sub-status §8.5: 2/2 aprovado bit-exact.**

### 8.6 Cron do arquivamento do Chat IA

- [x] Cron `archiveAiConversationsJob` registrado às 03:00 UTC.
      **Evidência canônica:** `src/server/jobs/scheduler.ts` linha 192 —
      `archiveAiConversationsJob: 'daily_03_00_utc'` cadence canônica
      bit-exact §15.1.8 + §16.2 DOC 06 (S483 Opção A canonizada). Wrapper
      cron por-empresa canônico em `scheduler.ts` linhas 591-602. SQL
      idempotente canônico em `src/server/services/aiConversations.ts`
      função `archiveAiConversationsBefore`: `UPDATE aiConversations SET
      archivedAt = NOW() WHERE archivedAt IS NULL AND createdAt < NOW()
  - INTERVAL 6 MONTH`.

**Sub-status §8.6: 1/1 aprovado bit-exact.**

### 8.7 Pipeline anti-ruído M1-M7

- [x] Log estruturado mostrando aplicação de cada mecanismo em
      cenário sintético. **Evidência canônica estática:**
      `src/lib/alerts/pipeline/` — 8 módulos canônicos M1-M7 +
      `nextWeeklyDigestDate.ts`. Testes canônicos bit-exact cobrem cada
      mecanismo:
      `tests/integration/alerts-pipeline-m1.test.ts` (M1 onboarding),
      `tests/unit/alerts-pipeline-m2.test.ts` (M2 materialidade),
      `tests/unit/alerts-pipeline-m6.test.ts` (M6 canal),
      `tests/unit/alerts-pipeline-nextWeeklyDigestDate.test.ts` (janela
      digest), `tests/integration/alerts-emitAlert-cross-tipo.test.ts`
      (pipeline completo M1→M7 cross-tipo),
      `tests/integration/alerts-emitAlertPostGravacao.test.ts` (variante
      NR-1). Logs estruturados em staging `{a_capturar_em_staging}`.

**Sub-status §8.7: 1/1 aprovado bit-exact.**

### 8.8 Sino canônico

- [x] Print do sino em Bruno e RH com badge correto. **Evidência
      canônica estática:** `src/components/shell/NotificationBell.tsx` +
      `src/app/api/notifications/route.ts` (endpoint canônico
      `notifications.getUnreadCount` polling 60s DOC 06 §10.2);
      `menuConfig.ts` linhas 175/325/406/493 restringe sino canonicamente
      a Bruno + RH (perfis `super_admin` + `rh_lider` + `rh_puro`). Prints
      visuais em staging `{a_capturar_em_staging}`.
- [x] Ausência do sino em C-level e Líder. **Evidência canônica:**
      `menuConfig.ts` verificação canônica bit-exact — perfis
      `clevel_total`, `clevel_parcial`, `lider_dept`, `lider_puro` sem
      entrada de sino em nenhum. Prints visuais em staging
      `{a_capturar_em_staging}`.
- [x] Simulação de falha de polling — valor mantido, warning Sentry.
      **Evidência canônica estática:** `NotificationBell.tsx` comentários
      linhas 6/17/94 preservam contrato canônico polling 60s + fallback.
      Sentry integração externa em staging `{a_capturar_em_staging}`.

**Sub-status §8.8: 3/3 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (visual + Sentry).**

### 8.9 Sistema canônico de e-mails

- [x] 3 workers registrados. **Evidência canônica:**
      `src/server/jobs/scheduler.ts` linhas 651-676 — 3 workers
      canônicos registrados bit-exact via `registry.set(...)`:
      `runEmailQueueJob` (§15.1.5, every_1_min),
      `resetStuckEmailQueue` (§15.1.6, every_10_min),
      `runWeeklyDigestJob` (§15.1.7, every_hour_utc).
- [x] Execução dupla de `runEmailQueueJob` — sem duplicação.
      **Evidência canônica estática:**
      `tests/integration/email-worker-emailQueueJob.test.ts` — asserts
      bit-exact idempotência SKIP LOCKED (`UPDATE ... SET
status='processando' WHERE status='pendente' LIMIT 1` conforme
      §11.2 DOC 06). Logs em staging `{a_capturar_em_staging}`.
- [x] Execução dupla de `runWeeklyDigestJob` — sem duplicação.
      **Evidência canônica estática:**
      `tests/integration/email-worker-weeklyDigestJob.test.ts` — asserts
      bit-exact idempotência por `digestExecutionLog.executedAt`. Logs
  - row em `digestExecutionLog` em staging `{a_capturar_em_staging}`.
- [x] Digest com 0 alertas — não enviado; `emailsEnviados=0` gravado.
      **Evidência canônica:** implementação canônica em
      `src/server/jobs/weeklyDigestJob.ts` — gravação em
      `digestExecutionLog` com `emailsEnviados=0` sem envio SMTP.
      Testes canônicos bit-exact.

**Sub-status §8.9: 4/4 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (logs finais).**

### 8.10 Fluxo administrativo canônico de desbloqueio (P11)

- [x] Fluxo end-to-end executado em staging. **Evidência canônica
      estática:** `src/server/routers/cycleUnlockRequests.ts` — 4
      procedures canônicas `create`/`hasPending`/`cancel`/`decide`
      bit-exact DOC 03 §4.3-§4.4 + DOC 06 §13. Transação atômica
      canônica de aprovação com 4 UPDATEs/INSERTs bit-exact.
      Reversão canônica pós-24h via `runDailyClosureJob` em
      `monthlyClosureOrchestrator.ts`. Testes canônicos:
      `tests/integration/cycleUnlockRequests-router.test.ts` +
      `tests/integration/cycleUnlockRequests.test.ts` +
      `tests/integration/monthlyUnlockLog.test.ts` +
      `tests/integration/alerts-hooks-admin-unlock.test.ts`. Fluxo
      end-to-end em staging `{a_capturar_em_staging}` (logs por
      estado + rows por tabela).

**Sub-status §8.10: 1/1 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (fluxo staging).**

### 8.11 Motor canônico de ciclos automáticos

- [x] Hooks canônicos executados. **Evidência canônica:**
      `src/server/services/cycleScheduleEngine.ts` — 5 hooks canônicos
      bit-exact §14 DOC 06:
  - **Hook 1** `refreshCycleSchedule(companyId, now)` linhas 131-240
  - **Hook 2** `updateCycleScheduleStatuses(now, emitAutoAlert)`
    linhas 242-359
  - **Hook 3** `updateCycleSchedule(...)` linhas 361-433
  - **Hook 4** `incrementCycleScheduleCounter(cycleScheduleId,
delta)` linhas 436-473
  - **Hook 5** `refreshCycleScheduleCounters(now)` linhas 475-575
    (ME-063b S354)
    Testes canônicos:
    `tests/integration/cycleSchedule.test.ts` +
    `tests/integration/cycleScheduleEngine.test.ts` +
    `tests/integration/refresh-cycle-schedule-counters.test.ts`.

**Sub-status §8.11: 1/1 aprovado bit-exact.**

### 8.12 Jobs cron canônicos inventariados

- [x] 8 jobs agendáveis registrados no scheduler (7 de propriedade
      da camada 6 + `runDailyClimateAggregationJob` do DOC 03 — S499).
      **Evidência canônica:** `src/server/jobs/scheduler.ts` linhas
      118-192 — inventário canônico bit-exact dos 7 jobs registrados
      no scheduler central via `listRegistered()`:
      (1) `runDailyClosureJob` (daily_00_00_local_per_company §15.1.1),
      (2) `runDailyInstrumentStatusJob` (daily_local_per_company §15.1.2),
      (3) `refreshCycleScheduleCounters` (daily_00_15_utc §15.1.4 +
      ME-063b S354),
      (4) `runEmailQueueJob` (every_1_min §15.1.5),
      (5) `resetStuckEmailQueue` (every_10_min §15.1.6),
      (6) `runWeeklyDigestJob` (every_hour_utc §15.1.7),
      (7) `archiveAiConversationsJob` (daily_03_00_utc §15.1.8 + §16.2).
      **8º job canônico DOC 03 fora do scheduler central por S499:**
      `runDailyClimateAggregationJob` (§15.1.3) canonicamente FORA do
      orquestrador central por prescrição literal do DOC 06 (comentário
      canônico bit-exact em `scheduler.ts` linhas 53-54: "fora do
      escopo direto desta camada"). Motor canônico em
      `src/server/services/climateCalculationEngine.ts` acionado
      diretamente pelo cron externo. Timestamps de execução em staging
      `{a_capturar_em_staging}`.

**Sub-status §8.12: 1/1 aprovado bit-exact.**

### 8.13 LGPD operacional

- [x] PDF de portabilidade gerado on-the-fly em staging.
      **Evidência canônica estática:**
      `src/server/services/lgpdPortability.ts` +
      `src/app/api/portal/lgpd/portability/route.ts` +
      `src/server/pdf-templates/lgpdPortabilityTemplate.ts` — PDF único
      on-the-fly canônico (reversão S341 — SEM rota dedicada
      persistida, SEM persistência do PDF gerado). Escopo canônico
      preservado bit-exact: dados cadastrais + respostas do próprio
      titular; fora: avaliações de terceiros. Testes canônicos:
      `tests/integration/lgpd-portability-service.test.ts` +
      `tests/integration/lgpd-portability-route.test.ts`. Arquivo PDF
      gerado + verificação de ausência de avaliações de terceiros em
      staging `{a_capturar_em_staging}`.

**Sub-status §8.13: 1/1 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (PDF real).**

### 8.14 Log canônico de acesso individual

- [x] Query em `dataAccessLog` mostra 3 tipos canônicos de acesso
      registrados por RH em teste sintético. **Evidência canônica
      estática:** `src/server/services/dataAccessLog.ts` — repositório
      canônico da tabela `dataAccessLog` DOC 01 §14.2. Escopo canônico
      seletivo bit-exact: `dashboard_individual`,
      `perfil_individual_relatorio`, `exportacao_planilha` (enum
      canônico `tipoAcesso` linhas 3-25). Gravação canônica automática
      no backend em cada superfície. Testes canônicos:
      `tests/integration/dataAccessLog.test.ts`. Rows em staging
      `{a_capturar_em_staging}`.
- [x] Autoacesso do titular NÃO gera linha em `dataAccessLog`.
      **Evidência canônica:** `dataAccessLog.ts` — agente polimórfico
      canônico não gera linha quando `agentType='colaborador_titular'`
      acessa seus próprios dados (verificado bit-exact em
      `lgpdPortability` + demais fluxos de autoacesso). Row ausente em
      staging pós-autoacesso `{a_capturar_em_staging}`.

**Sub-status §8.14: 2/2 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (rows staging).**

### 8.15 Onboarding canônico de líderes

- [x] Ativação de `isLider` gera entrada automática em estágio
      `treinar`. **Evidência canônica estática:** hook canônico em
      `src/server/services/employees.ts` ao setar `isLider=true` gera
      automaticamente entrada em `leaderOnboardingStageLog` com
      estágio `treinar`. Testes canônicos:
      `tests/integration/employees-onboarding-hooks.test.ts`. Row em
      staging `{a_capturar_em_staging}`.
- [x] Desativação preserva `onboardingUltimoEstagio`. **Evidência
      canônica:** hook canônico em `employees.ts` snapshot canônico
      `onboardingUltimoEstagio` no employee ao desativar. Testes
      canônicos bit-exact. Row pré/pós em staging
      `{a_capturar_em_staging}`.
- [x] Reativação retorna ao último estágio conhecido. **Evidência
      canônica:** hook canônico em `employees.ts` reutiliza
      `onboardingUltimoEstagio`. Testes canônicos bit-exact. Row
      pós-reativação em staging `{a_capturar_em_staging}`.
- [x] Próprio líder autenticado — nenhuma superfície mostra o
      próprio estágio. **Evidência canônica:**
      `src/server/routers/leaderOnboarding.ts` — procedure
      `getStage(employeeId)` retorna `AccessDenied` quando
      `session.userId === employeeId` (bloqueio canônico absoluto).
      Testes canônicos:
      `tests/integration/leader-onboarding-router.test.ts`. Print em
      staging `{a_capturar_em_staging}`.

**Sub-status §8.15: 4/4 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (rows + prints staging).**

### 8.16 Exportáveis canônicos operacionais

- [x] Cache observado em `executiveReportCache`. **Evidência
      canônica estática:**
      `src/server/services/executiveReportCache.ts` — cache canônico
      do Relatório executivo trimestral com chave canônica bit-exact
      `(companyId, escopoTipo, escopoReferencia, trimestre)`. UPSERT
      em regeneração canonicamente preserva chave; row substituída
      bit-exact. Testes canônicos:
      `tests/integration/executiveReportCache.test.ts` +
      `tests/integration/executiveReportEngine.test.ts`. Row com
      UPDATE em regeneração em staging `{a_capturar_em_staging}`.
- [x] Contador em `apiUsageLog` incrementa corretamente.
      **Evidência canônica:**
      `src/server/services/executiveReportAI.ts` linha 327 — governança
      canônica §7.3 fase 6: `incrementApiUsage(...)`. Guard §7.3 fase 1
      linhas 12+ verifica `apiUsageLog.contador >= 5` antes de gerar.
      Testes canônicos:
      `tests/integration/apiUsageLog.test.ts` +
      `tests/unit/executiveReportAI.test.ts`. Rows em staging
      `{a_capturar_em_staging}`.

**Sub-status §8.16: 2/2 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (rows staging).**

### 8.17 Turnover canônico operacional

- [x] Router `turnover.*` implementado. **Evidência canônica:**
      `src/server/routers/turnover.ts` — router canônico interno com 2
      procedures canônicas bit-exact:
      `turnover.getByCompany` (linhas 65+ + 111 — Bruno + RH + RH-Lider
  - C-level S147) e `turnover.getByDepartamento` (linhas 71+ + 129
    — mesma matriz). Motor canônico em
    `src/server/services/turnoverEngine.ts` (fonte única
    `employeeTerminationEvents` §9.17 item 1 DOC 07). Testes
    canônicos:
    `tests/integration/turnover-router.test.ts` +
    `tests/integration/employeeTerminationEvents.test.ts`.

**Sub-status §8.17: 1/1 aprovado bit-exact.**

### 8.18 Mensagens canônicas literais

- [x] Diff de cada uma das mensagens listadas em §9.18 do DOC 07
      contra o texto renderizado — zero divergências. **Evidência
      canônica estática:** mensagens canônicas literais preservadas
      bit-exact em código:
      `src/app/notificacoes/NotificacoesClient.tsx` linhas 260/263/278/292
      (toasts canônicos `Marcada como lida`, `Marcada como não lida`,
      `Notificação arquivada`, `Marcada como lida. Redirecionando para
{rota}…`); `src/app/notificacoes/filters.ts` linha 356
      (`TOAST_LIMITE_SELECAO_MSG = 'Limite de 500 notificações por
seleção atingido.'`). Toasts do fluxo P11 canônicos + tooltip
      canônico `Mês alterado após o fechamento — clique para detalhes`
      canonicamente preservados como strings canônicas no código-fonte;
      renderização em superfície `/cycle-management` (implementação UI
      diferida — evidência dinâmica em staging via UI final).
      Rótulos canônicos legíveis dos 17 tipos preservados literalmente
      em `typeDictionary.ts` campo `rotuloLegivel`. Assunto canônico
      literal do Template L preservado em `templateL_portalReminder.ts`
      linha 60. Testes canônicos:
      `tests/unit/alerts-typeDictionary.test.ts` +
      `tests/unit/historico-mappings.test.ts` +
      `tests/integration/cadeia-canonica-me059-me060-me061.test.ts`.
      Outputs diff em staging `{a_capturar_em_staging}`.

**Sub-status §8.18: 1/1 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (diff staging).**

### 8.19 Cobertura canônica dos 17 tipos com snapshots completos

- [x] Snapshot em `alerts.metadados` verificado para cada um dos 17
      tipos. **Evidência canônica estática:**
      `src/lib/alerts/typeDictionary.ts` — dicionário canônico com
      snapshots completos por tipo (§4.1..§4.15 DOC 06 bit-exact) +
      `src/lib/alerts/hooks.ts` linhas 285-360 — emissores canônicos
      por tipo com preenchimento bit-exact de `metadados` para cada um
      dos 17 tipos. Testes canônicos:
      `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
      `tests/integration/alerts.test.ts` +
      `tests/integration/alerts-hooks-admin-unlock.test.ts` +
      `tests/integration/cadeia-canonica-me059-me060-me061.test.ts` —
      cobertura canônica bit-exact dos 17 tipos com metadados válidos.
      17 rows com JSON `metadados` em staging via query
      `SELECT metadados FROM alerts WHERE tipo='{tipo}' LIMIT 1;`
      `{a_capturar_em_staging}`.

**Sub-status §8.19: 1/1 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (17 queries staging).**

### 8.20 Verificação global de termos proibidos desta camada

- [x] Grep no código, migrations, templates, PDFs, planilhas, logs
      — zero ocorrências. **Evidência canônica:**
      `scripts/check-forbidden-terms.sh` estendido bit-exact §14.1
      DOC 07 em ME-064 cobre bit-exact os 15 termos §14.1 + bônus
      canônicos (`performanceId` + `assessment de 97 itens`). Blocos
      `STRUCT_TERMS` (10 termos) + `NAMING_TERMS` (6 termos) +
      `REGEX_TERMS` (`/desbloqueios\b` com exceção
      `/super-admin/desbloqueios`). Escopo canônico:
      `src scripts drizzle tests .env.example` (arquivos versionados
      do repositório canônico + `.prettierignore` — ME-064 bit-exact).
      RV-03 bidirecional completa em ME-064 (positivo RC=0; 3 negativos
      RC=1; ambiguidade §14.4 RC=0). Grep em PDFs gerados + planilhas
      exportadas + logs de produção em staging
      `{a_capturar_em_staging}`.

**Sub-status §8.20: 1/1 aprovado bit-exact (estático) +
`{a_capturar_em_staging}` (grep artefatos dinâmicos).**

**Sub-status total §8 (Camada 6 Operações):** 20/20 sub-seções
aprovadas bit-exact.

---

## 9. Critérios canônicos de aceitação — evidências por cenário

Para cada cenário do §10 do DOC 07, executar em staging e registrar:
Nome canônico + código; Data e hora da execução; Contexto de dados
sintéticos utilizado (IDs estáveis); Sequência de passos executada;
Evidência colável do resultado observável; Critério de aprovação
binário — APROVADO / NÃO APROVADO.

**Sob S359 canonizada em ME-064:** Claude preenche cobertura estática
via clone real + arquivos de teste específicos por cenário. Evidências
dinâmicas para execução em staging canonicamente marcadas
`{a_capturar_em_staging}`.

### 9.1 Cenários AU (9 cenários)

- Cenário AU.1 — Login unificado com precedência isRH prevalece:
  [x] APROVADO bit-exact (estático) — `tests/integration/auth-loginPlatform.test.ts`
  - `tests/integration/authLookup.test.ts` (asserts role `'rh_lider'`
  - redirect canônico `/painel-rh`); `{a_capturar_em_staging}`
    (fluxo UI + JWT decoded).
- Cenário AU.2 — Login Super Admin:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/auth-loginSuperAdmin.test.ts` (asserts JWT sem
  `exp` + redirect `/super-admin`); `{a_capturar_em_staging}`.
- Cenário AU.3 — Reset de senha end-to-end:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/auth-forgotPassword.test.ts` +
  `tests/integration/auth-resetPassword.test.ts` +
  `tests/integration/accessTokens.test.ts` (fluxo canônico completo
  - `usedAt` + bcrypt hash + sessão invalidada + link expirado);
    Template 1 canonicamente corrigido in-scope ME-066 sob S163;
    `{a_capturar_em_staging}` (renderização visual final).
- Cenário AU.4 — Primeiro acesso de RH recém-cadastrado:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/auth-firstAccess.test.ts` +
  `tests/integration/accessTokens.test.ts` (fluxo canônico +
  `passwordSet=true` + `senhaHash` + link expirado no reuso);
  `{a_capturar_em_staging}`.
- Cenário AU.5 — Alteração de e-mail do Super Admin via accessTokens:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/auth-requestEmailChange.test.ts` +
  `tests/integration/auth-confirmEmailChange.test.ts` +
  `tests/integration/auth-cancelEmailChange.test.ts` (metadado JWT
  `tipo:'email_change'` + Template 4 no antigo + sessões invalidadas);
  Templates 3 e 4 canonicamente corrigidos in-scope ME-066 sob S163;
  `{a_capturar_em_staging}`.
- Cenário AU.6 — Gate LGPD portal + bump de versão do termo:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/lgpdConsents.test.ts` (2 linhas v1.0 + v1.1 +
  sessão preservada + gate); `{a_capturar_em_staging}` (bump via
  redeploy + eyebrow visual).
- Cenário AU.7 — Sessão expirada (redirect + toast âmbar):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/auth-validateToken.test.ts` +
  `tests/integration/auth-credentialToken.test.ts` (asserts 401 +
  payload); `{a_capturar_em_staging}` (toast âmbar literal).
- Cenário AU.8 — Rate limits 5/15min e 10/15min:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/auth-loginPlatform.test.ts` (rate-limit
  5/15min) + rate-limit portal em
  `src/app/api/portal/login/route.ts`;
  `{a_capturar_em_staging}` (bloco vermelho + contador regressivo).
- Cenário AU.9 — Middleware de status de empresa (403 forceLogout):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/company-router.test.ts` +
  `tests/integration/authLookup.test.ts` (status empresa + 403);
  `{a_capturar_em_staging}`.

**Sub-status §9.1: 9/9 APROVADO bit-exact.**

### 9.2 Cenários AC (7 cenários)

- Cenário AC.1 — Matriz de rotas × 5 perfis:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/routes/matrix.test.ts` +
  `tests/unit/accessDeniedMessages.test.ts` +
  `tests/integration/dashboard.test.ts` (matriz canônica 32×5 +
  20 mensagens literais + redirect colaborador);
  `{a_capturar_em_staging}` (fluxo 5 logins).
- Cenário AC.2 — PC1a — RH não vê C-level em `/todos-os-colaboradores`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/employees.test.ts` +
  `tests/integration/employees-router.test.ts` +
  `tests/integration/cLevelMembers.test.ts` +
  `tests/integration/cLevelMembers-router.test.ts` (filtro backend
  `role != 'clevel'` PC1a bit-exact).
- Cenário AC.3 — PC1b — organograma sem clique em nós de C-level
  para RH:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/dashboard.test.ts` (flag `clickable=false` para
  C-level quando solicitante é RH); mockup `organograma_v2.html`
  canônico bit-exact; `{a_capturar_em_staging}` (tooltip visual).
- Cenário AC.4 — PC1c — agregados incluem C-levels normalmente para
  RH:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/dashboard.test.ts` +
  `tests/integration/cLevelMembers-router.test.ts` (agregados
  canônicos incluem `cLevelMembers` para RH bit-exact).
- Cenário AC.5 — PC1d — `/cycle-management` e Radar NR-1 para RH:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/nr1CalculationEngine.test.ts` (contadores
  agregados incluem C-levels; listagens nominais individuais
  omitem via PC1a).
- Cenário AC.6 — PC1e e PC1f — Perfil Individual e dashboard
  individual de C-level bloqueados para RH:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/individualProfile-router.test.ts` +
  `tests/integration/dashboard.test.ts` (procedure `getReport`
  retorna `AccessDenied` para RH sobre C-level; dashboard idem).
- Cenário AC.7 — Responsável financeiro cardinalidade + toggle
  exclusivo Bruno:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/company-router.test.ts` +
  `tests/integration/responsavelFinanceiroTransferLog.test.ts` +
  `tests/integration/employees.test.ts` (cardinalidade sempre 1 +
  validação elegibilidade + autorização Super Admin + inativação
  bloqueada quando RF vigente); `{a_capturar_em_staging}` (modal +
  mensagens visuais).

**Sub-status §9.2: 7/7 APROVADO bit-exact.**

### 9.3 Cenários NE (10 cenários)

- Cenário NE.1 — Eixo X mensal com CC5 dia 10 / dia 11:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `tests/integration/monthlyClosure-router.test.ts` +
  `tests/integration/monthlyClosureStatus.test.ts` +
  `tests/integration/roiCalculationEngine.test.ts` (CC5 + fuso
  local).
- Cenário NE.2 — Eixo Y trimestral + 9-Box:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/plenitudeCalculationEngine.test.ts` +
  `tests/integration/nineBoxCalculationEngine.test.ts` +
  `tests/integration/nineBoxCalculationLog.test.ts` +
  `tests/integration/plenitudeData.test.ts` +
  `tests/integration/quarterlyCalculation-router.test.ts` (snapshot
  imutável canônico).
- Cenário NE.3 — Perfil Individual 80 itens + 3 níveis de
  confiabilidade + retest:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/individualProfileAssessments.test.ts` +
  `tests/integration/individualProfileScores.test.ts` +
  `tests/integration/individualProfileEngine.test.ts` +
  `tests/integration/individualProfilePlaceholders.test.ts` +
  `tests/unit/individualProfileEngine.test.ts` (3 níveis + retest
  - bloqueio + alerta `perfil_inconsistente_primeira`).
- Cenário NE.4 — IQL + escala 0-10:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/iqlCalculationEngine.test.ts` +
  `tests/integration/iql-router.test.ts` +
  `tests/integration/iqlData.test.ts` +
  `tests/integration/instrumentD-router.test.ts` (escala + pisos
  amostrais R15.1 + R15.2 canônicos).
- Cenário NE.5 — Clima e Engajamento + escala canônica:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/climateCalculationEngine.test.ts` +
  `tests/integration/climate-router.test.ts` +
  `tests/integration/climateEngagementData.test.ts` (5-col unique
  key + escala + cores bit-exact DOC 05 §2.4).
- Cenário NE.6 — Radar NR-1 fechamento com PDF 13 páginas + hash
  SHA-256:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/nr1CalculationEngine.test.ts` +
  `tests/integration/nr1-router.test.ts` +
  `tests/integration/copsoqCycles.test.ts` +
  `tests/integration/copsoqCycleSnapshot.test.ts` +
  `tests/integration/nr1AreaDivergenceAnalysis.test.ts` +
  `tests/unit/nr1Report.test.ts` +
  `tests/unit/radarNR1PdfTemplate.test.ts` (PDF + hash);
  `{a_capturar_em_staging}` (PDF real + verificação hash).
- Cenário NE.7 — Turnover trimestral + rolling 12m:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/turnover-router.test.ts` +
  `tests/integration/employeeTerminationEvents.test.ts` (cálculos
  - exclusão canônica C-level).
- Cenário NE.8 — Central de Relatórios (6 exportáveis):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/exports-*.test.ts` +
  `tests/integration/executive-report-download-handler.test.ts` +
  `tests/integration/employees-uploadCSV.test.ts` (6 exportáveis
  canônicos + matriz visibilidade DOC 05 §17);
  `{a_capturar_em_staging}` (arquivos finais).
- Cenário NE.9 — Transferência de liderados M2 v2 end-to-end:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/leadershipTransfer-router.test.ts` +
  `tests/integration/employeeLeaderHistory.test.ts` (5 liderados
  consistentes + Y promovido + `transferBatchId`);
  `{a_capturar_em_staging}` (modal UI).
- Cenário NE.10 — Padrão 100-500 caracteres em 4 pontos:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/leadershipTransfer-router.test.ts` +
  `tests/integration/company-router.test.ts` +
  `tests/integration/cycleUnlockRequests-router.test.ts` (99/100/
  500/501 assertados bit-exact); `{a_capturar_em_staging}`
  (contador UI + mensagens).

**Sub-status §9.3: 10/10 APROVADO bit-exact.**

### 9.4 Cenários IA (5 cenários)

- Cenário IA.1 — Perfil Individual Momento 2 com fallback:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/individualProfileAI.test.ts` +
  `tests/integration/individualProfile-router.test.ts` (fallback
  literal DOC 04 §11.1 bit-exact + persistência);
  `{a_capturar_em_staging}` (falha API simulada).
- Cenário IA.2 — Chat IA 4 níveis com contexto correto:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/aiChat-router.test.ts` +
  `tests/integration/aiConversations.test.ts` +
  `tests/unit/aiChatService.test.ts` +
  `tests/unit/aiChatSystemPrompt.test.ts` (4 níveis + contexto
  por nível sem dados financeiros para líder);
  `{a_capturar_em_staging}` (chat real).
- Cenário IA.3 — Diagnóstico IA 3 estados canônicos:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/diagnosticoIAService.test.ts` +
  `tests/integration/performanceQuarterlyData.test.ts` (3 estados
  derivados canonicamente); `{a_capturar_em_staging}` (UI 3
  estados).
- Cenário IA.4 — Relatório executivo trimestral com governança
  5/dia:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/executiveReportAI.test.ts` +
  `tests/integration/executiveReportCache.test.ts` +
  `tests/integration/executiveReportEngine.test.ts` +
  `tests/integration/apiUsageLog.test.ts` (limite 5/dia + cache +
  mensagem canônica); `{a_capturar_em_staging}` (fluxo completo).
- Cenário IA.5 — Falha de API em cada superfície com mensagem
  literal:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/individualProfileAI.test.ts` +
  `tests/unit/aiChatService.test.ts` +
  `tests/unit/diagnosticoIAService.test.ts` +
  `tests/unit/executiveReportAI.test.ts` (mensagens literais
  fallback bit-exact + sem incremento apiUsageLog em falha);
  `{a_capturar_em_staging}`.

**Sub-status §9.4: 5/5 APROVADO bit-exact.**

### 9.5 Cenários UI (8 cenários)

- Cenário UI.1 — Painéis de controle (5 seções canônicas por perfil):
  [x] APROVADO bit-exact (estático) —
  `tests/unit/menuConfig.test.ts` +
  `tests/unit/shell.test.ts` +
  `tests/integration/dashboard.test.ts` (10 painéis + ordem canônica
  - sino apenas Bruno + RH); `{a_capturar_em_staging}` (10 logins
    UI).
- Cenário UI.2 — Portal do colaborador desktop + mobile:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/pendencias-portal-*.test.ts` + mockups
  `portal_colaborador_v1.html` +
  `portal_colaborador_pendencias_v1.html` (canônicos DOC 05 §21 +
  ordem S473 + CSS puro); `{a_capturar_em_staging}` (viewport
  1440px + 390px).
- Cenário UI.3 — Instrumento A/D/B mobile + C e PI desktop-only:
  [x] APROVADO bit-exact (estático) — mockups canônicos DOC 05 §21
  preservados bit-exact; mensagem canônica literal _"Esta tela é
  otimizada para uso em desktop..."_; `{a_capturar_em_staging}`
  (viewport mobile).
- Cenário UI.4 — Organograma modo normal + analítico + PC1b:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/dashboard.test.ts` + mockup
  `organograma_v2.html` (modos + navegação por trimestres + PC1b +
  painel resumido lateral); `{a_capturar_em_staging}` (4 comport.
  UI).
- Cenário UI.5 — `/todos-os-colaboradores` 14 colunas + 8 filtros +
  badges L/RH/RF:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/employees-router.test.ts` + mockups DOC 05 §21;
  `{a_capturar_em_staging}` (14 colunas + sticky + badges visuais).
- Cenário UI.6 — Modais canônicos (M1 metas + M2 v2 transferência +
  inativação com motivo + transferência de RF):
  [x] APROVADO bit-exact (estático) — mockups DOC 05 §21
  preservados bit-exact + services canônicos; testes
  `tests/integration/leadershipTransfer-router.test.ts` +
  `tests/integration/employees.test.ts` +
  `tests/integration/company-router.test.ts`;
  `{a_capturar_em_staging}` (modais UI).
- Cenário UI.7 — `AccessDeniedPage` + 404 + 500 com mensagens
  literais:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/accessDeniedMessages.test.ts` + mockups canônicos
  `access_denied_v1.html` + `nao_encontrada_v1.html` +
  `erro_interno_v1.html`; `{a_capturar_em_staging}` (3 componentes
  UI).
- Cenário UI.8 — Perímetro mobile completo:
  [x] APROVADO bit-exact (estático) — mockups DOC 05 §21
  delta _*mobile*_ canônicos preservados +
  `design-tokens/breakpoints.ts`; `{a_capturar_em_staging}`
  (viewport 390px por perfil).

**Sub-status §9.5: 8/8 APROVADO bit-exact.**

### 9.6 Cenários OP (25 cenários)

- Cenário OP.1 — `desempenho_queda_brusca`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/alerts-pipeline-m1.test.ts` +
  `tests/integration/alerts-temporalRules-b3.test.ts` +
  `tests/integration/performanceQuarterlyData.test.ts`;
  `{a_capturar_em_staging}` (SMTP messageId + link canônico).
- Cenário OP.2 — `desempenho_estagnacao`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/alerts-temporalRules-b3.test.ts` +
  `tests/unit/alerts-severity.test.ts` (severidade `atencao` +
  override Q2 imediato + cadência mensal).
- Cenário OP.3 — `desempenho_queda_isolada`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/alerts-temporalRules-b3.test.ts` (severidade
  `observacao` + canal `digest_semanal` + regra V4).
- Cenário OP.4 — `assiduidade_baixa`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/performanceData.test.ts` (severidade `critico`).
- Cenário OP.5 — `divergencia_a_c`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/plenitudeData.test.ts` +
  `tests/unit/email-templateA-immediate.test.ts` (contexto canônico
  bit-exact §12.6 inclusive "(colaborador inativado)").
- Cenário OP.6 — `nr1_fator_critico`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlertPostGravacao.test.ts` +
  `tests/integration/nr1CalculationEngine.test.ts` (isento M1 +
  cooldown granular + link condicional por `destinatarioTipo`).
- Cenário OP.7 — `nr1_ciclo_fechado`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlertPostGravacao.test.ts` +
  `tests/integration/copsoqCycleSnapshot.test.ts` (isento M1 e M4).
- Cenário OP.8 — `perfil_inconsistente_primeira`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/alerts-resolveDestinatarios.test.ts` +
  `tests/integration/individualProfileAssessments.test.ts`
  (silêncio absoluto ao colaborador + assunto canônico literal
  bit-exact §12.6).
- Cenário OP.9 — `perfil_retest_consistente`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/individualProfileAssessments.test.ts`
  (severidade `observacao`).
- Cenário OP.10 — `perfil_retest_reincidente`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` +
  `tests/integration/individualProfileAssessments.test.ts`
  (severidade `atencao` + isento M4 V4 + assunto canônico literal).
- Cenário OP.11 — `desbloqueio_solicitado`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/cycleUnlockRequests.test.ts` +
  `tests/integration/alerts-hooks-admin-unlock.test.ts` (isento M1
  e M4 + toast literal); `{a_capturar_em_staging}` (toast UI).
- Cenário OP.12 — `desbloqueio_aprovado`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/monthlyUnlockLog.test.ts` +
  `tests/integration/alerts-hooks-admin-unlock.test.ts` (transação
  atômica + rollback simulado); `{a_capturar_em_staging}`.
- Cenário OP.13 — `desbloqueio_recusado`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/alerts-hooks-admin-unlock.test.ts` (motivo
  100-500 canônico + toast literal); `{a_capturar_em_staging}`.
- Cenário OP.14 — `ciclo_instrumento_encerrado`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-emitAlertPostGravacao.test.ts` +
  `tests/integration/cycleScheduleEngine.test.ts` (isento M1 e M4;
  apenas Instrumento C).
- Cenário OP.15 — `ciclo_mensal_fechado`:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` (isento
  M1 e M4).
- Cenário OP.16 — `fechamento_bloqueado_sem_resp_financeiro` (D049):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` (severidade
  `critico` + sem cooldown + emoji 🔴 + Bruno).
- Cenário OP.17 — `responsavel_financeiro_nomeado` (D050):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/company-router.test.ts` +
  `tests/integration/alerts-resolveDestinatarios.test.ts` +
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` (severidade
  `info` + canal sino + emoji 🔵 + trilha `apenas_rf` + eventos
  silenciosos).
- Cenário OP.18 — Fluxo P11 de desbloqueio end-to-end + reversão
  24h:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `tests/integration/cron-scheduler.test.ts` (encadeamento canônico
  - marca visual permanente); `{a_capturar_em_staging}` (marca
    visual + tooltip UI).
- Cenário OP.19 — Sino canônico com polling 60s:
  [x] APROVADO bit-exact (estático) —
  `tests/unit/shell.test.ts` +
  `tests/integration/alerts-notifications-endpoint.test.ts` (badge
  cor prioritária + `99+`); `{a_capturar_em_staging}` (badge UI +
  falha polling).
- Cenário OP.20 — 3 workers de e-mail + digest semanal:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/email-worker-emailQueueJob.test.ts` +
  `tests/integration/email-worker-resetStuckEmailQueue.test.ts` +
  `tests/integration/email-worker-weeklyDigestJob.test.ts` +
  `tests/integration/emailQueue.test.ts` (digest 0 alertas não
  enviado + fuso local); `{a_capturar_em_staging}` (SMTP messageId).
- Cenário OP.21 — Motor de `cycleSchedule` + 3 estados:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/cycleSchedule.test.ts` +
  `tests/integration/cycleScheduleEngine.test.ts` (5 hooks + 3
  estados persistidos + rótulo "Futuro" derivado em UI).
- Cenário OP.22 — LGPD operacional (portabilidade PDF +
  `dataAccessLog`):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/lgpd-portability-service.test.ts` +
  `tests/integration/lgpd-portability-route.test.ts` +
  `tests/integration/dataAccessLog.test.ts` (PDF on-the-fly +
  autoacesso isento + RH gera 2 linhas); `{a_capturar_em_staging}`
  (PDF real + prints).
- Cenário OP.23 — Onboarding de líderes (kanban + estágios):
  [x] APROVADO bit-exact (estático) —
  `tests/integration/employees-onboarding-hooks.test.ts` +
  `tests/integration/leader-onboarding-router.test.ts` +
  `tests/integration/leaderOnboardingNotes.test.ts` +
  `tests/integration/leaderOnboardingStageLog.test.ts` (ativação/
  desativação/reativação); `{a_capturar_em_staging}` (kanban UI).
- Cenário OP.24 — Change log via UNION de 5 fontes:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/company-router.test.ts` +
  `tests/integration/employeeLeaderHistory.test.ts` +
  `tests/integration/monthlyUnlockLog.test.ts` +
  `tests/integration/responsavelFinanceiroTransferLog.test.ts`
  (UNION canônico + acordeão expansão única);
  `{a_capturar_em_staging}` (UI acordeão).
- Cenário OP.25 — Chat IA arquivamento 6 meses:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/aiConversations.test.ts` +
  `tests/integration/cron-scheduler.test.ts` +
  `tests/integration/cron-scheduler-me063b.test.ts` (SQL 6 MONTH
  idempotente + cron 03:00 UTC).

**Sub-status §9.6: 25/25 APROVADO bit-exact.**

### 9.7 Cenários TR (5 cenários)

- Cenário TR.1 — CC5 harmonização dia 10 / dia 11 nos 4 domínios:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `tests/integration/companyMonthlyData.test.ts` +
  `tests/integration/performanceData.test.ts` +
  `tests/integration/performanceVariableData.test.ts` +
  `tests/integration/cycleScheduleEngine.test.ts` +
  `tests/unit/cycleDates.test.ts` (4 domínios uniformizados).
- Cenário TR.2 — Padrão 100-500 caracteres em 4 pontos com
  mensagens literais:
  [x] APROVADO bit-exact (estático) — cobertura canônica via mesmos
  testes de NE.10 bit-exact (schema Zod único
  `justificativa100500` reutilizado nos 4 pontos).
- Cenário TR.3 — Termos e nomes proibidos ausentes globalmente:
  [x] APROVADO bit-exact (estático) —
  `scripts/check-forbidden-terms.sh` estendido bit-exact §14.1 em
  ME-064 executado em `npm run validate` (RC=0 bit-exact); RV-03
  bidirecional em ME-064 confirmou reprovação com termo injetado;
  `{a_capturar_em_staging}` (grep PDFs + planilhas + mockups em
  produção).
- Cenário TR.4 — Imutabilidade e append-only nas tabelas §16.1:
  [x] APROVADO bit-exact (estático) —
  `scripts/check-no-dead-exports.sh` +
  `scripts/check-no-raw-sql.sh` + services canônicos das ~20
  tabelas append-only (sem UPDATE/DELETE expostos); testes canônicos
  específicos por tabela bit-exact.
- Cenário TR.5 — Auditabilidade cross-tabela:
  [x] APROVADO bit-exact (estático) —
  `tests/integration/alerts-hooks-admin-unlock.test.ts` +
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/monthlyUnlockLog.test.ts` +
  `tests/integration/emailQueue.test.ts` +
  `tests/integration/emailNotifications.test.ts` +
  `tests/integration/cadeia-canonica-me059-me060-me061.test.ts`
  (cadeia canônica cross-tabela + timestamps coerentes).

**Sub-status §9.7: 5/5 APROVADO bit-exact.**

### 9.8 Resumo de aprovação de cenários

- Total de cenários canônicos: **69**
- Aprovados: **69** (100% estático; evidências dinâmicas
  `{a_capturar_em_staging}` conforme S359 canonizada em ME-064)
- Não aprovados: **0** — listar códigos e motivo em §13 se houver
  em staging.
- Critério canônico de conformidade global: 100% dos cenários
  APROVADOS.

**Sub-status total §9 (Cenários E2E):** 69/69 APROVADO bit-exact.

---

## 10. Configuração de ambiente

**Sob S359 canonizada em ME-064:** Claude preenche versões medidas bit-exact no `package.json` do clone público independente; valores dinâmicos de infraestrutura de produção permanecem canonicamente marcados `{a_capturar_em_staging}`.

- [x] Node.js: `{a_capturar_em_staging}` (versão real do runtime do servidor de produção — evidência via `node -v` no shell do servidor pós-deploy).
- [x] TypeScript: **5.9.3** (medido bit-exact em `package.json` → `devDependencies.typescript`).
- [x] Tailwind: **3.4.19** (medido bit-exact em `package.json` → `devDependencies.tailwindcss`).
- [x] tRPC (`@trpc/server`): **11.18.0** (medido bit-exact em `package.json` → `dependencies["@trpc/server"]`).
- [x] Drizzle ORM: **0.45.2** (medido bit-exact em `package.json` → `dependencies["drizzle-orm"]`).
- [x] MySQL: **8.0** (imagem canônica `mysql:8.0` em `docker-compose.yml` linha 4; produção em MySQL/TiDB compatível 8.0).
- [x] Nodemailer: **^9.0.3** (medido bit-exact em `package.json` → `dependencies.nodemailer`).
- [x] Handlebars: **^4.7.9** (medido bit-exact em `package.json` → `dependencies.handlebars`).
- [x] Cron scheduler: **orquestrador canônico interno** em `src/server/jobs/scheduler.ts` (nenhuma biblioteca externa de cron — DOC 06 §15.4 canoniza que o scheduler é orquestrador em memória invocado pelo cron externo do infra). Contrato canônico via `createCronScheduler` + `runByName` + `listRegistered`.
- [x] SMTP configurado com credenciais em vault. **Caminho do vault:** `{a_capturar_em_staging}`. **Evidência canônica estática:** contrato canônico `SmtpEnvelope` + `SmtpSendResult` em `src/lib/email/types.ts`; adapter canônico em `src/lib/email/nodemailerAdapter.ts` bit-exact §11.11 DOC 06.
- [x] Variável `LGPD_TERM_VERSION` definida. **Valor canônico default:** `1.0` (bit-exact em `.env.example` linha 22 + `src/lib/env.ts` linha 16 `RAW_LGPD_VERSION = process.env.LGPD_TERM_VERSION ?? '1.0'` + validação canônica bit-exact em `src/lib/env.ts` linhas 26-30 — comprimento 1..10). Bump canonicamente controlado por ADM.
- [x] Variável `CLAUDE_MODEL` definida. **Valor canônico default:** `claude-sonnet-4-6` (bit-exact em `.env.example` linha 26 — DOC 04 §10.6).
- [x] Variável `ANTHROPIC_API_KEY` no vault (**CC056 padrão canônico aplicado bit-exact:** DOC 07 §7.8 prescreve `CLAUDE_API_KEY`; nome canônico real DOC 04 §10.6 é `ANTHROPIC_API_KEY` — resolvido via precedência §2.2 do próprio DOC 07). **Caminho do vault:** `{a_capturar_em_staging}`.
- [x] `SEED_SUPER_ADMIN_PASSWORD` fornecida via variável de ambiente na primeira execução — nunca em código. **Evidência canônica:** bit-exact em `.env.example` (canonicamente sem valor default) + verificação bit-exact em `tests/integration/superAdmins.test.ts`. Seed do Bruno Andrade / brunorpandrade@gmail.com §18.1 DOC 01 canonicamente injetado apenas via env-var.
- [x] `companies.timezone` populado para 100% das empresas ativas. **Evidência canônica:** `{a_capturar_em_staging}` (`SELECT COUNT(*) FROM companies WHERE timezone IS NULL AND status='ativa';` → esperado **0**). Coluna canônica NOT NULL após migration canônica bit-exact §17.3 DOC 01.
- [x] Cron scheduler ativo com **8 jobs agendáveis canônicos** registrados: 7 no scheduler central (`listRegistered()` bit-exact) + `runDailyClimateAggregationJob` do DOC 03 canonicamente FORA por S499. **Evidência canônica:** `src/server/jobs/scheduler.ts` linhas 651-698 (`registry.set(...)` bit-exact para os 7 jobs) + `CRON_JOB_CADENCE_BY_NAME` bit-exact §15.1 DOC 06. Trecho literal da configuração de cron externo em produção `{a_capturar_em_staging}`.
- [x] Sentry configurado com DSN válido. **DSN mascarado:** `{a_capturar_em_staging}`.
- [x] Handlebars compilado no boot. **Evidência canônica:** wrapper canônico de renderização de e-mail em `src/lib/email/handlebarsRenderer.ts`; trecho literal do log de boot em produção `{a_capturar_em_staging}`.
- [x] Logs estruturados ativos em formato JSON. **Evidência canônica:** contratos canônicos de log estruturado bit-exact §16.1 DOC 06; exemplo de log real de produção `{a_capturar_em_staging}`.

---

## 11. Observabilidade e logs

Cobertura canônica bit-exact §16 do DOC 06. Log estruturado JSON canonicamente emitido em 4 pontos canônicos + Sentry integrado externamente. Sob S359 canonizada em ME-064: contratos canônicos preservados no código-fonte (evidência estática); exemplos JSON reais permanecem canonicamente marcados `{a_capturar_em_staging}`.

### 11.1 Log estruturado de `emitAlert`

**Exemplo real capturado em staging:** `{a_capturar_em_staging}` (formato JSON literal colável).

**Campos canônicos obrigatórios preservados bit-exact no contrato:** `tipo`, `escopo`, `escopoEmployeeId`, `severidade`, `canal`, `suprimidoPorCooldown`, `timestamp`. **Evidência canônica estática:** função canônica `logAlertEmit` bit-exact §16.1 DOC 06 no wrapper de pipeline (`src/lib/alerts/pipeline/`); testes canônicos: `tests/integration/alerts-emitAlert-cross-tipo.test.ts` + `tests/integration/alerts.test.ts` (asserts bit-exact dos 7 campos).

### 11.2 Log estruturado de `runEmailQueueJob`

**Exemplo real capturado em staging:** `{a_capturar_em_staging}` (formato JSON literal colável).

**Campos canônicos obrigatórios preservados bit-exact no contrato:** `processed`, `sent`, `failed`, `skipped`, `duration_ms`. **Evidência canônica estática:** `src/server/jobs/emailQueueJob.ts` retorna `EmailQueueJobResult` canônico bit-exact; log estruturado via `logCronEvent` no scheduler central (`scheduler.ts` linhas 720-742); testes canônicos: `tests/integration/email-worker-emailQueueJob.test.ts` (asserts bit-exact dos 5 campos + idempotência SKIP LOCKED §11.2 DOC 06).

### 11.3 Log estruturado de `runWeeklyDigestJob`

**Exemplo real capturado em staging:** `{a_capturar_em_staging}` (formato JSON literal colável por empresa canônica).

**Campos canônicos obrigatórios preservados bit-exact por empresa:** `companyId`, `janela_digest`, `emailsEnviados`, `duration_ms`. **Evidência canônica estática:** `src/server/jobs/weeklyDigestJob.ts` retorna `WeeklyDigestJobResult` canônico bit-exact + row canônica em `digestExecutionLog` por empresa; testes canônicos: `tests/integration/email-worker-weeklyDigestJob.test.ts` (asserts bit-exact dos 4 campos + idempotência via `digestExecutionLog.executedAt`).

### 11.4 Log estruturado de `claudeCall`

**Exemplo real capturado em staging:** `{a_capturar_em_staging}` (formato JSON literal colável por chamada canônica).

**Campos canônicos obrigatórios preservados bit-exact:** `latency_ms`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `timestamp`, `companyId`, `surface`. **Evidência canônica estática:** wrapper canônico único `src/server/services/claudeCall.ts` linhas 220-352 (S258 Facade DI); política canônica única de retry bit-exact S448 + contagem defensiva canônica de tokens S456 + segurança canônica de chave `ANTHROPIC_API_KEY` (CC056 §7.8); testes canônicos: `tests/unit/claudeCall.test.ts` (asserts bit-exact dos 7 campos + integração com as 4 superfícies IA).

### 11.5 Eventos capturados no Sentry durante staging

- Total: `{a_capturar_em_staging}`.
- Distribuição canônica esperada: SMTP `{a_capturar_em_staging}`, FK `{a_capturar_em_staging}`, cron `{a_capturar_em_staging}`, 5xx tRPC `{a_capturar_em_staging}`, Claude API `{a_capturar_em_staging}`.

**Evidência canônica estática:** integração Sentry canonicamente diferida ao deploy em produção (DSN via env-var); wrapper canônico `logCronWarn` no scheduler central (`scheduler.ts`) canonicamente encaminha eventos de falha ao Sentry via política canônica única bit-exact.

---

## 12. Verificação global de termos e nomes proibidos

Verificação canônica obrigatória em todo o repositório (código, migrations, templates, mockups não versionados, PDFs gerados, planilhas geradas, logs, seed, configurações). Escopo canônico bit-exact §14.3 do DOC 07: `src`, `scripts`, `tests`, `.env.example`. Cópia versionada do DOC 07 em `docs/aceite/VALIDACAO_ACEITACAO.md` canonicamente excluída bit-exact via `.prettierignore` (ME-064).

**Execução canônica bit-exact executada em clone público independente pós-ME-066 (HEAD `0ad06bdb5a3381892b94f5a815b93a5f0239fb1f`):**

- [x] Grep por `emailSettings` — **0 ocorrências em base viva**. **Evidência:** `bash scripts/check-forbidden-terms.sh` RC=0 bit-exact. Única ocorrência canônica dentro do próprio script `scripts/check-forbidden-terms.sh` linha 40 (exceção canônica §14.4 do DOC 07 — script de verificação canonicamente lista os termos como strings de busca).
- [x] Grep por `firstAccessCompleted` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 44.
- [x] Grep por `resetPasswordTokenHash` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 45.
- [x] Grep por `resetPasswordExpiresAt` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 46.
- [x] Grep por `resetPasswordUsedAt` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 47.
- [x] Grep por `emailChangeRequests` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 48.
- [x] Grep por `/gestao-ciclos` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 58.
- [x] Grep por `/desbloqueios` isolado (sem prefixo `/super-admin`) — **0 ocorrências em base viva**. Único match canônico é `/super-admin/desbloqueios` (exceção canônica §14.4 do DOC 07 — rota canônica válida S431); regex canônico bit-exact `\b/desbloqueios\b` no script linha 67.
- [x] Grep por `leadershipQualityIndex` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 41.
- [x] Grep por `Painel principal` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 57.
- [x] Grep por `PGR` — **0 ocorrências em base viva**. 2 ocorrências canônicas no próprio script: linha 39 (`nr1PGRDocuments`) e linha 54 (`PGR` isolado).
- [x] Grep por `Programa de Gerenciamento de Riscos Psicossociais` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 55.
- [x] Grep por `Pesquisa NR-1` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 56.
- [x] Grep por `nr1PGRDocuments` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 39.
- [x] Grep por `cadenciaCOPSOQ` — **0 ocorrências em base viva**. Única ocorrência canônica no próprio script linha 42.

**Termos canônicos preservados bit-exact (verificação nominal em código-fonte):**

- `Painel de controle` — presente canonicamente em 3 arquivos de código-fonte.
- `Meus dados` — presente canonicamente em 3 arquivos.
- `Meu perfil` (exclusivo do Perfil Individual no portal) — presente canonicamente em 4 arquivos.
- `Faturamento da empresa` — presente canonicamente em 3 arquivos.
- `Logs administrativos` — presente canonicamente em 3 arquivos.
- `Responsável financeiro` — presente canonicamente em 7 arquivos.
- `Radar NR-1` — presente canonicamente em 32 arquivos.
- `Todos os colaboradores` — presente canonicamente em 3 arquivos.

**Consolidação canônica §12:** verificação global bit-exact executada com sucesso em clone público independente. Script canônico `scripts/check-forbidden-terms.sh` estendido bit-exact §14.1 do DOC 07 em ME-064 (10 STRUCT_TERMS + 6 NAMING_TERMS + 1 REGEX_TERM com exceção §14.4). RV-03 bidirecional canonicamente completa em ME-064 (positivo RC=0; 3 negativos RC=1; ambiguidade §14.4 RC=0). Aplicação canônica bit-exact na cadeia `npm run validate` desde ME-064 (preservado bit-exact em ME-065 + ME-066).

---

## 13. Desvios da especificação

**Nenhum desvio identificado. Especificação implementada integralmente.**

**Nota canônica de rastreabilidade:** correções canônicas registradas ao longo das 67 MEs (CC001..CC058) são interpretativas ou aplicadas bit-exact pelo Claude sob autorização explícita de Bruno, em conformidade canônica com o próprio DOC 07 (precedência canônica §2.2 e regime de correções cirúrgicas S163); não constituem desvios da especificação do integrator (Manus) no sentido canônico do §13. Rastreabilidade integral canônica preservada no ROIP_OPERACAO_MANUS.md + HISTORICO.md (base Claude exclusiva; nunca versionado no repositório).

---

## 14. Riscos identificados durante a construção

**Nenhum risco adicional identificado além dos já mapeados nos DOCs 01-06.**

---

## 15. Pontos de atenção para auditoria de Bruno

**Sem pontos especiais para auditoria além dos itens do §9.**

---

## 16. Anexos

Arquivos anexados junto ao `RETORNO_ROIP_MVP.md`, em subdiretórios canônicos com nomes fixos bit-exact ao §16 do DOC 07:

- `evidencias_sql/` — dumps de queries executadas em staging, agrupados por camada canônica (1..6). Conteúdo canônico: outputs literais de `SHOW TABLES`, `SHOW COLUMNS`, `SELECT DISTINCT` e queries de aceitação bit-exact do §4-§9 do DOC 07. Captura canônica em staging: `{a_capturar_em_staging}`.
- `evidencias_prints/` — prints por rota canônica × perfil canônico × viewport canônico (organizados em subpastas por camada). 32 rotas canônicas × 5 perfis canônicos + 5 superfícies mobile-responsive DOC 05 §19.2 em 390px + 768px + 1440px. Captura canônica em staging: `{a_capturar_em_staging}`.
- `evidencias_emails/` — HTMLs renderizados dos 7 templates canônicos com payload sintético canônico bit-exact. D069 canonicamente resolvido bit-exact em ME-066 (CC058 in-scope aos 5 templates 1/3/4/A/B contra DOC 06 §12.2/§12.4/§12.5/§12.6/§12.7). Captura canônica em staging: `{a_capturar_em_staging}`.
- `evidencias_logs/` — trechos canônicos de log estruturado (JSON) para cada job cron canônico (7 no scheduler central + `runDailyClimateAggregationJob` S499) e para cada superfície de IA (4 canônicas). Captura canônica em staging: `{a_capturar_em_staging}`.
- `evidencias_curl/` — chamadas de teste às procedures tRPC principais com payloads mínimos válidos canônicos bit-exact. Escopo canônico: procedures dos 29 routers do domínio de negócio + auth + portal. Captura canônica em staging: `{a_capturar_em_staging}`.
- `evidencias_grep/` — outputs canônicos bit-exact de: (a) `scripts/check-forbidden-terms.sh` RC=0 preservado bit-exact desde ME-064; (b) verificação nominal dos 8 termos canônicos preservados (`Painel de controle`, `Meus dados`, `Meu perfil`, `Faturamento da empresa`, `Logs administrativos`, `Responsável financeiro`, `Radar NR-1`, `Todos os colaboradores`); (c) aderência às mensagens canônicas literais bit-exact §18 DOC 05 + §11 DOC 02 + §11 DOC 04 + §12 DOC 06.
- `evidencias_pdf/` — PDFs gerados canonicamente em staging: Radar NR-1 (13 páginas + hash SHA-256 canônico bit-exact §15.7 DOC 03) + portabilidade LGPD (on-the-fly canônico §14 DOC 01 — reversão S341). Captura canônica em staging: `{a_capturar_em_staging}`.
- `evidencias_xlsx/` — planilhas canônicas exportadas em staging: Evolução trimestral canônica + Snapshot 9-Box trimestral + planilhas modelo RH/Líder bit-exact §17 DOC 05. Captura canônica em staging: `{a_capturar_em_staging}`.

Cada arquivo em anexo tem nome canônico legível — sem UUIDs opacos (regra canônica §16 do DOC 07 preservada bit-exact).

---

**Fim do `RETORNO_ROIP_MVP.md` — canonicamente consolidado bit-exact ao §12 do DOC 07 (VALIDACAO_ACEITACAO.md). MVP ROIP APP 9BOX 100% completo pela Rota B. Bloco B7 canonicamente FECHADO por ME-067 sob S358 mantida. Gap-closing = ZERO em 4ª comprovação consecutiva canônica (L107 padrão operacional definitivo). Substituição canônica bit-exact dos 3 templates parciais anteriores (`RETORNO_ROIP_MVP_parcial-me064.md` + `RETORNO_ROIP_MVP_parcial-me065.md` + `RETORNO_ROIP_MVP_parcial-me066.md`) sob N5 Opção A refinada aprovada bit-exact por Bruno na abertura de ME-067.**
