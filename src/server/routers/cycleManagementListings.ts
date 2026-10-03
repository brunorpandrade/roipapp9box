// ROIP APP 9BOX — sub-router `cycleManagementListings` (ME-B9.1).
//
// Procs de leitura canonicas da tela `/cycle-management` (DOC 05 §14.18).
// Decisao canonica de desenho (RV-08 ME-B9.1): manter as listagens em
// router separado dos routers `cycleUnlockRequests` (ja 1000+ linhas,
// focado em mutations canonicas CRUD de uma solicitacao) e evitar
// criar um router dedicado `cycleSchedule` (que teria apenas uma proc
// publica de leitura — nao justifica entidade propria). Este router
// agrega as 4 leituras canonicas da tela em um unico lugar.
//
// Procedures canonicas (DOC 05 §14.18):
//   - `listPendingUnlockByCompany` — Area 3, bloco Pendentes.
//   - `listHistoricoUnlockByCompany` — Area 3, bloco Historico (90 dias).
//   - `listCycleScheduleByCompany` — Area 2, tabela paginada.
//   - `listCalendarioByCompany` — Area 1, calendario trimestre
//     corrente+proximo.
//
// Perfis admitidos (DOC 02 §10.5 — matrix.ts linha 350, pos ME-B9.1 patch2):
//   - super_admin — atravessa (passa `companyId` explicito).
//   - rh / rh_lider — operam APENAS na propria `companyId` (defense in
//     depth: `assertUserCompanyScope`).
//   - clevel+isRH — padrao canonico ME 3.5 D6 via `rhAllowedProcedure`;
//     guard fino de `cLevelMembers.isRH=true` resolvido server-side.
//   - clevel sem isRH / lider — rejeitados por `rhAllowedProcedure`.
//
// Resolucao canonica de nomes (PC1d DOC 05 §14.18 — RH ve agregado nao
// nominal): `cycleUnlockRequests` ja grava `solicitanteTipo` + `liderTipo`
// como polimorficos (`employee` ou `clevel`). Este router resolve nomes
// via LEFT JOIN em `employees` e `cLevelMembers` para evitar N+1 no
// cliente. O proprio PC1d (filtragem de C-levels na tabela cycleSchedule)
// e aplicado no cliente §14.18 — este router devolve tudo e o cliente
// adiciona a nota canonica literal.
//
// **RV-12.** Zero SQL cru — 100% Drizzle tipado.
// **RV-13.** Cada export tem chamador na propria ME:
//   - `createCycleManagementListingsRouter` → `routers/index.ts`
//     (registrado como `cycleManagementListings`) + testes.
//   - `PENDING_LIMIT_DEFAULT` → consumido pela proc + teste.
//   - `HISTORICO_WINDOW_DAYS` → consumido pela proc + teste.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import {
  cLevelMembers,
  cycleSchedule,
  cycleUnlockRequests,
  employees,
  superAdmins,
} from '../../db/schema';
import { TIPO_CICLO_VALUES, type TipoCiclo } from '../../db/schema/enums';
import { assertUserCompanyScope } from '../../lib/scope/userCompanyScope';
import { rhAllowedProcedure } from '../auth/rhAllowedProcedure';
import { router } from '../trpc';

// ============================================================
// Constantes canonicas exportadas (RV-13 — consumidas em teste)
// ============================================================

/**
 * Limite canonico de linhas da lista Pendentes §14.18. Mesmo quando ha
 * mais solicitacoes pendentes, cap defensivo evita payload gigante no
 * canto raro (empresa com fluxo degenerado).
 */
export const PENDING_LIMIT_DEFAULT = 200;

/**
 * Janela canonica do Historico §14.18 — ultimos 90 dias.
 */
export const HISTORICO_WINDOW_DAYS = 90;

// ============================================================
// Inputs canonicos (zod)
// ============================================================

const listPendingInput = z.object({
  companyId: z.number().int().positive(),
});

const listHistoricoInput = z.object({
  companyId: z.number().int().positive(),
  dias: z.number().int().min(1).max(365).optional(),
});

const CYCLE_STATUS_VALUES = ['aberto', 'atrasado', 'fechado'] as const;

const listCycleScheduleInput = z.object({
  companyId: z.number().int().positive(),
  tipoCiclo: z.enum(TIPO_CICLO_VALUES).nullable().optional(),
  status: z.enum(CYCLE_STATUS_VALUES).nullable().optional(),
  cicloReferenciaIn: z.array(z.string().max(20)).nullable().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).optional(),
});

const listCalendarioInput = z.object({
  companyId: z.number().int().positive(),
  cicloReferenciaIn: z.array(z.string().max(20)).min(1),
});

// ============================================================
// Output shapes canonicos (view-model da tela — mapeados do schema)
// ============================================================

export interface UnlockRequestWithNames {
  readonly id: number;
  readonly companyId: number;
  readonly mes: string;
  readonly aba: 'rh' | 'lider' | 'faturamento';
  readonly liderId: number | null;
  readonly liderTipo: 'employee' | 'clevel' | null;
  readonly liderNome: string | null;
  readonly solicitanteTipo: 'employee' | 'clevel';
  readonly solicitanteId: number;
  readonly solicitanteNome: string;
  readonly justificativa: string;
  readonly status: 'pendente' | 'aprovada' | 'recusada' | 'cancelada';
  readonly decididoPor: number | null;
  readonly decididoPorNome: string | null;
  readonly decididoEm: string | null;
  readonly motivoRecusa: string | null;
  readonly comentarioAprovacao: string | null;
  readonly createdAt: string;
}

export interface CycleScheduleRowOut {
  readonly id: number;
  readonly tipoCiclo: TipoCiclo;
  readonly cicloReferencia: string;
  readonly dataAbertura: string | null;
  readonly dataCorte: string | null;
  readonly dataFechamento: string | null;
  readonly status: 'aberto' | 'atrasado' | 'fechado';
  readonly totalElegiveis: number | null;
  readonly totalRespondidos: number | null;
}

export interface CycleSchedulePageOut {
  readonly rows: readonly CycleScheduleRowOut[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ============================================================
// Helper: resolucao de nomes para N solicitacoes (1 query cada tabela)
// ============================================================

interface NameMap {
  readonly employees: Map<number, string>;
  readonly clevels: Map<number, string>;
  readonly superAdmins: Map<number, string>;
}

async function resolveNomes(
  db: RoipDatabase,
  solicitanteEmployees: readonly number[],
  solicitanteClevels: readonly number[],
  liderEmployees: readonly number[],
  liderClevels: readonly number[],
  decididoPorIds: readonly number[],
): Promise<NameMap> {
  const empIds = Array.from(new Set([...solicitanteEmployees, ...liderEmployees])).filter(
    (n) => n > 0,
  );
  const clIds = Array.from(new Set([...solicitanteClevels, ...liderClevels])).filter((n) => n > 0);
  const saIds = Array.from(new Set(decididoPorIds)).filter((n) => n > 0);

  const empMap = new Map<number, string>();
  const clMap = new Map<number, string>();
  const saMap = new Map<number, string>();

  if (empIds.length > 0) {
    const rows = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, empIds));
    for (const r of rows) {
      empMap.set(r.id, r.name);
    }
  }
  if (clIds.length > 0) {
    const rows = await db
      .select({ id: cLevelMembers.id, name: cLevelMembers.name })
      .from(cLevelMembers)
      .where(inArray(cLevelMembers.id, clIds));
    for (const r of rows) {
      clMap.set(r.id, r.name);
    }
  }
  if (saIds.length > 0) {
    const rows = await db
      .select({ id: superAdmins.id, name: superAdmins.name })
      .from(superAdmins)
      .where(inArray(superAdmins.id, saIds));
    for (const r of rows) {
      saMap.set(r.id, r.name);
    }
  }

  return { employees: empMap, clevels: clMap, superAdmins: saMap };
}

function resolveNome(tipo: 'employee' | 'clevel', id: number, nameMap: NameMap): string {
  if (id === 0) {
    return 'Super Admin';
  }
  const m = tipo === 'employee' ? nameMap.employees : nameMap.clevels;
  return m.get(id) ?? '—';
}

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

// ============================================================
// Factory canonica
// ============================================================

/**
 * Cria o sub-router `cycleManagementListings`. Factory bit-exact ao
 * padrao canonico das demais factories de routers de dominio (ME-032,
 * ME-034, ME-057a etc.).
 */
export function createCycleManagementListingsRouter() {
  return router({
    // --------------------------------------------------------
    // listPendingUnlockByCompany — Area 3 Pendentes §14.18
    // --------------------------------------------------------
    listPendingUnlockByCompany: rhAllowedProcedure()
      .input(listPendingInput)
      .query(async ({ ctx, input }): Promise<readonly UnlockRequestWithNames[]> => {
        assertUserCompanyScope(ctx.user, input.companyId);

        const rows = await ctx.db
          .select()
          .from(cycleUnlockRequests)
          .where(
            and(
              eq(cycleUnlockRequests.companyId, input.companyId),
              eq(cycleUnlockRequests.status, 'pendente'),
            ),
          )
          .orderBy(desc(cycleUnlockRequests.createdAt), desc(cycleUnlockRequests.id))
          .limit(PENDING_LIMIT_DEFAULT);

        return await mapRowsToView(ctx.db, rows);
      }),

    // --------------------------------------------------------
    // listHistoricoUnlockByCompany — Area 3 Historico 90 dias §14.18
    // --------------------------------------------------------
    listHistoricoUnlockByCompany: rhAllowedProcedure()
      .input(listHistoricoInput)
      .query(async ({ ctx, input }): Promise<readonly UnlockRequestWithNames[]> => {
        assertUserCompanyScope(ctx.user, input.companyId);

        const dias = input.dias ?? HISTORICO_WINDOW_DAYS;
        const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

        const rows = await ctx.db
          .select()
          .from(cycleUnlockRequests)
          .where(
            and(
              eq(cycleUnlockRequests.companyId, input.companyId),
              inArray(cycleUnlockRequests.status, ['aprovada', 'recusada', 'cancelada']),
              gte(cycleUnlockRequests.createdAt, cutoff),
            ),
          )
          .orderBy(desc(cycleUnlockRequests.createdAt), desc(cycleUnlockRequests.id))
          .limit(PENDING_LIMIT_DEFAULT);

        return await mapRowsToView(ctx.db, rows);
      }),

    // --------------------------------------------------------
    // listCycleScheduleByCompany — Area 2 tabela paginada §14.18
    // --------------------------------------------------------
    listCycleScheduleByCompany: rhAllowedProcedure()
      .input(listCycleScheduleInput)
      .query(async ({ ctx, input }): Promise<CycleSchedulePageOut> => {
        assertUserCompanyScope(ctx.user, input.companyId);

        const page = input.page ?? 1;
        const pageSize = input.pageSize ?? 25;
        const offset = (page - 1) * pageSize;

        const conds = [eq(cycleSchedule.companyId, input.companyId)];
        if (input.tipoCiclo !== null && input.tipoCiclo !== undefined) {
          conds.push(eq(cycleSchedule.tipoCiclo, input.tipoCiclo));
        }
        if (input.status !== null && input.status !== undefined) {
          conds.push(eq(cycleSchedule.status, input.status));
        }
        if (
          input.cicloReferenciaIn !== null &&
          input.cicloReferenciaIn !== undefined &&
          input.cicloReferenciaIn.length > 0
        ) {
          conds.push(inArray(cycleSchedule.cicloReferencia, input.cicloReferenciaIn));
        }

        const whereExpr = conds.length === 1 ? conds[0] : and(...conds);

        const rowsRaw = await ctx.db
          .select()
          .from(cycleSchedule)
          .where(whereExpr)
          .orderBy(desc(cycleSchedule.cicloReferencia), asc(cycleSchedule.tipoCiclo))
          .limit(pageSize)
          .offset(offset);

        const totalRows = await ctx.db
          .select({ id: cycleSchedule.id })
          .from(cycleSchedule)
          .where(whereExpr);

        const rows: readonly CycleScheduleRowOut[] = rowsRaw.map((r) => ({
          id: r.id,
          tipoCiclo: r.tipoCiclo,
          cicloReferencia: r.cicloReferencia,
          dataAbertura: toIso(r.dataAbertura),
          dataCorte: toIso(r.dataCorte),
          dataFechamento: toIso(r.dataFechamento),
          status: r.status,
          totalElegiveis: r.totalElegiveis,
          totalRespondidos: r.totalRespondidos,
        }));

        return { rows, total: totalRows.length, page, pageSize };
      }),

    // --------------------------------------------------------
    // listCalendarioByCompany — Area 1 §14.18
    // --------------------------------------------------------
    listCalendarioByCompany: rhAllowedProcedure()
      .input(listCalendarioInput)
      .query(async ({ ctx, input }): Promise<readonly CycleScheduleRowOut[]> => {
        assertUserCompanyScope(ctx.user, input.companyId);

        const rowsRaw = await ctx.db
          .select()
          .from(cycleSchedule)
          .where(
            and(
              eq(cycleSchedule.companyId, input.companyId),
              inArray(cycleSchedule.cicloReferencia, input.cicloReferenciaIn),
            ),
          )
          .orderBy(asc(cycleSchedule.cicloReferencia), asc(cycleSchedule.tipoCiclo));

        return rowsRaw.map((r) => ({
          id: r.id,
          tipoCiclo: r.tipoCiclo,
          cicloReferencia: r.cicloReferencia,
          dataAbertura: toIso(r.dataAbertura),
          dataCorte: toIso(r.dataCorte),
          dataFechamento: toIso(r.dataFechamento),
          status: r.status,
          totalElegiveis: r.totalElegiveis,
          totalRespondidos: r.totalRespondidos,
        }));
      }),
  });
}

// ============================================================
// Helpers privados
// ============================================================

type UnlockRow = typeof cycleUnlockRequests.$inferSelect;

async function mapRowsToView(
  db: RoipDatabase,
  rows: readonly UnlockRow[],
): Promise<readonly UnlockRequestWithNames[]> {
  if (rows.length === 0) {
    return [];
  }

  const solicitanteEmployees: number[] = [];
  const solicitanteClevels: number[] = [];
  const liderEmployees: number[] = [];
  const liderClevels: number[] = [];
  const decididoPorIds: number[] = [];

  for (const r of rows) {
    if (r.solicitanteTipo === 'employee') {
      solicitanteEmployees.push(r.solicitanteId);
    } else {
      solicitanteClevels.push(r.solicitanteId);
    }
    if (r.liderId !== null && r.liderTipo !== null) {
      if (r.liderTipo === 'employee') {
        liderEmployees.push(r.liderId);
      } else {
        liderClevels.push(r.liderId);
      }
    }
    if (r.decididoPor !== null) {
      decididoPorIds.push(r.decididoPor);
    }
  }

  const nameMap = await resolveNomes(
    db,
    solicitanteEmployees,
    solicitanteClevels,
    liderEmployees,
    liderClevels,
    decididoPorIds,
  );

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    mes: r.mes,
    aba: r.aba,
    liderId: r.liderId,
    liderTipo: r.liderTipo,
    liderNome:
      r.liderId !== null && r.liderTipo !== null
        ? resolveNome(r.liderTipo, r.liderId, nameMap)
        : null,
    solicitanteTipo: r.solicitanteTipo,
    solicitanteId: r.solicitanteId,
    solicitanteNome: resolveNome(r.solicitanteTipo, r.solicitanteId, nameMap),
    justificativa: r.justificativa,
    status: r.status,
    decididoPor: r.decididoPor,
    decididoPorNome:
      r.decididoPor !== null ? (nameMap.superAdmins.get(r.decididoPor) ?? null) : null,
    decididoEm: toIso(r.decididoEm as Date | null),
    motivoRecusa: r.motivoRecusa,
    comentarioAprovacao: r.comentarioAprovacao,
    createdAt: toIso(r.createdAt as Date | null) ?? new Date(0).toISOString(),
  }));
}
