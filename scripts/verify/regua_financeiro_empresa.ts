// ROIP APP 9BOX — régua RV-03 da ME §8.06.2 (financeiro da empresa).
//
// Mede a zona de cor da % folha sobre faturamento contra o canônico
// (ESPEC §11.1): verde até o limite superior; amarelo até +20% do limite;
// vermelho acima; neutro sem faixa ou sem valor.
//
// Provada nos dois sentidos: código conforme → exit 0; defeito injetado
// em `zonaFolhaPercentual` (ex.: remover a zona amarela) → falha → exit 1.

import { zonaFolhaPercentual } from '../../src/lib/folhaFaturamento';

let falhas = 0;

function check(nome: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${nome}`);
    return;
  }
  falhas += 1;
  console.log(`  FAIL ${nome}`);
}

function main(): void {
  console.log('RÉGUA ME §8.06.2 — zona de cor da % folha (§11.1)');
  check('dentro da faixa é verde', zonaFolhaPercentual(25, 30) === 'verde');
  check('no limite superior é verde', zonaFolhaPercentual(30, 30) === 'verde');
  check('abaixo do limite inferior é verde', zonaFolhaPercentual(15, 30) === 'verde');
  check('acima do limite até +20% é amarelo', zonaFolhaPercentual(33, 30) === 'amarelo');
  check('no +20% do limite é amarelo', zonaFolhaPercentual(36, 30) === 'amarelo');
  check('acima de +20% é vermelho', zonaFolhaPercentual(37, 30) === 'vermelho');
  check('valor nulo é neutro', zonaFolhaPercentual(null, 30) === 'neutro');
  check('faixa não configurada é neutro', zonaFolhaPercentual(25, null) === 'neutro');

  console.log('');
  if (falhas > 0) {
    console.log(`RÉGUA REPROVADA: ${falhas} check(s) falharam`);
    process.exit(1);
  }
  console.log('RÉGUA APROVADA: todos os checks passaram');
  process.exit(0);
}

main();
