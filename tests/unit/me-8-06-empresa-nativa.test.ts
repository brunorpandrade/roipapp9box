// ROIP APP 9BOX — teste unit ME §8.06 (dashboard da empresa nativo).
//
// Cobre a régua única `canViewCompanyAggregate` (guard da rota nativa +
// decisão de href do organograma) e a fiação do botão do nó da empresa
// em `resolveDrawerDashboardAction` (href presente → botão real; href
// nulo → indisponível/diferido). ESPEC §8 + DOC 02 §3.3/§10.4 linha 853.

import { describe, expect, it } from 'vitest';

import {
  canViewCompanyAggregate,
  NATIVE_EMPRESA_DASHBOARD_HREF,
} from '../../src/lib/scope/companyAggregateAccess';
import {
  resolveDrawerDashboardAction,
  type DrawerDashboardAction,
} from '../../src/app/super-admin/empresa/[id]/organograma/internals';
import type { OrgTreeNode, OrgTreeNodeType } from '../../src/server/services/orgTree';

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

describe('ME §8.06 — canViewCompanyAggregate (régua única do agregado da empresa)', () => {
  it('escopo total (null) tem direito ao agregado da empresa', () => {
    expect(canViewCompanyAggregate(null)).toBe(true);
  });

  it('escopo restrito (Set com cadeia) não tem direito ao agregado', () => {
    expect(canViewCompanyAggregate(new Set(['clevel-1', 'employee-10']))).toBe(false);
  });

  it('escopo restrito vazio também não tem direito', () => {
    expect(canViewCompanyAggregate(new Set())).toBe(false);
  });
});

describe('ME §8.06 — nó da empresa: botão real quando há empresaDashboardHref', () => {
  const empresa = node('empresa', 1, 'empresa', '', [node('clevel', 1, 'clevel-1', 'Diretoria')]);

  it('com href passado → ação empresa-dashboard com o href da rota nativa', () => {
    const acao: DrawerDashboardAction = resolveDrawerDashboardAction(
      empresa,
      false,
      NATIVE_EMPRESA_DASHBOARD_HREF,
    );
    expect(acao.kind).toBe('empresa-dashboard');
    if (acao.kind === 'empresa-dashboard') {
      expect(acao.href).toBe('/dashboard-empresa');
    }
  });

  it('sem href (null) → indisponível (botão diferido no cliente)', () => {
    const acao: DrawerDashboardAction = resolveDrawerDashboardAction(empresa, false, null);
    expect(acao.kind).toBe('unavailable');
  });
});
