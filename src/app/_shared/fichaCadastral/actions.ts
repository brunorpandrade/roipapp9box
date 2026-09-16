// ROIP APP 9BOX — server action da ficha cadastral somente leitura
// (DOC 05 §14.10, ME-fila6 D1).
//
// Consumida pelo `TodosColaboradoresClient` via prop `fichaCadastralAction`
// nas 4 rotas de listagem (Bruno, RH/C-level, `/minha-equipe`,
// `/cadeia-indireta`). O escopo de leitura e decidido no service
// `loadFichaCadastralForViewer` a partir da sessao — o `companyId` do
// input so e aceito como informado para Bruno; platform exige igualdade
// com a sessao.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import {
  loadFichaCadastralForViewer,
  type FichaCadastral,
} from '../../../server/services/fichaCadastral';
import { getServerSession } from '../../../server/session/serverSession';

export type FichaCadastralActionResult =
  | { readonly ok: true; readonly data: FichaCadastral }
  | { readonly ok: false; readonly message: string };

const MSG_FICHA_INDISPONIVEL = 'Não foi possível carregar a ficha cadastral.';

export async function carregarFichaCadastralAction(
  companyId: number,
  employeeId: number,
): Promise<FichaCadastralActionResult> {
  const session = await getServerSession();
  if (session === null) {
    return { ok: false, message: 'Sessão ausente ou expirada.' };
  }
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return { ok: false, message: MSG_FICHA_INDISPONIVEL };
  }
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return { ok: false, message: MSG_FICHA_INDISPONIVEL };
  }
  const viewer = session.kind === 'super_admin' ? { kind: 'super_admin' as const } : session;
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const ficha = await loadFichaCadastralForViewer(client.db, viewer, companyId, employeeId);
    if (ficha === null) {
      return { ok: false, message: MSG_FICHA_INDISPONIVEL };
    }
    return { ok: true, data: ficha };
  } finally {
    await closeDbClient(client);
  }
}
