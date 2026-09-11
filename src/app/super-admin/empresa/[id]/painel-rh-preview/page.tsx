// ROIP APP 9BOX — rota canonica `/super-admin/empresa/[id]/painel-rh-
// preview` (ME-B9-fechamento — D-ME083-D-RH-IMPERSONATION-PAINEL-RH
// ENCERRADO). Rota Super-Admin-only que renderiza a previa canonica do
// painel do RH puro da empresa `[id]` via `PainelRHClient` com prop
// `variant='super_admin_preview'` (S232-A).
//
// Padrao S366 CC068 canonizado: `page.tsx` exporta APENAS o default.
// Helpers vivem em `internals.ts` irmao.
//
// Origem canonica:
// - CAMADA_UI §5.5 (painel do RH — renderizado bit-a-bit no preview).
// - CAMADA_AUTH §10.3 + §10.4 (rota herda cobertura do prefixo
//   `/super-admin/empresa/` no matrix — Super Admin=allow, todos os
//   outros=deny com AccessDenied fallback bit-a-bit ao padrao das 12
//   demais sub-rotas de `/super-admin/empresa/[id]/*`).
// - MASTER_ESCOPO_B9 §3.8 (nova ficha ME-B9-fechamento) + MASTER v3.0.
//
// Guard defense-in-depth §2.4: middleware ja bloqueia perfis nao-Super
// Admin no prefixo `/super-admin/empresa/`. Guard local reforca:
// - session === null → redirect para `/`.
// - session.kind !== 'super_admin' → redirect para `/`.
//
// Decisao operacional documentada (ME-B9-fechamento): preview assume
// flags fixas do RH puro. Preview de RH-Lider C1/C2 canonizavel em ME
// futura dedicada se solicitado.
//
// **RV-13 canonica.** `PainelRHPreviewPage` (default) → runtime Next 15.
// **RV-11 canonica.** Todas as queries executam contra MySQL real via
// Drizzle tipado (loaders reutilizados de `/painel-rh/internals.ts` e
// `/super-admin/empresa/[id]/internals.ts`).
// **RV-14 canonica.** Um statement por linha, largura maxima 100 cols.

import { notFound, redirect } from 'next/navigation';
import type { JSX } from 'react';

import { Layout } from '../../../../../components/shell/Layout';
import { closeDbClient, createDbClient } from '../../../../../db/client';
import { resolveMenuItems } from '../../../../../lib/menu/menuConfig';
import { countPendenciasEmpresa } from '../../../../../lib/pendencias/pendenciasEngine';
import { resolveProfileKey } from '../../../../../lib/session/resolveProfileKey';
import { getServerSession } from '../../../../../server/session/serverSession';

import { PainelRHClient } from '../../../../painel-rh/PainelRHClient';
import { loadCompanyForRhPanel } from '../../../../painel-rh/internals';
import {
  loadDepartmentCounts,
  loadLandingCounts,
  loadMesAtualClosureStatus,
  loadOnboardingSummaryCounts,
} from '../internals';

import { parseCompanyIdParam, resolveDatabaseUrl } from './internals';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function PainelRHPreviewPage(props: PageProps): Promise<JSX.Element> {
  const session = await getServerSession();
  if (session === null) {
    redirect('/');
  }
  // Middleware ja bloqueia via prefixo `/super-admin/empresa/`; guard
  // defense-in-depth §2.4 previne edge cases (cookie stale, matriz
  // alterada, insercao de rota nao-listada).
  if (session.kind !== 'super_admin') {
    redirect('/');
  }

  const { id } = await props.params;
  const companyId = parseCompanyIdParam(id);
  if (companyId === null) {
    notFound();
  }

  const client = createDbClient(resolveDatabaseUrl());
  try {
    const company = await loadCompanyForRhPanel(client.db, companyId);
    if (company === null) {
      // Empresa deletada entre requisicao e verificacao.
      notFound();
    }

    // Preview: bateria canonica de loaders identica ao painel do RH.
    // Referencia temporal canonica: `new Date()` (padrao dos demais
    // loaders de `loadMesAtualClosureStatus`).
    const reference = new Date();
    const [counts, departmentCounts, onboardingSummary, mesAtualClosure, totalPendenciasPortal] =
      await Promise.all([
        loadLandingCounts(client.db, companyId),
        loadDepartmentCounts(client.db, companyId),
        loadOnboardingSummaryCounts(client.db, companyId),
        loadMesAtualClosureStatus(client.db, companyId, reference),
        countPendenciasEmpresa({ db: client.db, companyId }),
      ]);

    // ME-B9-fechamento (S232-A): flags fixas do RH puro no preview.
    // Preview de RH-Lider C1/C2 fora do escopo — canonizavel em ME
    // futura dedicada.
    const profileKey = resolveProfileKey({
      session,
      isRH: true,
      isLider: false,
      acessoTotal: false,
      hasDescendingChain: false,
      cLevelCount: 0,
      isSuperAdminInCompany: true,
    });

    const menuItems = resolveMenuItems(profileKey, false);
    if (menuItems === null) {
      throw new Error(`Menu canonico ausente para ${profileKey} em preview — inconsistencia §3`);
    }

    return (
      <Layout
        menuItems={menuItems}
        header={{
          leftMode: 'in_company',
          companyDisplayName: company.nomeFantasia,
          companyLogoUrl: company.logoUrl ?? undefined,
          user: { displayName: session.displayName },
          showNotificationBell: false,
        }}
      >
        <PainelRHClient
          company={company}
          counts={counts}
          departmentCounts={departmentCounts}
          onboardingSummary={onboardingSummary}
          mesAtualClosure={mesAtualClosure}
          totalPendenciasPortal={totalPendenciasPortal}
          showsMinhaEquipe={false}
          showsCadeiaIndireta={false}
          minhaEquipe={null}
          cadeiaIndireta={null}
          meuPortal={null}
          variant="super_admin_preview"
        />
      </Layout>
    );
  } finally {
    await closeDbClient(client);
  }
}
