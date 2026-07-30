// ROIP APP 9BOX — Header canonico do topbar (ME-055 Bloco B).
//
// Origem canonica: DOC 05 §4.
//
// Estrutura canonica §4:
// - Faixa superior de 56px, background branco, border-bottom `1px solid
//   #E5E7EB`.
// - A esquerda: logo da empresa (32x32) + nome fantasia da empresa em
//   14px semibold. Para Super Admin no `/super-admin` global (fora de
//   qualquer empresa), exibe apenas logo ROIP APP + label "Area do
//   Super Admin".
// - A direita: sino de notificacoes (condicional Bruno+RH — §4.1) +
//   nome e foto do usuario logado + botao "[Sair]".

import type { JSX } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { NotificationBell, type NotificationItem } from './NotificationBell';
import { initialsFromName } from '../../lib/avatar/initials';
import { COLORS } from '../../lib/design-tokens/colors';

/**
 * Modo canonico do lado esquerdo do header (§4).
 *
 * - `super_admin_global`: Bruno navegando em `/super-admin` fora do
 *   escopo de qualquer empresa — renderiza logo ROIP APP + "Area do
 *   Super Admin".
 * - `in_company`: qualquer outro perfil (RH, Lider, C-level) ou Bruno
 *   dentro de uma empresa — renderiza logo da empresa (32x32) + nome
 *   fantasia da empresa em 14px semibold.
 */
export type HeaderLeftMode = 'super_admin_global' | 'in_company';

export interface HeaderUser {
  /**
   * Nome do usuario logado. Renderizado no lado direito ao lado da foto
   * (§4). Para colaborador puro (§3.10) este componente nao e montado.
   */
  readonly displayName: string;
  /**
   * URL da foto do usuario. Opcional; ausencia renderiza fallback com
   * iniciais canonicas (§2.10).
   */
  readonly avatarUrl?: string;
}

export interface HeaderProps {
  /**
   * Modo canonico do lado esquerdo (§4). Determina o que aparece no
   * canto superior esquerdo.
   */
  readonly leftMode: HeaderLeftMode;
  /**
   * Nome fantasia da empresa. Renderizado quando `leftMode === 'in_company'`.
   * Ausente ou vazio quando `leftMode === 'super_admin_global'`.
   */
  readonly companyDisplayName?: string;
  /**
   * URL do logo da empresa. Renderizado quando `leftMode === 'in_company'`.
   * Ausente cai em placeholder canonico (32x32 cinza com iniciais).
   */
  readonly companyLogoUrl?: string;
  /**
   * Usuario logado. Renderizado no lado direito (§4).
   */
  readonly user: HeaderUser;
  /**
   * Habilita a renderizacao do sino canonico §4.1. Consumidor decide com
   * base no perfil (Bruno OU RH — regra Q1 canonica; C-level, Lider e
   * colaborador sempre `false`). Default `false`.
   */
  readonly showNotificationBell?: boolean;
  /**
   * Lista de notificacoes nao lidas para o sino (ate 10; §4.1). Ignorado
   * quando `showNotificationBell = false`. Default `[]`.
   */
  readonly notifications?: readonly NotificationItem[];
  /**
   * Contador de notificacoes nao lidas para o badge do sino. Ignorado
   * quando `showNotificationBell = false`. Default `0`.
   */
  readonly unreadNotificationCount?: number;
}

// `initialsFromName` foi refatorada para `src/lib/avatar/initials.ts` na
// ME-055c (Bloco C1 — Avatares §2.10). Comportamento canonico preservado
// bit-exact: consumo compartilhado com o `Avatar.tsx` desta ME e com o
// consumidor do topbar (nome+foto do usuario, nome+logo da empresa).

export function Header(props: HeaderProps): JSX.Element {
  const {
    leftMode,
    companyDisplayName,
    companyLogoUrl,
    user,
    showNotificationBell = false,
    notifications = [],
    unreadNotificationCount = 0,
  } = props;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        paddingLeft: 24,
        paddingRight: 24,
        background: COLORS.background.card,
        borderBottom: `1px solid ${COLORS.border.default}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
        }}
      >
        {leftMode === 'super_admin_global' ? (
          <>
            <Image
              src="/logo-roip-app.svg"
              alt="ROIP APP"
              width={72}
              height={32}
              priority
              style={{ height: 32, width: 'auto' }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.text.primary,
              }}
            >
              Área do Super Admin
            </span>
          </>
        ) : (
          <>
            {companyLogoUrl !== undefined && companyLogoUrl !== '' ? (
              <Image
                src={companyLogoUrl}
                alt={companyDisplayName ?? 'Logo da empresa'}
                width={32}
                height={32}
                style={{ width: 32, height: 32, objectFit: 'contain' }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  background: COLORS.background.elevated,
                  border: `1px solid ${COLORS.border.default}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  color: COLORS.text.tertiary,
                }}
              >
                {initialsFromName(companyDisplayName ?? '')}
              </span>
            )}
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {companyDisplayName ?? ''}
            </span>
          </>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {showNotificationBell ? (
          <NotificationBell notifications={notifications} unreadCount={unreadNotificationCount} />
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {user.avatarUrl !== undefined && user.avatarUrl !== '' ? (
            <Image
              src={user.avatarUrl}
              alt={user.displayName}
              width={32}
              height={32}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9999,
                objectFit: 'cover',
              }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: 32,
                height: 32,
                borderRadius: 9999,
                background: COLORS.background.elevated,
                border: `1px solid ${COLORS.border.default}`,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.text.secondary,
              }}
            >
              {initialsFromName(user.displayName)}
            </span>
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.text.primary,
            }}
          >
            {user.displayName}
          </span>
        </div>

        <Link
          href="/logout"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.text.secondary,
            textDecoration: 'none',
            padding: '6px 12px',
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
          }}
        >
          Sair
        </Link>
      </div>
    </header>
  );
}
