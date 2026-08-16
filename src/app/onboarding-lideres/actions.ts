// ROIP APP 9BOX — server actions canônicas para AMBAS as rotas do
// onboarding de líderes (padrão consolidado pendencias-portal):
//   - Bruno via `/super-admin/empresa/[id]/onboarding-lideres`
//   - RH via `/onboarding-lideres`
//
// Ambas as rotas compartilham este `actions.ts` porque o router
// `leaderOnboarding` aceita as duas superfícies transparentemente:
// `assertCompanyScopeOnb` permite super_admin (bypass) OU rh/rh_lider
// (com `companyId` matching pelo JWT).
//
// Pattern S315 canônica + padrão híbrido `createCallerFactory`
// (S511 canonizada ME-078b-refactor). 3 actions cobrindo:
//   1. `listOnboardingCardsAction` — kanban + refetch pós-mutação.
//   2. `getLeaderDetailAction` (NOVA ME-080c-patch1) — detalhe canônico
//      §21.2: histórico de anotações + mudanças de estágio para exibir
//      no modal ao abrir.
//   3. `updateOnboardingStageAction` — mudança de estágio +
//      anotação obrigatória (transacional no router).
//
// **RV-13.** Todas as 3 actions consumidas por
// `OnboardingLideresClient.tsx`.
//
// **RV-12.** Zero SQL cru — procedures tRPC via caller.

'use server';

import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

import { closeDbClient, createDbClient } from '../../db/client';
import { createRateLimiter } from '../../server/auth/rateLimit';
import {
  createLeaderOnboardingRouter,
  type GetDetailResult,
  type ListCardEntry,
  type UpdateStageResult,
} from '../../server/routers/leaderOnboarding';
import { createCallerFactory, createContextInner } from '../../server/trpc';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Instâncias module-level canônicas bit-exact (padrão S366)
// -----------------------------------------------------------------------

const leaderOnboardingRouter = createLeaderOnboardingRouter();
const createLeaderOnboardingCaller = createCallerFactory(leaderOnboardingRouter);
const actionRateLimiter = createRateLimiter();

// -----------------------------------------------------------------------
// Helpers locais (não exportados — CC068)
// -----------------------------------------------------------------------

const SESSION_COOKIE = 'session';

async function resolveRawToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  return cookie?.value ?? null;
}

// -----------------------------------------------------------------------
// Contrato canônico bit-exact (padrão consolidado B8)
// -----------------------------------------------------------------------

export type ActionResult<T = null> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string };

// -----------------------------------------------------------------------
// Contrato serializável para o Client Component
// -----------------------------------------------------------------------
//
// `ListCardEntry` do router contém `entradaEstagioAtual: Date`. Server
// Actions do Next 15 aceitam Date via serialização (Server Component →
// Client Component), mas para robustez cross-boundary usamos ISO string
// no wire format canônico das actions. O Client re-hidrata via
// `new Date(iso)`.

export interface OnboardingCardWire {
  readonly employeeId: number;
  readonly nome: string;
  readonly cargo: string;
  readonly departamento: string;
  readonly onboardingEstagio: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';
  readonly countLiderados: number;
  readonly entradaEstagioAtualIso: string;
}

function toWire(row: ListCardEntry): OnboardingCardWire {
  return {
    employeeId: row.employeeId,
    nome: row.nome,
    cargo: row.cargo,
    departamento: row.departamento,
    onboardingEstagio: row.onboardingEstagio,
    countLiderados: row.countLiderados,
    entradaEstagioAtualIso: row.entradaEstagioAtual.toISOString(),
  };
}

// -----------------------------------------------------------------------
// 1. listOnboardingCardsAction — refetch pós-mutação
// -----------------------------------------------------------------------

export async function listOnboardingCardsAction(input: {
  readonly companyId: number;
}): Promise<ActionResult<OnboardingCardWire[]>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createLeaderOnboardingCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const rows = await caller.list({ companyId: input.companyId });
    return { ok: true, data: rows.map(toWire) };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// 2. updateOnboardingStageAction — muda estágio + anota (transacional)
// -----------------------------------------------------------------------

export async function updateOnboardingStageAction(input: {
  readonly employeeId: number;
  readonly novoEstagio: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';
  readonly texto: string;
}): Promise<ActionResult<UpdateStageResult>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createLeaderOnboardingCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.updateStage({
      employeeId: input.employeeId,
      novoEstagio: input.novoEstagio,
      texto: input.texto,
    });
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

// -----------------------------------------------------------------------
// 3. getLeaderDetailAction — histórico canônico do modal (ME-080c-patch1)
// -----------------------------------------------------------------------
//
// Consome `leaderOnboarding.getDetail` (§21.2). Retorna anotações e
// mudanças de estágio cronológicas para exibir no modal ao abrir.
// Contratos wire: `Date` → ISO string (padrão canônico do arquivo).

export interface OnboardingNoteWire {
  readonly id: number;
  readonly autorTipo: 'super_admin' | 'rh';
  readonly autorId: number;
  readonly texto: string;
  readonly createdAtIso: string;
}

export interface OnboardingStageChangeWire {
  readonly id: number;
  readonly estagioAnterior: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem' | null;
  readonly estagioNovo: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';
  readonly autorTipo: 'super_admin' | 'rh';
  readonly autorId: number;
  readonly createdAtIso: string;
}

export interface OnboardingLeaderDetailWire {
  readonly employeeId: number;
  readonly nome: string;
  readonly departamento: string;
  readonly onboardingEstagio: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';
  readonly notes: readonly OnboardingNoteWire[];
  readonly stageHistory: readonly OnboardingStageChangeWire[];
}

function toDetailWire(row: GetDetailResult): OnboardingLeaderDetailWire {
  return {
    employeeId: row.employeeId,
    nome: row.nome,
    departamento: row.departamento,
    onboardingEstagio: row.onboardingEstagio,
    notes: row.notes.map((n) => ({
      id: n.id,
      autorTipo: n.autorTipo,
      autorId: n.autorId,
      texto: n.texto,
      createdAtIso: n.createdAt.toISOString(),
    })),
    stageHistory: row.stageHistory.map((s) => ({
      id: s.id,
      estagioAnterior: s.estagioAnterior,
      estagioNovo: s.estagioNovo,
      autorTipo: s.autorTipo,
      autorId: s.autorId,
      createdAtIso: s.createdAt.toISOString(),
    })),
  };
}

export async function getLeaderDetailAction(input: {
  readonly employeeId: number;
}): Promise<ActionResult<OnboardingLeaderDetailWire>> {
  const token = await resolveRawToken();
  if (token === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const caller = createLeaderOnboardingCaller(
      createContextInner({
        db: client.db,
        rateLimiter: actionRateLimiter,
        bearerToken: token,
      }),
    );
    const result = await caller.getDetail({ employeeId: input.employeeId });
    return { ok: true, data: toDetailWire(result) };
  } catch (err) {
    if (err instanceof TRPCError) {
      return { ok: false, message: err.message };
    }
    throw err;
  } finally {
    await closeDbClient(client);
  }
}
