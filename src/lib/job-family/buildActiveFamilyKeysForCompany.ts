// ROIP APP 9BOX — helper canonico `buildActiveFamilyKeysForCompany`
// (ME-1.17.c expansao CC079-1c-2+ — Conversa 5).
//
// Retorna a lista ORDENADA das chaves de familia ATIVAS da empresa
// — ou seja, apenas as que foram seedadas canonicamente E nao foram
// desativadas (ou que forem custom e foram ativadas pela empresa via
// UI de /familias no Despacho 2 futuro).
//
// Fonte canonica: `listActiveFamilySettingsForCompany` (filtro
// `ativo = true` + ORDER BY `ordem ASC, jobFamily ASC`).
//
// Pattern canonico de uso: toda superficie que exibe LISTA de
// familias para selecao (dropdowns de filtro, cards de edicao,
// legendas de dashboard) consome esta lista — nao `JOB_FAMILY_VALUES`
// cru, que inclui os 20 slots custom placeholder sempre.
//
// Backward-compat canonico: empresa sem seed (edge case defensivo,
// ex: empresa recem-criada antes do seed canonico rodar) → fallback
// bit-exact as 6 canonicas. Garante que a UI nunca mostra lista
// vazia e preserva comportamento pre-ME-1.17.
//
// RV-13: callers canonicos (migrados nesta expansao):
//   - `src/app/super-admin/empresa/[id]/todos-os-colaboradores/`
//     `page.tsx` → prop `activeFamilyKeys` do dropdown de filtro.
//   - `src/app/todos-os-colaboradores/page.tsx` (RH) → idem.
//   - `src/app/minha-equipe/page.tsx` (lider direto) → idem.

import type { RoipDatabase } from '../../db/client';
import type { JobFamily } from '../../db/schema/enums';
import { JOB_FAMILY_CANONICAL_VALUES } from '../../db/schema/enums';
import {
  listActiveFamilySettingsForCompany,
  type CompanyRoleFamilySettings,
} from '../../server/services/companyRoleFamilySettings';

/**
 * Tipo canonico serializavel: lista ordenada de chaves `JobFamily`
 * ATIVAS da empresa. Server-safe, consumivel como prop por Client
 * Components Next.js 15.
 */
export type ActiveFamilyKeys = readonly JobFamily[];

/**
 * Carrega as `companyRoleFamilySettings` ATIVAS da empresa (filtro
 * `ativo = true`) e retorna as chaves ordenadas canonicamente
 * (ORDER BY `ordem ASC, jobFamily ASC` — ja aplicado no service).
 *
 * Edge case defensivo: empresa sem NENHUMA setting ativa (ex:
 * recem-criada antes do seed canonico rodar) → retorna as 6
 * canonicas de `JOB_FAMILY_CANONICAL_VALUES` como fallback. Garante
 * que a UI canonica nunca mostra lista vazia.
 */
export async function buildActiveFamilyKeysForCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<ActiveFamilyKeys> {
  const settings: CompanyRoleFamilySettings[] = await listActiveFamilySettingsForCompany(
    db,
    companyId,
  );
  if (settings.length === 0) {
    return JOB_FAMILY_CANONICAL_VALUES;
  }
  return settings.map((s) => s.jobFamily);
}
