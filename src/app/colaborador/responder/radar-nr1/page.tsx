// ROIP APP 9BOX — rota canonica `/colaborador/responder/radar-nr1`
// (ME-B10-03, S254, DOC 05 §7.4; ME-1.3 cabeçalho padrão com identidade da empresa).
//
// Tela de resposta do Radar NR-1 no canal portal (colaborador puro
// autenticado por CPF + gate LGPD + sessionStorage). Padrao bit-a-bit
// das rotas `/colaborador/responder/{auto-avaliacao,lideranca-direta}`
// da ME-B10-02, com dois ajustes canonicos:
// - Shell dedicado `Nr1FormShell` (nao `LikertFormShell`) — cinco
//   pontos materiais divergem entre o contrato NR-1 e o contrato A/D:
//   payload (cicloDbId/fator vs trimestre/dimensao), grid (32 vs 20),
//   `startToken` anti-fraude §11.5, modal pre-questionario §11.4,
//   tratamento canonico do 409 §11.15.
// - O `Nr1FormShell` resolve o estado do formulario internamente via
//   `POST /api/portal/nr1-form-state` (nao ha `cicloReferencia` a ler
//   do card de pendencia como em A/D — o backend NR-1 devolve
//   `cicloDbId` diretamente).
//
// Guard de acesso: o `Nr1FormShell` le portalToken de sessionStorage
// e redireciona para `/colaborador` se ausente ou invalido (401 do
// backend).
//
// C-level (S239) e bloqueado no backend (`nr1-form-state` e
// `save-nr1-response` retornam 403 canonico); esta rota nao encena
// guard adicional — o backend e a autoridade final.
//
// ME-1.3 (item 1.3 do roadmap): consumo canonico do hook
// `usePortalSession` substituiu a logica inline de leitura do
// sessionStorage + handleSair (L125). Propaga identidade visual da
// empresa (`companyDisplayName`, `companyLogoUrl`) + `greetingFirstName`
// ao `PortalLayout`.

'use client';

import { useEffect, useState, type JSX } from 'react';

import { Nr1FormShell } from '../../../../components/instruments/Nr1FormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';
import { usePortalSession } from '../../../../components/portal-colaborador/usePortalSession';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondeRadarNr1PortalPage(): JSX.Element {
  const session = usePortalSession();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // ME-1.3: o guard de token + leitura do sessionStorage ja aconteceu
    // dentro do `usePortalSession`. Aqui apenas liberamos o render apos
    // o mount para alinhar com o `userName` carregado assincronamente.
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
      <Nr1FormShell canalAutenticacao="portal" hrefPendencias={HREF_PENDENCIAS} />
    </PortalLayout>
  );
}
