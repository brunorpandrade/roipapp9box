// ROIP APP 9BOX — hook canonico `usePortalSession` (ME-1.3, item 1.3
// do roadmap).
//
// Encapsula o padrao canonico das 6 pages pos-login do portal do
// colaborador (gate-lgpd, pendencias, 4 responder/*): leitura dos
// campos do `sessionStorage`, redirect ao /colaborador quando token
// ausente, derivacao do primeiro nome para a saudacao canonica, e
// `handleSair` canonico que limpa todas as chaves do portal.
//
// Extraido na ME-1.3 (L125: componente/padrao reutilizado em 6
// callsites, extracao obrigatoria na mesma ME que adiciona nova
// logica). Pre-ME-1.3, cada page tinha copia do padrao com 2 chaves
// (`portalUserName` + `portalUserPhoto`); ME-1.3 adiciona mais 2 chaves
// canonicas (`portalCompanyName` + `portalCompanyLogoUrl`) e o
// `greetingFirstName` derivado por `extractFirstName`. Fazer 6 copias
// identicas violaria L125.
//
// Chaves canonicas do sessionStorage lidas e escritas por este hook:
//   - `portalToken`           — presenca obrigatoria; ausencia redireciona.
//   - `portalUserName`        — nome completo do titular.
//   - `portalUserPhoto`       — foto base64; vazio = fallback iniciais.
//   - `portalUserType`        — 'employee' | 'clevel'; limpo no sair.
//   - `portalCompanyName`     — ME-1.3; nome de exibicao da empresa.
//   - `portalCompanyLogoUrl`  — ME-1.3; URL do logo; vazio = so o nome.
//   - `portalLgpdSeen`        — flag do gate; limpo no sair.
//
// Todas gravadas pelo `ColaboradorLoginClient` apos login bem sucedido.
//
// Hook puro de React: sem fetch, sem estado derivado alem do estado da
// propria sessao. Chamado em client components dentro de `useEffect`.
// Retorno canonico cobre TODAS as props do `PortalLayout` relevantes
// pos-login: pages apenas espalham o retorno.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { extractFirstName } from '../../lib/avatar/initials';

/**
 * Snapshot canonico da sessao do portal lido do `sessionStorage`.
 * Todos os campos sao `null` antes do primeiro mount (SSR safe) e
 * preenchidos apos o useEffect de leitura. Pages passam estes 4 campos
 * diretamente para `<PortalLayout>` como props canonicas.
 */
export interface PortalSessionState {
  readonly userName: string | null;
  readonly userPhotoUrl: string | null;
  readonly companyDisplayName: string | null;
  readonly companyLogoUrl: string | null;
  readonly greetingFirstName: string | null;
  readonly handleSair: () => void;
}

/**
 * Chaves canonicas do sessionStorage limpas pelo `handleSair`.
 * Exportada para teste e para o `ColaboradorLoginClient` (que grava).
 */
export const PORTAL_SESSION_KEYS = [
  'portalToken',
  'portalUserName',
  'portalUserType',
  'portalUserPhoto',
  'portalCompanyName',
  'portalCompanyLogoUrl',
  'portalLgpdSeen',
] as const;

/**
 * Hook canonico consumido pelas 6 pages pos-login do portal. Reproduz
 * bit-exact o comportamento previo (redirect ao /colaborador quando
 * token ausente; handleSair limpa sessionStorage e navega) e estende
 * com os 2 campos novos da ME-1.3 + o `greetingFirstName` derivado.
 *
 * Chamadas canonicas em page client component:
 *   const session = usePortalSession();
 *   return (
 *     <PortalLayout showHeader={true} {...session}>...</PortalLayout>
 *   );
 */
export function usePortalSession(): PortalSessionState {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [companyDisplayName, setCompanyDisplayName] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [greetingFirstName, setGreetingFirstName] = useState<string | null>(null);

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
    const foto = window.sessionStorage.getItem('portalUserPhoto');
    setUserPhotoUrl(foto !== null && foto.length > 0 ? foto : null);
    const compName = window.sessionStorage.getItem('portalCompanyName');
    setCompanyDisplayName(compName !== null && compName.length > 0 ? compName : null);
    const compLogo = window.sessionStorage.getItem('portalCompanyLogoUrl');
    setCompanyLogoUrl(compLogo !== null && compLogo.length > 0 ? compLogo : null);
    if (nome !== null && nome.length > 0) {
      const first = extractFirstName(nome);
      setGreetingFirstName(first.length > 0 ? first : null);
    }
  }, [router]);

  const handleSair = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    for (const key of PORTAL_SESSION_KEYS) {
      window.sessionStorage.removeItem(key);
    }
    router.replace('/colaborador');
  }, [router]);

  return {
    userName,
    userPhotoUrl,
    companyDisplayName,
    companyLogoUrl,
    greetingFirstName,
    handleSair,
  };
}
