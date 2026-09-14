// ROIP APP 9BOX — teste estrutural (L129) da ME-fila3-reteste-ui.
//
// Protege contra regressao silenciosa dos artefatos canonicos da Secao 6
// §5.5 nova ("Perfil Individual inconsistente"):
//
// 1. Componente canonico `PerfilInconsistenteBox` existe e expoe as
//    constantes canonicas literais (titulo, estado vazio, rotulos de
//    botao e do estado nao-clicavel, corpo do modal literal §10.7).
// 2. Server action `liberarRetesteAction` existe, e `'use server'`, e
//    dispara o proc canonico `individualProfile.releaseRetest` via
//    caller tRPC + `revalidatePath` nas duas superficies simetricas.
// 3. Service canonico `listInconsistentesEnriquecidoByCompany` filtra
//    placeholders pelos dois status de interesse do §10.6/§10.7
//    (`inconsistente` + `aguardando_nova_resposta`) e retorna o tipo
//    canonico `PerfilInconsistenteRow`.
// 4. Loader canonico `loadPerfisIndividuaisInconsistentes` no
//    `internals.ts` do painel RH delega ao service canonico.
// 5. `PainelRHClient` recebe as novas props canonicas e renderiza a
//    Secao 6 canonica antes do fechamento (com titulo canonico literal).
// 6. `page.tsx` do `/painel-rh` e do `painel-rh-preview` fazem SSR do
//    loader canonico e injetam a action canonica.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-fila3-reteste-ui — Secao 6 canonica "Perfil Individual inconsistente"', () => {
  // -------------------------------------------------------------------
  // 1. Componente canonico
  // -------------------------------------------------------------------
  it('PerfilInconsistenteBox declara `use client` canonico', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    expect(src).toContain("'use client'");
  });

  it('PerfilInconsistenteBox expoe titulo canonico literal DOC 03 §10.6 pt.6', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    expect(src).toContain(
      "export const PERFIL_INCONSISTENTE_TITULO = 'Perfil Individual inconsistente'",
    );
  });

  it('PerfilInconsistenteBox expoe estado vazio canonico literal', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    expect(src).toContain('Nenhum Perfil Individual inconsistente no momento.');
  });

  it('PerfilInconsistenteBox expoe rotulo canonico do botao de acao', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    expect(src).toContain("export const BOTAO_LIBERAR_LABEL = 'Liberar teste novamente'");
  });

  it('PerfilInconsistenteBox expoe rotulo canonico do estado nao-clicavel', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    expect(src).toContain("export const AGUARDANDO_LABEL = 'Aguardando nova resposta'");
  });

  it('PerfilInconsistenteBox aplica cor canonica de reincidencia (§10.7)', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    // Uso do token canonico do design system para as duas cores da
    // linha vermelha reincidente (`#FEE2E2` + `#991B1B`).
    expect(src).toContain('COLORS.badge.dangerBg');
    expect(src).toContain('COLORS.badge.dangerText');
  });

  it('PerfilInconsistenteBox reproduz texto canonico literal do modal (DOC 03 §10.7)', () => {
    const src = readSrc('src/components/painel/PerfilInconsistenteBox.tsx');
    expect(src).toContain('Na próxima visita ao portal');
    expect(src).toContain('sem qualquer indicação visual de que se trata de um reteste');
    expect(src).toContain('Sem notificação por e-mail');
    expect(src).toContain('O RH é responsável por comunicar diretamente');
  });

  // -------------------------------------------------------------------
  // 2. Server action canonica
  // -------------------------------------------------------------------
  it('actions.ts do painel-rh declara `use server` canonico', () => {
    const src = readSrc('src/app/painel-rh/actions.ts');
    expect(src).toContain("'use server'");
  });

  it('liberarRetesteAction invoca o proc canonico individualProfile.releaseRetest', () => {
    const src = readSrc('src/app/painel-rh/actions.ts');
    expect(src).toContain('caller.releaseRetest(input)');
  });

  it('liberarRetesteAction revalida as duas superficies canonicas simetricas', () => {
    const src = readSrc('src/app/painel-rh/actions.ts');
    expect(src).toContain("revalidatePath('/painel-rh')");
    expect(src).toContain("revalidatePath('/super-admin/empresa/[id]/painel-rh-preview', 'page')");
  });

  // -------------------------------------------------------------------
  // 3. Service enriquecido canonico
  // -------------------------------------------------------------------
  it('service `listInconsistentesEnriquecidoByCompany` existe e e exportado', () => {
    const src = readSrc('src/server/services/individualProfilePlaceholders.ts');
    expect(src).toContain('export async function listInconsistentesEnriquecidoByCompany');
  });

  it('service enriquecido filtra pelos dois status canonicos §10.6/§10.7', () => {
    const src = readSrc('src/server/services/individualProfilePlaceholders.ts');
    expect(src).toContain("eq(individualProfilePlaceholders.status, 'inconsistente')");
    expect(src).toContain("eq(individualProfilePlaceholders.status, 'aguardando_nova_resposta')");
  });

  it('service enriquecido expoe tipo canonico PerfilInconsistenteRow', () => {
    const src = readSrc('src/server/services/individualProfilePlaceholders.ts');
    expect(src).toContain('export interface PerfilInconsistenteRow');
  });

  // -------------------------------------------------------------------
  // 4. Loader do internals canonico
  // -------------------------------------------------------------------
  it('internals do painel-rh expoe loader `loadPerfisIndividuaisInconsistentes`', () => {
    const src = readSrc('src/app/painel-rh/internals.ts');
    expect(src).toContain('export async function loadPerfisIndividuaisInconsistentes');
    expect(src).toContain('listInconsistentesEnriquecidoByCompany');
  });

  it('internals re-exporta tipo canonico PerfilInconsistenteRow', () => {
    const src = readSrc('src/app/painel-rh/internals.ts');
    expect(src).toContain('export type { PerfilInconsistenteRow }');
  });

  // -------------------------------------------------------------------
  // 5. PainelRHClient renderiza Secao 6 canonica
  // -------------------------------------------------------------------
  it('PainelRHClient importa o componente canonico da Secao 6', () => {
    const src = readSrc('src/app/painel-rh/PainelRHClient.tsx');
    expect(src).toContain('PerfilInconsistenteBox');
    expect(src).toContain('PerfilInconsistenteBoxActions');
  });

  it('PainelRHClient declara as duas props canonicas novas', () => {
    const src = readSrc('src/app/painel-rh/PainelRHClient.tsx');
    expect(src).toContain('readonly perfisIndividuaisInconsistentes:');
    expect(src).toContain('readonly perfilInconsistenteActions: PerfilInconsistenteBoxActions');
  });

  it('PainelRHClient renderiza a Secao 6 com titulo canonico literal', () => {
    const src = readSrc('src/app/painel-rh/PainelRHClient.tsx');
    expect(src).toContain('<SectionTitle>Perfil Individual inconsistente</SectionTitle>');
  });

  it('PainelRHClient passa companyId + linhas + actions ao componente', () => {
    const src = readSrc('src/app/painel-rh/PainelRHClient.tsx');
    expect(src).toContain('linhas={perfisIndividuaisInconsistentes}');
    expect(src).toContain('actions={perfilInconsistenteActions}');
  });

  // -------------------------------------------------------------------
  // 6. Pages fazem SSR + injecao canonica
  // -------------------------------------------------------------------
  it('page.tsx do /painel-rh chama o loader e injeta a action canonica', () => {
    const src = readSrc('src/app/painel-rh/page.tsx');
    expect(src).toContain('loadPerfisIndividuaisInconsistentes');
    expect(src).toContain('liberarRetesteAction');
    expect(src).toContain('perfisIndividuaisInconsistentes={perfisIndividuaisInconsistentes}');
    expect(src).toContain('perfilInconsistenteActions={{ liberarReteste: liberarRetesteAction }}');
  });

  it('page.tsx do painel-rh-preview chama o loader e injeta a action canonica', () => {
    const src = readSrc('src/app/super-admin/empresa/[id]/painel-rh-preview/page.tsx');
    expect(src).toContain('loadPerfisIndividuaisInconsistentes');
    expect(src).toContain('liberarRetesteAction');
    expect(src).toContain('perfisIndividuaisInconsistentes={perfisIndividuaisInconsistentes}');
    expect(src).toContain('perfilInconsistenteActions={{ liberarReteste: liberarRetesteAction }}');
  });
});
