// ROIP APP 9BOX — régua de cobertura da matriz de rotas (bateria de
// segurança cross-company e autorização cruzada, Etapa 0, item 2).
//
// Enumera todo `page.tsx` de `src/app`, converte `[param]` em `:param`
// e exige que cada rota não pública resolva para uma `RouteRule` em
// `findRouteRule`. Antes desta ME seis rotas reais ficavam fora da
// matriz — o middleware as liberava com `next()` ou, para
// `/colaborador/:id/*`, como públicas pelo prefixo do portal.
//
// RV-03: provada nos dois sentidos — o mesmo enumerador, aplicado à
// matriz sem as seis regras, reprova (ver `it` de defeito injetado).
// RV-14: um statement por linha, 100 colunas.

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  findRouteRule,
  isPublicRoute,
  ROUTE_MATRIX,
  type RouteRule,
} from '../../src/lib/routes/matrix';

const APP_ROOT = join(process.cwd(), 'src', 'app');

/** Rotas públicas por desenho (§10.1): login, portal por token, access-denied. */
const PUBLIC_PAGE_ROUTES: readonly string[] = [
  '/',
  '/access-denied',
  '/login-super-admin',
  '/colaborador',
  '/colaborador/gate-lgpd',
  '/colaborador/pendencias',
  '/colaborador/responder/auto-avaliacao',
  '/colaborador/responder/lideranca-direta',
  '/colaborador/responder/perfil-individual',
  '/colaborador/responder/radar-nr1',
];

/** Rotas que esta ME trouxe para a matriz (defeito injetado as remove). */
const ROTAS_NOVAS_NA_MATRIZ: readonly string[] = [
  '/colaborador/:employeeId/editar',
  '/colaborador/:employeeId/desligamento',
  '/dashboard-individual/clevel/:cLevelId',
  '/dashboard-recorte/:tipo/:alvo',
  '/meu-portal/:instrumento',
  '/super-admin/logs',
];

function listPageRoutes(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listPageRoutes(full, acc);
      continue;
    }
    if (entry !== 'page.tsx') {
      continue;
    }
    const rel = relative(APP_ROOT, dir).split('\\').join('/');
    const route = rel.length === 0 ? '/' : `/${rel}`;
    acc.push(route.replace(/\[([^\]]+)\]/g, ':$1'));
  }
  return acc;
}

/** Instancia um pathname concreto a partir do pattern (`:x` → `1`). */
function concreto(pattern: string): string {
  return pattern.replace(/:[A-Za-z]+/g, '1');
}

/** Mesma resolução de `findRouteRule`, sobre uma matriz arbitrária (RV-03). */
function resolveEm(matriz: readonly RouteRule[], pathname: string): RouteRule | null {
  for (const rule of matriz) {
    if (rule.matchPrefix === true && pathname.startsWith(rule.pattern)) {
      return rule;
    }
  }
  const segs = pathname.split('/');
  for (const rule of matriz) {
    if (rule.matchPrefix === true) continue;
    const pat = rule.pattern.split('/');
    if (pat.length !== segs.length) continue;
    const casa = pat.every((p, i) => (p.startsWith(':') ? segs[i]!.length > 0 : p === segs[i]));
    if (casa) return rule;
  }
  return null;
}

describe('matriz de rotas — cobertura de todo page.tsx (bateria de segurança)', () => {
  const rotas = listPageRoutes(APP_ROOT, []).sort();

  it('enumera as rotas reais de src/app (sanidade)', () => {
    expect(rotas.length).toBeGreaterThan(60);
    expect(rotas).toContain('/painel-rh');
    expect(rotas).toContain('/colaborador/:employeeId/editar');
  });

  it('toda rota não pública resolve para uma regra da matriz (caso bom → verde)', () => {
    const semRegra = rotas.filter((r) => {
      if (PUBLIC_PAGE_ROUTES.includes(r)) return false;
      return findRouteRule(concreto(r)) === null;
    });
    expect(semRegra).toEqual([]);
  });

  it('nenhuma rota não pública escapa pelo prefixo público do portal', () => {
    const vazando = rotas.filter((r) => {
      if (PUBLIC_PAGE_ROUTES.includes(r)) return false;
      const path = concreto(r);
      return findRouteRule(path) === null && isPublicRoute(path);
    });
    expect(vazando).toEqual([]);
  });

  it('defeito injetado: sem as seis regras novas, a régua reprova (RV-03)', () => {
    const matrizAntiga = ROUTE_MATRIX.filter((r) => !ROTAS_NOVAS_NA_MATRIZ.includes(r.pattern));
    const semRegra = rotas.filter((r) => {
      if (PUBLIC_PAGE_ROUTES.includes(r)) return false;
      return resolveEm(matrizAntiga, concreto(r)) === null;
    });
    expect(semRegra.length).toBeGreaterThanOrEqual(9);
    expect(semRegra).toContain('/colaborador/:employeeId/editar');
    expect(semRegra).toContain('/super-admin/logs');
  });

  it('as seis regras novas decidem por perfil como a especificação manda', () => {
    const editar = findRouteRule('/colaborador/7/editar');
    expect(editar?.pattern).toBe('/colaborador/:employeeId/editar');
    expect(editar?.byRole.rh).toBe('allow');
    expect(editar?.byRole.lider).toBe('deny');
    expect(editar?.byRole.clevel).toBe('deny');
    expect(editar?.byRole.super_admin).toBe('redirect_painel');

    const clevel = findRouteRule('/dashboard-individual/clevel/3');
    expect(clevel?.pattern).toBe('/dashboard-individual/clevel/:cLevelId');
    expect(clevel?.byRole.super_admin).toBe('allow');
    expect(clevel?.byRole.rh).toBe('deny');

    const recorte = findRouteRule('/dashboard-recorte/departamento/Comercial');
    expect(recorte?.byRole.lider).toBe('allow');
    expect(recorte?.byRole.super_admin).toBe('redirect_painel');

    const portal = findRouteRule('/meu-portal/radar-nr1');
    expect(portal?.pattern).toBe('/meu-portal/:instrumento');
    expect(portal?.byRole.lider).toBe('allow');

    const logs = findRouteRule('/super-admin/logs');
    expect(logs?.byRole.super_admin).toBe('allow');
    expect(logs?.byRole.rh_lider).toBe('deny');
  });

  it('as rotas públicas do portal continuam públicas e sem regra', () => {
    for (const r of ['/colaborador/responder/radar-nr1', '/colaborador/pendencias']) {
      expect(findRouteRule(r)).toBeNull();
      expect(isPublicRoute(r)).toBe(true);
    }
  });
});
