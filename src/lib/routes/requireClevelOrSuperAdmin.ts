// ROIP APP 9BOX — helper canonico requireClevelOrSuperAdmin (ME-B9-CR3).
//
// Guard de perfil canonico para procs/actions acessiveis ao Super Admin
// + C-level (CU + CT + CF; filtro `acessoTotal` fica delegado ao caller
// para preservar padrao bit-exact de `requireRHOrSuperAdmin` que faz
// narrowing puro sem I/O ao banco). Uso canonico:
//   - 6 novas actions clevel-facing da rota base `/central-relatorios`
//     (ME-B9-CR3): `listClosedQuartersClevelAction`,
//     `listDepartmentsClevelAction`, `listLeadersClevelAction`,
//     `generateRelatorioExecutivoClevelAction`,
//     `startReportDownloadTokenClevelAction`,
//     `startExecutiveReportDownloadTokenClevelAction`.
//
// Semantica bit-exact:
//   - Aceita `session.kind === 'super_admin'` (Bruno).
//   - Aceita `session.kind === 'platform'` com `role === 'clevel'` (DOC
//     02 §10.7 ampliada pela CR3 — CU/CT/CF); filtro canonico de
//     `acessoTotal=true` fica com o caller (via query a `cLevelMembers`
//     no page.tsx e nas actions), pois este guard nao faz I/O.
//   - Rejeita qualquer outro caso (colaborador comum, RH, RH-Lider,
//     lider puro, null) com Error canonico (mensagem generica para nao
//     vazar enumeracao de rotas — igual a `requireRHOrSuperAdmin`).
//
// Racional canonico: espelha bit-exact o padrao de `requireRHOrSuperAdmin`
// para preservar consistencia arquitetural do pool de guards em
// `src/lib/routes/`. Actions delegam a callers do router `exports` que
// aplicam guards adicionais (`roleProcedure` + `assertCompanyScope`) —
// defense-in-depth §2.4 preservada.
//
// **RV-13.** Consumido por 1 arquivo `actions.ts` (novo bloco clevel em
// `src/app/central-relatorios/actions.ts`) — 6 actions clevel-facing.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { ServerSession } from '../../server/session/serverSession';

/**
 * Sessao narrowed para o branch canonico aceito pela CR3. Discriminada
 * por `kind`. Callers consumem `companyId` diretamente para `'platform'`
 * (nunca `null`); Bruno atravessa empresas explicitamente via
 * `input.companyId` como em `requireRHOrSuperAdmin`.
 */
export type ClevelOrSuperAdminSession =
  | {
      readonly kind: 'super_admin';
      readonly superAdminId: number;
      readonly displayName: string;
    }
  | {
      readonly kind: 'platform';
      readonly role: 'clevel';
      readonly userId: number;
      readonly companyId: number;
      readonly displayName: string;
      readonly companyDisplayName: string;
      readonly companyLogoUrl: string | null;
    };

/**
 * Requer que a `ServerSession` corrente seja Super Admin OU C-level.
 * Lanca Error com mensagem canonica generica em qualquer outro caso —
 * incluindo `null`, para que o caller nao precise checar duas vezes.
 *
 * NAO valida `acessoTotal` — o caller (page/action) faz a query a
 * `cLevelMembers` e aplica o filtro canonico §12.2/§12.3 (CF bloqueado).
 *
 * Mensagem canonica: nao vazamos "somente C-level ou Super Admin" para
 * o cliente (potencial enumeracao de rotas). Mensagem generica.
 */
export function requireClevelOrSuperAdmin(
  session: ServerSession | null,
  actionName: string,
): ClevelOrSuperAdminSession {
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
  if (session.kind === 'platform' && session.role === 'clevel') {
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
  throw new Error(`${actionName}: acesso restrito.`);
}
