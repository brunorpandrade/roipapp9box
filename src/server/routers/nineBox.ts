// ROIP APP 9BOX — sub-router `nineBox` (ME-042).
//
// Decima-terceira ME do Bloco B3 (ME-042). Abre a superficie de leitura
// publica do 9-Box do §19.4. O motor `nineBoxCalculationEngine` entregue
// na ME-041 materializou `nineBoxClassifications` a cada trimestre em
// que os dois eixos ficaram disponiveis (§7.1); este sub-router expoe
// a leitura da linha ja calculada, sem recomputar posicao, quadrante
// ou direcao on-the-fly (invariante canonica: o motor tem a autoridade
// sobre o calculo; leituras publicas so lem tabelas materializadas).
//
// Procedures canonicas (DOC 03 §7.9 + §19.4 decima e decima-primeira
// linhas):
//   - `nineBox.getNineBoxSnapshot` — modo individual retorna a linha
//     `nineBoxClassifications` do (colaborador, trimestre) ou `null`;
//     modo empresa retorna todos os colaboradores ATIVOS (§7.6) da
//     empresa com classificacao no trimestre. Discriminated union por
//     tag `mode`.
//   - `nineBox.getNineBoxTrajectory` — sequencia historica de
//     quadrantes do colaborador nos ultimos N trimestres. Default
//     N = 4, cap N = 20 (S120 — paralelo direto a S068).
//
// Autorizacao canonica (§7.9 + §7.6 + DOC 02 §10.4):
//   - `getNineBoxSnapshot` modo empresa (S122): APENAS Bruno + RH +
//     RH-Lider. Lider e C-level chamando com `mode: 'company'` recebem
//     FORBIDDEN. Racional: snapshot nominal com `employeeId` NAO e
//     agregado anonimo (PC1c §15.6 protege apenas agregados anonimos);
//     Lider e C-level tem escopo de cadeia direta e devem usar
//     `mode: 'employee'` para cada colaborador da propria cadeia. UI
//     de dashboard de 9-Box da empresa (rota `/dashboard-9box` no
//     stub §10.5) e restrita a Bruno + RH por precedente.
//   - `getNineBoxSnapshot` modo individual: espelha `plenitude.
//     getPlenitudeData` — Bruno + RH + RH-Lider (empresa); C-level
//     (empresa); Lider (cadeia direta). §3.13 aplicavel a inativo.
//   - `getNineBoxTrajectory`: espelha modo individual — Bruno + RH
//     + C-level (empresa); Lider (cadeia direta). §3.13 aplicavel.
//
// S### desta ME (aprovadas por Bruno na abertura):
//   - S118: DTOs publicos reusam tipos canonicos exportados por
//     `nineBoxCalculationEngine.ts` (`NineBoxPosicaoX`,
//     `NineBoxPosicaoY`, `NineBoxQuadrante`,
//     `NineBoxDirecaoMovimento`) — bit-a-bit com ENUM
//     `nineBoxClassifications.quadrante` do DOC 01 §8.4 e S116.
//   - S119: `getNineBoxSnapshot` como discriminated union com tag
//     `mode: 'employee'|'company'` (padrao S075 do ME-036).
//   - S120: `getNineBoxTrajectory` com N default 4, cap 20 (paralelo
//     direto a S068 do dashboard).
//   - S122: modo empresa do `getNineBoxSnapshot` restrito a Bruno +
//     RH (RHp, RHL1, RHL2); Lider e C-level recebem FORBIDDEN nesse
//     modo, mas podem usar `mode: 'employee'` para colaboradores da
//     propria cadeia.
//
// Convencoes canonicas herdadas:
//   - DI factory `createNineBoxRouter()` — sem dependencias
//     injetaveis; leitura pura, sem motor. Simetria com
//     `createDashboardRouter()` (ME-035) e `createPlenitudeRouter()`
//     (mesma ME-042).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). Leituras via services
//     canonicos e queries diretas Drizzle-tipadas para joins.
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13).
//   - Idempotencia canonica das leituras: mesmo input → mesmo output
//     ate a proxima escrita de motor.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/nineBox-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { RoipDatabase } from '../../db/client';
import { employees, nineBoxClassifications } from '../../db/schema';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import { getNineBoxClassificationByQuarter } from '../services/nineBoxClassifications';
import type {
  NineBoxDirecaoMovimento,
  NineBoxPosicaoX,
  NineBoxPosicaoY,
  NineBoxQuadrante,
} from '../services/nineBoxCalculationEngine';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/**
 * §7.9 fixa "Default N = 4" para a trajetoria. Paralelo direto a
 * S068 (DASHBOARD_HISTORY_LIMIT_DEFAULT do dashboard).
 */
export const NINE_BOX_TRAJECTORY_LIMIT_DEFAULT = 4 as const;

/**
 * S120 — cap 20 (paralelo direto a S068 do dashboard). N maior nao
 * tem precedente no repo; leitores que precisem de janela mais longa
 * devem paginar em ME futura.
 */
export const NINE_BOX_TRAJECTORY_LIMIT_CAP = 20 as const;

/**
 * §6.1 — trimestre canonico `YYYY-QN`. Redeclarado neste sub-router
 * por precedente do repo (dashboard/economicDiagnosis/quarterlyCalculation
 * declaram o proprio schema local para evitar dependencia cruzada
 * entre routers de dominios distintos).
 */
export const TRIMESTRE_INPUT_SCHEMA_NINE_BOX = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §7.7 (DOC 03) + §8.4 (DOC 01) — DTO publico de uma linha canonica
 * de `nineBoxClassifications`. Deriva diretamente do schema Drizzle
 * (`$inferSelect`) para preservar bit-a-bit os ENUMs canonicos:
 * `posicaoX` ∈ {'baixo','medio','alto'} (S118, tipo `NineBoxPosicaoX`
 * exportado pelo motor); `posicaoY` ∈ {'baixa','media','alta'}
 * (`NineBoxPosicaoY`); `quadrante` com acentos UTF-8 literais
 * (`EQUILÍBRIO FRÁGIL`, `DESEMPENHO CRÍTICO`, `RISCO CRÍTICO` —
 * `NineBoxQuadrante` + S116); `direcaoMovimento` ∈ {'subiu','desceu',
 * 'lateral','estavel','primeira_vez'} (`NineBoxDirecaoMovimento`).
 *
 * Reexporta os tipos do motor como parte do contrato publico: quem
 * consome este DTO nao precisa importar do motor separadamente.
 */
export type NineBoxClassificationRow = typeof nineBoxClassifications.$inferSelect;

/** Reexport S118 — tipo canonico do quadrante (bit-a-bit com ENUM §8.4 e §7.3). */
export type { NineBoxDirecaoMovimento, NineBoxPosicaoX, NineBoxPosicaoY, NineBoxQuadrante };

/**
 * S119 — resultado do `getNineBoxSnapshot` no modo individual.
 * Discriminated union por tag `mode: 'employee'` que se casa com o
 * input. Contem a linha crua da classificacao (ou `null` se ausente:
 * §7.1 canoniza que a linha existe apenas quando os dois eixos
 * estavam disponiveis no trimestre).
 */
export interface NineBoxSnapshotEmployee {
  mode: 'employee';
  employeeId: number;
  trimestre: string;
  classification: NineBoxClassificationRow | null;
}

/**
 * S119 — resultado do `getNineBoxSnapshot` no modo empresa.
 * Discriminated union por tag `mode: 'company'`. `items` contem
 * APENAS colaboradores ATIVOS (§7.6 — colaboradores inativos sao
 * excluidos da matriz mesmo com dados historicos calculados) e
 * apenas os que tem classificacao no trimestre (INNER JOIN entre
 * `employees` e `nineBoxClassifications`). Colaboradores sem
 * classificacao no trimestre NAO aparecem — a leitura publica reflete
 * o que o motor materializou.
 */
export interface NineBoxSnapshotCompany {
  mode: 'company';
  companyId: number;
  trimestre: string;
  items: NineBoxSnapshotCompanyItem[];
}

/**
 * Item da lista canonica do snapshot da empresa. Inclui atributos
 * canonicos do colaborador (§7.6 filtros: nome/departamento/cargo)
 * e a linha completa da classificacao para uso pela superficie de
 * dashboard 9-Box.
 */
export interface NineBoxSnapshotCompanyItem {
  employeeId: number;
  nome: string;
  departamento: string;
  cargo: string;
  classification: NineBoxClassificationRow;
}

/** S119 — union canonica do resultado do snapshot (tag `mode`). */
export type NineBoxSnapshotResult = NineBoxSnapshotEmployee | NineBoxSnapshotCompany;

/**
 * S120 — item da trajetoria historica. Apenas os campos canonicos
 * exibidos pela superficie de dashboard/portal (trimestre, quadrante,
 * direcao, calculadoEm) — colaborador tende a consumir a trilha na
 * horizontal, sem os snapshots numericos crus dos eixos. Casos que
 * precisem dos scores completos usam `nineBox.getNineBoxSnapshot`
 * proc-a-proc, ou lem `plenitudeData` via `plenitude.getPlenitudeData`.
 */
export interface NineBoxTrajectoryItem {
  trimestre: string;
  quadrante: NineBoxQuadrante;
  quadranteAnterior: string | null;
  direcaoMovimento: NineBoxDirecaoMovimento | null;
  calculadoEm: Date | null;
}

/**
 * S120 — resultado da trajetoria. Ordenacao canonica: trimestre
 * DECRESCENTE (do mais recente para o mais antigo — mesma orientacao
 * do `history` do dashboard, S068). N atende ao input; limit maximo
 * capado em `NINE_BOX_TRAJECTORY_LIMIT_CAP`.
 */
export interface NineBoxTrajectoryResult {
  employeeId: number;
  items: NineBoxTrajectoryItem[];
}

// ============================================================
// Guards e helpers canonicos
// ============================================================

/**
 * Guard canonico cruzado (§2.4): super_admin atravessa; demais roles
 * cruzam contra o `companyId` do proprio JWT. Reusado por todas as
 * procs deste router.
 */
function assertCompanyScopeNineBox(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Recurso fora do escopo da empresa.',
    });
  }
}

/**
 * Guard canonico S066 (cadeia direta de lider). Restrito a `role ===
 * 'lider'`. Lider ve apenas liderados diretos ativos + o proprio
 * dashboard.
 */
async function assertLiderDiretoNineBox(
  db: RoipDatabase,
  user: AuthenticatedUser,
  targetEmployeeId: number,
): Promise<void> {
  if (user.role !== 'lider') {
    return;
  }
  if (user.userId === targetEmployeeId) {
    return;
  }
  const link = await getActiveLeaderHistoryByEmployee(db, targetEmployeeId);
  if (!link || link.liderId !== user.userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Colaborador fora da cadeia direta do lider.',
    });
  }
}

/**
 * S122 — guarda do modo empresa do `getNineBoxSnapshot`. Bruno, RH e
 * RH-Lider apenas. Lider e C-level recebem FORBIDDEN; devem usar
 * `mode: 'employee'` para colaboradores da propria cadeia.
 */
function assertCompanyModePermitido(user: AuthenticatedUser): void {
  const allowed = user.role === 'super_admin' || user.role === 'rh' || user.role === 'rh_lider';
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Snapshot da empresa restrito a Bruno e RH.',
    });
  }
}

/**
 * §3.13 — colaborador inativo: leitura restrita a Bruno e RH.
 * Chamado apos resolver a linha em `employees`.
 */
function assertInativoPermitido(user: AuthenticatedUser, status: 'ativo' | 'inativo'): void {
  if (status !== 'inativo') {
    return;
  }
  const allowsInactive =
    user.role === 'super_admin' || user.role === 'rh' || user.role === 'rh_lider';
  if (!allowsInactive) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: '9-Box de colaborador inativo restrito a Bruno e RH.',
    });
  }
}

// ============================================================
// Schemas de input (S119 — discriminated union)
// ============================================================

const SNAPSHOT_EMPLOYEE_INPUT = z.object({
  mode: z.literal('employee'),
  companyId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_NINE_BOX,
});

const SNAPSHOT_COMPANY_INPUT = z.object({
  mode: z.literal('company'),
  companyId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA_NINE_BOX,
});

export const SNAPSHOT_INPUT_SCHEMA_NINE_BOX = z.discriminatedUnion('mode', [
  SNAPSHOT_EMPLOYEE_INPUT,
  SNAPSHOT_COMPANY_INPUT,
]);

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `nineBox`. Sem parametros — leitura pura,
 * sem motor. Simetria com `createDashboardRouter` (ME-035) e
 * `createPlenitudeRouter` (mesma ME-042).
 */
export function createNineBoxRouter() {
  return router({
    // ============================================================
    // Proc 1 — getNineBoxSnapshot (§7.9 + §19.4)
    // ============================================================
    getNineBoxSnapshot: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(SNAPSHOT_INPUT_SCHEMA_NINE_BOX)
      .query(async ({ ctx, input }): Promise<NineBoxSnapshotResult> => {
        // §2.4 — guard cruzado (aplica-se a ambos os modos).
        assertCompanyScopeNineBox(ctx.user, input.companyId);

        if (input.mode === 'company') {
          // S122 — modo empresa restrito a Bruno + RH.
          assertCompanyModePermitido(ctx.user);

          // §7.6 — INNER JOIN entre employees e nineBoxClassifications,
          // filtrando por empresa + trimestre + status=ativo. Ordenacao
          // canonica: `employeeId` ascendente (paralelo direto a
          // `listNineBoxClassificationsByCompany` do service, sem
          // impor ordenacao arbitraria de UI — a superficie ordena
          // por criterio proprio se necessario).
          const rows = await ctx.db
            .select({
              employeeId: employees.id,
              nome: employees.name,
              departamento: employees.departamento,
              cargo: employees.descricaoCBO,
              classification: nineBoxClassifications,
            })
            .from(nineBoxClassifications)
            .innerJoin(employees, eq(employees.id, nineBoxClassifications.employeeId))
            .where(
              and(
                eq(nineBoxClassifications.companyId, input.companyId),
                eq(nineBoxClassifications.trimestre, input.trimestre),
                eq(employees.status, 'ativo'),
              ),
            )
            .orderBy(employees.id);

          const items: NineBoxSnapshotCompanyItem[] = rows.map((row) => ({
            employeeId: row.employeeId,
            nome: row.nome,
            departamento: row.departamento,
            cargo: row.cargo,
            classification: row.classification,
          }));

          return {
            mode: 'company',
            companyId: input.companyId,
            trimestre: input.trimestre,
            items,
          };
        }

        // Modo individual — pre-condicao: colaborador existe e
        // pertence a `input.companyId`.
        const empRows = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            status: employees.status,
          })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const emp = empRows[0];
        if (!emp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Colaborador nao encontrado.',
          });
        }
        if (emp.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Colaborador nao encontrado na empresa informada.',
          });
        }

        assertInativoPermitido(ctx.user, emp.status ?? 'ativo');
        await assertLiderDiretoNineBox(ctx.db, ctx.user, input.employeeId);

        const classification = await getNineBoxClassificationByQuarter(
          ctx.db,
          input.companyId,
          input.employeeId,
          input.trimestre,
        );

        return {
          mode: 'employee',
          employeeId: input.employeeId,
          trimestre: input.trimestre,
          classification: classification ?? null,
        };
      }),

    // ============================================================
    // Proc 2 — getNineBoxTrajectory (§7.9 + §19.4)
    // ============================================================
    getNineBoxTrajectory: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          employeeId: z.number().int().positive(),
          limit: z.number().int().positive().max(NINE_BOX_TRAJECTORY_LIMIT_CAP).optional(),
        }),
      )
      .query(async ({ ctx, input }): Promise<NineBoxTrajectoryResult> => {
        const limit = input.limit ?? NINE_BOX_TRAJECTORY_LIMIT_DEFAULT;

        // §2.4 — guard cruzado.
        assertCompanyScopeNineBox(ctx.user, input.companyId);

        // Precondicao: colaborador existe e pertence a companyId.
        const empRows = await ctx.db
          .select({
            id: employees.id,
            companyId: employees.companyId,
            status: employees.status,
          })
          .from(employees)
          .where(eq(employees.id, input.employeeId))
          .limit(1);
        const emp = empRows[0];
        if (!emp) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Colaborador nao encontrado.',
          });
        }
        if (emp.companyId !== input.companyId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Colaborador nao encontrado na empresa informada.',
          });
        }

        assertInativoPermitido(ctx.user, emp.status ?? 'ativo');
        await assertLiderDiretoNineBox(ctx.db, ctx.user, input.employeeId);

        // Leitura canonica: ultimos N trimestres em ordem decrescente
        // (mesma orientacao do `history` do dashboard — S068). Escopo
        // canonico: apenas linhas da mesma empresa e do mesmo
        // colaborador (a UNIQUE canonica `uq_nineBox` cobre
        // (companyId, employeeId, trimestre); filtrar por companyId
        // e defesa em profundidade para transferencias entre empresas
        // — cenario que nao pode acontecer hoje mas fica coerente).
        const rows = await ctx.db
          .select({
            trimestre: nineBoxClassifications.trimestre,
            quadrante: nineBoxClassifications.quadrante,
            quadranteAnterior: nineBoxClassifications.quadranteAnterior,
            direcaoMovimento: nineBoxClassifications.direcaoMovimento,
            calculadoEm: nineBoxClassifications.calculadoEm,
          })
          .from(nineBoxClassifications)
          .where(
            and(
              eq(nineBoxClassifications.companyId, input.companyId),
              eq(nineBoxClassifications.employeeId, input.employeeId),
            ),
          )
          .orderBy(desc(nineBoxClassifications.trimestre))
          .limit(limit);

        const items: NineBoxTrajectoryItem[] = rows.map((row) => ({
          trimestre: row.trimestre,
          quadrante: row.quadrante,
          quadranteAnterior: row.quadranteAnterior,
          direcaoMovimento: row.direcaoMovimento,
          calculadoEm: row.calculadoEm,
        }));

        return {
          employeeId: input.employeeId,
          items,
        };
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type NineBoxRouter = ReturnType<typeof createNineBoxRouter>;
