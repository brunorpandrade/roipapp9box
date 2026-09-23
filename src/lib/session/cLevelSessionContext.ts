// ROIP APP 9BOX — contexto de sessao do C-level (acessoTotal, Responsavel
// financeiro e contagem de C-levels ativos da empresa). Fonte unica lida de
// `cLevelMembers`, reusada por `loadPlatformMenuContext` (menu) e pelo guard
// PC1h do sub-router `dashboard` (escopo de cadeia descendente do individual).
//
// Motivacao (RV-14): a leitura de `acessoTotal` + contagem de C-levels ativos
// alimenta tanto o `resolveProfileKey`/menu quanto o `resolveHierarchicalScope`
// (que distingue C-level total/unico de C-level restrito). Extraida aqui para
// evitar duas copias da mesma consulta.
//
// **RV-12.** Drizzle tipado (`count()`), sem SQL cru.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, count, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers } from '../../db/schema';

/** Contexto do C-level autenticado consumido por menu e por guards de escopo. */
export interface CLevelSessionContext {
  readonly acessoTotal: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly cLevelCount: number;
}

/**
 * Resolve o contexto do C-level da empresa. Retorna `null` quando o registro
 * nao existe (sessao invalida — o consumidor decide o desfecho). `acessoTotal`
 * segue o default do schema (NULL = true); `cLevelCount` conta apenas os
 * C-levels `status = 'ativo'` da empresa (§8.06.6b — cadeia por `ativo`).
 */
export async function loadCLevelSessionContext(
  db: RoipDatabase,
  companyId: number,
  cLevelId: number,
): Promise<CLevelSessionContext | null> {
  const memberRows = await db
    .select({
      acessoTotal: cLevelMembers.acessoTotal,
      isResponsavelFinanceiro: cLevelMembers.isResponsavelFinanceiro,
    })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.id, cLevelId), eq(cLevelMembers.companyId, companyId)))
    .limit(1);
  const member = memberRows[0];
  if (member === undefined) {
    return null;
  }
  const countRows = await db
    .select({ n: count() })
    .from(cLevelMembers)
    .where(and(eq(cLevelMembers.companyId, companyId), eq(cLevelMembers.status, 'ativo')));
  return {
    acessoTotal: member.acessoTotal !== false,
    isResponsavelFinanceiro: member.isResponsavelFinanceiro === true,
    cLevelCount: Number(countRows[0]?.n ?? 0),
  };
}
