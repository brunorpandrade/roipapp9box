// ROIP APP 9BOX — leitura e gravacao do modal [Definir metas] (M1)
// (DOC 05 §13.7/§18.9; DOC 03 §3.2/§3.3/§3.9; DOC 02 matriz; ME-fila6 D3).
//
// Permissao (DOC 02): Bruno, RH puro e RH-Lider da empresa; Lider e C-level
// apenas para os proprios liderados diretos (vinculo ativo). Colaborador
// precisa estar ativo para gravar.
//
// Snapshot (DOC 03 §3.2): as 4 linhas de `employeeGoals` guardam nome,
// unidade, peso e meta. Nome e unidade vem do template-empresa quando as
// metas estao pendentes ou quando o usuario aplica o template atual; caso
// contrario preservam o snapshot vigente. Familia 6: meta forcada em 5.
// Sem recalculo retroativo (§3.9).
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  companyJobFamilies,
  employeeGoals,
  employeeLeaderHistory,
  employees,
} from '../../db/schema';
import type { JobFamily } from '../../db/schema';
import {
  META_FAMILIA_6,
  VARIAVEIS_POR_FAMILIA,
  validarMetas,
  type MetaRascunho,
} from '../../lib/shared/employeeGoalsForm';
import type { PlatformSession } from '../../lib/session/platformMenuContext';

const FAMILIA_6: JobFamily = 'lideranca_gestao';

/** Quem esta abrindo o modal. */
export type MetasViewer = { readonly kind: 'super_admin' } | PlatformSession;

/** Status exibido no selo da ficha (DOC 05 §13.4 Secao 6). */
export type MetasStatus = 'definidas' | 'pendentes';

/** Linha exibida no modal. */
export interface MetaLinha {
  readonly variableIndex: number;
  readonly variableName: string;
  readonly unit: string;
  readonly weight: string;
  readonly goal: string;
}

/** Dados do modal. */
export interface MetasModalData {
  readonly employeeId: number;
  readonly employeeName: string;
  readonly jobFamily: JobFamily;
  readonly familia6: boolean;
  readonly status: MetasStatus;
  readonly templateAusente: boolean;
  readonly templateAtualizado: boolean;
  readonly linhas: readonly MetaLinha[];
  readonly template: readonly MetaLinha[];
}

export type SalvarMetasResult =
  | { readonly ok: true; readonly status: MetasStatus }
  | { readonly ok: false; readonly message: string };

export const MSG_METAS_SEM_PERMISSAO =
  'Você não tem permissão para definir as metas deste colaborador.';
export const MSG_METAS_INVALIDAS = 'Revise os campos destacados antes de salvar.';
export const MSG_METAS_COLABORADOR_INATIVO =
  'Colaborador inativo — as metas não podem ser alteradas.';

async function carregarEmployee(db: RoipDatabase, companyId: number, employeeId: number) {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      jobFamily: employees.jobFamily,
      status: employees.status,
    })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Decide se o visualizador pode definir metas do colaborador. */
export async function canViewerDefineGoals(
  db: RoipDatabase,
  viewer: MetasViewer,
  companyId: number,
  employeeId: number,
): Promise<boolean> {
  if (viewer.kind === 'platform' && viewer.companyId !== companyId) {
    return false;
  }
  const emp = await carregarEmployee(db, companyId, employeeId);
  if (emp === null) {
    return false;
  }
  if (viewer.kind === 'super_admin' || viewer.role === 'rh' || viewer.role === 'rh_lider') {
    return true;
  }
  const vinculo =
    viewer.role === 'clevel'
      ? eq(employeeLeaderHistory.clevelId, viewer.userId)
      : eq(employeeLeaderHistory.liderId, viewer.userId);
  const links = await db
    .select({ id: employeeLeaderHistory.id })
    .from(employeeLeaderHistory)
    .where(
      and(
        eq(employeeLeaderHistory.employeeId, employeeId),
        isNull(employeeLeaderHistory.dataFim),
        vinculo,
      ),
    )
    .limit(1);
  return links.length > 0;
}

async function carregarTemplate(db: RoipDatabase, companyId: number, jobFamily: JobFamily) {
  return await db
    .select({
      variableIndex: companyJobFamilies.variableIndex,
      variableName: companyJobFamilies.variableName,
      unit: companyJobFamilies.unit,
      weight: companyJobFamilies.weight,
      updatedAt: companyJobFamilies.updatedAt,
    })
    .from(companyJobFamilies)
    .where(
      and(eq(companyJobFamilies.companyId, companyId), eq(companyJobFamilies.jobFamily, jobFamily)),
    )
    .orderBy(asc(companyJobFamilies.variableIndex));
}

async function carregarMetas(db: RoipDatabase, employeeId: number, jobFamily: JobFamily) {
  const rows = await db
    .select()
    .from(employeeGoals)
    .where(eq(employeeGoals.employeeId, employeeId))
    .orderBy(asc(employeeGoals.variableIndex));
  return rows.filter((r) => r.jobFamily === jobFamily);
}

/** Selo da ficha: 4 metas da familia atual = definidas. */
export async function loadMetasStatus(
  db: RoipDatabase,
  employeeId: number,
  jobFamily: JobFamily,
): Promise<MetasStatus> {
  const metas = await carregarMetas(db, employeeId, jobFamily);
  return metas.length === VARIAVEIS_POR_FAMILIA ? 'definidas' : 'pendentes';
}

function numeroTexto(v: string | number): string {
  return String(Number(v));
}

/** Dados do modal. `null` = sem permissao ou colaborador inexistente. */
export async function loadMetasModal(
  db: RoipDatabase,
  viewer: MetasViewer,
  companyId: number,
  employeeId: number,
): Promise<MetasModalData | null> {
  const permitido = await canViewerDefineGoals(db, viewer, companyId, employeeId);
  if (!permitido) {
    return null;
  }
  const emp = await carregarEmployee(db, companyId, employeeId);
  if (emp === null) {
    return null;
  }
  const template = await carregarTemplate(db, companyId, emp.jobFamily);
  const metas = await carregarMetas(db, employeeId, emp.jobFamily);
  const definidas = metas.length === VARIAVEIS_POR_FAMILIA;
  const templateLinhas: MetaLinha[] = template.map((t) => ({
    variableIndex: t.variableIndex,
    variableName: t.variableName,
    unit: t.unit,
    weight: numeroTexto(t.weight),
    goal: '',
  }));
  const metaPorIndice = new Map(metas.map((m) => [m.variableIndex, m]));
  const linhas: MetaLinha[] = definidas
    ? metas.map((m) => ({
        variableIndex: m.variableIndex,
        variableName: m.variableName,
        unit: m.unit,
        weight: numeroTexto(m.weight),
        goal: Number(m.weight) === 0 ? '' : numeroTexto(m.goal),
      }))
    : templateLinhas.map((t) => {
        const existente = metaPorIndice.get(t.variableIndex);
        return existente === undefined ? t : { ...t, goal: numeroTexto(existente.goal) };
      });
  const ultimaMeta = Math.max(0, ...metas.map((m) => (m.updatedAt ?? new Date(0)).getTime()));
  const ultimoTemplate = Math.max(0, ...template.map((t) => t.updatedAt.getTime()));
  const familia6 = emp.jobFamily === FAMILIA_6;
  return {
    employeeId: emp.id,
    employeeName: emp.name,
    jobFamily: emp.jobFamily,
    familia6,
    status: definidas ? 'definidas' : 'pendentes',
    templateAusente: template.length !== VARIAVEIS_POR_FAMILIA,
    templateAtualizado: definidas && ultimoTemplate > ultimaMeta,
    linhas: familia6 ? linhas.map((l) => ({ ...l, goal: String(META_FAMILIA_6) })) : linhas,
    template: templateLinhas,
  };
}

function updatedByDoViewer(viewer: MetasViewer): 'rh' | 'lider' | 'super_admin' {
  if (viewer.kind === 'super_admin') {
    return 'super_admin';
  }
  return viewer.role === 'rh' || viewer.role === 'rh_lider' ? 'rh' : 'lider';
}

/** Grava as 4 metas numa transacao. */
export async function salvarMetas(
  db: RoipDatabase,
  viewer: MetasViewer,
  companyId: number,
  employeeId: number,
  input: { readonly aplicarTemplate: boolean; readonly linhas: readonly MetaRascunho[] },
): Promise<SalvarMetasResult> {
  const permitido = await canViewerDefineGoals(db, viewer, companyId, employeeId);
  if (!permitido) {
    return { ok: false, message: MSG_METAS_SEM_PERMISSAO };
  }
  const emp = await carregarEmployee(db, companyId, employeeId);
  if (emp === null) {
    return { ok: false, message: MSG_METAS_SEM_PERMISSAO };
  }
  if (emp.status !== 'ativo') {
    return { ok: false, message: MSG_METAS_COLABORADOR_INATIVO };
  }
  const template = await carregarTemplate(db, companyId, emp.jobFamily);
  if (template.length !== VARIAVEIS_POR_FAMILIA) {
    return { ok: false, message: MSG_METAS_INVALIDAS };
  }
  const indicesTemplate = template.map((t) => t.variableIndex).join(',');
  const indicesInput = [...input.linhas]
    .map((l) => l.variableIndex)
    .sort((a, b) => a - b)
    .join(',');
  if (indicesTemplate !== indicesInput) {
    return { ok: false, message: MSG_METAS_INVALIDAS };
  }
  const familia6 = emp.jobFamily === FAMILIA_6;
  const validacao = validarMetas(input.linhas, familia6);
  if (!validacao.ok) {
    return { ok: false, message: MSG_METAS_INVALIDAS };
  }
  const metas = await carregarMetas(db, employeeId, emp.jobFamily);
  const usarSnapshot = !input.aplicarTemplate && metas.length === VARIAVEIS_POR_FAMILIA;
  const nomes = new Map(
    (usarSnapshot ? metas : template).map((v) => [
      v.variableIndex,
      { variableName: v.variableName, unit: v.unit },
    ]),
  );
  const updatedBy = updatedByDoViewer(viewer);
  await db.transaction(async (tx) => {
    for (const linha of validacao.data) {
      const nome = nomes.get(linha.variableIndex);
      if (nome === undefined) {
        throw new Error('salvarMetas: variavel sem nome resolvido');
      }
      const valores = {
        jobFamily: emp.jobFamily,
        variableName: nome.variableName,
        unit: nome.unit,
        weight: linha.weight.toFixed(2),
        goal: linha.goal.toFixed(2),
        updatedBy,
      };
      await tx
        .insert(employeeGoals)
        .values({ employeeId, variableIndex: linha.variableIndex, ...valores })
        .onDuplicateKeyUpdate({ set: valores });
    }
  });
  return { ok: true, status: 'definidas' };
}
