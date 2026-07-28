// ROIP APP 9BOX — sub-router `nr1` (ME-049cd).
//
// Vigesima-sexta ME de codigo do Bloco B3. Abre a superficie tRPC
// canonica do Radar NR-1 (§11 do DOC 03). Procedures canonicas do
// §11.17 / §19.8 / DOC 00 §12.9 entregues aqui:
//
//   - `nr1.configureCycle`   — transicao `null -> agendado` (§11.2).
//   - `nr1.editClosingDate`  — edicao da data de fechamento (§11.2,
//     §11.3) com justificativa canonica 100-500 (§2).
//   - `nr1.cancelCycle`      — cancelamento de ciclo agendado (§11.2).
//   - `nr1.closeCycle`       — fechamento (§11.2, §11.6-§11.14).
//   - `nr1.getCycleDetails`  — leitura consolidada do modulo `/nr1`.
//   - `nr1.getCollectionStatus` — acompanhamento de coleta (§11.16).
//
// FORA desta ME, por decisao registrada na abertura:
//   - `nr1.saveResponse` vive no Route Handler
//     `POST /api/portal/save-nr1-response` (S214, aplicacao de S207 —
//     escrita de portal autenticada por `portalToken` nunca e tRPC).
//   - `nr1.downloadReport` (§11.12) sai para a ME-049e: o gate de
//     ambiente de S218 REPROVOU na abertura desta ME (sem headless
//     chrome no sandbox e host de download bloqueado no egresso), e o
//     canonico exige prova de execucao antes do despacho (RV-04).
//
// Autorizacao canonica (S209 — matriz DOC 02 §10.4, rota `/nr1`):
// Bruno, RH puro, RH-Lider Cenario 1 e RH-Lider Cenario 2 acessam;
// C-level e Lider recebem FORBIDDEN. `closeCycle` e a excecao: e proc
// INTERNA do §11.17 (acionada pelo `runDailyInstrumentStatusJob` em
// B6), exposta transitoriamente como `super_admin` por S208/S216 —
// mesmo padrao de `monthlyClosure.closeMonthScheduled`,
// `iql.calculateIQL` e `climate.recalculateAggregates`.
//
// A transicao `agendado -> aberto` NAO tem proc aqui (S237): §19.8 e
// DOC 00 §12.9 enumeram exatamente 8 procs do dominio e nenhuma delas
// abre ciclo. Ela vive como funcao de servico exportada
// (`openScheduledNr1Cycles`), no precedente do §19.13 executado pela
// ME-030.
//
// Convencoes canonicas herdadas:
//   - DI factory `createNr1Router(deps)` (S205): `now` e `nr1Engine`
//     injetaveis, defaults reais.
//   - Mensagens canonicas literais exportadas como constantes (S206),
//     testadas verbatim.
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead (RV-13): cada export tem chamador nos testes de
//     integracao desta ME + acoplamento no `appRouter`.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes tRPC: `tests/integration/nr1-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoqFactorScores,
  departments,
  employees,
  nr1AreaDivergenceAnalysis,
} from '../../db/schema';
import { roleProcedure, router } from '../trpc';
import {
  adesaoPercentualNr1,
  AVISO_COLABORADORES_MINIMO_NR1,
  type CloseNr1CycleResult,
  closeNr1Cycle,
  dataCivilDeColunaNr1,
  FATORES_NR1,
  JANELA_MINIMA_CICLO_DIAS_NR1,
  type Nr1AlertFacade,
  PISO_AMOSTRA_NR1,
  type SemaforoNr1,
  semaforoFatorNr1,
} from '../services/nr1CalculationEngine';

// ============================================================
// Mensagens canonicas literais (S206 — testadas verbatim)
// ============================================================

/** §2.4 — guard cruzado de empresa fora do escopo do titular. */
export const MSG_EMPRESA_FORA_DO_ESCOPO_NR1 = 'Empresa fora do escopo do titular.';

/** §11.2 — colisao de datas na configuracao de novo ciclo. */
export const MSG_COLISAO_CONFIGURACAO_NR1 =
  'Já existe um ciclo agendado ou aberto que colide com as datas escolhidas. ' +
  'Cancele-o ou escolha novas datas.';

/** §11.2 — `dataAbertura` no passado. */
export const MSG_ABERTURA_NO_PASSADO_NR1 =
  'A data de abertura não pode ser anterior à data de hoje.';

/** §11.2 — janela minima obrigatoria de 30 dias corridos. */
export const MSG_JANELA_MINIMA_NR1 =
  'A data de fechamento deve ser no mínimo 30 dias corridos após a data de abertura.';

/** §11.15 — aviso (nao bloqueio) de empresa com menos de 5 ativos. */
export const MSG_AVISO_EMPRESA_PEQUENA_NR1 =
  'A empresa tem menos de 5 colaboradores ativos. O piso mínimo de amostra por escopo é 5, ' +
  'então este ciclo pode gerar apenas escopo empresa (se atingido) ou nenhum score válido. ' +
  'Continuar mesmo assim?';

/** §11.2 — ciclo inexistente ou fora do escopo consultado. */
export const MSG_CICLO_NAO_ENCONTRADO_NR1 = 'Ciclo do Radar NR-1 não encontrado.';

/** §11.2 — edicao de data exige ciclo em `aberto`. */
export const MSG_EDICAO_EXIGE_CICLO_ABERTO_NR1 =
  'A data de fechamento só pode ser editada em ciclo aberto.';

/** §11.2 — antecipacao precisa respeitar a janela minima. */
export const MSG_ANTECIPACAO_INVALIDA_NR1 =
  'A nova data de fechamento deve respeitar a janela mínima de 30 dias e ser ' +
  'posterior ao dia de hoje.';

/** §11.2 — postergacao exige data estritamente posterior a vigente. */
export const MSG_POSTERGACAO_INVALIDA_NR1 =
  'A nova data de fechamento deve ser diferente da data de fechamento vigente.';

/** §11.2 — cancelamento exige ciclo em `agendado`. */
export const MSG_CANCELAMENTO_EXIGE_AGENDADO_NR1 =
  'Somente ciclo agendado pode ser cancelado. Ciclo aberto não pode ser cancelado.';

/** §2 — padrao canonico 100-500, limite inferior. */
export const MSG_JUSTIFICATIVA_MIN_NR1 = 'A justificativa deve ter no mínimo 100 caracteres.';

/** §2 — padrao canonico 100-500, limite superior. */
export const MSG_JUSTIFICATIVA_MAX_NR1 = 'A justificativa deve ter no máximo 500 caracteres.';

/** §11.11 — texto contextual do gauge, faixa vermelha. */
export const MSG_ADESAO_VERMELHA_NR1 =
  'Atenção: adesão inferior a 50% dos colaboradores elegíveis. Os resultados devem ser ' +
  'interpretados com cautela e não representam necessariamente a percepção da maioria da ' +
  'força de trabalho.';

/** §11.11 — texto contextual do gauge, faixa amarela. */
export const MSG_ADESAO_AMARELA_NR1 =
  'Adesão moderada. Os resultados representam parte significativa da força de trabalho, mas ' +
  'não a totalidade. Considere ações de comunicação interna nos próximos ciclos para aumentar ' +
  'a participação.';

/** §11.11 — texto contextual do gauge, faixa verde. */
export const MSG_ADESAO_VERDE_NR1 =
  'Adesão saudável. Os resultados representam de forma consistente a percepção da força de ' +
  'trabalho e sustentam análise executiva confiável.';

/** §11.10 — ausencia de departamento em situacao critica. */
export const MSG_SEM_DEPARTAMENTO_CRITICO_NR1 =
  'Nenhum departamento em situação crítica neste ciclo.';

/** §11.15 — ciclo aberto sem nenhum elegivel no snapshot. */
export const MSG_CICLO_SEM_ELEGIVEIS_NR1 =
  'Ciclo aberto sem elegíveis. Nenhum colaborador ativo no dia da abertura.';

/**
 * §11.2 — colisao da nova data de fechamento com ciclo agendado
 * posterior. Template canonico com as duas datas literais.
 */
export function msgColisaoEdicaoNr1(dataAgendado: string, dataLimite: string): string {
  return (
    `A nova data de fechamento entraria em conflito com o ciclo agendado para ${dataAgendado}. ` +
    `Cancele o ciclo agendado ou escolha uma data anterior a ${dataLimite}.`
  );
}

// ============================================================
// Schemas Zod canonicos
// ============================================================

/** Data civil canonica 'YYYY-MM-DD' (colunas DATE do §11.1). */
export const DATA_CIVIL_SCHEMA_NR1 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Data canônica deve seguir o formato YYYY-MM-DD.',
});

/** §11.2 — payload de `configureCycle`. */
export const CONFIGURE_CYCLE_INPUT_SCHEMA_NR1 = z.object({
  companyId: z.number().int().positive(),
  dataAbertura: DATA_CIVIL_SCHEMA_NR1,
  dataFechamento: DATA_CIVIL_SCHEMA_NR1,
});

/** §11.2 — payload de `editClosingDate`. */
export const EDIT_CLOSING_DATE_INPUT_SCHEMA_NR1 = z.object({
  cicloDbId: z.number().int().positive(),
  dataFechamento: DATA_CIVIL_SCHEMA_NR1,
  justificativa: z.string(),
});

/** §11.2 — payload de `cancelCycle`. */
export const CANCEL_CYCLE_INPUT_SCHEMA_NR1 = z.object({
  cicloDbId: z.number().int().positive(),
});

/** §11.17 — payload de `closeCycle` (interna, S208/S216). */
export const CLOSE_CYCLE_INPUT_SCHEMA_NR1 = z.object({
  cicloDbId: z.number().int().positive(),
});

/**
 * §11.17 — payload de `getCycleDetails`. Aceita os query params
 * canonicos de aterrissagem contextual a partir de notificacoes
 * (`?ciclo=` e `?fator=`). Sem `cicloDbId`, resolve o ciclo mais
 * recente da empresa.
 */
export const GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1 = z.object({
  companyId: z.number().int().positive(),
  cicloDbId: z.number().int().positive().optional(),
  fatorId: z.number().int().min(1).max(FATORES_NR1.length).optional(),
});

/** §11.17 — payload de `getCollectionStatus`. */
export const GET_COLLECTION_STATUS_INPUT_SCHEMA_NR1 = z.object({
  cicloDbId: z.number().int().positive(),
});

// ============================================================
// Tipos publicos exportados
// ============================================================

/** §11.2 + §11.15 — resultado canonico de `configureCycle`. */
export interface ConfigureCycleResultNr1 {
  cicloDbId: number;
  companyId: number;
  ciclo: string;
  dataAbertura: string;
  dataFechamento: string;
  status: 'agendado';
  colaboradoresAtivos: number;
  aviso: string | null;
}

/** §11.2 + §11.3 — resultado canonico de `editClosingDate`. */
export interface EditClosingDateResultNr1 {
  cicloDbId: number;
  dataFechamento: string;
  dataFechamentoOriginal: string;
  marcaEdicaoPermanente: true;
}

/** §11.2 — resultado canonico de `cancelCycle`. */
export interface CancelCycleResultNr1 {
  cicloDbId: number;
  cancelado: boolean;
}

/** §11.8 — score de um fator dentro de um escopo, com semaforo. */
export interface FatorScoreNr1 {
  fator: number;
  fatorNome: string;
  score: number;
  semaforo: SemaforoNr1;
}

/** Escopo consolidado devolvido por `getCycleDetails`. */
export interface EscopoDetalheNr1 {
  escopo: 'empresa' | 'departamento' | 'agregacao';
  escopoDepartamentoId: number | null;
  escopoNome: string | null;
  countRespondentes: number;
  fatores: readonly FatorScoreNr1[];
}

/** §11.9 — analise de divergencia devolvida por `getCycleDetails`. */
export interface DivergenciaDetalheNr1 {
  escopo: 'departamento' | 'agregacao';
  escopoDepartamentoId: number | null;
  escopoNome: string | null;
  classificacao: 'convergente' | 'divergencia_critica' | 'divergencia_positiva';
  fatoresDivergentesCriticos: unknown;
  fatoresDivergentesPositivos: unknown;
}

/** §11.11 — faixa canonica do gauge de adesao. */
export type FaixaAdesaoNr1 = 'vermelho' | 'amarelo' | 'verde';

/** §11.17 — resultado consolidado de `getCycleDetails`. */
export interface GetCycleDetailsResultNr1 {
  presente: boolean;
  cicloDbId: number | null;
  companyId: number;
  ciclo: string | null;
  status: 'agendado' | 'aberto' | 'fechado' | null;
  dataAbertura: string | null;
  dataFechamento: string | null;
  dataFechamentoOriginal: string | null;
  marcaEdicaoPermanente: boolean;
  ultimaEdicaoEm: string | null;
  ultimaEdicaoJustificativa: string | null;
  elegiveis: number;
  respondentesEfetivos: number;
  adesaoPercentual: number;
  faixaAdesao: FaixaAdesaoNr1;
  textoAdesao: string;
  escopos: readonly EscopoDetalheNr1[];
  divergencias: readonly DivergenciaDetalheNr1[];
  departamentoCriticoDepartamentoId: number | null;
  departamentoCriticoDepartamentoNome: string | null;
  mensagemDepartamentoCritico: string | null;
  departamentosAmostraInsuficiente: readonly number[];
  fatorDestacado: number | null;
  avisoCicloSemElegiveis: string | null;
  pisoAmostra: number;
}

/** Linha nominal de acompanhamento de coleta (§11.16). */
export interface LinhaColetaNr1 {
  employeeId: number;
  departamentoId: number | null;
  respondeu: boolean;
  respondidoEm: string | null;
  respostaInvalida: boolean;
  inativadoAposSnapshot: boolean;
}

/** §11.17 + §11.16 — resultado canonico de `getCollectionStatus`. */
export interface GetCollectionStatusResultNr1 {
  cicloDbId: number;
  companyId: number;
  status: 'agendado' | 'aberto' | 'fechado';
  totalElegiveis: number;
  totalRespondidos: number;
  totalRespondentesEfetivos: number;
  totalPendentes: number;
  adesaoPercentual: number;
  /**
   * §11.16 (PC1d): a listagem nominal omite C-levels para RH. Nesta
   * plataforma a omissao e vacua — S239 canoniza que C-level nao
   * participa do Radar NR-1 por restricao arquitetural do DOC 01
   * (`copsoqCycleSnapshot.employeeId` FK para `employees.id`), logo
   * nenhuma linha de C-level existe para ser omitida. O contador
   * agregado inclui, por construcao, tudo que existe no snapshot.
   */
  clevelsOmitidosDaListagem: number;
  linhas: readonly LinhaColetaNr1[];
}

// ============================================================
// Dependencias injetaveis (S205)
// ============================================================

/** Contrato do motor consumido pelo router (S205). */
export interface Nr1EngineFacade {
  closeNr1Cycle(
    db: Parameters<typeof closeNr1Cycle>[0],
    cicloDbId: number,
    now: Date,
    deps?: { alertFacade?: Nr1AlertFacade },
  ): Promise<CloseNr1CycleResult>;
}

/** Default real: motor deterministico desta mesma ME. */
export const DEFAULT_NR1_ENGINE: Nr1EngineFacade = { closeNr1Cycle };

/** Relogio + motor injetaveis (S205). */
export interface Nr1RouterDeps {
  now?: () => Date;
  nr1Engine?: Nr1EngineFacade;
  alertFacade?: Nr1AlertFacade;
}

interface ResolvedDepsNr1 {
  now: () => Date;
  nr1Engine: Nr1EngineFacade;
  alertFacade: Nr1AlertFacade | undefined;
}

function resolveDepsNr1(deps: Nr1RouterDeps): ResolvedDepsNr1 {
  return {
    now: deps.now ?? (() => new Date()),
    nr1Engine: deps.nr1Engine ?? DEFAULT_NR1_ENGINE,
    alertFacade: deps.alertFacade,
  };
}

// ============================================================
// Helpers canonicos de data civil
// ============================================================

/** Converte 'YYYY-MM-DD' em Date UTC (coluna DATE nao tem fuso). */
function dataCivilParaDate(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

/** Soma dias corridos a uma data civil, devolvendo 'YYYY-MM-DD'. */
function somarDiasCivis(valor: string, dias: number): string {
  const base = dataCivilParaDate(valor);
  base.setUTCDate(base.getUTCDate() + dias);
  return dataCivilDeColunaNr1(base);
}

/** Data civil de "hoje" no fuso informado, no formato 'YYYY-MM-DD'. */
function hojeNoFuso(now: Date, timeZone: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return partes;
}

/** §11.11 — faixa canonica a partir do percentual arredondado. */
function faixaAdesaoNr1(percentual: number): FaixaAdesaoNr1 {
  if (percentual <= 50) return 'vermelho';
  if (percentual <= 74) return 'amarelo';
  return 'verde';
}

/** §11.11 — texto contextual canonico da faixa. */
function textoAdesaoNr1(faixa: FaixaAdesaoNr1): string {
  if (faixa === 'vermelho') return MSG_ADESAO_VERMELHA_NR1;
  if (faixa === 'amarelo') return MSG_ADESAO_AMARELA_NR1;
  return MSG_ADESAO_VERDE_NR1;
}

/** §2 — validacao do padrao canonico 100-500 (HTTP 422 canonico). */
function assertJustificativaCanonicaNr1(valor: string): string {
  const trimmed = valor.trim();
  if (trimmed.length < 100) {
    throw new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: MSG_JUSTIFICATIVA_MIN_NR1 });
  }
  if (trimmed.length > 500) {
    throw new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: MSG_JUSTIFICATIVA_MAX_NR1 });
  }
  return trimmed;
}

/** §2.4 — guard cruzado de empresa (super_admin atravessa). */
function assertCompanyScopeNr1(
  user: { role: string; companyId?: number },
  companyId: number,
): void {
  if (user.role !== 'super_admin' && user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_EMPRESA_FORA_DO_ESCOPO_NR1 });
  }
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `nr1` com dependencias injetadas (S205).
 * Producao chama sem argumentos — defaults reais para `now` e para o
 * motor. Testes injetam `now` fixo e motor espiao.
 */
export function createNr1Router(deps: Nr1RouterDeps = {}) {
  const resolved = resolveDepsNr1(deps);

  return router({
    /**
     * §11.2 — transicao `null -> agendado`. Executor canonico: RH ou
     * Bruno (matriz DOC 02 §10.4 para `/nr1`).
     *
     * Pre-condicoes canonicas, na ordem do §11.2:
     *   1. Nenhum ciclo em `agendado`/`aberto` com `dataFechamento`
     *      posterior a `dataAbertura` do novo ciclo.
     *   2. `dataAbertura >= hoje` no fuso local da empresa.
     *   3. `dataFechamento >= dataAbertura + 30 dias corridos`.
     *   4. `dataAbertura < dataFechamento` (CHECK `chk_datas` do banco;
     *      coberto pela regra 3, mantido como guarda explicita).
     *
     * §11.15 — empresa com menos de 5 ativos NAO bloqueia: o aviso
     * canonico volta no campo `aviso` para a UI exibir no modal.
     */
    configureCycle: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(CONFIGURE_CYCLE_INPUT_SCHEMA_NR1)
      .mutation(async ({ ctx, input }): Promise<ConfigureCycleResultNr1> => {
        assertCompanyScopeNr1(ctx.user, input.companyId);

        const timeZone = await resolveTimeZone(ctx.db, input.companyId);
        const hoje = hojeNoFuso(resolved.now(), timeZone);

        if (input.dataAbertura < hoje) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_ABERTURA_NO_PASSADO_NR1 });
        }
        const minimoFechamento = somarDiasCivis(input.dataAbertura, JANELA_MINIMA_CICLO_DIAS_NR1);
        if (input.dataFechamento < minimoFechamento) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_JANELA_MINIMA_NR1 });
        }

        const vigentes = await ctx.db
          .select()
          .from(copsoqCycles)
          .where(
            and(
              eq(copsoqCycles.companyId, input.companyId),
              inArray(copsoqCycles.status, ['agendado', 'aberto']),
            ),
          );
        const colide = vigentes.some(
          (c) => dataCivilDeColunaNr1(c.dataFechamento) > input.dataAbertura,
        );
        if (colide) {
          throw new TRPCError({ code: 'CONFLICT', message: MSG_COLISAO_CONFIGURACAO_NR1 });
        }

        const ativos = await ctx.db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.companyId, input.companyId), eq(employees.status, 'ativo')));

        const [inserido] = await ctx.db
          .insert(copsoqCycles)
          .values({
            companyId: input.companyId,
            ciclo: input.dataAbertura,
            dataAbertura: dataCivilParaDate(input.dataAbertura),
            dataFechamento: dataCivilParaDate(input.dataFechamento),
            status: 'agendado',
            configuradoPorEmployeeId: ctx.user.role === 'super_admin' ? null : ctx.user.userId,
            configuradoPorSuperAdminId:
              ctx.user.role === 'super_admin' ? ctx.user.superAdminId : null,
            configuradoEm: resolved.now(),
          })
          .$returningId();

        if (!inserido) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Falha ao agendar o ciclo do Radar NR-1.',
          });
        }

        return {
          cicloDbId: inserido.id,
          companyId: input.companyId,
          ciclo: input.dataAbertura,
          dataAbertura: input.dataAbertura,
          dataFechamento: input.dataFechamento,
          status: 'agendado',
          colaboradoresAtivos: ativos.length,
          aviso:
            ativos.length < AVISO_COLABORADORES_MINIMO_NR1 ? MSG_AVISO_EMPRESA_PEQUENA_NR1 : null,
        };
      }),

    /**
     * §11.2 + §11.3 — edicao da data de fechamento durante ciclo
     * aberto. `dataAbertura` permanece imutavel;
     * `dataFechamentoOriginal` e gravada na PRIMEIRA edicao e sustenta
     * a marca visual permanente do §11.3 e a nota de auditoria do PDF
     * (§11.12).
     */
    editClosingDate: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(EDIT_CLOSING_DATE_INPUT_SCHEMA_NR1)
      .mutation(async ({ ctx, input }): Promise<EditClosingDateResultNr1> => {
        const justificativa = assertJustificativaCanonicaNr1(input.justificativa);

        const [ciclo] = await ctx.db
          .select()
          .from(copsoqCycles)
          .where(eq(copsoqCycles.id, input.cicloDbId))
          .limit(1);
        if (!ciclo) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CICLO_NAO_ENCONTRADO_NR1 });
        }
        assertCompanyScopeNr1(ctx.user, ciclo.companyId);

        if (ciclo.status !== 'aberto') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: MSG_EDICAO_EXIGE_CICLO_ABERTO_NR1,
          });
        }

        const dataAbertura = dataCivilDeColunaNr1(ciclo.dataAbertura);
        const dataFechamentoAtual = dataCivilDeColunaNr1(ciclo.dataFechamento);
        const timeZone = await resolveTimeZone(ctx.db, ciclo.companyId);
        const hoje = hojeNoFuso(resolved.now(), timeZone);

        if (input.dataFechamento === dataFechamentoAtual) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_POSTERGACAO_INVALIDA_NR1 });
        }

        if (input.dataFechamento < dataFechamentoAtual) {
          // Antecipar (§11.2): janela minima preservada E pelo menos
          // um dia a frente de hoje.
          const minimo = somarDiasCivis(dataAbertura, JANELA_MINIMA_CICLO_DIAS_NR1);
          const amanha = somarDiasCivis(hoje, 1);
          if (input.dataFechamento < minimo || input.dataFechamento < amanha) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: MSG_ANTECIPACAO_INVALIDA_NR1 });
          }
        }

        // §11.2 pre-condicao 4 — colisao com ciclo agendado posterior.
        const agendados = await ctx.db
          .select()
          .from(copsoqCycles)
          .where(
            and(eq(copsoqCycles.companyId, ciclo.companyId), eq(copsoqCycles.status, 'agendado')),
          )
          .orderBy(asc(copsoqCycles.dataAbertura));
        const colidente = agendados.find(
          (c) => dataCivilDeColunaNr1(c.dataAbertura) < input.dataFechamento,
        );
        if (colidente) {
          const dataAgendado = dataCivilDeColunaNr1(colidente.dataAbertura);
          throw new TRPCError({
            code: 'CONFLICT',
            message: msgColisaoEdicaoNr1(dataAgendado, dataAgendado),
          });
        }

        const original =
          ciclo.dataFechamentoOriginal === null
            ? ciclo.dataFechamento
            : ciclo.dataFechamentoOriginal;

        await ctx.db
          .update(copsoqCycles)
          .set({
            dataFechamento: dataCivilParaDate(input.dataFechamento),
            dataFechamentoOriginal: original,
            ultimaEdicaoPorEmployeeId: ctx.user.role === 'super_admin' ? null : ctx.user.userId,
            ultimaEdicaoPorSuperAdminId:
              ctx.user.role === 'super_admin' ? ctx.user.superAdminId : null,
            ultimaEdicaoEm: resolved.now(),
            ultimaEdicaoJustificativa: justificativa,
          })
          .where(eq(copsoqCycles.id, input.cicloDbId));

        return {
          cicloDbId: input.cicloDbId,
          dataFechamento: input.dataFechamento,
          dataFechamentoOriginal: dataCivilDeColunaNr1(original),
          marcaEdicaoPermanente: true,
        };
      }),

    /**
     * §11.2 — cancelamento de ciclo `agendado` por DELETE (sem soft
     * delete). Ciclo `aberto` nao pode ser cancelado — proibicao
     * canonica literal.
     */
    cancelCycle: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(CANCEL_CYCLE_INPUT_SCHEMA_NR1)
      .mutation(async ({ ctx, input }): Promise<CancelCycleResultNr1> => {
        const [ciclo] = await ctx.db
          .select()
          .from(copsoqCycles)
          .where(eq(copsoqCycles.id, input.cicloDbId))
          .limit(1);
        if (!ciclo) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CICLO_NAO_ENCONTRADO_NR1 });
        }
        assertCompanyScopeNr1(ctx.user, ciclo.companyId);

        if (ciclo.status !== 'agendado') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: MSG_CANCELAMENTO_EXIGE_AGENDADO_NR1,
          });
        }

        const [resultado] = await ctx.db
          .delete(copsoqCycles)
          .where(and(eq(copsoqCycles.id, input.cicloDbId), eq(copsoqCycles.status, 'agendado')));

        return { cicloDbId: input.cicloDbId, cancelado: resultado.affectedRows > 0 };
      }),

    /**
     * §11.17 — proc INTERNA acionada pelo `runDailyInstrumentStatusJob`
     * (DOC 06 §16.1), exposta transitoriamente como `super_admin` por
     * S208/S216. Delega integralmente ao motor deterministico; o job do
     * Bloco B6 reusa a mesma funcao sem passar por aqui.
     */
    closeCycle: roleProcedure(['super_admin'])
      .input(CLOSE_CYCLE_INPUT_SCHEMA_NR1)
      .mutation(async ({ ctx, input }): Promise<CloseNr1CycleResult> => {
        return await resolved.nr1Engine.closeNr1Cycle(
          ctx.db,
          input.cicloDbId,
          resolved.now(),
          resolved.alertFacade === undefined ? undefined : { alertFacade: resolved.alertFacade },
        );
      }),

    /**
     * §11.17 — leitura consolidada do modulo `/nr1`. Sem `cicloDbId`,
     * resolve o ciclo mais recente da empresa por `dataAbertura`
     * decrescente. `fatorId` apenas ecoa o destaque de aterrissagem
     * contextual (§11.14 `linkDestino`) — nao filtra o payload, para
     * que a tela mantenha o radar completo com o fator em evidencia.
     */
    getCycleDetails: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1)
      .query(async ({ ctx, input }): Promise<GetCycleDetailsResultNr1> => {
        assertCompanyScopeNr1(ctx.user, input.companyId);

        const ciclos = await ctx.db
          .select()
          .from(copsoqCycles)
          .where(
            input.cicloDbId === undefined
              ? eq(copsoqCycles.companyId, input.companyId)
              : and(
                  eq(copsoqCycles.companyId, input.companyId),
                  eq(copsoqCycles.id, input.cicloDbId),
                ),
          )
          .orderBy(desc(copsoqCycles.dataAbertura), desc(copsoqCycles.id))
          .limit(1);

        const ciclo = ciclos[0];
        if (!ciclo) {
          return vazioCycleDetails(input.companyId, input.fatorId ?? null);
        }

        const snapshot = await ctx.db
          .select()
          .from(copsoqCycleSnapshot)
          .where(eq(copsoqCycleSnapshot.cicloDbId, ciclo.id));
        const elegiveis = snapshot.filter((s) => s.inativadoAposSnapshot !== true);
        const efetivos = elegiveis.filter(
          (s) => s.respondeu === true && s.respostaInvalida !== true,
        );
        const adesaoPercentual = adesaoPercentualNr1(efetivos.length, elegiveis.length);
        const faixa = faixaAdesaoNr1(adesaoPercentual);

        const scores = await ctx.db
          .select()
          .from(copsoqFactorScores)
          .where(eq(copsoqFactorScores.cicloDbId, ciclo.id))
          .orderBy(asc(copsoqFactorScores.escopo), asc(copsoqFactorScores.id));

        const divergenciasRaw = await ctx.db
          .select()
          .from(nr1AreaDivergenceAnalysis)
          .where(eq(nr1AreaDivergenceAnalysis.cicloDbId, ciclo.id))
          .orderBy(asc(nr1AreaDivergenceAnalysis.escopo), asc(nr1AreaDivergenceAnalysis.id));

        const idsDepartamento = [
          ...new Set(
            [
              ...scores.map((s) => s.escopoDepartamentoId),
              ...divergenciasRaw.map((d) => d.escopoDepartamentoId),
            ].filter((v): v is number => typeof v === 'number'),
          ),
        ];
        const nomePorId = new Map<number, string>();
        if (idsDepartamento.length > 0) {
          const linhas = await ctx.db
            .select({ id: departments.id, nome: departments.nome })
            .from(departments)
            .where(inArray(departments.id, idsDepartamento));
          for (const linha of linhas) nomePorId.set(linha.id, linha.nome);
        }

        const agrupados = new Map<string, EscopoDetalheNr1>();
        for (const linha of scores) {
          const chaveDept = linha.escopoDepartamentoId ?? '';
          const chaveAgreg = linha.escopoNomeAgregacao ?? '';
          const chave = `${linha.escopo}|${chaveDept}|${chaveAgreg}`;
          const existente = agrupados.get(chave);
          const fator = FATORES_NR1.find((f) => f.id === linha.fator);
          const score = Number(linha.score);
          const entrada: FatorScoreNr1 = {
            fator: linha.fator,
            fatorNome: fator?.nome ?? '',
            score,
            semaforo: semaforoFatorNr1(score),
          };
          if (existente) {
            (existente.fatores as FatorScoreNr1[]).push(entrada);
          } else {
            agrupados.set(chave, {
              escopo: linha.escopo,
              escopoDepartamentoId: linha.escopoDepartamentoId,
              escopoNome:
                linha.escopo === 'agregacao'
                  ? linha.escopoNomeAgregacao
                  : linha.escopoDepartamentoId === null
                    ? null
                    : (nomePorId.get(linha.escopoDepartamentoId) ?? null),
              countRespondentes: linha.countRespondentes,
              fatores: [entrada],
            });
          }
        }

        const insuficientes = Array.isArray(ciclo.departamentosAmostraInsuficiente)
          ? ciclo.departamentosAmostraInsuficiente.filter((v): v is number => typeof v === 'number')
          : [];

        return {
          presente: true,
          cicloDbId: ciclo.id,
          companyId: input.companyId,
          ciclo: ciclo.ciclo,
          status: ciclo.status,
          dataAbertura: dataCivilDeColunaNr1(ciclo.dataAbertura),
          dataFechamento: dataCivilDeColunaNr1(ciclo.dataFechamento),
          dataFechamentoOriginal:
            ciclo.dataFechamentoOriginal === null
              ? null
              : dataCivilDeColunaNr1(ciclo.dataFechamentoOriginal),
          marcaEdicaoPermanente: ciclo.dataFechamentoOriginal !== null,
          ultimaEdicaoEm: ciclo.ultimaEdicaoEm === null ? null : ciclo.ultimaEdicaoEm.toISOString(),
          ultimaEdicaoJustificativa: ciclo.ultimaEdicaoJustificativa,
          elegiveis: elegiveis.length,
          respondentesEfetivos: efetivos.length,
          adesaoPercentual,
          faixaAdesao: faixa,
          textoAdesao: textoAdesaoNr1(faixa),
          escopos: [...agrupados.values()],
          divergencias: divergenciasRaw.map((d) => ({
            escopo: d.escopo,
            escopoDepartamentoId: d.escopoDepartamentoId,
            escopoNome:
              d.escopo === 'agregacao'
                ? d.escopoNomeAgregacao
                : d.escopoDepartamentoId === null
                  ? null
                  : (nomePorId.get(d.escopoDepartamentoId) ?? null),
            classificacao: d.classificacao,
            fatoresDivergentesCriticos: d.fatoresDivergentesCriticos,
            fatoresDivergentesPositivos: d.fatoresDivergentesPositivos,
          })),
          departamentoCriticoDepartamentoId: ciclo.departamentoCriticoDepartamentoId,
          departamentoCriticoDepartamentoNome: ciclo.departamentoCriticoDepartamentoNome,
          mensagemDepartamentoCritico:
            ciclo.departamentoCriticoDepartamentoId === null
              ? MSG_SEM_DEPARTAMENTO_CRITICO_NR1
              : null,
          departamentosAmostraInsuficiente: insuficientes,
          fatorDestacado: input.fatorId ?? null,
          avisoCicloSemElegiveis:
            ciclo.status !== 'agendado' && snapshot.length === 0
              ? MSG_CICLO_SEM_ELEGIVEIS_NR1
              : null,
          pisoAmostra: PISO_AMOSTRA_NR1,
        };
      }),

    /**
     * §11.17 + §11.16 — acompanhamento de coleta. Contadores agregados
     * + listagem nominal. PC1d (§11.16) e satisfeita por vacuidade sob
     * S239: nao existe linha de C-level no snapshot para ser omitida, e
     * o campo `clevelsOmitidosDaListagem` documenta isso no contrato
     * (sempre 0) para que a UI e uma futura reabertura do debito D057
     * tenham onde se ancorar.
     */
    getCollectionStatus: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(GET_COLLECTION_STATUS_INPUT_SCHEMA_NR1)
      .query(async ({ ctx, input }): Promise<GetCollectionStatusResultNr1> => {
        const [ciclo] = await ctx.db
          .select()
          .from(copsoqCycles)
          .where(eq(copsoqCycles.id, input.cicloDbId))
          .limit(1);
        if (!ciclo) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_CICLO_NAO_ENCONTRADO_NR1 });
        }
        assertCompanyScopeNr1(ctx.user, ciclo.companyId);

        const snapshot = await ctx.db
          .select()
          .from(copsoqCycleSnapshot)
          .where(eq(copsoqCycleSnapshot.cicloDbId, ciclo.id))
          .orderBy(asc(copsoqCycleSnapshot.employeeId));

        const elegiveis = snapshot.filter((s) => s.inativadoAposSnapshot !== true);
        const respondidos = elegiveis.filter((s) => s.respondeu === true);
        const efetivos = respondidos.filter((s) => s.respostaInvalida !== true);

        return {
          cicloDbId: ciclo.id,
          companyId: ciclo.companyId,
          status: ciclo.status,
          totalElegiveis: elegiveis.length,
          totalRespondidos: respondidos.length,
          totalRespondentesEfetivos: efetivos.length,
          totalPendentes: elegiveis.length - respondidos.length,
          adesaoPercentual: adesaoPercentualNr1(efetivos.length, elegiveis.length),
          clevelsOmitidosDaListagem: 0,
          linhas: snapshot.map((s) => ({
            employeeId: s.employeeId,
            departamentoId: s.departamentoId,
            respondeu: s.respondeu === true,
            respondidoEm: s.respondidoEm === null ? null : s.respondidoEm.toISOString(),
            respostaInvalida: s.respostaInvalida === true,
            inativadoAposSnapshot: s.inativadoAposSnapshot === true,
          })),
        };
      }),
  });
}

/** Payload canonico quando a empresa nao tem nenhum ciclo. */
function vazioCycleDetails(companyId: number, fatorId: number | null): GetCycleDetailsResultNr1 {
  return {
    presente: false,
    cicloDbId: null,
    companyId,
    ciclo: null,
    status: null,
    dataAbertura: null,
    dataFechamento: null,
    dataFechamentoOriginal: null,
    marcaEdicaoPermanente: false,
    ultimaEdicaoEm: null,
    ultimaEdicaoJustificativa: null,
    elegiveis: 0,
    respondentesEfetivos: 0,
    adesaoPercentual: 0,
    faixaAdesao: 'vermelho',
    textoAdesao: MSG_ADESAO_VERMELHA_NR1,
    escopos: [],
    divergencias: [],
    departamentoCriticoDepartamentoId: null,
    departamentoCriticoDepartamentoNome: null,
    mensagemDepartamentoCritico: MSG_SEM_DEPARTAMENTO_CRITICO_NR1,
    departamentosAmostraInsuficiente: [],
    fatorDestacado: fatorId,
    avisoCicloSemElegiveis: null,
    pisoAmostra: PISO_AMOSTRA_NR1,
  };
}

/** Resolve o fuso canonico da empresa (default `America/Sao_Paulo`). */
async function resolveTimeZone(
  db: Parameters<typeof closeNr1Cycle>[0],
  companyId: number,
): Promise<string> {
  const [linha] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return linha?.timezone ?? 'America/Sao_Paulo';
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type Nr1Router = ReturnType<typeof createNr1Router>;
