'use client';

// ROIP APP 9BOX — client component canonico compartilhado da rota
// `/dados-mensais` (RH) e `/super-admin/empresa/[id]/dados-mensais`
// (Bruno). Extracao canonica bit-exact do original super-admin
// (ME-079a, 1052 linhas) com prop `variant` + `actions` injetadas
// (D-086b-2 B aprovada — padrao bit-exact `RelatoriosClient` ME-B9-CR).
//
// Origem canonica:
// - CAMADA_UI §14.13 (dados mensais RH — abas + navegacao por mes +
//   comportamento por status + botao `[Solicitar desbloqueio]` D051/
//   D052/D053).
// - CAMADA_UI §14.16 (modal integral).
// - CAMADA_UI §14.17 (botao `[Desbloquear mes]` exclusivo Bruno).
// - CAMADA_AUTH §10.4 (matriz).
// - CAMADA_NEGOCIO §11.
//
// Variantes canonicas bit-exact (D-086b-2 B):
//   - `variant='super_admin'`: Bruno. Botao `[Desbloquear mes]` visivel
//     em meses fechados; NUNCA renderiza `[Solicitar desbloqueio]`.
//     Aba Lideres editavel via `saveMonthlyLeaderData` (nao implementada
//     ainda neste componente — MASTER §3.5 canoniza status-only visao).
//   - `variant='rh'`: RH puro / RH-Lider. NUNCA renderiza `[Desbloquear
//     mes]`; renderiza `[Solicitar desbloqueio]` conforme comportamento
//     canonico D051/D052/D053 (§14.13). Aba Lideres READ-ONLY (D-086b-5
//     A aprovada — status-only). Modal `[Solicitar desbloqueio]` §14.16
//     integral aberto ao clicar.
//
// **RV-13.** Imports consumidos:
//   - Types e helpers de `./internals`.
//   - `ModalSolicitarDesbloqueio` de `./ModalSolicitarDesbloqueio`.
//   - Actions via prop.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type { MonthlyInputFormRHRow, LeaderStatusRow } from '../../server/routers/monthlyData';

import { ModalSolicitarDesbloqueio } from './ModalSolicitarDesbloqueio';
import {
  DADOS_MENSAIS_TABS,
  formatMesLabel,
  nextMes,
  prevMes,
  STATUS_COLORS,
  STATUS_LABELS,
  TAB_LABELS,
  type DadosMensaisClientProps,
  type DadosMensaisTab,
  type StatusMes,
} from './internals';

// -----------------------------------------------------------------------
// Estilos canonicos bit-exact (mockup dados_mensais_rh_v2.html)
// -----------------------------------------------------------------------

const CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
} as const;

const TABLE_WRAP_STYLE = {
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  overflow: 'hidden' as const,
} as const;

const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: 12,
} as const;

const TH_STYLE = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 600,
  color: COLORS.text.secondary,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.06,
  borderBottom: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.elevated,
  whiteSpace: 'nowrap' as const,
} as const;

const TD_STYLE = {
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  color: COLORS.text.primary,
  verticalAlign: 'middle' as const,
} as const;

const INPUT_STYLE = {
  padding: '6px 10px',
  border: `1px solid ${'#D1D5DB'}`,
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit',
  color: COLORS.text.primary,
  background: 'white',
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
} as const;

const TAB_BASE = {
  display: 'inline-flex',
  alignItems: 'center' as const,
  gap: 6,
  padding: '10px 16px',
  border: 'none',
  background: 'transparent',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  color: COLORS.text.secondary,
  transition: 'all 0.15s',
} as const;

const TAB_ACTIVE = {
  ...TAB_BASE,
  color: '#1F3A5F',
  fontWeight: 600,
  borderBottomColor: '#14B8A6',
} as const;

// -----------------------------------------------------------------------
// Tipo local para tracking de edicoes por celula
// -----------------------------------------------------------------------

interface RHCellEdit {
  custoTotalMes: string;
  faltas: string;
}

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function DadosMensaisClient(props: DadosMensaisClientProps): JSX.Element {
  const { companyId, companyName, initialMes, initialStatus, initialTab, variant, actions } = props;

  // Estado
  const [activeTab, setActiveTab] = useState<DadosMensaisTab>(initialTab);
  const [mes, setMes] = useState(initialMes);
  const [status, setStatus] = useState<StatusMes>((initialStatus as StatusMes) || 'aberto');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Aba RH
  const [rhData, setRhData] = useState<MonthlyInputFormRHRow[]>([]);
  const [diasUteis, setDiasUteis] = useState<string>('');
  const [edits, setEdits] = useState<Map<number, RHCellEdit>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');

  // Aba Lideres
  const [leaders, setLeaders] = useState<LeaderStatusRow[]>([]);

  // Estado canonico variant='rh': solicitacao pendente + modal
  const [hasPending, setHasPending] = useState<boolean>(false);
  const [pendingRequestedAt, setPendingRequestedAt] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);

  // Flag de dirty (alteracoes nao salvas)
  const isDirty = edits.size > 0;

  // E editavel? Bruno sempre pode editar em aberto/desbloqueado; RH so
  // em aberto/desbloqueado (mesma regra — bloqueio server-side).
  const isEditable = status !== 'fechado';

  // -------------------------------------------------------------------
  // Fetch dados ao trocar mes ou aba
  // -------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEdits(new Map());
    setSearchQuery('');

    try {
      // Closure status
      const csResult = await actions.getClosureStatus({
        companyId,
        mes,
      });
      if (csResult.ok) {
        setStatus(csResult.data.status as StatusMes);
      }

      if (activeTab === 'rh') {
        const result = await actions.loadMonthlyForm({
          companyId,
          mes,
          aba: 'rh',
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (result.data.abaAtiva === 'rh') {
          setRhData(result.data.colaboradores);
          setDiasUteis(result.data.diasUteis !== null ? String(result.data.diasUteis) : '');
        }
      } else {
        const result = await actions.getLeadersStatus({
          companyId,
          mes,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setLeaders(result.data);
      }
    } catch {
      setError('Não foi possível carregar os dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [companyId, mes, activeTab, actions]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------
  // Fetch hasPending canonico bit-exact (variant='rh' + status='fechado')
  // -------------------------------------------------------------------

  useEffect(() => {
    if (variant !== 'rh' || status !== 'fechado') {
      setHasPending(false);
      setPendingRequestedAt(null);
      return;
    }
    if (actions.hasPendingRequest === undefined) {
      return;
    }
    let cancelled = false;
    const check = async (): Promise<void> => {
      const result = await actions.hasPendingRequest!({
        companyId,
        mes,
        aba: activeTab === 'rh' ? 'rh' : 'lider',
      });
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setHasPending(result.data.hasPending);
        setPendingRequestedAt(result.data.requestedAt);
      }
    };
    void check();
    return (): void => {
      cancelled = true;
    };
  }, [variant, status, companyId, mes, activeTab, actions]);

  // -------------------------------------------------------------------
  // Toast auto-dismiss
  // -------------------------------------------------------------------

  useEffect(() => {
    if (toast !== null) {
      const id = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  // -------------------------------------------------------------------
  // Handlers de navegacao
  // -------------------------------------------------------------------

  const handlePrevMes = useCallback(() => {
    setMes((m) => prevMes(m));
  }, []);

  const handleNextMes = useCallback(() => {
    setMes((m) => nextMes(m));
  }, []);

  const handleTabChange = useCallback((tab: DadosMensaisTab) => {
    setActiveTab(tab);
  }, []);

  // -------------------------------------------------------------------
  // Handlers de edicao aba RH
  // -------------------------------------------------------------------

  const handleCellChange = useCallback(
    (empId: number, field: keyof RHCellEdit, value: string) => {
      setEdits((prev) => {
        const next = new Map(prev);
        const existing = next.get(empId);
        const row = rhData.find((r) => r.employeeId === empId);
        const base: RHCellEdit = existing ?? {
          custoTotalMes: row?.custoTotalMes ?? '',
          faltas: row !== undefined && row.faltas !== null ? String(row.faltas) : '0',
        };
        next.set(empId, { ...base, [field]: value });
        return next;
      });
    },
    [rhData],
  );

  // -------------------------------------------------------------------
  // Salvar dados RH
  // -------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!isDirty && diasUteis === '') {
      return;
    }
    setSaving(true);
    try {
      const du = Number.parseInt(diasUteis, 10);
      if (!Number.isFinite(du) || du < 1 || du > 31) {
        setToast('Os dias úteis devem estar entre 1 e 31.');
        return;
      }

      const colaboradores = rhData.map((row) => {
        const edit = edits.get(row.employeeId);
        return {
          employeeId: row.employeeId,
          custoTotalMes: edit?.custoTotalMes ?? row.custoTotalMes ?? '0',
          faltas: Number.parseInt(edit?.faltas ?? String(row.faltas ?? 0), 10),
        };
      });

      const result = await actions.saveMonthlyRHData({
        companyId,
        mes,
        diasUteis: du,
        colaboradores,
      });

      if (result.ok) {
        setEdits(new Map());
        setToast(`Dados salvos — ${result.data.colaboradoresGravados}` + ` colaborador(es).`);
        void fetchData();
      } else {
        setToast(result.message);
      }
    } catch {
      setToast('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [companyId, mes, diasUteis, rhData, edits, isDirty, fetchData, actions]);

  // -------------------------------------------------------------------
  // Desbloquear mes (variant='super_admin' apenas — §14.17)
  // -------------------------------------------------------------------

  const handleUnlock = useCallback(async () => {
    if (variant !== 'super_admin' || actions.unlockMonth === undefined) {
      return;
    }
    const result = await actions.unlockMonth({
      companyId,
      mes,
      aba: 'rh',
      justificativa:
        'Desbloqueio administrativo realizado pelo ' +
        'Super Admin da plataforma ROIP APP 9BOX. ' +
        'Ação registrada para fins de auditoria e ' +
        'rastreabilidade operacional do sistema.',
    });
    if (result.ok) {
      setToast('Mês desbloqueado — janela de 24h ativa.');
      void fetchData();
    } else {
      setToast(result.message);
    }
  }, [variant, companyId, mes, fetchData, actions]);

  // -------------------------------------------------------------------
  // Handlers do modal Solicitar desbloqueio (variant='rh')
  // -------------------------------------------------------------------

  const handleOpenUnlockModal = useCallback((): void => {
    setShowUnlockModal(true);
  }, []);

  const handleCloseUnlockModal = useCallback((): void => {
    setShowUnlockModal(false);
  }, []);

  const handleUnlockRequestSuccess = useCallback(
    (message: string): void => {
      setToast(message);
      // Re-check hasPending para atualizar o botao/badge canonico
      if (variant === 'rh' && actions.hasPendingRequest !== undefined && status === 'fechado') {
        void actions
          .hasPendingRequest({
            companyId,
            mes,
            aba: activeTab === 'rh' ? 'rh' : 'lider',
          })
          .then((result) => {
            if (result.ok) {
              setHasPending(result.data.hasPending);
              setPendingRequestedAt(result.data.requestedAt);
            }
          });
      }
    },
    [variant, actions, status, companyId, mes, activeTab],
  );

  // -------------------------------------------------------------------
  // Filtro de busca
  // -------------------------------------------------------------------

  const filteredRH = useMemo(() => {
    if (searchQuery.length === 0) {
      return rhData;
    }
    const q = searchQuery.toLowerCase();
    return rhData.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.departamento.toLowerCase().includes(q) ||
        r.cargo.toLowerCase().includes(q),
    );
  }, [rhData, searchQuery]);

  // -------------------------------------------------------------------
  // Status badge
  // -------------------------------------------------------------------

  const statusColors = STATUS_COLORS[status] ?? STATUS_COLORS.aberto;
  const statusLabel = STATUS_LABELS[status] ?? 'Aberto';

  // -------------------------------------------------------------------
  // Format do timestamp canonico da badge "Solicitacao em analise"
  // -------------------------------------------------------------------

  const pendingRequestedAtLabel = useMemo((): string | null => {
    if (pendingRequestedAt === null) {
      return null;
    }
    try {
      const d = new Date(pendingRequestedAt);
      if (!Number.isFinite(d.getTime())) {
        return null;
      }
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
    } catch {
      return null;
    }
  }, [pendingRequestedAt]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Cabecalho + navegacao de mes */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.text.primary,
              margin: 0,
            }}
          >
            Dados mensais
          </h1>
          <p
            style={{
              fontSize: 13,
              color: COLORS.text.secondary,
              margin: '4px 0 0 0',
            }}
          >
            {companyName} · lançamento operacional mensal
          </p>
        </div>

        {/* Seletor de mes + badge status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={handlePrevMes}
            style={{
              background: 'white',
              border: `1px solid ${COLORS.border.default}`,
              borderRadius: 6,
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
            }}
            aria-label="Mês anterior"
          >
            ◂
          </button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.text.primary,
              minWidth: 140,
              textAlign: 'center',
            }}
          >
            {formatMesLabel(mes)}
          </span>
          <button
            type="button"
            onClick={handleNextMes}
            style={{
              background: 'white',
              border: `1px solid ${COLORS.border.default}`,
              borderRadius: 6,
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
            }}
            aria-label="Mês seguinte"
          >
            ▸
          </button>

          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 10,
              background: statusColors.bg,
              color: statusColors.text,
            }}
          >
            {statusLabel}
          </span>

          {/* Botao [Desbloquear mes] — SOMENTE variant='super_admin' */}
          {variant === 'super_admin' && status === 'fechado' && (
            <button
              type="button"
              onClick={handleUnlock}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${COLORS.border.default}`,
                background: 'white',
                cursor: 'pointer',
                color: COLORS.text.primary,
                fontFamily: 'inherit',
              }}
              title="Desbloquear mês fechado — janela de 24h (§14.17)"
            >
              🔓 Desbloquear mês
            </button>
          )}

          {/* Botao [Solicitar desbloqueio] — SOMENTE variant='rh' */}
          {variant === 'rh' && status === 'fechado' && !hasPending && (
            <button
              type="button"
              onClick={handleOpenUnlockModal}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${COLORS.border.default}`,
                background: 'white',
                cursor: 'pointer',
                color: COLORS.text.primary,
                fontFamily: 'inherit',
              }}
              title="Solicitar desbloqueio de mês fechado (§14.13)"
            >
              🔓 Solicitar desbloqueio
            </button>
          )}

          {/* Badge canonico D051/D052/D053: solicitacao em analise */}
          {variant === 'rh' && status === 'fechado' && hasPending && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 10,
                background: '#FEF3C7',
                color: '#92400E',
              }}
              title={
                pendingRequestedAtLabel !== null
                  ? `Solicitação criada em ${pendingRequestedAtLabel}.` +
                    ' Aguardando decisão do Super Admin.'
                  : 'Aguardando decisão do Super Admin.'
              }
            >
              ⏳ Solicitação em análise
            </span>
          )}
        </div>
      </div>

      {/* Alerta contextual por status (variant='super_admin' — Bruno view) */}
      {variant === 'super_admin' && status === 'fechado' && (
        <div
          style={{
            padding: '12px 16px',
            background: '#DBEAFE',
            borderLeft: '3px solid #1E40AF',
            borderRadius: 8,
            fontSize: 12,
            color: '#1E40AF',
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          <strong>Mês fechado — edição de Super Admin permitida.</strong> Você tem edição direta ou
          pode conceder desbloqueio de 24h ao RH via botão acima.
        </div>
      )}

      {/* Alerta contextual por status (variant='rh' §14.13) */}
      {variant === 'rh' && status === 'fechado' && (
        <div
          style={{
            padding: '12px 16px',
            background: '#FEF3C7',
            borderLeft: '3px solid #D97706',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400E',
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          <strong>Mês fechado — dados não editáveis.</strong> Para editar, solicite desbloqueio ao
          Super Admin.
        </div>
      )}

      {status === 'desbloqueado' && (
        <div
          style={{
            padding: '12px 16px',
            background: '#FEF3C7',
            borderLeft: '3px solid #D97706',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400E',
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          <strong>Mês desbloqueado — janela de 24h.</strong> Alterações recalculam o trimestre
          afetado.
        </div>
      )}

      {/* Abas */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${COLORS.border.default}`,
          marginBottom: 16,
        }}
      >
        {DADOS_MENSAIS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            style={activeTab === tab ? TAB_ACTIVE : TAB_BASE}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: COLORS.text.secondary,
            fontSize: 13,
          }}
        >
          Carregando dados mensais...
        </div>
      )}

      {error !== null && !loading && (
        <div
          style={{
            ...CARD_STYLE,
            textAlign: 'center',
            color: '#991B1B',
          }}
        >
          {error}
          <br />
          <button
            type="button"
            onClick={() => void fetchData()}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${COLORS.border.default}`,
              background: 'white',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Recarregar
          </button>
        </div>
      )}

      {/* Aba RH */}
      {!loading && error === null && activeTab === 'rh' && (
        <>
          {/* Card diasUteis */}
          <div style={CARD_STYLE}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.text.primary,
                marginBottom: 4,
              }}
            >
              Dados da empresa no mês
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.text.secondary,
                marginBottom: 12,
              }}
            >
              Campo obrigatório antes de lançar dados dos colaboradores.
            </div>
            <div style={{ maxWidth: 400 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: COLORS.text.primary,
                  marginBottom: 4,
                }}
              >
                Dias úteis do mês
                <span style={{ color: '#DC2626' }}> *</span>
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={diasUteis}
                onChange={(e) => setDiasUteis(e.target.value)}
                disabled={!isEditable}
                placeholder="Ex.: 21"
                style={{
                  ...INPUT_STYLE,
                  width: 120,
                  textAlign: 'left',
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.text.secondary,
                  marginTop: 4,
                }}
              >
                Inteiro entre 1 e 31.
              </div>
            </div>
          </div>

          {/* Card tabela de colaboradores */}
          <div style={CARD_STYLE}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: COLORS.text.primary,
                  }}
                >
                  Colaboradores ativos
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: COLORS.text.secondary,
                    marginLeft: 8,
                  }}
                >
                  {filteredRH.length} de {rhData.length}
                </span>
              </div>
              <input
                type="text"
                placeholder="Buscar colaborador…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: `1px solid ${'#D1D5DB'}`,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  width: 220,
                }}
              />
            </div>

            {filteredRH.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 40,
                  color: COLORS.text.secondary,
                  fontSize: 13,
                }}
              >
                {rhData.length === 0
                  ? 'Nenhum colaborador cadastrado ainda.'
                  : 'Nenhum colaborador atende à busca.'}
              </div>
            ) : (
              <div style={TABLE_WRAP_STYLE}>
                <table style={TABLE_STYLE}>
                  <thead>
                    <tr>
                      <th style={TH_STYLE}>Nome</th>
                      <th style={TH_STYLE}>Cargo</th>
                      <th style={TH_STYLE}>Departamento</th>
                      <th
                        style={{
                          ...TH_STYLE,
                          textAlign: 'right',
                        }}
                      >
                        Custo mensal (R$)
                      </th>
                      <th
                        style={{
                          ...TH_STYLE,
                          textAlign: 'right',
                        }}
                      >
                        Faltas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRH.map((row) => {
                      const edit = edits.get(row.employeeId);
                      const custo = edit?.custoTotalMes ?? row.custoTotalMes ?? '';
                      const faltas =
                        edit?.faltas ?? (row.faltas !== null ? String(row.faltas) : '0');
                      return (
                        <tr key={row.employeeId}>
                          <td
                            style={{
                              ...TD_STYLE,
                              fontWeight: 600,
                              minWidth: 160,
                            }}
                          >
                            {row.name}
                          </td>
                          <td
                            style={{
                              ...TD_STYLE,
                              fontSize: 11,
                              color: COLORS.text.secondary,
                            }}
                          >
                            {row.cargo}
                          </td>
                          <td
                            style={{
                              ...TD_STYLE,
                              fontSize: 11,
                              color: COLORS.text.secondary,
                            }}
                          >
                            {row.departamento}
                          </td>
                          <td
                            style={{
                              ...TD_STYLE,
                              textAlign: 'right',
                            }}
                          >
                            <input
                              type="text"
                              value={custo}
                              onChange={(e) =>
                                handleCellChange(row.employeeId, 'custoTotalMes', e.target.value)
                              }
                              disabled={!isEditable}
                              style={{
                                ...INPUT_STYLE,
                                width: 120,
                              }}
                            />
                          </td>
                          <td
                            style={{
                              ...TD_STYLE,
                              textAlign: 'right',
                            }}
                          >
                            <input
                              type="number"
                              min={0}
                              value={faltas}
                              onChange={(e) =>
                                handleCellChange(row.employeeId, 'faltas', e.target.value)
                              }
                              disabled={!isEditable}
                              style={{
                                ...INPUT_STYLE,
                                width: 70,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Barra de salvamento (§14.13) */}
          {isEditable && (
            <div
              style={{
                position: 'sticky',
                bottom: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 20px',
                background: 'white',
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: COLORS.text.secondary,
                }}
              >
                {isDirty && (
                  <>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#D97706',
                        display: 'inline-block',
                      }}
                    />
                    Alterações não salvas
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1F3A5F',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Aba Lideres — read-only para variant='rh' (D-086b-5 A) */}
      {!loading && error === null && activeTab === 'lider' && (
        <div style={CARD_STYLE}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.text.primary,
              marginBottom: 4,
            }}
          >
            Status de preenchimento dos líderes
          </div>
          <div
            style={{
              fontSize: 12,
              color: COLORS.text.secondary,
              marginBottom: 16,
            }}
          >
            {variant === 'rh'
              ? 'Visão consolidada — apenas leitura.'
              : 'Visão consolidada — clique no líder para ver/editar os lançamentos dos liderados.'}
          </div>

          {leaders.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: COLORS.text.secondary,
                fontSize: 13,
              }}
            >
              Nenhum líder ativo nesta empresa.
            </div>
          ) : (
            <div style={TABLE_WRAP_STYLE}>
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Líder</th>
                    <th style={TH_STYLE}>Cargo</th>
                    <th style={TH_STYLE}>Departamento</th>
                    <th
                      style={{
                        ...TH_STYLE,
                        textAlign: 'right',
                      }}
                    >
                      Liderados
                    </th>
                    <th style={TH_STYLE}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((ld) => (
                    <tr key={`${ld.liderTipo}-${ld.liderId}`}>
                      <td
                        style={{
                          ...TD_STYLE,
                          fontWeight: 600,
                        }}
                      >
                        {ld.name}
                      </td>
                      <td
                        style={{
                          ...TD_STYLE,
                          fontSize: 11,
                          color: COLORS.text.secondary,
                        }}
                      >
                        {ld.cargo}
                      </td>
                      <td
                        style={{
                          ...TD_STYLE,
                          fontSize: 11,
                          color: COLORS.text.secondary,
                        }}
                      >
                        {ld.departamento}
                      </td>
                      <td
                        style={{
                          ...TD_STYLE,
                          textAlign: 'right',
                        }}
                      >
                        {ld.qtdLiderados}
                      </td>
                      <td style={TD_STYLE}>
                        <StatusBadge status={ld.statusPreenchimento} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 20px',
            background: '#DCFCE7',
            border: '1px solid #16A34A',
            borderRadius: 10,
            fontSize: 13,
            color: '#15803D',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            zIndex: 1000,
            maxWidth: 360,
          }}
        >
          {toast}
        </div>
      )}

      {/* Modal canonico Solicitar desbloqueio (variant='rh' apenas) */}
      {variant === 'rh' &&
        showUnlockModal &&
        actions.createUnlockRequest !== undefined &&
        actions.listMesesFechados !== undefined &&
        actions.listCompanyLeaders !== undefined && (
          <ModalSolicitarDesbloqueio
            companyId={companyId}
            initialMes={mes}
            initialAba={activeTab === 'rh' ? 'rh' : 'lider'}
            onClose={handleCloseUnlockModal}
            onSuccess={handleUnlockRequestSuccess}
            listMesesFechados={actions.listMesesFechados}
            listCompanyLeaders={actions.listCompanyLeaders}
            createUnlockRequest={actions.createUnlockRequest}
          />
        )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-componente: badge de status de preenchimento
// -----------------------------------------------------------------------

function StatusBadge(props: { readonly status: string }): JSX.Element {
  const { status: s } = props;
  let bg = '#F3F4F6';
  let color = '#374151';
  if (s === 'Preenchido') {
    bg = '#DCFCE7';
    color = '#166534';
  } else if (s === 'Parcial') {
    bg = '#FEF3C7';
    color = '#92400E';
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 10,
        background: bg,
        color,
      }}
    >
      {s}
    </span>
  );
}
