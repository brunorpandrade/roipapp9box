// ROIP APP 9BOX — helpers internos canonicos da rota Bruno
// `/super-admin/empresa/[id]/familias` (§13.1 Aba 2, ME-075).
//
// Padrao S366 CC068 canonizado desde ME-070: `page.tsx` do App Router
// Next 15 exporta APENAS o default. Todo helper, tipo, funcao auxiliar
// e loader vive neste `internals.ts` irmao.
//
// Origem canonica:
// - DOC 05 §13.1 Aba 2 (mockup `cadastro_empresa_v1.html` linhas 297-406).
// - DOC 01 §12.2 (`companyJobFamilies` — 6 familias × 4 variaveis).
// - DOC 01 §enums (JOB_FAMILY_VALUES — 6 valores hard-coded).
// - MASTER_ESCOPO_B8.md §2.1 + §3.2.
//
// **RV-13.** Todo export tem consumidor:
// - `parseCompanyIdParam`, `resolveDatabaseUrl` → `page.tsx`.
// - `loadJobFamiliesForCompany`, `buildInitialFamiliesState` → `page.tsx`.
// - `FAMILIAS_HARDCODED`, `LIDERANCA_GESTAO_INDEX` → `FamiliasClient.tsx`.
// - Tipos exportados consumidos por client + testes.
//
// **RV-12.** Zero SQL cru.
// **RV-14.** Um statement por linha, largura maxima 100 cols.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../../../../db/client';
import { companyJobFamilies } from '../../../../../db/schema';
import type { JobFamily } from '../../../../../db/schema';

// -----------------------------------------------------------------------
// Constantes canonicas bit-exact — 6 familias hard-coded
// -----------------------------------------------------------------------

/**
 * §DOC 05 §13.1 Aba 2 (mockup linha 347-352 canonico bit-exact) — as 6
 * familias hard-coded canonicas, com nomes-rotulo, flag estrutural e
 * defaults canonicos bit-exact para nome/unidade/peso de cada uma das
 * 4 variaveis.
 *
 * Familia 6 `lideranca_gestao` tem `estrutural:true` — no client os
 * inputs `variableName` e `unit` sao readonly. O server-side reforca
 * bit-exact (mesmo se um input malicioso enviar valores customizados,
 * o router aplica os hard-coded para essa familia — §router company.ts
 * proc `updateJobFamilies` etapa 5).
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
// Tipos canonicos bit-exact para o client
// -----------------------------------------------------------------------

/**
 * Estado de UMA familia no client — 4 variaveis com nome/unidade/peso
 * editaveis. `estrutural:true` (familia 6) mantem nome/unidade readonly
 * no client + reforcado server-side pelo router.
 */
export interface FamiliaState {
  readonly jobFamily: JobFamily;
  readonly label: string;
  readonly estrutural: boolean;
  readonly variables: ReadonlyArray<{
    readonly variableIndex: number;
    readonly variableName: string;
    readonly unit: string;
    readonly weight: number;
  }>;
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

/** §pattern §2.1 canonico bit-exact — URL do banco. */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url !== undefined && url.trim() !== '') {
    return url;
  }
  return 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
}

/**
 * Carrega todas as variaveis de `companyJobFamilies` para uma empresa,
 * ordenadas canonicamente bit-exact por (jobFamily, variableIndex).
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
 * Combina os defaults canonicos bit-exact do `FAMILIAS_HARDCODED` com o
 * que foi persistido em `companyJobFamilies` — se ha registro para
 * `(jobFamily, variableIndex)`, usa esse; senao, usa o default hard-coded.
 * Retorna 6 familias com 4 variaveis cada — canonico bit-exact.
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
    const weightNum = Number(p.weight);
    persistedMap.set(key, {
      name: p.variableName,
      unit: p.unit,
      weight: Number.isFinite(weightNum) ? weightNum : 0,
    });
  }
  return FAMILIAS_HARDCODED.map((fh) => ({
    jobFamily: fh.jobFamily,
    label: fh.label,
    estrutural: fh.estrutural,
    variables: fh.defaults.map((def) => {
      const persistedVar = persistedMap.get(`${fh.jobFamily}:${def.variableIndex}`);
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
        variableName: fh.estrutural ? def.name : persistedVar.name,
        unit: fh.estrutural ? def.unit : persistedVar.unit,
        weight: persistedVar.weight,
      };
    }),
  }));
}

/**
 * Soma canonica bit-exact dos pesos das 4 variaveis. Consumida pelo
 * client para validacao de UI (botao Salvar desabilitado se soma != 100).
 */
export function sumWeights(variables: ReadonlyArray<{ readonly weight: number }>): number {
  return variables.reduce((acc, v) => acc + v.weight, 0);
}

/**
 * Predicado canonico bit-exact para o client: familia esta pronta para
 * salvar? Soma dos pesos == 100 (tolerancia 0.01 igual ao router).
 */
export function isFamiliaSavable(variables: ReadonlyArray<{ readonly weight: number }>): boolean {
  return Math.abs(sumWeights(variables) - 100) <= 0.01;
}
