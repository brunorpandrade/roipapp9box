// ROIP APP 9BOX — helper canonico requireAuthenticatedNonCollaborator
// (ME-082).
//
// Guard de perfil canonico para rotas transversais autorizadas a todos
// os perfis autenticados exceto colaborador puro (DOC 02 §10.2):
//   - /meus-dados (H1a Super Admin, H1b demais perfis)
//   - /alterar-senha (H2)
//
// Colaborador puro nao possui sessao no cookie 'session' (DOC 02 §5.3 —
// portal usa sessionStorage independente). Se `session === null`, o
// consumidor decide o destino (login ou access-denied conforme rota).
//
// Retorna a `ServerSession` narrowed para os 5 valores canonicos que
// podem operar essas rotas (super_admin + platform{rh, rh_lider,
// clevel, lider}).
//
// **RV-13.** Consumido por:
//   - src/app/meus-dados/page.tsx (loader H1a/H1b)
//   - src/app/alterar-senha/page.tsx (refactor bit-exact)
//
// **RV-08.** Nenhuma decisao aqui — apenas narrowing puro.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { ServerSession } from '../../server/session/serverSession';

/**
 * Resultado canonico do guard. Discriminated union: caller inspeciona
 * `kind` e reage sem ambiguidade.
 *
 * - `authenticated`: sessao valida de um dos 5 perfis administrativos.
 * - `unauthenticated`: cookie ausente/invalido — consumidor executa
 *   `redirect('/')` (rotas platform) ou `redirect('/login-super-admin')`.
 *
 * Nao ha branch `collaborator` porque colaborador puro nunca ocupa o
 * cookie 'session'; o middleware ja bloqueia via matrix.
 */
export type NonCollaboratorGuardResult =
  | {
      readonly kind: 'authenticated';
      readonly session: ServerSession;
    }
  | {
      readonly kind: 'unauthenticated';
    };

/**
 * Verifica se a sessao pertence a um perfil autenticado nao-colaborador.
 * Funcao pura sem I/O — consumidor injeta a `ServerSession` obtida via
 * `getServerSession()` no server component.
 */
export function requireAuthenticatedNonCollaborator(
  session: ServerSession | null,
): NonCollaboratorGuardResult {
  if (session === null) {
    return { kind: 'unauthenticated' };
  }
  // Todo `ServerSession` valido pertence a super_admin ou platform. Nao
  // ha kind 'colaborador' no tipo — o portal do colaborador usa
  // sessionStorage separado (DOC 02 §5.3). Narrowing implicito.
  return { kind: 'authenticated', session };
}
