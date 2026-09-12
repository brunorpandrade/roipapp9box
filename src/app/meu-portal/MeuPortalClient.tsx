// ROIP APP 9BOX — Client canonico da rota `/meu-portal` (ME-B9-
// fechamento CORR2 — D-B9F-PORTAL-COLABORADOR-404 ENCERRADO —
// S238-B + S239-C; estendido em ME-B10-02 S253).
//
// Reusa o tipo `MeuPortalData` + mapping `INSTRUMENT_LABEL`
// canonico. Renderiza lista de pendencias do PROPRIO usuario logado
// em versao expandida da Secao 4 do painel RH (mesma fonte canonica,
// UI dedicada com titulo, subtitulo canonicos, mesmo padrao de
// badges de status).
//
// **ME-B10-02 S253:** habilita hrefs por instrumento (S246-C —
// respondente platform). Os dois instrumentos entregues nesta ME
// (Autoavaliacao, Liderança direta) tornam-se cards clicaveis que
// navegam via `<Link>` para `/meu-portal/{auto-avaliacao,lideranca-direta}`.
// Perfil Individual e Radar NR-1 permanecem visualmente inativos com
// cursor `not-allowed` e title canonico "Formulário em breve" ate as
// ME-B10-04 e ME-B10-03 respectivamente.
//
// **RV-14.** Um statement por linha, largura maxima 100 cols.

'use client';

import type { JSX } from 'react';
import Link from 'next/link';

import { COLORS } from '../../lib/design-tokens/colors';
import { INSTRUMENT_LABEL } from '../pendencias-portal/mappings';

import type { MeuPortalData, MeuPortalPendenciaItem } from '../painel-rh/internals';

export interface MeuPortalClientProps {
  readonly userName: string;
  readonly companyName: string;
  readonly data: MeuPortalData;
}

const EMPTY_TEXT = 'Você não tem pendências no portal.';
const TITLE = 'Meu portal';
const SUBTITLE = 'Suas pendências nos instrumentos do portal.';
const TOOLTIP_EM_BREVE = 'Formulário em breve';

/**
 * Mapa canonico ME-B10-02 S253: instrumentos habilitados nesta ME
 * apontam para a rota `/meu-portal/*` correspondente; instrumentos
 * ainda pendentes ficam explicitamente `null` (renderizacao inativa).
 */
const HREF_POR_INSTRUMENTO: Readonly<Record<string, string | null>> = Object.freeze({
  autoAvaliacao: '/meu-portal/auto-avaliacao',
  avaliacaoLiderancaDireta: '/meu-portal/lideranca-direta',
  radarNR1: null,
  meuPerfil: null,
});

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
            <CardPendencia key={p.key} card={p} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardPendenciaProps {
  readonly card: MeuPortalPendenciaItem;
}

function CardPendencia(props: CardPendenciaProps): JSX.Element {
  const { card } = props;
  const href = HREF_POR_INSTRUMENTO[card.instrumento] ?? null;
  const habilitado = href !== null;

  const conteudo = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderRadius: 6,
        background: COLORS.background.elevated,
        cursor: habilitado ? 'pointer' : 'not-allowed',
        opacity: habilitado ? 1 : 0.6,
        transition: 'background .15s ease-out',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 14, color: COLORS.text.primary, fontWeight: 500 }}>
          {INSTRUMENT_LABEL[card.instrumento]}
        </span>
        {card.prazoOriginal !== null ? (
          <span style={{ fontSize: 12, color: COLORS.text.tertiary }}>
            Prazo: {card.prazoOriginal.toLocaleDateString('pt-BR')}
            {card.diasEmAtraso > 0 ? ` · ${card.diasEmAtraso} dia(s) em atraso` : ''}
          </span>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 10px',
          borderRadius: 12,
          color: card.status === 'Atrasado' ? COLORS.badge.dangerText : COLORS.badge.warningText,
          background: card.status === 'Atrasado' ? COLORS.badge.dangerBg : COLORS.badge.warningBg,
        }}
      >
        {card.status}
      </span>
    </div>
  );

  if (habilitado && href !== null) {
    return (
      <Link
        href={href}
        style={{ textDecoration: 'none', color: 'inherit' }}
        aria-label={`Responder ${INSTRUMENT_LABEL[card.instrumento]}`}
      >
        {conteudo}
      </Link>
    );
  }

  return (
    <div title={TOOLTIP_EM_BREVE} aria-label={TOOLTIP_EM_BREVE}>
      {conteudo}
    </div>
  );
}
