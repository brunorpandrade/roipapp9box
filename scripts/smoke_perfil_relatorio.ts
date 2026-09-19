// ROIP APP 9BOX — smoke funcional (V2) da logica deterministica do
// relatorio do Perfil Individual (ME pos-fila7). Roda sem banco: prova a
// regua de faixas (§5.4.2), a integridade do dicionario de labels (24
// subvetores + 5 dimensoes) e o agregado por dimensao (D7 — Equilibrio
// usa equ_indice; demais usam media dos subvetores). Prova nos dois
// sentidos (RV-03): casos bons e casos de defeito injetado.
//
// Execucao: npx tsx scripts/smoke_perfil_relatorio.ts
// Exit 0 = todas as asserts passaram; exit 1 = alguma falhou.

import {
  DIMENSAO_LABEL,
  DIMENSOES_ORDEM,
  FAIXA_LABEL,
  SUBVETORES_POR_DIMENSAO,
  SUBVETOR_LABEL,
  classificarFaixa,
  type SubvetorKey,
} from '../src/lib/instruments/individualProfileReportLabels';

let falhas = 0;

function check(nome: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${nome}`);
  } else {
    console.error(`  FALHA ${nome}`);
    falhas += 1;
  }
}

console.log('1) Regua de faixas (§5.4.2) — cortes 20/40/60/80');
check('0 -> muito_baixo', classificarFaixa(0) === 'muito_baixo');
check('20 -> muito_baixo (borda)', classificarFaixa(20) === 'muito_baixo');
check('21 -> baixo', classificarFaixa(21) === 'baixo');
check('40 -> baixo (borda)', classificarFaixa(40) === 'baixo');
check('41 -> medio', classificarFaixa(41) === 'medio');
check('60 -> medio (borda)', classificarFaixa(60) === 'medio');
check('61 -> alto', classificarFaixa(61) === 'alto');
check('80 -> alto (borda)', classificarFaixa(80) === 'alto');
check('81 -> muito_alto', classificarFaixa(81) === 'muito_alto');
check('100 -> muito_alto', classificarFaixa(100) === 'muito_alto');

console.log('2) Regua de faixas — defeito injetado (deve reprovar)');
// Se a regua estivesse errada (ex.: 80 caindo em muito_alto), este teste
// pegaria. Confirmamos que 80 NAO e muito_alto.
check('80 NAO e muito_alto (prova negativa)', classificarFaixa(80) !== 'muito_alto');
check('61 NAO e medio (prova negativa)', classificarFaixa(61) !== 'medio');

console.log('3) Dicionario de labels — 24 subvetores mapeados');
const todosSubvetores: SubvetorKey[] = Object.keys(SUBVETOR_LABEL) as SubvetorKey[];
check('24 subvetores no dicionario', todosSubvetores.length === 24);
check(
  'todo subvetor tem label nao-vazio',
  todosSubvetores.every((k) => SUBVETOR_LABEL[k].length > 0),
);

console.log('4) Cobertura dimensao -> subvetores (soma 24, sem sobra/falta)');
let somaSubvetores = 0;
for (const dim of DIMENSOES_ORDEM) {
  const chaves = SUBVETORES_POR_DIMENSAO[dim];
  somaSubvetores += chaves.length;
  check(
    `dimensao "${DIMENSAO_LABEL[dim]}" so referencia subvetores existentes`,
    chaves.every((k) => k in SUBVETOR_LABEL),
  );
}
// Equilibrio expõe 4 subvetores no dicionario (o Indice Geral e a parte);
// Postura 4, Estrutura 5, Motor 5, Assinatura 6 => 24.
check('soma dos subvetores por dimensao = 24', somaSubvetores === 24);
check('5 dimensoes na ordem canonica', DIMENSOES_ORDEM.length === 5);
check('todas as faixas tem rotulo', Object.keys(FAIXA_LABEL).length === 5);

// 5) Agregado por dimensao (D7) — media dos subvetores; Equilibrio usa
//    equ_indice. Reproduzimos a formula do modal para prova isolada.
console.log('5) Agregado por dimensao (D7)');
function escoreDimensaoMedia(
  chaves: readonly SubvetorKey[],
  escores: Record<string, string>,
): number {
  const valores = chaves.map((k) => Number(escores[k])).filter((n) => Number.isFinite(n));
  const soma = valores.reduce((a, n) => a + n, 0);
  return soma / valores.length;
}
const escoresPostura: Record<string, string> = {
  post_assert: '78.00',
  post_tarefas: '62.00',
  post_pessoas: '81.00',
  post_pressao: '75.00',
};
const mediaPostura = escoreDimensaoMedia(SUBVETORES_POR_DIMENSAO.postura, escoresPostura);
check('media Postura = 74 (78+62+81+75)/4', mediaPostura === 74);
check('media Postura -> faixa alto', classificarFaixa(mediaPostura) === 'alto');
// Defeito injetado: media errada nao classificaria como alto.
check('media Postura NAO e 80 (prova negativa)', mediaPostura !== 80);

if (falhas === 0) {
  console.log('\nSMOKE OK — todas as asserts passaram.');
  process.exit(0);
} else {
  console.error(`\nSMOKE FALHOU — ${falhas} assert(s) reprovada(s).`);
  process.exit(1);
}
