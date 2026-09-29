// ROIP APP 9BOX — widget canonico `CardPendenciasDialogos`
// (ME-PAINEL-PENDENCIAS-DIALOGOS).
//
// Card canonico da secao "Minha equipe" dos paineis /painel-lider e
// /painel-clevel. Substitui bit-a-bit o `ComingSoonBlock` estatico
// "Diálogos de desenvolvimento — pendências" que existia canonicamente
// nas duas paginas como placeholder ate esta ME.
//
// Server component "dumb" no padrao canonico dos demais cards
// estruturais (`StructuralCard`, `TurnoverIndicatorCard`): recebe dados
// prontos ja resolvidos via JOIN por `getPendenciasCardData` do service
// `developmentDialogs`. Sem chamadas ao banco no widget.
//
// Renderizacao canonica:
//   - Lista vazia: card com titulo canonico + mensagem "Nenhuma
//     pendencia ativa." (texto secundario).
//   - Lista com itens: card com titulo canonico + ate 5 pendencias
//     listadas como links canonicos para `/dashboard-individual/[id]`,
//     cada uma exibindo nome do colaborador (primaria) + titulo do
//     dialogo (secundaria). Quando N > 5, adiciona link "Ver todas (N)"
//     abaixo da lista.
//
// **RV-13.** Consumido canonicamente por:
//   - `src/app/painel-lider/page.tsx` (secao "Minha equipe")
//   - `src/app/painel-clevel/page.tsx` (secao "Minha equipe")
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';
import type { PendenciaCardRow } from '../../server/services/developmentDialogs';

/**
 * Cap canonico de linhas exibidas dentro do card (§14 DOC 05). Alem
 * disso o link "Ver todas (N)" aparece abaixo da lista se houver mais.
 * Escolha canonica: 5 evita overflow visual em telas com muitos itens
 * sem esconder totalmente a magnitude do backlog (o contador em N faz
 * o papel de sinal quantitativo).
 */
export const CARD_PENDENCIAS_MAX_ROWS = 5 as const;

/** Titulo canonico do card (identico ao ComingSoonBlock substituido). */
export const CARD_PENDENCIAS_TITULO = 'Diálogos de desenvolvimento — pendências';

/** Mensagem canonica exibida quando nao ha pendencias ativas. */
export const CARD_PENDENCIAS_VAZIO = 'Nenhuma pendência ativa.';

/**
 * Props canonicas do widget. `pendencias` chega pronto do server
 * component consumidor (ja resolvido via `getPendenciasCardData`).
 */
export interface CardPendenciasDialogosProps {
  pendencias: readonly PendenciaCardRow[];
}

export function CardPendenciasDialogos(props: CardPendenciasDialogosProps): JSX.Element {
  const { pendencias } = props;
  const total = pendencias.length;
  const visiveis = pendencias.slice(0, CARD_PENDENCIAS_MAX_ROWS);
  const hasMore = total > CARD_PENDENCIAS_MAX_ROWS;

  return (
    <div
      aria-label={CARD_PENDENCIAS_TITULO}
      style={{
        padding: '20px 24px',
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        background: COLORS.background.card,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          marginBottom: 12,
        }}
      >
        {CARD_PENDENCIAS_TITULO}
      </div>
      {total === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.text.secondary }}>{CARD_PENDENCIAS_VAZIO}</div>
      ) : (
        <>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {visiveis.map((p) => {
              const tituloDialogo =
                p.titulo === null || p.titulo === '' ? 'Diálogo sem título' : p.titulo;
              return (
                <li key={p.dialogId}>
                  <a
                    href={`/dashboard-individual/${p.employeeId}`}
                    aria-label={`Abrir dashboard de ${p.employeeNome}`}
                    style={{
                      display: 'block',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: COLORS.text.primary,
                        marginBottom: 2,
                      }}
                    >
                      {p.employeeNome}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.text.secondary }}>
                      {tituloDialogo}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: COLORS.text.secondary,
              }}
            >
              Ver todas ({total})
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
