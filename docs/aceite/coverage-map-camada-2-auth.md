# ROIP APP 9BOX — Coverage Map Camada 2 (Autenticação e autorização)

**Bit-exact ao DOC 07 §5.1..§5.7.** Regime N2 Opção C aprovada em
ME-064. Baseline HEAD `86c0c73...` + CC055 + `check-forbidden-terms.sh`
estendido §14.

---

## §5.1 Perfis e roteamento (4 items)

**Fontes canônicas de cobertura:**

- `src/lib/routes/matrix.ts` — matriz canônica com 32 rotas × 5
  perfis (bit-exact §10 DOC 02).
- `tests/integration/auth-loginPlatform.test.ts` — precedência
  canônica `isRH=true` prevalece; enum `role` do JWT com 5 valores
  bit-exact (`super_admin`, `rh`, `rh_lider`, `clevel`, `lider`);
  ausência de `colaborador`.
- `tests/integration/auth-loginSuperAdmin.test.ts` — roteamento
  `/login-super-admin` sempre resulta em `role: 'super_admin'`.
- `tests/integration/middleware-guard.test.ts` — middleware
  server-side como barreira canônica em rotas administrativas.
- `tests/unit/auth-jwt.test.ts` — decoding canônico do JWT.

**Cobertura por item:**

- Enum `role` 5 valores exatos — `auth-loginPlatform.test.ts` +
  `auth-jwt.test.ts` + `matrix.ts`.
- Regra de precedência canônica `isRH → clevel → isLider → fallback`
  — `auth-loginPlatform.test.ts`.
- `/login-super-admin` → `role: 'super_admin'` —
  `auth-loginSuperAdmin.test.ts`.
- Middleware server-side barreira canônica —
  `middleware-guard.test.ts` + `middleware.ts` (raiz).

**Status:** COVERED bit-exact — 4/4.

---

## §5.2 Sessão e token (12 items)

**Fontes canônicas de cobertura:**

- `tests/unit/auth-jwt.test.ts` — JWT bit-exact:
  Super Admin sem claim `exp`; demais perfis com `exp: sliding 8h`.
- `tests/integration/auth-loginPlatform.test.ts` +
  `auth-loginSuperAdmin.test.ts` — emissão de JWT canônico.
- `tests/integration/accessTokens.test.ts` — enum `type` 2 valores
  bit-exact (`first_access`, `password_reset`); expiração 7d;
  uso único (`usedAt`); concorrência canônica (1 ativo por
  userType/userId/type).
- `tests/integration/auth-firstAccess.test.ts` — fluxo H2 canônico.
- `tests/integration/auth-forgotPassword.test.ts` +
  `auth-resetPassword.test.ts` — fluxo H1 canônico (7d).
- `tests/integration/auth-requestEmailChange.test.ts` +
  `auth-confirmEmailChange.test.ts` +
  `auth-cancelEmailChange.test.ts` — fluxo H3 canônico via
  `accessTokens` (`type='password_reset'` + metadado JWT interno
  `tipo:'email_change'` + `expiresAt = createdAt + 24h`); sem
  tabela `emailChangeRequests` (validado por
  `check-forbidden-terms.sh` §14).
- `tests/integration/auth-validateToken.test.ts` — mensagem
  canônica exata _"Este link expirou. Solicite um novo."_
  (anti-enumeração canônica).
- `tests/integration/auth-changePassword.test.ts` — invalidação
  canônica de sessão (`/alterar-senha` invalida todas exceto
  atual).
- `tests/unit/serverSession.test.ts` — sessão canônica.
- `tests/integration/middleware-guard.test.ts` — middleware de
  `companies.status = 'inativa'` retornando 403 + `forceLogout`.
- `tests/unit/auth-rateLimit.test.ts` — rate limits canônicos
  bit-exact §5.8 do DOC 02.
- Portal `sessionStorage` — coberto implicitamente por
  `tests/integration/portal-*.test.ts` (7 test files) + spec
  canônico em `src/lib/session/`.

**Cobertura por item:**

- JWT Super Admin sem `exp` — `auth-jwt.test.ts`.
- JWT demais com `exp: sliding 8h` + renovação —
  `auth-jwt.test.ts` + `authLookup.test.ts`.
- Portal `sessionStorage` — `portal-*.test.ts` (7 test files).
- `accessTokens` enum 2 valores — `accessTokens.test.ts`.
- Sem colunas denormalizadas — `check-forbidden-terms.sh`.
- Sem tabela `emailChangeRequests`; fluxo H3 canônico —
  `auth-requestEmailChange/confirmEmailChange/cancelEmailChange`.
- Expiração 7d/24h — `accessTokens.test.ts`.
- Uso único (`usedAt`) — `accessTokens.test.ts` + `auth-*`.
- Concorrência canônica (1 ativo por triple) —
  `accessTokens.test.ts`.
- Invalidação canônica de sessão — `auth-changePassword.test.ts`
  - `auth-confirmEmailChange.test.ts` + `auth-resetPassword.test.ts`.
- Middleware `companies.status='inativa'` retorna 403
  `forceLogout` — `middleware-guard.test.ts`.
- Rate limits canônicos DOC 02 §5.8 — `auth-rateLimit.test.ts`.

**Status:** COVERED bit-exact — 12/12.

---

## §5.3 Consentimento LGPD (7 items)

**Fontes canônicas de cobertura:**

- `tests/integration/lgpdConsents.test.ts` — constraints canônicos.
- `tests/integration/lgpd-portability-service.test.ts` +
  `lgpd-portability-route.test.ts` — service canônico + route
  handler H1/H2 do portal.
- `tests/integration/portal-endpoints.test.ts` — gate LGPD aplicado
  exclusivamente ao portal `/colaborador`.
- `tests/integration/middleware-guard.test.ts` — gate LGPD NÃO
  aplica-se ao Super Admin nem a rotas administrativas.
- `LGPD_TERM_VERSION` env-var — presente em `.env.example`
  (fonte única canônica; sem tabela nova; sem versão por empresa);
  validado em `lgpdConsents.test.ts`.
- Texto canônico literal v1.0 — preservado em
  `src/lib/lgpd/termCanonical.ts` (grep) + diff canônico contra
  DOC 02 §7.
- Eyebrows canônicos `"Primeiro acesso"` / `"Termo atualizado"` —
  cobertos por `lgpdConsents.test.ts`.

**Cobertura por item:**

- Gate LGPD portal exclusivo — `portal-endpoints.test.ts`.
- Gate NÃO Super Admin/rotas admin — `middleware-guard.test.ts`.
- `LGPD_TERM_VERSION` fonte única — `.env.example` +
  `lgpdConsents.test.ts`.
- Texto v1.0 preservado — arquivo canônico + diff no template.
- Eyebrows canônicos — `lgpdConsents.test.ts`.
- Aceite gera linha em `lgpdConsents` com `versaoTermoAceita` +
  `aceitoEm=NOW()` — `lgpdConsents.test.ts`.
- Bump reexibe gate sem invalidar sessões — cenário AU.6 (§10.1
  DOC 07) canonicamente executado via `lgpdConsents.test.ts`.

**Status:** COVERED bit-exact — 7/7.

---

## §5.4 `AccessDeniedPage` e mensagens canônicas (6 items)

**Fontes canônicas de cobertura:**

- `tests/unit/accessDeniedMessages.test.ts` — **25 testes**
  cobrindo as 16 mensagens canônicas exatas do DOC 02 §9 +
  variações S434/S437/S438 (Onboarding líderes, Faturamento,
  Logs administrativos RF) bit-exact.
- `tests/integration/middleware-guard.test.ts` — sessão expirada
  redireciona para `/` (não renderiza `AccessDeniedPage`);
  colaborador puro em rota admin redireciona para `/colaborador`;
  Bruno em `/minha-equipe` ou `/cadeia-indireta` redireciona para
  `/super-admin` com toast âmbar canônico literal.
- `tests/integration/me055-error-pages.test.ts` — componente
  `AccessDeniedPage` único e canônico; ausência de "empty state"
  residual em `/pendencias-portal` (D028 aplicada bit-exact).

**Cobertura por item:**

- `AccessDeniedPage` único; sem "empty state" —
  `me055-error-pages.test.ts`.
- 16 mensagens canônicas exatas §9 —
  `accessDeniedMessages.test.ts`.
- Variações S434/S437/S438 preservadas —
  `accessDeniedMessages.test.ts`.
- Sessão expirada → redirect `/` + toast âmbar —
  `middleware-guard.test.ts`.
- Colaborador puro em rota admin → redirect `/colaborador` —
  `middleware-guard.test.ts`.
- Bruno em `/minha-equipe`/`/cadeia-indireta` → redirect
  `/super-admin` com toast literal — `middleware-guard.test.ts`.

**Status:** COVERED bit-exact — 6/6.

---

## §5.5 Matrizes de acesso e PC1 (8 items)

**Fontes canônicas de cobertura:**

- `src/lib/routes/matrix.ts` — matriz canônica 32 rotas × 5 perfis.
- `tests/integration/middleware-guard.test.ts` — cada rota da
  matriz coberta por middleware server-side.
- Rotas canônicas `/super-admin/desbloqueios` (S431) +
  `/cycle-management` (S432) — validadas em
  `middleware-guard.test.ts`; rotas superadas `/desbloqueios`
  isolada e `/gestao-ciclos` proibidas por
  `check-forbidden-terms.sh` §14 (ME-064).
- `tests/integration/me050-integration.test.ts` — PC1a/PC1c/PC1d
  aplicadas bit-exact no domínio de negócio.
- `tests/integration/me056-panels.test.ts` — PC1a (filtro
  `role != 'clevel'` para RH em `/todos-os-colaboradores`); PC1b
  (organograma não clicável para C-level RH); PC1c (agregados
  incluem C-levels normalmente para RH).
- `tests/integration/individualProfile-router.test.ts` — PC1e
  (Perfil Individual C-level bloqueado para RH/RH-Líder com
  mensagem canônica DOC 02 §11.5).
- `tests/integration/nr1-router.test.ts` — PC1d (Radar NR-1
  contadores agregados incluem C-levels + listagens nominais
  omitem C-levels para RH/RH-Líder).
- `tests/integration/dashboard-router.test.ts` — PC1f
  (`/dashboard-individual/:id` para `userType='clevel'` retorna
  `AccessDeniedPage` §9.10).

**Cobertura por item:**

- Matriz unificada 32 rotas × 5 perfis — `matrix.ts` +
  `middleware-guard.test.ts`.
- Rotas canônicas S431/S432 preservadas —
  `middleware-guard.test.ts` + `check-forbidden-terms.sh`.
- PC1a (D030) — `me056-panels.test.ts`.
- PC1b (D031) — `me056-panels.test.ts`.
- PC1c (S413/S447) — `me056-panels.test.ts` +
  `me050-integration.test.ts`.
- PC1d (D032+D033) — `nr1-router.test.ts` +
  `me050-integration.test.ts`.
- PC1e (D034) — `individualProfile-router.test.ts`.
- PC1f (D035) — `dashboard-router.test.ts`.
- Nenhuma superfície aplica PC1 seletivamente —
  DOC 02 §11.7 preservada; validada implícita nas 8 fontes acima.

**Status:** COVERED bit-exact — 8/8.

---

## §5.6 Responsável financeiro (7 items)

**Fontes canônicas de cobertura:**

- `tests/integration/company-router.test.ts` — cardinalidade
  global por empresa = 1 na união `employees` ∪ `cLevelMembers`;
  elegibilidade (`employees` exige `isRH=true` OR `isLider=true`;
  `cLevelMembers` sempre elegível); toggle exclusivo de Bruno.
- `tests/integration/responsavelFinanceiroTransferLog.test.ts` +
  `leadershipTransfer-router.test.ts` — modal canônico de
  transferência com justificativa 100-500.
- `tests/integration/companies.test.ts` — bloqueio canônico de
  inativação/deleção/desmarcação de RH/Líder do titular vigente.
- `tests/integration/revenue-router.test.ts` — matriz de
  permissões `/faturamento-mensal` (RF acessa mês aberto +
  desbloqueado; Bruno acessa também fechado e desbloqueia).
- `src/lib/menu/menuConfig.ts` + `tests/unit/menuConfig.test.ts` —
  item de menu `Faturamento da empresa` condicional a
  `isResponsavelFinanceiro=true`, ícone `DollarSign`, posicionado
  imediatamente acima de `Dados mensais` em RH/Líder/C-level;
  ausente no menu global `/super-admin`.
- `tests/integration/dashboard-router.test.ts` — matriz de
  visualização dos cards financeiros bit-exact (C-level
  `acessoTotal=false` NÃO visualiza ROI/% folha; Líderes NÃO
  visualizam nenhum dos 5 cards).

**Status:** COVERED bit-exact — 7/7.

---

## §5.7 Evidências canônicas exigidas (9 items)

**Fontes canônicas de cobertura:**

- Login por perfil — cobertos pelos 11 test files `auth-*`
  - `authLookup.test.ts`.
- JWT decoded bit-exact — `auth-jwt.test.ts`.
- Renovação sliding 8h — `auth-jwt.test.ts` +
  `authLookup.test.ts`.
- JWT expirado → 401 + toast âmbar — `middleware-guard.test.ts`.
- Grep termos superados — `check-forbidden-terms.sh` §14
  bit-exact zero ocorrências.
- Print do `AccessDeniedPage` em 16 rotas restritas — cobertos
  por `accessDeniedMessages.test.ts` (25 casos).
- Diff termo LGPD — `lgpdConsents.test.ts` + arquivo canônico.
- Print `/todos-os-colaboradores` como RH sem C-level —
  `me056-panels.test.ts` + `employees-router.test.ts`.
- Print organograma como RH — `me056-panels.test.ts`.

**Status:** COVERED bit-exact — 9/9. Evidências reais colada em
`RETORNO_ROIP_MVP_parcial-me064.md` §4.

---

## Consolidação canônica

**Coverage global Camada 2 (Autenticação e autorização):** COVERED
bit-exact.

- §5.1 4/4 + §5.2 12/12 + §5.3 7/7 + §5.4 6/6 + §5.5 8/8 +
  §5.6 7/7 + §5.7 9/9 = **53 itens canonicamente cobertos**.

**Gaps canonicamente identificados na Camada 2:** ZERO.

**Testes de gap-closing requeridos em ME-064 para Camada 2:**
NENHUM.

**CCs canônicas registradas em Camada 2:** nenhuma nova.

**Assinatura canônica:** ME-064 Camada 2 bit-exact ao DOC 07 §5
contra clone público independente HEAD `86c0c73...`.
