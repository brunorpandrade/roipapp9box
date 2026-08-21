// ROIP APP 9BOX — helper canonico `loadRhSessionFlags` (ME-086,
// D-086-10 aprovada).
//
// Origem canonica:
// - CAMADA_UI §3.3 (MENU_RH_PURO) + §3.4 (MENU_RH_LIDER_C1) + §3.5
//   (MENU_RH_LIDER_C2) + §14.15 (item "Faturamento da empresa" no
//   menu condicional a `isResponsavelFinanceiro`).
// - CAMADA_AUTH §5.5 (definicao de Cenario 1 vs Cenario 2 RH-Lider:
//   `hasDescendingChain` = existe >= 1 liderado direto ATIVO que
//   tambem e lider ATIVO).
// - CAMADA_DADOS §4.5 (`employees.isRH`, `employees.isLider`,
//   `employees.isResponsavelFinanceiro`, `employees.status`).
// - CAMADA_DADOS §4.6 (`employeeLeaderHistory` com `dataFim IS NULL`
//   para vinculo ativo).
//
// Consolidacao canonica D-086-10 aprovada bit-exact: substitui as 6
// copias divergentes de `resolveMenuFlagsForRH` existentes em
//   - `src/app/todos-os-colaboradores/page.tsx`
//   - `src/app/colaborador/[employeeId]/editar/page.tsx`
//   - `src/app/colaborador/novo/page.tsx`
//   - `src/app/onboarding-lideres/page.tsx`
//   - `src/app/central-relatorios/page.tsx`
//   - `src/app/pendencias-portal/page.tsx`
// e a copia local `loadRhSessionFlags` em
//   - `src/app/painel-rh/internals.ts`
// consumida por `page.tsx` do painel-rh.
//
// Bugs canonicos latentes corrigidos nesta consolidacao:
//   1. Campo `isResponsavelFinanceiro` ausente nas 6 copias
//      `resolveMenuFlagsForRH` — provocava `resolveMenuItems(profileKey,
//      false)` hardcoded, omitindo item "Faturamento da empresa" do menu
//      quando o RH e RF. Violacao §14.15 canonica.
//   2. Filtro `employees.status='ativo'` ausente na join do
//      `hasDescendingChain` nas 6 copias — inflava Cenario 2 (RHL2)
//      para RHs cujos unicos lideres subordinados foram inativados.
//      Violacao §5.5 canonica.
//
// O helper canonico ja existia em `painel-rh/internals.ts` com o
// comportamento CORRETO; esta consolidacao move para lib compartilhada
// e refatora todos os 7 callsites (6 + painel-rh) + as 2 novas rotas
// ME-086 (`/organograma`, `/dados-mensais`) para consumi-lo.
//
// **RV-13.** Todo export tem consumidor real:
// - `RhSessionFlags` type → 8 pages + 1 arquivo de teste
//   (`me086-rh-session-flags-consolidado.test.ts`).
// - `loadRhSessionFlags` → 8 pages + 1 arquivo de teste.
//
// **RV-12.** Zero SQL cru — persistencia via Drizzle tipado.
//
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { and, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employees, employeeLeaderHistory } from '../../db/schema';

// -----------------------------------------------------------------------
// Tipo canonico
// -----------------------------------------------------------------------

/**
 * Flags canonicas resolvidas do titular RH autenticado. Consumidas
 * pelas pages para calcular `ProfileKey` via `resolveProfileKey`,
 * filtrar secoes condicionais e passar RF ao `resolveMenuItems`.
 */
export interface RhSessionFlags {
  readonly isRH: boolean;
  readonly isLider: boolean;
  readonly isResponsavelFinanceiro: boolean;
  readonly hasDescendingChain: boolean;
}

// -----------------------------------------------------------------------
// Loader canonico
// -----------------------------------------------------------------------

/**
 * Carrega canonicamente as 4 flags de perfil do titular RH autenticado.
 * Retorna `null` quando o registro nao existe (registro deletado entre
 * emissao do JWT e verificacao — sessao invalida; consumidor deve
 * redirecionar ao login).
 *
 * `hasDescendingChain`: TRUE quando existe ao menos 1 liderado direto
 * ativo (via `employeeLeaderHistory` com `dataFim IS NULL`) que tambem
 * e lider ATIVO (`employees.isLider = true AND employees.status =
 * 'ativo'`). Regra canonica de RH-Lider Cenario 2 §5.5.
 */
export async function loadRhSessionFlags(
  db: RoipDatabase,
  userId: number,
): Promise<RhSessionFlags | null> {
  const rows = await db
    .select({
      isRH: employees.isRH,
      isLider: employees.isLider,
      isResponsavelFinanceiro: employees.isResponsavelFinanceiro,
    })
    .from(employees)
    .where(eq(employees.id, userId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  const chainRows = await db
    .select({ id: employees.id })
    .from(employeeLeaderHistory)
    .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
    .where(
      and(
        eq(employeeLeaderHistory.liderId, userId),
        isNull(employeeLeaderHistory.dataFim),
        eq(employees.isLider, true),
        eq(employees.status, 'ativo'),
      ),
    )
    .limit(1);
  return {
    isRH: row.isRH === true,
    isLider: row.isLider === true,
    isResponsavelFinanceiro: row.isResponsavelFinanceiro === true,
    hasDescendingChain: chainRows.length > 0,
  };
}
