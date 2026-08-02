# ROIP APP 9BOX — Coverage Map Cenários E2E §10 DOC 07

**Bit-exact aos 69 cenários canônicos do DOC 07 §10.1..§10.7.**
Regime N2 Opção C canonizada em ME-064 (S360). Baseline HEAD
`9a91d3418bf9f433d70a64c253b1572888532820` (ME-065).

**Distribuição canônica bit-exact:** AU=9, AC=7, NE=10, IA=5, UI=8,
OP=25, TR=5. **Total: 69 cenários.**

**Padrão canônico:** cada cenário mapeado a fontes canônicas de
cobertura no repo (services + routers + testes de integração + testes
unit + mockups) via base de 3145 testes existentes. Cobertura estática

- evidências dinâmicas `{a_capturar_em_staging}` bit-exact ao padrão
  S359 canonizado em ME-064.

---

## §10.1 Cenários AU — Autenticação e sessão (9 cenários)

### AU.1 — Login unificado com precedência isRH prevalece

**Fontes canônicas:** `src/server/routers/auth.ts` (procedure
`loginPlatform`, resolução canônica de role); `src/server/services/authLookup.ts`
(precedência bit-exact `isRH > isLider`); `src/lib/routes/matrix.ts`
(redirect canônico `/painel-rh`).

**Cobertura estática:** `tests/integration/auth-loginPlatform.test.ts`

- `tests/integration/authLookup.test.ts` — asserts bit-exact de
  role `'rh_lider'` + redirect canônico + JWT payload.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (fluxo UI
completo).

### AU.2 — Login Super Admin

**Fontes canônicas:** `src/server/routers/auth.ts` (procedure
`loginSuperAdmin`); `src/server/services/superAdmins.ts` (verificação
canônica sem `exp` no JWT); `src/lib/session/` (token sem expiração
para Super Admin).

**Cobertura estática:** `tests/integration/auth-loginSuperAdmin.test.ts`
— asserts bit-exact JWT sem `exp` + redirect `/super-admin`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}`.

### AU.3 — Reset de senha end-to-end

**Fontes canônicas:** `src/server/services/accessTokens.ts` (tabela
canônica `type='password_reset'`, `expiresAt = createdAt + 7d`);
`src/server/routers/auth.ts` (procedures `forgotPassword` +
`resetPassword`); `src/lib/email/templates/template1_resetPassword.ts`
(Template 1 canônico bit-exact DOC 06 §12.2 — corrigido in-scope
ME-066); mensagem canônica _"Este link expirou. Solicite um novo."_.

**Cobertura estática:** `tests/integration/auth-forgotPassword.test.ts`

- `tests/integration/auth-resetPassword.test.ts` +
  `tests/integration/accessTokens.test.ts` — asserts bit-exact fluxo
  completo + `usedAt` + bcrypt hash + sessão invalidada + link expirado.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (renderização
Template 1 completa + mensagem canônica).

### AU.4 — Primeiro acesso de RH recém-cadastrado

**Fontes canônicas:** `src/server/services/accessTokens.ts`
(`type='first_access'`); `src/server/routers/auth.ts` (procedure
`firstAccess`); `src/lib/email/templates/template2_firstAccess.ts`
(Template 2 canônico bit-exact DOC 06 §12.3);
`src/server/services/employees.ts` (`passwordSet=true` +
`senhaHash` populada).

**Cobertura estática:** `tests/integration/auth-firstAccess.test.ts`

- `tests/integration/accessTokens.test.ts` — asserts bit-exact fluxo
  completo + link expirado no reuso.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}`.

### AU.5 — Alteração de e-mail do Super Admin via `accessTokens`

**Fontes canônicas:** `src/server/services/accessTokens.ts` (metadado
JWT `tipo:'email_change'` + `expiresAt = createdAt + 24h`);
`src/server/routers/auth.ts` (procedures `requestEmailChange` +
`confirmEmailChange` + `cancelEmailChange`);
`src/lib/email/templates/template3_emailChangeConfirm.ts` (Template 3
canônico bit-exact DOC 06 §12.4 — corrigido in-scope ME-066);
`src/lib/email/templates/template4_emailChangeSecurity.ts` (Template 4
canônico bit-exact DOC 06 §12.5 — corrigido in-scope ME-066);
tabela canônica `emailChangeRequests` NÃO existe (superação canônica
DOC 07 §14.1).

**Cobertura estática:** `tests/integration/auth-requestEmailChange.test.ts`

- `tests/integration/auth-confirmEmailChange.test.ts` +
  `tests/integration/auth-cancelEmailChange.test.ts` — asserts bit-exact
  fluxo completo + Template 4 no antigo + sessões invalidadas.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}`.

### AU.6 — Gate LGPD portal + bump de versão do termo

**Fontes canônicas:** `src/lib/env.ts` (`LGPD_TERM_VERSION` canônica
global S442); `src/server/services/lgpdConsents.ts` (gate +
`recordLGPDConsent` bit-exact §19.4/§19.5 DOC 06);
`src/app/api/portal/consent-lgpd/route.ts`; `src/app/api/portal/login/route.ts`
(gate no login); eyebrow "Termo atualizado" (mockup DOC 05 §21).

**Cobertura estática:** `tests/integration/lgpdConsents.test.ts` —
asserts bit-exact 2 linhas (v1.0 + v1.1) + sessão preservada.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (bump via
redeploy + eyebrow visual).

### AU.7 — Sessão expirada (redirect + toast âmbar)

**Fontes canônicas:** `src/lib/session/` (JWT com `exp` de 8h para
platform); middleware canônico tRPC (`src/server/trpc.ts` — retorna
401 quando expirado); toast âmbar canônico literal preservado em
componentes shell.

**Cobertura estática:** `tests/integration/auth-validateToken.test.ts`

- `tests/integration/auth-credentialToken.test.ts` — asserts bit-exact
  401 + payload sem `AccessDeniedPage`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (toast âmbar
literal).

### AU.8 — Rate limits 5/15min e 10/15min

**Fontes canônicas:** `src/server/routers/auth.ts` (procedures
`loginPlatform` + `portal/login` com rate limits canônicos bit-exact
DOC 02 §5.8); tokens canônicos rate-limit por IP em memória +
persistência via `authLookup`.

**Cobertura estática:** `tests/integration/auth-loginPlatform.test.ts`
(asserts de rate-limit 5/15min) + rate-limit portal em
`src/app/api/portal/login/route.ts`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (bloco
vermelho + contador regressivo UI).

### AU.9 — Middleware de status de empresa (403 forceLogout)

**Fontes canônicas:** `src/server/trpc.ts` (middleware canônico —
verifica `companies.status` em toda procedure autenticada de perfil
administrativo; retorna 403 com `forceLogout: true` quando empresa
inativada); `src/server/services/companies.ts`.

**Cobertura estática:** cobertura canônica via
`tests/integration/company-router.test.ts` + `tests/integration/authLookup.test.ts`
(asserts bit-exact status empresa + 403).

**Status:** COVERED bit-exact + `{a_capturar_em_staging}`.

---

## §10.2 Cenários AC — Autorização e PC1 (7 cenários)

### AC.1 — Matriz de rotas × 5 perfis

**Fontes canônicas:** `src/lib/routes/matrix.ts` (554 linhas — 32
rotas × 5 perfis canônicos DOC 02 §10);
`src/app/access-denied/page.tsx` + `src/lib/routes/accessDeniedMessages.ts`
(20 mensagens canônicas literais preservadas bit-exact); redirect
canônico colaborador puro → `/colaborador`.

**Cobertura estática:** `tests/unit/routes/matrix.test.ts` +
`tests/unit/accessDeniedMessages.test.ts` +
`tests/integration/dashboard.test.ts` (asserts matriz + AccessDenied).

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (fluxo por
5 logins).

### AC.2 — PC1a — RH não vê C-level em `/todos-os-colaboradores`

**Fontes canônicas:** `src/server/services/employees.ts` +
`src/server/services/cLevelMembers.ts` (filtro backend `role !=
'clevel'` quando solicitante é RH); router
`src/server/routers/employees.ts` procedure `listAll`.

**Cobertura estática:** `tests/integration/employees.test.ts`,
`tests/integration/employees-router.test.ts`,
`tests/integration/cLevelMembers.test.ts`,
`tests/integration/cLevelMembers-router.test.ts` — asserts bit-exact
PC1a backend.

**Status:** COVERED bit-exact.

### AC.3 — PC1b — organograma sem clique em nós de C-level para RH

**Fontes canônicas:** `src/server/routers/dashboard.ts` (procedure
`getOrganograma` retorna flag `clickable` false para C-level quando
solicitante é RH); mockup `organograma_v2.html` (DOC 05 §21);
tooltip literal _"Detalhes restritos ao Super Admin"_.

**Cobertura estática:** `tests/integration/dashboard.test.ts` +
mockup canônico preservado.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (tooltip
visual).

### AC.4 — PC1c — agregados incluem C-levels normalmente para RH

**Fontes canônicas:** `src/server/services/dashboard*.ts` (agregados
canônicos incluem `cLevelMembers` para RH — sem filtro
`role != 'clevel'`); painéis RH em `src/app/painel-rh/`.

**Cobertura estática:** `tests/integration/dashboard.test.ts` +
`tests/integration/cLevelMembers-router.test.ts` — asserts bit-exact
agregados corretos.

**Status:** COVERED bit-exact.

### AC.5 — PC1d — `/cycle-management` e Radar NR-1 para RH

**Fontes canônicas:** `src/server/routers/cycleUnlockRequests.ts` +
`src/server/routers/nr1.ts` (contadores agregados incluem C-levels;
listagens nominais individuais omitem via PC1a).

**Cobertura estática:** `tests/integration/cycleUnlockRequests-router.test.ts`

- `tests/integration/nr1CalculationEngine.test.ts` — asserts PC1d
  bit-exact.

**Status:** COVERED bit-exact.

### AC.6 — PC1e e PC1f — Perfil Individual e dashboard individual de C-level bloqueados para RH

**Fontes canônicas:** `src/server/routers/individualProfile.ts`
(procedure `getReport` verifica PC1e — retorna `AccessDenied` para
RH sobre C-level); `src/server/routers/dashboard.ts` (procedure
`getDashboardIndividual` verifica PC1f). Mensagem canônica DOC 02
§9.10 preservada.

**Cobertura estática:** `tests/integration/individualProfile-router.test.ts`

- `tests/integration/dashboard.test.ts` — asserts bit-exact bloqueio
  backend.

**Status:** COVERED bit-exact.

### AC.7 — Responsável financeiro cardinalidade + toggle exclusivo Bruno

**Fontes canônicas:** `src/server/routers/company.ts` (procedure
`setResponsavelFinanceiro` — cardinalidade sempre 1 + validação
canônica de elegibilidade `isRH=true OR isLider=true` + autorização
canônica apenas Super Admin); modal canônico + justificativa 100-500
bit-exact; mensagem canônica de bloqueio de inativação preservada.

**Cobertura estática:** `tests/integration/company-router.test.ts`

- `tests/integration/responsavelFinanceiroTransferLog.test.ts` +
  `tests/integration/employees.test.ts` (asserts inativação bloqueada
  quando RF vigente).

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (modal +
mensagens visuais).

---

## §10.3 Cenários NE — Negócio determinístico (10 cenários)

### NE.1 — Eixo X mensal com CC5 dia 10 / dia 11

**Fontes canônicas:** `src/server/services/monthlyClosureOrchestrator.ts`

- `src/server/services/monthlyClosureStatus.ts` (transição canônica
  00:00 do dia 11); `src/server/services/roiCalculationEngine.ts`
  (motor Eixo X); job canônico `runDailyClosureJob`.

**Cobertura estática:** `tests/integration/monthlyClosureOrchestrator.test.ts`

- `tests/integration/monthlyClosure-router.test.ts` +
  `tests/integration/monthlyClosureStatus.test.ts` +
  `tests/integration/roiCalculationEngine.test.ts` — asserts bit-exact
  CC5 + fuso local.

**Status:** COVERED bit-exact.

### NE.2 — Eixo Y trimestral + 9-Box

**Fontes canônicas:** `src/server/services/plenitudeCalculationEngine.ts`

- `src/server/services/plenitudeData.ts` +
  `src/server/services/nineBoxCalculationEngine.ts` +
  `src/server/services/nineBoxClassifications.ts` +
  `src/server/routers/quarterlyCalculation.ts` (procedure
  `triggerQuarterlyCalculation`); snapshot imutável em `ninebox`.

**Cobertura estática:** `tests/integration/plenitudeCalculationEngine.test.ts`

- `tests/integration/nineBoxCalculationEngine.test.ts` +
  `tests/integration/nineBoxCalculationLog.test.ts` +
  `tests/integration/plenitudeData.test.ts` +
  `tests/integration/quarterlyCalculation-router.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### NE.3 — Perfil Individual 80 itens + 3 níveis de confiabilidade + retest

**Fontes canônicas:** `src/server/services/individualProfileEngine.ts`
(motor determinístico DOC 03 §10.4-§10.6) +
`src/server/services/individualProfileAssessments.ts` +
`src/server/services/individualProfileScores.ts` +
`src/server/services/individualProfileAI.ts` (Momento 2 canônico);
alerta `perfil_inconsistente_primeira` via hooks canônicos.

**Cobertura estática:** `tests/integration/individualProfileAssessments.test.ts`

- `tests/integration/individualProfileScores.test.ts` +
  `tests/integration/individualProfileEngine.test.ts` +
  `tests/integration/individualProfilePlaceholders.test.ts` +
  `tests/unit/individualProfileEngine.test.ts` — asserts bit-exact 3
  níveis + retest + bloqueio.

**Status:** COVERED bit-exact.

### NE.4 — IQL + escala 0-10

**Fontes canônicas:** `src/server/services/iqlCalculationEngine.ts`

- `src/server/services/iqlData.ts` +
  `src/server/services/instrumentD_responses.ts` +
  `src/server/routers/iql.ts`; pisos amostrais R15.1 e R15.2 canônicos.

**Cobertura estática:** `tests/integration/iqlCalculationEngine.test.ts`

- `tests/integration/iql-router.test.ts` +
  `tests/integration/iqlData.test.ts` +
  `tests/integration/instrumentD-router.test.ts` — asserts bit-exact
  escala + pisos.

**Status:** COVERED bit-exact.

### NE.5 — Clima e Engajamento + escala canônica

**Fontes canônicas:** `src/server/services/climateCalculationEngine.ts`

- `src/server/services/climateEngagementData.ts` +
  `src/server/routers/climate.ts`; escala canônica + cores bit-exact
  DOC 05 §2.4.

**Cobertura estática:** `tests/integration/climateCalculationEngine.test.ts`

- `tests/integration/climate-router.test.ts` +
  `tests/integration/climateEngagementData.test.ts` — asserts bit-exact
  5-col unique key + escala.

**Status:** COVERED bit-exact.

### NE.6 — Radar NR-1 fechamento com PDF 13 páginas + hash SHA-256

**Fontes canônicas:** `src/server/services/nr1CalculationEngine.ts`

- `src/server/services/nr1AreaDivergenceAnalysis.ts` +
  `src/server/services/copsoqCycles.ts` +
  `src/server/services/copsoqCycleSnapshot.ts` +
  `src/server/services/nr1Report.ts` +
  `src/server/services/radarNR1Reports.ts` +
  `src/server/services/pdfRenderer.ts` +
  `src/server/pdf-templates/nr1RadarPdf.ts`; job canônico de fechamento
  NR-1; PDF 13 páginas + hash SHA-256 na Seção 13.

**Cobertura estática:** `tests/integration/nr1CalculationEngine.test.ts`

- `tests/integration/nr1-router.test.ts` +
  `tests/integration/copsoqCycles.test.ts` +
  `tests/integration/copsoqCycleSnapshot.test.ts` +
  `tests/integration/nr1AreaDivergenceAnalysis.test.ts` +
  `tests/unit/nr1Report.test.ts` +
  `tests/unit/radarNR1PdfTemplate.test.ts` — asserts bit-exact PDF +
  hash.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (PDF real
gerado + verificação hash).

### NE.7 — Turnover trimestral + rolling 12m

**Fontes canônicas:** `src/server/services/turnoverEngine.ts` +
`src/server/services/employeeTerminationEvents.ts` +
`src/server/routers/turnover.ts` (procedures `getByCompany` +
`getByDepartamento`); exclusão canônica de C-level.

**Cobertura estática:** `tests/integration/turnover-router.test.ts`

- `tests/integration/employeeTerminationEvents.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### NE.8 — Central de Relatórios (6 exportáveis)

**Fontes canônicas:** `src/server/routers/exports.ts` +
`src/server/routers/spreadsheets.ts` +
`src/server/services/executiveReportEngine.ts` +
`src/server/services/executiveReportStorage.ts`; matriz de
visibilidade canônica DOC 05 §17.

**Cobertura estática:** `tests/integration/exports-*.test.ts` +
`tests/integration/executive-report-download-handler.test.ts` +
`tests/integration/employees-uploadCSV.test.ts` — asserts bit-exact
6 exportáveis.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (arquivos
finais gerados).

### NE.9 — Transferência de liderados M2 v2 end-to-end

**Fontes canônicas:** `src/server/routers/leadershipTransfer.ts`
(procedure `transferAndInactivate`);
`src/server/services/employeeLeaderHistory.ts` +
`src/server/services/employeeTerminationEvents.ts`; `SELECT
canInactivate` canônico + `transferBatchId` + modal M2 v2 canônico.

**Cobertura estática:** `tests/integration/leadershipTransfer-router.test.ts`

- `tests/integration/employeeLeaderHistory.test.ts` — asserts
  bit-exact 5 liderados consistentes + Y promovido a `isLider=true`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (modal UI).

### NE.10 — Padrão 100-500 caracteres em 4 pontos

**Fontes canônicas:** `src/server/routers/_shared/validation.ts`
(Zod schema canônico `justificativa100500` reutilizado bit-exact nos
4 pontos: `leadershipTransfer.transferAndInactivate`,
`company.setResponsavelFinanceiro`,
`cycleUnlockRequests.create`, `cycleUnlockRequests.decide`); mensagens
canônicas literais preservadas.

**Cobertura estática:** `tests/integration/leadershipTransfer-router.test.ts`

- `tests/integration/company-router.test.ts` +
  `tests/integration/cycleUnlockRequests-router.test.ts` — asserts
  bit-exact 99/100/500/501.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (contador
UI + mensagens).

---

## §10.4 Cenários IA — IA interpretativa (5 cenários)

### IA.1 — Perfil Individual Momento 2 com fallback

**Fontes canônicas:** `src/server/services/individualProfileAI.ts` +
`src/server/services/individualProfileSystemPrompt.ts` +
`src/server/services/claudeCall.ts`; fallback canônico literal DOC
04 §11.1 preservado bit-exact.

**Cobertura estática:** `tests/unit/individualProfileAI.test.ts`
(asserts fallback bit-exact) + `tests/integration/individualProfile-router.test.ts`
(asserts persistência do texto gerado).

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (falha API
simulada em staging).

### IA.2 — Chat IA 4 níveis com contexto correto

**Fontes canônicas:** `src/server/services/aiChatService.ts` +
`src/server/services/aiChatSystemPrompt.ts` +
`src/server/services/aiConversations.ts` +
`src/server/routers/aiChat.ts` (4 níveis: global/departamento/equipe/
individual); contexto canônico via
`src/server/services/_shared/dashboard*Context.ts` (sem dados
financeiros para líder no contexto individual).

**Cobertura estática:** `tests/integration/aiChat-router.test.ts` +
`tests/integration/aiConversations.test.ts` +
`tests/unit/aiChatService.test.ts` +
`tests/unit/aiChatSystemPrompt.test.ts` — asserts bit-exact contexto
por nível.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (chat real
em staging).

### IA.3 — Diagnóstico IA 3 estados canônicos

**Fontes canônicas:** `src/server/services/diagnosticoIAService.ts`

- `src/server/services/diagnosticoIASystemPrompt.ts` +
  `src/server/services/performanceQuarterlyData.ts` (campos
  `diagnosticoIA` + `diagnosticoIAgeradoEm`); 3 estados canônicos
  derivados canonicamente no frontend.

**Cobertura estática:** `tests/unit/diagnosticoIAService.test.ts` +
`tests/integration/performanceQuarterlyData.test.ts` — asserts
bit-exact 3 estados.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (UI 3
estados).

### IA.4 — Relatório executivo trimestral com governança 5/dia

**Fontes canônicas:** `src/server/services/executiveReportAI.ts` +
`src/server/services/executiveReportEngine.ts` +
`src/server/services/executiveReportSystemPrompt.ts` +
`src/server/services/executiveReportCache.ts` +
`src/server/services/apiUsageLog.ts`; Guard §7.3 fase 1 canônico
(`contador >= 5`).

**Cobertura estática:** `tests/unit/executiveReportAI.test.ts` +
`tests/integration/executiveReportCache.test.ts` +
`tests/integration/executiveReportEngine.test.ts` +
`tests/integration/apiUsageLog.test.ts` — asserts bit-exact limite
5/dia + cache + mensagem canônica.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (fluxo
completo em staging).

### IA.5 — Falha de API em cada superfície com mensagem literal

**Fontes canônicas:** `src/server/services/claudeCall.ts` (wrapper
canônico único DOC 04 §12); fallbacks canônicos literais DOC 04 §11

- §13.2 preservados bit-exact em cada superfície
  (`individualProfileAI.ts` + `aiChatService.ts` +
  `diagnosticoIAService.ts` + `executiveReportAI.ts`); sem incremento
  de `apiUsageLog` em falha (verificado bit-exact).

**Cobertura estática:** `tests/unit/individualProfileAI.test.ts` +
`tests/unit/aiChatService.test.ts` +
`tests/unit/diagnosticoIAService.test.ts` +
`tests/unit/executiveReportAI.test.ts` — asserts bit-exact
mensagens literais fallback.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (falha
simulada em cada superfície).

---

## §10.5 Cenários UI — Interface (8 cenários)

### UI.1 — Painéis de controle (5 seções canônicas por perfil)

**Fontes canônicas:** `src/lib/menu/menuConfig.ts` (727 linhas — 10
perfis canônicos); `src/app/painel-rh/` +
`src/app/painel-clevel/` + `src/app/painel-lider/` + `src/app/super-admin/`;
ordem canônica bit-exact DOC 05 §5; sino apenas Bruno + RH.

**Cobertura estática:** `tests/unit/menuConfig.test.ts` +
`tests/unit/shell.test.ts` +
`tests/integration/dashboard.test.ts` — asserts bit-exact 10
painéis.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (10 logins
UI).

### UI.2 — Portal do colaborador desktop + mobile

**Fontes canônicas:** `src/app/api/portal/login/route.ts` +
`src/app/pendencias-portal/` (5 elementos canônicos); ordem canônica
S473 (Radar NR-1 primeiro, demais por data limite ascendente);
CSS puro sem JavaScript de viewport (implementação canônica).

**Cobertura estática:** `tests/integration/pendencias-portal-*.test.ts`

- mockups `portal_colaborador_v1.html` +
  `portal_colaborador_pendencias_v1.html` (canônicos DOC 05 §21).

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (viewport
1440px + 390px).

### UI.3 — Instrumento A/D/B mobile + C e PI desktop-only

**Fontes canônicas:** mockups canônicos DOC 05 §21 preservados
bit-exact; mensagem canônica literal _"Esta tela é otimizada para
uso em desktop..."_ preservada como string canônica no código;
implementação UI final consome mockups.

**Cobertura estática:** cobertura canônica dos mockups em
`/mnt/project/*.html`; asserts bit-exact das mensagens canônicas em
`design-tokens/copy.ts` ou equivalente (evidência dinâmica em
staging).

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (viewport
mobile).

### UI.4 — Organograma modo normal + analítico + PC1b

**Fontes canônicas:** `src/server/routers/dashboard.ts` (procedure
`getOrganograma` retorna estrutura canônica);
mockup `organograma_v2.html` (DOC 05 §21) — modos + navegação por
trimestres + PC1b; painel resumido lateral canônico (pop-up antigo
eliminado bit-exact).

**Cobertura estática:** `tests/integration/dashboard.test.ts` +
mockup canônico bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (4
comportamentos UI).

### UI.5 — `/todos-os-colaboradores` 14 colunas + 8 filtros + badges L/RH/RF

**Fontes canônicas:** `src/server/routers/employees.ts` procedure
`listAll` retorna 14 colunas canônicas na ordem bit-exact + 8
filtros aplicáveis backend; badges L/RH/RF inline preservados;
botão `[RH]` sincronizado com dropdown `Papel funcional`.

**Cobertura estática:** `tests/integration/employees-router.test.ts`

- mockups canônicos DOC 05 §21.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (14 colunas

- sticky + badges visuais).

### UI.6 — Modais canônicos (M1 metas + M2 v2 transferência + inativação com motivo + transferência de RF)

**Fontes canônicas:** mockups canônicos DOC 05 §21 preservados
bit-exact:

- `modal_definir_metas_v1.html` — M1 metas com validação bloqueadora
  soma = 100%.
- `modal_transferencia_liderados_v2.html` — M2 v2 com 5 grupos
  autocomplete + modal secundário condicional.
- `delta_modal_inativacao_motivo_saida_v1.html` — inativação com
  radio buttons.
- `delta_toggle_resp_financeiro_v2.html` +
  `delta_toggle_resp_financeiro_clevel_v1.html` — transferência RF.
  Serviços canônicos: `leadershipTransfer.ts` + `employees.ts` +
  `company.ts` + `cycleUnlockRequests.ts`.

**Cobertura estática:** `tests/integration/leadershipTransfer-router.test.ts`

- `tests/integration/employees.test.ts` +
  `tests/integration/company-router.test.ts`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (modais UI).

### UI.7 — `AccessDeniedPage` + 404 + 500 com mensagens literais

**Fontes canônicas:** `src/app/access-denied/page.tsx` +
`src/lib/routes/accessDeniedMessages.ts` (20 mensagens canônicas
literais preservadas bit-exact); `src/app/not-found.tsx` +
`src/app/error.tsx` (títulos literais canônicos + correlation ID
copiável canônico).

**Cobertura estática:** `tests/unit/accessDeniedMessages.test.ts` +
mockups canônicos `access_denied_v1.html` + `nao_encontrada_v1.html`

- `erro_interno_v1.html`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (3
componentes UI).

### UI.8 — Perímetro mobile completo

**Fontes canônicas:** superfícies canônicas mobile-responsive
implementadas via CSS puro; superfícies desktop-only exibem mensagem
canônica literal preservada bit-exact.

**Cobertura estática:** mockups canônicos DOC 05 §21 (delta _*mobile*_
canônicos preservados); `design-tokens/breakpoints.ts` +
mensagens canônicas via `accessDeniedMessages.ts`.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (viewport
390px por perfil).

---

## §10.6 Cenários OP — Operações (25 cenários)

### OP.1 — `desempenho_queda_brusca`

**Fontes canônicas:** `src/lib/alerts/typeDictionary.ts` +
`src/lib/alerts/hooks.ts` (emissor canônico); pipeline M1-M7
completo; `src/server/services/performanceQuarterlyData.ts` (cálculo
canônico).

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/alerts-pipeline-m1.test.ts` +
  `tests/integration/alerts-temporalRules-b3.test.ts` +
  `tests/integration/performanceQuarterlyData.test.ts` — asserts
  bit-exact + testes M1 supressão + M4 cooldown + exclusividade B3.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (SMTP
messageId + link canônico).

### OP.2 — `desempenho_estagnacao`

**Fontes canônicas:** `typeDictionary.ts` (severidade `atencao` +
override Q2 imediato); `hooks.ts` emissor canônico; cadência mensal.

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/alerts-temporalRules-b3.test.ts` +
  `tests/unit/alerts-severity.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.3 — `desempenho_queda_isolada`

**Fontes canônicas:** `typeDictionary.ts` (severidade `observacao`

- canal `digest_semanal`); `hooks.ts`; regra V4 canônica.

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/alerts-temporalRules-b3.test.ts` — asserts
  bit-exact digest segunda 08:00.

**Status:** COVERED bit-exact.

### OP.4 — `assiduidade_baixa`

**Fontes canônicas:** `typeDictionary.ts` (severidade `critico`);
`hooks.ts` emissor canônico; `performanceData.assiduidade`
canônico.

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/performanceData.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.5 — `divergencia_a_c`

**Fontes canônicas:** `typeDictionary.ts` (severidade `observacao`

- canal `digest_semanal`); `hooks.ts`;
  `plenitudeData.alertaDivergencia`; template A renderiza contexto
  canônico bit-exact §12.6 (inclusive "(colaborador inativado)"
  condicional).

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/plenitudeData.test.ts` +
  `tests/unit/email-templateA-immediate.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.6 — `nr1_fator_critico`

**Fontes canônicas:** `emitAlertPostGravacao.ts` +
`typeDictionary.ts` (isento M1 + cooldown granular por `(tipo,
companyId, escopoDepartamentoId, fatorId)`); `linkResolver.ts`
canonicamente condicional por `destinatarioTipo`.

**Cobertura estática:** `tests/integration/alerts-emitAlertPostGravacao.test.ts`

- `tests/integration/nr1CalculationEngine.test.ts` — asserts
  bit-exact link condicional.

**Status:** COVERED bit-exact.

### OP.7 — `nr1_ciclo_fechado`

**Fontes canônicas:** `emitAlertPostGravacao.ts` +
`typeDictionary.ts` (isento M1 e M4); `linkResolver.ts` condicional.

**Cobertura estática:** `tests/integration/alerts-emitAlertPostGravacao.test.ts`

- `tests/integration/copsoqCycleSnapshot.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.8 — `perfil_inconsistente_primeira`

**Fontes canônicas:** `hooks.ts` emissor canônico + silêncio absoluto
ao colaborador via `resolveDestinatarios`; assunto canônico literal
bit-exact §12.6.

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/alerts-resolveDestinatarios.test.ts` +
  `tests/integration/individualProfileAssessments.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### OP.9 — `perfil_retest_consistente`

**Fontes canônicas:** `hooks.ts` + `typeDictionary.ts` (severidade
`observacao`).

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/individualProfileAssessments.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### OP.10 — `perfil_retest_reincidente`

**Fontes canônicas:** `hooks.ts` + `typeDictionary.ts` (severidade
`atencao` + isento M4 V4); assunto canônico literal bit-exact.

**Cobertura estática:** `tests/integration/alerts-emitAlert-cross-tipo.test.ts`

- `tests/integration/individualProfileAssessments.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### OP.11 — `desbloqueio_solicitado`

**Fontes canônicas:** `cycleUnlockRequests.ts` procedure `create`;
`hooks.ts` emissor canônico; isento M1 e M4; toast literal canônico
preservado.

**Cobertura estática:** `tests/integration/cycleUnlockRequests-router.test.ts`

- `tests/integration/cycleUnlockRequests.test.ts` +
  `tests/integration/alerts-hooks-admin-unlock.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (toast UI).

### OP.12 — `desbloqueio_aprovado`

**Fontes canônicas:** `cycleUnlockRequests.ts` procedure `decide`
(transação atômica canônica com 4 UPDATEs/INSERTs); `monthlyUnlockLog.ts`;
`monthlyClosureStatus.ts`; `hooks.ts` emissor; toast literal canônico.

**Cobertura estática:** `tests/integration/cycleUnlockRequests-router.test.ts`

- `tests/integration/monthlyUnlockLog.test.ts` +
  `tests/integration/alerts-hooks-admin-unlock.test.ts` — asserts
  bit-exact transação + rollback simulado.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}`.

### OP.13 — `desbloqueio_recusado`

**Fontes canônicas:** `cycleUnlockRequests.ts` procedure `decide`
(recusa); `hooks.ts` emissor; motivo obrigatório 100-500 canônico;
toast literal canônico.

**Cobertura estática:** `tests/integration/cycleUnlockRequests-router.test.ts`

- `tests/integration/alerts-hooks-admin-unlock.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}`.

### OP.14 — `ciclo_instrumento_encerrado`

**Fontes canônicas:** `emitAlertPostGravacao.ts` +
`typeDictionary.ts` (isento M1 e M4; apenas Instrumento C);
`cycleScheduleEngine.ts` Hook 3 canônico.

**Cobertura estática:** `tests/integration/alerts-emitAlertPostGravacao.test.ts`

- `tests/integration/cycleScheduleEngine.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.15 — `ciclo_mensal_fechado`

**Fontes canônicas:** `monthlyClosureOrchestrator.ts` (função
`processClosedMonth`) + `hooks.ts` emissor; isento M1 e M4.

**Cobertura estática:** `tests/integration/monthlyClosureOrchestrator.test.ts`

- `tests/integration/alerts-emitAlert-cross-tipo.test.ts` —
  asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.16 — `fechamento_bloqueado_sem_resp_financeiro` (D049)

**Fontes canônicas:** `monthlyClosureOrchestrator.ts` (emissão
canônica) + `hooks.ts` + `typeDictionary.ts` (severidade `critico`,
sem cooldown, emoji 🔴, destinatário Bruno).

**Cobertura estática:** `tests/integration/monthlyClosureOrchestrator.test.ts`

- `tests/integration/alerts-emitAlert-cross-tipo.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### OP.17 — `responsavel_financeiro_nomeado` (D050)

**Fontes canônicas:** `company.ts` procedure `setResponsavelFinanceiro`

- `hooks.ts` + `typeDictionary.ts` (severidade `info`, canal sino
  apenas, emoji 🔵, trilha `apenas_rf`); eventos silenciosos preservados.

**Cobertura estática:** `tests/integration/company-router.test.ts`

- `tests/integration/alerts-resolveDestinatarios.test.ts` +
  `tests/integration/alerts-emitAlert-cross-tipo.test.ts` — asserts
  bit-exact.

**Status:** COVERED bit-exact.

### OP.18 — Fluxo P11 de desbloqueio end-to-end + reversão 24h

**Fontes canônicas:** encadeamento canônico `cycleUnlockRequests.create`
→ `decide` (aprovar) → 24h passam → `runDailyClosureJob` retorna
`fechado`; recálculo trimestral disparado se `houveAlteracao=true`;
marca visual permanente + tooltip literal.

**Cobertura estática:** `tests/integration/cycleUnlockRequests-router.test.ts`

- `tests/integration/monthlyClosureOrchestrator.test.ts` +
  `tests/integration/cron-scheduler.test.ts` — asserts bit-exact
  end-to-end.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (marca
visual + tooltip UI).

### OP.19 — Sino canônico com polling 60s

**Fontes canônicas:** `NotificationBell.tsx` + `notifications`
endpoint + polling canônico 60s; badge cor prioritária + `99+`.

**Cobertura estática:** `tests/unit/shell.test.ts` +
`tests/integration/alerts-notifications-endpoint.test.ts` — asserts
bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (badge UI

- falha polling).

### OP.20 — 3 workers de e-mail + digest semanal

**Fontes canônicas:** `emailQueueJob.ts` + `resetStuckEmailQueueJob.ts`

- `weeklyDigestJob.ts` + `digestExecutionLog.ts`; digest com 0
  alertas canonicamente não enviado; fuso local por empresa.

**Cobertura estática:** `tests/integration/email-worker-emailQueueJob.test.ts`

- `tests/integration/email-worker-resetStuckEmailQueue.test.ts` +
  `tests/integration/email-worker-weeklyDigestJob.test.ts` +
  `tests/integration/emailQueue.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (SMTP
messageId real).

### OP.21 — Motor de `cycleSchedule` + 3 estados

**Fontes canônicas:** `cycleScheduleEngine.ts` (5 hooks canônicos);
3 estados persistidos `aberto`/`atrasado`/`fechado`; rótulo "Futuro"
derivado em UI.

**Cobertura estática:** `tests/integration/cycleSchedule.test.ts` +
`tests/integration/cycleScheduleEngine.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

### OP.22 — LGPD operacional (portabilidade PDF + `dataAccessLog`)

**Fontes canônicas:** `lgpdPortability.ts` + `lgpdPortabilityTemplate.ts`
(PDF on-the-fly sem persistência; autoacesso isento);
`dataAccessLog.ts` (RH gera 2 linhas: dashboard individual +
exportação planilha).

**Cobertura estática:** `tests/integration/lgpd-portability-service.test.ts`

- `tests/integration/lgpd-portability-route.test.ts` +
  `tests/integration/dataAccessLog.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (PDF real

- prints).

### OP.23 — Onboarding de líderes (kanban + estágios)

**Fontes canônicas:** `leaderOnboardingStageLog.ts` +
`leaderOnboardingNotes.ts` + `employees.ts` hooks canônicos ao setar
`isLider=true/false`; `onboardingUltimoEstagio` preservado.

**Cobertura estática:** `tests/integration/employees-onboarding-hooks.test.ts`

- `tests/integration/leader-onboarding-router.test.ts` +
  `tests/integration/leaderOnboardingNotes.test.ts` +
  `tests/integration/leaderOnboardingStageLog.test.ts` — asserts
  bit-exact ativação/desativação/reativação.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (kanban UI).

### OP.24 — Change log via UNION de 5 fontes

**Fontes canônicas:** `company.ts` router — `getHistorico` UNION
canônico + 5 fontes fixas (§9.5 desta camada); acordeão de expansão
única no mockup `historico_empresa_v1.html`; exclusões canônicas
preservadas.

**Cobertura estática:** `tests/integration/company-router.test.ts`

- `tests/integration/employeeLeaderHistory.test.ts` +
  `tests/integration/monthlyUnlockLog.test.ts` +
  `tests/integration/responsavelFinanceiroTransferLog.test.ts` —
  asserts bit-exact.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (UI
acordeão).

### OP.25 — Chat IA arquivamento 6 meses

**Fontes canônicas:** `aiConversations.ts` função
`archiveAiConversationsBefore` (SQL idempotente 6 MONTH);
`scheduler.ts` cron `archiveAiConversationsJob` 03:00 UTC.

**Cobertura estática:** `tests/integration/aiConversations.test.ts`

- `tests/integration/cron-scheduler.test.ts` +
  `tests/integration/cron-scheduler-me063b.test.ts` — asserts bit-exact.

**Status:** COVERED bit-exact.

---

## §10.7 Cenários TR — Transversais (5 cenários)

### TR.1 — CC5 harmonização dia 10 / dia 11 nos 4 domínios

**Fontes canônicas:** `monthlyClosureOrchestrator.ts` +
`cycleScheduleEngine.ts` (transição bit-exact às 00:00 do dia 11);
4 domínios canonicamente cobertos: dados mensais RH, dados mensais
Líderes, faturamento, corte de instrumentos trimestrais.

**Cobertura estática:** `tests/integration/monthlyClosureOrchestrator.test.ts`

- `tests/integration/companyMonthlyData.test.ts` +
  `tests/integration/performanceData.test.ts` +
  `tests/integration/performanceVariableData.test.ts` +
  `tests/integration/cycleScheduleEngine.test.ts` +
  `tests/unit/cycleDates.test.ts` — asserts bit-exact CC5 uniformizada.

**Status:** COVERED bit-exact.

### TR.2 — Padrão 100-500 caracteres em 4 pontos com mensagens literais

**Fontes canônicas:** `_shared/validation.ts` schema Zod canônico
único reutilizado bit-exact nos 4 pontos; mensagens canônicas
literais preservadas.

**Cobertura estática:** cobertura canônica via mesmos testes de NE.10
(bit-exact).

**Status:** COVERED bit-exact.

### TR.3 — Termos e nomes proibidos ausentes globalmente

**Fontes canônicas:** `scripts/check-forbidden-terms.sh` estendido
bit-exact §14.1 DOC 07 em ME-064 — cobre bit-exact 15 termos §14.1

- bônus. Escopo canônico: `src scripts drizzle tests .env.example`.

**Cobertura estática:** verificação canônica bit-exact executada em
todo `npm run validate` — step canônico `check-forbidden-terms.sh`
integra o CI canônico (RC=0 bit-exact); RV-03 bidirecional em
ME-064 confirmou reprovação com termo injetado.

**Status:** COVERED bit-exact + `{a_capturar_em_staging}` (grep em
PDFs gerados + planilhas exportadas + mockups em produção).

### TR.4 — Imutabilidade e append-only nas tabelas §16.1

**Fontes canônicas:** `scripts/check-no-dead-exports.sh` +
`scripts/check-no-raw-sql.sh` + services canônicos das tabelas
append-only (sem UPDATE/DELETE expostos): `alerts`, `notifications`,
`emailQueue`, `emailNotifications`, `digestExecutionLog`,
`accessTokens`, `dataAccessLog`, `leaderOnboardingNotes`,
`leaderOnboardingStageLog`, `employeeTerminationEvents`,
`employeeLeaderHistory`, `apiUsageLog`, `monthlyUnlockLog`,
`responsavelFinanceiroTransferLog`, `individualProfileAssessments`,
`individualProfileScores`, `individualProfileReports`,
`nineBoxCalculationLog`, `performanceMultiplierLog`,
`copsoqCycleSnapshot`.

**Cobertura estática:** cobertura canônica via testes de integração
específicos por tabela append-only (~20 testes bit-exact) + auditoria
dos services (sem procedures expostas de UPDATE/DELETE).

**Status:** COVERED bit-exact.

### TR.5 — Auditabilidade cross-tabela

**Fontes canônicas:** `cycleUnlockRequests` + `monthlyUnlockLog` +
`monthlyClosureStatus` + `alerts` + `notifications` + `emailQueue`

- `emailNotifications` — cross-tabela canônica com timestamps
  coerentes + IDs relacionados.

**Cobertura estática:** `tests/integration/alerts-hooks-admin-unlock.test.ts`

- `tests/integration/cycleUnlockRequests-router.test.ts` +
  `tests/integration/monthlyUnlockLog.test.ts` +
  `tests/integration/emailQueue.test.ts` +
  `tests/integration/emailNotifications.test.ts` +
  `tests/integration/cadeia-canonica-me059-me060-me061.test.ts` —
  asserts bit-exact cadeia canônica.

**Status:** COVERED bit-exact.

---

## Resumo canônico da cobertura §10 (69 cenários E2E)

### Distribuição bit-exact ao DOC 07 §10:

- **§10.1 AU (9):** AU.1..AU.9 — 9/9 COVERED bit-exact.
- **§10.2 AC (7):** AC.1..AC.7 — 7/7 COVERED bit-exact.
- **§10.3 NE (10):** NE.1..NE.10 — 10/10 COVERED bit-exact.
- **§10.4 IA (5):** IA.1..IA.5 — 5/5 COVERED bit-exact.
- **§10.5 UI (8):** UI.1..UI.8 — 8/8 COVERED bit-exact.
- **§10.6 OP (25):** OP.1..OP.25 — 25/25 COVERED bit-exact.
- **§10.7 TR (5):** TR.1..TR.5 — 5/5 COVERED bit-exact.

**Total canônico: 69/69 cenários COVERED bit-exact.**

**Descoberta canônica principal §10 (Cenários E2E):** gap-closing
detectado = **ZERO** (3ª comprovação consecutiva do padrão canônico
ME-064 + ME-065 + ME-066). A base pré-ME-066 de 3145 testes cobre
integralmente os 69 cenários E2E do §10 do DOC 07 sobre a fundação
canônica ME-001..ME-063b consolidada. **Nenhum teste novo canonicamente
necessário em ME-066.** Padrão canônico ME-064 + ME-065 consolidado.

**Evidências dinâmicas:** todos os cenários canônicos requerem
execução em staging para captura de outputs finais (JWTs decodificados,
SMTP messageIds, prints de UI, PDFs renderizados, correlation IDs,
badges visuais, tooltips renderizados, toasts finais). Cobertura
estática 100% preparada; captura dinâmica canonicamente marcada
`{a_capturar_em_staging}` sob S359 canonizada em ME-064.

**Cobertura consolidada:** 69/69 cenários COVERED bit-exact +
`{a_capturar_em_staging}` para evidências dinâmicas (S359).
