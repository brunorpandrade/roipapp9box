// ROIP APP 9BOX — contexto de menu da sessao platform (ME-fila6 D1;
// estendido pela ME 3.5 Dispatch 3 para incluir o toggle "Painel
// C-level / Painel RH").
//
// Helper unico de resolucao de `ProfileKey`, itens de menu, flag
// Responsavel financeiro e sino para as 4 roles platform (rh, rh_lider,
// lider, clevel).
//
// Motivacao (achados ME-fila6 D1):
// - Pages que atendem C-level liam `employees` com o id de
//   `cLevelMembers` via `loadRhSessionFlags` (colisao de ids — Eduardo
//   id=1 casava com o employee id=1), produzindo menu errado.
// - Pages C-level passavam `isResponsavelFinanceiro=false` fixo,
//   omitindo "Faturamento da empresa" para C-level RF.
// - Copias locais de `hasDescendingChain` sem filtro
//   `employees.status='ativo'`.
// - Sino exibido para Lider e C-level (DOC 05 §4.1: apenas Bruno e RH).
//
// Extensao ME 3.5 D3 (opcional, backward-compatible):
// - Quando `session.role === 'clevel' AND cLevelMembers.isRH === true`,
//   o consumidor pode passar o `menuMode` corrente (lido do cookie
//   `roip.menu.mode`) para que o `PlatformMenuContext` retorne o
//   `MENU_RH` (§3.3) em vez de `MENU_CLEVEL_*` (§3.8/3.9). Se o
//   consumidor nao passar `menuMode`, o comportamento historico e
//   preservado bit-a-bit (modo 'clevel' implicito).
// - O retorno ganha `menuMode` (modo efetivamente aplicado) e
//   `canToggleMenuMode` (true apenas para C-level com isRH=true — usado
//   pelo Dispatch 4 para decidir renderizar o toggle).
//
// Origem: DOC 05 §3.3-§3.9 (menus) + §4.1 (sino) + DOC 02 §10.4.
// Roles employee reutilizam `loadRhSessionFlags` (fonte unica).
//
// **RV-12.** Drizzle tipado (`count()`), sem SQL cru.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import type { RoipDatabase } from '../../db/client';
import type { ServerSession } from '../../server/session/serverSession';
import { MENU_MODE_DEFAULT, type MenuMode } from '../menu/menuMode';
import { resolveMenuItems, type MenuItem, type ProfileKey } from '../menu/menuConfig';

import { loadCLevelSessionContext } from './cLevelSessionContext';
import { resolveProfileKey } from './resolveProfileKey';
import { loadRhSessionFlags } from './rhSessionFlags';

/**
 * Identidade minima de uma sessao platform (rh, rh_lider, lider, clevel).
 * A `ServerSession` platform e os guards narrowed (ex.:
 * `requireClevelOrSuperAdmin`) sao atribuiveis a este tipo.
 */
export interface PlatformSession {
  readonly kind: 'platform';
  readonly role: Extract<ServerSession, { readonly kind: 'platform' }>['role'];
  readonly userId: number;
  readonly companyId: number;
}

/** Flags do C-level autenticado usadas por guards de escopo. */
export interface CLevelMenuFlags {
  readonly acessoTotal: boolean;
  readonly cLevelCount: number;
  /**
   * ME 3.5 D3 — expoe o flag `cLevelMembers.isRH` para o consumidor
   * decidir renderizar o toggle "Painel C-level / Painel RH". `false` para
   * C-level sem operacao RH (comportamento historico).
   */
  readonly isRH: boolean;
}

/** Contexto resolvido para montar o `Layout` de qualquer page platform. */
export interface PlatformMenuContext {
  readonly profileKey: ProfileKey;
  readonly menuItems: readonly MenuItem[];
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
  readonly showNotificationBell: boolean;
  readonly cLevel: CLevelMenuFlags | null;
  /**
   * ME 3.5 D3 — modo do menu efetivamente aplicado. Sempre 'clevel' para
   * roles nao-clevel e para C-level sem `isRH`. Para C-level+isRH=true,
   * reflete o valor lido do cookie `roip.menu.mode` (fallback 'clevel').
   */
  readonly menuMode: MenuMode;
  /**
   * ME 3.5 D3 — true apenas quando `role='clevel' AND isRH=true`. O
   * componente `<PainelToggle />` (Dispatch 4) so renderiza quando este
   * flag e true.
   */
  readonly canToggleMenuMode: boolean;
}

/**
 * Resolve o contexto de menu da sessao platform. Retorna `null` quando o
 * registro de origem nao existe (sessao invalida — consumidor redireciona
 * para `/`).
 *
 * - `clevel`: le `cLevelMembers` (acessoTotal NULL = true, default do
 *   schema) + contagem de C-levels ativos da empresa. Se `isRH=true` e o
 *   consumidor passou `menuMode='rh'`, retorna `MENU_RH` (§3.3) em vez
 *   de `MENU_CLEVEL_*`.
 * - `rh`, `rh_lider`, `lider`: le `employees` via `loadRhSessionFlags`.
 * - Sino: apenas `rh` e `rh_lider` (DOC 05 §4.1).
 *
 * O parametro `menuMode` e OPCIONAL — quando ausente, `MENU_MODE_DEFAULT`
 * ('clevel') e aplicado, preservando bit-a-bit o comportamento
 * pre-ME 3.5 para todos os callsites que nao foram atualizados ao
 * Dispatch 3. Callsites de C-level com isRH que queiram habilitar o
 * toggle devem passar `resolveMenuMode(cookies().get(MENU_MODE_COOKIE_
 * NAME)?.value)`.
 */
export async function loadPlatformMenuContext(
  db: RoipDatabase,
  session: PlatformSession,
  menuMode: MenuMode = MENU_MODE_DEFAULT,
): Promise<PlatformMenuContext | null> {
  if (session.role === 'clevel') {
    const cctx = await loadCLevelSessionContext(db, session.companyId, session.userId);
    if (cctx === null) {
      return null;
    }
    const cLevel: CLevelMenuFlags = {
      acessoTotal: cctx.acessoTotal,
      cLevelCount: cctx.cLevelCount,
      isRH: cctx.isRH,
    };
    const isResponsavelFinanceiro = cctx.isResponsavelFinanceiro;
    // Toggle disponivel apenas para C-level com isRH=true.
    const canToggleMenuMode = cctx.isRH === true;
    // Modo efetivo: para C-level sem isRH, forca 'clevel' (o toggle nao
    // existe; ignora silenciosamente qualquer cookie legado).
    const effectiveMode: MenuMode = canToggleMenuMode ? menuMode : 'clevel';
    // ProfileKey escolhido pelo modo:
    //   - modo 'rh' → profileKey 'rh' (menu de RH puro §3.3).
    //   - modo 'clevel' → resolveProfileKey normal (§3.8/3.9).
    let profileKey: ProfileKey;
    if (effectiveMode === 'rh') {
      profileKey = 'rh';
    } else {
      profileKey = resolveProfileKey({
        session,
        isRH: false,
        isLider: false,
        acessoTotal: cLevel.acessoTotal,
        hasDescendingChain: false,
        cLevelCount: cLevel.cLevelCount,
        isSuperAdminInCompany: false,
      });
    }
    return buildContext(
      profileKey,
      isResponsavelFinanceiro,
      false,
      false,
      cLevel,
      effectiveMode,
      canToggleMenuMode,
    );
  }

  const flags = await loadRhSessionFlags(db, session.userId);
  if (flags === null) {
    return null;
  }
  const profileKey = resolveProfileKey({
    session,
    isRH: flags.isRH,
    isLider: flags.isLider,
    acessoTotal: false,
    hasDescendingChain: flags.hasDescendingChain,
    cLevelCount: 0,
    isSuperAdminInCompany: false,
  });
  const showNotificationBell = session.role === 'rh' || session.role === 'rh_lider';
  // Roles nao-clevel nunca alternam menu — modo 'clevel' e sentinel
  // canonico "sem toggle" para atender a assinatura do contexto.
  return buildContext(
    profileKey,
    flags.isResponsavelFinanceiro,
    flags.hasDescendingChain,
    showNotificationBell,
    null,
    'clevel',
    false,
  );
}

function buildContext(
  profileKey: ProfileKey,
  isResponsavelFinanceiro: boolean,
  hasDescendingChain: boolean,
  showNotificationBell: boolean,
  cLevel: CLevelMenuFlags | null,
  menuMode: MenuMode,
  canToggleMenuMode: boolean,
): PlatformMenuContext {
  const menuItems = resolveMenuItems(profileKey, isResponsavelFinanceiro);
  if (menuItems === null) {
    throw new Error(`Menu ausente para ${profileKey} — inconsistencia DOC 05 §3`);
  }
  return {
    profileKey,
    menuItems,
    isResponsavelFinanceiro,
    hasDescendingChain,
    showNotificationBell,
    cLevel,
    menuMode,
    canToggleMenuMode,
  };
}
