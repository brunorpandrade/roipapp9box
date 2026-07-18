// ROIP APP 9BOX — sub-router `plenitude` (ME-042).
//
// Decima-terceira ME do Bloco B3. Abre a superficie de leitura publica
// do Eixo Y do §19.4. O motor de plenitude entregue na ME-040
// materializou `plenitudeData` a cada submit de Instrumento A ou C;
// este sub-router expoe a leitura da linha ja calculada, sem recomputar
// nenhuma faixa ou score on-the-fly (invariante canonica: o motor tem
// a autoridade sobre o calculo — S107 —, leituras publicas so lem
// tabelas materializadas).
//
// Procedure canonica (DOC 03 §6.8 setima linha + §19.4 nona linha):
//   - `plenitude.getPlenitudeData` — retorna a linha `plenitudeData`
//     de (companyId, employeeId, trimestre) ou `null` se ausente.
//
// Autorizacao canonica (§6.8 setima linha combinado com DOC 02 §10.4
// linha `/dashboard-individual/:id` e §15.5):
//   - Bruno (super_admin): atravessa companyId (§2.4).
//   - RH, RH-Lider: escopo empresa (companyId do JWT).
//   - C-level: escopo empresa (companyId do JWT — cadeia direta
//     descendente e materia do motor de organograma, ME futura).
//   - Lider: liderado direto ativo (S066 — `employeeLeaderHistory`
//     com `dataFim IS NULL` e `liderId = ctx.user.userId`), ou o
//     proprio dashboard.
//   - §3.13 (colaborador inativo): so Bruno + RH veem.
//   - PC1e §15.5: Perfil Individual de C-level e restrito a Bruno.
//     Como `plenitudeData.employeeId` referencia `employees.id`, e
//     C-levels vivem em `cLevelMembers` (tabela separada), nao ha
//     entrada em `plenitudeData` para C-levels — a guarda PC1e e
//     satisfeita por construcao arquitetural, sem checagem runtime
//     necessaria neste router. A defesa PC1e vive na proc
//     `individualProfile.getReport` (§15.5 explicito) quando essa
//     ME acontecer.
//
// S### desta ME (aprovadas por Bruno na abertura):
//   - S118: DTOs publicos reusam tipos canonicos exportados pelos
//     motores/schemas fechados (dependencia unidirecional router →
//     schema, sem ciclo). `PlenitudeDataResult` deriva de
//     `plenitudeData.$inferSelect`.
//   - S123: faixa CNPJ reservada da ME-042 e 790..799 (padrao
//     S076/S109 estendido) — vive no arquivo de teste.
//
// Convencoes canonicas herdadas:
//   - DI factory `createPlenitudeRouter()` — sem dependencias
//     injetaveis; leitura pura, sem motor. Simetria com
//     `createDashboardRouter()` (ME-035) e
//     `createEconomicDiagnosisRouter()` (ME-035).
//   - Zero SQL cru: 100% Drizzle tipado (RV-12). `getPlenitudeData
//     ByQuarter` do service e o unico ponto de leitura consumido.
//   - Zero code dead: cada export tem chamador nos testes de integracao
//     desta ME + acoplamento no `appRouter` em `index.ts` (RV-13).
//   - Idempotencia canonica das leituras: mesmo input → mesmo output
//     ate a proxima escrita de motor.
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes: `tests/integration/plenitude-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { employees, plenitudeData } from '../../db/schema';
import { getActiveLeaderHistoryByEmployee } from '../services/employeeLeaderHistory';
import { getPlenitudeDataByQuarter } from '../services/plenitudeData';
import type { RoipDatabase } from '../../db/client';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

// ============================================================
// Constantes canonicas
// ============================================================

/**
 * §6.1 — trimestre canonico `YYYY-QN`. Redeclarado neste sub-router
 * por precedente do repo (dashboard/economicDiagnosis/quarterlyCalculation
 * declaram o proprio schema local para evitar dependencia cruzada
 * entre routers de dominios distintos).
 */
export const TRIMESTRE_INPUT_SCHEMA_PLENITUDE = z.string().regex(/^\d{4}-Q[1-4]$/, {
  message: 'Trimestre canônico deve seguir o formato YYYY-QN.',
});

// ============================================================
// Tipos publicos exportados (RV-13 — exercitados nos testes)
// ============================================================

/**
 * §6.4 + §8.3 (DOC 01) — DTO publico de leitura de `plenitudeData`.
 * Reflete literalmente as 20 colunas canonicas da tabela: 3 scores
 * principais (`scoreA`, `scoreC`, `plenitudeScore`), a faixa canonica
 * (`faixaPlenitude`), divergencia e alerta, 8 scores por dimensao
 * (`engajamentoA/C`, `desenvolvimentoA/C`, `pertencimentoA/C`,
 * `realizacaoA/C`), timestamps (`calculadoEm`, `createdAt`,
 * `updatedAt`) e chaves (`id`, `companyId`, `employeeId`,
 * `trimestre`). Campos scalares nullable (DECIMAL/ENUM) sao devolvidos
 * como `null` quando o motor ainda nao completou o calculo (§6.4
 * pre-condicao: A + C ambos respondidos).
 */
export type PlenitudeDataResult = typeof plenitudeData.$inferSelect;

// ============================================================
// Guards e helpers canonicos
// ============================================================

/**
 * Guard canonico cruzado (§2.4): super_admin atravessa; demais roles
 * cruzam contra o `companyId` do proprio JWT. Reusado pela proc de
 * leitura para bloquear cross-company (RH da empresa X nunca ve
 * plenitude da empresa Y).
 */
function assertCompanyScopePlenitude(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Colaborador fora do escopo da empresa.',
    });
  }
}

/**
 * Guard canonico S066 (cadeia direta de lider). Restrito a `role ===
 * 'lider'` — chamadores fora dessa role passam sem checagem adicional
 * (RH e C-level tem escopo empresa; super_admin atravessa). Lider ve
 * APENAS liderados diretos ativos (`employeeLeaderHistory` com
 * `dataFim IS NULL` e `liderId = ctx.user.userId`) e o proprio
 * dashboard. Cadeia indireta e materia de motor de organograma
 * (ME futura).
 */
async function assertLiderDireto(
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

// ============================================================
// Factory canonica
// ============================================================

/**
 * Constroi o sub-router `plenitude`. Sem parametros — leitura pura,
 * sem motor. Simetria com `createDashboardRouter` (ME-035) e
 * `createEconomicDiagnosisRouter` (ME-035).
 */
export function createPlenitudeRouter() {
  return router({
    // ============================================================
    // Proc 1 — getPlenitudeData (§6.8 setima linha + §19.4 nona)
    // ============================================================
    getPlenitudeData: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(
        z.object({
          companyId: z.number().int().positive(),
          employeeId: z.number().int().positive(),
          trimestre: TRIMESTRE_INPUT_SCHEMA_PLENITUDE,
        }),
      )
      .query(async ({ ctx, input }): Promise<PlenitudeDataResult | null> => {
        // §2.4 — guard cruzado: RH da empresa X nunca ve plenitude da
        // empresa Y. Super Admin atravessa.
        assertCompanyScopePlenitude(ctx.user, input.companyId);

        // Precondicao canonica: colaborador existe e pertence a
        // `input.companyId`. Sem essa checagem, um super_admin
        // conseguiria consultar cruzando company IDs a discricao — o
        // guard preserva a semantica de "leitura de plenitude do
        // colaborador X da empresa Y".
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

        // §3.13 — colaborador inativo: leitura restrita a Bruno e RH.
        if (emp.status === 'inativo') {
          const allowsInactive =
            ctx.user.role === 'super_admin' ||
            ctx.user.role === 'rh' ||
            ctx.user.role === 'rh_lider';
          if (!allowsInactive) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Plenitude de colaborador inativo restrito a Bruno e RH.',
            });
          }
        }

        // Guard canonico S066 (cadeia direta de lider) — aplicavel
        // apenas quando `ctx.user.role === 'lider'`. RH e C-level tem
        // escopo empresa por assertCompanyScopePlenitude. Super Admin
        // atravessa.
        await assertLiderDireto(ctx.db, ctx.user, input.employeeId);

        // Leitura canonica: `getPlenitudeDataByQuarter` retorna a
        // linha (ou `undefined` se ausente — §6.4 canoniza que a
        // linha existe apenas quando A ou C foram gravados). O DTO
        // publico normaliza `undefined` para `null` (contrato tipado
        // `PlenitudeDataResult | null`).
        const row = await getPlenitudeDataByQuarter(
          ctx.db,
          input.companyId,
          input.employeeId,
          input.trimestre,
        );
        return row ?? null;
      }),
  });
}

/** Tipo do sub-router — consumido pelo `appRouter` e pelo cliente tipado. */
export type PlenitudeRouter = ReturnType<typeof createPlenitudeRouter>;
