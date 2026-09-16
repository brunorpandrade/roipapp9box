// ROIP APP 9BOX — server actions do modal [Definir metas] (M1)
// (DOC 05 §13.7, ME-fila6 D3).
//
// Consumidas pelo `DefinirMetasControl` na ficha de edicao (Bruno, RH,
// RH-Lider) e no pop-up de ficha cadastral (Lider e C-level para os proprios
// liderados diretos). Permissao decidida no service a partir da sessao;
// `companyId` so e aceito como informado para Bruno.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

'use server';

import { closeDbClient, createDbClient } from '../../../db/client';
import { resolveDatabaseUrl } from '../../../lib/db/resolveDatabaseUrl';
import type { MetaRascunho } from '../../../lib/shared/employeeGoalsForm';
import {
  MSG_METAS_SEM_PERMISSAO,
  loadMetasModal,
  salvarMetas,
  type MetasModalData,
  type MetasViewer,
  type SalvarMetasResult,
} from '../../../server/services/employeeGoalsModal';
import { getServerSession } from '../../../server/session/serverSession';

export type CarregarMetasResult =
  | { readonly ok: true; readonly data: MetasModalData }
  | { readonly ok: false; readonly message: string };

async function resolverViewer(): Promise<MetasViewer | null> {
  const session = await getServerSession();
  if (session === null) {
    return null;
  }
  return session.kind === 'super_admin' ? { kind: 'super_admin' } : session;
}

function idValido(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

export async function carregarMetasAction(
  companyId: number,
  employeeId: number,
): Promise<CarregarMetasResult> {
  const viewer = await resolverViewer();
  if (viewer === null || !idValido(companyId) || !idValido(employeeId)) {
    return { ok: false, message: MSG_METAS_SEM_PERMISSAO };
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    const data = await loadMetasModal(client.db, viewer, companyId, employeeId);
    if (data === null) {
      return { ok: false, message: MSG_METAS_SEM_PERMISSAO };
    }
    return { ok: true, data };
  } finally {
    await closeDbClient(client);
  }
}

export async function salvarMetasAction(input: {
  readonly companyId: number;
  readonly employeeId: number;
  readonly aplicarTemplate: boolean;
  readonly linhas: readonly MetaRascunho[];
}): Promise<SalvarMetasResult> {
  const viewer = await resolverViewer();
  if (viewer === null || !idValido(input.companyId) || !idValido(input.employeeId)) {
    return { ok: false, message: MSG_METAS_SEM_PERMISSAO };
  }
  const client = createDbClient(resolveDatabaseUrl());
  try {
    return await salvarMetas(client.db, viewer, input.companyId, input.employeeId, {
      aplicarTemplate: input.aplicarTemplate === true,
      linhas: input.linhas,
    });
  } finally {
    await closeDbClient(client);
  }
}
