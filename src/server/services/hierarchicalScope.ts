// ROIP APP 9BOX — service hierarchicalScope (ME-086b RETOMADA v2;
// grafo extraído para `leaderGraph` na ME §8.06.5, RV-14).
//
// Resolve a cadeia hierárquica de um usuário autenticado para aplicação
// da regra PC1h §11.9 CAMADA_AUTH (Não-detalhamento fora da cadeia
// hierárquica). Consumido por `src/app/organograma/page.tsx` para
// determinar quais IDs de nó (formato `employee-N` ou `clevel-N`)
// devem ser renderizados com esmaecimento + tooltip PC1H_TOOLTIP.
//
// Origem canônica:
// - CAMADA_AUTH §11.9 PC1h (canonizada em ME-086b RETOMADA v2).
// - CAMADA_UI §14.9 (organograma — esmaecimento por nó individual).
// - CAMADA_DADOS §4.5 (employees) + §4.6 (employeeLeaderHistory).
//
// Semântica bit-exact:
//
//   - Bruno (super_admin), RH puro (rh), RH-Líder (rh_lider),
//     CU (cLevelCount=1), CT (cLevelCount>1 e acessoTotal=true):
//     retorna `null` — sem restrição de cadeia.
//   - CF (clevel, cLevelCount>1, acessoTotal=false): Set com IDs de nó
//     da cadeia própria (subordinados diretos + descendentes) + o
//     próprio nó `clevel-<CF.id>` NÃO (PC1i).
//   - Líder puro (lider): Set com IDs de nó da cadeia própria
//     (descendentes); o próprio nó NÃO entra (PC1i).
//
// **RV-13.** `resolveHierarchicalScope` consumido por
// `src/app/organograma/page.tsx`.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import type { RoipDatabase } from '../../db/client';

import { collectDescendantEmployeeIds, loadActiveLeaderLinks } from './leaderGraph';

// -----------------------------------------------------------------------
// Contratos canônicos
// -----------------------------------------------------------------------

/**
 * Sessão minimalista consumida pelo helper. Bruno é modelado via
 * `role='super_admin'`; demais roles via `platform`. Tipo interno
 * (RV-13); a assinatura pública já expõe a forma esperada.
 */
type HierarchicalScopeSession =
  | { readonly role: 'super_admin' }
  | {
      readonly role: 'rh' | 'rh_lider' | 'clevel' | 'lider';
      readonly userId: number;
      readonly companyId: number;
    };

/** Contexto adicional para role='clevel'. Ignorado para as demais. */
interface HierarchicalScopeCLevelContext {
  readonly cLevelCount: number;
  readonly acessoTotal: boolean;
}

/**
 * Retorno:
 *   - `null`: sem restrição de cadeia (Bruno, RH puro, RH-Líder, CU, CT).
 *   - `Set<string>`: escopo restrito — nós cujo `id` está no Set são
 *     clicáveis; demais são esmaecidos + tooltip PC1h.
 */
type HierarchicalScopeResult = ReadonlySet<string> | null;

// -----------------------------------------------------------------------
// Helper principal
// -----------------------------------------------------------------------

/**
 * Resolve a cadeia hierárquica do usuário conforme PC1h §11.9. Retorna
 * Set de IDs de nó permitidos (`employee-N`/`clevel-N`) ou `null` quando
 * o perfil não sofre PC1h.
 */
export async function resolveHierarchicalScope(
  db: RoipDatabase,
  session: HierarchicalScopeSession,
  cLevelContext?: HierarchicalScopeCLevelContext,
): Promise<HierarchicalScopeResult> {
  if (session.role === 'super_admin') {
    return null;
  }
  if (session.role === 'rh' || session.role === 'rh_lider') {
    return null;
  }
  if (session.role === 'clevel') {
    if (cLevelContext === undefined) {
      return new Set<string>();
    }
    if (cLevelContext.cLevelCount <= 1 || cLevelContext.acessoTotal) {
      return null;
    }
    return await resolveCLevelScope(db, session.companyId, session.userId);
  }
  if (session.role === 'lider') {
    return await resolveLiderScope(db, session.companyId, session.userId);
  }
  return new Set<string>();
}

// -----------------------------------------------------------------------
// Helpers internos (não exportados — RV-13)
// -----------------------------------------------------------------------

/**
 * ME-fila6 D1 — DOC 05 §14.12 `/cadeia-indireta`. IDs dos employees da
 * cadeia descendente do líder EXCLUINDO os liderados diretos (esses
 * aparecem em `/minha-equipe`). Líder employee (`liderId`) ou C-level
 * (`clevelId`). Ordem crescente.
 */
export async function listIndirectChainEmployeeIds(
  db: RoipDatabase,
  companyId: number,
  leader: { readonly tipo: 'employee' | 'clevel'; readonly id: number },
): Promise<readonly number[]> {
  const links = await loadActiveLeaderLinks(db, companyId);
  const directIds = new Set<number>();
  for (const l of links) {
    const isDirect = leader.tipo === 'clevel' ? l.clevelId === leader.id : l.liderId === leader.id;
    if (isDirect) {
      directIds.add(l.employeeId);
    }
  }
  const indiretos = new Set<number>();
  for (const directId of directIds) {
    for (const id of collectDescendantEmployeeIds(directId, links)) {
      if (!directIds.has(id)) {
        indiretos.add(id);
      }
    }
  }
  return [...indiretos].sort((a, b) => a - b);
}

/**
 * Escopo do CF: subordinados diretos (vínculo ativo `clevelId=CF.id`) +
 * descendentes recursivos. O próprio nó do CF não entra (PC1i).
 */
async function resolveCLevelScope(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
): Promise<ReadonlySet<string>> {
  const links = await loadActiveLeaderLinks(db, companyId);
  const scope = new Set<string>();
  for (const l of links) {
    if (l.clevelId === clevelId) {
      scope.add(`employee-${l.employeeId}`);
      for (const id of collectDescendantEmployeeIds(l.employeeId, links)) {
        scope.add(`employee-${id}`);
      }
    }
  }
  return scope;
}

/**
 * Escopo do Líder puro: descendentes recursivos (diretos + indiretos). O
 * próprio nó do líder não entra (PC1i).
 */
async function resolveLiderScope(
  db: RoipDatabase,
  companyId: number,
  liderUserId: number,
): Promise<ReadonlySet<string>> {
  const links = await loadActiveLeaderLinks(db, companyId);
  const scope = new Set<string>();
  for (const id of collectDescendantEmployeeIds(liderUserId, links)) {
    scope.add(`employee-${id}`);
  }
  return scope;
}
