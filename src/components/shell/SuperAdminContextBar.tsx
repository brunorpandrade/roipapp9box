// ROIP APP 9BOX — indicador contextual "Navegando como Super Admin"
// (ME-055 Bloco B).
//
// Origem canonica: DOC 05 §4.2. Faixa fina permanente abaixo do header
// principal, presente apenas quando Bruno esta dentro de uma empresa
// (`/super-admin/empresa/[id]/*`). O consumidor (Layout) decide se monta
// este componente com base no ProfileKey `super_admin_in_company`.
//
// Estrutura canonica §4.2:
// - Faixa de 32px, background navy `#1F3A5F` opacity 0.9, texto branco 12px.
// - Texto exato: "Navegando como Super Admin — [Nome fantasia da empresa]".
// - A direita: botao "[← Sair da empresa]" que retorna ao `/super-admin`
//   global.

import { ArrowLeft as ArrowLeftIcon } from 'lucide-react';
import type { JSX } from 'react';
import Link from 'next/link';

import { COLORS } from '../../lib/design-tokens/colors';

export interface SuperAdminContextBarProps {
  /**
   * Nome fantasia da empresa em que Bruno esta navegando. Renderizado
   * literalmente entre o em-traco e o botao "Sair da empresa" conforme
   * §4.2.
   */
  readonly companyDisplayName: string;
}

export function SuperAdminContextBar(props: SuperAdminContextBarProps): JSX.Element {
  const { companyDisplayName } = props;

  return (
    <div
      role="region"
      aria-label="Contexto de navegação como Super Admin"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 32,
        paddingLeft: 16,
        paddingRight: 16,
        // §4.2: navy #1F3A5F com opacity 0.9.
        background: 'rgba(31, 58, 95, 0.9)',
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <span>Navegando como Super Admin — {companyDisplayName}</span>
      <Link
        href="/super-admin"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: '#FFFFFF',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 500,
          background: 'transparent',
          border: `1px solid rgba(255, 255, 255, 0.4)`,
          borderRadius: 6,
          padding: '3px 8px',
        }}
      >
        <ArrowLeftIcon size={12} strokeWidth={2} />
        Sair da empresa
      </Link>
    </div>
  );
}

// Constante canonica remissiva ao design token `COLORS.primary.navy`.
// Consumida pelo teste unit para verificacao de coerencia com §2.1.
export const SUPER_ADMIN_CONTEXT_BAR_NAVY = COLORS.primary.navy;
