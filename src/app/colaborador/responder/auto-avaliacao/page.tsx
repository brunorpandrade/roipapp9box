// ROIP APP 9BOX — rota canonica `/colaborador/responder/auto-avaliacao`
// (ME-B10-02, S253, DOC 05 §7.1; ME-1.3 cabecalho padrao com identidade da empresa).
//
// Tela de resposta do Instrumento A no canal portal (colaborador puro
// autenticado por CPF+matricula + gate LGPD + sessionStorage). Client
// component thin: le portalToken de sessionStorage, chama
// `GET /api/portal/pendencias` para obter o `cicloReferencia` canonico
// (trimestre `YYYY-QN`) do card pendente de `autoAvaliacao` e injeta
// no `LikertFormShell` com `canalAutenticacao: 'portal'` e endpoint
// `/api/portal/save-instrument-a`.
//
// Se nao houver pendencia ativa de `autoAvaliacao` (colaborador sem
// ciclo em aberto, respondido recentemente ou C-level — §6.2 S099 —
// bloqueado pelo backend), redireciona para `/colaborador/pendencias`
// com a mensagem canonica ja renderizada pelo `PendenciasClient`.
//
// ME-1.3 (item 1.3 do roadmap): consumo canonico do hook
// `usePortalSession` substituiu a logica inline de leitura do
// sessionStorage + handleSair (L125). Propaga identidade visual da
// empresa + saudacao com primeiro nome ao `PortalLayout`.

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { LikertFormShell } from '../../../../components/instruments/LikertFormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';
import { usePortalSession } from '../../../../components/portal-colaborador/usePortalSession';
import { INSTRUMENT_A_CATALOG } from '../../../../lib/instruments/instrumentACatalog';
import type {
  PortalColaboradorPendencias,
  PortalPendenciaCard,
} from '../../../../lib/pendencias/portalColaborador';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondeAutoAvaliacaoPortalPage(): JSX.Element {
  const router = useRouter();
  const session = usePortalSession();
  const [trimestre, setTrimestre] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      return;
    }

    async function resolverPendencia(bearer: string): Promise<void> {
      try {
        const res = await fetch('/api/portal/pendencias', {
          method: 'GET',
          headers: { authorization: `Bearer ${bearer}` },
        });
        if (res.status === 401) {
          window.sessionStorage.removeItem('portalToken');
          router.replace('/colaborador');
          return;
        }
        if (res.status !== 200) {
          router.replace(HREF_PENDENCIAS);
          return;
        }
        const body = (await res.json()) as PortalColaboradorPendencias;
        const card = body.pendencias.find(
          (p: PortalPendenciaCard) => p.instrumento === 'autoAvaliacao',
        );
        if (
          card === undefined ||
          card.cicloReferencia === null ||
          card.cicloReferencia.length === 0
        ) {
          router.replace(HREF_PENDENCIAS);
          return;
        }
        setTrimestre(card.cicloReferencia);
      } catch {
        router.replace(HREF_PENDENCIAS);
      } finally {
        setCarregando(false);
      }
    }

    void resolverPendencia(token);
  }, [router]);

  const layoutProps = {
    showHeader: true as const,
    userName: session.userName,
    userPhotoUrl: session.userPhotoUrl,
    companyDisplayName: session.companyDisplayName,
    companyLogoUrl: session.companyLogoUrl,
    greetingFirstName: session.greetingFirstName,
    onSair: session.handleSair,
  };

  if (carregando || trimestre === null) {
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
      <LikertFormShell
        titulo="Autoavaliação"
        subtitulo={`Trimestre ${trimestre}`}
        trimestreAtual={trimestre}
        catalogo={INSTRUMENT_A_CATALOG}
        canalAutenticacao="portal"
        endpointSubmit="/api/portal/save-instrument-a"
        hrefPendencias={HREF_PENDENCIAS}
      />
    </PortalLayout>
  );
}
