// ROIP APP 9BOX — client component canônico da rota Bruno
// `/super-admin/empresa/[id]/onboarding-lideres` (§14.27, ME-080c).
//
// Componentiza canonicamente:
//   - Kanban de 4 colunas fixas (Treinar/Em treinamento/Treinado/
//     Reciclagem) — bit-exact com mockup `onboarding_lideres_v1.html`.
//   - Card de líder: nome + cargo + departamento + N liderados diretos
//     + badge tempo permanência (âmbar > 15 dias).
//   - Filtros: busca por nome + dropdown de departamento (client-side).
//   - Ordenação: tempo de permanência descendente (server-side, já
//     retornado ordenado por `leaderOnboarding.list`).
//   - Modal de edição: seletor de estágio (single-select) + histórico
//     de anotações + campo nova anotação (100-500 chars, obrigatória)
//     + [Cancelar] + [Salvar].
//   - Mudança de estágio exclusivamente via modal — SEM drag-and-drop
//     (§14.27 explícito).
//   - Toast local (useState) para feedback pós-mutação — padrão B8
//     dominante (Nr1Client, DadosMensaisClient).
//
// **RV-13.** Imports de internals.ts + actions consumidos aqui.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

import {
  getLeaderDetailAction,
  listOnboardingCardsAction,
  type OnboardingNoteWire,
  updateOnboardingStageAction,
} from './actions';
import {
  ANOTACAO_MAX_CHARS_CLIENT,
  ANOTACAO_MIN_CHARS_CLIENT,
  BADGE_DIAS_AMBAR_THRESHOLD,
  ESTAGIO_COL_CLASS,
  ESTAGIO_LABELS,
  ESTAGIOS,
  type EstagioOnb,
  computeDiasNoEstagio,
  formatDiasNoEstagio,
  formatTimestampBR,
  iniciaisDoNome,
} from './internals';

// -----------------------------------------------------------------------
// Tipos canônicos (contrato page→client)
// -----------------------------------------------------------------------

export interface OnboardingCardInitial {
  readonly employeeId: number;
  readonly nome: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly onboardingEstagio: EstagioOnb;
  readonly countLiderados: number;
  readonly entradaEstagioAtualIso: string;
}

interface OnboardingLideresClientProps {
  readonly companyId: number;
  readonly companyName: string;
  readonly initialCards: readonly OnboardingCardInitial[];
  readonly initialNowIso: string;
}

// -----------------------------------------------------------------------
// Paleta canônica das 4 colunas (§14.27 + mockup linhas 79-82)
// -----------------------------------------------------------------------

interface ColStyle {
  readonly bg: string;
  readonly titleColor: string;
}

const COL_STYLE: Record<EstagioOnb, ColStyle> = {
  treinar: { bg: '#FEF3C7', titleColor: COLORS.text.tertiary },
  em_treinamento: { bg: '#DBEAFE', titleColor: COLORS.badge.infoText },
  treinado: { bg: '#DCFCE7', titleColor: COLORS.badge.successTextAlt },
  reciclagem: { bg: '#F3F4F6', titleColor: COLORS.badge.warningText },
};

// -----------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------

export function OnboardingLideresClient(props: OnboardingLideresClientProps): JSX.Element {
  const { companyId, initialCards, initialNowIso } = props;

  const [cards, setCards] = useState<readonly OnboardingCardInitial[]>(initialCards);
  const [nowIso, setNowIso] = useState<string>(initialNowIso);
  const [busca, setBusca] = useState<string>('');
  const [deptoFiltro, setDeptoFiltro] = useState<string>('__todos__');

  // Modal state.
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalCard, setModalCard] = useState<OnboardingCardInitial | null>(null);
  const [modalEstagio, setModalEstagio] = useState<EstagioOnb>('treinar');
  const [modalTexto, setModalTexto] = useState<string>('');
  const [modalSaving, setModalSaving] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // ME-080c-patch1 — refs para eliminar closure stale no handler
  // `salvarEstagio`. React 19 pode batchar keystrokes/clicks de formas
  // que o setState mais recente ainda não tenha propagado no render em
  // que o click do Salvar é despachado. Lendo do ref garantimos leitura
  // do valor MAIS RECENTE independente do timing de render.
  const modalTextoRef = useRef<string>('');
  const modalEstagioRef = useRef<EstagioOnb>('treinar');
  const modalCardRef = useRef<OnboardingCardInitial | null>(null);

  // ME-080c-patch1 — histórico canônico exibido no modal §21.2 (via
  // getLeaderDetailAction ao abrir). Cronológico descendente (nota mais
  // recente no topo).
  const [modalHistory, setModalHistory] = useState<readonly OnboardingNoteWire[]>([]);
  const [modalHistoryLoading, setModalHistoryLoading] = useState<boolean>(false);
  const [modalHistoryError, setModalHistoryError] = useState<string | null>(null);

  // Toast local (padrão B8 — sem ToastProvider).
  const [toast, setToast] = useState<string>('');

  useEffect(() => {
    if (toast === '') {
      return;
    }
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // -----------------------------------------------------------------------
  // Departamentos únicos (para dropdown)
  // -----------------------------------------------------------------------
  const departamentos = useMemo<readonly string[]>(() => {
    const set = new Set<string>();
    for (const c of cards) {
      set.add(c.departamento);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [cards]);

  // -----------------------------------------------------------------------
  // Cards filtrados por busca + departamento
  // -----------------------------------------------------------------------
  const cardsFiltrados = useMemo<readonly OnboardingCardInitial[]>(() => {
    const buscaLower = busca.trim().toLowerCase();
    return cards.filter((c) => {
      if (buscaLower !== '' && !c.nome.toLowerCase().includes(buscaLower)) {
        return false;
      }
      if (deptoFiltro !== '__todos__' && c.departamento !== deptoFiltro) {
        return false;
      }
      return true;
    });
  }, [cards, busca, deptoFiltro]);

  // -----------------------------------------------------------------------
  // Cards agrupados por coluna
  // -----------------------------------------------------------------------
  const cardsPorColuna = useMemo<Record<EstagioOnb, readonly OnboardingCardInitial[]>>(() => {
    const acc: Record<EstagioOnb, OnboardingCardInitial[]> = {
      treinar: [],
      em_treinamento: [],
      treinado: [],
      reciclagem: [],
    };
    for (const c of cardsFiltrados) {
      acc[c.onboardingEstagio].push(c);
    }
    return acc;
  }, [cardsFiltrados]);

  // -----------------------------------------------------------------------
  // Handlers de modal — ME-080c-patch1 blindados contra closure stale
  // -----------------------------------------------------------------------

  // Setters wrappers: cada mudança de estado propaga IMEDIATAMENTE para
  // o ref (síncrono), enquanto o setState dispara o re-render (assíncrono).
  const setModalTextoSync = useCallback((v: string): void => {
    modalTextoRef.current = v;
    setModalTexto(v);
  }, []);

  const setModalEstagioSync = useCallback((v: EstagioOnb): void => {
    modalEstagioRef.current = v;
    setModalEstagio(v);
  }, []);

  const abrirModal = useCallback(async (card: OnboardingCardInitial): Promise<void> => {
    modalCardRef.current = card;
    modalEstagioRef.current = card.onboardingEstagio;
    modalTextoRef.current = '';
    setModalCard(card);
    setModalEstagio(card.onboardingEstagio);
    setModalTexto('');
    setModalError(null);
    setModalHistory([]);
    setModalHistoryError(null);
    setModalOpen(true);

    // Fetch canônico §21.2 do histórico.
    setModalHistoryLoading(true);
    try {
      const result = await getLeaderDetailAction({ employeeId: card.employeeId });
      // Guarda contra modal ter sido fechado entre o abrir e o resultado.
      if (modalCardRef.current?.employeeId !== card.employeeId) {
        return;
      }
      if (result.ok) {
        setModalHistory(result.data.notes);
      } else {
        setModalHistoryError(result.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar histórico.';
      setModalHistoryError(msg);
    } finally {
      setModalHistoryLoading(false);
    }
  }, []);

  const fecharModal = useCallback((): void => {
    modalCardRef.current = null;
    modalTextoRef.current = '';
    setModalOpen(false);
    setModalCard(null);
    setModalError(null);
    setModalTexto('');
    setModalHistory([]);
    setModalHistoryError(null);
  }, []);

  const salvarEstagio = useCallback(async (): Promise<void> => {
    // ME-080c-patch1 — lê SEMPRE dos refs, não das variáveis de estado.
    // Isso elimina a race condition que causava "salvar sem efeito" na
    // 1ª tentativa quando o usuário clicava na coluna e digitava texto
    // em sequência rápida (bug reportado em produção).
    const card = modalCardRef.current;
    if (card === null) {
      return;
    }
    const texto = modalTextoRef.current.trim();
    const estagio = modalEstagioRef.current;

    if (texto.length < ANOTACAO_MIN_CHARS_CLIENT) {
      setModalError(`A anotação deve ter no mínimo ${ANOTACAO_MIN_CHARS_CLIENT} caracteres.`);
      return;
    }
    if (texto.length > ANOTACAO_MAX_CHARS_CLIENT) {
      setModalError(`A anotação deve ter no máximo ${ANOTACAO_MAX_CHARS_CLIENT} caracteres.`);
      return;
    }

    setModalSaving(true);
    setModalError(null);
    try {
      const result = await updateOnboardingStageAction({
        employeeId: card.employeeId,
        novoEstagio: estagio,
        texto,
      });
      if (!result.ok) {
        setModalError(result.message);
        setModalSaving(false);
        return;
      }
      // ME-080c-patch1 — refetch canônico AWAITED antes de fechar o
      // modal. Se refetch falhar, mantém modal aberto com erro; se
      // suceder, aplica os novos cards ANTES do close/toast — garante
      // que o kanban re-renderiza com dado fresco.
      const refetch = await listOnboardingCardsAction({ companyId });
      if (!refetch.ok) {
        setModalError(`Salvamento efetivado, mas falhou recarregar: ${refetch.message}`);
        setModalSaving(false);
        return;
      }
      setCards(refetch.data);
      setNowIso(new Date().toISOString());
      setToast('Estágio de onboarding atualizado com sucesso.');
      setModalSaving(false);
      fecharModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.';
      setModalError(msg);
      setModalSaving(false);
    }
  }, [companyId, fecharModal]);

  // -----------------------------------------------------------------------
  // Estilos inline canônicos
  // -----------------------------------------------------------------------

  const contentStyle: CSSProperties = {
    padding: '22px 26px 40px 26px',
  };

  const pageTitleStyle: CSSProperties = {
    fontSize: 21,
    fontWeight: 700,
    color: COLORS.text.primary,
  };

  const pageSubStyle: CSSProperties = {
    fontSize: 13,
    color: COLORS.text.tertiary,
    marginTop: 3,
  };

  const filterBarStyle: CSSProperties = {
    display: 'flex',
    gap: 10,
    marginBottom: 20,
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  const inputStyle: CSSProperties = {
    padding: '9px 14px',
    border: `1px solid ${COLORS.text.quaternary}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#FFFFFF',
    color: COLORS.text.secondary,
    minWidth: 220,
    flex: 1,
  };

  const selectStyle: CSSProperties = {
    padding: '9px 14px',
    border: `1px solid ${COLORS.text.quaternary}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#FFFFFF',
    color: COLORS.text.secondary,
    cursor: 'pointer',
  };

  const kanbanStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 14,
    alignItems: 'start',
  };

  return (
    <div style={contentStyle}>
      <div style={{ marginBottom: 20 }}>
        <div style={pageTitleStyle}>Onboarding de líderes</div>
        <div style={pageSubStyle}>
          Acompanhe o estágio de treinamento de cada líder na plataforma
        </div>
      </div>

      <div style={filterBarStyle}>
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={inputStyle}
        />
        <select
          value={deptoFiltro}
          onChange={(e) => setDeptoFiltro(e.target.value)}
          style={selectStyle}
        >
          <option value="__todos__">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div style={kanbanStyle}>
        {ESTAGIOS.map((estagio) => (
          <KanbanColumn
            key={estagio}
            estagio={estagio}
            cards={cardsPorColuna[estagio]}
            nowIso={nowIso}
            onOpenCard={abrirModal}
          />
        ))}
      </div>

      {modalOpen && modalCard !== null ? (
        <ModalEdicao
          card={modalCard}
          estagioSelected={modalEstagio}
          texto={modalTexto}
          saving={modalSaving}
          error={modalError}
          history={modalHistory}
          historyLoading={modalHistoryLoading}
          historyError={modalHistoryError}
          onChangeEstagio={setModalEstagioSync}
          onChangeTexto={setModalTextoSync}
          onCancelar={fecharModal}
          onSalvar={salvarEstagio}
        />
      ) : null}

      {toast !== '' ? <ToastBanner message={toast} /> : null}
    </div>
  );
}

// -----------------------------------------------------------------------
// KanbanColumn
// -----------------------------------------------------------------------

interface KanbanColumnProps {
  readonly estagio: EstagioOnb;
  readonly cards: readonly OnboardingCardInitial[];
  readonly nowIso: string;
  readonly onOpenCard: (card: OnboardingCardInitial) => void;
}

function KanbanColumn(props: KanbanColumnProps): JSX.Element {
  const { estagio, cards, nowIso, onOpenCard } = props;
  const style = COL_STYLE[estagio];
  const colStyle: CSSProperties = {
    background: style.bg,
    borderRadius: 12,
    padding: 12,
    minHeight: 200,
  };
  const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    padding: '0 2px',
  };
  const titleStyle: CSSProperties = {
    fontSize: 12.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
    color: style.titleColor,
  };
  const countStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    background: '#FFFFFF',
    color: COLORS.text.secondary,
  };
  return (
    <div className={ESTAGIO_COL_CLASS[estagio]} style={colStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>{ESTAGIO_LABELS[estagio]}</span>
        <span style={countStyle}>{cards.length}</span>
      </div>
      {cards.map((c) => (
        <KanbanCard key={c.employeeId} card={c} nowIso={nowIso} onOpen={onOpenCard} />
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------
// KanbanCard
// -----------------------------------------------------------------------

interface KanbanCardProps {
  readonly card: OnboardingCardInitial;
  readonly nowIso: string;
  readonly onOpen: (card: OnboardingCardInitial) => void;
}

function KanbanCard(props: KanbanCardProps): JSX.Element {
  const { card, nowIso, onOpen } = props;
  const entrada = new Date(card.entradaEstagioAtualIso);
  const now = new Date(nowIso);
  const dias = computeDiasNoEstagio(entrada, now);
  const destaque = dias > BADGE_DIAS_AMBAR_THRESHOLD;
  const cardStyle: CSSProperties = {
    background: '#FFFFFF',
    border: `1px solid ${COLORS.border.default}`,
    borderRadius: 10,
    padding: '12px 13px',
    marginBottom: 10,
    cursor: 'pointer',
  };
  const nomeStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.text.primary,
    lineHeight: 1.3,
  };
  const cargoStyle: CSSProperties = {
    fontSize: 11.5,
    color: COLORS.text.tertiary,
    marginTop: 3,
    lineHeight: 1.35,
  };
  const metaStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px dashed ${COLORS.border.default}`,
  };
  const lideradosStyle: CSSProperties = {
    fontSize: 10.5,
    color: COLORS.text.quaternary,
    fontWeight: 600,
  };
  const tempoStyle: CSSProperties = {
    fontSize: 10,
    color: destaque ? COLORS.badge.warningText : COLORS.text.quaternary,
    fontWeight: destaque ? 600 : 400,
  };
  return (
    <div
      style={cardStyle}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(card);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div style={nomeStyle}>{card.nome}</div>
      <div style={cargoStyle}>
        {card.cargo} · {card.departamento}
      </div>
      <div style={metaStyle}>
        <span style={lideradosStyle}>{card.countLiderados} liderados diretos</span>
        <span style={tempoStyle}>{formatDiasNoEstagio(dias)}</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// ModalEdicao
// -----------------------------------------------------------------------

interface ModalEdicaoProps {
  readonly card: OnboardingCardInitial;
  readonly estagioSelected: EstagioOnb;
  readonly texto: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly history: readonly OnboardingNoteWire[];
  readonly historyLoading: boolean;
  readonly historyError: string | null;
  readonly onChangeEstagio: (e: EstagioOnb) => void;
  readonly onChangeTexto: (t: string) => void;
  readonly onCancelar: () => void;
  readonly onSalvar: () => void;
}

function ModalEdicao(props: ModalEdicaoProps): JSX.Element {
  const {
    card,
    estagioSelected,
    texto,
    saving,
    error,
    history,
    historyLoading,
    historyError,
    onChangeEstagio,
    onChangeTexto,
    onCancelar,
    onSalvar,
  } = props;

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17,24,39,.5)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '60px 20px',
    overflowY: 'auto',
  };
  const boxStyle: CSSProperties = {
    background: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 20px 60px rgba(0,0,0,.2)',
  };
  const headerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 20px',
    borderBottom: `1px solid ${COLORS.border.default}`,
  };
  const avatarStyle: CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: COLORS.primary.navy,
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
  };
  const nomeStyle: CSSProperties = {
    fontSize: 14.5,
    fontWeight: 700,
    color: COLORS.text.primary,
  };
  const cargoStyle: CSSProperties = {
    fontSize: 11.5,
    color: COLORS.text.tertiary,
    marginTop: 2,
  };
  const closeBtnStyle: CSSProperties = {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    color: COLORS.text.tertiary,
    cursor: 'pointer',
    padding: 4,
  };
  const bodyStyle: CSSProperties = {
    padding: 20,
    maxHeight: '60vh',
    overflowY: 'auto',
  };
  const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    marginBottom: 10,
  };
  const stageSelectorStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 22,
    flexWrap: 'wrap',
  };
  const stageOptBase: CSSProperties = {
    flex: 1,
    minWidth: 100,
    padding: '10px 8px',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
  };
  const textareaStyle: CSSProperties = {
    width: '100%',
    border: `1px solid ${COLORS.text.quaternary}`,
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: 70,
  };
  const counterStyle: CSSProperties = {
    fontSize: 10.5,
    color: COLORS.text.quaternary,
    textAlign: 'right',
    marginTop: 4,
  };
  const footerStyle: CSSProperties = {
    padding: '16px 20px',
    borderTop: `1px solid ${COLORS.border.default}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  };
  const btnCancelStyle: CSSProperties = {
    padding: '9px 18px',
    borderRadius: 8,
    border: `1px solid ${COLORS.text.quaternary}`,
    background: '#FFFFFF',
    color: COLORS.text.secondary,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };
  const btnSaveStyle: CSSProperties = {
    padding: '9px 20px',
    borderRadius: 8,
    border: 'none',
    background: saving ? COLORS.text.quaternary : COLORS.primary.navy,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: saving ? 'not-allowed' : 'pointer',
  };
  const errorStyle: CSSProperties = {
    background: COLORS.badge.dangerBg,
    color: COLORS.badge.dangerText,
    fontSize: 12,
    padding: '8px 12px',
    borderRadius: 6,
    marginBottom: 10,
  };

  const stopPropagation = (e: React.MouseEvent): void => {
    e.stopPropagation();
  };

  const textareaPlaceholder =
    `Registre o contexto desta mudança de estágio ` +
    `(mínimo ${ANOTACAO_MIN_CHARS_CLIENT}, máximo ${ANOTACAO_MAX_CHARS_CLIENT} caracteres)...`;

  return (
    <div style={overlayStyle} onClick={onCancelar}>
      <div style={boxStyle} onClick={stopPropagation}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={avatarStyle}>{iniciaisDoNome(card.nome)}</div>
            <div>
              <div style={nomeStyle}>{card.nome}</div>
              <div style={cargoStyle}>
                {card.cargo} · {card.departamento}
              </div>
            </div>
          </div>
          <button style={closeBtnStyle} onClick={onCancelar} type="button" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div style={bodyStyle}>
          {error !== null ? <div style={errorStyle}>{error}</div> : null}
          <div style={sectionLabelStyle}>Estágio de onboarding</div>
          <div style={stageSelectorStyle}>
            {ESTAGIOS.map((e) => {
              const selected = e === estagioSelected;
              const opt: CSSProperties = {
                ...stageOptBase,
                border: selected
                  ? `1.5px solid ${COLORS.accent.teal}`
                  : `1.5px solid ${COLORS.text.quaternary}`,
                background: selected ? COLORS.badge.tealClaroBgAlt : '#FFFFFF',
                color: selected ? COLORS.badge.tealClaroText : COLORS.text.secondary,
              };
              return (
                <div
                  key={e}
                  style={opt}
                  onClick={() => onChangeEstagio(e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onChangeEstagio(e);
                    }
                  }}
                >
                  {ESTAGIO_LABELS[e]}
                </div>
              );
            })}
          </div>
          <div style={sectionLabelStyle}>Histórico de anotações</div>
          <HistoricoAnotacoes history={history} loading={historyLoading} error={historyError} />
          <div style={{ ...sectionLabelStyle, marginTop: 18 }}>Nova anotação</div>
          <textarea
            value={texto}
            onChange={(e) => onChangeTexto(e.target.value)}
            maxLength={ANOTACAO_MAX_CHARS_CLIENT}
            placeholder={textareaPlaceholder}
            style={textareaStyle}
          />
          <div style={counterStyle}>
            {texto.length} / {ANOTACAO_MAX_CHARS_CLIENT} caracteres (mínimo{' '}
            {ANOTACAO_MIN_CHARS_CLIENT})
          </div>
        </div>
        <div style={footerStyle}>
          <button style={btnCancelStyle} onClick={onCancelar} type="button" disabled={saving}>
            Cancelar
          </button>
          <button style={btnSaveStyle} onClick={onSalvar} type="button" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// ToastBanner
// -----------------------------------------------------------------------

interface ToastBannerProps {
  readonly message: string;
}

function ToastBanner(props: ToastBannerProps): JSX.Element {
  const toastStyle: CSSProperties = {
    position: 'fixed',
    bottom: 24,
    right: 24,
    background: COLORS.primary.navy,
    color: '#FFFFFF',
    padding: '12px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    zIndex: 300,
  };
  return <div style={toastStyle}>{props.message}</div>;
}

// -----------------------------------------------------------------------
// HistoricoAnotacoes — cronológico descendente (§14.27 + §21.2)
// -----------------------------------------------------------------------

interface HistoricoAnotacoesProps {
  readonly history: readonly OnboardingNoteWire[];
  readonly loading: boolean;
  readonly error: string | null;
}

function autorTipoLabel(t: 'super_admin' | 'rh'): string {
  return t === 'super_admin' ? 'Super Admin' : 'RH';
}

function HistoricoAnotacoes(props: HistoricoAnotacoesProps): JSX.Element {
  const { history, loading, error } = props;

  const listStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 180,
    overflowY: 'auto',
    marginBottom: 4,
  };
  const emptyStyle: CSSProperties = {
    fontSize: 12,
    color: COLORS.text.quaternary,
    fontStyle: 'italic',
    padding: '8px 0',
  };
  const itemStyle: CSSProperties = {
    background: '#F9FAFB',
    border: `1px solid ${COLORS.border.default}`,
    borderRadius: 8,
    padding: '10px 12px',
  };
  const metaStyle: CSSProperties = {
    fontSize: 10.5,
    color: COLORS.text.quaternary,
    marginBottom: 4,
    fontWeight: 600,
  };
  const textStyle: CSSProperties = {
    fontSize: 12.5,
    color: COLORS.text.secondary,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  };
  const errStyle: CSSProperties = {
    ...emptyStyle,
    color: COLORS.badge.dangerText,
    fontStyle: 'normal',
  };

  if (loading) {
    return <div style={emptyStyle}>Carregando histórico...</div>;
  }
  if (error !== null) {
    return <div style={errStyle}>Erro ao carregar histórico: {error}</div>;
  }
  if (history.length === 0) {
    return <div style={emptyStyle}>Nenhuma anotação anterior — este será o primeiro registro.</div>;
  }
  return (
    <div style={listStyle}>
      {history.map((n) => (
        <div key={n.id} style={itemStyle}>
          <div style={metaStyle}>
            {autorTipoLabel(n.autorTipo)} · {formatTimestampBR(new Date(n.createdAtIso))}
          </div>
          <div style={textStyle}>{n.texto}</div>
        </div>
      ))}
    </div>
  );
}
