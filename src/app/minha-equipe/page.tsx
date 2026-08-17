// ROIP APP 9BOX — rota canonica `/minha-equipe` (stub §5.2, ME-083).
//
// Origem canonica:
// - DOC 05 §5.2 (estado canonico "Coleta de dados em andamento" +
//   correlatos placeholder para superficies fase 3-4).
// - DOC 02 §10.4 (matriz — `/minha-equipe` acessivel a rh_lider,
//   clevel, lider; deny para rh puro e super_admin).
//
// DECISAO CANONICA ME-083 D-ME083-5 aprovada bit-exact: stub minimal
// §5.2 canonico. Preserva navegacao coerente com menu §3.4/§3.5 (item
// "Minha equipe") + link "Ver tabela completa →" da Secao 2 do painel
// RH-Lider. Implementacao real da tabela `/minha-equipe` completa fica
// em bloco B10 dedicado (D-B9-PAINEL-MINHA-EQUIPE-STUB rastreado).
//
// Middleware `matrix.ts` linhas 213-222 ja restringe RH puro (deny) +
// super_admin (redirect_super_admin). Guard defense-in-depth no page
// abaixo cobre casos edge (matriz alterada, cookie stale, etc).
//
// Padrao S366: `page.tsx` exporta apenas o default. Sem `internals.ts`
// nesta rota — stub minimal justifica.
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

export default async function MinhaEquipePage(): Promise<JSX.Element> {
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
  // Middleware `/minha-equipe` ja bloqueia RH puro. Este page renderiza
  // apenas para RH-Lider (C1 e C2), C-level e Lider — defense-in-depth
  // trata edge cases (cookie stale, matriz sync).
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
          Minha equipe
        </h1>
        <div style={{ marginTop: 20 }}>
          <ZonaPlaceholder title="Minha equipe" texto="Coleta de dados em andamento" />
        </div>
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
