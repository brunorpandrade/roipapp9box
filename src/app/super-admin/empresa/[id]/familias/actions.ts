// ROIP APP 9BOX — server actions canonicas da rota Bruno
// `/super-admin/empresa/[id]/familias` (ME-075 + ME-1.17.2 + ME-1.17.3).
//
// Actions canonicas:
// - `saveJobFamilyAction` (ME-075 bit-exact preservada) — save das 4
//   variaveis (nome, unidade, peso) de UMA familia.
// - `activateCustomSlotAction` (ME-1.17.2) — ativa proximo slot custom
//   livre via `activateCustomSlot` + seed canonico de 4 variaveis a
//   25%.
// - `toggleFamilyActiveAction` (ME-1.17.2) — ativar/desativar familia
//   canonica OU custom. Guard: bloqueado quando familia tem
//   colaboradores ATIVOS vinculados (fluxo canonico ME-1.17.3 chama
//   `migrateAndDeactivateFamilyAction` nesse caso).
// - `renameFamilyAction` (ME-1.17.2) — edicao inline do
//   `nomeCustomizado`.
// - `reorderFamilyAction` (ME-1.17.2) — swap de `ordem` com vizinho
//   (direcao up/down) entre familias ATIVAS.
// - `migrateAndDeactivateFamilyAction` (ME-1.17.3 nova) — move em
//   lote os N colaboradores ATIVOS de `fromFamily` para `toFamily`
//   via `migrateEmployeesJobFamily` + desativa `fromFamily` em
//   seguida via `updateFamilySettings`. Operacao sequencial canonica
//   (ambos UPDATEs em Drizzle tipado; sem FK/UNIQUE problematico
//   entre eles, safe sem transacao explicita).
//
// Autorizacao canonica: todas as actions sob `requireSuperAdmin`.
// RV-12: Drizzle tipado. RV-13: todas consumidas por FamiliasClient.
// RV-14: um statement por linha, 100 cols.

'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import { companies, companyRoleFamilySettings } from '../../../../../db/schema';
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
import {
  activateCustomSlot,
  FamilySettingsError,
  listActiveFamilySettingsForCompany,
  updateFamilySettings,
} from '../../../../../server/services/companyRoleFamilySettings';
import { migrateEmployeesJobFamily } from '../../../../../server/services/employees';
import { getServerSession } from '../../../../../server/session/serverSession';
import { resolveDatabaseUrl } from '../../../../../lib/db/resolveDatabaseUrl';
import { countEmployeesByJobFamily } from '../../../../../lib/job-family/countEmployeesByJobFamily';

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

async function requireSuperAdmin(actionName: string): Promise<number> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessão ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin (§10.9 CAMADA_AUTH)`);
  }
  return session.superAdminId;
}

async function assertCompanyExists(
  db: Awaited<ReturnType<typeof createDbClient>>['db'],
  companyId: number,
): Promise<boolean> {
  const companyRows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return companyRows[0] !== undefined;
}

/**
 * ME-075 bit-exact preservada. Persiste as 4 variaveis de UMA familia.
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
    return { ok: false, message: 'companyId inválido.' };
  }
  const validValues = JOB_FAMILY_VALUES as ReadonlyArray<string>;
  if (!validValues.includes(input.jobFamily)) {
    return { ok: false, message: 'Família de função inválida.' };
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
      return { ok: false, message: 'Nome da variável obrigatório.' };
    }
    if (typeof v.unit !== 'string' || v.unit.trim() === '') {
      return { ok: false, message: 'Unidade da variável obrigatória.' };
    }
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (!(await assertCompanyExists(client.db, input.companyId))) {
      return { ok: false, message: 'Empresa não encontrada.' };
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

/**
 * ME-1.17.2 — ativa proximo slot custom livre. O service canonico
 * `activateCustomSlot` ja aloca o proximo slot numerico, insere linha
 * em `companyRoleFamilySettings` + seeda 4 variaveis a 25% em
 * `companyJobFamilies`. Caller informa apenas o nome.
 */
export async function activateCustomSlotAction(input: {
  readonly companyId: number;
  readonly nomeCustomizado: string;
}): Promise<ActionResult<{ chosen: JobFamily }>> {
  const updatedBy = await requireSuperAdmin('activateCustomSlotAction');
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId inválido.' };
  }
  const nome = input.nomeCustomizado.trim();
  if (nome.length === 0) {
    return { ok: false, message: 'Nome da nova família obrigatório.' };
  }
  if (nome.length > 60) {
    return { ok: false, message: 'Nome da família deve ter no máximo 60 caracteres.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (!(await assertCompanyExists(client.db, input.companyId))) {
      return { ok: false, message: 'Empresa não encontrada.' };
    }
    try {
      const chosen = await activateCustomSlot(client.db, input.companyId, nome, updatedBy);
      revalidatePath(`/super-admin/empresa/${input.companyId}/familias`);
      return { ok: true, data: { chosen } };
    } catch (err) {
      if (err instanceof FamilySettingsError) {
        return { ok: false, message: err.message };
      }
      throw err;
    }
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-1.17.2 — toggle de ativacao/desativacao de familia.
 *
 * Guard D6: desativacao bloqueada quando `countEmployeesByJobFamily`
 * retorna > 0 para essa familia. Mensagem orienta migrar primeiro.
 *
 * Trava absoluta `lideranca_gestao`: reforcada pelo service
 * `updateFamilySettings` (lanca `LOCKED_STRUCTURAL`).
 */
export async function toggleFamilyActiveAction(input: {
  readonly companyId: number;
  readonly jobFamily: JobFamily;
  readonly ativo: boolean;
}): Promise<ActionResult> {
  const updatedBy = await requireSuperAdmin('toggleFamilyActiveAction');
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId inválido.' };
  }
  const validValues = JOB_FAMILY_VALUES as ReadonlyArray<string>;
  if (!validValues.includes(input.jobFamily)) {
    return { ok: false, message: 'Família de função inválida.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (!(await assertCompanyExists(client.db, input.companyId))) {
      return { ok: false, message: 'Empresa não encontrada.' };
    }
    if (!input.ativo) {
      const counts = await countEmployeesByJobFamily(client.db, input.companyId);
      const n = counts[input.jobFamily];
      if (n > 0) {
        return {
          ok: false,
          message:
            `Não é possível desativar: ${n} colaborador(es) ativo(s) ` +
            'ainda usam esta família. Migre-os antes.',
        };
      }
    }
    try {
      await updateFamilySettings(
        client.db,
        input.companyId,
        input.jobFamily,
        { ativo: input.ativo },
        updatedBy,
      );
      revalidatePath(`/super-admin/empresa/${input.companyId}/familias`);
      return { ok: true, data: null };
    } catch (err) {
      if (err instanceof FamilySettingsError) {
        return { ok: false, message: err.message };
      }
      throw err;
    }
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-1.17.2 — renomeia familia (define `nomeCustomizado`). Passe
 * `nomeCustomizado = null` para voltar ao label canonico.
 *
 * Trava absoluta `lideranca_gestao`: reforcada pelo service
 * `updateFamilySettings` (lanca `LOCKED_STRUCTURAL`).
 */
export async function renameFamilyAction(input: {
  readonly companyId: number;
  readonly jobFamily: JobFamily;
  readonly nomeCustomizado: string | null;
}): Promise<ActionResult> {
  const updatedBy = await requireSuperAdmin('renameFamilyAction');
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId inválido.' };
  }
  const validValues = JOB_FAMILY_VALUES as ReadonlyArray<string>;
  if (!validValues.includes(input.jobFamily)) {
    return { ok: false, message: 'Família de função inválida.' };
  }
  let normalized: string | null = null;
  if (input.nomeCustomizado !== null) {
    const trimmed = input.nomeCustomizado.trim();
    if (trimmed.length === 0) {
      normalized = null;
    } else if (trimmed.length > 60) {
      return { ok: false, message: 'Nome da família deve ter no máximo 60 caracteres.' };
    } else {
      normalized = trimmed;
    }
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (!(await assertCompanyExists(client.db, input.companyId))) {
      return { ok: false, message: 'Empresa não encontrada.' };
    }
    try {
      await updateFamilySettings(
        client.db,
        input.companyId,
        input.jobFamily,
        { nomeCustomizado: normalized },
        updatedBy,
      );
      revalidatePath(`/super-admin/empresa/${input.companyId}/familias`);
      return { ok: true, data: null };
    } catch (err) {
      if (err instanceof FamilySettingsError) {
        return { ok: false, message: err.message };
      }
      throw err;
    }
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-1.17.2 — reordena familia (setas up/down). Carrega lista de
 * ATIVAS ordenada por `ordem ASC`, encontra o vizinho na `direção`
 * (anterior para 'up', seguinte para 'down') e faz swap de `ordem`.
 *
 * Idempotente nos extremos: se a familia ja esta no topo e `direcao
 * = 'up'`, ou ja esta no fim e `direcao = 'down'`, retorna ok sem
 * mudanca. UI canonica desabilita o botao nesses casos.
 */
export async function reorderFamilyAction(input: {
  readonly companyId: number;
  readonly jobFamily: JobFamily;
  readonly direcao: 'up' | 'down';
}): Promise<ActionResult> {
  const updatedBy = await requireSuperAdmin('reorderFamilyAction');
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId inválido.' };
  }
  const validValues = JOB_FAMILY_VALUES as ReadonlyArray<string>;
  if (!validValues.includes(input.jobFamily)) {
    return { ok: false, message: 'Família de função inválida.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (!(await assertCompanyExists(client.db, input.companyId))) {
      return { ok: false, message: 'Empresa não encontrada.' };
    }
    const activeSettings = await listActiveFamilySettingsForCompany(client.db, input.companyId);
    const idx = activeSettings.findIndex((s) => s.jobFamily === input.jobFamily);
    if (idx === -1) {
      return {
        ok: false,
        message: 'Família não ativa — ative antes de reordenar.',
      };
    }
    const neighborIdx = input.direcao === 'up' ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= activeSettings.length) {
      return { ok: true, data: null };
    }
    const self = activeSettings[idx];
    const neighbor = activeSettings[neighborIdx];
    if (self === undefined || neighbor === undefined) {
      return { ok: false, message: 'Estado inconsistente no reorder.' };
    }
    const selfOrdem = self.ordem;
    const neighborOrdem = neighbor.ordem;
    // Swap em 2 updates (sem FK, sem UNIQUE no par — safe sem tx).
    // Usa valor sentinela temporario para evitar colisao do UNIQUE
    // (companyId, ordem) caso exista — defesa canonica.
    const sentinel = -1 * (Date.now() % 1_000_000);
    await client.db
      .update(companyRoleFamilySettings)
      .set({ ordem: sentinel, updatedBy })
      .where(
        and(
          eq(companyRoleFamilySettings.companyId, input.companyId),
          eq(companyRoleFamilySettings.jobFamily, self.jobFamily),
        ),
      );
    await client.db
      .update(companyRoleFamilySettings)
      .set({ ordem: selfOrdem, updatedBy })
      .where(
        and(
          eq(companyRoleFamilySettings.companyId, input.companyId),
          eq(companyRoleFamilySettings.jobFamily, neighbor.jobFamily),
        ),
      );
    await client.db
      .update(companyRoleFamilySettings)
      .set({ ordem: neighborOrdem, updatedBy })
      .where(
        and(
          eq(companyRoleFamilySettings.companyId, input.companyId),
          eq(companyRoleFamilySettings.jobFamily, self.jobFamily),
        ),
      );
    revalidatePath(`/super-admin/empresa/${input.companyId}/familias`);
    return { ok: true, data: null };
  } finally {
    await closeDbClient(client);
  }
}

/**
 * ME-1.17.3 — migra N colaboradores ATIVOS de `fromFamily` para
 * `toFamily` + desativa `fromFamily` em seguida. UX helper canonica
 * para o fluxo "desativar família ocupada" (D6 ME-1.17.2 bloqueava
 * via guard; esta action desbloqueia via migracao previa).
 *
 * Validacoes canonicas:
 * - `fromFamily != toFamily` (migracao real).
 * - `toFamily` ATIVA (nao pode migrar para familia desativada).
 * - `fromFamily` nao pode ser `lideranca_gestao` (trava absoluta
 *   reforcada pelo `updateFamilySettings` server-side).
 * - Ambas em `JOB_FAMILY_VALUES`.
 *
 * Sequencia canonica (sem transacao explicita — UPDATEs sao
 * independentes e idempotentes isoladamente):
 *   1. `migrateEmployeesJobFamily(from -> to)` — UPDATE em lote.
 *   2. `updateFamilySettings(from, { ativo: false })` — desativa.
 * Retorna numero de colaboradores migrados.
 */
export async function migrateAndDeactivateFamilyAction(input: {
  readonly companyId: number;
  readonly fromFamily: JobFamily;
  readonly toFamily: JobFamily;
}): Promise<ActionResult<{ migrated: number }>> {
  const updatedBy = await requireSuperAdmin('migrateAndDeactivateFamilyAction');
  if (!Number.isInteger(input.companyId) || input.companyId <= 0) {
    return { ok: false, message: 'companyId inválido.' };
  }
  const validValues = JOB_FAMILY_VALUES as ReadonlyArray<string>;
  if (!validValues.includes(input.fromFamily) || !validValues.includes(input.toFamily)) {
    return { ok: false, message: 'Família de função inválida.' };
  }
  if (input.fromFamily === input.toFamily) {
    return { ok: false, message: 'Família destino não pode ser igual à origem.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    if (!(await assertCompanyExists(client.db, input.companyId))) {
      return { ok: false, message: 'Empresa não encontrada.' };
    }
    const activeSettings = await listActiveFamilySettingsForCompany(client.db, input.companyId);
    const destinoAtivo = activeSettings.some((s) => s.jobFamily === input.toFamily);
    if (!destinoAtivo) {
      return {
        ok: false,
        message: 'Família destino precisa estar ATIVA para receber a migração.',
      };
    }
    try {
      const migrated = await migrateEmployeesJobFamily(
        client.db,
        input.companyId,
        input.fromFamily,
        input.toFamily,
      );
      await updateFamilySettings(
        client.db,
        input.companyId,
        input.fromFamily,
        { ativo: false },
        updatedBy,
      );
      revalidatePath(`/super-admin/empresa/${input.companyId}/familias`);
      return { ok: true, data: { migrated } };
    } catch (err) {
      if (err instanceof FamilySettingsError) {
        return { ok: false, message: err.message };
      }
      throw err;
    }
  } finally {
    await closeDbClient(client);
  }
}
