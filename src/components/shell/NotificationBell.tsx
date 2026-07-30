'use client';

// ROIP APP 9BOX — sino canonico do topbar (ME-055 Bloco B).
//
// Origem canonica: DOC 05 §4.1 (S474). Estrutura visual completa nesta ME;
// backend real (endpoint de listagem, polling 60s, marcacao lida) vem na
// ME-058. Nesta ME, o componente recebe `notifications` e `unreadCount`
// como props e opera com defaults vazios (`[]`, `0`), o que preserva o
// estado canonico vazio "Nenhuma notificacao nao lida." (§4.1 rodape).
//
// Visibilidade canonica: apenas Bruno e RH (regra Q1). A condicional
// `showNotificationBell` que decide se este componente e montado vive no
// `Header.tsx` que o instancia. Este arquivo assume que ja passou o guard.
//
// Consumo posterior:
// - ME-055c (Bloco C consolidado): componentes utilitarios canonizados.
// - ME-058 (Bloco B5.4): backend real de notificacoes + polling 60s +
//   marcacao lida por clique.

import {
  Bell as BellIcon,
  BellRing as BellRingIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

/**
 * Severidade canonica de uma notificacao. Determina a cor do badge do sino
 * (severidade dominante entre as nao lidas) e o emoji renderizado no item
 * do dropdown.
 *
 * Cores canonicas do badge §4.1:
 * - `critical` → `#DC2626` (COLORS.semantic.danger).
 * - `warning`  → `#D97706` (COLORS.semantic.warning).
 * - `info`     → `#1F3A5F` (COLORS.primary.navy).
 */
export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly severity: NotificationSeverity;
  readonly relativeTime: string;
  readonly typeLabel: string;
  readonly href?: string;
}

export interface NotificationBellProps {
  /**
   * Lista das 10 ultimas nao lidas em ordem `createdAt DESC` (§4.1).
   * Default `[]` ate ME-058 conectar o backend.
   */
  readonly notifications?: readonly NotificationItem[];
  /**
   * Contador de nao lidas. Exato ate 99; renderizado como `99+` acima.
   * Default `0`.
   */
  readonly unreadCount?: number;
}

const EMOJI_BY_SEVERITY: Record<NotificationSeverity, string> = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
};

const BADGE_BG_BY_SEVERITY: Record<NotificationSeverity, string> = {
  critical: COLORS.semantic.danger,
  warning: COLORS.semantic.warning,
  info: COLORS.primary.navy,
};

function dominantSeverity(items: readonly NotificationItem[]): NotificationSeverity {
  if (items.some((item) => item.severity === 'critical')) {
    return 'critical';
  }
  if (items.some((item) => item.severity === 'warning')) {
    return 'warning';
  }
  return 'info';
}

function formatUnreadCount(count: number): string {
  // §4.1: exato ate 99, `99+` acima.
  if (count <= 99) {
    return String(count);
  }
  return '99+';
}

// TODO ME-058: polling 60s do endpoint de notificacoes canonico (§4.1).
// Nesta ME, dropdown opera com props estaticas — sem chamada a backend
// nem timers.

export function NotificationBell(props: NotificationBellProps): JSX.Element {
  const notifications = props.notifications ?? [];
  const unreadCount = props.unreadCount ?? 0;
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Fecha o dropdown ao clicar fora — padrao canonico de dropdowns do
  // topbar (comportamento equivalente ao ESC dispensar de modal nao
  // bloqueador §2.9). ESC tambem fecha.
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClickOutside(event: MouseEvent): void {
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const hasUnread = unreadCount > 0;
  const badgeColor = hasUnread
    ? BADGE_BG_BY_SEVERITY[dominantSeverity(notifications)]
    : BADGE_BG_BY_SEVERITY.info;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Notificações não lidas"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: 8,
          color: COLORS.primary.navy,
        }}
      >
        {hasUnread ? (
          <BellRingIcon size={20} strokeWidth={2} />
        ) : (
          <BellIcon size={20} strokeWidth={2} />
        )}
        {hasUnread ? (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 9999,
              background: badgeColor,
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 600,
              lineHeight: '18px',
              textAlign: 'center',
              letterSpacing: '0.02em',
            }}
          >
            {formatUnreadCount(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificações"
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 400,
            maxHeight: 480,
            background: COLORS.background.card,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${COLORS.border.divider}`,
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.text.primary,
            }}
          >
            Notificações
          </header>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p
                style={{
                  padding: '24px 16px',
                  margin: 0,
                  fontSize: 13,
                  color: COLORS.text.tertiary,
                  textAlign: 'center',
                }}
              >
                Nenhuma notificação não lida.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                }}
              >
                {notifications.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <NotificationRow item={item} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer
            style={{
              padding: '10px 16px',
              borderTop: `1px solid ${COLORS.border.divider}`,
            }}
          >
            <Link
              href="/notificacoes"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                fontWeight: 500,
                color: COLORS.accent.teal,
                textDecoration: 'none',
              }}
            >
              Ver todas as notificações
              <ChevronRightIcon size={14} strokeWidth={2} />
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow(props: { readonly item: NotificationItem }): JSX.Element {
  const { item } = props;
  const content = (
    <div
      style={{
        padding: '12px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: '18px' }}>
        {EMOJI_BY_SEVERITY[item.severity]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: 11,
            color: COLORS.text.tertiary,
          }}
        >
          {item.typeLabel} · {item.relativeTime}
        </p>
      </div>
    </div>
  );

  if (item.href !== undefined) {
    return (
      <Link href={item.href} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
        {content}
      </Link>
    );
  }
  return content;
}
