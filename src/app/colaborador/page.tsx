// ROIP APP 9BOX — rota canônica `/colaborador` (ME-B10-01,
// DOC 02 §4.3 revisado + DOC 05 §6.1 revisado — S248 Opção B).
//
// Ponto de entrada do portal do colaborador comum. Layout tela cheia
// sem sidebar. Server component thin — delega interatividade ao
// `ColaboradorLoginClient` (client component) que gerencia
// sessionStorage.
//
// RV-13: `ColaboradorPage` (default) consumido pelo runtime Next 15.
// RV-14: um statement por linha, largura máxima 100 colunas.

import type { JSX } from 'react';

import { ColaboradorLoginClient } from '../../components/portal-colaborador/ColaboradorLoginClient';
import { PortalLayout } from '../../components/portal-colaborador/PortalLayout';

export default function ColaboradorPage(): JSX.Element {
  return (
    <PortalLayout showHeader={false}>
      <ColaboradorLoginClient />
    </PortalLayout>
  );
}
