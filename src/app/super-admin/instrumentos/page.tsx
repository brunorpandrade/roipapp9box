// ROIP APP 9BOX — pagina canonica `/super-admin/instrumentos`
// (ME-B11.2).
//
// Substitui o placeholder "em breve" (ME-B11.1g / G7) pela aba de
// demonstracao real dos instrumentos canonicos: lista dinamica em
// ordem A, B, C, D, PI; apresentacao textual (o-que-faz / para-que-serve
// / periodicidade / quem-preenche); e "Experiencia do usuario" com os
// shells reais em canal `demo` (sem persistencia).
//
// Server component: aplica o guard canonico de Super Admin (DOC 05
// §3.1) e delega toda a UI para `InstrumentosSuperAdminClient`.
//
// RV-13 — a rota e consumida pelo roteador Next 15 App Router via o
// href `/super-admin/instrumentos` do menu `MENU_SUPER_ADMIN_GLOBAL`.
// RV-14 — um statement por linha, largura maxima 100 cols.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { InstrumentosSuperAdminClient } from './InstrumentosSuperAdminClient';
import { getServerSession } from '../../../server/session/serverSession';

export default async function InstrumentosSuperAdminPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  return <InstrumentosSuperAdminClient />;
}
