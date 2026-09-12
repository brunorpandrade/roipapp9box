// ROIP APP 9BOX — rota canônica `/colaborador/gate-lgpd`
// (ME-B10-01, DOC 05 §6.2).
//
// Gate LGPD do portal do colaborador. Renderizado após identificação
// por CPF+matrícula quando `versaoTermoAceita` diverge de
// `LGPD_TERM_VERSION`. Server component thin — o cliente lê
// portalToken de sessionStorage e faz POST em /api/portal/consent-lgpd.

import type { JSX } from 'react';

import { GateLgpdClient } from '../../../components/portal-colaborador/GateLgpdClient';
import { PortalLayout } from '../../../components/portal-colaborador/PortalLayout';

export default function GateLgpdPage(): JSX.Element {
  return (
    <PortalLayout showHeader={false}>
      <GateLgpdClient />
    </PortalLayout>
  );
}
