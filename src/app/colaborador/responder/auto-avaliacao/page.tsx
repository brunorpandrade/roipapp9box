// ROIP APP 9BOX — rota canonica `/colaborador/responder/auto-avaliacao`
// (ME-B10-02, S253, DOC 05 §7.1).
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

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

import { LikertFormShell } from '../../../../components/instruments/LikertFormShell';
import { PortalLayout } from '../../../../components/portal-colaborador/PortalLayout';
import { INSTRUMENT_A_CATALOG } from '../../../../lib/instruments/instrumentACatalog';
import type {
  PortalColaboradorPendencias,
  PortalPendenciaCard,
} from '../../../../lib/pendencias/portalColaborador';

const HREF_PENDENCIAS = '/colaborador/pendencias';

export default function RespondeAutoAvaliacaoPortalPage(): JSX.Element {
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
