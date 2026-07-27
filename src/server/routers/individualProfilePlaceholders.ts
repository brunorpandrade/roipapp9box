// ROIP APP 9BOX — sub-router `individualProfilePlaceholders`
// (ME-049a; DOC 03 §10.12 + §10.13).
//
// Superficie tRPC canonica de LEITURA sobre `individualProfilePlaceholders`
// (DOC 01 §4.9). Duas procs canonicas do §10.13:
//
//   - `individualProfilePlaceholders.list`             — Bruno + RH.
//     Lista placeholders da empresa em ordem crescente de `id`,
//     com filtro opcional por `status`.
//   - `individualProfilePlaceholders.getByEmployeeId`  — Bruno + RH.
//     Busca placeholder de um titular (`userType`+`userId`) na
//     empresa; retorna `null` quando ausente.
//
// Escopo canonico da autorizacao (S198 canonizada nesta ME): ambas
// as procs sao restritas a Bruno + RH. §10.13 canoniza `list` como
// "RH e Bruno" e e silencioso para `getByEmployeeId`; ampliar sem
// base DOC 02 seria inventar permissao. O consumo pelos demais
// perfis se da por outras superficies:
//   - Colaborador: le seu proprio estado via `POST
//     /api/portal/profile-form-state` (autenticado por portalToken).
//   - Lider / RH-Lider / C-level: veem o "estado do Perfil Individual
//     do liderado" via superficies de painel/organograma (proc de
//     outros routers em ME futura).
//
// Isolamento por empresa (§2.4): `assertCompanyScope` importado de
// `employees.ts` — o super_admin atravessa; RH restrito ao proprio
// `companyId` do JWT.
//
// Convencoes canonicas:
//   - Zero SQL cru: 100% Drizzle tipado via services do repositorio
//     (`listPlaceholdersByCompany`, `getPlaceholderByUser`).
//   - Zero code dead: cada proc tem chamador direto no teste
//     `tests/integration/individualProfilePlaceholders-router.test.ts`.
//   - Padrao de factory canonico (S100/S084 herdado de
//     `createEmployeesRouter`).

import { z } from 'zod';

import { roleProcedure, router } from '../trpc';
import {
  getPlaceholderByUser,
  listPlaceholdersByCompany,
} from '../services/individualProfilePlaceholders';
import { assertCompanyScope } from './employees';

// ============================================================
// Constantes canonicas
// ============================================================

/** Enum canonico de `status` (§4.9 DOC 01). */
export const PLACEHOLDER_STATUSES = [
  'pendente',
  'em_andamento',
  'respondido',
  'inconsistente',
  'aguardando_nova_resposta',
] as const;

/** Enum canonico de `userType` (§4.9 DOC 01). */
export const PLACEHOLDER_USER_TYPES = ['employee', 'clevel'] as const;

// ============================================================
// Schemas Zod canonicos
// ============================================================

/**
 * Input canonico de `list`: `companyId` obrigatorio + filtro
 * opcional por `status`. Sem paginacao no MVP — o volume por empresa
 * e proporcional ao numero de colaboradores + C-levels (dezenas a
 * poucas centenas em PMEs).
 */
export const LIST_PLACEHOLDERS_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  status: z.enum(PLACEHOLDER_STATUSES).optional(),
});

/**
 * Input canonico de `getByEmployeeId`. Nome mantido conforme §10.13;
 * na pratica cobre tambem C-level via `userType`.
 */
export const GET_PLACEHOLDER_BY_EMPLOYEE_ID_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  userType: z.enum(PLACEHOLDER_USER_TYPES),
  userId: z.number().int().positive(),
});

// ============================================================
// Retornos canonicos
// ============================================================

/** Linha retornada por `list`/`getByEmployeeId`. */
export interface PlaceholderRow {
  id: number;
  companyId: number;
  userType: 'employee' | 'clevel';
  userId: number;
  status: (typeof PLACEHOLDER_STATUSES)[number];
  createdAt: Date | null;
  respondidoEm: Date | null;
}

// ============================================================
// Factory canonica do sub-router (S100/S084)
// ============================================================

/**
 * Factory canonica de `individualProfilePlaceholders`. Sem DI
 * externa nesta ME — as duas procs sao consultas puras via services
 * tipados. Instanciada com defaults no `appRouter` (index.ts); os
 * testes usam a mesma factory.
 */
export function createIndividualProfilePlaceholdersRouter() {
  return router({
    // --------------------------------------------------------
    // individualProfilePlaceholders.list — Bruno + RH
    // --------------------------------------------------------
    list: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(LIST_PLACEHOLDERS_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<readonly PlaceholderRow[]> => {
        assertCompanyScope(ctx.user, input.companyId);
        const rows = await listPlaceholdersByCompany(ctx.db, input.companyId);
        if (input.status === undefined) return rows;
        return rows.filter((r) => r.status === input.status);
      }),

    // --------------------------------------------------------
    // individualProfilePlaceholders.getByEmployeeId — Bruno + RH
    // (S198 — mesmo escopo canonico de `list`.)
    // --------------------------------------------------------
    getByEmployeeId: roleProcedure(['super_admin', 'rh', 'rh_lider'])
      .input(GET_PLACEHOLDER_BY_EMPLOYEE_ID_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<PlaceholderRow | null> => {
        assertCompanyScope(ctx.user, input.companyId);
        const row = await getPlaceholderByUser(
          ctx.db,
          input.companyId,
          input.userType,
          input.userId,
        );
        return row ?? null;
      }),
  });
}
