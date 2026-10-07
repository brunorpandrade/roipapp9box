// ROIP APP 9BOX — mapa canonico pathname -> screenName para breadcrumb
// (ME-B11.1a, §4.3).
//
// Origem canonica: DOC 05 §3.2 (menu dentro-de-empresa — rotulos
// canonicos de cada item) + §4.3 (breadcrumb "Empresa [Nome] > [Tela]").
//
// Mapeia a parte da rota apos `/super-admin/empresa/[id]/*` para o nome
// canonico de tela conforme DOC 05 §3.2 (e aditivos canonizados em MEs
// posteriores). Rotas aninhadas sao resolvidas em ordem de especificidade
// — a primeira entrada que casa define o `screenName`.
//
// **RV-13.** Exports consumidos por:
// - `Breadcrumb` (`src/components/shell/Breadcrumb.tsx`) — resolucao em
//   runtime via `usePathname()`.
// - Testes unitarios (`tests/unit/me-b11-1a-breadcrumb.test.ts`).

/**
 * Par canonico `(pattern, screenName)` para resolucao do nome de tela
 * a partir do pathname.
 */
export interface BreadcrumbEntry {
  readonly pattern: RegExp;
  readonly screenName: string;
}

/**
 * Lista canonica das rotas dentro-de-empresa com seus `screenName`
 * canonicos. Ordem importa: padroes mais especificos (rotas aninhadas)
 * antes de padroes genericos (rotas de primeiro nivel).
 */
export const BREADCRUMB_ENTRIES_DENTRO_EMPRESA: readonly BreadcrumbEntry[] = [
  // Rotas aninhadas — mais especificas primeiro.
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/colaborador\/[^/]+\/desligamento$/,
    screenName: 'Desligamento de colaborador',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/colaborador\/[^/]+\/editar$/,
    screenName: 'Editar colaborador',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/colaborador\/novo$/,
    screenName: 'Novo colaborador',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/clevel\/[^/]+\/editar$/,
    screenName: 'Editar C-level',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/clevel\/novo$/,
    screenName: 'Novo C-level',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/dashboard-recorte\/[^/]+\/[^/]+$/,
    screenName: 'Dashboard de recorte',
  },
  // Rotas de primeiro nivel — ordem alinhada ao menu §3.2.
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/todos-os-colaboradores$/,
    screenName: 'Todos os colaboradores',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/relatorios-e-exportacoes$/,
    screenName: 'Relatórios e exportações',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/dados-mensais$/,
    screenName: 'Dados mensais',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/organograma$/,
    screenName: 'Organograma',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/clevel-rh$/,
    screenName: 'C-level e RH',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/parametros$/,
    screenName: 'Cadastro da empresa',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/nr1$/,
    screenName: 'Radar NR-1',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/pendencias-portal$/,
    screenName: 'Pendências no portal',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/historico$/,
    screenName: 'Histórico da empresa',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/onboarding-lideres$/,
    screenName: 'Onboarding de líderes',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/faturamento-mensal$/,
    screenName: 'Faturamento da empresa',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/dashboard-empresa$/,
    screenName: 'Dashboard da empresa',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/bloco-clima$/,
    screenName: 'Clima e engajamento',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/turnover$/,
    screenName: 'Turnover',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/familias$/,
    screenName: 'Famílias de função',
  },
  {
    pattern: /\/super-admin\/empresa\/[^/]+\/painel-rh-preview$/,
    screenName: 'Painel do RH (preview)',
  },
  // Painel landing — menos especifica; so match se nenhuma acima casar.
  {
    pattern: /\/super-admin\/empresa\/[^/]+$/,
    screenName: 'Painel',
  },
];

/**
 * Extrai o `companyId` do pathname `/super-admin/empresa/[id]/*`.
 * Retorna `null` quando o pathname nao esta na raiz dentro-de-empresa.
 */
export function parseCompanyIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/super-admin\/empresa\/([^/]+)(?:\/|$)/);
  if (match === null) {
    return null;
  }
  const captured = match[1];
  return captured !== undefined ? captured : null;
}

/**
 * Resolve o `screenName` canonico para o pathname dentro-de-empresa.
 * Percorre `BREADCRUMB_ENTRIES_DENTRO_EMPRESA` em ordem e retorna o
 * primeiro `screenName` cujo `pattern` case com o pathname.
 * Retorna `null` quando nenhum padrao casa (rota fora da arvore
 * dentro-de-empresa).
 */
export function resolveScreenNameFromPathname(pathname: string): string | null {
  for (const entry of BREADCRUMB_ENTRIES_DENTRO_EMPRESA) {
    if (entry.pattern.test(pathname)) {
      return entry.screenName;
    }
  }
  return null;
}
