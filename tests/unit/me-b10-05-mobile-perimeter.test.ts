// ROIP APP 9BOX — teste estrutural ME-B10-05 (perimetro mobile
// integral, S256 + S257).
//
// Protege contra regressao silenciosa das 12 primitivas responsivas
// canonizadas em `src/app/globals.css` e do consumo delas nos 15
// arquivos-alvo. Padrao de teste: readFileSync + regex de conteudo,
// mesmo padrao de `me-b10-01-portal-structure.test.ts` e
// `me-b10-02-structure.test.ts` (sem render em jsdom, sem tsx
// runtime — teste rapido e determinista para o gate `vitest run`
// do validate).
//
// Cobertura:
//   1. `src/app/globals.css` exporta as 12 primitivas canonicas com
//      breakpoint unico `max-width: 1023.98px`.
//   2. Os 5 arquivos do portal do colaborador consomem as classes
//      corretas nos containers-chave.
//   3. Os 3 shells de instrumento consomem `roip-container`,
//      `roip-header-padding`, `roip-body-padding`, `roip-likert-*`
//      (A/D/NR-1) e `roip-modal-pi-*` (Perfil Individual).
//   4. O Layout platform exporta a nova prop `mobileHideSidebar` e
//      aplica a classe `roip-platform-shell-mobile-hide-sidebar`
//      quando true.
//   5. As 4 pages `/meu-portal/*` passam `mobileHideSidebar` ao
//      Layout.
//
// RV-13: este teste e o chamador canonico do CSS global e das
// classes CSS adicionadas nesta ME.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-B10-05 — perimetro mobile integral (S256 + S257)', () => {
  describe('src/app/globals.css — 12 primitivas responsivas', () => {
    const cssContent = readSrc('src/app/globals.css');

    it('define breakpoint canonico unico 1023.98px', () => {
      expect(cssContent).toContain('@media (max-width: 1023.98px)');
    });

    const primitivasCanonicas = [
      '.roip-container',
      '.roip-header-padding',
      '.roip-progress-padding',
      '.roip-body-padding',
      '.roip-likert-options',
      '.roip-likert-btn',
      '.roip-pendencia-card',
      '.roip-modal-fullscreen-mobile',
      '.roip-modal-overlay',
      '.roip-modal-pi-fullscreen-mobile',
      '.roip-modal-pi-overlay',
      '.roip-platform-shell-mobile-hide-sidebar',
    ] as const;

    it.each(primitivasCanonicas)('exporta primitiva canonica %s', (classe) => {
      expect(cssContent).toContain(classe);
    });

    it('preserva diretivas Tailwind + reset de body pre-existentes', () => {
      expect(cssContent).toContain('@tailwind base;');
      expect(cssContent).toContain('@tailwind components;');
      expect(cssContent).toContain('@tailwind utilities;');
      expect(cssContent).toContain('background: #f9fafb;');
      expect(cssContent).toContain('font-family: var(--font-inter)');
    });
  });

  describe('Portal do colaborador — consumo de classes responsivas', () => {
    it('PortalLayout aplica className roip-portal-header no header condicional', () => {
      const content = readSrc('src/components/portal-colaborador/PortalLayout.tsx');
      expect(content).toContain('className="roip-portal-header"');
      expect(content).toContain('className="roip-portal-footer"');
    });

    it('ColaboradorLoginClient aplica className roip-login-card', () => {
      const content = readSrc('src/components/portal-colaborador/ColaboradorLoginClient.tsx');
      expect(content).toContain('className="roip-login-outer"');
      expect(content).toContain('className="roip-login-card"');
    });

    it('GateLgpdClient aplica className roip-lgpd-card', () => {
      const content = readSrc('src/components/portal-colaborador/GateLgpdClient.tsx');
      expect(content).toContain('className="roip-lgpd-outer"');
      expect(content).toContain('className="roip-lgpd-card"');
    });

    it('PendenciasClient aplica className roip-pendencia-card nos cards', () => {
      const content = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
      expect(content).toContain('className="roip-pendencia-card"');
      expect(content).toContain('className="roip-pendencia-topo"');
      expect(content).toContain('className="roip-pendencia-btn-wrap"');
      expect(content).toContain('className="roip-pendencias-container"');
    });

    it('PrivacyModal aplica className de overlay + modal fullscreen mobile', () => {
      const content = readSrc('src/components/portal-colaborador/PrivacyModal.tsx');
      expect(content).toContain('className="roip-modal-overlay"');
      expect(content).toContain('className="roip-modal-fullscreen-mobile"');
    });
  });

  describe('Shells de instrumento — consumo de primitivas responsivas', () => {
    it('LikertFormShell substitui grid 5 colunas por roip-likert-options', () => {
      const content = readSrc('src/components/instruments/LikertFormShell.tsx');
      expect(content).toContain('className="roip-likert-options"');
      expect(content).toContain('data-testid="likert-options-container"');
      expect(content).toContain('className="roip-likert-btn"');
      expect(content).toContain('roip-likert-btn-num');
      expect(content).toContain('roip-likert-btn-label');
      // Realinhamento CC079: grid 5 colunas removido do inline style.
      expect(content).not.toContain('gridTemplateColumns: `repeat(${props.catalogo.legendas');
      // Container 780px substituido por roip-container.
      expect(content).toContain('className="roip-container roip-header-padding"');
      expect(content).toContain('className="roip-container roip-body-padding"');
    });

    it('Nr1FormShell substitui grid 5 colunas por roip-likert-options', () => {
      const content = readSrc('src/components/instruments/Nr1FormShell.tsx');
      expect(content).toContain('className="roip-likert-options"');
      expect(content).toContain('className="roip-likert-btn"');
      expect(content).toContain('roip-likert-btn-num');
      expect(content).toContain('roip-likert-btn-label');
      // Grid antigo removido do inline style.
      expect(content).not.toContain('gridTemplateColumns: `repeat(${NR1_CATALOG.legendas');
      // Containers migrados.
      expect(content).toContain('className="roip-container roip-header-padding"');
      expect(content).toContain('className="roip-container roip-body-padding"');
    });

    it('PerfilIndividualFormShell aplica overlay + modal pi fullscreen mobile', () => {
      const content = readSrc('src/components/instruments/PerfilIndividualFormShell.tsx');
      expect(content).toContain('className="roip-modal-pi-overlay"');
      expect(content).toContain('className="roip-modal-pi-fullscreen-mobile"');
      // As dimensoes duplicadas foram removidas do objeto estilos —
      // agora sao 100% controladas pelas classes CSS.
      expect(content).not.toContain("width: '80%',\n    maxWidth: 760,");
    });
  });

  describe('Layout platform — prop mobileHideSidebar (S257)', () => {
    it('Layout declara prop mobileHideSidebar como boolean opcional', () => {
      const content = readSrc('src/components/shell/Layout.tsx');
      expect(content).toContain('readonly mobileHideSidebar?: boolean');
      expect(content).toContain('mobileHideSidebar === true');
      expect(content).toContain("'roip-platform-shell-mobile-hide-sidebar'");
    });

    const pagesPlatform = [
      'src/app/meu-portal/auto-avaliacao/page.tsx',
      'src/app/meu-portal/lideranca-direta/page.tsx',
      'src/app/meu-portal/perfil-individual/page.tsx',
      'src/app/meu-portal/radar-nr1/page.tsx',
    ] as const;

    it.each(pagesPlatform)('pagina platform %s passa mobileHideSidebar ao Layout', (path) => {
      expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
      const content = readSrc(path);
      expect(content).toContain('mobileHideSidebar');
    });
  });
});
