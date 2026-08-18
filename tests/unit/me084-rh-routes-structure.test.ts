// ROIP APP 9BOX — teste de analise estatica ME-084 (Onda B — 3 rotas
// RH-facing novas).
//
// Cobre canonicamente bit-exact via leitura de arquivos:
//   1. `/todos-os-colaboradores` (RH) — 4 arquivos + callsite reutiliza
//      TodosColaboradoresClient com variant='rh' + hrefs base RH.
//   2. `/colaborador/novo` (RH) — 2 arquivos + callsite reutiliza
//      ColaboradorNovoClient com variant='rh' + 3 actions RH-facing.
//   3. `/colaborador/[employeeId]/editar` (RH) — 2 arquivos + callsite
//      reutiliza ColaboradorEditarClient com variant='rh' + bag das 13
//      actions RH-facing.
//   4. Helper canonico compartilhado `requireRHOrSuperAdmin` — assinatura
//      + narrowing de session.
//
// Nao depende de banco real. Cobre a arquitetura L123 dual-route
// canonizada em D-ME084-1/2/3 aprovadas em bloco por Bruno.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

function fileExists(rel: string): boolean {
  return existsSync(join(REPO_ROOT, rel));
}

describe('ME-084 — helper canonico compartilhado requireRHOrSuperAdmin', () => {
  const path = 'src/lib/routes/requireRHOrSuperAdmin.ts';

  it('helper existe em src/lib/routes/', () => {
    expect(fileExists(path)).toBe(true);
  });

  it('exporta tipo RHOrSuperAdminSession discriminado por kind', () => {
    const src = readSrc(path);
    expect(src).toContain('export type RHOrSuperAdminSession');
    expect(src).toContain("readonly kind: 'super_admin'");
    expect(src).toContain("readonly kind: 'platform'");
    expect(src).toContain("readonly role: 'rh' | 'rh_lider'");
  });

  it('exporta funcao requireRHOrSuperAdmin com assinatura canonica', () => {
    const src = readSrc(path);
    // Regex canonica bit-exact construida via fragmentos concatenados para
    // caber em <=100 cols (RV-14). Semantica preservada bit-exact.
    const sigParts = [
      'export function requireRHOrSuperAdmin\\(',
      '\\s*session:\\s*ServerSession\\s*\\|\\s*null,',
      '\\s*actionName:\\s*string,\\s*',
      '\\):\\s*RHOrSuperAdminSession',
    ];
    const RE_SIGNATURE = new RegExp(sigParts.join(''));
    expect(src).toMatch(RE_SIGNATURE);
  });

  it('aceita super_admin OU platform+role IN {rh, rh_lider}', () => {
    const src = readSrc(path);
    expect(src).toContain("session.kind === 'super_admin'");
    expect(src).toContain("session.kind === 'platform'");
    expect(src).toMatch(/session\.role === 'rh' \|\| session\.role === 'rh_lider'/);
  });
});

describe('ME-084 rota RH 1 — `/todos-os-colaboradores`', () => {
  const dir = 'src/app/todos-os-colaboradores';

  it('4 arquivos canonicos existem', () => {
    expect(fileExists(`${dir}/page.tsx`)).toBe(true);
    expect(fileExists(`${dir}/internals.ts`)).toBe(true);
    expect(fileExists(`${dir}/actions.ts`)).toBe(true);
    expect(fileExists(`${dir}/filters.ts`)).toBe(true);
  });

  it('filters.ts e re-export puro do super-admin', () => {
    const src = readSrc(`${dir}/filters.ts`);
    expect(src).toContain("from '../super-admin/empresa/[id]/todos-os-colaboradores/filters'");
    expect(src).toContain('BUSCA_MAX_LEN');
    expect(src).toContain('parseColaboradoresFiltersFromSearchParams');
    expect(src).toContain('colaboradoresFiltersToServiceInput');
  });

  it('internals.ts exporta loadTodosColaboradoresPageForRH', () => {
    const src = readSrc(`${dir}/internals.ts`);
    expect(src).toContain('export function resolveDatabaseUrl');
    expect(src).toContain('export interface TodosColaboradoresRHPageData');
    expect(src).toContain('export async function loadTodosColaboradoresPageForRH');
  });

  it('actions.ts usa requireRHOrSuperAdmin (nao requireSuperAdmin)', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).toContain(
      "import { requireRHOrSuperAdmin } from '../../lib/routes/requireRHOrSuperAdmin'",
    );
    expect(src).toContain('requireRHOrSuperAdmin(session,');
    expect(src).not.toContain('requireSuperAdmin(');
    expect(src).toContain('export async function listarColaboradoresRHAction');
  });

  it('actions.ts rejeita branch super_admin (canaliza para /super-admin)', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).toMatch(/authed\.kind === 'super_admin'/);
  });

  it('page.tsx guard defense-in-depth session.role != rh|rh_lider', () => {
    const src = readSrc(`${dir}/page.tsx`);
    expect(src).toMatch(/session\.role !== 'rh' && session\.role !== 'rh_lider'/);
    expect(src).toContain("redirect('/access-denied?rota=/todos-os-colaboradores')");
  });

  it('page.tsx reutiliza TodosColaboradoresClient bit-exact via shim + import cross-dir', () => {
    const src = readSrc(`${dir}/page.tsx`);
    // Import curto via shim local `_client` (RV-14 canonizada — Prettier
    // consolida imports single-identifier em uma linha).
    expect(src).toContain("from './_client'");
    // Shim re-exporta bit-exact do path canonico da rota super-admin.
    const shim = readSrc(`${dir}/_client.ts`);
    expect(shim).toContain(
      "'../super-admin/empresa/[id]/todos-os-colaboradores/TodosColaboradoresClient'",
    );
    expect(src).toMatch(/variant="rh"/);
    expect(src).toContain('novoColaboradorHref="/colaborador/novo"');
    expect(src).toContain('editarColaboradorHrefBase="/colaborador"');
    expect(src).toContain('refetchAction={listarColaboradoresRHAction}');
  });

  it('page.tsx escopa companyId por session (nao por params.id)', () => {
    const src = readSrc(`${dir}/page.tsx`);
    expect(src).toContain('const companyId = session.companyId;');
  });
});

describe('ME-084 rota RH 2 — `/colaborador/novo`', () => {
  const dir = 'src/app/colaborador/novo';

  it('2 arquivos canonicos existem', () => {
    expect(fileExists(`${dir}/page.tsx`)).toBe(true);
    expect(fileExists(`${dir}/actions.ts`)).toBe(true);
  });

  it('actions.ts exporta 3 actions RH-facing simetricas ao super-admin', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).toContain('export async function criarColaboradorRHAction');
    expect(src).toContain('export async function definirRFRHAction');
    expect(src).toContain('export async function pesquisarLiderCandidatosRHAction');
  });

  it('actions.ts usa requireRHOrSuperAdmin', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).toContain(
      "import { requireRHOrSuperAdmin } from '../../../lib/routes/requireRHOrSuperAdmin'",
    );
  });

  it('actions.ts injeta companyId canonico (never trust client)', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).toMatch(/inputWithCanonicalCompany\s*=\s*\{\s*\.\.\.input,\s*companyId\s*\}/);
  });

  it('page.tsx passa 3 actions RH + variant + hrefs base', () => {
    const src = readSrc(`${dir}/page.tsx`);
    expect(src).toContain('criarColaborador={criarColaboradorRHAction}');
    expect(src).toContain('definirRF={definirRFRHAction}');
    expect(src).toContain('pesquisarLiderCandidatos={pesquisarLiderCandidatosRHAction}');
    expect(src).toContain('variant="rh"');
    expect(src).toContain('todosColaboradoresHref="/todos-os-colaboradores"');
    expect(src).toContain('presetIsRH={false}');
  });

  it('page.tsx reutiliza ColaboradorNovoClient via shim + loader via import cross-dir', () => {
    const src = readSrc(`${dir}/page.tsx`);
    // Import curto via shim local `_client` (RV-14 canonizada).
    expect(src).toContain("from './_client'");
    const shim = readSrc(`${dir}/_client.ts`);
    expect(shim).toContain(
      "'../../super-admin/empresa/[id]/colaborador/novo/ColaboradorNovoClient'",
    );
    // Loader continua importado diretamente (path menor, cabe em 100 cols).
    expect(src).toContain("from '../../super-admin/empresa/[id]/colaborador/novo/internals'");
  });

  it('page.tsx nunca envia preset=rh (Bruno-exclusive DOC 02 §10.9 linha 864)', () => {
    const src = readSrc(`${dir}/page.tsx`);
    // Passa `null` explicito ao loader
    expect(src).toMatch(/loadColaboradorNovoPage\(client\.db,\s*companyId,\s*null\)/);
  });
});

describe('ME-084 rota RH 3 — `/colaborador/[employeeId]/editar`', () => {
  const dir = 'src/app/colaborador/[employeeId]/editar';

  it('2 arquivos canonicos existem', () => {
    expect(fileExists(`${dir}/page.tsx`)).toBe(true);
    expect(fileExists(`${dir}/actions.ts`)).toBe(true);
  });

  it('actions.ts exporta as 13 actions RH-facing bit-exact', () => {
    const src = readSrc(`${dir}/actions.ts`);
    for (const name of [
      'atualizarColaboradorRHAction',
      'buscarCandidatosTransferenciaRHAction',
      'definirRFEditarRHAction',
      'excluirColaboradorRHAction',
      'executarTransferenciaRHAction',
      'inativarColaboradorRHAction',
      'listarLideradosRHAction',
      'pesquisarLiderCandidatosEditarRHAction',
      'reativarColaboradorRHAction',
      'reatribuirLiderColaboradorRHAction',
      'regenerarMatriculaColaboradorRHAction',
      'regenerarSenhaColaboradorRHAction',
      'verificarInativacaoRHAction',
    ]) {
      expect(src).toContain(`export async function ${name}`);
    }
  });

  it('actions.ts usa requireRHOrSuperAdmin via helper requireRHSessionAndCompanyId', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).toContain(
      "import { requireRHOrSuperAdmin } from '../../../../lib/routes/requireRHOrSuperAdmin'",
    );
    expect(src).toContain('async function requireRHSessionAndCompanyId');
    // Helper e chamado por todas as 13 actions
    const matches = src.match(/await requireRHSessionAndCompanyId\(/g) ?? [];
    expect(matches.length).toBe(13);
  });

  it('actions.ts NAO usa requireSuperAdmin (canaliza para /super-admin em vez)', () => {
    const src = readSrc(`${dir}/actions.ts`);
    expect(src).not.toMatch(/\brequireSuperAdmin\(/);
  });

  it('page.tsx passa bag completa das 13 actions RH + variant + href', () => {
    const src = readSrc(`${dir}/page.tsx`);
    expect(src).toContain('variant="rh"');
    expect(src).toContain('todosColaboradoresHref="/todos-os-colaboradores"');
    expect(src).toContain('atualizarColaborador: atualizarColaboradorRHAction');
    expect(src).toContain('definirRFEditar: definirRFEditarRHAction');
    expect(src).toContain('excluirColaborador: excluirColaboradorRHAction');
    expect(src).toContain('executarTransferencia: executarTransferenciaRHAction');
    expect(src).toContain('inativarColaborador: inativarColaboradorRHAction');
    expect(src).toContain('listarLiderados: listarLideradosRHAction');
    expect(src).toContain('pesquisarLiderCandidatosEditar: pesquisarLiderCandidatosEditarRHAction');
    expect(src).toContain('reativarColaborador: reativarColaboradorRHAction');
    expect(src).toContain('reatribuirLiderColaborador: reatribuirLiderColaboradorRHAction');
    expect(src).toContain('regenerarMatriculaColaborador: regenerarMatriculaColaboradorRHAction');
    expect(src).toContain('regenerarSenhaColaborador: regenerarSenhaColaboradorRHAction');
    expect(src).toContain('verificarInativacao: verificarInativacaoRHAction');
    expect(src).toContain('buscarCandidatosTransferencia: buscarCandidatosTransferenciaRHAction');
  });

  it('page.tsx reutiliza ColaboradorEditarClient via shim + loader via import cross-dir', () => {
    const src = readSrc(`${dir}/page.tsx`);
    // Import curto via shim local `_client` (RV-14 canonizada).
    expect(src).toContain("from './_client'");
    const shim = readSrc(`${dir}/_client.ts`);
    expect(shim).toContain(
      "'../../../super-admin/empresa/[id]/colaborador/[employeeId]/editar/ColaboradorEditarClient'",
    );
    // Loader `internals` importado diretamente (path menor, cabe em 100 cols).
    expect(src).toContain(
      "'../../../super-admin/empresa/[id]/colaborador/[employeeId]/editar/internals'",
    );
  });

  it('page.tsx retorna notFound() se employee for de outra empresa (defense-in-depth)', () => {
    const src = readSrc(`${dir}/page.tsx`);
    // loadColaboradorEditarPage retorna null se employee inexistente OU de outra empresa
    expect(src).toMatch(/if\s*\(pageData === null\)\s*\{[\s\S]*?notFound\(\)/);
  });
});
