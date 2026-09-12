// ROIP APP 9BOX — shell canônico do portal do colaborador
// (ME-B10-01, DOC 05 §6).
//
// Layout tela cheia sem sidebar. Header brand com logo ROIP APP; nome
// do usuário + botão [Sair] renderizados condicionalmente (ausentes na
// tela de entrada e no gate LGPD — só aparecem após identificação).
// Rodapé com link [🔒 Privacidade e proteção de dados] que abre o
// PrivacyModal.
//
// Consumido pelas 3 pages canônicas: `/colaborador`,
// `/colaborador/gate-lgpd`, `/colaborador/pendencias`.

'use client';

import { useState, type JSX, type ReactNode } from 'react';

import { PrivacyModal } from './PrivacyModal';

export interface PortalLayoutProps {
  readonly children: ReactNode;
  readonly userName?: string | null;
  readonly onSair?: () => void;
  readonly showHeader?: boolean;
}

const BG = '#F9FAFB';
const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';

export function PortalLayout(props: PortalLayoutProps): JSX.Element {
  const { children, userName, onSair, showHeader } = props;
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const renderUserBar = showHeader === true && userName !== undefined && userName !== null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        color: TEXT_1,
      }}
    >
      {renderUserBar ? (
        <header
          style={{
            background: '#FFFFFF',
            borderBottom: `1px solid ${BORDER}`,
            padding: '12px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: NAVY,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              R
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: NAVY,
                letterSpacing: '0.04em',
              }}
            >
              ROIP<span style={{ color: TEAL }}> APP</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12.5, color: TEXT_2 }}>{userName}</span>
            <button
              type="button"
              onClick={onSair}
              style={{
                background: 'transparent',
                border: `1px solid ${BORDER}`,
                color: TEXT_2,
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sair
            </button>
          </div>
        </header>
      ) : null}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</main>

      <footer
        style={{
          padding: '20px 28px',
          borderTop: `1px solid ${BORDER}`,
          textAlign: 'center',
          background: '#FFFFFF',
        }}
      >
        <button
          type="button"
          onClick={() => setPrivacyOpen(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: TEXT_3,
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
          }}
        >
          🔒 Privacidade e proteção de dados
        </button>
      </footer>

      {privacyOpen ? <PrivacyModal onClose={() => setPrivacyOpen(false)} /> : null}
    </div>
  );
}
