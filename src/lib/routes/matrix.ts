// ROIP APP 9BOX — matriz canonica rotas x perfis (ME-023, S034).
//
// Consolida DOC 02 §10 (§10.1 auth, §10.2 admin comuns, §10.3 paineis,
// §10.4 operacionais e instrumentos, §10.5 Fase 8, §10.6 Prontidao MVP,
// §10.7 Exportaveis, §10.8 Revisao RF, §10.9 cadastro) em fonte unica
// tipada consumida pelo `middleware.ts` (raiz do repo — S038).
//
// Convencao canonica (§10):
//   'allow'  — perfil acessa (equivalente ao "✓" da matriz);
//   'deny'   — bloqueio explicito: `NextResponse.rewrite` para
//              `/access-denied?rota=<pattern>` (S033) com msg canonica de
//              §9 resolvida em `accessDeniedMessages.ts`;
//   'redirect_super_admin' — canonico §13.7: toast âmbar
//              "Rota indisponivel para Super Admin." + redirect para
//              `/super-admin`. Aplicavel apenas ao Super Admin em rotas
//              onde a matriz marca "—" para ele. Emitido pelo middleware
//              via query param `?toast=super_admin_route_unavailable`.
//   'redirect_painel' — canonico §2.3 precedencia: Super Admin em rotas
//              /painel-rh, /painel-clevel, /painel-lider recebe redirect
//              silencioso para `/super-admin`. RH-Lider em /painel-lider
//              recebe redirect para `/painel-rh`. Sem toast, sem
//              AccessDeniedPage (redirect canonico, nao bloqueio).
//
// PC1a-f (§11) NAO vive nesta matriz — sao filtros por alvo (C-level como
// titular) aplicados em resolvers tRPC (S035, ME-030+). O middleware
// Next opera apenas por role da rota; PC1f (`/dashboard-individual/:id`
// alvo C-level) e enforcement do resolver `panels.getIndividualDashboard`.
//
// §12 (permissoes por acao administrativa) tampouco vive aqui — e
// enforcement em cada procedure de mutation nas MEs de motor (B3+).
//
// S039 canoniza msgs derivadas para as 4 rotas de §10.9 que a §9 nao
// cobria literalmente. Registradas em `accessDeniedMessages.ts`.

import type { PlatformRole } from '../../server/auth/jwt';

/**
 * Roles resolvidas pelo middleware Next: os 4 valores de `PlatformRole`
 * (RH, RH-Lider, C-level, Lider — DOC 02 §2.2) mais 'super_admin'
 * (regime §5.1 sem `exp`). Union completa das identidades autenticadas
 * na plataforma administrativa.
 */
export type GuardRole = PlatformRole | 'super_admin';

export const ALL_GUARD_ROLES: readonly GuardRole[] = [
  'super_admin',
  'rh',
  'rh_lider',
  'clevel',
  'lider',
] as const;

/**
 * Decisao do middleware para uma (rota, role) — 4 valores canonicos.
 * Ver docblock do modulo.
 */
export type RouteDecision = 'allow' | 'deny' | 'redirect_super_admin' | 'redirect_painel';

/**
 * Regra de uma rota administrativa: pattern literal ou parametrizado
 * (`:` prefixado) + decisao por role. Rotas nao presentes na matriz
 * caem no comportamento default do middleware:
 *   - se prefixadas por `/api/portal` ou `/access-denied` → publicas;
 *   - se prefixadas por `/`, `/login-super-admin`,
 *     `/reset-password`, `/first-access`, `/confirmar-alteracao-email`,
 *     `/colaborador` → publicas (§10.1);
 *   - restante → 404 canonico §13.9 (nao guardado pela matriz).
 */
export interface RouteRule {
  /**
   * Pattern literal (ex. `/painel-rh`) ou com placeholders `:param`
   * (ex. `/dashboard-individual/:id`). Prefixos `/super-admin/empresa/:id`
   * cobrem qualquer sub-rota via casamento de prefixo (§10.3 nota).
   */
  pattern: string;
  /**
   * Casa por prefixo (true) ou por igualdade estrita ao pattern
   * placeholder-normalizado (false, default). Prefixo e usado para
   * super-admin/empresa/:id que casa `.../colaborador/novo`,
   * `.../historico` etc.
   */
  matchPrefix?: boolean;
  /** Referencia canonica para rastreabilidade nos testes. */
  canonicalRef: string;
  /** Decisao por role. Roles ausentes caem em `deny` implicito. */
  byRole: Partial<Record<GuardRole, RouteDecision>>;
}

/**
 * Matriz canonica §10 DOC 02. Ordem preservada da fonte canonica para
 * facilitar auditoria por linha × secao. Cada entrada leva `canonicalRef`
 * para o teste literal cruzar contra o canonico.
 *
 * Rotas publicas de §10.1 (login, portal, links por token) NAO entram
 * aqui: o middleware trata prefixos publicos antes de consultar a matriz
 * (S038 passo 1).
 */
export const ROUTE_MATRIX: readonly RouteRule[] = [
  // §10.2 rotas administrativas comuns ------------------------------------
  {
    pattern: '/meus-dados',
    canonicalRef: '§10.2',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/alterar-senha',
    canonicalRef: '§10.2',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/alterar-email',
    canonicalRef: '§10.2 + §9.5',
    byRole: {
      super_admin: 'allow',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // §10.3 paineis de controle --------------------------------------------
  {
    pattern: '/super-admin',
    canonicalRef: '§10.3 + §9.1',
    byRole: {
      super_admin: 'allow',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    // Casa `/super-admin/empresa/[id]` e todas as sub-rotas
    // (`.../colaborador/novo`, `.../historico`, `.../logs/…`).
    pattern: '/super-admin/empresa/',
    matchPrefix: true,
    canonicalRef: '§10.3 + §9.1',
    byRole: {
      super_admin: 'allow',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    pattern: '/painel-rh',
    canonicalRef: '§10.3 + §9.2',
    byRole: {
      super_admin: 'redirect_painel', // §2.3 precedencia — Bruno → /super-admin
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    pattern: '/painel-clevel',
    canonicalRef: '§10.3 + §9.3',
    byRole: {
      super_admin: 'redirect_painel',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'allow',
      lider: 'deny',
    },
  },
  {
    pattern: '/painel-lider',
    canonicalRef: '§10.3 + §9.4',
    byRole: {
      super_admin: 'redirect_painel',
      rh: 'deny', // §9.4 (RH puro) — bloqueia
      rh_lider: 'redirect_painel', // §2.3 precedencia — vai para /painel-rh
      clevel: 'deny',
      lider: 'allow',
    },
  },

  // §10.4 rotas operacionais e de instrumentos ---------------------------
  {
    pattern: '/todos-os-colaboradores',
    canonicalRef: '§10.4',
    byRole: {
      // Bruno acessa via /super-admin/empresa/[id]/todos-os-colaboradores
      // (prefixo capturado acima); rota base sem contexto de empresa e
      // redirect_painel para ele.
      super_admin: 'redirect_painel',
      rh: 'allow',
      rh_lider: 'allow',
      // C-level `acessoTotal = true` acessa; C-level `acessoTotal = false`
      // e Lideres usam /minha-equipe e /cadeia-indireta. Middleware Next
      // permite `clevel` na rota; enforcement fino por `acessoTotal` fica
      // no resolver (S035).
      clevel: 'allow',
      lider: 'deny',
    },
  },
  {
    pattern: '/minha-equipe',
    canonicalRef: '§10.4',
    byRole: {
      super_admin: 'redirect_super_admin', // §13.7 — rota indisponivel para Super Admin
      rh: 'deny', // RH puro sem liderados
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/cadeia-indireta',
    canonicalRef: '§10.4',
    byRole: {
      super_admin: 'redirect_super_admin',
      rh: 'deny',
      // Cenario 1 (sem cadeia descendente) na pratica devolve conjunto
      // vazio; o middleware permite role `rh_lider` e `lider` (o resolver
      // filtra por escopo).
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/pendencias-portal',
    canonicalRef: '§10.4 + §9.9',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    // /dashboard-individual/:id — PC1f (§9.10) exige checar se `:id` e
    // C-level; consulta ao banco fica no resolver `panels.getIndividualDashboard`
    // (S035). O middleware permite role `rh`/`rh_lider` e o resolver
    // devolve AccessDeniedPage §9.10 se o alvo for C-level.
    pattern: '/dashboard-individual/:id',
    canonicalRef: '§10.4 + §9.10',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow', // resolver filtra por escopo
      lider: 'allow',
    },
  },
  {
    // /faturamento-mensal — `RF` na matriz canonica: guarda por
    // atributo `isResponsavelFinanceiro = true`, nao por role. O
    // middleware Next apenas permite as roles administrativas; a
    // verificacao de RF vive no resolver `faturamento.*` (S035). Se
    // acessado sem RF, retorno canonico §9.11.
    pattern: '/faturamento-mensal',
    canonicalRef: '§10.4 + §9.11',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/dados-mensais/meus-liderados',
    canonicalRef: '§10.4',
    byRole: {
      super_admin: 'redirect_super_admin',
      // RH puro (sem liderados) recebe conjunto vazio via resolver;
      // rotulo canonico "✓ (RH-lider)" e modificador contextual (E2 —
      // §10.4). Role `rh` permitida na URL.
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/dados-mensais',
    canonicalRef: '§10.4',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    // Organograma — PC1b (§11.2) e enforcement de renderizacao no
    // frontend (nos de C-level nao clicaveis para RH). Middleware Next
    // permite acesso a URL para todos os perfis autorizados.
    pattern: '/organograma',
    canonicalRef: '§10.4 + §11.2 PC1b',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/nr1',
    canonicalRef: '§10.4',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // §10.5 Fase 8 ---------------------------------------------------------
  {
    pattern: '/cycle-management',
    canonicalRef: '§10.5 + §9.6',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    pattern: '/notificacoes',
    canonicalRef: '§10.5 + §9.7',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    pattern: '/super-admin/desbloqueios',
    canonicalRef: '§10.5 + §9.8',
    byRole: {
      super_admin: 'allow',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // §10.6 Prontidao MVP --------------------------------------------------
  {
    pattern: '/onboarding-lideres',
    canonicalRef: '§10.6 + §9.13',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    pattern: '/logs/acesso-individual',
    canonicalRef: '§10.6 + §9.14',
    byRole: {
      super_admin: 'redirect_painel', // Bruno usa a rota /super-admin/logs/…
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },
  {
    pattern: '/super-admin/logs/acesso-individual',
    canonicalRef: '§10.6 + §9.14',
    byRole: {
      super_admin: 'allow',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // §10.7 Exportaveis ----------------------------------------------------
  {
    pattern: '/central-relatorios',
    canonicalRef: '§10.7 + §9.15',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // §10.8 Revisao Responsavel financeiro ---------------------------------
  {
    pattern: '/super-admin/logs/responsavel-financeiro',
    canonicalRef: '§10.8 + §9.12',
    byRole: {
      super_admin: 'allow',
      rh: 'deny',
      rh_lider: 'deny',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // §10.9 Rotas de cadastro (S039 — msgs derivadas) ---------------------
  {
    pattern: '/colaborador/novo',
    canonicalRef: '§10.9 + S039',
    byRole: {
      super_admin: 'redirect_painel', // Bruno usa variante /super-admin/…
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'deny',
      lider: 'deny',
    },
  },

  // Rotas placeholder Fase 4 (§9.16) — stub para todos os perfis
  // administrativos exceto colaborador puro (que nao autentica na
  // plataforma admin). Sem AccessDeniedPage — pagina renderiza stub
  // canonico "Disponivel a partir da Fase 4.".
  {
    pattern: '/dashboard-9box',
    canonicalRef: '§9.16',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/dashboard-departamento',
    canonicalRef: '§9.16',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
  {
    pattern: '/dashboard-empresa',
    canonicalRef: '§9.16',
    byRole: {
      super_admin: 'allow',
      rh: 'allow',
      rh_lider: 'allow',
      clevel: 'allow',
      lider: 'allow',
    },
  },
] as const;

/**
 * Prefixos de rota publica: passam pelo middleware sem qualquer
 * verificacao de role (§10.1 auth e portal + rota interna do
 * AccessDeniedPage). Fonte unica consumida pelo `middleware.ts`.
 */
export const PUBLIC_ROUTE_PREFIXES: readonly string[] = [
  '/api/', // route handlers e adapter tRPC — auth propria por procedure
  '/access-denied', // rewrite alvo (S033)
  '/login-super-admin',
  '/reset-password',
  '/first-access',
  '/confirmar-alteracao-email',
  '/colaborador', // portal via sessionStorage (§5.3)
  '/_next/', // assets do build Next
  '/favicon.ico',
] as const;

/**
 * Resolucao canonica de pattern → RouteRule: casa primeiro por
 * `matchPrefix` (mais especifico ganha, ordem de declaracao decide) e
 * depois por igualdade normalizada (segmentos `:param` casam qualquer
 * valor nao vazio sem `/`).
 */
export function findRouteRule(pathname: string): RouteRule | null {
  // 1) Prefix rules primeiro (S038 ordem).
  for (const rule of ROUTE_MATRIX) {
    if (rule.matchPrefix === true && pathname.startsWith(rule.pattern)) {
      return rule;
    }
  }
  // 2) Match exato ou por placeholder.
  for (const rule of ROUTE_MATRIX) {
    if (rule.matchPrefix === true) continue;
    if (matchesPattern(pathname, rule.pattern)) {
      return rule;
    }
  }
  return null;
}

/**
 * Verifica se `pathname` casa `pattern` com placeholders `:param`. Cada
 * `:param` casa exatamente um segmento nao vazio sem `/`. Sem regex
 * fabricado dentro do middleware (edge runtime): comparacao segmento a
 * segmento.
 */
function matchesPattern(pathname: string, pattern: string): boolean {
  const patSegs = pattern.split('/');
  const pathSegs = pathname.split('/');
  if (patSegs.length !== pathSegs.length) return false;
  for (let i = 0; i < patSegs.length; i += 1) {
    const patSeg = patSegs[i]!;
    const pathSeg = pathSegs[i]!;
    if (patSeg.startsWith(':')) {
      if (pathSeg.length === 0) return false;
      continue;
    }
    if (patSeg !== pathSeg) return false;
  }
  return true;
}

/**
 * Verifica se um prefixo publico casa o pathname. Usado pelo middleware
 * antes de consultar a matriz. `/` (login unificado) e tratado como
 * caso exato porque `startsWith('/')` casa qualquer path.
 */
export function isPublicRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  for (const prefix of PUBLIC_ROUTE_PREFIXES) {
    if (pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
