// ROIP APP 9BOX — server actions da rota Bruno dentro-de-empresa
// `/super-admin/empresa/[id]/pendencias-portal` (ME-058).
//
// Origem canonica:
// - Padrao S315 canonizada em ME-057b (rota dupla): a rota Bruno
//   dentro-de-empresa reutiliza as actions da rota RH pura, passando
//   `companyId` explicito.
// - Guard S319 (defense-in-depth ao matrix.ts `/super-admin/empresa/*`
//   matchPrefix): a rota so aceita `session.kind === 'super_admin'`.
//
// Contrato canonico: wrappers ao redor das actions canonicas de
// `pendencias-portal/actions.ts`. O guard `session.kind` ja acontece
// dentro delas (S317).
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `atualizarPendenciasBrunoAction` → `PendenciasClient.tsx` do
//     contexto Bruno + `me058-pendencias.test.ts`.
//   - `enviarLembreteBrunoAction` → idem.
//   - `enviarLembretesEmMassaBrunoAction` → idem.

'use server';

import type { PortalInstrumentType } from '../../../../../db/schema/enums';
import {
  atualizarPendenciasAction,
  enviarLembreteAction,
  enviarLembretesEmMassaAction,
  type EnviarLembreteResult,
  type EnviarLembretesEmMassaResult,
} from '../../../../pendencias-portal/actions';
import type { PendenciasFilters } from '../../../../pendencias-portal/filters';
import type { PendenciasLoadResult } from '../../../../../lib/pendencias/pendenciasEngine';

/**
 * Re-fetch da rota Bruno. `companyId` explicito (Bruno nao tem
 * session.companyId).
 */
export async function atualizarPendenciasBrunoAction(input: {
  readonly companyId: number;
  readonly filters: PendenciasFilters;
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
}): Promise<PendenciasLoadResult> {
  return await atualizarPendenciasAction({
    companyId: input.companyId,
    filters: input.filters,
    page: input.page,
    pageSize: input.pageSize,
  });
}

/**
 * Envio individual de lembrete pela rota Bruno.
 */
export async function enviarLembreteBrunoAction(input: {
  readonly companyId: number;
  readonly employeeId: number;
  readonly instrumento: PortalInstrumentType;
  readonly cicloReferencia: string | null;
}): Promise<EnviarLembreteResult> {
  return await enviarLembreteAction({
    companyId: input.companyId,
    employeeId: input.employeeId,
    instrumento: input.instrumento,
    cicloReferencia: input.cicloReferencia,
  });
}

/**
 * Envio em massa de lembretes pela rota Bruno.
 */
export async function enviarLembretesEmMassaBrunoAction(input: {
  readonly companyId: number;
  readonly alvos: readonly {
    readonly employeeId: number;
    readonly instrumento: PortalInstrumentType;
    readonly cicloReferencia: string | null;
  }[];
}): Promise<EnviarLembretesEmMassaResult> {
  return await enviarLembretesEmMassaAction({
    companyId: input.companyId,
    alvos: input.alvos,
  });
}
