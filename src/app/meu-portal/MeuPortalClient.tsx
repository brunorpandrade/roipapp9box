// ROIP APP 9BOX — Client canonico da rota `/meu-portal` (ME-B9-
// fechamento CORR2 — D-B9F-PORTAL-COLABORADOR-404 ENCERRADO —
// S238-B + S239-C).
//
// Reusa bit-a-bit o tipo `MeuPortalData` + mapping `INSTRUMENT_LABEL`
// canonico. Renderiza lista de pendencias do PROPRIO usuario logado
// em versao expandida da Secao 4 do painel RH (mesma fonte canonica,
// UI dedicada com titulo, subtitulo canonicos, mesmo padrao de
// badges de status).
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

'use client';

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import { INSTRUMENT_LABEL } from '../pendencias-portal/mappings';

import type { MeuPortalData } from '../painel-rh/internals';

export interface MeuPortalClientProps {
  readonly userName: string;
  readonly companyName: string;
  readonly data: MeuPortalData;
}

const EMPTY_TEXT = 'Você não tem pendências no portal.';
const TITLE = 'Meu portal';
const SUBTITLE = 'Suas pendências nos instrumentos do portal.';

export function MeuPortalClient(props: MeuPortalClientProps): JSX.Element {
  const { data } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.text.primary,
            margin: '0 0 4px 0',
          }}
        >
          {TITLE}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: COLORS.text.secondary,
            margin: 0,
          }}
        >
          {SUBTITLE}
        </p>
      </div>

      {data.pendencias.length === 0 ? (
        <div
          style={{
            background: COLORS.background.card,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            padding: '24px 20px',
            textAlign: 'center',
            color: COLORS.text.secondary,
            fontSize: 13,
          }}
        >
          {EMPTY_TEXT}
        </div>
      ) : (
        <div
          style={{
            background: COLORS.background.card,
            border: `1px solid ${COLORS.border.default}`,
            borderRadius: 8,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {data.pendencias.map((p) => (
            <div
              key={p.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 6,
                background: COLORS.background.elevated,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 14, color: COLORS.text.primary, fontWeight: 500 }}>
                  {INSTRUMENT_LABEL[p.instrumento]}
                </span>
                {p.prazoOriginal !== null ? (
                  <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>
                    Prazo: {p.prazoOriginal.toLocaleDateString('pt-BR')}
                    {p.diasEmAtraso > 0 ? ` · ${p.diasEmAtraso} dia(s) em atraso` : ''}
                  </span>
                ) : null}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 12,
                  color:
                    p.status === 'Atrasado' ? COLORS.badge.dangerText : COLORS.badge.warningText,
                  background:
                    p.status === 'Atrasado' ? COLORS.badge.dangerBg : COLORS.badge.warningBg,
                }}
              >
                {p.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
