// ROIP APP 9BOX — page hub `/super-admin/logs` (ME-080b Dispatch 3.2 / S518).
//
// Tela intermediaria de descoberta apos clique no item pai "Logs
// administrativos" do menu Super Admin (§3.1 DOC 05). Antes deste
// dispatch, o item pai apontava para uma rota sem page.tsx (404).
//
// Layout: 2 cards clicaveis grandes, um por sub-log canonico:
//   1. "Transferencias de Responsavel financeiro" — /super-admin/logs/
//      responsavel-financeiro (ME-057b).
//   2. "Log de acesso individual" — /super-admin/logs/acesso-individual
//      (ME-055b canonico + BACKLOG-03 pendente de instrumentacao).
//
// Guard canonico: Super Admin exclusivo. Middleware §10.4 ja bloqueia
// no boundary; este page.tsx reproduz por defense-in-depth via
// getServerSession + redirect.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { getServerSession } from '../../../server/session/serverSession';
import { COLORS } from '../../../lib/design-tokens/colors';

import { LogsHubClient } from './LogsHubClient';

export default async function LogsHubPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 1120,
        margin: '0 auto',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 600,
          color: COLORS.text.primary,
        }}
      >
        Logs administrativos
      </h1>
      <p
        style={{
          margin: '8px 0 24px',
          fontSize: 14,
          color: COLORS.text.secondary,
          lineHeight: 1.55,
        }}
      >
        Escolha qual registro de auditoria voce quer consultar.
      </p>

      <LogsHubClient />
    </div>
  );
}
