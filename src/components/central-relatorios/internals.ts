// ROIP APP 9BOX — helpers canonicos compartilhados da Central de
// Relatorios (ME-B9-CR). Extraidos de
// `src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/internals.ts`
// (ME-079a) e centralizados aqui em L125 canonico. Consumido pelas duas
// rotas do dual-route L123:
//   - `/super-admin/empresa/[id]/relatorios-e-exportacoes` (Bruno)
//   - `/central-relatorios` (RH puro / RH-Lider)
//
// Origem canonica preservada bit-exact:
// - CAMADA_UI §12 integral.
// - CAMADA_NEGOCIO §13 (6 cards + procs + governanca de custo).
//
// **RV-13.** Todo export consumido:
//   - `CARD_DEFS`, `CardId`, `NIVEL_OPTIONS`, `NivelEscopo`, `ICON_COLORS`
//     → `RelatoriosClient.tsx` (mesmo diretorio).
//   - `ClosedQuarter`, `LeaderOption` (types) → contratos das actions
//     injetadas via props no `RelatoriosClient` + declarados nos actions
//     de cada rota concreta.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact (§12.3-§12.5)
// -----------------------------------------------------------------------

/** §12.3 — 6 cards canonicos em 2 subsecoes. */
export const CARD_DEFS = [
  {
    // ME-PLANILHAS-OPERACIONAIS: religacao canonica do card. Backend
    // canonico (§13.3) ja implementado em `exports.getResumoDashboard`
    // com aba unica "Resumo dashboard" + 11 colunas canonicas + filename
    // canonico + testes cobertos em `spreadsheets-router.test.ts`. O
    // handler antigo apontava para a rota errada (bug S502); reescrito
    // canonicamente em `RelatoriosClient.handleDownload` para invocar a
    // action `generateResumoDashboardXlsx` e disparar download via blob.
    // Debito D-REL-RESUMO-EVOLUCAO quitado.
    id: 'resumo_dashboard',
    title: 'Resumo dashboard',
    subtitle: 'Planilha xlsx · 1 trimestre',
    section: 'planilhas',
    iconType: 'xlsx' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: 'Baixar planilha',
    disabled: false,
  },
  {
    // ME-PLANILHAS-OPERACIONAIS: religacao canonica do card. Backend
    // canonico (§13.4) ja implementado em `exports.getEvolucaoTrimestral`
    // com aba unica + 4 trimestres consecutivos + turnover na mesma
    // tabela + filename canonico + testes cobertos em
    // `spreadsheets-router.test.ts`. Mesmo padrao de religacao do
    // `resumo_dashboard` (bug S502 corrigido no client).
    id: 'evolucao_trimestral',
    title: 'Evolução trimestral',
    subtitle: 'Planilha xlsx · até 4 trimestres',
    section: 'planilhas',
    iconType: 'xlsx' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: 'Baixar planilha',
    disabled: false,
  },
  {
    id: 'relatorio_executivo',
    title: 'Relatório executivo trimestral',
    subtitle: 'PDF interpretativo · gerado por IA',
    section: 'relatorios',
    iconType: 'ia' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: 'Gerar relatório',
    disabled: false,
  },
  {
    id: 'snapshot_9box',
    title: 'Snapshot do 9-Box',
    subtitle: 'PDF · gerado on-the-fly',
    section: 'relatorios',
    iconType: 'pdf' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: 'Baixar PDF',
    disabled: false,
  },
  {
    id: 'board_deck',
    title: 'Board deck one-pager',
    subtitle: 'PDF · gerado on-the-fly · até 2 páginas',
    section: 'relatorios',
    iconType: 'pdf' as const,
    hasCascade: true,
    hasEquipe: false, // §12.5 omite "Equipe" silenciosamente.
    buttonLabel: 'Baixar PDF',
    disabled: false,
  },
  {
    id: 'clima_engajamento',
    title: 'Clima e engajamento',
    subtitle: 'PDF · último trimestre fechado',
    section: 'relatorios',
    iconType: 'pdf' as const,
    hasCascade: false, // §12.7 dropdown unico de Ciclo.
    hasEquipe: false,
    buttonLabel: 'Baixar PDF',
    disabled: false,
  },
] as const;

export type CardId = (typeof CARD_DEFS)[number]['id'];

/** §12.5 — opcoes do dropdown 1 (Nivel). */
export const NIVEL_OPTIONS = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'equipe', label: 'Equipe' },
] as const;

export type NivelEscopo = 'empresa' | 'departamento' | 'equipe';

/** §12.4 — cores de icone por tipo de artefato. */
export const ICON_COLORS = {
  xlsx: { bg: '#DCFCE7', color: '#166534' },
  pdf: { bg: '#DBEAFE', color: '#1E40AF' },
  ia: { bg: '#CCFBF1', color: '#0F766E' },
} as const;

// -----------------------------------------------------------------------
// Contratos das actions injetadas (D-CR-5)
// -----------------------------------------------------------------------
//
// Types canonicos compartilhados entre as duas rotas do dual-route L123.
// Cada rota concreta (super-admin / central-relatorios) tem seu proprio
// `actions.ts` que implementa estas assinaturas com o guard adequado
// (`requireSuperAdmin` vs `requireRHOrSuperAdmin`).

/** Resultado canonico ActionResult reutilizavel. */
export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

/** §12.6 — trimestre fechado listavel. */
export interface ClosedQuarter {
  readonly trimestre: string;
  readonly label: string;
}

/** §12.5 — lider ativo listavel para dropdown 2 quando Nivel=Equipe. */
export interface LeaderOption {
  readonly id: number;
  readonly tipo: 'employee' | 'clevel';
  readonly name: string;
  readonly departamento: string;
}

/** §13.11 — retorno canonico da action `generateRelatorioExecutivo`. */
export interface GenerateRelatorioExecutivoResult {
  readonly status: 'ok' | 'limit_reached' | 'failed';
  readonly cacheId?: number;
  readonly filename?: string;
  readonly message?: string;
}

/**
 * ME-PAINEL-PLANILHAS-OPERACIONAIS — retorno canonico das actions
 * `generateResumoDashboardXlsx` (§13.3) e `generateEvolucaoTrimestralXlsx`
 * (§13.4). O contract espelha bit-exact o retorno das procedures tRPC
 * `exports.getResumoDashboard` e `exports.getEvolucaoTrimestral`: nome
 * canonico do arquivo + payload xlsx codificado em base64.
 */
export interface XlsxDownloadResult {
  readonly filename: string;
  readonly contentBase64: string;
}

/**
 * Assinaturas canonicas das 6 actions injetadas no `RelatoriosClient`
 * (D-CR-5 aprovada). Padrao bit-exact ME-084: componente compartilhado
 * nunca importa actions diretamente — cada rota injeta as suas.
 *
 * IMPORTANTE — D-CR-4: actions da rota base RH NAO recebem `companyId`
 * como input (derivado de `session.companyId` no server). Actions da
 * rota Super Admin recebem `companyId` no input (Bruno atravessa
 * empresas). Como o `RelatoriosClient` e agnostico ao variant do lado
 * do transporte, ele SEMPRE passa `companyId` (fornecido via prop) para
 * as actions; a rota RH ignora o campo do input e usa o derivado, mas
 * mantem a mesma assinatura para preservar o contrato compartilhado.
 */
export interface RelatoriosClientActions {
  readonly listClosedQuarters: (input: {
    readonly companyId: number;
  }) => Promise<ActionResult<ClosedQuarter[]>>;
  readonly listDepartments: (input: {
    readonly companyId: number;
  }) => Promise<ActionResult<string[]>>;
  readonly listLeaders: (input: {
    readonly companyId: number;
  }) => Promise<ActionResult<LeaderOption[]>>;
  readonly generateRelatorioExecutivo: (input: {
    readonly companyId: number;
    readonly trimestre: string;
    readonly escopoTipo: NivelEscopo;
    readonly escopoReferencia?: string;
  }) => Promise<ActionResult<GenerateRelatorioExecutivoResult>>;
  readonly startReportDownloadToken: (input: {
    readonly companyId: number;
    readonly scope: 'snapshot_9box' | 'board_deck';
    readonly escopoTipo: NivelEscopo;
    readonly escopoReferencia?: string;
  }) => Promise<ActionResult<{ token: string; downloadUrl: string }>>;
  readonly startExecutiveReportDownloadToken: (input: {
    readonly companyId: number;
    readonly cacheId: number;
  }) => Promise<ActionResult<{ token: string; downloadUrl: string }>>;
  // ME-PAINEL-PLANILHAS-OPERACIONAIS: religacao canonica dos 2 cards
  // xlsx (§13.3 + §13.4). O client invoca a action, extrai base64,
  // converte em blob e dispara download local com o filename canonico
  // retornado. Nenhum sistema de token efemero (padrao de PDF); xlsx
  // e gerado sincronicamente e devolvido bit-exact.
  readonly generateResumoDashboardXlsx: (input: {
    readonly companyId: number;
    readonly trimestre: string;
    readonly escopoTipo: NivelEscopo;
    readonly escopoReferencia?: string;
  }) => Promise<ActionResult<XlsxDownloadResult>>;
  readonly generateEvolucaoTrimestralXlsx: (input: {
    readonly companyId: number;
    readonly trimestreFinal: string;
    readonly escopoTipo: NivelEscopo;
    readonly escopoReferencia?: string;
  }) => Promise<ActionResult<XlsxDownloadResult>>;
}

// -----------------------------------------------------------------------
// ME-B9-CR3 (D-CENTRAL-CLEVEL) — tipo canonico + matriz de visibilidade
// -----------------------------------------------------------------------

/**
 * Variant canonica de renderizacao do `RelatoriosClient`. Definida
 * server-side no `page.tsx` conforme perfil autenticado:
 *   - `'super_admin'`: Bruno navegando dentro de empresa via
 *     `/super-admin/empresa/[id]/relatorios-e-exportacoes`.
 *   - `'rh'`: RH puro / RH-Lider (Cenarios 1 e 2) via `/central-relatorios`.
 *   - `'clevel'`: C-level `acessoTotal=true` (CU + CT) via
 *     `/central-relatorios` (ME-B9-CR3).
 */
export type RelatoriosVariant = 'super_admin' | 'rh' | 'clevel';

/**
 * Matriz canonica de visibilidade de cards por variant (CAMADA_UI
 * §12.3). Bit-exact ao documento canonico:
 *
 *   | Card                          | super_admin | rh | clevel |
 *   |-------------------------------|-------------|----|--------|
 *   | resumo_dashboard              |     yes     | yes|   no   |
 *   | evolucao_trimestral           |     yes     | yes|   no   |
 *   | relatorio_executivo           |     yes     | yes|   yes  |
 *   | snapshot_9box                 |     yes     | yes|   yes  |
 *   | board_deck                    |     yes     | no |   yes  |
 *   | clima_engajamento             |     yes     | yes|   yes  |
 *
 * §12.3 (regra de subsecao vazia): se, para um perfil, nenhum card de
 * uma subsecao for visivel, a subsecao inteira (incluindo o titulo) e
 * ocultada. Para `clevel`, a subsecao "Planilhas operacionais" fica
 * vazia e deve ser ocultada.
 */
export function isCardVisibleForVariant(cardId: CardId, variant: RelatoriosVariant): boolean {
  if (variant === 'super_admin') {
    return true;
  }
  if (variant === 'rh') {
    return cardId !== 'board_deck';
  }
  // variant === 'clevel'
  if (cardId === 'resumo_dashboard' || cardId === 'evolucao_trimestral') {
    return false;
  }
  return true;
}
