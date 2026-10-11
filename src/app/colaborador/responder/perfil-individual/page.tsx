// ROIP APP 9BOX — rota canonica `/colaborador/responder/perfil-individual`
// (ME-B10-04, S255, DOC 05 §7.5; ME-1.3 cabecalho padrao com identidade da empresa).
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
//
// ME-1.3 (item 1.3 do roadmap): consumo canonico do hook
// `usePortalSession` substituiu a logica inline de leitura do
// sessionStorage + handleSair (L125). Propaga identidade visual da
// empresa + saudacao com primeiro nome ao `PortalLayout`.

'use client';

import { useEffect, useState, type JSX } from 'react';

// eslint-disable-next-line @stylistic/max-len -- import atomico (prettier)
import { PerfilIndividualFormShell } from '../../../../components/instruments/PerfilIndividualFormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';
import { usePortalSession } from '../../../../components/portal-colaborador/usePortalSession';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondePerfilIndividualPortalPage(): JSX.Element {
  const session = usePortalSession();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (session.userName !== null) {
      setCarregando(false);
    }
  }, [session.userName]);

  const layoutProps = {
    showHeader: true as const,
    userName: session.userName,
    userPhotoUrl: session.userPhotoUrl,
    companyDisplayName: session.companyDisplayName,
    companyLogoUrl: session.companyLogoUrl,
    greetingFirstName: session.greetingFirstName,
    onSair: session.handleSair,
  };

  if (carregando) {
    return (
      <PortalLayout {...layoutProps}>
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
    <PortalLayout {...layoutProps}>
      <PerfilIndividualFormShell canalAutenticacao="portal" hrefPendencias={HREF_PENDENCIAS} />
    </PortalLayout>
  );
}
