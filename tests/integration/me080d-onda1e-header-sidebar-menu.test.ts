// ROIP APP 9BOX — teste de integração ME-080d Onda 1e.
//
// Cobre bit-exact as mutacoes canonicas desta onda:
//
// 1. Item 3 — "Empresas" removido do MENU_SUPER_ADMIN_GLOBAL
//    (coberto no teste `me080d-onda1a-menu-prefetch-and-empresas`
//    apos atualizacao).
//
// 2. Item 4 — Sidebar.tsx: logo horizontal centralizada
//    (`justifyContent: 'center'` no wrapper do topo).
//
// 3. Item 5 — Header.tsx: no modo `super_admin_global`, a logo
//    horizontal ROIPeople foi trocada pelo icone quadrado
//    (`/brand/roipeople-icon.png` — evita duplicacao com Sidebar).
//
// 4. Item 2 — Header.tsx: `<Image>` do next/image trocado por
//    `<img>` nativo para renderizar `companyLogoUrl` (permite URLs
//    de qualquer hostname externo sem configurar `remotePatterns`).
//
// Estrategia canonica: leitura do source-code como texto (grep-style).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SIDEBAR_PATH = join(process.cwd(), 'src/components/shell/Sidebar.tsx');
const HEADER_PATH = join(process.cwd(), 'src/components/shell/Header.tsx');

describe('ME-080d Onda 1e — Sidebar (item 4: logo centralizada)', () => {
  const source = readFileSync(SIDEBAR_PATH, 'utf8');

  it('wrapper do topo tem justifyContent: center (era flex-start)', () => {
    // O bloco canonico do topo do Sidebar tem o comentario
    // "Logo ROIP APP §3" antes do <div>.
    const bloco = source.match(/Logo ROIP APP[\s\S]*?<\/div>/);
    expect(bloco).not.toBeNull();
    const blocoText = bloco?.[0] ?? '';
    expect(blocoText).toContain("justifyContent: 'center'");
    expect(blocoText).not.toContain("justifyContent: 'flex-start'");
  });
});

describe('ME-080d Onda 1e — Header super_admin_global (item 5: icone quadrado)', () => {
  const source = readFileSync(HEADER_PATH, 'utf8');

  it('usa /brand/roipeople-icon.png (nao mais roipeople-horizontal.png)', () => {
    // Escopo estreito: entre `leftMode === 'super_admin_global'` e o `) : (`
    // que fecha o ramo super_admin_global.
    const bloco = source.match(
      /leftMode === 'super_admin_global'\s*\?\s*\(\s*<>([\s\S]*?)<\/>\s*\)\s*:\s*\(/,
    );
    expect(bloco).not.toBeNull();
    const blocoText = bloco?.[1] ?? '';
    expect(blocoText).toContain('/brand/roipeople-icon.png');
    expect(blocoText).not.toContain('/brand/roipeople-horizontal.png');
  });

  it('Image do icone tem width=32 e height=32 (bit-exact)', () => {
    const bloco = source.match(
      /leftMode === 'super_admin_global'\s*\?\s*\(\s*<>([\s\S]*?)<\/>\s*\)\s*:\s*\(/,
    );
    const blocoText = bloco?.[1] ?? '';
    expect(blocoText).toMatch(/width=\{32\}/);
    expect(blocoText).toMatch(/height=\{32\}/);
  });

  it('texto "Área do Super Admin" preservado bit-exact', () => {
    const bloco = source.match(
      /leftMode === 'super_admin_global'\s*\?\s*\(\s*<>([\s\S]*?)<\/>\s*\)\s*:\s*\(/,
    );
    const blocoText = bloco?.[1] ?? '';
    expect(blocoText).toContain('Área do Super Admin');
  });
});

describe('ME-080d Onda 1e — Header in-company (item 2: img nativo para logo empresa)', () => {
  const source = readFileSync(HEADER_PATH, 'utf8');

  it('logo empresa renderiza <img> nativo (nao Image do next/image)', () => {
    // Padrao esperado: `<img\n  src={companyLogoUrl}` (formato prettier).
    // Sem espaco entre `<` e `img` explicito, mas o import de Image
    // permanece para outros usos.
    expect(source).toMatch(/<img\s+src=\{companyLogoUrl\}/);
    // NAO deve mais aparecer o padrao antigo <Image src={companyLogoUrl}
    expect(source).not.toMatch(/<Image\s+src=\{companyLogoUrl\}/);
  });
});

describe('ME-080d Onda 1e — layout.tsx (rename brand ROIPeople)', () => {
  const layoutSource = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('metadata.title = "ROIPeople" (era "ROIP APP 9BOX")', () => {
    expect(layoutSource).toMatch(/title:\s*['"]ROIPeople['"]/);
    expect(layoutSource).not.toMatch(/title:\s*['"]ROIP APP 9BOX['"]/);
  });
});

describe('ME-080d Onda 1e — CompanyDisplayInfo ampliado com logoUrl', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/logs/companyHistoryLog.ts'), 'utf8');

  it('interface CompanyDisplayInfo declara logoUrl: string | null', () => {
    expect(source).toMatch(/interface CompanyDisplayInfo\s*\{[^}]*logoUrl:\s*string\s*\|\s*null/);
  });

  it('findCompanyDisplayInfo seleciona logoUrl no query', () => {
    expect(source).toMatch(/logoUrl:\s*companies\.logoUrl/);
  });

  it('findCompanyDisplayInfo retorna logoUrl no shape final', () => {
    expect(source).toMatch(/logoUrl:\s*row\.logoUrl\s*\?\?\s*null/);
  });
});

describe('ME-080d Onda 1e — pages in-company propagam companyLogoUrl ao Header', () => {
  const AFFECTED_PAGES = [
    'src/app/super-admin/empresa/[id]/todos-os-colaboradores/page.tsx',
    'src/app/super-admin/empresa/[id]/nr1/page.tsx',
    'src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/page.tsx',
    'src/app/super-admin/empresa/[id]/dados-mensais/page.tsx',
    'src/app/super-admin/empresa/[id]/colaborador/[employeeId]/editar/page.tsx',
    'src/app/super-admin/empresa/[id]/colaborador/novo/page.tsx',
    'src/app/super-admin/empresa/[id]/onboarding-lideres/page.tsx',
    'src/app/super-admin/empresa/[id]/organograma/page.tsx',
    'src/app/super-admin/empresa/[id]/clevel/novo/page.tsx',
    'src/app/super-admin/empresa/[id]/clevel/[cLevelId]/editar/page.tsx',
    'src/app/super-admin/empresa/[id]/pendencias-portal/page.tsx',
    'src/app/super-admin/empresa/[id]/historico/page.tsx',
    'src/app/super-admin/empresa/[id]/clevel-rh/page.tsx',
  ];

  for (const relPath of AFFECTED_PAGES) {
    it(`${relPath}: passa companyLogoUrl no header prop`, () => {
      const source = readFileSync(join(process.cwd(), relPath), 'utf8');
      // Deve conter exatamente 1 ocorrência de `companyLogoUrl:` (no
      // header prop, NAO no superAdminContext que nao aceita o campo).
      const occurrences = (source.match(/companyLogoUrl:\s*company\.logoUrl/g) ?? []).length;
      expect(occurrences).toBe(1);
    });
  }
});
