// ROIP APP 9BOX — service hierarchicalScope (ME-086b RETOMADA v2).
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
// Semântica canônica bit-exact:
//
//   - Bruno (super_admin), RH puro (rh), RH-Líder (rh_lider),
//     CU (cLevelCount=1), CT (cLevelCount>1 e acessoTotal=true):
//     retorna `null` — sem restrição de cadeia (topologia inteira
//     acessível para dashboards); PC1b (§11.2) segue aplicável
//     ortogonalmente para RH/RH-Líder sobre C-levels.
//
//   - CF (clevel, cLevelCount>1, acessoTotal=false): retorna Set
//     com IDs de nó da cadeia própria (subordinados diretos do CF +
//     descendentes recursivos) + o próprio nó `clevel-<CF.id>`.
//
//   - Líder puro (lider): retorna Set com IDs de nó da cadeia
//     própria (liderados diretos + descendentes) + o próprio nó
//     `employee-<lider.userId>`.
//
// **RV-13.** `resolveHierarchicalScope` consumido por
// `src/app/organograma/page.tsx`.
// **RV-12.** Zero SQL cru — Drizzle tipado.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeLeaderHistory, employees } from '../../db/schema';

// -----------------------------------------------------------------------
// Contratos canônicos
// -----------------------------------------------------------------------

/**
 * Sessão canônica minimalista consumida pelo helper. Bruno é modelado
 * bit-exact via `role='super_admin'`; demais roles via `platform`.
 * Tipo interno canônico — não exportado (RV-13); a assinatura pública
 * de `resolveHierarchicalScope` já expõe a forma esperada.
 */
type HierarchicalScopeSession =
  | { readonly role: 'super_admin' }
  | {
      readonly role: 'rh' | 'rh_lider' | 'clevel' | 'lider';
      readonly userId: number;
      readonly companyId: number;
    };

/**
 * Contexto canônico adicional para role='clevel'. Ignorado para as
 * demais roles. Tipo interno canônico — consumidor infere via
 * assinatura de `resolveHierarchicalScope`.
 */
interface HierarchicalScopeCLevelContext {
  readonly cLevelCount: number;
  readonly acessoTotal: boolean;
}

/**
 * Retorno canônico do helper:
 *   - `null`: sem restrição de cadeia — usuário vê topologia inteira
 *     com dashboards habilitados (Bruno, RH puro, RH-Líder, CU, CT).
 *   - `Set<string>`: escopo restrito canônico — nós cujo `id`
 *     está no Set são clicáveis; demais são esmaecidos + tooltip
 *     PC1h.
 * Tipo interno canônico — não exportado (RV-13); consumidor externo
 * infere pelo return type da função.
 */
type HierarchicalScopeResult = ReadonlySet<string> | null;

// -----------------------------------------------------------------------
// Helper principal canônico
// -----------------------------------------------------------------------

/**
 * Resolve a cadeia hierárquica canônica do usuário conforme regra PC1h
 * §11.9. Retorna Set canônico bit-exact de IDs de nó permitidos
 * (formato `employee-N` ou `clevel-N`) ou `null` quando o perfil não
 * sofre PC1h.
 */
export async function resolveHierarchicalScope(
  db: RoipDatabase,
  session: HierarchicalScopeSession,
  cLevelContext?: HierarchicalScopeCLevelContext,
): Promise<HierarchicalScopeResult> {
  // Bruno: nunca sofre PC1h.
  if (session.role === 'super_admin') {
    return null;
  }

  // RH puro e RH-Líder: nunca sofrem PC1h (PC1b já ortogonal cobre
  // C-levels; RH tem visão total da empresa por definição §3.3).
  if (session.role === 'rh' || session.role === 'rh_lider') {
    return null;
  }

  // C-level: escopo depende de cLevelCount e acessoTotal.
  if (session.role === 'clevel') {
    // CU (cLevelCount<=1): sem PC1h (empresa canônica com único
    // C-level — visão total por definição).
    // CT (cLevelCount>1 e acessoTotal=true): sem PC1h (visão total
    // por privilégio canônico).
    if (cLevelContext === undefined) {
      // Safe default canônico: aplicar restrição maximamente
      // conservadora — retornar Set vazio (PC1i cobre próprio nó via
      // mecanismo separado; sem contexto, ninguém canonicamente é
      // acessível).
      return new Set<string>();
    }
    if (cLevelContext.cLevelCount <= 1 || cLevelContext.acessoTotal) {
      return null;
    }
    // CF: escopo canônico = subordinados diretos do CF + descendentes
    // recursivos + próprio nó do CF.
    return await resolveCLevelScope(db, session.companyId, session.userId);
  }

  // Líder puro: escopo canônico = liderados diretos + descendentes
  // recursivos + próprio nó do líder.
  if (session.role === 'lider') {
    return await resolveLiderScope(db, session.companyId, session.userId);
  }

  // Roles não cobertos explicitamente (colaborador não chega ao
  // organograma pela matriz §10.4). Safe default: escopo vazio.
  return new Set<string>();
}

// -----------------------------------------------------------------------
// Helpers internos canônicos (não exportados — RV-13)
// -----------------------------------------------------------------------

/**
 * ME-fila6 D1 — DOC 05 §14.12 `/cadeia-indireta`. Retorna os ids dos
 * employees da cadeia descendente do lider informado EXCLUINDO os
 * liderados diretos (esses aparecem em `/minha-equipe`). O lider pode ser
 * employee (`liderId`) ou C-level (`clevelId`). Ordem crescente de id.
 */
export async function listIndirectChainEmployeeIds(
  db: RoipDatabase,
  companyId: number,
  leader: { readonly tipo: 'employee' | 'clevel'; readonly id: number },
): Promise<readonly number[]> {
  const links = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(eq(employees.companyId, companyId), isNull(employeeLeaderHistory.dataFim)));

  const directIds = new Set<number>();
  for (const l of links) {
    const isDirect = leader.tipo === 'clevel' ? l.clevelId === leader.id : l.liderId === leader.id;
    if (isDirect) {
      directIds.add(l.employeeId);
    }
  }

  const scope = new Set<string>();
  for (const directId of directIds) {
    collectDescendants(directId, links, scope);
  }

  const ids: number[] = [];
  for (const key of scope) {
    const id = Number(key.slice('employee-'.length));
    if (!directIds.has(id)) {
      ids.push(id);
    }
  }
  ids.sort((a, b) => a - b);
  return ids;
}

/**
 * Resolve escopo canônico do CF. Subordinados diretos são employees
 * cujo vínculo ativo em `employeeLeaderHistory` aponta `clevelId=CF.id`.
 * Descendentes são recursivos via `liderId`.
 */
async function resolveCLevelScope(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
): Promise<ReadonlySet<string>> {
  // Carrega todos os vínculos ativos da empresa uma vez.
  const links = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(eq(employees.companyId, companyId), isNull(employeeLeaderHistory.dataFim)));

  // Subordinados diretos do CF: employees com clevelId=CF.id.
  const directIds: number[] = [];
  for (const l of links) {
    if (l.clevelId === clevelId) {
      directIds.push(l.employeeId);
    }
  }

  // Recursão sobre liderId — descendentes de cada subordinado direto.
  // §11.10 PC1i: o próprio nó do CF NÃO entra no scope — auto-acesso
  // ao próprio perfil individual é vedado. O próprio C-level ficará
  // esmaecido pelo mecanismo PC1i no client.
  const scope = new Set<string>();
  for (const empId of directIds) {
    // O próprio subordinado direto entra no escopo (fix ME-086b
    // RETOMADA v2 — collectDescendants não adiciona o root).
    scope.add(`employee-${empId}`);
    collectDescendants(empId, links, scope);
  }
  return scope;
}

/**
 * Resolve escopo canônico do Líder puro. Liderados diretos: employees
 * com `liderId=lider.userId`. Descendentes: recursivos.
 */
async function resolveLiderScope(
  db: RoipDatabase,
  companyId: number,
  liderUserId: number,
): Promise<ReadonlySet<string>> {
  const links = await db
    .select({
      employeeId: employeeLeaderHistory.employeeId,
      liderId: employeeLeaderHistory.liderId,
      clevelId: employeeLeaderHistory.clevelId,
    })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(and(eq(employees.companyId, companyId), isNull(employeeLeaderHistory.dataFim)));

  const scope = new Set<string>();
  // §11.10 PC1i: o próprio nó do líder NÃO entra no scope — auto-
  // acesso ao próprio perfil individual é vedado. O próprio nó ficará
  // esmaecido pelo mecanismo PC1i no client.
  collectDescendants(liderUserId, links, scope);
  return scope;
}

/**
 * Adiciona ao `scope` todos os descendentes de `rootEmployeeId`
 * (liderados diretos + recursivos). Não adiciona o próprio root —
 * o caller decide se inclui.
 */
function collectDescendants(
  rootEmployeeId: number,
  links: ReadonlyArray<{
    readonly employeeId: number;
    readonly liderId: number | null;
    readonly clevelId: number | null;
  }>,
  scope: Set<string>,
): void {
  // BFS iterativo canônico bit-exact para evitar stack overflow em
  // cadeias profundas patológicas.
  const queue: number[] = [rootEmployeeId];
  const visited = new Set<number>();
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    for (const l of links) {
      if (l.liderId === currentId && !visited.has(l.employeeId)) {
        scope.add(`employee-${l.employeeId}`);
        queue.push(l.employeeId);
      }
    }
  }
}
