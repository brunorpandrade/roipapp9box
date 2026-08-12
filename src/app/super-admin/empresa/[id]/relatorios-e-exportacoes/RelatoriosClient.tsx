// ROIP APP 9BOX — client component canônico da rota Bruno
// `/super-admin/empresa/[id]/relatorios-e-exportacoes` (§12, ME-079a).
//
// Componentiza canonicamente:
// - Cabeçalho + linha de contexto do trimestre mais recente fechado.
// - 2 subseções: "Planilhas operacionais" (2 cards) +
//   "Relatórios executivos" (4 cards).
// - Bruno vê todos os 6 cards (nenhuma ocultação — §12.3).
// - Seletor em cascata (Nível → Dropdown 2) para 4 artefatos.
// - Card Clima usa dropdown único de Ciclo (§12.7).
// - Relatório executivo com rodapé de uso diário (§11.4).
// - Desktop-only (§12.11).
//
// **RV-13.** Imports de internals.ts + actions consumidos aqui.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';

import {
  generateRelatorioExecutivoAction,
  listClosedQuartersAction,
  listDepartmentsAction,
  listLeadersAction,
  type ClosedQuarter,
  type LeaderOption,
} from './actions';
import { CARD_DEFS, ICON_COLORS, NIVEL_OPTIONS, type CardId, type NivelEscopo } from './internals';

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

interface Props {
  readonly companyId: number;
  readonly companyName: string;
}

// -----------------------------------------------------------------------
// Estilos
// -----------------------------------------------------------------------

const CARD_STYLE = {
  background: COLORS.background.card,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 10,
  padding: 20,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  gap: 12,
} as const;

const SELECT_STYLE = {
  padding: '8px 12px',
  border: `1px solid ${'#D1D5DB'}`,
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'inherit',
  color: COLORS.text.primary,
  background: 'white',
  minWidth: 160,
} as const;

const BTN_PRIMARY = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#1F3A5F',
  color: 'white',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 6,
} as const;

// -----------------------------------------------------------------------
// State por card (seletores + loading)
// -----------------------------------------------------------------------

interface CardState {
  nivel: NivelEscopo;
  nivelRef: string;
  trimestre: string;
  loading: boolean;
}

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function RelatoriosClient(props: Props): JSX.Element {
  const { companyId } = props;

  // Dados globais
  const [quarters, setQuarters] = useState<ClosedQuarter[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<LeaderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Estado por card
  const [cardStates, setCardStates] = useState<Map<CardId, CardState>>(new Map());

  // Fetch inicial
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [qResult, dResult, lResult] = await Promise.all([
          listClosedQuartersAction({ companyId }),
          listDepartmentsAction({ companyId }),
          listLeadersAction({ companyId }),
        ]);
        if (qResult.ok) {
          setQuarters(qResult.data);
        }
        if (dResult.ok) {
          setDepartments(dResult.data);
        }
        if (lResult.ok) {
          setLeaders(lResult.data);
        }
      } catch {
        setError('Não foi possível carregar os relatórios. ' + 'Tente novamente.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [companyId]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast !== null) {
      const id = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  // Helpers de state por card
  const getCardState = useCallback(
    (cardId: CardId): CardState => {
      return (
        cardStates.get(cardId) ?? {
          nivel: 'empresa',
          nivelRef: '',
          trimestre: quarters[0]?.trimestre ?? '',
          loading: false,
        }
      );
    },
    [cardStates, quarters],
  );

  const updateCardState = useCallback(
    (cardId: CardId, patch: Partial<CardState>) => {
      setCardStates((prev) => {
        const next = new Map(prev);
        const current = next.get(cardId) ?? {
          nivel: 'empresa' as NivelEscopo,
          nivelRef: '',
          trimestre: quarters[0]?.trimestre ?? '',
          loading: false,
        };
        next.set(cardId, { ...current, ...patch });
        return next;
      });
    },
    [quarters],
  );

  // Handler de download (redireciona para Route Handler)
  const handleDownload = useCallback(
    (cardId: CardId) => {
      const cs = getCardState(cardId);
      const params = new URLSearchParams({
        companyId: String(companyId),
        trimestre: cs.trimestre,
        escopoTipo: cs.nivel,
      });
      if (cs.nivel !== 'empresa' && cs.nivelRef.length > 0) {
        params.set('escopoReferencia', cs.nivelRef);
      }

      let apiPath = '';
      switch (cardId) {
        case 'resumo_dashboard':
        case 'evolucao_trimestral':
          // XLSX — mesma rota base; backend diferencia por type.
          apiPath = `/api/reports/snapshot-9box/download`;
          params.set('type', cardId);
          break;
        case 'snapshot_9box':
          apiPath = '/api/reports/snapshot-9box/download';
          break;
        case 'board_deck':
          apiPath = '/api/reports/board-deck/download';
          break;
        case 'clima_engajamento':
          apiPath = '/api/reports/clima-engajamento/download';
          break;
        default:
          return;
      }

      window.open(`${apiPath}?${params.toString()}`, '_blank');
    },
    [companyId, getCardState],
  );

  // Handler do relatório executivo (§11 — enfileira job assíncrono)
  const handleGenerateExecutivo = useCallback(async () => {
    const cs = getCardState('relatorio_executivo');
    updateCardState('relatorio_executivo', { loading: true });

    const result = await generateRelatorioExecutivoAction({
      companyId,
      trimestre: cs.trimestre,
      escopoTipo: cs.nivel,
      escopoReferencia: cs.nivel !== 'empresa' ? cs.nivelRef : undefined,
    });

    updateCardState('relatorio_executivo', { loading: false });
    if (result.ok) {
      setToast('Relatório em geração. Você será notificado no ' + 'sino quando estiver pronto.');
    } else {
      setToast(result.message);
    }
  }, [companyId, getCardState, updateCardState]);

  // Trimestre mais recente
  const latestQuarter = quarters[0] ?? null;
  const hasQuarters = quarters.length > 0;

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (loading) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 40,
          color: COLORS.text.secondary,
          fontSize: 13,
        }}
      >
        Carregando relatórios disponíveis...
      </div>
    );
  }

  if (error !== null) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 40,
          color: '#991B1B',
          fontSize: 13,
        }}
      >
        {error}
        <br />
        <button
          type="button"
          onClick={() => window.location.reload()}
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
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.text.primary,
            margin: 0,
          }}
        >
          Relatórios e exportações
        </h1>
        <p
          style={{
            fontSize: 13,
            color: COLORS.text.secondary,
            margin: '4px 0 0 0',
          }}
        >
          Geração sob demanda de planilhas operacionais e relatórios executivos
        </p>
        {latestQuarter !== null && (
          <p
            style={{
              fontSize: 12,
              color: COLORS.text.secondary,
              margin: '8px 0 0 0',
            }}
          >
            Trimestre mais recente fechado: <strong>{latestQuarter.label}</strong>
          </p>
        )}
      </div>

      {/* Nota quando sem trimestres fechados (§12.10) */}
      {!hasQuarters && (
        <div
          style={{
            padding: '12px 16px',
            background: '#FEF3C7',
            borderLeft: '3px solid #D97706',
            borderRadius: 8,
            fontSize: 12,
            color: '#92400E',
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          Esta empresa ainda não fechou nenhum trimestre. Os relatórios abaixo ficam disponíveis a
          partir do primeiro fechamento trimestral (dia 11 do mês seguinte ao fim do trimestre).
        </div>
      )}

      {/* Subseção: Planilhas operacionais */}
      <SectionTitle title="Planilhas operacionais" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {CARD_DEFS.filter((c) => c.section === 'planilhas').map((card) => (
          <ExportCard
            key={card.id}
            card={card}
            state={getCardState(card.id)}
            quarters={quarters}
            departments={departments}
            leaders={leaders}
            hasQuarters={hasQuarters}
            onStateChange={(patch) => updateCardState(card.id, patch)}
            onDownload={() => handleDownload(card.id)}
            onGenerate={undefined}
          />
        ))}
      </div>

      {/* Subseção: Relatórios executivos */}
      <SectionTitle title="Relatórios executivos" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {CARD_DEFS.filter((c) => c.section === 'relatorios').map((card) => (
          <ExportCard
            key={card.id}
            card={card}
            state={getCardState(card.id)}
            quarters={quarters}
            departments={departments}
            leaders={leaders}
            hasQuarters={hasQuarters}
            onStateChange={(patch) => updateCardState(card.id, patch)}
            onDownload={() => handleDownload(card.id)}
            onGenerate={card.id === 'relatorio_executivo' ? handleGenerateExecutivo : undefined}
          />
        ))}
      </div>

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
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-componente: título de seção
// -----------------------------------------------------------------------

function SectionTitle(props: { readonly title: string }): JSX.Element {
  return (
    <h2
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.text.primary,
        margin: '0 0 12px 0',
        letterSpacing: 0.02,
      }}
    >
      {props.title}
    </h2>
  );
}

// -----------------------------------------------------------------------
// Sub-componente: card de exportável (§12.4)
// -----------------------------------------------------------------------

interface ExportCardProps {
  readonly card: (typeof CARD_DEFS)[number];
  readonly state: CardState;
  readonly quarters: ClosedQuarter[];
  readonly departments: string[];
  readonly leaders: LeaderOption[];
  readonly hasQuarters: boolean;
  readonly onStateChange: (patch: Partial<CardState>) => void;
  readonly onDownload: () => void;
  readonly onGenerate: (() => Promise<void>) | undefined;
}

function ExportCard(props: ExportCardProps): JSX.Element {
  const {
    card,
    state,
    quarters,
    departments,
    leaders,
    hasQuarters,
    onStateChange,
    onDownload,
    onGenerate,
  } = props;

  const iconColor = ICON_COLORS[card.iconType];
  const isExecutivo = card.id === 'relatorio_executivo';
  const isClima = card.id === 'clima_engajamento';
  const disabled = !hasQuarters;

  // Determinar opções de nível disponíveis
  const nivelOpts = card.hasEquipe
    ? NIVEL_OPTIONS
    : NIVEL_OPTIONS.filter((o) => o.value !== 'equipe');

  return (
    <div style={CARD_STYLE}>
      {/* Cabeçalho do card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: iconColor.bg,
            color: iconColor.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {card.iconType === 'xlsx' ? '📊' : card.iconType === 'ia' ? '🤖' : '📄'}
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.text.primary,
            }}
          >
            {card.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: COLORS.text.secondary,
              marginTop: 2,
            }}
          >
            {card.subtitle}
          </div>
        </div>
      </div>

      {/* Seletores */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        {/* Seletor em cascata (§12.5) — 4 artefatos */}
        {card.hasCascade && (
          <>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: COLORS.text.secondary,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 0.04,
                }}
              >
                Escopo
              </label>
              <select
                value={state.nivel}
                onChange={(e) =>
                  onStateChange({
                    nivel: e.target.value as NivelEscopo,
                    nivelRef: '',
                  })
                }
                disabled={disabled}
                style={SELECT_STYLE}
              >
                {nivelOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {state.nivel === 'departamento' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: COLORS.text.secondary,
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 0.04,
                  }}
                >
                  Departamento
                </label>
                <select
                  value={state.nivelRef}
                  onChange={(e) => onStateChange({ nivelRef: e.target.value })}
                  disabled={disabled}
                  style={SELECT_STYLE}
                >
                  <option value="">— Selecione —</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {state.nivel === 'equipe' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: COLORS.text.secondary,
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 0.04,
                  }}
                >
                  Líder
                </label>
                <select
                  value={state.nivelRef}
                  onChange={(e) => onStateChange({ nivelRef: e.target.value })}
                  disabled={disabled}
                  style={SELECT_STYLE}
                >
                  <option value="">— Selecione —</option>
                  {leaders.map((l) => (
                    <option key={`${l.tipo}-${l.id}`} value={String(l.id)}>
                      {l.name} — {l.departamento}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* Seletor de trimestre (§12.6) */}
        {!isClima && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: COLORS.text.secondary,
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: 0.04,
              }}
            >
              {card.id === 'evolucao_trimestral' ? 'Trimestre final' : 'Trimestre'}
            </label>
            <select
              value={state.trimestre}
              onChange={(e) => onStateChange({ trimestre: e.target.value })}
              disabled={disabled}
              style={SELECT_STYLE}
            >
              {quarters.length === 0 && <option value="">Nenhum trimestre fechado</option>}
              {quarters.map((q) => (
                <option key={q.trimestre} value={q.trimestre}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Dropdown único de Ciclo para Clima (§12.7) */}
        {isClima && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 600,
                color: COLORS.text.secondary,
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: 0.04,
              }}
            >
              Ciclo
            </label>
            <select
              value={state.trimestre}
              onChange={(e) => onStateChange({ trimestre: e.target.value })}
              disabled={disabled}
              style={SELECT_STYLE}
            >
              {quarters.length === 0 && <option value="">Nenhum ciclo</option>}
              {quarters
                .filter((q) => {
                  const m = /Q([13])/.exec(q.trimestre);
                  return m !== null;
                })
                .map((q) => (
                  <option key={q.trimestre} value={q.trimestre}>
                    {q.label} (Instrumento D)
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Botão de ação (§12.8) */}
      {isExecutivo ? (
        <button
          type="button"
          onClick={() => void onGenerate?.()}
          disabled={disabled || state.loading}
          style={{
            ...BTN_PRIMARY,
            opacity: disabled || state.loading ? 0.5 : 1,
            cursor: disabled || state.loading ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {state.loading ? 'Gerando...' : card.buttonLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          style={{
            ...BTN_PRIMARY,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {card.buttonLabel}
        </button>
      )}
    </div>
  );
}
