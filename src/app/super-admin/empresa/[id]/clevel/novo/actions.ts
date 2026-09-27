// ROIP APP 9BOX — server actions canonicas da rota Bruno
// `/super-admin/empresa/[id]/clevel/novo` (§13.2, ME-078b-refactor).
//
// Pattern S315 canonica + padrao hibrido `createCallerFactory` (conforme
// `src/app/actions.ts` — `forgotPasswordUnifiedAction`). A procedure
// `cLevelMembers.create` tem logica transacional complexa embarcada no
// router; delegar via caller preserva 100% do codigo sem duplicacao.
//
// Guard: token bruto do cookie → `createContextInner` → pipeline tRPC
// server-side (`authed` + `roleProcedure(['super_admin'])` + procedure).
// Catch `TRPCError` → `ActionResult` discriminado.
//
// ME 3.5 D5 patch2 — assinatura estendida com `isRH?: boolean` para
// permitir que o form marque o C-level como "Ativar como RH" no cadastro
// (§12 DOC 02 herdada — apenas Super Admin passa no guard da procedure).
//
// **RV-13.** `criarCLevelAction` consumido por `CLevelNovoClient.tsx`
// (submit do form de cadastro de C-level).
//
// **RV-12.** Zero SQL cru — procedure tRPC usa helpers tipados Drizzle.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../../../../../db/client';
import { createRateLimiter } from '../../../../../../server/auth/rateLimit';
import {
  createCLevelMembersRouter,
  type CreateCLevelResult,
} from '../../../../../../server/routers/cLevelMembers';
import { createCallerFactory, createContextInner } from '../../../../../../server/trpc';
import { resolveDatabaseUrl } from '../../../../../../lib/db/resolveDatabaseUrl';

// -----------------------------------------------------------------------
// Instancias module-level canonicas bit-exact (padrao S366)
// -----------------------------------------------------------------------

const cLevelRouter = createCLevelMembersRouter();
const createCLevelCaller = createCallerFactory(cLevelRouter);
const actionRateLimiter = createRateLimiter();

// -----------------------------------------------------------------------
// Helpers locais (nao exportados — CC068)
// -----------------------------------------------------------------------

const SESSION_COOKIE = 'session';

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

// -----------------------------------------------------------------------
// Contrato canonico bit-exact
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// Action canonica bit-exact — criar C-level (§13.2)
// -----------------------------------------------------------------------

/**
 * §13.2 canonica bit-exact — server action de cadastro de C-level.
 * Delega a procedure `cLevelMembers.create` via `createCallerFactory`
 * para preservar 100% da logica transacional (INSERT C-level + INSERT
 * placeholder perfil individual — atomicidade canonica §16.1).
 *
 * Input: campos canonicos do form §13.2 (mesma shape do
 * `CREATE_CLEVEL_INPUT_SCHEMA` Zod). O Zod valida server-side dentro
 * da procedure. ME 3.5 D5 patch2 — `isRH` opcional (default false na
 * procedure Zod), respeitando semantica de nao-quebra para C-levels
 * pre-ME 3.5.
 */
export async function criarCLevelAction(input: {
  readonly companyId: number;
  readonly name: string;
  readonly cpf: string;
  readonly email: string;
  readonly photoUrl?: string;
  readonly dataNascimento: string;
  readonly dataAdmissao: string;
  readonly cargo: string;
  readonly descricaoCargo: string;
  readonly departamento: string;
  readonly custoMensal: number;
  readonly acessoTotal: boolean;
  readonly isRH?: boolean;
}): Promise<ActionResult<CreateCLevelResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessao ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createCLevelCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
        ip: null,
      }),
    );
    const result = await caller.create(input as Parameters<typeof caller.create>[0]);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}
