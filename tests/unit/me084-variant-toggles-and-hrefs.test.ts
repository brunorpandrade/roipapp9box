// ROIP APP 9BOX — teste de analise estatica ME-084 (D-ME084-1/2/6).
//
// Cobre canonicamente bit-exact via leitura de arquivos:
//   1. `ColaboradorForm` — prop `variant`, toggles Bruno-exclusive
//      envolvidos em condicional (RH nao ve isRH nem Secao 5 RF).
//   2. `ColaboradorNovoClient` — props injetadas (variant, hrefs,
//      actions), dirty modal ad-hoc removido, ModalDirtyState canonico
//      consolidado (D-ME084-6).
//   3. `ColaboradorEditarClient` — props injetadas (variant, href, bag
//      de 13 actions), 13 callsites usam `actions.X()`, hrefs
//      hardcoded removidos.
//   4. `TodosColaboradoresClient` — props (variant, novoHref, editar
//      Builder, refetchAction), refetch injetado, 2 hrefs hardcoded
//      substituidos por props.
//
// Nao depende de banco real — cobre a arquitetura L125 refactor
// canonizada em D-ME084-1/2/6 aprovadas em bloco por Bruno.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf-8');
}

describe('ME-084 D-ME084-1 — ColaboradorForm.variant', () => {
  const src = readSrc('src/app/super-admin/empresa/[id]/colaborador/ColaboradorForm.tsx');

  it('exporta prop `variant` opcional na ColaboradorFormProps', () => {
    expect(src).toMatch(/readonly variant\?:\s*'super_admin'\s*\|\s*'rh'/);
  });

  it('destructura variant com default super_admin', () => {
    expect(src).toMatch(/variant\s*=\s*'super_admin'/);
  });

  it('deriva showToggleIsRH e showToggleRF de variant', () => {
    expect(src).toMatch(/showToggleIsRH\s*=\s*variant\s*===\s*'super_admin'/);
    expect(src).toMatch(/showToggleRF\s*=\s*variant\s*===\s*'super_admin'/);
  });

  it('envolve toggle "Permitir acesso como RH" em condicional', () => {
    // Padrao bit-exact: {showToggleIsRH ? ( ... ) : null}
    expect(src).toMatch(/\{showToggleIsRH\s*\?/);
    // Toggle permanece presente no arquivo (nao foi removido — apenas condicionado)
    expect(src).toContain('Permitir acesso como RH');
  });

  it('envolve secao 5 RF ("Ativar como Responsável financeiro") em condicional', () => {
    expect(src).toMatch(/\{showToggleRF\s*\?/);
    expect(src).toContain('Ativar como Responsável financeiro');
  });

  it('toggle "Permitir acesso como Líder" NAO esta em condicional Bruno-exclusive', () => {
    // Deve permanecer visivel para variant='rh' — pattern §13.4 canonico.
    expect(src).toContain('Permitir acesso como Líder');
    // A pattern do envolvimento condicional so aparece 2x (isRH + RF).
    const matches = src.match(/\{showToggle(IsRH|RF)\s*\?/g) ?? [];
    expect(matches.length).toBe(2);
  });
});

describe('ME-084 D-ME084-1/6 — ColaboradorNovoClient (refactor + consolidacao dirty)', () => {
  const src = readSrc(
    'src/app/super-admin/empresa/[id]/colaborador/novo/ColaboradorNovoClient.tsx',
  );

  it('define contratos-tipo agnosticos (Criar/DefinirRF/PesquisarLider)', () => {
    expect(src).toContain('export type CriarColaboradorActionType');
    expect(src).toContain('export type DefinirRFActionType');
    expect(src).toContain('export type PesquisarLiderCandidatosActionType');
  });

  it('recebe props injetadas variant, todosColaboradoresHref, presetRHBackHref', () => {
    expect(src).toMatch(/readonly variant\?:\s*'super_admin'\s*\|\s*'rh'/);
    expect(src).toContain('readonly todosColaboradoresHref: string;');
    expect(src).toContain('readonly presetRHBackHref: string;');
  });

  it('recebe 3 actions injetadas', () => {
    expect(src).toContain('readonly criarColaborador: CriarColaboradorActionType;');
    expect(src).toContain('readonly definirRF: DefinirRFActionType;');
    expect(src).toContain('readonly pesquisarLiderCandidatos: PesquisarLiderCandidatosActionType;');
  });

  it('NAO importa mais actions super-admin diretamente (imports foram parametrizados)', () => {
    // Import da linha antiga removido. Regex canonica em const separada
    // para caber em <=100 cols (RV-14).
    const RE_OLD_IMPORT = /^import\s+\{[^}]*criarColaboradorAction[^}]*\}\s+from\s+'\.\/actions'/m;
    expect(src).not.toMatch(RE_OLD_IMPORT);
  });

  it('D-ME084-6 — dirty modal ad-hoc removido; ModalDirtyState canonico consumido', () => {
    // ModalDirtyState canonico importado
    expect(src).toContain("from '@/components/ui/ModalDirtyState'");
    // JSX ad-hoc removido
    expect(src).not.toContain('Descartar alterações?');
    expect(src).not.toContain('Continuar editando');
    // Modal canonico usado com props canonicas
    expect(src).toMatch(/<ModalDirtyState\s*open=\{showDirtyModal\}/);
    expect(src).toMatch(/onKeepEditing=\{\(\)\s*=>\s*setShowDirtyModal\(false\)\}/);
    expect(src).toMatch(/onDiscard=\{[^}]*todosColaboradoresHref[^}]*\}/);
    // Constantes MODAL_OVERLAY_STYLE / MODAL_BOX_STYLE removidas
    expect(src).not.toContain('MODAL_OVERLAY_STYLE = {');
    expect(src).not.toContain('MODAL_BOX_STYLE = {');
  });

  it('passa variant ao ColaboradorForm consumido', () => {
    expect(src).toMatch(/<ColaboradorForm[\s\S]*?variant=\{variant\}[\s\S]*?\/>/);
  });

  it('handleCancel usa todosColaboradoresHref (nao mais /super-admin/... hardcoded)', () => {
    expect(src).toMatch(/router\.push\(todosColaboradoresHref\)/);
    expect(src).not.toMatch(
      /router\.push\(`\/super-admin\/empresa\/\$\{companyId\}\/todos-os-colaboradores`\)/,
    );
  });
});

describe('ME-084 D-ME084-1/3 — ColaboradorEditarClient (refactor bag de actions)', () => {
  const src = readSrc(
    'src/app/super-admin/empresa/[id]/colaborador/[employeeId]/editar/ColaboradorEditarClient.tsx',
  );

  it('exporta interface ColaboradorEditarActions com 13 actions tipadas', () => {
    expect(src).toContain('export interface ColaboradorEditarActions');
    for (const action of [
      'atualizarColaborador',
      'buscarCandidatosTransferencia',
      'definirRFEditar',
      'excluirColaborador',
      'executarTransferencia',
      'inativarColaborador',
      'listarLiderados',
      'pesquisarLiderCandidatosEditar',
      'reativarColaborador',
      'reatribuirLiderColaborador',
      'regenerarMatriculaColaborador',
      'regenerarSenhaColaborador',
      'verificarInativacao',
    ]) {
      expect(src).toContain(`readonly ${action}: typeof ${action}Action;`);
    }
  });

  it('recebe props injetadas (variant, href, actions bag)', () => {
    expect(src).toMatch(/readonly variant\?:\s*'super_admin'\s*\|\s*'rh'/);
    expect(src).toContain('readonly todosColaboradoresHref: string;');
    expect(src).toContain('readonly actions: ColaboradorEditarActions;');
  });

  it('import de actions e type-only (import type { ... } from ./actions)', () => {
    expect(src).toMatch(/^import type \{[\s\S]*?\}\s+from\s+'\.\/actions'/m);
  });

  it('todos 13 callsites usam actions.X(...) (nao mais xxxAction(...))', () => {
    for (const [old, next] of [
      ['atualizarColaboradorAction(', 'actions.atualizarColaborador('],
      ['buscarCandidatosTransferenciaAction(', 'actions.buscarCandidatosTransferencia('],
      ['definirRFEditarAction(', 'actions.definirRFEditar('],
      ['excluirColaboradorAction(', 'actions.excluirColaborador('],
      ['executarTransferenciaAction(', 'actions.executarTransferencia('],
      ['inativarColaboradorAction(', 'actions.inativarColaborador('],
      ['listarLideradosAction(', 'actions.listarLiderados('],
      ['pesquisarLiderCandidatosEditarAction(', 'actions.pesquisarLiderCandidatosEditar('],
      ['reativarColaboradorAction(', 'actions.reativarColaborador('],
      ['reatribuirLiderColaboradorAction(', 'actions.reatribuirLiderColaborador('],
      ['regenerarMatriculaColaboradorAction(', 'actions.regenerarMatriculaColaborador('],
      ['regenerarSenhaColaboradorAction(', 'actions.regenerarSenhaColaborador('],
      ['verificarInativacaoAction(', 'actions.verificarInativacao('],
    ] as const) {
      expect(src, `oldCall="${old}" newCall="${next}"`).not.toContain(old);
      expect(src, `newCall="${next}"`).toContain(next);
    }
  });

  it('hrefs hardcoded /super-admin/…/todos-os-colaboradores substituidos', () => {
    // Match do template literal exato Old
    expect(src).not.toMatch(
      /router\.push\(`\/super-admin\/empresa\/\$\{companyId\}\/todos-os-colaboradores`\)/,
    );
    // Novo builder deve aparecer >=4x (4 hrefs substituidos)
    const matches = src.match(/router\.push\(todosColaboradoresHref\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('passa variant ao ColaboradorForm consumido', () => {
    expect(src).toMatch(/<ColaboradorForm[\s\S]*?variant=\{variant\}[\s\S]*?\/>/);
  });
});

describe('ME-084 D-ME084-1/2 — TodosColaboradoresClient (variant + hrefs + refetch)', () => {
  const src = readSrc(
    'src/app/super-admin/empresa/[id]/todos-os-colaboradores/TodosColaboradoresClient.tsx',
  );

  it('import de listarColaboradoresAction e type-only (nao runtime)', () => {
    expect(src).toMatch(
      /^import type\s+\{\s*listarColaboradoresAction\s*\}\s+from\s+'\.\/actions'/m,
    );
  });

  it('recebe 4 props injetadas (variant, novoHref, editarBase, refetchAction)', () => {
    // ME-084 patch1 canonizado: builder trocado por base string (declarativa)
    // porque Next 15 rejeita passar funcoes de Server->Client Component.
    expect(src).toMatch(/readonly variant\?:\s*'super_admin'\s*\|\s*'rh'/);
    expect(src).toContain('readonly novoColaboradorHref: string;');
    expect(src).toContain('readonly editarColaboradorHrefBase: string;');
    expect(src).toContain('readonly refetchAction: typeof listarColaboradoresAction;');
  });

  it('refetch consome refetchAction injetada', () => {
    expect(src).toContain('await refetchAction(companyId, nextFilters)');
    expect(src).not.toContain('await listarColaboradoresAction(companyId, nextFilters)');
  });

  it('2 hrefs hardcoded substituidos por props injetadas', () => {
    expect(src).not.toMatch(
      /href=\{`\/super-admin\/empresa\/\$\{companyId\}\/colaborador\/novo`\}/,
    );
    expect(src).not.toMatch(
      /href=\{`\/super-admin\/empresa\/\$\{companyId\}\/colaborador\/\$\{row\.id\}\/editar`\}/,
    );
    expect(src).toContain('href={novoColaboradorHref}');
    // ME-084 patch1: href de editar e concat inline `${base}/${row.id}/editar`.
    expect(src).toContain('href={`${editarColaboradorHrefBase}/${row.id}/editar`}');
  });

  it('renderRow recebe editarColaboradorHrefBase (nao mais builder)', () => {
    // ME-084 patch1: signature ampliada aceita 3 args, terceiro e base string.
    expect(src).toContain('function renderRow(');
    expect(src).toContain('editarColaboradorHrefBase: string');
    expect(src).toContain('${editarColaboradorHrefBase}/${row.id}/editar');
    // Nao deve mais existir builder callable
    expect(src).not.toContain('editarColaboradorHrefBuilder');
  });
});
