// ROIP APP 9BOX — contexto de menu da sessao platform (ME-fila6 D1).
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
// Origem: DOC 05 §3.3-§3.9 (menus) + §4.1 (sino) + DOC 02 §10.4.
// Roles employee reutilizam `loadRhSessionFlags` (fonte unica).
//
// **RV-12.** Drizzle tipado (`count()`), sem SQL cru.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, count, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers } from '../../db/schema';
import type { ServerSession } from '../../server/session/serverSession';
import { resolveMenuItems, type MenuItem, type ProfileKey } from '../menu/menuConfig';

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
}

/** Contexto resolvido para montar o `Layout` de qualquer page platform. */
export interface PlatformMenuContext {
  readonly profileKey: ProfileKey;
  readonly menuItems: readonly MenuItem[];
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
  readonly showNotificationBell: boolean;
  readonly cLevel: CLevelMenuFlags | null;
}

/**
 * Resolve o contexto de menu da sessao platform. Retorna `null` quando o
 * registro de origem nao existe (sessao invalida — consumidor redireciona
 * para `/`).
 *
 * - `clevel`: le `cLevelMembers` (acessoTotal NULL = true, default do
 *   schema) + contagem de C-levels ativos da empresa.
 * - `rh`, `rh_lider`, `lider`: le `employees` via `loadRhSessionFlags`.
 * - Sino: apenas `rh` e `rh_lider` (DOC 05 §4.1).
 */
export async function loadPlatformMenuContext(
  db: RoipDatabase,
  session: PlatformSession,
): Promise<PlatformMenuContext | null> {
  if (session.role === 'clevel') {
    const memberRows = await db
      .select({
        acessoTotal: cLevelMembers.acessoTotal,
        isResponsavelFinanceiro: cLevelMembers.isResponsavelFinanceiro,
      })
      .from(cLevelMembers)
      .where(
        and(eq(cLevelMembers.id, session.userId), eq(cLevelMembers.companyId, session.companyId)),
      )
      .limit(1);
    const member = memberRows[0];
    if (member === undefined) {
      return null;
    }
    const countRows = await db
      .select({ n: count() })
      .from(cLevelMembers)
      .where(
        and(eq(cLevelMembers.companyId, session.companyId), eq(cLevelMembers.status, 'ativo')),
      );
    const cLevel: CLevelMenuFlags = {
      acessoTotal: member.acessoTotal !== false,
      cLevelCount: Number(countRows[0]?.n ?? 0),
    };
    const isResponsavelFinanceiro = member.isResponsavelFinanceiro === true;
    const profileKey = resolveProfileKey({
      session,
      isRH: false,
      isLider: false,
      acessoTotal: cLevel.acessoTotal,
      hasDescendingChain: false,
      cLevelCount: cLevel.cLevelCount,
      isSuperAdminInCompany: false,
    });
    return buildContext(profileKey, isResponsavelFinanceiro, false, false, cLevel);
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
  return buildContext(
    profileKey,
    flags.isResponsavelFinanceiro,
    flags.hasDescendingChain,
    showNotificationBell,
    null,
  );
}

function buildContext(
  profileKey: ProfileKey,
  isResponsavelFinanceiro: boolean,
  hasDescendingChain: boolean,
  showNotificationBell: boolean,
  cLevel: CLevelMenuFlags | null,
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
  };
}
