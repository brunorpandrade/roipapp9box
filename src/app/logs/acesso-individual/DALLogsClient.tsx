'use client';

// ROIP APP 9BOX — client component /logs/acesso-individual (RH) +
// /super-admin/logs/acesso-individual (Bruno) — ME-057b Bloco B (uso
// compartilhado tambem pelo Bloco C via prop `showEmpresaFilter`).
//
// Origem canonica:
// - DOC 05 §14.22 + mockup canonico `log_acesso_individual_v1.html`
//   + CC043 (aprovada em ME-057b).
// - Ordem canonica das 5 colunas (mockup linha 124):
//   Data/hora, Agente, Titular, Tipo de acesso, Contexto.
// - Filtros canonicos (mockup linhas 87-95):
//   busca unificada (titular OU CPF OU agente) + dropdown Tipo de
//   acesso + date-range picker Periodo.
// - Bloco C: prop `showEmpresaFilter=true` habilita dropdown Empresa
//   (canonico §14.22 subtitle Bruno).
//
// Duas rotas usam o MESMO componente por serem estruturalmente identicas
// exceto pela (a) existencia do dropdown Empresa e (b) origem do
// re-fetch (Bruno vs RH). A prop `onListar` isola essa diferenca.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `DALLogsClient` → /logs/acesso-individual/page.tsx.
//   - `DALLogsClient` tambem consumido por /super-admin/logs/
//     acesso-individual/page.tsx (Bloco C) via `showEmpresaFilter=true`.

import { useCallback, useMemo, useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../lib/design-tokens/colors';
import {
  TIPO_ACESSO_LABEL_TODOS,
  resolveTipoAcessoLabel,
  type DALFilters,
  type DALListResult,
} from '../../../lib/logs/dataAccessLog';
import { TIPO_ACESSO_VALUES, type TipoAcesso } from '../../../db/schema/enums';

import { listarDALLogsRHAction } from './actions';

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

/** Opcao do dropdown Empresa (usado apenas no modo Bruno). */
export interface DALEmpresaOption {
  readonly id: number;
  readonly nomeFantasia: string;
}

export interface DALLogsClientProps {
  readonly initialResult: DALListResult;
  readonly initialFilters: DALFilters;
  /** Se true, exibe dropdown Empresa (modo Bruno). */
  readonly showEmpresaFilter: boolean;
  /** Empresas para o dropdown (vazio se `showEmpresaFilter=false`). */
  readonly empresas: readonly DALEmpresaOption[];
  /**
   * Callback de re-fetch. Injetavel para permitir que o Bloco C use uma
   * server action Bruno-specific (`listarDALLogsBrunoAction`). Se
   * omitido, usa `listarDALLogsRHAction` como default (Bloco B).
   */
  readonly onListar?: (filters: DALFilters) => Promise<DALListResult>;
}

// -----------------------------------------------------------------------
// Estilos canonicos (padrao ME-057a)
// -----------------------------------------------------------------------

const FILTRO_INPUT: CSSProperties = {
  padding: '9px 14px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 13,
  background: '#FFFFFF',
  color: COLORS.text.secondary,
};

const FILTRO_SELECT: CSSProperties = {
  ...FILTRO_INPUT,
  cursor: 'pointer',
  minWidth: 200,
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  background: '#FFFFFF',
};

const TH_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.tertiary,
  background: '#F9FAFB',
};

const TD_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  fontSize: 13,
  color: COLORS.text.primary,
  verticalAlign: 'top',
};

const BADGE_TIPO: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: COLORS.badge.infoBg,
  color: COLORS.badge.infoText,
};

const BUTTON_STYLE: CSSProperties = {
  padding: '5px 10px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 6,
  background: '#FFFFFF',
  fontSize: 12,
  color: COLORS.text.secondary,
  cursor: 'pointer',
};

// -----------------------------------------------------------------------
// Helpers puros
// -----------------------------------------------------------------------

function formatDateTimeBR(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} · ${hh}:${mm}`;
}

function toDateInputValue(d: Date | null): string {
  if (d === null) return '';
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(s: string): Date | null {
  if (s === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// -----------------------------------------------------------------------
// Client component
// -----------------------------------------------------------------------

export function DALLogsClient(props: DALLogsClientProps): JSX.Element {
  const { initialResult, initialFilters, showEmpresaFilter, empresas, onListar } = props;
  const [filters, setFilters] = useState<DALFilters>(initialFilters);
  const [result, setResult] = useState<DALListResult>(initialResult);
  const [searchInput, setSearchInput] = useState<string>(initialFilters.search ?? '');
  const [loading, setLoading] = useState<boolean>(false);

  const listar = useMemo(() => onListar ?? listarDALLogsRHAction, [onListar]);

  const applyFilters = useCallback(
    async (next: DALFilters) => {
      setLoading(true);
      try {
        const r = await listar(next);
        setResult(r);
        setFilters(next);
      } finally {
        setLoading(false);
      }
    },
    [listar],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(result.totalCount / filters.pageSize)),
    [result.totalCount, filters.pageSize],
  );

  const submitSearch = useCallback(() => {
    const trimmed = searchInput.trim();
    const nextSearch =
      trimmed.length >= 2 ? (trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed) : null;
    void applyFilters({ ...filters, search: nextSearch, page: 1 });
  }, [applyFilters, filters, searchInput]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar por titular ou agente..."
          aria-label="Buscar por titular ou agente"
          style={{ ...FILTRO_INPUT, minWidth: 260, flexGrow: 1 }}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSearch();
          }}
          onBlur={submitSearch}
        />

        <select
          aria-label="Tipo de acesso"
          style={FILTRO_SELECT}
          value={filters.tipoAcesso ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const next: DALFilters = {
              ...filters,
              tipoAcesso: (TIPO_ACESSO_VALUES as readonly string[]).includes(raw)
                ? (raw as TipoAcesso)
                : null,
              page: 1,
            };
            void applyFilters(next);
          }}
        >
          <option value="">{TIPO_ACESSO_LABEL_TODOS}</option>
          {TIPO_ACESSO_VALUES.map((v) => (
            <option key={v} value={v}>
              {resolveTipoAcessoLabel(v)}
            </option>
          ))}
        </select>

        {/* Date-range picker inline (CC043 — mockup) */}
        <input
          type="date"
          aria-label="Data inicial"
          style={FILTRO_INPUT}
          value={toDateInputValue(filters.periodoInicio)}
          onChange={(e) => {
            const next: DALFilters = {
              ...filters,
              periodoInicio: parseDateInputValue(e.target.value),
              page: 1,
            };
            void applyFilters(next);
          }}
        />
        <input
          type="date"
          aria-label="Data final"
          style={FILTRO_INPUT}
          value={toDateInputValue(filters.periodoFim)}
          onChange={(e) => {
            const next: DALFilters = {
              ...filters,
              periodoFim: parseDateInputValue(e.target.value),
              page: 1,
            };
            void applyFilters(next);
          }}
        />

        {/* Dropdown Empresa (apenas modo Bruno) */}
        {showEmpresaFilter ? (
          <select
            aria-label="Empresa"
            style={FILTRO_SELECT}
            value={filters.empresaId === null ? '' : String(filters.empresaId)}
            onChange={(e) => {
              const raw = e.target.value;
              const next: DALFilters = {
                ...filters,
                empresaId: raw === '' ? null : Number.parseInt(raw, 10),
                page: 1,
              };
              void applyFilters(next);
            }}
          >
            <option value="">Empresa: Todas</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={String(emp.id)}>
                {emp.nomeFantasia}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Tabela */}
      <div
        style={{ overflowX: 'auto', border: `1px solid ${COLORS.border.default}`, borderRadius: 8 }}
      >
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Data/hora</th>
              <th style={TH_STYLE}>Agente</th>
              <th style={TH_STYLE}>Titular</th>
              <th style={TH_STYLE}>Tipo de acesso</th>
              <th style={TH_STYLE}>Contexto</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...TD_STYLE, textAlign: 'center', color: COLORS.text.tertiary }}
                >
                  Nenhum acesso registrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id}>
                  <td style={TD_STYLE}>{formatDateTimeBR(row.createdAt)}</td>
                  <td style={TD_STYLE}>{row.agentName}</td>
                  <td style={TD_STYLE}>{row.titularName}</td>
                  <td style={TD_STYLE}>
                    <span style={BADGE_TIPO}>{resolveTipoAcessoLabel(row.tipoAcesso)}</span>
                  </td>
                  <td style={TD_STYLE}>{row.contexto ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginacao */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
      >
        <div style={{ fontSize: 12, color: COLORS.text.tertiary }}>
          {loading
            ? 'Carregando…'
            : `${result.totalCount} registros · página ${filters.page} de ${totalPages}`}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            aria-label="Itens por página"
            style={FILTRO_SELECT}
            value={String(filters.pageSize)}
            onChange={(e) => {
              const ps = Number.parseInt(e.target.value, 10);
              const next: DALFilters = {
                ...filters,
                pageSize: ps === 50 || ps === 100 ? (ps as 50 | 100) : 25,
                page: 1,
              };
              void applyFilters(next);
            }}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <button
            type="button"
            style={BUTTON_STYLE}
            disabled={filters.page <= 1 || loading}
            onClick={() => void applyFilters({ ...filters, page: filters.page - 1 })}
          >
            Anterior
          </button>
          <button
            type="button"
            style={BUTTON_STYLE}
            disabled={filters.page >= totalPages || loading}
            onClick={() => void applyFilters({ ...filters, page: filters.page + 1 })}
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
