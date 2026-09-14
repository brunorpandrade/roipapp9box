// ROIP APP 9BOX — service canonico compartilhado de status mensal de
// lideres (ME-B9-fechamento CORR1 — RV-16 corrige S231-B' aprovada em
// bloco). Extrai bit-a-bit as duas funcoes canonicas antes locais ao
// router `monthlyData.ts §3.11` (`listDirectLedInMonth` +
// `computeStatusForLeader`) para permitir reuso pelo painel RH
// (`loadMesAtualClosureStatus`) — resolve D-B9F-CARD-LIDERES-DIVERGENTE
// (S235-A) canonicamente bit-a-bit sem duplicacao (RV-14).
//
// Origem canonica:
// - `computeStatusForLeader`: bit-a-bit ao codigo canonico que estava
//   em `src/server/routers/monthlyData.ts` linhas 1519-1618. Semantica
//   canonica agregada §3.11: para cada liderado, para cada variavel
//   canonica da `jobFamily` (via `companyJobFamilies`) COM peso!=0,
//   incrementa `totalRequired`; se `performanceVariableData` do mes
//   correspondente tem `demanda` E `executado` NOT NULL, incrementa
//   `totalFilled`. Categoriza em 3 estados: 'Preenchido', 'Parcial',
//   'Não preenchido'.
// - `listDirectLedInMonth`: ampliado na ME-fila2-seed (S260). Semantica
//   canonica temporal §3.11: liderado direto ativo em qualquer momento
//   do mes M. Substitui filtro por `employees.status='ativo'` (que
//   escondia retroativamente desligados) pelo predicado canonico
//   `activeInMonthWhere` de `src/lib/scope/activeInMonth.ts` (dataAdmissao
//   <= lastDay E NAO desligado antes de firstDay). Vinculo de lideranca
//   em `employeeLeaderHistory` continua filtrado em memoria por
//   dataInicio/dataFim vs firstDay/lastDay.
// - `STATUS_PREENCHIMENTO_VALUES` + `StatusPreenchimento`: bit-a-bit ao
//   que estava em `monthlyData.ts` linhas 143 e 169. Reexportados
//   deste service (nao duplicados) — router preserva bit-a-bit ao
//   re-exportar do service.
//
// **RV-12 canonica.** Zero SQL cru — Drizzle tipado.
// **RV-13 canonica.** Todo export tem consumidor real:
// - `STATUS_PREENCHIMENTO_VALUES` → `monthlyData.ts` router + testes.
// - `StatusPreenchimento` → `monthlyData.ts` router + `loadMesAtualClosureStatus`.
// - `listDirectLedInMonth` → `monthlyData.ts` router (2 procs) +
//   `loadMesAtualClosureStatus`.
// - `computeStatusForLeader` → `monthlyData.ts` router (2 procs) +
//   `loadMesAtualClosureStatus`.
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { and, eq, inArray } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import {
  companyJobFamilies,
  employeeLeaderHistory,
  employees,
  performanceData,
  performanceVariableData,
} from '../../db/schema';
import {
  activeInMonthWhere,
  monthBounds,
  resolveDesligadosPreviosIds,
} from '../../lib/scope/activeInMonth';

/** Enum canonico de statusPreenchimento (§3.11 — 3 estados). */
export const STATUS_PREENCHIMENTO_VALUES = ['Não preenchido', 'Parcial', 'Preenchido'] as const;

/** Estado de preenchimento canonico (§3.11). */
export type StatusPreenchimento = (typeof STATUS_PREENCHIMENTO_VALUES)[number];

/**
 * Lista IDs de liderados diretos ativos de um lider em um mes canonico.
 * Semantica canonica temporal §3.11: inclui vinculos cobertos por
 * qualquer momento do mes — `dataInicio <= lastDay AND (dataFim IS NULL
 * OR dataFim >= firstDay)`.
 *
 * @param liderTipo — canonicamente 'employee' para RH-Lider ou Lider
 * empregado; 'clevel' para C-level que tem liderados diretos.
 */
export async function listDirectLedInMonth(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  liderTipo: 'employee' | 'clevel',
  mes: string,
): Promise<number[]> {
  const bounds = monthBounds(mes);
  const desligadosPreviosIds = await resolveDesligadosPreviosIds(db, companyId, bounds.firstDay);

  const liderColumn =
    liderTipo === 'employee' ? employeeLeaderHistory.liderId : employeeLeaderHistory.clevelId;

  // Elegibilidade temporal §3.11 (S260): liderado eh elegivel no mes M
  // se admitido ate `bounds.lastDay` E NAO desligado antes de
  // `bounds.firstDay`. Substitui filtro por `employees.status='ativo'`
  // pre-ME-fila2-seed — que ocultava retroativamente liderados
  // desligados de meses passados em que estavam ativos e sob o lider.
  const rows = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      dataInicio: employeeLeaderHistory.dataInicio,
      dataFim: employeeLeaderHistory.dataFim,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(eq(liderColumn, liderId), activeInMonthWhere(companyId, bounds, desligadosPreviosIds)),
    );
  const seen = new Set<number>();
  const linksInRange: number[] = [];
  for (const r of rows) {
    // Vinculo de lideranca precisa cobrir o mes (S072):
    //   dataInicio <= lastDay  E  (dataFim IS NULL OU dataFim >= firstDay).
    if (r.dataInicio.getTime() > bounds.lastDay.getTime()) continue;
    if (r.dataFim !== null && r.dataFim.getTime() < bounds.firstDay.getTime()) continue;
    if (!seen.has(r.employeeId)) {
      seen.add(r.employeeId);
      linksInRange.push(r.employeeId);
    }
  }
  return linksInRange;
}

/**
 * Calcula o `statusPreenchimento` canonico §3.11 de um lider com uma
 * lista de liderados diretos no mes. Bit-a-bit ao helper canonico antes
 * local ao router `monthlyData.ts`.
 *
 * Semantica canonica agregada:
 * - Para cada liderado, para cada variavel canonica da `jobFamily`
 *   (via `companyJobFamilies`) COM peso!=0, incrementa `totalRequired`.
 * - Se existe `performanceVariableData` do mes correspondente com
 *   `demanda` E `executado` NOT NULL, incrementa `totalFilled`.
 * - `totalRequired === 0` → 'Não preenchido' (empresa sem variaveis).
 * - `totalFilled === 0` → 'Não preenchido'.
 * - `totalFilled === totalRequired` → 'Preenchido'.
 * - Caso contrario → 'Parcial'.
 */
export async function computeStatusForLeader(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  liderados: number[],
): Promise<StatusPreenchimento> {
  if (liderados.length === 0) {
    return 'Não preenchido';
  }

  const empRows = await db
    .select({ id: employees.id, jobFamily: employees.jobFamily })
    .from(employees)
    .where(inArray(employees.id, liderados));

  const familyCache = new Map<string, Array<{ variableIndex: number; weight: string }>>();
  async function getVars(family: string) {
    const cached = familyCache.get(family);
    if (cached) return cached;
    const rows = await db
      .select({
        variableIndex: companyJobFamilies.variableIndex,
        weight: companyJobFamilies.weight,
      })
      .from(companyJobFamilies)
      .where(
        and(
          eq(companyJobFamilies.companyId, companyId),
          eq(
            companyJobFamilies.jobFamily,
            family as (typeof companyJobFamilies.jobFamily.enumValues)[number],
          ),
        ),
      );
    const list = rows.map((r) => ({
      variableIndex: r.variableIndex,
      weight: r.weight,
    }));
    familyCache.set(family, list);
    return list;
  }

  const perfRows = await db
    .select({ id: performanceData.id, employeeId: performanceData.employeeId })
    .from(performanceData)
    .where(
      and(
        eq(performanceData.companyId, companyId),
        eq(performanceData.mes, mes),
        inArray(performanceData.employeeId, liderados),
      ),
    );
  const perfByEmp = new Map<number, number>();
  for (const p of perfRows) {
    perfByEmp.set(p.employeeId, p.id);
  }
  const perfIds = Array.from(perfByEmp.values());
  const filledByPerf = new Map<number, Set<number>>();
  if (perfIds.length > 0) {
    const varRows = await db
      .select({
        performanceDataId: performanceVariableData.performanceDataId,
        variableIndex: performanceVariableData.variableIndex,
        demanda: performanceVariableData.demanda,
        executado: performanceVariableData.executado,
      })
      .from(performanceVariableData)
      .where(inArray(performanceVariableData.performanceDataId, perfIds));
    for (const v of varRows) {
      if (v.demanda === null || v.executado === null) continue;
      let inner = filledByPerf.get(v.performanceDataId);
      if (!inner) {
        inner = new Set();
        filledByPerf.set(v.performanceDataId, inner);
      }
      inner.add(v.variableIndex);
    }
  }

  let totalRequired = 0;
  let totalFilled = 0;
  for (const emp of empRows) {
    const vars = await getVars(emp.jobFamily);
    const perfId = perfByEmp.get(emp.id);
    const filled: Set<number> =
      perfId !== undefined ? (filledByPerf.get(perfId) ?? new Set<number>()) : new Set<number>();
    for (const v of vars) {
      if (Number(v.weight) === 0) continue;
      totalRequired += 1;
      if (filled.has(v.variableIndex)) {
        totalFilled += 1;
      }
    }
  }

  if (totalRequired === 0) return 'Não preenchido';
  if (totalFilled === 0) return 'Não preenchido';
  if (totalFilled === totalRequired) return 'Preenchido';
  return 'Parcial';
}
