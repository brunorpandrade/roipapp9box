// ROIP APP 9BOX — rota canônica `/colaborador/pendencias`
// (ME-B10-01, DOC 05 §6.3).
//
// Tela de pendências pós-CPF+matrícula. Server component thin —
// o cliente lê portalToken de sessionStorage e chama
// GET /api/portal/pendencias com header Authorization Bearer.
// Cards renderizados por regra P-M3.8. Botão [Responder →] desabilitado
// nesta ME — hrefs habilitam nas ME-B10-02, ME-B10-03 e ME-B10-04.

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { PendenciasClient } from '../../../components/portal-colaborador/PendenciasClient';
import { PortalLayout } from '../../../components/portal-colaborador/PortalLayout';

export default function PendenciasPage(): JSX.Element {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      router.replace('/colaborador');
      return;
    }
    const nome = window.sessionStorage.getItem('portalUserName');
    setUserName(nome);
  }, [router]);

  function handleSair(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.sessionStorage.removeItem('portalToken');
    window.sessionStorage.removeItem('portalUserName');
    window.sessionStorage.removeItem('portalUserType');
    window.sessionStorage.removeItem('portalLgpdSeen');
    router.replace('/colaborador');
  }

  return (
    <PortalLayout showHeader={true} userName={userName} onSair={handleSair}>
      <PendenciasClient />
    </PortalLayout>
  );
}
