// ROIP APP 9BOX — rota canonica
// `/colaborador/responder/lideranca-direta` (ME-B10-02, S253, DOC 05 §7.3;
// ME-1.3 cabecalho padrao com identidade da empresa).
//
// Tela de resposta do Instrumento D no canal portal (colaborador puro
// autenticado por CPF+matricula + gate LGPD + sessionStorage). Padrao
// bit-a-bit da rota `/colaborador/responder/auto-avaliacao` com dois
// ajustes canonicos:
// - Catalogo `INSTRUMENT_D_CATALOG` (avaliacao da lideranca direta).
// - Endpoint `POST /api/portal/save-instrument-d`.
//
// A pendencia canonica de `avaliacaoLiderancaDireta` vem apenas em Q1
// ou Q3 (§8.6 S156 — cadencia semestral). Se nao houver card ativo,
// redireciona para `/colaborador/pendencias`. C-level (S099 §8.6
// Bloqueio 3) e bloqueado no submit pelo backend com 403 canonico.
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
import { INSTRUMENT_D_CATALOG } from '../../../../lib/instruments/instrumentDCatalog';
import type {
  PortalColaboradorPendencias,
  PortalPendenciaCard,
} from '../../../../lib/pendencias/portalColaborador';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondeLiderancaDiretaPortalPage(): JSX.Element {
  const router = useRouter();
  const session = usePortalSession();
  const [trimestre, setTrimestre] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    // ME-1.3: o guard de token ja aconteceu dentro do usePortalSession
    // (redirecionando ao `/colaborador` quando ausente). Aqui so lemos
    // novamente para passar ao fetch de pendencias.
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
          (p: PortalPendenciaCard) => p.instrumento === 'avaliacaoLiderancaDireta',
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
        titulo="Avaliação da liderança direta"
        subtitulo={`Trimestre ${trimestre}`}
        trimestreAtual={trimestre}
        catalogo={INSTRUMENT_D_CATALOG}
        canalAutenticacao="portal"
        endpointSubmit="/api/portal/save-instrument-d"
        hrefPendencias={HREF_PENDENCIAS}
      />
    </PortalLayout>
  );
}
