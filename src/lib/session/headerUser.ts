// ROIP APP 9BOX — helper canonico `headerUserFromSession`
// (ME-B9.3 Fase A2 dispatch 3).
//
// Projeta a `ServerSession` para o shape minimo que o componente
// `Header` canonico (`src/components/shell/Header.tsx`) espera na prop
// `user`: `displayName` + `avatarUrl` opcional. Centraliza em um unico
// lugar a decisao de como super_admin (sem foto) e platform (com
// `userPhotoUrl`) viram o payload do header, evitando ternarios
// repetidos nas ~59 pages consumidoras.
//
// Super_admin NAO tem foto canonica — o shape `kind: 'super_admin'`
// nao carrega `userPhotoUrl`. Para esses casos, retorna `avatarUrl`
// undefined e o `UserMenuDropdown` renderiza o fallback de iniciais em
// teal canonico.
//
// **RV-13.** Consumido pelas 59 pages de rotas super_admin/platform.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { ServerSession } from '../../server/session/serverSession';

export interface HeaderUser {
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export function headerUserFromSession(session: ServerSession): HeaderUser {
  if (session.kind === 'platform' && session.userPhotoUrl !== null && session.userPhotoUrl !== '') {
    return { displayName: session.displayName, avatarUrl: session.userPhotoUrl };
  }
  return { displayName: session.displayName };
}
