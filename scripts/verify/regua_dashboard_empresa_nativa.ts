// ROIP APP 9BOX — régua RV-03 da ME §8.06 (dashboard da empresa nativo).
//
// Mede o produto contra o canônico (ESPEC §8 + DOC 02 §3.3/§10.4 linha
// 853): o agregado da empresa é de escopo total (RH, RH-Líder, C-level
// total); perfil restrito (líder, C-level restrito) não o alcança. E o
// nó da empresa vira botão real quando recebe `empresaDashboardHref`.
//
// Provada nos dois sentidos: código conforme → exit 0; defeito injetado
// em `canViewCompanyAggregate` (liberar escopo restrito) → falha no check
// "escopo restrito negado" → exit 1.

import {
  canViewCompanyAggregate,
  NATIVE_EMPRESA_DASHBOARD_HREF,
} from '../../src/lib/scope/companyAggregateAccess';
import {
  resolveDrawerDashboardAction,
  type DrawerDashboardAction,
} from '../../src/app/super-admin/empresa/[id]/organograma/internals';
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

function main(): void {
  console.log('RÉGUA ME §8.06 — dashboard da empresa nativo (acesso + botão)');

  // Acesso ao agregado da empresa (§8 + §10.4 linha 853).
  check('escopo total (null) liberado', canViewCompanyAggregate(null) === true);
  check(
    'escopo restrito (cadeia) negado',
    canViewCompanyAggregate(new Set(['clevel-1', 'employee-10'])) === false,
  );
  check('escopo restrito vazio negado', canViewCompanyAggregate(new Set()) === false);

  // Fiação do botão do nó da empresa (§8.06.4 reutilizado).
  const empresa = node('empresa', 1, 'empresa', '', [node('clevel', 1, 'clevel-1', 'Diretoria')]);
  const comHref: DrawerDashboardAction = resolveDrawerDashboardAction(
    empresa,
    false,
    NATIVE_EMPRESA_DASHBOARD_HREF,
  );
  check(
    'nó da empresa com href → empresa-dashboard /dashboard-empresa',
    comHref.kind === 'empresa-dashboard' && comHref.href === '/dashboard-empresa',
  );
  const semHref: DrawerDashboardAction = resolveDrawerDashboardAction(empresa, false, null);
  check('nó da empresa sem href → indisponível', semHref.kind === 'unavailable');

  console.log('');
  if (falhas > 0) {
    console.log(`RÉGUA REPROVADA: ${falhas} check(s) falharam`);
    process.exit(1);
  }
  console.log('RÉGUA APROVADA: todos os checks passaram');
  process.exit(0);
}

main();
