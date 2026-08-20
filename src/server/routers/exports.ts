// ROIP APP 9BOX — sub-router `exports` (ME-053, S275).
//
// Superficie tRPC canonica da Central de Relatorios (DOC 03 §13.12).
// 6 procs canonicas:
//   - `exports.getResumoDashboard` (xlsx §13.3)
//   - `exports.getEvolucaoTrimestral` (xlsx §13.4)
//   - `exports.getClimaEngajamento` (PDF §13.6 — sem token)
//   - `exports.generateRelatorioExecutivo` (PDF com IA §13.5)
//   - `exports.getSnapshot9Box` (PDF §13.7 + token efemero)
//   - `exports.getBoardDeck` (PDF §13.8 + token efemero)
//
// Autorizacao canonica (§13.5, §13.6, §13.7, §13.8):
//   - Resumo dashboard + Evolucao trimestral: Bruno, RH.
//   - Clima e engajamento: Bruno, RH, C-level acessoTotal=true.
//   - Relatorio executivo: Bruno, RH, C-level acessoTotal=true,
//     Responsavel financeiro.
//   - Snapshot 9-Box: mesma matriz do executivo.
//   - Board deck: Bruno, C-level acessoTotal=true (SEM excecao para
//     acessoTotal=false — contem ROI agregado).
//
// Regime canonico M6 vigente: dispatch operacional integral no
// ROIP_OPERACAO_MANUS.md. Sub-router carrega Facade DI padrao (S258)
// para permitir stub deterministico em teste de integracao.

import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  climateEngagementData,
  companies,
  employees,
  monthlyClosureStatus,
  nineBoxClassifications,
  performanceData,
  performanceQuarterlyData,
  plenitudeData,
} from '../../db/schema';
import { DEPARTAMENTO_VALUES } from '../../db/schema/enums';
import { signPdfEphemeralToken } from '../auth/pdfEphemeralToken';
import { getExecutiveReportCacheByChave } from '../services/executiveReportCache';
import {
  createDefaultExecutiveReportAIDeps,
  generateExecutiveReport,
  MSG_EXEC_REPORT_LIMIT_REACHED,
  type ExecutiveReportAIDeps,
  type GenerateExecutiveReportArgs,
  type GenerateExecutiveReportOutcome,
} from '../services/executiveReportAI';
import {
  EXEC_REPORT_CLIMA_PISO_RESPONDENTES,
  type BuildExecutiveReportArgs,
} from '../services/executiveReportEngine';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';
import { sanitizeRazaoSocial } from './spreadsheets';
import {
  formatTrimestreCicloReferencia,
  getPreviousTrimestre,
  parseTrimestreCicloReferencia,
} from '../../lib/cycleDates';
import { getQuarterMonths } from '../../lib/quarterlyPeriod';

// ============================================================
// Constantes canonicas exportadas
// ============================================================

/** Mensagem canonica de trimestre nao fechado (§13.2 pre-condicao). */
export const MSG_EXPORTS_TRIMESTRE_NAO_FECHADO =
  // eslint-disable-next-line @stylistic/max-len -- mensagem canonica literal §13.2
  'Trimestre exigido esta com pelo menos um mes ainda em aberto. Feche os 3 meses do trimestre para gerar o artefato.';

/** Mensagem canonica de escopo invalido. */
export const MSG_EXPORTS_ESCOPO_INVALIDO =
  'Escopo canonico invalido para este artefato ou referencia ausente/inconsistente.';

/** Mensagem canonica de C-level sem acessoTotal para artefatos restritos. */
export const MSG_EXPORTS_ACESSO_LIMITADO =
  // eslint-disable-next-line @stylistic/max-len -- mensagem canonica literal §13.8
  'C-level acessoTotal=false nao possui permissao para este artefato — contem indicadores agregados restritos.';

/** Mensagem canonica de cache ausente do Relatorio executivo. */
export const MSG_EXPORTS_CACHE_AUSENTE =
  // eslint-disable-next-line @stylistic/max-len -- mensagem canonica literal
  'Relatorio executivo para este escopo e trimestre ainda nao foi gerado. Dispare `generateRelatorioExecutivo`.';

/**
 * Mensagem canonica de mismatch de empresa (DOC 02 §2.4 — isolamento
 * por empresa). Bit-exact ao padrao dos routers de escopo empresa
 * (`MSG_COMPANY_MISMATCH_RF` em company.ts, `MSG_COMPANY_MISMATCH_REV`
 * em revenue.ts). ME-B9-SEC (achado A1).
 */
export const MSG_COMPANY_MISMATCH_EXP = 'Empresa nao pertence ao seu escopo.' as const;

// ============================================================
// Facade DI canonica (S258)
// ============================================================

/**
 * Facade canonica do motor IA — permite substituir por stub em teste
 * de integracao sem instanciar Claude API.
 */
export interface ExecutiveReportServiceFacade {
  generate: (args: GenerateExecutiveReportArgs) => Promise<GenerateExecutiveReportOutcome>;
}

/** Re-export canonico de `BuildExecutiveReportArgs` — permite ao Route
 * Handler de download importar tipos ja normalizados sem alcanhcar
 * o motor deterministico diretamente. */
export type { BuildExecutiveReportArgs, GenerateExecutiveReportArgs };

/** Dependencias canonicas do sub-router `exports`. */
export interface ExportsRouterDeps {
  serviceFactory?: (db: RoipDatabase) => ExecutiveReportServiceFacade;
  /** Relogio canonico para geracao de tokens e dataUso — determinismo. */
  now?: () => Date;
}

/** Factory canonica default — instancia o motor real. */
export const DEFAULT_EXPORTS_ROUTER_DEPS: Required<ExportsRouterDeps> = {
  serviceFactory: (db: RoipDatabase): ExecutiveReportServiceFacade => {
    const deps: ExecutiveReportAIDeps = createDefaultExecutiveReportAIDeps(db);
    return {
      generate: (args) => generateExecutiveReport(deps, args),
    };
  },
  now: () => new Date(),
};

// ============================================================
// Schemas Zod canonicos
// ============================================================

const trimestreSchema = z.string().regex(/^\d{4}-Q[1-4]$/);

/** Enum canonico dos 19 departamentos (§15.1 DOC 01). */
const departamentoSchema = z.enum(DEPARTAMENTO_VALUES);

const escopoTipoSchema = z.enum(['empresa', 'departamento', 'equipe']);
const escopoTipoEmpresaDeptSchema = z.enum(['empresa', 'departamento']);

const commonScopedInput = z.object({
  companyId: z.number().int().positive(),
  escopoTipo: escopoTipoSchema,
  escopoReferencia: z.string().nullable().optional(),
  trimestre: trimestreSchema,
});

const boardDeckInput = z.object({
  companyId: z.number().int().positive(),
  escopoTipo: escopoTipoEmpresaDeptSchema,
  escopoReferencia: z.string().nullable().optional(),
  trimestre: trimestreSchema,
});

const evolucaoTrimestralInput = z.object({
  companyId: z.number().int().positive(),
  escopoTipo: escopoTipoSchema,
  escopoReferencia: z.string().nullable().optional(),
  trimestreFinal: trimestreSchema,
});

// ============================================================
// Helpers canonicos
// ============================================================

/** Deriva `dataUsoLocal` canonica (00:00 do fuso local da empresa). */
function deriveDataUsoLocal(now: Date, _tz: string): Date {
  void _tz;
  // Simplificacao canonica: DATE armazena o dia; o motor de trimestre
  // ja resolve o fuso. Aqui usamos o dia UTC do `now` — o timezone
  // real e resolvido em outro ponto do fluxo.
  const dia = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return dia;
}

async function getCompanyInfo(
  db: RoipDatabase,
  companyId: number,
): Promise<{
  nomeFantasia: string;
  razaoSocial: string;
  razaoSocialSan: string;
  timezone: string;
}> {
  const rows = await db
    .select({
      nomeFantasia: companies.nomeFantasia,
      razaoSocial: companies.razaoSocial,
      timezone: companies.timezone,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const c = rows[0];
  if (!c) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Empresa nao encontrada.' });
  }
  return {
    nomeFantasia: c.nomeFantasia,
    razaoSocial: c.razaoSocial,
    razaoSocialSan: sanitizeRazaoSocial(c.razaoSocial),
    timezone: c.timezone,
  };
}

/** Verifica se os 3 meses do trimestre estao todos com `status='fechado'`. */
async function assertTrimestreFechado(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
): Promise<void> {
  const meses = getQuarterMonths(trimestre);
  if (!meses) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trimestre invalido.' });
  }
  const rows = await db
    .select({ mes: monthlyClosureStatus.mes, status: monthlyClosureStatus.status })
    .from(monthlyClosureStatus)
    .where(
      and(eq(monthlyClosureStatus.companyId, companyId), inArray(monthlyClosureStatus.mes, meses)),
    );
  const fechadosSet = new Set(rows.filter((r) => r.status === 'fechado').map((r) => r.mes));
  const todosFechados = meses.every((m) => fechadosSet.has(m));
  if (!todosFechados) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: MSG_EXPORTS_TRIMESTRE_NAO_FECHADO,
    });
  }
}

/**
 * Consulta `acessoTotal` do C-level do requester (`super_admin`, `rh`
 * e `rh_lider` sempre passam; C-level com `acessoTotal=false` bloqueia).
 */
async function assertAcessoTotalIfClevel(db: RoipDatabase, user: AuthenticatedUser): Promise<void> {
  if (user.role !== 'clevel') return;
  const rows = await db
    .select({ acessoTotal: cLevelMembers.acessoTotal })
    .from(cLevelMembers)
    .where(eq(cLevelMembers.id, user.userId))
    .limit(1);
  const c = rows[0];
  if (!c || c.acessoTotal === false) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_EXPORTS_ACESSO_LIMITADO });
  }
}

/**
 * Deriva `escopoRotulo` humano a partir de `escopoTipo` + `escopoReferencia`.
 */
async function deriveEscopoRotulo(
  db: RoipDatabase,
  escopoTipo: 'empresa' | 'departamento' | 'equipe',
  escopoReferencia: string | null,
): Promise<string> {
  if (escopoTipo === 'empresa') return 'Empresa';
  if (escopoTipo === 'departamento') return escopoReferencia ?? '';
  if (escopoTipo === 'equipe' && escopoReferencia !== null) {
    const liderId = Number.parseInt(escopoReferencia, 10);
    if (!Number.isFinite(liderId)) return escopoReferencia;
    const rows = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, liderId))
      .limit(1);
    return rows[0]?.name ?? `Lider #${liderId}`;
  }
  return escopoReferencia ?? '';
}

/**
 * Deriva geradoPor canonico a partir do ctx.user.
 */
function deriveGeradoPor(user: AuthenticatedUser): {
  geradoPorTipo: 'employee' | 'clevel' | 'superAdmin';
  geradoPorId: number;
  geradoPorUserType: 'super_admin' | 'employee' | 'clevel';
} {
  if (user.role === 'super_admin') {
    return {
      geradoPorTipo: 'superAdmin',
      geradoPorId: user.superAdminId,
      geradoPorUserType: 'super_admin',
    };
  }
  if (user.role === 'clevel') {
    return {
      geradoPorTipo: 'clevel',
      geradoPorId: user.userId,
      geradoPorUserType: 'clevel',
    };
  }
  return {
    geradoPorTipo: 'employee',
    geradoPorId: user.userId,
    geradoPorUserType: 'employee',
  };
}

// ============================================================
// Factory do sub-router canonico
// ============================================================

/**
 * Factory canonica do sub-router. Consumida em `routers/index.ts`
 * com as deps default; testes podem injetar `serviceFactory` para stub.
 */
/**
 * §2.4 — guard canonico de isolamento por empresa (ME-B9-SEC, achado A1).
 * Super_admin atravessa; demais roles restritos ao proprio `companyId`
 * do JWT. Padrao bit-exact ao `assertCompanyScopeRf` (company.ts) e
 * `assertCompanyScopeRev` (revenue.ts) — helper local com sufixo do
 * router, precedente majoritario entre os 4 routers de escopo empresa.
 */
export function assertCompanyScopeExports(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_EXP });
  }
}

export function createExportsRouter(deps: ExportsRouterDeps = {}) {
  const effectiveDeps = { ...DEFAULT_EXPORTS_ROUTER_DEPS, ...deps };

  return router({
    // ==============================================================
    // §13.3 — Resumo dashboard (xlsx)
    // ==============================================================
    getResumoDashboard: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(commonScopedInput)
      .mutation(async ({ ctx, input }): Promise<{ filename: string; contentBase64: string }> => {
        assertCompanyScopeExports(ctx.user, input.companyId);
        await assertTrimestreFechado(ctx.db, input.companyId, input.trimestre);
        const info = await getCompanyInfo(ctx.db, input.companyId);
        const rows = await buildResumoDashboardRows(
          ctx.db,
          input.companyId,
          input.trimestre,
          input.escopoTipo,
          input.escopoReferencia ?? null,
        );
        const now = effectiveDeps.now();
        const stamp = formatStamp(now);
        const filename = `resumo_dashboard_${info.razaoSocialSan}_${input.trimestre}_${stamp}.xlsx`;
        const buffer = await composeResumoDashboardXlsx(rows, info.razaoSocial, input.trimestre);
        return { filename, contentBase64: buffer.toString('base64') };
      }),

    // ==============================================================
    // §13.4 — Evolucao trimestral (xlsx)
    // ==============================================================
    getEvolucaoTrimestral: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(evolucaoTrimestralInput)
      .mutation(async ({ ctx, input }): Promise<{ filename: string; contentBase64: string }> => {
        assertCompanyScopeExports(ctx.user, input.companyId);
        // Nao valida "trimestre fechado" — o §13.4 permite trimestres
        // parciais com nota canonica no cabecalho.
        const info = await getCompanyInfo(ctx.db, input.companyId);
        const trimestres = deriveLast4Trimestres(input.trimestreFinal);
        const rows = await buildEvolucaoTrimestralRows(
          ctx.db,
          input.companyId,
          trimestres,
          input.escopoTipo,
          input.escopoReferencia ?? null,
        );
        const now = effectiveDeps.now();
        const stamp = formatStamp(now);
        const filename = `evolucao_trimestral_${info.razaoSocialSan}_${stamp}.xlsx`;
        const buffer = await composeEvolucaoTrimestralXlsx(rows, info.razaoSocial, trimestres);
        return { filename, contentBase64: buffer.toString('base64') };
      }),

    // ==============================================================
    // §13.6 — Clima e engajamento (PDF sem token)
    // ==============================================================
    getClimaEngajamento: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(z.object({ companyId: z.number().int().positive() }))
      .mutation(
        async ({
          ctx,
          input,
        }): Promise<{
          trimestreResolvido: string | null;
          pdfPath: string | null;
          message?: string;
        }> => {
          assertCompanyScopeExports(ctx.user, input.companyId);
          await assertAcessoTotalIfClevel(ctx.db, ctx.user);
          // Resolve o ultimo trimestre com agregados em climateEngagementData.
          const trimestreRow = await ctx.db
            .select({ trimestre: climateEngagementData.trimestre })
            .from(climateEngagementData)
            .where(eq(climateEngagementData.companyId, input.companyId))
            .orderBy(climateEngagementData.trimestre)
            .limit(1);
          if (trimestreRow.length === 0) {
            return {
              trimestreResolvido: null,
              pdfPath: null,
              message: 'Sem agregados de clima disponiveis para a empresa.',
            };
          }
          const trimestre = trimestreRow[0]?.trimestre ?? null;
          if (trimestre === null) {
            return {
              trimestreResolvido: null,
              pdfPath: null,
              message: 'Sem agregados de clima disponiveis para a empresa.',
            };
          }
          // No MVP a proc retorna metadados canonicos; a materializacao
          // do PDF real e do Route Handler `/api/reports/clima-engajamento/
          // download`. Este proc apenas confirma disponibilidade + expone
          // o trimestre resolvido para a UI.
          return { trimestreResolvido: trimestre, pdfPath: null };
        },
      ),

    // ==============================================================
    // §13.5 — Relatorio executivo trimestral (PDF com IA)
    // ==============================================================
    generateRelatorioExecutivo: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(commonScopedInput)
      .mutation(
        async ({
          ctx,
          input,
        }): Promise<{
          status: 'ok' | 'limit_reached' | 'failed';
          cacheId?: number;
          filename?: string;
          message?: string;
        }> => {
          assertCompanyScopeExports(ctx.user, input.companyId);
          await assertAcessoTotalIfClevel(ctx.db, ctx.user);
          await assertTrimestreFechado(ctx.db, input.companyId, input.trimestre);
          const info = await getCompanyInfo(ctx.db, input.companyId);
          const escopoRotulo = await deriveEscopoRotulo(
            ctx.db,
            input.escopoTipo,
            input.escopoReferencia ?? null,
          );
          const gp = deriveGeradoPor(ctx.user);
          const now = effectiveDeps.now();
          const facade = effectiveDeps.serviceFactory(ctx.db);
          const outcome = await facade.generate({
            companyId: input.companyId,
            nomeFantasia: info.nomeFantasia,
            razaoSocialSanitizada: info.razaoSocialSan,
            escopo: {
              tipo: input.escopoTipo,
              referencia: input.escopoReferencia ?? null,
              rotulo: escopoRotulo,
            },
            trimestre: input.trimestre,
            geradoPorTipo: gp.geradoPorTipo,
            geradoPorId: gp.geradoPorId,
            geradoPorUserType: gp.geradoPorUserType,
            dataUsoLocal: deriveDataUsoLocal(now, info.timezone),
          });
          if (outcome.kind === 'ok') {
            return { status: 'ok', cacheId: outcome.cacheId, filename: outcome.filename };
          }
          if (outcome.kind === 'limit_reached') {
            return { status: 'limit_reached', message: MSG_EXEC_REPORT_LIMIT_REACHED };
          }
          return { status: 'failed', message: outcome.message };
        },
      ),

    // ==============================================================
    // §13.7 — Snapshot 9-Box (PDF + token efemero)
    // ==============================================================
    getSnapshot9Box: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(commonScopedInput)
      .mutation(async ({ ctx, input }): Promise<{ token: string; filename: string }> => {
        assertCompanyScopeExports(ctx.user, input.companyId);
        await assertAcessoTotalIfClevel(ctx.db, ctx.user);
        await assertTrimestreFechado(ctx.db, input.companyId, input.trimestre);
        const info = await getCompanyInfo(ctx.db, input.companyId);
        const now = effectiveDeps.now();
        const stamp = formatStamp(now);
        const filename = `snapshot_9box_${info.razaoSocialSan}_${input.trimestre}_${stamp}.pdf`;
        const gp = deriveGeradoPor(ctx.user);
        // resourceId canonicamente derivado — codifica (companyId, escopoKey)
        const resourceId = deriveResourceIdCanonicoEscopo(
          input.companyId,
          input.escopoTipo,
          input.escopoReferencia ?? null,
        );
        const token = await signPdfEphemeralToken(
          {
            scope: 'snapshot_9box',
            companyId: input.companyId,
            resourceId,
            userId: gp.geradoPorId,
            userType: gp.geradoPorUserType === 'super_admin' ? 'super_admin' : 'employee',
          },
          now,
        );
        return { token, filename };
      }),

    // ==============================================================
    // §13.8 — Board deck (PDF + token efemero)
    // ==============================================================
    getBoardDeck: roleProcedure(['super_admin', 'clevel'])
      .input(boardDeckInput)
      .mutation(async ({ ctx, input }): Promise<{ token: string; filename: string }> => {
        assertCompanyScopeExports(ctx.user, input.companyId);
        await assertAcessoTotalIfClevel(ctx.db, ctx.user);
        await assertTrimestreFechado(ctx.db, input.companyId, input.trimestre);
        const info = await getCompanyInfo(ctx.db, input.companyId);
        const now = effectiveDeps.now();
        const stamp = formatStamp(now);
        const filename = `board_deck_${info.razaoSocialSan}_${input.trimestre}_${stamp}.pdf`;
        const gp = deriveGeradoPor(ctx.user);
        const resourceId = deriveResourceIdCanonicoEscopo(
          input.companyId,
          input.escopoTipo,
          input.escopoReferencia ?? null,
        );
        const token = await signPdfEphemeralToken(
          {
            scope: 'board_deck',
            companyId: input.companyId,
            resourceId,
            userId: gp.geradoPorId,
            userType: gp.geradoPorUserType === 'super_admin' ? 'super_admin' : 'employee',
          },
          now,
        );
        return { token, filename };
      }),
  });
}

// ============================================================
// Helpers canonicos — XLSX + agregacoes de linha
// ============================================================

interface ResumoDashboardRow {
  employeeId: number;
  nome: string;
  cargo: string;
  departamento: string;
  senioridade: string;
  nivelHierarquico: string;
  liderDireto: string | null;
  scoreDesempenho: number | null;
  plenitudeScore: number | null;
  percMetaAtingida: number | null;
  assiduidade: number | null;
  capacidadeOciosa: number | null;
}

async function buildResumoDashboardRows(
  db: RoipDatabase,
  companyId: number,
  trimestre: string,
  escopoTipo: 'empresa' | 'departamento' | 'equipe',
  escopoReferencia: string | null,
): Promise<ResumoDashboardRow[]> {
  const where = [eq(employees.companyId, companyId), eq(employees.status, 'ativo')];
  if (escopoTipo === 'departamento' && escopoReferencia !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validado por Zod no input
    where.push(eq(employees.departamento, escopoReferencia as any));
  }
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      descricaoCBO: employees.descricaoCBO,
      departamento: employees.departamento,
      senioridade: employees.senioridade,
      nivelHierarquico: employees.nivelHierarquico,
    })
    .from(employees)
    .where(and(...where));

  const meses = getQuarterMonths(trimestre);
  const employeeIds = rows.map((r) => r.id);
  const perfQuarterRows =
    employeeIds.length === 0
      ? []
      : await db
          .select({
            employeeId: performanceQuarterlyData.employeeId,
            scoreDesempenho: performanceQuarterlyData.scoreDesempenho,
            percMetaAtingida: performanceQuarterlyData.percMetaAtingida,
            capacidadeOciosa: performanceQuarterlyData.capacidadeOciosa,
          })
          .from(performanceQuarterlyData)
          .where(
            and(
              eq(performanceQuarterlyData.companyId, companyId),
              eq(performanceQuarterlyData.trimestre, trimestre),
              inArray(performanceQuarterlyData.employeeId, employeeIds),
            ),
          );

  const plenRows =
    employeeIds.length === 0
      ? []
      : await db
          .select({
            employeeId: plenitudeData.employeeId,
            plenitudeScore: plenitudeData.plenitudeScore,
          })
          .from(plenitudeData)
          .where(
            and(
              eq(plenitudeData.companyId, companyId),
              eq(plenitudeData.trimestre, trimestre),
              inArray(plenitudeData.employeeId, employeeIds),
            ),
          );

  const perfMonthRows =
    employeeIds.length === 0 || !meses
      ? []
      : await db
          .select({
            employeeId: performanceData.employeeId,
            assiduidade: performanceData.assiduidade,
          })
          .from(performanceData)
          .where(
            and(
              eq(performanceData.companyId, companyId),
              inArray(performanceData.employeeId, employeeIds),
              inArray(performanceData.mes, meses),
            ),
          );

  const perfQuarterByEmp = new Map(perfQuarterRows.map((r) => [r.employeeId, r]));
  const plenByEmp = new Map(plenRows.map((r) => [r.employeeId, r]));
  const assiduidadeByEmp = new Map<number, { soma: number; n: number }>();
  for (const p of perfMonthRows) {
    const val = Number(p.assiduidade);
    if (!Number.isFinite(val)) continue;
    const acc = assiduidadeByEmp.get(p.employeeId) ?? { soma: 0, n: 0 };
    acc.soma += val;
    acc.n += 1;
    assiduidadeByEmp.set(p.employeeId, acc);
  }

  const out: ResumoDashboardRow[] = rows.map((emp) => {
    const pq = perfQuarterByEmp.get(emp.id);
    const pl = plenByEmp.get(emp.id);
    const assAcc = assiduidadeByEmp.get(emp.id);
    return {
      employeeId: emp.id,
      nome: emp.name,
      cargo: emp.descricaoCBO,
      departamento: emp.departamento,
      senioridade: emp.senioridade,
      nivelHierarquico: emp.nivelHierarquico,
      liderDireto: null,
      scoreDesempenho: pq?.scoreDesempenho ? Number(pq.scoreDesempenho) : null,
      plenitudeScore: pl?.plenitudeScore ? Number(pl.plenitudeScore) : null,
      percMetaAtingida: pq?.percMetaAtingida ? Number(pq.percMetaAtingida) : null,
      assiduidade: assAcc && assAcc.n > 0 ? Math.round((assAcc.soma / assAcc.n) * 100) / 100 : null,
      capacidadeOciosa: pq?.capacidadeOciosa ? Number(pq.capacidadeOciosa) : null,
    };
  });
  return out;
}

async function composeResumoDashboardXlsx(
  rows: ResumoDashboardRow[],
  razaoSocial: string,
  trimestre: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resumo dashboard');
  ws.addRow([`Empresa: ${razaoSocial} · Trimestre: ${trimestre}`]);
  ws.addRow([]);
  ws.addRow([
    'Nome',
    'Cargo',
    'Departamento',
    'Senioridade',
    'Nível hierárquico',
    'Líder direto',
    'scoreDesempenho',
    'plenitudeScore',
    '% da meta atingida',
    'Assiduidade',
    'Ociosidade',
  ]);
  for (const r of rows) {
    ws.addRow([
      r.nome,
      r.cargo,
      r.departamento,
      r.senioridade,
      r.nivelHierarquico,
      r.liderDireto ?? '—',
      r.scoreDesempenho ?? '—',
      r.plenitudeScore ?? '—',
      r.percMetaAtingida ?? '—',
      r.assiduidade ?? '—',
      r.capacidadeOciosa ?? '—',
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function deriveLast4Trimestres(trimestreFinal: string): string[] {
  const parsed = parseTrimestreCicloReferencia(trimestreFinal);
  if (!parsed) return [trimestreFinal];
  const out = [trimestreFinal];
  let ano = parsed.ano;
  let tri = parsed.trimestre;
  for (let i = 0; i < 3; i += 1) {
    const prev = getPreviousTrimestre(ano, tri);
    ano = prev.ano;
    tri = prev.trimestre;
    out.push(formatTrimestreCicloReferencia(ano, tri));
  }
  return out.reverse();
}

async function buildEvolucaoTrimestralRows(
  db: RoipDatabase,
  companyId: number,
  trimestres: string[],
  escopoTipo: 'empresa' | 'departamento' | 'equipe',
  escopoReferencia: string | null,
): Promise<Array<ResumoDashboardRow & { trimestre: string }>> {
  const out: Array<ResumoDashboardRow & { trimestre: string }> = [];
  for (const t of trimestres) {
    const rows = await buildResumoDashboardRows(db, companyId, t, escopoTipo, escopoReferencia);
    for (const r of rows) out.push({ ...r, trimestre: t });
  }
  return out;
}

async function composeEvolucaoTrimestralXlsx(
  rows: Array<ResumoDashboardRow & { trimestre: string }>,
  razaoSocial: string,
  trimestres: string[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Evolução trimestral');
  ws.addRow([
    `Empresa: ${razaoSocial} · Histórico disponível: ` +
      `${trimestres.length} de 4 trimestres solicitados.`,
  ]);
  ws.addRow([]);
  ws.addRow([
    'Trimestre',
    'Nome',
    'Cargo',
    'Departamento',
    'Senioridade',
    'Nível hierárquico',
    'scoreDesempenho',
    'plenitudeScore',
    '% da meta atingida',
    'Assiduidade',
    'Ociosidade',
  ]);
  for (const r of rows) {
    ws.addRow([
      r.trimestre,
      r.nome,
      r.cargo,
      r.departamento,
      r.senioridade,
      r.nivelHierarquico,
      r.scoreDesempenho ?? '—',
      r.plenitudeScore ?? '—',
      r.percMetaAtingida ?? '—',
      r.assiduidade ?? '—',
      r.capacidadeOciosa ?? '—',
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================
// Helpers exportados para consumo pelos Route Handlers
// ============================================================

/**
 * Deriva `resourceId` canonico para artefatos on-the-fly (Snapshot,
 * Board deck, Clima). Codifica (companyId, escopoKey) num `number`
 * seguro para MySQL INT: `companyId << 20 | escopoKey`. `escopoKey`
 * derivada por hash simples de `escopoTipo` + `escopoReferencia`.
 *
 * O Route Handler nao consome o `resourceId` para autorizacao (a
 * matriz canonica DOC 02 e reavaliada pos-verificacao do token). O
 * campo serve apenas como audit-trail.
 */
export function deriveResourceIdCanonicoEscopo(
  companyId: number,
  escopoTipo: 'empresa' | 'departamento' | 'equipe',
  escopoReferencia: string | null,
): number {
  const key = escopoTipo === 'empresa' ? 1 : escopoTipo === 'departamento' ? 2 : 3;
  const refHash = escopoReferencia ? Math.abs(hashCode(escopoReferencia)) % 65535 : 0;
  const scopeKey = (key << 16) | refHash;
  return (companyId << 20) | (scopeKey & 0xfffff);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * Verifica se o cache do Relatorio executivo existe para (companyId,
 * escopoTipo, escopoReferencia, trimestre). Consumido pelo Route
 * Handler de download.
 */
export async function findExecutiveReportCacheForDownload(
  db: RoipDatabase,
  companyId: number,
  escopoTipo: 'empresa' | 'departamento' | 'equipe',
  escopoReferencia: string | null,
  trimestre: string,
): Promise<{ id: number; conteudoPdfUrl: string } | null> {
  const row = await getExecutiveReportCacheByChave(
    db,
    companyId,
    escopoTipo,
    escopoReferencia,
    trimestre,
  );
  if (!row) return null;
  return { id: row.id, conteudoPdfUrl: row.conteudoPdfUrl };
}

/** Piso canonico exposto para os Route Handlers. */
export { EXEC_REPORT_CLIMA_PISO_RESPONDENTES };

// ============================================================
// Helpers privados
// ============================================================

function formatStamp(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}`;
}

// Reexporta para uso interno em testes
export { departamentoSchema, escopoTipoSchema, trimestreSchema, nineBoxClassifications };
