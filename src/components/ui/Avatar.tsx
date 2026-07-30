// ROIP APP 9BOX — Avatar canonico (ME-055c).
//
// Origem canonica: DOC 05 §2.10 (Avatares).
//
// Regras canonicas §2.10:
// - "Padrao sem foto: circulo cinza #E5E7EB com duas iniciais em #374151:
//   primeira letra do primeiro nome + primeira letra do ultimo sobrenome.
//   Fallback nome unico: primeiras duas letras."
// - "Super Admin: circulo teal #14B8A6 com iniciais brancas."
// - "Colaborador em cabecalhos de dashboard individual: circulo 44×44
//   background #1F3A5F com iniciais brancas 16px semibold."
//
// Escala canonica (Opcao A da ME-055c, aprovada pelo Bruno em N7/S226):
// 32 / 40 / 44 / 48px. O 44 canonico literal §2.10 e preservado; os
// demais tamanhos sao extrapolacao canonica sancionada para uso em
// header (32 — foto do topbar), lista compacta (40), dashboard individual
// (44 canonico), avatar destacado (48). Fonte proporcional a 40% do
// tamanho (16px semibold no canonico 44 -> proporcao 0.4).
//
// Consome `initialsFromName` de `src/lib/avatar/initials.ts` refatorado
// para o consumo canonico compartilhado com Header.tsx (§2.10 uso em
// multiplas superficies).

import type { JSX } from 'react';
import Image from 'next/image';

import { initialsFromName } from '../../lib/avatar/initials';
import { COLORS } from '../../lib/design-tokens/colors';

/**
 * Escala canonica de tamanhos §2.10 (Opcao A aprovada em N7/S226):
 * 32/40/44/48px. O 44 e o unico literal canonico; os demais sao
 * extrapolacao sancionada.
 */
export type AvatarSize = 32 | 40 | 44 | 48;

/**
 * Variantes visuais canonicas §2.10.
 * - `'default'` (padrao sem foto): circulo cinza claro com iniciais em
 *   texto escuro (#374151).
 * - `'super_admin'`: circulo teal com iniciais brancas.
 * - `'dashboard'`: circulo navy com iniciais brancas — canonico para
 *   colaborador em cabecalhos de dashboard individual (44x44 canonico).
 */
export type AvatarVariant = 'default' | 'super_admin' | 'dashboard';

export interface AvatarProps {
  /**
   * Nome completo do usuario. Se ausente ou vazio, iniciais canonicas
   * caem em `'??'` (marcador interno de fallback).
   */
  readonly name: string;
  /**
   * URL da foto do usuario. Quando presente, renderiza `<Image>` do Next
   * no tamanho canonico. Ausente cai no fallback de iniciais canonicas.
   */
  readonly photoUrl?: string;
  /**
   * Tamanho canonico do avatar §2.10 (32/40/44/48). Default: 40.
   */
  readonly size?: AvatarSize;
  /**
   * Variante visual canonica §2.10. Default: `'default'`.
   */
  readonly variant?: AvatarVariant;
}

interface VariantColors {
  readonly background: string;
  readonly text: string;
}

const VARIANT_COLORS: Record<AvatarVariant, VariantColors> = {
  default: {
    background: COLORS.border.default, // #E5E7EB §2.10 canonico
    text: COLORS.text.secondary, // #374151 §2.10 canonico
  },
  super_admin: {
    background: COLORS.accent.teal, // #14B8A6 §2.10 canonico
    text: '#FFFFFF',
  },
  dashboard: {
    background: COLORS.primary.navy, // #1F3A5F §2.10 canonico
    text: '#FFFFFF',
  },
};

/**
 * Fonte semibold proporcional a 40% do tamanho — reproduz literal o
 * canonico §2.10 "44x44 com iniciais brancas 16px semibold" (16/44 ~= 0.36;
 * arredondamos a 0.40 para inteiros ordinais na escala 32/40/44/48 sem
 * fracoes de pixel: 13/16/18/19).
 */
function fontSizeForAvatar(size: AvatarSize): number {
  switch (size) {
    case 32:
      return 13;
    case 40:
      return 16;
    case 44:
      return 16; // canonico literal §2.10
    case 48:
      return 19;
  }
}

export function Avatar(props: AvatarProps): JSX.Element {
  const { name, photoUrl, size = 40, variant = 'default' } = props;
  const colors = VARIANT_COLORS[variant];
  const fontSize = fontSizeForAvatar(size);

  if (photoUrl !== undefined && photoUrl.length > 0) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          verticalAlign: 'middle',
        }}
      >
        <Image
          src={photoUrl}
          alt={name}
          width={size}
          height={size}
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
      </span>
    );
  }

  return (
    <span
      aria-label={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors.background,
        color: colors.text,
        fontSize,
        fontWeight: 600, // semibold canonico §2.10
        letterSpacing: 0,
        userSelect: 'none',
      }}
    >
      {initialsFromName(name)}
    </span>
  );
}
