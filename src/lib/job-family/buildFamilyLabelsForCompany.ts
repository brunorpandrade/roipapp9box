// ROIP APP 9BOX — helper canonico `buildFamilyLabelsForCompany`
// (ME-1.17.c — Conversa 5).
//
// Pre-resolve o label canonico de cada `JobFamily` para uma empresa,
// consumindo `companyRoleFamilySettings` (fonte canonica unica
// ME-1.17.a) e aplicando `getJobFamilyLabel` (resolver canonico unico
// ME-1.17.a). Resultado e um `Readonly<Record<JobFamily, string>>`
// serializavel server-safe, consumivel por qualquer superficie:
//
//   - Server routers (ex: `myData`, `employees` XLSX export) — chamam
//     direto e usam `labels[key]` inline.
//   - PDF templates (ex: `lgpdPortabilityTemplate`) — recebem o label
//     resolvido via campo `familyLabel` do Input.
//   - Pages Next.js — chamam no server scope e propagam o
//     `Record<JobFamily, string>` como prop para Client Components,
//     que fazem fallback canonico quando prop ausente.
//
// Backward-compat canonico: entradas que nao existem em
// `companyRoleFamilySettings` da empresa (ex: slot custom nao ativado
// pela empresa) caem no `JOB_FAMILY_LABELS[key]` padrao do resolver —
// o Record cobre as 26 chaves canonicas sempre.
//
// RV-13: callers canonicos (migrados em ME-1.17.c):
//   - `src/server/routers/myData.ts` (campo `familiaFuncao`).
//   - `src/server/routers/employees.ts` (XLSX export).
//   - `src/app/api/super-admin/lgpd/exportar/route.ts`.
//   - `src/app/api/portal/lgpd/portability/route.ts`.
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `page.tsx` (prop para o Client).
//   - `src/app/dashboard-individual/[id]/page.tsx` (prop para o
//     Client / Modal de Ficha).

import type { RoipDatabase } from '../../db/client';
import type { JobFamily } from '../../db/schema/enums';
import { JOB_FAMILY_VALUES } from '../../db/schema/enums';
import { listAllFamilySettingsForCompany } from '../../server/services/companyRoleFamilySettings';
import type { CompanyRoleFamilySettings } from '../../server/services/companyRoleFamilySettings';
import { getJobFamilyLabel } from './formatJobFamily';

/**
 * Tipo canonico serializavel do dicionario de labels de familia por
 * empresa. Chaves sao os 26 valores canonicos de `JOB_FAMILY_VALUES`
 * (6 canonicas + 20 slots custom). Valores sao strings resolvidas por
 * `getJobFamilyLabel` priorizando `nomeCustomizado` quando preenchido.
 */
export type FamilyLabelsByKey = Readonly<Record<JobFamily, string>>;

/**
 * Carrega todas as `companyRoleFamilySettings` ATIVAS e INATIVAS da
 * empresa + resolve o label canonico para cada uma das 26 chaves de
 * `JOB_FAMILY_VALUES`. O resultado cobre canonicas E slots custom
 * (slot inativo cai no placeholder canonico via `getJobFamilyLabel`).
 *
 * Idempotente e puro (nao escreve nada). Pode ser chamado em qualquer
 * server scope. Custo: 1 SELECT na tabela `companyRoleFamilySettings`
 * (indexado por `companyId` via UNIQUE `uq_crfs(companyId,
 * jobFamily)`). Resultado nao e cacheado — callers que precisarem de
 * cache aplicam em sua camada.
 */
export async function buildFamilyLabelsForCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<FamilyLabelsByKey> {
  const settings = await listAllFamilySettingsForCompany(db, companyId);
  const settingsByKey = new Map<JobFamily, CompanyRoleFamilySettings>();
  for (const s of settings) {
    settingsByKey.set(s.jobFamily, s);
  }
  const result = {} as Record<JobFamily, string>;
  for (const key of JOB_FAMILY_VALUES) {
    const setting = settingsByKey.get(key) ?? null;
    result[key] = getJobFamilyLabel(key, setting);
  }
  return result;
}
