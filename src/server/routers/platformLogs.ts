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
import { z } from 'zod';

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
  });
}

/** Tipo canonico do sub-router. */
export type PlatformLogsRouter = ReturnType<typeof createPlatformLogsRouter>;
