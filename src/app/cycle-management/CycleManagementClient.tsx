'use client';

// ROIP APP 9BOX — client component canonico `/cycle-management`
// (ME-B9.1 §14.18).
//
// Origem canonica:
// - DOC 05 §14.18 (Rota `/cycle-management`): 3 areas verticais —
//   Area 1 (calendario cards), Area 2 (tabela cycleSchedule
//   paginada + 3 filtros), Area 3 (solicitacoes pendentes +
//   historico 90d) + botao [+ Nova solicitacao].
// - Mockup canonico `cycle_management_v1.html` — layout, badges,
//   cores, labels literais.
// - `ModalSolicitarDesbloqueio` canonicamente reusado via L125
//   (mesmo componente de `/dados-mensais`).
//
// Comportamento canonico:
// - Carga inicial dispara 4 actions em paralelo (calendario, cycle
//   schedule, pending, historico).
// - Filtros Area 2 reaplicam `listCycleScheduleAction` com
//   `useTransition` (padrao canonico `/pendencias-portal`).
// - Botao [+ Nova solicitacao] abre modal canonico; toast canonico
//   literal pos-sucesso; recarrega pending.
// - Botao [Cancelar] confirma e recarrega pending.
// - Empty states canonicos literais DOC 05 §14.18.
//
// **RV-13.** Consumido pelo `page.tsx`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { CSSProperties, JSX } from 'react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import {
  type ModalSolicitarDesbloqueioProps,
  ModalSolicitarDesbloqueio,
} from '../../components/dados-mensais/ModalSolicitarDesbloqueio';
import { useToast } from '../../components/ui/Toast';
import { COLORS } from '../../lib/design-tokens/colors';
import { TIPO_CICLO_VALUES, type TipoCiclo } from '../../db/schema/enums';

import type {
  CalendarioEvento,
  CycleActionResult,
  CycleScheduleRow,
  CycleSchedulePage,
  UnlockRequestRow,
} from './internals';
import type { CycleScheduleFilters, PaginationPageSize } from './filters';
import { PAGINATION_PAGE_SIZE_VALUES } from './filters';
import {
  ABA_UNLOCK_LABEL,
  STATUS_CICLO_LABEL,
  STATUS_UNLOCK_LABEL,
  TAXA_RESPOSTA_FAIXA,
  TIPO_CICLO_LABEL,
  calcTaxaResposta,
  formatDateBR,
  formatDateTimeBR,
  formatMesLabel,
} from './mappings';

// -----------------------------------------------------------------------
// Textos canonicos literais DOC 05 §14.18 (export para teste — RV-13)
// -----------------------------------------------------------------------

export const EMPTY_PENDING_TEXT = 'Você não tem solicitações pendentes.' as const;
export const EMPTY_HISTORICO_TEXT = 'Nenhuma solicitação decidida nos últimos 90 dias.' as const;
export const EMPTY_CYCLE_SCHEDULE_TEXT =
  'Nenhum ciclo encontrado com os filtros aplicados.' as const;
export const EMPTY_CALENDARIO_TEXT =
  'Nenhum evento canônico no trimestre corrente/próximo.' as const;
export const EMPTY_EMPRESA_NOVA_TITLE = 'Nenhum ciclo em curso' as const;
export const EMPTY_EMPRESA_NOVA_TEXT: string =
  'Esta empresa foi cadastrada recentemente. Ciclos são criados automaticamente conforme o ' +
  'calendário canônico. O primeiro ciclo aparecerá aqui assim que o job diário rodar.';
export const FOOTER_INFORMATIVO =
  'Informativo — datas canonizadas pela plataforma (Fase 3 §6.1 e Fase 2 §5.5).' as const;
export const NOTA_AGREGADO_NOMINAL: string =
  'Nota: C-levels contam nos agregados totais desta tela, mas não aparecem nominalmente na ' +
  'tabela detalhada.';
export const TOAST_CANCEL_SUCCESS = 'Solicitação cancelada.' as const;
export const CONFIRM_CANCEL_TEXT = 'Cancelar esta solicitação? A ação não pode ser desfeita.';

// -----------------------------------------------------------------------
// Props canonicas
// -----------------------------------------------------------------------

export interface CycleManagementClientActions {
  readonly listCycleSchedule: (input: {
    readonly filters: CycleScheduleFilters;
    readonly companyIdOverride?: number;
  }) => Promise<CycleActionResult<CycleSchedulePage>>;
  readonly listPending: (input: {
    readonly companyIdOverride?: number;
  }) => Promise<CycleActionResult<readonly UnlockRequestRow[]>>;
  readonly listHistorico: (input: {
    readonly companyIdOverride?: number;
    readonly dias?: number;
  }) => Promise<CycleActionResult<readonly UnlockRequestRow[]>>;
  readonly listCalendario: (input: {
    readonly companyIdOverride?: number;
  }) => Promise<CycleActionResult<readonly CalendarioEvento[]>>;
  readonly cancelUnlockRequest: (input: {
    readonly id: number;
  }) => Promise<CycleActionResult<{ readonly id: number }>>;
  readonly createUnlockRequest: (input: {
    readonly companyId: number;
    readonly mes: string;
    readonly aba: 'rh' | 'lider' | 'faturamento';
    readonly liderId?: number;
    readonly liderTipo?: 'employee' | 'clevel';
    readonly justificativa: string;
  }) => Promise<CycleActionResult<{ readonly id: number }>>;
  readonly listMesesFechados: (input: {
    readonly companyId: number;
  }) => Promise<CycleActionResult<readonly { readonly mes: string; readonly label: string }[]>>;
}

export interface CycleManagementClientProps {
  readonly companyId: number;
  readonly initialFilters: CycleScheduleFilters;
  readonly defaultFilters: CycleScheduleFilters;
  readonly actions: CycleManagementClientActions;
}

// -----------------------------------------------------------------------
// Estilos canonicos
// -----------------------------------------------------------------------

const CARD_STYLE: CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 12,
  padding: 16,
};

const SECTION_TITLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text.tertiary,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: `1px solid ${COLORS.border.default}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  backgroundColor: '#FFFFFF',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 12,
  overflow: 'hidden',
  fontSize: 12,
};

const TH_STYLE: CSSProperties = {
  backgroundColor: COLORS.background.page,
  textTransform: 'uppercase',
  fontSize: 10,
  letterSpacing: '0.04em',
  color: COLORS.text.tertiary,
  fontWeight: 600,
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border.default}`,
  whiteSpace: 'nowrap',
};

const TD_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  color: COLORS.text.secondary,
  verticalAlign: 'middle',
};

const BTN_PRIMARIO: CSSProperties = {
  backgroundColor: COLORS.accent.teal,
  color: '#FFFFFF',
  border: `1px solid ${COLORS.accent.teal}`,
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const BTN_CANCELAR: CSSProperties = {
  backgroundColor: '#FFFFFF',
  color: COLORS.text.tertiary,
  border: `1px solid ${COLORS.border.default}`,
  padding: '5px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
};

const FILTRO_SELECT: CSSProperties = {
  padding: '6px 10px',
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  fontSize: 11,
  color: COLORS.text.secondary,
  backgroundColor: '#FFFFFF',
  cursor: 'pointer',
  minWidth: 150,
};

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export function CycleManagementClient(props: CycleManagementClientProps): JSX.Element {
  const { companyId, initialFilters, defaultFilters, actions } = props;
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [filters, setFilters] = useState<CycleScheduleFilters>(initialFilters);
  const [cyclePage, setCyclePage] = useState<CycleSchedulePage | null>(null);
  const [cycleLoading, setCycleLoading] = useState<boolean>(true);
  const [cycleError, setCycleError] = useState<string | null>(null);

  const [calendario, setCalendario] = useState<readonly CalendarioEvento[]>([]);
  const [calLoading, setCalLoading] = useState<boolean>(true);

  const [pending, setPending] = useState<readonly UnlockRequestRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState<boolean>(true);

  const [historico, setHistorico] = useState<readonly UnlockRequestRow[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState<boolean>(true);

  const [modalAberto, setModalAberto] = useState<boolean>(false);

  const reloadCycleSchedule = useCallback(
    async (f: CycleScheduleFilters) => {
      setCycleLoading(true);
      setCycleError(null);
      const r = await actions.listCycleSchedule({ filters: f });
      if (r.ok) {
        setCyclePage(r.data);
      } else {
        setCyclePage(null);
        setCycleError(r.error);
      }
      setCycleLoading(false);
    },
    [actions],
  );

  const reloadPending = useCallback(async () => {
    setPendingLoading(true);
    const r = await actions.listPending({});
    if (r.ok) {
      setPending(r.data);
    }
    setPendingLoading(false);
  }, [actions]);

  const reloadHistorico = useCallback(async () => {
    setHistoricoLoading(true);
    const r = await actions.listHistorico({ dias: 90 });
    if (r.ok) {
      setHistorico(r.data);
    }
    setHistoricoLoading(false);
  }, [actions]);

  const reloadCalendario = useCallback(async () => {
    setCalLoading(true);
    const r = await actions.listCalendario({});
    if (r.ok) {
      setCalendario(r.data);
    }
    setCalLoading(false);
  }, [actions]);

  useEffect(() => {
    void reloadCycleSchedule(filters);
    void reloadCalendario();
    void reloadPending();
    void reloadHistorico();
  }, []);

  // ------- Area 1 — Calendario -------
  const areaCalendario = useMemo((): JSX.Element => {
    if (calLoading) {
      return <div style={{ padding: 16, color: COLORS.text.tertiary }}>Carregando calendário…</div>;
    }
    if (calendario.length === 0) {
      return <div style={emptyStateStyle()}>{EMPTY_CALENDARIO_TEXT}</div>;
    }
    const nodes: JSX.Element[] = [];
    let trimestreAtual: string | null = null;
    for (const ev of calendario) {
      if (ev.trimestre !== trimestreAtual) {
        if (trimestreAtual !== null) {
          nodes.push(
            <div key={`sep-${ev.trimestre}`} style={calTrimestreSepStyle()}>
              {ev.trimestre}
            </div>,
          );
        }
        trimestreAtual = ev.trimestre;
      }
      nodes.push(
        <div key={`${ev.trimestre}-${ev.data}-${ev.titulo}`} style={calCardStyle(ev.status)}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.text.tertiary }}>
            {ev.data} · {ev.trimestre}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.text.primary,
              lineHeight: 1.3,
              marginTop: 4,
            }}
          >
            {ev.titulo}
          </div>
          <div style={{ fontSize: 10, color: COLORS.text.tertiary, marginTop: 6 }}>{ev.sub}</div>
        </div>,
      );
    }
    return <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>{nodes}</div>;
  }, [calLoading, calendario]);

  // ------- Area 2 — cycleSchedule -------
  const areaTabela = useMemo((): JSX.Element => {
    if (cycleLoading) {
      return <div style={{ padding: 16, color: COLORS.text.tertiary }}>Carregando ciclos…</div>;
    }
    if (cycleError !== null) {
      return <div style={emptyStateStyle()}>{cycleError}</div>;
    }
    if (cyclePage === null || cyclePage.rows.length === 0) {
      return <div style={emptyStateStyle()}>{EMPTY_CYCLE_SCHEDULE_TEXT}</div>;
    }
    return (
      <>
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Instrumento</th>
              <th style={TH_STYLE}>Ciclo</th>
              <th style={TH_STYLE}>Abertura</th>
              <th style={TH_STYLE}>Corte</th>
              <th style={TH_STYLE}>Fechamento</th>
              <th style={TH_STYLE}>Status</th>
              <th style={TH_STYLE}>Adesão</th>
            </tr>
          </thead>
          <tbody>
            {cyclePage.rows.map((r: CycleScheduleRow) => (
              <tr key={r.id}>
                <td style={TD_STYLE}>{TIPO_CICLO_LABEL[r.tipoCiclo]}</td>
                <td style={TD_STYLE}>{r.cicloReferencia}</td>
                <td style={TD_STYLE}>{formatDateBR(r.dataAbertura)}</td>
                <td style={TD_STYLE}>{formatDateBR(r.dataCorte)}</td>
                <td style={TD_STYLE}>{formatDateBR(r.dataFechamento)}</td>
                <td style={TD_STYLE}>{STATUS_CICLO_LABEL[r.status]}</td>
                <td style={TD_STYLE}>{renderAdesao(r.totalRespondidos, r.totalElegiveis)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: COLORS.text.tertiary,
          }}
        >
          <div>
            Página {cyclePage.page} · {cyclePage.rows.length} de {cyclePage.total} ciclos
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label>
              Por página:{' '}
              <select
                style={FILTRO_SELECT}
                value={filters.pageSize}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10);
                  if (PAGINATION_PAGE_SIZE_VALUES.includes(next as PaginationPageSize)) {
                    const nf: CycleScheduleFilters = {
                      ...filters,
                      pageSize: next as PaginationPageSize,
                      page: 1,
                    };
                    setFilters(nf);
                    startTransition(() => {
                      void reloadCycleSchedule(nf);
                    });
                  }
                }}
              >
                {PAGINATION_PAGE_SIZE_VALUES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              style={{ ...BTN_CANCELAR }}
              onClick={() => {
                if (filters.page <= 1) {
                  return;
                }
                const nf: CycleScheduleFilters = { ...filters, page: filters.page - 1 };
                setFilters(nf);
                startTransition(() => {
                  void reloadCycleSchedule(nf);
                });
              }}
              disabled={filters.page <= 1}
            >
              ← Anterior
            </button>
            <button
              style={{ ...BTN_CANCELAR }}
              onClick={() => {
                const nf: CycleScheduleFilters = { ...filters, page: filters.page + 1 };
                setFilters(nf);
                startTransition(() => {
                  void reloadCycleSchedule(nf);
                });
              }}
              disabled={cyclePage.page * cyclePage.pageSize >= cyclePage.total}
            >
              Próximo →
            </button>
          </div>
        </div>
      </>
    );
  }, [cycleLoading, cycleError, cyclePage, filters, reloadCycleSchedule]);

  // ------- Area 3 — Solicitacoes -------
  const areaSolicitacoes = useMemo((): JSX.Element => {
    const pendentesHtml = (() => {
      if (pendingLoading) {
        return (
          <div style={{ padding: 16, color: COLORS.text.tertiary }}>Carregando pendentes…</div>
        );
      }
      if (pending.length === 0) {
        return <div style={emptyStateStyle()}>{EMPTY_PENDING_TEXT}</div>;
      }
      return (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Mês</th>
              <th style={TH_STYLE}>Aba</th>
              <th style={TH_STYLE}>Líder</th>
              <th style={TH_STYLE}>Solicitante</th>
              <th style={TH_STYLE}>Justificativa</th>
              <th style={TH_STYLE}>Criada em</th>
              <th style={{ ...TH_STYLE, textAlign: 'center' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((s) => (
              <tr key={s.id}>
                <td style={TD_STYLE}>{formatMesLabel(s.mes)}</td>
                <td style={TD_STYLE}>{ABA_UNLOCK_LABEL[s.aba]}</td>
                <td style={TD_STYLE}>{s.liderNome ?? '—'}</td>
                <td style={TD_STYLE}>{s.solicitanteNome}</td>
                <td style={{ ...TD_STYLE, maxWidth: 260 }} title={s.justificativa}>
                  {truncate(s.justificativa, 80)}
                </td>
                <td style={TD_STYLE}>{formatDateTimeBR(s.createdAt)}</td>
                <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                  <button style={BTN_CANCELAR} onClick={() => void handleCancel(s.id)}>
                    Cancelar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    })();

    const historicoHtml = (() => {
      if (historicoLoading) {
        return (
          <div style={{ padding: 16, color: COLORS.text.tertiary }}>Carregando histórico…</div>
        );
      }
      if (historico.length === 0) {
        return <div style={emptyStateStyle()}>{EMPTY_HISTORICO_TEXT}</div>;
      }
      return (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Mês</th>
              <th style={TH_STYLE}>Aba / Líder</th>
              <th style={TH_STYLE}>Justificativa</th>
              <th style={TH_STYLE}>Status</th>
              <th style={TH_STYLE}>Decidido por</th>
              <th style={TH_STYLE}>Decidido em</th>
              <th style={TH_STYLE}>Motivo / Comentário</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((s) => (
              <tr key={s.id}>
                <td style={TD_STYLE}>{formatMesLabel(s.mes)}</td>
                <td style={TD_STYLE}>
                  {ABA_UNLOCK_LABEL[s.aba]}
                  {s.liderNome !== null ? ` · ${s.liderNome}` : ''}
                </td>
                <td style={{ ...TD_STYLE, maxWidth: 260 }} title={s.justificativa}>
                  {truncate(s.justificativa, 80)}
                </td>
                <td style={TD_STYLE}>{STATUS_UNLOCK_LABEL[s.status]}</td>
                <td style={TD_STYLE}>{s.decididoPorNome ?? '—'}</td>
                <td style={TD_STYLE}>{formatDateTimeBR(s.decididoEm)}</td>
                <td style={{ ...TD_STYLE, maxWidth: 260 }}>
                  {s.motivoRecusa ?? s.comentarioAprovacao ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    })();

    return (
      <div style={CARD_STYLE}>
        <div style={SECTION_TITLE}>
          <span>Solicitações de desbloqueio de mês</span>
          <button style={BTN_PRIMARIO} onClick={() => setModalAberto(true)}>
            + Nova solicitação de desbloqueio
          </button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.text.tertiary, marginTop: 8 }}>
          Pendentes {pending.length > 0 ? `(${pending.length})` : ''}
        </div>
        <div style={{ marginTop: 8 }}>{pendentesHtml}</div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: COLORS.text.tertiary,
            marginTop: 20,
          }}
        >
          Histórico (últimos 90 dias)
        </div>
        <div style={{ marginTop: 8 }}>{historicoHtml}</div>
      </div>
    );
  }, [pending, pendingLoading, historico, historicoLoading]);

  async function handleCancel(id: number): Promise<void> {
    const confirmed = typeof window !== 'undefined' ? window.confirm(CONFIRM_CANCEL_TEXT) : false;
    if (!confirmed) {
      return;
    }
    const r = await actions.cancelUnlockRequest({ id });
    if (r.ok) {
      toast.push({ severity: 'success', message: TOAST_CANCEL_SUCCESS });
      await reloadPending();
      await reloadHistorico();
    } else {
      toast.push({ severity: 'danger', message: r.error });
    }
  }

  return (
    <>
      <div style={CARD_STYLE}>
        <div style={SECTION_TITLE}>
          <span>Calendário do trimestre corrente e próximo</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: COLORS.text.tertiary,
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            {FOOTER_INFORMATIVO}
          </span>
        </div>
        {areaCalendario}
      </div>
      <div style={CARD_STYLE}>
        <div style={SECTION_TITLE}>Status dos ciclos</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <select
            style={FILTRO_SELECT}
            value={filters.tipoCiclo ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const nextTipo = v === '' ? null : (v as TipoCiclo);
              const nf: CycleScheduleFilters = { ...filters, tipoCiclo: nextTipo, page: 1 };
              setFilters(nf);
              startTransition(() => {
                void reloadCycleSchedule(nf);
              });
            }}
          >
            <option value="">Instrumento: todos</option>
            {TIPO_CICLO_VALUES.map((t) => (
              <option key={t} value={t}>
                {TIPO_CICLO_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.status ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next = v === 'aberto' || v === 'atrasado' || v === 'fechado' ? v : null;
              const nf: CycleScheduleFilters = { ...filters, status: next, page: 1 };
              setFilters(nf);
              startTransition(() => {
                void reloadCycleSchedule(nf);
              });
            }}
          >
            <option value="">Status: todos</option>
            <option value="aberto">Aberto</option>
            <option value="atrasado">Atrasado</option>
            <option value="fechado">Fechado</option>
          </select>
          <select
            style={FILTRO_SELECT}
            value={filters.periodo}
            onChange={(e) => {
              const v = e.target.value;
              const next =
                v === 'trimestre_atual' || v === 'trimestre_anterior' || v === 'ultimos_90_dias'
                  ? (v as CycleScheduleFilters['periodo'])
                  : defaultFilters.periodo;
              const nf: CycleScheduleFilters = { ...filters, periodo: next, page: 1 };
              setFilters(nf);
              startTransition(() => {
                void reloadCycleSchedule(nf);
              });
            }}
          >
            <option value="trimestre_atual">Período: trimestre atual</option>
            <option value="trimestre_anterior">Período: trimestre anterior</option>
            <option value="ultimos_90_dias">Período: últimos 90 dias</option>
          </select>
        </div>
        {areaTabela}
        <div
          style={{
            fontSize: 11,
            color: COLORS.text.tertiary,
            marginTop: 10,
            fontStyle: 'italic',
          }}
        >
          {NOTA_AGREGADO_NOMINAL}
        </div>
      </div>
      {areaSolicitacoes}
      {modalAberto ? (
        <ModalSolicitarDesbloqueio
          companyId={companyId}
          initialMes={''}
          initialAba={'rh'}
          onClose={() => setModalAberto(false)}
          onSuccess={(msg) => {
            setModalAberto(false);
            toast.push({ severity: 'success', message: msg });
            void reloadPending();
          }}
          listMesesFechados={async ({ companyId: cid }) => {
            const r = await actions.listMesesFechados({ companyId: cid });
            if (r.ok) {
              return {
                ok: true,
                data: r.data.map((m) => ({ mes: m.mes, label: m.label })),
              };
            }
            return { ok: false, message: r.error };
          }}
          listCompanyLeaders={
            (async () => {
              // RV-13: lider list fica a cargo da action canonica
              // separada quando o usuario trocar a aba para 'lider'.
              return { ok: true, data: [] };
            }) satisfies ModalSolicitarDesbloqueioProps['listCompanyLeaders']
          }
          createUnlockRequest={async (inp) => {
            const r = await actions.createUnlockRequest({
              companyId: inp.companyId,
              mes: inp.mes,
              aba: inp.aba,
              liderId: inp.liderId,
              liderTipo: inp.liderTipo,
              justificativa: inp.justificativa,
            });
            if (r.ok) {
              return { ok: true, data: { id: r.data.id } };
            }
            return { ok: false, message: r.error };
          }}
        />
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------
// Helpers de render internos
// -----------------------------------------------------------------------

function renderAdesao(respondidos: number | null, elegiveis: number | null): JSX.Element {
  const r = respondidos ?? 0;
  const e = elegiveis ?? 0;
  const pct = calcTaxaResposta(r, e);
  const faixa = TAXA_RESPOSTA_FAIXA(pct);
  const cor =
    faixa === 'alta'
      ? COLORS.semantic.success
      : faixa === 'media'
        ? COLORS.semantic.warning
        : COLORS.semantic.danger;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ minWidth: 60 }}>
        {r}/{e}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          backgroundColor: COLORS.border.default,
          borderRadius: 3,
          overflow: 'hidden',
          minWidth: 60,
          maxWidth: 100,
        }}
      >
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: cor }} />
      </div>
      <span style={{ color: COLORS.text.tertiary, fontSize: 10 }}>{pct}%</span>
    </div>
  );
}

function calTrimestreSepStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: '0 6px',
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.text.tertiary,
    textTransform: 'uppercase',
    borderLeft: `1px dashed ${COLORS.border.default}`,
    borderRight: `1px dashed ${COLORS.border.default}`,
  };
}

function calCardStyle(status: CalendarioEvento['status']): CSSProperties {
  const borderColor =
    status === 'concluido'
      ? COLORS.semantic.success
      : status === 'atrasado'
        ? COLORS.semantic.warning
        : status === 'atual'
          ? COLORS.accent.teal
          : COLORS.border.default;
  return {
    flexShrink: 0,
    width: 180,
    backgroundColor: status === 'futuro' ? '#FAFBFC' : '#FFFFFF',
    border: `1px solid ${COLORS.border.default}`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 10,
    padding: '10px 12px',
    position: 'relative',
  };
}

function emptyStateStyle(): CSSProperties {
  return {
    backgroundColor: '#FFFFFF',
    border: `1px dashed ${COLORS.border.default}`,
    borderRadius: 12,
    padding: '24px 16px',
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.text.tertiary,
    fontStyle: 'italic',
  };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) {
    return s;
  }
  return s.slice(0, n - 1) + '…';
}
