'use client';

// ROIP APP 9BOX — client component do módulo Radar NR-1 (§14.28,
// ME-079b).
//
// 6 estados canônicos da aba Visão geral + aba Alertas e histórico.
// 3 modais: configuração, edição fechamento, detalhamento por fator.
// Gauge de adesão SVG. Radar polar via RadarPolar.tsx extraído.
// Tabelas convergência/divergência + departamento crítico.
//
// **RV-13.** Consumido exclusivamente por `page.tsx`.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { RadarPolar } from '../../../../../components/nr1/RadarPolar';

import {
  cancelCycleAction,
  configureCycleAction,
  editClosingDateAction,
  getCycleDetailsAction,
  startDownloadTokenAction,
} from './actions';
import {
  ABA_LABELS,
  ABAS_NR1,
  ABA_NR1_DEFAULT,
  BANNER_TEXT_NR1,
  classForScore,
  daysBetween,
  daysUntil,
  FAIXAS_ADESAO,
  FATOR_DESCRICOES,
  FATORES_NR1,
  formatDateBR,
  formatTimestampBR,
  SCORE_COLORS,
  STATUS_BADGE,
  type AbaNr1,
  type AlertRow,
  type CycleDetailsPayload,
  type EscopoPayload,
  type HistoricalCycleRow,
} from './internals';

// -----------------------------------------------------------------------
// Styles inline (padrão B8 — Tailwind via classes canônicas)
// -----------------------------------------------------------------------

const STYLES = {
  banner: {
    background: '#FEF3C7',
    border: '1px solid #FBBF24',
    borderRadius: 10,
    padding: '12px 16px',
    marginBottom: 16,
    fontSize: 12,
    color: '#78350F',
    lineHeight: 1.55,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  } as const,
  card: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: '14px 18px',
    marginBottom: 12,
  } as const,
  emptyState: {
    background: '#F9FAFB',
    border: '2px dashed #D1D5DB',
    borderRadius: 10,
    padding: '56px 24px',
    textAlign: 'center' as const,
    color: '#6B7280',
  } as const,
  btnTeal: {
    background: '#14B8A6',
    color: '#fff',
    padding: '9px 18px',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  } as const,
  btnOutline: {
    background: '#fff',
    color: '#374151',
    padding: '6px 12px',
    border: '1px solid #D1D5DB',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  } as const,
  btnOutlineDanger: {
    background: '#fff',
    color: '#991B1B',
    padding: '6px 12px',
    border: '1px solid #FCA5A5',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  } as const,
  btnPrimary: {
    background: '#1F3A5F',
    color: '#fff',
    padding: '8px 16px',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  } as const,
  modal: {
    overlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,.5)',
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    content: {
      background: '#fff',
      borderRadius: 12,
      padding: '22px 26px',
      maxWidth: 640,
      width: '100%',
      boxShadow: '0 20px 60px rgba(0,0,0,.22)',
      maxHeight: '90vh',
      overflowY: 'auto' as const,
    },
  },
  tab: (active: boolean) => ({
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: active ? '#1F3A5F' : '#6B7280',
    fontWeight: active ? 600 : 500,
    borderBottom: active ? '2px solid #1F3A5F' : '2px solid transparent',
    marginBottom: -1,
  }),
} as const;

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

interface Nr1ClientProps {
  readonly companyId: number;
  readonly companyName: string;
  readonly initialCycleDetails: CycleDetailsPayload;
  readonly historicalCycles: readonly HistoricalCycleRow[];
  readonly nr1Alerts: readonly AlertRow[];
}

// -----------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------

export function Nr1Client({
  companyId,
  companyName,
  initialCycleDetails,
  historicalCycles,
  nr1Alerts,
}: Nr1ClientProps): ReactElement {
  // State
  const [aba, setAba] = useState<AbaNr1>(ABA_NR1_DEFAULT);
  const [cycle, setCycle] = useState(initialCycleDetails);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  // Modais
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailDeptId, setDetailDeptId] = useState<string>('');

  // Form: configuração de ciclo
  const [configAbertura, setConfigAbertura] = useState('');
  const [configFechamento, setConfigFechamento] = useState('');

  // Form: edição de data de fechamento
  const [editNovaData, setEditNovaData] = useState('');
  const [editJustificativa, setEditJustificativa] = useState('');

  // Selector de departamento no radar comparativo
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');

  // Auto-clear toast
  useEffect(() => {
    if (toast.length === 0) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Refetch
  const refetch = useCallback(async () => {
    const result = await getCycleDetailsAction({
      companyId,
    });
    if (result.ok) {
      setCycle(result.data as CycleDetailsPayload);
    }
  }, [companyId]);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------

  const handleConfigureCycle = useCallback(async () => {
    if (configAbertura.length === 0 || configFechamento.length === 0) {
      return;
    }
    setLoading(true);
    const result = await configureCycleAction({
      companyId,
      dataAbertura: configAbertura,
      dataFechamento: configFechamento,
    });
    setLoading(false);
    if (result.ok) {
      setShowConfigModal(false);
      setToast('Ciclo configurado com sucesso.');
      await refetch();
    } else {
      setToast(result.message);
    }
  }, [companyId, configAbertura, configFechamento, refetch]);

  const handleEditClosingDate = useCallback(async () => {
    if (editNovaData.length === 0 || editJustificativa.length < 100 || cycle.cicloDbId === null) {
      return;
    }
    setLoading(true);
    const result = await editClosingDateAction({
      cicloDbId: cycle.cicloDbId,
      novaDataFechamento: editNovaData,
      justificativa: editJustificativa,
    });
    setLoading(false);
    if (result.ok) {
      setShowEditModal(false);
      setEditJustificativa('');
      setToast('Data de fechamento atualizada.');
      await refetch();
    } else {
      setToast(result.message);
    }
  }, [cycle.cicloDbId, editNovaData, editJustificativa, refetch]);

  const handleCancelCycle = useCallback(async () => {
    if (cycle.cicloDbId === null) return;
    const ok = window.confirm('Tem certeza que deseja cancelar este ciclo agendado?');
    if (!ok) return;
    setLoading(true);
    const result = await cancelCycleAction({
      cicloDbId: cycle.cicloDbId,
    });
    setLoading(false);
    if (result.ok) {
      setToast('Ciclo cancelado.');
      await refetch();
    } else {
      setToast(result.message);
    }
  }, [companyId, cycle.cicloDbId, refetch]);

  const handleDownloadPdf = useCallback(async () => {
    if (cycle.cicloDbId === null) return;
    setLoading(true);
    const result = await startDownloadTokenAction({
      cicloDbId: cycle.cicloDbId,
    });
    setLoading(false);
    if (result.ok) {
      window.open(result.data.downloadUrl, '_blank');
    } else {
      setToast(result.message);
    }
  }, [companyId, cycle.cicloDbId]);

  // ---------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------

  const status = cycle.status;
  const empresaEscopo = cycle.escopos.find((e) => e.escopo === 'empresa');
  const deptEscopos = cycle.escopos.filter(
    (e) => e.escopo === 'departamento' || e.escopo === 'agregacao',
  );
  const selectedDept =
    selectedDeptId.length > 0 ? (deptEscopos[Number(selectedDeptId)] ?? null) : null;

  // Min date helpers
  const todayISO = new Date().toISOString().split('T')[0] ?? '';

  // ---------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------

  const renderBadge = (s: 'agendado' | 'aberto' | 'fechado'): ReactElement => {
    const b = STATUS_BADGE[s];
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 20,
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          background: b.bg,
          color: b.color,
          marginLeft: 8,
        }}
      >
        {b.label}
      </span>
    );
  };

  const renderGauge = (): ReactElement | null => {
    if (status !== 'aberto' && status !== 'fechado') return null;
    const pct = cycle.adesaoPercentual;
    const faixa = cycle.faixaAdesao;
    const info = FAIXAS_ADESAO[faixa];
    // SVG gauge semicircular
    const totalArc = Math.PI; // 180 degrees
    const startAngle = Math.PI;
    const pctAngle = startAngle - totalArc * (pct / 100);
    return (
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flexShrink: 0 }}>
          <svg width={220} height={140} viewBox="0 0 220 140">
            <path
              d="M 20 120 A 90 90 0 0 1 200 120"
              fill="none"
              stroke="#F3F4F6"
              strokeWidth={16}
              strokeLinecap="round"
            />
            {pct > 0 && (
              <path
                d={`M 20 120 A 90 90 0 ${pct > 50 ? 1 : 0} 1 ${
                  110 + 90 * Math.cos(pctAngle)
                } ${120 + 90 * Math.sin(pctAngle)}`}
                fill="none"
                stroke={
                  SCORE_COLORS[
                    faixa === 'verde' ? 'verde' : faixa === 'amarelo' ? 'amarelo' : 'vermelho'
                  ]
                }
                strokeWidth={16}
                strokeLinecap="round"
              />
            )}
            <text
              x={110}
              y={115}
              fontFamily="Inter, Arial"
              fontSize={34}
              fontWeight={700}
              fill="#111827"
              textAnchor="middle"
            >
              {pct}%
            </text>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: info.color,
              marginBottom: 6,
            }}
          >
            {info.label}
          </div>
          <div
            style={{
              fontSize: 12,
              color: info.color,
              lineHeight: 1.55,
            }}
          >
            {cycle.textoAdesao}
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#6B7280',
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid #F3F4F6',
            }}
          >
            <strong style={{ color: '#111827' }}>{cycle.respondentesEfetivos}</strong> respondentes
            efetivos de <strong style={{ color: '#111827' }}>{cycle.elegiveis}</strong> elegíveis
          </div>
        </div>
      </div>
    );
  };

  const renderRadarLegend = (
    escopoData: EscopoPayload,
    empresaData?: EscopoPayload,
  ): ReactElement => {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 4,
          marginTop: 14,
          width: '100%',
        }}
      >
        {FATORES_NR1.map((f) => {
          const fatorScore = escopoData.fatores.find((fs) => fs.fator === f.id);
          const score = fatorScore?.score ?? 0;
          const scoreClass = classForScore(score);
          const empresaScore = empresaData?.fatores.find((fs) => fs.fator === f.id);
          const diff = empresaScore ? score - empresaScore.score : null;
          return (
            <div
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#374151',
                padding: '4px 6px',
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: SCORE_COLORS[scoreClass],
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1 }}>{f.nome}</span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  minWidth: 32,
                  textAlign: 'right',
                  color: SCORE_COLORS[scoreClass],
                }}
              >
                {Math.round(score)}
              </span>
              {diff !== null && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    minWidth: 38,
                    textAlign: 'right',
                    color: diff > 0 ? '#16A34A' : diff < 0 ? '#DC2626' : '#6B7280',
                  }}
                >
                  {diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ ${diff}` : '▬ 0'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ---------------------------------------------------------------
  // Modal: Configurar ciclo
  // ---------------------------------------------------------------

  const renderConfigModal = (): ReactElement | null => {
    if (!showConfigModal) return null;
    const duracao = daysBetween(configAbertura, configFechamento);
    return (
      <div style={STYLES.modal.overlay}>
        <div style={STYLES.modal.content}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                Configurar novo ciclo do Radar NR-1
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginTop: 2,
                }}
              >
                Escolha as datas de abertura e fechamento do ciclo
              </div>
            </div>
            <button
              style={{
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#9CA3AF',
              }}
              onClick={() => setShowConfigModal(false)}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Data de abertura
            </label>
            <input
              type="date"
              value={configAbertura}
              min={todayISO}
              onChange={(e) => setConfigAbertura(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: 8,
                fontSize: 13,
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: '#6B7280',
                marginTop: 4,
              }}
            >
              Data mínima: hoje
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Data de fechamento
            </label>
            <input
              type="date"
              value={configFechamento}
              min={
                configAbertura.length > 0
                  ? (() => {
                      const d = new Date(configAbertura);
                      d.setDate(d.getDate() + 30);
                      return d.toISOString().split('T')[0];
                    })()
                  : ''
              }
              onChange={(e) => setConfigFechamento(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: 8,
                fontSize: 13,
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: '#6B7280',
                marginTop: 4,
              }}
            >
              Janela mínima obrigatória de 30 dias após a abertura
            </div>
          </div>

          {configAbertura.length > 0 && configFechamento.length > 0 && duracao > 0 && (
            <div
              style={{
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 12,
                color: '#374151',
                lineHeight: 1.55,
                margin: '14px 0',
              }}
            >
              O card <strong style={{ color: '#111827' }}>[Radar NR-1]</strong> aparecerá no portal
              de todos os colaboradores no dia <strong>{formatDateBR(configAbertura)}</strong> e
              desaparecerá no dia <strong>{formatDateBR(configFechamento)}</strong>.
              <br />
              <br />O relatório do radar será gerado automaticamente no fechamento do ciclo e ficará
              disponível para consulta e exportação em PDF.{' '}
              <strong>O ciclo, uma vez fechado, não poderá ser reaberto.</strong>
              <br />
              <br />
              Duração do ciclo: <strong>{duracao} dias corridos</strong>.
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
              marginTop: 16,
            }}
          >
            <button style={STYLES.btnOutline} onClick={() => setShowConfigModal(false)}>
              Cancelar
            </button>
            <button
              style={STYLES.btnTeal}
              disabled={
                loading ||
                configAbertura.length === 0 ||
                configFechamento.length === 0 ||
                duracao < 30
              }
              onClick={handleConfigureCycle}
            >
              Confirmar agendamento
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------
  // Modal: Editar data de fechamento
  // ---------------------------------------------------------------

  const renderEditModal = (): ReactElement | null => {
    if (!showEditModal) return null;
    return (
      <div style={STYLES.modal.overlay}>
        <div style={STYLES.modal.content}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                Editar data de fechamento
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginTop: 2,
                }}
              >
                Ciclo aberto em {formatDateBR(cycle.dataAbertura)} · Fechamento atual:{' '}
                {formatDateBR(cycle.dataFechamento)}
              </div>
            </div>
            <button
              style={{
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#9CA3AF',
              }}
              onClick={() => setShowEditModal(false)}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Nova data de fechamento
            </label>
            <input
              type="date"
              value={editNovaData}
              min={todayISO}
              onChange={(e) => setEditNovaData(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: 8,
                fontSize: 13,
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Justificativa da alteração <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <textarea
              value={editJustificativa}
              onChange={(e) => setEditJustificativa(e.target.value)}
              placeholder={
                'Descreva o motivo da alteração da data de ' +
                'fechamento (obrigatório entre 100 e 500 caracteres)'
              }
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: 8,
                fontSize: 13,
                resize: 'vertical',
                minHeight: 80,
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: '#6B7280',
                marginTop: 4,
              }}
            >
              Obrigatório · {editJustificativa.length}/500 caracteres · Ficará registrado no
              relatório final
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
              marginTop: 16,
            }}
          >
            <button style={STYLES.btnOutline} onClick={() => setShowEditModal(false)}>
              Cancelar
            </button>
            <button
              style={STYLES.btnTeal}
              disabled={
                loading ||
                editNovaData.length === 0 ||
                editJustificativa.length < 100 ||
                editJustificativa.length > 500
              }
              onClick={handleEditClosingDate}
            >
              Confirmar alteração
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------
  // Modal: Detalhamento por fator do departamento
  // ---------------------------------------------------------------

  const renderDetailModal = (): ReactElement | null => {
    if (!showDetailModal || detailDeptId.length === 0) return null;
    const dept = detailDeptId.length > 0 ? (deptEscopos[Number(detailDeptId)] ?? null) : null;
    if (!dept) return null;
    return (
      <div style={STYLES.modal.overlay}>
        <div style={STYLES.modal.content}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                {dept.escopoNome ?? 'Departamento'} — Detalhamento por fator
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginTop: 2,
                }}
              >
                Ciclo {cycle.ciclo} · {dept.countRespondentes} respondentes efetivos · Comparação
                com média da empresa
              </div>
            </div>
            <button
              style={{
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#9CA3AF',
              }}
              onClick={() => setShowDetailModal(false)}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 12,
            }}
          >
            {FATORES_NR1.map((f) => {
              const deptScore = dept.fatores.find((fs) => fs.fator === f.id)?.score ?? 0;
              const empScore = empresaEscopo?.fatores.find((fs) => fs.fator === f.id)?.score ?? 0;
              const diff = Math.round(deptScore - empScore);
              const isCritical = diff <= -10;
              const isPositive = diff >= 10;
              return (
                <div
                  key={f.id}
                  style={{
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderLeft: isCritical
                      ? '3px solid #DC2626'
                      : isPositive
                        ? '3px solid #16A34A'
                        : '1px solid #E5E7EB',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#111827',
                        }}
                      >
                        {f.nome}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#6B7280',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        Fator de {f.tipo}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: isCritical ? '#FEE2E2' : isPositive ? '#D1FAE5' : '#F3F4F6',
                        color: isCritical ? '#991B1B' : isPositive ? '#065F46' : '#6B7280',
                      }}
                    >
                      {diff >= 0 ? '+' : ''}
                      {diff} pts vs. empresa
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 20,
                      fontSize: 12,
                      color: '#374151',
                      marginTop: 6,
                    }}
                  >
                    <div>
                      Departamento:{' '}
                      <strong
                        style={{
                          color: SCORE_COLORS[classForScore(deptScore)],
                        }}
                      >
                        {Math.round(deptScore)}
                      </strong>
                    </div>
                    <div>
                      Empresa: <strong>{Math.round(empScore)}</strong>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#6B7280',
                      marginTop: 4,
                      lineHeight: 1.5,
                    }}
                  >
                    {FATOR_DESCRICOES[f.id] ?? ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------
  // Aba: Visão geral
  // ---------------------------------------------------------------

  const renderVisaoGeral = (): ReactElement => {
    // Estado 1: Nenhum ciclo
    if (!cycle.presente) {
      return (
        <div style={STYLES.card}>
          <div style={STYLES.emptyState}>
            <div
              style={{
                fontSize: 44,
                color: '#9CA3AF',
                marginBottom: 14,
              }}
            >
              📅
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Nenhum ciclo configurado
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#9CA3AF',
                marginBottom: 22,
                maxWidth: 400,
                margin: '0 auto 22px',
              }}
            >
              Configure a data de abertura e fechamento do primeiro ciclo do Radar NR-1 para começar
              a coleta de respostas dos colaboradores.
            </div>
            <button style={STYLES.btnTeal} onClick={() => setShowConfigModal(true)}>
              + Configurar primeiro ciclo
            </button>
          </div>
        </div>
      );
    }

    // Estado 3: Agendado
    if (status === 'agendado') {
      return (
        <div style={STYLES.card}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#111827',
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span>Próximo ciclo{renderBadge('agendado')}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={STYLES.btnOutline}
                onClick={() => {
                  setEditNovaData(cycle.dataFechamento ?? '');
                  setShowEditModal(true);
                }}
              >
                Editar data de fechamento
              </button>
              <button
                style={STYLES.btnOutlineDanger}
                onClick={handleCancelCycle}
                disabled={loading}
              >
                Cancelar ciclo
              </button>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 20,
            }}
          >
            <InfoBlock label="Data de abertura" value={formatDateBR(cycle.dataAbertura)} />
            <InfoBlock label="Data de fechamento" value={formatDateBR(cycle.dataFechamento)} />
            <InfoBlock
              label="Duração"
              value={`${daysBetween(cycle.dataAbertura, cycle.dataFechamento)} dias`}
            />
            <InfoBlock
              label="Dias até a abertura"
              value={String(daysUntil(cycle.dataAbertura))}
              highlight
            />
          </div>
        </div>
      );
    }

    // Estado 4: Aberto
    if (status === 'aberto') {
      return (
        <>
          <div style={STYLES.card}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#111827',
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>Ciclo em andamento{renderBadge('aberto')}</span>
              <button
                style={STYLES.btnOutline}
                onClick={() => {
                  setEditNovaData(cycle.dataFechamento ?? '');
                  setShowEditModal(true);
                }}
              >
                Editar data de fechamento
              </button>
            </div>
            {cycle.marcaEdicaoPermanente && (
              <div
                style={{
                  background: '#FEF3C7',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#92400E',
                  marginBottom: 10,
                }}
              >
                Data de fechamento editada em {formatTimestampBR(cycle.ultimaEdicaoEm)}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 20,
              }}
            >
              <InfoBlock label="Data de abertura" value={formatDateBR(cycle.dataAbertura)} />
              <InfoBlock label="Data de fechamento" value={formatDateBR(cycle.dataFechamento)} />
              <InfoBlock
                label="Dias restantes"
                value={String(daysUntil(cycle.dataFechamento))}
                highlight
              />
            </div>
          </div>
          <div style={STYLES.card}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#111827',
                marginBottom: 12,
              }}
            >
              Adesão do ciclo aberto
            </div>
            {renderGauge()}
          </div>
        </>
      );
    }

    // Estado 6: Fechado com resultados
    if (status === 'fechado') {
      return (
        <>
          {/* Header do ciclo fechado */}
          <div style={STYLES.card}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#111827',
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>Ciclo mais recente{renderBadge('fechado')}</span>
              <button style={STYLES.btnPrimary} onClick={handleDownloadPdf} disabled={loading}>
                ⬇ Exportar PDF
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 20,
              }}
            >
              <InfoBlock
                label="Respondentes efetivos"
                value={String(cycle.respondentesEfetivos)}
                sub={`de ${cycle.elegiveis} elegíveis`}
              />
              <InfoBlock
                label="Adesão"
                value={`${cycle.adesaoPercentual}%`}
                valueColor={SCORE_COLORS[cycle.faixaAdesao]}
              />
              <InfoBlock
                label="Fatores em alerta"
                value={String(empresaEscopo?.fatores.filter((f) => f.score < 50).length ?? 0)}
                valueColor={
                  (empresaEscopo?.fatores.filter((f) => f.score < 50).length ?? 0) > 0
                    ? '#DC2626'
                    : '#6B7280'
                }
              />
            </div>
          </div>

          {/* Radares lado a lado */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 12,
            }}
          >
            {/* Radar empresa */}
            <div style={STYLES.card}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: 12,
                }}
              >
                Radar dos 8 fatores — Empresa
              </div>
              {empresaEscopo && (
                <div style={{ textAlign: 'center' }}>
                  <RadarPolar
                    scores={empresaEscopo.fatores.map((f) => ({
                      fator: f.fator,
                      score: Number(f.score),
                    }))}
                    color="#14B8A6"
                  />
                  {renderRadarLegend(empresaEscopo)}
                </div>
              )}
            </div>

            {/* Radar comparativo por departamento */}
            <div style={STYLES.card}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: 12,
                }}
              >
                Radar comparativo por departamento
              </div>
              <select
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  fontSize: 13,
                  marginBottom: 14,
                }}
                value={selectedDeptId ?? ''}
                onChange={(e) => {
                  setSelectedDeptId(e.target.value);
                }}
              >
                <option value="">Selecione um departamento...</option>
                {deptEscopos.map((d, idx) => (
                  <option key={idx} value={idx}>
                    {d.escopoNome} ({d.countRespondentes} respondentes)
                  </option>
                ))}
              </select>
              {selectedDept && empresaEscopo && (
                <div style={{ textAlign: 'center' }}>
                  <RadarPolar
                    scores={selectedDept.fatores.map((f) => ({
                      fator: f.fator,
                      score: Number(f.score),
                    }))}
                    comparison={empresaEscopo.fatores.map((f) => ({
                      fator: f.fator,
                      score: Number(f.score),
                    }))}
                    color="#1E40AF"
                    comparisonColor="#14B8A6"
                  />
                  {/* ME-080a — legenda identitária empresa/departamento. */}
                  {/* Cores identitárias (teal=empresa, azul=depto) — NÃO */}
                  {/* semafóricas. As cores semafóricas ficam apenas nos */}
                  {/* dots da legenda de scores em `renderRadarLegend`. */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 20,
                      marginTop: 10,
                      fontSize: 12,
                      color: '#374151',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          background: '#14B8A6',
                          borderRadius: 2,
                        }}
                      />
                      Empresa
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          background: '#1E40AF',
                          borderRadius: 2,
                        }}
                      />
                      Departamento
                    </span>
                  </div>
                  <button
                    style={{
                      ...STYLES.btnOutline,
                      marginTop: 14,
                    }}
                    onClick={() => {
                      setDetailDeptId(selectedDeptId);
                      setShowDetailModal(true);
                    }}
                  >
                    Ver detalhes fator a fator →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Departamento crítico */}
          {cycle.departamentoCriticoDepartamentoNome !== null && (
            <div style={STYLES.card}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: 12,
                }}
              >
                Departamento em situação crítica
              </div>
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: 10,
                  padding: '14px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#DC2626',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    !
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#991B1B',
                    }}
                  >
                    {cycle.departamentoCriticoDepartamentoNome}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#7F1D1D',
                    lineHeight: 1.5,
                  }}
                >
                  {cycle.mensagemDepartamentoCritico}
                </div>
              </div>
            </div>
          )}

          {cycle.departamentoCriticoDepartamentoNome === null && (
            <div style={STYLES.card}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: 12,
                }}
              >
                Departamento em situação crítica
              </div>
              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #86EFAC',
                  borderRadius: 10,
                  padding: '14px 16px',
                  fontSize: 13,
                  color: '#065F46',
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                Nenhum departamento em situação crítica neste ciclo.
              </div>
            </div>
          )}
        </>
      );
    }

    return <div />;
  };

  // ---------------------------------------------------------------
  // Aba: Alertas e histórico
  // ---------------------------------------------------------------

  const renderAlertasHistorico = (): ReactElement => {
    // Alertas do ciclo mais recente
    const latestCycleId = cycle.cicloDbId;
    const cycleAlerts = nr1Alerts.filter((a) => a.cicloDbId === latestCycleId);
    const closedCycles = historicalCycles.filter((c) => c.status === 'fechado');

    return (
      <>
        {/* Alertas */}
        <div style={STYLES.card}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#111827',
              marginBottom: 6,
            }}
          >
            Alertas informativos {cycle.ciclo ? `— Ciclo ${cycle.ciclo}` : ''}
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#6B7280',
              marginBottom: 12,
            }}
          >
            Fatores com score inferior a 50 no ciclo mais recente. Alertas são informativos e não
            substituem análise por profissional habilitado.
          </div>
          {cycleAlerts.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: '#6B7280',
                textAlign: 'center',
                padding: 20,
              }}
            >
              Nenhum alerta registrado.
            </div>
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {cycleAlerts.map((a) => {
              const fator = FATORES_NR1.find((f) => f.id === a.fatorId);
              const scoreNum = a.scoreValor ? Number(a.scoreValor) : 0;
              const isCritical = scoreNum < 40;
              return (
                <div
                  key={a.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    borderLeft: `4px solid ${isCritical ? '#DC2626' : '#D97706'}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: isCritical ? '#FEE2E2' : '#FEF3C7',
                      color: isCritical ? '#DC2626' : '#B45309',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    !
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      {fator?.nome ?? `Fator ${a.fatorId}`}
                      {a.departamentoNome
                        ? ` — ${a.departamentoNome}`
                        : a.escopo === 'empresa'
                          ? ' — Empresa (média geral)'
                          : ''}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#6B7280',
                        marginTop: 2,
                      }}
                    >
                      Fator de {fator?.tipo ?? 'risco'} · Alerta gerado em{' '}
                      {formatTimestampBR(a.createdAt)}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isCritical ? '#DC2626' : '#D97706',
                      minWidth: 50,
                      textAlign: 'right',
                    }}
                  >
                    {a.scoreValor ? Math.round(Number(a.scoreValor)) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Histórico de ciclos */}
        <div style={STYLES.card}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#111827',
              marginBottom: 12,
            }}
          >
            Histórico de ciclos
          </div>
          {closedCycles.length === 0 && (
            <div
              style={{
                fontSize: 13,
                color: '#6B7280',
                textAlign: 'center',
                padding: 20,
              }}
            >
              Nenhum ciclo finalizado.
            </div>
          )}
          {closedCycles.length > 0 && (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {['Ciclo', 'Abertura', 'Fechamento', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderBottom: '1px solid #E5E7EB',
                        color: '#6B7280',
                        fontWeight: 600,
                        fontSize: 11,
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedCycles.map((c) => (
                  <tr key={c.id}>
                    <td
                      style={{
                        padding: '11px 12px',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: '#EEF2FF',
                          color: '#3730A3',
                        }}
                      >
                        {c.ciclo}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '11px 12px',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                    >
                      {formatDateBR(c.dataAbertura)}
                    </td>
                    <td
                      style={{
                        padding: '11px 12px',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                    >
                      {formatDateBR(c.dataFechamento)}
                    </td>
                    <td
                      style={{
                        padding: '11px 12px',
                        borderBottom: '1px solid #F3F4F6',
                        display: 'flex',
                        gap: 6,
                      }}
                    >
                      <button
                        style={STYLES.btnOutline}
                        onClick={async () => {
                          const r = await getCycleDetailsAction({
                            companyId,
                            cicloDbId: c.id,
                          });
                          if (r.ok) {
                            setCycle(r.data as CycleDetailsPayload);
                            setAba('visao_geral');
                            setToast('Ciclo carregado.');
                          }
                        }}
                      >
                        Ver detalhes
                      </button>
                      <DownloadPdfButton cicloDbId={c.id} setToast={setToast} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  };

  // ---------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------

  return (
    <div>
      {/* Header */}
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
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            🛡️ Radar NR-1 — Riscos Psicossociais
          </div>
          <div
            style={{
              fontSize: 13,
              color: '#6B7280',
              marginTop: 2,
            }}
          >
            {companyName}
          </div>
        </div>
        {cycle.presente && status !== 'agendado' && status !== 'aberto' && (
          <button style={STYLES.btnTeal} onClick={() => setShowConfigModal(true)}>
            + Configurar novo ciclo
          </button>
        )}
      </div>

      {/* Banner permanente amarelo */}
      <div style={STYLES.banner}>
        <div style={{ fontSize: 16, flexShrink: 0 }}>⚠️</div>
        <div>
          <strong style={{ fontWeight: 700 }}>{BANNER_TEXT_NR1.split('.')[0]}.</strong>{' '}
          {BANNER_TEXT_NR1.split('.').slice(1).join('.').trim()}
        </div>
      </div>

      {/* Abas */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 18,
          borderBottom: '1px solid #E5E7EB',
          paddingBottom: 0,
        }}
      >
        {ABAS_NR1.map((a) => (
          <button key={a} style={STYLES.tab(aba === a)} onClick={() => setAba(a)}>
            {ABA_LABELS[a]}
          </button>
        ))}
      </div>

      {/* Corpo */}
      {aba === 'visao_geral' && renderVisaoGeral()}
      {aba === 'alertas_historico' && renderAlertasHistorico()}

      {/* Modais */}
      {renderConfigModal()}
      {renderEditModal()}
      {renderDetailModal()}

      {/* Toast */}
      {toast.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#1F2937',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 300,
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-componentes internos
// -----------------------------------------------------------------------

function InfoBlock({
  label,
  value,
  sub,
  highlight,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  valueColor?: string;
}): ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div
        style={{
          fontSize: 11,
          color: '#6B7280',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? 16 : 13,
          fontWeight: highlight ? 700 : 600,
          color: valueColor ?? '#111827',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: '#9CA3AF',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function DownloadPdfButton({
  cicloDbId,
  setToast,
}: {
  cicloDbId: number;
  setToast: (msg: string) => void;
}): ReactElement {
  const [dlLoading, setDlLoading] = useState(false);
  return (
    <button
      style={STYLES.btnOutline}
      disabled={dlLoading}
      onClick={async () => {
        setDlLoading(true);
        const r = await startDownloadTokenAction({
          cicloDbId,
        });
        setDlLoading(false);
        if (r.ok) {
          window.open(r.data.downloadUrl, '_blank');
        } else {
          setToast(r.message);
        }
      }}
    >
      ⬇ PDF
    </button>
  );
}
