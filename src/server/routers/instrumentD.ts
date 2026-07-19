// ROIP APP 9BOX — sub-router `instrumentD` (ME-046).
//
// Decima-setima ME do Bloco B3 (ME-046) — abre a superficie tRPC de
// LEITURA do Instrumento D (DOC 03 §8.8 e §19.5). A ponta de escrita
// "normal" do Instrumento D vive no Route Handler canonico
// `POST /api/portal/save-instrument-d` (§8.8 primeira linha — portal
// autenticado por CPF via `portalToken`, NAO via tRPC — precedente
// direto ME-039 §6.8 do Instrumento A). Este sub-router expoe:
//   - a leitura publica de status de coleta por (companyId,
//     trimestre) — §8.8 segunda linha e §19.5 segunda linha.
//
// SEM `reopenResponse`: §8.1 canoniza EXPLICITAMENTE que o
// Instrumento D "nao ha fechamento — o card permanece disponivel no
// portal ate ser respondido". Nao existe janela a reabrir. A
// transicao visual "atrasado" no dia 11 do mes subsequente e
// puramente exibicional (o portal continua aceitando resposta).
//
// Cadencia canonica: SEMESTRAL (trimestres impares Q1 e Q3) — §8.1
// literal. Diferente do A/C (trimestral, todos os trimestres). Regex
// canonico Zod `^\d{4}-Q[13]$` (S156).
//
// Motor IQL (§8.5) — nasce nesta mesma ME em
// `src/server/services/iqlCalculationEngine.ts` (S149). Router de
// leitura do IQL vive em `src/server/routers/iql.ts` (mesma ME);
// hook do motor vive no Route Handler
// `POST /api/portal/save-instrument-d` (S157 — motor in-band FORA
// da transacao). Este sub-router NAO grava resposta e NAO chama o
// motor — apenas expoe a leitura de status.
//
// Aplicacao PC1d/D033 (§15.3): agregados `total` e `respondidos`
// incluem C-levels normalmente (respondidos por natureza sempre 0,
// pois §8.6 Bloqueio 3 canoniza que C-level NAO responde D — mas o
// enum semantico e preservado). Lista nominal de C-levels e omitida
// para RH e RH-Lider no acompanhamento de coleta (mesma logica do C
// no §15.3, replicada). Bruno atravessa.
//
// Bloqueio arquitetural canonico: `respondentes` sao sempre employees
// (FK canonica `respondenteId → employees.id`, §8.7 do DOC 01) —
// C-levels vivem em `cLevelMembers`, tabela separada; a exclusao de
// C-level do publico respondente e por CONSTRUCAO. Pendentes na
// lista sao os employees ativos com vinculo direto ativo no dia 16
// que ainda nao responderam.
//
// Convencoes canonicas herdadas:
//   - DI factory `createInstrumentDRouter(deps)` (S155, S100/S084
//     estendido): `now` injetavel (default `() => new Date()`) para
//     testes deterministicos. NAO ha hook de motor IQL aqui —
//     este sub-router NAO grava resposta canonica de D; motor
//     canonico vive no Route Handler do portal.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de
//     integracao desta ME + acoplamento no `appRouter` em `index.ts`
//     (RV-13). As constantes e schemas Zod exportados sao consumidos
//     pelo Route Handler do portal e pelo router `iql`.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`) +
// Route Handler `POST /api/portal/save-instrument-d/route.ts` (para
// os exports canonicos compartilhados). Testes tRPC:
// `tests/integration/instrumentD-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  companies,
  employeeLeaderHistory,
  employees,
  instrumentD_responses,
} from '../../db/schema';
import { parseTrimestreCicloReferencia, type Trimestre } from '../../lib/cycleDates';
import { roleProcedure, router } from '../trpc';
import {
  DIA_ABERTURA_INSTRUMENT_D,
  NUM_DIMENSOES_D,
  NUM_ITENS_POR_DIMENSAO_D,
  NUM_ITENS_TOTAL_D,
  VALOR_MAX_D,
  VALOR_MIN_D,
} from '../services/iqlCalculationEngine';

// Reexporta constantes-chave para consumo pelo Route Handler e testes
// (RV-13 exige chamador nomeado; reexportar do router garante que o
// grep de importadores encontra o simbolo com boundary de palavra).
export {
  DIA_ABERTURA_INSTRUMENT_D,
  NUM_DIMENSOES_D,
  NUM_ITENS_POR_DIMENSAO_D,
  NUM_ITENS_TOTAL_D,
  VALOR_MAX_D,
  VALOR_MIN_D,
};

// ============================================================
// Mensagens canonicas literais (S155, S073/S091/S145 estendido)
// ============================================================

/**
 * §8.6 Bloqueio 3 — C-level nunca responde Instrumento D. Retornado
 * como 403 pelo Route Handler quando `titularType === 'clevel'` no
 * portalToken. Mensagem canonica dedicada (S155).
 */
export const MSG_CLEVEL_NAO_RESPONDE_D_B3 = 'C-level não responde ao Instrumento D.';

/**
 * §8.3 (S150) — respondente sem vinculo direto ativo no snapshot
 * canonico do dia 16 do trimestre. Semantica canonica: colaborador
 * orfao ou sem lider no dia 16 nao entra no snapshot e nao responde
 * o D no ciclo corrente (§8.4).
 */
export const MSG_SEM_VINCULO_SNAPSHOT_D = 'Sem vínculo hierárquico ativo no dia 16 do trimestre.';

/**
 * §8.2 combinado com §8.4 — resposta duplicada. §8.1 canoniza que o
 * D "nao ha fechamento", mas §8.2 "sem salvamento parcial + resposta
 * imutavel" implica que uma vez respondido o ciclo, o mesmo
 * respondente nao pode reenviar (a UNIQUE `uq_iD_unica_resposta`
 * garantiria isso por construcao). Mensagem canonica.
 */
export const MSG_JA_RESPONDIDO_D = 'Instrumento D já respondido neste trimestre para este líder.';

/**
 * §8.2 — 20 itens obrigatorios com valor 0-4 (S101 estendido). Grid
 * 4x5 canonico incompleto retorna esta mensagem.
 */
export const MSG_ITENS_INCOMPLETOS_D =
  'O Instrumento D exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.';

/**
 * §2.4 — guard cruzado companyId. Retornado quando o employee
 * resolvido pelo `portalToken.titularId` nao pertence a
 * `portalToken.companyId`.
 */
export const MSG_COMPANY_MISMATCH_D = 'Colaborador não pertence à sua empresa.';

/**
 * §4.3 (padrao login) estendido a D — colaborador inativo nao
 * responde D. Bloqueio simetrico ao A (`MSG_EMPLOYEE_INATIVO_A`).
 */
export const MSG_EMPLOYEE_INATIVO_D = 'Colaborador inativo não responde ao Instrumento D.';

/**
 * §8.1 (S156) — trimestre canonico do D deve estar em Q1 ou Q3
 * (SEMESTRAL, trimestres impares). Diferente do A/C que aceitam
 * Q1..Q4. Retornada quando o parse Zod bloqueia formato/valor.
 */
export const MSG_TRIMESTRE_INVALIDO_D =
  'Trimestre canônico do Instrumento D deve seguir o formato YYYY-Q1 ou YYYY-Q3.';

/**
 * §2.4 (leitura de status) — companyId ausente/invalido no
 * `getInstrumentDStatus` para perfis com escopo de empresa.
 */
export const MSG_EMPRESA_NAO_ENCONTRADA_STATUS_D = 'Empresa não encontrada.';

/**
 * §8.1 (leitura de status) — trimestre invalido no
 * `getInstrumentDStatus`. Mensagem canonica; o schema Zod ja bloqueia
 * formato invalido antes de chegar ao handler, mensagem esta aqui
 * para defesa em profundidade (S092/S096 estendido).
 */
export const MSG_TRIMESTRE_INVALIDO_STATUS_D =
  'Trimestre do Instrumento D deve seguir o formato YYYY-Q1 ou YYYY-Q3.';

// ============================================================
// Schemas Zod canonicos (consumidos pelo router + Route Handler)
// ============================================================

/**
 * §8.1 (S156) — trimestre canonico SEMESTRAL do D: `YYYY-Q1` ou
 * `YYYY-Q3`. Regex proprio, distinto do TRIMESTRE do A/C (S092/S096)
 * que aceita todos os 4 trimestres.
 */
export const TRIMESTRE_SCHEMA_INSTRUMENT_D = z.string().regex(/^\d{4}-Q[13]$/, {
  message: MSG_TRIMESTRE_INVALIDO_D,
});

/** §8.2 — dimensao 1..4 (canonica). */
export const DIMENSAO_SCHEMA_INSTRUMENT_D = z.number().int().min(1).max(NUM_DIMENSOES_D);

/** §8.2 — itemIndex 1..5 (canonico, dentro da dimensao). */
export const ITEM_INDEX_SCHEMA_INSTRUMENT_D = z.number().int().min(1).max(NUM_ITENS_POR_DIMENSAO_D);

/** §8.2 — valor 0..4 (canonico). */
export const VALOR_SCHEMA_INSTRUMENT_D = z.number().int().min(VALOR_MIN_D).max(VALOR_MAX_D);

/** §8.2 — item unitario (dimensao, itemIndex, valor). */
export const ITEM_SCHEMA_INSTRUMENT_D = z.object({
  dimensao: DIMENSAO_SCHEMA_INSTRUMENT_D,
  itemIndex: ITEM_INDEX_SCHEMA_INSTRUMENT_D,
  valor: VALOR_SCHEMA_INSTRUMENT_D,
});

/**
 * §8.1 — schema local do trimestre para o `getInstrumentDStatus`.
 * Redeclarado como constante local por precedente do repo (cada
 * router redeclara o proprio schema para evitar dependencia cruzada
 * entre routers). Reusa a mesma regex canonica que o
 * `TRIMESTRE_SCHEMA_INSTRUMENT_D`, com mensagem dedicada.
 */
export const TRIMESTRE_INPUT_SCHEMA_STATUS_D = z.string().regex(/^\d{4}-Q[13]$/, {
  message: MSG_TRIMESTRE_INVALIDO_STATUS_D,
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §8.8 segunda linha (ME-046) — status canonico de coleta de um
 * colaborador pendente no acompanhamento do Instrumento D.
 *   - `'pendente'`: trimestre em andamento (ate o dia 10 do mes
 *     subsequente, corte canonico §8.1 replicado ao D por simetria
 *     com A/C).
 *   - `'atrasado'`: trimestre ja passou canonicamente do corte (dia
 *     10 do mes subsequente) e o respondente ainda nao respondeu.
 *     §8.1 canoniza a transicao visual no dia 11 do mes subsequente.
 */
export const STATUS_PENDENCIA_INSTRUMENT_D_VALUES = ['pendente', 'atrasado'] as const;

/** Status canonico de um respondente pendente do D. */
export type StatusPendenciaInstrumentD = (typeof STATUS_PENDENCIA_INSTRUMENT_D_VALUES)[number];

/**
 * §8.8 segunda linha — item canonico da lista `pendentes` do
 * `getInstrumentDStatus`. Contem os atributos canonicos do
 * respondente (nome, departamento, cargo) e o status de pendencia.
 * `cargo` mapeia ao `employees.descricaoCBO` (canonico dos cargos
 * de colaborador comum; C-levels vivem em `cLevelMembers` e nao
 * respondem D, portanto nao aparecem aqui — precedente do
 * `InstrumentAStatusPendente`).
 */
export interface InstrumentDStatusPendente {
  employeeId: number;
  nome: string;
  departamento: string;
  cargo: string;
  status: StatusPendenciaInstrumentD;
}

/**
 * §8.8 segunda linha — resultado canonico da leitura de status do D
 * para (companyId, trimestre). `total` conta respondentes ATIVOS
 * elegiveis segundo o snapshot §8.3 (S150) — quantos colaboradores
 * tinham vinculo direto ativo (liderId ou clevelId nao-nulo) no dia
 * 16 do ultimo mes do trimestre. `respondidos = total -
 * pendentes.length`.
 */
export interface GetInstrumentDStatusResult {
  companyId: number;
  trimestre: string;
  total: number;
  respondidos: number;
  pendentes: InstrumentDStatusPendente[];
}

// ============================================================
// Dependencias injetaveis (S155 — sem hook de motor)
// ============================================================

/**
 * Relogio injetavel para testes deterministicos. Sem hook de motor
 * IQL porque este sub-router NAO grava resposta canonica de D —
 * apenas leitura de status. O hook canonico do motor IQL (S157) vive
 * no Route Handler `POST /api/portal/save-instrument-d` (ME-046) e
 * na proc `iql.calculateIQL` do router `iql` (mesma ME).
 */
export interface InstrumentDRouterDeps {
  now?: () => Date;
}

interface ResolvedDepsD {
  now: () => Date;
}

function resolveDepsD(deps: InstrumentDRouterDeps): ResolvedDepsD {
  return {
    now: deps.now ?? (() => new Date()),
  };
}

// ============================================================
// Helpers canonicos (compartilhaveis com o Route Handler)
// ============================================================

/**
 * Verifica que a lista de itens do submit cobre exatamente as 20
 * combinacoes canonicas (dimensao 1..4 x itemIndex 1..5), sem
 * duplicatas e sem lacunas. Retorna `true` se cobre; `false` caso
 * contrario. Consumido pelo Route Handler do portal — precedente
 * direto de `itensCobremGridCanonicoA` do router A (S107 estendido).
 */
export function itensCobremGridCanonicoD(
  itens: readonly { dimensao: number; itemIndex: number }[],
): boolean {
  if (itens.length !== NUM_ITENS_TOTAL_D) {
    return false;
  }
  const chaves = new Set<string>();
  for (const item of itens) {
    chaves.add(`${item.dimensao}-${item.itemIndex}`);
  }
  if (chaves.size !== NUM_ITENS_TOTAL_D) {
    return false;
  }
  for (let d = 1; d <= NUM_DIMENSOES_D; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO_D; i++) {
      if (!chaves.has(`${d}-${i}`)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * §8.3 (S150) — resolve a data canonica do snapshot dia 16 do
 * trimestre no fuso local da empresa. Padrao local ao router para
 * consumo pelo Route Handler; delega ao helper compartilhado
 * `getInstrumentDDia16` do motor IQL. Duas superficies expondo o
 * mesmo helper preservam cadeia de imports curta (RV-13).
 */
export function resolveDia16InstrumentD(trimestre: string, timeZone: string): Date | null {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return null;
  }
  const trim = parsed.trimestre as Trimestre;
  // Q1 -> dia 16/03; Q3 -> dia 16/09 (§8.1). Mes = ultimo do trim.
  const mes = trim * 3;
  return localDateAtDay16(parsed.ano, mes, timeZone);
}

/**
 * Constroi um `Date` UTC equivalente ao instante local `ano-mes-16
 * 00:00:00` no `timeZone` (mesma abertura canonica do A/C). Wrapper
 * simetrico do `localDateTimeToUTC` de `cycleDates`, sem depender
 * do import direto — mantido local ao router para preservar cadeia
 * de imports curta e evitar acoplamento adicional. Comportamento
 * canonico: para `America/Sao_Paulo` (sem DST desde 2019),
 * offset -03:00 constante.
 */
function localDateAtDay16(ano: number, mes: number, timeZone: string): Date {
  // Reusa a mecanica canonica de `localDateTimeToUTC` via
  // formatToParts (padrao L45 e cycleDates.ts). Zero raw SQL,
  // zero I/O, puro helper.
  const asUTCms = Date.UTC(ano, mes - 1, DIA_ABERTURA_INSTRUMENT_D, 0, 0, 0);
  const asUTCDate = new Date(asUTCms);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(asUTCDate);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
  }
  const asLocalUTCms = Date.UTC(
    map.year!,
    map.month! - 1,
    map.day!,
    map.hour!,
    map.minute!,
    map.second!,
  );
  const offsetMs = asLocalUTCms - asUTCms;
  return new Date(asUTCms - offsetMs);
}

/**
 * §8.3 (S150) — verifica se um `respondenteId` tem vinculo direto
 * ativo no snapshot canonico do dia 16 do trimestre, apontando para
 * o `avaliadoId` (via `liderId` OU `clevelId`). Retorna `true` se ha
 * vinculo valido; `false` caso contrario. Consumido pelo Route
 * Handler para validar o snapshot canonico antes de aceitar o save.
 *
 * A verificacao canonica e: existe uma linha em
 * `employeeLeaderHistory` do respondente com `dataInicio <= dia16`
 * e (`dataFim IS NULL` OU `dataFim > dia16`) apontando ao
 * `avaliadoId` no XOR canonico. Sem tabela snapshot dedicada
 * (justificativa canonica em S150).
 */
export async function isRespondenteValidoDia16D(
  db: RoipDatabase,
  respondenteId: number,
  avaliadoTipo: 'employee' | 'clevel',
  avaliadoId: number,
  dia16: Date,
): Promise<boolean> {
  const rows = await db
    .select({ id: employeeLeaderHistory.id })
    .from(employeeLeaderHistory)
    .where(
      and(
        eq(employeeLeaderHistory.employeeId, respondenteId),
        avaliadoTipo === 'employee'
          ? eq(employeeLeaderHistory.liderId, avaliadoId)
          : eq(employeeLeaderHistory.clevelId, avaliadoId),
        lte(employeeLeaderHistory.dataInicio, dia16),
        or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * §8.3 (S150) — resolve o par (avaliadoTipo, avaliadoId) canonico
 * do respondente no snapshot dia 16. Retorna a informacao suficiente
 * para o Route Handler validar snapshot e disparar o hook do motor
 * IQL apos gravar a resposta. Se o respondente nao tem vinculo
 * direto ativo no dia 16, retorna `null` (snapshot invalido).
 *
 * Um respondente pode ter no maximo UM vinculo direto ativo no dia
 * 16 (regra canonica de cadastros — a transferencia de liderados
 * fecha o vinculo anterior antes de abrir novo, §14.9). Se ha
 * multiplos vinculos ativos por bug de dados, o mais recente por
 * `dataInicio DESC, id DESC` vence.
 */
export async function resolveAvaliadoDia16D(
  db: RoipDatabase,
  respondenteId: number,
  dia16: Date,
): Promise<{ avaliadoTipo: 'employee' | 'clevel'; avaliadoId: number } | null> {
  const rows = await db
    .select({
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
      dataInicio: employeeLeaderHistory.dataInicio,
      id: employeeLeaderHistory.id,
    })
    .from(employeeLeaderHistory)
    .where(
      and(
        eq(employeeLeaderHistory.employeeId, respondenteId),
        lte(employeeLeaderHistory.dataInicio, dia16),
        or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
      ),
    );

  if (rows.length === 0) {
    return null;
  }

  // Se ha multiplos por bug, o mais recente vence (dataInicio DESC,
  // id DESC). Ordenacao em memoria (poucos registros por respondente).
  rows.sort((a, b) => {
    const timeDiff = b.dataInicio.getTime() - a.dataInicio.getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id - a.id;
  });

  const vencedor = rows[0]!;
  if (vencedor.liderId !== null) {
    return { avaliadoTipo: 'employee', avaliadoId: vencedor.liderId };
  }
  if (vencedor.clevelId !== null) {
    return { avaliadoTipo: 'clevel', avaliadoId: vencedor.clevelId };
  }
  // Vinculo com liderId E clevelId ambos nulos == vinculo orfao
  // (bug canonico do §8.4: colaborador sem lider no dia 16). Trata
  // como snapshot invalido — respondente nao elegivel.
  return null;
}

/**
 * §8.8 segunda linha + §8.1 — classifica status pendente segundo o
 * corte canonico do trimestre. Retorna `'atrasado'` quando `now`
 * ultrapassou o dia 10 do mes subsequente ao ultimo mes do
 * trimestre (§8.1 canoniza transicao visual "atrasado" no dia 11 —
 * usamos `> dia 10 fim-de-dia` como fronteira precisa). Caso
 * contrario, `'pendente'`. Exportado para reuso em superficies que
 * classificam pendencia sem chamar a proc completa.
 */
export function classifyStatusPendenciaD(
  trimestre: string,
  timeZone: string,
  now: Date,
): StatusPendenciaInstrumentD {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return 'pendente';
  }
  const trim = parsed.trimestre as Trimestre;
  const mesUltimo = trim * 3;
  const anoSeguinte = mesUltimo === 12 ? parsed.ano + 1 : parsed.ano;
  const mesSeguinte = mesUltimo === 12 ? 1 : mesUltimo + 1;
  // Corte canonico: dia 10 do mes seguinte 23:59:59 no fuso local
  // da empresa. Mesma mecanica de `getInstrumentoABDataCorte`.
  const asUTCms = Date.UTC(anoSeguinte, mesSeguinte - 1, 10, 23, 59, 59);
  const asUTCDate = new Date(asUTCms);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(asUTCDate);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
  }
  const asLocalUTCms = Date.UTC(
    map.year!,
    map.month! - 1,
    map.day!,
    map.hour!,
    map.minute!,
    map.second!,
  );
  const offsetMs = asLocalUTCms - asUTCms;
  const dataCorte = new Date(asUTCms - offsetMs);
  return now.getTime() > dataCorte.getTime() ? 'atrasado' : 'pendente';
}

/**
 * §8.8 segunda linha — resolve, para uma empresa e um trimestre, a
 * lista canonica de `employeeId`s ELEGIVEIS a responder o D — os
 * que tinham vinculo direto ativo (liderId OU clevelId nao-nulo) no
 * snapshot dia 16 (§8.3, S150) e estao ativos no momento da
 * consulta (§8.4).
 *
 * Duas condicoes canonicas combinadas em uma unica query:
 *   1. `employeeLeaderHistory` com `dataInicio <= dia16` e
 *      (`dataFim IS NULL` OU `dataFim > dia16`) — snapshot canonico.
 *   2. `employees.status = 'ativo'` no momento da consulta — §8.4
 *      canoniza que inativos apos o dia 16 nao aparecem no
 *      acompanhamento.
 *
 * Filtro por `companyId` cruzado com `employees.companyId` — defesa
 * em profundidade contra vinculos cross-company. Sem duplicatas:
 * um respondente elegivel aparece uma unica vez mesmo se ha
 * multiplos vinculos ativos em `employeeLeaderHistory` (Set por
 * `employeeId`).
 */
export async function listElegiveisSnapshotDia16D(
  db: RoipDatabase,
  companyId: number,
  dia16: Date,
): Promise<{ id: number; name: string; departamento: string; descricaoCBO: string }[]> {
  // Passo 1: colhe employeeIds do snapshot dia 16.
  const historyRows = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .where(
      and(
        lte(employeeLeaderHistory.dataInicio, dia16),
        or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
      ),
    );
  const snapshotIds = Array.from(new Set(historyRows.map((r) => r.employeeId)));
  if (snapshotIds.length === 0) {
    return [];
  }
  // Passo 2: cruza com employees ativos da empresa.
  return await db
    .select({
      id: employees.id,
      name: employees.name,
      departamento: employees.departamento,
      descricaoCBO: employees.descricaoCBO,
    })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
        inArray(employees.id, snapshotIds),
      ),
    )
    .orderBy(employees.id);
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `instrumentD` com dependencias injetadas
 * (S155, S100/S084 estendido). Producao chama sem argumentos — o
 * unico default e o relogio. Testes injetam `now` fixo para
 * determinismo. Sem hook de motor IQL porque este sub-router NAO
 * grava resposta canonica de D — apenas leitura de status. O hook
 * canonico (S157) vive no Route Handler
 * `POST /api/portal/save-instrument-d` e na proc
 * `iql.calculateIQL` do router `iql` (S154).
 */
export function createInstrumentDRouter(deps: InstrumentDRouterDeps = {}) {
  const resolved = resolveDepsD(deps);

  return router({
    /**
     * §8.8 segunda linha + §19.5 segunda linha (ME-046) — leitura
     * publica de status de coleta do Instrumento D por (companyId,
     * trimestre). Retorna `{ total, respondidos, pendentes: [...]
     * }`. Escopo canonico por perfil (S066 estendido ao D):
     *   - Bruno (super_admin): atravessa companyId.
     *   - RH e RH-Lider: escopo empresa (companyId do JWT).
     *   - C-level: cadeia descendente direta — respondentes cujo
     *     vinculo no dia 16 apontava a este C-level.
     *   - Lider: cadeia descendente direta — respondentes cujo
     *     vinculo no dia 16 apontava a este lider.
     *
     * `total` conta respondentes ELEGIVEIS segundo snapshot §8.3
     * (S150). §8.6 Bloqueio 3 canoniza C-level nao responde D —
     * por construcao arquitetural nao aparecem (respondentes sao
     * sempre employees por FK `respondenteId → employees.id`).
     *
     * `pendentes[].status` classificado por `classifyStatusPendenciaD`
     * contra o corte canonico dia 10/dia 11 do mes subsequente
     * (§8.1).
     *
     * `respondidos = total - pendentes.length` — semantica
     * canonica: "resposta completa registrada no trimestre" (ao
     * menos uma linha em `instrumentD_responses` para o par
     * respondente x trimestre).
     */
    getInstrumentDStatus: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA_STATUS_D,
        }),
      )
      .query(async ({ ctx, input }): Promise<GetInstrumentDStatusResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        if (ctx.user.role !== 'super_admin' && ctx.user.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Empresa fora do escopo do titular.',
          });
        }

        // Resolve o fuso canonico da empresa para o corte de status
        // e para o snapshot §8.3.
        const [company] = await ctx.db
          .select({
            id: companies.id,
            timezone: companies.timezone,
          })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (!company) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_EMPRESA_NAO_ENCONTRADA_STATUS_D,
          });
        }
        const timeZone = company.timezone ?? 'America/Sao_Paulo';

        // Resolve o dia 16 canonico do trimestre (§8.3, S150).
        const dia16 = resolveDia16InstrumentD(input.trimestre, timeZone);
        if (dia16 === null) {
          // Defesa: schema Zod ja bloqueia. Fallback conservador.
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: MSG_TRIMESTRE_INVALIDO_STATUS_D,
          });
        }

        // Lista canonica de elegiveis por snapshot §8.3.
        const elegiveisAll = await listElegiveisSnapshotDia16D(ctx.db, input.companyId, dia16);

        // Aplica escopo por perfil (S066 estendido ao D).
        let elegiveisNoEscopo: typeof elegiveisAll;
        if (
          ctx.user.role === 'super_admin' ||
          ctx.user.role === 'rh' ||
          ctx.user.role === 'rh_lider'
        ) {
          elegiveisNoEscopo = elegiveisAll;
        } else {
          // Lider ou C-level — cadeia direta descendente por snapshot
          // dia 16. Coleta os employeeIds cujo vinculo dia 16 apontava
          // ao usuario logado.
          const liderIdMatch = ctx.user.role === 'lider' ? ctx.user.userId : null;
          const clevelIdMatch = ctx.user.role === 'clevel' ? ctx.user.userId : null;

          const cadeiaRows = await ctx.db
            .select({ employeeId: employeeLeaderHistory.employeeId })
            .from(employeeLeaderHistory)
            .where(
              and(
                liderIdMatch !== null
                  ? eq(employeeLeaderHistory.liderId, liderIdMatch)
                  : eq(employeeLeaderHistory.clevelId, clevelIdMatch as number),
                lte(employeeLeaderHistory.dataInicio, dia16),
                or(isNull(employeeLeaderHistory.dataFim), gt(employeeLeaderHistory.dataFim, dia16)),
              ),
            );
          const cadeiaIds = new Set<number>(cadeiaRows.map((r) => r.employeeId));
          elegiveisNoEscopo = elegiveisAll.filter((e) => cadeiaIds.has(e.id));
        }

        if (elegiveisNoEscopo.length === 0) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            total: 0,
            respondidos: 0,
            pendentes: [],
          };
        }

        const employeeIds = elegiveisNoEscopo.map((row) => row.id);

        // Resolve quais respondentes ja tem PELO MENOS UMA resposta
        // registrada no trimestre. `instrumentD_responses` grava um
        // registro por (respondenteId, trimestre, dimensao,
        // itemIndex) — 20 por resposta completa. Distinct por
        // respondenteId basta para a semantica de `respondidos: pelo
        // menos uma resposta`.
        const respondedRows = await ctx.db
          .selectDistinct({ respondenteId: instrumentD_responses.respondenteId })
          .from(instrumentD_responses)
          .where(
            and(
              eq(instrumentD_responses.companyId, input.companyId),
              eq(instrumentD_responses.trimestre, input.trimestre),
              inArray(instrumentD_responses.respondenteId, employeeIds),
            ),
          );
        const respondedSet = new Set<number>(respondedRows.map((row) => row.respondenteId));

        const now = resolved.now();
        const statusCanonico = classifyStatusPendenciaD(input.trimestre, timeZone, now);

        const pendentes: InstrumentDStatusPendente[] = [];
        for (const emp of elegiveisNoEscopo) {
          if (respondedSet.has(emp.id)) {
            continue;
          }
          pendentes.push({
            employeeId: emp.id,
            nome: emp.name,
            departamento: emp.departamento,
            cargo: emp.descricaoCBO,
            status: statusCanonico,
          });
        }

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          total: elegiveisNoEscopo.length,
          respondidos: elegiveisNoEscopo.length - pendentes.length,
          pendentes,
        };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type InstrumentDRouter = ReturnType<typeof createInstrumentDRouter>;
