// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/colaborador/novo` (§13.4 + §13.9, ME-078b).
//
// Padrao S366 CC068 CC071. Loaders + parse + tipos consumidos pelo
// `page.tsx` server component e pelo `ColaboradorNovoClient`.
//
// CC071 canonizada — client-safe: zero imports VALUE-LEVEL de routers/
// services/db no client component. Este `internals.ts` importa de
// `db` e `routers` para servir o server component (`page.tsx`) apenas;
// os tipos exportados sao consumidos por Client sem side effect.
//
// Origem canonica:
// - CAMADA_UI §13.4 (Cadastro colaborador integral) + §13.9 (preset=rh).
// - CAMADA_AUTH §10.9 (rota exclusiva Bruno) + §12 (RF exclusivo Bruno).
// - CAMADA_NEGOCIO §5 (RF integral) + §16.2 (Cadastro colaborador) + §16.7.
// - CAMADA_DADOS §4.5 (`employees`) + §5.1 (`responsavelFinanceiroTransferLog`).
// - MASTER_ESCOPO_B8.md §2.1 + §3.5.
//
// RV-13. Todo export consumido: `parseCompanyIdParam` +
// `resolveDatabaseUrl` + `loadColaboradorNovoPage` → `page.tsx`; tipo
// `ColaboradorNovoPageData` → `page.tsx` + `ColaboradorNovoClient`.
//
// RV-14. Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../../../../../db/client';

import { findCurrentRF, type CurrentRFInfo } from '../../clevel/novo/internals';

// -----------------------------------------------------------------------
// Parse canonico de params (padrao S366 replicado bit-exact)
// -----------------------------------------------------------------------

export function parseCompanyIdParam(raw: string): number | null {
  if (raw.length === 0) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente no ambiente — configure .env (ver .env.example)');
  }
  return url;
}

/** ME-078b §13.9 canonico — validador do preset=rh na query string. */
export function parsePresetParam(raw: string | undefined): 'rh' | null {
  if (raw === undefined) return null;
  if (raw === 'rh') return 'rh';
  return null;
}

// -----------------------------------------------------------------------
// Tipos do page data
// -----------------------------------------------------------------------

export interface ColaboradorNovoPageData {
  /** RF atual da empresa (null quando empresa sem RF). */
  readonly currentRF: CurrentRFInfo | null;
  /** ME-078b §13.9 canonico — preset RH pre-ativa toggle `isRH`. */
  readonly presetIsRH: boolean;
}

// -----------------------------------------------------------------------
// Loader canonico bit-exact
// -----------------------------------------------------------------------

export async function loadColaboradorNovoPage(
  db: RoipDatabase,
  companyId: number,
  preset: 'rh' | null,
): Promise<ColaboradorNovoPageData> {
  const currentRF = await findCurrentRF(db, companyId);
  return {
    currentRF,
    presetIsRH: preset === 'rh',
  };
}
