// ROIP APP 9BOX — ME §8.06.6c — organograma analítico: derivação da
// floresta por departamento, drill interno, escopo de departamento (D5),
// hrefs de recorte (D3) e crossover do C-level (D4). Teste puro (sem
// banco). Origem: ESPEC_ORGANOGRAMAS §3/§5/§6/§8.

import { describe, expect, it } from 'vitest';

import {
  RECORTE_BASE_PATH_NATIVA,
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

// C-level comandando dois departamentos (Comercial + Marketing).
// Comercial: líder de líderes (10) → líder folha (11) → folha (12) + folha
// direta (13). Marketing: líder folha (20) → folha (21).
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

describe('ME §8.06.6c — everyEmployeeInScope (régua única D5)', () => {
  it('true quando todos os ids estão no escopo', () => {
    const scope = new Set(['employee-10', 'employee-11']);
    expect(everyEmployeeInScope([10, 11], scope)).toBe(true);
  });

  it('false quando ao menos um id está fora do escopo', () => {
    const scope = new Set(['employee-10', 'employee-11']);
    expect(everyEmployeeInScope([10, 99], scope)).toBe(false);
  });

  it('true vacuamente para conjunto vazio (guarda fica no callsite)', () => {
    expect(everyEmployeeInScope([], new Set())).toBe(true);
  });
});

describe('ME §8.06.6c — buildAnalyticForest (ESPEC §6.1)', () => {
  it('deriva departamentos ordenados, sem C-level nem empresa', () => {
    const forest = buildAnalyticForest(buildRoot());
    expect(forest.map((d) => d.departamento)).toEqual(['Comercial', 'Marketing']);
  });

  it('topos locais são a primeira camada do departamento (§3)', () => {
    const forest = buildAnalyticForest(buildRoot());
    const comercial = forest.find((d) => d.departamento === 'Comercial');
    expect(comercial?.localTops.map((n) => n.id)).toEqual(['employee-10']);
  });

  it('reúne todos os membros do departamento (recursivo)', () => {
    const forest = buildAnalyticForest(buildRoot());
    const comercial = forest.find((d) => d.departamento === 'Comercial');
    expect(comercial?.memberEmployeeIds).toEqual([10, 11, 12, 13]);
  });
});

describe('ME §8.06.6c — drill interno (ESPEC §3/§6.3)', () => {
  it('filhos internos só do próprio departamento', () => {
    const root = buildRoot();
    const c1 = root.children[0] as OrgTreeNode;
    const e10 = c1.children[0] as OrgTreeNode;
    const internos = analyticInternalChildren(e10, 'Comercial');
    expect(internos.map((n) => n.id)).toEqual(['employee-11', 'employee-13']);
  });

  it('classifica líder (tem filhos internos) e folha', () => {
    const root = buildRoot();
    const c1 = root.children[0] as OrgTreeNode;
    const e10 = c1.children[0] as OrgTreeNode;
    const e13 = e10.children[1] as OrgTreeNode;
    expect(analyticNodeKind(e10, 'Comercial')).toBe('lider');
    expect(analyticNodeKind(e13, 'Comercial')).toBe('folha');
  });

  it('distingue líder de líderes (sub-líderes) de líder folha', () => {
    const root = buildRoot();
    const c1 = root.children[0] as OrgTreeNode;
    const e10 = c1.children[0] as OrgTreeNode;
    const e11 = e10.children[0] as OrgTreeNode;
    expect(analyticHasSubLeaders(e10, 'Comercial')).toBe(true);
    expect(analyticHasSubLeaders(e11, 'Comercial')).toBe(false);
  });
});

describe('ME §8.06.6c — isDepartamentoAcessivel (D5)', () => {
  const ids = [10, 11, 12, 13];

  it('escopo nulo libera qualquer departamento', () => {
    expect(isDepartamentoAcessivel(ids, null)).toBe(true);
  });

  it('acessível quando todos os membros estão na cadeia', () => {
    const scope = new Set(ids.map((i) => `employee-${i}`));
    expect(isDepartamentoAcessivel(ids, scope)).toBe(true);
  });

  it('inacessível quando um membro está fora da cadeia', () => {
    const scope = new Set(['employee-10']);
    expect(isDepartamentoAcessivel(ids, scope)).toBe(false);
  });

  it('departamento vazio é inacessível a escopo restrito', () => {
    expect(isDepartamentoAcessivel([], new Set(['employee-10']))).toBe(false);
  });
});

describe('ME §8.06.6c — hrefs de recorte (D3)', () => {
  it('base nativa é /dashboard-recorte', () => {
    expect(RECORTE_BASE_PATH_NATIVA).toBe('/dashboard-recorte');
  });

  it('departamento com espaço é encodado no path', () => {
    const href = buildRecorteDepartamentoHref(RECORTE_BASE_PATH_NATIVA, 'Atendimento ao Cliente');
    expect(href).toBe('/dashboard-recorte/departamento/Atendimento%20ao%20Cliente');
  });

  it('líder por equipe e por cadeia respeita a base de rota', () => {
    const base = '/super-admin/empresa/2/dashboard-recorte';
    expect(buildRecorteLeaderHref(base, 'equipe', 'employee-7')).toBe(`${base}/equipe/employee-7`);
    expect(buildRecorteLeaderHref(base, 'cadeia', 'clevel-3')).toBe(`${base}/cadeia/clevel-3`);
  });
});

describe('ME §8.06.6c/6d — crossover do C-level (ESPEC §5)', () => {
  it('conta departamentos distintos da cadeia do C-level', () => {
    const root = buildRoot();
    const c1 = root.children[0] as OrgTreeNode;
    expect(countChainDepartments(c1)).toBe(2);
  });

  it('crossover para escopo total + dois ou mais departamentos', () => {
    const root = buildRoot();
    const c1 = root.children[0] as OrgTreeNode;
    const r = resolveCLevelCrossover(c1, true, '/dashboard-recorte');
    expect(r).toEqual({ kind: 'crossover', href: '/dashboard-recorte/cadeia/clevel-1' });
  });

  it('sem crossover para observador de escopo restrito', () => {
    const root = buildRoot();
    const c1 = root.children[0] as OrgTreeNode;
    expect(resolveCLevelCrossover(c1, false, '/dashboard-recorte')).toEqual({ kind: 'none' });
  });

  it('sem crossover quando o C-level comanda um só departamento', () => {
    const e30 = node('lider', 30, 'employee-30', 'Financeiro');
    const c2 = node('clevel', 2, 'clevel-2', 'Diretoria', [e30]);
    expect(resolveCLevelCrossover(c2, true, '/dashboard-recorte')).toEqual({ kind: 'none' });
  });

  it('nó que não é C-level nunca tem crossover', () => {
    const e10 = node('lider', 10, 'employee-10', 'Comercial');
    expect(resolveCLevelCrossover(e10, true, '/dashboard-recorte')).toEqual({ kind: 'none' });
  });
});
