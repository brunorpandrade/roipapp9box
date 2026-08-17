// ROIP APP 9BOX — teste de integração ME-080d Onda 4 (e2e Nativa).
//
// Suite de completude estrutural do Bloco B8 canonico.
//
// Escopo canonico: as 14 rotas B8 dentro-de-empresa
// (`/super-admin/empresa/[id]/*`) fechadas nas MEs 074 a 080c. Este
// teste consolida em suite unica o contrato estrutural minimo que
// TODAS elas devem respeitar, bloqueando regressoes futuras que
// possam ocorrer em MEs proximas (B9+) sobre esses arquivos.
//
// Contrato canonico verificado por rota:
//   1. `page.tsx` existe e e legivel.
//   2. Renderiza `Layout` — componente canonico do shell dentro-de-empresa
//      (`src/components/shell/Layout.tsx`), consistente em todo o B8.
//   3. Header prop tem `leftMode: 'in_company'` (nao super_admin_global,
//      nao rh, nao clevel — regime canonico Bruno navegando dentro-de-
//      empresa).
//   4. Header prop propaga `companyDisplayName: company.nomeFantasia`.
//   5. Header prop propaga `companyLogoUrl: company.logoUrl ?? undefined`
//      (contrato canonico da ME-080d Onda 1f — sem isso, o Header cai
//      no fallback de iniciais mesmo com `companies.logoUrl` populada).
//   6. Rota exige autenticacao `super_admin` (chama `getServerSession`
//      + verifica `session.kind === 'super_admin'`).
//   7. Rota deriva `profileKey` via `resolveProfileKey({session, ...})`
//      (padrao canonico ME-055; nunca hard-coded como string literal).
//
// Estrategia canonica: leitura grep-style dos 16 arquivos page.tsx
// afetados (as 14 rotas principais + 2 sub-rotas novo/editar de
// clevel e colaborador — contadas como 1 rota no escopo B8).
//
// **RV-13.** Todo import canonico e importado em outra ME (esta
// suite consolida cobertura para todo o bloco B8).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * As 14 rotas canonicas B8 (ME-074 a ME-080c).
 * Cada entrada declara o path relativo e um label human-readable.
 */
const B8_ROUTES: ReadonlyArray<{ readonly path: string; readonly label: string }> = [
  { path: 'src/app/super-admin/empresa/[id]/page.tsx', label: 'landing (ME-074)' },
  { path: 'src/app/super-admin/empresa/[id]/familias/page.tsx', label: 'familias (ME-075a)' },
  {
    path: 'src/app/super-admin/empresa/[id]/parametros/page.tsx',
    label: 'parametros (ME-075b)',
  },
  {
    path: 'src/app/super-admin/empresa/[id]/todos-os-colaboradores/page.tsx',
    label: 'todos-os-colaboradores (ME-076)',
  },
  { path: 'src/app/super-admin/empresa/[id]/organograma/page.tsx', label: 'organograma (ME-077)' },
  { path: 'src/app/super-admin/empresa/[id]/clevel-rh/page.tsx', label: 'clevel-rh (ME-078a)' },
  {
    path: 'src/app/super-admin/empresa/[id]/colaborador/novo/page.tsx',
    label: 'colaborador novo (ME-078b)',
  },
  {
    path: 'src/app/super-admin/empresa/[id]/colaborador/[employeeId]/editar/page.tsx',
    label: 'colaborador editar (ME-078b)',
  },
  {
    path: 'src/app/super-admin/empresa/[id]/clevel/novo/page.tsx',
    label: 'clevel novo (ME-078a)',
  },
  {
    path: 'src/app/super-admin/empresa/[id]/clevel/[cLevelId]/editar/page.tsx',
    label: 'clevel editar (ME-078a)',
  },
  {
    path: 'src/app/super-admin/empresa/[id]/dados-mensais/page.tsx',
    label: 'dados-mensais (ME-079a)',
  },
  {
    path: 'src/app/super-admin/empresa/[id]/relatorios-e-exportacoes/page.tsx',
    label: 'relatorios-e-exportacoes (ME-079a)',
  },
  { path: 'src/app/super-admin/empresa/[id]/nr1/page.tsx', label: 'nr1 (ME-079b)' },
  {
    path: 'src/app/super-admin/empresa/[id]/pendencias-portal/page.tsx',
    label: 'pendencias-portal (ME-080a)',
  },
  { path: 'src/app/super-admin/empresa/[id]/historico/page.tsx', label: 'historico (ME-080b)' },
  {
    path: 'src/app/super-admin/empresa/[id]/onboarding-lideres/page.tsx',
    label: 'onboarding-lideres (ME-080c)',
  },
] as const;

describe('ME-080d Onda 4 — e2e Nativa: completude estrutural bloco B8', () => {
  it('B8 tem 16 pages (14 rotas canonicas + 2 sub-rotas novo/editar de clevel/colaborador)', () => {
    expect(B8_ROUTES).toHaveLength(16);
  });

  for (const { path, label } of B8_ROUTES) {
    describe(`Rota B8 — ${label}`, () => {
      const fullPath = join(process.cwd(), path);
      it('page.tsx existe', () => {
        expect(existsSync(fullPath)).toBe(true);
      });

      const source = existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : '';

      it('renderiza shell canonico Layout (src/components/shell/Layout.tsx)', () => {
        // Padrao canonico dentro-de-empresa desde ME-055 Bloco B.
        expect(source).toContain('Layout');
        // Confirma import canonico (nao apenas menção casual de "Layout")
        expect(source).toMatch(/from ['"][^'"]*\/components\/shell\/Layout['"]/);
      });

      it("header prop declara leftMode: 'in_company'", () => {
        expect(source).toMatch(/leftMode:\s*['"]in_company['"]/);
      });

      it('header prop propaga companyDisplayName do fetch canonico', () => {
        // Aceita `company.nomeFantasia` (padrao canonico via
        // findCompanyDisplayInfo) OU `row.nomeFantasia` (padrao pontual
        // usado em parametros/page.tsx que carrega dados especificos).
        expect(source).toMatch(/companyDisplayName:\s*(?:company|row)\.nomeFantasia/);
      });

      it('header prop propaga companyLogoUrl (contrato canonico Onda 1f)', () => {
        // Sem essa linha, Header dentro-de-empresa cai no fallback de
        // iniciais mesmo com URL populada. Aceita `company.logoUrl` ou
        // `row.logoUrl` (variavel local pode diferir).
        expect(source).toMatch(/companyLogoUrl:\s*(?:company|row)\.logoUrl\s*\?\?\s*undefined/);
      });

      it('exige autenticacao super_admin (getServerSession + kind check)', () => {
        // Padrao canonico universal do B8: `getServerSession()` + narrowing
        // por `session.kind !== 'super_admin'` seguido de redirect.
        expect(source).toContain('getServerSession');
        expect(source).toMatch(/session\.kind\s*!==\s*['"]super_admin['"]/);
      });

      it('deriva profileKey via resolveProfileKey (nao hard-coded)', () => {
        // Padrao canonico ME-055 Bloco B: profileKey e resolvido
        // dinamicamente a partir da sessao para permitir troca contextual.
        // Nunca hard-coded como string literal.
        expect(source).toContain('resolveProfileKey');
      });
    });
  }
});

describe('ME-080d Onda 4 — invariantes globais do bloco B8', () => {
  const allSources = B8_ROUTES.map(({ path }) => {
    const full = join(process.cwd(), path);
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  });

  it('nenhuma rota B8 usa leftMode: rh, clevel ou super_admin_global (garantia canonica)', () => {
    for (const src of allSources) {
      expect(src).not.toMatch(/leftMode:\s*['"]rh['"]/);
      expect(src).not.toMatch(/leftMode:\s*['"]clevel['"]/);
      expect(src).not.toMatch(/leftMode:\s*['"]super_admin_global['"]/);
    }
  });

  it('nenhuma rota B8 tem TODO/FIXME/XXX de bloqueio (higiene canonica)', () => {
    // TODO/FIXME/XXX em comentarios de codigo geralmente sinalizam
    // pendencias nao endereçadas. Sanity check post-B8 fechado.
    for (const src of allSources) {
      expect(src).not.toMatch(/\/\/\s*(TODO|FIXME|XXX)\b/);
      expect(src).not.toMatch(/\/\*\s*(TODO|FIXME|XXX)\b/);
    }
  });

  it('todas as rotas B8 derivam profileKey via resolveProfileKey (nao hard-coded)', () => {
    // Contrato canonico ME-055 Bloco B: profileKey e sempre resolvido
    // dinamicamente a partir da sessao — nunca literal. Isso permite
    // trocas contextuais futuras (impersonation, C-level, etc).
    for (const src of allSources) {
      expect(src).toContain('resolveProfileKey');
    }
  });
});
