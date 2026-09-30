// ROIP APP 9BOX — card canonico "9-Box equipe direta" dos paineis de
// controle (ME-UX-CONSOLIDACAO D4a).
//
// Substitui bit-a-bit o `ComingSoonBlock` estatico "9-Box" que servia
// como placeholder do ponto de entrada canonico (declarado no proprio
// texto "Esta zona se tornara o ponto de entrada do dashboard da sua
// equipe"). Agora ativo — clique leva ao `/dashboard-recorte/equipe/
// [liderId]`, que ja existe e ja e autorizado por PC1h para lideres da
// propria cadeia (roteador `dashboard-recorte/[tipo]/[alvo]/page.tsx`).
//
// Layout canonico: espelha bit-a-bit o padrao dos demais cards
// estruturais dos paineis (`StructuralCard`, `TurnoverIndicatorCard`,
// `COLABORADORES ATIVOS` na demo) — rotulo caixa alta com tracking
// largo no topo, numero grande no meio, palavra "colaboradores" (plural
// canonico, mesmo quando N=1) embaixo.
//
// Regra canonica registrada com Bruno: lider sempre tem ≥1 liderado
// direto (cadastro bloqueia lider sem liderado); logo, este card so
// renderiza quando `count >= 1`. Comportamento canonico:
//   - `count >= 2` → link para `/dashboard-recorte/equipe/[liderId]`.
//   - `count === 1` → link canonico para `/dashboard-recorte/equipe/
//     [liderId]` tambem (ha somente um recorte de equipe possivel);
//     desvio para `/dashboard-individual/[unicoLideradoId]` fica como
//     debito de lapidacao futura, quando o loader carregar tambem o ID
//     do unico liderado.
//
// **RV-13.** Consumido em `src/app/painel-lider/page.tsx` (secao
// "Visao geral") e futuramente em `src/app/painel-clevel/page.tsx`
// (P3 da ME-UX-CONSOLIDACAO — depende de novo loader canonico).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

/** Titulo canonico do card (D4a — decisao Bruno). */
export const CARD_9BOX_EQUIPE_DIRETA_TITULO = '9-Box equipe direta' as const;

/**
 * Rotulo canonico da unidade contada, sempre no plural mesmo quando N=1
 * (decisao Bruno D4a). Mantem paridade visual com os demais cards
 * estruturais dos paineis (ex.: "Total na plataforma", "Cadeia direta
 * ativa").
 */
export const CARD_9BOX_EQUIPE_DIRETA_UNIDADE = 'colaboradores' as const;

export interface Card9BoxEquipeDiretaProps {
  /** ID do lider (`employees.id` ou `cLevelMembers.id`). */
  readonly liderId: number;
  /**
   * Tipo canonico do lider — vira o prefixo do `[alvo]` da rota
   * `/dashboard-recorte/equipe/[alvo]`, que exige bit-a-bit o padrao
   * `employee-N` ou `clevel-N` (contrato canonico do
   * `resolveRecorteAlvo` em `src/server/services/recorteAccess.ts`).
   * Painel-lider passa sempre `'employee'` (unica rota canonica de
   * lider tipo 1); painel-clevel (P3 desta ME) passa `'clevel'` para
   * C-level canonico.
   */
  readonly liderTipo: 'employee' | 'clevel';
  /** Total de liderados diretos do lider. Sempre >= 1 canonicamente. */
  readonly count: number;
}

export function Card9BoxEquipeDireta(props: Card9BoxEquipeDiretaProps): JSX.Element {
  const { liderId, liderTipo, count } = props;
  const href = `/dashboard-recorte/equipe/${liderTipo}-${liderId}`;
  return (
    <a
      href={href}
      aria-label={`${CARD_9BOX_EQUIPE_DIRETA_TITULO} — ${count} ${CARD_9BOX_EQUIPE_DIRETA_UNIDADE}`}
      style={{
        display: 'block',
        padding: '20px 24px',
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        background: COLORS.background.card,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          marginBottom: 8,
        }}
      >
        {CARD_9BOX_EQUIPE_DIRETA_TITULO}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: COLORS.text.primary,
          lineHeight: 1.1,
          marginBottom: 4,
        }}
      >
        {count}
      </div>
      <div style={{ fontSize: 13, color: COLORS.text.secondary }}>
        {CARD_9BOX_EQUIPE_DIRETA_UNIDADE}
      </div>
    </a>
  );
}
