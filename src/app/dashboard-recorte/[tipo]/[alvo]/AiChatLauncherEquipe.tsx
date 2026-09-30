'use client';

// ROIP APP 9BOX — launcher canonico do Assistente de lideranca no
// dashboard-recorte/equipe (ME-UX-CONSOLIDACAO-P3a D3).
//
// Client component que envelopa o par botao flutuante + drawer da
// equipe. Isolado deste jeito porque a page.tsx do
// `dashboard-recorte/[tipo]/[alvo]` e server component canonico; o
// estado `open` do drawer precisa de client boundary.
//
// Renderizado canonicamente pelo `page.tsx` quando `alvo.tipo ===
// 'equipe'` e o viewer atravessou `canAccessRecorte` (PC1h). Consumido
// por ambas as rotas de recorte:
//   - `/dashboard-recorte/[tipo]/[alvo]` (RH/C-level/lider)
//   - `/super-admin/empresa/[id]/dashboard-recorte/[tipo]/[alvo]` (Bruno)
//
// Botao flutuante replica bit-a-bit o padrao canonico do
// `DashboardIndividualClient`: `aria-label` + `title` = "Assistente
// de lideranca", texto "Assistente" visivel abaixo do icone.
//
// **RV-13.** Consumido pelos dois `page.tsx` de recorte.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { useState } from 'react';
import type { JSX } from 'react';

import { COLORS } from '../../../../lib/design-tokens/colors';

import { AiChatDrawerEquipe } from './AiChatDrawerEquipe';

export interface AiChatLauncherEquipeProps {
  /** `employees.id` do lider dono da equipe (contextId canonico
   *  `dashboardLevel='equipe'`). Casos `clevel-N` sao acessados
   *  via ID `employees.id` correspondente do lider tipo employee
   *  quando aplicavel; C-level puro sem entrada `employees` fica
   *  para P3b (loader canonico para leaderId=cLevelMembers.id
   *  quando o contract do `sendChatMessage` do aiChatService
   *  aceitar). */
  readonly leaderId: number;
  /** Nome do lider — vai para o subtitulo do drawer (§8.4). */
  readonly leaderName: string;
}

export function AiChatLauncherEquipe(props: AiChatLauncherEquipeProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      {open ? (
        <AiChatDrawerEquipe
          leaderId={props.leaderId}
          leaderName={props.leaderName}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Assistente de liderança"
          title="Assistente de liderança"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            minWidth: 56,
            padding: '10px 14px',
            borderRadius: 28,
            border: 'none',
            background: COLORS.accent.teal,
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.2,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            fontFamily: 'inherit',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
            💬
          </span>
          <span>Assistente</span>
        </button>
      ) : null}
    </>
  );
}
