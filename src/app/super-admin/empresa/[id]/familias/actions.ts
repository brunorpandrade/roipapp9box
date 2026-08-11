// ROIP APP 9BOX — server actions da rota Bruno
// `/super-admin/empresa/[id]/familias` (§13.1 Aba 2, ME-075).
//
// Save canonico bit-exact por familia (§13.1 Aba 2 mockup linha 399:
// "Cada familia tem seu proprio botao Salvar"). Chama o service
// `upsertJobFamilyVariables` diretamente via `.onDuplicateKeyUpdate()`
// (pre-decisao 1 aprovada por Bruno).
//
// **RV-13.** Consumida por `FamiliasClient.tsx` + testes de integracao
// `me075-familias.test.ts`.

'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { companies } from '../../../../../db/schema';
import { JOB_FAMILY_VALUES, type JobFamily } from '../../../../../db/schema/enums';
import {
  LIDERANCA_GESTAO_VAR_NAMES,
  LIDERANCA_GESTAO_VAR_UNITS,
  MSG_JOB_FAMILY_INDICES_INVALIDOS,
  MSG_JOB_FAMILY_SOMA_PESOS_INVALIDA,
} from '../../../../../server/routers/company';
import {
  upsertJobFamilyVariables,
  type JobFamilyVariableInput,
} from '../../../../../server/services/companyJobFamilies';
import { getServerSession } from '../../../../../server/session/serverSession';

import { resolveDatabaseUrl } from './internals';

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

async function requireSuperAdmin(actionName: string): Promise<number> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin (§10.9 CAMADA_AUTH)`);
  }
  return session.superAdminId;
}

/**
 * Persiste as 4 variaveis de UMA familia via UPSERT canonico bit-exact
 * (`.onDuplicateKeyUpdate()`). Aplica canonicamente bit-exact as
 * validacoes bit-exact do router `updateJobFamilies`:
 *   - Existencia da empresa.
 *   - `jobFamily` em `JOB_FAMILY_VALUES` (6 valores).
 *   - `variables.length === 4` cobrindo indices {0,1,2,3}.
 *   - Soma dos pesos = 100 (tolerancia 0.01).
 *   - Familia 6 (`lideranca_gestao`): nomes e unidades canonicos bit-
 *     exact hard-coded no server (mockup linha 352 `estrutural:true`).
 */
export async function saveJobFamilyAction(input: {
  readonly companyId: number;
  readonly jobFamily: JobFamily;
  readonly variables: ReadonlyArray<{
    readonly variableIndex: number;
    readonly variableName: string;
    readonly unit: string;
    readonly weight: number;
  }>;
}): Promise<ActionResult> {
  const updatedBy = await requireSuperAdmin('saveJobFamilyAction');

  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId invalido.' };
  }
  const validValues = JOB_FAMILY_VALUES as ReadonlyArray<string>;
  if (!validValues.includes(input.jobFamily)) {
    return { ok: false, message: 'Familia de funcao invalida.' };
  }
  if (input.variables.length !== 4) {
    return { ok: false, message: MSG_JOB_FAMILY_INDICES_INVALIDOS };
  }
  const indices = input.variables.map((v) => v.variableIndex).sort((a, b) => a - b);
  if (indices[0] !== 0 || indices[1] !== 1 || indices[2] !== 2 || indices[3] !== 3) {
    return { ok: false, message: MSG_JOB_FAMILY_INDICES_INVALIDOS };
  }
  const sum = input.variables.reduce((acc, v) => acc + v.weight, 0);
  if (Math.abs(sum - 100) > 0.01) {
    return { ok: false, message: MSG_JOB_FAMILY_SOMA_PESOS_INVALIDA };
  }
  for (const v of input.variables) {
    if (!Number.isFinite(v.weight) || v.weight < 0 || v.weight > 100) {
      return { ok: false, message: 'Peso deve estar entre 0 e 100.' };
    }
    if (typeof v.variableName !== 'string' || v.variableName.trim() === '') {
      return { ok: false, message: 'Nome da variavel obrigatorio.' };
    }
    if (typeof v.unit !== 'string' || v.unit.trim() === '') {
      return { ok: false, message: 'Unidade da variavel obrigatoria.' };
    }
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const companyRows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (companyRows[0] === undefined) {
      return { ok: false, message: 'Empresa nao encontrada.' };
    }

    const finalVars: JobFamilyVariableInput[] =
      input.jobFamily === 'lideranca_gestao'
        ? input.variables.map((v) => ({
            variableIndex: v.variableIndex,
            variableName: LIDERANCA_GESTAO_VAR_NAMES[v.variableIndex as 0 | 1 | 2 | 3],
            unit: LIDERANCA_GESTAO_VAR_UNITS[v.variableIndex as 0 | 1 | 2 | 3],
            weight: v.weight,
          }))
        : input.variables.map((v) => ({
            variableIndex: v.variableIndex,
            variableName: v.variableName.trim(),
            unit: v.unit.trim(),
            weight: v.weight,
          }));

    await upsertJobFamilyVariables(
      client.db,
      input.companyId,
      input.jobFamily,
      finalVars,
      updatedBy,
    );
    revalidatePath(`/super-admin/empresa/${input.companyId}/familias`);
    return { ok: true, data: null };
  } finally {
    await closeDbClient(client);
  }
}
