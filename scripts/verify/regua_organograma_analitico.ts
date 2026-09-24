// ROIP APP 9BOX — régua de aceite do organograma analítico (ME §8.06.6c).
//
// Mede o PRODUTO (helpers de `internals.ts` + régua única
// `everyEmployeeInScope`) contra ESPEC_ORGANOGRAMAS §3/§5/§6/§8, sem
// banco. Prova RV-03 nos dois sentidos:
//   - Código conforme: todos os checks passam → exit 0.
//   - Defeito injetado (ex.: `buildAnalyticForest` incluindo C-levels, ou
//     `isDepartamentoAcessivel` liberando departamento parcial): ao menos
//     um check falha → exit 1.
//
// Uso: `npx tsx scripts/verify/regua_organograma_analitico.ts`.

import {
  analyticHasSubLeaders,
  analyticInternalChildren,
  analyticNodeKind,
  buildAnalyticForest,
  buildRecorteDepartamentoHref,
  buildRecorteLeaderHref,
  countChainDepartments,
  isDepartamentoAcessivel,
  resolveCLevelCrossover,
} from '../../src/app/super-admin/empresa/[id]/organograma/internals';
import { everyEmployeeInScope } from '../../src/lib/scope/recorteScopeRule';
import type { OrgTreeNode, OrgTreeNodeType } from '../../src/server/services/orgTree';

let falhas = 0;

function check(nome: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${nome}`);
    return;
  }
  falhas += 1;
  console.log(`  FAIL ${nome}`);
}

function node(
  type: OrgTreeNodeType,
  entityId: number,
  id: string,
  departamento: string,
  children: OrgTreeNode[] = [],
): OrgTreeNode {
  return {
    id,
    type,
    entityId,
    name: `Nome ${id}`,
    cargo: 'Cargo',
    departamento,
    photoUrl: null,
    numLideradosDiretos: children.length,
    children,
  };
}

function buildRoot(): OrgTreeNode {
  const e12 = node('operacional', 12, 'employee-12', 'Comercial');
  const e11 = node('lider', 11, 'employee-11', 'Comercial', [e12]);
  const e13 = node('operacional', 13, 'employee-13', 'Comercial');
  const e10 = node('lider', 10, 'employee-10', 'Comercial', [e11, e13]);
  const e21 = node('operacional', 21, 'employee-21', 'Marketing');
  const e20 = node('lider', 20, 'employee-20', 'Marketing', [e21]);
  const c1 = node('clevel', 1, 'clevel-1', 'Diretoria', [e10, e20]);
  return node('empresa', 1, 'empresa', '', [c1]);
}

function eqArr(a: readonly (string | number)[], b: readonly (string | number)[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function main(): void {
  console.log('régua organograma analítico (ME §8.06.6c)');
  const root = buildRoot();
  const c1 = root.children[0] as OrgTreeNode;
  const e10 = c1.children[0] as OrgTreeNode;
  const e11 = e10.children[0] as OrgTreeNode;
  const e13 = e10.children[1] as OrgTreeNode;

  // §6.1 — floresta.
  const forest = buildAnalyticForest(root);
  check(
    '§6.1 departamentos ordenados, sem C-level/empresa',
    eqArr(
      forest.map((d) => d.departamento),
      ['Comercial', 'Marketing'],
    ),
  );
  const comercial = forest.find((d) => d.departamento === 'Comercial');
  check(
    '§3 topos locais = primeira camada',
    eqArr(comercial?.localTops.map((n) => n.id) ?? [], ['employee-10']),
  );
  check(
    '§6 membros recursivos do departamento',
    eqArr(comercial?.memberEmployeeIds ?? [], [10, 11, 12, 13]),
  );

  // §3/§6.3 — drill.
  check(
    '§3 filhos internos só do departamento',
    eqArr(
      analyticInternalChildren(e10, 'Comercial').map((n) => n.id),
      ['employee-11', 'employee-13'],
    ),
  );
  check(
    '§6.3 líder vs folha',
    analyticNodeKind(e10, 'Comercial') === 'lider' &&
      analyticNodeKind(e13, 'Comercial') === 'folha',
  );
  check(
    '§6.4 líder de líderes vs líder folha',
    analyticHasSubLeaders(e10, 'Comercial') && !analyticHasSubLeaders(e11, 'Comercial'),
  );

  // §8 / D5 — escopo de departamento.
  const idsC = [10, 11, 12, 13];
  check('§8 escopo nulo libera', isDepartamentoAcessivel(idsC, null));
  check(
    '§8 cadeia completa acessível',
    isDepartamentoAcessivel(idsC, new Set(idsC.map((i) => `employee-${i}`))),
  );
  check('§8 cadeia parcial inacessível', !isDepartamentoAcessivel(idsC, new Set(['employee-10'])));
  check(
    'D5 régua única everyEmployeeInScope',
    everyEmployeeInScope([10, 11], new Set(['employee-10', 'employee-11'])) &&
      !everyEmployeeInScope([10, 99], new Set(['employee-10'])),
  );

  // D3 — hrefs.
  check(
    'D3 href departamento encodado',
    buildRecorteDepartamentoHref('/dashboard-recorte', 'Atendimento ao Cliente') ===
      '/dashboard-recorte/departamento/Atendimento%20ao%20Cliente',
  );
  check(
    'D3 href líder por base de rota',
    buildRecorteLeaderHref('/x', 'cadeia', 'clevel-3') === '/x/cadeia/clevel-3',
  );

  // §5 — crossover.
  check('§5 conta departamentos da cadeia', countChainDepartments(c1) === 2);
  const cross = resolveCLevelCrossover(c1, true, '/dashboard-recorte');
  check(
    '§5 crossover para escopo total + ≥2 deptos',
    cross.kind === 'crossover' && cross.href === '/dashboard-recorte/cadeia/clevel-1',
  );
  check(
    '§5 sem crossover para escopo restrito',
    resolveCLevelCrossover(c1, false, '/dashboard-recorte').kind === 'none',
  );
  const c2 = node('clevel', 2, 'clevel-2', 'Diretoria', [
    node('lider', 30, 'employee-30', 'Financeiro'),
  ]);
  check(
    '§5 sem crossover com um só departamento',
    resolveCLevelCrossover(c2, true, '/dashboard-recorte').kind === 'none',
  );

  console.log('');
  if (falhas > 0) {
    console.log(`RÉGUA REPROVADA: ${falhas} check(s) falharam`);
    process.exit(1);
  }
  console.log('RÉGUA APROVADA: todos os checks passaram');
  process.exit(0);
}

main();
