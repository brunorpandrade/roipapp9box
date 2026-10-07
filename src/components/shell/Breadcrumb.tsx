'use client';

// ROIP APP 9BOX — breadcrumb dentro-de-empresa (ME-055 Bloco B,
// reescrito na ME-B11.1a).
//
// Origem canonica: DOC 05 §4.3. Renderizado abaixo da
// `SuperAdminContextBar` nas sub-rotas do Bruno dentro de uma empresa
// (`/super-admin/empresa/[id]/*`).
//
// Estrutura canonica §4.3:
// - "Empresa [Nome fantasia] > [Nome da tela]".
// - "Empresa [Nome fantasia]" e clicavel - leva a `/super-admin/empresa/[id]`.
// - "[Nome da tela]" e o rotulo canonico derivado do pathname via
//   `breadcrumbRegistry` (§3.2).
//
// Vira client component na ME-B11.1a — consome `usePathname()` para
// resolver `companyId` e `screenName` canonico automaticamente,
// eliminando a necessidade de cada page.tsx dentro-de-empresa passar
// esses dados manualmente. O Layout monta este componente quando
// `superAdminContext` esta presente (equivale a
// `super_admin_in_company`).
//
// Fallback canonico: quando o pathname nao casa com nenhuma rota
// dentro-de-empresa (ou `companyId` nao pode ser extraido), o
// componente retorna `null` em vez de renderizar lixo. Isso cobre
// casos de hidratacao parcial e rotas futuras ainda sem entrada no
// `breadcrumbRegistry`.

import type { JSX } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { COLORS } from '../../lib/design-tokens/colors';
import {
  parseCompanyIdFromPathname,
  resolveScreenNameFromPathname,
} from '../../lib/menu/breadcrumbRegistry';

export interface BreadcrumbProps {
  /**
   * Nome fantasia da empresa em que Bruno esta navegando. Renderizado
   * dentro do prefixo "Empresa " como parte do link ao painel da empresa.
   */
  readonly companyDisplayName: string;
}

export function Breadcrumb(props: BreadcrumbProps): JSX.Element | null {
  const { companyDisplayName } = props;
  const pathname = usePathname() ?? '';
  const companyId = parseCompanyIdFromPathname(pathname);
  const screenName = resolveScreenNameFromPathname(pathname);
  if (companyId === null || screenName === null) {
    return null;
  }
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
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 12,
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
