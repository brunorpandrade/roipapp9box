// ROIP APP 9BOX — helper canonico requireLiderRHLiderOrClevel
// (ME-fila1-01).
//
// Guard de perfil canonico para a rota `/dados-mensais/meus-liderados`
// (DOC 05 §14.14) + actions RH-Lider/C-level/Lider-facing pareadas.
// Alinhado ao pool `src/lib/routes/` — mesmo padrao bit-a-bit dos
// helpers `requireRHOrSuperAdmin` (ME-084) e `requireClevelOrSuperAdmin`
// (ME-B9-CR3).
//
// Origem canonica:
// - CAMADA_UI §14.14 (Dados mensais Lider — `/dados-mensais/meus-
//   liderados`; Referencia `o1b_v1.html`).
// - CAMADA_AUTH §10.4 matrix `/dados-mensais/meus-liderados`:
//     super_admin → redirect_super_admin (nao passa por este guard);
//     rh → allow (RH puro; renderiza estado vazio canonico);
//     rh_lider → allow (RH-Lider = RH que tambem lidera; escopo
//       identico ao lider puro para esta rota);
//     clevel → allow (CU/CT/CF; passa liderTipo='clevel');
//     lider → allow (passa liderTipo='employee').
// - CAMADA_NEGOCIO §3.11 + §4.7 (motor + comportamento por status).
//
// Semantica canonica:
//   - Aceita `session.kind === 'platform'` com `role IN
//     {'rh', 'rh_lider', 'clevel', 'lider'}`.
//   - Rejeita `super_admin` (redirect fica com o page.tsx — matrix
//     `redirect_super_admin`) e `null` com Error canonico generico.
//   - NAO faz I/O ao banco. `session.userId` e `session.role` sao a
//     unica base para consumidores derivarem `liderId` e `liderTipo`.
//
// Consumidores canonicos (RV-13):
//   - `src/app/dados-mensais/meus-liderados/actions.ts` — 6 actions.
//   - `tests/integration/me-fila1-meus-liderados-actions.test.ts` —
//     testes cross-role.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { ServerSession } from '../../server/session/serverSession';

/**
 * Sessao narrowed para o branch canonico aceito por esta rota.
 * Discriminada por `role`. Callers derivam `liderTipo` do proprio
 * `role` (`clevel` → `'clevel'`; demais → `'employee'`) e passam
 * `liderId = session.userId` para as procs canonicas.
 */
export type LiderRHLiderOrClevelSession = {
  readonly kind: 'platform';
  readonly role: 'rh' | 'rh_lider' | 'clevel' | 'lider';
  readonly userId: number;
  readonly companyId: number;
  readonly displayName: string;
  readonly companyDisplayName: string;
  readonly companyLogoUrl: string | null;
  readonly passwordSet: boolean;
};

/**
 * Deriva `liderTipo` canonico a partir do `role` da sessao.
 * `clevel` → `'clevel'` (proc consulta `cLevelMembers`).
 * `rh`, `rh_lider`, `lider` → `'employee'` (proc consulta
 * `employees` + `employeeLeaderHistory`).
 *
 * RH puro (`role === 'rh'`) e aceito pelo guard mas o consumidor
 * canonicamente renderiza estado vazio sem invocar procs (RH puro
 * nao tem liderados diretos por definicao). Este helper preserva o
 * mapeamento por simetria — caller decide se invoca ou nao.
 */
export function deriveLiderTipoFromRole(
  role: LiderRHLiderOrClevelSession['role'],
): 'employee' | 'clevel' {
  if (role === 'clevel') {
    return 'clevel';
  }
  return 'employee';
}

/**
 * Requer que a `ServerSession` corrente pertenca a um dos 4 perfis
 * `platform` autorizados canonicamente pela matrix §10.4 para
 * `/dados-mensais/meus-liderados`. Lanca Error com mensagem canonica
 * generica em qualquer outro caso — incluindo `null` e `super_admin`,
 * para que o caller nao precise checar duas vezes.
 *
 * Mensagem canonica: nao vazamos enumeracao de perfis para o cliente.
 * Padrao bit-a-bit `requireRHOrSuperAdmin` + `requireClevelOrSuperAdmin`.
 */
export function requireLiderRHLiderOrClevel(
  session: ServerSession | null,
  actionName: string,
): LiderRHLiderOrClevelSession {
  if (session === null) {
    throw new Error(`${actionName}: sessao ausente ou expirada`);
  }
  if (session.kind !== 'platform') {
    throw new Error(`${actionName}: acesso restrito.`);
  }
  if (
    session.role !== 'rh' &&
    session.role !== 'rh_lider' &&
    session.role !== 'clevel' &&
    session.role !== 'lider'
  ) {
    throw new Error(`${actionName}: acesso restrito.`);
  }
  return {
    kind: 'platform',
    role: session.role,
    userId: session.userId,
    companyId: session.companyId,
    displayName: session.displayName,
    companyDisplayName: session.companyDisplayName,
    companyLogoUrl: session.companyLogoUrl,
    passwordSet: session.passwordSet,
  };
}
