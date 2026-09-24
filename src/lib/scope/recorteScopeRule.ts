// ROIP APP 9BOX — regra pura única de escopo de recorte (ME §8.06.6c, D5).
//
// Extrai o núcleo da decisão PC1h para departamentos: um conjunto de
// employees está integralmente dentro do escopo hierárquico do usuário.
// Consumida pelo servidor (`recorteAccess.canAccessRecorte`, branch
// departamento) e pelo cliente do organograma analítico
// (`internals.isDepartamentoAcessivel`), garantindo régua única (RV-14) —
// nunca duas cópias da mesma decisão de autorização.
//
// Semântica bit-a-bit idêntica ao branch original de `canAccessRecorte`
// (§8.06.6b): cada id de employee do recorte precisa estar no escopo, com
// o id de nó no formato `employee-N`. O guarda de recorte vazio
// (departamento sem membros) fica no callsite, pois cada superfície o
// interpreta no seu contexto (servidor: nega; cliente: esmaece).
//
// **RV-13.** Consumida por `recorteAccess.ts` + `internals.ts` (organograma)
// + teste unitário `me-8-06-6c`.
// **RV-14.** Um statement por linha, largura máxima 100 colunas.

/**
 * `true` sse TODOS os `employeeIds` pertencem ao escopo (`scope` contém o
 * nó `employee-<id>` de cada um). Conjunto vazio retorna `true`
 * (vacuamente); o guarda de recorte vazio é responsabilidade do callsite.
 */
export function everyEmployeeInScope(
  employeeIds: readonly number[],
  scope: ReadonlySet<string>,
): boolean {
  return employeeIds.every((id) => scope.has(`employee-${id}`));
}
