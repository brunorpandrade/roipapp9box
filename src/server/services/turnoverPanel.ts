// ROIP APP 9BOX — dados da pagina e do card de turnover (especificacao
// "Turnover e desligamento" §5 e §6, ME-fila6 D2).
//
// - Card: taxa trimestral total do ultimo trimestre fechado.
// - Pagina: navegacao entre trimestres fechados; totais e divisao por
//   voluntario/involuntario; card rolling 12 meses (taxa anualizada DOC 03
//   §12.1 do trimestre fechado mais recente — mesmo numero dos 3
//   exportaveis).
// - Drill-down nominal por motivo (quem pode ver e decidido no consumidor:
//   Bruno e RH).
//
// Formulas e janelas vem de `turnoverEngine` (DOC 03 §12). C-levels fora
// da populacao por construcao.
//
// **RV-12.** Drizzle tipado. **RV-14.** 100 colunas.

import { and, asc, eq, gte, lt } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeTerminationEvents, employees } from '../../db/schema';
import type { MotivoTermination, NivelHierarquico } from '../../db/schema';
import type { FormularioDesligamento } from '../../lib/shared/terminationForms';

import { listClosedQuarters } from './closedQuarters';
import { loadTerminationFormsByEventIds } from './terminationForms';
import {
  computeTurnoverBoundaries,
  computeTurnoverByCompany,
  computeTurnoverRate,
} from './turnoverEngine';

/** Taxa com numeros absolutos (formato DOC 03 §12.5). */
export interface TurnoverTaxa {
  readonly taxa: number;
  readonly saidas: number;
  readonly headcount: number;
}

/** Card dos paineis. `null` = nenhum trimestre fechado. */
export interface TurnoverCardData extends TurnoverTaxa {
  readonly trimestre: string;
  readonly label: string;
}

/** Resumo de um trimestre fechado. */
interface TurnoverTrimestreResumo {
  readonly trimestre: string;
  readonly label: string;
  readonly total: TurnoverTaxa;
  readonly voluntario: TurnoverTaxa;
  readonly involuntario: TurnoverTaxa;
}

/** Dados da pagina. `trimestre` nulo = nenhum trimestre fechado. */
export interface TurnoverPageData {
  readonly trimestresFechados: readonly ClosedQuarterItem[];
  readonly resumo: TurnoverTrimestreResumo | null;
  readonly rolling12m: (TurnoverTaxa & { readonly trimestreReferencia: string }) | null;
  readonly trimestreAnterior: string | null;
  readonly trimestreSeguinte: string | null;
}

/** Linha do drill-down nominal. */
export interface TurnoverDrilldownRow {
  readonly terminationEventId: number;
  readonly employeeId: number;
  readonly name: string;
  readonly departamento: string;
  readonly nivelHierarquico: NivelHierarquico;
  readonly dataInativacao: Date;
  readonly formulario: FormularioDesligamento | null;
}

type ClosedQuarterItem = Awaited<ReturnType<typeof listClosedQuarters>>[number];

async function resumoDoTrimestre(
  db: RoipDatabase,
  companyId: number,
  item: ClosedQuarterItem,
): Promise<{ resumo: TurnoverTrimestreResumo; anualizado: TurnoverTaxa }> {
  const r = await computeTurnoverByCompany(db, companyId, item.trimestre);
  const head = r.totalHeadcountInicioTrimestre;
  const vol = r.aberturaPorMotivo.voluntario;
  const inv = r.aberturaPorMotivo.involuntario;
  return {
    resumo: {
      trimestre: item.trimestre,
      label: item.label,
      total: { taxa: r.taxaTrimestral, saidas: r.totalSaidasTrimestre, headcount: head },
      voluntario: { taxa: computeTurnoverRate(vol, head), saidas: vol, headcount: head },
      involuntario: { taxa: computeTurnoverRate(inv, head), saidas: inv, headcount: head },
    },
    anualizado: {
      taxa: r.taxaAnualizada,
      saidas: r.totalSaidasAnualizado,
      headcount: r.totalHeadcountInicioAnualizado,
    },
  };
}

/** Card "Turnover" dos paineis de Bruno, RH e C-level com acesso total. */
export async function loadTurnoverCard(
  db: RoipDatabase,
  companyId: number,
): Promise<TurnoverCardData | null> {
  const fechados = await listClosedQuarters(db, companyId);
  const ultimo = fechados[0];
  if (ultimo === undefined) {
    return null;
  }
  const { resumo } = await resumoDoTrimestre(db, companyId, ultimo);
  return { trimestre: ultimo.trimestre, label: ultimo.label, ...resumo.total };
}

/**
 * Dados da pagina. `trimestrePedido` fora da lista de fechados cai no mais
 * recente (URL manipulada nao abre trimestre em andamento).
 */
export async function loadTurnoverPage(
  db: RoipDatabase,
  companyId: number,
  trimestrePedido: string | null,
): Promise<TurnoverPageData> {
  const fechados = await listClosedQuarters(db, companyId);
  const maisRecente = fechados[0];
  if (maisRecente === undefined) {
    return {
      trimestresFechados: fechados,
      resumo: null,
      rolling12m: null,
      trimestreAnterior: null,
      trimestreSeguinte: null,
    };
  }
  const idxPedido = fechados.findIndex((q) => q.trimestre === trimestrePedido);
  const idx = idxPedido >= 0 ? idxPedido : 0;
  const selecionado = fechados[idx] ?? maisRecente;
  const { resumo } = await resumoDoTrimestre(db, companyId, selecionado);
  const referencia = await resumoDoTrimestre(db, companyId, maisRecente);
  return {
    trimestresFechados: fechados,
    resumo,
    rolling12m: { ...referencia.anualizado, trimestreReferencia: maisRecente.trimestre },
    trimestreAnterior: fechados[idx + 1]?.trimestre ?? null,
    trimestreSeguinte: idx > 0 ? (fechados[idx - 1]?.trimestre ?? null) : null,
  };
}

/**
 * Lista nominal dos desligamentos do trimestre fechado para o motivo, com
 * o formulario gravado. Trimestre nao fechado retorna lista vazia.
 */
export async function listTurnoverDrilldown(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  motivo: MotivoTermination,
): Promise<readonly TurnoverDrilldownRow[]> {
  const fechados = await listClosedQuarters(db, companyId);
  if (!fechados.some((q) => q.trimestre === trimestre)) {
    return [];
  }
  const b = computeTurnoverBoundaries(trimestre);
  const rows = await db
    .select({
      terminationEventId: employeeTerminationEvents.id,
      employeeId: employeeTerminationEvents.employeeId,
      name: employees.name,
      departamento: employeeTerminationEvents.departamentoSnapshot,
      nivelHierarquico: employeeTerminationEvents.nivelHierarquicoSnapshot,
      dataInativacao: employeeTerminationEvents.dataInativacao,
    })
    .from(employeeTerminationEvents)
    .innerJoin(employees, eq(employees.id, employeeTerminationEvents.employeeId))
    .where(
      and(
        eq(employeeTerminationEvents.companyId, companyId),
        eq(employeeTerminationEvents.motivo, motivo),
        gte(employeeTerminationEvents.dataInativacao, b.trimestreInicio),
        lt(employeeTerminationEvents.dataInativacao, b.trimestreFim),
      ),
    )
    .orderBy(asc(employeeTerminationEvents.dataInativacao), asc(employeeTerminationEvents.id));
  const forms = await loadTerminationFormsByEventIds(
    db,
    rows.map((r) => r.terminationEventId),
  );
  return rows.map((r) => ({
    ...r,
    formulario: forms.get(r.terminationEventId) ?? null,
  }));
}
