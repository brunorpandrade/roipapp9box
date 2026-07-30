// ROIP APP 9BOX — Toast canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.9 (Drawers, modais, pop-ups e toasts —
// entrada Toast).
//
// Regras canonicas §2.9 aplicadas:
// - Posicao fixa canto inferior direito, largura 320-360px, radius 10px.
// - Severidades canonicas: 3 (verde/ambar/vermelho). Sem "info" — Opcao A
//   aprovada em N7/S226. Correcao vs comando de abertura da ME-055c.
// - TTL canonico: 3s verde, 4s ambar/vermelho. Correcao vs comando da
//   ME-055c que sugeria 4/6s — Opcao A aprovada.
// - Persistente (ortogonal a severidade): sem timeout, botao [X] ou
//   navegacao de rota dispensa. Uso canonico: rate limit, sessao expirada,
//   empresa inativa (a cor pode ser qualquer uma das 3 — a persistencia
//   nao esta acoplada a "danger").
// - Cores canonicas §2.9 (mesmas do Banner):
//   * Verde: bg #DCFCE7, texto #15803D, borda #16A34A
//   * Ambar: bg #FEF3C7, texto #92400E, borda #D97706
//   * Vermelho: bg #FEE2E2, texto #991B1B, borda #DC2626
// - Box-shadow leve, botao [X] opcional para dispensar antes do TTL.
//
// API canonica: `ToastProvider` (context) + hook `useToast` — permite
// disparar toasts de qualquer superficie sem prop-drilling. Fila
// canonica: multiplos toasts empilham verticalmente do topo do stack
// (mais recente em baixo). Toasts persistentes ficam ate dispensados
// manualmente ou via `dismissById`.

'use client';

import type { JSX, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

/** Severidades canonicas §2.9 do Toast. 3 valores. Sem 'info'. */
export type ToastSeverity = 'success' | 'warning' | 'danger';

/** TTL canonicos §2.9 em ms exportados para consumo em testes bit-exact. */
export const TOAST_TTL_SUCCESS_MS = 3000;
export const TOAST_TTL_WARNING_MS = 4000;
export const TOAST_TTL_DANGER_MS = 4000;

/** Mapa canonico de cores §2.9 exportado para consumo em testes. */
export const TOAST_COLORS_BY_SEVERITY: Readonly<
  Record<ToastSeverity, { readonly bg: string; readonly text: string; readonly border: string }>
> = {
  success: {
    bg: COLORS.badge.successBg,
    text: COLORS.badge.successText,
    border: COLORS.semantic.success,
  },
  warning: {
    bg: COLORS.badge.warningBg,
    text: COLORS.badge.warningText,
    border: COLORS.semantic.warning,
  },
  danger: {
    bg: COLORS.badge.dangerBg,
    text: COLORS.badge.dangerText,
    border: COLORS.semantic.danger,
  },
};

/**
 * Retorna o TTL canonico §2.9 em ms para uma dada severidade. Uso em
 * testes bit-exact e nos consumidores que precisam customizar o
 * comportamento (ex.: prolongar warning em fluxo especifico).
 */
export function defaultTtlForSeverity(severity: ToastSeverity): number {
  switch (severity) {
    case 'success':
      return TOAST_TTL_SUCCESS_MS;
    case 'warning':
      return TOAST_TTL_WARNING_MS;
    case 'danger':
      return TOAST_TTL_DANGER_MS;
  }
}

/** Item de toast enfileirado no provider. */
export interface ToastItem {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly message: string;
  /**
   * Persistencia canonica ortogonal §2.9: quando `true`, o toast nao
   * dispara timeout automatico — persiste ate `dismiss(id)` explicito
   * ou navegacao de rota (fora do escopo deste componente).
   */
  readonly persistent: boolean;
}

/**
 * Entrada canonica para disparar um novo toast. `id` e opcional — o
 * provider gera automaticamente quando ausente.
 */
export interface ToastInput {
  readonly severity: ToastSeverity;
  readonly message: string;
  readonly persistent?: boolean;
  readonly id?: string;
  /**
   * Sobrescreve o TTL canonico. Ignorado quando `persistent === true`.
   */
  readonly ttlMs?: number;
}

interface ToastContextValue {
  readonly toasts: readonly ToastItem[];
  readonly push: (input: ToastInput) => string;
  readonly dismiss: (id: string) => void;
  readonly clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  readonly children: ReactNode;
}

export function ToastProvider(props: ToastProviderProps): JSX.Element {
  const { children } = props;
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timeoutsRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id =
        input.id ?? `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const persistent = input.persistent ?? false;
      const item: ToastItem = {
        id,
        severity: input.severity,
        message: input.message,
        persistent,
      };
      setToasts((current) => [...current, item]);

      if (!persistent) {
        const ttl = input.ttlMs ?? defaultTtlForSeverity(input.severity);
        const timer = setTimeout(() => {
          dismiss(id);
        }, ttl);
        timeoutsRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    for (const timer of timeoutsRef.current.values()) {
      clearTimeout(timer);
    }
    timeoutsRef.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, push, dismiss, clear }),
    [toasts, push, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Hook canonico de consumo. Lanca se chamado fora de `<ToastProvider>` —
 * garantia de integridade da arvore de contexto.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast: chamada fora de <ToastProvider>');
  }
  return ctx;
}

interface ToastStackProps {
  readonly toasts: readonly ToastItem[];
  readonly onDismiss: (id: string) => void;
}

function ToastStack(props: ToastStackProps): JSX.Element {
  const { toasts, onDismiss } = props;
  return (
    <div
      role="region"
      aria-label="Notificacoes toast"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        zIndex: 500,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

interface ToastCardProps {
  readonly item: ToastItem;
  readonly onDismiss: (id: string) => void;
}

function ToastCard(props: ToastCardProps): JSX.Element {
  const { item, onDismiss } = props;
  const palette = TOAST_COLORS_BY_SEVERITY[item.severity];

  return (
    <div
      role="status"
      aria-live={item.severity === 'danger' ? 'assertive' : 'polite'}
      style={{
        pointerEvents: 'auto',
        width: 340, // canonico §2.9: 320-360px, escolhemos 340 como meio
        maxWidth: '90vw',
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        padding: '12px 14px',
        fontSize: 14,
        lineHeight: 1.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: palette.border,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>{item.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dispensar notificacao"
        style={{
          border: 'none',
          background: 'transparent',
          color: palette.text,
          cursor: 'pointer',
          padding: 0,
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {'\u00D7'}
      </button>
    </div>
  );
}
