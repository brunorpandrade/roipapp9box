// ROIP APP 9BOX — client component da rota /notificacoes (ME-057a).
//
// Origem canonica:
// - DOC 05 §14.19 (Rota `/notificacoes`) — barra de filtros com 6
//   controles + tabela paginada 8 colunas + checkbox de selecao + cap
//   500 + rodape de acoes em lote + modal de arquivamento + 8 toasts
//   canonicos literais + 2 estados vazios.
// - DOC 05 §2.9 (Modal 'confirmation' variant), §2.9 (Toast 3
//   severidades), §2.10 (Avatar — nao usado nesta rota; tabela sem
//   coluna avatar §14.19), §2.11 (Skeleton) — utilitarios ME-055c
//   reutilizados bit-exact.
// - DOC 05 §14.19 comportamento canonico das checkboxes: header
//   seleciona/desseleciona apenas a pagina atual; trocar de pagina
//   preserva selecoes cumulativas; aplicar novo filtro limpa selecoes;
//   cap 500 IDs client-side com toast vermelho canonico literal.
//
// Contrato canonico:
// - Client component ('use client'). Recebe `initialResult` +
//   `initialFilters` do server (`page.tsx`), hidrata estado interativo
//   e usa `listarNotificacoesAction` (server action) para re-fetch em
//   mudancas de filtro ou paginacao.
// - `useTransition` para actions — permite loading state discreto
//   durante mutations sem bloquear o UI.
// - `useToast` (ME-055c) consome contexto do `ToastProvider` que o
//   `Layout` do shell ja envelopa (ME-055b). Nao ha `ToastProvider`
//   local — usa provider global do app.
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `NotificacoesClient` → `page.tsx`.

'use client';

import { useCallback, useMemo, useRef, useState, useTransition, type JSX } from 'react';

import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { COLORS } from '../../lib/design-tokens/colors';

import {
  arquivarAction,
  arquivarLoteAction,
  desarquivarAction,
  listarNotificacoesAction,
  marcarLidaAction,
  marcarLidasLoteAction,
  marcarNaoLidaAction,
} from './actions';
import {
  CANONICAL_DEFAULT_FILTERS,
  SELECAO_LOTE_CAP,
  TOAST_LIMITE_SELECAO_MSG,
  type NotificacoesFilters,
} from './filters';
import {
  CANONICAL_PAGE_SIZE_VALUES,
  CATEGORIA_UI_LABEL,
  CATEGORIA_UI_VALUES,
  PERIODO_UI_LABEL,
  PERIODO_UI_VALUES,
  resolveCategoriaFromTipo,
  resolveEmojiFromSeveridade,
  resolveLabelFromSeveridade,
  SEVERIDADE_UI_LABEL,
  SEVERIDADE_UI_VALUES,
  STATUS_UI_LABEL,
  STATUS_UI_VALUES,
  type CanonicalPageSize,
  type CategoriaUi,
  type PeriodoUi,
  type SeveridadeUi,
  type StatusUi,
} from './mappings';
import type { NotificacoesListResult, NotificacoesListRow } from './page';

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

export interface NotificacoesClientProps {
  readonly initialResult: NotificacoesListResult;
  readonly initialFilters: NotificacoesFilters;
}

// -----------------------------------------------------------------------
// Constantes canonicas locais
// -----------------------------------------------------------------------

const DEBOUNCE_MS = 400 as const;

// -----------------------------------------------------------------------
// Helpers puros de formatacao
// -----------------------------------------------------------------------

function formatDateTimeBr(d: Date | null): string {
  if (d === null) {
    return '—';
  }
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function statusLabel(row: NotificacoesListRow): { label: string; color: string; bg: string } {
  if (row.arquivadaEm !== null) {
    return { label: 'Arquivada', color: COLORS.text.secondary, bg: '#F3F4F6' };
  }
  if (row.lidaEm !== null) {
    return { label: 'Lida', color: COLORS.text.secondary, bg: '#F3F4F6' };
  }
  return { label: 'Não lida', color: '#1F3A5F', bg: '#DBEAFE' };
}

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function NotificacoesClient(props: NotificacoesClientProps): JSX.Element {
  const { initialResult, initialFilters } = props;

  const [result, setResult] = useState<NotificacoesListResult>(initialResult);
  const [filters, setFilters] = useState<NotificacoesFilters>(initialFilters);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [isArquivarLoteOpen, setIsArquivarLoteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------
  // Re-fetch canonico ao mudar filtros/paginacao
  // -------------------------------------------------------------------
  const refetch = useCallback(
    (nextFilters: NotificacoesFilters, resetSelection: boolean) => {
      startTransition(async () => {
        const next = await listarNotificacoesAction(nextFilters);
        setResult(next);
        setFilters(next.filtersApplied);
        if (resetSelection) {
          // §14.19: aplicar novo filtro limpa todas as selecoes.
          setSelectedIds(new Set());
        }
      });
    },
    [startTransition],
  );

  const applyFilterChange = useCallback(
    <K extends keyof NotificacoesFilters>(key: K, value: NotificacoesFilters[K]) => {
      const next: NotificacoesFilters = { ...filters, [key]: value, page: 1 };
      refetch(next, true);
    },
    [filters, refetch],
  );

  const applyPageChange = useCallback(
    (nextPage: number) => {
      const next: NotificacoesFilters = { ...filters, page: nextPage };
      // §14.19: trocar de pagina preserva selecoes cumulativas.
      refetch(next, false);
    },
    [filters, refetch],
  );

  const applyPageSizeChange = useCallback(
    (pageSize: CanonicalPageSize) => {
      const next: NotificacoesFilters = { ...filters, pageSize, page: 1 };
      refetch(next, true);
    },
    [filters, refetch],
  );

  const clearFilters = useCallback(() => {
    // §14.19: botao "Limpar filtros" restaura defaults sem confirmacao.
    refetch(CANONICAL_DEFAULT_FILTERS, true);
  }, [refetch]);

  const applySearchDebounced = useCallback(
    (raw: string) => {
      if (searchTimerRef.current !== null) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        const trimmed = raw.trim();
        const normalized = trimmed.length < 2 ? '' : trimmed.slice(0, 100);
        applyFilterChange('searchColaborador', normalized);
      }, DEBOUNCE_MS);
    },
    [applyFilterChange],
  );

  // -------------------------------------------------------------------
  // Selecoes
  // -------------------------------------------------------------------
  const toggleRowSelection = useCallback(
    (id: number, checked: boolean) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (checked) {
          if (next.size >= SELECAO_LOTE_CAP) {
            // §14.19: 501a selecao dispara toast vermelho canonico literal
            toast.push({ severity: 'danger', message: TOAST_LIMITE_SELECAO_MSG });
            return current;
          }
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    },
    [toast],
  );

  const togglePageSelection = useCallback(
    (checked: boolean) => {
      // §14.19: header seleciona/desseleciona apenas a pagina atual.
      setSelectedIds((current) => {
        const next = new Set(current);
        if (checked) {
          for (const row of result.rows) {
            if (next.size >= SELECAO_LOTE_CAP) {
              toast.push({ severity: 'danger', message: TOAST_LIMITE_SELECAO_MSG });
              return next;
            }
            next.add(row.id);
          }
        } else {
          for (const row of result.rows) {
            next.delete(row.id);
          }
        }
        return next;
      });
    },
    [result.rows, toast],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // -------------------------------------------------------------------
  // Mutations singulares
  // -------------------------------------------------------------------
  const handleMarcarLida = useCallback(
    (row: NotificacoesListRow) => {
      startTransition(async () => {
        const affected = await marcarLidaAction(row.id);
        if (affected > 0) {
          // §14.19: se `linkDestino` presente, comportamento canonico e
          // "Marcada como lida. Redirecionando para {rota}…" — nesta ME
          // apenas emitimos o toast; a navegacao real fica delegada ao
          // proprio `linkDestino` que o consumidor clicou (se aplicavel).
          if (row.linkDestino !== null) {
            toast.push({
              severity: 'success',
              message: `Marcada como lida. Redirecionando para ${row.linkDestino}…`,
            });
          } else {
            toast.push({ severity: 'success', message: 'Marcada como lida.' });
          }
          const next = await listarNotificacoesAction(filters);
          setResult(next);
        }
      });
    },
    [filters, toast],
  );

  const handleMarcarNaoLida = useCallback(
    (row: NotificacoesListRow) => {
      startTransition(async () => {
        const affected = await marcarNaoLidaAction(row.id);
        if (affected > 0) {
          toast.push({ severity: 'success', message: 'Marcada como não lida.' });
          const next = await listarNotificacoesAction(filters);
          setResult(next);
        }
      });
    },
    [filters, toast],
  );

  const handleArquivar = useCallback(
    (row: NotificacoesListRow) => {
      startTransition(async () => {
        const affected = await arquivarAction(row.id);
        if (affected > 0) {
          toast.push({ severity: 'success', message: 'Notificação arquivada.' });
          const next = await listarNotificacoesAction(filters);
          setResult(next);
        }
      });
    },
    [filters, toast],
  );

  const handleDesarquivar = useCallback(
    (row: NotificacoesListRow) => {
      startTransition(async () => {
        const affected = await desarquivarAction(row.id);
        if (affected > 0) {
          toast.push({ severity: 'success', message: 'Notificação desarquivada.' });
          const next = await listarNotificacoesAction(filters);
          setResult(next);
        }
      });
    },
    [filters, toast],
  );

  // -------------------------------------------------------------------
  // Mutations em lote
  // -------------------------------------------------------------------
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const selectedHasUnread = useMemo(() => {
    for (const row of result.rows) {
      if (selectedIds.has(row.id) && row.lidaEm === null && row.arquivadaEm === null) {
        return true;
      }
    }
    return false;
  }, [result.rows, selectedIds]);

  const selectedHasUnarchived = useMemo(() => {
    for (const row of result.rows) {
      if (selectedIds.has(row.id) && row.arquivadaEm === null) {
        return true;
      }
    }
    return false;
  }, [result.rows, selectedIds]);

  const handleMarcarLidasLote = useCallback(() => {
    startTransition(async () => {
      const total = await marcarLidasLoteAction(selectedIdsArray);
      toast.push({
        severity: 'success',
        message: `${total} notificação(ões) marcada(s) como lida.`,
      });
      const next = await listarNotificacoesAction(filters);
      setResult(next);
      setSelectedIds(new Set());
    });
  }, [filters, selectedIdsArray, toast]);

  const handleConfirmArquivarLote = useCallback(() => {
    setIsArquivarLoteOpen(false);
    startTransition(async () => {
      const total = await arquivarLoteAction(selectedIdsArray);
      toast.push({
        severity: 'success',
        message: `${total} notificação(ões) arquivada(s).`,
      });
      const next = await listarNotificacoesAction(filters);
      setResult(next);
      setSelectedIds(new Set());
    });
  }, [filters, selectedIdsArray, toast]);

  // -------------------------------------------------------------------
  // Derivados de renderizacao
  // -------------------------------------------------------------------
  const isEmpty = result.rows.length === 0;
  const isEmptyByFilter = isEmpty && result.totalCount === 0 && !filtersAreDefault(filters);
  const isEmptyInitial = isEmpty && result.totalCount === 0 && filtersAreDefault(filters);

  const totalPages = Math.max(1, Math.ceil(result.totalCount / filters.pageSize));

  const selectedInPageCount = useMemo(() => {
    let count = 0;
    for (const row of result.rows) {
      if (selectedIds.has(row.id)) {
        count += 1;
      }
    }
    return count;
  }, [result.rows, selectedIds]);
  const isPageAllSelected = result.rows.length > 0 && selectedInPageCount === result.rows.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de filtros §14.19 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          padding: 16,
          background: COLORS.background.card,
          border: `1px solid ${COLORS.border.default}`,
          borderRadius: 8,
        }}
        aria-label="Filtros"
      >
        <select
          aria-label="Tipo"
          value={filters.categoria}
          disabled={isPending}
          onChange={(e) => applyFilterChange('categoria', e.target.value as CategoriaUi)}
          style={filterControlStyle}
        >
          {CATEGORIA_UI_VALUES.map((v) => (
            <option key={v} value={v}>
              {CATEGORIA_UI_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          aria-label="Severidade"
          value={filters.severidade}
          disabled={isPending}
          onChange={(e) => applyFilterChange('severidade', e.target.value as SeveridadeUi)}
          style={filterControlStyle}
        >
          {SEVERIDADE_UI_VALUES.map((v) => (
            <option key={v} value={v}>
              {SEVERIDADE_UI_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          aria-label="Período"
          value={filters.periodo}
          disabled={isPending}
          onChange={(e) => applyFilterChange('periodo', e.target.value as PeriodoUi)}
          style={filterControlStyle}
        >
          {PERIODO_UI_VALUES.map((v) => (
            <option key={v} value={v}>
              {PERIODO_UI_LABEL[v]}
            </option>
          ))}
        </select>

        <select
          aria-label="Status"
          value={filters.status}
          disabled={isPending}
          onChange={(e) => applyFilterChange('status', e.target.value as StatusUi)}
          style={filterControlStyle}
        >
          {STATUS_UI_VALUES.map((v) => (
            <option key={v} value={v}>
              {STATUS_UI_LABEL[v]}
            </option>
          ))}
        </select>

        <input
          type="search"
          aria-label="Buscar colaborador"
          placeholder="Buscar colaborador"
          defaultValue={filters.searchColaborador}
          disabled={isPending}
          maxLength={100}
          onChange={(e) => applySearchDebounced(e.target.value)}
          style={{ ...filterControlStyle, minWidth: 220 }}
        />

        <button
          type="button"
          onClick={clearFilters}
          disabled={isPending}
          style={outlineButtonStyle}
          aria-label="Limpar filtros"
        >
          Limpar filtros
        </button>
      </div>

      {/* Estados vazios §14.19 */}
      {isEmptyInitial && (
        <div
          style={emptyStateContainer}
          aria-live="polite"
          data-testid="notificacoes-empty-initial"
        >
          <p style={emptyStateTitle}>Você ainda não recebeu nenhuma notificação</p>
          <p style={emptyStateSub}>
            Alertas gerados automaticamente pela plataforma aparecerão aqui.
          </p>
        </div>
      )}
      {isEmptyByFilter && (
        <div style={emptyStateContainer} aria-live="polite" data-testid="notificacoes-empty-filter">
          <p style={emptyStateSub}>Nenhuma notificação encontrada com os filtros aplicados.</p>
        </div>
      )}

      {/* Tabela §14.19 */}
      {!isEmpty && (
        <div
          style={{
            background: COLORS.background.card,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            overflowX: 'auto',
          }}
        >
          <table
            style={{ width: '100%', borderCollapse: 'collapse' }}
            aria-label="Lista de notificações"
          >
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ ...thStyle, width: 40 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar página atual"
                    checked={isPageAllSelected}
                    onChange={(e) => togglePageSelection(e.target.checked)}
                  />
                </th>
                <th style={thStyle}>Data/hora</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Severidade</th>
                <th style={thStyle}>Título</th>
                <th style={thStyle}>Colaborador</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const isSelected = selectedIds.has(row.id);
                const st = statusLabel(row);
                return (
                  <tr key={row.id} style={{ borderTop: `1px solid ${COLORS.border.default}` }}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar notificação ${row.id}`}
                        checked={isSelected}
                        onChange={(e) => toggleRowSelection(row.id, e.target.checked)}
                      />
                    </td>
                    <td style={tdStyle}>{formatDateTimeBr(row.createdAt)}</td>
                    <td style={tdStyle}>
                      {CATEGORIA_UI_LABEL[resolveCategoriaFromTipo(row.tipo)]}
                    </td>
                    <td style={tdStyle}>
                      <span
                        aria-label={resolveLabelFromSeveridade(row.severidade)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: '#F3F4F6',
                          fontSize: 12,
                        }}
                      >
                        <span aria-hidden="true">{resolveEmojiFromSeveridade(row.severidade)}</span>
                        {resolveLabelFromSeveridade(row.severidade)}
                      </span>
                    </td>
                    <td style={tdStyle}>{row.titulo}</td>
                    <td style={tdStyle}>{row.subtitulo ?? '—'}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: st.bg,
                          color: st.color,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {row.arquivadaEm === null && row.lidaEm === null && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleMarcarLida(row)}
                            style={linkButtonStyle}
                          >
                            Marcar como lida
                          </button>
                        )}
                        {row.arquivadaEm === null && row.lidaEm !== null && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleMarcarNaoLida(row)}
                            style={linkButtonStyle}
                          >
                            Marcar como não lida
                          </button>
                        )}
                        {row.arquivadaEm === null ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleArquivar(row)}
                            style={linkButtonStyle}
                          >
                            Arquivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDesarquivar(row)}
                            style={linkButtonStyle}
                          >
                            Desarquivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginacao §14.19 */}
      {!isEmpty && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: COLORS.text.secondary }} htmlFor="pageSize">
              Por página:
            </label>
            <select
              id="pageSize"
              value={filters.pageSize}
              disabled={isPending}
              onChange={(e) =>
                applyPageSizeChange(Number.parseInt(e.target.value, 10) as CanonicalPageSize)
              }
              style={filterControlStyle}
            >
              {CANONICAL_PAGE_SIZE_VALUES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              disabled={isPending || filters.page <= 1}
              onClick={() => applyPageChange(filters.page - 1)}
              style={outlineButtonStyle}
            >
              Anterior
            </button>
            <span style={{ fontSize: 13, color: COLORS.text.secondary }}>
              Página {filters.page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={isPending || filters.page >= totalPages}
              onClick={() => applyPageChange(filters.page + 1)}
              style={outlineButtonStyle}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Rodape de acoes em lote §14.19 */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 16,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            padding: '12px 16px',
            background: COLORS.background.card,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
          aria-live="polite"
        >
          <span style={{ fontSize: 13, color: COLORS.text.primary, fontWeight: 600 }}>
            {selectedIds.size} selecionada(s)
          </span>
          {selectedHasUnread && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleMarcarLidasLote}
              style={outlineButtonStyle}
            >
              Marcar como lidas
            </button>
          )}
          {selectedHasUnarchived && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsArquivarLoteOpen(true)}
              style={dangerButtonStyle}
            >
              Arquivar selecionadas
            </button>
          )}
          <button type="button" onClick={clearSelection} style={ghostButtonStyle}>
            Limpar seleção
          </button>
        </div>
      )}

      {/* Modal de arquivamento em lote §14.19 */}
      <Modal
        open={isArquivarLoteOpen}
        onClose={() => setIsArquivarLoteOpen(false)}
        variant="confirmation"
        ariaLabel="Arquivar notificação(ões)"
      >
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: COLORS.text.primary }}>
            Arquivar notificação(ões)
          </h2>
          <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.5 }}>
            Você está prestes a arquivar {selectedIds.size} notificação(ões). Notificações
            arquivadas somem da view padrão, mas continuam disponíveis via filtro
            &lsquo;Arquivadas&rsquo;. A ação pode ser revertida individualmente no detalhe de cada
            notificação.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setIsArquivarLoteOpen(false)}
              style={outlineButtonStyle}
            >
              Cancelar
            </button>
            <button type="button" onClick={handleConfirmArquivarLote} style={dangerButtonStyle}>
              Arquivar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// -----------------------------------------------------------------------
// Helper: comparacao de filtros contra defaults
// -----------------------------------------------------------------------

function filtersAreDefault(f: NotificacoesFilters): boolean {
  return (
    f.categoria === CANONICAL_DEFAULT_FILTERS.categoria &&
    f.severidade === CANONICAL_DEFAULT_FILTERS.severidade &&
    f.periodo === CANONICAL_DEFAULT_FILTERS.periodo &&
    f.status === CANONICAL_DEFAULT_FILTERS.status &&
    f.searchColaborador === CANONICAL_DEFAULT_FILTERS.searchColaborador
  );
}

// -----------------------------------------------------------------------
// Estilos inline canonicos (design tokens ME-055a)
// -----------------------------------------------------------------------

const filterControlStyle = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 6,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.primary,
} as const;

const outlineButtonStyle = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  color: COLORS.text.primary,
  cursor: 'pointer',
} as const;

const dangerButtonStyle = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  border: 'none',
  background: COLORS.semantic.danger,
  color: '#FFFFFF',
  cursor: 'pointer',
} as const;

const ghostButtonStyle = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: COLORS.text.secondary,
  cursor: 'pointer',
} as const;

const linkButtonStyle = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: COLORS.primary.navy,
  cursor: 'pointer',
  fontSize: 13,
  textDecoration: 'underline',
} as const;

const thStyle = {
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'left' as const,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: COLORS.text.primary,
  verticalAlign: 'middle' as const,
} as const;

const emptyStateContainer = {
  padding: '48px 24px',
  textAlign: 'center' as const,
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
};

const emptyStateTitle = {
  fontSize: 16,
  fontWeight: 600,
  color: COLORS.text.primary,
  margin: '0 0 8px 0',
};

const emptyStateSub = {
  fontSize: 13,
  color: COLORS.text.secondary,
  margin: 0,
};
