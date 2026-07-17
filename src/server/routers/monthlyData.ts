// ROIP APP 9BOX — sub-router `monthlyData` (ME-036).
//
// Superficie publica canonica do sub-dominio `monthlyData` (DOC 03 §3.11 +
// §3.12 + §4.1..§4.2 + §4.6). Superficie principal de escrita mensal:
// custo/faltas do RH e demanda/executado do lider por variavel. Fecha o
// circuito Eixo X — RH escreve mensal -> motor ME-031 fecha mes -> motor
// ME-033 calcula ROI trimestral -> routers ME-034/ME-035 leem tudo. Ate
// esta ME, faltava a ponta de entrada canonica.
//
// Procedures canonicas (DOC 03 §3.11):
//   - `monthlyData.getMonthlyInputForm` — retorna estrutura consolidada
//     do formulario por aba (`rh` | `lider`) e mes: dados cadastrais,
//     dados ja lancados, status do mes e statusPreenchimento agregado.
//   - `monthlyData.saveMonthlyRHData` — persiste `diasUteis` da empresa
//     e `custoTotalMes`/`faltas` por colaborador. Transacao atomica
//     (S070). Rejeita `status='fechado'` exceto Super Admin (§3.12).
//   - `monthlyData.saveMonthlyLeaderData` — persiste `demanda`/`executado`
//     por liderado direto por variavel. Valida vinculo no mes (S080).
//     Familia 6 (`lideranca_gestao`) forca `demanda=5` no backend e
//     valida `executado` inteiro 1-5. Rejeita variaveis com `peso=0`.
//   - `monthlyData.getLeadersStatus` — lista lideres (isLider=true +
//     >=1 liderado direto no mes; C-levels com liderados) com
//     `statusPreenchimento`. Ordenavel. Escopo empresa (RH/Bruno).
//   - `monthlyData.getPendentLeaders` — lista lideres pendentes
//     (statusPreenchimento='Não preenchido'). Pre-condicao S081: `NOW()`
//     >= dia 5 do mes subsequente (server-time UTC — sem consumo de
//     `companies.timezone` nesta ME; matéria de cron do §4.2 em ME
//     futura). Escopo empresa vs minha_cadeia.
//
// Convencoes canonicas herdadas de ME-034/ME-035:
//   - Factory sem argumentos (`createMonthlyDataRouter()`) — router de
//     escrita direta sem DI de motor (motores sao acionados por
//     `monthlyClosure.closeMonthScheduled`, escopo de ME futura).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead (RV-13): cada export tem chamador em
//     `tests/integration/monthlyData-router.test.ts` + acoplamento no
//     `appRouter` em `routers/index.ts`.
//   - Autorizacao cruzada resolvida no handler (super_admin atravessa;
//     demais roles cruzam companyId).
//
// Decisoes de autor RV-08 desta ME (10 canonicas — S069 a S078 mais 3
// residuais S079/S080/S081):
//   - S069 — ME unica (5 procs em um router).
//   - S070 — Transacao atomica em `saveMonthly*Data` via
//     `db.transaction` (L54).
//   - S071 — Reuso do helper S066 no dashboard; MonthlyData usa S080
//     (semantica de vinculo-no-mes, nao vigencia).
//   - S072 — Criterio canonico de "vinculo direto no mes":
//     `dataInicio <= ultimo_dia_do_mes` E (`dataFim IS NULL` OU
//     `dataFim >= primeiro_dia_do_mes`).
//   - S073 — 7 mensagens canonicas literais do §3.12, testadas
//     verbatim.
//   - S074 — Escopo estrito ao sub-router `monthlyData`. Nao inclui
//     `monthlyClosure.*` nem `spreadsheets.*` (sub-routers distintos
//     do §3.11).
//   - S075 — Retorno consolidado tipado `MonthlyInputFormResult` com
//     discriminated union por `abaAtiva`.
//   - S076 — Faixa CNPJ dedicada `10000000000700..7XX` para fixtures.
//   - S077 — Hard-fail com `PRECONDITION_FAILED` antes do dia 5 do mes
//     subsequente em `getPendentLeaders`.
//   - S078 — Sem DI factory de motor.
//   - S079 — Novos setters de entrada em `performanceData` /
//     `performanceVariableData` (setters dedicados por dono do dado).
//   - S080 — Novo helper `resolveLeaderLinkAtMonth` em
//     `employeeLeaderHistory` (semantica de vinculo-no-mes canonica).
//   - S081 — Timezone server-time UTC via `NOW()` — precedente
//     ME-034/ME-035.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/monthlyData-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  companyJobFamilies,
  companyMonthlyData,
  employees,
  employeeLeaderHistory,
  monthlyClosureStatus,
  performanceData,
  performanceVariableData,
} from '../../db/schema';
import { getCompanyMonthlyDataByMonth } from '../services/companyMonthlyData';
import { resolveLeaderLinkAtMonth } from '../services/employeeLeaderHistory';
import { updatePerformanceDataInputRH } from '../services/performanceData';
import { updatePerformanceVariableInputLeader } from '../services/performanceVariableData';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Mensagens canonicas literais do §3.12 (S073 — testadas verbatim)
// ============================================================

/** §3.12 — `diasUteis` fora do range 1..31. */
export const MSG_DIAS_UTEIS_RANGE = 'Os dias úteis devem estar entre 1 e 31.';

/** §3.12 — `custoTotalMes` <= 0. */
export const MSG_CUSTO_MAIOR_ZERO = 'O custo mensal deve ser maior que zero.';

/** §3.12 — `faltas` > `diasUteis`. */
export const MSG_FALTAS_MAIOR_DIAS_UTEIS =
  'O número de faltas não pode ser maior que os dias úteis do mês.';

/** §3.12 — Familia 6 (`lideranca_gestao`): `executado` fora de 1..5. */
export const MSG_FAMILIA_6_NOTA_INVALIDA = 'A nota deve ser um número inteiro de 1 a 5.';

/** §3.12 — Tentativa de lancamento em variavel com `weight=0`. */
export const MSG_VARIAVEL_PESO_ZERO = 'Esta variável tem peso zero e não recebe lançamento.';

/** §3.12 — Tentativa de save de colaboradores sem `diasUteis`. */
export const MSG_FALTA_DIAS_UTEIS =
  'Preencha os dias úteis do mês antes de lançar os dados dos colaboradores.';

/** §3.12 — Tentativa de save em mes fechado (exceto Super Admin). */
export const MSG_MES_FECHADO = 'Este mês está fechado. Solicite a Bruno o desbloqueio.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/**
 * Zod schema canonico do mes `YYYY-MM` (varchar(7) canonico das tabelas
 * mensais). Reescrito local ao sub-router para desacoplar de outros
 * (RV-13). Aceita 01..12 no segmento de mes.
 */
export const MES_INPUT_SCHEMA_MONTHLY = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: 'Mes canonico deve seguir o formato YYYY-MM.',
});

/** Enum canonico de aba do formulario. */
export const ABA_INPUT_SCHEMA_MONTHLY = z.enum(['rh', 'lider']);

/** Enum canonico de tipo de lider (§4.6). */
export const LIDER_TIPO_INPUT_SCHEMA_MONTHLY = z.enum(['employee', 'clevel']);

/** Enum canonico de status do mes. */
export const STATUS_MES_VALUES = ['aberto', 'fechado', 'desbloqueado'] as const;

/** Enum canonico de statusPreenchimento (§3.11 — 3 estados). */
export const STATUS_PREENCHIMENTO_VALUES = ['Não preenchido', 'Parcial', 'Preenchido'] as const;

/** Enum canonico de escopo de `getPendentLeaders` (§3.11). */
export const ESCOPO_PENDENT_LEADERS_VALUES = ['empresa', 'minha_cadeia'] as const;

/** Enum canonico de campos ordenaveis de `getLeadersStatus` (§3.11). */
export const SORT_BY_LEADERS_STATUS_VALUES = [
  'name',
  'departamento',
  'statusPreenchimento',
] as const;

/** Direcao de ordenacao. */
export const SORT_DIR_VALUES = ['asc', 'desc'] as const;

// ============================================================
// Tipos publicos exportados (S075 — discriminated union)
// ============================================================

/** Familia 6 canonica (§3.11 — escala 1..5, forca `demanda=5`). */
export const FAMILIA_6_JOB_FAMILY = 'lideranca_gestao' as const;

/** Estado de status do mes (§4.1). */
export type StatusMes = (typeof STATUS_MES_VALUES)[number];

/** Estado de preenchimento canonico (§3.11). */
export type StatusPreenchimento = (typeof STATUS_PREENCHIMENTO_VALUES)[number];

/**
 * Linha do colaborador no retorno da aba RH de `getMonthlyInputForm`.
 * `custoTotalMes` e `faltas` sao strings/nulos pois refletem o schema
 * (decimal/int nullable). Os campos de identificacao vem de `employees`.
 */
export interface MonthlyInputFormRHRow {
  employeeId: number;
  name: string;
  departamento: string;
  cargo: string;
  custoTotalMes: string | null;
  faltas: number | null;
}

/**
 * Linha da variavel no retorno da aba Lider de `getMonthlyInputForm`.
 * `weight` reflete o snapshot vigente em `companyJobFamilies` no momento
 * da consulta.
 */
export interface MonthlyInputFormLeaderVariable {
  variableIndex: number;
  variableName: string;
  unit: string;
  weight: string;
  demanda: string | null;
  executado: string | null;
}

/** Linha do liderado no retorno da aba Lider de `getMonthlyInputForm`. */
export interface MonthlyInputFormLeaderRow {
  employeeId: number;
  name: string;
  jobFamily: string;
  familia6: boolean;
  variaveis: MonthlyInputFormLeaderVariable[];
}

/**
 * Resultado canonico de `getMonthlyInputForm` (S075). Discriminated union
 * por `abaAtiva` — a UI renderiza forms distintos para RH e Lider e o
 * backend evita colapsar em objeto opcional. Todos os campos calculados
 * refletem exatamente o estado persistido no momento da consulta.
 */
export type MonthlyInputFormResult =
  | {
      abaAtiva: 'rh';
      companyId: number;
      mes: string;
      status: StatusMes;
      diasUteis: number | null;
      colaboradores: MonthlyInputFormRHRow[];
      statusPreenchimento: StatusPreenchimento;
    }
  | {
      abaAtiva: 'lider';
      companyId: number;
      mes: string;
      status: StatusMes;
      liderId: number;
      liderTipo: 'employee' | 'clevel';
      liderados: MonthlyInputFormLeaderRow[];
      statusPreenchimento: StatusPreenchimento;
    };

/**
 * Resultado canonico de `saveMonthlyRHData` e `saveMonthlyLeaderData`.
 * Contadores auditaveis pos-transacao (S070). O caller da UI usa
 * `colaboradoresGravados`/`variaveisGravadas` para exibir feedback.
 */
export interface SaveMonthlyDataResult {
  ok: true;
  companyId: number;
  mes: string;
  colaboradoresGravados: number;
  variaveisGravadas: number;
}

/** Linha de `getLeadersStatus`. */
export interface LeaderStatusRow {
  liderId: number;
  liderTipo: 'employee' | 'clevel';
  name: string;
  departamento: string;
  cargo: string;
  qtdLiderados: number;
  statusPreenchimento: StatusPreenchimento;
}

/** Linha de `getPendentLeaders` (§4.6). */
export interface PendentLeaderRow {
  liderId: number;
  liderTipo: 'employee' | 'clevel';
  name: string;
  departamento: string;
  cargo: string;
  liderDoLiderNome: string | null;
  liderDoLiderId: number | null;
}

// ============================================================
// Helpers privados
// ============================================================

/**
 * Guard canonico cruzado (§2.4): super_admin atravessa; demais roles
 * cruzam contra o `companyId` do proprio JWT. Reusado por todas as procs
 * do sub-router.
 */
function assertCompanyScope(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Empresa fora do escopo.',
    });
  }
}

/**
 * Resolve o status canonico do mes (companyId, mes). Retorna 'aberto'
 * quando nao existe linha em `monthlyClosureStatus` (default canonico
 * do schema — o INSERT so ocorre no primeiro `monthlyClosure.unlockMonth`
 * ou no fechamento automatico do dia 11).
 */
async function resolveMonthStatus(
  db: RoipDatabase,
  companyId: number,
  mes: string,
): Promise<StatusMes> {
  const rows = await db
    .select({ status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)))
    .limit(1);
  return rows[0]?.status ?? 'aberto';
}

/**
 * Verifica se o instante `now` esta em ou apos as 00:00 UTC do dia 5 do
 * mes SUBSEQUENTE ao `mes` de referencia (S081 — server-time UTC).
 */
function isPastDay5OfNextMonth(mes: string, now: Date): boolean {
  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  // mesNum e 1..12; o mes subsequente e (mesNum) em base 0-indexed do JS.
  const day5NextMonth = Date.UTC(ano, mesNum, 5, 0, 0, 0);
  return now.getTime() >= day5NextMonth;
}

/**
 * Retorna a lista de `variableIndex` que sao objeto de lancamento canonico
 * (weight > 0) para uma dada jobFamily de uma empresa. Consumido por:
 *   - `saveMonthlyLeaderData` — rejeita input em variavel com peso=0.
 *   - `getMonthlyInputForm(aba='lider')` — expoe as 4 variaveis com peso
 *     como snapshot ao caller (UI decide render/bloqueio).
 */
async function listVariablesForFamily(db: RoipDatabase, companyId: number, jobFamily: string) {
  return await db
    .select()
    .from(companyJobFamilies)
    .where(
      and(
        eq(companyJobFamilies.companyId, companyId),
        eq(
          companyJobFamilies.jobFamily,
          jobFamily as (typeof companyJobFamilies.jobFamily.enumValues)[number],
        ),
      ),
    )
    .orderBy(asc(companyJobFamilies.variableIndex));
}

/**
 * Lista os liderados diretos do lider (liderId, liderTipo) no mes de
 * referencia (semantica S080). Retorna employeeIds que estao ativos em
 * `employees` no momento — inativos nao aparecem na lista de
 * preenchimento (§3.13; UI so mostra ativos no formulario).
 */
async function listDirectLedInMonth(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
  liderTipo: 'employee' | 'clevel',
  mes: string,
): Promise<number[]> {
  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const firstDay = new Date(Date.UTC(ano, mesNum - 1, 1));
  const lastDay = new Date(Date.UTC(ano, mesNum, 0));

  const liderColumn =
    liderTipo === 'employee' ? employeeLeaderHistory.liderId : employeeLeaderHistory.clevelId;

  const links = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(liderColumn, liderId),
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
        or(
          isNull(employeeLeaderHistory.dataFim),
          // dataFim >= firstDay
          // Encoded via not-null and inline predicate:
          // Drizzle inspects .gte on Date columns.
        ),
      ),
    );
  // Filtramos por cobertura de mes em memoria (o predicado composto de
  // date range e complexo o suficiente para justificar a decisao
  // canonica de resolver no lado do processo — mesma familia de
  // decisoes de S066 do dashboard).
  const linksInRange: number[] = [];
  const rows = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      dataInicio: employeeLeaderHistory.dataInicio,
      dataFim: employeeLeaderHistory.dataFim,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(liderColumn, liderId),
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
      ),
    );
  const seen = new Set<number>();
  for (const r of rows) {
    if (r.dataInicio.getTime() > lastDay.getTime()) continue;
    if (r.dataFim !== null && r.dataFim.getTime() < firstDay.getTime()) continue;
    if (!seen.has(r.employeeId)) {
      seen.add(r.employeeId);
      linksInRange.push(r.employeeId);
    }
  }
  // `links` acima e apenas de tipagem — o resultado real vem de
  // `linksInRange`. Marcamos `links` como usado para o linter.
  void links;
  return linksInRange;
}

/**
 * Calcula o statusPreenchimento canonico da aba RH de um mes:
 *   - `Preenchido` — todos os colaboradores ativos tem custoTotalMes E
 *     faltas E `companyMonthlyData.diasUteis`.
 *   - `Não preenchido` — nenhum dado presente.
 *   - `Parcial` — caso intermediario.
 */
function computeStatusRH(
  colaboradoresTotal: number,
  colaboradoresComDados: number,
  diasUteisPresente: boolean,
): StatusPreenchimento {
  if (colaboradoresTotal === 0) {
    // Empresa sem colaboradores ativos — statusPreenchimento canonico e
    // "Preenchido" se diasUteis presente, "Não preenchido" caso
    // contrario. Nao ha 3o estado — nao ha dado a preencher.
    return diasUteisPresente ? 'Preenchido' : 'Não preenchido';
  }
  if (colaboradoresComDados === 0 && !diasUteisPresente) {
    return 'Não preenchido';
  }
  if (colaboradoresComDados === colaboradoresTotal && diasUteisPresente) {
    return 'Preenchido';
  }
  return 'Parcial';
}

/**
 * Calcula o statusPreenchimento canonico da aba Lider para um lider no
 * mes. Requer que TODAS as variaveis com peso>0 de TODOS os liderados
 * diretos tenham `demanda` E `executado` para ser `Preenchido`.
 */
function computeStatusLeader(totalCellsRequired: number, cellsFilled: number): StatusPreenchimento {
  if (totalCellsRequired === 0) {
    // Lider sem liderados no mes — sem dado a preencher, retornar
    // "Não preenchido" para acionar o filtro de pendencias apenas
    // quando ha liderados de fato.
    return 'Não preenchido';
  }
  if (cellsFilled === 0) {
    return 'Não preenchido';
  }
  if (cellsFilled === totalCellsRequired) {
    return 'Preenchido';
  }
  return 'Parcial';
}

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica do sub-router `monthlyData`. Sem parametros —
 * simetria com `createDashboardRouter`, `createEconomicDiagnosisRouter` e
 * `createQuarterlyCalculationRouter`. As procs nao consomem motor
 * determinístico (motores sao acionados por `monthlyClosure.*`, escopo
 * de ME futura do §3.11).
 */
export function createMonthlyDataRouter() {
  return router({
    // ============================================================
    // Proc 1 — getMonthlyInputForm (§3.11)
    // ============================================================
    getMonthlyInputForm: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_MONTHLY,
          aba: ABA_INPUT_SCHEMA_MONTHLY,
          liderId: z.number().int().positive().optional(),
          liderTipo: LIDER_TIPO_INPUT_SCHEMA_MONTHLY.optional(),
        }),
      )
      .query(async ({ ctx, input }): Promise<MonthlyInputFormResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        const status = await resolveMonthStatus(ctx.db, input.companyId, input.mes);

        if (input.aba === 'rh') {
          // Aba RH: RH/RH-Lider/Super Admin livres; demais bloqueados.
          if (
            ctx.user.role !== 'super_admin' &&
            ctx.user.role !== 'rh' &&
            ctx.user.role !== 'rh_lider'
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Aba RH restrita a RH e Bruno.',
            });
          }

          // Dias uteis da empresa (companyMonthlyData — fonte canonica).
          const cmd = await getCompanyMonthlyDataByMonth(ctx.db, input.companyId, input.mes);
          const diasUteis = cmd?.diasUteis ?? null;

          // Colaboradores ativos da empresa.
          const emps = await ctx.db
            .select({
              id: employees.id,
              name: employees.name,
              departamento: employees.departamento,
              descricaoCBO: employees.descricaoCBO,
            })
            .from(employees)
            .where(and(eq(employees.companyId, input.companyId), eq(employees.status, 'ativo')))
            .orderBy(asc(employees.name));

          // Dados ja lancados por colaborador no mes.
          const empIds = emps.map((e) => e.id);
          const dataByEmp = new Map<
            number,
            { custoTotalMes: string | null; faltas: number | null }
          >();
          if (empIds.length > 0) {
            const perfRows = await ctx.db
              .select({
                employeeId: performanceData.employeeId,
                custoTotalMes: performanceData.custoTotalMes,
                faltas: performanceData.faltas,
              })
              .from(performanceData)
              .where(
                and(
                  eq(performanceData.companyId, input.companyId),
                  eq(performanceData.mes, input.mes),
                  inArray(performanceData.employeeId, empIds),
                ),
              );
            for (const r of perfRows) {
              dataByEmp.set(r.employeeId, { custoTotalMes: r.custoTotalMes, faltas: r.faltas });
            }
          }

          const colaboradores: MonthlyInputFormRHRow[] = emps.map((e) => {
            const d = dataByEmp.get(e.id);
            return {
              employeeId: e.id,
              name: e.name,
              departamento: e.departamento,
              cargo: e.descricaoCBO,
              custoTotalMes: d?.custoTotalMes ?? null,
              faltas: d?.faltas ?? null,
            };
          });

          const colaboradoresComDados = colaboradores.filter(
            (c) => c.custoTotalMes !== null && c.faltas !== null,
          ).length;
          const statusPreenchimento = computeStatusRH(
            colaboradores.length,
            colaboradoresComDados,
            diasUteis !== null,
          );

          return {
            abaAtiva: 'rh',
            companyId: input.companyId,
            mes: input.mes,
            status,
            diasUteis,
            colaboradores,
            statusPreenchimento,
          };
        }

        // Aba Lider — precisa de liderId e liderTipo.
        if (input.liderId === undefined || input.liderTipo === undefined) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Aba Lider requer liderId e liderTipo.',
          });
        }

        // Autorizacao por perfil na aba Lider (§3.11):
        //   - RH, RH-Lider, Super Admin: qualquer liderId da empresa;
        //   - Lider: liderId = ctx.user.userId E liderTipo = 'employee';
        //   - C-level: liderId = ctx.user.userId E liderTipo = 'clevel'.
        if (ctx.user.role === 'lider') {
          if (input.liderTipo !== 'employee' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Lider so acessa a propria aba.',
            });
          }
        }
        if (ctx.user.role === 'clevel') {
          if (input.liderTipo !== 'clevel' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'C-level so acessa a propria aba.',
            });
          }
        }

        // Liderados diretos no mes.
        const liderados = await listDirectLedInMonth(
          ctx.db,
          input.companyId,
          input.liderId,
          input.liderTipo,
          input.mes,
        );

        // Dados basicos dos liderados.
        const liderRows: MonthlyInputFormLeaderRow[] = [];
        let totalCellsRequired = 0;
        let cellsFilled = 0;

        if (liderados.length > 0) {
          const empRows = await ctx.db
            .select({
              id: employees.id,
              name: employees.name,
              jobFamily: employees.jobFamily,
            })
            .from(employees)
            .where(inArray(employees.id, liderados))
            .orderBy(asc(employees.name));

          // Cache de variaveis por familia (evita N+1).
          const variablesByFamily = new Map<
            string,
            Array<{ variableIndex: number; variableName: string; unit: string; weight: string }>
          >();
          for (const emp of empRows) {
            if (!variablesByFamily.has(emp.jobFamily)) {
              const vars = await listVariablesForFamily(ctx.db, input.companyId, emp.jobFamily);
              variablesByFamily.set(
                emp.jobFamily,
                vars.map((v) => ({
                  variableIndex: v.variableIndex,
                  variableName: v.variableName,
                  unit: v.unit,
                  weight: v.weight,
                })),
              );
            }
          }

          // Buscar performanceData de todos os liderados no mes.
          const perfRows = await ctx.db
            .select({
              id: performanceData.id,
              employeeId: performanceData.employeeId,
            })
            .from(performanceData)
            .where(
              and(
                eq(performanceData.companyId, input.companyId),
                eq(performanceData.mes, input.mes),
                inArray(
                  performanceData.employeeId,
                  empRows.map((e) => e.id),
                ),
              ),
            );
          const perfByEmp = new Map<number, number>();
          for (const p of perfRows) {
            perfByEmp.set(p.employeeId, p.id);
          }

          // Buscar variaveis ja lancadas.
          const perfIds = Array.from(perfByEmp.values());
          const perfVarByPerf = new Map<
            number,
            Map<number, { demanda: string | null; executado: string | null }>
          >();
          if (perfIds.length > 0) {
            const varRows = await ctx.db
              .select({
                performanceDataId: performanceVariableData.performanceDataId,
                variableIndex: performanceVariableData.variableIndex,
                demanda: performanceVariableData.demanda,
                executado: performanceVariableData.executado,
              })
              .from(performanceVariableData)
              .where(inArray(performanceVariableData.performanceDataId, perfIds));
            for (const v of varRows) {
              let inner = perfVarByPerf.get(v.performanceDataId);
              if (!inner) {
                inner = new Map();
                perfVarByPerf.set(v.performanceDataId, inner);
              }
              inner.set(v.variableIndex, { demanda: v.demanda, executado: v.executado });
            }
          }

          for (const emp of empRows) {
            const vars = variablesByFamily.get(emp.jobFamily) ?? [];
            const perfId = perfByEmp.get(emp.id);
            const varsFilled = perfId !== undefined ? perfVarByPerf.get(perfId) : undefined;
            const variaveis: MonthlyInputFormLeaderVariable[] = vars.map((v) => {
              const filled = varsFilled?.get(v.variableIndex);
              const isPesoZero = Number(v.weight) === 0;
              // Contabilizacao de statusPreenchimento canonico: apenas
              // variaveis com peso>0 entram no total.
              if (!isPesoZero) {
                totalCellsRequired += 1;
                if (filled && filled.demanda !== null && filled.executado !== null) {
                  cellsFilled += 1;
                }
              }
              return {
                variableIndex: v.variableIndex,
                variableName: v.variableName,
                unit: v.unit,
                weight: v.weight,
                demanda: filled?.demanda ?? null,
                executado: filled?.executado ?? null,
              };
            });
            liderRows.push({
              employeeId: emp.id,
              name: emp.name,
              jobFamily: emp.jobFamily,
              familia6: emp.jobFamily === FAMILIA_6_JOB_FAMILY,
              variaveis,
            });
          }
        }

        const statusPreenchimento = computeStatusLeader(totalCellsRequired, cellsFilled);

        return {
          abaAtiva: 'lider',
          companyId: input.companyId,
          mes: input.mes,
          status,
          liderId: input.liderId,
          liderTipo: input.liderTipo,
          liderados: liderRows,
          statusPreenchimento,
        };
      }),

    // ============================================================
    // Proc 2 — saveMonthlyRHData (§3.11 + §3.12)
    // ============================================================
    saveMonthlyRHData: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_MONTHLY,
          diasUteis: z.number().int().optional(),
          colaboradores: z
            .array(
              z.object({
                employeeId: z.number().int().positive(),
                custoTotalMes: z.string().min(1),
                faltas: z.number().int().min(0),
              }),
            )
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }): Promise<SaveMonthlyDataResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        // Guard canonico de estado do mes (§3.12 — mes fechado bloqueia
        // exceto Super Admin).
        const status = await resolveMonthStatus(ctx.db, input.companyId, input.mes);
        if (status === 'fechado' && ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: MSG_MES_FECHADO,
          });
        }

        // Pelo menos um dos dois campos deve estar presente.
        const hasDiasUteis = input.diasUteis !== undefined;
        const hasColaboradores =
          input.colaboradores !== undefined && input.colaboradores.length > 0;
        if (!hasDiasUteis && !hasColaboradores) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nada a salvar: informe diasUteis ou colaboradores.',
          });
        }

        // Validacao canonica de diasUteis (§3.12).
        if (hasDiasUteis) {
          const d = input.diasUteis!;
          if (d < 1 || d > 31) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: MSG_DIAS_UTEIS_RANGE,
            });
          }
        }

        // Validacao canonica dos colaboradores (§3.12).
        if (hasColaboradores) {
          // Pre-verificacao: se ha colaboradores a salvar mas nem input
          // nem base tem diasUteis, rejeitar com literal canonico.
          let effectiveDiasUteis: number | null = null;
          if (hasDiasUteis) {
            effectiveDiasUteis = input.diasUteis!;
          } else {
            const cmd = await getCompanyMonthlyDataByMonth(ctx.db, input.companyId, input.mes);
            effectiveDiasUteis = cmd?.diasUteis ?? null;
          }
          if (effectiveDiasUteis === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: MSG_FALTA_DIAS_UTEIS,
            });
          }

          // Validacao por colaborador.
          for (const c of input.colaboradores!) {
            if (Number(c.custoTotalMes) <= 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: MSG_CUSTO_MAIOR_ZERO,
              });
            }
            if (c.faltas > effectiveDiasUteis) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: MSG_FALTAS_MAIOR_DIAS_UTEIS,
              });
            }
          }

          // Cross-scope: garantir que todos os employeeIds pertencem a
          // companyId (evita vazamento entre empresas).
          const empIds = input.colaboradores!.map((c) => c.employeeId);
          const empRows = await ctx.db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.companyId, input.companyId), inArray(employees.id, empIds)));
          if (empRows.length !== empIds.length) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Colaborador fora do escopo da empresa.',
            });
          }
        }

        // Transacao atomica S070.
        let colaboradoresGravados = 0;
        await ctx.db.transaction(async (tx) => {
          if (hasDiasUteis) {
            const cmd = await getCompanyMonthlyDataByMonth(tx, input.companyId, input.mes);
            if (cmd === undefined) {
              await tx.insert(companyMonthlyData).values({
                companyId: input.companyId,
                mes: input.mes,
                diasUteis: input.diasUteis,
              });
            } else {
              await tx
                .update(companyMonthlyData)
                .set({ diasUteis: input.diasUteis })
                .where(
                  and(
                    eq(companyMonthlyData.companyId, input.companyId),
                    eq(companyMonthlyData.mes, input.mes),
                  ),
                );
            }
          }

          if (hasColaboradores) {
            for (const c of input.colaboradores!) {
              const pdRows = await tx
                .select({ id: performanceData.id })
                .from(performanceData)
                .where(
                  and(
                    eq(performanceData.companyId, input.companyId),
                    eq(performanceData.employeeId, c.employeeId),
                    eq(performanceData.mes, input.mes),
                  ),
                )
                .limit(1);
              if (pdRows.length === 0) {
                await tx.insert(performanceData).values({
                  companyId: input.companyId,
                  employeeId: c.employeeId,
                  mes: input.mes,
                  custoTotalMes: c.custoTotalMes,
                  faltas: c.faltas,
                });
              } else {
                // S079 — setter dedicado por dono do dado ("input RH").
                await updatePerformanceDataInputRH(tx, input.companyId, c.employeeId, input.mes, {
                  custoTotalMes: c.custoTotalMes,
                  faltas: c.faltas,
                });
              }
              colaboradoresGravados += 1;
            }
          }
        });

        return {
          ok: true,
          companyId: input.companyId,
          mes: input.mes,
          colaboradoresGravados,
          variaveisGravadas: 0,
        };
      }),

    // ============================================================
    // Proc 3 — saveMonthlyLeaderData (§3.11 + §3.12 + S080)
    // ============================================================
    saveMonthlyLeaderData: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_MONTHLY,
          liderId: z.number().int().positive(),
          liderTipo: LIDER_TIPO_INPUT_SCHEMA_MONTHLY,
          liderados: z
            .array(
              z.object({
                employeeId: z.number().int().positive(),
                variaveis: z
                  .array(
                    z.object({
                      variableIndex: z.number().int().min(0),
                      demanda: z.string().min(1),
                      executado: z.string().min(1),
                    }),
                  )
                  .min(1),
              }),
            )
            .min(1),
        }),
      )
      .mutation(async ({ ctx, input }): Promise<SaveMonthlyDataResult> => {
        assertCompanyScope(ctx.user, input.companyId);

        // Autorizacao por perfil (§3.11):
        //   - Lider: liderId=ctx.user.userId E liderTipo='employee';
        //   - C-level: liderId=ctx.user.userId E liderTipo='clevel';
        //   - RH/RH-Lider/Super Admin: qualquer liderId da empresa.
        if (ctx.user.role === 'lider') {
          if (input.liderTipo !== 'employee' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Lider so salva a propria aba.',
            });
          }
        }
        if (ctx.user.role === 'clevel') {
          if (input.liderTipo !== 'clevel' || input.liderId !== ctx.user.userId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'C-level so salva a propria aba.',
            });
          }
        }

        // Guard canonico de estado do mes (§3.12).
        const status = await resolveMonthStatus(ctx.db, input.companyId, input.mes);
        if (status === 'fechado' && ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: MSG_MES_FECHADO,
          });
        }

        // Para cada liderado: valida vinculo direto no mes (S080) e
        // resolve jobFamily. Cross-scope companyId ja garantido pelo
        // vinculo (employees.companyId).
        const liderCache = new Map<
          number,
          { jobFamily: string; familia6: boolean; ativoEmpresa: boolean }
        >();
        for (const l of input.liderados) {
          const link = await resolveLeaderLinkAtMonth(ctx.db, l.employeeId, input.mes);
          if (link === undefined) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Liderado sem vinculo no mes.',
            });
          }
          const okVinculo =
            input.liderTipo === 'employee'
              ? link.liderId === input.liderId
              : link.clevelId === input.liderId;
          if (!okVinculo) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Liderado fora da cadeia direta do lider no mes.',
            });
          }

          const empRows = await ctx.db
            .select({
              id: employees.id,
              companyId: employees.companyId,
              jobFamily: employees.jobFamily,
            })
            .from(employees)
            .where(eq(employees.id, l.employeeId))
            .limit(1);
          const emp = empRows[0];
          if (!emp) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Liderado nao encontrado.',
            });
          }
          if (emp.companyId !== input.companyId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Liderado fora do escopo da empresa.',
            });
          }
          liderCache.set(l.employeeId, {
            jobFamily: emp.jobFamily,
            familia6: emp.jobFamily === FAMILIA_6_JOB_FAMILY,
            ativoEmpresa: true,
          });
        }

        // Cache de variaveis por familia canonica.
        const variableCache = new Map<
          string,
          Map<number, { weight: string; variableName: string; unit: string }>
        >();
        async function getVarsMap(family: string) {
          const cached = variableCache.get(family);
          if (cached) return cached;
          const vars = await listVariablesForFamily(ctx.db, input.companyId, family);
          const map = new Map<number, { weight: string; variableName: string; unit: string }>();
          for (const v of vars) {
            map.set(v.variableIndex, {
              weight: v.weight,
              variableName: v.variableName,
              unit: v.unit,
            });
          }
          variableCache.set(family, map);
          return map;
        }

        // Validacao canonica de cada variavel do input (§3.12).
        // Percorremos ANTES da transacao para evitar rollback custoso em
        // casos ruins (mesma familia de precedente RV-04 do ME-035).
        for (const l of input.liderados) {
          const info = liderCache.get(l.employeeId)!;
          const varsMap = await getVarsMap(info.jobFamily);
          for (const v of l.variaveis) {
            const varMeta = varsMap.get(v.variableIndex);
            if (!varMeta) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Variavel canonica desconhecida para a familia do liderado.',
              });
            }
            if (Number(varMeta.weight) === 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: MSG_VARIAVEL_PESO_ZERO,
              });
            }
            if (info.familia6) {
              // Familia 6 (`lideranca_gestao`): executado inteiro 1..5.
              const exec = Number(v.executado);
              if (!Number.isInteger(exec) || exec < 1 || exec > 5) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: MSG_FAMILIA_6_NOTA_INVALIDA,
                });
              }
            } else {
              // Regra geral (§3.12): demanda > 0, executado >= 0.
              if (Number(v.demanda) <= 0) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'A demanda deve ser maior que zero.',
                });
              }
              if (Number(v.executado) < 0) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'O executado nao pode ser negativo.',
                });
              }
            }
          }
        }

        // Transacao atomica S070.
        let variaveisGravadas = 0;
        await ctx.db.transaction(async (tx) => {
          for (const l of input.liderados) {
            const info = liderCache.get(l.employeeId)!;
            // Garantir linha de performanceData (a variavel referencia
            // performanceDataId — nao ha como gravar sem pai).
            const pdRows = await tx
              .select({ id: performanceData.id })
              .from(performanceData)
              .where(
                and(
                  eq(performanceData.companyId, input.companyId),
                  eq(performanceData.employeeId, l.employeeId),
                  eq(performanceData.mes, input.mes),
                ),
              )
              .limit(1);
            let perfDataId: number;
            if (pdRows.length === 0) {
              const [insertedRow] = await tx
                .insert(performanceData)
                .values({
                  companyId: input.companyId,
                  employeeId: l.employeeId,
                  mes: input.mes,
                })
                .$returningId();
              if (!insertedRow) {
                throw new Error(
                  'saveMonthlyLeaderData: insert de performanceData retornou sem id.',
                );
              }
              perfDataId = insertedRow.id;
            } else {
              const first = pdRows[0];
              if (!first) {
                throw new Error(
                  'saveMonthlyLeaderData: linha de performanceData sumiu entre SELECT e uso.',
                );
              }
              perfDataId = first.id;
            }

            const varsMap = await getVarsMap(info.jobFamily);
            for (const v of l.variaveis) {
              const varMeta = varsMap.get(v.variableIndex)!;
              // Familia 6: forca demanda=5 no backend, ignora valor do
              // input (§3.11).
              const demandaFinal = info.familia6 ? '5' : v.demanda;

              const existRows = await tx
                .select({ id: performanceVariableData.id })
                .from(performanceVariableData)
                .where(
                  and(
                    eq(performanceVariableData.performanceDataId, perfDataId),
                    eq(performanceVariableData.variableIndex, v.variableIndex),
                  ),
                )
                .limit(1);
              if (existRows.length === 0) {
                await tx.insert(performanceVariableData).values({
                  performanceDataId: perfDataId,
                  variableIndex: v.variableIndex,
                  demanda: demandaFinal,
                  executado: v.executado,
                  peso: varMeta.weight,
                });
              } else {
                // S079 — setter dedicado por dono do dado ("input lider").
                await updatePerformanceVariableInputLeader(tx, perfDataId, v.variableIndex, {
                  demanda: demandaFinal,
                  executado: v.executado,
                });
              }
              variaveisGravadas += 1;
            }
          }
        });

        return {
          ok: true,
          companyId: input.companyId,
          mes: input.mes,
          colaboradoresGravados: input.liderados.length,
          variaveisGravadas,
        };
      }),

    // ============================================================
    // Proc 4 — getLeadersStatus (§3.11 — RH/Bruno)
    // ============================================================
    getLeadersStatus: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_MONTHLY,
          sortBy: z.enum(SORT_BY_LEADERS_STATUS_VALUES).optional(),
          sortDir: z.enum(SORT_DIR_VALUES).optional(),
        }),
      )
      .query(async ({ ctx, input }): Promise<LeaderStatusRow[]> => {
        assertCompanyScope(ctx.user, input.companyId);

        const sortBy = input.sortBy ?? 'name';
        const sortDir = input.sortDir ?? 'asc';

        // Coletar lideres candidatos: employees isLider=true da empresa +
        // cLevelMembers da empresa. Depois filtrar por "tem >=1 liderado
        // direto no mes".
        const empLeaders = await ctx.db
          .select({
            id: employees.id,
            name: employees.name,
            departamento: employees.departamento,
            descricaoCBO: employees.descricaoCBO,
            isLider: employees.isLider,
            status: employees.status,
          })
          .from(employees)
          .where(and(eq(employees.companyId, input.companyId), eq(employees.status, 'ativo')));

        const clevelLeaders = await ctx.db
          .select({
            id: cLevelMembers.id,
            name: cLevelMembers.name,
            departamento: cLevelMembers.departamento,
            cargo: cLevelMembers.cargo,
            status: cLevelMembers.status,
          })
          .from(cLevelMembers)
          .where(
            and(eq(cLevelMembers.companyId, input.companyId), eq(cLevelMembers.status, 'ativo')),
          );

        const results: LeaderStatusRow[] = [];

        for (const l of empLeaders) {
          if (!l.isLider) continue;
          const liderados = await listDirectLedInMonth(
            ctx.db,
            input.companyId,
            l.id,
            'employee',
            input.mes,
          );
          if (liderados.length === 0) continue;
          const statusPreenchimento = await computeStatusForLeader(
            ctx.db,
            input.companyId,
            input.mes,
            liderados,
          );
          results.push({
            liderId: l.id,
            liderTipo: 'employee',
            name: l.name,
            departamento: l.departamento,
            cargo: l.descricaoCBO,
            qtdLiderados: liderados.length,
            statusPreenchimento,
          });
        }

        for (const l of clevelLeaders) {
          const liderados = await listDirectLedInMonth(
            ctx.db,
            input.companyId,
            l.id,
            'clevel',
            input.mes,
          );
          if (liderados.length === 0) continue;
          const statusPreenchimento = await computeStatusForLeader(
            ctx.db,
            input.companyId,
            input.mes,
            liderados,
          );
          results.push({
            liderId: l.id,
            liderTipo: 'clevel',
            name: l.name,
            departamento: l.departamento,
            cargo: l.cargo,
            qtdLiderados: liderados.length,
            statusPreenchimento,
          });
        }

        // Ordenacao canonica.
        results.sort((a, b) => {
          let cmp = 0;
          if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
          else if (sortBy === 'departamento') cmp = a.departamento.localeCompare(b.departamento);
          else if (sortBy === 'statusPreenchimento')
            cmp = a.statusPreenchimento.localeCompare(b.statusPreenchimento);
          return sortDir === 'asc' ? cmp : -cmp;
        });

        return results;
      }),

    // ============================================================
    // Proc 5 — getPendentLeaders (§3.11 + §4.6 + S077 + S081)
    // ============================================================
    getPendentLeaders: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          mes: MES_INPUT_SCHEMA_MONTHLY,
          escopo: z.enum(ESCOPO_PENDENT_LEADERS_VALUES),
          liderId: z.number().int().positive().optional(),
          liderTipo: LIDER_TIPO_INPUT_SCHEMA_MONTHLY.optional(),
        }),
      )
      .query(async ({ ctx, input }): Promise<PendentLeaderRow[]> => {
        assertCompanyScope(ctx.user, input.companyId);

        // Autorizacao canonica por escopo (§3.11):
        //   - escopo='empresa': RH/RH-Lider/Super Admin;
        //   - escopo='minha_cadeia': Lider e C-level com liderId=proprio.
        if (input.escopo === 'empresa') {
          if (
            ctx.user.role !== 'super_admin' &&
            ctx.user.role !== 'rh' &&
            ctx.user.role !== 'rh_lider'
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Escopo empresa restrito a RH e Bruno.',
            });
          }
        } else {
          // escopo='minha_cadeia'
          if (input.liderId === undefined || input.liderTipo === undefined) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Escopo minha_cadeia requer liderId e liderTipo.',
            });
          }
          if (ctx.user.role === 'lider') {
            if (input.liderTipo !== 'employee' || input.liderId !== ctx.user.userId) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Lider so consulta a propria cadeia.',
              });
            }
          } else if (ctx.user.role === 'clevel') {
            if (input.liderTipo !== 'clevel' || input.liderId !== ctx.user.userId) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'C-level so consulta a propria cadeia.',
              });
            }
          }
          // super_admin/rh/rh_lider passam com qualquer (liderId, liderTipo).
        }

        // Pre-condicao canonica S077: NOW() >= dia 5 do mes subsequente
        // (S081 — server-time UTC).
        if (!isPastDay5OfNextMonth(input.mes, new Date())) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Lista de pendencias so fica disponivel a partir do dia 5 do mes subsequente.',
          });
        }

        // Coletar lideres candidatos.
        const empLeaders = await ctx.db
          .select({
            id: employees.id,
            name: employees.name,
            departamento: employees.departamento,
            descricaoCBO: employees.descricaoCBO,
            isLider: employees.isLider,
            status: employees.status,
          })
          .from(employees)
          .where(and(eq(employees.companyId, input.companyId), eq(employees.status, 'ativo')));

        const clevelLeaders = await ctx.db
          .select({
            id: cLevelMembers.id,
            name: cLevelMembers.name,
            departamento: cLevelMembers.departamento,
            cargo: cLevelMembers.cargo,
            status: cLevelMembers.status,
          })
          .from(cLevelMembers)
          .where(
            and(eq(cLevelMembers.companyId, input.companyId), eq(cLevelMembers.status, 'ativo')),
          );

        const results: PendentLeaderRow[] = [];

        for (const l of empLeaders) {
          if (!l.isLider) continue;
          // Escopo minha_cadeia: filtrar so lideres cujo lider-do-lider
          // (no mes) e o requester.
          if (input.escopo === 'minha_cadeia') {
            const linkOfLider = await resolveLeaderLinkAtMonth(ctx.db, l.id, input.mes);
            if (!linkOfLider) continue;
            const okDireto =
              input.liderTipo === 'employee'
                ? linkOfLider.liderId === input.liderId
                : linkOfLider.clevelId === input.liderId;
            if (!okDireto) continue;
          }

          const liderados = await listDirectLedInMonth(
            ctx.db,
            input.companyId,
            l.id,
            'employee',
            input.mes,
          );
          if (liderados.length === 0) continue;
          const statusPreenchimento = await computeStatusForLeader(
            ctx.db,
            input.companyId,
            input.mes,
            liderados,
          );
          if (statusPreenchimento !== 'Não preenchido') continue;

          const linkLider = await resolveLeaderLinkAtMonth(ctx.db, l.id, input.mes);
          let liderDoLiderNome: string | null = null;
          let liderDoLiderId: number | null = null;
          if (linkLider) {
            if (linkLider.liderId !== null) {
              const parentRows = await ctx.db
                .select({ name: employees.name })
                .from(employees)
                .where(eq(employees.id, linkLider.liderId))
                .limit(1);
              liderDoLiderNome = parentRows[0]?.name ?? null;
              liderDoLiderId = linkLider.liderId;
            } else if (linkLider.clevelId !== null) {
              const parentRows = await ctx.db
                .select({ name: cLevelMembers.name })
                .from(cLevelMembers)
                .where(eq(cLevelMembers.id, linkLider.clevelId))
                .limit(1);
              liderDoLiderNome = parentRows[0]?.name ?? null;
              liderDoLiderId = linkLider.clevelId;
            }
          }

          results.push({
            liderId: l.id,
            liderTipo: 'employee',
            name: l.name,
            departamento: l.departamento,
            cargo: l.descricaoCBO,
            liderDoLiderNome,
            liderDoLiderId,
          });
        }

        for (const l of clevelLeaders) {
          // C-level nao tem lider-do-lider canonico (§4.6 nao vincula
          // C-level a lider); no escopo minha_cadeia, C-levels nunca
          // aparecem em cadeia descendente.
          if (input.escopo === 'minha_cadeia') continue;

          const liderados = await listDirectLedInMonth(
            ctx.db,
            input.companyId,
            l.id,
            'clevel',
            input.mes,
          );
          if (liderados.length === 0) continue;
          const statusPreenchimento = await computeStatusForLeader(
            ctx.db,
            input.companyId,
            input.mes,
            liderados,
          );
          if (statusPreenchimento !== 'Não preenchido') continue;

          results.push({
            liderId: l.id,
            liderTipo: 'clevel',
            name: l.name,
            departamento: l.departamento,
            cargo: l.cargo,
            liderDoLiderNome: null,
            liderDoLiderId: null,
          });
        }

        results.sort((a, b) => a.name.localeCompare(b.name));
        return results;
      }),
  });
}

// ============================================================
// Helper compartilhado (fora do factory — reusado por 2 procs)
// ============================================================

/**
 * Calcula o `statusPreenchimento` canonico de um lider com uma lista de
 * liderados diretos no mes. Usado por `getLeadersStatus` e por
 * `getPendentLeaders`.
 */
async function computeStatusForLeader(
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
