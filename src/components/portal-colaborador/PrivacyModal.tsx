// ROIP APP 9BOX — modal "Privacidade e proteção de dados"
// (ME-B10-01, DOC 05 §6.4).
//
// Modal centralizado 720px desktop com 3 abas horizontais:
//   Aba 1 — Termo de consentimento (texto literal v1.0 do DOC 05
//           §6.2, sem botão de aceite).
//   Aba 2 — Contatos do encarregado de dados LGPD (placeholders nesta
//           ME — carregamento real via API virá em ME futura de
//           configuração da empresa).
//   Aba 3 — Meus dados (botão [📥 Baixar meus dados em PDF] dispara
//           `GET /api/portal/lgpd/portability?token=<portalToken>`
//           via `window.location.assign` — S249 Opção A canonizada).
//
// Fecha via [X] ou ESC.

'use client';

import { useEffect, useState, type JSX } from 'react';

const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const BG = '#F9FAFB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';

type Aba = 'termo' | 'contatos' | 'meus_dados';

export interface PrivacyModalProps {
  readonly onClose: () => void;
}

const TERMO_LITERAL_V10 =
  'Ao prosseguir, você declara estar ciente de que seus dados pessoais ' +
  'serão tratados para as finalidades relacionadas ao uso desta ' +
  'plataforma, conforme a legislação aplicável. O tratamento ocorrerá ' +
  'com base nas hipóteses legais pertinentes previstas na LGPD. Você ' +
  'poderá exercer os direitos previstos na lei, incluindo acesso, ' +
  'correção e demais direitos aplicáveis, por meio dos canais ' +
  'disponibilizados pela empresa.';

export function PrivacyModal(props: PrivacyModalProps): JSX.Element {
  const { onClose } = props;
  const [aba, setAba] = useState<Aba>('termo');

  useEffect(() => {
    function handleEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  function baixarPdf(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      return;
    }
    const url = `/api/portal/lgpd/portability?token=${encodeURIComponent(token)}`;
    window.location.assign(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Privacidade e proteção de dados"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 20px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 14,
          width: '100%',
          maxWidth: 720,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            background: NAVY,
            padding: '16px 22px',
            borderRadius: '14px 14px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>
            Privacidade e proteção de dados
          </span>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${BORDER}`,
            background: BG,
          }}
        >
          <TabButton
            label="Termo de consentimento"
            active={aba === 'termo'}
            onClick={() => setAba('termo')}
          />
          <TabButton
            label="Contatos"
            active={aba === 'contatos'}
            onClick={() => setAba('contatos')}
          />
          <TabButton
            label="Meus dados"
            active={aba === 'meus_dados'}
            onClick={() => setAba('meus_dados')}
          />
        </div>

        <div style={{ padding: '24px 26px', minHeight: 240 }}>
          {aba === 'termo' ? (
            <div>
              <p
                style={{
                  fontSize: 13.5,
                  color: TEXT_2,
                  lineHeight: 1.65,
                  margin: 0,
                  marginBottom: 16,
                }}
              >
                {TERMO_LITERAL_V10}
              </p>
              <div
                style={{
                  fontSize: 11.5,
                  color: TEXT_3,
                  paddingTop: 12,
                  borderTop: `1px dashed ${BORDER}`,
                }}
              >
                Consulta sempre disponível no rodapé do portal.
              </div>
            </div>
          ) : null}

          {aba === 'contatos' ? (
            <div style={{ fontSize: 13.5, color: TEXT_2, lineHeight: 1.7 }}>
              <p style={{ margin: 0, marginBottom: 12, color: TEXT_1, fontWeight: 600 }}>
                Encarregado de dados (DPO)
              </p>
              <p style={{ margin: 0, marginBottom: 6 }}>
                Nome: <em style={{ color: TEXT_3 }}>a ser configurado pela empresa</em>
              </p>
              <p style={{ margin: 0, marginBottom: 6 }}>
                E-mail: <em style={{ color: TEXT_3 }}>a ser configurado pela empresa</em>
              </p>
              <p style={{ margin: 0, color: TEXT_3, fontSize: 12 }}>
                Contatos exibidos são pré-cadastrados pela empresa contratante.
              </p>
            </div>
          ) : null}

          {aba === 'meus_dados' ? (
            <div>
              <p
                style={{
                  fontSize: 13.5,
                  color: TEXT_2,
                  lineHeight: 1.6,
                  margin: 0,
                  marginBottom: 20,
                }}
              >
                Baixe um PDF com seus dados cadastrais e todas as respostas que você já enviou aos
                instrumentos deste portal.
              </p>
              <button
                type="button"
                onClick={baixarPdf}
                style={{
                  background: TEAL,
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📥 Baixar meus dados em PDF
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface TabButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}

function TabButton(props: TabButtonProps): JSX.Element {
  const { label, active, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 12px',
        background: active ? '#FFFFFF' : 'transparent',
        border: 'none',
        borderBottom: active ? `2px solid ${TEAL}` : `2px solid transparent`,
        color: active ? NAVY : TEXT_2,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
