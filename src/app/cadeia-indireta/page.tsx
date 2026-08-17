// ROIP APP 9BOX — rota canonica `/cadeia-indireta` (stub §5.2, ME-083).
//
// Origem canonica:
// - DOC 05 §5.2 (estado canonico "Coleta de dados em andamento").
// - DOC 02 §10.4 (matriz — `/cadeia-indireta` acessivel a rh_lider,
//   clevel, lider; deny para rh puro e super_admin).
//
// DECISAO CANONICA ME-083 D-ME083-5 aprovada bit-exact: stub minimal
// §5.2 canonico. Preserva navegacao coerente com menu §3.5 (item
// "Cadeia indireta" no RH-Lider C2) + link "Ver tabela completa →" da
// Secao 3 do painel RH-Lider C2. Implementacao real fica em bloco B10
// dedicado (D-B9-PAINEL-MINHA-EQUIPE-STUB rastreado).
//
// Middleware `matrix.ts` linhas 224-236 ja restringe RH puro (deny) +
// super_admin (redirect_super_admin). RH-Lider C1 acessa mas pratica
// devolve conjunto vazio — a estrutura de dados do stub reflete isso.
//
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../components/shell/Layout';
import { ZonaPlaceholder } from '../../components/painel/ZonaPlaceholder';
import { closeDbClient, createDbClient } from '../../db/client';
import { COLORS } from '../../lib/design-tokens/colors';
import { resolveMenuItems } from '../../lib/menu/menuConfig';
import { resolveProfileKey } from '../../lib/session/resolveProfileKey';
import { getServerSession } from '../../server/session/serverSession';
import {
  loadCompanyForRhPanel,
  loadRhSessionFlags,
  resolveDatabaseUrl,
} from '../painel-rh/internals';

export default async function CadeiaIndiretaPage(): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  if (session.kind !== 'platform') {
    redirect('/super-admin');
  }
  if (session.passwordSet === false) {
    redirect('/alterar-senha');
  }
  if (session.role !== 'rh_lider' && session.role !== 'clevel' && session.role !== 'lider') {
    redirect('/');
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const flags = await loadRhSessionFlags(client.db, session.userId);
    const company = await loadCompanyForRhPanel(client.db, session.companyId);
    if (flags === null || company === null) {
      redirect('/');
    }
    const profileKey = resolveProfileKey({
      session,
      isRH: flags.isRH,
      isLider: flags.isLider,
      acessoTotal: false,
      hasDescendingChain: flags.hasDescendingChain,
      cLevelCount: 0,
      isSuperAdminInCompany: false,
    });
    const menuItems = resolveMenuItems(profileKey, flags.isResponsavelFinanceiro);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} — inconsistencia §3`);
    }
    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: session.companyDisplayName,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: true,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
          Cadeia indireta
        </h1>
        <div style={{ marginTop: 20 }}>
          <ZonaPlaceholder title="Cadeia indireta" texto="Coleta de dados em andamento" />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
