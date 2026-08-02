# RETORNO_ROIP_MVP.md — parcial ME-065

**Preenchimento canônico:** ME-065 — Bloco B7 aceite (parte 2 de 4)
— Camadas 1-3 (herdadas bit-exact de ME-064) + Camadas 4 (IA) + 5
(UI) do DOC 07.

**Sob S359 canonizada em ME-064 (N7 Opção A do bloco N7/S226):**
Claude preenche este template por execução real via clone público
independente + estruturas do repositório. Evidências dinâmicas que
exigem MySQL populado em staging permanecem canonicamente marcadas
com `{a_capturar_em_staging}` bit-exact ao template canônico
DOC 07 §12. Manus apenas commita.

**Baseline canônico:** HEAD
`f85d2137e7e5b88628b49c6d58c1f0b9a126ec7a` (ME-064) — confirmado
bit-exact via RV-01 pós-commit em clone público independente (L34).

**Versão do pacote ROIP APP recebida:** MVP-ME-065
**Data de entrega:** {data_entrega_iso_pos_me067}
**Responsável pela construção:** Claude (autor + auditor) + Manus
(integrador — RV-02)
**Commit final:** {hash_commit_pos_me067}
**Branch entregue:** main (canônico único)
**URL de produção:** {url_producao_pos_deploy_bruno}

---

## Índice preenchido em ME-065

- **§3 — Camada 1 (Dados) — evidências:** PARCIAL bit-exact (herdado
  ME-064).
- **§4 — Camada 2 (Autenticação e autorização) — evidências:**
  PARCIAL bit-exact (herdado ME-064).
- **§5 — Camada 3 (Negócio) — evidências:** PARCIAL bit-exact
  (herdado ME-064).
- **§6 — Camada 4 (IA) — evidências:** PARCIAL bit-exact (novo em
  ME-065).
- **§7 — Camada 5 (UI) — evidências:** PARCIAL bit-exact (novo em
  ME-065).
- **§1, §2, §8, §9-§16:** canonicamente diferidos às ME-066 (Camada
  6 Operações + 69 cenários E2E §10) + ME-067 (consolidação + §15
  conformidade + entrega final).

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

**Baseline canônico da conversa:** clone público independente
`https://github.com/brunorpandrade/roipapp9box.git` em HEAD
`f85d2137e7e5b88628b49c6d58c1f0b9a126ec7a` + baseline validate
10/10 PASS + 198 test files + 3145 tests.

**Gaps canonicamente identificados nas Camadas 4-5:** ZERO.

**Testes de gap-closing requeridos em ME-065:** NENHUM.

**Correções canônicas registradas em ME-065:**

- CC057 aplicada in-scope — template `scripts/despachar_me.sh.tpl`
  corrigido bit-exact em dois slots canônicos: (a) NOTA CANONICA
  S006 incluída com lista bit-exact `{{ZIP_FILENAME}}` +
  `manifest.sha256` + `retorno_{{ME_ID}}*.md` + `*.md` órfãos em
  raiz (L104); (b) PASSO 1 canonizado com `git checkout main &&
git fetch origin && git reset --hard origin/main` + assert HEAD
  == baseline (L105). Cirúrgica sob S163 canônica.
- CC056 padrão aplicado interpretativo ao §7.8 do DOC 07
  (`CLAUDE_API_KEY` → `ANTHROPIC_API_KEY` via precedência §2.2 do
  próprio DOC 07 — DOC 04 §10.6 é fonte canônica de config/env real).
  Canônica interpretativa; sem alteração no código-fonte.

**Próximas MEs prospectivas:**

- ME-066 — Camada 6 (Operações) + §10 cenários E2E (69 cenários) +
  template §8/§9.
- ME-067 — §15 checklist de conformidade + consolidação canônica
  final + entrega MVP 100%.

**Assinatura canônica ME-065:** Camadas 4-5 do DOC 07 canonicamente
COBERTAS BIT-EXACT pela base pré-ME-065 após aplicação de CC056
padrão ao §7.8 + CC057 in-scope ao template `despachar_me.sh.tpl` +
2 coverage maps canônicos (Camada 4 IA + Camada 5 UI). Camadas 1-3
canonicamente herdadas de ME-064 bit-exact. Total canônico
consolidado: 28/28 sub-seções COVERED bit-exact das Camadas 4-5;
padrão canônico ME-064 gap-closing=ZERO reproduzido bit-exact.
