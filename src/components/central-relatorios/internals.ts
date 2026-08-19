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
    // ME-080d Onda 1d — D11=B: card mantem visivel mas rotulado como
    // "Em desenvolvimento". Descoberta em auditoria S502: os botoes
    // deste card e do `evolucao_trimestral` reusavam a rota de download
    // do `snapshot_9box` com um parametro `type=` que o backend ignora
    // — na pratica os 3 cards baixavam o mesmo PDF (bug funcional
    // grave). Sem template PDF dedicado, esconder e a decisao honesta.
    // Debito D-REL-RESUMO-EVOLUCAO nomeado para bloco B2/B3 futuro.
    id: 'resumo_dashboard',
    title: 'Resumo dashboard',
    subtitle: 'Em desenvolvimento — disponível em fase futura',
    section: 'planilhas',
    iconType: 'xlsx' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: 'Em breve',
    disabled: true,
  },
  {
    // ME-080d Onda 1d — D11=B: mesmo tratamento canonico do
    // resumo_dashboard (D-REL-RESUMO-EVOLUCAO).
    id: 'evolucao_trimestral',
    title: 'Evolução trimestral',
    subtitle: 'Em desenvolvimento — disponível em fase futura',
    section: 'planilhas',
    iconType: 'xlsx' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: 'Em breve',
    disabled: true,
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
}
