// ROIP APP 9BOX — helper canonico requireRHOrSuperAdmin (ME-084).
//
// Guard de perfil canonico para procs/actions acessiveis ao Super Admin
// + RH puro + RH-Lider (Cenarios 1 e 2). Uso canonico na ME-084:
//   - actions da rota base RH `/todos-os-colaboradores`
//     (`listarColaboradoresRHAction`).
//   - actions da rota base RH `/colaborador/novo`
//     (`criarColaboradorRHAction`, `definirRFRHAction`,
//     `pesquisarLiderCandidatosRHAction`).
//   - actions da rota base RH `/colaborador/[employeeId]/editar` (13
//     actions).
//
// Semantica bit-exact:
//   - Aceita `session.kind === 'super_admin'` (Bruno).
//   - Aceita `session.kind === 'platform'` com `role IN {'rh', 'rh_lider'}`
//     (DOC 02 §10.9 linha 862 + §10.4 linha 816).
//   - Rejeita qualquer outro caso (colaborador comum, C-level, lider puro,
//     null) com Error canonico (mensagem generica para nao vazar enume-
//     racao de rotas — igual a `requireSuperAdmin` ME-082).
//
// Racional canonico: espelha bit-exact o padrao de `requireSuperAdmin`
// (ME-082) para preservar consistencia arquitetural do pool de guards
// em `src/lib/routes/`. Actions delegam a callers do router `employees`
// que aplicam guards adicionais (`roleProcedure` + `assertCompanyScope`
// + `assertCanChangeIsRH`) — defense-in-depth §2.4 preservada.
//
// **RV-13.** Consumido por 4 arquivos `actions.ts` novos ME-084:
//   - `src/app/todos-os-colaboradores/actions.ts`
//   - `src/app/colaborador/novo/actions.ts`
//   - `src/app/colaborador/[employeeId]/editar/actions.ts`
// (Cada arquivo tem >=1 action que chama esta funcao ao topo.)
//
// **RV-08.** Nenhuma decisao aqui — apenas narrowing puro + throw
// canonico. Zero configuracao runtime.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { ServerSession } from '../../server/session/serverSession';

/**
 * Sessao narrowed para o branch canonico ME-084 aceito. Discriminada
 * por `kind`. Callers podem consumir `companyId` diretamente (nunca
 * `null` para branch `'platform'`; ausente para `'super_admin'` pois
 * Bruno atravessa qualquer empresa via rota super-admin dedicada).
 */
export type RHOrSuperAdminSession =
  | {
      readonly kind: 'super_admin';
      readonly superAdminId: number;
      readonly displayName: string;
    }
  | {
      readonly kind: 'platform';
      readonly role: 'rh' | 'rh_lider';
      readonly userId: number;
      readonly companyId: number;
      readonly displayName: string;
      readonly companyDisplayName: string;
      readonly companyLogoUrl: string | null;
    };

/**
 * Requer que a `ServerSession` corrente seja Super Admin OU RH (puro/
 * Lider). Lanca Error com mensagem canonica generica em qualquer outro
 * caso — incluindo `null`, para que o caller nao precise checar duas
 * vezes.
 *
 * Actions do B9 RH-facing chamam este helper no topo. Router `employees`
 * internamente aplica `assertCompanyScope` (garante RH so opera na
 * propria empresa) + `assertCanChangeIsRH` (bloqueia RH tentando ativar
 * isRH em outro colaborador) — defense-in-depth §2.4 preservada bit-
 * exact.
 *
 * Mensagem canonica: nao vazamos "somente RH ou Super Admin" para o
 * cliente (potencial enumeracao de rotas). Mensagem generica.
 */
export function requireRHOrSuperAdmin(
  session: ServerSession | null,
  actionName: string,
): RHOrSuperAdminSession {
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
  throw new Error(`${actionName}: acesso restrito.`);
}
