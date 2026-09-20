// ROIP APP 9BOX — rota `/dashboard-individual/clevel/[cLevelId]`
// (D-ENTRY-2, ME §8.05). Superficie Bruno-only do relatorio de Perfil
// Individual de um C-level, alcancada pelo no C-level do organograma.
//
// Guarda de pagina: apenas Super Admin (Bruno). A autorizacao de dados
// (PC1e) e reaplicada server-side pelo `getReport`/`generatePDF` via a
// action do modal — esta guarda de rota e apenas UX. O `cLevelId` da URL
// resolve a empresa dona (Bruno atravessa empresas), carregada por
// leitura Drizzle tipada (RV-12).
//
// **RV-13.** `ClevelPerfilClient` renderizado abaixo (caller real). O
// caminho de dados (getReport `userType='clevel'`) e coberto pelos testes
// do sub-router `individualProfile`.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { closeDbClient, createDbClient } from '../../../../db/client';
import { cLevelMembers } from '../../../../db/schema';
import { resolveDatabaseUrl } from '../../../../lib/db/resolveDatabaseUrl';
import { getServerSession } from '../../../../server/session/serverSession';

import { ClevelPerfilClient } from './ClevelPerfilClient';

interface PageProps {
  readonly params: Promise<{ cLevelId: string }>;
}

export default async function ClevelPerfilPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { cLevelId: rawId } = await props.params;
  const cLevelId = Number.parseInt(rawId, 10);
  if (!Number.isInteger(cLevelId) || cLevelId <= 0) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const rows = await client.db
      .select({
        companyId: cLevelMembers.companyId,
        name: cLevelMembers.name,
        cargo: cLevelMembers.cargo,
      })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, cLevelId))
      .limit(1);
    const clevel = rows[0];
    if (clevel === undefined) {
      notFound();
    }
    return (
      <ClevelPerfilClient
        companyId={clevel.companyId}
        cLevelId={cLevelId}
        nome={clevel.name}
        cargo={clevel.cargo}
      />
    );
  } finally {
    await closeDbClient(client);
  }
}
