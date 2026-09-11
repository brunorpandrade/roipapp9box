// ROIP APP 9BOX — server actions canonicas rota `/minha-equipe`
// (§14.11, ME-085; escopo ampliado na ME-B9-fechamento para cobrir
// Lider Cenario 1 e Lider Cenario 2 alem de RH-Lider — S230-B).
//
// Pattern S315 canonica: server actions Next 15 como wrappers thin
// sobre services canonicos + guard inline `session.role in
// {'rh_lider','lider'}` (D-ME085-5 A aprovada — sem novo helper,
// extracao L125 fica para ME futura quando >=3 rotas employee-leader-
// only existirem).
//
// Semantica canonica bit-exact da action:
// (1) Rejeita `session === null` → `Error` canonica generica (mensagem
//     nao vaza enumeracao de rotas — padrao bit-exact ME-084).
// (2) Rejeita `session.kind !== 'platform'` (Super Admin nao acessa
//     `/minha-equipe`).
// (3) Rejeita `session.role !== 'rh_lider' && session.role !== 'lider'`
//     (RH puro=deny §10.4; C-level fora do escopo canonico ate
//     D-CU-EMPIRICO — dependencia estrutural em `liderIdTipo='clevel'`
//     no scoper).
// (4) Aplica `enforceEmployeeLeaderScope` (forca `liderId=session.userId`,
//     `liderIdTipo='employee'`, reseta `papelFuncional='respfin'` para
//     `'todos'`) — defense-in-depth §2.4.
// (5) Valida paranoicamente que `companyIdIgnored` do cliente, se >0,
//     coincide com `session.companyId` — aborta se divergir.
// (6) Delega a `listEmployeesPaginated` (RV-12 — Drizzle tipado).
//
// **RV-13.** `listarMinhaEquipeAction` consumida por `page.tsx` (via
// prop `refetchAction` do `TodosColaboradoresClient`).
//
// **RV-12.** Zero SQL cru — service tipado Drizzle.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { closeDbClient, createDbClient } from '../../db/client';
import { listEmployeesPaginated, type ListEmployeesResult } from '../../server/services/employees';
import { getServerSession } from '../../server/session/serverSession';

import { colaboradoresFiltersToServiceInput, type ColaboradoresFilters } from './filters';
import { enforceEmployeeLeaderScope, resolveDatabaseUrl } from './internals';

/**
 * §14.11 — refetch server-side canonica bit-exact da listagem dos
 * liderados diretos ativos do employee-leader autenticado (RH-Lider ou
 * Lider). Chamada pelo `TodosColaboradoresClient` via prop
 * `refetchAction` a cada mudanca de filtro / busca / ordenacao /
 * paginacao.
 *
 * Escopo canonico bit-exact: `companyId` derivado da `session.companyId`
 * + `liderId` forcado como `session.userId` via
 * `enforceEmployeeLeaderScope`. O parametro `companyIdIgnored` existe
 * unicamente para preservar bit-exact o contrato do `refetchAction` do
 * `TodosColaboradoresClient` — o valor real e sempre derivado da
 * sessao (defense-in-depth §2.4).
 */
export async function listarMinhaEquipeAction(
  companyIdIgnored: number,
  filters: ColaboradoresFilters,
): Promise<ListEmployeesResult> {
  const session = await getServerSession();
  if (session === null) {
    throw new Error('listarMinhaEquipeAction: sessao ausente ou expirada.');
  }
  if (session.kind !== 'platform') {
    throw new Error(
      'listarMinhaEquipeAction: Super Admin nao acessa /minha-equipe (matriz §10.4).',
    );
  }
  if (session.role !== 'rh_lider' && session.role !== 'lider') {
    throw new Error(
      'listarMinhaEquipeAction: rota canonicamente restrita a RH-Lider e Lider ' +
        '(S230-B ME-B9-fechamento).',
    );
  }
  const companyId = session.companyId;
  // Validacao paranoica: se o cliente enviou companyId diferente do
  // canonico da sessao, aborta. Guard defense-in-depth §2.4.
  if (
    Number.isInteger(companyIdIgnored) &&
    companyIdIgnored > 0 &&
    companyIdIgnored !== companyId
  ) {
    throw new Error('listarMinhaEquipeAction: companyId divergente da sessao.');
  }

  const scopedFilters = enforceEmployeeLeaderScope(filters, session.userId);
  const serviceInput = colaboradoresFiltersToServiceInput(scopedFilters);

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const result = await listEmployeesPaginated(client.db, companyId, serviceInput);
    return result;
  } finally {
    await closeDbClient(client);
  }
}
