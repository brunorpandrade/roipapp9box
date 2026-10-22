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
import type { Departamento, MotivoTermination, NivelHierarquico } from '../../db/schema';
import type { FormularioDesligamento } from '../../lib/shared/terminationForms';

import { listClosedQuarters } from './closedQuarters';
import { loadTerminationFormsByEventIds } from './terminationForms';
import {
  computeTurnoverBoundaries,
  computeTurnoverByCompany,
  computeTurnoverByDepartamento,
  computeTurnoverRate,
} from './turnoverEngine';

/**
 * Total do trimestre — percentual sobre o headcount de fechamento do
 * trimestre anterior (§12.1 / ESPEC §11.2).
 */
interface TurnoverTotal {
  readonly saidas: number;
  readonly percentual: number;
  readonly headcountBase: number;
}

/**
 * Composicao por motivo — percentual sobre o total de desligados do
 * trimestre (§12.4 / ESPEC §11.2).
 */
interface TurnoverComposicao {
  readonly saidas: number;
  readonly percentual: number;
}

/**
 * Card dos paineis. `null` = sem dados para exibir (nenhum trimestre
 * fechado nem desligamentos no trimestre em andamento).
 *
 * ME-1.14 (Conversa 4b, Despacho B — D-B4) — `estado` discrimina o card
 * do ultimo trimestre fechado (`'fechado'`) do card do trimestre em
 * andamento (`'parcial'`, com overlay "Parcial" no indicador).
 */
export interface TurnoverCardData {
  readonly trimestre: string;
  readonly label: string;
  readonly total: TurnoverTotal;
  readonly voluntario: TurnoverComposicao;
  readonly involuntario: TurnoverComposicao;
  readonly estado: 'parcial' | 'fechado';
}

/** Resumo de um trimestre (mesma forma do card). */
type TurnoverTrimestreResumo = TurnoverCardData;

/** Dados da pagina. `resumo` nulo = nenhum trimestre fechado. */
export interface TurnoverPageData {
  readonly trimestresFechados: readonly ClosedQuarterItem[];
  readonly resumo: TurnoverTrimestreResumo | null;
  readonly rolling12m: (TurnoverTotal & { readonly trimestreReferencia: string }) | null;
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
  /**
   * ME-1.13 (Conversa 4b, Despacho B — D-B3) — data civil do desligamento
   * (ISO `YYYY-MM-DD`). `null` em registros historicos sem backfill (ex:
   * eventos criados antes do campo existir e sem evento rastreavel).
   */
  readonly dataDesligamento: string | null;
}

type ClosedQuarterItem = Awaited<ReturnType<typeof listClosedQuarters>>[number];

async function resumoDoTrimestre(
  db: RoipDatabase,
  companyId: number,
  item: ClosedQuarterItem,
  departamento?: Departamento,
  estado: 'parcial' | 'fechado' = 'fechado',
): Promise<{ resumo: TurnoverTrimestreResumo; anualizado: TurnoverTotal }> {
  const r =
    departamento === undefined
      ? await computeTurnoverByCompany(db, companyId, item.trimestre)
      : await computeTurnoverByDepartamento(db, companyId, departamento, item.trimestre);
  const head = r.totalHeadcountInicioTrimestre;
  const total = r.totalSaidasTrimestre;
  const vol = r.aberturaPorMotivo.voluntario;
  const inv = r.aberturaPorMotivo.involuntario;
  return {
    resumo: {
      trimestre: item.trimestre,
      label: item.label,
      total: { saidas: total, percentual: r.taxaTrimestral, headcountBase: head },
      voluntario: { saidas: vol, percentual: computeTurnoverRate(vol, total) },
      involuntario: { saidas: inv, percentual: computeTurnoverRate(inv, total) },
      estado,
    },
    anualizado: {
      saidas: r.totalSaidasAnualizado,
      percentual: r.taxaAnualizada,
      headcountBase: r.totalHeadcountInicioAnualizado,
    },
  };
}

/**
 * ME-1.14 (Conversa 4b, Despacho B — D-B4) — helper canonico que calcula
 * o trimestre em andamento (`YYYY-QN`) a partir de uma referencia `now`
 * em UTC. Formato canonico identico ao resto do motor turnover (§12.5).
 */
export function getTrimestreEmAndamento(now: Date): string {
  const utcMonth = now.getUTCMonth();
  const utcYear = now.getUTCFullYear();
  const q = Math.floor(utcMonth / 3) + 1;
  return `${utcYear}-Q${q}`;
}

/**
 * Rotulo de exibicao do trimestre em andamento. Formato bit-exact ao
 * `closedQuarters.formatClosedQuarterLabel` (RV-14 — reusa semantica).
 */
export function formatTrimestreEmAndamentoLabel(trimestre: string): string {
  const match = /^(\d{4})-Q(\d)$/.exec(trimestre);
  if (match === null) {
    return trimestre;
  }
  return `${match[2]}º trimestre de ${match[1]} (em andamento)`;
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
  return resumo;
}

/**
 * ME-1.14 (Conversa 4b, Despacho B — D-B4) — card com overlay do
 * trimestre em ANDAMENTO. Preferencia: se existe trimestre em andamento
 * com desligamentos registrados, exibe o parcial (`estado='parcial'`);
 * senao, cai de volta no ultimo trimestre fechado (`estado='fechado'`);
 * senao, retorna `null`.
 *
 * O calculo usa `computeTurnoverByCompany` (mesmo motor) sobre as
 * fronteiras do trimestre atual. Headcount de referencia e canonicamente
 * reconstruido pela mesma logica do `resolveDenominadorTrimestral` dentro
 * do motor — nao duplica aqui.
 *
 * `now` injetado para testabilidade determinstica; default `new Date()`.
 */
export async function loadTurnoverCardLive(
  db: RoipDatabase,
  companyId: number,
  now: Date = new Date(),
): Promise<TurnoverCardData | null> {
  const trimestreAtual = getTrimestreEmAndamento(now);
  const r = await computeTurnoverByCompany(db, companyId, trimestreAtual);
  if (r.totalSaidasTrimestre > 0) {
    const total = r.totalSaidasTrimestre;
    const vol = r.aberturaPorMotivo.voluntario;
    const inv = r.aberturaPorMotivo.involuntario;
    return {
      trimestre: trimestreAtual,
      label: formatTrimestreEmAndamentoLabel(trimestreAtual),
      total: {
        saidas: total,
        percentual: r.taxaTrimestral,
        headcountBase: r.totalHeadcountInicioTrimestre,
      },
      voluntario: { saidas: vol, percentual: computeTurnoverRate(vol, total) },
      involuntario: { saidas: inv, percentual: computeTurnoverRate(inv, total) },
      estado: 'parcial',
    };
  }
  return loadTurnoverCard(db, companyId);
}

/**
 * Dados da pagina. `trimestrePedido` fora da lista de fechados cai no mais
 * recente, EXCETO quando igual ao trimestre em andamento calculado por
 * `getTrimestreEmAndamento(now)` — nesse caso (ME-1.14 D-B5), devolve o
 * resumo PARCIAL do trimestre em andamento com `estado='parcial'`,
 * mantendo o `rolling12m` do ultimo fechado como referencia. `trimestre
 * Anterior` aponta para o ultimo fechado; `trimestreSeguinte` fica null.
 *
 * `now` injetado para testabilidade; default `new Date()`.
 */
export async function loadTurnoverPage(
  db: RoipDatabase,
  companyId: number,
  trimestrePedido: string | null,
  departamento?: Departamento,
  now: Date = new Date(),
): Promise<TurnoverPageData> {
  const fechados = await listClosedQuarters(db, companyId);
  const maisRecente = fechados[0];
  const trimestreAtual = getTrimestreEmAndamento(now);
  // ME-1.14 — abertura canonica do trimestre em andamento quando pedido
  // explicitamente via URL (link do card em tempo real). CC079-2: path
  // parcial funciona MESMO SEM trimestre fechado (empresa recem-ativada
  // tipo Embrastec — fechados=[], maisRecente=undefined). rolling12m
  // fica null nesse caso (sem referencia canonica historica), e
  // trimestreAnterior aponta para o ultimo fechado quando existe.
  if (trimestrePedido === trimestreAtual) {
    const parcialItem: ClosedQuarterItem = {
      trimestre: trimestreAtual,
      label: formatTrimestreEmAndamentoLabel(trimestreAtual),
    };
    const { resumo } = await resumoDoTrimestre(db, companyId, parcialItem, departamento, 'parcial');
    const rolling12m =
      maisRecente !== undefined
        ? {
            ...(await resumoDoTrimestre(db, companyId, maisRecente, departamento)).anualizado,
            trimestreReferencia: maisRecente.trimestre,
          }
        : null;
    return {
      trimestresFechados: fechados,
      resumo,
      rolling12m,
      trimestreAnterior: maisRecente?.trimestre ?? null,
      trimestreSeguinte: null,
    };
  }
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
  const { resumo } = await resumoDoTrimestre(db, companyId, selecionado, departamento);
  const referencia = await resumoDoTrimestre(db, companyId, maisRecente, departamento);
  return {
    trimestresFechados: fechados,
    resumo,
    rolling12m: { ...referencia.anualizado, trimestreReferencia: maisRecente.trimestre },
    trimestreAnterior: fechados[idx + 1]?.trimestre ?? null,
    trimestreSeguinte: idx > 0 ? (fechados[idx - 1]?.trimestre ?? null) : null,
  };
}

/**
 * Lista nominal dos desligamentos do trimestre para o motivo, com o
 * formulario gravado + ambas as datas (civil + sistemica — D-B3). Admite
 * trimestre em andamento quando `permitirEmAndamento=true` (ME-1.14 drill-
 * down do card em tempo real); trimestre nao fechado e nao marcado como em
 * andamento retorna lista vazia.
 */
export async function listTurnoverDrilldown(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  motivo: MotivoTermination,
  permitirEmAndamento: boolean = false,
): Promise<readonly TurnoverDrilldownRow[]> {
  const fechados = await listClosedQuarters(db, companyId);
  const estaFechado = fechados.some((q) => q.trimestre === trimestre);
  if (!estaFechado && !permitirEmAndamento) {
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
      // ME-1.13 — data civil do desligamento vem do employees.
      dataDesligamento: employees.dataDesligamento,
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
    terminationEventId: r.terminationEventId,
    employeeId: r.employeeId,
    name: r.name,
    departamento: r.departamento,
    nivelHierarquico: r.nivelHierarquico,
    dataInativacao: r.dataInativacao,
    dataDesligamento: r.dataDesligamento ?? null,
    formulario: forms.get(r.terminationEventId) ?? null,
  }));
}
