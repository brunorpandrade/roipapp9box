// ROIP APP 9BOX — ME §8.06.3 — organograma estrutural: ação do drawer por
// tipo de nó (§14.9 S518 / ESPEC §5). Teste puro (sem banco).
//
// Prova a decisão do drawer: nó `operacional` e nó `lider` abrem o
// dashboard individual da própria pessoa (S518, via `entityId`); nó
// `clevel` abre o Perfil só para o Super Admin (D-ENTRY-2); nó da empresa
// e C-level sem acesso ao Perfil ficam indisponíveis.

import { describe, expect, it } from 'vitest';

import {
  resolveDrawerDashboardAction,
  type DrawerDashboardAction,
} from '../../src/app/super-admin/empresa/[id]/organograma/internals';
import type { OrgTreeNode, OrgTreeNodeType } from '../../src/server/services/orgTree';

function node(type: OrgTreeNodeType, entityId: number, id: string): OrgTreeNode {
  return {
    id,
    type,
    entityId,
    name: 'Fulano de Tal',
    cargo: 'Cargo',
    departamento: 'Comercial',
    photoUrl: null,
    numLideradosDiretos: type === 'lider' ? 3 : 0,
    children: [],
  };
}

describe('ME §8.06.3 — resolveDrawerDashboardAction (§14.9 S518)', () => {
  it('nó operacional abre o dashboard individual (entityId)', () => {
    const r = resolveDrawerDashboardAction(node('operacional', 42, 'employee-42'), false);
    expect(r).toEqual<DrawerDashboardAction>({ kind: 'individual', employeeId: 42 });
  });

  it('nó de líder abre o dashboard individual do próprio líder (S518)', () => {
    const r = resolveDrawerDashboardAction(node('lider', 7, 'employee-7'), false);
    expect(r).toEqual<DrawerDashboardAction>({ kind: 'individual', employeeId: 7 });
  });

  it('nó C-level abre o Perfil apenas para quem tem acesso (Bruno)', () => {
    const r = resolveDrawerDashboardAction(node('clevel', 3, 'clevel-3'), true);
    expect(r).toEqual<DrawerDashboardAction>({ kind: 'perfil-clevel', cLevelId: 3 });
  });

  it('nó C-level sem acesso ao Perfil fica indisponível', () => {
    const r = resolveDrawerDashboardAction(node('clevel', 3, 'clevel-3'), false);
    expect(r).toEqual<DrawerDashboardAction>({ kind: 'unavailable' });
  });

  it('nó da empresa fica indisponível (agregado vem depois)', () => {
    const r = resolveDrawerDashboardAction(node('empresa', 1, 'empresa'), true);
    expect(r).toEqual<DrawerDashboardAction>({ kind: 'unavailable' });
  });
});
