// ROIP APP 9BOX — rota canonica `/colaborador/responder/perfil-individual`
// (ME-B10-04, S255, DOC 05 §7.5).
//
// Tela de resposta do Perfil Individual no canal portal (colaborador
// puro autenticado por CPF + gate LGPD + sessionStorage). Padrao
// bit-a-bit da rota `/colaborador/responder/radar-nr1` da ME-B10-03,
// com um ajuste canonico:
// - Shell dedicado `PerfilIndividualFormShell` (nao `LikertFormShell`
//   nem `Nr1FormShell`) — divergencias materiais fundamentadas no
//   proprio shell: layout pop-up modal 80% (nao tela cheia),
//   navegacao bloco a bloco, `saveBlock` por bloco, 3 tipos de item,
//   bloco 10 especial, retomada canonica e regra de volta unica.
//
// Guard de acesso: o `PerfilIndividualFormShell` le portalToken de
// sessionStorage e redireciona para `/colaborador` se ausente ou
// invalido (401 do backend).
//
// C-level (S239) e bloqueado transversalmente pelas rotinas de
// autenticacao platform (Perfil Individual do C-level e canonicamente
// acessivel apenas por Bruno — DOC 03 §10.11 aplicacao PC1e). Portal
// nao expoe C-level, portanto guard adicional nao e necessario.

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

// eslint-disable-next-line @stylistic/max-len -- import atomico (prettier)
import { PerfilIndividualFormShell } from '../../../../components/instruments/PerfilIndividualFormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondePerfilIndividualPortalPage(): JSX.Element {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

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
    setCarregando(false);
  }, [router]);

  if (carregando) {
    return (
      <PortalLayout showHeader={true} userName={userName} onSair={handleSair}>
        <div
          style={{
            padding: 60,
            textAlign: 'center',
            color: '#6B7280',
            fontSize: 13,
          }}
        >
          Carregando…
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout showHeader={true} userName={userName} onSair={handleSair}>
      <PerfilIndividualFormShell canalAutenticacao="portal" hrefPendencias={HREF_PENDENCIAS} />
    </PortalLayout>
  );
}
