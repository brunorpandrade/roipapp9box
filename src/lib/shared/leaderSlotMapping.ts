// ROIP APP 9BOX — slot mapping canonico da tabela do lider
// (ME-B9.8-PATCH1).
//
// Fonte canonica unica para traduzir `variaveis` 0-based do backend em 4
// slots visuais (Meta 1..Meta 4) da tabela `/dados-mensais/meus-liderados`
// (DOC 05 §14.14). Antes vivia inline em `MeusLideradosClient.tsx` com
// off-by-one (`v.variableIndex - 1`) que descartava `variableIndex=0` e
// deslocava as demais variaveis em -1 slot. Bug detectado em 06/10/2026
// no fechamento operacional da Embrastec, apos Bruno configurar a familia
// `vendas_comercial` via UI canonica e observar que a Variavel 1 ("Receita
// gerada") nao aparecia na tela do lider e os slots Meta 2 / Meta 3 /
// Meta 4 mostravam, respectivamente, Variavel 2 / Variavel 3 / vazio.
//
// Regra canonica — `variableIndex` 0-based (todas as fontes do backend
// convergem):
//   - `FAMILIAS_HARDCODED` (`src/app/super-admin/empresa/[id]/familias/
//     internals.ts`): defaults `variableIndex: 0, 1, 2, 3`.
//   - `saveJobFamilyAction` + router `company.updateJobFamilies` validam
//     `indices === {0, 1, 2, 3}`.
//   - Seed Nativa `deriveCompanyJobFamilies` + `deriveNativaEmployeeGoals`:
//     `for (let i = 0; i < 4; i++) ... variableIndex: i`.
//   - Schema `employeeGoals` com comentario explicito `// 0..3`.
//   - Proc `monthlyData.getMonthlyInputForm(aba='lider')` retorna
//     `variaveis` ordenadas por `variableIndex ASC`, com valores 0..3.
//
// Mapeamento canonico:
//   variableIndex=0 -> slot[0] (coluna "Meta 1" na UI)
//   variableIndex=1 -> slot[1] (coluna "Meta 2" na UI)
//   variableIndex=2 -> slot[2] (coluna "Meta 3" na UI)
//   variableIndex=3 -> slot[3] (coluna "Meta 4" na UI)
//
// Variaveis com `variableIndex` fora de [0, LEADER_SLOT_COUNT - 1] sao
// descartadas silenciosamente (defense-in-depth; o backend ja garante
// 0..3, mas a UI nao deve quebrar se dado invalido chegar).
//
// Chamador exclusivo: `src/components/dados-mensais/MeusLideradosClient.tsx`
// (sub-funcao `renderRow`). Teste de regressao:
// `tests/unit/leader-slot-mapping.test.ts`.
//
// **RV-12.** Funcao pura — nenhum acesso a `db`, routers, services ou
// qualquer modulo com side-effects. Pode ser importada livremente por
// client components (CC071).
// **RV-13.** Export consumido pelo client + teste unitario na mesma ME.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/** Numero canonico de slots visuais da tabela do lider (DOC 05 §14.14). */
export const LEADER_SLOT_COUNT = 4 as const;

/**
 * Mapeia variaveis 0-based do backend para os 4 slots visuais da UI
 * `/dados-mensais/meus-liderados`. Retorna sempre array de tamanho
 * exatamente `LEADER_SLOT_COUNT`, com `null` em slots nao preenchidos.
 *
 * @param variaveis - lista do backend com `variableIndex` canonico 0..3.
 * @returns array de 4 posicoes `[slot0, slot1, slot2, slot3]`.
 */
export function buildVariaveisPorSlot<T extends { readonly variableIndex: number }>(
  variaveis: readonly T[],
): Array<T | null> {
  const slots: Array<T | null> = [null, null, null, null];
  for (const v of variaveis) {
    const slot = v.variableIndex;
    if (slot >= 0 && slot < LEADER_SLOT_COUNT) {
      slots[slot] = v;
    }
  }
  return slots;
}
