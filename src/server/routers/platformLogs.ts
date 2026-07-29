// ROIP APP 9BOX — sub-router `platformLogs` (ME-044).
//
// Superficie tRPC de LEITURA canonica de logs de plataforma acessiveis
// exclusivamente por Bruno. Nesta ME cobre 1 proc:
//
//   - `platformLogs.listResponsavelFinanceiroTransfers` — retorna todo o
//     historico canonico do `responsavelFinanceiroTransferLog` de uma
//     empresa, ordenado do mais RECENTE ao mais antigo (DESC por
//     `createdAt`, `id`). Consumida pela superficie
//     `/super-admin/logs/responsavel-financeiro` (DOC 06).
//
// Convencao canonica:
//   - Bruno EXCLUSIVO (`roleProcedure(['super_admin'])`). Salvaguarda TS
//     `ctx.user.role === 'super_admin'` no handler (paridade defensiva
//     com `cycleUnlockRequests.decide`, ME-032).
//   - Reutiliza o service canonico `listTransferLogByCompany` do
//     `services/responsavelFinanceiroTransferLog.ts` (ordem ASC canonica);
//     o router aplica `.reverse()` para atender a norma canonica de UI
//     "mais recente primeiro". Zero edicao do service (RV-09 preserva
//     arte ja canonizada — o consumidor de dashboard/reporting canonico
//     que precisa ASC ja existe e continua funcionando).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/platformLogs-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import {
  cycleUnlockRequests,
  employeeLeaderHistory,
  monthlyUnlockLog,
  performanceMultiplierLog,
  responsavelFinanceiroTransferLog,
} from '../../db/schema';
import { listTransferLogByCompany } from '../services/responsavelFinanceiroTransferLog';

import { roleProcedure, router } from '../trpc';

// ============================================================
// Mensagens canonicas literais (testadas verbatim)
// ============================================================

/** §DOC 02 §12 — perfil sem permissao para logs de plataforma. */
export const MSG_PLATFORM_LOGS_FORBIDDEN =
  'Apenas o Super Admin pode acessar os logs de plataforma.' as const;

// ============================================================
// Zod schema de entrada
// ============================================================

export const LIST_RF_TRANSFERS_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
});

// ============================================================
// Contratos publicos exportados (RV-13 — testados)
// ============================================================

/**
 * Item canonico do historico. Modela 1:1 as colunas do schema
 * `responsavelFinanceiroTransferLog`. `previousHolderId`/`newHolderId`
 * sao nullable no schema (para `holderType='none'`).
 */
export interface ResponsavelFinanceiroTransferLogItem {
  id: number;
  companyId: number;
  previousHolderType: 'employee' | 'cLevel' | 'none';
  previousHolderId: number | null;
  newHolderType: 'employee' | 'cLevel' | 'none';
  newHolderId: number | null;
  actorSuperAdminId: number;
  eventType: 'atribuido' | 'transferido' | 'removido';
  reason: string;
  createdAt: Date | null;
}

/** Retorno canonico da proc. `count` = `items.length` para conveniencia. */
export interface ListRfTransfersResult {
  companyId: number;
  items: ResponsavelFinanceiroTransferLogItem[];
  count: number;
}

// ============================================================
// getHistoricoEmpresa — UNION canonico §13.10 DOC 03 (ME-053, S275)
// ============================================================

/** Tipos canonicos de evento agregados pelo UNION §13.10. */
export const HISTORICO_EMPRESA_TIPO_EVENTO_VALUES = [
  'responsavel_financeiro_transfer',
  'monthly_unlock',
  'employee_leader_transfer',
  'performance_multiplier_change',
  'cycle_unlock_request',
] as const;

export type HistoricoEmpresaTipoEvento = (typeof HISTORICO_EMPRESA_TIPO_EVENTO_VALUES)[number];

/** Item canonico normalizado — mesma forma para as 5 fontes. */
export interface HistoricoEmpresaItem {
  fonte: HistoricoEmpresaTipoEvento;
  dataEvento: Date | null;
  actorId: number | null;
  descricaoResumida: string;
  /** Payload especifico da fonte, para detalhamento da linha ao expandir. */
  detalhes: Record<string, unknown>;
}

/** Retorno canonico paginado. */
export interface GetHistoricoEmpresaResult {
  companyId: number;
  items: HistoricoEmpresaItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** Input schema canonico da proc. */
const GET_HISTORICO_EMPRESA_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
  tipoEvento: z.enum(HISTORICO_EMPRESA_TIPO_EVENTO_VALUES).optional(),
  actorId: z.number().int().positive().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

/**
 * Executa UNION canonico sobre as 5 fontes canonicas §13.10 e devolve
 * itens normalizados. A ordenacao canonica e desc por `dataEvento`
 * (mais recente primeiro). Paginacao aplicada apos union + sort in
 * memory — abordagem canonica pragmatica para o MVP (S275): as 5
 * fontes tem cardinalidade baixa por empresa; o custo e aceitavel.
 * Otimizacao via query UNION nativa e decisao pos-MVP.
 */
async function fetchHistoricoEmpresa(
  db: import('../../db/client').RoipDatabase,
  input: z.infer<typeof GET_HISTORICO_EMPRESA_INPUT_SCHEMA>,
): Promise<HistoricoEmpresaItem[]> {
  const dataInicio = input.dataInicio ? new Date(input.dataInicio) : null;
  const dataFim = input.dataFim ? new Date(input.dataFim) : null;
  const items: HistoricoEmpresaItem[] = [];

  if (!input.tipoEvento || input.tipoEvento === 'responsavel_financeiro_transfer') {
    const where = [eq(responsavelFinanceiroTransferLog.companyId, input.companyId)];
    if (dataInicio) where.push(gte(responsavelFinanceiroTransferLog.createdAt, dataInicio));
    if (dataFim) where.push(lte(responsavelFinanceiroTransferLog.createdAt, dataFim));
    if (input.actorId)
      where.push(eq(responsavelFinanceiroTransferLog.actorSuperAdminId, input.actorId));
    const rows = await db
      .select()
      .from(responsavelFinanceiroTransferLog)
      .where(and(...where));
    for (const row of rows) {
      items.push({
        fonte: 'responsavel_financeiro_transfer',
        dataEvento: row.createdAt ?? null,
        actorId: row.actorSuperAdminId,
        descricaoResumida: `Responsavel financeiro: ${row.eventType}`,
        detalhes: {
          eventType: row.eventType,
          previousHolder: { type: row.previousHolderType, id: row.previousHolderId },
          newHolder: { type: row.newHolderType, id: row.newHolderId },
          reason: row.reason,
        },
      });
    }
  }

  if (!input.tipoEvento || input.tipoEvento === 'monthly_unlock') {
    const where = [eq(monthlyUnlockLog.companyId, input.companyId)];
    if (dataInicio) where.push(gte(monthlyUnlockLog.createdAt, dataInicio));
    if (dataFim) where.push(lte(monthlyUnlockLog.createdAt, dataFim));
    if (input.actorId) where.push(eq(monthlyUnlockLog.desbloqueadoPor, input.actorId));
    const rows = await db
      .select()
      .from(monthlyUnlockLog)
      .where(and(...where));
    for (const row of rows) {
      items.push({
        fonte: 'monthly_unlock',
        dataEvento: row.createdAt ?? null,
        actorId: row.desbloqueadoPor,
        descricaoResumida: `Desbloqueio mensal: ${row.mes} · aba ${row.aba}`,
        detalhes: {
          mes: row.mes,
          aba: row.aba,
          justificativa: row.justificativa,
          liderId: row.liderId,
          liderTipo: row.liderTipo,
          expiraEm: row.expiraEm,
          houveAlteracao: row.houveAlteracao,
        },
      });
    }
  }

  if (!input.tipoEvento || input.tipoEvento === 'employee_leader_transfer') {
    // employeeLeaderHistory nao tem companyId direto — JOIN via employeeId.
    const { employees } = await import('../../db/schema');
    const rows = await db
      .select({
        id: employeeLeaderHistory.id,
        employeeId: employeeLeaderHistory.employeeId,
        liderId: employeeLeaderHistory.liderId,
        clevelId: employeeLeaderHistory.clevelId,
        dataInicio: employeeLeaderHistory.dataInicio,
        dataFim: employeeLeaderHistory.dataFim,
        reason: employeeLeaderHistory.reason,
        transferBatchId: employeeLeaderHistory.transferBatchId,
        createdAt: employeeLeaderHistory.createdAt,
      })
      .from(employeeLeaderHistory)
      .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
      .where(eq(employees.companyId, input.companyId));
    for (const row of rows) {
      const dataEvento = row.createdAt ?? null;
      if (dataInicio && dataEvento && dataEvento < dataInicio) continue;
      if (dataFim && dataEvento && dataEvento > dataFim) continue;
      items.push({
        fonte: 'employee_leader_transfer',
        dataEvento,
        actorId: null,
        descricaoResumida: `Vinculo de lideranca: ${row.dataInicio}`,
        detalhes: {
          employeeId: row.employeeId,
          liderId: row.liderId,
          clevelId: row.clevelId,
          dataInicio: row.dataInicio,
          dataFim: row.dataFim,
          reason: row.reason,
          transferBatchId: row.transferBatchId,
        },
      });
    }
  }

  if (!input.tipoEvento || input.tipoEvento === 'performance_multiplier_change') {
    // performanceMultiplierLog nao tem companyId direto — filtro via
    // JOIN em employees. Escopo canonico §13.10 preservado.
    const { employees } = await import('../../db/schema');
    const rows = await db
      .select({
        id: performanceMultiplierLog.id,
        employeeId: performanceMultiplierLog.employeeId,
        trimestre: performanceMultiplierLog.trimestre,
        nivelHierarquico: performanceMultiplierLog.nivelHierarquico,
        metaROIUsada: performanceMultiplierLog.metaROIUsada,
        ajusteRetroativo: performanceMultiplierLog.ajusteRetroativo,
        calculadoEm: performanceMultiplierLog.calculadoEm,
        createdAt: performanceMultiplierLog.createdAt,
      })
      .from(performanceMultiplierLog)
      .innerJoin(employees, eq(employees.id, performanceMultiplierLog.employeeId))
      .where(eq(employees.companyId, input.companyId));
    for (const row of rows) {
      const dataEvento = row.createdAt ?? null;
      if (dataInicio && dataEvento && dataEvento < dataInicio) continue;
      if (dataFim && dataEvento && dataEvento > dataFim) continue;
      items.push({
        fonte: 'performance_multiplier_change',
        dataEvento,
        actorId: null,
        descricaoResumida: `Meta de ROI: ${row.trimestre} · ${row.nivelHierarquico}`,
        detalhes: {
          employeeId: row.employeeId,
          trimestre: row.trimestre,
          nivelHierarquico: row.nivelHierarquico,
          metaROIUsada: row.metaROIUsada,
          ajusteRetroativo: row.ajusteRetroativo,
        },
      });
    }
  }

  if (!input.tipoEvento || input.tipoEvento === 'cycle_unlock_request') {
    const where = [eq(cycleUnlockRequests.companyId, input.companyId)];
    if (dataInicio) where.push(gte(cycleUnlockRequests.createdAt, dataInicio));
    if (dataFim) where.push(lte(cycleUnlockRequests.createdAt, dataFim));
    if (input.actorId) where.push(eq(cycleUnlockRequests.solicitanteId, input.actorId));
    const rows = await db
      .select()
      .from(cycleUnlockRequests)
      .where(and(...where));
    for (const row of rows) {
      items.push({
        fonte: 'cycle_unlock_request',
        dataEvento: row.createdAt ?? null,
        actorId: row.solicitanteId,
        descricaoResumida: `Solicitacao de desbloqueio: ${row.aba} · ${row.mes} · ${row.status}`,
        detalhes: {
          solicitanteTipo: row.solicitanteTipo,
          solicitanteId: row.solicitanteId,
          mes: row.mes,
          aba: row.aba,
          status: row.status,
          justificativa: row.justificativa,
          decididoPor: row.decididoPor,
          decididoEm: row.decididoEm,
          motivoRecusa: row.motivoRecusa,
          comentarioAprovacao: row.comentarioAprovacao,
        },
      });
    }
  }

  items.sort((a, b) => {
    const ta = a.dataEvento?.getTime() ?? 0;
    const tb = b.dataEvento?.getTime() ?? 0;
    return tb - ta;
  });
  return items;
}

// ============================================================
// DI (padrao S049/S100 — sem parametros ativos, mantido por simetria)
// ============================================================

export interface PlatformLogsRouterDeps {
  now?: () => Date;
}

/** DI default. */
export const DEFAULT_PLATFORM_LOGS_ROUTER_DEPS: Required<PlatformLogsRouterDeps> = {
  now: () => new Date(),
};

// ============================================================
// Factory canonica do sub-router
// ============================================================

/**
 * Factory canonica de `platformLogs` (S049/S100). Instanciada com
 * `DEFAULT_PLATFORM_LOGS_ROUTER_DEPS` no `appRouter`.
 */
export function createPlatformLogsRouter(deps: PlatformLogsRouterDeps = {}) {
  const _deps = { ...DEFAULT_PLATFORM_LOGS_ROUTER_DEPS, ...deps };
  // `now` reservado para simetria com outros routers (RV-13 consumo).
  void _deps.now;

  return router({
    // --------------------------------------------------------
    // listResponsavelFinanceiroTransfers — Bruno EXCLUSIVO
    // --------------------------------------------------------
    listResponsavelFinanceiroTransfers: roleProcedure(['super_admin'])
      .input(LIST_RF_TRANSFERS_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<ListRfTransfersResult> => {
        // Salvaguarda defensiva TS — `roleProcedure` ja filtrou.
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_PLATFORM_LOGS_FORBIDDEN });
        }

        // Reutiliza service canonico (ordem ASC canonica) e reverte
        // para DESC no consumo de UI. Zero edicao do service.
        const asc = await listTransferLogByCompany(ctx.db, input.companyId);
        const items: ResponsavelFinanceiroTransferLogItem[] = asc
          .slice()
          .reverse()
          .map((row) => ({
            id: row.id,
            companyId: row.companyId,
            previousHolderType: row.previousHolderType,
            previousHolderId: row.previousHolderId ?? null,
            newHolderType: row.newHolderType,
            newHolderId: row.newHolderId ?? null,
            actorSuperAdminId: row.actorSuperAdminId,
            eventType: row.eventType,
            reason: row.reason,
            createdAt: row.createdAt ?? null,
          }));

        return {
          companyId: input.companyId,
          items,
          count: items.length,
        };
      }),

    // --------------------------------------------------------
    // getHistoricoEmpresa — Bruno EXCLUSIVO — UNION §13.10 (S275)
    // --------------------------------------------------------
    getHistoricoEmpresa: roleProcedure(['super_admin'])
      .input(GET_HISTORICO_EMPRESA_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<GetHistoricoEmpresaResult> => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: MSG_PLATFORM_LOGS_FORBIDDEN });
        }
        const all = await fetchHistoricoEmpresa(ctx.db, input);
        const totalCount = all.length;
        const offset = (input.page - 1) * input.pageSize;
        const items = all.slice(offset, offset + input.pageSize);
        return {
          companyId: input.companyId,
          items,
          totalCount,
          page: input.page,
          pageSize: input.pageSize,
        };
      }),
  });
}

/** Tipo canonico do sub-router. */
export type PlatformLogsRouter = ReturnType<typeof createPlatformLogsRouter>;
