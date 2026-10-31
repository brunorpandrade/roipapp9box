// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/familias` (ME-075 + ME-1.17.2 expandida).
//
// Padrao S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, funcao auxiliar
// e loader vive neste `internals.ts` irmao.
//
// ME-1.17.2 — Despacho 2 da Conversa 5. Expansao para contemplar:
// (D1) Familias canonicas inativas aparecem no mesmo grid, com toggle
//      "Reativar". (D2) 20 slots custom nao aparecem como placeholders
//      — apenas as ativadas + um card "+ Nova família customizada".
// (D4) Nome editavel inline no cabecalho. (D5) Setas up/down.
// (D6) Guard de desativacao: bloqueado quando ha colaboradores.
// (D7) Save por familia preservado. (D8) Trava `lideranca_gestao`
//      100% canonica. (D9) Warning prospectivo sobre pesos vs ciclos.
//
// Fontes canonicas:
// - CAMADA_UI §13.1 Aba 2 (base ME-075).
// - CAMADA_DADOS §12.2 (`companyJobFamilies`).
// - CAMADA_DADOS ME-1.17.a (`companyRoleFamilySettings`).
// - CAMADA_NEGOCIO (6 canonicas + 20 slots custom, trava liderança).
//
// RV-12: Zero SQL cru. RV-13: todo export tem consumidor abaixo.
// RV-14: um statement por linha, 100 cols.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../../../../db/client';
import { companyJobFamilies } from '../../../../../db/schema';
import type { JobFamily } from '../../../../../db/schema';
import { JOB_FAMILY_CANONICAL_VALUES } from '../../../../../db/schema/enums';
import {
  listAllFamilySettingsForCompany,
  type CompanyRoleFamilySettings,
} from '../../../../../server/services/companyRoleFamilySettings';
import { getJobFamilyLabel } from '../../../../../lib/job-family/formatJobFamily';
import { countEmployeesByJobFamily } from '../../../../../lib/job-family/countEmployeesByJobFamily';

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact — 6 familias hard-coded (defaults)
// -----------------------------------------------------------------------

/**
 * As 6 familias canonicas bit-exact com defaults canonicos de nome,
 * unidade e peso de cada variavel. Preservado bit-exact da ME-075 para
 * nao quebrar nenhum teste existente.
 *
 * Familia 6 `lideranca_gestao` tem `estrutural:true` — no client os
 * inputs `variableName` e `unit` sao readonly. O server-side reforca
 * bit-exact via `saveJobFamilyAction` (nomes/unidades fixos).
 */
export const FAMILIAS_HARDCODED: readonly FamiliaHardcoded[] = [
  {
    jobFamily: 'vendas_comercial',
    label: 'Vendas e comercial',
    estrutural: false,
    defaults: [
      { variableIndex: 0, name: 'Receita gerada', unit: 'R$', weight: 25 },
      { variableIndex: 1, name: 'Negócios fechados', unit: 'unidades', weight: 25 },
      { variableIndex: 2, name: 'Leads convertidos', unit: 'unidades', weight: 25 },
      { variableIndex: 3, name: 'Ticket médio', unit: 'R$', weight: 25 },
    ],
  },
  {
    jobFamily: 'producao_operacoes',
    label: 'Produção e operações',
    estrutural: false,
    defaults: [
      { variableIndex: 0, name: 'Volume produzido', unit: 'unidades', weight: 25 },
      { variableIndex: 1, name: 'Entregas dentro do prazo', unit: 'unidades', weight: 25 },
      { variableIndex: 2, name: 'Itens aprovados sem retrabalho', unit: 'unidades', weight: 25 },
      { variableIndex: 3, name: 'Produtividade por hora', unit: 'unidades/hora', weight: 25 },
    ],
  },
  {
    jobFamily: 'tecnico_especialista',
    label: 'Técnico e especialista',
    estrutural: false,
    defaults: [
      { variableIndex: 0, name: 'Entregas concluídas', unit: 'unidades', weight: 25 },
      { variableIndex: 1, name: 'Entregas dentro do prazo', unit: 'unidades', weight: 25 },
      { variableIndex: 2, name: 'Entregas sem retrabalho', unit: 'unidades', weight: 25 },
      { variableIndex: 3, name: 'Demandas atendidas', unit: 'unidades', weight: 25 },
    ],
  },
  {
    jobFamily: 'administrativo_suporte',
    label: 'Administrativo e suporte',
    estrutural: false,
    defaults: [
      { variableIndex: 0, name: 'Processos concluídos', unit: 'unidades', weight: 25 },
      {
        variableIndex: 1,
        name: 'Processos entregues dentro do prazo',
        unit: 'unidades',
        weight: 25,
      },
      { variableIndex: 2, name: 'Processos sem erro', unit: 'unidades', weight: 25 },
      { variableIndex: 3, name: 'Demandas atendidas', unit: 'unidades', weight: 25 },
    ],
  },
  {
    jobFamily: 'atendimento_relacionamento',
    label: 'Atendimento e relacionamento',
    estrutural: false,
    defaults: [
      { variableIndex: 0, name: 'Atendimentos realizados', unit: 'unidades', weight: 25 },
      { variableIndex: 1, name: 'Atendimentos dentro do prazo', unit: 'unidades', weight: 25 },
      {
        variableIndex: 2,
        name: 'Atendimentos fechados sem reabertura',
        unit: 'unidades',
        weight: 25,
      },
      {
        variableIndex: 3,
        name: 'Atendimentos resolvidos no primeiro contato',
        unit: 'unidades',
        weight: 25,
      },
    ],
  },
  {
    jobFamily: 'lideranca_gestao',
    label: 'Liderança e gestão',
    estrutural: true,
    defaults: [
      { variableIndex: 0, name: 'Organização e produtividade', unit: 'pontos (1-5)', weight: 25 },
      {
        variableIndex: 1,
        name: 'Responsabilização pelos resultados',
        unit: 'pontos (1-5)',
        weight: 25,
      },
      { variableIndex: 2, name: 'Gestão da equipe', unit: 'pontos (1-5)', weight: 25 },
      { variableIndex: 3, name: 'Motivação e engajamento', unit: 'pontos (1-5)', weight: 25 },
    ],
  },
];

/** Indice canonico bit-exact da familia 6 em `FAMILIAS_HARDCODED`. */
export const LIDERANCA_GESTAO_INDEX = 5;

/**
 * ME-1.17.2 — defaults canonicos para familia custom recem-ativada:
 * 4 variaveis genericas, pesos 25% cada, editaveis no modal de
 * ativacao. Reforcado pelo service `activateCustomSlot` da ME-1.17.a.
 */
export const CUSTOM_FAMILY_VARIABLE_DEFAULTS: readonly VariableDefault[] = [
  { variableIndex: 0, name: 'Variável 1', unit: 'unidades', weight: 25 },
  { variableIndex: 1, name: 'Variável 2', unit: 'unidades', weight: 25 },
  { variableIndex: 2, name: 'Variável 3', unit: 'unidades', weight: 25 },
  { variableIndex: 3, name: 'Variável 4', unit: 'unidades', weight: 25 },
];

/** Tipo canonico bit-exact de uma familia hard-coded. */
export interface FamiliaHardcoded {
  readonly jobFamily: JobFamily;
  readonly label: string;
  readonly estrutural: boolean;
  readonly defaults: readonly VariableDefault[];
}

/** Tipo canonico bit-exact de uma variavel default. */
export interface VariableDefault {
  readonly variableIndex: number;
  readonly name: string;
  readonly unit: string;
  readonly weight: number;
}

// -----------------------------------------------------------------------
// Tipos canonicos bit-exact para o client (ME-1.17.2 expandidos)
// -----------------------------------------------------------------------

/**
 * Estado de UMA familia no client — expandido ME-1.17.2 com:
 * `ativo` (toggle), `nomeCustomizado` (edicao inline), `ordem` (setas
 * up/down), `isCustom` (slot custom vs canonica), `employeeCount`
 * (guard de desativacao D6), `displayLabel` (nome canonico OU
 * `nomeCustomizado` quando preenchido).
 */
export interface FamiliaState {
  readonly jobFamily: JobFamily;
  readonly label: string;
  readonly displayLabel: string;
  readonly estrutural: boolean;
  readonly isCustom: boolean;
  readonly ativo: boolean;
  readonly nomeCustomizado: string | null;
  readonly ordem: number;
  readonly employeeCount: number;
  readonly variables: ReadonlyArray<{
    readonly variableIndex: number;
    readonly variableName: string;
    readonly unit: string;
    readonly weight: number;
  }>;
}

/**
 * Payload canonico passado ao `FamiliasClient` como prop. Alem das
 * familias ja ativas e inativas (todas as 6 canonicas + custom
 * ativadas), expoe `nextAvailableCustomSlot` para o botao "+ Nova
 * familia customizada" saber qual slot alocar (ou null quando as 20
 * ja estao em uso).
 */
export interface FamiliasPageData {
  readonly families: readonly FamiliaState[];
  readonly nextAvailableCustomSlot: JobFamily | null;
  readonly customSlotsUsed: number;
  readonly customSlotsTotal: number;
}

// -----------------------------------------------------------------------
// Helpers puros
// -----------------------------------------------------------------------

/**
 * §pattern §2.1 canonico bit-exact — parser canonico bit-exact do param
 * de rota `[id]`. Replicado bit-exact do pattern da landing ME-074.
 */
export function parseCompanyIdParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * Carrega todas as variaveis de `companyJobFamilies` para uma empresa,
 * ordenadas canonicamente bit-exact por (jobFamily, variableIndex).
 * Preservado bit-exact da ME-075.
 */
export async function loadJobFamiliesForCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<
  Array<{
    jobFamily: JobFamily;
    variableIndex: number;
    variableName: string;
    unit: string;
    weight: string;
  }>
> {
  const rows = await db
    .select({
      jobFamily: companyJobFamilies.jobFamily,
      variableIndex: companyJobFamilies.variableIndex,
      variableName: companyJobFamilies.variableName,
      unit: companyJobFamilies.unit,
      weight: companyJobFamilies.weight,
    })
    .from(companyJobFamilies)
    .where(eq(companyJobFamilies.companyId, companyId));
  return rows;
}

/**
 * ME-1.17.2 — carga canonica consolidada da rota `/familias`.
 *
 * Combina em um unico shape canonico: settings da empresa
 * (`companyRoleFamilySettings` — ativo, nomeCustomizado, ordem),
 * variaveis persistidas (`companyJobFamilies`) e contagem de
 * colaboradores por familia. Retorna as familias ordenadas por
 * `ordem ASC` (setas up/down manipulam esse campo).
 *
 * Visibilidade canonica (D1 + D2):
 * - 6 canonicas SEMPRE aparecem (ativas E inativas).
 * - Slots custom aparecem APENAS se ja ativados (`settings` existe E
 *   `ativo = true` OR `nomeCustomizado !== null`). Slots nunca
 *   usados nao vazam para a UI — botao "+ Nova" aloca o proximo.
 */
export async function loadFamiliasPageData(
  db: RoipDatabase,
  companyId: number,
): Promise<FamiliasPageData> {
  const [settings, persisted, counts] = await Promise.all([
    listAllFamilySettingsForCompany(db, companyId),
    loadJobFamiliesForCompany(db, companyId),
    countEmployeesByJobFamily(db, companyId),
  ]);

  const settingsByKey = new Map<JobFamily, CompanyRoleFamilySettings>();
  for (const s of settings) {
    settingsByKey.set(s.jobFamily, s);
  }
  const persistedByKey = new Map<string, { name: string; unit: string; weight: number }>();
  for (const p of persisted) {
    const key = `${p.jobFamily}:${p.variableIndex}`;
    const w = Number(p.weight);
    persistedByKey.set(key, {
      name: p.variableName,
      unit: p.unit,
      weight: Number.isFinite(w) ? w : 0,
    });
  }

  const families: FamiliaState[] = [];

  // 6 canonicas sempre (D1: ativas E inativas visiveis).
  for (const canonical of FAMILIAS_HARDCODED) {
    const setting = settingsByKey.get(canonical.jobFamily) ?? null;
    const familia = buildFamiliaStateFromCanonical(
      canonical,
      setting,
      persistedByKey,
      counts[canonical.jobFamily],
    );
    families.push(familia);
  }

  // Slots custom ja ativados ou renomeados (D2: nao mostra placeholders).
  for (const s of settings) {
    if (isJobFamilyCanonical(s.jobFamily)) {
      continue;
    }
    const isActivated = s.ativo || s.nomeCustomizado !== null;
    if (!isActivated) {
      continue;
    }
    const familia = buildFamiliaStateFromCustom(s, persistedByKey, counts[s.jobFamily]);
    families.push(familia);
  }

  families.sort((a, b) => a.ordem - b.ordem);

  const nextAvailableCustomSlot = findNextAvailableCustomSlot(settingsByKey);
  const customSlotsUsed = countActivatedCustomSlots(settingsByKey);

  return {
    families,
    nextAvailableCustomSlot,
    customSlotsUsed,
    customSlotsTotal: 20,
  };
}

/** True quando `jobFamily` esta na lista das 6 canonicas. */
function isJobFamilyCanonical(key: JobFamily): boolean {
  return (JOB_FAMILY_CANONICAL_VALUES as readonly string[]).includes(key);
}

/** Soma dos pesos — ME-075 bit-exact. */
export function sumWeights(variables: ReadonlyArray<{ readonly weight: number }>): number {
  return variables.reduce((acc, v) => acc + v.weight, 0);
}

/** Predicado canonico bit-exact: familia pronta para salvar? ME-075. */
export function isFamiliaSavable(variables: ReadonlyArray<{ readonly weight: number }>): boolean {
  return Math.abs(sumWeights(variables) - 100) <= 0.01;
}

// -----------------------------------------------------------------------
// Internals (nao exportados)
// -----------------------------------------------------------------------

function buildFamiliaStateFromCanonical(
  canonical: FamiliaHardcoded,
  setting: CompanyRoleFamilySettings | null,
  persistedByKey: ReadonlyMap<string, { name: string; unit: string; weight: number }>,
  employeeCount: number,
): FamiliaState {
  const displayLabel = getJobFamilyLabel(canonical.jobFamily, setting);
  const ativo = setting === null ? true : setting.ativo;
  const nomeCustomizado = setting?.nomeCustomizado ?? null;
  const ordem = setting?.ordem ?? indexOfCanonical(canonical.jobFamily) + 1;
  const variables = canonical.defaults.map((def) => {
    const persistedVar = persistedByKey.get(`${canonical.jobFamily}:${def.variableIndex}`);
    if (persistedVar === undefined) {
      return {
        variableIndex: def.variableIndex,
        variableName: def.name,
        unit: def.unit,
        weight: def.weight,
      };
    }
    return {
      variableIndex: def.variableIndex,
      variableName: canonical.estrutural ? def.name : persistedVar.name,
      unit: canonical.estrutural ? def.unit : persistedVar.unit,
      weight: persistedVar.weight,
    };
  });
  return {
    jobFamily: canonical.jobFamily,
    label: canonical.label,
    displayLabel,
    estrutural: canonical.estrutural,
    isCustom: false,
    ativo,
    nomeCustomizado,
    ordem,
    employeeCount,
    variables,
  };
}

function buildFamiliaStateFromCustom(
  setting: CompanyRoleFamilySettings,
  persistedByKey: ReadonlyMap<string, { name: string; unit: string; weight: number }>,
  employeeCount: number,
): FamiliaState {
  const displayLabel = getJobFamilyLabel(setting.jobFamily, setting);
  const variables = CUSTOM_FAMILY_VARIABLE_DEFAULTS.map((def) => {
    const persistedVar = persistedByKey.get(`${setting.jobFamily}:${def.variableIndex}`);
    if (persistedVar === undefined) {
      return {
        variableIndex: def.variableIndex,
        variableName: def.name,
        unit: def.unit,
        weight: def.weight,
      };
    }
    return {
      variableIndex: def.variableIndex,
      variableName: persistedVar.name,
      unit: persistedVar.unit,
      weight: persistedVar.weight,
    };
  });
  return {
    jobFamily: setting.jobFamily,
    label: setting.nomeCustomizado ?? `Família customizada ${indexOfCustom(setting.jobFamily)}`,
    displayLabel,
    estrutural: false,
    isCustom: true,
    ativo: setting.ativo,
    nomeCustomizado: setting.nomeCustomizado,
    ordem: setting.ordem,
    employeeCount,
    variables,
  };
}

function indexOfCanonical(key: JobFamily): number {
  return FAMILIAS_HARDCODED.findIndex((f) => f.jobFamily === key);
}

function indexOfCustom(key: JobFamily): number {
  const match = /^custom(\d+)$/.exec(key);
  return match === null || match[1] === undefined ? 0 : Number(match[1]);
}

function findNextAvailableCustomSlot(
  settingsByKey: ReadonlyMap<JobFamily, CompanyRoleFamilySettings>,
): JobFamily | null {
  for (let i = 1; i <= 20; i++) {
    const key = `custom${i}` as JobFamily;
    const setting = settingsByKey.get(key);
    if (setting === undefined) {
      return key;
    }
    if (!setting.ativo && setting.nomeCustomizado === null) {
      return key;
    }
  }
  return null;
}

function countActivatedCustomSlots(
  settingsByKey: ReadonlyMap<JobFamily, CompanyRoleFamilySettings>,
): number {
  let n = 0;
  for (const [key, setting] of settingsByKey) {
    if (isJobFamilyCanonical(key)) {
      continue;
    }
    if (setting.ativo || setting.nomeCustomizado !== null) {
      n++;
    }
  }
  return n;
}

/**
 * Mantido para compatibilidade com testes da ME-075 — recebe apenas o
 * array persistido e devolve o estado inicial das 6 canonicas (ignora
 * novidades da ME-1.17.2). Novos consumidores devem usar
 * `loadFamiliasPageData`.
 */
export function buildInitialFamiliesState(
  persisted: ReadonlyArray<{
    jobFamily: JobFamily;
    variableIndex: number;
    variableName: string;
    unit: string;
    weight: string;
  }>,
): FamiliaState[] {
  const persistedMap = new Map<string, { name: string; unit: string; weight: number }>();
  for (const p of persisted) {
    const key = `${p.jobFamily}:${p.variableIndex}`;
    const w = Number(p.weight);
    persistedMap.set(key, {
      name: p.variableName,
      unit: p.unit,
      weight: Number.isFinite(w) ? w : 0,
    });
  }
  return FAMILIAS_HARDCODED.map((fh) =>
    buildFamiliaStateFromCanonical(fh, null, persistedMap, 0),
  ).map((f, idx) => ({ ...f, ordem: idx + 1 }));
}
