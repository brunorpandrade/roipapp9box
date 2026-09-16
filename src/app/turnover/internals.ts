// ROIP APP 9BOX — acesso a pagina e aos documentos de turnover
// (especificacao "Turnover e desligamento" §7, ME-fila6 D2).
//
// - Pagina, card e documentos padrao: Bruno, RH puro, RH-Lider e C-level
//   com acesso total (`clevel_full`).
// - Drill-down nominal (nome + formulario preenchido): Bruno e RH
//   (Q1 = Opcao B — C-level com acesso total nao ve).
// - Lider e C-level restrito: sem acesso.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../db/client';
import { loadPlatformMenuContext } from '../../lib/session/platformMenuContext';
import type { ServerSession } from '../../server/session/serverSession';

/** Acesso resolvido. `companyId` ja validado para a sessao. */
export interface TurnoverAccess {
  readonly companyId: number;
  readonly podeDrilldown: boolean;
}

/**
 * Resolve o acesso. Para Bruno, `companyIdSuperAdmin` e a empresa da rota;
 * sessoes platform ignoram o parametro e usam a propria empresa.
 */
export async function resolveTurnoverAccess(
  db: RoipDatabase,
  session: ServerSession,
  companyIdSuperAdmin: number | null,
): Promise<TurnoverAccess | null> {
  if (session.kind === 'super_admin') {
    if (companyIdSuperAdmin === null) {
      return null;
    }
    return { companyId: companyIdSuperAdmin, podeDrilldown: true };
  }
  if (session.role === 'rh' || session.role === 'rh_lider') {
    return { companyId: session.companyId, podeDrilldown: true };
  }
  if (session.role !== 'clevel') {
    return null;
  }
  const menu = await loadPlatformMenuContext(db, session);
  if (menu === null || menu.profileKey !== 'clevel_full') {
    return null;
  }
  return { companyId: session.companyId, podeDrilldown: false };
}

/** Le `?grupo=` do drill-down. */
export function parseGrupoDrilldown(
  raw: string | string[] | undefined,
): 'voluntario' | 'involuntario' | null {
  if (raw === 'voluntario' || raw === 'involuntario') {
    return raw;
  }
  return null;
}

/** Le `?trimestre=` (`YYYY-QN`). */
export function parseTrimestreParam(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  return /^\d{4}-Q[1-4]$/.test(raw) ? raw : null;
}
