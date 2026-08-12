// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/colaborador/[employeeId]/editar` (§13.5,
// ME-078b).
//
// Padrao S366 CC068 CC071. Loader server component consome
// `getEmployeeById` diretamente (import server-only). Client component
// consome apenas os tipos exportados aqui.
//
// Origem canonica:
// - CAMADA_UI §13.5 (Edicao colaborador integral) + §13.6 (modal motivo
//   saida) + §13.8 (M2 v2 transferencia liderados).
// - CAMADA_AUTH §10.9 (rota exclusiva Bruno).
// - CAMADA_NEGOCIO §5 (RF integral) + §14 (transferencia liderados)
//   + §16.2 + §16.3 + §16.4 (delecao) + §16.7.
// - CAMADA_DADOS §4.5 + §4.6 + §5.1 + §13.1.
// - MASTER_ESCOPO_B8.md §2.1 + §3.5.
//
// RV-14. Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../../../../../../db/client';
import {
  getEmployeeById,
  type GetByIdEmployeeResult,
} from '../../../../../../../server/routers/employees';

import { findCurrentRF, type CurrentRFInfo } from '../../../clevel/novo/internals';

// -----------------------------------------------------------------------
// Parse canonico de params
// -----------------------------------------------------------------------

export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function parseEmployeeIdParam(raw: string): number | null {
  if (raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

// -----------------------------------------------------------------------
// Tipo do page data
// -----------------------------------------------------------------------

export interface ColaboradorEditarPageData {
  readonly employee: GetByIdEmployeeResult;
  /** RF vigente da empresa (union employees + cLevelMembers); null se sem RF. */
  readonly currentRF: CurrentRFInfo | null;
}

// -----------------------------------------------------------------------
// Loader canonico bit-exact
// -----------------------------------------------------------------------

export async function loadColaboradorEditarPage(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
): Promise<ColaboradorEditarPageData | null> {
  const employee = await getEmployeeById(db, employeeId);
  if (employee === null) return null;
  if (employee.companyId !== companyId) return null;
  const currentRF = await findCurrentRF(db, companyId);
  return { employee, currentRF };
}
