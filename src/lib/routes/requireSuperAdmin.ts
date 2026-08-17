// ROIP APP 9BOX — helper canonico requireSuperAdmin (ME-082).
//
// Guard de perfil canonico para procs restritas ao Super Admin. Uso
// canonico na ME-082:
//   - myData.updateName (apenas H1a permite edicao inline do nome).
//
// A procedure ja executa via `protectedProcedure` (autenticacao
// generica); este helper faz o narrowing adicional para super_admin,
// lancando TRPCError FORBIDDEN quando o perfil nao qualifica.
//
// **RV-13.** Consumido por src/server/routers/myData.ts (proc
// updateName).
//
// **RV-08.** Nenhuma decisao aqui — apenas narrowing puro + throw
// canonico.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { TRPCError } from '@trpc/server';

import type { ServerSession } from '../../server/session/serverSession';

/**
 * Sessao narrowed para o branch super_admin. Reexpoe apenas os campos
 * canonicos consumidos pelos callers do B9 (superAdminId + displayName).
 */
export interface SuperAdminSession {
  readonly kind: 'super_admin';
  readonly superAdminId: number;
  readonly displayName: string;
}

/**
 * Requer que a `ServerSession` corrente seja de um Super Admin. Lanca
 * TRPCError FORBIDDEN em qualquer outro caso — incluindo `null`, para
 * que o caller nao precise checar duas vezes.
 *
 * Mensagem canonica: nao vazamos "somente Super Admin" para o cliente
 * (potencial enumeracao de rotas). Mensagem generica compativel com
 * §8.1 (canonico) — o UI decide como renderizar (a rota em si nao e
 * atingivel por outros perfis; se chegou aqui, e uso indevido de API).
 */
export function requireSuperAdmin(session: ServerSession | null): SuperAdminSession {
  if (session === null || session.kind !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operacao restrita.' });
  }
  return {
    kind: 'super_admin',
    superAdminId: session.superAdminId,
    displayName: session.displayName,
  };
}
