// ROIP APP 9BOX — helpers internos canônicos da rota Bruno
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` (§12, ME-079a).
//
// Padrão S366 CC068 canonizado desde ME-070. CC071 compliant: zero
// imports VALUE-LEVEL de módulos server-only.
//
// Origem canônica:
// - CAMADA_UI §12 integral (§12.1-§12.11).
// - CAMADA_AUTH §10.7 (Bruno via `/super-admin/empresa/[id]/…`).
// - CAMADA_NEGOCIO §13 (Central de Relatórios — 6 cards).
// - MASTER_ESCOPO_B8.md §2.1 + §3.6.3 (ficha).
//
// **RV-13.** Todo export consumido por `page.tsx`, `actions.ts` ou
// `RelatoriosClient.tsx`.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

// -----------------------------------------------------------------------
// Constantes canônicas bit-exact
// -----------------------------------------------------------------------

/** §12.3 — 6 cards canônicos em 2 subseções. */
export const CARD_DEFS = [
  {
    id: 'resumo_dashboard',
    title: 'Resumo dashboard',
    subtitle: 'Planilha xlsx · 1 trimestre',
    section: 'planilhas',
    iconType: 'xlsx' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: '📥 Exportar planilha',
  },
  {
    id: 'evolucao_trimestral',
    title: 'Evolução trimestral',
    subtitle: 'Planilha xlsx · até 4 trimestres',
    section: 'planilhas',
    iconType: 'xlsx' as const,
    hasCascade: true,
    hasEquipe: true,
    buttonLabel: '📥 Exportar planilha',
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
  },
  {
    id: 'clima_engajamento',
    title: 'Clima e engajamento',
    subtitle: 'PDF · último trimestre fechado',
    section: 'relatorios',
    iconType: 'pdf' as const,
    hasCascade: false, // §12.7 dropdown único de Ciclo.
    hasEquipe: false,
    buttonLabel: 'Baixar PDF',
  },
] as const;

export type CardId = (typeof CARD_DEFS)[number]['id'];

/** §12.5 — opções do dropdown 1 (Nível). */
export const NIVEL_OPTIONS = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'equipe', label: 'Equipe' },
] as const;

export type NivelEscopo = 'empresa' | 'departamento' | 'equipe';

/** §12.4 — cores de ícone por tipo de artefato. */
export const ICON_COLORS = {
  xlsx: { bg: '#DCFCE7', color: '#166534' },
  pdf: { bg: '#DBEAFE', color: '#1E40AF' },
  ia: { bg: '#CCFBF1', color: '#0F766E' },
} as const;

/** §12.11 — Central é desktop-only. */
export const DESKTOP_ONLY_MESSAGE =
  'Esta tela está disponível apenas em dispositivos desktop ' + '(viewport ≥ 1024px).';

// -----------------------------------------------------------------------
// Parse canônico de params
// -----------------------------------------------------------------------

export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env');
  }
  return url;
}

/**
 * Formata trimestre canônico `YYYY-QN` para rótulo pt-BR.
 * Ex: "2025-Q4" → "4º trimestre de 2025".
 */
export function formatTrimestreLabel(tri: string): string {
  const match = /^(\d{4})-Q(\d)$/.exec(tri);
  if (match === null) {
    return tri;
  }
  const year = match[1];
  const q = match[2];
  return `${q}º trimestre de ${year}`;
}
