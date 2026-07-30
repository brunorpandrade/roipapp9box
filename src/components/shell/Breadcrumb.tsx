// ROIP APP 9BOX — breadcrumb dentro-de-empresa (ME-055 Bloco B).
//
// Origem canonica: DOC 05 §4.3. Renderizado acima do titulo das
// sub-rotas do Bruno dentro de uma empresa (`/super-admin/empresa/[id]/*`).
//
// Estrutura canonica §4.3:
// - "Empresa [Nome fantasia] › [Nome da tela]".
// - "Empresa [Nome fantasia]" e clicavel — leva a `/super-admin/empresa/[id]`.
// - "[Nome da tela]" e o titulo da tela corrente, texto plano.

import type { JSX } from 'react';
import Link from 'next/link';

import { COLORS } from '../../lib/design-tokens/colors';

export interface BreadcrumbProps {
  /**
   * Nome fantasia da empresa. Renderizado dentro do prefixo "Empresa "
   * como parte do link ao painel da empresa.
   */
  readonly companyDisplayName: string;
  /**
   * ID da empresa. Compoe o `href` do primeiro segmento
   * (`/super-admin/empresa/[id]`).
   */
  readonly companyId: string;
  /**
   * Nome canonico da tela corrente conforme DOC 05 §3.2 (ex: "Todos os
   * colaboradores", "Radar NR-1", "Historico da empresa"). Renderizado
   * como texto plano apos o separador.
   */
  readonly screenName: string;
}

export function Breadcrumb(props: BreadcrumbProps): JSX.Element {
  const { companyDisplayName, companyId, screenName } = props;
  const companyHref = `/super-admin/empresa/${companyId}`;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        fontSize: 12,
        color: COLORS.text.tertiary,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Link
        href={companyHref}
        style={{
          color: COLORS.text.secondary,
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        Empresa {companyDisplayName}
      </Link>
      <span aria-hidden="true">›</span>
      <span style={{ color: COLORS.text.primary, fontWeight: 500 }}>{screenName}</span>
    </nav>
  );
}
