# DOC 07 — VALIDACAO_ACEITACAO.md

**Natureza:** documento canônico fonte única de validação pós-deploy, critérios canônicos de aceitação por camada, template canônico de retorno do Manus e política canônica de correção pós-entrega da plataforma ROIP APP.

**Ordem no pacote:** oitavo e último documento por camada de construção do pacote ROIP APP. Precedido pelos DOCs 01 (Dados), 02 (Autenticação e autorização), 03 (Negócio), 04 (IA), 05 (UI) e 06 (Operações). Gerado cronologicamente antes do DOC 00 (índice orquestrador); na ordem canônica de leitura, o DOC 00 vem primeiro (S494).

**Papel canônico:** este documento fecha as 6 camadas anteriores. Consolida as validações pós-deploy, critérios de aceitação e templates de retorno de todas as fases de origem em um único artefato canônico de entrega governada. Substitui integralmente as seções de validação, aceitação e template das fases originais (Fases 1-8, Fase M Partes 1-3, Fase Exportáveis Partes 1-2, Fase Prontidão MVP).

**Regra de precedência inviolável:** este documento é o orquestrador da validação e aceitação — não redefine regras de negócio, schema, permissões, UI, IA ou operações. Em caso de conflito entre este documento e os DOCs 01-06 nas regras canônicas de comportamento do sistema, prevalecem os DOCs 01-06 como fonte única de suas camadas. Este DOC 07 tem autoridade canônica exclusiva sobre: (a) o que verificar pós-deploy, (b) como o Manus estrutura o artefato de retorno, (c) como Bruno audita a entrega, (d) política de correção pós-entrega.

**Versionamento:** este documento é integral e completo — nunca aplicado como delta. Substitui integralmente as seções §14-§17 da Fase 1, §14-§16 da Fase 2, §13-§15 da Fase 3, §14-§16 da Fase 3B, §16-§18 da Fase 4, §13-§15 da Fase 5, §14-§16 da Fase 6, §14-§16 da Fase 7, §14-§17 da Fase 8, §14-§16 da Fase M Parte 1, §16-§18 da Fase Prontidão MVP, §14-§16 da Fase Exportáveis Parte 2, e seções equivalentes de todos os demais canônicos de fase.

---

## 1. Cabeçalho e regras de leitura

**Consumidor canônico:** o Manus consome este documento como fonte única e integral do que verificar antes de declarar a implementação concluída, de que forma estruturar o retorno da entrega e como reagir a decisões de correção pós-entrega. Nenhum item deste documento admite paráfrase, omissão ou reordenação silenciosa.

**Auditor canônico:** Bruno é o único auditor da entrega. Nenhuma outra instância revisa, aprova ou solicita correções.

**Regra editorial da Rota B:** títulos com primeira letra maiúscula apenas; sem tabelas salvo quando estritamente necessárias para representar matrizes fechadas; português do Brasil executivo; mensagens canônicas literais preservadas palavra por palavra, sem paráfrase, sem alteração de pontuação, sem alteração de emojis; nenhuma cadência do tipo "Vamos" ou "Assim, você" na estrutura fixa; nenhum elogio a decisões passadas.

**Regra inviolável de leitura pelo Manus:** todo checklist marcado como validação pós-deploy neste documento é binário e verificável. Todo cenário nomeado sob critérios canônicos de aceitação (§10) exige execução em staging com dados sintéticos, evidência estruturada e decisão binária (aprovado / não aprovado). Aprovação parcial de cenário é proibida — se qualquer item de um cenário falhar, o cenário inteiro fica "não aprovado" e a diferença é declarada em §13 do template canônico de retorno.

**Regra inviolável de leitura pelo auditor:** Bruno audita a entrega seção a seção contra §4-§10 deste documento. Cada checkbox marcada pelo Manus é auditada — leitura da evidência colada obrigatória. Nenhuma checkbox marcada sem evidência é aceita. Auditoria conclui em decisão binária global: (a) aprovada — deploy em produção autorizado; (b) não aprovada — Bruno decide correção em conversa própria pós-Manus, fora do escopo canônico da Rota B (§13).

---

## 2. Escopo, princípios invioláveis e dependências

### 2.1 O que este DOC cobre

- Checklist canônico de validação pós-deploy por camada de construção — 6 checklists (§4 a §9), um por camada, consolidando toda a validação estrutural dispersa nas fases originais.
- Critérios canônicos de aceitação por camada — cenários end-to-end nomeados (§10), com contexto de dados sintéticos, evidência esperada e critério de aprovação binário.
- Regras canônicas invioláveis do template `RETORNO_ROIP_MVP.md` (§11) — nível de exigência, escopo do preenchimento, formato de evidência, ordem canônica das seções.
- Template canônico literal `RETORNO_ROIP_MVP.md` (§12) — artefato único que o Manus preenche ao final da construção e entrega a Bruno.
- Política canônica de correção pós-entrega (§13) — via única sem retorno estruturado ao ciclo canônico da Rota B.
- Verificação global canônica de termos e nomes proibidos (§14) — consolidação das listas idênticas dos DOCs 02, 05 e 06.
- Checklist de conformidade do próprio DOC 07 (§15) — insumo da auditoria final de arquiteto.

### 2.2 O que este DOC NÃO cobre

- Regras de schema, migrations ou seed — fonte única DOC 01.
- Regras de autenticação, autorização, sessão, gate LGPD, `AccessDeniedPage` e matriz PC1 — fonte única DOC 02.
- Regras de negócio, motores determinísticos, routers de domínio e cadastros — fonte única DOC 03.
- Regras da participação da Claude API, prompts, contagem defensiva, cache e fallback — fonte única DOC 04.
- Regras de design system, menus, telas, estados, mensagens exatas e perímetro mobile — fonte única DOC 05.
- Regras de alertas, sino, e-mails, ciclos, jobs cron, LGPD operacional, log de acesso individual, onboarding de líderes, exportáveis e turnover — fonte única DOC 06.

### 2.3 Princípios invioláveis

- **Nenhum desvio silencioso do template.** Toda decisão técnica, ajuste, otimização, correção defensiva ou interpretação do Manus é declarada explicitamente em §13 do `RETORNO_ROIP_MVP.md`. Silêncio configura entrega não conforme.
- **Preenchimento integral obrigatório.** Nenhuma seção do template pode ser omitida. Seção sem conteúdo aplicável usa a frase padrão canônica (declarada no template).
- **Evidências verificáveis.** Cada checkbox marcada exige evidência colável no artefato de retorno — query SQL + output, print de tela + rota + perfil autenticado, resposta tRPC serializada, valor persistido em tabela, log estruturado com timestamp, hash SHA-256 quando aplicável.
- **Via única sem retorno estruturado.** A entrega ao Manus é de mão única. Qualquer correção pós-entrega é iterada em conversa própria pós-Manus, fora do escopo canônico do pacote da Rota B — não há novo ciclo Manus → Claude → Bruno automático.
- **Cenário de aceitação é binário.** Aprovação parcial de cenário é proibida — se qualquer item de um cenário falhar, o cenário inteiro fica "não aprovado".
- **Mensagens canônicas literais.** Todas as mensagens canônicas exatas dos DOCs 02, 03, 04, 05 e 06 preservadas palavra por palavra na verificação e no template. Paráfrase configura desvio.
- **Termos proibidos ausentes globalmente.** Verificação canônica global (§14) obrigatória antes da entrega. Uma única ocorrência de termo proibido em código, comentário, migration, UI, log, PDF, planilha ou template configura entrega não conforme.

### 2.4 Dependências horizontais

- **Consome DOC 01:** inventário de 53 tabelas, enums fechados, campos canônicos, FKs, índices, migrations, seed, imutabilidade e retenção, nomenclaturas superadas §19.
- **Consome DOC 02:** enum canônico do claim `role`, roteamento pós-login, JWT sliding 8h + Super Admin sem exp + portal via sessionStorage, tabela `accessTokens` (fluxos H2 e H3), gate LGPD, `AccessDeniedPage` com 16 mensagens canônicas exatas, matriz de rotas × 5 perfis, matriz PC1a-f e guarda de agregados, elegibilidade e cardinalidade do Responsável financeiro.
- **Consome DOC 03:** motor do Eixo X (CC5 dia 10 / dia 11), motor do Eixo Y, 9-Box, motor do Perfil Individual, motor do IQL/Clima/Engajamento, motor do Radar NR-1, motor do Turnover, Central de Relatórios, transferência de liderados M2 v2, padrão 100-500 caracteres, aplicação de PC1 na camada de negócio.
- **Consome DOC 04:** IA nunca calcula, Chat IA 4 níveis, Diagnóstico IA 3 estados, System prompt do Perfil Individual, Relatório executivo trimestral, wrapper `claudeCall`, governança 5/dia, política canônica de fallback.
- **Consome DOC 05:** design system, menus por perfil, painéis de controle, portal do colaborador desktop + mobile, formulários A/C/D/B/PI, componentes com IA, Central de Relatórios, cadastros e edições, rotas administrativas, componentes de erro, perímetro mobile canônico.
- **Consome DOC 06:** absorção da §12 da revisão do Responsável financeiro (condição S407), 17 tipos de alerta com snapshots, cycleSchedule com 3 estados canônicos, 7 templates de e-mail, pipeline anti-ruído M1-M7, sino canônico, 3 workers de e-mail, fluxo P11 de desbloqueio, motor de ciclos automáticos, 8 jobs agendáveis (7 de propriedade da camada 6 + `runDailyClimateAggregationJob` do DOC 03 — S499), Change log via UNION de 5 fontes, LGPD operacional, log de acesso individual, onboarding de líderes, exportáveis e turnover operacional.
- **Fecha para:** DOC 00 (índice orquestrador), auditoria final de arquiteto de software, entrega ao Manus.

---

## 3. Regras canônicas de validação e distinção entre validação pós-deploy e critérios de aceitação

### 3.1 Definição canônica de validação pós-deploy

Validação pós-deploy é checklist binário estrutural, verificado por inspeção pontual do artefato construído — schema do banco, código-fonte, migrations aplicadas, jobs registrados, templates renderizados, componentes exportados, endpoints tRPC listados. Cada item é uma proposição verificável objetivamente (a proposição é verdadeira ou falsa) sem necessidade de simular fluxo end-to-end. Evidência canônica típica: query SQL + output, `SHOW TABLES`, `SHOW COLUMNS`, `SHOW INDEX`, `SHOW CREATE TABLE`, listagem de arquivos, trecho de código, output de log de boot.

### 3.2 Definição canônica de critérios de aceitação

Critérios canônicos de aceitação são cenários end-to-end nomeados com prefixo temático canônico (AU, AC, NE, IA, UI, OP, TR — §3.3), executados em staging com dados sintéticos, e verificados pela ocorrência do resultado observável esperado. Cada cenário contém 5 componentes canônicos fixos: (a) código canônico + nome curto; (b) contexto de dados sintéticos exigidos; (c) sequência de passos observáveis executados pelo Manus; (d) evidência esperada com formato canônico (query SQL + output, print de tela + rota + perfil autenticado, resposta tRPC serializada, log estruturado com timestamp); (e) critério de aprovação binário — aprovado se todos os componentes de evidência corresponderem ao esperado; não aprovado em qualquer outra situação.

### 3.3 Prefixos canônicos de cenários

Cinco domínios funcionais + um transversal + um de camada de IA:

- **AU** — Autenticação e sessão (fluxos de login, reset, primeiro acesso, alteração de e-mail, gate LGPD, sessão expirada, rate limits).
- **AC** — Autorização e PC1 (matriz de rotas × 5 perfis, PC1a-f, Responsável financeiro).
- **NE** — Negócio determinístico (motores dos instrumentos, ciclos, cálculos, cadastros, transferências, padrão 100-500).
- **IA** — IA interpretativa (Perfil Individual, Chat IA, Diagnóstico IA, Relatório executivo, falha de API).
- **UI** — Interface (painéis, portal, formulários, organograma, componentes de erro, perímetro mobile).
- **OP** — Operações (17 tipos de alerta, sino, e-mails, ciclos automáticos, jobs, LGPD operacional, log de acesso, onboarding, exportáveis, turnover).
- **TR** — Transversais (CC5, padrão 100-500, termos proibidos, imutabilidade, auditabilidade cross-tabela).

### 3.4 Regra canônica de nomenclatura de cenários

Cada cenário é nomeado com prefixo canônico + numeração sequencial dentro do prefixo — `AU.1`, `AU.2`, `AC.1`, `NE.1`, etc. A numeração é fixa neste documento; o Manus reproduz o código canônico literalmente no artefato de retorno, no formato: `Cenário AU.1 — Login unificado com precedência isRH: [aprovado / não aprovado]`.

### 3.5 Regra canônica de execução dos cenários pelo Manus

- Dados sintéticos gerados em staging pelo próprio Manus, com identificadores estáveis para permitir replicação da auditoria por Bruno.
- Ordem de execução dos cenários é livre — não há dependência canônica entre cenários (cada cenário é independente).
- Evidência colada literalmente no artefato de retorno na seção correspondente à camada (§4 a §10 do template).
- Cenário reexecutado após correção durante a construção: apenas o resultado final é reportado; iterações intermediárias não entram no artefato de retorno.

### 3.6 Regra canônica de auditoria pelo Bruno

- Bruno lê cada checkbox marcada e a evidência colada — verificação nominal item por item.
- Auditoria detecta 3 situações distintas: (a) checkbox marcada com evidência conforme = item aprovado; (b) checkbox marcada com evidência insuficiente ou inconsistente = item bloqueado; (c) checkbox marcada com item omitido ou renomeado silenciosamente = entrega considerada não conforme globalmente.
- Decisão final da auditoria é binária global: entrega aprovada (deploy autorizado) ou entrega não aprovada (correção decidida em conversa própria pós-Manus, fora do escopo canônico deste pacote — §13).

### 3.7 Regra canônica de conformidade global

A entrega é considerada conforme e aprovada se e somente se:

- Todos os 6 checklists de validação pós-deploy (§4-§9) estiverem integralmente marcados com evidência colada.
- Todos os cenários canônicos de aceitação (§10) estiverem aprovados individualmente.
- Nenhuma ocorrência de termo proibido (§14) for encontrada em qualquer artefato.
- Nenhuma decisão técnica não declarada em §13 do template for detectada pela auditoria.
- Todas as mensagens canônicas literais dos DOCs 02, 03, 04, 05 e 06 estiverem preservadas palavra por palavra.

---

## 4. Checklist de validação pós-deploy — Camada 1 (Dados)

Consolida DOC 01 §20 (Checklist de conformidade do schema) + Fase 8 §14.1 (com aplicação de S485-S486) + Fase 6 §14.1 (com aplicação de S487) + Fase Exportáveis P2 §14.1 + Fase Prontidão MVP §16 (banco) + Fase M P1 §14.6 (com aplicação de S488). Todas as inconsistências residuais das fontes de origem foram resolvidas por superação — o checklist abaixo é fonte única.

### 4.1 Inventário de tabelas

- [ ] Exatamente 53 tabelas criadas — nenhuma a mais, nenhuma a menos, conforme inventário do DOC 01 §3.
- [ ] Nenhuma tabela ou coluna listada em DOC 01 §19 (nomenclaturas superadas e tabelas-fantasma) presente no schema.
- [ ] Verificação nominal: nenhuma tabela `emailSettings`, `emailChangeRequests`, `nr1PGRDocuments` presente — nunca criada em base viva.
- [ ] Verificação nominal: nenhuma coluna `resetPasswordTokenHash`, `resetPasswordExpiresAt`, `resetPasswordUsedAt`, `firstAccessCompleted` presente em `superAdmins`, `employees` ou `cLevelMembers`.
- [ ] Verificação nominal: nenhuma coluna `cadenciaCOPSOQ` presente em `companies`.

### 4.2 Núcleo cadastral e enums fechados

- [ ] `superAdmins` conforme DOC 01 §4.
- [ ] `companies` contém `timezone`, `encarregadoLgpdNome`, `encarregadoLgpdEmail`, `encarregadoLgpdTelefone`, `encarregadoLgpdPoliticaUrl`; NÃO contém `cadenciaCOPSOQ`.
- [ ] `employees` contém `isRH`, `isLider`, `isResponsavelFinanceiro`, `onboardingEstagio`, `onboardingUltimoEstagio`, `passwordSet`; NÃO contém colunas denormalizadas de reset de senha.
- [ ] `cLevelMembers` contém `isResponsavelFinanceiro`, `acessoTotal`; NÃO contém `isRH`.
- [ ] `departments` populada com exatamente 19 linhas na ordem e grafia canônicas do DOC 01 §15.1 — sem qualquer rota de escrita exposta.
- [ ] `accessTokens` conforme DOC 01 §4.8 — enum `type` com 2 valores exatos `'first_access'` e `'password_reset'`; nenhum outro valor aceito.
- [ ] Enum `departamento` de dados cadastrais com 19 valores canônicos — enum distinto e intocável em relação ao enum `tipo` de `notifications`/`alerts`.

### 4.3 Desempenho e diagnóstico

- [ ] `performanceVariableData` contém `desempenho`, `peso`; FK denominada `performanceDataId`.
- [ ] `performanceQuarterlyData` contém `diagnosticoIA` e `diagnosticoIAgeradoEm`.
- [ ] `performanceData` conforme DOC 01 §7 — nenhum campo derivado persistido em contradição com a regra canônica de cálculo idempotente.
- [ ] `monthlyClosureStatus` com estados canônicos `aberto`, `fechado`, `desbloqueado`.
- [ ] `monthlyUnlockLog` contém `unlockRequestId` INT nullable com FK `SET NULL` para `cycleUnlockRequests`; enum `aba` com 3 valores canônicos.
- [ ] `performanceMultiplierLog` presente e append-only.

### 4.4 Instrumentos, 9-Box, Perfil Individual, IQL, Clima, NR-1

- [ ] `plenitudeData`, `plenitudeScoreLog` conforme DOC 01 §8.
- [ ] `ninebox` snapshot trimestral persistido conforme DOC 03 §7.
- [ ] `individualProfileResponses`, `individualProfileScores`, `individualProfileReports` conforme DOC 01 §9.
- [ ] `climateEngagementData` aceita escopo `equipe` com `liderId` e unique key de 5 colunas conforme DOC 01 §12.
- [ ] `iqlScores` conforme DOC 01 §8.
- [ ] `copsoqCycles`, `copsoqCycleSnapshot`, `copsoq_responses`, `copsoqFactorScores`, `nr1AreaDivergenceAnalysis`, `radarNR1Reports` conforme DOC 01 §11 — nenhuma tabela `nr1PGRDocuments` presente.
- [ ] `copsoq_responses` com constraints canônicas de `fator`, `itemIndex`, valor.

### 4.5 Alertas, notificações, e-mails e ciclos

- [ ] `alerts` na estrutura final canônica: enum `severidade` com 4 valores (`'info'`,`'observacao'`,`'atencao'`,`'critico'`), enum `escopo` com 3 valores (`'empresa'`,`'departamento'`,`'colaborador'`), `escopoEmployeeId`, `suprimidoPorCooldown`; FKs e índices canônicos do DOC 01 §12.
- [ ] `notifications` na estrutura final canônica: `severidade`, `arquivadaEm`, `alertId` com FK `SET NULL` para `alerts`; índices `idx_notifications_arquivada` e `idx_notifications_alertId`.
- [ ] Enum lógico de `tipo` de `notifications`/`alerts` com exatamente 17 valores nomeados canônicos (composição 2 NR-1 + 13 Fase 8 + 2 Responsável financeiro), conforme DOC 01 §15.2 e DOC 06 §3.
- [ ] Rejeição server-side de valores fora dos 17 valores canônicos de `tipo`; nenhuma referência a contagens superadas ("15", "19") em código, comentário ou log.
- [ ] `emailNotifications` conforme DOC 01 §12 — tabela ativa, com FKs para `companies`, `notifications`, `employees`.
- [ ] `cycleSchedule` conforme DOC 01 §12 — 11 colunas, unique key `uk_cycleSchedule_ciclo`, FK `companyId`, 2 índices canônicos; enum de status persistido com exatamente 3 valores (`'aberto'`,`'atrasado'`,`'fechado'`) — sem status `'futuro'` persistido (S480 aplicada).
- [ ] `emailQueue` conforme DOC 01 §12 — 12 colunas, 3 FKs, 2 índices.
- [ ] `digestExecutionLog` conforme DOC 01 §12 — 7 colunas, unique key `uk_digestExecutionLog_week`.
- [ ] `cycleUnlockRequests` conforme DOC 01 §12 — `solicitanteTipo`/`solicitanteId` polimórficos; `aba` com 3 valores; SEM FK formal em `liderId`.

### 4.6 Exportáveis, logs administrativos e cadastros complementares

- [ ] `employeeTerminationEvents` conforme DOC 01 §13 — append-only, `actorTipo`/`actorId` polimórficos.
- [ ] `executiveReportCache` conforme DOC 01 §13 — `geradoPorTipo`/`geradoPorId` polimórficos, UNIQUE canônica `(companyId, escopoTipo, escopoReferencia, trimestre)`.
- [ ] `apiUsageLog` conforme DOC 01 §13 — UNIQUE canônica `(companyId, tipo, dataUso)`.
- [ ] `platformLogs` conforme DOC 01 — 5 fontes canônicas para UNION do Change log/Histórico da empresa.
- [ ] `employeeLeaderHistory` contém `reason VARCHAR(500) NOT NULL` e `transferBatchId CHAR(36) NOT NULL`, com índice canônico por batch.
- [ ] `responsavelFinanceiroTransferLog` conforme DOC 01 e DOC 06.
- [ ] `portalReminderLog` conforme DOC 01 §12 — enum `instrumentType` com exatamente 4 valores canônicos (`meuPerfil`, `autoAvaliacao`, `avaliacaoLiderancaDireta`, `radarNR1`); índice composto canônico.
- [ ] `companyJobFamilies` conforme DOC 01 — constraint `UNIQUE (companyId, jobFamily, variableIndex)`; enum `jobFamily` idêntico ao de `employees.jobFamily`; cascata `ON DELETE CASCADE` com `companies`.

### 4.7 LGPD e onboarding de líderes

- [ ] `lgpdConsents` conforme DOC 01 §14 — constraints de exclusividade e índices canônicos.
- [ ] `dataAccessLog` conforme DOC 01 §14 — enums canônicos de `tipoAcesso` e `agentType`; append-only preservado.
- [ ] `leaderOnboardingNotes` conforme DOC 01 §14 — append-only preservado.
- [ ] `leaderOnboardingStageLog` conforme DOC 01 §14 — append-only preservado; contém `estagioAnterior` e `estagioNovo` canônicos.

### 4.8 Regras de imutabilidade, append-only e retenção

- [ ] Todas as tabelas append-only listadas em DOC 01 §16.1 sem endpoints de UPDATE ou DELETE expostos via tRPC ou API pública.
- [ ] Registros imutáveis por regra de negócio (DOC 01 §16.2) sem rota de escrita após criação — verificação nominal do código.
- [ ] Regra global de deleção física (DOC 01 §16.3) preservada — soft delete via `status` onde canônico; deleção física proibida onde canônico.
- [ ] Regras canônicas de retenção do DOC 01 §16.4 aplicadas em código (Chat IA arquivamento após 6 meses via cron canônico 03:00 UTC).

### 4.9 Migrations e seed

- [ ] Ordem completa de migrations executada conforme DOC 01 §17.2 — todas as migrations aplicadas com sucesso, na sequência canônica.
- [ ] Tratamento de dados históricos aplicado onde canônico (DOC 01 §17.3) — em particular para `employeeLeaderHistory` (`reason` e `transferBatchId` com valores default para históricos preexistentes, D043 e D048).
- [ ] Seed do Super Admin (Bruno Andrade) executado — 1 registro em `superAdmins` com senha via `SEED_SUPER_ADMIN_PASSWORD` do vault, conforme DOC 01 §18.1.
- [ ] Seed da tabela `departments` executado com 19 linhas — nenhuma linha a mais, nenhuma linha a menos, conforme DOC 01 §18.2.
- [ ] Zero registros em todas as demais tabelas após seed inicial exceto `departments` e `superAdmins`.

### 4.10 Evidências canônicas exigidas

- [ ] `SHOW TABLES;` — 53 linhas exatas.
- [ ] `SELECT COUNT(*) FROM departments;` — retorno 19.
- [ ] `SELECT COUNT(*) FROM superAdmins;` — retorno 1.
- [ ] `SHOW COLUMNS FROM alerts LIKE 'severidade';` — enum canônico.
- [ ] `SHOW COLUMNS FROM notifications LIKE 'alertId';` — coluna presente.
- [ ] `SHOW INDEX FROM notifications WHERE Key_name = 'idx_notifications_alertId';` — índice presente.
- [ ] `SELECT COUNT(*) FROM companies WHERE timezone IS NULL AND status='ativa';` — retorno 0.
- [ ] `SHOW TABLES LIKE 'emailSettings';` — vazio.
- [ ] `SHOW TABLES LIKE 'emailChangeRequests';` — vazio.
- [ ] `SHOW TABLES LIKE 'nr1PGRDocuments';` — vazio.
- [ ] Grep `resetPasswordTokenHash|firstAccessCompleted|cadenciaCOPSOQ` em migrations — zero ocorrências.

---

## 5. Checklist de validação pós-deploy — Camada 2 (Autenticação e autorização)

Consolida DOC 02 §14 (integral) + Fase M P1 §14.1-§14.5 (com aplicação de S484 e S488) + Fase Prontidão MVP §16 (LGPD). Substitui integralmente os checklists de origem.

### 5.1 Perfis e roteamento

- [ ] Enum canônico do claim `role` do JWT contém exatamente 5 valores: `'super_admin'`, `'rh'`, `'rh_lider'`, `'clevel'`, `'lider'`. Nenhum outro valor aceito. Não existe `'colaborador'`.
- [ ] Roteamento pós-login em `/` segue estritamente a regra de precedência canônica: `isRH = true` prevalece; se ausente, C-level; se ausente, `isLider = true`; caso contrário, falha com mensagem canônica e `redirectUrl: "/colaborador"`.
- [ ] Regra de precedência `isRH` prevalece implementada e testada em cenário RH-Líder (colaborador com ambos os flags `true`).
- [ ] Roteamento em `/login-super-admin` sempre resulta em `role: 'super_admin'`.
- [ ] Middleware server-side é a barreira efetiva de autorização em todas as rotas administrativas; frontend replica visualmente sem ser a única barreira.

### 5.2 Sessão e token

- [ ] JWT do Super Admin não carrega claim `exp` — sessão nunca expira por inatividade.
- [ ] JWT dos demais perfis administrativos carrega `exp: sliding 8h`; renovação a cada request autenticado bem-sucedido.
- [ ] Portal do colaborador opera com `sessionStorage`; fechamento da aba encerra a sessão; portal é independente das sessões administrativas.
- [ ] `accessTokens` é a fonte única de tokens de primeiro acesso e reset; enum `type` exato: `'first_access'`, `'password_reset'`.
- [ ] Nenhuma coluna denormalizada `resetPasswordTokenHash`, `resetPasswordExpiresAt`, `resetPasswordUsedAt`, `firstAccessCompleted` presente em `superAdmins`, `employees` ou `cLevelMembers`. `passwordSet` é o marcador canônico de primeiro acesso concluído em `employees` e `cLevelMembers`.
- [ ] Tabela `emailChangeRequests` inexistente — fluxo H3 opera sobre `accessTokens` com `type='password_reset'` + metadado JWT interno `tipo: 'email_change'` + `expiresAt = createdAt + INTERVAL 24 HOUR`.
- [ ] Expiração canônica dos tokens: 7 dias para `first_access` e `password_reset` de login/reset; 24 horas para alteração de e-mail do Super Admin.
- [ ] Uso único por token: `usedAt` gravado no consumo bem-sucedido; tentativas subsequentes retornam a mensagem canônica exata *"Este link expirou. Solicite um novo."* (mesma mensagem para expirado / usado / inválido — anti-enumeração).
- [ ] Concorrência canônica: ao gerar novo token do mesmo `type` para o mesmo usuário, tokens anteriores ativos são marcados como `usedAt = NOW()` — apenas 1 ativo por (`userType`, `userId`, `type`).
- [ ] Invalidação de sessão canônica: `/alterar-senha` invalida todas as sessões exceto a atual; `/alterar-email` concluído invalida todas inclusive a atual do Super Admin; reset de senha invalida todas inclusive a atual.
- [ ] Middleware de status de empresa ativo em toda procedure autenticada de perfil administrativo. `companies.status = 'inativa'` retorna 403 com `forceLogout: true`.
- [ ] Rate limits canônicos ativos em todas as 6+ rotas conforme DOC 02 §5.8 — chaves canônicas preservadas.

### 5.3 Consentimento LGPD

- [ ] Gate LGPD aplica-se exclusivamente ao portal `/colaborador` (qualquer usuário do portal: colaborador puro, líder, RH, C-level).
- [ ] Gate LGPD não aplica-se ao Super Admin nem a nenhuma rota administrativa.
- [ ] Variável de ambiente `LGPD_TERM_VERSION` é a fonte única da versão vigente do termo — sem tabela nova, sem versão por empresa.
- [ ] Texto canônico literal v1.0 do termo preservado palavra por palavra conforme DOC 02 §7 — verificação por diff contra o canônico.
- [ ] Eyebrow canônico contextual: `"Primeiro acesso"` ou `"Termo atualizado"`.
- [ ] Aceite gera registro em `lgpdConsents` com `versaoTermoAceita = LGPD_TERM_VERSION` e `aceitoEm = NOW()`. Sem estado "pendente".
- [ ] Bump de versão do termo reexibe gate no próximo acesso ao portal, sem invalidar sessões ativas.

### 5.4 `AccessDeniedPage` e mensagens canônicas

- [ ] Componente `AccessDeniedPage` único e canônico — nenhum "empty state" residual em `/pendencias-portal` (D028 aplicada).
- [ ] Todas as 16 mensagens canônicas exatas do DOC 02 §9 implementadas literalmente — nenhuma alteração de palavra, pontuação ou nomenclatura. Verificação por diff.
- [ ] Mensagens derivadas com sinalizações S434 (Onboarding de líderes), S437 (Faturamento da empresa), S438 (Logs administrativos — Responsável financeiro) preservadas literalmente conforme DOC 02 §9.
- [ ] Sessão expirada nunca renderiza `AccessDeniedPage` — sempre redirect para `/` (ou `/login-super-admin`) com toast âmbar canônico.
- [ ] Colaborador puro em rota administrativa nunca renderiza `AccessDeniedPage` — sempre redirect para `/colaborador` com toast âmbar canônico.
- [ ] Bruno em `/minha-equipe` ou `/cadeia-indireta` sempre redirect para `/super-admin` com toast âmbar canônico literal *"Rota indisponível para Super Admin."*.

### 5.5 Matrizes de acesso e PC1

- [ ] Matriz unificada de rotas × perfis do DOC 02 §10 implementada integralmente — todas as rotas listadas cobertas por middleware server-side.
- [ ] Rotas canônicas: `/super-admin/desbloqueios` e `/cycle-management`. Rotas `/desbloqueios` isolada e `/gestao-ciclos` NÃO existem (S431 e S432 aplicadas).
- [ ] PC1a (D030): filtro `role != 'clevel'` implementado no backend em `/todos-os-colaboradores` para RH e RH-Líder — verificação nominal do código.
- [ ] PC1b (D031): nós de C-level renderizam como não clicáveis para RH e RH-Líder no organograma, com tooltip canônico literal *"Detalhes restritos ao Super Admin"*.
- [ ] PC1c (S413 / S447): agregados analíticos (contadores, IQL, Clima, Radar NR-1 agregado, distribuição 9-Box, cards resumo do painel de controle do RH) incluem C-levels normalmente para RH — verificação nominal: nenhum backend exclui `cLevelMembers` de agregados quando `role IN ('rh', 'rh_lider')`.
- [ ] PC1d (D032 + D033): `/cycle-management` e Radar NR-1 exibem contadores agregados incluindo C-levels + listagens nominais individuais omitindo C-levels para RH e RH-Líder.
- [ ] PC1e (D034): Perfil Individual de C-level bloqueado para RH e RH-Líder com mensagem canônica em DOC 02 §11.5. Botão `[Ver Perfil Individual]` removido de superfícies de RH sobre C-level.
- [ ] PC1f (D035): rota `/dashboard-individual/:id` para `userType='clevel'` retorna `AccessDeniedPage` com mensagem canônica de DOC 02 §9.10 para RH e RH-Líder. Botões de acesso removidos das superfícies de RH.
- [ ] Nenhuma superfície aplica PC1 seletivamente — regra DOC 02 §11.7 preservada em toda tela.

### 5.6 Responsável financeiro

- [ ] Cardinalidade global por empresa = 1 registro `isResponsavelFinanceiro = true` na união `employees` ∪ `cLevelMembers`. Validada por procedure no backend, nunca por constraint SQL.
- [ ] Elegibilidade: `employees` exige `isRH = true` OR `isLider = true`; `cLevelMembers` sempre elegível.
- [ ] Toggle `[Ativar como Responsável financeiro]` exclusivo de Bruno. Modal canônico de transferência com justificativa 100-500 caracteres quando já existe titular.
- [ ] Bloqueio canônico de inativação, deleção e desmarcação de RH/Líder do titular vigente com modal canônico e mensagem literal do DOC 02 §13.4.
- [ ] Item de menu `Faturamento da empresa` condicional a `isResponsavelFinanceiro = true`, com ícone `DollarSign`, posicionado imediatamente acima de `Dados mensais` em RH, Líder e C-level. Ausente no menu global `/super-admin`.
- [ ] Matriz de permissões de `/faturamento-mensal` (DOC 02 §3.2) implementada — RF acessa mês aberto e mês desbloqueado; Bruno acessa também mês fechado e desbloqueia.
- [ ] Matriz de visualização dos cards financeiros no Dashboard da empresa (DOC 02 §3.3) implementada — C-level `acessoTotal = false` NÃO visualiza ROI e % folha; Líderes NÃO visualizam nenhum dos 5 cards.

### 5.7 Evidências canônicas exigidas

- [ ] Login de teste em cada um dos 5 perfis (Super Admin, RH, RH-Líder, C-level, Líder) com print da tela pós-login.
- [ ] JWT emitido para o Super Admin — decoded sem claim `exp`.
- [ ] JWT emitido para RH — decoded com `exp = iat + 8h`.
- [ ] Chamada `/api/trpc/authenticatedRouter.getMyData` de RH após 6h de inatividade — retorna sucesso com JWT renovado.
- [ ] Chamada `/api/trpc/authenticatedRouter.getMyData` de RH com JWT expirado — retorna 401 com toast âmbar canônico ao frontend.
- [ ] Grep no código-fonte por `emailSettings|emailChangeRequests|firstAccessCompleted|resetPasswordTokenHash|resetPasswordExpiresAt|resetPasswordUsedAt|/gestao-ciclos|/desbloqueios\W|leadershipQualityIndex|Painel principal|PGR|nr1PGRDocuments` — zero ocorrências (respeitando `/super-admin/desbloqueios` como rota canônica).
- [ ] Print do `AccessDeniedPage` em cada uma das 16 rotas restritas canônicas listadas em DOC 02 §9.
- [ ] Diff do texto do termo LGPD implementado contra o canônico literal do DOC 02 §7 — zero divergências.
- [ ] Print de `/todos-os-colaboradores` autenticado como RH — nenhum C-level aparece.
- [ ] Print do organograma autenticado como RH — nós de C-level renderizados sem clique, com tooltip literal.

---

## 6. Checklist de validação pós-deploy — Camada 3 (Negócio)

Consolida DOC 03 (integral) + Fase 2 §14 + Fase 3 §13 + Fase 3B §14 + Fase 4 §16 (com aplicação de S491 e S492) + Fase 5 §13 + Fase 6 §14.2-§14.5 + Fase 7 §14 + Fase 8 §14.2-§14.5 + Fase Exportáveis P2 §14 + Fase Prontidão MVP §16. Substitui integralmente os checklists de origem.

### 6.1 Motor determinístico do Eixo X (Desempenho)

- [ ] Cadência canônica CC5 aplicada: dados mensais (RH, Líderes, faturamento) aceitos até o fim do dia 10 do mês subsequente; transição automática `aberto → fechado` às 00:00 do dia 11 no fuso local da empresa.
- [ ] Corte dos instrumentos trimestrais (A, C, D) canônico: dia 10 do mês subsequente ao trimestre encerrado (regra distinta e coexistente com o fechamento mensal — CC5 preservada em ambos os domínios sem sobreposição).
- [ ] Entradas do motor conforme DOC 03 §3.2 — nenhuma entrada adicional aceita.
- [ ] Regras de peso e disponibilidade de variáveis conforme DOC 03 §3.3.
- [ ] Fórmulas canônicas do Eixo X conforme DOC 03 §3.4 — nenhuma alteração de coeficiente, arredondamento ou clamp.
- [ ] Bloco financeiro trimestral conforme DOC 03 §3.5.
- [ ] Diagnóstico econômico trimestral da empresa conforme DOC 03 §3.6.
- [ ] Motivos canônicos de ignorar registrados em log conforme DOC 03 §3.7 — sem silêncio em nenhum motivo.
- [ ] Auditabilidade dos cálculos trimestrais preservada — nenhum campo derivado gravado que impeça recálculo determinístico.
- [ ] Retroatividade assimétrica canônica implementada conforme DOC 03 §3.9.
- [ ] Recálculo pós-desbloqueio idempotente conforme DOC 03 §3.10.

### 6.2 Fechamento mensal, desbloqueio e recálculo

- [ ] Rotina canônica de fechamento mensal executa às 00:00 do dia 11 no fuso local da empresa via `runDailyClosureJob`.
- [ ] `processClosedMonth` chama `evaluateMonthlyAlerts` + `updateCycleSchedule('fechamento_mensal', ...)` — assinatura da procedure original inalterada.
- [ ] Fluxo P11 de desbloqueio operacional conforme DOC 03 §4 + DOC 06 §13 — transação atômica de aprovação executa 4 UPDATEs/INSERTs canônicos; falha simulada em qualquer passo → rollback total.
- [ ] Reversão automática pós-24h implementada com recálculo condicional se `houveAlteracao=true`.
- [ ] Marca visual permanente do mês desbloqueado preservada.

### 6.3 Faturamento bruto e Responsável financeiro

- [ ] Motor de faturamento bruto operacional conforme DOC 03 §5.
- [ ] Nomeação de Responsável financeiro executa transação canônica conforme DOC 06 §24.10 — inclusive alerta `responsavel_financeiro_nomeado` para o próprio RF.
- [ ] Transferência de titularidade de RF opera com modal canônico de justificativa 100-500 caracteres — sem constraint SQL, cardinalidade validada em backend.
- [ ] Aviso amarelo canônico em empresa sem Responsável financeiro implementado conforme DOC 02 §13.5 — mensagem literal preservada.
- [ ] Tooltip canônico do item `Faturamento da empresa` após nomeação implementado conforme DOC 02 §13.6.

### 6.4 Motor determinístico do Eixo Y (Plenitude) e 9-Box

- [ ] Motor do Eixo Y conforme DOC 03 §6 — cadência trimestral, fórmulas canônicas preservadas.
- [ ] `calculatePlenitudeScore` chama `evaluatePlenitudeAlerts` após upsert em `plenitudeData` — assinatura original inalterada.
- [ ] Composição determinística do 9-Box conforme DOC 03 §7 — thresholds canônicos.
- [ ] Recálculo retroativo de thresholds do 9-Box conforme regra canônica (D054 resolvida upstream).
- [ ] Snapshot trimestral persistido em `ninebox` — ninguém acessa `ninebox` em UPDATE após criação.
- [ ] `triggerQuarterlyCalculation` chama `evaluateQuarterlyAlerts` + `updateCycleSchedule('instrumento_c', ...)`.

### 6.5 Instrumento D e IQL

- [ ] Motor do Instrumento D e IQL conforme DOC 03 §8.
- [ ] Piso amostral canônico preservado — pisos R15.1 e R15.2 aplicados.
- [ ] Constante interna `leadershipQualityIndex` NÃO presente no código — o termo canônico é `IQL` conforme S409.

### 6.6 Bloco Clima e Engajamento

- [ ] Motor do Clima e Engajamento conforme DOC 03 §9.
- [ ] Cardinalidade de escopo `equipe` com `liderId` opcional preservada; unique key de 5 colunas em `climateEngagementData` respeitada em upsert.
- [ ] Escala canônica 0-5,9 vermelho / 6,0-7,4 amarelo / 7,5-10 verde preservada em cálculos e retornos.

### 6.7 Perfil Individual — motor determinístico

- [ ] Motor do Perfil Individual conforme DOC 03 §10 — cálculos determinísticos executados no backend antes de qualquer chamada à IA.
- [ ] 3 níveis canônicos de confiabilidade preservados: `consistente`, `inconsistente`, `bloqueado`.
- [ ] Regra canônica de retest preservada — 2 tentativas por trimestre.
- [ ] `individualProfile.submitAssessment` chama `evaluateProfileAlerts` após `calculateProfileScores` — assinatura original inalterada.
- [ ] 80 itens canônicos preservados conforme especificação técnica do Perfil Individual — sem itens adicionais, sem itens removidos.

### 6.8 Radar NR-1

- [ ] Motor do Radar NR-1 conforme DOC 03 §11.
- [ ] `closeNR1Cycle` chama `evaluateNR1Alerts` após persistência + `updateCycleSchedule('radar_nr1', ...)` + popula `notifications.alertId` na transação.
- [ ] `evaluateNR1Alerts` usa `emitAlertPostGravacao` — não regrava em `alerts` nem em `notifications` (Fase 6 já gravou).
- [ ] 32 itens em 8 blocos de 4 preservados no questionário do portal.
- [ ] Regra canônica de invalidação silenciosa preservada: colaborador com 32 respostas idênticas ou tempo < 180s tem resposta marcada como inválida (mas vê toast de sucesso).
- [ ] Colaborador não pode responder o mesmo ciclo duas vezes.
- [ ] Card some do portal quando ciclo fecha às 00:00 no fuso local.
- [ ] Janela mínima canônica de 30 dias entre abertura e fechamento validada no modal de configuração.
- [ ] Modal de configuração impede sobreposição com ciclo agendado ou aberto na mesma empresa.
- [ ] Relatório PDF gerado on-the-fly a partir dos dados persistidos — servido apenas via endpoint autenticado.
- [ ] Nome do arquivo PDF segue padrão canônico `Radar_NR-1_[empresa_normalizado]_[data_abertura]_[data_geracao].pdf`.
- [ ] PDF tem 13 páginas com estrutura conforme DOC 03 §11 — cabeçalho e rodapé em todas as páginas exceto capa; paginação "Página X de 13" correta.
- [ ] Faixa vermelha na capa aparece apenas se adesão ≤ 50%.
- [ ] Seção 12 do PDF (Sugestões) gerada por template determinístico canônico — sem IA.
- [ ] Seção 13 do PDF exibe hash SHA-256, dados de configuração e nota de auditoria de edição se aplicável.
- [ ] Zero ocorrências de "PGR", "Programa de Gerenciamento de Riscos Psicossociais", "Pesquisa NR-1" ou "nr1PGRDocuments" no PDF, no código do módulo, na UI, no menu, nos e-mails ou em qualquer texto.

### 6.9 Turnover

- [ ] Motor do Turnover conforme DOC 03 §12 e DOC 06 §23.
- [ ] Fonte única canônica `employeeTerminationEvents` — nenhuma coluna nova de motivo de saída em `employees`.
- [ ] Cálculo exclui `cLevelMembers` em qualquer escopo — verificação nominal.
- [ ] Colaboradores com `nivelHierarquico='Estratégico'` entram normalmente no cálculo.
- [ ] Abertura por nível hierárquico aparece apenas no escopo Empresa; ausente em Departamento e Equipe.
- [ ] Turnover nunca aparece no escopo Equipe em nenhum dos 3 artefatos onde o indicador existe.
- [ ] Reativação e reinativação geram novos registros em `employeeTerminationEvents` — registro anterior imutável.
- [ ] Cálculos canônicos trimestral e rolling 12m implementados; escopos empresa e departamento; abertura por motivo (voluntário/involuntário).
- [ ] Router interno `turnover.*` presente conforme DOC 03 §19.9; sem tela dedicada.

### 6.10 Central de Relatórios e Exportações

- [ ] Router `exports.*` conforme DOC 03 §19.10 — 6 procedures canônicas.
- [ ] Governança canônica de custo do Relatório executivo trimestral — limite 5 gerações/dia por empresa; contador em `apiUsageLog` com UNIQUE `(companyId, tipo, dataUso)`; reset à 00:00 local da empresa.
- [ ] Mensagem canônica literal do limite atingido preservada conforme DOC 04 §13.3.
- [ ] Cache canônico do Relatório executivo trimestral com chave `(companyId, escopoTipo, escopoReferencia, trimestre)` em `executiveReportCache` — UPDATE (não INSERT duplicado) confirmado ao regenerar mesma chave.
- [ ] Estrutura de colunas da Evolução trimestral (xlsx) conforme DOC 03 §13 e Fase Exportáveis P2 §10.2 — cabeçalho de 2 linhas mescladas correto; bloco de Turnover presente e correto por escopo.
- [ ] Nota de trimestre insuficiente aparece apenas quando a empresa não tem nenhum trimestre fechado; cards permanecem visíveis.
- [ ] Nota de histórico parcial inserida corretamente quando empresa tem menos de 4 trimestres fechados.
- [ ] Seletor de escopo em cascata (Nível → dropdown contextual) implementado nos 4 artefatos aplicáveis conforme DOC 05 §12.5.
- [ ] Board deck one-pager omite silenciosamente a opção "Equipe" no dropdown de Nível.
- [ ] Card Clima e engajamento usa dropdown único de "Ciclo" — não usa cascata.

### 6.11 Transferência de liderados — M2 v2

- [ ] Motor da transferência de liderados M2 v2 conforme DOC 03 §14 — modal canônico com 5 grupos de autocomplete (Líder direto, Líder ativo qualquer, Colaborador ativo elegível, Sublíder na cadeia, Bruno).
- [ ] Verificação prévia `canInactivate` executada antes de abrir modal secundário de promoção `isLider`.
- [ ] Modal secundário de promoção `isLider` acionado quando destinatário é colaborador comum não-líder.
- [ ] Loop condicional autorizado preservado — cadeia de transferência entre múltiplos líderes.
- [ ] Justificativa 100-500 caracteres obrigatória com validação canônica de tamanho.
- [ ] Persistência canônica em `employeeLeaderHistory` com `reason VARCHAR(500) NOT NULL` e `transferBatchId CHAR(36) NOT NULL` preenchidos.
- [ ] Mensagens canônicas literais de M2 v2 preservadas conforme DOC 03 §14 e DOC 05 §18.10.
- [ ] Ordem de execução: motivo de saída (extensão do modal de inativação) confirmado antes da abertura do M2 quando aplicável.

### 6.12 Padrão canônico transversal — 100-500 caracteres

- [ ] Padrão global aplicado nas 4 ações administrativas críticas canônicas: transferência de liderados (M2 v2), transferência de Responsável financeiro, solicitação de desbloqueio, recusa de desbloqueio.
- [ ] Regra de validação de tamanho canônica: mínimo 100 caracteres inclusive, máximo 500 caracteres inclusive, contando após trim.
- [ ] Mensagens canônicas literais de erro preservadas conforme DOC 03 §2.3.
- [ ] Comportamento canônico do contador (`X / 500 caracteres`) implementado.
- [ ] Persistência canônica da justificativa — coluna `reason`, `motivo` ou equivalente conforme domínio, sempre com valor real gravado.
- [ ] Marca visual permanente canônica implementada onde canônico.

### 6.13 Cadastros e ciclo de vida de vínculos

- [ ] Cadastro de empresa com nova subseção "Encarregado de dados (LGPD)" com validação de obrigatoriedade dos campos canônicos (nome e e-mail obrigatórios; telefone e URL opcionais).
- [ ] Cadastro/edição de colaborador com toggle `[Ativar como Responsável financeiro]` conforme delta v2 canônico.
- [ ] Cadastro/edição de C-level com toggle `[Ativar como Responsável financeiro]` sempre habilitado, sem elegibilidade, conforme delta v1 canônico.
- [ ] Cadastro de RH canônico preservado.
- [ ] Cadastro em massa de colaboradores via planilha canônico preservado — comportamento incremental conforme DOC 03 §16.6.
- [ ] Deleção canônica conforme DOC 03 §16.4 — apenas quando canônico.
- [ ] Perfil Individual criado automaticamente conforme DOC 03 §16.5.
- [ ] Modal de inativação de colaborador comum com radio buttons Voluntário / Involuntário sem pré-seleção; botão `[Prosseguir]` desabilitado até seleção.
- [ ] Modal de inativação de C-level SEM campo motivo de saída.
- [ ] Transação de inativação grava `employeeTerminationEvents` com snapshot de `nivelHierarquicoSnapshot` e `departamentoSnapshot` no momento da inativação.
- [ ] Routers tRPC de cadastros conforme DOC 03 §16.7.

### 6.14 Motor de instrumentos e ciclos automáticos

- [ ] 5 tipos canônicos de `tipoCiclo` em `cycleSchedule` implementados conforme DOC 03 §17.1.
- [ ] 3 estados canônicos persistidos: `aberto`, `atrasado`, `fechado` — rótulo visual derivado "Futuro" tratado como derivação canônica de UI, não como status persistido.
- [ ] Distinção canônica entre `cycleSchedule.status` (3 valores) e `copsoqCycles.status` (agendado/aberto/fechado) preservada.
- [ ] Hook `refreshCycleSchedule(companyId)` conforme DOC 03 §17.3 — idempotente.
- [ ] Hook `updateCycleScheduleStatuses()` conforme DOC 03 §17.4.
- [ ] Hook `updateCycleSchedule(tipoCiclo, cicloReferencia, campos)` idempotente com disparo de `evaluateAutoAlerts` conforme DOC 03 §17.5.
- [ ] Hook `incrementCycleScheduleCounter(cycleScheduleId, delta=+1)` otimista conforme DOC 03 §17.6.
- [ ] Gatilhos canônicos de negócio para o pipeline de alertas conforme DOC 03 §17.7.

### 6.15 Routers tRPC — inventário canônico do domínio de negócio

- [ ] Todos os routers do inventário do DOC 03 §19 presentes:
  - Domínio Eixo X e faturamento (§19.1).
  - Domínio ciclos e desbloqueios (§19.2).
  - Domínio Responsável financeiro (§19.3).
  - Domínio Eixo Y (Plenitude) e 9-Box (§19.4).
  - Domínio Instrumento D e IQL (§19.5).
  - Domínio Bloco Clima e Engajamento (§19.6).
  - Domínio Perfil Individual (§19.7).
  - Domínio Radar NR-1 (§19.8).
  - Domínio Turnover (§19.9).
  - Domínio Central de Relatórios (§19.10).
  - Domínio Transferência de liderados (§19.11).
  - Domínio Cadastros (§19.12).
  - Domínio Motor de instrumentos e ciclos automáticos (§19.13).
- [ ] Autorização canônica por procedure implementada — todas as procedures cobertas por middleware server-side.
- [ ] Códigos HTTP canônicos aplicados conforme DOC 03 e DOC 05 §18.

### 6.16 Evidências canônicas exigidas

- [ ] Execução do `processClosedMonth` no dia 11 do mês de teste — verificação de `monthlyClosureStatus.status='fechado'` para todas as empresas com timezone `America/Sao_Paulo`.
- [ ] Cenário canônico de desbloqueio: `SELECT * FROM monthlyClosureStatus WHERE companyId={id} AND month={mes};` antes e depois de aprovação — mudança canônica de estado observada.
- [ ] Cálculo trimestral do Perfil Individual em staging — resultado do backend igual ao cálculo manual da fórmula.
- [ ] Fechamento de ciclo NR-1 em staging — 32 respostas por colaborador, 5+ respondentes por departamento; observação de `alerts` e `notifications` gerados.
- [ ] `SELECT COUNT(*) FROM employeeTerminationEvents WHERE colaboradorId={id};` após ciclo inativa-reativa-inativa — retorno 2 registros.
- [ ] Modal M2 v2 executado end-to-end: log de queries mostrando `SELECT canInactivate`, INSERT em `employeeLeaderHistory` com `reason` e `transferBatchId` populados, UPDATE em `employees.liderDiretoId` para o novo líder.
- [ ] Geração do Relatório executivo trimestral 6 vezes consecutivas em uma empresa no mesmo dia — 6ª tentativa recebe mensagem canônica literal de limite atingido.
- [ ] PDF do Radar NR-1 gerado — hash SHA-256 exibido na Seção 13; nenhuma ocorrência de "PGR" em grep no PDF renderizado.

---

## 7. Checklist de validação pós-deploy — Camada 4 (IA)

Consolida DOC 04 (integral). Substitui integralmente os checklists de origem sobre IA (Fase 4 §16 sobre Chat IA e Diagnóstico IA; Fase 5 §13 sobre Perfil Individual + IA; Fase Exportáveis P2 §14 sobre Relatório executivo).

### 7.1 Princípio inviolável — IA nunca calcula

- [ ] Nenhuma superfície da camada de IA executa cálculo de score, média, agregação ou classificação. Verificação nominal do código de cada superfície de IA.
- [ ] IA recebe sempre pacote numérico canônico pré-calculado pelo backend determinístico (DOC 03), acompanhado de contexto interpretativo.
- [ ] Nenhum system prompt instrui a IA a calcular ou recalcular valores.

### 7.2 Padrões canônicos transversais desta camada

- [ ] Todos os padrões canônicos transversais do DOC 04 §2 implementados — sem exceções.
- [ ] Modelo canônico único preservado: variável de ambiente `CLAUDE_MODEL` referenciada em todas as chamadas — nenhum modelo hardcoded no código.

### 7.3 Perfil Individual — Momento 1 e Momento 2

- [ ] Momento 1 (cálculo determinístico) executado integralmente no backend antes de qualquer chamada à IA.
- [ ] Momento 2 (geração de texto interpretativo) chama a IA apenas após Momento 1 concluído com sucesso.
- [ ] System prompt canônico do Perfil Individual conforme DOC 04 §4 (Anexo A) — reproduzido literalmente, sem alteração de nenhuma palavra ou pontuação.
- [ ] Payload canônico de user prompt do Perfil Individual conforme DOC 04 §8 — pacote numérico canônico dos blocos A-G.
- [ ] Geração de PDF do relatório do Perfil Individual disponível apenas para Bruno e RH.
- [ ] Regra canônica de retest preservada — texto gerado somente após tentativa `consistente` ou reteste `consistente`; tentativa `inconsistente` bloqueia geração.

### 7.4 Chat IA — arquitetura canônica

- [ ] Chat IA acessível em exatamente 4 níveis de dashboard canônicos: global, departamento, equipe, individual.
- [ ] Contexto canônico do Chat IA por nível conforme DOC 04 §12.2.
- [ ] Histórico ativo carregado ao abrir o chat; histórico arquivado disponível em modo read-only.
- [ ] Contexto do dashboard individual NÃO inclui dados financeiros quando o usuário logado é líder.
- [ ] Mensagem vazia bloqueada; mensagem com mais de 2000 caracteres bloqueada com mensagem canônica de erro.
- [ ] Arquivamento canônico de conversas de mais de 6 meses via cron `archiveAiConversationsJob` (03:00 UTC).

### 7.5 Diagnóstico IA — arquitetura canônica

- [ ] 3 estados canônicos implementados: (a) sem diagnóstico para o trimestre — botão `[Gerar diagnóstico]` exibido; (b) com diagnóstico do trimestre atual — texto renderizado + botão `[Atualizar diagnóstico]`; (c) com diagnóstico de trimestre anterior — read-only, sem botão de atualização.
- [ ] `performanceQuarterlyData.diagnosticoIA` e `.diagnosticoIAgeradoEm` populados após geração — persistência canônica em `performanceQuarterlyData`.
- [ ] Cache canônico do Diagnóstico IA respeitado — mesma chave por trimestre.
- [ ] Contexto canônico do Diagnóstico IA conforme DOC 04 §12.4.

### 7.6 Relatório executivo trimestral — modelo híbrido canônico

- [ ] Arquitetura híbrida canônica preservada: 5 pacotes-bloco temáticos + 1 pacote-síntese, cada um com chamada à IA distinta e cache dedicado.
- [ ] Pacotes canônicos numéricos do DOC 04 §12.3 enviados ao user prompt sem alteração.
- [ ] Cache canônico em `executiveReportCache` com chave `(companyId, escopoTipo, escopoReferencia, trimestre)`.
- [ ] Governança canônica de custo — limite 5 gerações/dia por empresa registrado em `apiUsageLog`; reset à 00:00 local da empresa.
- [ ] Handoff canônico DOC 04 §7.11 → sino do disparante preservado; sem entrada no Change log da empresa (S482 Opção B).

### 7.7 System prompts canônicos — inventário e localização

- [ ] Todos os system prompts canônicos do DOC 04 §9 presentes no repositório em localização canônica.
- [ ] Nenhum system prompt paraphraseado, editado ou complementado silenciosamente.
- [ ] Padrão canônico transversal preservado em cada system prompt (identidade, escopo, tom, limites, gatilhos de recusa).

### 7.8 Governança operacional canônica

- [ ] Política canônica única de retry (S448) implementada no wrapper `claudeCall`.
- [ ] Contagem defensiva canônica de tokens e limites de contexto (S456) implementada — verificação nominal do wrapper.
- [ ] Observabilidade canônica de chamadas implementada: latência, tokens de input, tokens de output, custo estimado, timestamp, `companyId`, superfície acionadora.
- [ ] Segurança canônica de chave de API preservada — `CLAUDE_API_KEY` sempre em vault; nunca em logs, nunca em prints, nunca em telas.

### 7.9 Falha da API — política canônica de fallback

- [ ] Fallback canônico em falha do Perfil Individual Momento 2 conforme DOC 04 §11.1 — mensagem canônica literal preservada.
- [ ] Fallback canônico em falha do Chat IA conforme DOC 04 §11.2.
- [ ] Fallback canônico em falha do Diagnóstico IA conforme DOC 04 §11.3.
- [ ] Fallback canônico em falha do Relatório executivo trimestral conforme DOC 04 §11.4 — sem incremento de `apiUsageLog`.
- [ ] Mensagens canônicas literais de fallback por superfície reproduzidas conforme DOC 04 §13.2 — sem paráfrase.
- [ ] Mensagem canônica exata do limite diário atingido reproduzida conforme DOC 04 §13.3.

### 7.10 Interface canônica com DOC 03 (handoffs consumidos)

- [ ] Pacote numérico canônico do Perfil Individual (blocos A-G) consumido conforme DOC 04 §12.1.
- [ ] Contexto canônico do Chat IA por nível consumido conforme DOC 04 §12.2.
- [ ] Cinco pacotes-bloco + pacote-síntese do Relatório executivo trimestral consumidos conforme DOC 04 §12.3.
- [ ] Contexto canônico do Diagnóstico IA consumido conforme DOC 04 §12.4.

### 7.11 Interface canônica com DOC 05 (superfícies acionadas)

- [ ] Estados canônicos de UI durante geração implementados conforme DOC 04 §13.1 — spinner + mensagem contextual + botão desabilitado.
- [ ] Botões e estados canônicos por artefato implementados conforme DOC 04 §13.4.

### 7.12 Wrapper `claudeCall` canônico

- [ ] Função utilitária canônica única `claudeCall(payload, opts)` presente e compartilhada por todas as superfícies.
- [ ] Todo request para a Claude API desta camada passa por esta função — grep nominal do código confirma zero chamadas diretas ao endpoint `https://api.anthropic.com/v1/messages` fora de `claudeCall`.
- [ ] Formatação canônica do request implementada: modelo `CLAUDE_MODEL`, headers canônicos, autenticação via `CLAUDE_API_KEY` do vault.

### 7.13 Evidências canônicas exigidas

- [ ] Grep do repositório por padrão de cálculo dentro de arquivos de IA — zero ocorrências que resultem em score derivado.
- [ ] Diff do system prompt canônico do Perfil Individual implementado contra o DOC 04 §4 — zero divergências.
- [ ] Print do Chat IA em cada um dos 4 níveis (global, departamento, equipe, individual) — resposta gerada com sucesso.
- [ ] Print do Diagnóstico IA em cada um dos 3 estados canônicos.
- [ ] Log estruturado de 1 chamada à Claude API — campos `latency_ms`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `timestamp`, `companyId`, `surface`.
- [ ] Simulação de falha da API na geração do Relatório executivo — verificação de fallback canônico + ausência de incremento em `apiUsageLog`.
- [ ] Simulação de 5 gerações consecutivas do Relatório executivo em uma empresa no mesmo dia — 6ª tentativa retorna mensagem canônica literal de limite.

---

## 8. Checklist de validação pós-deploy — Camada 5 (UI)

Consolida DOC 05 §22 (Checklist de conformidade da camada de UI — integral) + Fase 3 §13 + Fase 3B §14 + Fase 4 §16 + Fase 5 §13 + Fase 7 §14 (com aplicação de S489) + Fase 8 §14.6-§14.7 + Fase Exportáveis P2 §14.2-§14.6 + Fase Prontidão MVP §16. Substitui integralmente os checklists de origem.

### 8.1 Design system

- [ ] Paleta de cores canônica implementada literalmente conforme DOC 05 §2.1.
- [ ] Fonte Inter aplicada em toda a UI conforme DOC 05 §2.2 — nenhuma fonte adicional.
- [ ] Padrões de classes Tailwind canônicos aplicados uniformemente conforme DOC 05 §2.3.
- [ ] Escala canônica do dashboard de Clima e Engajamento preservada (0-5,9 vermelho / 6,0-7,4 amarelo / 7,5-10 verde).
- [ ] Escala canônica do Radar dos fatores psicossociais preservada (0-49 vermelho / 50-65 amarelo / 66-100 verde).
- [ ] Cores canônicas dos nós do organograma preservadas.
- [ ] Ícones Lucide canônicos mapeados literalmente por item de menu conforme DOC 05 §2.7 (S466 Opção A).

### 8.2 Menus laterais e header

- [ ] Menu global do Super Admin (DOC 05 §3.1) e menu dentro-de-empresa do Super Admin (DOC 05 §3.2) implementados como estruturas distintas (S462).
- [ ] Item "Meus dados" implementado com rota `/meus-dados` em todos os 10 perfis (D022-D025, S461).
- [ ] Item "Faturamento da empresa" condicional a `isResponsavelFinanceiro = true`, posicionado imediatamente acima de "Dados mensais" em RH, Líder e C-level; ausente no menu global do Super Admin (S463-S465).
- [ ] Item "Radar NR-1" presente apenas em Bruno (dentro-empresa) e RH; ausente em C-level e Líder (S471).
- [ ] Item "Relatórios e exportações" presente em Bruno (dentro-empresa), RH, C-level `acessoTotal = true` e Responsável financeiro; ausente em C-level `acessoTotal = false` e Líder.
- [ ] Item "Onboarding de líderes" presente em Bruno (dentro-empresa) e RH; ausente nos demais perfis.
- [ ] Item "Log de acesso individual" presente em RH (rota `/logs/acesso-individual`) e como subitem de "Logs administrativos" em Bruno (rota `/super-admin/logs/acesso-individual`).
- [ ] Sino de notificações no topbar presente apenas para Bruno e RH; ausente em C-level e Líder (S474).
- [ ] Indicador contextual "Navegando como Super Admin — [Nome da empresa]" implementado em todas as sub-rotas dentro-de-empresa.
- [ ] Breadcrumb dentro-de-empresa implementado.

### 8.3 Painéis de controle

- [ ] Ordem canônica das 5 seções (Visão geral → Minha equipe → Cadeia indireta → Meu portal → Radar da empresa) preservada em todos os painéis.
- [ ] Estado "Coleta de dados em andamento" implementado em cards de status antes do primeiro trimestre completo (S470).
- [ ] Painel do C-level implementa Radar da empresa com 6 componentes canônicos (canonização da Fase 8 §10.4 integrada em DOC 05 §5.7, S469).
- [ ] Ausência do Radar NR-1 no menu do C-level implementada (S471).
- [ ] Card resumo "Pendências no portal" implementado apenas em Bruno e RH; ausente em Líder e C-level.
- [ ] Zonas placeholder "9-Box" e "Status da plataforma" com textos canônicos exatos por escopo.
- [ ] Miniatura de Onboarding de líderes (mini-kanban) presente na tela da empresa do Bruno e no painel de RH; ausente no painel global do Bruno.

### 8.4 Portal do colaborador

- [ ] Tela de entrada `/colaborador` restrita aos 5 elementos canônicos: logo ROIP APP centrado, título "Acesso ao Portal", label "Digite seu CPF para acessar", input CPF com máscara, botão `[Entrar]`. Nenhum outro elemento.
- [ ] Gate LGPD renderizado após identificação por CPF e antes da tela de pendências, com texto canônico literal do termo v1.0 e eyebrow contextual.
- [ ] Ordem canônica de cards na tela de pendências implementada: Radar NR-1 sempre primeiro; demais por data limite ascendente (S473).
- [ ] Modal "Privacidade e proteção de dados" com 3 abas canônicas (Termo, Contatos, Meus dados) implementado.
- [ ] Portal mobile-responsive com estratégia canônica de CSS puro (Tailwind), sem lógica condicional de componente por viewport.

### 8.5 Formulários de instrumento

- [ ] Instrumento A mobile implementado com rolagem única + header sticky + rodapé sticky.
- [ ] Instrumento C implementado como desktop-only.
- [ ] Instrumento D com nome do líder avaliado no header.
- [ ] Instrumento B (Radar NR-1) com modal de aviso pré-questionário canônico literal + 8 blocos de 4 perguntas + rodapé com 3 variações de texto dinâmico canônico + contador de tempo silencioso.
- [ ] Formulário do Perfil Individual com estrutura de 3 zonas fixas (header / corpo / footer), navegação por bloco, 3 tipos de item (Likert, EF, cenário situacional), regra de volta única, bloco 10 sem botões de salvar/fechar, tela de confirmação canônica.

### 8.6 Componentes com IA

- [ ] Chat IA implementado como drawer flutuante lateral com histórico ativo e arquivado.
- [ ] Mensagens canônicas literais de fallback do DOC 04 §13.2 reproduzidas sem paráfrase.
- [ ] Pop-up do relatório do Perfil Individual com aba resumo (default), aba versão expandida (alternada pelo botão do header), botão `[Baixar PDF]` visível apenas para Bruno e RH.
- [ ] Diagnóstico IA com 3 estados canônicos.
- [ ] Card do Relatório executivo trimestral com estados canônicos completos, contador diário e mensagem literal de limite.

### 8.7 Central de Relatórios e Exportações

- [ ] Matriz de visibilidade de 6 cards por perfil implementada literalmente conforme DOC 05 §12.3.
- [ ] Seletor de escopo em cascata (Nível → dropdown contextual) implementado nos 4 artefatos aplicáveis.
- [ ] Card Board deck one-pager omite silenciosamente a opção "Equipe" no dropdown de Nível.
- [ ] Card Clima e engajamento usa dropdown único de "Ciclo" (não usa cascata).

### 8.8 Cadastros e edições

- [ ] Grid canônico 3/2/1 de famílias de função implementado em cadastro de colaborador e cadastro de C-level (S477).
- [ ] Toggle "Ativar como Responsável financeiro" implementado no cadastro/edição de colaborador (delta v2) e no cadastro/edição de C-level (delta v1 — sempre habilitado, sem elegibilidade).
- [ ] Modal de inativação com motivo de saída implementado com radio buttons Voluntário / Involuntário sem pré-seleção; botão `[Prosseguir]` desabilitado até seleção.
- [ ] Modal `[Definir metas]` (M1) com validação bloqueadora canônica (soma de pesos = 100%).
- [ ] Modal de transferência de liderados (M2 v2) com 5 grupos canônicos no autocomplete, verificação prévia `canInactivate`, modal secundário de promoção `isLider`, loop condicional autorizado, justificativa 100-500.

### 8.9 Rotas administrativas

- [ ] Login unificado e Login Super Admin implementados com estados canônicos completos.
- [ ] Reset de senha e primeiro acesso na mesma tela com diferenciação por rota + query param + `type`.
- [ ] Meus dados H1a (Super Admin) e H1b (demais perfis) com renderização por perfil.
- [ ] Alterar senha e Alterar e-mail (Bloco A + Bloco B) implementados.
- [ ] Organograma com modo normal + modo analítico + aplicação PC1b canônica (RH sobre C-level sem clique, tooltip literal *"Detalhes restritos ao Super Admin"*).
- [ ] `/todos-os-colaboradores` com 14 colunas, 8 filtros incluindo dropdown "Papel funcional", badges L/RH/RF inline no Nome com ordem canônica, aplicação PC1a (RH não vê C-levels).
- [ ] Dashboards hierárquicos (global, departamento, equipe, individual) com botões de subir nível e regras de renderização de área de ação.
- [ ] Drawer de Diálogos de Desenvolvimento com Resumo com IA.
- [ ] Onboarding de líderes com kanban de 4 colunas canônicas, mudança de estágio exclusivamente via modal, bloqueio absoluto do próprio estágio para o líder.
- [ ] Módulo Radar NR-1 com aviso permanente amarelo canônico literal e 6 estados canônicos do ciclo.
- [ ] Rota `/pendencias-portal` com 3 cards resumo, 6 filtros, tabela de 11 colunas, modais de envio individual e em massa com textos canônicos literais.
- [ ] Snapshot do portal como réplica visual absoluta em modo somente leitura.
- [ ] Rota `/cycle-management` com 3 áreas verticais e aplicação PC1d canônica.
- [ ] Rota `/notificacoes` com filtros canônicos, tabela paginada, checkboxes com cap de 500, modal de arquivamento com corpo canônico literal.
- [ ] Rota `/super-admin/desbloqueios` implementada com modais de aprovar e recusar.
- [ ] Rota `/super-admin/logs/responsavel-financeiro` com filtros e modal `[Ver detalhes]`.
- [ ] Rota `/super-admin/empresa/[id]/historico` com filtros, tabela de 5 colunas, acordeão de expansão única, 5 fontes canônicas via UNION.
- [ ] Rotas `/logs/acesso-individual` e `/super-admin/logs/acesso-individual` implementadas.
- [ ] Rotas stub Fase 4 (`/dashboard-9box`, `/dashboard-departamento`, `/dashboard-empresa`) renderizam stub canônico ("Consulte o painel de controle.") para todos os perfis exceto colaborador puro (redirecionado para `/colaborador`) — sem referência ao número de fase.

### 8.10 Componentes de erro

- [ ] `AccessDeniedPage` com estrutura canônica única, título literal *"Acesso negado."*, 16 mensagens canônicas literais do DOC 02 §9 preservadas.
- [ ] Página 404 com título literal *"Página não encontrada."* e corpo canônico literal.
- [ ] Erro 500 com título literal *"Erro interno."* e corpo canônico literal; correlation ID visível no rodapé com botão `[Copiar]` funcional.
- [ ] Sessão expirada nunca renderiza `AccessDeniedPage` — redirect canônico com toast âmbar literal.
- [ ] Colaborador puro em rota administrativa nunca renderiza `AccessDeniedPage` — redirect canônico com toast âmbar literal.

### 8.11 Validações e mensagens exatas

- [ ] Todas as mensagens canônicas literais reproduzidas em DOC 05 §18 preservadas palavra por palavra, sem paráfrase, sem alteração de pontuação, sem alteração de emojis.
- [ ] Ordem canônica de avaliação de erros preservada nos fluxos de login, reset de senha e alteração de senha.
- [ ] Padrão global 100-500 caracteres em ações administrativas críticas com mensagens canônicas literais preservadas.
- [ ] Bloqueios de ciclo de vida do Responsável financeiro implementados literalmente conforme DOC 02 §13.4.

### 8.12 Perímetro mobile

- [ ] Breakpoint canônico único mobile < 1024px, desktop ≥ 1024px implementado.
- [ ] Superfícies mobile-responsive canônicas implementadas conforme DOC 05 §19.2: portal do colaborador, Instrumento A, Instrumento D, Instrumento B (Radar NR-1), formulário do Perfil Individual.
- [ ] Superfícies desktop-only exibem mensagem canônica única literal em mobile: *"Esta tela é otimizada para uso em desktop. Acesse via computador com viewport de pelo menos 1024px."*
- [ ] Instrumento C e pop-up do relatório do Perfil Individual permanecem desktop-only (canonização S331 revista).

### 8.13 Coexistência botão [RH] + filtro "Papel funcional"

- [ ] Botão `[RH]` no cabeçalho da tabela e opção *"RH"* do dropdown *"Papel funcional"* sincronizados bidirecionalmente.
- [ ] Opção *"Responsável financeiro"* aparece apenas em `/todos-os-colaboradores`, ausente em `/minha-equipe` e `/cadeia-indireta`.
- [ ] Badge RF não aparece inline em `/minha-equipe` e `/cadeia-indireta`.

### 8.14 Mockups como referência canônica

- [ ] Todos os 51 mockups em `/mnt/project/` (DOC 05 §21) preservados e referenciados como fonte visual canônica.
- [ ] `painel_controle_v4.html` preservado como referência histórica de design system, não como tela canônica ativa (S472).
- [ ] 11 arquivos `delta_*.html` aplicados sempre sobre o arquivo-base correspondente conforme mapa de composição (DOC 00) — nunca como tela autônoma.

### 8.15 Evidências canônicas exigidas

- [ ] Print de cada painel de controle canônico (10 perfis) mostrando ordem de seções, menu lateral, sino e indicador contextual conforme perfil.
- [ ] Print de cada uma das 51 telas canônicas em desktop (viewport 1440px).
- [ ] Print de cada superfície mobile-responsive em viewport 390px e 768px.
- [ ] Print de cada superfície desktop-only em viewport 390px — mensagem canônica exata renderizada.
- [ ] Print do `AccessDeniedPage` em cada uma das 16 rotas restritas canônicas do DOC 02 §9.
- [ ] Print da página 404 e da página 500 com correlation ID.
- [ ] Grep na base de mockups pelos termos proibidos do DOC 05 §22.14 — zero ocorrências.
- [ ] Diff de cada mensagem canônica literal do DOC 05 §18 contra o texto renderizado na UI — zero divergências.

---

## 9. Checklist de validação pós-deploy — Camada 6 (Operações)

Consolida DOC 06 §25 (Checklist de conformidade da camada de operações — integral) + Fase 6 §14.5-§14.6 + Fase 8 §14.3-§14.4 + Fase M P1 §14.7-§14.8 + Fase Exportáveis P2 §14 (change log + turnover) + Fase Prontidão MVP §16 (LGPD + log de acesso + onboarding). Substitui integralmente os checklists de origem.

### 9.1 Absorção da §12 da revisão do Responsável financeiro (condição S407 inviolável)

- [ ] Tipo `fechamento_bloqueado_sem_resp_financeiro` (D049) — severidade `critico`, destinatário Bruno, canal imediato sem cooldown, trigger `closeMonthScheduled`, emoji 🔴.
- [ ] Tipo `responsavel_financeiro_nomeado` (D050) — severidade `info`, destinatário o próprio RF, canal sino apenas, trigger `company.setResponsavelFinanceiro`, emoji 🔵.
- [ ] Rótulos legíveis canônicos literais dos 2 tipos preservados conforme DOC 06 §6.1.
- [ ] Eventos silenciosos preservados: atribuição inicial, transferência entre colaboradores, remoção sem substituto.
- [ ] Trilhas canônicas específicas de destinatário definidas conforme DOC 06 §7.3.
- [ ] Confirmação canônica: `revisao_responsavel_financeiro_v2.md` pode ser removido do pacote sem perda canônica após aprovação do DOC 06.

### 9.2 Enum canônico de 17 tipos (S479 aplicada)

- [ ] Composição fixa canônica: 2 NR-1 + 13 Fase 8 + 2 Responsável financeiro = 17 tipos.
- [ ] Coerência com DOC 01 §15.2 (fonte canônica de schema) preservada.
- [ ] Superação canônica da S403 do `ROTA_B_ESTADO_E_DECISOES.md` explicitada.
- [ ] Todos os 17 tipos com snapshots canônicos de `alerts.metadados` definidos conforme DOC 06 §4.
- [ ] Todos os 17 tipos com links de aterrissagem canônicos definidos conforme DOC 06 §5.
- [ ] Todos os 17 tipos com rótulos legíveis canônicos literais definidos conforme DOC 06 §6.1.
- [ ] Todos os 17 tipos com destinatários canônicos definidos conforme DOC 06 §7.

### 9.3 Estados canônicos de `cycleSchedule` (S480 aplicada)

- [ ] 3 estados persistidos canonicamente preservados: `aberto`, `atrasado`, `fechado`.
- [ ] Rótulo visual derivado "Futuro" registrado como derivação canônica de UI, não como status persistido.
- [ ] Distinção canônica com `copsoqCycles.status` (agendado/aberto/fechado) explicitada.

### 9.4 Templates de e-mail canônicos (S481 aplicada)

- [ ] Template 1 (reset de senha) canonização Fase M P1 §12.3.1.
- [ ] Template 2 (primeiro acesso) canonização Fase M P1 §12.3.2.
- [ ] Template 3 (confirmação de alteração de e-mail) canonização Fase M P1 §12.3.3.
- [ ] Template 4 (notificação de segurança pós-alteração) canonização Fase M P1 §12.3.4.
- [ ] Template A (alerta imediato consolidado) canonização Fase 8 §7.6.2 — HTML inline, sem link stylesheet externo; assunto para 1 alerta e para N > 1 alertas renderiza corretamente.
- [ ] Template B (digest semanal) canonização Fase 8 §7.6.3 — contadores + seções por severidade + rodapé; digest com 0 alertas NÃO é enviado.
- [ ] Template L (lembrete de portal) canonização S481 — corpo literal, variáveis, assunto e estrutura da lista de instrumentos preservados.
- [ ] Todos os templates: HTML inline; locale pt-BR; sem `target="_blank"`; Handlebars compilado no boot.
- [ ] Dicionário canônico dos rótulos legíveis dos 17 tipos presente em código conforme DOC 06 §6.1.
- [ ] Emojis canônicos conforme DOC 06 §8: 🔴 crítico, 🟡 atenção, 🟢 observação, 🔵 info (info apenas no sino).

### 9.5 Change log preservado em 5 fontes (S482 Opção B aplicada)

- [ ] 5 fontes canônicas fixas: `responsavelFinanceiroTransferLog`, `monthlyUnlockLog`, `employeeLeaderHistory`, `performanceMultiplierLog`, `cycleUnlockRequests`.
- [ ] Exclusão canônica explícita da geração do Relatório executivo trimestral do Change log — permanece em telemetria + `apiUsageLog`.
- [ ] Exclusão canônica explícita de mudanças de thresholds do 9-Box do Change log.
- [ ] Handoff canônico DOC 04 §7.11 → sino do disparante preservado; sem entrada no Change log da empresa.
- [ ] Tabela do Change log/Histórico da empresa consolida corretamente as 5 fontes via UNION.
- [ ] Apenas 1 linha expandida por vez (acordeão de expansão única) preservado.
- [ ] `performanceMultiplierLog` nunca retorna linhas (fonte vazia até ativação futura).

### 9.6 Cron canônico do arquivamento do Chat IA (S483 Opção A aplicada)

- [ ] Cron canônico diário 03:00 UTC — job `archiveAiConversationsJob` registrado.
- [ ] SQL canônico idempotente com filtro `archivedAt IS NULL AND createdAt < NOW() - INTERVAL 6 MONTH`.
- [ ] Aderência canônica ao princípio DOC 04 §5.2 (mensagens de 6+ meses saem do contexto ativo).

### 9.7 Pipeline anti-ruído completo (M1-M7)

- [ ] M1 — Supressão de onboarding com lista canônica de isentos (DOC 06 §8.3).
- [ ] M2 — Materialidade 5pp (DOC 06 §8.4).
- [ ] M3 — INSERT em `alerts` (DOC 06 §8.5).
- [ ] M4 — Cooldown 7 dias com lista canônica de isentos e chave ampliada para NR-1 (DOC 06 §8.6).
- [ ] M5 — INSERT em `notifications` com resolução canônica de destinatários (DOC 06 §8.7).
- [ ] M6 — Decisão canônica de canal com lista de override (DOC 06 §8.8).
- [ ] M7 — Agrupamento canônico em `emailQueue` com janela de 15 min para imediato e cálculo de próxima segunda 08:00 para digest (DOC 06 §8.9).
- [ ] `emitAlertPostGravacao` canônico para NR-1 (DOC 06 §8.10).

### 9.8 Sino canônico e regra canônica de visibilidade

- [ ] Perfis canônicos com sino: Bruno e RH.
- [ ] Polling canônico 60s.
- [ ] Badge canônico com cor prioritária por severidade dominante e contador `99+`.
- [ ] Dropdown canônico com 10 últimas não lidas e link `[Ver todas as notificações]`.
- [ ] Comportamento canônico em falha de polling: valor mantido, sem toast, warning no Sentry.
- [ ] Sino não aparece para C-level nem Líder — verificação por login de teste.

### 9.9 Sistema canônico de e-mails

- [ ] 3 workers canônicos: `runEmailQueueJob` (1 min), `resetStuckEmailQueue` (10 min), `runWeeklyDigestJob` (horário UTC).
- [ ] `FOR UPDATE SKIP LOCKED` canônico em `runEmailQueueJob` — idempotência verificada.
- [ ] Retries canônicos até 3 tentativas com marcação `falhou` na 4ª.
- [ ] Borda de segurança `scheduledFor <= NOW() + INTERVAL 1 MINUTE` em `runEmailQueueJob`.
- [ ] Silêncio canônico em digest sem alertas acumulados; gravação em `digestExecutionLog` com `emailsEnviados=0`.
- [ ] Empresa desativada canonicamente pulada sem incremento de retries.
- [ ] Empresa sem RH ativo — grava alertas normalmente para Bruno.
- [ ] Digest executado em segunda 08:00 no fuso local de cada empresa — verificação por `digestExecutionLog.executedAt`.
- [ ] SMTP configurado com credenciais em vault.

### 9.10 Fluxo administrativo canônico de desbloqueio (P11)

- [ ] Transação canônica de solicitação com hook alerta `desbloqueio_solicitado`.
- [ ] Router canônico `hasPending` com suporte a 3 abas (D051, D052, D053).
- [ ] Transação canônica de cancelamento pelo próprio solicitante — silenciosa.
- [ ] Transação atômica canônica de aprovação (Bruno) com alerta `desbloqueio_aprovado` — 4 UPDATEs/INSERTs canônicos.
- [ ] Transação canônica de recusa (Bruno) com alerta `desbloqueio_recusado` — motivo obrigatório 100-500.
- [ ] Reversão automática canônica pós-24h com recálculo se `houveAlteracao=true`.
- [ ] Marca visual permanente canônica do mês desbloqueado.
- [ ] Auditoria canônica cross-tabela preservada.
- [ ] Tooltip canônico literal do mês desbloqueado *"Mês alterado após o fechamento — clique para detalhes"*.

### 9.11 Motor canônico de ciclos automáticos

- [ ] 5 tipos canônicos de `tipoCiclo` implementados.
- [ ] 3 estados canônicos persistidos com regra canônica de terminalidade.
- [ ] Hook `refreshCycleSchedule` com estrutura canônica das linhas geradas.
- [ ] Hook `updateCycleScheduleStatuses` com 2 UPDATEs canônicos.
- [ ] Hook `updateCycleSchedule` idempotente com disparo de `evaluateAutoAlerts`.
- [ ] Hook `incrementCycleScheduleCounter` otimista.
- [ ] Job canônico `refreshCycleScheduleCounters` (00:15 UTC) — reconciliação R4.

### 9.12 Jobs cron canônicos inventariados

- [ ] `runDailyClosureJob` (00:00 fuso local) — chama `refreshCycleSchedule` e `updateCycleScheduleStatuses`.
- [ ] `runDailyInstrumentStatusJob` (diário).
- [ ] `refreshCycleScheduleCounters` (00:15 UTC).
- [ ] `runEmailQueueJob` (1 min).
- [ ] `resetStuckEmailQueue` (10 min).
- [ ] `runWeeklyDigestJob` (horário UTC).
- [ ] `archiveAiConversationsJob` (03:00 UTC).
- [ ] Idempotência canônica de todos os jobs verificada.
- [ ] Comportamento canônico em falha sem retry automático dentro do mesmo ciclo preservado.

### 9.13 LGPD operacional canônico

- [ ] Escopo canônico global de `LGPD_TERM_VERSION` (S442) — sem versão por empresa.
- [ ] Bump canônico via redeploy — sem UI para bump.
- [ ] Consulta canônica de gate implementada conforme DOC 06 §19.4.
- [ ] Transação canônica de aceite com `versaoTermoAceita` capturada do backend conforme DOC 06 §19.5.
- [ ] Portabilidade canônica via PDF único on-the-fly (reversão S341) — sem rota dedicada, sem persistência.
- [ ] Escopo canônico do PDF: dados cadastrais + respostas do próprio titular; fora: avaliações de terceiros.
- [ ] Autoacesso do titular via portal canonicamente isento de `dataAccessLog`.

### 9.14 Log canônico de acesso individual

- [ ] Escopo seletivo canônico: dashboard individual, pop-up de relatório PI, exportações em planilha.
- [ ] Fora do escopo canônico: ficha cadastral, organograma, autoacesso do titular.
- [ ] Enum canônico de `tipoAcesso` e `agentType` preservado.
- [ ] Gravação canônica automática no backend em cada superfície.
- [ ] Procedure canônica `platformLogs.getDataAccessLog` com autorização canônica.
- [ ] Append-only canônico preservado.

### 9.15 Onboarding canônico de líderes

- [ ] Entrada canônica automática ao ativar `isLider` — estágio `treinar`.
- [ ] Saída canônica ao desativar — preserva `onboardingUltimoEstagio`.
- [ ] Reentrada canônica — retorno ao último estágio conhecido.
- [ ] Anotação obrigatória em toda edição, mesmo sem mudança de estágio.
- [ ] Mudança de estágio canônica apenas via modal (sem drag-and-drop).
- [ ] Contadores canônicos da miniatura implementados.
- [ ] Bloqueio canônico absoluto — próprio estágio nunca visível ao líder.
- [ ] Append-only canônico preservado em `leaderOnboardingNotes` e `leaderOnboardingStageLog`.

### 9.16 Exportáveis canônicos operacionais

- [ ] Cache canônico do Relatório executivo trimestral com chave `(companyId, escopoTipo, escopoReferencia, trimestre)`.
- [ ] Governança canônica de custo — limite 5/dia por empresa.
- [ ] Mensagem canônica literal do limite atingido preservada.
- [ ] Telemetria canônica de latência, tokens e custo por chamada.
- [ ] Handoff canônico DOC 04 → sino do disparante preservado.
- [ ] Fallback canônico em falha da API — sem incremento de `apiUsageLog`.

### 9.17 Turnover canônico operacional

- [ ] Fonte única canônica `employeeTerminationEvents`.
- [ ] Gravação canônica na transação de inativação.
- [ ] Reativação canônica gera novo registro.
- [ ] Cálculos canônicos trimestral e rolling 12m.
- [ ] Escopos canônicos empresa e departamento — sem equipe.
- [ ] Abertura canônica por motivo (voluntário/involuntário).
- [ ] Presença canônica em 3 exportáveis; sem tela dedicada.
- [ ] Router canônico interno `turnover.*` preservado.
- [ ] Append-only canônico preservado.

### 9.18 Mensagens canônicas literais preservadas (verificação obrigatória)

- [ ] Toast canônico literal *"Marcada como lida."*.
- [ ] Toast canônico literal *"Marcada como não lida."*.
- [ ] Toast canônico literal *"Notificação arquivada."*.
- [ ] Toast canônico literal *"Marcada como lida. Redirecionando para {rota}…"*.
- [ ] Toast canônico literal *"Solicitação cancelada."*.
- [ ] Toast canônico literal *"Solicitação aprovada. Mês desbloqueado por 24h."*.
- [ ] Toast canônico literal *"Solicitação recusada. RH será notificado."*.
- [ ] Toast canônico literal *"Solicitação enviada. Bruno será notificado."*.
- [ ] Toast canônico literal *"{N} notificação(ões) marcada(s) como lida."*.
- [ ] Toast canônico literal *"{N} notificação(ões) arquivada(s)."*.
- [ ] Toast canônico literal *"Limite de 500 notificações por seleção atingido."*.
- [ ] Toast canônico literal *"Você não tem notificações não lidas."* (sino vazio).
- [ ] Mensagem canônica literal do modal de arquivamento em lote preservada.
- [ ] Mensagem canônica literal do limite diário do Relatório executivo trimestral preservada.
- [ ] Mensagem canônica literal de fallback de IA em Relatório executivo preservada.
- [ ] Rótulo canônico literal da área 1 de `/cycle-management` preservado.
- [ ] Termo canônico do consentimento LGPD preservado literalmente.
- [ ] Rótulos canônicos legíveis dos 17 tipos preservados literalmente.
- [ ] Assunto canônico literal do e-mail de lembrete de portal preservado.
- [ ] Assunto canônico literal para 1 alerta e para N > 1 alertas do Template A preservado.

### 9.19 Cobertura canônica dos 17 tipos com snapshots completos

- [ ] `desempenho_queda_brusca` (§4.1).
- [ ] `desempenho_estagnacao` (§4.2).
- [ ] `desempenho_queda_isolada` (§4.3).
- [ ] `assiduidade_baixa` (§4.4).
- [ ] `divergencia_a_c` (§4.5).
- [ ] `nr1_fator_critico` (§4.6).
- [ ] `nr1_ciclo_fechado` (§4.7).
- [ ] `perfil_inconsistente_primeira`, `perfil_retest_consistente`, `perfil_retest_reincidente` (§4.8).
- [ ] `desbloqueio_solicitado` (§4.9).
- [ ] `desbloqueio_aprovado` (§4.10).
- [ ] `desbloqueio_recusado` (§4.11).
- [ ] `ciclo_instrumento_encerrado` (§4.12).
- [ ] `ciclo_mensal_fechado` (§4.13).
- [ ] `fechamento_bloqueado_sem_resp_financeiro` (D049, §4.14).
- [ ] `responsavel_financeiro_nomeado` (D050, §4.15).

### 9.20 Observabilidade canônica

- [ ] Log estruturado de `emitAlert` com campos `{tipo, escopo, escopoEmployeeId, severidade, canal, suprimidoPorCooldown, timestamp}`.
- [ ] Log estruturado de `runEmailQueueJob` com campos `{processed, sent, failed, skipped, duration_ms}`.
- [ ] Sentry configurado com DSN válido — recebe eventos de SMTP falha, FK falha, cron falha e 5xx tRPC.
- [ ] Handlebars carregado e templates compilados no boot — evidência no log estruturado.

### 9.21 Evidências canônicas exigidas

- [ ] Cron scheduler ativo com todos os 8 jobs agendáveis canônicos registrados (7 de propriedade da camada 6 + `runDailyClimateAggregationJob` do DOC 03 — S499) — evidência do trecho de configuração.
- [ ] Execução de `runEmailQueueJob` duas vezes na mesma janela — mesmo e-mail não é enviado duas vezes.
- [ ] Execução de `runWeeklyDigestJob` duas vezes na mesma janela — mesmo destinatário não recebe dois e-mails.
- [ ] E-mail em `processando` há > 10min — `resetStuckEmailQueue` retorna a `pendente`.
- [ ] 3 falhas consecutivas — `status='falhou'`, `retries=3`, warning Sentry emitido.
- [ ] Empresa desativada em teste — worker pula, alertas ficam em `emailQueue.status='pendente'`.
- [ ] `resolveDestinatarios` vazio — warning + console, sem gravação.
- [ ] Empresa sem RH ativo — alertas administrativos notificam apenas Bruno.
- [ ] Snapshot canônico de `alerts.metadados` verificado por queries `SELECT metadados FROM alerts WHERE tipo='{tipo}' LIMIT 1;` para cada um dos 17 tipos.
- [ ] Grep em código, migrations e templates por `emailSettings|firstAccessCompleted|resetPasswordTokenHash|resetPasswordExpiresAt|resetPasswordUsedAt|emailChangeRequests|/gestao-ciclos|/desbloqueios\W|leadershipQualityIndex|Painel principal|PGR|Programa de Gerenciamento de Riscos Psicossociais|Pesquisa NR-1|nr1PGRDocuments` — zero ocorrências.

---

## 10. Critérios canônicos de aceitação — cenários end-to-end

Cada cenário é nomeado com código canônico + nome curto. Execução em staging com dados sintéticos, evidência estruturada e critério de aprovação binário conforme §3. Manus reproduz o código canônico literalmente no artefato de retorno.

### 10.1 Cenários AU — Autenticação e sessão

**Cenário AU.1 — Login unificado com precedência isRH prevalece.**
- Contexto: 1 colaborador com `isRH=true` e `isLider=true`.
- Passos: acessa `/`, digita CPF + senha, submete.
- Evidência esperada: JWT emitido com `role: 'rh_lider'`; redirect para `/painel-rh`.
- Critério: JWT emitido; redirect canônico; nenhum erro no console.

**Cenário AU.2 — Login Super Admin.**
- Contexto: 1 registro em `superAdmins` (Bruno Andrade).
- Passos: acessa `/login-super-admin`, digita e-mail + senha, submete.
- Evidência esperada: JWT emitido sem claim `exp`; redirect para `/super-admin`.
- Critério: JWT decoded sem `exp`; redirect canônico.

**Cenário AU.3 — Reset de senha end-to-end.**
- Contexto: 1 RH ativo.
- Passos: abre modal "Esqueci minha senha" no `/`, digita CPF, submete; recebe e-mail do Template 1; clica no link; define nova senha; faz login.
- Evidência esperada: linha em `accessTokens` com `type='password_reset'`, `expiresAt = createdAt + 7d`; Template 1 renderizado com link contendo o token; após reset, `usedAt` gravado no token; nova senha bcrypt em `employees.senhaHash`; todas as sessões invalidadas.
- Critério: fluxo completo sem erro; mensagem canônica *"Este link expirou. Solicite um novo."* aparece em tentativa de reuso.

**Cenário AU.4 — Primeiro acesso de RH recém-cadastrado.**
- Contexto: 1 RH cadastrado por Bruno; e-mail com link de primeiro acesso enviado (Template 2).
- Passos: RH clica no link `/first-access?token=VALID`; vê saudação "Bem-vindo(a), {Nome}!"; define senha; é redirecionado para `/`; faz login.
- Evidência esperada: linha em `accessTokens` com `type='first_access'`; após definição, `usedAt` gravado; `employees.passwordSet=true`; `employees.senhaHash` populada; login funcional.
- Critério: fluxo completo sem erro; segunda tentativa com o mesmo link retorna mensagem canônica de link expirado.

**Cenário AU.5 — Alteração de e-mail do Super Admin via `accessTokens`.**
- Contexto: Bruno autenticado em `/super-admin/meus-dados`.
- Passos: acessa `/alterar-email`; digita novo e-mail + senha atual + confirmar novo; submete; recebe Template 3 no novo e-mail; clica no link `/confirmar-alteracao-email?token=JWT`; e-mail alterado; Template 4 enviado ao e-mail antigo; todas as sessões invalidadas; redirect para `/login-super-admin`.
- Evidência esperada: linha em `accessTokens` com `type='password_reset'` + metadado JWT `tipo:'email_change'` + `expiresAt = createdAt + 24h`; após confirmação, `superAdmins.email` atualizado; sessão atual invalidada; Template 4 enviado ao e-mail anterior.
- Critério: fluxo completo sem erro; nenhuma tabela `emailChangeRequests` presente; sessões invalidadas 100%.

**Cenário AU.6 — Gate LGPD portal + bump de versão do termo.**
- Contexto: 1 colaborador; `LGPD_TERM_VERSION="v1.0"`; sem linha em `lgpdConsents`.
- Passos: colaborador acessa `/colaborador`, digita CPF; vê gate LGPD; aceita; acessa tela de pendências; sai; volta; NÃO vê gate; deploy é feito com `LGPD_TERM_VERSION="v1.1"`; colaborador volta; vê gate novamente com eyebrow "Termo atualizado"; aceita.
- Evidência esperada: 2 linhas em `lgpdConsents` para o mesmo colaborador — uma com `versaoTermoAceita='v1.0'` outra com `v1.1`; sessões ativas NÃO invalidadas.
- Critério: gate reexibido apenas quando versão muda; sessão ativa preservada.

**Cenário AU.7 — Sessão expirada (redirect + toast âmbar).**
- Contexto: RH autenticado com JWT emitido há mais de 8h sem renovação.
- Passos: RH tenta acessar qualquer procedure autenticada.
- Evidência esperada: resposta 401; frontend redireciona para `/`; toast âmbar canônico literal renderizado.
- Critério: nenhum `AccessDeniedPage` renderizado; toast canônico exato exibido.

**Cenário AU.8 — Rate limits 5/15min e 10/15min.**
- Contexto: 6 tentativas de login com senha errada consecutivas em `/` no mesmo IP e 11 tentativas de login com CPF errado em `/colaborador`.
- Passos: executa 6 submits em `/` e 11 submits em `/colaborador`.
- Evidência esperada: 6ª tentativa em `/` bloqueia com bloco vermelho + contador regressivo; 11ª tentativa em `/colaborador` bloqueada com mensagem canônica.
- Critério: rate limits ativos conforme DOC 02 §5.8.

**Cenário AU.9 — Middleware de status de empresa (403 forceLogout).**
- Contexto: RH autenticado em empresa X ativa; empresa X é inativada por Bruno.
- Passos: RH tenta qualquer procedure autenticada.
- Evidência esperada: resposta 403 com `forceLogout: true`; frontend redireciona para `/`; sessão encerrada.
- Critério: middleware ativo em toda procedure de perfil administrativo.

### 10.2 Cenários AC — Autorização e PC1

**Cenário AC.1 — Matriz de rotas × 5 perfis.**
- Contexto: 1 login de teste por perfil (5 perfis + colaborador puro).
- Passos: para cada perfil, tentar acessar cada rota da matriz do DOC 02 §10; comparar com o esperado.
- Evidência esperada: cada acesso permitido renderiza a rota; cada acesso negado renderiza `AccessDeniedPage` com mensagem canônica exata correspondente; colaborador puro em rota administrativa recebe redirect para `/colaborador` com toast âmbar.
- Critério: 100% dos acessos coerentes com a matriz.

**Cenário AC.2 — PC1a — RH não vê C-level em `/todos-os-colaboradores`.**
- Contexto: empresa com 10 colaboradores comuns + 3 C-levels; RH autenticado.
- Passos: RH acessa `/todos-os-colaboradores`.
- Evidência esperada: 10 linhas renderizadas; nenhum C-level; query backend inclui filtro `role != 'clevel'`.
- Critério: nenhum C-level visível; filtro aplicado no backend, não apenas no frontend.

**Cenário AC.3 — PC1b — organograma sem clique em nós de C-level para RH.**
- Contexto: mesma empresa do AC.2; RH acessa organograma.
- Passos: RH clica em um nó de C-level.
- Evidência esperada: nó renderizado com estilo não clicável; tooltip literal *"Detalhes restritos ao Super Admin"* aparece no hover; nenhum modal ou navegação disparados.
- Critério: nó não navegável; tooltip literal exato.

**Cenário AC.4 — PC1c — agregados incluem C-levels normalmente para RH.**
- Contexto: mesma empresa; RH acessa `/painel-rh`.
- Passos: RH inspeciona cards resumo (contadores, IQL, Clima, Radar NR-1 agregado, distribuição 9-Box).
- Evidência esperada: valores agregados incluem `cLevelMembers`; grep no backend confirma que nenhum agregado filtra por `role != 'clevel'` quando o solicitante é RH.
- Critério: agregados corretos; sem sobre-restrição.

**Cenário AC.5 — PC1d — `/cycle-management` e Radar NR-1 para RH.**
- Contexto: mesma empresa; RH acessa `/cycle-management` e `/nr1`.
- Passos: RH inspeciona contadores agregados e listagens nominais individuais.
- Evidência esperada: contadores agregados incluem C-levels; listagens nominais individuais omitem C-levels.
- Critério: PC1d aplicada corretamente em ambas as rotas.

**Cenário AC.6 — PC1e e PC1f — Perfil Individual e dashboard individual de C-level bloqueados para RH.**
- Contexto: RH tenta acessar Perfil Individual e `/dashboard-individual/{id}` de C-level.
- Passos: RH clica em botão `[Ver Perfil Individual]` sobre C-level (que deve estar removido de superfícies RH) e força acesso via URL direta.
- Evidência esperada: botão `[Ver Perfil Individual]` ausente das superfícies RH sobre C-level; acesso direto a `/dashboard-individual/:id` de C-level para RH retorna `AccessDeniedPage` com mensagem canônica exata do DOC 02 §9.10.
- Critério: botões removidos; bloqueio backend confirmado.

**Cenário AC.7 — Responsável financeiro cardinalidade + toggle exclusivo Bruno.**
- Contexto: empresa com colaborador X (`isRH=true`) como RF vigente.
- Passos: (a) Bruno tenta atribuir RF a colaborador Y (elegível — `isRH=true` OU `isLider=true`) via toggle → modal canônico de transferência com justificativa 100-500; (b) Bruno tenta atribuir RF a colaborador Z sem elegibilidade → toggle desabilitado; (c) RH tenta atribuir → toggle ausente da UI e chamada backend retorna 403; (d) Bruno tenta inativar X (RF vigente) → modal canônico + mensagem literal de bloqueio.
- Evidência esperada: cardinalidade sempre 1 por empresa; toggle presente apenas para Bruno; mensagens canônicas literais preservadas.
- Critério: comportamentos canônicos observados.

### 10.3 Cenários NE — Negócio determinístico

**Cenário NE.1 — Eixo X mensal com CC5 dia 10 / dia 11.**
- Contexto: empresa com timezone `America/Sao_Paulo`; mês de teste com dados mensais preenchidos até o dia 9 do mês subsequente; job `runDailyClosureJob` agendado.
- Passos: aguardar transição da 00:00 do dia 11; consultar `monthlyClosureStatus`.
- Evidência esperada: `monthlyClosureStatus.status='fechado'` para todos os líderes da empresa; `notifications` do tipo `ciclo_mensal_fechado` gerada para RH.
- Critério: transição executada às 00:00 do dia 11 no fuso local; nenhum dado mensal do dia 10 rejeitado.

**Cenário NE.2 — Eixo Y trimestral + 9-Box.**
- Contexto: empresa com Instrumento A e Instrumento C respondidos por 15 colaboradores para o trimestre 2026-Q2.
- Passos: executar `triggerQuarterlyCalculation`; inspecionar `plenitudeData`, `ninebox`, `alerts`.
- Evidência esperada: `plenitudeData` populada; snapshot em `ninebox`; alertas de divergência A×C gerados quando `alertaDivergencia=true`.
- Critério: cálculos determinísticos coerentes; snapshot imutável.

**Cenário NE.3 — Perfil Individual 80 itens + 3 níveis de confiabilidade + retest.**
- Contexto: 3 colaboradores respondem 80 itens no formulário do Perfil Individual: A com padrão consistente (`consistente`), B com padrão inconsistente (`inconsistente` na primeira tentativa), C com padrão bloqueado (2 respostas iguais para todos os itens).
- Passos: cada um submete o formulário; observar resultado.
- Evidência esperada: A recebe geração de texto pela IA (Momento 2); B recebe alerta `perfil_inconsistente_primeira` para RH+Bruno + é convidado ao reteste; C tem confiabilidade `bloqueado` e não pode retentar.
- Critério: 3 estados canônicos preservados; alertas corretos.

**Cenário NE.4 — IQL + escala 0-10.**
- Contexto: empresa com Instrumento D respondido por 8 líderes (pisos amostrais respeitados).
- Passos: executar cálculo do IQL; inspecionar `iqlScores` e tabela IQL no painel de RH.
- Evidência esperada: valores calculados na escala 0-10; pisos R15.1 e R15.2 aplicados; tabela renderizada.
- Critério: cálculos determinísticos.

**Cenário NE.5 — Clima e Engajamento + escala canônica.**
- Contexto: empresa com respostas de Clima e Engajamento por escopo empresa e por escopo equipe (líder X).
- Passos: consultar `climateEngagementData` e dashboard.
- Evidência esperada: unique key de 5 colunas respeitada; scores dentro da escala canônica; cores canônicas (0-5,9 vermelho / 6,0-7,4 amarelo / 7,5-10 verde) aplicadas.
- Critério: escopos e escalas canônicos.

**Cenário NE.6 — Radar NR-1 fechamento com PDF 13 páginas + hash SHA-256.**
- Contexto: ciclo NR-1 com 20 respondentes válidos; job diário `closeNR1Cycle` executado.
- Passos: aguardar fechamento; gerar PDF; inspecionar arquivo.
- Evidência esperada: PDF com 13 páginas exatas; hash SHA-256 na Seção 13; zero ocorrências de "PGR" ou variantes; nome do arquivo canônico; alertas `nr1_ciclo_fechado` (+ `nr1_fator_critico` se houver) gerados.
- Critério: PDF canônico; alertas canônicos.

**Cenário NE.7 — Turnover trimestral + rolling 12m.**
- Contexto: empresa com 3 inativações no trimestre 2026-Q2, 8 no rolling 12m; 1 delas é C-level.
- Passos: consultar routers `turnover.getByCompany` e `turnover.getByDepartamento`.
- Evidência esperada: cálculos excluem o C-level; abertura por nível apenas no escopo Empresa; sem escopo equipe.
- Critério: regras canônicas aplicadas.

**Cenário NE.8 — Central de Relatórios (6 exportáveis).**
- Contexto: RH acessa Central de Relatórios.
- Passos: gerar cada um dos 6 exportáveis para escopo Empresa em trimestre fechado.
- Evidência esperada: 6 artefatos gerados/baixados sem erro; matriz de visibilidade aplicada; seletor em cascata funcional nos 4 aplicáveis; Board deck one-pager omite "Equipe"; Clima e engajamento usa dropdown único.
- Critério: 6 exportáveis funcionais; matriz canônica respeitada.

**Cenário NE.9 — Transferência de liderados M2 v2 end-to-end.**
- Contexto: líder X com 5 liderados diretos; X será inativado.
- Passos: Bruno inicia inativação de X → modal de inativação com motivo (Voluntário/Involuntário) → após seleção, modal M2 v2 abre → autocomplete lista 5 grupos canônicos → Bruno seleciona colaborador Y (não-líder) → modal secundário de promoção `isLider` aparece → Bruno confirma → justificativa 100-500 preenchida → submit.
- Evidência esperada: `SELECT canInactivate` executado antes de abrir M2; INSERTs em `employeeLeaderHistory` com `reason` e `transferBatchId` populados para os 5 liderados; UPDATE em `employees.liderDiretoId` dos 5; Y promovido a `isLider=true`; `employeeTerminationEvents` gravado para X com snapshot.
- Critério: transação completa sem erro; 5 registros consistentes.

**Cenário NE.10 — Padrão 100-500 caracteres em 4 pontos.**
- Contexto: cada uma das 4 ações administrativas críticas com justificativa (transferência de liderados, transferência de RF, solicitação de desbloqueio, recusa de desbloqueio).
- Passos: para cada ação, tentar submeter com 99 caracteres (bloqueado), com 100 caracteres (aceito), com 500 caracteres (aceito), com 501 caracteres (bloqueado).
- Evidência esperada: mensagens canônicas literais de erro exibidas em 99 e 501; ações aceitas em 100 e 500; contador `X / 500` presente.
- Critério: padrão global aplicado corretamente em todos os 4 pontos.

### 10.4 Cenários IA — IA interpretativa

**Cenário IA.1 — Perfil Individual Momento 2 com fallback.**
- Contexto: colaborador com resposta `consistente` no Perfil Individual.
- Passos: (a) Momento 2 executa com sucesso; (b) simular falha da API — repetir.
- Evidência esperada: (a) texto gerado + persistido em `individualProfileReports`; (b) fallback canônico com mensagem literal exata do DOC 04 §11.1; sem persistência de texto vazio.
- Critério: fluxo feliz e fallback funcionam sem paráfrase da mensagem.

**Cenário IA.2 — Chat IA 4 níveis com contexto correto.**
- Contexto: líder com dashboards de global, departamento, equipe e individual (do seu liderado).
- Passos: abrir Chat IA em cada nível; enviar pergunta.
- Evidência esperada: resposta gerada em cada nível; contexto do dashboard individual não inclui dados financeiros para líder; histórico ativo persistido; mensagens de 6+ meses movidas para arquivado pelo cron.
- Critério: contexto canônico correto por nível; sem vazamento de dados financeiros ao líder.

**Cenário IA.3 — Diagnóstico IA 3 estados canônicos.**
- Contexto: colaborador com trimestre 2026-Q2 sem diagnóstico, com diagnóstico após geração, e trimestre 2026-Q1 já com diagnóstico.
- Passos: navegar entre trimestres; observar estados dos botões.
- Evidência esperada: (a) `[Gerar diagnóstico]` no trimestre atual sem diagnóstico; (b) diagnóstico + `[Atualizar diagnóstico]` após geração; (c) diagnóstico read-only sem botão de atualização no trimestre anterior.
- Critério: 3 estados canônicos coerentes.

**Cenário IA.4 — Relatório executivo trimestral com governança 5/dia.**
- Contexto: empresa com trimestre 2026-Q2 fechado.
- Passos: RH tenta gerar Relatório executivo trimestral 6 vezes no mesmo dia (diferentes escopos ou repetição).
- Evidência esperada: 5 gerações aceitas com incremento em `apiUsageLog` + cache em `executiveReportCache` (UPDATE em regeneração); 6ª tentativa retorna mensagem canônica literal do limite atingido conforme DOC 04 §13.3.
- Critério: limite respeitado; mensagem literal exata; reset à 00:00 local no dia seguinte.

**Cenário IA.5 — Falha de API em cada superfície com mensagem literal.**
- Contexto: simulação de falha da Claude API.
- Passos: forçar falha na chamada e observar cada uma das 4 superfícies: Perfil Individual Momento 2, Chat IA, Diagnóstico IA, Relatório executivo trimestral.
- Evidência esperada: em cada superfície, a mensagem literal exata do DOC 04 §11 e §13.2 é exibida; nenhum incremento de `apiUsageLog` no caso do Relatório executivo.
- Critério: fallbacks canônicos literais preservados; contagem defensiva ativa.

---

### 10.5 Cenários UI — Interface

**Cenário UI.1 — Painéis de controle (5 seções canônicas por perfil).**
- Contexto: 1 login por perfil (Super Admin global, Super Admin dentro-empresa, RH, RH-Líder, C-level `acessoTotal=true`, C-level `acessoTotal=false`, Líder chefe-departamento, Líder puro).
- Passos: cada login abre seu painel de controle; inspecionar ordem das seções, ausência de seções não aplicáveis, itens de menu, sino.
- Evidência esperada: ordem canônica Visão geral → Minha equipe → Cadeia indireta → Meu portal → Radar da empresa preservada; seções não aplicáveis OMITIDAS (não aparecem vazias); menus por perfil canônicos; sino apenas em Bruno e RH.
- Critério: 10 painéis coerentes com DOC 05 §5.

**Cenário UI.2 — Portal do colaborador desktop + mobile.**
- Contexto: colaborador com 3 pendências (Radar NR-1, Instrumento A, Instrumento D).
- Passos: acessar `/colaborador` em viewport 1440px e em 390px; digitar CPF; aceitar termo LGPD; ver tela de pendências.
- Evidência esperada: em ambos os viewports, tela de entrada com apenas 5 elementos canônicos; ordem canônica dos cards: Radar NR-1 primeiro, demais por data limite ascendente; mesmo comportamento em desktop e mobile via CSS puro.
- Critério: portal renderiza corretamente em ambos os viewports; ordem canônica dos cards preservada.

**Cenário UI.3 — Instrumento A/D/B mobile + C e PI desktop-only.**
- Contexto: colaborador com pendências dos 5 instrumentos.
- Passos: em viewport 390px, tentar responder cada instrumento.
- Evidência esperada: Instrumento A, D, B (Radar NR-1) e formulário do Perfil Individual respondem em mobile; Instrumento C e pop-up do relatório do Perfil Individual renderizam mensagem canônica literal *"Esta tela é otimizada para uso em desktop. Acesse via computador com viewport de pelo menos 1024px."*.
- Critério: perímetro mobile canônico respeitado.

**Cenário UI.4 — Organograma modo normal + analítico + PC1b.**
- Contexto: Bruno + RH acessam organograma.
- Passos: (a) modo normal → clique em nó abre painel resumido lateral; (b) toggle modo analítico → indicadores nos nós; (c) navegação por trimestres com setas; (d) RH clica em nó de C-level.
- Evidência esperada: (a) painel resumido lateral (pop-up antigo eliminado); (b) indicadores renderizados; (c) seta → ausente no último trimestre fechado; (d) nó de C-level para RH sem clique, tooltip literal.
- Critério: 4 comportamentos coerentes.

**Cenário UI.5 — `/todos-os-colaboradores` 14 colunas + 8 filtros + badges L/RH/RF.**
- Contexto: RH e Bruno acessam a rota; colaboradores com combinações de flags.
- Passos: inspecionar tabela; aplicar filtros; aplicar botão `[RH]` e dropdown `Papel funcional`.
- Evidência esperada: 14 colunas na ordem canônica; sticky Foto/Nome/CPF; 8 filtros; badges L/RH/RF inline na ordem canônica L → RH → RF (apenas em `/todos-os-colaboradores`); botão `[RH]` sincronizado com dropdown; PC1a aplicada para RH (nenhum C-level).
- Critério: comportamento canônico.

**Cenário UI.6 — Modais canônicos (M1 metas + M2 v2 transferência + inativação com motivo + transferência de RF).**
- Contexto: Bruno tenta cada uma das operações críticas.
- Passos: abrir cada modal; validar campos; submeter.
- Evidência esperada: (a) M1 com validação bloqueadora soma de pesos = 100%; (b) M2 v2 com 5 grupos autocomplete + modal secundário condicional de promoção `isLider` + loop condicional + justificativa 100-500; (c) modal de inativação com radio buttons sem pré-seleção e botão desabilitado até seleção; (d) transferência de RF com justificativa 100-500.
- Critério: modais canônicos + mensagens literais preservadas.

**Cenário UI.7 — `AccessDeniedPage` + 404 + 500 com mensagens literais.**
- Contexto: usuários acessando rotas restritas, rotas inexistentes ou forçando erro 500.
- Passos: cada perfil tenta acessar rota fora do escopo; digitar URL inexistente; forçar erro 500.
- Evidência esperada: `AccessDeniedPage` com título literal *"Acesso negado."* e mensagem canônica exata; 404 com título literal *"Página não encontrada."*; 500 com título literal *"Erro interno."* + correlation ID copiável.
- Critério: 3 componentes com textos canônicos literais.

**Cenário UI.8 — Perímetro mobile completo.**
- Contexto: 1 login por perfil em viewport 390px.
- Passos: navegar por cada superfície canônica em mobile.
- Evidência esperada: superfícies mobile-responsive renderizam corretamente; superfícies desktop-only exibem mensagem canônica literal exata.
- Critério: perímetro canônico respeitado.

### 10.6 Cenários OP — Operações

**Cenário OP.1 — `desempenho_queda_brusca`.**
- Contexto: colaborador com `scoreDesempenho` do trimestre anterior calculado e trimestre atual com queda ≥ 20 pp.
- Passos: executar cálculo trimestral; observar `alerts`, `notifications`, `emailQueue`, SMTP.
- Evidência esperada: linha em `alerts`; linha em `notifications` para RH+Bruno com `alertId` populado; linha em `emailQueue` com `tipoEnvio='imediato'`; e-mail enviado (SMTP messageId capturado); corpo contém link canônico; teste M1 (< 90 dias): supressão silenciosa; teste M4: segundo disparo `suprimidoPorCooldown=true`; exclusividade com B3 (`desempenho_queda_isolada`): B3 não dispara; sem `metaROI` (Z3): dispara igualmente.
- Critério: comportamentos canônicos observados.

**Cenário OP.2 — `desempenho_estagnacao`.**
- Contexto: colaborador com `indiceDesempenho` dos 2 meses anteriores ambos < 70.
- Passos: fechar mês; observar alerta.
- Evidência esperada: severidade `atencao`, canal `imediato` (override Q2); M2 não se aplica; cadência mensal atende cooldown trivialmente; link canônico.
- Critério: canônico.

**Cenário OP.3 — `desempenho_queda_isolada`.**
- Contexto: variação entre `-5.00` e `-20.00` pp.
- Passos: executar cálculo; observar.
- Evidência esperada: severidade `observacao`, canal `digest_semanal`; alertas com `suprimidoPorCooldown=true` não contam para regra de recorrência (V4); e-mail sai apenas na segunda 08:00 fuso local seguinte.
- Critério: canônico.

**Cenário OP.4 — `assiduidade_baixa`.**
- Contexto: `performanceData.assiduidade < 85` no mês fechado.
- Passos: fechar mês; observar.
- Evidência esperada: severidade `critico`, canal `imediato`; metadados canônicos; link canônico.
- Critério: canônico.

**Cenário OP.5 — `divergencia_a_c`.**
- Contexto: `plenitudeData.alertaDivergencia = true`.
- Passos: cálculo trimestral; observar.
- Evidência esperada: severidade `observacao`, canal `digest_semanal`; metadados incluem `direcao`; corpo do e-mail contém: `Divergência de {N} pontos entre autoavaliação ({A}) e avaliação do líder {Nome} ({C})`; link canônico; colaborador inativado após cálculo: e-mail sinaliza inativação, alerta não suprimido.
- Critério: canônico.

**Cenário OP.6 — `nr1_fator_critico`.**
- Contexto: fechamento NR-1 com fator `< 50`.
- Passos: fechar ciclo; observar.
- Evidência esperada: severidade `atencao`, canal `digest_semanal`; isento de M1; cooldown granular por `(tipo, companyId, escopoDepartamentoId, fatorId)`; `evaluateNR1Alerts` usa `emitAlertPostGravacao`; link condicional por `destinatarioTipo` — `/nr1?ciclo={cicloDbId}&fator={fatorId}` para RH, `/super-admin/empresa/{companyId}/nr1?ciclo={cicloDbId}&fator={fatorId}` para Bruno.
- Critério: canônico.

**Cenário OP.7 — `nr1_ciclo_fechado`.**
- Contexto: qualquer fechamento NR-1.
- Passos: fechar ciclo; observar.
- Evidência esperada: severidade `atencao`, canal `digest_semanal`; isento de M1 e M4; link condicional por `destinatarioTipo`.
- Critério: canônico.

**Cenário OP.8 — `perfil_inconsistente_primeira`.**
- Contexto: submit com `tentativa=1, confiabilidade=inconsistente`.
- Passos: submeter formulário; observar.
- Evidência esperada: severidade `atencao`, canal `imediato` (override T1); silêncio absoluto ao colaborador (`resolveDestinatarios` não retorna colaborador); assunto: *"[ROIP APP] {empresa} — Perfil Individual do colaborador com inconsistência"*; corpo com nome, função, departamento, tentativa, camada de bloqueio.
- Critério: canônico.

**Cenário OP.9 — `perfil_retest_consistente`.**
- Contexto: `tentativa=2, confiabilidade=consistente`.
- Passos: submeter reteste; observar.
- Evidência esperada: severidade `observacao`, canal `digest_semanal`.
- Critério: canônico.

**Cenário OP.10 — `perfil_retest_reincidente`.**
- Contexto: `tentativa=2, confiabilidade=inconsistente`.
- Passos: submeter reteste; observar.
- Evidência esperada: severidade `atencao`, canal `imediato`; isento de M4 (V4); dois retestes reincidentes em janela < 7d geram dois e-mails; assunto: *"[ROIP APP] {empresa} — Perfil Individual com inconsistência após reteste"*.
- Critério: canônico.

**Cenário OP.11 — `desbloqueio_solicitado`.**
- Contexto: RH cria solicitação de desbloqueio em `/cycle-management`.
- Passos: preencher modal com justificativa 150 caracteres; submeter.
- Evidência esperada: linha em `cycleUnlockRequests` com `status='pendente'`; alerta para track RH+Bruno com severidade `atencao`, canal `imediato`; isento de M1 e M4; toast literal *"Solicitação enviada. Bruno será notificado."*.
- Critério: canônico.

**Cenário OP.12 — `desbloqueio_aprovado`.**
- Contexto: Bruno aprova solicitação pendente.
- Passos: abrir modal; comentário opcional; aprovar.
- Evidência esperada: transação atômica canônica executada — 4 UPDATEs/INSERTs; `cycleUnlockRequests.status='aprovada'`; linha em `monthlyUnlockLog` com `unlockRequestId`, `desbloqueadoEm`, `expiraEm = decididoEm + 24h`, `justificativa` copiada; `monthlyClosureStatus.status='desbloqueado'`; alerta `desbloqueio_aprovado`; toast literal *"Solicitação aprovada. Mês desbloqueado por 24h."*; falha simulada em qualquer passo → rollback total.
- Critério: canônico.

**Cenário OP.13 — `desbloqueio_recusado`.**
- Contexto: Bruno recusa solicitação pendente.
- Passos: abrir modal de recusa; preencher motivo 100-500; submeter.
- Evidência esperada: `status='recusada'`, `motivoRecusa` gravado; `monthlyClosureStatus` NÃO alterado; alerta `desbloqueio_recusado`; toast literal *"Solicitação recusada. RH será notificado."*.
- Critério: canônico.

**Cenário OP.14 — `ciclo_instrumento_encerrado`.**
- Contexto: Instrumento C fecha dia 11.
- Passos: aguardar fechamento; observar.
- Evidência esperada: alerta para track RH com severidade `atencao`, canal `digest_semanal`; Instrumentos A e D nunca disparam este alerta; isento de M1 e M4.
- Critério: canônico.

**Cenário OP.15 — `ciclo_mensal_fechado`.**
- Contexto: `processClosedMonth` executado.
- Passos: observar.
- Evidência esperada: severidade `atencao`, canal `digest_semanal`; isento de M1 e M4.
- Critério: canônico.

**Cenário OP.16 — `fechamento_bloqueado_sem_resp_financeiro` (D049).**
- Contexto: empresa sem Responsável financeiro; job de fechamento mensal em execução.
- Passos: `closeMonthScheduled` acionado.
- Evidência esperada: alerta `fechamento_bloqueado_sem_resp_financeiro` para Bruno; severidade `critico`; canal imediato SEM cooldown; emoji 🔴.
- Critério: canônico.

**Cenário OP.17 — `responsavel_financeiro_nomeado` (D050).**
- Contexto: Bruno nomeia RF pela primeira vez ou transfere para outro RF.
- Passos: acionar `company.setResponsavelFinanceiro`.
- Evidência esperada: alerta `responsavel_financeiro_nomeado` apenas para o próprio RF; severidade `info`; canal sino APENAS (sem e-mail); emoji 🔵.
- Critério: canônico; eventos silenciosos preservados (atribuição inicial, transferência entre colaboradores, remoção sem substituto sem alerta público).

**Cenário OP.18 — Fluxo P11 de desbloqueio end-to-end + reversão 24h.**
- Contexto: mês fechado; RH solicita; Bruno aprova; janela 24h passa.
- Passos: encadeamento completo do fluxo.
- Evidência esperada: `runDailyClosureJob` retorna `monthlyClosureStatus` para `fechado` após `expiraEm < NOW()`; se `houveAlteracao=true` durante a janela, recálculo trimestral disparado; marca visual permanente aparece; tooltip literal *"Mês alterado após o fechamento — clique para detalhes"*.
- Critério: canônico.

**Cenário OP.19 — Sino canônico com polling 60s.**
- Contexto: Bruno e RH autenticados com notificações não lidas.
- Passos: observar sino; simular falha de polling.
- Evidência esperada: badge com contador correto (`99+` acima de 99); cor prioritária por severidade dominante; dropdown com 10 últimas + link `[Ver todas as notificações]`; polling 60s; falha após primeiro carregamento: valor mantido, warning Sentry, sem toast.
- Critério: canônico.

**Cenário OP.20 — 3 workers de e-mail + digest semanal.**
- Contexto: `emailQueue` com itens pendentes; janela de digest.
- Passos: monitorar `runEmailQueueJob` (1 min), `resetStuckEmailQueue` (10 min), `runWeeklyDigestJob` (horário UTC).
- Evidência esperada: e-mails enviados via SMTP com messageId; `resetStuckEmailQueue` retorna e-mail travado > 10min a `pendente`; digest com 0 alertas NÃO é enviado; gravação em `digestExecutionLog` com `emailsEnviados=0`; digest executado em segunda 08:00 no fuso local de cada empresa.
- Critério: canônico.

**Cenário OP.21 — Motor de `cycleSchedule` + 3 estados.**
- Contexto: empresa com ciclos configurados.
- Passos: consultar `cycleSchedule`.
- Evidência esperada: exatamente 3 estados persistidos (`aberto`, `atrasado`, `fechado`); rótulo visual "Futuro" derivado em UI, não persistido; hooks canônicos idempotentes.
- Critério: canônico.

**Cenário OP.22 — LGPD operacional (portabilidade PDF + `dataAccessLog`).**
- Contexto: colaborador solicita portabilidade via portal; RH acessa dashboard individual e exporta planilha.
- Passos: (a) colaborador clica `[Baixar em PDF]` na aba "Meus dados" do modal LGPD; (b) RH abre `/dashboard-individual/{id}` do colaborador X e exporta planilha.
- Evidência esperada: (a) PDF único gerado on-the-fly com dados cadastrais + respostas do próprio titular; SEM avaliações de terceiros; SEM persistência; autoacesso do titular ISENTO de `dataAccessLog`; (b) RH gera 2 linhas em `dataAccessLog` (uma para dashboard individual, outra para exportação em planilha).
- Critério: canônico.

**Cenário OP.23 — Onboarding de líderes (kanban + estágios).**
- Contexto: colaborador X marcado como `isLider=true` pela primeira vez.
- Passos: (a) Bruno acessa `/onboarding-lideres` e vê X em `treinar`; (b) muda estágio via modal com anotação obrigatória; (c) X é desativado como líder; reativado.
- Evidência esperada: (a) X entra em `treinar` automaticamente; (b) linha em `leaderOnboardingStageLog` + linha em `leaderOnboardingNotes`; (c) desativação preserva `onboardingUltimoEstagio`; reativação retorna X ao último estágio conhecido; X nunca vê o próprio estágio em nenhuma tela.
- Critério: canônico.

**Cenário OP.24 — Change log via UNION de 5 fontes.**
- Contexto: empresa com eventos em cada uma das 5 fontes canônicas.
- Passos: Bruno acessa `/super-admin/empresa/{id}/historico`.
- Evidência esperada: tabela consolida 5 fontes via UNION; `performanceMultiplierLog` retorna vazio (fonte inativa); acordeão de expansão única; filtros funcionais; sem entrada para geração de Relatório executivo trimestral; sem entrada para mudanças de thresholds do 9-Box.
- Critério: canônico.

**Cenário OP.25 — Chat IA arquivamento 6 meses.**
- Contexto: Chat IA com mensagens de mais de 6 meses e mais recentes.
- Passos: aguardar execução do cron `archiveAiConversationsJob` às 03:00 UTC.
- Evidência esperada: SQL `UPDATE aiConversations SET archivedAt = NOW() WHERE archivedAt IS NULL AND createdAt < NOW() - INTERVAL 6 MONTH` executado idempotentemente; mensagens antigas movidas para arquivado; mensagens recentes preservadas.
- Critério: canônico.

### 10.7 Cenários TR — Transversais

**Cenário TR.1 — CC5 harmonização dia 10 / dia 11 nos 4 domínios.**
- Contexto: empresa com dados mensais RH, dados mensais Líderes, faturamento, corte de instrumentos trimestrais.
- Passos: verificar comportamento em cada domínio no dia 10 (aberto) e no dia 11 (fechado) do mês subsequente.
- Evidência esperada: dados mensais RH aceitos até 23:59:59 do dia 10; dados mensais Líderes idem; faturamento idem; corte de instrumentos trimestrais A, C, D no dia 10; transição às 00:00 do dia 11 em todos os 4 domínios.
- Critério: cadência canônica CC5 aplicada uniformemente sem sobreposição de regras.

**Cenário TR.2 — Padrão 100-500 caracteres em 4 pontos com mensagens literais.**
- Contexto: as 4 ações administrativas críticas listadas em §6.12.
- Passos: para cada ação, submeter com 50, 100, 500, 501 caracteres.
- Evidência esperada: 50 e 501 bloqueados com mensagem canônica literal; 100 e 500 aceitos; contador `X / 500` renderizado.
- Critério: padrão global uniforme.

**Cenário TR.3 — Termos e nomes proibidos ausentes globalmente.**
- Contexto: repositório completo (código, migrations, templates, mockups, PDFs gerados, planilhas geradas, logs, seed).
- Passos: grep por cada termo da lista canônica do §14 em todos os artefatos.
- Evidência esperada: zero ocorrências dos termos proibidos; termos canônicos preservados.
- Critério: entrega conforme apenas se zero ocorrências.

**Cenário TR.4 — Imutabilidade e append-only nas tabelas §16.1.**
- Contexto: cada tabela append-only listada em DOC 01 §16.1.
- Passos: tentar UPDATE ou DELETE via chamada tRPC direta em cada tabela append-only.
- Evidência esperada: nenhuma procedure exposta que permita UPDATE/DELETE em tabela append-only; tentativas retornam 403 ou 404.
- Critério: append-only preservado.

**Cenário TR.5 — Auditabilidade cross-tabela.**
- Contexto: solicitação de desbloqueio aprovada.
- Passos: reconstituir a cronologia do evento via inspeção cruzada.
- Evidência esperada: rastreamento consistente entre `cycleUnlockRequests`, `monthlyUnlockLog`, `monthlyClosureStatus`, `alerts`, `notifications`, `emailQueue`, `emailNotifications` para o mesmo evento — todos os timestamps coerentes, IDs relacionados.
- Critério: cadeia de auditoria preservada sem inconsistência.

---

## 11. Regras canônicas invioláveis do template `RETORNO_ROIP_MVP.md`

Absorvem regras do template canônico da Fase 8 §16.1 e do template canônico da Fase M P1 §16.

### 11.1 Preenchimento integral obrigatório

- Nenhuma seção do template pode ser omitida.
- Seção sem conteúdo aplicável usa a frase padrão canônica declarada no próprio template (ver §12).
- Silêncio configura entrega não conforme.

### 11.2 Evidências verificáveis

- Toda checkbox marcada exige evidência colável dentro do próprio artefato — query SQL + output, print de tela + rota + perfil autenticado, resposta tRPC serializada, valor persistido em tabela, log estruturado com timestamp, hash SHA-256 quando aplicável.
- Referências a evidências fora do artefato (URLs internas, drives, wikis) NÃO substituem a evidência colada.
- Prints anexados em subdiretórios canônicos referenciados nominalmente no template (§17 do template).

### 11.3 Ordem canônica

- As 16 seções do template seguem exatamente a ordem canônica declarada em §12.
- Alteração de ordem invalida o artefato para auditoria.
- Numeração interna canônica das subseções preservada — sem renumeração silenciosa.

### 11.4 Nomes canônicos preservados

- Nenhum nome de tabela, coluna, router, procedure, rota, item de menu, tipo de alerta, template de e-mail, cenário canônico ou mensagem canônica pode ser renomeado silenciosamente.
- Renomeação silenciosa configura desvio e deve ser declarada em §13 do template.

### 11.5 Silêncio proibido

- Toda decisão técnica que o Manus tomou durante a construção e que não estava explicitamente na especificação deve ser declarada em §13 do template.
- Inclui, sem se limitar a: versões de bibliotecas escolhidas, parâmetros de retry, variáveis de ambiente adicionadas, formatos de log, políticas de connection pool, formatos de identificadores gerados, decisões de codificação de caracteres, decisões de tratamento de nulls.

### 11.6 Padrão de idioma

- Português do Brasil na estrutura fixa do template.
- Nomes técnicos em inglês tolerados sem tradução forçada (`companyId`, `sliding window`, `unique key`, `messageId`, `retry`).
- Mensagens canônicas literais preservadas palavra por palavra no idioma original em que estão declaradas nos DOCs 02-06.

### 11.7 Padrão de commit vinculado

- Hash de commit final e nome do branch são obrigatórios no cabeçalho do template.
- Commit final deve corresponder à versão em deploy.
- Branch entregue deve estar registrado e disponível para inspeção por Bruno.

### 11.8 Regra canônica de aprovação parcial

- Aprovação parcial de cenário de aceitação (§10) é proibida.
- Se qualquer item de um cenário falhar, o cenário inteiro fica "não aprovado" e a diferença é declarada em §13 do template.

### 11.9 Regra canônica de reexecução

- Cenário reexecutado após correção durante a construção: apenas o resultado final é reportado no template; iterações intermediárias não entram no artefato de retorno.
- Correções aplicadas após reexecução NÃO configuram desvio se o resultado final for canônico.

### 11.10 Regra canônica de commit hash em evidência

- Toda evidência de teste em staging deve ter timestamp compatível com o commit hash declarado no cabeçalho — timestamps de evidência anteriores ao commit configuram entrega não conforme.

---

## 12. Template canônico literal `RETORNO_ROIP_MVP.md`

O Manus gera este artefato ao final da construção, preenche integralmente e entrega a Bruno. Este template substitui integralmente os templates de retorno espalhados nas fases originais (Fase 1 §24, Fase 2 §17, Fase 3 §15, Fase 3B §16, Fase 4 §18, Fase 5 §15, Fase 6 §16, Fase 7 §16, Fase 8 §16, Fase M P1 §16, Fase Exportáveis P2 §16, Fase Prontidão MVP §18).

O texto abaixo é canônico literal — Manus reproduz o conteúdo dentro do bloco de código sem qualquer alteração de estrutura, ordem ou nomenclatura das seções.

```markdown
# RETORNO_ROIP_MVP.md

**Versão do pacote ROIP APP recebida:** {versao_pacote_recebida}
**Data de entrega:** {data_entrega_iso}
**Responsável pela construção:** Manus
**Commit final:** {hash_commit}
**Branch entregue:** {nome_branch}
**URL de produção:** {url_producao}

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

Preencher com um dos 3 valores canônicos:
- [ ] Concluído integralmente — nenhum desvio, nenhum item pendente, nenhum cenário não aprovado.
- [ ] Concluído com ressalvas — desvios declarados em §13; cenários listados como parcialmente aprovados NÃO são aceitos (regra canônica §11.8) — se houver, entrega é "concluída com desvios".
- [ ] Bloqueado — impedimento técnico durante a construção; detalhado em §13 e §14.

Data de conclusão: {iso}
Data de deploy em produção: {iso}

---

## 2. Resumo executivo consolidado

- Total de arquivos criados: {N_criados}
- Total de arquivos alterados: {N_alterados}
- Total de migrations SQL executadas: {N_migrations}
- Total de tabelas criadas: 53 (inventário DOC 01 §3)
- Total de routers criados por domínio: {breakdown}
- Total de jobs agendáveis canônicos registrados: 8 (7 de propriedade do DOC 06 §15-§16 + `runDailyClimateAggregationJob` do DOC 03 — S499)- Total de templates de e-mail canônicos: 7
- Total de rotas administrativas: {N} (inventário DOC 02 §10)
- Total de mockups seguidos como referência canônica: 51
- Total de superfícies com IA: 4 (Perfil Individual, Chat IA, Diagnóstico IA, Relatório executivo trimestral)

---

## 3. Camada 1 — Dados — evidências

Para cada item do §4 do DOC 07, marcar confirmação binária + evidência colável.

### 3.1 Inventário de tabelas

- [ ] 53 tabelas criadas. **Evidência:** `SHOW TABLES;` → {output_colar_completo}
- [ ] `SHOW TABLES LIKE 'emailSettings';` — vazio. **Evidência:** {output}
- [ ] `SHOW TABLES LIKE 'emailChangeRequests';` — vazio. **Evidência:** {output}
- [ ] `SHOW TABLES LIKE 'nr1PGRDocuments';` — vazio. **Evidência:** {output}

### 3.2 Núcleo cadastral e enums fechados

- [ ] `SHOW COLUMNS FROM employees;` inclui `isRH`, `isLider`, `isResponsavelFinanceiro`, `onboardingEstagio`, `onboardingUltimoEstagio`, `passwordSet`. **Evidência:** {output}
- [ ] `SHOW COLUMNS FROM companies;` inclui `timezone`, `encarregadoLgpdNome`, `encarregadoLgpdEmail`, `encarregadoLgpdTelefone`, `encarregadoLgpdPoliticaUrl`; sem `cadenciaCOPSOQ`. **Evidência:** {output}
- [ ] `SELECT COUNT(*) FROM departments;` = 19. **Evidência:** {output}
- [ ] `SHOW COLUMNS FROM accessTokens LIKE 'type';` — enum com exatamente 2 valores. **Evidência:** {output}

### 3.3 Desempenho, instrumentos e 9-Box

Repetir padrão de §4.3 e §4.4 do DOC 07 com evidência SQL por item.

### 3.4 Alertas, notificações, e-mails e ciclos

- [ ] `SHOW COLUMNS FROM alerts LIKE 'severidade';` — enum canônico. **Evidência:** {output}
- [ ] `SHOW COLUMNS FROM notifications LIKE 'alertId';` — coluna presente. **Evidência:** {output}
- [ ] `SELECT DISTINCT tipo FROM notifications;` — coerência com 17 valores canônicos. **Evidência:** {output}
- [ ] `SHOW INDEX FROM notifications WHERE Key_name = 'idx_notifications_alertId';` — índice presente. **Evidência:** {output}
- [ ] `SHOW COLUMNS FROM cycleSchedule LIKE 'status';` — 3 valores canônicos. **Evidência:** {output}

### 3.5 Exportáveis, logs administrativos e cadastros complementares

Repetir padrão de §4.6 do DOC 07 com evidência SQL por item.

### 3.6 LGPD e onboarding de líderes

Repetir padrão de §4.7 do DOC 07 com evidência SQL por item.

### 3.7 Migrations e seed

- [ ] Todas as migrations aplicadas na ordem canônica DOC 01 §17.2. **Evidência:** {lista_de_ids_de_migration_na_ordem}
- [ ] `SELECT COUNT(*) FROM superAdmins;` = 1. **Evidência:** {output}
- [ ] `SELECT nome, email FROM superAdmins;` — retorna Bruno Andrade / brunorpandrade@gmail.com. **Evidência:** {output}
- [ ] Senha do Super Admin injetada exclusivamente via `SEED_SUPER_ADMIN_PASSWORD` — verificação nominal do seed script. **Evidência:** {trecho}

### 3.8 Verificação global de nomenclaturas superadas

- [ ] Grep em migrations por `resetPasswordTokenHash|firstAccessCompleted|cadenciaCOPSOQ` — zero ocorrências. **Evidência:** {output_grep}
- [ ] Grep em código por `emailSettings|emailChangeRequests|nr1PGRDocuments` — zero ocorrências. **Evidência:** {output_grep}

---

## 4. Camada 2 — Autenticação e autorização — evidências

Para cada item do §5 do DOC 07, marcar confirmação binária + evidência colável.

### 4.1 Perfis e roteamento

Repetir padrão de §5.1 do DOC 07.

### 4.2 Sessão e token

- [ ] JWT do Super Admin decoded sem claim `exp`. **Evidência:** {jwt_decoded}
- [ ] JWT de RH decoded com `exp = iat + 8h`. **Evidência:** {jwt_decoded}
- [ ] Fluxo H3 opera sobre `accessTokens` com metadado `tipo:'email_change'` — sem tabela `emailChangeRequests`. **Evidência:** {row_accessTokens + trecho_backend}

Repetir padrão para demais itens de §5.2.

### 4.3 Consentimento LGPD

- [ ] Diff do texto do termo LGPD implementado contra o canônico literal do DOC 02 §7 — zero divergências. **Evidência:** {output_diff}
- [ ] `SELECT * FROM lgpdConsents WHERE colaboradorId={id};` após aceite — retorna 1 linha com `versaoTermoAceita`. **Evidência:** {row}

Repetir padrão para demais itens de §5.3.

### 4.4 `AccessDeniedPage` e mensagens canônicas

- [ ] Print de `AccessDeniedPage` em cada uma das 16 rotas restritas canônicas do DOC 02 §9. **Evidência:** {lista_de_prints_no_anexo}

### 4.5 Matrizes de acesso e PC1

- [ ] Matriz de rotas × 5 perfis testada — para cada perfil, print da rota acessada com sucesso e print do `AccessDeniedPage` para rotas negadas. **Evidência:** {lista_prints}
- [ ] PC1a testada — print de `/todos-os-colaboradores` autenticado como RH, mostrando ausência de C-levels. **Evidência:** {print}
- [ ] PC1b testada — print do organograma autenticado como RH mostrando C-level sem clique com tooltip literal. **Evidência:** {print}
- [ ] PC1c testada — comparação de agregados no `/painel-rh` (contadores, IQL, Clima) mostrando inclusão de C-levels. **Evidência:** {print + SQL_de_agregado}
- [ ] PC1d testada em `/cycle-management` e `/nr1`. **Evidência:** {prints}
- [ ] PC1e testada — botão `[Ver Perfil Individual]` ausente em superfícies RH sobre C-level. **Evidência:** {prints}
- [ ] PC1f testada — `/dashboard-individual/:id` de C-level para RH retorna `AccessDeniedPage`. **Evidência:** {print + resposta_backend}

### 4.6 Responsável financeiro

Repetir padrão para itens de §5.6.

### 4.7 Verificação global de termos proibidos desta camada

- [ ] Grep no código-fonte por termos proibidos do DOC 02 §14.8 — zero ocorrências. **Evidência:** {output_grep}

---

## 5. Camada 3 — Negócio — evidências

Para cada item do §6 do DOC 07, marcar confirmação binária + evidência colável.

### 5.1 Motor determinístico do Eixo X (CC5)

- [ ] Cenário de fechamento mensal em empresa com timezone `America/Sao_Paulo`: dado mensal aceito às 23:59:59 do dia 10; rejeitado às 00:00:00 do dia 11. **Evidência:** {logs + queries}
- [ ] Transição `aberto → fechado` executada por `runDailyClosureJob` às 00:00 no fuso local. **Evidência:** {log_estruturado_do_job}

### 5.2 Fechamento mensal, desbloqueio e recálculo

- [ ] Fluxo P11 end-to-end: RH solicita, Bruno aprova, transação atômica canônica executada com 4 UPDATEs/INSERTs. **Evidência:** {logs_da_transacao_com_timestamps}
- [ ] Falha simulada em qualquer passo da transação → rollback total; nada persiste. **Evidência:** {log_da_falha_simulada + SELECT_confirmando_estado_pre-tx}
- [ ] Reversão automática pós-24h: `runDailyClosureJob` retorna `monthlyClosureStatus` para `fechado`. **Evidência:** {log_do_job + query_pre_e_pos}

### 5.3 Faturamento bruto e Responsável financeiro

Repetir padrão para itens de §6.3.

### 5.4 Motor determinístico do Eixo Y e 9-Box

- [ ] Cálculo trimestral executado; `plenitudeData` e `ninebox` populados. **Evidência:** {rows}
- [ ] Snapshot em `ninebox` imutável após criação — tentativa de UPDATE retorna erro. **Evidência:** {output_erro}

### 5.5 Instrumento D e IQL

Repetir padrão para itens de §6.5.

### 5.6 Bloco Clima e Engajamento

Repetir padrão para itens de §6.6.

### 5.7 Perfil Individual — motor determinístico

- [ ] 80 itens canônicos preservados no formulário — `SELECT COUNT(*) FROM {catalog_items} WHERE ...` = 80. **Evidência:** {output}
- [ ] 3 níveis canônicos de confiabilidade observados em teste sintético com 3 respondentes. **Evidência:** {rows_individualProfileScores}
- [ ] Regra canônica de retest observada. **Evidência:** {row_da_segunda_tentativa}

### 5.8 Radar NR-1

- [ ] Fechamento de ciclo NR-1 gera `alerts` e `notifications` canônicos. **Evidência:** {rows}
- [ ] PDF do Radar NR-1 gerado com 13 páginas exatas. **Evidência:** {print_da_pdf + comando_pdftk_para_contagem_paginas}
- [ ] Nome do arquivo canônico: `Radar_NR-1_[empresa_normalizado]_[data_abertura]_[data_geracao].pdf`. **Evidência:** {nome_do_arquivo}
- [ ] Hash SHA-256 na Seção 13 do PDF. **Evidência:** {hash + print_da_secao_13}
- [ ] Grep no PDF renderizado por "PGR", "Programa de Gerenciamento de Riscos Psicossociais", "Pesquisa NR-1", "nr1PGRDocuments" — zero ocorrências. **Evidência:** {output_grep_no_pdf_extract_texto}

### 5.9 Turnover

- [ ] Cálculo exclui `cLevelMembers`. **Evidência:** {query_do_backend + verificacao_do_output}
- [ ] Reativação e reinativação geram novos registros; anterior imutável. **Evidência:** {rows_com_timestamps}

### 5.10 Central de Relatórios e Exportações

- [ ] 6 exportáveis gerados para escopo Empresa em trimestre fechado. **Evidência:** {arquivos_gerados + prints}
- [ ] Board deck one-pager omite "Equipe" no dropdown de Nível. **Evidência:** {print}
- [ ] Card Clima e engajamento usa dropdown único de "Ciclo". **Evidência:** {print}

### 5.11 Transferência de liderados M2 v2

- [ ] Modal M2 v2 executado end-to-end: 5 grupos autocomplete + modal secundário de promoção `isLider` condicional + loop condicional + justificativa 100-500 + transação atômica. **Evidência:** {logs + queries}

### 5.12 Padrão canônico 100-500 caracteres

- [ ] Padrão testado em cada uma das 4 ações administrativas críticas com 99, 100, 500, 501 caracteres. **Evidência:** {prints_das_mensagens_de_erro_literais + toasts_de_sucesso}

### 5.13 Cadastros e ciclo de vida de vínculos

Repetir padrão para itens de §6.13.

### 5.14 Motor de instrumentos e ciclos automáticos

- [ ] `cycleSchedule` com exatamente 3 estados persistidos observados via `SELECT DISTINCT status FROM cycleSchedule;`. **Evidência:** {output}
- [ ] Hooks canônicos idempotentes verificados por dupla execução — sem duplicação de registros. **Evidência:** {logs}

### 5.15 Routers tRPC do domínio de negócio

- [ ] Inventário completo do DOC 03 §19 presente. **Evidência:** {lista_de_arquivos_dos_routers + assinaturas_das_procedures}

---

## 6. Camada 4 — IA — evidências

Para cada item do §7 do DOC 07, marcar confirmação binária + evidência colável.

### 6.1 Princípio inviolável — IA nunca calcula

- [ ] Grep no repositório por padrão de cálculo dentro de arquivos de IA — zero ocorrências que resultem em score derivado. **Evidência:** {output_grep}

### 6.2 System prompts canônicos

- [ ] Diff de cada system prompt canônico contra o DOC 04 §9 — zero divergências. **Evidência:** {outputs_diff}

### 6.3 Perfil Individual — Momento 1 e Momento 2

- [ ] Fluxo executado com sucesso em teste sintético. **Evidência:** {trace_das_2_chamadas + row_em_individualProfileReports}
- [ ] Fallback canônico literal em falha simulada. **Evidência:** {print_da_mensagem_literal_exata_do_DOC_04_§11.1}

### 6.4 Chat IA — 4 níveis

- [ ] Print de cada um dos 4 níveis (global, departamento, equipe, individual) com resposta gerada. **Evidência:** {4_prints}
- [ ] Contexto de dashboard individual para líder — grep no payload confirma ausência de campos financeiros. **Evidência:** {payload_serializado}
- [ ] Cron `archiveAiConversationsJob` executado — mensagens de 6+ meses movidas para arquivado. **Evidência:** {log_do_cron + SELECT_pre_e_pos}

### 6.5 Diagnóstico IA — 3 estados

- [ ] Print de cada um dos 3 estados canônicos. **Evidência:** {3_prints}

### 6.6 Relatório executivo trimestral

- [ ] Cache observado: 2ª geração da mesma chave retorna do cache sem incremento de `apiUsageLog`. **Evidência:** {logs}
- [ ] Governança 5/dia observada em teste sintético — 6ª tentativa retorna mensagem canônica literal. **Evidência:** {print_da_mensagem_literal_exata}

### 6.7 Falha da API — política canônica de fallback

- [ ] Fallback canônico em cada uma das 4 superfícies com mensagem literal exata do DOC 04. **Evidência:** {4_prints_com_diff_zero}

### 6.8 Wrapper `claudeCall` canônico

- [ ] Grep no repositório por chamadas ao endpoint da Claude API fora de `claudeCall` — zero ocorrências. **Evidência:** {output_grep}

### 6.9 Observabilidade

- [ ] Log estruturado de 1 chamada à Claude API contendo campos canônicos: `latency_ms`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `timestamp`, `companyId`, `surface`. **Evidência:** {log_json}

---

## 7. Camada 5 — UI — evidências

Para cada item do §8 do DOC 07, marcar confirmação binária + evidência colável.

### 7.1 Design system

- [ ] Print de tela de amostra de cada família de componentes canônica. **Evidência:** {prints}
- [ ] Grep no CSS por fontes fora de Inter — zero ocorrências. **Evidência:** {output_grep}

### 7.2 Menus por perfil

- [ ] Print do menu lateral em cada um dos 10 perfis canônicos. **Evidência:** {10_prints}

### 7.3 Painéis de controle

- [ ] Print de cada um dos painéis de controle canônicos. **Evidência:** {prints}

### 7.4 Portal do colaborador

- [ ] Print da tela de entrada `/colaborador` em desktop (1440px) e mobile (390px). **Evidência:** {2_prints}
- [ ] Print da tela de pendências mostrando ordem canônica (Radar NR-1 primeiro). **Evidência:** {print}
- [ ] Print do modal "Privacidade e proteção de dados" com 3 abas. **Evidência:** {3_prints}

### 7.5 Formulários de instrumento

- [ ] Print de cada instrumento em cada viewport aplicável (mobile e desktop). **Evidência:** {prints}

### 7.6 Componentes com IA

- [ ] Print de Chat IA, pop-up do relatório do Perfil Individual, Diagnóstico IA, Card do Relatório executivo. **Evidência:** {prints}
- [ ] Diff de cada mensagem literal de fallback contra o DOC 04 §13.2 — zero divergências. **Evidência:** {outputs_diff}

### 7.7 Central de Relatórios e Exportações

- [ ] Print de cada um dos 6 cards em cada perfil aplicável. **Evidência:** {prints}
- [ ] Print do seletor em cascata funcionando nos 4 artefatos aplicáveis. **Evidência:** {prints}

### 7.8 Cadastros e edições

- [ ] Print do grid 3/2/1 de famílias em cadastro de colaborador e cadastro de C-level. **Evidência:** {2_prints}
- [ ] Print do modal M1 com validação bloqueadora. **Evidência:** {print}
- [ ] Print do modal M2 v2 nos 3 estados canônicos (autocomplete aberto, modal secundário de promoção, submit com justificativa). **Evidência:** {3_prints}
- [ ] Print do modal de inativação com radio buttons sem pré-seleção. **Evidência:** {print}

### 7.9 Rotas administrativas

- [ ] Print de cada rota administrativa canônica. **Evidência:** {prints}

### 7.10 Componentes de erro

- [ ] Print do `AccessDeniedPage` com título literal *"Acesso negado."* e cada mensagem canônica. **Evidência:** {prints + diff_zero}
- [ ] Print da página 404 com título literal *"Página não encontrada."*. **Evidência:** {print + diff_zero}
- [ ] Print da página 500 com correlation ID. **Evidência:** {print + diff_zero}

### 7.11 Validações e mensagens exatas

- [ ] Diff de cada mensagem canônica literal do DOC 05 §18 contra o texto renderizado — zero divergências. **Evidência:** {outputs_diff}

### 7.12 Perímetro mobile

- [ ] Print de cada superfície mobile-responsive em 390px e 768px. **Evidência:** {prints}
- [ ] Print da mensagem canônica literal em cada superfície desktop-only em 390px. **Evidência:** {prints + diff_zero}

### 7.13 Coexistência botão [RH] + filtro "Papel funcional"

- [ ] Print de `/todos-os-colaboradores` mostrando sincronização bidirecional entre botão `[RH]` e dropdown. **Evidência:** {prints}

### 7.14 Verificação global de termos proibidos desta camada

- [ ] Grep na base de mockups, código de UI, textos renderizados por termos proibidos — zero ocorrências. **Evidência:** {output_grep}

---

## 8. Camada 6 — Operações — evidências

Para cada item do §9 do DOC 07, marcar confirmação binária + evidência colável.

### 8.1 Absorção da §12 da revisão do Responsável financeiro (S407)

- [ ] Tipos `fechamento_bloqueado_sem_resp_financeiro` e `responsavel_financeiro_nomeado` implementados conforme DOC 06 §3.8. **Evidência:** {snapshots + rows}

### 8.2 Enum canônico de 17 tipos

- [ ] `SELECT DISTINCT tipo FROM alerts;` e `SELECT DISTINCT tipo FROM notifications;` — 17 valores coerentes. **Evidência:** {outputs}
- [ ] Grep no código por "15 tipos" ou "19 tipos" — zero ocorrências. **Evidência:** {output_grep}

### 8.3 Estados canônicos de `cycleSchedule`

- [ ] `SELECT DISTINCT status FROM cycleSchedule;` — exatamente 3 valores canônicos. **Evidência:** {output}
- [ ] Grep no código por `'futuro'` como valor persistido — zero ocorrências. **Evidência:** {output_grep}

### 8.4 Templates de e-mail canônicos

- [ ] Cada um dos 7 templates renderizado com dados sintéticos. **Evidência:** {7_HTMLs_renderizados_em_anexo}
- [ ] Diff de cada template contra o canônico correspondente do DOC 06 — zero divergências no texto. **Evidência:** {outputs_diff}

### 8.5 Change log

- [ ] Query UNION consolidada retorna 5 fontes. **Evidência:** {SQL_da_query + output_por_fonte}
- [ ] `performanceMultiplierLog` retorna vazio. **Evidência:** {output}

### 8.6 Cron do arquivamento do Chat IA

- [ ] Cron `archiveAiConversationsJob` registrado às 03:00 UTC. **Evidência:** {trecho_scheduler}

### 8.7 Pipeline anti-ruído M1-M7

- [ ] Log estruturado mostrando aplicação de cada mecanismo em cenário sintético. **Evidência:** {logs_por_M}

### 8.8 Sino canônico

- [ ] Print do sino em Bruno e RH com badge correto. **Evidência:** {2_prints}
- [ ] Ausência do sino em C-level e Líder. **Evidência:** {2_prints}
- [ ] Simulação de falha de polling — valor mantido, warning Sentry. **Evidência:** {print + evento_Sentry}

### 8.9 Sistema canônico de e-mails

- [ ] 3 workers registrados. **Evidência:** {trecho_scheduler}
- [ ] Execução dupla de `runEmailQueueJob` — sem duplicação. **Evidência:** {logs}
- [ ] Execução dupla de `runWeeklyDigestJob` — sem duplicação. **Evidência:** {logs + linha_em_digestExecutionLog}
- [ ] Digest com 0 alertas — não enviado; `emailsEnviados=0` gravado. **Evidência:** {log + row}

### 8.10 Fluxo administrativo canônico de desbloqueio (P11)

- [ ] Fluxo end-to-end executado em staging. **Evidência:** {logs_por_estado + rows_por_tabela}

### 8.11 Motor canônico de ciclos automáticos

- [ ] Hooks canônicos executados. **Evidência:** {logs}

### 8.12 Jobs cron canônicos inventariados

- [ ] 8 jobs agendáveis registrados no scheduler (7 de propriedade da camada 6 + `runDailyClimateAggregationJob` do DOC 03 — S499). **Evidência:** {trecho_scheduler + timestamp_de_execucao_de_cada}

### 8.13 LGPD operacional

- [ ] PDF de portabilidade gerado on-the-fly em staging. **Evidência:** {arquivo_pdf_gerado + verificacao_de_ausencia_de_avaliacoes_terceiros}

### 8.14 Log canônico de acesso individual

- [ ] Query em `dataAccessLog` mostra 3 tipos canônicos de acesso registrados por RH em teste sintético. **Evidência:** {rows}
- [ ] Autoacesso do titular NÃO gera linha em `dataAccessLog`. **Evidência:** {row_ausente_em_staging_apos_autoacesso}

### 8.15 Onboarding canônico de líderes

- [ ] Ativação de `isLider` gera entrada automática em estágio `treinar`. **Evidência:** {row}
- [ ] Desativação preserva `onboardingUltimoEstagio`. **Evidência:** {row_pre_e_pos}
- [ ] Reativação retorna ao último estágio conhecido. **Evidência:** {row_pos_reativacao}
- [ ] Próprio líder autenticado — nenhuma superfície mostra o próprio estágio. **Evidência:** {print}

### 8.16 Exportáveis canônicos operacionais

- [ ] Cache observado em `executiveReportCache`. **Evidência:** {row_com_UPDATE_em_regeneracao}
- [ ] Contador em `apiUsageLog` incrementa corretamente. **Evidência:** {rows}

### 8.17 Turnover canônico operacional

- [ ] Router `turnover.*` implementado. **Evidência:** {trecho_do_router}

### 8.18 Mensagens canônicas literais

- [ ] Diff de cada uma das mensagens listadas em §9.18 do DOC 07 contra o texto renderizado — zero divergências. **Evidência:** {outputs_diff}

### 8.19 Cobertura canônica dos 17 tipos com snapshots completos

- [ ] Snapshot em `alerts.metadados` verificado para cada um dos 17 tipos. **Evidência:** {17_rows_com_JSON}

### 8.20 Verificação global de termos proibidos desta camada

- [ ] Grep no código, migrations, templates, PDFs, planilhas, logs — zero ocorrências. **Evidência:** {output_grep_consolidado}

---

## 9. Critérios canônicos de aceitação — evidências por cenário

Para cada cenário do §10 do DOC 07, executar em staging e registrar:

- Nome canônico + código.
- Data e hora da execução.
- Contexto de dados sintéticos utilizado (IDs estáveis).
- Sequência de passos executada.
- Evidência colável do resultado observável.
- Critério de aprovação binário — APROVADO / NÃO APROVADO.

### 9.1 Cenários AU (9 cenários)

Cenário AU.1 — Login unificado com precedência isRH prevalece: [APROVADO / NÃO APROVADO]
Cenário AU.2 — Login Super Admin: [APROVADO / NÃO APROVADO]
Cenário AU.3 — Reset de senha end-to-end: [APROVADO / NÃO APROVADO]
Cenário AU.4 — Primeiro acesso de RH recém-cadastrado: [APROVADO / NÃO APROVADO]
Cenário AU.5 — Alteração de e-mail do Super Admin via accessTokens: [APROVADO / NÃO APROVADO]
Cenário AU.6 — Gate LGPD portal + bump de versão do termo: [APROVADO / NÃO APROVADO]
Cenário AU.7 — Sessão expirada (redirect + toast âmbar): [APROVADO / NÃO APROVADO]
Cenário AU.8 — Rate limits 5/15min e 10/15min: [APROVADO / NÃO APROVADO]
Cenário AU.9 — Middleware de status de empresa (403 forceLogout): [APROVADO / NÃO APROVADO]

Para cada cenário, colar contexto, passos e evidência.

### 9.2 Cenários AC (7 cenários)

Cenário AC.1 a AC.7 — mesmo padrão do §9.1.

### 9.3 Cenários NE (10 cenários)

Cenário NE.1 a NE.10 — mesmo padrão.

### 9.4 Cenários IA (5 cenários)

Cenário IA.1 a IA.5 — mesmo padrão.

### 9.5 Cenários UI (8 cenários)

Cenário UI.1 a UI.8 — mesmo padrão.

### 9.6 Cenários OP (25 cenários)

Cenário OP.1 a OP.25 — mesmo padrão.

### 9.7 Cenários TR (5 cenários)

Cenário TR.1 a TR.5 — mesmo padrão.

### 9.8 Resumo de aprovação de cenários

- Total de cenários canônicos: 69
- Aprovados: {N}
- Não aprovados: {N} — listar códigos e motivo em §13.
- Critério canônico de conformidade global: 100% dos cenários APROVADOS.

---

## 10. Configuração de ambiente

- [ ] Node.js: {versão}
- [ ] TypeScript: {versão}
- [ ] Tailwind: {versão}
- [ ] tRPC: {versão}
- [ ] Drizzle ORM: {versão}
- [ ] MySQL/TiDB: {versão}
- [ ] Nodemailer: {versão}
- [ ] Handlebars: {versão}
- [ ] Cron scheduler: {biblioteca}@{versão}
- [ ] SMTP configurado com credenciais em vault. **Caminho do vault:** {caminho}
- [ ] Variável `LGPD_TERM_VERSION` definida. **Valor:** {v1.0}
- [ ] Variável `CLAUDE_MODEL` definida. **Valor:** {valor}
- [ ] Variável `CLAUDE_API_KEY` no vault. **Caminho do vault:** {caminho}
- [ ] `SEED_SUPER_ADMIN_PASSWORD` fornecida via variável de ambiente na primeira execução — nunca em código. **Evidência:** {trecho_do_seed}
- [ ] `companies.timezone` populado para 100% das empresas ativas. **Evidência:** `SELECT COUNT(*) FROM companies WHERE timezone IS NULL AND status='ativa';` → 0
- [ ] Cron scheduler ativo com 8 jobs agendáveis canônicos registrados (7 de propriedade da camada 6 + `runDailyClimateAggregationJob` do DOC 03 — S499). **Evidência:** {trecho_da_configuracao}
- [ ] Sentry configurado com DSN válido. **DSN mascarado:** {dsn_mascarado}
- [ ] Handlebars compilado no boot. **Evidência:** trecho do log de boot.
- [ ] Logs estruturados ativos em formato JSON. **Evidência:** exemplo de log.

---

## 11. Observabilidade e logs

### 11.1 Log estruturado de `emitAlert`

Exemplo capturado em staging: {colar_json_completo}
Campos obrigatórios presentes: `tipo`, `escopo`, `escopoEmployeeId`, `severidade`, `canal`, `suprimidoPorCooldown`, `timestamp`.

### 11.2 Log estruturado de `runEmailQueueJob`

Exemplo: {colar_json_completo}
Campos obrigatórios presentes: `processed`, `sent`, `failed`, `skipped`, `duration_ms`.

### 11.3 Log estruturado de `runWeeklyDigestJob`

Exemplo: {colar_json_completo}
Campos obrigatórios presentes por empresa: `companyId`, `janela_digest`, `emailsEnviados`, `duration_ms`.

### 11.4 Log estruturado de `claudeCall`

Exemplo: {colar_json_completo}
Campos obrigatórios presentes: `latency_ms`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `timestamp`, `companyId`, `surface`.

### 11.5 Eventos capturados no Sentry durante staging

- Total: {N}
- Distribuição: SMTP {n1}, FK {n2}, cron {n3}, 5xx tRPC {n4}, Claude API {n5}.

---

## 12. Verificação global de termos e nomes proibidos

Verificação obrigatória em todo o repositório (código, migrations, templates, mockups, PDFs gerados, planilhas geradas, logs, seed, configurações).

- [ ] Grep por `emailSettings` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `firstAccessCompleted` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `resetPasswordTokenHash` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `resetPasswordExpiresAt` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `resetPasswordUsedAt` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `emailChangeRequests` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `/gestao-ciclos` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `/desbloqueios` isolado (sem prefixo `/super-admin`) — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `leadershipQualityIndex` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `Painel principal` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `PGR` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `Programa de Gerenciamento de Riscos Psicossociais` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `Pesquisa NR-1` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `nr1PGRDocuments` — zero ocorrências. **Evidência:** {output}
- [ ] Grep por `cadenciaCOPSOQ` — zero ocorrências. **Evidência:** {output}
- [ ] Termos canônicos preservados: verificação nominal de `Painel de controle`, `Meus dados`, `Meu perfil` (exclusivo do Perfil Individual no portal), `Faturamento da empresa`, `Logs administrativos`, `Responsável financeiro`, `Radar NR-1`, `Todos os colaboradores`.

---

## 13. Desvios da especificação

Se não houve nenhum desvio: escrever exatamente **"Nenhum desvio identificado. Especificação implementada integralmente."** e NÃO abrir subseções abaixo.

Para cada desvio identificado, preencher:

- **Item da especificação impactado:** DOC {01|02|03|04|05|06|07} §{seção}
- **Descrição exata do desvio:** {texto objetivo}
- **Categoria:** bloqueio técnico | ambiguidade | otimização | correção defensiva | interpretação sob dúvida
- **Impacto observável:** {descrição do comportamento em produção}
- **Recomendação:** manter | reverter | discutir
- **Status:** aguardando decisão de Bruno

Regra canônica inviolável: nenhum desvio pode ser silencioso. Qualquer decisão técnica que o Manus tomou durante a construção e que não estava explicitamente na especificação deve estar aqui declarada.

---

## 14. Riscos identificados durante a construção

Riscos técnicos ou de negócio não mapeados nos DOCs 01-06 durante a construção. Cada um com:

- **Descrição:** {texto objetivo}
- **Cenário em que se manifestaria:** {descrição do gatilho}
- **Probabilidade:** baixa | média | alta
- **Impacto:** baixo | médio | alto
- **Mitigação recomendada:** {texto objetivo}

Se nenhum: escrever exatamente **"Nenhum risco adicional identificado além dos já mapeados nos DOCs 01-06."**

---

## 15. Pontos de atenção para auditoria de Bruno

Manus destaca itens que merecem inspeção especial pelo auditor. Exemplos canônicos:

- Cenários com múltiplas empresas em fusos distintos não testados em staging por limitação de ambiente.
- Comportamento em transição de horário de verão.
- Casos de internacionalização com caracteres especiais em nomes de empresa/pessoa.
- Comportamento em picos de carga (sem load test dedicado).
- Comportamento com relatórios PDF de tamanho fora do esperado.

Se nenhum: escrever exatamente **"Sem pontos especiais para auditoria além dos itens do §9."**

---

## 16. Anexos

Arquivos anexados junto ao `RETORNO_ROIP_MVP.md`, em subdiretórios canônicos com nomes fixos:

- `evidencias_sql/` — dumps de queries executadas, agrupados por camada.
- `evidencias_prints/` — prints por rota, perfil e viewport (organizados em subpastas por camada).
- `evidencias_emails/` — HTMLs renderizados dos 7 templates canônicos.
- `evidencias_logs/` — trechos de log estruturado (JSON) para cada job cron canônico e para cada superfície de IA.
- `evidencias_curl/` — chamadas de teste às procedures tRPC principais com payloads mínimos válidos.
- `evidencias_grep/` — outputs de grep para verificação de termos proibidos e de aderência a mensagens canônicas literais.
- `evidencias_pdf/` — PDFs gerados em staging (Radar NR-1 + portabilidade LGPD).
- `evidencias_xlsx/` — planilhas exportadas em staging (Evolução trimestral + Snapshot 9-Box + planilhas modelo RH/Líder).

Cada arquivo em anexo tem nome canônico legível — sem UUIDs opacos.

---

**Fim do template canônico `RETORNO_ROIP_MVP.md`.**
```

---

## 13. Política canônica de correção pós-entrega — via única sem retorno estruturado

### 13.1 Princípio inviolável

- A entrega do pacote ROIP APP ao Manus é de mão única, sem retorno estruturado ao ciclo canônico da Rota B.
- Qualquer correção pós-entrega é executada em conversa própria pós-Manus, fora do escopo canônico do pacote da Rota B.
- Não há novo ciclo automático Manus → Claude → Bruno após a auditoria.

### 13.2 Bruno como instância exclusiva de decisão

- Bruno é o único auditor da entrega do Manus.
- Nenhuma outra instância revisa, aprova ou solicita correção diretamente ao Manus.
- Claude só participa de correções pós-entrega quando explicitamente acionado por Bruno em conversa nova, fora deste pacote.

### 13.3 Fluxo canônico de uso do `RETORNO_ROIP_MVP.md` pós-entrega

Sequência operacional canônica após entrega do Manus:

- **Passo 1 — Recebimento.** Manus entrega commit final + `RETORNO_ROIP_MVP.md` preenchido + anexos.
- **Passo 2 — Auditoria seção a seção.** Bruno abre o arquivo e verifica seção a seção contra §4-§10 deste DOC 07. Cada checkbox marcada é auditada por leitura da evidência colada.
- **Passo 3 — Verificação de cenários.** Bruno confere o resultado binário de cada um dos 69 cenários canônicos de §10; qualquer cenário NÃO APROVADO reduz a entrega a "não conforme".
- **Passo 4 — Verificação global.** Bruno confere §12 do template (termos e nomes proibidos); qualquer ocorrência configura entrega não conforme.
- **Passo 5 — Decisão binária global.** Aprovada (deploy autorizado) ou não aprovada.
- **Passo 6a — Se aprovada.** Deploy em produção autorizado; nenhuma ação adicional canônica dentro do escopo da Rota B.
- **Passo 6b — Se não aprovada.** Bruno decide o tratamento em conversa nova pós-Manus, fora do escopo canônico deste pacote.

### 13.4 Cenários canônicos de auditoria detectada

Auditoria detecta 3 situações distintas por item:

- **Item conforme:** checkbox marcada com evidência coerente com o esperado. Item aprovado.
- **Item bloqueado:** checkbox marcada com evidência insuficiente ou inconsistente. Item retorna para complementação (fora do escopo canônico da Rota B — Bruno decide em conversa nova).
- **Item omitido ou renomeado silenciosamente:** entrega considerada não conforme globalmente. Correção decidida por Bruno em conversa nova.

### 13.5 Ausência canônica de retorno estruturado ao Manus

- Não há template canônico dentro deste pacote da Rota B para reabertura de trabalho junto ao Manus.
- Não há sequência canônica dentro deste pacote para nova iteração de construção.
- Correções pós-entrega, se necessárias, são conduzidas em conversas próprias fora do pacote canônico entregue.

### 13.6 Ausência canônica de auditoria automática por Claude sobre o retorno do Manus

- Claude não audita automaticamente o `RETORNO_ROIP_MVP.md` do Manus dentro do escopo canônico da Rota B.
- Se Bruno decidir auditoria assistida por Claude fora do escopo canônico, isso ocorre em conversa nova, com Bruno definindo escopo e modelo.

### 13.7 Ausência canônica de handshake automático de aprovação

- Não há assinatura eletrônica, hash de aprovação ou artefato de "OK Bruno" gerado automaticamente dentro do escopo da Rota B.
- Aprovação de Bruno é ato pessoal de decisão registrado fora do pacote canônico.

---

## 14. Verificação global canônica de termos e nomes proibidos

Consolidação canônica única das listas idênticas dos DOCs 02 §14.8, DOC 05 §22.14 e DOC 06 §25.20. Verificação obrigatória antes da entrega — uma única ocorrência em qualquer artefato configura entrega não conforme.

### 14.1 Termos e nomes proibidos globalmente

Nomenclaturas superadas — nenhuma ocorrência aceita em código, comentário, migration, UI, log, template de e-mail, PDF gerado, planilha gerada, seed, mockup, configuração:

- `emailSettings`
- `firstAccessCompleted`
- `resetPasswordTokenHash`
- `resetPasswordExpiresAt`
- `resetPasswordUsedAt`
- `emailChangeRequests`
- `/gestao-ciclos` (rota)
- `/desbloqueios` (rota isolada — sem prefixo `/super-admin`)
- `leadershipQualityIndex`
- `Painel principal`
- `PGR`
- `Programa de Gerenciamento de Riscos Psicossociais`
- `Pesquisa NR-1`
- `nr1PGRDocuments`
- `cadenciaCOPSOQ`

### 14.2 Termos canônicos preservados

Nomenclaturas canônicas que devem estar preservadas onde aplicável — verificação nominal por inspeção pontual:

- `Painel de controle` (nunca "Painel principal").
- `Meus dados` (item de menu comum a todos os 10 perfis).
- `Meu perfil` (exclusivo do Perfil Individual no portal do colaborador; nunca em outros contextos).
- `Faturamento da empresa` (item condicional a `isResponsavelFinanceiro = true`).
- `Logs administrativos` (menu global do Super Admin).
- `Responsável financeiro` (papel funcional canônico).
- `Radar NR-1` (nunca "Pesquisa NR-1" ou "PGR").
- `Todos os colaboradores` (rótulo do item de menu; nunca "Colaboradores").
- `Cadeia indireta` (rótulo do item de menu; nunca "Minha cadeia").
- `Dados cadastrais` (rótulo da coluna 10 de tabelas de colaboradores; nunca "Dashboard individual").
- `IQL` (nunca "Dashboard IQL" ou "Índice de Qualidade da Liderança" em código).
- `Clima e Engajamento` (nunca "Dashboard de Clima").

### 14.3 Regra canônica de execução da verificação

- Verificação executada por grep em cada artefato, com escopo canônico específico:
  - Grep no repositório de código-fonte por padrão fixo de cada termo — respeitando o caractere especial em `/super-admin/desbloqueios` como rota canônica (padrão a excluir).
  - Grep nas migrations SQL.
  - Grep nos templates de e-mail (`.hbs`) e nos textos renderizados.
  - Grep na base de mockups HTML.
  - Grep nos PDFs gerados via extração de texto.
  - Grep nas planilhas exportadas via extração de conteúdo.
  - Grep nos logs estruturados (JSON).
  - Grep no seed script.
  - Grep nas configurações de ambiente (`.env.example` e afins).
- Todas as verificações canônicas registradas em subdiretório `evidencias_grep/` do artefato de retorno.

### 14.4 Exceção canônica única

- Padrão `/super-admin/desbloqueios` é rota canônica válida — a verificação canônica de "`/desbloqueios` isolado" exclui o caractere anterior `-` seguido do padrão para evitar falso positivo.

---

## 15. Checklist de conformidade do DOC 07

Insumo da auditoria final de arquiteto. Verificar antes da entrega deste DOC ao pacote final ao Manus.

### 15.1 Cobertura das 6 camadas

- [ ] Camada 1 (Dados) — checklist consolidado em §4 com 10 subseções canônicas cobrindo inventário, núcleo cadastral, desempenho, instrumentos, alertas, exportáveis, LGPD/onboarding, imutabilidade, migrations e evidências.
- [ ] Camada 2 (Autenticação e autorização) — checklist consolidado em §5 com 7 subseções canônicas cobrindo perfis e roteamento, sessão e token, LGPD, `AccessDeniedPage`, matrizes de acesso e PC1, Responsável financeiro e evidências.
- [ ] Camada 3 (Negócio) — checklist consolidado em §6 com 16 subseções canônicas cobrindo motores determinísticos, fechamento mensal, faturamento e RF, Eixo Y e 9-Box, Instrumento D e IQL, Clima, Perfil Individual, Radar NR-1, Turnover, Central de Relatórios, M2 v2, padrão 100-500, cadastros, motor de ciclos automáticos, routers e evidências.
- [ ] Camada 4 (IA) — checklist consolidado em §7 com 13 subseções canônicas cobrindo princípio inviolável, padrões, Perfil Individual, Chat IA, Diagnóstico IA, Relatório executivo, system prompts, governança, falha da API, handoffs com DOC 03, handoffs com DOC 05, wrapper e evidências.
- [ ] Camada 5 (UI) — checklist consolidado em §8 com 15 subseções canônicas cobrindo design system, menus, painéis, portal, formulários, componentes com IA, Central, cadastros, rotas administrativas, componentes de erro, validações, perímetro mobile, coexistência botão+filtro, mockups como referência e evidências.
- [ ] Camada 6 (Operações) — checklist consolidado em §9 com 21 subseções canônicas cobrindo absorção da §12 do RF, 17 tipos, cycleSchedule, templates, Change log, cron do Chat IA, pipeline anti-ruído, sino, e-mails, fluxo P11, motor de ciclos, jobs cron, LGPD, log de acesso individual, onboarding, exportáveis, turnover, mensagens literais, snapshots, observabilidade e evidências.

### 15.2 Cenários canônicos de aceitação

- [ ] Todos os 69 cenários canônicos nomeados em §10 com código, contexto, passos, evidência esperada e critério binário.
- [ ] Distribuição por prefixo canônico: 9 cenários AU + 7 cenários AC + 10 cenários NE + 5 cenários IA + 8 cenários UI + 25 cenários OP + 5 cenários TR = 69 cenários.

### 15.3 Template canônico `RETORNO_ROIP_MVP.md`

- [ ] Template canônico literal presente em §12 com 16 seções canônicas na ordem fixa.
- [ ] Regras canônicas invioláveis do template presentes em §11 com 10 subseções canônicas.
- [ ] Frases padrão canônicas do template preservadas: *"Nenhum desvio identificado. Especificação implementada integralmente."*, *"Nenhum risco adicional identificado além dos já mapeados nos DOCs 01-06."*, *"Sem pontos especiais para auditoria além dos itens do §9."*.

### 15.4 Política canônica de correção pós-entrega

- [ ] Política canônica de correção pós-entrega declarada em §13.
- [ ] Via única sem retorno estruturado ao ciclo canônico da Rota B explicitada.
- [ ] Fluxo canônico de uso do template pós-entrega declarado em 6 passos.
- [ ] Ausência canônica de handshake automático de aprovação, auditoria automática por Claude e retorno automático ao Manus explicitada.

### 15.5 Termos e nomes proibidos consolidados

- [ ] Lista canônica consolidada em §14 sem duplicação em relação aos DOCs 02, 05 e 06.
- [ ] Exceção canônica única (`/super-admin/desbloqueios`) explicitada.

### 15.6 Aplicação das sinalizações S484-S492

- [ ] S484 — DOC 07 usa exclusivamente a redação canônica final sobre `accessTokens` como fonte única e `passwordSet` como marcador.
- [ ] S485 — DOC 07 valida enum canônico de 17 valores da composição final; nenhuma referência às contagens superadas.
- [ ] S486 — DOC 07 valida ausência canônica de `emailSettings` (não remoção histórica).
- [ ] S487 — DOC 07 valida ausência absoluta dos termos proibidos do Radar NR-1 e das nomenclaturas superadas.
- [ ] S488 — DOC 07 valida fluxo canônico do H3 via `accessTokens`; nenhuma referência a `emailChangeRequests` ou a job `cleanupExpiredEmailChangeRequests`.
- [ ] S489 — DOC 07 adota exclusivamente os termos proibidos consolidados dos DOCs 02/05/06; sem redação ambígua sobre "Dashboard".
- [ ] S490 — DOC 07 exclui validação sobre `IDEIAS_FASES_FUTURAS.md` (arquivo formalmente superado, não existe na base).
- [ ] S491 — DOC 07 remove validação de rota legada `/performance/:employeeId` (rota não existe no pacote canônico).
- [ ] S492 — DOC 07 valida rotas canônicas da Fase 4 diretamente e rotas stub como stubs simples sem referência a número de fase.

### 15.7 Nenhum resquício de inconsistência residual

- [ ] Nenhuma referência canônica a `emailSettings`, `emailChangeRequests`, `nr1PGRDocuments`, `cadenciaCOPSOQ`, `firstAccessCompleted`, `resetPasswordTokenHash` como coisas que existiram e foram removidas — todas tratadas como coisas que nunca existiram em base viva.
- [ ] Nenhuma referência a contagem "15" ou "19" para o enum `tipo` — apenas 17 valores canônicos.
- [ ] Nenhuma referência a "Painel principal" — apenas "Painel de controle".
- [ ] Nenhuma referência a "Pesquisa NR-1", "PGR", "Programa de Gerenciamento de Riscos Psicossociais" em qualquer contexto do DOC 07.
- [ ] Nenhuma referência a `IDEIAS_FASES_FUTURAS.md` como artefato consultável.
- [ ] Nenhuma referência a `/performance/:employeeId` como rota canônica.
- [ ] Nenhuma referência a "Disponível a partir da Fase 4" como mensagem de stub.

### 15.8 Regra editorial da Rota B aplicada

- [ ] Títulos com primeira letra maiúscula apenas.
- [ ] Sem tabelas salvo quando estritamente necessárias para matrizes fechadas.
- [ ] Português do Brasil executivo.
- [ ] Mensagens canônicas literais preservadas palavra por palavra.
- [ ] Nenhum elogio a decisões passadas.
- [ ] Nenhum preenchimento vazio.

---

*Fim do DOC 07 — VALIDACAO_ACEITACAO.md. Fonte única canônica de validação pós-deploy, critérios de aceitação, template de retorno do Manus e política de correção pós-entrega do pacote ROIP APP. Documento integral e completo — nunca aplicar como delta.*
