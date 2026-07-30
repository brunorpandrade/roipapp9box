// ROIP APP 9BOX — resolvedor canonico ProfileKey (ME-056 Bloco B).
//
// Origem canonica:
// - DOC 05 §3.1-§3.10 (10 configuracoes canonicas de menu).
// - DOC 02 §2.1 (10 perfis nominais canonicos).
// - DOC 02 §2.2 (enum canonico do claim `role` do JWT — 5 valores).
// - DOC 02 §2.3 (regra de precedencia inviolavel).
// - DOC 02 §10.3 (matriz canonica das rotas de painel).
//
// Contrato canonico:
// - Funcao pura sem I/O. Recebe `ServerSession` (Bloco A) + 6 flags
//   calculadas pelo consumidor + rota corrente, devolve o `ProfileKey`
//   canonico §3.1-§3.10 renderizavel.
// - As 6 flags separam a resolucao "quem esta autenticado" (JWT) da
//   resolucao "em que cenario canonico esta" (banco). Isso permite
//   teste bit-exact de todas as 10 combinacoes canonicas §3.1-§3.10
//   sem depender de MySQL. As queries que calculam as flags vivem no
//   consumidor (paineis Blocos C+D) e sao verificadas em test
//   integration.
//
// **S307 canonizada nesta ME (D-B Opcao A N7/S226).**
//
// **RV-13.** Cada export tem chamador na propria ME:
//   - `resolveProfileKey` → consumido por `super-admin/page.tsx`,
//     `painel-rh/page.tsx`, `painel-clevel/page.tsx`,
//     `painel-lider/page.tsx`, `access-denied/page.tsx` (refactor
//     D064).
//   - `ProfileKeyInput` (tipo) → reexportado implicitamente por
//     consumo em cada consumidor.

import type { ProfileKey } from '../menu/menuConfig';
import type { ServerSession } from '../../server/session/serverSession';

// -----------------------------------------------------------------------
// Contrato de entrada
// -----------------------------------------------------------------------

/**
 * Entrada canonica de `resolveProfileKey`. Segrega dados de identidade
 * (`session`) de dados de estado (`isRH`, `isLider`, `acessoTotal`,
 * `hasDescendingChain`, `cLevelCount`, `isSuperAdminInCompany`).
 *
 * Semantica canonica das flags:
 * - `isRH`: `employees.isRH` do registro autenticado. Redundante com
 *   `session.role IN ('rh', 'rh_lider')`, mas serve como validacao
 *   defense-in-depth (JWT vs banco — troca de flag entre emissao e
 *   verificacao produz inconsistencia; o consumidor decide como
 *   reagir).
 * - `isLider`: `employees.isLider` do registro autenticado. Redundante
 *   com `session.role IN ('rh_lider', 'lider')`.
 * - `acessoTotal`: `cLevelMembers.acessoTotal` do C-level autenticado.
 *   Distingue `clevel_full` (§3.8) de `clevel_restricted` (§3.9)
 *   quando `cLevelCount > 1`. Ignorado quando `cLevelCount === 1`
 *   (C-level unico sempre ve empresa inteira — §3.8 canonico).
 * - `hasDescendingChain`: existe pelo menos um liderado direto do
 *   usuario autenticado que tambem e lider? Query canonica sobre
 *   `employeeLeaderHistory × employees.isLider = true` com
 *   `dataFim IS NULL`. Distingue Cenario 1 (falso) de Cenario 2
 *   (verdadeiro) em rh_lider e lider.
 * - `cLevelCount`: total de C-levels ativos da empresa do autenticado.
 *   1 → `clevel_full` (unico); >1 → depende de `acessoTotal`.
 *   Ignorado quando `session.role !== 'clevel'`.
 * - `isSuperAdminInCompany`: rota atual pertence ao contexto
 *   dentro-de-empresa (`/super-admin/empresa/[id]/...`)? Distingue
 *   §3.1 (global) de §3.2 (in company). Ignorado quando
 *   `session.kind !== 'super_admin'`. Na ME-056, todos os consumidores
 *   passam `false` — a rota dentro-de-empresa entra em ME futura.
 */
export interface ProfileKeyInput {
  readonly session: ServerSession;
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly acessoTotal: boolean;
  readonly hasDescendingChain: boolean;
  readonly cLevelCount: number;
  readonly isSuperAdminInCompany: boolean;
}

// -----------------------------------------------------------------------
// Resolvedor canonico
// -----------------------------------------------------------------------

/**
 * Resolve o `ProfileKey` canonico §3.1-§3.10 do usuario autenticado.
 *
 * Regras canonicas (mapa 10 combinacoes → 10 ProfileKeys):
 *
 *  #  | kind          | role      | Flags relevantes                | ProfileKey             §
 * ----+---------------+-----------+---------------------------------+----------------------+-----
 *   1 | super_admin   | (n/a)     | isSuperAdminInCompany=false     | super_admin_global   |3.1
 *   2 | super_admin   | (n/a)     | isSuperAdminInCompany=true      | super_admin_in_company|3.2
 *   3 | platform      | rh        | (nenhuma)                       | rh                   |3.3
 *   4 | platform      | rh_lider  | hasDescendingChain=false        | rh_lider_c1          |3.4
 *   5 | platform      | rh_lider  | hasDescendingChain=true         | rh_lider_c2          |3.5
 *   6 | platform      | lider     | hasDescendingChain=false        | lider_c1             |3.6
 *   7 | platform      | lider     | hasDescendingChain=true         | lider_c2             |3.7
 *   8 | platform      | clevel    | cLevelCount===1                 | clevel_full          |3.8
 *   9 | platform      | clevel    | cLevelCount>1 && acessoTotal=T  | clevel_full          |3.8
 *  10 | platform      | clevel    | cLevelCount>1 && acessoTotal=F  | clevel_restricted    |3.9
 *
 * §3.10 (colaborador puro) nao aparece: colaborador nao recebe JWT
 * de plataforma (DOC 02 §2.2), portanto `ServerSession` nunca reflete
 * essa configuracao.
 */
export function resolveProfileKey(input: ProfileKeyInput): ProfileKey {
  const { session } = input;

  if (session.kind === 'super_admin') {
    return input.isSuperAdminInCompany ? 'super_admin_in_company' : 'super_admin_global';
  }

  // session.kind === 'platform'
  switch (session.role) {
    case 'rh':
      return 'rh';
    case 'rh_lider':
      return input.hasDescendingChain ? 'rh_lider_c2' : 'rh_lider_c1';
    case 'lider':
      return input.hasDescendingChain ? 'lider_c2' : 'lider_c1';
    case 'clevel':
      if (input.cLevelCount === 1) {
        return 'clevel_full';
      }
      return input.acessoTotal ? 'clevel_full' : 'clevel_restricted';
  }
}
