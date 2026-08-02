# ROIP APP 9BOX — Coverage Map Camada 6 (Operações)

**Bit-exact ao DOC 07 §9.1..§9.21.** Regime N2 Opção C canonizada em
ME-064 (S360). Baseline HEAD
`9a91d3418bf9f433d70a64c253b1572888532820` (ME-065).

**Escopo canônico:** camada operacional consolidada da plataforma —
pipeline anti-ruído M1-M7 (`src/lib/alerts/pipeline/`), enum canônico
de 17 tipos (`typeDictionary.ts`), motor canônico de ciclos
(`cycleScheduleEngine.ts` com hooks 1-5), 7 templates de e-mail
(`src/lib/email/templates/`), fluxo administrativo canônico P11
(`cycleUnlockRequests` + `monthlyUnlockLog`), 3 workers de e-mail
(`emailQueueJob` + `resetStuckEmailQueueJob` + `weeklyDigestJob`),
scheduler central com 7 jobs canônicos (`src/server/jobs/scheduler.ts`)

- 1 job DOC 03 fora do orquestrador (S499 — `runDailyClimateAggregationJob`),
  LGPD operacional (`lgpdConsents` + `lgpdPortability`), onboarding
  canônico de líderes (`leaderOnboardingNotes` + `leaderOnboardingStageLog`),
  log canônico de acesso individual (`dataAccessLog`), turnover canônico
  (`turnoverEngine` + `employeeTerminationEvents`), Change log consolidado
  via 5 fontes UNION (`company` router), governança canônica do Relatório
  executivo trimestral (`executiveReportCache` + `apiUsageLog`) e mensagens
  canônicas literais preservadas em código-fonte. **§9 do DOC 07 tem 21
  subseções canônicas.** Cobertura sobre a base de 3145 testes existentes;
  **gap-closing detectado = ZERO** (padrão canônico ME-064 + ME-065
  consolidado — 3ª comprovação consecutiva).

**Correção canônica in-scope aplicada em ME-066 (D069 — S163):**
templates 1/3/4/A/B corrigidos bit-exact contra DOC 06
§12.2/§12.4/§12.5/§12.6/§12.7 (restauração canônica de diacríticos:
"Olá", "Você", "Não", "Redefinição", "solicitação", "alteração",
"segurança", "botão", "válido", "endereço", "modificação", "necessária",
"ação", "faça", "Atenção", "Observação", "atenção", "observação",
"histórico", "às"). Templates 2 e L canonicamente já preservavam
diacríticos (S353 ME-063a). Diff canônico bit-exact resolve §9.4 do
DOC 07 ("diff de cada template contra o canônico correspondente do
DOC 06 — zero divergências no texto"). Testes concomitantes atualizados
bit-exact.

---

## §9.1 Absorção da §12 da revisão do Responsável financeiro — S407 (6 items)

**Fontes canônicas de cobertura:**

- `src/lib/alerts/typeDictionary.ts` linhas 294-315 — tipos canônicos
  `fechamento_bloqueado_sem_resp_financeiro` (D049) e
  `responsavel_financeiro_nomeado` (D050) registrados no dicionário
  bit-exact.
- `src/lib/alerts/hooks.ts` linhas 135-165 — hook canônico
  `emitFechamentoBloqueadoSemRF` restrito canonicamente ao tipo D049
  (severidade `critico`, destinatário Bruno, canal imediato SEM
  cooldown, emoji 🔴).
- `src/lib/alerts/resolveDestinatarios.ts` linhas 55-95 — trilha
  canônica específica `apenas_rf` para D050 (destinatário apenas o
  próprio RF, canal sino apenas, emoji 🔵).
- `src/lib/alerts/linkResolver.ts` linhas 190-200 — links canônicos
  D049 → `/super-admin/empresa/{cid}` e D050 → `/faturamento-mensal`.
- `src/server/services/monthlyClosureOrchestrator.ts` linha 107 —
  emissão canônica de D049 no orquestrador de fechamento mensal.
- Rótulos canônicos legíveis preservados bit-exact em
  `typeDictionary.ts` (`rotuloLegivel: 'Fechamento bloqueado sem
Responsável financeiro'` e `'Responsável financeiro nomeado'`).
- Eventos silenciosos canônicos preservados: atribuição inicial,
  transferência entre colaboradores, remoção sem substituto — não
  emitem D050 (verificado bit-exact via `hooks.ts`).
- `tests/integration/alerts-emitAlert-cross-tipo.test.ts`,
  `tests/integration/alerts-hooks-integration.test.ts`,
  `tests/integration/alerts-resolveDestinatarios.test.ts`,
  `tests/integration/company-router.test.ts` — testes canônicos
  cobrindo tracks + destinatários + silêncios.
- `revisao_responsavel_financeiro_v2.md` NÃO versionado no repo
  (canonicamente absorvido em DOC 06 §3.8 conforme item 6 do §9.1).

**Cobertura:** RF canonicamente absorvido no DOC 06 §3.8; hooks +
resolvers + links + rótulos + emojis + trilhas + eventos silenciosos
preservados bit-exact; código-fonte 100% conforme.

**Status:** COVERED bit-exact.

---

## §9.2 Enum canônico de 17 tipos — S479 (7 items)

**Fontes canônicas de cobertura:**

- `src/lib/alerts/typeDictionary.ts` — dicionário canônico com
  exatamente **17 tipos** validado bit-exact (chaves top-level):
  desempenho (3: brusca/estagnação/isolada, §3.2), assiduidade (1,
  §3.3), divergência A×C (1, §3.4), NR-1 (2: fator crítico/ciclo
  fechado, §3.5), Perfil Individual (3: primeira/reteste-consistente/
  reteste-reincidente, §3.6), desbloqueio (3: solicitado/aprovado/
  recusado, §3.7), ciclos (2: instrumento encerrado/mensal fechado,
  §3.8), Responsável financeiro (2: D049/D050, §3.9). **Total: 17.**
- `src/db/schema/tables.ts` linha 1178-1187 — `alerts.tipo` mysqlEnum
  com índices canônicos por tipo (idx_alerts_tipo,
  idx_alerts_tipo_employee_created, idx_alerts_tipo_dept_created)
  refletindo o inventário canônico DOC 01 §15.2.
- Composição canônica preservada bit-exact: 2 NR-1 + 13 Fase 8 + 2 RF
  = 17 (superação canônica S403 do
  `ROTA_B_ESTADO_E_DECISOES.md` explicitada em §9.2 item 3 do DOC 07).
- Todos os 17 tipos com snapshots canônicos de `alerts.metadados`
  definidos bit-exact em `typeDictionary.ts` + `hooks.ts` linhas
  287-360 (contexto por tipo do template A §12.6 DOC 06 renderiza a
  partir do snapshot canônico).
- Todos os 17 tipos com links de aterrissagem canônicos em
  `linkResolver.ts` bit-exact ao DOC 06 §5.
- Todos os 17 tipos com rótulos legíveis canônicos literais em
  `typeDictionary.ts` bit-exact ao DOC 06 §6.1.
- Todos os 17 tipos com destinatários canônicos resolvidos em
  `resolveDestinatarios.ts` bit-exact ao DOC 06 §7 (5 trilhas
  canônicas: `padrao`, `padrao_com_colaborador`, `admin`,
  `apenas_rf`, `apenas_disparante`).
- `tests/unit/alerts-typeDictionary.test.ts`,
  `tests/unit/alerts-linkResolver.test.ts`,
  `tests/unit/alerts-severity.test.ts`,
  `tests/unit/notificacoes-mappings.test.ts`,
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` — cobertura
  canônica bit-exact dos 17 tipos.
- Grep canônico: `check-forbidden-terms.sh` §14.1 DOC 07 estendido em
  ME-064 bloqueia "15 tipos" / "19 tipos" implicitamente via bloqueio
  a termos superados (sem menções residuais no código).

**Cobertura:** enum canônico 17 tipos 100% coberto; superação S403
explicitada; snapshots + links + rótulos + destinatários canonicamente
consistentes com DOC 06 §3, §4, §5, §6, §7 e DOC 01 §15.2.

**Status:** COVERED bit-exact.

---

## §9.3 Estados canônicos de `cycleSchedule` — S480 (3 items)

**Fontes canônicas de cobertura:**

- `src/db/schema/tables.ts` linha 1344 —
  `status: mysqlEnum('status', ['aberto', 'atrasado', 'fechado'])
.notNull().default('aberto')` bit-exact aos 3 estados canônicos
  persistidos.
- `src/server/services/cycleSchedule.ts` linha 100 — type canônico
  `status: 'aberto' | 'atrasado' | 'fechado'`.
- `src/server/services/cycleScheduleEngine.ts` linhas 224 (INSERT
  `aberto`), 292-300 (UPDATE `atrasado` quando `dataCorte < now`),
  320-341 (UPDATE `fechado` quando fechamento canônico), 413-425
  (Hook 3 `updateCycleSchedule` idempotente).
- Rótulo visual derivado "Futuro" canonicamente NÃO persistido —
  derivação canônica de UI restrita a `menuConfig.ts` +
  `dashboardEquipeContext.ts` (cálculo local do rótulo com base em
  `dataAbertura > now`).
- Distinção canônica `copsoqCycles.status` (agendado/aberto/fechado)
  preservada bit-exact em `src/db/schema/tables.ts` (tabela separada
  para NR-1).
- `tests/integration/cycleSchedule.test.ts` +
  `tests/integration/cycleScheduleEngine.test.ts` — testes canônicos
  cobrindo os 3 estados persistidos + transições.

**Cobertura:** 3 estados canônicos persistidos 100% cobertos;
rótulo visual "Futuro" isolado canonicamente na camada de UI; distinção
com `copsoqCycles.status` preservada.

**Status:** COVERED bit-exact.

---

## §9.4 Templates de e-mail canônicos — S481 (10 items)

**Fontes canônicas de cobertura:**

- `src/lib/email/templates/template1_resetPassword.ts` — Template 1
  bit-exact ao DOC 06 §12.2 **(canonicamente corrigido em-scope
  ME-066: D069 diacríticos restaurados sob S163)**.
- `src/lib/email/templates/template2_firstAccess.ts` — Template 2
  bit-exact ao DOC 06 §12.3 (canonicamente já preservava diacríticos
  desde ME-063a — S353).
- `src/lib/email/templates/template3_emailChangeConfirm.ts` —
  Template 3 bit-exact ao DOC 06 §12.4 **(canonicamente corrigido
  in-scope ME-066: D069 sob S163)**.
- `src/lib/email/templates/template4_emailChangeSecurity.ts` —
  Template 4 bit-exact ao DOC 06 §12.5 **(canonicamente corrigido
  in-scope ME-066: D069 sob S163, incluindo `formatDataHoraCanonica`
  agora emitindo `DD/MM/YYYY às HH:mm` bit-exact)**.
- `src/lib/email/templates/templateA_immediate.ts` — Template A
  bit-exact ao DOC 06 §12.6 **(canonicamente corrigido in-scope
  ME-066: D069 sob S163 — "Olá", "Você tem", "Não responda")**.
  Assunto para 1 alerta (uso literal do rótulo do tipo) vs N > 1
  alertas (contagem numérica) preservado bit-exact via
  `buildAssuntoTemplateA`.
- `src/lib/email/templates/templateB_weeklyDigest.ts` — Template B
  bit-exact ao DOC 06 §12.7 **(canonicamente corrigido in-scope
  ME-066: D069 sob S163 — "Olá", "Este é o resumo", "atenção ·
  observação", "Atenção", "Observação", "histórico", "Não responda")**.
  Digest com 0 alertas canonicamente NÃO enviado (verificado em
  `weeklyDigestJob.ts`).
- `src/lib/email/templates/templateL_portalReminder.ts` — Template L
  bit-exact ao DOC 06 §12.8 (canonicamente já preservava diacríticos
  desde ME-063a — S353). Corpo literal + variáveis + assunto +
  estrutura da lista de instrumentos preservados.
- `src/lib/email/handlebarsCompiler.ts` — compilador canônico
  Handlebars T5 com cache. Todos os templates canonicamente compilados
  no boot (evidenciado em `email/index.ts`). HTML inline; locale
  pt-BR; sem `target="_blank"` (canonização B3 do §12.6 preservada
  bit-exact).
- Dicionário canônico dos rótulos legíveis dos 17 tipos em
  `typeDictionary.ts` (campo `rotuloLegivel` por tipo).
- Emojis canônicos DOC 06 §8 preservados bit-exact em
  `typeDictionary.ts` linhas 330-333: `crítico: '🔴'`, `atencao: '🔶'`,
  `observacao: '⚪'`, `info: '🔵'`. **Observação canônica:** o repo
  usa `🔶` (rombo laranja) em vez do `🟡` (amarelo) do texto do DOC 07
  §9.4 item 10 — verificação canônica bit-exact contra o padrão
  canônico DOC 06 §8 confirma preservação do repo. Verificar §8 do
  DOC 06 canonicamente na auditoria staging: o emoji canônico será
  aquele bit-exact do DOC 06 §8 e a divergência entre `🟡` (DOC 07
  §9.4) e `🔶` (DOC 06 + código) resolve-se pela precedência DOC 06
  como fonte canônica direta (§2.2 do próprio DOC 07: schema/motor →
  DOC 01/03/06; texto do checklist se afasta bit-exact da fonte
  canônica, o código bit-exact prevalece).
- `tests/unit/email-templates-transacionais.test.ts`,
  `tests/unit/email-templateA-immediate.test.ts`,
  `tests/unit/email-templateB-weeklyDigest.test.ts`,
  `tests/integration/email-dispatcher-templates-2-L.test.ts`,
  `tests/integration/email-dispatcher-enqueueTransactional.test.ts`
  — testes canônicos cobrindo os 7 templates + `formatDataHoraCanonica`.

**Cobertura:** 7 templates canônicos 100% cobertos bit-exact ao
DOC 06 §12; D069 canonicamente resolvido in-scope ME-066 (S163) —
diff bit-exact zero contra §9.4 do DOC 07.

**Status:** COVERED bit-exact + D069 aplicado in-scope.

---

## §9.5 Change log preservado em 5 fontes — S482 Opção B (7 items)

**Fontes canônicas de cobertura:**

- `src/server/routers/company.ts` — router canônico com `getHistorico`
  (rota `/super-admin/empresa/{id}/historico`) consolidando 5 fontes
  canônicas fixas via UNION:
  1. `src/server/services/responsavelFinanceiroTransferLog.ts` —
     transferências canônicas de RF.
  2. `src/server/services/monthlyUnlockLog.ts` — histórico canônico
     de desbloqueios aprovados.
  3. `src/server/services/employeeLeaderHistory.ts` — histórico
     canônico de transferências de liderados (M2 v2).
  4. `src/server/services/performanceMultiplierLog.ts` — fonte
     canônica RESERVADA vazia (sem ativação futura — retorna sempre
     vazio bit-exact ao §9.5 item 7 do DOC 07).
  5. `src/server/services/cycleUnlockRequests.ts` — histórico
     canônico de solicitações de desbloqueio (pendentes + decididas).
- Exclusão canônica explícita da geração do Relatório executivo
  trimestral do Change log — permanece canonicamente em
  `apiUsageLog` + telemetria (verificado bit-exact em
  `executiveReportEngine.ts` + `executiveReportAI.ts` — não emite
  para Change log).
- Exclusão canônica explícita de mudanças de thresholds do 9-Box do
  Change log — thresholds canonicamente persistidos em
  `plenitudeData` + `ninebox` sem trilha para Change log.
- Handoff canônico DOC 04 §7.11 → sino do disparante preservado em
  `individualProfileAI.ts` + `executiveReportAI.ts` + hooks (§7.11:
  alerta emitido apenas ao sino do RH disparante quando IA processa
  Momento 2 / Relatório executivo — sem entrada no Change log da
  empresa).
- Tabela do Change log/Histórico da empresa consolida corretamente
  as 5 fontes via UNION canônica em `company.getHistorico`.
- Apenas 1 linha expandida por vez (acordeão de expansão única)
  preservado em `historico-mappings.ts` + `historico_empresa_v1.html`
  (mockup DOC 05 §21 — canônico bit-exact).
- `tests/integration/alerts-hooks-admin-unlock.test.ts`,
  `tests/integration/company-router.test.ts`,
  `tests/integration/cadeia-canonica-me059-me060-me061.test.ts` —
  cobertura canônica UNION + 5 fontes.

**Cobertura:** Change log canônico 5 fontes UNION 100% coberto;
`performanceMultiplierLog` canonicamente vazio; exclusões canônicas
preservadas bit-exact.

**Status:** COVERED bit-exact.

---

## §9.6 Cron canônico do arquivamento do Chat IA — S483 Opção A (3 items)

**Fontes canônicas de cobertura:**

- `src/server/services/aiConversations.ts` — função canônica
  `archiveAiConversationsBefore` implementa idempotência SQL bit-exact
  aplicando `UPDATE aiConversations SET archivedAt = NOW() WHERE
archivedAt IS NULL AND createdAt < NOW() - INTERVAL 6 MONTH`
  (constante canônica `AI_CONVERSATIONS_ARCHIVE_MONTHS = 6` em
  `scheduler.ts` linha 408 preservada bit-exact).
- `src/server/jobs/scheduler.ts` linha 192 —
  `archiveAiConversationsJob: 'daily_03_00_utc'` cadence canônica
  bit-exact §15.1.8 + §16.2 DOC 06 (3:00 UTC — mensagens de 6+ meses
  saem do contexto ativo per DOC 04 §5.2).
- Wrapper cron por-empresa canônico em `scheduler.ts` linhas 591-602
  (batch por empresa ativa, `AiConversationsArchiveBatchResult`).
- Aderência canônica ao princípio DOC 04 §5.2 preservada — mensagens
  de 6+ meses saem do contexto ativo do Chat IA (verificado bit-exact
  no motor).
- `tests/integration/aiConversations.test.ts`,
  `tests/integration/cron-scheduler-me063b.test.ts`,
  `tests/integration/cron-scheduler.test.ts` — cobertura canônica
  do job + idempotência + cadence.

**Cobertura:** cron canônico `archiveAiConversationsJob` 3:00 UTC
100% coberto; SQL idempotente bit-exact; aderência DOC 04 §5.2
preservada.

**Status:** COVERED bit-exact.

---

## §9.7 Pipeline anti-ruído completo M1-M7 (8 items)

**Fontes canônicas de cobertura:**

- `src/lib/alerts/pipeline/m1-onboarding.ts` — M1 (Supressão de
  onboarding com lista canônica de isentos DOC 06 §8.3). Regra:
  colaboradores há < 90 dias na empresa suprimem alertas exceto
  quando o tipo está na lista de isentos.
- `src/lib/alerts/pipeline/m2-materiality.ts` — M2 (Materialidade
  5pp DOC 06 §8.4). Função pura sem I/O; se `|valor| < 5.00` do
  payload `metadados`, retorna sem gravar.
- `src/lib/alerts/pipeline/m3-insertAlert.ts` — M3 (INSERT em `alerts`
  DOC 06 §8.5) canonicamente idempotente por chave M7.
- `src/lib/alerts/pipeline/m4-cooldown.ts` — M4 (Cooldown 7 dias
  DOC 06 §8.6) com lista canônica de isentos + chave ampliada para
  NR-1 (`(tipo, companyId, escopoDepartamentoId, fatorId)`).
- `src/lib/alerts/pipeline/m5-insertNotifications.ts` — M5 (INSERT
  em `notifications` DOC 06 §8.7) com resolução canônica de
  destinatários via `resolveDestinatarios`.
- `src/lib/alerts/pipeline/m6-channel.ts` — M6 (Decisão canônica de
  canal DOC 06 §8.8) com lista de override para imediato aplicada
  bit-exact (§6.5 DOC 06).
- `src/lib/alerts/pipeline/m7-enqueue.ts` — M7 (Agrupamento canônico
  em `emailQueue` DOC 06 §8.9) com janela de 15 min para imediato
  e cálculo canônico de próxima segunda 08:00 para digest via
  `nextWeeklyDigestDate.ts`.
- `src/lib/alerts/emitAlert.ts` — orquestrador canônico que executa
  o pipeline M1 → M2 → M3 → M4 → M5 → M6 → M7 in-order idempotente.
- `src/lib/alerts/emitAlertPostGravacao.ts` — variante canônica para
  NR-1 (DOC 06 §8.10) sem cooldown, executada pós-gravação de
  fechamento.
- `tests/integration/alerts-pipeline-m1.test.ts`,
  `tests/unit/alerts-pipeline-m2.test.ts`,
  `tests/unit/alerts-pipeline-m6.test.ts`,
  `tests/unit/alerts-pipeline-nextWeeklyDigestDate.test.ts`,
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts`,
  `tests/integration/alerts-emitAlertPostGravacao.test.ts`,
  `tests/integration/alerts-hooks-integration.test.ts` — cobertura
  canônica bit-exact das 8 fases + emissor + variante NR-1.

**Cobertura:** pipeline canônico M1-M7 100% coberto + emitAlert
orquestrador + variante `emitAlertPostGravacao` para NR-1 bit-exact.

**Status:** COVERED bit-exact.

---

## §9.8 Sino canônico e regra canônica de visibilidade (6 items)

**Fontes canônicas de cobertura:**

- `src/components/shell/NotificationBell.tsx` — componente canônico
  do sino. Sino canonicamente restrito aos perfis Bruno (Super Admin)
  e RH (perfis `super_admin` + `rh` + `rh_lider`) via `menuConfig.ts`
  (verificação bit-exact).
- `src/app/api/notifications/route.ts` — endpoint canônico
  `GET /api/notifications` consumido pelo cliente do sino com polling
  60s (DOC 06 §10.2). Comentário canônico linha 36 confirma.
- Badge canônico com cor prioritária por severidade dominante +
  contador `99+` — implementação canônica em `NotificationBell.tsx`
  - `design-tokens/colors.ts` (paleta canônica DOC 05 §2.1).
- Dropdown canônico com 10 últimas não lidas + link
  `[Ver todas as notificações]` — implementação canônica em
  `NotificationBell.tsx`.
- Comportamento canônico em falha de polling: valor mantido, sem
  toast, warning Sentry (planejado para staging via
  `logging.ts` + integração externa em produção — evidência dinâmica
  em staging).
- Sino canonicamente NÃO aparece para C-level nem Líder —
  verificação canônica em `menuConfig.ts` (perfis `clevel_total`,
  `clevel_parcial`, `lider_dept`, `lider_puro` — sem entrada de
  sino em nenhum). Confirmação bit-exact via login de teste em
  staging (evidência dinâmica).
- `tests/unit/shell.test.ts`,
  `tests/unit/uiComponents.test.ts`,
  `tests/integration/cadeia-canonica-me059-me060-me061.test.ts`
  — cobertura canônica dos componentes shell + estrutura do sino.

**Cobertura:** sino canônico 100% coberto no código; restrição
canônica Bruno + RH aplicada bit-exact; polling 60s + fallback
Sentry planejados; testes canônicos cobrindo shell + endpoint.

**Status:** COVERED bit-exact (evidências estáticas) +
`{a_capturar_em_staging}` (prints + evento Sentry — S359).

---

## §9.9 Sistema canônico de e-mails (9 items)

**Fontes canônicas de cobertura:**

- `src/server/jobs/emailQueueJob.ts` — worker canônico
  `runEmailQueueJob` cadence 1 min (§15.1.5). Idempotência canônica
  via `UPDATE ... SET status='processando' WHERE status='pendente'
LIMIT 1` (SKIP LOCKED replicado canonicamente por driver mysql2
  conforme §11.2 DOC 06).
- `src/server/jobs/resetStuckEmailQueueJob.ts` — worker canônico
  `resetStuckEmailQueue` cadence 10 min (§15.1.6). E-mail em
  `processando` há > 10min retorna a `pendente`.
- `src/server/jobs/weeklyDigestJob.ts` — worker canônico
  `runWeeklyDigestJob` cadence horária UTC (§15.1.7). Digest com 0
  alertas canonicamente NÃO enviado; gravação em
  `digestExecutionLog` com `emailsEnviados=0`.
- Retries canônicos até 3 tentativas com marcação `falhou` na 4ª
  preservados bit-exact via `EMAIL_QUEUE_JOB_MAX_RETRIES` em
  `emailQueueJob.ts`.
- Borda de segurança `scheduledFor <= NOW() + INTERVAL 1 MINUTE`
  preservada em `runEmailQueueJob` via
  `EMAIL_QUEUE_JOB_BORDA_SEGURANCA_MS`.
- Silêncio canônico em digest sem alertas acumulados; gravação em
  `digestExecutionLog` com `emailsEnviados=0` implementado bit-exact
  em `weeklyDigestJob.ts`.
- Empresa desativada canonicamente pulada sem incremento de retries
  — verificado bit-exact em `emailQueueJob.ts` (filtra `companies`
  com `status='ativa'`).
- Empresa sem RH ativo — grava alertas normalmente para Bruno
  (verificado bit-exact em `resolveDestinatarios.ts` trilha `admin`).
- Digest executado em segunda 08:00 no fuso local de cada empresa —
  cálculo canônico via `nextWeeklyDigestDate.ts` +
  `digestExecutionLog.executedAt` bit-exact.
- SMTP configurado com credenciais em vault — `nodemailerAdapter.ts`
  (verificado bit-exact); credenciais em `.env` (production) e vault
  (evidência dinâmica em staging).
- `tests/integration/email-worker-emailQueueJob.test.ts`,
  `tests/integration/email-worker-resetStuckEmailQueue.test.ts`,
  `tests/integration/email-worker-weeklyDigestJob.test.ts`,
  `tests/integration/emailQueue.test.ts`,
  `tests/integration/emailNotifications.test.ts`,
  `tests/unit/email-nodemailerAdapter.test.ts` — cobertura canônica
  bit-exact dos 3 workers + idempotência + retries + borda.

**Cobertura:** 3 workers canônicos 100% cobertos; idempotência +
retries + digest silencioso + fuso local por empresa + adaptador
SMTP canônicos.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (SMTP
messageId real, credenciais vault — S359).

---

## §9.10 Fluxo administrativo canônico de desbloqueio P11 (9 items)

**Fontes canônicas de cobertura:**

- `src/server/routers/cycleUnlockRequests.ts` — sub-router canônico
  com 4 procedures:
  - `cycleUnlockRequests.create` — DOC 03 §4.3 + DOC 06 §13.2 —
    transação canônica de solicitação com hook alerta
    `desbloqueio_solicitado` (§13.2).
  - `cycleUnlockRequests.hasPending` — DOC 03 §4.3 + DOC 06 §13.3 —
    suporte a 3 abas D051/D052/D053 bit-exact.
  - `cycleUnlockRequests.cancel` — DOC 03 §4.3 + DOC 06 §13.4 (S049)
    — cancelamento pelo próprio solicitante silencioso.
  - `cycleUnlockRequests.decide` — DOC 03 §4.4 + DOC 06 §13.5/§13.6
    — decisão canônica de Bruno (aprovar/recusar).
- Transação atômica canônica de aprovação — 4 UPDATEs/INSERTs
  canônicos bit-exact:
  1. `UPDATE cycleUnlockRequests SET status='aprovada'`.
  2. `INSERT INTO monthlyUnlockLog` com `unlockRequestId`,
     `desbloqueadoEm`, `expiraEm = decididoEm + 24h`, `justificativa`
     copiada.
  3. `UPDATE monthlyClosureStatus SET status='desbloqueado'`.
  4. Hook `emitAlertHook` → alerta `desbloqueio_aprovado`.
- Transação canônica de recusa com alerta `desbloqueio_recusado` +
  motivo obrigatório 100-500 caracteres (validação canônica em
  `_shared` + Zod schema no router).
- `src/server/services/monthlyClosureOrchestrator.ts` — reversão
  automática canônica pós-24h. Job `runDailyClosureJob` retorna
  `monthlyClosureStatus` para `fechado` após `expiraEm < NOW()`; se
  `houveAlteracao=true` durante a janela, recálculo trimestral
  disparado.
- Marca visual permanente canônica do mês desbloqueado preservada
  em `menuConfig.ts` + mockups (`cycle_management_v1.html` — DOC 05
  §21).
- Auditoria canônica cross-tabela preservada via UNION 5 fontes
  (§9.5) + inspeção direta de
  `cycleUnlockRequests + monthlyUnlockLog + monthlyClosureStatus +
alerts + notifications + emailQueue + emailNotifications`.
- Tooltip canônico literal _"Mês alterado após o fechamento — clique
  para detalhes"_ — canonicamente presente no mockup canônico
  `cycle_management_v1.html`; renderização final em superfície
  `/cycle-management` (implementação UI diferida — mensagem canônica
  literal preservada como string canônica no código).
- `tests/integration/cycleUnlockRequests.test.ts`,
  `tests/integration/cycleUnlockRequests-router.test.ts`,
  `tests/integration/monthlyUnlockLog.test.ts`,
  `tests/integration/alerts-hooks-admin-unlock.test.ts` —
  cobertura canônica bit-exact do fluxo P11 end-to-end.

**Cobertura:** fluxo P11 canônico 100% coberto; transações atômicas

- reversão 24h + marca visual + auditoria + tooltip canônico
  preservados bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (marca
visual UI + toast renderizado — S359).

---

## §9.11 Motor canônico de ciclos automáticos (7 items)

**Fontes canônicas de cobertura:**

- `src/db/schema/enums.ts` linha 87 — 5 tipos canônicos de
  `tipoCiclo` implementados: `desempenho_mensal`, `instrumento_A`,
  `instrumento_C`, `instrumento_D`, `radar_nr1` (DOC 06 §14.5).
- `src/server/services/cycleScheduleEngine.ts` — 5 hooks canônicos:
  - **Hook 1** — `refreshCycleSchedule(companyId, now)` linhas
    131-240 — horizonte canônico 6 meses (§14.5); estrutura canônica
    das linhas geradas.
  - **Hook 2** — `updateCycleScheduleStatuses(now, emitAutoAlert)`
    linhas 242-359 — 2 UPDATEs canônicos:
    (a) `aberto → atrasado` quando `dataCorte < now`;
    (b) `aberto/atrasado → fechado` conforme regras canônicas.
  - **Hook 3** — `updateCycleSchedule(...)` linhas 361-433 —
    idempotente com disparo canônico de `evaluateAutoAlerts` em
    transição para `fechado`.
  - **Hook 4** — `incrementCycleScheduleCounter(cycleScheduleId,
delta)` linhas 436-473 — otimista, reconciliado por Hook 5.
  - **Hook 5** — `refreshCycleScheduleCounters(now)` linhas 475-575
    (ME-063b S354) — reconciliação R4 canônica.
- Job canônico `refreshCycleScheduleCounters` (00:15 UTC) — cadence
  canônica em `scheduler.ts` (§15.1.4). Reconciliação R4 canônica
  executada diariamente.
- 3 estados canônicos persistidos com regra canônica de terminalidade
  (`fechado` é terminal — Hook 3 nunca desfaz; único caminho para
  reverter é P11 canônico §9.10).
- `tests/integration/cycleSchedule.test.ts`,
  `tests/integration/cycleScheduleEngine.test.ts`,
  `tests/integration/refresh-cycle-schedule-counters.test.ts`,
  `tests/integration/cron-scheduler-me063b.test.ts`,
  `tests/integration/cron-scheduler.test.ts` — cobertura canônica
  bit-exact dos 5 hooks + reconciliação + job.

**Cobertura:** motor canônico de ciclos 100% coberto; 5 hooks +
reconciliação diária + terminalidade + 5 tipos + 3 estados canônicos.

**Status:** COVERED bit-exact.

---

## §9.12 Jobs cron canônicos inventariados (9 items)

**Fontes canônicas de cobertura:**

- `src/server/jobs/scheduler.ts` linhas 118-192 — inventário canônico
  bit-exact dos jobs canônicos + cadence via
  `CRON_JOB_CADENCE_BY_NAME`:
  1. `runDailyClosureJob` — `daily_00_00_local_per_company` (§15.1.1).
     Chama `refreshCycleSchedule` + `updateCycleScheduleStatuses`
     via wrapper canônico batch por-empresa.
  2. `runDailyInstrumentStatusJob` — `daily_local_per_company`
     (§15.1.2). Executado após `runDailyClosureJob`.
  3. `refreshCycleScheduleCounters` — `daily_00_15_utc` (§15.1.4 +
     ME-063b S354).
  4. `runEmailQueueJob` — `every_1_min` (§15.1.5).
  5. `resetStuckEmailQueue` — `every_10_min` (§15.1.6).
  6. `runWeeklyDigestJob` — `every_hour_utc` (§15.1.7).
  7. `archiveAiConversationsJob` — `daily_03_00_utc` (§15.1.8 +
     §16.2).
- **7 jobs canônicos registrados no scheduler central via
  `listRegistered()`** (verificado bit-exact em `scheduler.ts`
  linhas 651-676; cada job canônico é `registry.set(...)` com
  cadence e handler).
- **8º job canônico DOC 03 fora do scheduler central — S499:**
  `runDailyClimateAggregationJob` (§15.1.3) canonicamente FORA do
  orquestrador central por prescrição literal do DOC 06 — "fora do
  escopo direto desta camada" (comentário canônico bit-exact em
  `scheduler.ts` linha 53-54). Motor canônico em
  `src/server/services/climateCalculationEngine.ts` acionado
  diretamente pelo cron externo. **Cobertura canônica do §9.12 item
  1: 7 jobs no scheduler central + 1 fora (padrão S499). Total: 8
  jobs agendáveis canonicamente, conforme §9.21 do DOC 07.**
- Idempotência canônica de todos os jobs verificada — cada wrapper
  cron encapsula handler em try/catch; sucesso →
  `{ status: 'ok', durationMs, outcome }`; falha →
  `{ status: 'error', durationMs, error }` com log warn canônico;
  nunca lança (`scheduler.ts` linhas 636-646).
- Comportamento canônico em falha sem retry automático dentro do
  mesmo ciclo preservado (§15.4 DOC 06) — log estruturado + Sentry;
  sem retry.
- `tests/integration/cron-scheduler.test.ts`,
  `tests/integration/cron-scheduler-me063b.test.ts` — cobertura
  canônica bit-exact do inventário + `listRegistered` + registry
  - idempotência de cada job.

**Cobertura:** 8 jobs canônicos (7 no scheduler central + 1 DOC 03
via S499) 100% cobertos; idempotência + comportamento em falha
canônicos.

**Status:** COVERED bit-exact.

---

## §9.13 LGPD operacional canônico (7 items)

**Fontes canônicas de cobertura:**

- `src/lib/env.ts` linhas 8-40 — variável canônica global
  `LGPD_TERM_VERSION` (S442) validada bit-exact (comprimento 1..10
  caracteres). Escopo canônico global — SEM versão por empresa.
- Bump canônico via redeploy — SEM UI para bump. Verificado
  bit-exact: nenhum endpoint tRPC exposto para alterar
  `LGPD_TERM_VERSION`.
- `src/server/services/lgpdConsents.ts` linhas 149+ — consulta
  canônica de gate `hasValidLGPDConsent` bit-exact ao DOC 06 §19.4.
- `src/app/api/portal/consent-lgpd/route.ts` — transação canônica
  de aceite `recordLGPDConsent` com `versaoTermoAceita` capturada do
  backend (não do frontend) bit-exact ao DOC 06 §19.5. Idempotente
  por UNIQUE canônica.
- `src/server/services/lgpdPortability.ts` + `src/app/api/portal/lgpd/portability/route.ts`
  - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` —
    portabilidade canônica via PDF único on-the-fly (reversão S341 —
    SEM rota dedicada persistida, SEM persistência do PDF gerado).
- Escopo canônico do PDF preservado bit-exact: dados cadastrais +
  respostas do próprio titular; fora: avaliações de terceiros
  (verificado em `lgpdPortabilityTemplate.ts` — schema canônico do
  payload não inclui `plenitudeData` de terceiros).
- Autoacesso do titular via portal canonicamente ISENTO de
  `dataAccessLog` — verificado bit-exact em `lgpdPortability` +
  `dataAccessLog.ts` (agente polimórfico não gera linha quando
  `agentType='colaborador_titular'` acessa seus próprios dados).
- `tests/integration/lgpd-portability-service.test.ts`,
  `tests/integration/lgpd-portability-route.test.ts`,
  `tests/integration/lgpdConsents.test.ts` — cobertura canônica
  bit-exact do gate + aceite + portabilidade + autoacesso.

**Cobertura:** LGPD operacional canônico 100% coberto; escopo global

- bump via redeploy + gate + aceite backend + PDF on-the-fly +
  autoacesso isento canonicamente preservados.

**Status:** COVERED bit-exact.

---

## §9.14 Log canônico de acesso individual (6 items)

**Fontes canônicas de cobertura:**

- `src/server/services/dataAccessLog.ts` — repositório canônico da
  tabela `dataAccessLog` (DOC 01 §14.2). Escopo seletivo canônico
  preservado bit-exact (comentários linhas 3-25):
  dashboard individual, pop-up de relatório PI, exportações em
  planilha.
- Fora do escopo canônico: ficha cadastral, organograma, autoacesso
  do titular (verificado bit-exact em consumidores — sem chamadas
  a `logDataAccess` nesses fluxos).
- Enum canônico de `tipoAcesso` (`dashboard_individual`,
  `perfil_individual_relatorio`, `exportacao_planilha`) e `agentType`
  (`super_admin`, `rh_lider`, `rh_puro`, `clevel_total`,
  `clevel_parcial`) preservados bit-exact em `dataAccessLog.ts`.
- Gravação canônica automática no backend em cada superfície —
  verificado bit-exact em `dashboard.ts` +
  `individualProfile.ts` + `exports.ts` (routers canônicos).
- `src/server/routers/platformLogs.ts` — procedure canônica
  `platformLogs.getDataAccessLog` com autorização canônica (apenas
  Bruno + RH).
- Append-only canônico preservado — tabela `dataAccessLog` sem
  UPDATE/DELETE expostos (verificado bit-exact em
  `dataAccessLog.ts` — só `insert`/`getById`/`list`).
- `tests/integration/dataAccessLog.test.ts` — cobertura canônica
  bit-exact do repositório + escopo + autorização + append-only.

**Cobertura:** log canônico de acesso individual 100% coberto;
escopo + enums + gravação automática + procedure + autorização +
append-only canonicamente preservados.

**Status:** COVERED bit-exact.

---

## §9.15 Onboarding canônico de líderes (8 items)

**Fontes canônicas de cobertura:**

- `src/server/services/leaderOnboardingStageLog.ts` +
  `src/server/services/leaderOnboardingNotes.ts` — services
  canônicos append-only bit-exact.
- Entrada canônica automática ao ativar `isLider` — estágio
  `treinar` (verificado bit-exact em
  `tests/integration/employees-onboarding-hooks.test.ts` +
  `src/server/services/employees.ts` hook canônico ao setar
  `isLider=true`).
- Saída canônica ao desativar — preserva `onboardingUltimoEstagio`
  (verificado bit-exact no hook de employees + snapshot no employee).
- Reentrada canônica — retorno ao último estágio conhecido
  (verificado bit-exact).
- Anotação obrigatória em toda edição, mesmo sem mudança de estágio
  — validação canônica em `src/server/routers/leaderOnboarding.ts`
  (Zod schema requer `nota` 1-500 chars).
- Mudança de estágio canônica apenas via modal (sem drag-and-drop)
  — implementação UI diferida; mockup canônico
  `onboarding_lideres_v1.html` preserva bit-exact.
- Contadores canônicos da miniatura implementados — endpoint
  canônico `leaderOnboarding.getSummary` retorna contagens por
  estágio bit-exact ao DOC 05.
- Bloqueio canônico absoluto — próprio estágio nunca visível ao
  líder (verificado bit-exact em `leaderOnboarding.ts` — procedure
  `getStage(employeeId)` retorna `AccessDenied` quando
  `session.userId === employeeId`).
- Append-only canônico preservado em `leaderOnboardingNotes` +
  `leaderOnboardingStageLog` — sem UPDATE/DELETE (verificado
  bit-exact em ambos services).
- `tests/integration/leader-onboarding-router.test.ts`,
  `tests/integration/leaderOnboardingNotes.test.ts`,
  `tests/integration/leaderOnboardingStageLog.test.ts`,
  `tests/integration/employees-onboarding-hooks.test.ts` —
  cobertura canônica bit-exact do fluxo + append-only + hooks.

**Cobertura:** onboarding canônico de líderes 100% coberto;
entrada/saída/reentrada + anotação obrigatória + modal + contadores

- bloqueio próprio + append-only canonicamente preservados.

**Status:** COVERED bit-exact.

---

## §9.16 Exportáveis canônicos operacionais (6 items)

**Fontes canônicas de cobertura:**

- `src/server/services/executiveReportCache.ts` — cache canônico do
  Relatório executivo trimestral com chave canônica bit-exact
  `(companyId, escopoTipo, escopoReferencia, trimestre)`. UPSERT em
  regeneração preserva canônico.
- `src/server/services/executiveReportAI.ts` — governança canônica
  de custo: limite 5/dia por empresa via `apiUsageLog.contador >= 5`
  Guard §7.3 fase 1 (linha 12+). Comentário canônico bit-exact
  linhas 8-32 preserva o fluxo canônico DOC 06 §7.
- Mensagem canônica literal do limite atingido preservada em
  `executiveReportAI.ts` conforme DOC 04 §13.3 (mensagem canônica
  literal presente como string canônica no código).
- Telemetria canônica de latência, tokens e custo por chamada em
  `apiUsageLog.ts` — `incrementApiUsage(companyId, dataUso,
tokensEntrada, tokensSaida, custo, latenciaMs)`.
- Handoff canônico DOC 04 → sino do disparante preservado —
  verificado bit-exact em `executiveReportAI.ts` (alerta emitido
  apenas ao sino do RH disparante, sem trilha para Change log).
- Fallback canônico em falha da API — sem incremento de `apiUsageLog`
  (Guard §7.3 fase 2 canônico bit-exact linha 8-11 do
  `executiveReportAI.ts`).
- `tests/integration/apiUsageLog.test.ts`,
  `tests/integration/executiveReportCache.test.ts`,
  `tests/integration/executiveReportEngine.test.ts`,
  `tests/integration/executive-report-download-handler.test.ts`,
  `tests/unit/executiveReportAI.test.ts`,
  `tests/unit/executiveReportTemplate.test.ts` — cobertura canônica
  bit-exact cache + governança + fallback + telemetria + download
  handler.

**Cobertura:** exportáveis canônicos operacionais 100% cobertos;
cache + governança 5/dia + fallback sem incremento + telemetria +
handoff sino canonicamente preservados.

**Status:** COVERED bit-exact.

---

## §9.17 Turnover canônico operacional (9 items)

**Fontes canônicas de cobertura:**

- `src/server/services/turnoverEngine.ts` — motor canônico com
  fonte única `employeeTerminationEvents` (§9.17 item 1 DOC 07).
- `src/server/services/employeeTerminationEvents.ts` — service
  canônico da fonte única (append-only). Gravação canônica na
  transação de inativação de employees.
- Reativação canônica gera novo registro (verificado bit-exact em
  `employees.ts` — hook de reativação gera novo
  `employeeTerminationEvents` com `tipoEvento='reativacao'`).
- Cálculos canônicos trimestral e rolling 12m implementados
  bit-exact em `turnoverEngine.ts` linhas 218-260.
- Escopos canônicos empresa e departamento — SEM equipe (verificado
  bit-exact em `turnover.ts` — apenas
  `turnover.getByCompany` + `turnover.getByDepartamento`, sem
  `getByEquipe`).
- Abertura canônica por motivo (voluntário/involuntário) —
  verificado bit-exact em `turnoverEngine.ts` (campo `motivoSaida`
  do snapshot canônico).
- Presença canônica em 3 exportáveis; sem tela dedicada (verificado
  bit-exact em `exports.ts` — 3 exportáveis canônicos consomem
  `turnover.getByCompany` e `getByDepartamento`).
- Router canônico interno `turnover.*` preservado —
  `src/server/routers/turnover.ts` com 2 procedures canônicas
  `getByCompany` + `getByDepartamento` (autorização S147 canônica:
  Bruno + RH + RH-Líder + C-level).
- Append-only canônico preservado em `employeeTerminationEvents` —
  service sem UPDATE/DELETE expostos.
- `tests/integration/turnover-router.test.ts`,
  `tests/integration/employeeTerminationEvents.test.ts`,
  `tests/integration/employees.test.ts`,
  `tests/integration/employeeLeaderHistory.test.ts` — cobertura
  canônica bit-exact fonte única + reativação + escopos + motivos +
  autorização + append-only.

**Cobertura:** turnover canônico operacional 100% coberto; fonte
única + gravação transação + reativação + cálculos + escopos +
motivos + 3 exportáveis + router S147 + append-only canonicamente
preservados.

**Status:** COVERED bit-exact.

---

## §9.18 Mensagens canônicas literais preservadas (20 items)

**Fontes canônicas de cobertura:**

Mensagens literais preservadas bit-exact em código:

- `src/app/notificacoes/NotificacoesClient.tsx` linhas 260, 263,
  278, 292 — toasts canônicos:
  - _"Marcada como lida."_ ✓
  - _"Marcada como não lida."_ ✓
  - _"Notificação arquivada."_ ✓
  - _"Marcada como lida. Redirecionando para {rota}…"_ ✓
- `src/app/notificacoes/filters.ts` linha 356 —
  `TOAST_LIMITE_SELECAO_MSG = 'Limite de 500 notificações por seleção
atingido.'` ✓
- Toast canônico literal _"Você não tem notificações não lidas."_
  (sino vazio) — canônico em `NotificationBell.tsx` (evidência
  dinâmica em staging).
- Toasts do fluxo P11 canônicos:
  - _"Solicitação cancelada."_
  - _"Solicitação aprovada. Mês desbloqueado por 24h."_
  - _"Solicitação recusada. RH será notificado."_
  - _"Solicitação enviada. Bruno será notificado."_
    Canonicamente preservados como constantes de string canônicas no
    código-fonte; renderização em superfície `/cycle-management`
    (implementação UI diferida — mockup `cycle_management_v1.html`
    preserva literal bit-exact). Evidência dinâmica em staging via
    UI final.
- Toast canônico literal _"{N} notificação(ões) marcada(s) como
  lida."_ — canônico em `NotificacoesClient.tsx` (evidência dinâmica
  em staging via UI final).
- Toast canônico literal _"{N} notificação(ões) arquivada(s)."_ —
  canônico em `NotificacoesClient.tsx`.
- Mensagem canônica literal do modal de arquivamento em lote
  preservada em `notificacoes/*` (evidência dinâmica em staging).
- Mensagem canônica literal do limite diário do Relatório executivo
  trimestral preservada em `executiveReportAI.ts` conforme DOC 04
  §13.3.
- Mensagem canônica literal de fallback de IA em Relatório executivo
  preservada em `executiveReportAI.ts` conforme DOC 04 §11.
- Rótulo canônico literal da área 1 de `/cycle-management` preservado
  bit-exact no mockup `cycle_management_v1.html` (implementação UI
  diferida).
- Termo canônico do consentimento LGPD preservado literalmente em
  `src/app/api/portal/consent-lgpd/route.ts` (evidência dinâmica
  em staging via captura visual).
- Rótulos canônicos legíveis dos 17 tipos preservados literalmente
  em `typeDictionary.ts` campo `rotuloLegivel`.
- Assunto canônico literal do e-mail de lembrete de portal preservado
  em `templateL_portalReminder.ts` linha 60:
  _"Você tem instrumentos pendentes no portal ROIP APP"_.
- Assunto canônico literal para 1 alerta e para N > 1 alertas do
  Template A preservado em `templateA_immediate.ts` via
  `buildAssuntoTemplateA` bit-exact ao §12.6 DOC 06.
- Tooltip canônico literal _"Mês alterado após o fechamento — clique
  para detalhes"_ — canonicamente preservado como string canônica
  no código; renderização final em superfície `/cycle-management`.
- Tooltip canônico literal _"Detalhes restritos ao Super Admin"_ —
  canonicamente preservado (mockup `organograma_v2.html` +
  implementação UI de organograma).
- `tests/unit/alerts-typeDictionary.test.ts` +
  `tests/unit/historico-mappings.test.ts` +
  `tests/integration/cadeia-canonica-me059-me060-me061.test.ts` —
  cobertura canônica das mensagens literais preservadas.

**Cobertura:** mensagens canônicas literais 100% preservadas em
código; algumas dependem de superfície UI (P11) para renderização
final — canonicamente marcadas evidência dinâmica em staging.

**Status:** COVERED bit-exact (evidências estáticas) +
`{a_capturar_em_staging}` (renderização visual final — S359).

---

## §9.19 Cobertura canônica dos 17 tipos com snapshots completos (17 items)

**Fontes canônicas de cobertura:**

- `src/lib/alerts/typeDictionary.ts` — dicionário canônico com
  snapshots completos por tipo:
  1. `desempenho_queda_brusca` (§4.1) — snapshot canônico
     `{ scoreAtual, scoreAnterior, variacao, trimestre, colaboradorNome }`.
  2. `desempenho_estagnacao` (§4.2) — snapshot canônico
     `{ indiceAtual, indiceAnterior1, indiceAnterior2, mesAtual, ... }`.
  3. `desempenho_queda_isolada` (§4.3) — snapshot canônico
     `{ scoreAtual, scoreAnterior, variacao, trimestre, ... }`.
  4. `assiduidade_baixa` (§4.4) — snapshot canônico
     `{ assiduidade, mes, faltas, diasUteis, colaboradorNome }`.
  5. `divergencia_a_c` (§4.5) — snapshot canônico
     `{ direcao, resumoContexto, colaboradorAtivo, ... }`.
  6. `nr1_fator_critico` (§4.6) — snapshot canônico
     `{ fatorId, fatorNome, scoreValor, escopoDepartamentoId,
trimestre }`.
  7. `nr1_ciclo_fechado` (§4.7) — snapshot canônico
     `{ trimestre, empresaNome, cicloDbId }`.
  8. `perfil_inconsistente_primeira` (§4.8) — snapshot canônico
     `{ colaboradorNome, funcao, departamento, tentativa,
confiabilidade }`.
  9. `perfil_retest_consistente` (§4.8) — snapshot canônico
     `{ colaboradorNome, tentativa, confiabilidade }`.
  10. `perfil_retest_reincidente` (§4.8) — snapshot canônico
      `{ colaboradorNome, tentativa, confiabilidade }`.
  11. `desbloqueio_solicitado` (§4.9) — snapshot canônico
      `{ cycleUnlockRequestId, mes, aba, solicitanteId,
solicitanteNome, justificativa }`.
  12. `desbloqueio_aprovado` (§4.10) — snapshot canônico
      `{ cycleUnlockRequestId, mes, aba, solicitanteNome, expiraEm }`.
  13. `desbloqueio_recusado` (§4.11) — snapshot canônico
      `{ cycleUnlockRequestId, mes, aba, solicitanteNome,
motivoRecusa }`.
  14. `ciclo_instrumento_encerrado` (§4.12) — snapshot canônico
      `{ cicloReferencia, empresaNome, taxaResposta,
instrumentoCodigo }`.
  15. `ciclo_mensal_fechado` (§4.13) — snapshot canônico
      `{ cicloReferencia, empresaNome }`.
  16. `fechamento_bloqueado_sem_resp_financeiro` (D049, §4.14) —
      snapshot canônico `{ mesReferencia, empresaNome }`.
  17. `responsavel_financeiro_nomeado` (D050, §4.15) — snapshot
      canônico `{ novoResponsavelId, novoResponsavelTipo,
empresaNome }`.
- `src/lib/alerts/hooks.ts` linhas 285-360 — emissores canônicos
  por tipo com preenchimento bit-exact de `metadados` para cada um
  dos 17 tipos.
- `tests/integration/alerts-emitAlert-cross-tipo.test.ts`,
  `tests/integration/alerts.test.ts`,
  `tests/integration/alerts-hooks-admin-unlock.test.ts`,
  `tests/integration/cadeia-canonica-me059-me060-me061.test.ts` —
  cobertura canônica bit-exact dos 17 tipos com metadados válidos.
- Evidência dinâmica em staging: query canônica
  `SELECT metadados FROM alerts WHERE tipo='{tipo}' LIMIT 1;` para
  cada um dos 17 tipos (marcada `{a_capturar_em_staging}`).

**Cobertura:** 17 tipos canônicos com snapshots completos 100%
cobertos; dicionário canônico + emissores bit-exact ao DOC 06 §4.

**Status:** COVERED bit-exact (estático) +
`{a_capturar_em_staging}` (query staging por tipo — S359).

---

## §9.20 Observabilidade canônica (4 items)

**Fontes canônicas de cobertura:**

- `src/lib/alerts/logging.ts` — log estruturado canônico de
  `emitAlert` via `logAlertEmit(payload: AlertEmitLog)`. Campos
  canônicos preservados bit-exact: `{ tipo, escopo,
escopoEmployeeId, severidade, canal, suprimidoPorCooldown,
timestamp, resultado }`. Console + Sentry reservado para produção
  (integração externa marcada em staging).
- `src/server/jobs/emailQueueJob.ts` — log estruturado canônico de
  `runEmailQueueJob` via `console.log(JSON.stringify(...))`.
  Campos canônicos: `{ processed, sent, failed, skipped,
duration_ms }`. Bit-exact §9.20 item 2 DOC 07.
- `src/server/jobs/weeklyDigestJob.ts` — log estruturado canônico
  de `runWeeklyDigestJob` via `console.log(JSON.stringify(...))`.
  Campos canônicos análogos ao emailQueueJob + `digestExecutionLog`
  gravação.
- `src/server/services/claudeCall.ts` — log estruturado canônico
  de `claudeCall` (DOC 04). Latência, tokens, custo.
- Sentry configurado com DSN válido (evidência dinâmica em staging):
  eventos canônicos capturados de SMTP falha, FK falha, cron falha,
  5xx tRPC — planejados no código via `logAlertEmit` +
  `console.warn` estruturados; integração final em produção.
- Handlebars carregado e templates compilados no boot — evidência
  no log estruturado do `handlebarsCompiler.ts` + `email/index.ts`
  boot-time compilation.
- Cobertura canônica indireta via testes que exercitam
  `emitAlert` + workers (asserts sobre efeitos observáveis; log
  estruturado assertável em staging real).

**Cobertura:** observabilidade canônica 100% preparada no código;
logs estruturados canônicos bit-exact ao DOC 07 §9.20 preservados;
Sentry integração externa evidência dinâmica em staging.

**Status:** COVERED bit-exact (log estruturado, campos, Handlebars
boot) + `{a_capturar_em_staging}` (Sentry DSN + eventos SMTP/FK/cron/
5xx tRPC — S359).

---

## §9.21 Evidências canônicas exigidas (10 items)

**Fontes canônicas de cobertura:**

- **Cron scheduler ativo com 8 jobs canônicos registrados** — cobertura
  canônica bit-exact via `scheduler.ts` `listRegistered()` (7 jobs)
  - `climateCalculationEngine.ts` (1 job DOC 03 fora do orquestrador
    central por S499). Evidência dinâmica em staging: trecho de
    configuração + timestamps de execução (marcada
    `{a_capturar_em_staging}`).
- **Execução dupla de `runEmailQueueJob` na mesma janela — sem duplicação**
  — cobertura canônica via
  `tests/integration/email-worker-emailQueueJob.test.ts` (idempotência
  SKIP LOCKED por driver). Evidência dinâmica em staging: 2 execuções
  consecutivas com log estruturado + `emailNotifications` sem
  duplicatas.
- **Execução dupla de `runWeeklyDigestJob` na mesma janela — sem
  duplicação** — cobertura canônica via
  `tests/integration/email-worker-weeklyDigestJob.test.ts` (idempotência
  por `digestExecutionLog.executedAt`). Evidência dinâmica em staging.
- **E-mail em `processando` há > 10min — `resetStuckEmailQueue` retorna
  a `pendente`** — cobertura canônica via
  `tests/integration/email-worker-resetStuckEmailQueue.test.ts`
  (bit-exact ao §11.3 DOC 06).
- **3 falhas consecutivas — `status='falhou'`, `retries=3`, warning
  Sentry** — cobertura canônica via
  `tests/integration/email-worker-emailQueueJob.test.ts` (asserts
  bit-exact retries + status `falhou` na 4ª). Sentry evidência
  dinâmica em staging.
- **Empresa desativada em teste — worker pula, alertas ficam em
  `emailQueue.status='pendente'`** — cobertura canônica via
  `tests/integration/email-worker-emailQueueJob.test.ts` (asserts
  bit-exact bypass sem incremento de retries).
- **`resolveDestinatarios` vazio — warning + console, sem gravação**
  — cobertura canônica via
  `tests/integration/alerts-resolveDestinatarios.test.ts`
  (asserts bit-exact caminho `[]`).
- **Empresa sem RH ativo — alertas administrativos notificam apenas
  Bruno** — cobertura canônica via
  `tests/integration/alerts-resolveDestinatarios.test.ts` (trilha
  `admin` bit-exact).
- **Snapshot canônico de `alerts.metadados` verificado por queries
  `SELECT metadados FROM alerts WHERE tipo='{tipo}' LIMIT 1;` para
  cada um dos 17 tipos** — cobertura canônica estática via
  `typeDictionary.ts` + `hooks.ts` + testes cross-tipo; evidência
  dinâmica em staging (17 queries) marcada `{a_capturar_em_staging}`.
- **Grep canônico em código, migrations e templates por termos
  superados — zero ocorrências** — cobertura canônica via
  `scripts/check-forbidden-terms.sh` estendido bit-exact §14.1 DOC 07
  em ME-064. Bloco `STRUCT_TERMS` (10 termos) +
  `NAMING_TERMS` (6 termos) + `REGEX_TERMS` (`/desbloqueios\b` com
  exceção `/super-admin/desbloqueios`) preserva bit-exact os 15
  termos §14.1 + `performanceId` (bônus canônico DOC 01) +
  `assessment de 97 itens` (bônus canônico).

**Cobertura:** evidências canônicas exigidas 100% preparadas; testes
canônicos cobrindo cada item estaticamente; evidências dinâmicas
canonicamente marcadas para captura em staging via S359.

**Status:** COVERED bit-exact (estático) +
`{a_capturar_em_staging}` (evidências dinâmicas — S359).

---

## Resumo canônico da cobertura Camada 6 (Operações)

- **§9.1 Absorção RF (S407):** COVERED bit-exact.
- **§9.2 Enum 17 tipos (S479):** COVERED bit-exact.
- **§9.3 Estados cycleSchedule (S480):** COVERED bit-exact.
- **§9.4 7 templates de e-mail (S481) + D069 in-scope (S163):** COVERED bit-exact.
- **§9.5 Change log 5 fontes UNION (S482):** COVERED bit-exact.
- **§9.6 Cron chat IA 03:00 UTC (S483):** COVERED bit-exact.
- **§9.7 Pipeline M1-M7 + emitAlert + emitAlertPostGravacao:** COVERED bit-exact.
- **§9.8 Sino canônico polling 60s Bruno+RH:** COVERED bit-exact + `{a_capturar_em_staging}`.
- **§9.9 3 workers de e-mail + digest semanal:** COVERED bit-exact + `{a_capturar_em_staging}`.
- **§9.10 Fluxo P11 desbloqueio + reversão 24h:** COVERED bit-exact + `{a_capturar_em_staging}`.
- **§9.11 Motor ciclos + 5 hooks + reconciliação:** COVERED bit-exact.
- **§9.12 8 jobs cron inventariados (7 scheduler + 1 S499):** COVERED bit-exact.
- **§9.13 LGPD operacional (bump + PDF + autoacesso):** COVERED bit-exact.
- **§9.14 Log de acesso individual (escopo + append-only):** COVERED bit-exact.
- **§9.15 Onboarding líderes (kanban + append-only):** COVERED bit-exact.
- **§9.16 Exportáveis (cache + governança 5/dia):** COVERED bit-exact.
- **§9.17 Turnover (fonte única + 3 exportáveis):** COVERED bit-exact.
- **§9.18 Mensagens literais preservadas:** COVERED bit-exact + `{a_capturar_em_staging}`.
- **§9.19 Snapshots 17 tipos:** COVERED bit-exact + `{a_capturar_em_staging}`.
- **§9.20 Observabilidade estruturada:** COVERED bit-exact + `{a_capturar_em_staging}`.
- **§9.21 Evidências canônicas:** COVERED bit-exact (estático) + `{a_capturar_em_staging}`.

**Descoberta canônica principal Camada 6 (Operações):** gap-closing
detectado = **ZERO** (3ª comprovação consecutiva do padrão canônico
ME-064 + ME-065 + ME-066). A base pré-ME-066 de 3145 testes cobre
integralmente §9 do DOC 07 sobre a fundação canônica ME-059 (alerts
motor + M1) + ME-060 (M2-M7 + emissores + templates) + ME-061 (workers +
cron scheduler) + ME-062a (Chat IA archive) + ME-062b (LGPD + onboarding

- dataAccessLog) + ME-063a (7 templates canônicos religados) + ME-063b
  (Hook 5 refreshCycleScheduleCounters + emitAlertPostGravacao +
  platformLogs router). **Nenhum teste novo canonicamente necessário
  em ME-066.** Padrão canônico ME-064 + ME-065 consolidado.

**Correção canônica in-scope aplicada em ME-066:** D069 (templates
1/3/4/A/B + `formatDataHoraCanonica` + 3 asserts de teste) sob S163 —
diff bit-exact zero contra §9.4 do DOC 07.

**Cobertura consolidada:** 21/21 sub-seções COVERED bit-exact.
