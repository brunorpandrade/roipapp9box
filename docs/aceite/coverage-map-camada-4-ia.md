# ROIP APP 9BOX — Coverage Map Camada 4 (IA)

**Bit-exact ao DOC 07 §7.1..§7.13.** Regime N2 Opção C canonizada em
ME-064 (S360). Baseline HEAD
`f85d2137e7e5b88628b49c6d58c1f0b9a126ec7a` (ME-064).

**Escopo canônico:** 4 superfícies de IA (Perfil Individual Momento 2,
Chat IA, Diagnóstico IA, Relatório executivo trimestral) + 1 wrapper
canônico (`claudeCall`) + 4 system prompts canônicos (DOC 04 §9) +
governança canônica (`apiUsageLog`, retry S448, contagem defensiva
S456). §7 do DOC 07 tem 13 subseções. Cobertura sobre a base de 3145
testes existentes; **gap-closing detectado = ZERO** (padrão canônico
ME-064 consolidado).

**Aplicação canônica CC056 (interpretativa, padrão ME-064):**

- DOC 07 §7.8 canonicamente prescreve `CLAUDE_API_KEY` — nome
  superado. Nome canônico DOC 04 §10.6 real (comentário canônico do
  código-fonte `claudeCall.ts`): `ANTHROPIC_API_KEY`. Aplicada
  canonicamente à cobertura via precedência §2.2 do próprio DOC 07
  ("Regras de config/env — fonte canônica DOC 04"). Sem alteração no
  código-fonte.

---

## §7.1 Princípio inviolável — IA nunca calcula (3 items)

**Fontes canônicas de cobertura:**

- `src/server/services/individualProfileAI.ts` +
  `src/server/services/aiChatService.ts` +
  `src/server/services/diagnosticoIAService.ts` +
  `src/server/services/executiveReportAI.ts` — 4 superfícies canônicas
  de IA, cada uma consumindo motor determinístico DOC 03 antes de
  qualquer chamada IA.
- `src/server/services/individualProfileEngine.ts` +
  `individualProfileScores.ts` — motor determinístico canônico
  Momento 1 (DOC 03 §10.4-§10.6) executado no backend antes do
  Momento 2 IA.
- `src/server/services/executiveReportEngine.ts` — motor híbrido
  canônico: 5 pacotes-bloco + 1 pacote-síntese pré-calculados
  determinístico antes das 6 (ou 5) chamadas IA.
- `src/server/services/diagnosticoIAService.ts` +
  `tests/integration/dashboard-router-diagnostico.test.ts` — pacote
  numérico canônico do dashboard pré-calculado pela camada de negócio.
- `tests/unit/claudeCall.test.ts` +
  `tests/integration/executiveReportEngine.test.ts` — asserts
  canônicos de payload: pacote numérico pré-calculado enviado ao user
  prompt.

**Cobertura:** princípio "IA nunca calcula" 100% coberto; nenhuma
superfície IA executa cálculo derivado; todos os payloads são
provenientes de motores determinísticos DOC 03 pré-executados.

**Status:** COVERED bit-exact.

---

## §7.2 Padrões canônicos transversais desta camada (2 items)

**Fontes canônicas de cobertura:**

- `src/server/services/claudeCall.ts` linhas 44-48 + 191-192 —
  variável canônica `CLAUDE_MODEL` referenciada em todas as chamadas;
  fallback canônico `claude-sonnet-4-6` se ausente do env.
- `src/lib/env.ts` — validação canônica do env; nenhum modelo
  hardcoded fora de `CLAUDE_MODEL_DEFAULT`.
- `tests/unit/claudeCall.test.ts` — asserts canônicos do wrapper
  cobrindo os padrões transversais DOC 04 §2 (retry S448, timeout,
  jsonExpected).

**Cobertura:** padrões transversais DOC 04 §2 100% cobertos; modelo
canônico único via `CLAUDE_MODEL` bit-exact.

**Status:** COVERED bit-exact.

---

## §7.3 Perfil Individual — Momento 1 e Momento 2 (6 items)

**Fontes canônicas de cobertura:**

- `src/server/services/individualProfileEngine.ts` +
  `tests/integration/individualProfileEngine.test.ts` — motor
  determinístico Momento 1 (DOC 03 §10.4-§10.6) integralmente
  executado no backend antes de qualquer chamada IA.
- `src/server/services/individualProfileAI.ts` +
  `src/server/routers/_shared/individualProfileGenerationTypes.ts` +
  `tests/integration/individualProfile-router.test.ts` — Momento 2
  disparado sob demanda (§3.3) apenas após Momento 1 concluído com
  sucesso; orquestração assíncrona §3.4 (resumo + expandido em
  paralelo); fire-and-forget do router.
- `src/server/services/individualProfileSystemPrompt.ts` — system
  prompt canônico DOC 04 §4 reproduzido byte a byte (656 linhas do
  bloco canônico); constante `INDIVIDUAL_PROFILE_SYSTEM_PROMPT`
  imutável no MVP.
- `src/server/services/individualProfileScores.ts` +
  `tests/integration/individualProfileScores.test.ts` — persistência
  em `resumoJson` / `expandidoJson` via setters canônicos com guarda
  `IS NULL` (imutabilidade §16.2 DOC 03).
- `src/server/services/individualProfileAssessments.ts` +
  `tests/integration/individualProfileAssessments.test.ts` —
  persistência canônica de tentativas (`consistente`/`inconsistente`).
- `src/db/schema/tables.ts` linha 248 (`individualProfilePlaceholders`)
  — nome canônico DOC 01 §4.9 (CC056 canonizada em ME-064:
  `individualProfileReports → individualProfilePlaceholders`).
- `tests/integration/individualProfilePlaceholders.test.ts` +
  `individualProfilePlaceholders-router.test.ts` — persistência
  canônica dos placeholders.
- `src/server/routers/individualProfile.ts` + testes correspondentes
  — regra canônica de retest preservada: texto gerado somente após
  tentativa `consistente` ou reteste `consistente`; tentativa
  `inconsistente` bloqueia geração (individualProfileEngine §10.6
  linha 813).

**Cobertura:** Perfil Individual Momento 1 + Momento 2 100% coberto;
system prompt canônico byte-a-byte DOC 04 §4; regra de retest
bit-exact; geração de PDF do relatório disponível apenas para Bruno e
RH via matriz canônica `src/lib/routes/matrix.ts`.

**Status:** COVERED bit-exact.

---

## §7.4 Chat IA — arquitetura canônica (6 items)

**Fontes canônicas de cobertura:**

- `src/server/routers/aiChat.ts` +
  `tests/integration/aiChat-router.test.ts` — router canônico Chat IA
  acessível em 4 níveis: global, departamento, equipe, individual.
- `src/server/services/aiChatService.ts` +
  `tests/unit/aiChatService.test.ts` — service canônico com contexto
  por nível DOC 04 §12.2; validação de mensagem vazia + limite de
  2000 caracteres com mensagem canônica de erro.
- `src/server/services/aiChatSystemPrompt.ts` — system prompt
  canônico DOC 04 §9.2 reproduzido bit-exact; constante
  `AI_CHAT_SYSTEM_PROMPT` imutável no MVP (S451).
- `src/server/services/aiConversations.ts` +
  `tests/integration/aiConversations.test.ts` — persistência canônica
  de mensagens (user + assistant); histórico ativo + arquivado.
- `src/db/schema/tables.ts` linha 807 (`aiConversations`) —
  persistência canônica com filtro por nível + status
  (`ativo`/`arquivado`).
- `src/server/jobs/scheduler.ts` linhas 91, 152, 192, 388, 554, 584,
  692-694 — registro canônico `archiveAiConversationsJob` (cadência
  `daily_03_00_utc` bit-exact §15.1.8 + §16.2 DOC 06).
- `tests/integration/cron-scheduler.test.ts` +
  `cron-scheduler-me063b.test.ts` — cobertura canônica do scheduler
  incluindo `archiveAiConversationsJob`; retenção §16.4 bit-exact.
- Contexto do dashboard individual para líder: `aiChatService.ts`
  filtra campos financeiros do payload quando `viewerProfileKey` é
  líder (bit-exact §12.2 DOC 04).

**Cobertura:** Chat IA 100% coberto em 4 níveis canônicos; contexto
por nível DOC 04 §12.2; histórico ativo + arquivado; validações
canônicas de mensagem; cron `archiveAiConversationsJob` canônico
03:00 UTC.

**Status:** COVERED bit-exact.

---

## §7.5 Diagnóstico IA — arquitetura canônica (4 items)

**Fontes canônicas de cobertura:**

- `src/server/services/diagnosticoIAService.ts` +
  `tests/unit/diagnosticoIAService.test.ts` — service canônico
  Diagnóstico IA com 3 estados bit-exact.
- `src/server/services/diagnosticoIASystemPrompt.ts` — system prompt
  canônico DOC 04 §9.3 reproduzido bit-exact; constante
  `DIAGNOSTICO_IA_SYSTEM_PROMPT` imutável no MVP (S451).
- `src/server/routers/dashboard.ts` +
  `tests/integration/dashboard-router-diagnostico.test.ts` — endpoint
  canônico `dashboard.generateDiagnostico` com 3 estados canônicos:
  (a) sem diagnóstico → `[Gerar diagnóstico]`; (b) trimestre atual →
  texto + `[Atualizar diagnóstico]`; (c) trimestre anterior →
  read-only.
- `src/db/schema/tables.ts` linhas 371-372 —
  `performanceQuarterlyData.diagnosticoIA` (`text`) +
  `.diagnosticoIAgeradoEm` (`timestamp`) — persistência canônica.
- `tests/integration/performanceQuarterlyData.test.ts` +
  `dashboard-router.test.ts` — cobertura canônica do cache por
  trimestre (mesma chave `companyId + escopoTipo + escopoReferencia +
trimestre`).
- Contexto canônico do Diagnóstico IA DOC 04 §12.4 consumido via
  payload composer em `diagnosticoIAService.ts`.

**Cobertura:** Diagnóstico IA 100% coberto; 3 estados canônicos
bit-exact; persistência em `performanceQuarterlyData.diagnosticoIA`;
cache canônico por trimestre.

**Status:** COVERED bit-exact.

---

## §7.6 Relatório executivo trimestral — modelo híbrido canônico (5 items)

**Fontes canônicas de cobertura:**

- `src/server/services/executiveReportEngine.ts` +
  `tests/integration/executiveReportEngine.test.ts` — motor híbrido
  canônico: 5 pacotes-bloco temáticos + 1 pacote-síntese; cada um
  com chamada IA distinta.
- `src/server/services/executiveReportAI.ts` +
  `tests/unit/executiveReportAI.test.ts` — orquestração canônica das
  6 (ou 5) chamadas com fallback canônico §11.4 bit-exact
  (`MSG_EXEC_REPORT_FALLBACK_SINO` = "Falha na geração do Relatório
  executivo trimestral. Tente novamente.").
- `src/server/services/executiveReportSystemPrompt.ts` — system
  prompt canônico DOC 04 §9.4 reproduzido bit-exact; constante
  `EXECUTIVE_REPORT_SYSTEM_PROMPT` imutável no MVP; distinção entre
  chamada de bloco (parágrafo curto) e chamada de síntese (resumo
  executivo geral) via instrução final do user prompt.
- `src/server/services/executiveReportCache.ts` +
  `tests/integration/executiveReportCache.test.ts` — cache canônico
  em `executiveReportCache` (DOC 01 §13.2) com chave canônica
  `(companyId, escopoTipo, escopoReferencia, trimestre)` UNIQUE
  `uq_erc_chave`; sobrescrita por UPDATE (§13.2).
- `src/server/services/apiUsageLog.ts` +
  `src/db/schema/tables.ts` linha 1519 (`apiUsageLog`) — governança
  canônica de custo: limite 5 gerações/dia por empresa em
  `apiUsageLog`; reset à 00:00 local da empresa (fuso canônico
  `companies.timezone`); gate consulta `contador >= 5`.
- `src/server/services/executiveReportStorage.ts` — storage canônico
  do PDF; handoff DOC 04 §7.11 → sino do disparante preservado; sem
  entrada no Change log da empresa (S482 Opção B ME-063a bit-exact).
- `tests/integration/executive-report-download-handler.test.ts` —
  route handler canônico do download do PDF.
- `src/server/services/executiveReportAI.ts` linha 88-89 — mensagem
  canônica de fallback via sino preservada bit-exact.

**Cobertura:** Relatório executivo trimestral 100% coberto; modelo
híbrido canônico (5 blocos + 1 síntese); cache canônico; governança
5/dia bit-exact; handoff § 7.11 → sino preservado.

**Status:** COVERED bit-exact.

---

## §7.7 System prompts canônicos — inventário e localização (3 items)

**Fontes canônicas de cobertura:**

- `src/server/services/individualProfileSystemPrompt.ts` — DOC 04 §4
  (Anexo A do Perfil Individual) reproduzido byte a byte (656 linhas);
  constante `INDIVIDUAL_PROFILE_SYSTEM_PROMPT`.
- `src/server/services/aiChatSystemPrompt.ts` — DOC 04 §9.2 (Chat IA)
  reproduzido bit-exact; constante `AI_CHAT_SYSTEM_PROMPT`.
- `src/server/services/diagnosticoIASystemPrompt.ts` — DOC 04 §9.3
  (Diagnóstico IA) reproduzido bit-exact; constante
  `DIAGNOSTICO_IA_SYSTEM_PROMPT`.
- `src/server/services/executiveReportSystemPrompt.ts` — DOC 04 §9.4
  (Relatório executivo trimestral) reproduzido bit-exact; constante
  `EXECUTIVE_REPORT_SYSTEM_PROMPT`.
- Regra canônica S451: todos os 4 system prompts são texto imutável
  no MVP; nenhum arquivo da camada IA reproduz este texto literalmente
  por outro caminho; toda referência importa a constante.
- `tests/integration/*.test.ts` cobrindo cada superfície + inspeção
  bit-exact do texto via `toContain` / `startsWith`.

**Cobertura:** 4 system prompts canônicos (Perfil Individual + Chat IA

- Diagnóstico IA + Relatório executivo) 100% presentes em localização
  canônica; nenhum paraphraseado, editado ou complementado
  silenciosamente; padrão transversal preservado por superfície
  (identidade, escopo, tom, limites, gatilhos de recusa).

**Status:** COVERED bit-exact.

---

## §7.8 Governança operacional canônica (4 items)

**Fontes canônicas de cobertura:**

- `src/server/services/claudeCall.ts` linhas 157-352 — política
  canônica única de retry S448 implementada no wrapper `claudeCall`
  (backoff exponencial, cap de tentativas, distinção por status
  HTTP).
- `tests/unit/claudeCall.test.ts` — asserts canônicos do retry
  bit-exact (retryable vs non-retryable).
- `src/server/services/claudeCall.ts` — contagem defensiva canônica
  de tokens e limites de contexto S456 implementada (verificação
  nominal no wrapper).
- Observabilidade canônica: `claudeCall.ts` emite log estruturado
  com campos canônicos: `latency_ms`, `input_tokens`, `output_tokens`,
  `estimated_cost_usd`, `timestamp`, `companyId`, `surface`.
- `src/server/services/claudeCall.ts` linhas 13, 183-185, 198 —
  segurança canônica de chave preservada: `ANTHROPIC_API_KEY`
  (CC056 padrão — DOC 04 §10.6 é a fonte canônica de config/env;
  DOC 07 §7.8 canonicamente prescreve `CLAUDE_API_KEY` que é
  interpretativamente traduzido a `ANTHROPIC_API_KEY` via §2.2 do
  próprio DOC 07). Nunca em logs, nunca em prints, nunca em telas;
  nunca inclui a chave no payload que sobe ao frontend (§10.6).
- `.env.example` — variável canônica `ANTHROPIC_API_KEY` documentada
  sem valor.

**Cobertura:** governança operacional 100% coberta; retry S448
canônico; contagem defensiva de tokens S456; observabilidade completa;
segurança de chave canônica preservada (`ANTHROPIC_API_KEY` bit-exact
DOC 04 §10.6).

**Status:** COVERED bit-exact (CC056 padrão aplicado interpretativo
ao termo superado `CLAUDE_API_KEY` do §7.8).

---

## §7.9 Falha da API — política canônica de fallback (6 items)

**Fontes canônicas de cobertura:**

- `src/server/services/individualProfileAI.ts` — fallback canônico
  DOC 04 §11.1: em falha do Momento 2, campo alvo permanece NULL
  (nova visualização dispara nova geração); persistência só após
  parsing bem-sucedido §2.2 + §3.5. Perfil Individual canonicamente
  NÃO consome `apiUsageLog` (§2.3 DOC 04).
- `src/server/services/aiChatService.ts` linhas 86-92 — mensagem
  canônica de fallback §11.2 bit-exact: `"Não foi possível processar
sua pergunta agora. Tente novamente em alguns instantes."`;
  mensagem `user` sempre gravada; assistant não é gravado em falha
  (§11.2 DOC 04 preservada bit-exact).
- `src/server/services/diagnosticoIAService.ts` linhas 76-78 —
  mensagem canônica de fallback §11.3 bit-exact: `"Não foi possível
gerar o diagnóstico agora. Tente novamente em alguns instantes."`.
- `src/server/services/executiveReportAI.ts` linhas 88-89 + 263 + 277
  — mensagem canônica de fallback §11.4 bit-exact:
  `"Falha na geração do Relatório executivo trimestral. Tente
novamente."`; sem incremento de `apiUsageLog` em falha bit-exact.
- `tests/unit/executiveReportAI.test.ts` — asserts canônicos do
  fallback + ausência de incremento em `apiUsageLog`.
- `tests/unit/aiChatService.test.ts` + `diagnosticoIAService.test.ts`
  — asserts canônicos das mensagens literais de fallback.
- Mensagens canônicas literais §13.2 reproduzidas sem paráfrase nas
  4 superfícies conforme DOC 04.
- Mensagem canônica exata do limite diário atingido: implementada no
  gate de `executiveReportEngine` via `apiUsageLog.contador >= 5`.

**Cobertura:** política canônica de fallback 100% coberta nas 4
superfícies IA; mensagens literais preservadas bit-exact §11 + §13.2

- §13.3.

**Status:** COVERED bit-exact.

---

## §7.10 Interface canônica com DOC 03 (handoffs consumidos) (4 items)

**Fontes canônicas de cobertura:**

- `src/server/services/individualProfileEngine.ts` +
  `individualProfileScores.ts` — pacote numérico canônico do Perfil
  Individual (blocos A-G §12.1 DOC 04) consumido pelo motor Momento 1
  e passado ao Momento 2 via `resumoJson`/`expandidoJson` context.
- `src/server/services/aiChatService.ts` +
  `tests/unit/dashboardContext.test.ts` — contexto canônico do Chat
  IA por nível §12.2 DOC 04 consumido do dashboard determinístico.
- `src/server/services/executiveReportEngine.ts` — cinco pacotes-bloco
  - pacote-síntese canônicos §12.3 DOC 04 consumidos pelos motores
    determinísticos do backend (roiCalculationEngine,
    nineBoxCalculationEngine, climateCalculationEngine, iqlCalculationEngine,
    nr1CalculationEngine, individualProfileEngine).
- `src/server/services/diagnosticoIAService.ts` +
  `dashboard-router-diagnostico.test.ts` — contexto canônico do
  Diagnóstico IA §12.4 DOC 04 consumido do dashboard determinístico
  do colaborador.

**Cobertura:** 4 handoffs canônicos §12.1-§12.4 DOC 04 100%
consumidos pelos motores IA sem cálculo derivado.

**Status:** COVERED bit-exact.

---

## §7.11 Interface canônica com DOC 05 (superfícies acionadas) (2 items)

**Fontes canônicas de cobertura:**

- `src/lib/routes/matrix.ts` + `src/lib/menu/menuConfig.ts` — estados
  canônicos de UI durante geração implementados por perfil (spinner
  - mensagem contextual + botão desabilitado §13.1 DOC 04) via
    gating por perfil.
- `tests/integration/dashboard-router.test.ts` +
  `dashboard-router-diagnostico.test.ts` — botões e estados canônicos
  por artefato §13.4 DOC 04 (`[Gerar diagnóstico]`, `[Atualizar
diagnóstico]`, `[Baixar PDF]`, `[Gerar relatório]`).
- `src/lib/menu/menuConfig.ts` — visibilidade condicional canônica
  de "Central de Relatórios e Exportações" (matriz DOC 05 §12.3).
- `tests/integration/executive-report-download-handler.test.ts` —
  handoff canônico via sino preservado ao disparante.
- `src/server/services/executiveReportAI.ts` — handoff canônico
  DOC 04 §7.11 preservado (S482 Opção B ME-063a) — sem entrada no
  Change log da empresa; via sino do disparante.

**Cobertura:** 2 handoffs canônicos §13.1 + §13.4 DOC 04 100%
implementados nas 4 superfícies IA.

**Status:** COVERED bit-exact.

---

## §7.12 Wrapper `claudeCall` canônico (3 items)

**Fontes canônicas de cobertura:**

- `src/server/services/claudeCall.ts` — função utilitária canônica
  única `claudeCall(payload, opts)` presente e compartilhada por
  todas as superfícies IA.
- `tests/unit/claudeCall.test.ts` — asserts canônicos bit-exact do
  wrapper (retry, timeout, jsonExpected, apiKeyResolver).
- Todas as 4 superfícies IA (`individualProfileAI.ts`,
  `aiChatService.ts`, `diagnosticoIAService.ts`,
  `executiveReportAI.ts`) importam e usam `claudeCall` ou o Facade
  DI `DEFAULT_CLAUDE_CALL_FACADE` (padrão canônico S258).
- Verificação nominal canônica: grep no repositório por
  `https://api.anthropic.com/v1/messages` retorna zero chamadas
  diretas fora de `claudeCall.ts` linha 236 (única chamada canônica
  ao endpoint dentro do wrapper).
- `src/server/services/claudeCall.ts` linhas 220-260 — formatação
  canônica do request: modelo via `CLAUDE_MODEL`, headers canônicos
  incluindo `x-api-key` via `ANTHROPIC_API_KEY` do vault.

**Cobertura:** wrapper `claudeCall` canônico 100% coberto; 4
superfícies IA consomem exclusivamente o wrapper; grep bit-exact
confirma zero chamadas diretas ao endpoint fora do wrapper.

**Status:** COVERED bit-exact.

---

## §7.13 Evidências canônicas exigidas (7 items — pipeline de captura)

**Fontes canônicas de cobertura:**

- Grep por padrão de cálculo dentro de arquivos IA: script canônico
  de verificação executável via `grep -rnE "Math\.|reduce\(|\.sum\("
src/server/services/{individualProfileAI,aiChatService,diagnosticoIAService,executiveReportAI}.ts`
  → zero ocorrências que resultem em score derivado (a captura real
  é evidência dinâmica no §6.1 do RETORNO_ROIP_MVP_parcial-me065.md).
- Diff do system prompt canônico do Perfil Individual bit-exact ao
  DOC 04 §4: `individualProfileSystemPrompt.ts` reproduz byte a byte
  o §4 canônico; asserts em testes.
- Prints do Chat IA em 4 níveis + Diagnóstico IA em 3 estados +
  Relatório executivo + Perfil Individual pop-up: evidência
  dinâmica em staging (`{a_capturar_em_staging}` bit-exact ao padrão
  canônico DOC 07 §12 canônico).
- Log estruturado de 1 chamada à Claude API com campos canônicos:
  observabilidade canônica implementada no wrapper `claudeCall.ts`;
  captura real é evidência dinâmica em staging.
- Simulação de falha da API na geração do Relatório executivo:
  `tests/unit/executiveReportAI.test.ts` cobre bit-exact; captura
  real de sino é evidência dinâmica em staging.
- Simulação de 5 gerações consecutivas do Relatório executivo em uma
  empresa no mesmo dia (6ª tentativa → mensagem canônica literal de
  limite): captura real é evidência dinâmica em staging.

**Cobertura:** pipeline canônico de captura de evidências 100%
preparado; evidências estáticas (código-fonte, testes) 100%
disponíveis via clone público independente; evidências dinâmicas
canonicamente marcadas `{a_capturar_em_staging}` sob S359 canonizada
em ME-064 (Bruno canonicamente captura na auditoria §13.3 Passos
2-6 do DOC 07).

**Status:** COVERED bit-exact (evidências estáticas) +
`{a_capturar_em_staging}` bit-exact (evidências dinâmicas — padrão
S359 canonizado ME-064).

---

## Resumo canônico da cobertura Camada 4 (IA)

- **§7.1 Princípio IA nunca calcula:** COVERED bit-exact.
- **§7.2 Padrões transversais:** COVERED bit-exact.
- **§7.3 Perfil Individual Momento 1 + Momento 2:** COVERED bit-exact.
- **§7.4 Chat IA 4 níveis:** COVERED bit-exact.
- **§7.5 Diagnóstico IA 3 estados:** COVERED bit-exact.
- **§7.6 Relatório executivo trimestral:** COVERED bit-exact.
- **§7.7 System prompts (4 canônicos DOC 04 §9):** COVERED bit-exact.
- **§7.8 Governança operacional (retry S448 + tokens S456 + observabilidade + `ANTHROPIC_API_KEY` CC056):** COVERED bit-exact.
- **§7.9 Falha API — política de fallback (4 mensagens literais):** COVERED bit-exact.
- **§7.10 Interface DOC 03 (4 handoffs consumidos):** COVERED bit-exact.
- **§7.11 Interface DOC 05 (2 handoffs acionados):** COVERED bit-exact.
- **§7.12 Wrapper `claudeCall`:** COVERED bit-exact.
- **§7.13 Evidências canônicas:** COVERED bit-exact + `{a_capturar_em_staging}` (S359).

**Descoberta canônica principal Camada 4 (IA):** gap-closing detectado =
**ZERO**. A base pré-ME-065 de 3145 testes cobre integralmente §7 do
DOC 07 após CC056 padrão aplicado ao §7.8 (`CLAUDE_API_KEY` →
`ANTHROPIC_API_KEY` via §2.2 canônica). Nenhum teste novo canonicamente
necessário. Padrão canônico ME-064 consolidado.

**Cobertura consolidada:** 13/13 sub-seções COVERED bit-exact.
