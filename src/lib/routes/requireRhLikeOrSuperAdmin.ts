// ROIP APP 9BOX — helper canonico requireRhLikeOrSuperAdmin (ME 3.5.1).
//
// Amplificacao canonica bit-exact do `requireRHOrSuperAdmin` (ME-084)
// para admitir a quarta linha canonizada pela ME 3.5:
//
//   - super_admin (Bruno)
//   - platform.role === 'rh'
//   - platform.role === 'rh_lider'
//   - platform.role === 'clevel' AND cLevelMembers.isRH === true
//
// Motivacao (§3.1 do operação v15 + N7 Opcao A da abertura ME 3.5.1):
// pages e actions das rotas RH `/todos-os-colaboradores`, `/colaborador/
// novo` e `/colaborador/[eid]/editar` precisam admitir Michelle (COO
// Embrastec, `cLevelMembers.isRH=true`) operando como RH nativo. O
// helper `requireRHOrSuperAdmin` original permanece intocado — ele ainda
// governa `/dados-mensais` e `/central-relatorios` (fora do escopo desta
// ME); o novo helper substitui o antigo apenas nos 3 arquivos de actions
// que Michelle atinge.
//
// Assinatura async canonica (diferente do original sync) porque a
// decisao para `role='clevel'` exige um SELECT em `cLevelMembers.isRH`
// via `loadCLevelSessionContext` — padrao bit-exact do middleware
// `rhAllowedProcedure` (`src/server/auth/rhAllowedProcedure.ts`).
//
// Escopo do C-level restrito (`acessoTotal=false`): herdado do
// `assertUserCompanyScope`/guards de cadeia descendente ja aplicados em
// cada handler downstream (router `employees` internamente aplica
// `assertCompanyScope`).
//
// **RV-12.** Zero SQL cru — persistencia via Drizzle tipado
// (`loadCLevelSessionContext`).
// **RV-13.** Consumido por 3 arquivos `actions.ts` migrados nesta ME:
//   - `src/app/todos-os-colaboradores/actions.ts`
//   - `src/app/colaborador/novo/actions.ts`
//   - `src/app/colaborador/[employeeId]/editar/actions.ts`
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../db/client';
import { loadCLevelSessionContext } from '../../lib/session/cLevelSessionContext';
import type { ServerSession } from '../../server/session/serverSession';

/**
 * Sessao narrowed para o branch canonico aceito. Discriminada por `kind`.
 * Callers podem consumir `companyId` diretamente para branch `'platform'`;
 * ausente para `'super_admin'`.
 */
export type RhLikeOrSuperAdminSession =
  | {
      readonly kind: 'super_admin';
      readonly superAdminId: number;
      readonly displayName: string;
    }
  | {
      readonly kind: 'platform';
      readonly role: 'rh' | 'rh_lider' | 'clevel';
      readonly userId: number;
      readonly companyId: number;
      readonly displayName: string;
      readonly companyDisplayName: string;
      readonly companyLogoUrl: string | null;
    };

/**
 * Requer que a `ServerSession` corrente seja Super Admin OU RH-like
 * (rh/rh_lider/clevel+isRH). Lanca Error com mensagem canonica generica
 * em qualquer outro caso — incluindo `null`.
 *
 * Custo canonico de I/O do SELECT em `cLevelMembers.isRH` (via
 * `loadCLevelSessionContext`) e pago apenas quando `session.role ===
 * 'clevel'`. Para as demais roles, a decisao e sincrona e sem banco
 * (branch `super_admin` retorna sem tocar `db`; branches `rh`/`rh_lider`
 * idem).
 *
 * Mensagem canonica: nao vazamos "somente RH ou Super Admin" para o
 * cliente (potencial enumeracao de rotas). Mensagem generica.
 */
export async function requireRhLikeOrSuperAdmin(
  db: RoipDatabase,
  session: ServerSession | null,
  actionName: string,
): Promise<RhLikeOrSuperAdminSession> {
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind === 'super_admin') {
    return {
      kind: 'super_admin',
      superAdminId: session.superAdminId,
      displayName: session.displayName,
    };
  }
  if (session.kind === 'platform' && (session.role === 'rh' || session.role === 'rh_lider')) {
    return {
      kind: 'platform',
      role: session.role,
      userId: session.userId,
      companyId: session.companyId,
      displayName: session.displayName,
      companyDisplayName: session.companyDisplayName,
      companyLogoUrl: session.companyLogoUrl,
    };
  }
  if (session.kind === 'platform' && session.role === 'clevel') {
    const cctx = await loadCLevelSessionContext(db, session.companyId, session.userId);
    if (cctx !== null && cctx.isRH === true) {
      return {
        kind: 'platform',
        role: 'clevel',
        userId: session.userId,
        companyId: session.companyId,
        displayName: session.displayName,
        companyDisplayName: session.companyDisplayName,
        companyLogoUrl: session.companyLogoUrl,
      };
    }
  }
  throw new Error(`${actionName}: acesso restrito.`);
}
