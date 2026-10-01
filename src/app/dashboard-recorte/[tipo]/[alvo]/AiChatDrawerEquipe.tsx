'use client';

// ROIP APP 9BOX — drawer canonico do Assistente de lideranca no
// dashboard-recorte/equipe (ME-UX-CONSOLIDACAO-P3a D3). Duplica
// bit-a-bit o AiChatDrawer do dashboard-individual com apenas 4
// mudancas canonicas: chips (AI_CHAT_CHIPS_EQUIPE), subtitulo do
// header ("Equipe — {leaderName}"), actions consumidas
// (`chatIaEquipeActions` com dashboardLevel='equipe'), e a chave do
// contexto (`leaderId` no lugar de `employeeId`).
//
// Reproduz bit-a-bit CAMADA_UI §8:
//   §8.1  Layout do drawer (largura 420px, borda esquerda teal #14B8A6,
//         cabecalho com titulo + subtitulo, area de mensagens, area de
//         entrada com textarea auto-resize e botao Enviar).
//   §8.2  Estados canonicos (padrao / aguardando resposta / falha /
//         sessao expirada — sessao expirada tratada pelo Layout via
//         redirect da action).
//   §8.3  Historico ativo (default) + sub-visualizacao "Ver conversas
//         arquivadas" (somente-leitura, paginada).
//   §8.4  Subtitulo do cabecalho sinaliza escopo ativo (Equipe X).
//
// Nivel canonico fixo `equipe`. Debito de deduplicacao registrado
// para P3b/futuro: extrair `AiChatDrawerCore` compartilhado com o
// individual apos o D3 estabilizar em producao.
//
// **RV-13.** Consumido por `AiChatLauncherEquipe.tsx` (mesmo diretorio).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';

import { COLORS } from '../../../../lib/design-tokens/colors';

import {
  chatIaEquipeGetArchivedHistoryAction,
  chatIaEquipeGetHistoryAction,
  chatIaEquipeSendMessageAction,
} from './chatIaEquipeActions';
import type { ChatIaMessage } from '../../../dashboard-individual/[id]/chatIaTypes';

/** Mensagem canonica literal §11.2 (fallback de falha Claude). */
export const MSG_CHAT_IA_FALLBACK_LITERAL =
  'Não foi possível processar sua pergunta agora. Tente novamente em alguns instantes.';

/** Corte canonico do input do usuario (mesmo do router). */
export const CHAT_IA_USER_MESSAGE_MAX_CHARS_CLIENT = 2000;

/** Placeholder canonico do textarea (§8.1). */
export const PLACEHOLDER_ENTRADA = 'Faça uma pergunta sobre este dashboard...';

/**
 * Rotulo canonico do Assistente de lideranca (ME-UX-CONSOLIDACAO D2).
 * Substitui o titulo generico "Chat IA" nas superficies onde o drawer
 * atende diretamente o lider (dashboard-individual e
 * dashboard-recorte/equipe — P3a).
 */
export const AI_CHAT_ROTULO_CANONICO = 'Assistente de liderança' as const;

// ME-UX-CONSOLIDACAO P3a: chips canonicos consolidados em
// `src/lib/chat-ia/chatIaChips.ts` para consumo compartilhado com o
// drawer da equipe. Re-exportacao aqui preserva callsites e testes
// existentes (ME-UX-CONSOLIDACAO-P1) que importam de AiChatDrawer.
import { AI_CHAT_CHIPS_EQUIPE } from '../../../../lib/chat-ia/chatIaChips';

export { AI_CHAT_CHIPS_EQUIPE };

/** Largura fixa canonica do drawer (§8.1). */
const DRAWER_WIDTH = 420;

/** Cor teal canonica da borda esquerda (§8.1). */
const TEAL_BORDER = '#14B8A6';

/** Cor navy canonica das bolhas `user` (§8.1). */
const USER_BUBBLE_BG = '#1F3A5F';

/** Cor cinza claro das bolhas `assistant` (§8.1). */
const ASSISTANT_BUBBLE_BG = '#F3F4F6';

/** Cor cinza escuro do texto assistant (§8.1). */
const ASSISTANT_BUBBLE_TEXT = '#111827';

const DRAWER_OVERLAY: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: DRAWER_WIDTH,
  background: COLORS.background.card,
  borderLeft: `3px solid ${TEAL_BORDER}`,
  boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.12)',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
};

const HEADER: CSSProperties = {
  padding: '16px 16px 12px 16px',
  borderBottom: `1px solid ${COLORS.border.default}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
};

const HEADER_TITLE: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: COLORS.text.primary,
  lineHeight: 1.2,
};

const HEADER_SUBTITLE: CSSProperties = {
  fontSize: 12,
  color: COLORS.text.tertiary,
  marginTop: 3,
};

const CLOSE_BTN: CSSProperties = {
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  borderRadius: 8,
  width: 32,
  height: 32,
  fontSize: 16,
  lineHeight: 1,
  color: COLORS.text.secondary,
  cursor: 'pointer',
  flexShrink: 0,
};

const ARCHIVE_LINK: CSSProperties = {
  fontSize: 11,
  color: COLORS.accent.teal,
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textDecoration: 'underline',
};

const MESSAGES_AREA: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const INPUT_AREA: CSSProperties = {
  padding: 16,
  borderTop: `1px solid ${COLORS.border.default}`,
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
};

const TEXTAREA: CSSProperties = {
  flex: 1,
  minHeight: 40,
  maxHeight: 120,
  border: `1px solid ${COLORS.border.default}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: COLORS.text.primary,
  background: COLORS.background.card,
  resize: 'none',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  outline: 'none',
};

const SEND_BTN: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: COLORS.accent.teal,
  color: '#FFFFFF',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  height: 40,
  flexShrink: 0,
};

/** Formato relativo canonico do timestamp (§8.1 — "agora mesmo", "ha 5 min"). */
function formatTimestamp(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) {
    return 'agora mesmo';
  }
  if (diffMin < 60) {
    return `há ${diffMin} min`;
  }
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    return `há ${diffH} h`;
  }
  const d = new Date(isoDate);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubble(props: { message: ChatIaMessage }): JSX.Element {
  const { message } = props;
  const isUser = message.role === 'user';
  const bubbleStyle: CSSProperties = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '80%',
    background: isUser ? USER_BUBBLE_BG : ASSISTANT_BUBBLE_BG,
    color: isUser ? '#FFFFFF' : ASSISTANT_BUBBLE_TEXT,
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  const stampStyle: CSSProperties = {
    fontSize: 11,
    color: '#9CA3AF',
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    marginTop: 2,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={bubbleStyle}>{message.content}</div>
      <div style={stampStyle}>{formatTimestamp(message.createdAt)}</div>
    </div>
  );
}

/** Bolha canonica "digitando..." (§8.2 aguardando resposta). */
function TypingBubble(): JSX.Element {
  const dotStyle: CSSProperties = {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#9CA3AF',
    margin: '0 2px',
    animation: 'chatIaBlink 1.2s infinite',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start' }}>
      <div
        style={{
          background: ASSISTANT_BUBBLE_BG,
          borderRadius: 12,
          padding: '10px 14px',
          maxWidth: '80%',
        }}
      >
        <style>{`
          @keyframes chatIaBlink {
            0%, 80%, 100% { opacity: 0.2; }
            40% { opacity: 1; }
          }
        `}</style>
        <span style={dotStyle} />
        <span style={{ ...dotStyle, animationDelay: '0.2s' }} />
        <span style={{ ...dotStyle, animationDelay: '0.4s' }} />
      </div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>digitando...</div>
    </div>
  );
}

/** Bolha canonica de erro §11.2 (falha Claude com botao Tentar novamente). */
function ErrorBubble(props: { onRetry: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start' }}>
      <div
        style={{
          background: ASSISTANT_BUBBLE_BG,
          color: ASSISTANT_BUBBLE_TEXT,
          borderRadius: 12,
          padding: '10px 14px',
          maxWidth: '80%',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {MSG_CHAT_IA_FALLBACK_LITERAL}
      </div>
      <button
        type="button"
        onClick={props.onRetry}
        style={{
          alignSelf: 'flex-start',
          marginTop: 6,
          padding: '4px 10px',
          fontSize: 11,
          background: 'transparent',
          color: COLORS.accent.teal,
          border: `1px solid ${COLORS.accent.teal}`,
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        🔁 Tentar novamente
      </button>
    </div>
  );
}

interface ArchivedViewState {
  readonly messages: readonly ChatIaMessage[];
  readonly page: number;
  readonly pageSize: number;
  readonly loading: boolean;
  readonly error: string | null;
}

const ARCHIVED_PAGE_SIZE = 20;

function ArchivedView(props: {
  leaderId: number;
  leaderType: 'employee' | 'clevel';
  onBack: () => void;
}): JSX.Element {
  const [state, setState] = useState<ArchivedViewState>({
    messages: [],
    page: 1,
    pageSize: ARCHIVED_PAGE_SIZE,
    loading: true,
    error: null,
  });

  const load = useCallback(
    async (page: number): Promise<void> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const res = await chatIaEquipeGetArchivedHistoryAction({
        leaderId: props.leaderId,
        leaderType: props.leaderType,
        page,
        pageSize: ARCHIVED_PAGE_SIZE,
      });
      if (!res.ok) {
        setState({
          messages: [],
          page,
          pageSize: ARCHIVED_PAGE_SIZE,
          loading: false,
          error: res.error ?? 'Erro ao carregar arquivadas.',
        });
        return;
      }
      setState({
        messages: res.messages,
        page: res.page,
        pageSize: res.pageSize,
        loading: false,
        error: null,
      });
    },
    [props.leaderId],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  return (
    <>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${COLORS.border.default}` }}>
        <button
          type="button"
          onClick={props.onBack}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            fontSize: 12,
            color: COLORS.accent.teal,
            cursor: 'pointer',
          }}
        >
          ← Voltar ao chat
        </button>
      </div>
      <div style={MESSAGES_AREA}>
        {state.loading ? (
          <p style={{ fontSize: 12, color: COLORS.text.tertiary }}>Carregando arquivadas...</p>
        ) : state.error !== null ? (
          <p style={{ fontSize: 12, color: COLORS.badge.dangerText }}>{state.error}</p>
        ) : state.messages.length === 0 ? (
          <p style={{ fontSize: 12, color: COLORS.text.tertiary }}>Sem conversas arquivadas.</p>
        ) : (
          state.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
      {state.messages.length >= ARCHIVED_PAGE_SIZE || state.page > 1 ? (
        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${COLORS.border.default}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => void load(state.page - 1)}
            disabled={state.page <= 1 || state.loading}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: COLORS.background.card,
              color: COLORS.text.secondary,
              cursor: state.page <= 1 || state.loading ? 'not-allowed' : 'pointer',
              opacity: state.page <= 1 || state.loading ? 0.5 : 1,
            }}
          >
            ‹ Anterior
          </button>
          <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>Pagina {state.page}</span>
          <button
            type="button"
            onClick={() => void load(state.page + 1)}
            disabled={state.loading || state.messages.length < ARCHIVED_PAGE_SIZE}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              background: COLORS.background.card,
              color: COLORS.text.secondary,
              cursor:
                state.loading || state.messages.length < ARCHIVED_PAGE_SIZE
                  ? 'not-allowed'
                  : 'pointer',
              opacity: state.loading || state.messages.length < ARCHIVED_PAGE_SIZE ? 0.5 : 1,
            }}
          >
            Proximo ›
          </button>
        </div>
      ) : null}
    </>
  );
}

export interface AiChatDrawerEquipeProps {
  readonly leaderId: number;
  readonly leaderType: 'employee' | 'clevel';
  readonly leaderName: string;
  readonly onClose: () => void;
}

export function AiChatDrawerEquipe(props: AiChatDrawerEquipeProps): JSX.Element {
  const [messages, setMessages] = useState<readonly ChatIaMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lastFailedContent, setLastFailedContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory(): Promise<void> {
      const res = await chatIaEquipeGetHistoryAction({
        leaderId: props.leaderId,
        leaderType: props.leaderType,
      });
      if (cancelled) {
        return;
      }
      if (res.ok) {
        setMessages(res.messages);
      }
      setLoadingInitial(false);
    }
    void loadHistory();
    return (): void => {
      cancelled = true;
    };
  }, [props.leaderId]);

  useEffect(() => {
    if (messagesEndRef.current !== null) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, enviando]);

  const enviar = useCallback(
    async (content: string): Promise<void> => {
      const trimmed = content.trim();
      if (trimmed.length === 0) {
        return;
      }
      if (trimmed.length > CHAT_IA_USER_MESSAGE_MAX_CHARS_CLIENT) {
        setErro('Mensagem excede o limite de 2000 caracteres.');
        return;
      }
      setEnviando(true);
      setErro(null);
      setLastFailedContent(null);
      const res = await chatIaEquipeSendMessageAction({
        leaderId: props.leaderId,
        leaderType: props.leaderType,
        content: trimmed,
      });
      setEnviando(false);
      if (!res.ok || res.userMessage === null || res.assistantMessage === null) {
        setErro(res.error ?? MSG_CHAT_IA_FALLBACK_LITERAL);
        setLastFailedContent(trimmed);
        return;
      }
      setMessages((prev) => [...prev, res.userMessage!, res.assistantMessage!]);
      setInputValue('');
    },
    [props.leaderId],
  );

  const handleSend = useCallback((): void => {
    void enviar(inputValue);
  }, [enviar, inputValue]);

  const handleRetry = useCallback((): void => {
    if (lastFailedContent !== null) {
      void enviar(lastFailedContent);
    }
  }, [enviar, lastFailedContent]);

  // ME-UX-CONSOLIDACAO D1: handler dos chips canonicos. Popula o input
  // com a pergunta canonica selecionada e dispara o envio imediato
  // (mesma cadeia de `enviar` — validacoes, telemetria, historico).
  const handleChipClick = useCallback(
    (pergunta: string): void => {
      setInputValue(pergunta);
      void enviar(pergunta);
    },
    [enviar],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const podeEnviar = inputValue.trim().length > 0 && !enviando;

  return (
    <div style={DRAWER_OVERLAY} role="dialog" aria-label={AI_CHAT_ROTULO_CANONICO}>
      <div style={HEADER}>
        <div>
          <div style={HEADER_TITLE}>{AI_CHAT_ROTULO_CANONICO}</div>
          <div style={HEADER_SUBTITLE}>Equipe — {props.leaderName}</div>
          {viewMode === 'active' ? (
            <button
              type="button"
              onClick={() => setViewMode('archived')}
              style={{ ...ARCHIVE_LINK, marginTop: 6 }}
            >
              Ver conversas arquivadas
            </button>
          ) : null}
        </div>
        <button type="button" onClick={props.onClose} aria-label="Fechar" style={CLOSE_BTN}>
          ×
        </button>
      </div>
      {viewMode === 'archived' ? (
        <ArchivedView
          leaderId={props.leaderId}
          leaderType={props.leaderType}
          onBack={() => setViewMode('active')}
        />
      ) : (
        <>
          <div style={MESSAGES_AREA}>
            {loadingInitial ? (
              <p style={{ fontSize: 12, color: COLORS.text.tertiary }}>Carregando historico...</p>
            ) : messages.length === 0 && !enviando && erro === null ? (
              <div>
                <p
                  style={{
                    fontSize: 12,
                    color: COLORS.text.tertiary,
                    marginBottom: 12,
                  }}
                >
                  Sem conversas ativas. Faça a primeira pergunta ou escolha uma sugestão abaixo.
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {AI_CHAT_CHIPS_EQUIPE.map((pergunta) => (
                    <button
                      key={pergunta}
                      type="button"
                      onClick={() => handleChipClick(pergunta)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: `1px solid ${COLORS.border.default}`,
                        borderRadius: 8,
                        background: COLORS.background.card,
                        color: COLORS.text.primary,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        lineHeight: 1.4,
                      }}
                    >
                      {pergunta}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
            {enviando ? <TypingBubble /> : null}
            {erro !== null && !enviando ? <ErrorBubble onRetry={handleRetry} /> : null}
            <div ref={messagesEndRef} />
          </div>
          <div style={INPUT_AREA}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDER_ENTRADA}
              maxLength={CHAT_IA_USER_MESSAGE_MAX_CHARS_CLIENT}
              disabled={enviando}
              style={{
                ...TEXTAREA,
                opacity: enviando ? 0.6 : 1,
                cursor: enviando ? 'not-allowed' : 'text',
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!podeEnviar}
              style={{
                ...SEND_BTN,
                opacity: podeEnviar ? 1 : 0.5,
                cursor: podeEnviar ? 'pointer' : 'not-allowed',
              }}
            >
              Enviar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
