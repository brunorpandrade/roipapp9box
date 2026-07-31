'use client';

// ROIP APP 9BOX — client component `/pendencias-portal` (ME-058 §14.23).
//
// Origem canonica:
// - DOC 05 §14.23 (Rota `/pendencias-portal`) + mockup canonico
//   `painel_principal_fase7_v5.html` linhas 1192-1400 (CC047).
// - 3 cards resumo, 6 filtros (wrap responsivo), tabela 11 colunas
//   (foto+nome sticky), ordenacao tripla canonica S328, paginacao
//   25/50/100 default 50.
// - Modais canonicos:
//   - Individual (§14.23 linhas 2648-2657): titulo "Enviar lembrete",
//     corpo literal "O colaborador receberá um e-mail com link direto...",
//     toast pos-envio literal "Lembrete enviado para [Nome]...".
//   - Massivo (§14.23 linhas 2659-2663): titulo "Enviar lembretes em
//     massa", corpo literal "Serão processadas [N] pendências...",
//     toast pos-envio literal "Envio processado: N lembretes enviados,
//     M pulados por cooldown, K falharam.".
// - Cooldown 72h: tooltip literal "Lembrete já enviado em [dd/mm/aaaa
//   hh:mm]. Próximo envio disponível em [dd/mm/aaaa hh:mm]." §14.23
//   linha 2657.
//
// **RV-13.** `PendenciasClient` (component) → consumido por page.tsx
// de ambas as rotas (RH pura e Bruno dentro-de-empresa).

import { useCallback, useMemo, useState, useTransition, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type { PendenciaRow, PendenciasLoadResult } from '../../lib/pendencias/pendenciasEngine';
import { DEPARTAMENTO_VALUES, type PortalInstrumentType } from '../../db/schema/enums';

import {
  atualizarPendenciasAction,
  enviarLembreteAction,
  enviarLembretesEmMassaAction,
} from './actions';
import { CANONICAL_PENDENCIAS_DEFAULT_FILTERS, type PendenciasFilters } from './filters';
import {
  CARD_RESUMO_COLOR,
  INSTRUMENT_LABEL,
  INSTRUMENT_ORDER,
  STATUS_LABEL,
  formatCooldownTimestamp,
  formatDiasAtraso,
  formatPrazoOriginal,
  resolveDiasAtrasoColor,
  type PendenciaStatus,
} from './mappings';

// -----------------------------------------------------------------------
// Props canonicas
// -----------------------------------------------------------------------

export interface PendenciasClientProps {
  /**
   * Company id explicito quando a rota corrente e Bruno dentro-de-empresa
   * (`/super-admin/empresa/[id]/pendencias-portal`); null quando e RH
   * puro (companyId vem da sessao no action).
   */
  readonly companyId: number | null;
  readonly initialResult: PendenciasLoadResult;
  readonly initialFilters: PendenciasFilters;
}

// -----------------------------------------------------------------------
// Estilos canonicos (padrao S321 ME-057c)
// -----------------------------------------------------------------------

const CARD_STYLE: CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const RESUMO_ROW: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
};

const RESUMO_CARD_BASE: CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const RESUMO_CONTADOR: CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
};

const RESUMO_LABEL: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: COLORS.text.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const FILTROS_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
};

const FILTRO_INPUT: CSSProperties = {
  padding: '6px 10px',
  fontSize: 13,
  border: `1px solid ${'#D1D5DB'}`,
  borderRadius: 6,
  minWidth: 140,
};

const TABLE_WRAPPER: CSSProperties = {
  overflowX: 'auto',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  backgroundColor: '#FFFFFF',
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const TH_STYLE: CSSProperties = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.text.secondary,
  textAlign: 'left',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  backgroundColor: '#F9FAFB',
  whiteSpace: 'nowrap',
};

const TD_STYLE: CSSProperties = {
  padding: '10px 12px',
  color: COLORS.text.primary,
  borderBottom: `1px solid ${'#F3F4F6'}`,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

const AVATAR_STYLE: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  objectFit: 'cover',
  border: `1px solid ${COLORS.border.default}`,
};

const AVATAR_PLACEHOLDER: CSSProperties = {
  ...AVATAR_STYLE,
  backgroundColor: '#F3F4F6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.secondary,
};

const BADGE_STATUS_BASE: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 12,
};

const ACTION_LINK: CSSProperties = {
  color: COLORS.accent.teal,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'underline',
  background: 'none',
  border: 'none',
  padding: 0,
};

const ACTION_LINK_DISABLED: CSSProperties = {
  ...ACTION_LINK,
  color: COLORS.text.quaternary,
  cursor: 'not-allowed',
  textDecoration: 'none',
};

const MODAL_OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const MODAL_CARD: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 8,
  padding: 24,
  maxWidth: 480,
  width: 'calc(100% - 32px)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const BTN_PRIMARY: CSSProperties = {
  backgroundColor: COLORS.accent.teal,
  color: '#FFFFFF',
  padding: '8px 16px',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_OUTLINE: CSSProperties = {
  backgroundColor: '#FFFFFF',
  color: COLORS.text.primary,
  padding: '8px 16px',
  border: `1px solid ${'#D1D5DB'}`,
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const TOAST_STYLE: CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  backgroundColor: '#1F2937',
  color: '#FFFFFF',
  padding: '12px 16px',
  borderRadius: 8,
  fontSize: 13,
  maxWidth: 400,
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  zIndex: 1100,
};

// -----------------------------------------------------------------------
// Helpers de renderizacao
// -----------------------------------------------------------------------

function initialsOf(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function statusBadgeStyle(status: PendenciaStatus): CSSProperties {
  if (status === 'Atrasado') {
    return {
      ...BADGE_STATUS_BASE,
      backgroundColor: '#FEE2E2',
      color: '#991B1B',
    };
  }
  return {
    ...BADGE_STATUS_BASE,
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
  };
}

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function PendenciasClient(props: PendenciasClientProps): JSX.Element {
  const [result, setResult] = useState<PendenciasLoadResult>(props.initialResult);
  const [filters, setFilters] = useState<PendenciasFilters>(props.initialFilters);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  // Modal state
  const [modalIndividual, setModalIndividual] = useState<PendenciaRow | null>(null);
  const [modalMassa, setModalMassa] = useState<boolean>(false);

  const refetch = useCallback(
    (nextFilters: PendenciasFilters, nextPage: number, nextPageSize: 25 | 50 | 100) => {
      startTransition(() => {
        void atualizarPendenciasAction({
          companyId: props.companyId,
          filters: nextFilters,
          page: nextPage,
          pageSize: nextPageSize,
        }).then((r) => {
          setResult(r);
          setFilters(nextFilters);
        });
      });
    },
    [props.companyId],
  );

  const updateFilter = useCallback(
    <K extends keyof PendenciasFilters>(key: K, value: PendenciasFilters[K]): void => {
      const next: PendenciasFilters = { ...filters, [key]: value };
      refetch(next, 1, result.pageSize);
    },
    [filters, refetch, result.pageSize],
  );

  const clearFilters = useCallback(() => {
    refetch(CANONICAL_PENDENCIAS_DEFAULT_FILTERS, 1, result.pageSize);
  }, [refetch, result.pageSize]);

  const changePage = useCallback(
    (nextPage: number) => {
      refetch(filters, nextPage, result.pageSize);
    },
    [filters, refetch, result.pageSize],
  );

  const changePageSize = useCallback(
    (nextSize: 25 | 50 | 100) => {
      refetch(filters, 1, nextSize);
    },
    [filters, refetch],
  );

  const confirmarIndividual = useCallback(
    (row: PendenciaRow) => {
      startTransition(() => {
        void enviarLembreteAction({
          companyId: props.companyId,
          employeeId: row.userId,
          instrumento: row.instrumento,
          cicloReferencia: row.cicloReferencia,
        }).then((res) => {
          setModalIndividual(null);
          if (res.success && res.sentAt !== null) {
            const proximo = new Date(res.sentAt.getTime() + 72 * 60 * 60 * 1000);
            setToast(
              `Lembrete enviado para ${row.nome} sobre ${INSTRUMENT_LABEL[row.instrumento]}. ` +
                `Próximo envio permitido em ${formatCooldownTimestamp(proximo)}.`,
            );
          } else if (res.reason === 'cooldown') {
            setToast('Lembrete em cooldown. Tente novamente após 72h do último envio.');
          } else {
            setToast('Falha no envio do lembrete. Tente novamente.');
          }
          refetch(filters, result.page, result.pageSize);
        });
      });
    },
    [filters, props.companyId, refetch, result.page, result.pageSize],
  );

  const confirmarMassa = useCallback(() => {
    const alvos = result.rows.map((r) => ({
      employeeId: r.userId,
      instrumento: r.instrumento,
      cicloReferencia: r.cicloReferencia,
    }));
    startTransition(() => {
      void enviarLembretesEmMassaAction({
        companyId: props.companyId,
        alvos,
      }).then((res) => {
        setModalMassa(false);
        setToast(
          `Envio processado: ${res.enviados} lembretes enviados, ` +
            `${res.puladosCooldown} pulados por cooldown, ${res.falhas} falharam.`,
        );
        refetch(filters, result.page, result.pageSize);
      });
    });
  }, [filters, props.companyId, refetch, result.page, result.pageSize, result.rows]);

  const totalPendenciasVisao = result.totals.atrasadas + result.totals.pendentes;
  const emCooldown = useMemo(
    () => result.rows.filter((r) => r.cooldownUntil !== null).length,
    [result.rows],
  );
  const disponiveisMassa = result.rows.length - emCooldown;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabecalho contador + botoes */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.text.secondary }}>
          {totalPendenciasVisao} pendências · {result.totals.colaboradoresImpactados} colaboradores
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            style={BTN_PRIMARY}
            disabled={isPending || result.rows.length === 0}
            onClick={() => setModalMassa(true)}
          >
            📧 Enviar lembrete em massa
          </button>
        </div>
      </div>

      {/* 3 cards resumo */}
      <div style={RESUMO_ROW}>
        <div
          style={{
            ...RESUMO_CARD_BASE,
            borderLeft: `4px solid ${CARD_RESUMO_COLOR.atrasadas}`,
          }}
        >
          <div style={RESUMO_LABEL}>Atrasadas</div>
          <div style={{ ...RESUMO_CONTADOR, color: CARD_RESUMO_COLOR.atrasadas }}>
            {result.totals.atrasadas}
          </div>
        </div>
        <div
          style={{
            ...RESUMO_CARD_BASE,
            borderLeft: `4px solid ${CARD_RESUMO_COLOR.pendentes}`,
          }}
        >
          <div style={RESUMO_LABEL}>Pendentes</div>
          <div style={{ ...RESUMO_CONTADOR, color: CARD_RESUMO_COLOR.pendentes }}>
            {result.totals.pendentes}
          </div>
        </div>
        <div
          style={{
            ...RESUMO_CARD_BASE,
            borderLeft: `4px solid ${CARD_RESUMO_COLOR.colaboradores}`,
          }}
        >
          <div style={RESUMO_LABEL}>Colaboradores impactados</div>
          <div style={{ ...RESUMO_CONTADOR, color: CARD_RESUMO_COLOR.colaboradores }}>
            {result.totals.colaboradoresImpactados}
          </div>
        </div>
      </div>

      {/* Barra de filtros */}
      <div style={CARD_STYLE}>
        <div style={FILTROS_ROW}>
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou cargo"
            value={filters.q ?? ''}
            onChange={(e) => updateFilter('q', e.target.value.length > 0 ? e.target.value : null)}
            style={{ ...FILTRO_INPUT, minWidth: 220 }}
          />
          <select
            value={filters.departamento ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              updateFilter(
                'departamento',
                v === '' ? null : (v as PendenciasFilters['departamento']),
              );
            }}
            style={FILTRO_INPUT}
          >
            <option value="">Todos os departamentos</option>
            {DEPARTAMENTO_VALUES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={filters.liderDiretoId?.toString() ?? ''}
            onChange={(e) =>
              updateFilter('liderDiretoId', e.target.value === '' ? null : Number(e.target.value))
            }
            style={FILTRO_INPUT}
          >
            <option value="">Todos os líderes</option>
            {result.lideresDisponiveis.map((l) => (
              <option key={l.id} value={l.id.toString()}>
                {l.nome}
              </option>
            ))}
          </select>
          <select
            value={filters.instrumento ?? ''}
            onChange={(e) =>
              updateFilter(
                'instrumento',
                e.target.value === '' ? null : (e.target.value as PortalInstrumentType),
              )
            }
            style={FILTRO_INPUT}
          >
            <option value="">Todos os instrumentos</option>
            {INSTRUMENT_ORDER.map((i) => (
              <option key={i} value={i}>
                {INSTRUMENT_LABEL[i]}
              </option>
            ))}
          </select>
          <select
            value={filters.status ?? ''}
            onChange={(e) =>
              updateFilter(
                'status',
                e.target.value === '' ? null : (e.target.value as PendenciaStatus),
              )
            }
            style={FILTRO_INPUT}
          >
            <option value="">Todos os status</option>
            <option value="Pendente">{STATUS_LABEL.Pendente}</option>
            <option value="Atrasado">{STATUS_LABEL.Atrasado}</option>
          </select>
          <select
            value={filters.cicloReferencia ?? ''}
            onChange={(e) =>
              updateFilter('cicloReferencia', e.target.value === '' ? null : e.target.value)
            }
            style={FILTRO_INPUT}
          >
            <option value="">Todos os ciclos</option>
            {result.ciclosDisponiveis.map((c) => (
              <option key={`${c.tipoCiclo}:${c.cicloReferencia}`} value={c.cicloReferencia}>
                {c.cicloReferencia} · {c.tipoCiclo}
              </option>
            ))}
          </select>
          <button type="button" style={BTN_OUTLINE} onClick={clearFilters} disabled={isPending}>
            Limpar filtros
          </button>
          <button
            type="button"
            style={BTN_OUTLINE}
            onClick={() => refetch(filters, result.page, result.pageSize)}
            disabled={isPending}
          >
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* Tabela ou empty state */}
      {result.rows.length === 0 ? (
        <div
          style={{
            ...CARD_STYLE,
            alignItems: 'center',
            padding: 32,
            color: COLORS.text.secondary,
          }}
        >
          {result.totalRows === 0 && props.initialResult.totalRows === 0
            ? 'Todos os colaboradores estão em dia com o portal ✓'
            : 'Nenhuma pendência atende aos filtros aplicados.'}
        </div>
      ) : (
        <div style={TABLE_WRAPPER}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Foto</th>
                <th style={TH_STYLE}>Nome</th>
                <th style={TH_STYLE}>Cargo</th>
                <th style={TH_STYLE}>Departamento</th>
                <th style={TH_STYLE}>Líder direto</th>
                <th style={TH_STYLE}>Instrumento</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Prazo original</th>
                <th style={TH_STYLE}>Dias em atraso</th>
                <th style={TH_STYLE}>Ciclo</th>
                <th style={TH_STYLE}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const emCooldown = row.cooldownUntil !== null;
                return (
                  <tr key={row.key}>
                    <td style={TD_STYLE}>
                      {row.photoUrl !== null ? (
                        <img src={row.photoUrl} alt={row.nome} style={AVATAR_STYLE} />
                      ) : (
                        <div style={AVATAR_PLACEHOLDER} aria-label={row.nome}>
                          {initialsOf(row.nome)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...TD_STYLE, fontWeight: 500 }}>{row.nome}</td>
                    <td style={TD_STYLE}>{row.cargo}</td>
                    <td style={TD_STYLE}>{row.departamento}</td>
                    <td style={TD_STYLE}>{row.liderNome ?? '—'}</td>
                    <td style={TD_STYLE}>{INSTRUMENT_LABEL[row.instrumento]}</td>
                    <td style={TD_STYLE}>
                      <span style={statusBadgeStyle(row.status)}>{STATUS_LABEL[row.status]}</span>
                    </td>
                    <td style={TD_STYLE}>{formatPrazoOriginal(row.prazoOriginal)}</td>
                    <td
                      style={{
                        ...TD_STYLE,
                        color: resolveDiasAtrasoColor(row.diasEmAtraso),
                        fontWeight: 600,
                      }}
                    >
                      {formatDiasAtraso(row.diasEmAtraso)}
                    </td>
                    <td style={TD_STYLE}>{row.cicloReferencia ?? '—'}</td>
                    <td style={TD_STYLE}>
                      {emCooldown && row.cooldownUntil !== null ? (
                        <button
                          type="button"
                          style={ACTION_LINK_DISABLED}
                          disabled
                          title={
                            `Lembrete já enviado. Próximo envio disponível em ` +
                            `${formatCooldownTimestamp(row.cooldownUntil)}.`
                          }
                        >
                          📧 Enviar lembrete
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={ACTION_LINK}
                          disabled={isPending}
                          onClick={() => setModalIndividual(row)}
                        >
                          📧 Enviar lembrete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginacao */}
      {result.rows.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, color: COLORS.text.secondary }}>
            Página {result.page} de {result.totalPages} · {result.totalRows} pendências no total
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={result.pageSize.toString()}
              onChange={(e) => changePageSize(Number(e.target.value) as 25 | 50 | 100)}
              style={FILTRO_INPUT}
              disabled={isPending}
            >
              <option value="25">25 por página</option>
              <option value="50">50 por página</option>
              <option value="100">100 por página</option>
            </select>
            <button
              type="button"
              style={BTN_OUTLINE}
              disabled={isPending || result.page <= 1}
              onClick={() => changePage(result.page - 1)}
            >
              ← Anterior
            </button>
            <button
              type="button"
              style={BTN_OUTLINE}
              disabled={isPending || result.page >= result.totalPages}
              onClick={() => changePage(result.page + 1)}
            >
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* Modal individual */}
      {modalIndividual !== null && (
        <div style={MODAL_OVERLAY} role="dialog" aria-modal="true">
          <div style={MODAL_CARD}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Enviar lembrete</h2>
            <div style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 1.5 }}>
              <div>
                <strong>Colaborador:</strong> {modalIndividual.nome}
              </div>
              <div>
                <strong>Instrumento:</strong> {INSTRUMENT_LABEL[modalIndividual.instrumento]}
              </div>
              <p style={{ marginTop: 12, marginBottom: 0 }}>
                O colaborador receberá um e-mail com link direto para o portal. Cooldown de 72h
                aplicado após o envio.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={BTN_OUTLINE} onClick={() => setModalIndividual(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={BTN_PRIMARY}
                disabled={isPending}
                onClick={() => confirmarIndividual(modalIndividual)}
              >
                ✉️ Confirmar envio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal massa */}
      {modalMassa && (
        <div style={MODAL_OVERLAY} role="dialog" aria-modal="true">
          <div style={MODAL_CARD}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Enviar lembretes em massa</h2>
            <div style={{ fontSize: 13, color: COLORS.text.secondary, lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>
                Serão processadas {result.rows.length} pendências afetando{' '}
                {result.totals.colaboradoresImpactados} colaboradores.
              </p>
              <p style={{ marginTop: 8, marginBottom: 0 }}>
                {emCooldown} pendências estão em cooldown e serão puladas automaticamente. Os{' '}
                {disponiveisMassa} envios restantes serão executados sequencialmente.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={BTN_OUTLINE} onClick={() => setModalMassa(false)}>
                Cancelar
              </button>
              <button
                type="button"
                style={BTN_PRIMARY}
                disabled={isPending || disponiveisMassa === 0}
                onClick={confirmarMassa}
              >
                ✉️ Confirmar envio em massa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast !== null && (
        <div style={TOAST_STYLE} role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
