// ROIP APP 9BOX — guard compartilhado de auto-visao (D-SELF, ME §8.05).
//
// Regra de produto: ninguem ve a propria Dashboard Individual nem o
// proprio Perfil Individual. Bruno (super_admin) e isento — a plataforma
// nao e a empresa dele. C-level e isento deste guard especifico porque o
// seu `userId` e um id de `cLevelMembers`, nunca um `employeeId`; o
// acesso do C-level ao proprio Perfil Individual ja e vedado por PC1e
// (individualProfile `assertPC1e` — DOC 02 §11.5), e o C-level nao possui
// Dashboard Individual (frente de dashboard de equipe, Fase 4).
//
// Emenda documental S### (DOC 05 §14.25.4): remove o estado "colaborador
// comum (proprio dashboard)" — a auto-visao passa a ser bloqueada em
// runtime, alinhada a PC1i do organograma ("Acesso ao proprio perfil nao
// permitido").
//
// Extraido para modulo unico (L125) — consumido por `dashboard.ts`
// (`getEmployeeDashboard`) e por `individualProfile.ts` (`getReport`).
//
// RV-14: um statement por linha, largura maxima 100.

import { TRPCError } from '@trpc/server';

import type { AuthenticatedUser } from '../../trpc';

/** Mensagem canonica de bloqueio da auto-visao do Dashboard Individual. */
export const MSG_AUTO_VISAO_DASHBOARD = 'Acesso ao próprio dashboard não permitido.';

/** Mensagem canonica de bloqueio da auto-visao do Perfil Individual. */
export const MSG_AUTO_VISAO_PERFIL = 'Acesso ao próprio Perfil Individual não permitido.';

/**
 * Lanca `FORBIDDEN` quando o usuario autenticado tenta abrir a propria
 * superficie individual (Dashboard ou Perfil) de um `employee`.
 *
 * Isento: `super_admin` (Bruno) e `clevel` (userId nao e employeeId; o
 * Perfil de C-level ja e vedado por PC1e e o C-level nao tem Dashboard
 * Individual). Para os demais perfis operacionais (`rh`, `rh_lider`,
 * `lider`, `colaborador`), `userId === employeeId` significa auto-visao
 * e e bloqueado.
 *
 * @param message Mensagem canonica — `MSG_AUTO_VISAO_DASHBOARD` no
 *   dashboard, `MSG_AUTO_VISAO_PERFIL` no relatorio de Perfil.
 */
export function assertNaoAutoVisaoEmployee(
  user: AuthenticatedUser,
  employeeId: number,
  message: string,
): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.role === 'clevel') {
    return;
  }
  if (user.userId === employeeId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message,
    });
  }
}
