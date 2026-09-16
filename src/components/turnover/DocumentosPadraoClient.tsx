'use client';

// ROIP APP 9BOX — botoes e visualizacao dos documentos padrao de
// desligamento na pagina de turnover (especificacao §6, ME-fila6 D2).
//
// O HTML do corpo e gerado no servidor pelo mesmo template do PDF
// (`terminationFormDocumentTemplate`) e chega pronto como string; o texto
// e 100% de constantes escapadas. [Baixar PDF] aponta para o route
// handler autenticado pela sessao.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

export interface DocumentoPadraoView {
  readonly tipo: string;
  readonly botao: string;
  readonly titulo: string;
  readonly corpoHtml: string;
  readonly pdfHref: string;
}

export interface DocumentosPadraoClientProps {
  readonly documentos: readonly DocumentoPadraoView[];
}

const BTN_STYLE: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  border: `1px solid ${COLORS.accent.teal}`,
  borderRadius: 6,
  background: COLORS.background.card,
  color: COLORS.accent.teal,
  cursor: 'pointer',
};

export function DocumentosPadraoClient(props: DocumentosPadraoClientProps): JSX.Element {
  const [aberto, setAberto] = useState<DocumentoPadraoView | null>(null);
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {props.documentos.map((d) => (
          <button key={d.tipo} type="button" style={BTN_STYLE} onClick={(): void => setAberto(d)}>
            {d.botao}
          </button>
        ))}
      </div>
      {aberto !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={aberto.titulo}
          onClick={(): void => setAberto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e): void => e.stopPropagation()}
            style={{
              width: '80vw',
              height: '80vh',
              maxWidth: 1080,
              background: COLORS.background.card,
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: COLORS.primary.navy,
                color: '#FFFFFF',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>{aberto.titulo}</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <a
                  href={aberto.pdfHref}
                  style={{
                    background: COLORS.accent.teal,
                    color: '#FFFFFF',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Baixar PDF
                </a>
                <button
                  type="button"
                  aria-label="Fechar documento"
                  onClick={(): void => setAberto(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: 18,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div
              style={{ flex: 1, overflowY: 'auto', padding: 24, color: COLORS.text.primary }}
              dangerouslySetInnerHTML={{ __html: aberto.corpoHtml }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
