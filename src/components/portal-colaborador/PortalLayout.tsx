// ROIP APP 9BOX — shell canônico do portal do colaborador
// (ME-B10-01, DOC 05 §6; estendido ME-B10-05 S256 — perímetro mobile;
// estendido ME-B11.1c LGPD2 — contatos reais do Encarregado LGPD).
//
// Layout tela cheia sem sidebar. Header brand com logo ROIP APP; nome
// do usuário + botão [Sair] renderizados condicionalmente (ausentes na
// tela de entrada e no gate LGPD — só aparecem após identificação).
// Rodapé com link [🔒 Privacidade e proteção de dados] que abre o
// PrivacyModal.
//
// Consumido pelas 3 pages canônicas: `/colaborador`,
// `/colaborador/gate-lgpd`, `/colaborador/pendencias`, e pelas 4 pages
// `/colaborador/responder/*` da ME-B10-02, ME-B10-03 e ME-B10-04.
//
// ME-B10-05 S256: header e footer recebem classe `roip-header-mobile`
// e `roip-footer-mobile` para paddings responsivos canônicos (DOC 05
// §19.1). Layout desktop preservado bit-a-bit — apenas viewport
// `< 1024px` altera paddings via `src/app/globals.css`.
//
// ME-B11.1c (LGPD2): quando o portal esta autenticado
// (`showHeader===true` com `portalToken` em sessionStorage), o layout
// faz fetch lazy do endpoint canonico `GET /api/portal/lgpd/contatos`
// na primeira abertura do PrivacyModal e passa o payload adiante como
// prop. Elimina a dissonancia bit-exact "a ser configurado pela
// empresa" exibida mesmo quando o DPO ja estava configurado em
// `/parametros`. Fetch e lazy (dispara so quando o modal abre) para
// nao impactar a performance do portal nas telas que nao abrem
// Privacidade. O fetch e cacheado em memoria pelo tempo de vida do
// mount — abrir e fechar o modal varias vezes nao refaz a chamada.

'use client';

import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';

import { PrivacyModal, type LgpdContatosDpo } from './PrivacyModal';

export interface PortalLayoutProps {
  readonly children: ReactNode;
  readonly userName?: string | null;
  /**
   * ME-B9.3 Fase A2 dispatch 2 — foto canonica do titular logado. Null
   * ou vazio = exibe avatar canonico de iniciais via `initialsFromName`.
   */
  readonly userPhotoUrl?: string | null;
  readonly onSair?: () => void;
  readonly showHeader?: boolean;
}

function initialsFromPortalName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  if (first === '') return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  const firstChar = first[0] ?? '';
  const lastChar = last[0] ?? '';
  return (firstChar + lastChar).toUpperCase();
}

const BG = '#F9FAFB';
const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';

export function PortalLayout(props: PortalLayoutProps): JSX.Element {
  const { children, userName, userPhotoUrl, onSair, showHeader } = props;
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // ME-B11.1c (LGPD2): cache em memoria dos contatos canonicos do
  // Encarregado. `null` = ainda nao carregado / fetch falhou / shell
  // nao autenticado (fallback canonico "(não configurado)" por campo).
  const [lgpdContatos, setLgpdContatos] = useState<LgpdContatosDpo | null>(null);
  const [lgpdFetchStarted, setLgpdFetchStarted] = useState(false);
  const renderUserBar = showHeader === true && userName !== undefined && userName !== null;
  const hasPhoto = userPhotoUrl !== undefined && userPhotoUrl !== null && userPhotoUrl.length > 0;

  // ME-B11.1c (LGPD2): fetch lazy dos contatos canonicos quando o
  // modal e aberto pela primeira vez. Dispara apenas se o shell esta
  // autenticado (`showHeader===true` + portalToken em sessionStorage).
  // Falhas (401, offline, 404) sao silenciosas — o modal cai no
  // fallback canonico "(não configurado)".
  useEffect(() => {
    if (!privacyOpen) {
      return;
    }
    if (lgpdFetchStarted) {
      return;
    }
    if (showHeader !== true) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      return;
    }
    setLgpdFetchStarted(true);
    void fetch('/api/portal/lgpd/contatos', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const payload = (await res.json()) as LgpdContatosDpo;
        setLgpdContatos(payload);
      })
      .catch(() => {
        // Silencioso: modal cai no fallback canonico.
      });
  }, [privacyOpen, lgpdFetchStarted, showHeader]);

  const handleClosePrivacy = useCallback(() => {
    setPrivacyOpen(false);
  }, []);

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
          className="roip-portal-header"
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
                flexShrink: 0,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* ME-B9.3 Fase A2 dispatch 2 — avatar canonico do titular
                logado. Foto quando disponivel (base64 persistida pela
                Fase A), fallback de iniciais em teal. */}
            {hasPhoto ? (
              <img
                src={userPhotoUrl ?? ''}
                alt={`Foto de ${userName}`}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: TEAL,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                {userName !== undefined && userName !== null
                  ? initialsFromPortalName(userName)
                  : '?'}
              </div>
            )}
            <span
              className="roip-portal-user-name"
              style={{
                fontSize: 12.5,
                color: TEXT_2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {userName}
            </span>
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
                flexShrink: 0,
              }}
            >
              Sair
            </button>
          </div>
        </header>
      ) : null}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</main>

      <footer
        className="roip-portal-footer"
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

      {privacyOpen ? <PrivacyModal onClose={handleClosePrivacy} contatos={lgpdContatos} /> : null}
    </div>
  );
}
