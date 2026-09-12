// ROIP APP 9BOX — rota canonica `/colaborador/responder/radar-nr1`
// (ME-B10-03, S254, DOC 05 §7.4).
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

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { Nr1FormShell } from '../../../../components/instruments/Nr1FormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondeRadarNr1PortalPage(): JSX.Element {
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
      <Nr1FormShell canalAutenticacao="portal" hrefPendencias={HREF_PENDENCIAS} />
    </PortalLayout>
  );
}
