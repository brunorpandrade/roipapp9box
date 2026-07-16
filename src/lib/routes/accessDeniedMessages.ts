/* eslint-disable @stylistic/max-len -- strings canonicas literais (§9, §11.5, S039) preservadas em linha unica para auditoria */
// ROIP APP 9BOX — mensagens canonicas de `AccessDeniedPage` (ME-023).
//
// Fonte unica das mensagens literais canonicas exibidas pela pagina
// `/access-denied` (S033: rewrite server-side preservando URL original).
// Consumido por `src/app/access-denied/page.tsx` via query param
// `?rota=<pattern>` publicado pelo middleware.
//
// Composicao canonica (§14.4 ponto 24):
//   - 16 mensagens de §9 DOC 02 (§9.1..§9.13, §9.14 duas variantes,
//     §9.15). Ver `messagesRef` de cada entrada.
//   - 1 mensagem canonica adicional em §11.5 (Perfil Individual de
//     C-level — bloqueio PC1e derivado do DOC 05 §Perfil Individual e
//     alinhado ao template §8.1).
//   - 3 mensagens derivadas por S039 (§10.9): rotas de cadastro que a
//     §9 nao cobria literalmente. Derivadas seguindo o template canonico
//     §8.1 (identico ao mecanismo de S434/S437/S438).
//
// Todas as mensagens sao literais — sem interpolacao, sem parafrase,
// sem alteracao de palavra, pontuacao ou nomenclatura (§9, §14.4).
// Alteracao aqui e violacao canonica — verificada por
// `check-forbidden-terms.sh` e por `tests/unit/accessDeniedMessages.test.ts`.

/** Template canonico §8.1 (referencia — nao usado para interpolacao runtime). */
export const ACCESS_DENIED_TEMPLATE_CANONICAL: string =
  'Voce nao tem permissao para acessar [Nome da rota]. Este espaco e restrito ao ' +
  '[Perfis autorizados]. Se acredita que isso e um erro, contate o Super Admin.';

/** Titulo canonico unico (§8.1). Sem interpolacao, sem variacao. */
export const ACCESS_DENIED_TITLE = 'Acesso negado.' as const;

/**
 * Estrutura de uma entrada canonica:
 *   - `key`: identificador estavel (usado no query param `?rota=`);
 *   - `message`: texto literal canonico (§9 ou derivado por S039);
 *   - `canonicalRef`: origem para rastreabilidade nos testes.
 */
export interface AccessDeniedMessage {
  readonly key: string;
  readonly message: string;
  readonly canonicalRef: string;
}

// Nao ha reticencias unicode nesta constante — os textos abaixo sao
// grafias literais canonicas do DOC 02. `check-forbidden-terms.sh`
// (RV-14) valida por linha.

/**
 * §9.1 `/super-admin` — Perfis que recebem: RH, RH-Lider, C-level,
 * Lider autenticados na plataforma administrativa.
 */
export const MSG_SUPER_ADMIN: AccessDeniedMessage = {
  key: '/super-admin',
  message:
    'Você não tem permissão para acessar Painel Super Admin. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.1',
};

/** §9.2 `/painel-rh` — Perfis que recebem: C-level, Lider. */
export const MSG_PAINEL_RH: AccessDeniedMessage = {
  key: '/painel-rh',
  message:
    'Você não tem permissão para acessar Painel RH. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.2',
};

/** §9.3 `/painel-clevel` — Perfis que recebem: RH, RH-Lider, Lider. */
export const MSG_PAINEL_CLEVEL: AccessDeniedMessage = {
  key: '/painel-clevel',
  message:
    'Você não tem permissão para acessar Painel C-level. Este espaço é restrito ao C-level e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.3',
};

/** §9.4 `/painel-lider` — Perfis que recebem: RH puro, C-level. */
export const MSG_PAINEL_LIDER: AccessDeniedMessage = {
  key: '/painel-lider',
  message:
    'Você não tem permissão para acessar Painel Líder. Este espaço é restrito ao Líder e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.4',
};

/**
 * §9.5 `/alterar-email` — Perfis que recebem: RH, RH-Lider, C-level,
 * Lider. Excecao de tail canonica: rota do proprio Super Admin ⇒
 * "contate o RH da sua empresa." (§8.1 excecao).
 */
export const MSG_ALTERAR_EMAIL: AccessDeniedMessage = {
  key: '/alterar-email',
  message:
    'Você não tem permissão para acessar Alterar e-mail. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o RH da sua empresa.',
  canonicalRef: 'DOC 02 §9.5',
};

/** §9.6 `/cycle-management` — Perfis que recebem: C-level, Lider. */
export const MSG_CYCLE_MANAGEMENT: AccessDeniedMessage = {
  key: '/cycle-management',
  message:
    'Você não tem permissão para acessar Gestão de ciclos. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.6',
};

/** §9.7 `/notificacoes` — Perfis que recebem: C-level, Lider. */
export const MSG_NOTIFICACOES: AccessDeniedMessage = {
  key: '/notificacoes',
  message:
    'Você não tem permissão para acessar Notificações. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.7',
};

/**
 * §9.8 `/super-admin/desbloqueios` — Perfis que recebem: RH, RH-Lider,
 * C-level, Lider. Tail canonico distinto: "contate diretamente o
 * Super Admin." (nao "contate o Super Admin.").
 */
export const MSG_SUPER_ADMIN_DESBLOQUEIOS: AccessDeniedMessage = {
  key: '/super-admin/desbloqueios',
  message:
    'Você não tem permissão para acessar Desbloqueios. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate diretamente o Super Admin.',
  canonicalRef: 'DOC 02 §9.8',
};

/** §9.9 `/pendencias-portal` — Perfis que recebem: C-level, Lider (D028). */
export const MSG_PENDENCIAS_PORTAL: AccessDeniedMessage = {
  key: '/pendencias-portal',
  message:
    'Você não tem permissão para acessar Pendências no portal. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.9',
};

/**
 * §9.10 `/dashboard-individual/:colaboradorId` para colaboradorId de
 * C-level (PC1f — D035). Perfis que recebem: RH, RH-Lider. Middleware
 * Next permite a URL para role `rh`/`rh_lider` (S035); a decisao final
 * de bloqueio ocorre no resolver que conhece o alvo. O texto canonico
 * abaixo e o retornado pelo resolver quando o alvo e C-level.
 */
export const MSG_DASHBOARD_INDIVIDUAL_CLEVEL: AccessDeniedMessage = {
  key: '/dashboard-individual/:id',
  message:
    'Você não tem permissão para acessar o dashboard individual deste colaborador. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.10',
};

/**
 * §9.11 `/faturamento-mensal` — perfis sem `isResponsavelFinanceiro`.
 * Derivacao canonica S437 preservada literalmente.
 */
export const MSG_FATURAMENTO_MENSAL: AccessDeniedMessage = {
  key: '/faturamento-mensal',
  message:
    'Você não tem permissão para acessar Faturamento da empresa. Este espaço é restrito ao Responsável financeiro e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.11 (S437)',
};

/**
 * §9.12 `/super-admin/logs/responsavel-financeiro`. Derivacao canonica
 * S438 preservada literalmente.
 */
export const MSG_SUPER_ADMIN_LOGS_RF: AccessDeniedMessage = {
  key: '/super-admin/logs/responsavel-financeiro',
  message:
    'Você não tem permissão para acessar Logs administrativos. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.12 (S438)',
};

/**
 * §9.13 `/onboarding-lideres` — Perfis que recebem: C-level, Lider.
 * Derivacao canonica S434 preservada literalmente.
 */
export const MSG_ONBOARDING_LIDERES: AccessDeniedMessage = {
  key: '/onboarding-lideres',
  message:
    'Você não tem permissão para acessar Onboarding de líderes. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.13 (S434)',
};

/** §9.14a `/logs/acesso-individual` (RH) — Perfis que recebem: C-level, Lider. */
export const MSG_LOGS_ACESSO_INDIVIDUAL: AccessDeniedMessage = {
  key: '/logs/acesso-individual',
  message:
    'Você não tem permissão para acessar Log de acesso individual. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.14 (variante RH)',
};

/**
 * §9.14b `/super-admin/logs/acesso-individual` (Bruno) — Perfis que
 * recebem: RH, RH-Lider, C-level, Lider.
 */
export const MSG_SUPER_ADMIN_LOGS_ACESSO_INDIVIDUAL: AccessDeniedMessage = {
  key: '/super-admin/logs/acesso-individual',
  message:
    'Você não tem permissão para acessar Log de acesso individual (Super Admin). Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.14 (variante Super Admin)',
};

/**
 * §9.15 `/central-relatorios` (Central de Relatorios e Exportacoes —
 * Fase Exportaveis). Perfis que recebem: C-level, Lider.
 */
export const MSG_CENTRAL_RELATORIOS: AccessDeniedMessage = {
  key: '/central-relatorios',
  message:
    'Você não tem permissão para acessar Relatórios e exportações. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §9.15',
};

/**
 * §11.5 Perfil Individual de C-level (PC1e — D034). Fonte canonica:
 * DOC 02 §11.5. Texto literal preservado. Consumido pelo resolver
 * `individualProfile.*` (ME-030+), nao pelo middleware Next.
 */
export const MSG_PERFIL_INDIVIDUAL_CLEVEL: AccessDeniedMessage = {
  key: '/perfil-individual/clevel/:id',
  message:
    'Você não tem permissão para acessar o Perfil Individual deste colaborador. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §11.5',
};

// S039 — Mensagens derivadas para §10.9 (rotas de cadastro) --------------
// Rotas com `✗` na matriz §10.9 sem referencia a §9.X literal. Derivadas
// aqui pelo mesmo mecanismo canonico usado para S434/S437/S438: templar
// §8.1 preservado, contexto correto por rota. Registradas como S039.

/**
 * S039a — `/colaborador/novo` para C-level e Lider. Rota canonica de
 * cadastro de colaborador, restrita a RH e Super Admin (§10.9).
 */
export const MSG_COLABORADOR_NOVO: AccessDeniedMessage = {
  key: '/colaborador/novo',
  message:
    'Você não tem permissão para acessar Cadastro de colaborador. Este espaço é restrito ao RH e ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §10.9 (S039a)',
};

/**
 * S039b — Cadastro/edicao de C-level (rotas exclusivas de Bruno, D039).
 * Aplicavel a todos os perfis administrativos exceto Super Admin. O
 * enforcement no middleware Next e por prefixo `/super-admin/empresa/`
 * (matriz §10.3); esta entrada e consumida por resolvers no Bloco B3+
 * que expuserem rotas de dominio de C-level fora do prefixo Bruno.
 */
export const MSG_CLEVEL_CADASTRO: AccessDeniedMessage = {
  key: '/clevel/novo',
  message:
    'Você não tem permissão para acessar Cadastro de C-level. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §10.9 (S039b)',
};

/**
 * S039c — Cadastro/edicao de empresa (aba Parametros gerais e aba
 * Familias de funcao). Restrito a Bruno via matriz §12.
 */
export const MSG_EMPRESA_CADASTRO: AccessDeniedMessage = {
  key: '/empresa/cadastro',
  message:
    'Você não tem permissão para acessar Cadastro de empresa. Este espaço é restrito ao Super Admin. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'DOC 02 §10.9 (S039c)',
};

/**
 * Fallback canonico usado quando o middleware nao encontra `?rota=` na
 * URL ou o valor nao corresponde a nenhuma chave conhecida — evita
 * pagina em branco. Texto e uma redacao generica do template §8.1 com
 * "esta area" no lugar do nome da rota. Nao substitui o veredito
 * canonico literal — e um veredito de ultimo recurso.
 */
export const MSG_FALLBACK: AccessDeniedMessage = {
  key: '*',
  message:
    'Você não tem permissão para acessar esta área. Se acredita que isso é um erro, contate o Super Admin.',
  canonicalRef: 'derivada (fallback ME-023)',
};

/**
 * Registro canonico de todas as mensagens indexadas por chave. Exposto
 * como constante readonly para `access-denied/page.tsx` consultar via
 * query param e para os testes literais cruzarem contra o canonico.
 */
export const ACCESS_DENIED_MESSAGES: Readonly<Record<string, AccessDeniedMessage>> = {
  [MSG_SUPER_ADMIN.key]: MSG_SUPER_ADMIN,
  [MSG_PAINEL_RH.key]: MSG_PAINEL_RH,
  [MSG_PAINEL_CLEVEL.key]: MSG_PAINEL_CLEVEL,
  [MSG_PAINEL_LIDER.key]: MSG_PAINEL_LIDER,
  [MSG_ALTERAR_EMAIL.key]: MSG_ALTERAR_EMAIL,
  [MSG_CYCLE_MANAGEMENT.key]: MSG_CYCLE_MANAGEMENT,
  [MSG_NOTIFICACOES.key]: MSG_NOTIFICACOES,
  [MSG_SUPER_ADMIN_DESBLOQUEIOS.key]: MSG_SUPER_ADMIN_DESBLOQUEIOS,
  [MSG_PENDENCIAS_PORTAL.key]: MSG_PENDENCIAS_PORTAL,
  [MSG_DASHBOARD_INDIVIDUAL_CLEVEL.key]: MSG_DASHBOARD_INDIVIDUAL_CLEVEL,
  [MSG_FATURAMENTO_MENSAL.key]: MSG_FATURAMENTO_MENSAL,
  [MSG_SUPER_ADMIN_LOGS_RF.key]: MSG_SUPER_ADMIN_LOGS_RF,
  [MSG_ONBOARDING_LIDERES.key]: MSG_ONBOARDING_LIDERES,
  [MSG_LOGS_ACESSO_INDIVIDUAL.key]: MSG_LOGS_ACESSO_INDIVIDUAL,
  [MSG_SUPER_ADMIN_LOGS_ACESSO_INDIVIDUAL.key]: MSG_SUPER_ADMIN_LOGS_ACESSO_INDIVIDUAL,
  [MSG_CENTRAL_RELATORIOS.key]: MSG_CENTRAL_RELATORIOS,
  [MSG_PERFIL_INDIVIDUAL_CLEVEL.key]: MSG_PERFIL_INDIVIDUAL_CLEVEL,
  [MSG_COLABORADOR_NOVO.key]: MSG_COLABORADOR_NOVO,
  [MSG_CLEVEL_CADASTRO.key]: MSG_CLEVEL_CADASTRO,
  [MSG_EMPRESA_CADASTRO.key]: MSG_EMPRESA_CADASTRO,
  [MSG_FALLBACK.key]: MSG_FALLBACK,
};

/**
 * Resolve a mensagem canonica para uma rota (por key) — usada pela
 * `access-denied/page.tsx` server component com o valor de `?rota=`.
 * Fallback canonico se a rota nao for reconhecida.
 */
export function resolveAccessDeniedMessage(
  rotaKey: string | null | undefined,
): AccessDeniedMessage {
  if (typeof rotaKey !== 'string' || rotaKey.length === 0) return MSG_FALLBACK;
  return ACCESS_DENIED_MESSAGES[rotaKey] ?? MSG_FALLBACK;
}
