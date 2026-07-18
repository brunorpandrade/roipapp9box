// ROIP APP 9BOX — sub-router `instrumentC` (ME-038, editado em ME-040
// e ME-042).
//
// Nona ME do Bloco B3 (ME-038) — abriu a ponta de escrita do Eixo Y.
// Decima primeira ME do Bloco B3 (ME-040) — plugou o hook canonico do
// motor de plenitude (§6.4). Decima-terceira ME do Bloco B3 (ME-042) —
// adiciona a leitura publica `getPendencies` do §6.8 quarta linha,
// alinhando a superficie de acompanhamento de coleta do Instrumento
// C com o §19.4 (leitura publica do Eixo Y).
//
// Com o motor entregue na ME-040, S088 e satisfeito naturalmente: o
// hook `plenitudeEngine.recalculatePlenitude` e chamado apos as
// transacoes atomicas de INSERT e OVERWRITE do C (padrao S060 herdado
// do `quarterlyCalculation` × `roiCalculationEngine`). Na ME-041 o
// motor 9-Box passou a ser acionado in-band pelo motor de plenitude
// via facade S113 (dispensa hook direto neste router).
//
// Procedures canonicas (DOC 03 §6.8 — a leitura literal do §6.8 lista
// 4 procs sob o namespace `instrumentC` no escopo desta camada; ME-038
// entregou 3 delas via S089, esta ME-042 fecha o §6.8 quarta linha):
//   - `instrumentC.saveInstrumentCAssessment` — DOC 03 §6.3 + §6.8 (ME-038)
//   - `instrumentC.getAssessment`             — leitura da avaliacao (ME-038)
//   - `instrumentC.reopenAssessment`          — desbloqueio manual (ME-038)
//   - `instrumentC.getPendencies` (ME-042 — §6.8 quarta linha + §19.4
//     oitava linha) — retorna lista de pendencias de C do lider logado
//     com escopo de cadeia. Autorizacao por perfil (§6.8): RH+Bruno
//     escopo empresa; Lider+C-level escopo cadeia direta descendente.
//     Cada pendencia representa um vinculo ATIVO (`employeeLeaderHistory`
//     com `dataFim IS NULL`) em que o lider ou C-level do vinculo NAO
//     preencheu a avaliacao do trimestre para o liderado. S121:
//     `status = 'atrasado'` quando `now > dataCorte` canonica (§6.3
//     dia 10 do mes subsequente); caso contrario, 'pendente'.
//     Colaboradores ATIVOS apenas (§7.6 replicado).
//
// Convencoes canonicas herdadas de S049/S060/S084 (ME-032/ME-034/ME-037):
//   - `saveInstrumentCAssessment` (S089+S090): transacao atomica dos 20
//     itens (§6.3). XOR liderId/clevelId no input, imposto ANTES de
//     tocar o banco (o CHECK `chk_iC_avaliador_unico` seria a segunda
//     linha de defesa). Semantica de submit repetido (S090): se existe
//     avaliacao previa para (employee, trimestre) e ha
//     `instrumentUnlockLog` do tipo `C` vigente para o par
//     (`expiraEm > now`), OVERWRITE via
//     `overwriteInstrumentCAssessmentValor` linha a linha; sem
//     desbloqueio vigente, rejeita 409 com `MSG_TRIMESTRE_FECHADO`
//     (mensagem canonica literal §6.8, semanticamente aplicavel a
//     ambos "ja enviou" e "apos corte" — o front distingue lendo
//     `getAssessment`).
//   - `getAssessment` (S089): leitura pura para a tela do lider
//     recarregar avaliacao ja enviada dentro da janela de desbloqueio.
//     Retorna respostas ordenadas (dimensao, itemIndex), o avaliador
//     (liderId XOR clevelId), status da janela e resumo do desbloqueio
//     vigente. Legivel por qualquer perfil administrativo com guard
//     cruzado companyId (§2.4).
//   - `reopenAssessment` (S089): exclusivo super_admin via
//     `roleProcedure(['super_admin'])`. INSERT em `instrumentUnlockLog`
//     com `expiraEm=now+24h`, `instrumento='C'`, `houveAlteracao=false`.
//     Pre-condicao: avaliacao previa existente (`MSG_REOPEN_SEM_AVALIACAO`
//     se nenhum registro). Rejeita 409 se ja ha janela vigente
//     (`MSG_REOPEN_JA_VIGENTE`). Justificativa canonica 100-500 (§2).
//   - DI factory `createInstrumentCRouter(deps)` (S084 estendido): `now`
//     injetavel (default `() => new Date()`) para testes deterministicos.
//     Motor de plenitude injetavel via `plenitudeEngine?:
//     PlenitudeEngineFacade` (S105 — S060 herdado do
//     `quarterlyCalculation` × `roiCalculationEngine`). Producao usa
//     `DEFAULT_PLENITUDE_ENGINE`; testes injetam spy para asserir
//     acoplamento. Hook chamado sincrono in-band FORA da transacao de
//     escrita (S102): dentro forcaria tratar `MySql2Transaction ×
//     MySql2Database`, padrao ja evitado no repo.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Transacao atomica via
//     `db.transaction(async (tx) => ...)`.
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13).
//   - Timezone canonico: `companies.timezone` (default `America/Sao_Paulo`),
//     lida por empresa a cada validacao de janela. §6.1 e explicito que a
//     janela e no fuso local da empresa.
//
// Regra canonica de vinculo (§6.3): "usa o registro ativo em
// `employeeLeaderHistory` no momento do preenchimento" — mapeia
// exatamente `getActiveLeaderHistoryByEmployee` (linha com
// `dataFim IS NULL`). RH e Bruno pulam a validacao (§6.8). Perfis
// `lider` e `clevel` submetem em nome proprio: input.liderId
// (respectivamente input.clevelId) DEVE bater com ctx.user.userId.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/instrumentC-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentC_assessments,
  instrumentUnlockLog,
} from '../../db/schema';
import {
  getInstrumentoABDataAbertura,
  getInstrumentoABDataCorte,
  parseTrimestreCicloReferencia,
} from '../../lib/cycleDates';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import {
  DEFAULT_PLENITUDE_ENGINE,
  type PlenitudeEngineFacade,
} from '../services/plenitudeCalculationEngine';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/** §6.3 — 4 dimensoes (Engajamento/Desenvolvimento/Pertencimento/Realizacao). */
export const NUM_DIMENSOES = 4 as const;

/** §6.3 — 5 itens por dimensao. */
export const NUM_ITENS_POR_DIMENSAO = 5 as const;

/** §6.3 — total de 20 itens por avaliacao completa. */
export const NUM_ITENS_TOTAL = 20 as const;

/** §6.3 — escala canonica: 0 Nunca .. 4 Sempre. */
export const VALOR_MIN = 0 as const;
/** §6.3 — teto da escala 0-4. */
export const VALOR_MAX = 4 as const;

/** §6.7 — janela canonica de edicao pos-desbloqueio: 24 horas. */
export const UNLOCK_WINDOW_HOURS = 24 as const;

/** Milissegundos em 24 horas — usado no calculo de `expiraEm`. */
const UNLOCK_WINDOW_MS = UNLOCK_WINDOW_HOURS * 60 * 60 * 1000;

// ============================================================
// Mensagens canonicas literais (testadas verbatim — S091)
// ============================================================

/**
 * §6.8 literal — Instrumento C fechado (apos corte ou ja enviado sem
 * desbloqueio ativo). Unica mensagem literal explicitada no DOC 03; as
 * demais desta ME sao literais fixadas em S091 desta ME.
 */
export const MSG_TRIMESTRE_FECHADO =
  'Instrumento C fechado para este trimestre. Solicite desbloqueio a Bruno se necessário.';

/** §6.1 — antes do dia 16 do ultimo mes do trimestre (S091). */
export const MSG_TRIMESTRE_NAO_ABERTO = 'Instrumento C ainda não disponível para este trimestre.';

/** §6.3 — 20 itens obrigatorios com valor 0-4 (S091). */
export const MSG_ITENS_INCOMPLETOS =
  'O Instrumento C exige 20 itens (4 dimensões x 5 itens) com valor entre 0 e 4.';

/** §6.3 — XOR liderId/clevelId (S091). */
export const MSG_AVALIADOR_XOR =
  'Informe apenas um avaliador: liderId (líder colaborador) ou clevelId (líder C-level).';

/** §6.3 — vinculo direto ativo (RH/Bruno pulam — S091). */
export const MSG_LIDER_NAO_DIRETO = 'Somente o líder direto atual pode avaliar este colaborador.';

/** §2.4 — colaborador de outra empresa (guard cruzado — S091). */
export const MSG_COMPANY_MISMATCH_EMP = 'Colaborador não pertence à sua empresa.';

/** §6.7 — pre-condicao do reopen (avaliacao previa) — S091. */
export const MSG_REOPEN_SEM_AVALIACAO =
  'Não há avaliação registrada para este colaborador neste trimestre.';

/** §6.7 — desbloqueio ja vigente (S091). */
export const MSG_REOPEN_JA_VIGENTE =
  'Já existe desbloqueio vigente para este colaborador neste trimestre.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/** §6.1 — trimestre canonico `YYYY-QN` (S092). */
export const TRIMESTRE_SCHEMA_INSTRUMENT_C = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
});

/** §6.3 — dimensao 1..4 (canonica). */
export const DIMENSAO_SCHEMA_INSTRUMENT_C = z.number().int().min(1).max(NUM_DIMENSOES);

/** §6.3 — itemIndex 1..5 (canonico, dentro da dimensao). */
export const ITEM_INDEX_SCHEMA_INSTRUMENT_C = z.number().int().min(1).max(NUM_ITENS_POR_DIMENSAO);

/** §6.3 — valor 0..4 (canonico). */
export const VALOR_SCHEMA_INSTRUMENT_C = z.number().int().min(VALOR_MIN).max(VALOR_MAX);

/** §6.3 — item unitario (dimensao, itemIndex, valor). */
export const ITEM_SCHEMA_INSTRUMENT_C = z.object({
  dimensao: DIMENSAO_SCHEMA_INSTRUMENT_C,
  itemIndex: ITEM_INDEX_SCHEMA_INSTRUMENT_C,
  valor: VALOR_SCHEMA_INSTRUMENT_C,
});

/** §2 — justificativa administrativa 100-500 (padrao canonico transversal). */
export const JUSTIFICATIVA_SCHEMA_INSTRUMENT_C = z
  .string()
  .min(100, { message: 'A justificativa deve ter no mínimo 100 caracteres.' })
  .max(500, { message: 'A justificativa deve ter no máximo 500 caracteres.' });

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/** §6.3 — resposta unitaria retornada por `getAssessment`. */
export interface RespostaInstrumentC {
  dimensao: number;
  itemIndex: number;
  valor: number;
  respondidoEm: Date | null;
}

/**
 * §6.3 + §6.7 — status canonico da janela do trimestre para o par
 * (employee, trimestre). `nao_aberta`: antes do dia 16 do ultimo mes;
 * `aberta`: dentro da janela normal; `fechada`: apos corte sem
 * desbloqueio ativo; `desbloqueada`: apos corte com
 * `instrumentUnlockLog` vigente.
 */
export const STATUS_JANELA_INSTRUMENT_C_VALUES = [
  'nao_aberta',
  'aberta',
  'fechada',
  'desbloqueada',
] as const;

/** Estado canonico da janela do trimestre. */
export type StatusJanelaInstrumentC = (typeof STATUS_JANELA_INSTRUMENT_C_VALUES)[number];

/**
 * Resumo canonico do desbloqueio vigente (janela ativa) — retornado por
 * `getAssessment` quando `statusJanela === 'desbloqueada'` OU quando ha
 * janela vigente independente do corte. `null` quando nao ha.
 */
export interface DesbloqueioVigenteResumo {
  unlockLogId: number;
  desbloqueadoPor: number;
  desbloqueadoEm: Date | null;
  expiraEm: Date;
  justificativa: string;
}

/** Retorno canonico de `getAssessment`. */
export interface GetAssessmentResult {
  companyId: number;
  employeeId: number;
  trimestre: string;
  statusJanela: StatusJanelaInstrumentC;
  respostas: RespostaInstrumentC[];
  avaliadorLiderId: number | null;
  avaliadorClevelId: number | null;
  respondidoEm: Date | null;
  desbloqueioVigente: DesbloqueioVigenteResumo | null;
  dataAbertura: Date;
  dataCorte: Date;
}

/** Retorno canonico de `saveInstrumentCAssessment`. */
export interface SaveInstrumentCAssessmentResult {
  companyId: number;
  employeeId: number;
  trimestre: string;
  itensGravados: number;
  operacao: 'insert' | 'overwrite';
  respondidoEm: Date;
}

/** Retorno canonico de `reopenAssessment`. */
export interface ReopenAssessmentResult {
  unlockLogId: number;
  expiraEm: Date;
}

/**
 * §6.8 quarta linha + S121 (ME-042) — status de coleta canonico de
 * uma pendencia do Instrumento C. `'atrasado'` quando `now`
 * ultrapassou a `dataCorte` canonica (§6.3 dia 10 do mes subsequente);
 * caso contrario, `'pendente'`. Semanticamente identico a
 * `StatusPendenciaInstrumentA` — replicado localmente para preservar
 * independencia entre routers de dominios distintos (padrao S092/S096
 * de nao cruzar imports entre routers de instrumentos).
 */
export const STATUS_PENDENCIA_INSTRUMENT_C_VALUES = ['pendente', 'atrasado'] as const;

/** Status canonico de uma pendencia no §6.8 quarta linha. */
export type StatusPendenciaInstrumentC = (typeof STATUS_PENDENCIA_INSTRUMENT_C_VALUES)[number];

/**
 * §6.8 quarta linha (ME-042) — item canonico da lista `pendencias`
 * do `getPendencies`. Representa um vinculo ATIVO em que o avaliador
 * (lider ou C-level) NAO preencheu a avaliacao do trimestre para o
 * liderado. Contem atributos canonicos do colaborador liderado
 * (`employeeId`, `nome`, `departamento`, `cargo`) e a identificacao
 * XOR do avaliador (`liderId` OU `clevelId`, mutuamente exclusivos —
 * padrao XOR canonico da tabela `employeeLeaderHistory`). `cargo`
 * mapeia a `employees.descricaoCBO` — mesmo criterio de
 * `getInstrumentAStatus` do router A (canonico do cargo do
 * colaborador comum; o campo `cargo` do schema pertence a
 * `cLevelMembers`, tabela separada). Colaboradores liderados por
 * C-level nao tem `liderId` no vinculo ativo; a estrutura XOR
 * expressa a fonte canonica do avaliador esperado.
 */
export interface InstrumentCPendencia {
  employeeId: number;
  nome: string;
  departamento: string;
  cargo: string;
  liderId: number | null;
  clevelId: number | null;
  status: StatusPendenciaInstrumentC;
}

/**
 * §6.8 quarta linha + §19.4 oitava linha — resultado canonico da
 * leitura de pendencias do C para (companyId, trimestre) no escopo
 * do titular. Escopo canonico por perfil (§6.8):
 *   - Bruno + RH + RH-Lider: todas as pendencias da empresa.
 *   - Lider: pendencias em que o lider e proprio titular
 *     (`employeeLeaderHistory.liderId = ctx.user.userId`).
 *   - C-level: pendencias em que o C-level e proprio titular
 *     (`employeeLeaderHistory.clevelId = ctx.user.userId`).
 * `total` = numero de vinculos ativos no escopo (bases do
 * denominador). `pendencias` sao os subset sem avaliacao registrada.
 * `respondidos = total - pendencias.length` (semantica: "pelo menos
 * uma avaliacao registrada no trimestre").
 */
export interface GetPendenciesResult {
  companyId: number;
  trimestre: string;
  total: number;
  respondidos: number;
  pendencias: InstrumentCPendencia[];
}

/**
 * §6.1 — schema local do trimestre para o `getPendencies`.
 * Redeclarado como constante local por precedente do repo (cada
 * router redeclara o proprio schema para evitar dependencia cruzada
 * entre routers). Reusa a mesma regex canonica `YYYY-QN`.
 */
export const TRIMESTRE_INPUT_SCHEMA_PENDENCIES = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
});

// ============================================================
// Dependencias injetaveis (S084 + S105 estendido — hook real ME-040)
// ============================================================

/**
 * Relogio injetavel para testes deterministicos. `plenitudeEngine`
 * injetavel via `PlenitudeEngineFacade` (S105 — S060 herdado do
 * `quarterlyCalculation` × `roiCalculationEngine`): producao usa
 * `DEFAULT_PLENITUDE_ENGINE`; testes injetam spy para asserir
 * acoplamento. O hook e chamado sincrono in-band FORA da transacao
 * de escrita (S102) — dentro forcaria `MySql2Transaction ×
 * MySql2Database`, padrao ja evitado no repo.
 */
export interface InstrumentCRouterDeps {
  now?: () => Date;
  plenitudeEngine?: PlenitudeEngineFacade;
}

interface ResolvedDeps {
  now: () => Date;
  plenitudeEngine: PlenitudeEngineFacade;
}

function resolveDeps(deps: InstrumentCRouterDeps): ResolvedDeps {
  return {
    now: deps.now ?? (() => new Date()),
    plenitudeEngine: deps.plenitudeEngine ?? DEFAULT_PLENITUDE_ENGINE,
  };
}

// ============================================================
// Guards e helpers canonicos
// ============================================================

/**
 * Guard canonico cruzado (§2.4): super_admin atravessa; demais roles
 * cruzam contra o `companyId` do proprio JWT. Reusado por todas as
 * procedures deste router; `reopenAssessment` sempre atravessa por ser
 * exclusivo de super_admin, mas o guard existe para documentar a
 * invariante.
 */
function assertCompanyScope(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Acesso negado ao instrumento desta empresa.',
    });
  }
}

/**
 * Resolve o `superAdminId` do titular. Usado por `reopenAssessment` (proc
 * exclusiva de super_admin — §6.7).
 */
function requireSuperAdminId(user: AuthenticatedUser): number {
  if (user.role !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Esta operação é exclusiva do Super Admin.',
    });
  }
  return user.superAdminId;
}

/**
 * Verifica que a lista de itens do submit cobre exatamente as 20
 * combinacoes canonicas (dimensao 1..4 x itemIndex 1..5), sem duplicatas
 * e sem lacunas. Retorna `true` se cobre; `false` caso contrario. A
 * validacao de valor 0-4 e de tipo esta no Zod schema; aqui olhamos
 * apenas cobertura das chaves.
 */
function itensCobremGridCanonico(
  itens: readonly { dimensao: number; itemIndex: number }[],
): boolean {
  if (itens.length !== NUM_ITENS_TOTAL) {
    return false;
  }
  const chaves = new Set<string>();
  for (const item of itens) {
    chaves.add(`${item.dimensao}-${item.itemIndex}`);
  }
  if (chaves.size !== NUM_ITENS_TOTAL) {
    return false;
  }
  for (let d = 1; d <= NUM_DIMENSOES; d++) {
    for (let i = 1; i <= NUM_ITENS_POR_DIMENSAO; i++) {
      if (!chaves.has(`${d}-${i}`)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Resolve o `instrumentUnlockLog` do tipo 'C' vigente (`expiraEm > now`)
 * para o par (employeeId, trimestre), se houver. Ordenado por
 * `desbloqueadoEm DESC, id DESC` — o mais recente vence (analogo ao
 * padrao S060 do monthlyUnlockLog). Retorna `undefined` quando nao ha
 * janela vigente.
 */
async function findVigenteInstrumentUnlockC(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
  now: Date,
) {
  const rows = await db
    .select()
    .from(instrumentUnlockLog)
    .where(
      and(
        eq(instrumentUnlockLog.employeeId, employeeId),
        eq(instrumentUnlockLog.trimestre, trimestre),
        eq(instrumentUnlockLog.instrumento, 'C'),
        gt(instrumentUnlockLog.expiraEm, now),
      ),
    )
    .orderBy(desc(instrumentUnlockLog.desbloqueadoEm), desc(instrumentUnlockLog.id))
    .limit(1);
  return rows[0];
}

/**
 * §6.8 quarta linha + S121 — classifica status pendente segundo o
 * corte canonico do trimestre para o Instrumento C. Semanticamente
 * identico ao helper analogo do router A (`classifyStatusPendenciaA`),
 * mas replicado localmente para preservar independencia entre routers
 * de dominios distintos (padrao S092/S096). Retorna `'atrasado'`
 * quando `now` ultrapassou a `dataCorte` canonica (§6.3 dia 10 do
 * mes subsequente); caso contrario, `'pendente'`.
 */
export function classifyStatusPendenciaC(
  trimestre: string,
  timeZone: string,
  now: Date,
): StatusPendenciaInstrumentC {
  const parsed = parseTrimestreCicloReferencia(trimestre);
  if (!parsed) {
    return 'pendente';
  }
  const dataCorte = getInstrumentoABDataCorte(parsed.ano, parsed.trimestre, timeZone);
  return now.getTime() > dataCorte.getTime() ? 'atrasado' : 'pendente';
}

/**
 * §6.8 quarta linha + S066 (ME-042) — lista os vinculos ATIVOS
 * (`employeeLeaderHistory.dataFim IS NULL`) no escopo canonico do
 * titular:
 *   - Escopo empresa (Bruno, RH, RH-Lider): todos os vinculos ativos
 *     de colaboradores ATIVOS da empresa.
 *   - Escopo cadeia direta (Lider, C-level): apenas vinculos cujo
 *     `liderId` OU `clevelId` bate com o `ctx.user.userId` do
 *     titular.
 * Retorna cada linha com os atributos do liderado (`employeeId`,
 * `nome`, `departamento`, `descricaoCBO`) e a identificacao XOR do
 * avaliador esperado (`liderId`, `clevelId`).
 */
async function listActiveLeaderLinksScoped(
  db: RoipDatabase,
  companyId: number,
  scope:
    { role: 'empresa' } | { role: 'lider'; userId: number } | { role: 'clevel'; userId: number },
): Promise<
  {
    employeeId: number;
    nome: string;
    departamento: string;
    descricaoCBO: string;
    liderId: number | null;
    clevelId: number | null;
  }[]
> {
  const conditions = [
    eq(employees.companyId, companyId),
    eq(employees.status, 'ativo'),
    isNull(employeeLeaderHistory.dataFim),
  ];
  if (scope.role === 'lider') {
    conditions.push(eq(employeeLeaderHistory.liderId, scope.userId));
  } else if (scope.role === 'clevel') {
    conditions.push(eq(employeeLeaderHistory.clevelId, scope.userId));
  }
  return await db
    .select({
      employeeId: employees.id,
      nome: employees.name,
      departamento: employees.departamento,
      descricaoCBO: employees.descricaoCBO,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(...conditions))
    .orderBy(employees.id);
}

/**
 * Calcula o status canonico da janela do trimestre no `now` para uma
 * empresa (timezone da empresa). Considera desbloqueio vigente para
 * transicionar `fechada` → `desbloqueada`.
 */
function computeStatusJanela(
  now: Date,
  dataAbertura: Date,
  dataCorte: Date,
  temDesbloqueioVigente: boolean,
): StatusJanelaInstrumentC {
  if (now < dataAbertura) {
    return 'nao_aberta';
  }
  if (now <= dataCorte) {
    return 'aberta';
  }
  return temDesbloqueioVigente ? 'desbloqueada' : 'fechada';
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `instrumentC` com dependencias injetadas
 * (S084 + S105 estendido). Producao chama sem argumentos — defaults
 * sao relogio (`() => new Date()`) e motor de plenitude
 * (`DEFAULT_PLENITUDE_ENGINE`, ME-040). Testes injetam `now` fixo e
 * `plenitudeEngine` spy para determinismo e assertividade do
 * acoplamento. O hook e chamado sincrono in-band FORA da transacao
 * de escrita — apos INSERT e OVERWRITE — para consumir A + C do
 * (employeeId, trimestre) e upsertar `plenitudeData` (§6.4).
 */
export function createInstrumentCRouter(deps: InstrumentCRouterDeps = {}) {
  const resolved = resolveDeps(deps);

  return router({
    /**
     * §6.3 + §6.8 — grava a avaliacao do Instrumento C em transacao
     * atomica dos 20 itens. Semantica canonica de submit repetido
     * (S090): sem avaliacao previa -> INSERT; com avaliacao previa e
     * `instrumentUnlockLog` vigente -> OVERWRITE linha a linha; sem
     * desbloqueio vigente -> 409 `MSG_TRIMESTRE_FECHADO`. Legivel por
     * qualquer perfil administrativo com validacao de vinculo (RH/
     * super_admin pulam). Perfis `lider`/`clevel` submetem em nome
     * proprio (input.liderId ou input.clevelId DEVE bater com
     * ctx.user.userId).
     */
    saveInstrumentCAssessment: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z
          .object({
            companyId: z.number().int().positive(),
            employeeId: z.number().int().positive(),
            liderId: z.number().int().positive().optional(),
            clevelId: z.number().int().positive().optional(),
            trimestre: TRIMESTRE_SCHEMA_INSTRUMENT_C,
            respostas: z.array(ITEM_SCHEMA_INSTRUMENT_C),
          })
          .refine((data) => (data.liderId ? 1 : 0) + (data.clevelId ? 1 : 0) === 1, {
            message: MSG_AVALIADOR_XOR,
          }),
      )
      .mutation(async ({ ctx, input }): Promise<SaveInstrumentCAssessmentResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        // Validacao de cobertura canonica do grid 4x5 (§6.3).
        if (!itensCobremGridCanonico(input.respostas)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_ITENS_INCOMPLETOS });
        }

        // Colaborador deve existir e pertencer a companyId (§2.4).
        const [emp] = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        if (!emp || emp.companyId !== input.companyId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
        }

        // Regra canonica de vinculo (§6.3): RH e super_admin pulam.
        // Perfis lider/clevel submetem em nome proprio.
        if (input.liderId !== undefined) {
          const [lider] = await ctx.db
            .select()
            .from(employees)
            .where(eq(employees.id, input.liderId))
            .limit(1);
          if (!lider || lider.companyId !== input.companyId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_LIDER_NAO_DIRETO });
          }
          if (ctx.user.role === 'lider' || ctx.user.role === 'clevel') {
            // Perfil funcional deve ser o proprio liderId; clevel nao
            // submete via liderId (deve usar clevelId).
            if (ctx.user.role === 'clevel' || ctx.user.userId !== input.liderId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
            }
            const vinculo = await getActiveLeaderHistoryByEmployee(ctx.db, input.employeeId);
            if (!vinculo || vinculo.liderId !== input.liderId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
            }
          }
        } else if (input.clevelId !== undefined) {
          const [clevel] = await ctx.db
            .select()
            .from(cLevelMembers)
            .where(eq(cLevelMembers.id, input.clevelId))
            .limit(1);
          if (!clevel || clevel.companyId !== input.companyId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_LIDER_NAO_DIRETO });
          }
          if (ctx.user.role === 'lider' || ctx.user.role === 'clevel') {
            // Simetrico ao ramo lider: clevel funcional submete apenas
            // com o proprio clevelId; lider nao submete via clevelId.
            if (ctx.user.role === 'lider' || ctx.user.userId !== input.clevelId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
            }
            const vinculo = await getActiveLeaderHistoryByEmployee(ctx.db, input.employeeId);
            if (!vinculo || vinculo.clevelId !== input.clevelId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: MSG_LIDER_NAO_DIRETO });
            }
          }
        }

        // Resolve a janela canonica do trimestre no timezone da empresa
        // (§6.1). `parseTrimestreCicloReferencia` valida o formato ja
        // aceito pelo Zod, entao a resposta e sempre truthy aqui.
        const [comp] = await ctx.db
          .select({ timezone: companies.timezone })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (!comp) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
        }
        const parsed = parseTrimestreCicloReferencia(input.trimestre);
        if (!parsed) {
          // Cinto de seguranca — o regex do Zod ja pega isso.
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
          });
        }
        const dataAbertura = getInstrumentoABDataAbertura(
          parsed.ano,
          parsed.trimestre,
          comp.timezone,
        );
        const dataCorte = getInstrumentoABDataCorte(parsed.ano, parsed.trimestre, comp.timezone);
        const now = resolved.now();

        // §6.1 — antes do dia 16 do ultimo mes -> nao aberto.
        if (now < dataAbertura) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_TRIMESTRE_NAO_ABERTO });
        }

        // Verifica avaliacao previa. Se ha item, ou o desbloqueio esta
        // vigente e faz OVERWRITE, ou rejeita como fechado (S090).
        const jaExistemRows = await ctx.db
          .select({ id: instrumentC_assessments.id })
          .from(instrumentC_assessments)
          .where(
            and(
              eq(instrumentC_assessments.employeeId, input.employeeId),
              eq(instrumentC_assessments.trimestre, input.trimestre),
            ),
          )
          .limit(1);
        const jaExiste = jaExistemRows.length > 0;

        const desbloqueioVigente = await findVigenteInstrumentUnlockC(
          ctx.db,
          input.employeeId,
          input.trimestre,
          now,
        );

        if (jaExiste) {
          if (!desbloqueioVigente) {
            throw new TRPCError({ code: 'CONFLICT', message: MSG_TRIMESTRE_FECHADO });
          }
          // OVERWRITE — 20 UPDATEs por chave logica em transacao atomica.
          await ctx.db.transaction(async (tx) => {
            for (const item of input.respostas) {
              await tx
                .update(instrumentC_assessments)
                .set({ valor: item.valor, respondidoEm: now })
                .where(
                  and(
                    eq(instrumentC_assessments.employeeId, input.employeeId),
                    eq(instrumentC_assessments.trimestre, input.trimestre),
                    eq(instrumentC_assessments.dimensao, item.dimensao),
                    eq(instrumentC_assessments.itemIndex, item.itemIndex),
                  ),
                );
            }
          });
          // Hook canonico ME-040 (§6.4): motor de plenitude in-band FORA
          // da transacao (S102). O motor le A e C do trio canonico e
          // upserta `plenitudeData` — se A tambem esta completo,
          // preenche scores; senao, mantem scores nulos (§6.4 literal).
          // Reexecucao idempotente canonica.
          await resolved.plenitudeEngine.recalculatePlenitude(
            ctx.db,
            input.companyId,
            input.employeeId,
            input.trimestre,
            now,
          );
          return {
            companyId: input.companyId,
            employeeId: input.employeeId,
            trimestre: input.trimestre,
            itensGravados: NUM_ITENS_TOTAL,
            operacao: 'overwrite' as const,
            respondidoEm: now,
          };
        }

        // Sem avaliacao previa: primeiro envio. §6.1 exige `now >=
        // dataAbertura` (ja garantido acima) E `now <= dataCorte` (a
        // menos que exista desbloqueio vigente — cenario raro mas
        // canonico: Bruno pode reabrir "para receber pela primeira vez"
        // apos corte, §6.7 combinado com §6.3).
        if (now > dataCorte && !desbloqueioVigente) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_TRIMESTRE_FECHADO });
        }

        await ctx.db.transaction(async (tx) => {
          for (const item of input.respostas) {
            await tx.insert(instrumentC_assessments).values({
              companyId: input.companyId,
              employeeId: input.employeeId,
              liderId: input.liderId ?? null,
              clevelId: input.clevelId ?? null,
              trimestre: input.trimestre,
              dimensao: item.dimensao,
              itemIndex: item.itemIndex,
              valor: item.valor,
              respondidoEm: now,
              createdAt: now,
            });
          }
        });
        // Hook canonico ME-040 (§6.4): motor de plenitude in-band FORA
        // da transacao (S102). O motor le A e C do trio canonico e
        // upserta `plenitudeData` — se A tambem esta completo (§6.2
        // acao 2 combinada com esta), preenche scores; senao, mantem
        // scores nulos (§6.4 literal). Reexecucao idempotente canonica.
        await resolved.plenitudeEngine.recalculatePlenitude(
          ctx.db,
          input.companyId,
          input.employeeId,
          input.trimestre,
          now,
        );
        return {
          companyId: input.companyId,
          employeeId: input.employeeId,
          trimestre: input.trimestre,
          itensGravados: NUM_ITENS_TOTAL,
          operacao: 'insert' as const,
          respondidoEm: now,
        };
      }),

    /**
     * §6.3 + §6.8 — leitura da avaliacao do (employee, trimestre).
     * Retorna as respostas ordenadas por (dimensao, itemIndex), o
     * avaliador (liderId XOR clevelId), status da janela e resumo do
     * desbloqueio vigente. Legivel por qualquer perfil administrativo
     * com guard cruzado companyId (§2.4). Nao filtra por vinculo (a
     * regra de visibilidade fina fica na superficie de tela — DOC 05
     * PC1d aplica-se ao agregado, nao a leitura individual do proprio
     * liderado).
     */
    getAssessment: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          employeeId: z.number().int().positive(),
          trimestre: TRIMESTRE_SCHEMA_INSTRUMENT_C,
        }),
      )
      .query(async ({ ctx, input }): Promise<GetAssessmentResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        const [comp] = await ctx.db
          .select({ timezone: companies.timezone })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (!comp) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
        }
        const parsed = parseTrimestreCicloReferencia(input.trimestre);
        if (!parsed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
          });
        }
        const dataAbertura = getInstrumentoABDataAbertura(
          parsed.ano,
          parsed.trimestre,
          comp.timezone,
        );
        const dataCorte = getInstrumentoABDataCorte(parsed.ano, parsed.trimestre, comp.timezone);
        const now = resolved.now();

        const respostasRows = await ctx.db
          .select()
          .from(instrumentC_assessments)
          .where(
            and(
              eq(instrumentC_assessments.employeeId, input.employeeId),
              eq(instrumentC_assessments.trimestre, input.trimestre),
            ),
          )
          .orderBy(instrumentC_assessments.dimensao, instrumentC_assessments.itemIndex);

        const respostas: RespostaInstrumentC[] = respostasRows.map((r) => ({
          dimensao: r.dimensao,
          itemIndex: r.itemIndex,
          valor: r.valor,
          respondidoEm: r.respondidoEm,
        }));

        // Avaliador vem da primeira linha (todas compartilham por
        // transacao atomica). Ausente quando nao ha respostas.
        const primeira = respostasRows[0];
        const avaliadorLiderId = primeira?.liderId ?? null;
        const avaliadorClevelId = primeira?.clevelId ?? null;
        const respondidoEm = primeira?.respondidoEm ?? null;

        const desbloqueioVigente = await findVigenteInstrumentUnlockC(
          ctx.db,
          input.employeeId,
          input.trimestre,
          now,
        );
        const statusJanela = computeStatusJanela(
          now,
          dataAbertura,
          dataCorte,
          !!desbloqueioVigente,
        );

        return {
          companyId: input.companyId,
          employeeId: input.employeeId,
          trimestre: input.trimestre,
          statusJanela,
          respostas,
          avaliadorLiderId,
          avaliadorClevelId,
          respondidoEm,
          desbloqueioVigente: desbloqueioVigente
            ? {
                unlockLogId: desbloqueioVigente.id,
                desbloqueadoPor: desbloqueioVigente.desbloqueadoPor,
                desbloqueadoEm: desbloqueioVigente.desbloqueadoEm,
                expiraEm: desbloqueioVigente.expiraEm,
                justificativa: desbloqueioVigente.justificativa,
              }
            : null,
          dataAbertura,
          dataCorte,
        };
      }),

    /**
     * §6.8 quarta linha + §19.4 oitava linha (ME-042) — leitura publica
     * de pendencias do Instrumento C por (companyId, trimestre) no
     * escopo canonico do titular. Retorna `{ total, respondidos,
     * pendencias: [...] }`. Escopo por perfil:
     *   - Bruno (super_admin): atravessa companyId; escopo empresa.
     *   - RH e RH-Lider: escopo empresa (companyId do JWT).
     *   - Lider: vinculos ativos em que `liderId` = titular.
     *   - C-level: vinculos ativos em que `clevelId` = titular.
     * `total` conta vinculos ativos elegiveis no escopo do titular
     * (denominador). `pendencias` sao os vinculos em que o avaliador
     * esperado ainda nao registrou nenhuma linha de
     * `instrumentC_assessments` no trimestre. `pendencia.status`
     * classificado por `classifyStatusPendenciaC` contra a
     * `dataCorte` canonica no fuso da empresa (S121).
     * `respondidos = total - pendencias.length` — semantica:
     * "pelo menos uma linha de avaliacao registrada no trimestre".
     */
    getPendencies: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA_PENDENCIES,
        }),
      )
      .query(async ({ ctx, input }): Promise<GetPendenciesResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        assertCompanyScope(ctx.user, input.companyId);

        // Resolve o fuso canonico da empresa para o corte de status.
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
            message: 'Empresa não encontrada.',
          });
        }
        const timeZone = company.timezone ?? 'America/Sao_Paulo';

        // Resolve escopo de vinculos ativos segundo o perfil.
        let scope:
          | { role: 'empresa' }
          | { role: 'lider'; userId: number }
          | { role: 'clevel'; userId: number };
        if (
          ctx.user.role === 'super_admin' ||
          ctx.user.role === 'rh' ||
          ctx.user.role === 'rh_lider'
        ) {
          scope = { role: 'empresa' };
        } else if (ctx.user.role === 'lider') {
          scope = { role: 'lider', userId: ctx.user.userId };
        } else {
          scope = { role: 'clevel', userId: ctx.user.userId };
        }

        const links = await listActiveLeaderLinksScoped(ctx.db, input.companyId, scope);
        if (links.length === 0) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            total: 0,
            respondidos: 0,
            pendencias: [],
          };
        }

        const employeeIds = links.map((link) => link.employeeId);

        // Distinct employeeId com PELO MENOS UMA linha de avaliacao
        // registrada no trimestre (semantica: uma linha por
        // (employeeId, trimestre, dimensao, itemIndex); 20 por
        // avaliacao completa). Distinct por employeeId basta para
        // `respondidos: pelo menos uma linha registrada`.
        const respondedRows = await ctx.db
          .selectDistinct({ employeeId: instrumentC_assessments.employeeId })
          .from(instrumentC_assessments)
          .where(
            and(
              eq(instrumentC_assessments.companyId, input.companyId),
              eq(instrumentC_assessments.trimestre, input.trimestre),
              inArray(instrumentC_assessments.employeeId, employeeIds),
            ),
          );
        const respondedSet = new Set<number>(respondedRows.map((row) => row.employeeId));

        const now = resolved.now();
        const statusCanonico = classifyStatusPendenciaC(input.trimestre, timeZone, now);

        const pendencias: InstrumentCPendencia[] = [];
        for (const link of links) {
          if (respondedSet.has(link.employeeId)) {
            continue;
          }
          pendencias.push({
            employeeId: link.employeeId,
            nome: link.nome,
            departamento: link.departamento,
            cargo: link.descricaoCBO,
            liderId: link.liderId,
            clevelId: link.clevelId,
            status: statusCanonico,
          });
        }

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          total: links.length,
          respondidos: links.length - pendencias.length,
          pendencias,
        };
      }),

    /**
     * §6.7 — desbloqueio manual DIRETO por Bruno (exclusivo super_admin).
     * Cria linha em `instrumentUnlockLog` com `instrumento='C'`,
     * `expiraEm=now+24h`, `houveAlteracao=false`. Pre-condicoes:
     * avaliacao previa existente (`MSG_REOPEN_SEM_AVALIACAO`) e ausencia
     * de janela vigente para o mesmo par (`MSG_REOPEN_JA_VIGENTE`).
     * Justificativa canonica 100-500 (§2). Nao transiciona nenhum flag
     * na tabela de avaliacoes — o reopen abre a janela por 24h e o
     * `saveInstrumentCAssessment` faz OVERWRITE dentro dela (S090).
     */
    reopenAssessment: roleProcedure(['super_admin'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          employeeId: z.number().int().positive(),
          trimestre: TRIMESTRE_SCHEMA_INSTRUMENT_C,
          justificativa: JUSTIFICATIVA_SCHEMA_INSTRUMENT_C,
        }),
      )
      .mutation(async ({ ctx, input }): Promise<ReopenAssessmentResult> => {
        const superAdminId = requireSuperAdminId(ctx.user);
        const now = resolved.now();
        const expiraEm = new Date(now.getTime() + UNLOCK_WINDOW_MS);

        // §2.4 — guard cruzado. Colaborador deve pertencer a companyId.
        const [emp] = await ctx.db
          .select()
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        if (!emp || emp.companyId !== input.companyId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EMP });
        }

        // §6.7 — pre-condicao: avaliacao previa. Sem registro, nao ha o
        // que reabrir. Bruno pode "abrir antecipadamente" via envio
        // direto (RH/super_admin pulam vinculo), nao via reopen.
        const [previa] = await ctx.db
          .select({ id: instrumentC_assessments.id })
          .from(instrumentC_assessments)
          .where(
            and(
              eq(instrumentC_assessments.employeeId, input.employeeId),
              eq(instrumentC_assessments.trimestre, input.trimestre),
            ),
          )
          .limit(1);
        if (!previa) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_REOPEN_SEM_AVALIACAO });
        }

        // §6.7 — nao empilha janelas. Se ha desbloqueio vigente, rejeita
        // 409 (o Bruno aguarda ou o job de expiracao ME futura fecha).
        const vigente = await findVigenteInstrumentUnlockC(
          ctx.db,
          input.employeeId,
          input.trimestre,
          now,
        );
        if (vigente) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_REOPEN_JA_VIGENTE });
        }

        // INSERT canonico em instrumentUnlockLog (§6.7).
        const [inserted] = await ctx.db
          .insert(instrumentUnlockLog)
          .values({
            companyId: input.companyId,
            employeeId: input.employeeId,
            trimestre: input.trimestre,
            instrumento: 'C',
            desbloqueadoPor: superAdminId,
            justificativa: input.justificativa,
            desbloqueadoEm: now,
            expiraEm,
            houveAlteracao: false,
            ajusteRetroativo: false,
            createdAt: now,
          })
          .$returningId();
        if (!inserted) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Falha ao registrar o desbloqueio (insert sem id).',
          });
        }
        return { unlockLogId: inserted.id, expiraEm };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type InstrumentCRouter = ReturnType<typeof createInstrumentCRouter>;
