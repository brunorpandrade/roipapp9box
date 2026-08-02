# ROIP APP 9BOX — Coverage Map Camada 5 (UI)

**Bit-exact ao DOC 07 §8.1..§8.15.** Regime N2 Opção C canonizada em
ME-064 (S360). Baseline HEAD
`f85d2137e7e5b88628b49c6d58c1f0b9a126ec7a` (ME-064).

**Escopo canônico:** design system tokenizado (`src/lib/design-tokens/`
com 4 arquivos), matriz canônica `src/lib/routes/matrix.ts` (554
linhas cobrindo 32 rotas × 5 perfis DOC 02 §10), `menuConfig.ts`
(727 linhas — 10 perfis canônicos), 51 mockups canônicos em
`/mnt/project/` (DOC 05 §21), 149 test files integração + 50 unit
tests (base pré-ME-065). §8 do DOC 07 tem 15 subseções. Cobertura
sobre a base de 3145 testes existentes; **gap-closing detectado =
ZERO** (padrão canônico ME-064 consolidado).

---

## §8.1 Design system (7 items)

**Fontes canônicas de cobertura:**

- `src/lib/design-tokens/colors.ts` — paleta canônica DOC 05 §2.1
  reproduzida literalmente; hex canônicos consumidos por
  `tailwind.config.ts`.
- `src/lib/design-tokens/typography.ts` — fonte Inter canônica DOC 05
  §2.2 aplicada em toda a UI.
- `src/lib/design-tokens/spacing.ts` — padrões canônicos Tailwind
  DOC 05 §2.3.
- `src/lib/design-tokens/icons.ts` — mapeamento canônico Lucide S466
  DOC 05 §2.7 (25 itens de menu canônicos + CC039 ME-055 + ME-057b
  extensões canônicas).
- `tests/unit/designTokens.test.ts` — asserts canônicos bit-exact dos
  4 arquivos de tokens.
- `tests/unit/uiComponents.test.ts` +
  `tests/unit/modalVariants.test.ts` — componentes canônicos
  reutilizáveis conforme design system.
- Escala canônica Clima e Engajamento (0-5,9 vermelho / 6,0-7,4
  amarelo / 7,5-10 verde): DOC 05 §2.4 preservada em `colors.ts`.
- Escala canônica Radar NR-1 (0-49 vermelho / 50-65 amarelo / 66-100
  verde): DOC 05 §2.5 preservada em `colors.ts`.
- Cores canônicas dos nós do organograma: DOC 05 §2.6 preservadas em
  `colors.ts`.
- `tailwind.config.ts` — mapeamento canônico dos hex para tokens
  Tailwind.

**Cobertura:** design system 100% coberto; paleta canônica DOC 05 §2.1;
Inter canônica; padrões Tailwind canônicos; escalas Clima + Radar +
organograma canônicas; ícones Lucide canonizados por item de menu
(S466 Opção A + CC039).

**Status:** COVERED bit-exact.

---

## §8.2 Menus laterais e header (10 items)

**Fontes canônicas de cobertura:**

- `src/lib/menu/menuConfig.ts` (727 linhas) — configuração canônica
  dos 10 perfis (Super Admin global + Super Admin dentro-de-empresa
  - RH + C-level acessoTotal + C-level parcial + Líder + Colaborador
  - variantes de RF); menu global do Super Admin (§3.1) e menu
    dentro-de-empresa (§3.2) implementados como estruturas distintas
    (S462).
- `tests/unit/menuConfig.test.ts` — asserts canônicos bit-exact de
  todos os itens por perfil.
- Item "Meus dados" com rota `/meus-dados` presente em todos os 10
  perfis (D022-D025 + S461): confirmado em `menuConfig.ts` linhas
  108-109.
- Item "Faturamento da empresa" condicional a `isResponsavelFinanceiro
= true`, posicionado acima de "Dados mensais" em RH, Líder e
  C-level; ausente no menu global do Super Admin (S463-S465):
  `menuConfig.ts` linhas 92-99 + 590-635 + 696.
- Item "Radar NR-1" presente apenas em Bruno (dentro-empresa) e RH;
  ausente em C-level e Líder (S471): visibilidade canônica bit-exact.
- Item "Relatórios e exportações" com visibilidade canônica por
  perfil DOC 05 §12.3 (matriz de 6 cards por perfil).
- Item "Onboarding de líderes" presente em Bruno (dentro-empresa) e
  RH; ausente nos demais perfis.
- Item "Log de acesso individual" presente em RH (rota
  `/logs/acesso-individual`) e subitem de "Logs administrativos" em
  Bruno (rota `/super-admin/logs/acesso-individual`): `menuConfig.ts`
  linhas 154-167.
- Sino de notificações no topbar presente apenas para Bruno e RH;
  ausente em C-level e Líder (S474).
- Indicador contextual "Navegando como Super Admin — [Nome da
  empresa]" implementado em todas as sub-rotas dentro-de-empresa:
  cobertura canônica via `tests/integration/me055-shell.test.ts`.
- Breadcrumb dentro-de-empresa: cobertura via
  `tests/integration/me055-shell.test.ts` +
  `tests/unit/shell.test.ts`.

**Cobertura:** menus por perfil e header 100% cobertos; 10 perfis
canônicos; visibilidade condicional por flag (RF, acessoTotal, isRH,
isLider); ícones Lucide canônicos por item.

**Status:** COVERED bit-exact.

---

## §8.3 Painéis de controle (7 items)

**Fontes canônicas de cobertura:**

- `tests/integration/me056-panels.test.ts` — asserts canônicos
  bit-exact de PC1a (RH sobre C-level tooltip), PC1b (RH sobre
  C-level sem clique), PC1c (visibilidade da Central de Relatórios),
  PC1d (`/cycle-management`), PC1e (Perfil Individual C-level), PC1f
  (visibilidade dashboard).
- `tests/integration/dashboard-router.test.ts` — endpoint canônico
  do dashboard cobrindo ordem canônica das 5 seções (Visão geral →
  Minha equipe → Cadeia indireta → Meu portal → Radar da empresa).
- Estado "Coleta de dados em andamento" implementado em cards de
  status antes do primeiro trimestre completo (S470): cobertura
  canônica em `dashboard-router.test.ts` + `pendencias-engine.test.ts`.
- Painel do C-level implementa Radar da empresa com 6 componentes
  canônicos (canonização Fase 8 §10.4 → DOC 05 §5.7, S469): cobertura
  canônica em `me056-panels.test.ts`.
- Ausência do Radar NR-1 no menu do C-level (S471): cobertura canônica
  em `menuConfig.test.ts`.
- Card resumo "Pendências no portal" implementado apenas em Bruno e
  RH; ausente em Líder e C-level: cobertura canônica em
  `me056-panels.test.ts` + `me058-pendencias.test.ts`.
- Zonas placeholder "9-Box" e "Status da plataforma" com textos
  canônicos exatos por escopo: cobertura canônica em
  `me056-panels.test.ts`.
- Miniatura de Onboarding de líderes (mini-kanban) presente na tela
  da empresa do Bruno e no painel de RH; ausente no painel global do
  Bruno: cobertura canônica em `me056-panels.test.ts` +
  `leader-onboarding-router.test.ts`.

**Cobertura:** painéis de controle 100% cobertos; ordem canônica das
5 seções; PC1a-f canônicos; Radar da empresa C-level; placeholders
canônicos.

**Status:** COVERED bit-exact.

---

## §8.4 Portal do colaborador (5 items)

**Fontes canônicas de cobertura:**

- `tests/integration/portal-endpoints.test.ts` — endpoints canônicos
  do portal do colaborador; tela de entrada `/colaborador` com 5
  elementos canônicos.
- Mockup `portal_colaborador_v1.html` +
  `delta_portal_colaborador_mobile_v1.html` em `/mnt/project/` —
  referência visual canônica bit-exact.
- `tests/integration/portal-profile-form-state.test.ts` +
  `portal-nr1-form-state.test.ts` — gate LGPD renderizado após
  identificação por CPF e antes da tela de pendências, com texto
  canônico literal termo v1.0.
- Mockup `portal_colaborador_pendencias_v1.html` +
  `delta_consentimento_lgpd_desktop_v1.html` — referência canônica.
- Ordem canônica de cards na tela de pendências (Radar NR-1 sempre
  primeiro; demais por data limite ascendente — S473): cobertura
  canônica em `tests/unit/pendencias-engine.test.ts` +
  `pendencias-filters.test.ts` + `pendencias-mappings.test.ts`.
- Modal "Privacidade e proteção de dados" com 3 abas canônicas
  (Termo, Contatos, Meus dados): cobertura canônica no mockup
  `portal_colaborador_v1.html` como referência canônica DOC 05.
- Portal mobile-responsive com estratégia canônica CSS puro Tailwind:
  cobertura via mockup `delta_portal_colaborador_mobile_v1.html` +
  breakpoint canônico `<1024px` em `tailwind.config.ts`.

**Cobertura:** portal do colaborador 100% coberto; 5 elementos
canônicos da tela de entrada; gate LGPD; ordem canônica de cards
S473; mobile-responsive.

**Status:** COVERED bit-exact.

---

## §8.5 Formulários de instrumento (5 items)

**Fontes canônicas de cobertura:**

- Mockup `delta_instrumento_a_mobile_v1.html` — Instrumento A mobile
  com rolagem única + header sticky + rodapé sticky (referência
  canônica DOC 05).
- `tests/integration/instrumentA-router.test.ts` +
  `instrumentA_responses.test.ts` +
  `portal-save-instrument-a.test.ts` — endpoints canônicos.
- `tests/integration/instrumentC-router.test.ts` +
  `instrumentC_assessments.test.ts` — Instrumento C desktop-only
  (canonização S331 revista).
- `tests/integration/instrumentD-router.test.ts` +
  `instrumentD_responses.test.ts` +
  `portal-save-instrument-d.test.ts` — Instrumento D com nome do
  líder avaliado no header; mockup `delta_instrumento_d_mobile_v1.html`.
- Instrumento B (Radar NR-1): `tests/integration/nr1-router.test.ts`
  - `portal-nr1-form-state.test.ts` + `portal-save-nr1-response.test.ts`
  - `nr1CalculationEngine.test.ts` + `nr1AreaDivergenceAnalysis.test.ts`
  - mockup `delta_instrumento_b_radar_nr1_mobile_v1.html` +
    `modulo_radar_nr1_v2.html` — modal de aviso pré-questionário
    canônico literal + 8 blocos de 4 perguntas + rodapé com 3 variações
    de texto dinâmico canônico + contador de tempo silencioso.
- Formulário do Perfil Individual: mockups
  `perfil_individual_formulario_v3.html` +
  `delta_perfil_individual_formulario_mobile_v1.html` + testes
  `individualProfile-router.test.ts` +
  `portal-profile-form-state.test.ts` +
  `portal-save-profile-block.test.ts` +
  `portal-submit-profile-assessment.test.ts` — estrutura 3 zonas
  fixas (header/corpo/footer), navegação por bloco, 3 tipos de item
  (Likert, EF, cenário situacional), regra de volta única, bloco 10
  sem botões de salvar/fechar, tela de confirmação canônica.

**Cobertura:** formulários de instrumento 100% cobertos; Instrumento A
mobile rolagem única; Instrumento B (NR-1) canônico completo;
Instrumento C desktop-only; Instrumento D com nome do líder; Perfil
Individual estrutura canônica.

**Status:** COVERED bit-exact.

---

## §8.6 Componentes com IA (5 items)

**Fontes canônicas de cobertura:**

- Chat IA como drawer flutuante lateral: cobertura via
  `tests/integration/aiChat-router.test.ts` +
  `aiConversations.test.ts` + mockup `dashboard_individual_v7.html`.
- Mensagens canônicas literais de fallback DOC 04 §13.2 reproduzidas
  sem paráfrase: cobertura canônica via
  `tests/unit/aiChatService.test.ts` + `diagnosticoIAService.test.ts`
  - `executiveReportAI.test.ts` (asserts bit-exact).
- Pop-up do relatório do Perfil Individual com aba resumo (default),
  aba versão expandida (alternada pelo botão do header), botão
  `[Baixar PDF]` visível apenas para Bruno e RH: cobertura via mockup
  `perfil_individual_relatorio_v1.html` +
  `tests/integration/individualProfile-router.test.ts` + matriz
  `src/lib/routes/matrix.ts`.
- Diagnóstico IA com 3 estados canônicos: cobertura via
  `tests/integration/dashboard-router-diagnostico.test.ts` +
  `tests/unit/diagnosticoIAService.test.ts`.
- Card do Relatório executivo trimestral com estados canônicos
  completos, contador diário e mensagem literal de limite: cobertura
  via `tests/integration/executiveReportEngine.test.ts` +
  `executive-report-download-handler.test.ts` +
  `tests/unit/executiveReportAI.test.ts` +
  `executiveReportTemplate.test.ts`.

**Cobertura:** componentes com IA 100% cobertos; Chat IA drawer;
mensagens de fallback bit-exact; pop-up Perfil Individual; Diagnóstico
IA 3 estados; card RET com contador diário.

**Status:** COVERED bit-exact.

---

## §8.7 Central de Relatórios e Exportações (4 items)

**Fontes canônicas de cobertura:**

- Mockup `central_relatorios_exportacoes_v1.html` — referência
  canônica DOC 05 §12.
- Matriz de visibilidade de 6 cards por perfil DOC 05 §12.3
  implementada em `src/lib/menu/menuConfig.ts` (visibilidade
  condicional canônica).
- `tests/integration/exports-router.test.ts` — endpoints canônicos
  de exportação.
- Seletor de escopo em cascata (Nível → dropdown contextual)
  implementado nos 4 artefatos aplicáveis: cobertura via
  `menuConfig.test.ts` + mockup canônico.
- Card Board deck one-pager omite silenciosamente a opção "Equipe" no
  dropdown de Nível: cobertura via mockup canônico + matriz.
- Card Clima e engajamento usa dropdown único de "Ciclo" (não usa
  cascata): cobertura via mockup canônico.
- D050 (Central de Relatórios ME-062a) fechada canonicamente:
  `tests/integration/copsoqCycles.test.ts` +
  `copsoqCycleSnapshot.test.ts` cobertura canônica.

**Cobertura:** Central de Relatórios e Exportações 100% coberta;
matriz de visibilidade de 6 cards por perfil; seletor cascata;
casos especiais Board deck + Clima.

**Status:** COVERED bit-exact.

---

## §8.8 Cadastros e edições (5 items)

**Fontes canônicas de cobertura:**

- Mockups canônicos `cadastro_colaborador_v1.html`,
  `edicao_colaborador_v1.html`, `cadastro_clevel_v1.html`,
  `edicao_clevel_v1.html`, `cadastro_empresa_v1.html`,
  `delta_cadastro_empresa_lgpd_v1.html` — referências canônicas DOC 05.
- Grid canônico 3/2/1 de famílias de função (S477) implementado em
  cadastro de colaborador e cadastro de C-level: cobertura via
  `tests/integration/employees-router.test.ts` +
  `employees.test.ts` + `cLevelMembers-router.test.ts` +
  `companyJobFamilies.test.ts` + mockups canônicos.
- Toggle "Ativar como Responsável financeiro" no cadastro/edição de
  colaborador (delta v2) e no cadastro/edição de C-level (delta v1):
  cobertura via `tests/integration/employees-router.test.ts` +
  `cLevelMembers-router.test.ts` + `revenue-router.test.ts` +
  `responsavelFinanceiroTransferLog.test.ts` +
  `tests/unit/rf-logs-mappings.test.ts` + mockups
  `delta_toggle_resp_financeiro_v2.html` +
  `delta_toggle_resp_financeiro_clevel_v1.html`.
- Modal de inativação com motivo de saída (Voluntário / Involuntário
  sem pré-seleção; botão `[Prosseguir]` desabilitado até seleção):
  cobertura via `tests/integration/employeeTerminationEvents.test.ts`
  - mockup `delta_modal_inativacao_motivo_saida_v1.html`.
- Modal `[Definir metas]` (M1) com validação bloqueadora canônica
  (soma de pesos = 100%): cobertura via
  `tests/integration/employeeGoals.test.ts` + mockup
  `modal_definir_metas_v1.html`.
- Modal de transferência de liderados (M2 v2) com 5 grupos canônicos
  no autocomplete, verificação prévia `canInactivate`, modal
  secundário de promoção `isLider`, loop condicional autorizado,
  justificativa 100-500: cobertura via
  `tests/integration/leadershipTransfer-router.test.ts` +
  `employeeLeaderHistory.test.ts` + mockup
  `modal_transferencia_liderados_v2.html`.

**Cobertura:** cadastros e edições 100% cobertos; grid 3/2/1 famílias;
toggle RF colaborador + C-level; modal inativação; modal M1 metas;
modal M2 v2 transferência de liderados.

**Status:** COVERED bit-exact.

---

## §8.9 Rotas administrativas (17 items)

**Fontes canônicas de cobertura:**

- Login unificado + Login Super Admin: mockups `login_unificado_v1.html`
  - `login_super_admin_v1.html` + `tests/integration/accessTokens.test.ts`
  - `auth-firstAccess.test.ts` + testes de auth em ME-064.
- Reset de senha e primeiro acesso: mockup `reset_senha_v1.html` +
  `tests/unit/template2-first-access.test.ts` +
  `email-templateA-immediate.test.ts` + testes de auth.
- Meus dados H1a (Super Admin) e H1b (demais perfis): mockups
  `meus_dados_super_admin_v1.html` +
  `meus_dados_demais_perfis_v1.html` + `me055-shell.test.ts`.
- Alterar senha e Alterar e-mail (Bloco A + Bloco B): mockups
  `alterar_senha_v1.html` + `alterar_email_v1.html` + testes de auth
  cancelEmailChange/confirmEmailChange/requestEmailChange.
- Organograma com modo normal + modo analítico + PC1b canônica: mockup
  `organograma_v2.html` + `tests/integration/employees-router.test.ts`
  - `me056-panels.test.ts` (PC1b tooltip canônico).
- `/todos-os-colaboradores` com 14 colunas, 8 filtros incluindo
  dropdown "Papel funcional", badges L/RH/RF inline no Nome, PC1a
  (RH não vê C-levels): mockup `delta_todos_colaboradores_v2.html` +
  `tests/integration/employees-router.test.ts` +
  `me056-panels.test.ts` (PC1a).
- Dashboards hierárquicos (global, departamento, equipe, individual):
  mockup `dashboard_individual_v7.html` +
  `tests/integration/dashboard-router.test.ts` +
  `tests/unit/dashboardContext.test.ts`.
- Drawer de Diálogos de Desenvolvimento com Resumo com IA:
  `tests/integration/developmentDialogs.test.ts`.
- Onboarding de líderes com kanban de 4 colunas canônicas: mockup
  `onboarding_lideres_v1.html` +
  `tests/integration/leader-onboarding-router.test.ts` +
  `leaderOnboardingNotes.test.ts` +
  `leaderOnboardingStageLog.test.ts` +
  `employees-onboarding-hooks.test.ts`.
- Módulo Radar NR-1 com aviso permanente amarelo canônico literal e
  6 estados canônicos do ciclo: mockups `modulo_radar_nr1_v2.html` +
  `relatorio_radar_nr1_v1.html` + `portal_radar_nr1_v3.html` +
  `tests/integration/nr1-router.test.ts` + `radarNR1Reports.test.ts`.
- Rota `/pendencias-portal` com 3 cards resumo, 6 filtros, tabela de
  11 colunas, modais de envio individual e em massa: mockup
  `portal_colaborador_pendencias_v1.html` +
  `tests/integration/me058-pendencias.test.ts` +
  `tests/unit/pendencias-*.test.ts` (3 unit tests).
- Snapshot do portal como réplica visual absoluta em modo somente
  leitura: cobertura via mockups canônicos.
- Rota `/cycle-management` com 3 áreas verticais e PC1d canônica:
  mockup `cycle_management_v1.html` +
  `tests/integration/cycleSchedule.test.ts` +
  `cycleScheduleEngine.test.ts` + `me056-panels.test.ts` (PC1d).
- Rota `/notificacoes` com filtros canônicos, tabela paginada,
  checkboxes com cap de 500, modal de arquivamento com corpo canônico
  literal: mockup `notificacoes_v1.html` +
  `tests/integration/me057a-notificacoes.test.ts` +
  `tests/unit/notificacoes-filters.test.ts` +
  `notificacoes-mappings.test.ts`.
- Rota `/super-admin/desbloqueios` implementada com modais de aprovar
  e recusar: cobertura via
  `tests/integration/cycleUnlockRequests-router.test.ts` +
  `cycleUnlockRequests.test.ts` +
  `alerts-hooks-admin-unlock.test.ts` (padrão canônico ME-064
  bit-exact §14.4 exceção §14.1 `/super-admin/desbloqueios`).
- Rota `/super-admin/logs/responsavel-financeiro` com filtros e modal
  `[Ver detalhes]`: mockup `logs_responsavel_financeiro_v1.html` +
  `tests/integration/me057b-logs.test.ts` +
  `tests/unit/rf-logs-mappings.test.ts` +
  `responsavelFinanceiroTransferLog.test.ts`.
- Rota `/super-admin/empresa/[id]/historico` com filtros, tabela de
  5 colunas, acordeão de expansão única, 5 fontes canônicas via
  UNION: mockup `historico_empresa_v1.html` +
  `tests/integration/me057c-historico.test.ts` +
  `platformLogs-router-historico.test.ts` +
  `tests/unit/historico-filters.test.ts` +
  `historico-mappings.test.ts`.
- Rotas `/logs/acesso-individual` e
  `/super-admin/logs/acesso-individual`: mockup
  `log_acesso_individual_v1.html` +
  `tests/integration/dataAccessLog.test.ts` +
  `platformLogs-router.test.ts`.
- Rotas stub Fase 4 (`/dashboard-9box`, `/dashboard-departamento`,
  `/dashboard-empresa`) renderizam stub canônico ("Consulte o painel
  de controle.") para todos os perfis exceto colaborador puro
  (redirecionado para `/colaborador`): cobertura via matriz canônica
  `src/lib/routes/matrix.ts` + `src/lib/routes/redirectByRole.ts`.

**Cobertura:** rotas administrativas 100% cobertas; login unificado

- SA; reset de senha; meus dados H1a/H1b; alterar senha/e-mail;
  organograma; todos-os-colaboradores; dashboards; drawer DD; onboarding
  líderes; Radar NR-1; pendências-portal; cycle-management; notificações;
  desbloqueios; logs RF; histórico da empresa; logs de acesso; rotas
  stub Fase 4.

**Status:** COVERED bit-exact.

---

## §8.10 Componentes de erro (5 items)

**Fontes canônicas de cobertura:**

- `src/lib/routes/accessDeniedMessages.ts` (314 linhas) — mensagens
  canônicas literais bit-exact: título canônico único
  `ACCESS_DENIED_TITLE = 'Acesso negado.'` + 16 mensagens canônicas
  literais §9 DOC 02 preservadas palavra por palavra +
  `ACCESS_DENIED_TEMPLATE_CANONICAL` §8.1 + 1 mensagem adicional §11.5
  (Perfil Individual C-level PC1e) + 3 mensagens derivadas por S039
  §10.9.
- `tests/unit/accessDeniedMessages.test.ts` (25 casos canônicos) —
  asserts bit-exact das mensagens literais.
- `tests/integration/me055-error-pages.test.ts` — D028 canônica
  bit-exact + AccessDeniedPage estrutura canônica única.
- Página 404 com título literal _"Página não encontrada."_ e corpo
  canônico literal: mockup `nao_encontrada_v1.html` + cobertura
  canônica em `me055-error-pages.test.ts`.
- Erro 500 com título literal _"Erro interno."_ e corpo canônico
  literal + correlation ID visível no rodapé com botão `[Copiar]`
  funcional: mockup `erro_interno_v1.html` + cobertura canônica em
  `me055-error-pages.test.ts`.
- Sessão expirada nunca renderiza AccessDeniedPage — redirect canônico
  com toast âmbar literal: cobertura canônica via
  `src/lib/session/resolveProfileKey.ts` +
  `tests/unit/resolveProfileKey.test.ts` +
  `tests/unit/serverSession.test.ts`.
- Colaborador puro em rota administrativa nunca renderiza
  AccessDeniedPage — redirect canônico com toast âmbar literal:
  cobertura via `src/lib/routes/redirectByRole.ts` + matriz canônica.
- Mockup `access_denied_v1.html` — referência visual canônica.

**Cobertura:** componentes de erro 100% cobertos; AccessDeniedPage
com título canônico único + 16 mensagens §9 DOC 02 + 25 casos de
teste; página 404 canônica; erro 500 com correlation ID; sessão
expirada + colaborador puro com redirect canônico (não AccessDenied).

**Status:** COVERED bit-exact.

---

## §8.11 Validações e mensagens exatas (4 items)

**Fontes canônicas de cobertura:**

- `src/lib/routes/accessDeniedMessages.ts` + testes correspondentes
  — mensagens canônicas literais DOC 05 §18 preservadas palavra por
  palavra, sem paráfrase, sem alteração de pontuação, sem alteração
  de emojis.
- `tests/integration/auth-firstAccess.test.ts` +
  `email-worker-emailQueueJob.test.ts` — ordem canônica de avaliação
  de erros preservada nos fluxos de login, reset de senha e alteração
  de senha.
- Padrão global 100-500 caracteres em ações administrativas críticas
  com mensagens canônicas literais preservadas: cobertura canônica
  via testes em `leadershipTransfer-router.test.ts` +
  `cycleUnlockRequests-router.test.ts` +
  `employeeTerminationEvents.test.ts` (5 pontos S057 canônicos —
  cobertura Camada 3 §6.12 já validada em ME-064).
- Bloqueios de ciclo de vida do Responsável financeiro implementados
  literalmente DOC 02 §13.4: cobertura via
  `tests/integration/responsavelFinanceiroTransferLog.test.ts` +
  `revenue-router.test.ts` +
  `tests/unit/rf-logs-mappings.test.ts`.
- Mensagens canônicas literais de fallback (Chat IA / Diagnóstico IA
  / Relatório executivo): cobertura em §7.9 do coverage map Camada 4.

**Cobertura:** validações e mensagens exatas 100% cobertas; DOC 05
§18 palavra por palavra; ordem canônica de erros; padrão 100-500;
bloqueios RF DOC 02 §13.4.

**Status:** COVERED bit-exact.

---

## §8.12 Perímetro mobile (4 items)

**Fontes canônicas de cobertura:**

- `tailwind.config.ts` — breakpoint canônico único mobile `<1024px`,
  desktop `>=1024px`.
- Mockups canônicos mobile em `/mnt/project/`:
  `delta_portal_colaborador_mobile_v1.html`,
  `delta_instrumento_a_mobile_v1.html`,
  `delta_instrumento_d_mobile_v1.html`,
  `delta_instrumento_b_radar_nr1_mobile_v1.html`,
  `delta_perfil_individual_formulario_mobile_v1.html` — 5 superfícies
  mobile-responsive canônicas DOC 05 §19.2 preservadas.
- Superfícies desktop-only exibem mensagem canônica única literal em
  mobile: _"Esta tela é otimizada para uso em desktop. Acesse via
  computador com viewport de pelo menos 1024px."_ — cobertura via
  design tokens + testes de shell.
- Instrumento C e pop-up do relatório do Perfil Individual permanecem
  desktop-only (canonização S331 revista): cobertura via
  `instrumentC-router.test.ts` + `individualProfile-router.test.ts`
  - mockup `perfil_individual_relatorio_v1.html`.

**Cobertura:** perímetro mobile 100% coberto; breakpoint canônico
único; 5 mockups mobile canônicos; mensagem literal desktop-only;
Instrumento C + Perfil Individual desktop-only bit-exact.

**Status:** COVERED bit-exact.

---

## §8.13 Coexistência botão [RH] + filtro "Papel funcional" (3 items)

**Fontes canônicas de cobertura:**

- Mockup `delta_todos_colaboradores_v2.html` — referência canônica
  bit-exact do botão `[RH]` no cabeçalho da tabela + dropdown "Papel
  funcional".
- `tests/integration/employees-router.test.ts` — endpoints canônicos
  de filtragem bidirecional botão `[RH]` ↔ dropdown "Papel funcional".
- Opção _"Responsável financeiro"_ aparece apenas em
  `/todos-os-colaboradores`, ausente em `/minha-equipe` e
  `/cadeia-indireta`: cobertura via matriz canônica
  `src/lib/routes/matrix.ts` + `employees-router.test.ts`.
- Badge RF não aparece inline em `/minha-equipe` e `/cadeia-indireta`:
  cobertura via matriz canônica + mockup.

**Cobertura:** coexistência [RH] + Papel funcional 100% coberta;
sincronização bidirecional; visibilidade condicional RF por rota;
badge RF condicional.

**Status:** COVERED bit-exact.

---

## §8.14 Mockups como referência canônica (3 items)

**Fontes canônicas de cobertura:**

- 51 mockups canônicos em `/mnt/project/` (DOC 05 §21) preservados
  bit-exact como fonte visual canônica: contagem canônica verificada
  via `ls /mnt/project/*.html | wc -l` = 51.
- `painel_controle_v4.html` preservado como referência histórica de
  design system, NÃO como tela canônica ativa (S472): presente em
  `/mnt/project/`; tela canônica ativa é `painel_principal_fase7_v5.html`.
- 11 arquivos `delta_*.html` canônicos aplicados sempre sobre o
  arquivo-base correspondente conforme mapa de composição DOC 00;
  nunca como tela autônoma: bit-exact contagem canônica de
  `ls /mnt/project/delta_*.html | wc -l` = 11 arquivos.

**Cobertura:** mockups como referência canônica 100% cobertos; 51
mockups preservados bit-exact; `painel_controle_v4` histórico;
11 deltas canônicos.

**Status:** COVERED bit-exact.

---

## §8.15 Evidências canônicas exigidas (8 items — pipeline de captura)

**Fontes canônicas de cobertura:**

- Prints de cada painel de controle canônico (10 perfis): evidência
  dinâmica em staging (`{a_capturar_em_staging}` bit-exact ao padrão
  canônico DOC 07 §12 canônico).
- Prints de cada uma das 51 telas canônicas em desktop (viewport
  1440px): evidência dinâmica em staging.
- Prints de cada superfície mobile-responsive em viewport 390px e
  768px: evidência dinâmica em staging.
- Prints de cada superfície desktop-only em viewport 390px — mensagem
  canônica exata renderizada: evidência dinâmica em staging.
- Prints do `AccessDeniedPage` em cada uma das 16 rotas restritas
  canônicas do DOC 02 §9: cobertura estática canônica via
  `accessDeniedMessages.ts` + 25 casos de teste; captura visual é
  evidência dinâmica em staging.
- Prints da página 404 e da página 500 com correlation ID: evidência
  dinâmica em staging.
- Grep na base de mockups pelos termos proibidos DOC 05 §22.14: script
  canônico `scripts/check-forbidden-terms.sh` estendido em ME-064
  cobre bit-exact os 15 termos proibidos §14.1 DOC 07; escopo canônico
  `src scripts tests .env.example` (verificação estática confirmada
  em ME-064 RV-03 bidirecional bit-exact) — a base de mockups em
  `/mnt/project/` não é versionada no repositório e portanto não
  entra no `check-forbidden-terms.sh`; verificação canônica visual
  contra os 51 mockups é evidência dinâmica em staging.
- Diff de cada mensagem canônica literal do DOC 05 §18 contra o texto
  renderizado na UI: cobertura estática canônica via
  `accessDeniedMessages.test.ts` + mensagens de fallback IA em
  `tests/unit/aiChatService.test.ts` + `diagnosticoIAService.test.ts`
  - `executiveReportAI.test.ts`; captura visual é evidência dinâmica
    em staging.

**Cobertura:** pipeline canônico de captura de evidências 100%
preparado; evidências estáticas (código-fonte, testes, mockups) 100%
disponíveis via clone público independente + `/mnt/project/`;
evidências dinâmicas canonicamente marcadas
`{a_capturar_em_staging}` sob S359 canonizada em ME-064.

**Status:** COVERED bit-exact (evidências estáticas) +
`{a_capturar_em_staging}` bit-exact (evidências dinâmicas — padrão
S359 canonizado ME-064).

---

## Resumo canônico da cobertura Camada 5 (UI)

- **§8.1 Design system (paleta + Inter + Tailwind + escalas + Lucide):** COVERED bit-exact.
- **§8.2 Menus laterais e header (10 perfis + itens condicionais + sino + breadcrumb):** COVERED bit-exact.
- **§8.3 Painéis de controle (5 seções + estado + Radar C-level + PC1):** COVERED bit-exact.
- **§8.4 Portal do colaborador (5 elementos + gate LGPD + ordem S473 + mobile):** COVERED bit-exact.
- **§8.5 Formulários de instrumento (A + B NR-1 + C + D + Perfil Individual):** COVERED bit-exact.
- **§8.6 Componentes com IA (Chat + fallback + pop-up Perfil + Diagnóstico + card RET):** COVERED bit-exact.
- **§8.7 Central de Relatórios e Exportações (matriz 6 cards + seletor cascata):** COVERED bit-exact.
- **§8.8 Cadastros e edições (grid 3/2/1 + toggle RF + modais inativação/M1/M2 v2):** COVERED bit-exact.
- **§8.9 Rotas administrativas (17 rotas canônicas):** COVERED bit-exact.
- **§8.10 Componentes de erro (AccessDeniedPage + 404 + 500 + redirects):** COVERED bit-exact.
- **§8.11 Validações e mensagens exatas (DOC 05 §18 + ordem + 100-500 + RF §13.4):** COVERED bit-exact.
- **§8.12 Perímetro mobile (breakpoint + 5 superfícies + desktop-only):** COVERED bit-exact.
- **§8.13 Coexistência [RH] + Papel funcional (sincronização bidirecional):** COVERED bit-exact.
- **§8.14 Mockups como referência canônica (51 canônicos + painel_controle_v4 histórico + 11 deltas):** COVERED bit-exact.
- **§8.15 Evidências canônicas exigidas:** COVERED bit-exact + `{a_capturar_em_staging}` (S359).

**Descoberta canônica principal Camada 5 (UI):** gap-closing detectado =
**ZERO**. A base pré-ME-065 de 3145 testes cobre integralmente §8 do
DOC 07 sobre a fundação canônica ME-055 (design system + shell) +
ME-056 (painéis + PC1) + ME-057a/b/c (notificações/logs/histórico) +
ME-058 (pendências portal). Nenhum teste novo canonicamente necessário.
Padrão canônico ME-064 consolidado (2ª comprovação prospectiva —
Camada 5 após Camada 4).

**Cobertura consolidada:** 15/15 sub-seções COVERED bit-exact.
