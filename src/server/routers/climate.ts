// ROIP APP 9BOX — sub-router `climate` reescrito (ME-B2-01b — Q1=D).
//
// Reescrita canonica pos-aposentadoria do cache `climateEngagementData`
// (Q1=D). O router agora chama diretamente o motor puro sob demanda
// (`resolveClimateBlockComCascata` — cascata silenciosa canonica
// §9.6 Q4=A1 incorporada), sem consultar tabela derivada. Zero cache,
// zero drift permanentemente.
//
// Procedure canonica sobrevivente (§9.11 primeira linha):
//   - `climate.getClimateBlock` — leitura por (companyId, escopo,
//     escopoReferencia?, liderId?, liderTipo?, trimestre?). Cascata
//     silenciosa canonica aplicada dentro do motor. Sem `trimestre`
//     explicito, resolve o trimestre mais recente com `plenitudeData.
//     scoreA IS NOT NULL` para a empresa.
//
// Procedure canonica APOSENTADA:
//   - `climate.recalculateAggregates` — aposentada com Q1=D (nao ha
//     mais cache para regravar). Toda referencia a `recalculateAggregates`
//     esta bloqueada pelo `check-forbidden-terms`.
//
// Visibilidade canonica (§9.9 + ME-B2-01a.2 Q1=A):
//   - Bruno + RH puro + RH-Lider: acesso.
//   - C-level `acessoTotal=true`: acesso.
//   - C-level `acessoTotal=false`: FORBIDDEN canonico (Q1=A supera
//     §9.3 anterior; alinha com IQL §8.7).
//   - Lider puro: FORBIDDEN (§9.9 literal).
//
// Convencoes canonicas herdadas:
//   - Zero SQL cru: 100% Drizzle tipado (RV-12).
//   - Zero code dead (RV-13): cada export tem chamador nos testes
//     de integracao + acoplamento no `appRouter`.

import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { cLevelMembers } from '../../db/schema';
import { roleProcedure, router } from '../trpc';
import { assertUserCompanyScope } from '../../lib/scope/userCompanyScope';
import {
  type ClimateBlockCascataResult,
  type ClimateLiderTipo,
  listClimateTrimestres,
  NUM_QUESTOES_CLIMATE,
  PISO_RESPONDENTES_CLIMATE,
  resolveClimateBlockComCascata,
} from '../services/climateCalculationEngine';

// Reexporta o piso canonico para consumo pelos testes e por
// superficies de leitura futuras (RV-13 boundary).
export { PISO_RESPONDENTES_CLIMATE };

// ============================================================
// Mensagens canonicas literais (S177 — testadas verbatim)
// ============================================================

/** §2.4 (guard cruzado) — companyId fora do escopo do titular. */
export const MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE = 'Empresa fora do escopo do titular.';

/** §9.11 — trimestre com formato invalido (cadencia canonica TRIMESTRAL §9.7). */
export const MSG_TRIMESTRE_INVALIDO_CLIMATE =
  'Trimestre canônico deve seguir o formato YYYY-QN (N = 1..4).';

/**
 * ME-B2-01b — Q1=A canoniza que C-level acessoTotal=false NAO ve
 * o Bloco Clima (supera §9.3 anterior; alinha com IQL §8.7).
 */
export const MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED =
  'C-level com acessoTotal=false não tem visibilidade sobre o Bloco Clima.';

/** ME-B2-01a.2 — escopo='equipe' requer liderTipo canonico. */
export const MSG_CLIMATE_LIDER_TIPO_REQUIRED =
  'Escopo equipe requer liderTipo (employee ou clevel).';

/** ME-B2-01a.2 — escopo='equipe' requer liderId canonico. */
export const MSG_CLIMATE_LIDER_ID_REQUIRED = 'Escopo equipe requer liderId numérico positivo.';

/** §9.11 — sem trimestre disponivel (fixture nova, sem plenitude ainda). */
export const MSG_NENHUM_TRIMESTRE_DISPONIVEL_CLIMATE =
  'Nenhum trimestre disponível para o escopo consultado.';

/** §9.6 (S177) — piso canonico 3 respondentes literal. */
export const MSG_PISO_3_INSUFICIENTE_CLIMATE =
  'Dados insuficientes: menos de 3 respondentes válidos.';

/** §9.9 — Lider puro FORBIDDEN literal. */
export const MSG_LIDER_PURO_SEM_BLOCO_CLIMA = 'Bloco Clima indisponível para líderes puros.';

// ============================================================
// Schemas Zod canonicos
// ============================================================

/**
 * §9 combinado com §3.9 — trimestre canonico TRIMESTRAL `YYYY-QN`
 * (N = 1..4). Divergente do IQL (SEMESTRAL — S156) por design.
 */
export const TRIMESTRE_INPUT_SCHEMA_CLIMATE = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: MSG_TRIMESTRE_INVALIDO_CLIMATE,
});

/**
 * ME-B2-01a.2 — enum canonico dos 3 escopos (`equipe` desbloqueado
 * com Q4=A1; S174 aposentada).
 */
export const ESCOPO_ROUTER_SCHEMA_CLIMATE = z.enum(['empresa', 'departamento', 'equipe']);

/**
 * ME-B2-01a.2 — enum canonico do tipo de lider (padrao XOR-no-caller
 * consolidado em ME-B2-01a.1.1).
 */
export const LIDER_TIPO_SCHEMA_CLIMATE = z.enum(['employee', 'clevel']);

/**
 * §9.11 — payload canonico de `getClimateBlock`. Validacao fina por
 * escopo fica no handler (mesmo padrao do IQL §8.7).
 */
export const GET_CLIMATE_BLOCK_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  escopo: ESCOPO_ROUTER_SCHEMA_CLIMATE,
  escopoReferencia: z.string().min(1).max(120).nullish(),
  liderId: z.number().int().positive().nullish(),
  liderTipo: LIDER_TIPO_SCHEMA_CLIMATE.nullish(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_CLIMATE.optional(),
});

// ============================================================
// Tipo publico do resultado (RV-13 — exercitado nos testes)
// ============================================================

/**
 * §9.11 — resultado canonico de `getClimateBlock`. Estende o payload
 * canonico do motor com os campos de cascata:
 *   - `escopoEfetivo` — nivel onde os dados foram achados.
 *   - `notaAgregacao` — rotulo canonico da agregacao (null | agregado_
 *     departamento | agregado_empresa).
 *   - `dadosDisponiveis` — true quando algum nivel atende ao piso.
 *   - `presente` — true quando ha payload canonico (mesmo abaixo
 *     do piso; `false` apenas quando nao ha trimestre canonicamente
 *     disponivel).
 */
export interface GetClimateBlockResult {
  companyId: number;
  escopo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: 'employee' | 'clevel' | null;
  escopoEfetivo: {
    escopo: 'empresa' | 'departamento' | 'equipe';
    escopoReferencia: string | null;
    liderId: number | null;
    liderTipo: 'employee' | 'clevel' | null;
  };
  notaAgregacao: 'agregado_departamento' | 'agregado_empresa' | null;
  dadosDisponiveis: boolean;
  trimestre: string | null;
  presente: boolean;
  dadosInsuficientes: boolean;
  notaClima: number | null;
  adesao: number | null;
  countCobertura: number;
  countTotal: number;
  notaEngajamento: number | null;
  notaDesenvolvimento: number | null;
  notaPertencimento: number | null;
  notaRealizacao: number | null;
  notasQuestao: readonly (number | null)[];
}

// ============================================================
// Helpers canonicos internos
// ============================================================

/**
 * Guard canonico C-level acessoTotal (Q1=A). Retorna `true` quando
 * o C-level tem `acessoTotal=true`; `false` caso contrario (inclui
 * C-level inexistente — o guard cruzado ja tratou).
 */
async function resolveAcessoTotalClimate(
  db: import('../../db/client').RoipDatabase,
  companyId: number,
  clevelId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ acessoTotal: cLevelMembers.acessoTotal })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, clevelId), eq(cLevelMembers.companyId, companyId)))
    .limit(1);
  if (!row) {
    return false;
  }
  return row.acessoTotal === true;
}

/**
 * Converte o resultado canonico da cascata em `GetClimateBlockResult`.
 * Aplica piso 3 canonico na mascara de scores (§9.6, S158, S177):
 * quando `dadosDisponiveis=false`, scores viram null.
 */
function toBlockResult(
  companyId: number,
  cascata: ClimateBlockCascataResult,
): GetClimateBlockResult {
  const p = cascata.payload;
  const dadosInsuficientes = !cascata.dadosDisponiveis;
  const mascara = <T>(v: T | null): T | null => (dadosInsuficientes ? null : v);
  return {
    companyId,
    escopo: cascata.escopoRequisitado.escopo,
    escopoReferencia: cascata.escopoRequisitado.escopoReferencia,
    liderId: cascata.escopoRequisitado.liderId,
    liderTipo: cascata.escopoRequisitado.liderTipo,
    escopoEfetivo: cascata.escopoEfetivo,
    notaAgregacao: cascata.notaAgregacao,
    dadosDisponiveis: cascata.dadosDisponiveis,
    trimestre: p.trimestre,
    presente: true,
    dadosInsuficientes,
    notaClima: mascara(p.notaClima),
    adesao: p.adesao,
    countCobertura: p.countCobertura,
    countTotal: p.countTotal,
    notaEngajamento: mascara(p.notaEngajamento),
    notaDesenvolvimento: mascara(p.notaDesenvolvimento),
    notaPertencimento: mascara(p.notaPertencimento),
    notaRealizacao: mascara(p.notaRealizacao),
    notasQuestao: dadosInsuficientes
      ? Array.from({ length: NUM_QUESTOES_CLIMATE }, () => null)
      : p.notasQuestao,
  };
}

/**
 * Payload canonico quando nao ha trimestre disponivel (fixture nova,
 * sem plenitude ainda).
 */
function emptyBlockResult(input: {
  companyId: number;
  escopo: 'empresa' | 'departamento' | 'equipe';
  escopoReferencia: string | null;
  liderId: number | null;
  liderTipo: 'employee' | 'clevel' | null;
}): GetClimateBlockResult {
  return {
    companyId: input.companyId,
    escopo: input.escopo,
    escopoReferencia: input.escopoReferencia,
    liderId: input.liderId,
    liderTipo: input.liderTipo,
    escopoEfetivo: {
      escopo: input.escopo,
      escopoReferencia: input.escopoReferencia,
      liderId: input.liderId,
      liderTipo: input.liderTipo,
    },
    notaAgregacao: null,
    dadosDisponiveis: false,
    trimestre: null,
    presente: false,
    dadosInsuficientes: true,
    notaClima: null,
    adesao: null,
    countCobertura: 0,
    countTotal: 0,
    notaEngajamento: null,
    notaDesenvolvimento: null,
    notaPertencimento: null,
    notaRealizacao: null,
    notasQuestao: Array.from({ length: NUM_QUESTOES_CLIMATE }, () => null),
  };
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `climate`. Sem dependencias injetaveis
 * pos-Q1=D (motor puro sob demanda, sem cache).
 */
export function createClimateRouter() {
  return router({
    /**
     * §9.11 — leitura canonica do Bloco Clima. Cascata silenciosa
     * canonica (§9.6 Q4=A1) aplicada dentro do motor puro. Sem
     * `trimestre` explicito, resolve o trimestre mais recente com
     * `plenitudeData.scoreA IS NOT NULL` para a empresa.
     */
    getClimateBlock: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(GET_CLIMATE_BLOCK_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetClimateBlockResult> => {
        // §2.4 — guard cruzado companyId (super_admin atravessa).
        assertUserCompanyScope(ctx.user, input.companyId, MSG_EMPRESA_FORA_DO_ESCOPO_CLIMATE);

        const escopoReferencia = input.escopoReferencia ?? null;
        const liderId = input.liderId ?? null;
        const liderTipo = input.liderTipo ?? null;

        // Q1=A — C-level acessoTotal=false FORBIDDEN.
        if (ctx.user.role === 'clevel') {
          const acessoTotal = await resolveAcessoTotalClimate(
            ctx.db,
            input.companyId,
            ctx.user.userId,
          );
          if (!acessoTotal) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: MSG_CLIMATE_CLEVEL_ACESSO_TOTAL_REQUIRED,
            });
          }
        }

        // Validacao fina do input por escopo.
        if (input.escopo === 'departamento' && escopoReferencia === null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Escopo departamento requer escopoReferencia (nome do departamento).',
          });
        }
        if (input.escopo === 'equipe') {
          if (liderId === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: MSG_CLIMATE_LIDER_ID_REQUIRED,
            });
          }
          if (liderTipo === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: MSG_CLIMATE_LIDER_TIPO_REQUIRED,
            });
          }
        }

        // Resolucao canonica do trimestre efetivo. Sem `trimestre`
        // explicito, escolhe o mais recente com scoreA canonico
        // gravado para a empresa.
        let trimestreResolvido: string | null = input.trimestre ?? null;
        if (trimestreResolvido === null) {
          const trimestres = await listClimateTrimestres(ctx.db, input.companyId, 'desc');
          trimestreResolvido = trimestres[0] ?? null;
        }

        if (trimestreResolvido === null) {
          return emptyBlockResult({
            companyId: input.companyId,
            escopo: input.escopo,
            escopoReferencia,
            liderId,
            liderTipo: liderTipo as ClimateLiderTipo | null,
          });
        }

        // Cascata silenciosa canonica (§9.6 Q4=A1) — sob demanda,
        // sem cache. Motor puro.
        const cascata = await resolveClimateBlockComCascata(ctx.db, {
          companyId: input.companyId,
          escopo: input.escopo,
          escopoReferencia,
          liderId,
          liderTipo: liderTipo as ClimateLiderTipo | null,
          trimestre: trimestreResolvido,
        });

        return toBlockResult(input.companyId, cascata);
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type ClimateRouter = ReturnType<typeof createClimateRouter>;
