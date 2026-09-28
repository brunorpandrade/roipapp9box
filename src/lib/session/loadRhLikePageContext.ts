// ROIP APP 9BOX — helper canonico `loadRhLikePageContext` (ME 3.5 D6).
//
// Resolve o contexto RH-like de uma page platform que representa uma
// rota canonica do menu de RH (§3.3 DOC 05). Consumido pelas 6 pages
// RH-facing da ME 3.5 D6 (`/nr1`, `/organograma`, `/notificacoes`,
// `/pendencias-portal`, `/onboarding-lideres`, `/dados-mensais`) para
// admitir tres identidades canonicas:
//
//   - `role='rh'` (RH puro).
//   - `role='rh_lider'` (RH-Lider — C1 ou C2, resolvido pelo
//     `hasDescendingChain`).
//   - `role='clevel'` COM `cLevelMembers.isRH=true` (C-level operando
//     como RH — S9-S13 da bateria de seguranca ME 3.5).
//
// Racional canonico: as pages RH herdam menu, header e semantica
// operacional identicos para os tres perfis; a decisao de admissao,
// no entanto, precisa ler `cLevelMembers.isRH` do banco (defense-in-
// depth ao matrix.ts §10.4/§10.5/§10.6 que agora libera `clevel` na
// rota). O contexto sintetizado para o C-level operando como RH
// canonicamente carrega `profileKey='rh'`, `isLider=false`,
// `hasDescendingChain=false` — o C-level exerce a rota como se fosse
// um RH puro (§14 DOC 05 nao prevê C-level acessando as rotas RH em
// cenario RH-Lider); somente `isResponsavelFinanceiro` do proprio
// C-level e propagado para o menu (item "Faturamento da empresa"
// §14.15 canonico).
//
// **RV-13.** Todo export tem consumidor real na ME 3.5 D6:
//   - `RhLikePageContext` (tipo) → 6 pages + teste unit.
//   - `RhLikeIdentityInput` + `decideRhLikeIdentity` → teste unit
//     `me-3-5-d6-rh-like-context.test.ts` isola a decisao pura sem I/O.
//   - `loadRhLikePageContext` → 6 pages RH-facing + teste unit.
// **RV-12.** Zero SQL cru — persistencia via Drizzle tipado nos helpers
// carregados (`loadCLevelSessionContext`, `loadRhSessionFlags`).
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../db/client';
import type { MenuItem, ProfileKey } from '../menu/menuConfig';
import type { MenuMode } from '../menu/menuMode';

import { loadCLevelSessionContext, type CLevelSessionContext } from './cLevelSessionContext';
import { loadPlatformMenuCtxCookie } from './platformMenuCookie';
import type { PlatformSession } from './platformMenuContext';
import { loadRhSessionFlags, type RhSessionFlags } from './rhSessionFlags';

// -----------------------------------------------------------------------
// Tipo canonico do contexto sintetizado
// -----------------------------------------------------------------------

/**
 * Contexto canonico consumido pelas 6 pages RH-facing. Estrutura
 * bit-exact ao que as pages historicamente compunham inline via
 * `loadRhSessionFlags` + `resolveProfileKey` + `resolveMenuItems` +
 * `loadPlatformMenuCtxCookie`, com o campo canonico adicional
 * `isCLevelActingAsRH` para o consumidor decidir renderizacoes
 * finas (ex.: header sem sino para C-level, ausencia de secao
 * exclusiva de RH-Lider).
 */
export interface RhLikePageContext {
  readonly profileKey: ProfileKey;
  readonly menuItems: readonly MenuItem[];
  readonly canToggleMenuMode: boolean;
  readonly menuMode: MenuMode;
  readonly isRH: true;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
  /** true quando a sessao e um C-level operando como RH. */
  readonly isCLevelActingAsRH: boolean;
}

// -----------------------------------------------------------------------
// Funcao pura de decisao (testavel sem I/O)
// -----------------------------------------------------------------------

/** Discriminador canonico da identidade RH-like resolvida. */
export type RhLikeIdentity = 'rh' | 'rh_lider' | 'clevel_as_rh' | null;

/**
 * Entrada canonica da decisao pura. `rhFlags` vem de `loadRhSessionFlags`
 * (roles employee) e `cLevelCtx` vem de `loadCLevelSessionContext`
 * (role clevel); o consumidor carrega apenas o que a role exige.
 */
export interface RhLikeIdentityInput {
  readonly session: PlatformSession;
  readonly rhFlags: RhSessionFlags | null;
  readonly cLevelCtx: CLevelSessionContext | null;
}

/**
 * Decide canonicamente qual identidade RH-like a sessao exerce, sem
 * I/O. Extraida de `loadRhLikePageContext` para permitir teste unit
 * bit-exact das 6 combinacoes canonicas (rh/rh_lider/clevel+isRH/
 * clevel-sem-isRH/lider/registro deletado).
 */
export function decideRhLikeIdentity(input: RhLikeIdentityInput): RhLikeIdentity {
  const { session, rhFlags, cLevelCtx } = input;
  if (session.role === 'rh' || session.role === 'rh_lider') {
    if (rhFlags === null) {
      return null;
    }
    return session.role;
  }
  if (session.role === 'clevel') {
    if (cLevelCtx === null || cLevelCtx.isRH !== true) {
      return null;
    }
    return 'clevel_as_rh';
  }
  return null;
}

// -----------------------------------------------------------------------
// Loader canonico (composto — I/O + decisao pura)
// -----------------------------------------------------------------------

/**
 * Resolve o contexto RH-like para uma page platform que representa
 * uma rota canonica do menu de RH. Retorna `null` quando a sessao nao
 * tem direito de operar como RH nesta rota — o consumidor redireciona
 * para `/access-denied?rota=<rota>`.
 *
 * Aceita canonicamente:
 *   - `session.role === 'rh'` → contexto RH puro
 *     (`isCLevelActingAsRH=false`).
 *   - `session.role === 'rh_lider'` → contexto RH-Lider
 *     (`profileKey` via `resolveProfileKey`; C1 vs C2 depende de
 *     `hasDescendingChain`).
 *   - `session.role === 'clevel' AND cLevelMembers.isRH === true` →
 *     contexto RH sintetizado (`profileKey='rh'`, `isLider=false`,
 *     `isResponsavelFinanceiro` do proprio C-level,
 *     `hasDescendingChain=false`).
 *
 * Rejeita (retorna `null`):
 *   - Qualquer outra role (`lider`).
 *   - `clevel` com `isRH=false`.
 *   - Falha ao carregar menu via `loadPlatformMenuCtxCookie`.
 *   - `loadRhSessionFlags` retorna `null` (registro deletado entre
 *     emissao do JWT e verificacao).
 */
export async function loadRhLikePageContext(
  db: RoipDatabase,
  session: PlatformSession,
): Promise<RhLikePageContext | null> {
  // Carrega em paralelo apenas o que a role exige. Roles employee
  // consomem `loadRhSessionFlags`; clevel consome
  // `loadCLevelSessionContext`. `loadPlatformMenuCtxCookie` e comum.
  const rhFlags =
    session.role === 'rh' || session.role === 'rh_lider'
      ? await loadRhSessionFlags(db, session.userId)
      : null;
  const cLevelCtx =
    session.role === 'clevel'
      ? await loadCLevelSessionContext(db, session.companyId, session.userId)
      : null;

  const identity = decideRhLikeIdentity({ session, rhFlags, cLevelCtx });
  if (identity === null) {
    return null;
  }

  const menu = await loadPlatformMenuCtxCookie(db, session);
  if (menu === null) {
    return null;
  }

  if (identity === 'clevel_as_rh') {
    // cLevelCtx e nao-null por construcao (identity==='clevel_as_rh').
    const ctx = cLevelCtx as CLevelSessionContext;
    return {
      profileKey: 'rh',
      menuItems: menu.menuItems,
      canToggleMenuMode: menu.canToggleMenuMode,
      menuMode: menu.menuMode,
      isRH: true,
      isLider: false,
      isResponsavelFinanceiro: ctx.isResponsavelFinanceiro,
      hasDescendingChain: false,
      isCLevelActingAsRH: true,
    };
  }

  // identity === 'rh' | 'rh_lider' — rhFlags nao-null por construcao.
  const flags = rhFlags as RhSessionFlags;
  return {
    profileKey: menu.profileKey,
    menuItems: menu.menuItems,
    canToggleMenuMode: menu.canToggleMenuMode,
    menuMode: menu.menuMode,
    isRH: true,
    isLider: flags.isLider,
    isResponsavelFinanceiro: flags.isResponsavelFinanceiro,
    hasDescendingChain: flags.hasDescendingChain,
    isCLevelActingAsRH: false,
  };
}
