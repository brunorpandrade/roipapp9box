// ROIP APP 9BOX — card canonico "Ver equipes" dos paineis
// (ME-UX-CONSOLIDACAO-P3b D4b + D4c).
//
// Lista scrollavel de lideres ativos da empresa como links para
// `${basePath}/${liderTipo}-${liderId}`, mostrando nome + departamento.
// Prop `basePath` parametriza a rota base para atender as duas
// superficies canonicas:
//   - `/dashboard-recorte/equipe`  (painel-rh, D4b)
//   - `/super-admin/empresa/[id]/dashboard-recorte/equipe`  (D4c)
//
// Layout canonico: cabecalho com titulo canonico + subtitulo com
// contagem de lideres, corpo com lista scrollavel (max-height 320px
// para caber alinhado com outros cards estruturais). Ordem alfabetica
// preservada bit-a-bit do que o `listActiveLeaders` retorna (decisao
// Bruno D4b/c).
//
// Sem `'use client'`: server component puro. Funciona quando importado
// por outros server components e por client components (nao usa hooks).
//
// **RV-13.** Consumido em `PainelRHClient.tsx` (D4b) e em
// `CompanyLandingClient.tsx` (D4c).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type { ActiveLeaderRow } from '../../server/services/painelNavigation';

/** Titulo canonico do card (decisao Bruno D4b/c). */
export const CARD_VER_EQUIPES_TITULO = 'Ver equipes' as const;

/** Mensagem canonica exibida quando nao ha nenhum lider ativo. */
export const CARD_VER_EQUIPES_VAZIO = 'Nenhuma equipe ativa nesta empresa.' as const;

export interface CardVerEquipesProps {
  readonly leaders: readonly ActiveLeaderRow[];
  /**
   * Base canonica da rota de destino, sem barra final. Cada linha
   * monta o href como `${basePath}/${liderTipo}-${liderId}`:
   *   - D4b: `/dashboard-recorte/equipe`
   *   - D4c: `/super-admin/empresa/${companyId}/dashboard-recorte/equipe`
   */
  readonly basePath: string;
}

export function CardVerEquipes(props: CardVerEquipesProps): JSX.Element {
  const { leaders, basePath } = props;
  const total = leaders.length;
  return (
    <div
      aria-label={CARD_VER_EQUIPES_TITULO}
      style={{
        padding: '20px 24px',
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        background: COLORS.background.card,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          marginBottom: 4,
        }}
      >
        {CARD_VER_EQUIPES_TITULO}
      </div>
      <div
        style={{
          fontSize: 13,
          color: COLORS.text.secondary,
          marginBottom: 12,
        }}
      >
        {total === 0 ? CARD_VER_EQUIPES_VAZIO : `${total} líderes ativos`}
      </div>
      {total > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {leaders.map((l) => (
            <li key={`${l.liderTipo}-${l.liderId}`}>
              <a
                href={`${basePath}/${l.liderTipo}-${l.liderId}`}
                aria-label={`Ver equipe de ${l.name}`}
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  border: `1px solid ${COLORS.border.default}`,
                  borderRadius: 6,
                  background: COLORS.background.card,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: COLORS.text.primary,
                    marginBottom: 2,
                  }}
                >
                  {l.name}
                </div>
                <div style={{ fontSize: 12, color: COLORS.text.secondary }}>{l.departamento}</div>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
