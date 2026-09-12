// ROIP APP 9BOX — teste estrutural (L129) da ME-B10-04 (S255).
//
// Protege contra regressao silenciosa dos hrefs canonicos habilitados
// nesta ME:
// - `MeuPortalClient.HREF_POR_INSTRUMENTO.meuPerfil` -> '/meu-portal/perfil-individual'.
// - `PendenciasClient.CardPerfilIndividual` renderiza `<CardBase />`
//   com `href="/colaborador/responder/perfil-individual"` nos 2 estados
//   canonicos (`pendente|aguardando_nova_resposta` e `em_andamento`).
//
// Tambem protege contra regressao dos hrefs habilitados nas MEs
// anteriores do Bloco B10:
// - `MeuPortalClient` preserva `autoAvaliacao` (S253 ME-B10-02),
//   `avaliacaoLiderancaDireta` (S253 ME-B10-02) e `radarNR1` (S254
//   ME-B10-03).
// - `PendenciasClient` preserva os 3 hrefs anteriores.
//
// Cobre L129 tambem para a limpeza CC079 acumulativa desta ME:
// - `TOOLTIP_EM_BREVE` foi removido do PendenciasClient (RV-13 —
//   dead code apos os 4 hrefs habilitados).
// - `CardBase.href` virou obrigatorio (assinatura ajustada de
//   `href?: string` para `href: string`).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-B10-04 — arquivos canonicos entregues', () => {
  const arquivosObrigatorios = [
    'src/lib/instruments/perfilIndividualCatalog.ts',
    'src/components/instruments/PerfilIndividualFormShell.tsx',
    'src/app/colaborador/responder/perfil-individual/page.tsx',
    'src/app/meu-portal/perfil-individual/page.tsx',
  ] as const;

  it.each(arquivosObrigatorios)('arquivo canonico %s existe', (path) => {
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
  });
});

describe('ME-B10-04 — habilitacao canonica de rotas Perfil Individual', () => {
  it('MeuPortalClient habilita href do meuPerfil (S255)', () => {
    const src = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    expect(src).toContain("meuPerfil: '/meu-portal/perfil-individual'");
    // A partir desta ME, o mapa nao contem mais `null` — todos os
    // 4 instrumentos estao habilitados. Refinamento canonico de
    // tipo: `Record<string, string>` (era `Record<string, string | null>`).
    expect(src).toContain('Record<string, string>');
    expect(src).not.toContain('meuPerfil: null');
  });

  it('MeuPortalClient preserva os 3 hrefs habilitados anteriormente', () => {
    const src = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    expect(src).toContain("autoAvaliacao: '/meu-portal/auto-avaliacao'");
    expect(src).toContain("avaliacaoLiderancaDireta: '/meu-portal/lideranca-direta'");
    expect(src).toContain("radarNR1: '/meu-portal/radar-nr1'");
  });

  it('PendenciasClient CardPerfilIndividual passa href nos 2 ramos canonicos', () => {
    const src = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    // O href aparece 2 vezes dentro do CardPerfilIndividual — uma para
    // `em_andamento` (buttonKind teal + Continuar) e outra para
    // `pendente|aguardando_nova_resposta` (buttonKind navy + Responder).
    const matches = src.match(/href="\/colaborador\/responder\/perfil-individual"/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(2);
  });

  it('PendenciasClient preserva hrefs dos 3 instrumentos anteriores', () => {
    const src = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    expect(src).toContain('href="/colaborador/responder/auto-avaliacao"');
    expect(src).toContain('href="/colaborador/responder/lideranca-direta"');
    expect(src).toContain('href="/colaborador/responder/radar-nr1"');
  });
});

describe('ME-B10-04 — limpeza CC079 acumulativa (RV-13 canonico)', () => {
  const src = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');

  it('constante TOOLTIP_EM_BREVE removida (dead code apos ME-B10-04)', () => {
    // A remocao e do CODIGO (declaracao + uso), nao das mencoes em
    // docstrings historicos do topo do arquivo. Validamos por padroes
    // de codigo canonicos, nao por texto puro.
    expect(src).not.toContain('const TOOLTIP_EM_BREVE');
    expect(src).not.toContain('title={TOOLTIP_EM_BREVE}');
    expect(src).not.toContain('aria-label={TOOLTIP_EM_BREVE}');
    // Fallback `button disabled` removido — nao ha mais `<button` no
    // CardBase, apenas `<Link>`.
    expect(src).not.toContain('<button\n            type="button"\n            disabled');
  });

  it('CardBaseProps.href virou obrigatorio (era href?: string)', () => {
    expect(src).toContain('readonly href: string;');
    expect(src).not.toContain('readonly href?: string;');
  });
});

describe('ME-B10-04 — paginas canonicas do Perfil Individual', () => {
  it('pagina portal e client component com PortalLayout + guard sessionStorage', () => {
    const src = readSrc('src/app/colaborador/responder/perfil-individual/page.tsx');
    expect(src).toContain("'use client'");
    expect(src).toContain('PortalLayout');
    expect(src).toContain('PerfilIndividualFormShell');
    expect(src).toContain('portalToken');
    expect(src).toContain('canalAutenticacao="portal"');
    expect(src).toContain('/colaborador/pendencias');
  });

  it('pagina platform e server component com Layout + guard sessao platform', () => {
    const src = readSrc('src/app/meu-portal/perfil-individual/page.tsx');
    expect(src).not.toContain("'use client'");
    expect(src).toContain('getServerSession');
    expect(src).toContain("session.kind !== 'platform'");
    expect(src).toContain('PerfilIndividualFormShell');
    expect(src).toContain('canalAutenticacao="platform"');
    // Redirect canonico quando o card de pendencia esta ausente
    // (padrao herdado das rotas NR-1 + A/D platform).
    expect(src).toContain('data.pendencias.find');
    expect(src).toContain("'meuPerfil'");
  });

  it('pagina platform redireciona quando sessao ausente ou super_admin', () => {
    const src = readSrc('src/app/meu-portal/perfil-individual/page.tsx');
    expect(src).toContain("redirect('/')");
    expect(src).toContain("redirect('/super-admin')");
  });
});
