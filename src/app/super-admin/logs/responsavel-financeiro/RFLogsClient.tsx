'use client';

// ROIP APP 9BOX — client component /super-admin/logs/responsavel-financeiro
// (ME-057b Bloco A).
//
// Origem canonica:
// - DOC 05 §14.20 + mockup canonico `logs_responsavel_financeiro_v1.html`
//   + CC043 (aprovada em ME-057b).
// - Ordem canonica das 7 colunas (mockup linhas 200-206):
//   Empresa, Data/hora, Tipo de evento, De, Para, Justificativa, Acao.
// - Filtros canonicos (mockup linhas 173-189):
//   Empresa (select), Periodo (dropdown), Tipo de evento (dropdown).
// - Modal `[Ver detalhes]` (mockup linhas 262-268): Empresa, Data/hora,
//   Tipo, De, Para, Executado por, Justificativa completa.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `RFLogsClient` (component) → page.tsx (mesma rota).

import { useCallback, useMemo, useState, type CSSProperties, type JSX } from 'react';

import { Modal } from '../../../../components/ui/Modal';
import { COLORS } from '../../../../lib/design-tokens/colors';

import { listarRFLogsAction } from './actions';
import { PERIODO_VALUES, type PeriodoValue, type RFLogsFilters } from './filters';
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_LABEL_TODOS,
  formatHolderCell,
  resolveEventTypeBadgeStyle,
  resolveEventTypeLabel,
} from './mappings';
import type { EmpresaOption, RFLogListResult, RFLogListRow } from './page';

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

export interface RFLogsClientProps {
  readonly initialResult: RFLogListResult;
  readonly initialFilters: RFLogsFilters;
  readonly empresas: readonly EmpresaOption[];
}

// -----------------------------------------------------------------------
// Estilos canonicos (inline — segue padrao ME-057a NotificacoesClient)
// -----------------------------------------------------------------------

const FILTRO_SELECT: CSSProperties = {
  padding: '7px 12px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 12,
  color: COLORS.text.secondary,
  background: '#FFFFFF',
  cursor: 'pointer',
  minWidth: 160,
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

const BADGE_STYLE_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
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

const MODAL_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '10px 0',
  borderBottom: `1px solid ${COLORS.border.default}`,
  fontSize: 13,
};

const MODAL_LABEL_STYLE: CSSProperties = {
  color: COLORS.text.tertiary,
  fontWeight: 500,
  minWidth: 140,
};

const MODAL_VALUE_STYLE: CSSProperties = {
  color: COLORS.text.primary,
  textAlign: 'right',
};

// -----------------------------------------------------------------------
// Helpers puros de formatacao
// -----------------------------------------------------------------------

function formatDateTimeBR(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} · ${hh}:${mm}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function periodoLabel(v: PeriodoValue): string {
  switch (v) {
    case '30':
      return 'Últimos 30 dias';
    case '90':
      return 'Últimos 90 dias';
    case '365':
      return 'Últimos 12 meses';
    case 'personalizado':
      return 'Personalizado…';
  }
}

// -----------------------------------------------------------------------
// Client component
// -----------------------------------------------------------------------

export function RFLogsClient(props: RFLogsClientProps): JSX.Element {
  const { initialResult, initialFilters, empresas } = props;
  const [filters, setFilters] = useState<RFLogsFilters>(initialFilters);
  const [result, setResult] = useState<RFLogListResult>(initialResult);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalRow, setModalRow] = useState<RFLogListRow | null>(null);

  const applyFilters = useCallback(async (next: RFLogsFilters) => {
    setLoading(true);
    try {
      const r = await listarRFLogsAction(next);
      setResult(r);
      setFilters(next);
    } finally {
      setLoading(false);
    }
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(result.totalCount / filters.pageSize)),
    [result.totalCount, filters.pageSize],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <select
          aria-label="Empresa"
          style={FILTRO_SELECT}
          value={filters.empresaId === null ? '' : String(filters.empresaId)}
          onChange={(e) => {
            const raw = e.target.value;
            const next: RFLogsFilters = {
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

        <select
          aria-label="Período"
          style={FILTRO_SELECT}
          value={filters.periodo}
          onChange={(e) => {
            const next: RFLogsFilters = {
              ...filters,
              periodo: e.target.value as PeriodoValue,
              page: 1,
            };
            void applyFilters(next);
          }}
        >
          {PERIODO_VALUES.map((v) => (
            <option key={v} value={v}>
              {periodoLabel(v)}
            </option>
          ))}
        </select>

        <select
          aria-label="Tipo de evento"
          style={FILTRO_SELECT}
          value={filters.eventType ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const next: RFLogsFilters = {
              ...filters,
              eventType:
                raw === ''
                  ? null
                  : raw === 'atribuido' || raw === 'transferido' || raw === 'removido'
                    ? raw
                    : null,
              page: 1,
            };
            void applyFilters(next);
          }}
        >
          <option value="">{EVENT_TYPE_LABEL_TODOS}</option>
          <option value="atribuido">{EVENT_TYPE_LABEL.atribuido}</option>
          <option value="transferido">{EVENT_TYPE_LABEL.transferido}</option>
          <option value="removido">{EVENT_TYPE_LABEL.removido}</option>
        </select>
      </div>

      {/* Tabela */}
      <div
        style={{ overflowX: 'auto', border: `1px solid ${COLORS.border.default}`, borderRadius: 8 }}
      >
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Empresa</th>
              <th style={TH_STYLE}>Data/hora</th>
              <th style={TH_STYLE}>Tipo de evento</th>
              <th style={TH_STYLE}>De</th>
              <th style={TH_STYLE}>Para</th>
              <th style={TH_STYLE}>Justificativa</th>
              <th style={TH_STYLE}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ ...TD_STYLE, textAlign: 'center', color: COLORS.text.tertiary }}
                >
                  Nenhum evento registrado com os filtros aplicados.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => {
                const badge = resolveEventTypeBadgeStyle(row.eventType);
                return (
                  <tr key={row.id}>
                    <td style={TD_STYLE}>{row.companyDisplayName}</td>
                    <td style={TD_STYLE}>{formatDateTimeBR(row.createdAt)}</td>
                    <td style={TD_STYLE}>
                      <span
                        style={{
                          ...BADGE_STYLE_BASE,
                          background: badge.background,
                          color: badge.color,
                        }}
                      >
                        {resolveEventTypeLabel(row.eventType)}
                      </span>
                    </td>
                    <td style={TD_STYLE}>{formatHolderCell(row.deNome)}</td>
                    <td style={TD_STYLE}>{formatHolderCell(row.paraNome)}</td>
                    <td style={TD_STYLE}>{truncate(row.reason, 60)}</td>
                    <td style={TD_STYLE}>
                      <button
                        type="button"
                        style={BUTTON_STYLE}
                        onClick={() => setModalRow(row)}
                        aria-label={`Ver detalhes do evento ${row.id}`}
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                );
              })
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
            : `${result.totalCount} eventos · página ${filters.page} de ${totalPages}`}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            aria-label="Itens por página"
            style={FILTRO_SELECT}
            value={String(filters.pageSize)}
            onChange={(e) => {
              const ps = Number.parseInt(e.target.value, 10);
              const next: RFLogsFilters = {
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

      {/* Modal [Ver detalhes] */}
      <Modal
        open={modalRow !== null}
        onClose={() => setModalRow(null)}
        variant="centered"
        ariaLabel="Detalhes do evento"
      >
        {modalRow !== null ? (
          <div
            style={{
              width: 520,
              maxWidth: '90vw',
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: COLORS.text.primary,
                margin: 0,
                marginBottom: 8,
              }}
            >
              Detalhes do evento
            </h2>
            <div style={MODAL_ROW_STYLE}>
              <span style={MODAL_LABEL_STYLE}>Empresa</span>
              <span style={MODAL_VALUE_STYLE}>{modalRow.companyDisplayName}</span>
            </div>
            <div style={MODAL_ROW_STYLE}>
              <span style={MODAL_LABEL_STYLE}>Data/hora</span>
              <span style={MODAL_VALUE_STYLE}>{formatDateTimeBR(modalRow.createdAt)}</span>
            </div>
            <div style={MODAL_ROW_STYLE}>
              <span style={MODAL_LABEL_STYLE}>Tipo de evento</span>
              <span style={MODAL_VALUE_STYLE}>
                <span
                  style={{
                    ...BADGE_STYLE_BASE,
                    background: resolveEventTypeBadgeStyle(modalRow.eventType).background,
                    color: resolveEventTypeBadgeStyle(modalRow.eventType).color,
                  }}
                >
                  {resolveEventTypeLabel(modalRow.eventType)}
                </span>
              </span>
            </div>
            <div style={MODAL_ROW_STYLE}>
              <span style={MODAL_LABEL_STYLE}>De</span>
              <span style={MODAL_VALUE_STYLE}>{formatHolderCell(modalRow.deNome)}</span>
            </div>
            <div style={MODAL_ROW_STYLE}>
              <span style={MODAL_LABEL_STYLE}>Para</span>
              <span style={MODAL_VALUE_STYLE}>{formatHolderCell(modalRow.paraNome)}</span>
            </div>
            <div style={MODAL_ROW_STYLE}>
              <span style={MODAL_LABEL_STYLE}>Executado por</span>
              <span style={MODAL_VALUE_STYLE}>{modalRow.executadoPorNome}</span>
            </div>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                background: '#F9FAFB',
                borderRadius: 8,
                fontSize: 13,
                color: COLORS.text.primary,
                whiteSpace: 'pre-wrap',
              }}
            >
              <div style={{ fontSize: 11, color: COLORS.text.tertiary, marginBottom: 4 }}>
                Justificativa
              </div>
              {modalRow.reason}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" style={BUTTON_STYLE} onClick={() => setModalRow(null)}>
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
