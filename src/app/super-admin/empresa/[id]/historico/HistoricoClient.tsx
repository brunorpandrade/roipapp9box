'use client';

// ROIP APP 9BOX — client component /super-admin/empresa/[id]/historico
// (ME-057c Bloco A — Historico da empresa §14.21).
//
// Origem canonica:
// - DOC 05 §14.21 + mockup canonico `historico_empresa_v1.html`.
//   CC045 canonizada nesta ME: mockup prevalece bit-exact.
// - Ordem canonica das 5 colunas (mockup linhas 192-198):
//   chevron (26px) · Data/hora · Ator · Tipo de evento (badge) ·
//   Descricao resumida.
// - Filtros canonicos (mockup linhas 168-183): Periodo (dropdown),
//   Tipo de evento (dropdown com opcao desabilitada canonica literal
//   "Mudanca de meta de ROI (indisponivel — placeholder)"), Ator (busca
//   livre).
// - Comportamento acordeao de expansao unica (mockup linhas 336-372):
//   clicar em qualquer linha alterna a expansao daquela linha; clicar
//   em outra recolhe a anterior automaticamente.
// - Painel expandido: grid 2 colunas com detalhes canonicos + bloco de
//   justificativa completa (mockup linha 83 `grid-template-columns:
//   repeat(2, 1fr)`; linha 87 `grid-column: 1 / -1` para o bloco de
//   justificativa que ocupa a largura toda).
// - Paginacao 25/50/100 default 25 (mockup linhas 212-217).
// - Estados vazios canonicos (mockup linhas 324-326).
// - S324: filtro "Ator" ocorre server-side via LIKE sobre nome do ator
//   resolvido de cada fonte + literal S322 in-memory.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `HistoricoClient` (component) → page.tsx (mesma rota).

import { useCallback, useMemo, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import type { HistoryEventRow, HistoryLoadResult } from '../../../../../lib/logs/companyHistoryLog';

import { listarHistoricoAction } from './actions';
import {
  ATOR_BUSCA_MAX_LEN,
  PERIODO_VALUES,
  type HistoricoFilters,
  type PeriodoValue,
} from './filters';
import {
  HISTORY_EMPTY_FILTRO,
  HISTORY_EMPTY_INICIAL,
  HISTORY_EVENT_TYPE_LABEL,
  HISTORY_EVENT_TYPE_LABEL_TODOS,
  HISTORY_EVENT_TYPE_VALUES,
  resolveHistoryEventBadgeStyle,
  resolveHistoryEventTypeLabel,
  type HistoryEventType,
} from './mappings';

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

export interface HistoricoClientProps {
  readonly companyId: number;
  readonly initialResult: HistoryLoadResult;
  readonly initialFilters: HistoricoFilters;
}

// -----------------------------------------------------------------------
// Estilos canonicos (inline — padrao ME-057a/b)
// -----------------------------------------------------------------------

const CARD_STYLE: CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 16,
};

const FILTROS_TITLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: 10,
};

const FILTROS_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
};

const FILTRO_SELECT: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.secondary,
  background: '#FFFFFF',
  cursor: 'pointer',
  minWidth: 180,
};

const FILTRO_INPUT: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.primary,
  background: '#FFFFFF',
  minWidth: 200,
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const TH_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  borderBottom: `1px solid ${COLORS.border.default}`,
};

const TD_STYLE: CSSProperties = {
  padding: '12px',
  color: COLORS.text.primary,
  borderBottom: `1px solid ${COLORS.border.default}`,
  verticalAlign: 'top',
};

const CHEVRON_STYLE: CSSProperties = {
  display: 'inline-block',
  transition: 'transform 0.15s',
  color: COLORS.text.tertiary,
  fontSize: 10,
  marginRight: 6,
};

const BADGE_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const DETALHE_ROW_TD: CSSProperties = {
  background: '#FAFBFC',
  padding: 0,
  borderBottom: `1px solid ${COLORS.border.default}`,
};

const DETALHE_PAINEL: CSSProperties = {
  padding: '14px 20px 16px 38px',
  fontSize: 12,
};

const DETALHE_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '8px 24px',
};

const DETALHE_ITEM: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const DETALHE_LABEL: CSSProperties = {
  fontSize: 10,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  fontWeight: 600,
};

const DETALHE_VALOR: CSSProperties = {
  fontSize: 12.5,
  color: COLORS.text.primary,
};

const DETALHE_JUSTIFICATIVA: CSSProperties = {
  gridColumn: '1 / -1',
  background: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: COLORS.text.secondary,
  lineHeight: 1.6,
  marginTop: 4,
};

const EMPTY_STATE: CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: COLORS.text.tertiary,
  fontSize: 13,
};

const PAGINATION_BAR: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 4px',
  fontSize: 12,
  color: COLORS.text.secondary,
};

const PAGINATION_BTN: CSSProperties = {
  padding: '4px 10px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: '#FFFFFF',
  color: COLORS.text.primary,
  cursor: 'pointer',
  fontSize: 12,
  minWidth: 32,
};

const PAGINATION_BTN_DISABLED: CSSProperties = {
  ...PAGINATION_BTN,
  color: COLORS.text.tertiary,
  cursor: 'not-allowed',
  background: '#F9FAFB',
};

// -----------------------------------------------------------------------
// Formatador canonico de data (dd/MM/yyyy HH:mm — UTC)
// -----------------------------------------------------------------------

function formatDateTimeBRT(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// -----------------------------------------------------------------------
// Componente canonico
// -----------------------------------------------------------------------

export function HistoricoClient(props: HistoricoClientProps): JSX.Element {
  const { companyId, initialResult, initialFilters } = props;
  const [result, setResult] = useState<HistoryLoadResult>(initialResult);
  const [filters, setFilters] = useState<HistoricoFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [atorDraft, setAtorDraft] = useState<string>(initialFilters.atorBusca);

  const refetch = useCallback(
    async (nextFilters: HistoricoFilters): Promise<void> => {
      setIsLoading(true);
      try {
        const next = await listarHistoricoAction(companyId, nextFilters);
        setResult(next);
        setFilters(nextFilters);
        setExpandedRowId(null);
      } finally {
        setIsLoading(false);
      }
    },
    [companyId],
  );

  const handlePeriodoChange = useCallback(
    (novoPeriodo: PeriodoValue): void => {
      void refetch({
        ...filters,
        periodo: novoPeriodo,
        periodoPersonalizadoInicio:
          novoPeriodo === 'personalizado' ? filters.periodoPersonalizadoInicio : null,
        periodoPersonalizadoFim:
          novoPeriodo === 'personalizado' ? filters.periodoPersonalizadoFim : null,
        page: 1,
      });
    },
    [filters, refetch],
  );

  const handleTipoChange = useCallback(
    (novoTipo: HistoryEventType | null): void => {
      void refetch({ ...filters, tipo: novoTipo, page: 1 });
    },
    [filters, refetch],
  );

  const handleAtorSubmit = useCallback((): void => {
    void refetch({ ...filters, atorBusca: atorDraft.trim(), page: 1 });
  }, [atorDraft, filters, refetch]);

  const handlePageChange = useCallback(
    (novaPagina: number): void => {
      void refetch({ ...filters, page: novaPagina });
    },
    [filters, refetch],
  );

  const handlePageSizeChange = useCallback(
    (novoTamanho: 25 | 50 | 100): void => {
      void refetch({ ...filters, pageSize: novoTamanho, page: 1 });
    },
    [filters, refetch],
  );

  const toggleRow = useCallback((rowId: string): void => {
    setExpandedRowId((current) => (current === rowId ? null : rowId));
  }, []);

  const totalPages = useMemo((): number => {
    if (result.totalCount === 0) return 1;
    return Math.ceil(result.totalCount / filters.pageSize);
  }, [result.totalCount, filters.pageSize]);

  const hasNoRegistrosInicial =
    result.totalCount === 0 &&
    filters.tipo === null &&
    filters.atorBusca === '' &&
    filters.periodo === '90';

  const isEmpty = result.rows.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Card de filtros */}
      <div style={CARD_STYLE}>
        <div style={FILTROS_TITLE}>Filtros</div>
        <div style={FILTROS_ROW}>
          <select
            style={FILTRO_SELECT}
            value={filters.periodo}
            onChange={(e): void => handlePeriodoChange(e.target.value as PeriodoValue)}
            aria-label="Período"
          >
            {PERIODO_VALUES.map((p) => (
              <option key={p} value={p}>
                {p === '30'
                  ? 'Últimos 30 dias'
                  : p === '90'
                    ? 'Últimos 90 dias'
                    : p === '365'
                      ? 'Últimos 12 meses'
                      : 'Personalizado…'}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.tipo ?? 'todos'}
            onChange={(e): void => {
              const v = e.target.value;
              if (v === 'todos') {
                handleTipoChange(null);
              } else if ((HISTORY_EVENT_TYPE_VALUES as readonly string[]).includes(v)) {
                handleTipoChange(v as HistoryEventType);
              }
            }}
            aria-label="Tipo de evento"
          >
            <option value="todos">{HISTORY_EVENT_TYPE_LABEL_TODOS}</option>
            {HISTORY_EVENT_TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {HISTORY_EVENT_TYPE_LABEL[t]}
              </option>
            ))}
            <option value="meta_roi" disabled>
              Mudança de meta de ROI (indisponível — placeholder)
            </option>
          </select>
          <input
            style={FILTRO_INPUT}
            type="text"
            placeholder="Buscar por ator..."
            value={atorDraft}
            maxLength={ATOR_BUSCA_MAX_LEN}
            onChange={(e): void => setAtorDraft(e.target.value)}
            onKeyDown={(e): void => {
              if (e.key === 'Enter') handleAtorSubmit();
            }}
            onBlur={handleAtorSubmit}
            aria-label="Buscar por ator"
          />
        </div>
      </div>

      {/* Card da tabela */}
      <div style={CARD_STYLE}>
        {isEmpty ? (
          <div style={EMPTY_STATE} role="status" aria-live="polite">
            {hasNoRegistrosInicial ? HISTORY_EMPTY_INICIAL : HISTORY_EMPTY_FILTRO}
          </div>
        ) : (
          <>
            <table style={TABLE_STYLE}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 26 }} aria-hidden="true"></th>
                  <th style={TH_STYLE}>Data/hora</th>
                  <th style={TH_STYLE}>Ator</th>
                  <th style={TH_STYLE}>Tipo de evento</th>
                  <th style={TH_STYLE}>Descrição resumida</th>
                </tr>
              </thead>
              <tbody>{result.rows.map((r) => renderRowGroup(r, expandedRowId, toggleRow))}</tbody>
            </table>
            <div style={PAGINATION_BAR}>
              <div>
                Exibir{' '}
                <select
                  value={filters.pageSize}
                  onChange={(e): void =>
                    handlePageSizeChange(Number(e.target.value) as 25 | 50 | 100)
                  }
                  style={{
                    padding: '4px 8px',
                    border: `1px solid ${COLORS.border.default}`,
                    borderRadius: 6,
                    fontSize: 12,
                    marginLeft: 4,
                    marginRight: 4,
                  }}
                  aria-label="Registros por página"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>{' '}
                por página
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={(): void => handlePageChange(filters.page - 1)}
                  disabled={filters.page <= 1 || isLoading}
                  style={filters.page <= 1 ? PAGINATION_BTN_DISABLED : PAGINATION_BTN}
                  aria-label="Página anterior"
                >
                  ‹
                </button>
                <span style={{ padding: '0 8px' }}>
                  {filters.page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={(): void => handlePageChange(filters.page + 1)}
                  disabled={filters.page >= totalPages || isLoading}
                  style={filters.page >= totalPages ? PAGINATION_BTN_DISABLED : PAGINATION_BTN}
                  aria-label="Próxima página"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Renderizacao canonica de linha + linha de detalhe (acordeao)
// -----------------------------------------------------------------------

function renderRowGroup(
  row: HistoryEventRow,
  expandedRowId: string | null,
  toggleRow: (rowId: string) => void,
): JSX.Element {
  const expanded = expandedRowId === row.id;
  const badgeStyle = resolveHistoryEventBadgeStyle(row.tipo);
  const badgeLabel = resolveHistoryEventTypeLabel(row.tipo);
  const chevronExpanded: CSSProperties = expanded
    ? { ...CHEVRON_STYLE, transform: 'rotate(90deg)', color: COLORS.accent.teal }
    : CHEVRON_STYLE;
  const rowBg = expanded ? '#F0FDFA' : undefined;

  return (
    <>
      <tr
        key={row.id}
        onClick={(): void => toggleRow(row.id)}
        style={{ cursor: 'pointer', background: rowBg }}
        aria-expanded={expanded}
      >
        <td style={TD_STYLE}>
          <span style={chevronExpanded}>▶</span>
        </td>
        <td style={{ ...TD_STYLE, whiteSpace: 'nowrap' }}>{formatDateTimeBRT(row.createdAt)}</td>
        <td style={TD_STYLE}>{row.atorNome}</td>
        <td style={TD_STYLE}>
          <span
            style={{
              ...BADGE_BASE,
              background: badgeStyle.background,
              color: badgeStyle.color,
            }}
          >
            {badgeLabel}
          </span>
        </td>
        <td style={TD_STYLE}>{row.descricao}</td>
      </tr>
      {expanded ? (
        <tr key={`${row.id}:detalhe`}>
          <td colSpan={5} style={DETALHE_ROW_TD}>
            <div style={DETALHE_PAINEL}>
              <div style={DETALHE_GRID}>
                {row.detalhes.map((d) => (
                  <div key={d.label} style={DETALHE_ITEM}>
                    <span style={DETALHE_LABEL}>{d.label}</span>
                    <span style={DETALHE_VALOR}>{d.valor}</span>
                  </div>
                ))}
                {row.justificativa !== null && row.justificativa !== '' ? (
                  <div style={DETALHE_JUSTIFICATIVA}>
                    <strong
                      style={{
                        display: 'block',
                        marginBottom: 4,
                        color: COLORS.text.primary,
                        fontSize: 11.5,
                      }}
                    >
                      Justificativa completa
                    </strong>
                    &quot;{row.justificativa}&quot;
                  </div>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
