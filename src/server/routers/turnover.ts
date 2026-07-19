// ROIP APP 9BOX — sub-router `turnover` (ME-045, DOC 03 §12.8).
//
// Superficie tRPC de LEITURA canonica do turnover trimestral e rolling
// 12m — 2 procs canonicas do §12.8:
//
//   - `turnover.getByCompany` — Bruno + RH + RH-Lider + C-level (S147):
//     taxa geral (trimestral + rolling 12m), abertura pelos 3 niveis
//     hierarquicos canonicos (Estrategico, Tatico, Operacional) e por
//     motivo (voluntario/involuntario). Consumido internamente pelos
//     routers de exportaveis do §13 — sem tela propria dedicada.
//   - `turnover.getByDepartamento` — mesma matriz. Taxa do departamento
//     (trimestral + rolling 12m), abertura por motivo. §12.3 canonico:
//     SEM abertura por nivel hierarquico neste escopo.
//
// Convencoes canonicas herdadas de ME-034/ME-036/ME-042/ME-044:
//   - Guards de perfil por `roleProcedure` (S034, S147). Bruno atravessa
//     escopo empresa (§2.4).
//   - Zod integral do input. `TRIMESTRE_INPUT_SCHEMA` REUSADO de
//     `quarterlyCalculation.ts` (S142) — sem duplicar regex nem
//     mensagem canonica de formato.
//   - `DEPARTAMENTO_VALUES` (schema canonico) exposto via `z.enum` no
//     input do `getByDepartamento` — rejeicao literal `invalid enum` fica
//     a cargo do Zod; o router nao precisa mensagem custom pois qualquer
//     departamento fora dos 19 valores canonicos e erro estrutural do
//     chamador.
//   - Motor determinístico `turnoverEngine` (services/§18.1) consumido
//     via chamada direta — sem hook DI (motor puro, sem side-effects,
//     RV-13 satisfeito com o chamador desta ME).
//   - Sem SQL cru (RV-12); sem code dead (RV-13 — helpers, tipos e
//     mensagens exportados sao exercitados no teste); uma statement por
//     linha (RV-14).
//
// Chamador exclusivo: `appRouter` (acoplado em `routers/index.ts`).
// Testes de integracao em `tests/integration/turnover-router.test.ts`.

import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { DEPARTAMENTO_VALUES, companies } from '../../db/schema';
import {
  computeTurnoverByCompany,
  computeTurnoverByDepartamento,
  type TurnoverByCompanyResult,
  type TurnoverByDepartamentoResult,
} from '../services/turnoverEngine';
import { roleProcedure, router, type AuthenticatedUser } from '../trpc';

import { TRIMESTRE_INPUT_SCHEMA } from './quarterlyCalculation';

// ============================================================
// Mensagens canonicas literais exportadas para asserts verbatim
// ============================================================

/** §2.4 — guard cruzado de escopo empresa quebrou. */
export const MSG_COMPANY_MISMATCH_TURN = 'Empresa nao pertence ao seu escopo.' as const;

/** Empresa alvo inexistente. */
export const MSG_COMPANY_NAO_ENCONTRADA_TURN = 'Empresa nao encontrada.' as const;

// ============================================================
// Schemas Zod canonicos
// ============================================================

/** §12.8 primeira linha — input de `turnover.getByCompany`. */
export const GET_BY_COMPANY_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  trimestre: TRIMESTRE_INPUT_SCHEMA,
});

/** §12.8 segunda linha — input de `turnover.getByDepartamento`. */
export const GET_BY_DEPARTAMENTO_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  departamento: z.enum(DEPARTAMENTO_VALUES),
  trimestre: TRIMESTRE_INPUT_SCHEMA,
});

// ============================================================
// Helpers internos (RV-13 — chamados pelas procs)
// ============================================================

/**
 * §2.4 — guard cruzado de escopo empresa. Super Admin atravessa; demais
 * roles restritos ao proprio `companyId` do JWT. Reusa a mensagem
 * canonica literal para o assert de teste.
 */
export function assertCompanyScopeTurn(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MSG_COMPANY_MISMATCH_TURN });
  }
}

// ============================================================
// Factory canonica (padrao S049/S100 — sem DI de motor porque
// o motor e puro e nao tem side-effects; o proprio chamador
// e a bureaucracia do router)
// ============================================================

/**
 * Factory canonica sem parametros — motor `turnoverEngine` e puro e
 * determinístico. Padrao S049 (factory sem argumentos quando o dominio
 * nao tem hook injetavel). Testes usam a factory diretamente para
 * asseriar contrato + comportamento contra base efemera.
 */
export function createTurnoverRouter() {
  return router({
    // --------------------------------------------------------
    // turnover.getByCompany — Bruno + RH + RH-Lider + C-level (S147)
    // --------------------------------------------------------
    getByCompany: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(GET_BY_COMPANY_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<TurnoverByCompanyResult> => {
        const targetCompany = await ctx.db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (targetCompany.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_COMPANY_NAO_ENCONTRADA_TURN });
        }
        assertCompanyScopeTurn(ctx.user, input.companyId);
        return await computeTurnoverByCompany(ctx.db, input.companyId, input.trimestre);
      }),

    // --------------------------------------------------------
    // turnover.getByDepartamento — Bruno + RH + RH-Lider + C-level (S147)
    // --------------------------------------------------------
    getByDepartamento: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel'])
      .input(GET_BY_DEPARTAMENTO_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<TurnoverByDepartamentoResult> => {
        const targetCompany = await ctx.db
          .select({ id: companies.id })
          .from(companies)
          .where(eq(companies.id, input.companyId))
          .limit(1);
        if (targetCompany.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: MSG_COMPANY_NAO_ENCONTRADA_TURN });
        }
        assertCompanyScopeTurn(ctx.user, input.companyId);
        return await computeTurnoverByDepartamento(
          ctx.db,
          input.companyId,
          input.departamento,
          input.trimestre,
        );
      }),
  });
}

/** Tipo canonico do sub-router. */
export type TurnoverRouter = ReturnType<typeof createTurnoverRouter>;
