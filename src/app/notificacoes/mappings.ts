// ROIP APP 9BOX — mapeamentos canonicos da rota /notificacoes (ME-057a).
//
// Origem canonica:
// - DOC 05 §14.19 (Rota `/notificacoes`) — 7 categorias de UI no
//   dropdown "Tipo" + 4 severidades no dropdown "Severidade".
// - DOC 01 §15.2 (NOTIFICATION_TIPO_VALUES) — 17 tipos canonicos do
//   enum logico (2 NR-1 + 13 Fase 8 + 2 Responsavel financeiro).
// - DOC 01 §15.3 (SEVERIDADE_VALUES) — 4 severidades canonicas.
//
// Contrato canonico:
// - Modulo puro (sem I/O). Consumido por `page.tsx` (server, para
//   traducao query) e `NotificacoesClient.tsx` (client, para renderizar
//   badges e labels).
// - Cobre os 17 tipos do enum em 6 das 7 categorias UI. A categoria
//   "Plenitude" existe no dropdown §14.19 mas nao possui tipo mapeado no
//   enum atual (a integracao virao em ME futura quando o motor Plenitude
//   emitir alertas). Filtro "Plenitude" retorna vazio ate la — canonico.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `CATEGORIA_UI_VALUES`, `resolveCategoriaFromTipo`,
//     `resolveTiposFromCategoria` → `page.tsx` (traducao filtro UI →
//     WHERE tipo IN (...)) + `NotificacoesClient.tsx` (dropdown).
//   - `SEVERIDADE_UI_VALUES`, `resolveEmojiFromSeveridade`,
//     `resolveLabelFromSeveridade` → `NotificacoesClient.tsx` (badge).
//   - `STATUS_UI_VALUES` → `NotificacoesClient.tsx` + `page.tsx`.
//   - Tipos → `page.tsx`, `NotificacoesClient.tsx`, testes unit +
//     integration.

import type { NotificationTipo, Severidade } from '../../db/schema/enums';

// -----------------------------------------------------------------------
// Categoria de tipo (dropdown "Tipo" §14.19)
// -----------------------------------------------------------------------

/**
 * As 7 categorias canonicas do dropdown "Tipo" §14.19 mais o marcador
 * "todos" (default). Ordem canonica do dropdown (bit-exact do DOC 05
 * §14.19): todos, Desempenho, Assiduidade, Plenitude, Radar NR-1,
 * Perfil Individual, Administrativos, Ciclos automaticos.
 */
export const CATEGORIA_UI_VALUES = [
  'todos',
  'desempenho',
  'assiduidade',
  'plenitude',
  'radar_nr1',
  'perfil_individual',
  'administrativos',
  'ciclos_automaticos',
] as const;
export type CategoriaUi = (typeof CATEGORIA_UI_VALUES)[number];

/**
 * Rotulo canonico exibido no dropdown "Tipo" (bit-exact §14.19).
 */
export const CATEGORIA_UI_LABEL: Readonly<Record<CategoriaUi, string>> = {
  todos: 'Tipo: todos',
  desempenho: 'Desempenho',
  assiduidade: 'Assiduidade',
  plenitude: 'Plenitude',
  radar_nr1: 'Radar NR-1',
  perfil_individual: 'Perfil Individual',
  administrativos: 'Administrativos',
  ciclos_automaticos: 'Ciclos automáticos',
};

/**
 * Mapeamento canonico bit-exact tipo (17 valores) → categoria UI.
 *
 * - `nr1_*` → radar_nr1 (2 tipos).
 * - `desempenho_*` + `divergencia_a_c` → desempenho (4 tipos). A
 *   divergencia entre autoavaliacao (A) e diagnostico (C) e categorizada
 *   como Desempenho na UI porque a raiz canonica do fluxo e a lacuna de
 *   desempenho percebido; o motor emissor (§13.4 DOC 04) trata como
 *   divergencia estrutural mas o destinatario (RH+Bruno) age via
 *   pipeline de desempenho.
 * - `assiduidade_baixa` → assiduidade (1 tipo).
 * - `perfil_*` → perfil_individual (3 tipos).
 * - `desbloqueio_*` + `fechamento_bloqueado_sem_resp_financeiro` +
 *   `responsavel_financeiro_nomeado` → administrativos (5 tipos).
 * - `ciclo_*` → ciclos_automaticos (2 tipos).
 * - "Plenitude" (categoria UI) → nenhum tipo enum atual (integracao
 *   futura quando motor Plenitude emitir alertas).
 *
 * Total: 2 + 4 + 1 + 3 + 5 + 2 = 17 tipos, 6 categorias mapeadas de 7.
 */
export const CATEGORIA_BY_TIPO: Readonly<Record<NotificationTipo, CategoriaUi>> = {
  // Radar NR-1 (2)
  nr1_fator_critico: 'radar_nr1',
  nr1_ciclo_fechado: 'radar_nr1',
  // Desempenho (4) — inclui divergencia A/C
  desempenho_queda_brusca: 'desempenho',
  desempenho_estagnacao: 'desempenho',
  desempenho_queda_isolada: 'desempenho',
  divergencia_a_c: 'desempenho',
  // Assiduidade (1)
  assiduidade_baixa: 'assiduidade',
  // Perfil Individual (3)
  perfil_inconsistente_primeira: 'perfil_individual',
  perfil_retest_consistente: 'perfil_individual',
  perfil_retest_reincidente: 'perfil_individual',
  // Administrativos (5) — desbloqueio (3) + RF (2)
  desbloqueio_solicitado: 'administrativos',
  desbloqueio_aprovado: 'administrativos',
  desbloqueio_recusado: 'administrativos',
  fechamento_bloqueado_sem_resp_financeiro: 'administrativos',
  responsavel_financeiro_nomeado: 'administrativos',
  // Ciclos automaticos (2)
  ciclo_instrumento_encerrado: 'ciclos_automaticos',
  ciclo_mensal_fechado: 'ciclos_automaticos',
};

/**
 * Retorna a categoria canonica UI para um tipo do enum.
 */
export function resolveCategoriaFromTipo(tipo: NotificationTipo): CategoriaUi {
  return CATEGORIA_BY_TIPO[tipo];
}

/**
 * Retorna a lista de tipos do enum que pertencem a uma categoria UI.
 * Consumido pelo WHERE `tipo IN (...)` quando um filtro de categoria
 * diferente de "todos" e selecionado. Para "plenitude" retorna array
 * vazio — o UI encaminha para query com `WHERE 1=0` canonico (nenhum
 * tipo atual esta na categoria).
 */
export function resolveTiposFromCategoria(categoria: CategoriaUi): readonly NotificationTipo[] {
  if (categoria === 'todos') {
    // Nao filtra por tipo — consumidor deve NAO adicionar clausula.
    // Retornar todos os tipos aqui simplifica o consumidor (WHERE IN
    // com todos == sem WHERE). Documentacao explicita.
    return Object.keys(CATEGORIA_BY_TIPO) as readonly NotificationTipo[];
  }
  return (Object.keys(CATEGORIA_BY_TIPO) as readonly NotificationTipo[]).filter(
    (tipo) => CATEGORIA_BY_TIPO[tipo] === categoria,
  );
}

// -----------------------------------------------------------------------
// Severidade (dropdown "Severidade" §14.19)
// -----------------------------------------------------------------------

/**
 * Valores canonicos do dropdown "Severidade" §14.19 mais o marcador
 * "todas" (default). Ordem canonica bit-exact do DOC 05 §14.19: todas,
 * critico, atencao, observacao, info.
 */
export const SEVERIDADE_UI_VALUES = ['todas', 'critico', 'atencao', 'observacao', 'info'] as const;
export type SeveridadeUi = (typeof SEVERIDADE_UI_VALUES)[number];

/**
 * Rotulo canonico exibido no dropdown "Severidade" (bit-exact §14.19).
 * Inclui emoji canonico como parte do rotulo.
 */
export const SEVERIDADE_UI_LABEL: Readonly<Record<SeveridadeUi, string>> = {
  todas: 'Severidade: todas',
  critico: '🔴 Crítico',
  atencao: '🔶 Atenção',
  observacao: '⚪ Observação',
  info: '🔵 Info',
};

/**
 * Emoji canonico da severidade (§14.19). Usado no badge da tabela ao
 * lado do rotulo textual.
 */
export const SEVERIDADE_EMOJI: Readonly<Record<Severidade, string>> = {
  info: '🔵',
  observacao: '⚪',
  atencao: '🔶',
  critico: '🔴',
};

/**
 * Rotulo textual canonico da severidade (sem emoji). Usado como texto do
 * badge e como label ARIA acessivel.
 */
export const SEVERIDADE_LABEL: Readonly<Record<Severidade, string>> = {
  info: 'Info',
  observacao: 'Observação',
  atencao: 'Atenção',
  critico: 'Crítico',
};

export function resolveEmojiFromSeveridade(severidade: Severidade): string {
  return SEVERIDADE_EMOJI[severidade];
}

export function resolveLabelFromSeveridade(severidade: Severidade): string {
  return SEVERIDADE_LABEL[severidade];
}

// -----------------------------------------------------------------------
// Status (dropdown "Status" §14.19)
// -----------------------------------------------------------------------

/**
 * Valores canonicos do dropdown "Status" §14.19. Ordem canonica
 * bit-exact do DOC 05 §14.19: nao_lidas_e_lidas (default), nao_lidas,
 * lidas, arquivadas, todas.
 *
 * Semantica canonica (mapeamento status → WHERE):
 * - `nao_lidas_e_lidas` (default): `arquivadaEm IS NULL` (exclui
 *   arquivadas, inclui lidas e nao lidas). Este e o comportamento
 *   canonico da visualizacao padrao — arquivadas somem por design.
 * - `nao_lidas`: `arquivadaEm IS NULL AND lidaEm IS NULL`.
 * - `lidas`: `arquivadaEm IS NULL AND lidaEm IS NOT NULL`.
 * - `arquivadas`: `arquivadaEm IS NOT NULL`.
 * - `todas`: sem clausula (inclui arquivadas).
 */
export const STATUS_UI_VALUES = [
  'nao_lidas_e_lidas',
  'nao_lidas',
  'lidas',
  'arquivadas',
  'todas',
] as const;
export type StatusUi = (typeof STATUS_UI_VALUES)[number];

export const STATUS_UI_LABEL: Readonly<Record<StatusUi, string>> = {
  nao_lidas_e_lidas: 'Status: não lidas + lidas',
  nao_lidas: 'Não lidas',
  lidas: 'Lidas',
  arquivadas: 'Arquivadas',
  todas: 'Todas (inclui arquivadas)',
};

// -----------------------------------------------------------------------
// Periodo (dropdown "Periodo" §14.19)
// -----------------------------------------------------------------------

/**
 * Valores canonicos do dropdown "Periodo" §14.19. Ordem canonica
 * bit-exact do DOC 05 §14.19: ultimos_30d (default), ultimos_7d,
 * ultimos_90d, personalizado.
 */
export const PERIODO_UI_VALUES = [
  'ultimos_30d',
  'ultimos_7d',
  'ultimos_90d',
  'personalizado',
] as const;
export type PeriodoUi = (typeof PERIODO_UI_VALUES)[number];

export const PERIODO_UI_LABEL: Readonly<Record<PeriodoUi, string>> = {
  ultimos_30d: 'Período: últimos 30 dias',
  ultimos_7d: 'Últimos 7 dias',
  ultimos_90d: 'Últimos 90 dias',
  personalizado: 'Personalizado…',
};

// -----------------------------------------------------------------------
// Defaults canonicos dos filtros (§14.19)
// -----------------------------------------------------------------------

/**
 * Defaults canonicos bit-exact §14.19. Consumidos pelo `filters.ts`
 * (parse do querystring) e pelo `NotificacoesClient.tsx` (reset do
 * botao "Limpar filtros").
 */
export const CANONICAL_DEFAULT_CATEGORIA: CategoriaUi = 'todos';
export const CANONICAL_DEFAULT_SEVERIDADE: SeveridadeUi = 'todas';
export const CANONICAL_DEFAULT_PERIODO: PeriodoUi = 'ultimos_30d';
export const CANONICAL_DEFAULT_STATUS: StatusUi = 'nao_lidas_e_lidas';
export const CANONICAL_DEFAULT_SEARCH_COLABORADOR = '';
export const CANONICAL_DEFAULT_PAGE = 1;
export const CANONICAL_DEFAULT_PAGE_SIZE = 25 as const;

/**
 * Opcoes canonicas de tamanho de pagina §14.19: 25 (default), 50, 100.
 */
export const CANONICAL_PAGE_SIZE_VALUES = [25, 50, 100] as const;
export type CanonicalPageSize = (typeof CANONICAL_PAGE_SIZE_VALUES)[number];
