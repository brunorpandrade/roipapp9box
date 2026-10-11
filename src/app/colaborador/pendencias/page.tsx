// ROIP APP 9BOX — rota canônica `/colaborador/pendencias`
// (ME-B10-01, DOC 05 §6.3; ME-1.3 cabeçalho padrão com identidade da empresa).
//
// Tela de pendências pós-CPF+matrícula. Server component thin —
// o cliente lê portalToken de sessionStorage e chama
// GET /api/portal/pendencias com header Authorization Bearer.
// Cards renderizados por regra P-M3.8. Botão [Responder →] desabilitado
// nesta ME — hrefs habilitam nas ME-B10-02, ME-B10-03 e ME-B10-04.
//
// ME-1.3 (item 1.3 do roadmap): consumo canônico do hook
// `usePortalSession` substituiu a lógica inline de leitura do
// sessionStorage + handleSair (L125). O hook propaga também a
// identidade visual canônica da empresa (`companyDisplayName`,
// `companyLogoUrl`) e o `greetingFirstName` para o header do portal.

'use client';

import type { JSX } from 'react';

import { PendenciasClient } from '../../../components/portal-colaborador/PendenciasClient';
import { PortalLayout } from '../../../components/portal-colaborador/PortalLayout';
import { usePortalSession } from '../../../components/portal-colaborador/usePortalSession';

export default function PendenciasPage(): JSX.Element {
  const session = usePortalSession();
  return (
    <PortalLayout
      showHeader={true}
      userName={session.userName}
      userPhotoUrl={session.userPhotoUrl}
      companyDisplayName={session.companyDisplayName}
      companyLogoUrl={session.companyLogoUrl}
      greetingFirstName={session.greetingFirstName}
      onSair={session.handleSair}
    >
      <PendenciasClient />
    </PortalLayout>
  );
}
