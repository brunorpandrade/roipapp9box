// ROIP APP 9BOX — zona de cor da % folha sobre faturamento (ESPEC §11.1).
// Card exclusivo do dashboard da empresa. A referência é o limite superior
// da faixa saudável do cadastro (companies.folhaPercMaxima):
//   - <= limite superior (abaixo ou dentro da faixa): verde;
//   - acima do limite superior até +20% do limite (× 1,20): amarelo;
//   - acima de +20% do limite: vermelho.
// Faixa não configurada (limite superior nulo) ou valor nulo: neutro.
//
// **RV-13.** Consumido por `EmpresaDashboardClient` (card % folha) +
// régua + teste unit. **RV-14.** 100 colunas.

export type ZonaFolha = 'verde' | 'amarelo' | 'vermelho' | 'neutro';

/**
 * Classifica a % folha sobre faturamento nas quatro zonas da §11.1,
 * tomando o limite superior da faixa saudável como referência.
 */
export function zonaFolhaPercentual(pct: number | null, folhaPercMaxima: number | null): ZonaFolha {
  if (pct === null || folhaPercMaxima === null) {
    return 'neutro';
  }
  if (pct <= folhaPercMaxima) {
    return 'verde';
  }
  if (pct <= folhaPercMaxima * 1.2) {
    return 'amarelo';
  }
  return 'vermelho';
}
