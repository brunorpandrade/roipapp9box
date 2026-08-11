// ROIP APP 9BOX — sub-router `orgTree` canônico bit-exact (§14.9 +
// PC1b §11.2 + CAMADA_NEGOCIO §15.7, ME-077). QUARTA rota de código do
// bloco B8.
//
// Origem canônica:
// - CAMADA_UI §14.9 (organograma — layout árvore + modo normal +
//   comportamento clique por tipo de nó) + §2.6 (cores dos nós).
// - CAMADA_AUTH §10.3 linha 807 (Bruno atravessa `/super-admin/
//   empresa/[id]/…`) + §10.4 (organograma acessível a todos os perfis
//   autenticados) + §11.2 PC1b (RH vê C-level sem clique) + §11.7
//   (aplicação canônica da matriz PC1 no roteamento).
// - CAMADA_NEGOCIO §15.7 (regra visual e comportamental PC1b).
// - CAMADA_DADOS §4.4/§4.5/§4.6.
// - MASTER_ESCOPO_B8.md §2 (pattern canônico comum) + §3.4 (ficha
//   canônica desta ME).
//
// Superfícies canônicas bit-exact do §14.9 + §3.4 do Master:
//   - `getFullTree({ companyId })` — retorna a árvore completa
//     canônica bit-exact + flag `applyPC1b`. RH/RH-Líder recebem
//     `applyPC1b=true`; Bruno e C-levels recebem `applyPC1b=false`
//     (§11.7). O RH sempre recebe a topologia completa (§11.2 texto
//     literal *"organograma renderiza a topologia completa"*) — o
//     client aplica o esmaecimento/tooltip §15.7.
//   - `getEmployeeSubtree({ companyId, employeeId })` — retorna a
//     sub-árvore canônica bit-exact enraizada em `employeeId`, para
//     expansão sob demanda de nós inicialmente colapsados (D6 aprovada
//     ME-077). RH/RH-Líder recebem `applyPC1b=true` também; no MVP
//     C-levels não aparecem como descendentes de employees (§4.6 força
//     `cLevelId` só na raiz do vínculo), portanto o filtro visual não
//     tem impacto prático — mantido para simetria arquitetural.
//
// Autorização canônica bit-exact §10.4: `super_admin`, `rh`, `rh_lider`,
// `clevel`, `lider`. Todos os perfis autenticados podem ler o
// organograma; a matriz PC1 opera no CLIENT via flag `applyPC1b` (§11.7
// passo 1-4). Colaborador comum (`role` não emitido pelo login
// unificado — §10.4 canonicamente omite Colab do organograma) não
// atravessa o `roleProcedure`.
//
// Guard canônico bit-exact §2.4: super_admin atravessa; demais roles
// restritos ao próprio `companyId` do JWT via `assertCompanyScopeOrgTree`.
// Padrão local por router consolidado em `leaderOnboarding.ts:171`,
// `leadershipTransfer.ts:251`, `nineBox.ts:217`, `monthlyData.ts:279`.
//
// **RV-13.** Todo export é consumido:
//   - `createOrgTreeRouter` → `routers/index.ts`.
//   - `OrgTreeRouter` type → `routers/index.ts` via `ReturnType`.
//   - Constantes canônicas de mensagem consumidas por testes.
//   - `assertCompanyScopeOrgTree` consumida por testes.
//   - `shouldApplyPC1b` consumida por testes.
//
// **RV-12.** Zero SQL cru — services delegam a queries Drizzle tipadas.
//
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { loadEmployeeSubtree, loadFullOrgTree, type OrgTreeNode } from '../services/orgTree';
import { type AuthenticatedUser, roleProcedure, router } from '../trpc';

// ============================================================
// Mensagens canônicas literais (§9.1 + padrão transversal)
// ============================================================

/** §2.4 — mismatch de empresa. Padrão transversal ao B8. */
export const MSG_ORG_TREE_COMPANY_MISMATCH = 'Empresa não pertence ao seu escopo.' as const;

/** §14.9 — empresa não encontrada. */
export const MSG_ORG_TREE_COMPANY_NOT_FOUND = 'Empresa não encontrada.' as const;

/** §14.9 — colaborador não encontrado / inativo / fora da empresa. */
export const MSG_ORG_TREE_EMPLOYEE_NOT_FOUND = 'Colaborador não encontrado.' as const;

// ============================================================
// Schemas Zod dos inputs canônicos
// ============================================================

export const GET_FULL_TREE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
});

export const GET_EMPLOYEE_SUBTREE_INPUT_SCHEMA = z.object({
  companyId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
});

// ============================================================
// Tipos canônicos de saída
// ============================================================

/**
 * Retorno canônico bit-exact das duas procs. `applyPC1b` é a flag
 * canônica bit-exact §11.7 que instrui o client sobre esmaecimento e
 * tooltip §15.7 dos nós de C-level. Bruno e C-levels recebem `false`;
 * RH/RH-Líder recebem `true`.
 */
export interface OrgTreeResult {
  readonly root: OrgTreeNode;
  readonly applyPC1b: boolean;
}

// ============================================================
// Guards canônicos
// ============================================================

/**
 * §2.4 — guard cruzado de escopo empresa. super_admin atravessa; demais
 * roles restritos ao próprio `companyId` do JWT. Lança FORBIDDEN
 * canônico ao mismatch. Padrão local por router (consolidado em
 * `leaderOnboarding.ts:171`).
 */
export function assertCompanyScopeOrgTree(user: AuthenticatedUser, companyId: number): void {
  if (user.role === 'super_admin') {
    return;
  }
  if (user.companyId !== companyId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: MSG_ORG_TREE_COMPANY_MISMATCH,
    });
  }
}

/**
 * §11.2 PC1b + §15.7 — resolve a flag canônica bit-exact que instrui o
 * client sobre esmaecimento e tooltip *"Detalhes restritos ao Super
 * Admin"* nos nós de C-level. Retorna `true` para `rh` e `rh_lider`;
 * `false` para `super_admin`, `clevel`, `lider`.
 */
export function shouldApplyPC1b(user: AuthenticatedUser): boolean {
  if (user.role === 'super_admin') {
    return false;
  }
  return user.role === 'rh' || user.role === 'rh_lider';
}

// ============================================================
// Factory canônica
// ============================================================

/**
 * Factory canônica do sub-router `orgTree`. Padrão S244 (Facade DI): no
 * MVP o service é puro Drizzle (sem motor injetável) — factory sem
 * parâmetros. Mantida como factory por simetria com os demais routers
 * do bloco B8 (`createLeaderOnboardingRouter`, `createEmployeesRouter`,
 * etc.) e para permitir injeção de dependências futuras (ex.: cache de
 * árvore em memória, motor de indicadores do modo analítico Fase 4).
 */
export function createOrgTreeRouter() {
  return router({
    // --------------------------------------------------------
    // orgTree.getFullTree — Bruno + RH + RH-Líder + C-level + Líder
    // --------------------------------------------------------
    getFullTree: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_FULL_TREE_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<OrgTreeResult> => {
        assertCompanyScopeOrgTree(ctx.user, input.companyId);

        const root = await loadFullOrgTree(ctx.db, input.companyId);
        if (root === null) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_ORG_TREE_COMPANY_NOT_FOUND,
          });
        }

        return {
          root,
          applyPC1b: shouldApplyPC1b(ctx.user),
        };
      }),

    // --------------------------------------------------------
    // orgTree.getEmployeeSubtree — Bruno + RH + RH-Líder + C-level + Líder
    // --------------------------------------------------------
    getEmployeeSubtree: roleProcedure(['super_admin', 'rh', 'rh_lider', 'clevel', 'lider'])
      .input(GET_EMPLOYEE_SUBTREE_INPUT_SCHEMA)
      .query(async ({ ctx, input }): Promise<OrgTreeResult> => {
        assertCompanyScopeOrgTree(ctx.user, input.companyId);

        const root = await loadEmployeeSubtree(ctx.db, input.companyId, input.employeeId);
        if (root === null) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: MSG_ORG_TREE_EMPLOYEE_NOT_FOUND,
          });
        }

        return {
          root,
          applyPC1b: shouldApplyPC1b(ctx.user),
        };
      }),
  });
}

/** Tipo canônico do sub-router — consumido pelo `routers/index.ts`. */
export type OrgTreeRouter = ReturnType<typeof createOrgTreeRouter>;
