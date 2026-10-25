// ROIP APP 9BOX — service `companyRoleFamilySettings` (ME-1.17,
// Conversa 5 — Famílias de função 100% customizáveis).
//
// Repositorio tipado da tabela `companyRoleFamilySettings` (DOC 01
// §12.3 — ME-1.17). Cada linha declara UMA familia de uma empresa
// (nome customizado, ativo, ordem); a chave UNIQUE (`companyId`,
// `jobFamily`) garante que cada familia aparece no maximo uma vez
// por empresa.
//
// Decisao executiva de Bruno em 24/10/2026:
//   - 6 canonicas pre-populadas via seed na migration 0012.
//   - 20 slots `custom1..custom20` reservados como capacidade.
//   - Trava absoluta de `lideranca_gestao`: nunca desativavel, nome
//     fixo (`nomeCustomizado` ignorado — SEMPRE NULL), ordem
//     editavel apenas via reordenacao canonica geral.
//   - Toda operacao de escrita que violar a trava retorna erro de
//     aplicacao canonico `FAMILY_SETTINGS_LOCKED`.
//
// RV-12: 100% Drizzle tipado. Zero SQL cru.
// RV-13: toda funcao exportada tem chamador real (service novo —
// callers em `rpc.company.familias` + `page.tsx` da rota
// `/super-admin/empresa/[id]/familias` + resolver + validacoes
// server-side de cadastro de colaborador, Despacho 1.b da ME-1.17).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companyRoleFamilySettings } from '../../db/schema';
import type { JobFamily, JobFamilyCustom } from '../../db/schema';
import {
  JOB_FAMILY_CANONICAL_VALUES,
  JOB_FAMILY_CUSTOM_VALUES,
  isJobFamilyCustom,
  isJobFamilyStructural,
} from '../../db/schema';

import { type JobFamilyVariableInput, upsertJobFamilyVariables } from './companyJobFamilies';

/**
 * Formato canonico de uma linha da tabela
 * `companyRoleFamilySettings` lida do banco.
 */
export type CompanyRoleFamilySettings = typeof companyRoleFamilySettings.$inferSelect;

/**
 * Patch canonico aceito por `updateFamilySettings`. Todos os campos
 * sao opcionais; apenas os presentes sao atualizados. Tipo interno
 * do service — nao exportado para evitar duplicacao externa (callers
 * passam objeto literal com os campos a atualizar).
 */
interface FamilySettingsPatch {
  nomeCustomizado?: string | null;
  ativo?: boolean;
  ordem?: number;
}

/**
 * Codigos canonicos de erro de aplicacao do service. Consumidos pelo
 * router tRPC para mapear erro de aplicacao → status HTTP 400 com
 * mensagem canonica, e pelos testes de integracao para asserts.
 */
export const FAMILY_SETTINGS_ERROR_CODES = {
  LOCKED_STRUCTURAL: 'FAMILY_SETTINGS_LOCKED_STRUCTURAL',
  NO_FREE_CUSTOM_SLOT: 'FAMILY_SETTINGS_NO_FREE_CUSTOM_SLOT',
  INVALID_NOME_CUSTOMIZADO: 'FAMILY_SETTINGS_INVALID_NOME_CUSTOMIZADO',
  SETTINGS_NOT_FOUND: 'FAMILY_SETTINGS_NOT_FOUND',
} as const;

/**
 * Union canonica dos valores de `FAMILY_SETTINGS_ERROR_CODES`. Tipo
 * interno do service — nao exportado para evitar duplicacao externa
 * (callers consomem `FamilySettingsError.code` com narrowing via
 * comparacao com as constantes de `FAMILY_SETTINGS_ERROR_CODES`).
 */
type FamilySettingsErrorCode =
  (typeof FAMILY_SETTINGS_ERROR_CODES)[keyof typeof FAMILY_SETTINGS_ERROR_CODES];

/**
 * Erro de aplicacao canonico lancado pelo service quando uma
 * operacao de escrita viola uma regra canonica (trava estrutural,
 * ausencia de slot livre, nome invalido, settings nao encontrada).
 */
export class FamilySettingsError extends Error {
  readonly code: FamilySettingsErrorCode;

  constructor(code: FamilySettingsErrorCode, message: string) {
    super(message);
    this.name = 'FamilySettingsError';
    this.code = code;
  }
}

/**
 * Payload canonico das 4 variaveis default de uma familia custom
 * recem-ativada (ME-1.17). Nomes `Variável 1..4` em pt-BR (SA
 * renomeia livremente apos), unidade vazia (SA preenche), peso 25%
 * cada (soma 100 — contrato canonico). Consumido inline em
 * `activateCustomSlot` via `upsertJobFamilyVariables` canonico do
 * service `companyJobFamilies`. Constante privada — nao exportada.
 */
const DEFAULT_CUSTOM_VARIABLES: readonly JobFamilyVariableInput[] = [
  { variableIndex: 1, variableName: 'Variável 1', unit: '', weight: 25 },
  { variableIndex: 2, variableName: 'Variável 2', unit: '', weight: 25 },
  { variableIndex: 3, variableName: 'Variável 3', unit: '', weight: 25 },
  { variableIndex: 4, variableName: 'Variável 4', unit: '', weight: 25 },
];

// =====================================================================
// LEITURAS
// =====================================================================

/**
 * Lista TODAS as settings da empresa (ativas e inativas), ordenadas
 * por `ordem` crescente, com desempate por `jobFamily` para
 * determinismo bit-exact.
 *
 * Consumida pela UI de `/super-admin/empresa/[id]/familias` para
 * renderizar o estado completo (cards de canonicas + custom ativas).
 */
export async function listAllFamilySettingsForCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyRoleFamilySettings[]> {
  return await db
    .select()
    .from(companyRoleFamilySettings)
    .where(eq(companyRoleFamilySettings.companyId, companyId))
    .orderBy(asc(companyRoleFamilySettings.ordem), asc(companyRoleFamilySettings.jobFamily));
}

/**
 * Lista apenas as settings ATIVAS da empresa, ordenadas por `ordem`.
 *
 * Consumida pelo cadastro de colaborador (dropdown de familia) e por
 * toda superficie que exibe apenas familias disponiveis (PDFs,
 * dashboards, exportaveis). Dropdown canonico = resultado desta
 * query mapeado via `getJobFamilyLabel(familyKey, settings)`.
 */
export async function listActiveFamilySettingsForCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<CompanyRoleFamilySettings[]> {
  return await db
    .select()
    .from(companyRoleFamilySettings)
    .where(
      and(
        eq(companyRoleFamilySettings.companyId, companyId),
        eq(companyRoleFamilySettings.ativo, true),
      ),
    )
    .orderBy(asc(companyRoleFamilySettings.ordem), asc(companyRoleFamilySettings.jobFamily));
}

/**
 * Retorna a setting de uma familia especifica de uma empresa, ou
 * null quando nao existe. Consumida por validacoes server-side e
 * pelo resolver canonico `getJobFamilyLabel`.
 */
export async function getFamilySettings(
  db: RoipDatabase,
  companyId: number,
  jobFamily: JobFamily,
): Promise<CompanyRoleFamilySettings | null> {
  const rows = await db
    .select()
    .from(companyRoleFamilySettings)
    .where(
      and(
        eq(companyRoleFamilySettings.companyId, companyId),
        eq(companyRoleFamilySettings.jobFamily, jobFamily),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// =====================================================================
// SEED CANONICO IDEMPOTENTE
// =====================================================================

/**
 * Insere as 6 settings canonicas pre-populadas (seed universal) para
 * uma empresa. Idempotente: segunda execucao e no-op pela clausula
 * `.onDuplicateKeyUpdate` que mantem valores existentes.
 *
 * Chamada canonica:
 *   - pela migration 0012 em bulk (SQL direto) para empresas ja
 *     existentes antes da ME-1.17.
 *   - pelo service `createCompany` imediatamente apos criar uma
 *     empresa nova (debito futuro F-SEED-CRIAR-EMPRESA; nao coberto
 *     nesta sub-ME 1.17.a).
 *
 * Nao executa seed de variaveis canonicas em `companyJobFamilies`;
 * essa responsabilidade canonica permanece com o seeder canonico
 * de ME-010 (service `companies` fluxo `createCompany`).
 */
export async function seedCanonicalFamilySettingsForCompany(
  db: RoipDatabase,
  companyId: number,
  updatedBy: number,
): Promise<void> {
  let ordemCanonica = 0;
  for (const familyKey of JOB_FAMILY_CANONICAL_VALUES) {
    ordemCanonica += 1;
    await db
      .insert(companyRoleFamilySettings)
      .values({
        companyId,
        jobFamily: familyKey,
        nomeCustomizado: null,
        ativo: true,
        ordem: ordemCanonica,
        updatedBy,
      })
      .onDuplicateKeyUpdate({
        set: {
          updatedBy,
        },
      });
  }
}

// =====================================================================
// ESCRITAS COM GUARDS DE TRAVA
// =====================================================================

/**
 * Valida o payload canonico de nome customizado. Aceita:
 *   - null (reseta para o label canonico de JOB_FAMILY_LABELS).
 *   - string nao-vazia com no maximo 100 caracteres (contrato da
 *     coluna VARCHAR(100) no banco).
 *
 * Rejeita string vazia ou somente-espacos — `null` e o canal canonico
 * para "sem customizacao". Rejeita acima de 100 chars — a coluna
 * truncaria silenciosamente.
 */
function assertValidNomeCustomizado(value: string | null): void {
  if (value === null) return;
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.INVALID_NOME_CUSTOMIZADO,
      'nomeCustomizado nao pode ser string vazia (use null para resetar).',
    );
  }
  if (value.length > 100) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.INVALID_NOME_CUSTOMIZADO,
      `nomeCustomizado com ${value.length} chars excede o maximo canonico de 100.`,
    );
  }
}

/**
 * Atualiza a setting canonica de uma familia (nome, ativo, ordem).
 * Aplica trava absoluta canonica para `lideranca_gestao` (RV-09 §13):
 *   - `ativo` nao pode ser alterado (sempre TRUE).
 *   - `nomeCustomizado` nao pode ser alterado (sempre NULL).
 *   - `ordem` pode ser alterada livremente (familia estrutural pode
 *     ser reordenada mas nunca desativada nem renomeada).
 *
 * Qualquer violacao da trava retorna `FamilySettingsError` com
 * codigo `LOCKED_STRUCTURAL`.
 *
 * Tentativa de atualizar settings inexistente retorna
 * `SETTINGS_NOT_FOUND` (empresa precisa ter o seed canonico das 6
 * canonicas antes de qualquer edicao).
 */
export async function updateFamilySettings(
  db: RoipDatabase,
  companyId: number,
  jobFamily: JobFamily,
  patch: FamilySettingsPatch,
  updatedBy: number,
): Promise<CompanyRoleFamilySettings> {
  const current = await getFamilySettings(db, companyId, jobFamily);
  if (current === null) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.SETTINGS_NOT_FOUND,
      `Settings nao encontradas para companyId=${companyId} jobFamily=${jobFamily}.`,
    );
  }

  if (isJobFamilyStructural(jobFamily)) {
    if (patch.ativo !== undefined && patch.ativo !== true) {
      throw new FamilySettingsError(
        FAMILY_SETTINGS_ERROR_CODES.LOCKED_STRUCTURAL,
        'Familia estrutural `lideranca_gestao` nao pode ser desativada.',
      );
    }
    if (patch.nomeCustomizado !== undefined && patch.nomeCustomizado !== null) {
      throw new FamilySettingsError(
        FAMILY_SETTINGS_ERROR_CODES.LOCKED_STRUCTURAL,
        'Familia estrutural `lideranca_gestao` nao pode ser renomeada.',
      );
    }
  }

  if (patch.nomeCustomizado !== undefined) {
    assertValidNomeCustomizado(patch.nomeCustomizado);
  }

  if (patch.ordem !== undefined && (!Number.isInteger(patch.ordem) || patch.ordem < 1)) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.INVALID_NOME_CUSTOMIZADO,
      `ordem invalida: ${patch.ordem} — minimo canonico 1.`,
    );
  }

  const updates: Partial<typeof companyRoleFamilySettings.$inferInsert> = { updatedBy };
  if (patch.nomeCustomizado !== undefined) {
    updates.nomeCustomizado = patch.nomeCustomizado;
  }
  if (patch.ativo !== undefined) {
    updates.ativo = patch.ativo;
  }
  if (patch.ordem !== undefined) {
    updates.ordem = patch.ordem;
  }

  await db
    .update(companyRoleFamilySettings)
    .set(updates)
    .where(
      and(
        eq(companyRoleFamilySettings.companyId, companyId),
        eq(companyRoleFamilySettings.jobFamily, jobFamily),
      ),
    );

  const refreshed = await getFamilySettings(db, companyId, jobFamily);
  if (refreshed === null) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.SETTINGS_NOT_FOUND,
      'Settings desapareceram apos UPDATE (estado inconsistente).',
    );
  }
  return refreshed;
}

/**
 * Ativa o primeiro slot `customN` livre da empresa com o nome
 * recebido. "Livre" = sem linha na tabela OU com `ativo=FALSE`.
 *
 * Semantica canonica canonizada em 24/10/2026:
 *   - Ocupacao ascendente (`custom1` → `custom20`): primeiro slot
 *     sem linha ou com `ativo=FALSE` e escolhido.
 *   - `ordem` canonica = max(ordem atual) + 1 (append-only; UI pode
 *     reordenar depois).
 *   - Apos ativacao, chama `seedDefaultCustomVariables` em
 *     `companyJobFamilies` para popular as 4 variaveis canonicas
 *     (`Variável 1..4`, unidade vazia, peso 25% cada).
 *
 * Retorna o `jobFamily` escolhido (ex: `'custom3'`) para que o
 * caller atualize UI/estado derivado.
 *
 * Lanca `FamilySettingsError` com `NO_FREE_CUSTOM_SLOT` quando os 20
 * slots estao ativos.
 */
export async function activateCustomSlot(
  db: RoipDatabase,
  companyId: number,
  nomeCustomizado: string,
  updatedBy: number,
): Promise<JobFamilyCustom> {
  assertValidNomeCustomizado(nomeCustomizado);

  const all = await listAllFamilySettingsForCompany(db, companyId);
  const occupiedActive = new Set<string>();
  const inactiveBySlot = new Map<string, CompanyRoleFamilySettings>();
  let maxOrdem = 0;
  for (const row of all) {
    if (row.ordem > maxOrdem) maxOrdem = row.ordem;
    if (!isJobFamilyCustom(row.jobFamily)) continue;
    if (row.ativo) {
      occupiedActive.add(row.jobFamily);
    } else {
      inactiveBySlot.set(row.jobFamily, row);
    }
  }

  let chosen: JobFamilyCustom | null = null;
  for (const slot of JOB_FAMILY_CUSTOM_VALUES) {
    if (occupiedActive.has(slot)) continue;
    chosen = slot;
    break;
  }
  if (chosen === null) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.NO_FREE_CUSTOM_SLOT,
      `Nenhum slot custom livre: todos os 20 estao ativos na empresa ${companyId}.`,
    );
  }

  const novaOrdem = maxOrdem + 1;
  const preExisting = inactiveBySlot.get(chosen);

  if (preExisting) {
    await db
      .update(companyRoleFamilySettings)
      .set({
        nomeCustomizado,
        ativo: true,
        ordem: novaOrdem,
        updatedBy,
      })
      .where(
        and(
          eq(companyRoleFamilySettings.companyId, companyId),
          eq(companyRoleFamilySettings.jobFamily, chosen),
        ),
      );
  } else {
    await db.insert(companyRoleFamilySettings).values({
      companyId,
      jobFamily: chosen,
      nomeCustomizado,
      ativo: true,
      ordem: novaOrdem,
      updatedBy,
    });
  }

  await upsertJobFamilyVariables(db, companyId, chosen, [...DEFAULT_CUSTOM_VARIABLES], updatedBy);

  return chosen;
}

/**
 * Desativa um slot custom existente (`ativo = FALSE`). Preserva a
 * linha e `nomeCustomizado` para historico; UI pode re-ativar depois
 * (chamando `activateCustomSlot` com novo nome, ou reatacar via
 * `updateFamilySettings({ ativo: true })`).
 *
 * Rejeita tentativa de desativar canonica — para desativar canonica,
 * caller usa `updateFamilySettings(... , { ativo: false })` que ja
 * aplica a trava absoluta de `lideranca_gestao` e permite desativar
 * as outras 5.
 *
 * Rejeita tentativa de desativar `lideranca_gestao` via trava
 * absoluta (mesmo mecanismo que `updateFamilySettings`).
 */
export async function deactivateCustomSlot(
  db: RoipDatabase,
  companyId: number,
  jobFamily: JobFamilyCustom,
  updatedBy: number,
): Promise<void> {
  if (!isJobFamilyCustom(jobFamily)) {
    throw new FamilySettingsError(
      FAMILY_SETTINGS_ERROR_CODES.LOCKED_STRUCTURAL,
      `jobFamily=${jobFamily} nao e um slot custom (use updateFamilySettings).`,
    );
  }
  await updateFamilySettings(db, companyId, jobFamily, { ativo: false }, updatedBy);
}

/**
 * Helper puro consumido por testes e por codigo defensivo. `true`
 * quando a setting esta ativa (familia aparece em dropdowns).
 */
export function isSettingActive(settings: CompanyRoleFamilySettings | null): boolean {
  if (settings === null) return false;
  return settings.ativo === true;
}
