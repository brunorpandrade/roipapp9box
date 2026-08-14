// ROIP APP 9BOX — page canonica de `/alterar-senha` (ME-080b Dispatch 3).
//
// Duas responsabilidades:
//   1. Gate reverso: se o titular ja setou senha (`passwordSet=true`),
//      permite acesso — canal canonico do menu §9.6 ainda vale para
//      trocar senha voluntariamente.
//   2. Renderiza `AlterarSenhaClient` — form controlado com 3 campos
//      canonicos (senha atual, nova, confirmar), delegando ao
//      `auth.changePassword` via server action.
//
// Autorizacao: aberta a todos os platform roles (matrix.ts §10.2).
// Super Admin nao tem `passwordSet` no schema; se chegar aqui, tratamos
// como sessao valida sem gate reverso.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getServerSession } from '../../server/session/serverSession';

import { AlterarSenhaClient } from './AlterarSenhaClient';

function resolvePainelHref(role: 'rh' | 'rh_lider' | 'clevel' | 'lider'): string {
  switch (role) {
    case 'rh':
    case 'rh_lider':
      return '/painel-rh';
    case 'clevel':
      return '/painel-clevel';
    case 'lider':
      return '/painel-lider';
  }
}

export default async function AlterarSenhaPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }

  // Super Admin: acesso sempre permitido; sem gate reverso (passwordSet
  // nao existe no schema).
  if (session.kind === 'super_admin') {
    return (
      <AlterarSenhaClient
        titularKind="super_admin"
        forcado={false}
        destinoAposTroca="/super-admin"
        displayName={session.displayName}
      />
    );
  }

  // Platform: identifica se e primeiro acesso (forcado) ou troca
  // voluntaria pelo menu.
  const painelHref = resolvePainelHref(session.role);
  const forcado = session.passwordSet === false;

  return (
    <AlterarSenhaClient
      titularKind="platform"
      forcado={forcado}
      destinoAposTroca={painelHref}
      displayName={session.displayName}
    />
  );
}
