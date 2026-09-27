// ROIP APP 9BOX — teste de analise estatica ME-084 (router `employees`
// guards + defense-in-depth §2.4).
//
// Cobre canonicamente:
//   1. Router `employees` aceita `rhAllowedProcedure()` em TODAS as procs
//      consumidas pela ME-084 (regressao protection — se alguma futura ME
//      restringir a super_admin, este teste reprova).
//      ATUALIZADO ME 3.5 D2: substituto canonico de `roleProcedure(
//      ['super_admin','rh','rh_lider'])` que tambem aceita
//      `clevel + isRH=true`, preservando o comportamento historico do
//      guard antigo para as tres roles originais.
//   2. Router preserva `assertCompanyScope` (RH nunca opera fora da
//      propria empresa via input manipulado).
//   3. Router preserva `assertCanChangeIsRH` (RH nunca ativa isRH em
//      outro colaborador via input manipulado).
//   4. Callsite super-admin de ColaboradorNovo/Editar/TodosColaboradores
//      continua passando variant='super_admin' + hrefs Bruno + actions
//      super-admin (bit-exact preservado).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

describe('ME-084 — router employees preserva role RH/RH-Lider bit-exact', () => {
  const src = readSrc('src/server/routers/employees.ts');

  it('guard rhAllowedProcedure em procs relevantes (ME 3.5 D2)', () => {
    // Existencia da string canonica bit-exact em multiplas procs (ME 3.5 D2
    // substitui `roleProcedure(['super_admin','rh','rh_lider'])` por
    // `rhAllowedProcedure()` — preserva as 3 roles historicas e adiciona
    // `clevel + isRH=true`, decidido pela funcao pura `decideRhAllowed`).
    const matches = src.match(/rhAllowedProcedure\(\)/g);
    expect(matches).not.toBeNull();
    // Pelo menos 7 procs devem ter esse guard (create, update, inactivate,
    // reactivate, list, getById, regenerateMatricula/Password ou variantes)
    expect((matches ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('preserva assertCompanyScope (cross-tenant guard)', () => {
    expect(src).toContain('assertCompanyScope');
  });

  it('preserva assertCanChangeIsRH (priv elevacao guard)', () => {
    expect(src).toContain('assertCanChangeIsRH');
  });
});

describe('ME-084 — callsite super-admin Bruno preservado bit-exact', () => {
  it('page.tsx super-admin todos-os-colaboradores preserva variant/hrefs/refetch Bruno', () => {
    const src = readSrc('src/app/super-admin/empresa/[id]/todos-os-colaboradores/page.tsx');
    expect(src).toContain('variant="super_admin"');
    expect(src).toContain(
      'novoColaboradorHref={`/super-admin/empresa/${companyId}/colaborador/novo`}',
    );
    expect(src).toContain('refetchAction={listarColaboradoresAction}');
  });

  it('page.tsx super-admin colaborador/novo preserva variant/actions Bruno', () => {
    const src = readSrc('src/app/super-admin/empresa/[id]/colaborador/novo/page.tsx');
    expect(src).toContain('variant="super_admin"');
    expect(src).toContain('criarColaborador={criarColaboradorAction}');
    expect(src).toContain('definirRF={definirRFAction}');
    expect(src).toContain('pesquisarLiderCandidatos={pesquisarLiderCandidatosAction}');
    expect(src).toContain(
      'todosColaboradoresHref={`/super-admin/empresa/${companyId}/todos-os-colaboradores`}',
    );
    expect(src).toContain('presetRHBackHref={`/super-admin/empresa/${companyId}/clevel-rh`}');
  });

  it('page.tsx super-admin colaborador/editar preserva variant/bag Bruno', () => {
    const src = readSrc(
      'src/app/super-admin/empresa/[id]/colaborador/[employeeId]/editar/page.tsx',
    );
    expect(src).toContain('variant="super_admin"');
    expect(src).toContain(
      'todosColaboradoresHref={`/super-admin/empresa/${companyId}/todos-os-colaboradores`}',
    );
    // ME-fila6 D2 (L129): 11 assignments — `executarTransferencia` e
    // `inativarColaborador` foram para a rota do formulario de desligamento.
    expect(src).not.toContain('executarTransferencia: executarTransferenciaAction');
    expect(src).not.toContain('inativarColaborador: inativarColaboradorAction');
    expect(src).toContain('desligamentoHref={desligamentoHref}');
    for (const [key, value] of [
      ['atualizarColaborador', 'atualizarColaboradorAction'],
      ['definirRFEditar', 'definirRFEditarAction'],
      ['excluirColaborador', 'excluirColaboradorAction'],
      ['listarLiderados', 'listarLideradosAction'],
      ['pesquisarLiderCandidatosEditar', 'pesquisarLiderCandidatosEditarAction'],
      ['reativarColaborador', 'reativarColaboradorAction'],
      ['reatribuirLiderColaborador', 'reatribuirLiderColaboradorAction'],
      ['regenerarMatriculaColaborador', 'regenerarMatriculaColaboradorAction'],
      ['regenerarSenhaColaborador', 'regenerarSenhaColaboradorAction'],
      ['verificarInativacao', 'verificarInativacaoAction'],
      ['buscarCandidatosTransferencia', 'buscarCandidatosTransferenciaAction'],
    ] as const) {
      expect(src, `key=${key}`).toContain(`${key}: ${value}`);
    }
  });
});

describe('ME-084 — L124 rotas RH em archives seguem bit-exact', () => {
  it('/todos-os-colaboradores (base RH) sem prefixo /super-admin', () => {
    const src = readSrc('src/app/todos-os-colaboradores/page.tsx');
    expect(src).not.toContain("redirect('/super-admin/empresa");
    // Root da URL da rota (sem prefixo) para hrefs base RH
    expect(src).toContain("'/access-denied?rota=/todos-os-colaboradores'");
  });

  it('/colaborador/novo (base RH) sem prefixo /super-admin', () => {
    const src = readSrc('src/app/colaborador/novo/page.tsx');
    expect(src).toContain("'/access-denied?rota=/colaborador/novo'");
    expect(src).toContain('todosColaboradoresHref="/todos-os-colaboradores"');
  });

  it('/colaborador/[employeeId]/editar (base RH) sem prefixo /super-admin', () => {
    const src = readSrc('src/app/colaborador/[employeeId]/editar/page.tsx');
    expect(src).toContain("'/access-denied?rota=/colaborador/editar'");
    expect(src).toContain('todosColaboradoresHref="/todos-os-colaboradores"');
  });
});
