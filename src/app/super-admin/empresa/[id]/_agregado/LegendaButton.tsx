'use client';

// ROIP APP 9BOX — botão "Legenda" + modal dos dashboards agregados,
// isolado como client component (§8.06.6a). Fica separado de `shared`
// para que `shared` permaneça server-safe: o EmpresaDashboardClient
// (server) importa valores de `shared` (CARD, LABEL, fmt) e chamá-los no
// servidor exige que `shared` NÃO seja um módulo 'use client'.

import { useState, type CSSProperties, type JSX } from 'react';

import { COLORS } from '../../../../../lib/design-tokens/colors';
import { NINE_BOX_GRID, QUADRANTE_LEGENDA } from '../../../../dashboard-individual/[id]/internals';

const BTN: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  fontSize: 13,
  color: COLORS.text.secondary,
  cursor: 'pointer',
};

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 50,
};

const MODAL: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${COLORS.border.default}`,
  background: COLORS.background.card,
  maxWidth: 820,
  width: '100%',
  maxHeight: '86vh',
  overflowY: 'auto',
};

function LegendaModal(props: { readonly onClose: () => void }): JSX.Element {
  return (
    <div style={OVERLAY} onClick={props.onClose}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={props.onClose} style={BTN}>
            Fechar
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {NINE_BOX_GRID.flat().map((cell) => (
            <div key={cell.quadrante} style={{ background: cell.bg, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: cell.text, marginBottom: 4 }}>
                {cell.quadrante}
              </div>
              <div style={{ fontSize: 11, color: COLORS.text.secondary, lineHeight: 1.4 }}>
                {QUADRANTE_LEGENDA[cell.quadrante] ?? ''}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: COLORS.background.elevated,
            borderRadius: 8,
            fontSize: 12,
            color: COLORS.text.secondary,
          }}
        >
          <div>
            <strong>Faixas de desempenho:</strong> Baixo &lt;60% · Médio 60–85% · Alto &gt;85%
          </div>
          <div>
            <strong>Faixas de plenitude:</strong> Baixa &lt;50% · Média 50–75% · Alta &gt;75%
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegendaButton(): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={BTN}>
        Legenda
      </button>
      {open ? <LegendaModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
