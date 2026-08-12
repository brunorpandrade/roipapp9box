// ROIP APP 9BOX — server actions canônicas da rota Bruno
// `/super-admin/empresa/[id]/clevel-rh` (§5.4 + §13.9 derivado + §3.5
// MASTER_ESCOPO_B8, ME-078a).
//
// Pattern S315 canonizada em ME-057b: server actions Next 15 App Router
// atuam como wrappers thin sobre os helpers canonicos + guards puros.
// Guard canonico bit-exact `requireSuperAdmin` server-side (defense-in-
// depth ao middleware `/super-admin/empresa/`).
//
// **RV-13.** `listarCLevelsAction` e `listarRHAction` consumidos por
// `CLevelRHClient.tsx` (refetch em mudança de aba + apos operacoes de
// escrita — inativar/reativar via tRPC direct client-side).
//
// **RV-12.** Zero SQL cru — helpers tipados Drizzle.

'use server';

import { closeDbClient, createDbClient } from '../../../../../db/client';
import {
  listCLevelsForCompany,
  type ListCLevelResult,
} from '../../../../../server/routers/cLevelMembers';
import { listRHForCompany, type ListRHResult } from '../../../../../server/routers/employees';
import { getServerSession } from '../../../../../server/session/serverSession';

import { resolveDatabaseUrl } from './internals';

// -----------------------------------------------------------------------
// Guard canonico bit-exact
// -----------------------------------------------------------------------

async function requireSuperAdmin(actionName: string): Promise<void> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'super_admin') {
    throw new Error(`${actionName}: acesso restrito ao Super Admin (§10.3 CAMADA_AUTH)`);
  }
}

// -----------------------------------------------------------------------
// Action canonica bit-exact — listar C-levels (Aba 1 §5.4)
// -----------------------------------------------------------------------

/**
 * §5.4 canonica bit-exact — refetch server-side canonica bit-exact da
 * listagem de C-levels. Chamada pelo `CLevelRHClient.tsx` sempre que
 * o usuario opera uma acao de escrita (inativar/reativar/deletar) e o
 * cliente precisa recarregar a lista. Retorna todos ativos + inativos
 * ordenados canonicamente bit-exact.
 */
export async function listarCLevelsAction(companyId: number): Promise<ListCLevelResult> {
  await requireSuperAdmin('listarCLevelsAction');

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('listarCLevelsAction: companyId invalido.');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await listCLevelsForCompany(client.db, companyId);
  } finally {
    await closeDbClient(client);
  }
}

// -----------------------------------------------------------------------
// Action canonica bit-exact — listar RH (Aba 2 §5.4)
// -----------------------------------------------------------------------

/**
 * §5.4 canonica bit-exact — refetch server-side canonica bit-exact da
 * listagem de colaboradores com `isRH=true`. Consumida pelo
 * `CLevelRHClient.tsx` na mudanca de aba e apos operacoes de escrita
 * futuras (ME-078b canonicamente).
 */
export async function listarRHAction(companyId: number): Promise<ListRHResult> {
  await requireSuperAdmin('listarRHAction');

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error('listarRHAction: companyId invalido.');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await listRHForCompany(client.db, companyId);
  } finally {
    await closeDbClient(client);
  }
}
