// ROIP APP 9BOX — motor deterministico de turnover (ME-045, §18.1).
//
// Motor puro §18.1 do DOC 03. Implementa as formulas canonicas §12.1:
//   - turnoverTrimestral =
//       (saidas no trimestre / headcount no inicio do trimestre) x 100
//   - turnoverAnualizado =
//       (saidas nos ultimos 12 meses /
//        headcount no inicio do periodo de 12 meses) x 100
//
// Populacao canonica (§12.2):
//   - Colaboradores comuns (`employees`) — C-levels EXCLUIDOS integralmente
//     (cLevelMembers fora da populacao por construcao — a query nem toca
//     essa tabela).
//   - Colaboradores comuns com `nivelHierarquico = 'estrategico'` entram
//     normalmente.
//
// Semantica canonica de `headcount(companyId, D)` — S141 aprovado:
//
//   headcount(companyId, D) =
//     employees comuns em `employees` com
//       companyId = X
//       dataAdmissao <= D
//       (status = 'ativo' hoje
//         OU existe termination com dataInativacao > D)
//
// Racional: sem log canonico de reativacao em ME-011 (ausente por design),
// esta aproximacao reconstroi corretamente o estado historico nos cenarios
// mais comuns (inclusive reativacao simples), errando apenas em janelas de
// inatividade intermediaria de multiplos ciclos de reativacao — cenario
// raro; sanavel em ME futura via log de reativacao sem quebrar contrato.
//
// Formato canonico do trimestre: `YYYY-Q[1-4]` (S142 — reuso do schema
// TRIMESTRE_INPUT_SCHEMA exportado em `quarterlyCalculation.ts` no router).
//
// Formato canonico do rolling 12 meses: janela FECHADA a esquerda e ABERTA
// a direita [anualizadoInicio, anualizadoFim), com `anualizadoFim` igual
// ao primeiro dia do trimestre seguinte (=`trimestreFim`) e
// `anualizadoInicio` = `anualizadoFim - 12 meses` (mesmo dia, ano-1).
//
// Sem SQL cru (RV-12); sem dead code (RV-13 — cada export tem chamador no
// router `turnover` da mesma ME); uma statement por linha (RV-14).

import { and, count, countDistinct, eq, gt, lte } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import type { Departamento, NivelHierarquico } from '../../db/schema';
import {
  DEPARTAMENTO_VALUES,
  MOTIVO_TERMINATION_VALUES,
  NIVEL_HIERARQUICO_VALUES,
  employeeTerminationEvents,
  employees,
} from '../../db/schema';

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/** Sumario canonico compartilhado (§12.4 abertura por motivo). */
export interface TurnoverSummary {
  taxaTrimestral: number;
  taxaAnualizada: number;
  totalSaidasTrimestre: number;
  totalHeadcountInicioTrimestre: number;
  totalSaidasAnualizado: number;
  totalHeadcountInicioAnualizado: number;
  aberturaPorMotivo: {
    voluntario: number;
    involuntario: number;
  };
}

/** Linha de abertura canonica por nivel hierarquico (§12.3 visao empresa). */
export interface TurnoverByNivelLine {
  nivel: NivelHierarquico;
  taxaTrimestral: number;
  saidasTrimestre: number;
  headcountInicioTrimestre: number;
  voluntario: number;
  involuntario: number;
}

/** Retorno canonico de `turnover.getByCompany` (§12.8 primeira linha). */
export interface TurnoverByCompanyResult extends TurnoverSummary {
  companyId: number;
  trimestre: string;
  aberturaPorNivel: TurnoverByNivelLine[];
}

/**
 * Retorno canonico de `turnover.getByDepartamento` (§12.8 segunda linha).
 * §12.3: SEM abertura por nivel hierarquico neste escopo.
 */
export interface TurnoverByDepartamentoResult extends TurnoverSummary {
  companyId: number;
  departamento: Departamento;
  trimestre: string;
}

/**
 * Intervalos canonicos derivados do trimestre — expostos porque os testes
 * e o proprio router asseriam esses limites verbatim (RV-13).
 */
export interface TurnoverBoundaries {
  trimestre: string;
  trimestreInicio: Date;
  trimestreFim: Date;
  anualizadoInicio: Date;
  anualizadoFim: Date;
}

// ============================================================
// Constantes canonicas
// ============================================================

/** Precisao canonica da taxa (percentual) — 2 casas na `Math.round`. */
export const TURNOVER_PRECISION_DECIMALS = 2 as const;

/**
 * Meses inclusos por trimestre canonico. `endExclusive` e o proximo mes
 * apos o trimestre (usado para computar `trimestreFim` como o primeiro
 * dia do mes seguinte ao termino — semantica de intervalo `[inicio, fim)`
 * canonica para agregacao SQL). Coincide com a convencao de negocio
 * (Q1 = jan/fev/mar, ..., Q4 = out/nov/dez).
 */
const MESES_POR_QUARTER: Record<
  'Q1' | 'Q2' | 'Q3' | 'Q4',
  { start: number; endExclusive: number }
> = {
  Q1: { start: 0, endExclusive: 3 },
  Q2: { start: 3, endExclusive: 6 },
  Q3: { start: 6, endExclusive: 9 },
  Q4: { start: 9, endExclusive: 12 },
};

// ============================================================
// Helpers canonicos
// ============================================================

/**
 * Deriva as fronteiras canonicas do trimestre. O `trimestre` DEVE bater o
 * regex `YYYY-Q[1-4]` (validado no router via TRIMESTRE_INPUT_SCHEMA); o
 * motor confia no formato validado a montante. Datas em UTC — coerentes
 * com `date`/`timestamp` do MySQL neste projeto (tabelas usam UTC).
 */
export function computeTurnoverBoundaries(trimestre: string): TurnoverBoundaries {
  const parts = trimestre.split('-');
  const ano = Number(parts[0]);
  const q = parts[1] as 'Q1' | 'Q2' | 'Q3' | 'Q4';
  const range = MESES_POR_QUARTER[q];
  const trimestreInicio = new Date(Date.UTC(ano, range.start, 1, 0, 0, 0, 0));
  const trimestreFim = new Date(Date.UTC(ano, range.endExclusive, 1, 0, 0, 0, 0));
  const anualizadoInicio = new Date(Date.UTC(ano - 1, range.endExclusive, 1, 0, 0, 0, 0));
  const anualizadoFim = trimestreFim;
  return {
    trimestre,
    trimestreInicio,
    trimestreFim,
    anualizadoInicio,
    anualizadoFim,
  };
}

/**
 * Arredonda a taxa canonica para 2 casas (retorna number puro; a
 * formatacao "7,1% (3 saidas de 42)" do §12.5 e responsabilidade da UI).
 * Divisao por zero → 0 (nao NaN, nao Infinity).
 */
export function computeTurnoverRate(saidas: number, headcount: number): number {
  if (headcount <= 0) {
    return 0;
  }
  const raw = (saidas / headcount) * 100;
  const factor = Math.pow(10, TURNOVER_PRECISION_DECIMALS);
  return Math.round(raw * factor) / factor;
}

/**
 * Headcount canonico S141 sobre um filtro fixo (companyId +
 * eventualmente departamento ou nivel). Consulta A: colaboradores comuns
 * com `dataAdmissao <= D` e `status = 'ativo'`. Consulta B: colaboradores
 * comuns com `dataAdmissao <= D`, `status = 'inativo'` E que possuam
 * termination futura (`dataInativacao > D`), via INNER JOIN com
 * countDistinct do employeeId (evita contar o mesmo empregado 2x se
 * possuir multiplas terminacoes na janela).
 *
 * A e B sao MUTUAMENTE EXCLUSIVOS (o status ancora): o total (A + B) e
 * exatamente o conjunto canonico definido em S141.
 */
async function headcountByFilter(
  db: RoipDatabase,
  companyId: number,
  referenceDate: Date,
  extraCondition?:
    { key: 'departamento'; value: Departamento } | { key: 'nivel'; value: NivelHierarquico },
): Promise<number> {
  const filtersA = [
    eq(employees.companyId, companyId),
    lte(employees.dataAdmissao, referenceDate),
    eq(employees.status, 'ativo'),
  ];
  if (extraCondition?.key === 'departamento') {
    filtersA.push(eq(employees.departamento, extraCondition.value));
  }
  if (extraCondition?.key === 'nivel') {
    filtersA.push(eq(employees.nivelHierarquico, extraCondition.value));
  }
  const rowsA = await db
    .select({ n: count() })
    .from(employees)
    .where(and(...filtersA));
  const contA = Number(rowsA[0]?.n ?? 0);

  const filtersB = [
    eq(employees.companyId, companyId),
    lte(employees.dataAdmissao, referenceDate),
    eq(employees.status, 'inativo'),
    gt(employeeTerminationEvents.dataInativacao, referenceDate),
  ];
  if (extraCondition?.key === 'departamento') {
    filtersB.push(eq(employees.departamento, extraCondition.value));
  }
  if (extraCondition?.key === 'nivel') {
    filtersB.push(eq(employees.nivelHierarquico, extraCondition.value));
  }
  const rowsB = await db
    .select({ n: countDistinct(employees.id) })
    .from(employees)
    .innerJoin(employeeTerminationEvents, eq(employeeTerminationEvents.employeeId, employees.id))
    .where(and(...filtersB));
  const contB = Number(rowsB[0]?.n ?? 0);

  return contA + contB;
}

/** Contagem de terminacoes numa janela `[from, to)` sob filtro opcional. */
async function terminationsWindow(
  db: RoipDatabase,
  companyId: number,
  from: Date,
  to: Date,
  filter?: { key: 'departamento'; value: Departamento } | { key: 'nivel'; value: NivelHierarquico },
): Promise<{ voluntario: number; involuntario: number; total: number }> {
  const conds = [
    eq(employeeTerminationEvents.companyId, companyId),
    lte(employeeTerminationEvents.dataInativacao, addMs(to, -1)),
    gt(employeeTerminationEvents.dataInativacao, addMs(from, -1)),
  ];
  if (filter?.key === 'departamento') {
    conds.push(eq(employeeTerminationEvents.departamentoSnapshot, filter.value));
  }
  if (filter?.key === 'nivel') {
    conds.push(eq(employeeTerminationEvents.nivelHierarquicoSnapshot, filter.value));
  }
  const rows = await db
    .select({
      motivo: employeeTerminationEvents.motivo,
      n: count(),
    })
    .from(employeeTerminationEvents)
    .where(and(...conds))
    .groupBy(employeeTerminationEvents.motivo);
  let voluntario = 0;
  let involuntario = 0;
  for (const r of rows) {
    if (r.motivo === 'voluntario') {
      voluntario = Number(r.n);
    }
    if (r.motivo === 'involuntario') {
      involuntario = Number(r.n);
    }
  }
  return { voluntario, involuntario, total: voluntario + involuntario };
}

/**
 * Ajuste de instante em milissegundos — usado para converter o intervalo
 * SQL `[from, to)` em `(from - 1ms, to - 1ms]`, casando com os
 * comparadores `gt`/`lte` sem depender de `between` (que e inclusivo em
 * ambos os lados). Preserva a semantica canonica de "saida no trimestre".
 */
function addMs(d: Date, delta: number): Date {
  return new Date(d.getTime() + delta);
}

// ============================================================
// Motor publico — visao empresa
// ============================================================

/**
 * §12.8 primeira linha — `turnover.getByCompany`. Calcula turnover
 * canonico da empresa para o trimestre, com abertura pelos 3 niveis
 * hierarquicos e por motivo. C-levels excluidos por construcao (nenhuma
 * query toca `cLevelMembers`).
 */
export async function computeTurnoverByCompany(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<TurnoverByCompanyResult> {
  const b = computeTurnoverBoundaries(trimestre);

  const totalSaidasTrimObj = await terminationsWindow(
    db,
    companyId,
    b.trimestreInicio,
    b.trimestreFim,
  );
  const totalSaidasAnualObj = await terminationsWindow(
    db,
    companyId,
    b.anualizadoInicio,
    b.anualizadoFim,
  );

  const totalHeadTrim = await headcountByFilter(db, companyId, b.trimestreInicio);
  const totalHeadAnual = await headcountByFilter(db, companyId, b.anualizadoInicio);

  const aberturaPorNivel: TurnoverByNivelLine[] = [];
  for (const nivel of NIVEL_HIERARQUICO_VALUES) {
    const saidas = await terminationsWindow(db, companyId, b.trimestreInicio, b.trimestreFim, {
      key: 'nivel',
      value: nivel,
    });
    const head = await headcountByFilter(db, companyId, b.trimestreInicio, {
      key: 'nivel',
      value: nivel,
    });
    aberturaPorNivel.push({
      nivel,
      taxaTrimestral: computeTurnoverRate(saidas.total, head),
      saidasTrimestre: saidas.total,
      headcountInicioTrimestre: head,
      voluntario: saidas.voluntario,
      involuntario: saidas.involuntario,
    });
  }

  return {
    companyId,
    trimestre,
    taxaTrimestral: computeTurnoverRate(totalSaidasTrimObj.total, totalHeadTrim),
    taxaAnualizada: computeTurnoverRate(totalSaidasAnualObj.total, totalHeadAnual),
    totalSaidasTrimestre: totalSaidasTrimObj.total,
    totalHeadcountInicioTrimestre: totalHeadTrim,
    totalSaidasAnualizado: totalSaidasAnualObj.total,
    totalHeadcountInicioAnualizado: totalHeadAnual,
    aberturaPorMotivo: {
      voluntario: totalSaidasTrimObj.voluntario,
      involuntario: totalSaidasTrimObj.involuntario,
    },
    aberturaPorNivel,
  };
}

// ============================================================
// Motor publico — visao departamento
// ============================================================

/**
 * §12.8 segunda linha — `turnover.getByDepartamento`. Calcula turnover
 * canonico do departamento no trimestre, sem abertura por nivel
 * hierarquico (§12.3). Ao inves de aceitar string arbitraria, exige um
 * dos 19 valores canonicos de `DEPARTAMENTO_VALUES` (validado no router
 * via Zod; o motor confia).
 */
export async function computeTurnoverByDepartamento(
  db: RoipDatabase,
  companyId: number,
  departamento: Departamento,
  trimestre: string,
): Promise<TurnoverByDepartamentoResult> {
  const b = computeTurnoverBoundaries(trimestre);

  const saidasTrim = await terminationsWindow(db, companyId, b.trimestreInicio, b.trimestreFim, {
    key: 'departamento',
    value: departamento,
  });
  const saidasAnual = await terminationsWindow(db, companyId, b.anualizadoInicio, b.anualizadoFim, {
    key: 'departamento',
    value: departamento,
  });

  const headTrim = await headcountByFilter(db, companyId, b.trimestreInicio, {
    key: 'departamento',
    value: departamento,
  });
  const headAnual = await headcountByFilter(db, companyId, b.anualizadoInicio, {
    key: 'departamento',
    value: departamento,
  });

  return {
    companyId,
    departamento,
    trimestre,
    taxaTrimestral: computeTurnoverRate(saidasTrim.total, headTrim),
    taxaAnualizada: computeTurnoverRate(saidasAnual.total, headAnual),
    totalSaidasTrimestre: saidasTrim.total,
    totalHeadcountInicioTrimestre: headTrim,
    totalSaidasAnualizado: saidasAnual.total,
    totalHeadcountInicioAnualizado: headAnual,
    aberturaPorMotivo: {
      voluntario: saidasTrim.voluntario,
      involuntario: saidasTrim.involuntario,
    },
  };
}

// ============================================================
// Sentinelas canonicas exportadas (RV-13)
// ============================================================

/**
 * Sentinela de teste — expoe as listas canonicas usadas internamente para
 * o teste asseriar RV-15 (contagens exatas) sem re-derivar valores.
 */
export const TURNOVER_ENGINE_SENTINELS = {
  nivelHierarquicoValues: NIVEL_HIERARQUICO_VALUES,
  departamentoValues: DEPARTAMENTO_VALUES,
  motivoValues: MOTIVO_TERMINATION_VALUES,
} as const;
