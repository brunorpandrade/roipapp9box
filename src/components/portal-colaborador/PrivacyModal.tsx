// ROIP APP 9BOX — modal "Privacidade e proteção de dados"
// (ME-B10-01, DOC 05 §6.4; estendido ME-B10-05 S256 — perímetro mobile;
// estendido ME-B11.1c LGPD2 — contatos reais do Encarregado).
//
// Modal centralizado 720px desktop com 3 abas horizontais:
//   Aba 1 — Termo de consentimento (texto literal v1.0 do DOC 05
//           §6.2, sem botão de aceite).
//   Aba 2 — Contatos do Encarregado de dados LGPD (ME-B11.1c LGPD2 —
//           carregamento real via `GET /api/portal/lgpd/contatos`,
//           orquestrado pelo PortalLayout.tsx que injeta `contatos`
//           como prop; fallback canônico "(não configurado)" quando
//           algum campo vem nulo ou o fetch falha).
//   Aba 3 — Meus dados (botão [📥 Baixar meus dados em PDF] dispara
//           `GET /api/portal/lgpd/portability?token=<portalToken>`
//           via `window.location.assign` — S249 Opção A canonizada).
//
// Fecha via [X] ou ESC.
//
// ME-B10-05 S256: overlay usa classe `roip-modal-overlay` e caixa usa
// `roip-modal-fullscreen-mobile` — em viewport `< 1024px` o modal
// ocupa 100vw/100vh (tela cheia) conforme regra canônica §6.4 mobile.
// Desktop preserva 720px centralizado bit-a-bit.

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

/**
 * Contatos canonicos do Encarregado de dados LGPD da empresa do
 * titular logado (ME-B11.1c LGPD2). Carregados pelo PortalLayout.tsx
 * via `GET /api/portal/lgpd/contatos`. Qualquer campo nulo e
 * renderizado como "(não configurado)" bit-exact nesta aba.
 *
 * `null` como payload inteiro: fetch ainda nao retornou (loading),
 * falhou (401/network) ou o shell nao esta autenticado (gate
 * pre-login) — o modal exibe fallback canonico em todos os campos.
 */
export interface LgpdContatosDpo {
  readonly encarregadoNome: string | null;
  readonly encarregadoEmail: string | null;
  readonly encarregadoTelefone: string | null;
  readonly encarregadoPoliticaUrl: string | null;
}

export interface PrivacyModalProps {
  readonly onClose: () => void;
  /**
   * ME-B11.1c (LGPD2): contatos canonicos do Encarregado de dados
   * injetados pelo PortalLayout.tsx. `undefined` ou `null` cai em
   * fallback canonico "(não configurado)" em todos os campos.
   */
  readonly contatos?: LgpdContatosDpo | null;
}

const FALLBACK_NAO_CONFIGURADO = '(não configurado)';

const TERMO_LITERAL_V10 =
  'Ao prosseguir, você declara estar ciente de que seus dados pessoais ' +
  'serão tratados para as finalidades relacionadas ao uso desta ' +
  'plataforma, conforme a legislação aplicável. O tratamento ocorrerá ' +
  'com base nas hipóteses legais pertinentes previstas na LGPD. Você ' +
  'poderá exercer os direitos previstos na lei, incluindo acesso, ' +
  'correção e demais direitos aplicáveis, por meio dos canais ' +
  'disponibilizados pela empresa.';

export function PrivacyModal(props: PrivacyModalProps): JSX.Element {
  const { onClose, contatos } = props;
  const [aba, setAba] = useState<Aba>('termo');

  // ME-B11.1c (LGPD2): extrai campos canonicos do Encarregado com
  // fallback literal "(não configurado)" por campo. Preserva o
  // comportamento historico quando `contatos` nao foi carregado
  // ainda ou nao esta disponivel (shell nao autenticado).
  const dpoNome = contatos?.encarregadoNome ?? null;
  const dpoEmail = contatos?.encarregadoEmail ?? null;
  const dpoTelefone = contatos?.encarregadoTelefone ?? null;
  const dpoPoliticaUrl = contatos?.encarregadoPoliticaUrl ?? null;

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
      className="roip-modal-overlay"
      onClick={onClose}
    >
      <div className="roip-modal-fullscreen-mobile" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            background: NAVY,
            padding: '16px 22px',
            borderRadius: '14px 14px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
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
            flexShrink: 0,
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

        <div
          style={{
            padding: '24px 26px',
            minHeight: 240,
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {aba === 'termo' ? (
            <div>
              {/*
                ME-B11.1c (patch pos-RV-01): a linha
                "Consulta sempre disponível no rodapé do portal."
                foi removida — redundante bit-exact (o modal e aberto
                pelo proprio botao canonico do rodape, entao a
                afirmacao nao agrega informacao e so adiciona ruido
                visual).
              */}
              <p
                style={{
                  fontSize: 13.5,
                  color: TEXT_2,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {TERMO_LITERAL_V10}
              </p>
            </div>
          ) : null}

          {aba === 'contatos' ? (
            <div style={{ fontSize: 13.5, color: TEXT_2, lineHeight: 1.7 }}>
              <p style={{ margin: 0, marginBottom: 12, color: TEXT_1, fontWeight: 600 }}>
                Encarregado de dados (DPO)
              </p>
              <p style={{ margin: 0, marginBottom: 6 }}>
                Nome:{' '}
                {dpoNome !== null && dpoNome.length > 0 ? (
                  <span>{dpoNome}</span>
                ) : (
                  <em style={{ color: TEXT_3 }}>{FALLBACK_NAO_CONFIGURADO}</em>
                )}
              </p>
              <p style={{ margin: 0, marginBottom: 6 }}>
                E-mail:{' '}
                {dpoEmail !== null && dpoEmail.length > 0 ? (
                  <a href={`mailto:${dpoEmail}`} style={{ color: TEAL }}>
                    {dpoEmail}
                  </a>
                ) : (
                  <em style={{ color: TEXT_3 }}>{FALLBACK_NAO_CONFIGURADO}</em>
                )}
              </p>
              {dpoTelefone !== null && dpoTelefone.length > 0 ? (
                <p style={{ margin: 0, marginBottom: 6 }}>
                  Telefone: <span>{dpoTelefone}</span>
                </p>
              ) : null}
              {dpoPoliticaUrl !== null && dpoPoliticaUrl.length > 0 ? (
                <p style={{ margin: 0, marginBottom: 6 }}>
                  Política de privacidade:{' '}
                  <a
                    href={dpoPoliticaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: TEAL }}
                  >
                    {dpoPoliticaUrl}
                  </a>
                </p>
              ) : null}
              {/*
                ME-B11.1c (patch pos-RV-01): a linha
                "Contatos pré-cadastrados pela empresa contratante."
                foi removida — redundante bit-exact (obvio pelo
                contexto; o colaborador sabe que ele proprio nao
                cadastrou isso).
              */}
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
