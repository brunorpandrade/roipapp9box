'use client';

// ROIP APP 9BOX — componente canonico compartilhado OnboardingKanbanMini
// (ME-083 D-ME083-6 aprovado — extracao do CompanyLandingClient).
//
// Origem canonica:
// - DOC 05 §5.5 (Painel RH — Miniatura canonica Onboarding de lideres).
// - DOC 05 §5.4 (Painel Super Admin dentro-de-empresa — mesma miniatura).
// - DOC 06 §21.3 CAMADA_OPERACOES (contadores canonicos por estagio).
//
// Racional canonico da extracao (D-ME083-6): §5.4 e §5.5 renderizam a
// mesma miniatura kanban (4 colunas coloridas com contadores). Diferenca
// unica entre callsites: href de destino do clique (RH abre `/onboarding-
// lideres`; Super Admin dentro-de-empresa abre `/super-admin/empresa/
// [id]/onboarding-lideres`). Parametrizacao via prop `href`.
//
// **RV-13 canonica.** Consumidores:
// - `src/app/painel-rh/PainelRHClient.tsx` (ME-083).
// - `src/app/super-admin/empresa/[id]/CompanyLandingClient.tsx` (ME-074,
//   refatorado ME-083 para consumir daqui).
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import Link from 'next/link';
import type { JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

/**
 * Estagios canonicos §21.3 CAMADA_OPERACOES. Duplicado do tipo do
 * schema para evitar dependencia inversa em modulos server-only. Ordem
 * canonica bit-exact com o schema: treinar → em_treinamento → treinado
 * → reciclagem.
 */
export interface OnboardingKanbanMiniSummary {
  readonly treinar: number;
  readonly em_treinamento: number;
  readonly treinado: number;
  readonly reciclagem: number;
}

export interface OnboardingKanbanMiniProps {
  /**
   * Contadores canonicos por estagio §21.3. Renderizados como labels
   * numericos nas 4 colunas coloridas do mini-kanban.
   */
  readonly summary: OnboardingKanbanMiniSummary;
  /**
   * Href canonico de destino ao clicar o card. Bit-exact §5.5 (RH ->
   * `/onboarding-lideres`) e §5.4 (Super Admin dentro-de-empresa ->
   * `/super-admin/empresa/${id}/onboarding-lideres`).
   */
  readonly href: string;
  /**
   * Label canonico do `aria-label` do Link. Opcional; default canonico
   * "Abrir kanban de onboarding de lideres" (compatibilidade bit-exact
   * com callsite original §5.4 ME-074).
   */
  readonly ariaLabel?: string;
}

/**
 * Miniatura canonica bit-exact do kanban de onboarding de lideres.
 * Layout, cores, espacamentos e tipografia preservados bit-exact do
 * CompanyLandingClient.tsx original (ME-074).
 */
export function OnboardingKanbanMini(props: OnboardingKanbanMiniProps): JSX.Element {
  const { summary, href, ariaLabel } = props;
  const columns: readonly {
    readonly key: keyof OnboardingKanbanMiniSummary;
    readonly label: string;
    readonly color: string;
  }[] = [
    { key: 'treinar', label: 'Treinar', color: COLORS.semantic.danger },
    { key: 'em_treinamento', label: 'Em treinamento', color: COLORS.semantic.warning },
    { key: 'treinado', label: 'Treinado', color: COLORS.semantic.success },
    { key: 'reciclagem', label: 'Reciclagem', color: COLORS.primary.navy },
  ];
  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? 'Abrir kanban de onboarding de líderes'}
      style={{
        display: 'block',
        background: COLORS.background.card,
        border: `1px solid ${COLORS.border.default}`,
        borderRadius: 8,
        padding: '16px 20px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLORS.text.tertiary,
          margin: '0 0 12px 0',
        }}
      >
        Onboarding de líderes
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            style={{
              padding: '10px 8px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border.default}`,
              borderTop: `3px solid ${col.color}`,
              background: COLORS.background.elevated,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: COLORS.text.tertiary,
              }}
            >
              {col.label}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary }}>
              {summary[col.key]}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}
