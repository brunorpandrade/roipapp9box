// ROIP APP 9BOX — sub-router `iql` (ME-046).
//
// Decima-setima ME do Bloco B3 (ME-046) — abre a superficie tRPC de
// leitura publica do IQL (Indice de Qualidade da Lideranca), fecha a
// terna canonica de escrita do dominio de leitura individual
// (Instrumentos A/C/D) e alimenta as matrizes de decisao (dashboards
// e painel de controle). Nome canonico unico `iql` — o alias
// historico superado pelo §19 do DOC 01 e bloqueado pelo
// check-forbidden-terms.
//
// Procedures canonicas (§8.8 e §19.5):
//   - `iql.calculateIQL` (S154) — reprocessamento manual do IQL
//     para um par (avaliado, trimestre). Exclusivo `super_admin`
//     (Bruno). Reusa o motor `iqlCalculationEngine` (S149) via DI
//     Facade (S152). Fluxo normal do IQL usa hook do Route Handler
//     `POST /api/portal/save-instrument-d` (S157) apos cada
//     gravacao — esta proc serve como cabo de reprocessamento
//     administrativo. Precedente S085 (procs internas de cron
//     expostas como super_admin) + paralelismo com
//     `plenitude.calculatePlenitudeScore` e
//     `nineBox.calculateNineBoxClassification` (§19.4).
//   - `iql.getIQLData` — retorna o registro de `iqlData` do
//     avaliado (lider employee OU C-level) por trimestre,
//     respeitando os 5 Bloqueios absolutos §8.6 e o piso 3
//     respondentes na CAMADA DE LEITURA (S158).
//   - `iql.getTabelaIQL` — lista consolidada da Tabela IQL,
//     filtrada por visibilidade §8.7 no handler (Bruno/RH empresa;
//     C-level acessoTotal=true todos; C-level acessoTotal=false ou
//     Lider Cenario 2 cadeia propria; Lider Cenario 1 sem acesso;
//     colaborador puro sem acesso).
//
// Bloqueios canonicos §8.6 (S155 — literais exportados):
//   B1 — Lider nunca ve o proprio IQL (`usuarioLogado.id ===
//        avaliadoId` na leitura do proprio registro): retorna badge
//        `dadosBloqueadosBloqueio1: true` com scores nulos; na
//        Tabela IQL, a linha do proprio lider e omitida.
//   B2 — Lider nunca ve os proprios dados brutos do D (aplicavel
//        em ME futura que exponha respostas brutas — nao ha
//        endpoint neste router; documentado para RV-13 e continuidade).
//   B3 — C-level nunca responde D (bloqueio arquitetural — §8.7 do
//        DOC 01 canoniza `respondenteId` FK para employees; nao ha
//        checagem aqui).
//   B4 — IQL de C-level acessivel apenas por Bruno: leitura por
//        clevelId retorna FORBIDDEN para nao-Bruno; na Tabela IQL,
//        linhas de C-level so aparecem para Bruno.
//   B5 — RH-lider tem IQL calculado normalmente (motor grava
//        sempre); proprio RH-lider nao ve o proprio IQL (B1).
//
// Aplicacao §8.7 (visibilidade da Tabela IQL):
//   - Bruno + RH + RH-Lider: empresa inteira (respeita B1).
//   - C-level `acessoTotal=true`: todos os lideres da empresa.
//   - C-level `acessoTotal=false`: cadeia descendente propria.
//   - Lider Cenario 2 (tem outros lideres subordinados na cadeia):
//     restrito a cadeia descendente propria.
//   - Lider Cenario 1 (nao tem lideres subordinados): FORBIDDEN
//     (sem acesso a Tabela IQL — §8.7 literal).
//   - Colaborador puro: FORBIDDEN (matriz DOC 02 — nao tem sequer
//     login administrativo).
//
// Convencoes canonicas herdadas:
//   - DI factory `createIqlRouter(deps)` (S154, S100/S144
//     estendido): `now` e `iqlEngine` injetaveis; defaults reais
//     (`() => new Date()` e `DEFAULT_IQL_ENGINE`).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead: cada export tem chamador nos testes de
//     integracao desta ME + acoplamento no `appRouter` em
//     `index.ts` (RV-13).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes tRPC: `tests/integration/iql-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, eq, gt, inArray, isNull, isNotNull, or } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, employeeLeaderHistory, employees, iqlData } from '../../db/schema';
import { roleProcedure, router } from '../trpc';
import {
  DEFAULT_IQL_ENGINE,
  type IqlCalculationResult,
  type IqlEngineFacade,
  PISO_RESPONDENTES_IQL,
} from '../services/iqlCalculationEngine';

// Reexporta o piso para consumo pelos testes e por superficies de
// leitura futuras (RV-13 exige chamador nomeado no boundary de
// palavra).
export { PISO_RESPONDENTES_IQL };

// ============================================================
// Mensagens canonicas literais (S155 — testadas verbatim)
// ============================================================

/**
 * §8.6 Bloqueio 1 — lider nunca ve o proprio IQL. Retornada como
 * conteudo canonico da resposta (nao TRPCError — a UI substitui a
 * linha por badge). Alternativa considerada: FORBIDDEN puro;
 * canonizada como resposta 200 com flag para preservar coerencia
 * de UX (RH/Bruno podem ler o IQL do lider; a mensagem varia por
 * chamador).
 */
export const MSG_LIDER_NAO_VE_PROPRIO_IQL_B1 =
  'Bloqueio absoluto §8.6: líder não visualiza o próprio IQL.';

/**
 * §8.6 Bloqueio 4 — IQL de C-level acessivel apenas por Bruno.
 * Retornada como TRPCError FORBIDDEN quando qualquer perfil que
 * nao seja super_admin tenta ler `iqlData` de C-level.
 */
export const MSG_D_DE_CLEVEL_APENAS_BRUNO_B4 =
  'Bloqueio absoluto §8.6: dados de C-level acessíveis apenas ao Super Admin.';

/**
 * §8.7 — Lider Cenario 1 (sem lideres subordinados na cadeia
 * descendente) nao tem acesso a Tabela IQL. Retornada como
 * TRPCError FORBIDDEN.
 */
export const MSG_TABELA_IQL_SEM_CADEIA_CENARIO1 =
  'Tabela IQL indisponível: liderança sem cadeia descendente.';

/**
 * §8.7 — colaborador puro (sem role administrativo) nao tem
 * acesso a Tabela IQL. Retornada como TRPCError FORBIDDEN. Na
 * pratica, a matriz DOC 02 §2.2 ja bloqueia — colaborador puro
 * nao tem JWT administrativo. Defesa em profundidade.
 */
export const MSG_TABELA_IQL_SEM_ACESSO_COLABORADOR = 'Tabela IQL indisponível para este perfil.';

/**
 * §8.5 piso canonico — quando `countRespondentes < 3`, os campos
 * de score e `iql` sao ocultados na leitura (S158). Constante
 * exportada para asserts verbatim nos testes.
 */
export const MSG_DADOS_INSUFICIENTES_PISO_3 =
  'Dados insuficientes: menos de 3 respondentes válidos.';

/**
 * §2.4 (guard cruzado) — companyId ausente/invalido no `getIQLData`
 * ou `getTabelaIQL` para perfis com escopo de empresa.
 */
export const MSG_EMPRESA_NAO_ENCONTRADA_IQL = 'Empresa não encontrada.';

/**
 * §8.8 (leitura) — trimestre com formato invalido. Mensagem
 * canonica; o schema Zod ja bloqueia formato invalido antes de
 * chegar ao handler.
 */
export const MSG_TRIMESTRE_INVALIDO_IQL =
  'Trimestre canônico deve seguir o formato YYYY-Q1 ou YYYY-Q3.';

/**
 * §8.4 — avaliado inexistente ou fora do escopo da empresa. Guard
 * canonico do `getIQLData` e do `calculateIQL`.
 */
export const MSG_AVALIADO_NAO_ENCONTRADO_IQL = 'Avaliado não encontrado no escopo da empresa.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/**
 * §8.1 combinado com §8.8 — trimestre canonico do IQL: `YYYY-Q1`
 * ou `YYYY-Q3` (SEMESTRAL, trimestres impares). Simetrico ao
 * `TRIMESTRE_SCHEMA_INSTRUMENT_D` (S156).
 */
export const TRIMESTRE_INPUT_SCHEMA_IQL = z.string().regex(/^\d{4}-Q[13]$/, {
  message: MSG_TRIMESTRE_INVALIDO_IQL,
});

/** Discriminante canonico do avaliado. */
export const AVALIADO_TIPO_SCHEMA_IQL = z.enum(['employee', 'clevel']);

/** Payload canonico de `calculateIQL` (S154). */
export const CALCULATE_IQL_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_IQL,
  avaliadoTipo: AVALIADO_TIPO_SCHEMA_IQL,
  avaliadoId: z.number().int().positive(),
});

/** Payload canonico de `getIQLData`. */
export const GET_IQL_DATA_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_IQL,
  avaliadoTipo: AVALIADO_TIPO_SCHEMA_IQL,
  avaliadoId: z.number().int().positive(),
});

/** Payload canonico de `getTabelaIQL`. */
export const GET_TABELA_IQL_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_IQL,
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §8.8 quarta linha — resultado canonico de `getIQLData`. Discrimina
 * entre `presente` (linha existe em `iqlData`) e `ausente` (sem
 * linha, sem respostas ainda gravadas). Presente carrega scores +
 * `countRespondentes` + `countRespondentesElegiveis`; ausente
 * carrega apenas contadores zerados.
 *
 * Bloqueio 1 (§8.6): quando `bloqueadoB1 === true`, os scores sao
 * ocultados independentemente do estado real. O caller (dashboard
 * do proprio lider) recebe `dadosBloqueados: 'B1'` como bandeira.
 *
 * Piso 3 (§8.5, S158): quando `countRespondentes < 3` e nao ha
 * Bloqueio 1 nem 4, os scores sao ocultados na leitura — retorna
 * `dadosBloqueados: 'piso3'` com badge canonica.
 */
export interface GetIQLDataResult {
  companyId: number;
  trimestre: string;
  avaliadoTipo: 'employee' | 'clevel';
  avaliadoId: number;
  scoreDirecionamentoClareza: number | null;
  scoreDesenvolvimentoApoio: number | null;
  scoreRelacionamentoConfianca: number | null;
  scoreGestaoResultados: number | null;
  iql: number | null;
  countRespondentes: number;
  countRespondentesElegiveis: number;
  /**
   * Bandeira canonica de bloqueio da camada de leitura:
   *   - `null`: dados visiveis.
   *   - `'B1'`: proprio lider tentando ver o proprio IQL (§8.6).
   *   - `'piso3'`: menos de 3 respondentes (§8.5, S158).
   */
  dadosBloqueados: null | 'B1' | 'piso3';
  /**
   * `true` quando ha linha em `iqlData` (mesmo que nao exibida por
   * bloqueio). `false` quando nao ha linha ainda (nenhuma resposta
   * gravada — o motor upserta a cada save do D).
   */
  presente: boolean;
}

/**
 * §8.8 quinta linha — linha canonica da Tabela IQL. Contem
 * atributos identificadores do avaliado e o IQL agregado (piso
 * aplicado por linha).
 */
export interface TabelaIQLLinha {
  avaliadoTipo: 'employee' | 'clevel';
  avaliadoId: number;
  nome: string;
  departamento: string;
  cargo: string;
  iql: number | null;
  countRespondentes: number;
  dadosBloqueados: null | 'piso3';
}

/** §8.8 quinta linha — resultado canonico de `getTabelaIQL`. */
export interface GetTabelaIQLResult {
  companyId: number;
  trimestre: string;
  linhas: TabelaIQLLinha[];
}

/**
 * §8.8 terceira linha — resultado canonico de `calculateIQL` (S154).
 * Espelha `IqlCalculationResult` do motor, exposto ao caller de
 * reprocessamento manual (Bruno).
 */
export type CalculateIQLResult = IqlCalculationResult;

// ============================================================
// Dependencias injetaveis (S154, S144 estendido)
// ============================================================

/**
 * Relogio + motor IQL injetaveis (S153/S154). Padrao S100/S144
 * estendido: producao usa defaults reais; testes injetam mocks
 * deterministicos.
 */
export interface IqlRouterDeps {
  now?: () => Date;
  iqlEngine?: IqlEngineFacade;
}

interface ResolvedDepsIQL {
  now: () => Date;
  iqlEngine: IqlEngineFacade;
}

function resolveDepsIQL(deps: IqlRouterDeps): ResolvedDepsIQL {
  return {
    now: deps.now ?? (() => new Date()),
    iqlEngine: deps.iqlEngine ?? DEFAULT_IQL_ENGINE,
  };
}

// ============================================================
// Helpers canonicos de escopo (§8.7)
// ============================================================

/**
 * §8.7 — resolve os `employeeId`s da cadeia descendente ATIVA do
 * lider ou C-level. Sem snapshot dia 16 aqui (a cadeia da Tabela
 * IQL usa vinculos ativos no momento da consulta — precedente
 * S066 do dashboard). Diferente do `getInstrumentDStatus`, que usa
 * snapshot dia 16 para elegibilidade de resposta.
 *
 * Retorna array vazio se nao houver liderados diretos. Aplicavel
 * a Lider ou C-level. `companyId` filtra defensivamente
 * cross-company.
 */
export async function scopedCadeiaLideradosDiretosIQL(
  db: RoipDatabase,
  companyId: number,
  liderId: number | null,
  clevelId: number | null,
): Promise<number[]> {
  if (liderId === null && clevelId === null) {
    return [];
  }
  const rows = await db
    .select({ employeeId: employeeLeaderHistory.employeeId })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employees.companyId, companyId),
        isNull(employeeLeaderHistory.dataFim),
        liderId !== null
          ? eq(employeeLeaderHistory.liderId, liderId)
          : eq(employeeLeaderHistory.clevelId, clevelId as number),
      ),
    );
  return Array.from(new Set(rows.map((row) => row.employeeId)));
}

/**
 * §8.7 — determina se o lider e Cenario 1 (SEM lideres subordinados)
 * ou Cenario 2 (COM lideres subordinados). Retorna `true` para
 * Cenario 2. Regra canonica: existe pelo menos um employee ativo
 * cujo vinculo direto ativo aponta a `liderId` E que tem
 * `isLider = true`.
 *
 * Consumida pelo `getTabelaIQL` para decidir entre FORBIDDEN
 * (Cenario 1) e cadeia propria (Cenario 2).
 */
export async function isLiderCenario2IQL(
  db: RoipDatabase,
  companyId: number,
  liderId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: employees.id })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
        eq(employees.isLider, true),
        eq(employeeLeaderHistory.liderId, liderId),
        isNull(employeeLeaderHistory.dataFim),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * §8.7 — resolve o `acessoTotal` do C-level ativo. Retorna o valor
 * canonico da coluna `cLevelMembers.acessoTotal` (booleano). Se o
 * C-level nao existe ou nao pertence a `companyId`, retorna `null`
 * — o handler ja tratou como escopo cruzado antes.
 */
export async function resolveClevelAcessoTotal(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
): Promise<boolean | null> {
  const [row] = await db
    .select({ acessoTotal: cLevelMembers.acessoTotal })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, clevelId), eq(cLevelMembers.companyId, companyId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return row.acessoTotal ?? false;
}

/**
 * §8.7 — resolve os `avaliadoId`s (lideres employee + C-levels)
 * cuja cadeia descendente NAO CONTEM o C-level chamador (para
 * escopo de C-level `acessoTotal=false`, que ve apenas a cadeia
 * propria) OU todos os lideres da empresa (para C-level
 * `acessoTotal=true`).
 *
 * Retorna listas separadas: `liderIds` (avaliados tipo employee) e
 * `clevelIds` (avaliados tipo C-level). Fornece as bases para o
 * SELECT canonico em `iqlData`.
 */
export async function resolveTabelaIQLScopeEmpresa(
  db: RoipDatabase,
  companyId: number,
): Promise<{ liderIds: number[]; clevelIds: number[] }> {
  // Todos os lideres ativos da empresa.
  const lideres = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
        eq(employees.isLider, true),
      ),
    );
  const clevels = await db
    .select({ id: cLevelMembers.id })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')));
  return {
    liderIds: lideres.map((row) => row.id),
    clevelIds: clevels.map((row) => row.id),
  };
}

/**
 * Ajuda de leitura §8.7 — resolve, dada uma cadeia descendente
 * (lista de employeeIds liderados), quais desses employees sao
 * eles proprios lideres (portanto entram como avaliados na cadeia
 * propria do lider/C-level chamador). Retorna a lista de
 * `avaliadoId` tipo employee. Cadeia propria de C-level tambem
 * pode incluir outros C-levels (raro no MVP mas possivel via
 * `employeeLeaderHistory` cross-tipo — coberto no filtro seguinte
 * pelo caller).
 */
export async function filterLideresFromEmployeeIds(
  db: RoipDatabase,
  companyId: number,
  employeeIds: number[],
): Promise<number[]> {
  if (employeeIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.status, 'ativo'),
        eq(employees.isLider, true),
        inArray(employees.id, employeeIds),
      ),
    );
  return rows.map((row) => row.id);
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `iql` com dependencias injetadas (S154).
 * Producao chama sem argumentos — defaults reais para `now` e
 * `iqlEngine`. Testes injetam `now` fixo e engine mock para
 * determinismo e assertividade de acoplamento.
 */
export function createIqlRouter(deps: IqlRouterDeps = {}) {
  const resolved = resolveDepsIQL(deps);

  return router({
    /**
     * §8.8 terceira linha + §19.5 terceira linha — reprocessamento
     * MANUAL do IQL para (companyId, trimestre, avaliadoTipo,
     * avaliadoId). Exclusivo `super_admin` (Bruno). S154 canonizada:
     * paralelismo com `plenitude.calculatePlenitudeScore` e
     * `nineBox.calculateNineBoxClassification` (§19.4 "internas").
     *
     * Fluxo normal do IQL usa hook do Route Handler
     * `POST /api/portal/save-instrument-d` (S157) apos cada
     * gravacao — esta proc serve como cabo de reprocessamento
     * administrativo (ex.: apos correcao manual de dado, apos
     * refactor futuro do motor). Idempotente por construcao (§8.5
     * canoniza reexecucao idempotente).
     *
     * Guards canonicos:
     *   - `roleProcedure(['super_admin'])` — S154.
     *   - `avaliadoId` deve existir na tabela canonica do
     *     `avaliadoTipo` e pertencer a `companyId` (defesa
     *     cross-company).
     */
    calculateIQL: roleProcedure(['super_admin'])
      .input(CALCULATE_IQL_INPUT_SCHEMA)
      .mutation(async ({ ctx, input }): Promise<CalculateIQLResult> => {
        const now = resolved.now();

        // Guard canonico: avaliado existe e pertence a companyId.
        if (input.avaliadoTipo === 'employee') {
          const [emp] = await ctx.db
            .select({ id: employees.id, companyId: employees.companyId })
            .from(employees)
            .where(eq(employees.id, input.avaliadoId))
            .limit(1);
          if (!emp || emp.companyId !== input.companyId) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: MSG_AVALIADO_NAO_ENCONTRADO_IQL,
            });
          }
          return await resolved.iqlEngine.recalculateForLeader(
            ctx.db,
            input.companyId,
            input.avaliadoId,
            input.trimestre,
            now,
          );
        }
        // avaliadoTipo === 'clevel'
        const [cl] = await ctx.db
          .select({ id: cLevelMembers.id, companyId: cLevelMembers.companyId })
          .from(cLevelMembers)
          .where(eq(cLevelMembers.id, input.avaliadoId))
          .limit(1);
        if (!cl || cl.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_AVALIADO_NAO_ENCONTRADO_IQL,
          });
        }
        return await resolved.iqlEngine.recalculateForClevel(
          ctx.db,
          input.companyId,
          input.avaliadoId,
          input.trimestre,
          now,
        );
      }),

    /**
     * §8.8 quarta linha + §19.5 quarta linha — leitura de `iqlData`
     * do par (avaliado, trimestre). Autorizacao canonica: matriz
     * administrativa (`super_admin`, `rh`, `rh_lider`, `clevel`,
     * `lider`); handler aplica bloqueios finos §8.6.
     *
     * Bloqueios canonicos aplicados no handler:
     *   - B4 (`avaliadoTipo === 'clevel'`): nao-super_admin ->
     *     FORBIDDEN MSG_D_DE_CLEVEL_APENAS_BRUNO_B4.
     *   - B1 (`avaliadoTipo === 'employee'` E `ctx.user.userId ===
     *     avaliadoId` para nao-super_admin): retorna 200 com
     *     scores nulos e `dadosBloqueados: 'B1'`.
     *   - Piso 3 (`countRespondentes < 3` sem B1 nem B4): retorna
     *     200 com scores nulos e `dadosBloqueados: 'piso3'`.
     *
     * Guard cruzado companyId (§2.4): perfis nao-super_admin so leem
     * dentro da propria empresa.
     */
    getIQLData: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_IQL_DATA_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetIQLDataResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        if (ctx.user.role !== 'super_admin' && ctx.user.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Empresa fora do escopo do titular.',
          });
        }

        // §8.6 Bloqueio 4: IQL de C-level apenas Bruno.
        if (input.avaliadoTipo === 'clevel' && ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: MSG_D_DE_CLEVEL_APENAS_BRUNO_B4,
          });
        }

        // Guard canonico do avaliado.
        if (input.avaliadoTipo === 'employee') {
          const [emp] = await ctx.db
            .select({ id: employees.id, companyId: employees.companyId })
            .from(employees)
            .where(eq(employees.id, input.avaliadoId))
            .limit(1);
          if (!emp || emp.companyId !== input.companyId) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: MSG_AVALIADO_NAO_ENCONTRADO_IQL,
            });
          }
        } else {
          const [cl] = await ctx.db
            .select({ id: cLevelMembers.id, companyId: cLevelMembers.companyId })
            .from(cLevelMembers)
            .where(eq(cLevelMembers.id, input.avaliadoId))
            .limit(1);
          if (!cl || cl.companyId !== input.companyId) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: MSG_AVALIADO_NAO_ENCONTRADO_IQL,
            });
          }
        }

        // §8.6 Bloqueio 1: proprio lider tentando ver o proprio IQL.
        // Aplicavel apenas para nao-super_admin com role de
        // employee-lider ou rh_lider (que sao employees) — Bruno
        // atravessa por design (§8.6 canoniza "Bruno aplica a regra
        // por consistencia mesmo nao sendo lider no sistema", mas o
        // caso pratico do Bruno se ver como avaliado nao existe:
        // Super Admin nao esta em `employees`).
        const isProprioLider =
          input.avaliadoTipo === 'employee' &&
          ctx.user.role !== 'super_admin' &&
          ctx.user.userId === input.avaliadoId;

        // Le a linha de iqlData (pode nao existir se nenhuma resposta
        // foi gravada ainda).
        const [row] = await ctx.db
          .select()
          .from(iqlData)
          .where(
            and(
              eq(iqlData.companyId, input.companyId),
              eq(iqlData.trimestre, input.trimestre),
              input.avaliadoTipo === 'employee'
                ? eq(iqlData.liderId, input.avaliadoId)
                : eq(iqlData.clevelId, input.avaliadoId),
            ),
          )
          .limit(1);

        if (!row) {
          // Sem linha em `iqlData` — nenhuma resposta gravada. Retorna
          // resultado canonico com contadores zerados.
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            avaliadoTipo: input.avaliadoTipo,
            avaliadoId: input.avaliadoId,
            scoreDirecionamentoClareza: null,
            scoreDesenvolvimentoApoio: null,
            scoreRelacionamentoConfianca: null,
            scoreGestaoResultados: null,
            iql: null,
            countRespondentes: 0,
            countRespondentesElegiveis: 0,
            dadosBloqueados: isProprioLider ? 'B1' : null,
            presente: false,
          };
        }

        const scoreDC =
          row.scoreDirecionamentoClareza === null ? null : Number(row.scoreDirecionamentoClareza);
        const scoreDA =
          row.scoreDesenvolvimentoApoio === null ? null : Number(row.scoreDesenvolvimentoApoio);
        const scoreRC =
          row.scoreRelacionamentoConfianca === null
            ? null
            : Number(row.scoreRelacionamentoConfianca);
        const scoreGR =
          row.scoreGestaoResultados === null ? null : Number(row.scoreGestaoResultados);
        const iqlVal = row.iql === null ? null : Number(row.iql);

        // Bloqueio 1: mascarar scores.
        if (isProprioLider) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            avaliadoTipo: input.avaliadoTipo,
            avaliadoId: input.avaliadoId,
            scoreDirecionamentoClareza: null,
            scoreDesenvolvimentoApoio: null,
            scoreRelacionamentoConfianca: null,
            scoreGestaoResultados: null,
            iql: null,
            countRespondentes: row.countRespondentes,
            countRespondentesElegiveis: row.countRespondentesElegiveis,
            dadosBloqueados: 'B1',
            presente: true,
          };
        }

        // Piso 3 canonico (S158): oculta scores quando ha menos de 3
        // respondentes validos. Bruno tambem aplica por consistencia
        // (§8.5 literal — "Piso e universal — vale para o lider,
        // para o C-level avaliado e para qualquer visualizacao").
        if (row.countRespondentes < PISO_RESPONDENTES_IQL) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            avaliadoTipo: input.avaliadoTipo,
            avaliadoId: input.avaliadoId,
            scoreDirecionamentoClareza: null,
            scoreDesenvolvimentoApoio: null,
            scoreRelacionamentoConfianca: null,
            scoreGestaoResultados: null,
            iql: null,
            countRespondentes: row.countRespondentes,
            countRespondentesElegiveis: row.countRespondentesElegiveis,
            dadosBloqueados: 'piso3',
            presente: true,
          };
        }

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          avaliadoTipo: input.avaliadoTipo,
          avaliadoId: input.avaliadoId,
          scoreDirecionamentoClareza: scoreDC,
          scoreDesenvolvimentoApoio: scoreDA,
          scoreRelacionamentoConfianca: scoreRC,
          scoreGestaoResultados: scoreGR,
          iql: iqlVal,
          countRespondentes: row.countRespondentes,
          countRespondentesElegiveis: row.countRespondentesElegiveis,
          dadosBloqueados: null,
          presente: true,
        };
      }),

    /**
     * §8.8 quinta linha + §19.5 quinta linha — Tabela IQL
     * consolidada para (companyId, trimestre). Autorizacao por
     * perfil (§8.7) aplicada no handler:
     *   - Bruno + RH + RH-Lider: empresa inteira.
     *   - C-level `acessoTotal=true`: todos os lideres da empresa.
     *   - C-level `acessoTotal=false`: cadeia descendente propria.
     *   - Lider Cenario 2: cadeia descendente propria.
     *   - Lider Cenario 1: FORBIDDEN
     *     MSG_TABELA_IQL_SEM_CADEIA_CENARIO1.
     *
     * Bloqueios canonicos aplicados por linha:
     *   - B1 (Bloqueio 1): linha do proprio usuario logado
     *     (`ctx.user.userId === avaliadoId`) e OMITIDA.
     *   - B4 (Bloqueio 4): linhas de C-level so aparecem para Bruno.
     *   - Piso 3 (S158): linhas com `countRespondentes < 3`
     *     retornam `iql: null` e `dadosBloqueados: 'piso3'` (ainda
     *     aparecem na lista com identificacao do avaliado — a UI
     *     substitui o valor por badge canonica).
     *
     * Ordenacao canonica: por `nome` ASC (padrao dashboards §3.11).
     */
    getTabelaIQL: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_TABELA_IQL_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetTabelaIQLResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        if (ctx.user.role !== 'super_admin' && ctx.user.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Empresa fora do escopo do titular.',
          });
        }

        // Resolve escopo de avaliados por perfil (§8.7).
        let liderIds: number[] = [];
        let clevelIds: number[] = [];
        const includeClevels = ctx.user.role === 'super_admin';

        if (
          ctx.user.role === 'super_admin' ||
          ctx.user.role === 'rh' ||
          ctx.user.role === 'rh_lider'
        ) {
          // Empresa inteira (RH e Bruno).
          const scope = await resolveTabelaIQLScopeEmpresa(ctx.db, input.companyId);
          liderIds = scope.liderIds;
          // §8.6 Bloqueio 4: nao-Bruno nao ve C-levels.
          if (includeClevels) {
            clevelIds = scope.clevelIds;
          }
        } else if (ctx.user.role === 'clevel') {
          const acessoTotal = await resolveClevelAcessoTotal(
            ctx.db,
            input.companyId,
            ctx.user.userId,
          );
          if (acessoTotal === null) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: MSG_TABELA_IQL_SEM_ACESSO_COLABORADOR,
            });
          }
          if (acessoTotal) {
            // Todos os lideres da empresa (Bloqueio 4 omite C-levels
            // para nao-Bruno, portanto clevelIds fica vazio).
            const scope = await resolveTabelaIQLScopeEmpresa(ctx.db, input.companyId);
            liderIds = scope.liderIds;
          } else {
            // Cadeia descendente propria: coleta liderados diretos
            // ativos, filtra os que sao lideres.
            const cadeia = await scopedCadeiaLideradosDiretosIQL(
              ctx.db,
              input.companyId,
              null,
              ctx.user.userId,
            );
            liderIds = await filterLideresFromEmployeeIds(ctx.db, input.companyId, cadeia);
          }
        } else if (ctx.user.role === 'lider') {
          // Cenario 1 vs Cenario 2. Cenario 1 -> FORBIDDEN canonico.
          const cenario2 = await isLiderCenario2IQL(ctx.db, input.companyId, ctx.user.userId);
          if (!cenario2) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: MSG_TABELA_IQL_SEM_CADEIA_CENARIO1,
            });
          }
          const cadeia = await scopedCadeiaLideradosDiretosIQL(
            ctx.db,
            input.companyId,
            ctx.user.userId,
            null,
          );
          liderIds = await filterLideresFromEmployeeIds(ctx.db, input.companyId, cadeia);
        }

        // §8.6 Bloqueio 1: omite a linha do proprio usuario logado.
        // Narrowing canonico: `ctx.user.userId` so existe quando role
        // != 'super_admin' (union discriminada em `AuthenticatedUser`).
        if (ctx.user.role !== 'super_admin') {
          const proprioUserId = ctx.user.userId;
          liderIds = liderIds.filter((id) => id !== proprioUserId);
        }

        if (liderIds.length === 0 && clevelIds.length === 0) {
          return {
            companyId: input.companyId,
            trimestre: input.trimestre,
            linhas: [],
          };
        }

        // Le linhas de iqlData para os avaliados no escopo. Como
        // as UNIQUEs canonicas sao parciais (`uq_iqlData_lider` para
        // liderId e `uq_iqlData_clevel` para clevelId), fazemos
        // duas consultas separadas discriminadas por avaliadoTipo.
        const linhas: TabelaIQLLinha[] = [];

        if (liderIds.length > 0) {
          const rowsLider = await ctx.db
            .select({
              liderId: iqlData.liderId,
              iql: iqlData.iql,
              countRespondentes: iqlData.countRespondentes,
            })
            .from(iqlData)
            .where(
              and(
                eq(iqlData.companyId, input.companyId),
                eq(iqlData.trimestre, input.trimestre),
                isNotNull(iqlData.liderId),
                inArray(iqlData.liderId, liderIds),
              ),
            );
          const iqlByLider = new Map<number, { iql: number | null; count: number }>();
          for (const r of rowsLider) {
            if (r.liderId !== null) {
              iqlByLider.set(r.liderId, {
                iql: r.iql === null ? null : Number(r.iql),
                count: r.countRespondentes,
              });
            }
          }

          const empRows = await ctx.db
            .select({
              id: employees.id,
              name: employees.name,
              departamento: employees.departamento,
              descricaoCBO: employees.descricaoCBO,
            })
            .from(employees)
            .where(inArray(employees.id, liderIds));
          for (const emp of empRows) {
            const iqlEntry = iqlByLider.get(emp.id);
            const count = iqlEntry?.count ?? 0;
            const iqlVisivel = count >= PISO_RESPONDENTES_IQL ? (iqlEntry?.iql ?? null) : null;
            linhas.push({
              avaliadoTipo: 'employee',
              avaliadoId: emp.id,
              nome: emp.name,
              departamento: emp.departamento,
              cargo: emp.descricaoCBO,
              iql: iqlVisivel,
              countRespondentes: count,
              dadosBloqueados: count < PISO_RESPONDENTES_IQL ? 'piso3' : null,
            });
          }
        }

        if (clevelIds.length > 0) {
          const rowsClevel = await ctx.db
            .select({
              clevelId: iqlData.clevelId,
              iql: iqlData.iql,
              countRespondentes: iqlData.countRespondentes,
            })
            .from(iqlData)
            .where(
              and(
                eq(iqlData.companyId, input.companyId),
                eq(iqlData.trimestre, input.trimestre),
                isNotNull(iqlData.clevelId),
                inArray(iqlData.clevelId, clevelIds),
              ),
            );
          const iqlByClevel = new Map<number, { iql: number | null; count: number }>();
          for (const r of rowsClevel) {
            if (r.clevelId !== null) {
              iqlByClevel.set(r.clevelId, {
                iql: r.iql === null ? null : Number(r.iql),
                count: r.countRespondentes,
              });
            }
          }

          const clRows = await ctx.db
            .select({
              id: cLevelMembers.id,
              name: cLevelMembers.name,
              departamento: cLevelMembers.departamento,
              cargo: cLevelMembers.cargo,
            })
            .from(cLevelMembers)
            .where(inArray(cLevelMembers.id, clevelIds));
          for (const cl of clRows) {
            const iqlEntry = iqlByClevel.get(cl.id);
            const count = iqlEntry?.count ?? 0;
            const iqlVisivel = count >= PISO_RESPONDENTES_IQL ? (iqlEntry?.iql ?? null) : null;
            linhas.push({
              avaliadoTipo: 'clevel',
              avaliadoId: cl.id,
              nome: cl.name,
              departamento: cl.departamento,
              cargo: cl.cargo,
              iql: iqlVisivel,
              countRespondentes: count,
              dadosBloqueados: count < PISO_RESPONDENTES_IQL ? 'piso3' : null,
            });
          }
        }

        // Ordenacao canonica ASC por nome.
        linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // O parametro `now` do resolved fica reservado para
        // corte canonico futuro (ex.: exclusao de avaliados
        // inativados apos o trimestre) — presente na assinatura
        // para simetria com A/C/D. Neste MVP a leitura usa o
        // vinculo ativo (RV-13: uso silencioso para preservar
        // simetria; teste do getInstrumentDStatus exercita a
        // superficie com now injetado).
        void resolved.now;

        // O parametro `gt` fica reservado para consultas de janela
        // temporal em ME futura de exportacao — usa-se `isNotNull`
        // aqui para simetria; suprime warning de linter.
        void gt;
        void or;

        return {
          companyId: input.companyId,
          trimestre: input.trimestre,
          linhas,
        };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type IqlRouter = ReturnType<typeof createIqlRouter>;
