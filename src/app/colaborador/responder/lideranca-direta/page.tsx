// ROIP APP 9BOX — rota canonica
// `/colaborador/responder/lideranca-direta` (ME-B10-02, S253, DOC 05 §7.3).
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

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { LikertFormShell } from '../../../../components/instruments/LikertFormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';
import { INSTRUMENT_D_CATALOG } from '../../../../lib/instruments/instrumentDCatalog';
import type {
  PortalColaboradorPendencias,
  PortalPendenciaCard,
} from '../../../../lib/pendencias/portalColaborador';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondeLiderancaDiretaPortalPage(): JSX.Element {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [trimestre, setTrimestre] = useState<string | null>(null);
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

  if (carregando || trimestre === null) {
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
