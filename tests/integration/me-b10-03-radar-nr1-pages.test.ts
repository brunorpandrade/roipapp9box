// ROIP APP 9BOX — teste estrutural (L129) da ME-B10-03 (S254).
//
// Protege contra regressao silenciosa dos hrefs canonicos habilitados
// nesta ME:
// - `MeuPortalClient.HREF_POR_INSTRUMENTO.radarNR1` -> '/meu-portal/radar-nr1'.
// - `PendenciasClient.CardRadarNr1` renderiza `<CardBase />` com
//   `href="/colaborador/responder/radar-nr1"`.
//
// Tambem protege contra regressao dos estados NAO habilitados:
// - `MeuPortalClient.HREF_POR_INSTRUMENTO.meuPerfil` permanece `null` (Perfil Individual)
//   ate a ME-B10-04.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-B10-03 — habilitacao canonica de rotas Radar NR-1', () => {
  it('MeuPortalClient habilita href do radarNR1', () => {
    const src = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    expect(src).toContain("radarNR1: '/meu-portal/radar-nr1'");
  });

  it('MeuPortalClient preserva autoAvaliacao habilitado (regressao ME-B10-02)', () => {
    const src = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    expect(src).toContain("autoAvaliacao: '/meu-portal/auto-avaliacao'");
  });

  it('MeuPortalClient preserva avaliacaoLiderancaDireta habilitado (regressao ME-B10-02)', () => {
    const src = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    expect(src).toContain("avaliacaoLiderancaDireta: '/meu-portal/lideranca-direta'");
  });

  it('MeuPortalClient habilita meuPerfil na ME-B10-04 (S255)', () => {
    const src = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    // Assert original desta ME (`meuPerfil: null`) foi invalidado
    // pela habilitacao canonica da ME-B10-04 (S255). L113 acumulativo
    // CC079 dentro da ME-B10-04 atualiza para o valor vigente.
    expect(src).toContain("meuPerfil: '/meu-portal/perfil-individual'");
  });

  it('PendenciasClient CardRadarNr1 passa href canonico do portal', () => {
    const src = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    expect(src).toContain('href="/colaborador/responder/radar-nr1"');
  });

  it('PendenciasClient CardAutoAvaliacao preserva href (regressao ME-B10-02)', () => {
    const src = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    expect(src).toContain('href="/colaborador/responder/auto-avaliacao"');
  });

  it('PendenciasClient CardLiderancaDireta preserva href (regressao ME-B10-02)', () => {
    const src = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    expect(src).toContain('href="/colaborador/responder/lideranca-direta"');
  });
});

describe('ME-B10-03 — rotas fisicas do Radar NR-1', () => {
  it('rota portal `/colaborador/responder/radar-nr1/page.tsx` existe', () => {
    expect(() => readSrc('src/app/colaborador/responder/radar-nr1/page.tsx')).not.toThrow();
  });

  it('rota platform `/meu-portal/radar-nr1/page.tsx` existe', () => {
    expect(() => readSrc('src/app/meu-portal/radar-nr1/page.tsx')).not.toThrow();
  });

  it('rota platform executa guard canonico de sessao platform', () => {
    const src = readSrc('src/app/meu-portal/radar-nr1/page.tsx');
    expect(src).toContain('getServerSession');
    expect(src).toContain("session.kind !== 'platform'");
    expect(src).toContain("redirect('/super-admin')");
  });

  it('rota platform redireciona para /meu-portal quando card ausente (C-level, sem ciclo)', () => {
    const src = readSrc('src/app/meu-portal/radar-nr1/page.tsx');
    expect(src).toContain("p.instrumento === 'radarNR1'");
    expect(src).toContain('redirect(HREF_PENDENCIAS)');
  });

  it('rota portal redireciona para /colaborador quando portalToken ausente', () => {
    const src = readSrc('src/app/colaborador/responder/radar-nr1/page.tsx');
    expect(src).toContain("router.replace('/colaborador')");
  });
});

describe('ME-B10-03 — catalogo canonico NR-1 disponivel para reuso', () => {
  it('nr1Catalog.ts existe em src/lib/instruments/', () => {
    expect(() => readSrc('src/lib/instruments/nr1Catalog.ts')).not.toThrow();
  });

  it('Nr1FormShell.tsx existe em src/components/instruments/', () => {
    expect(() => readSrc('src/components/instruments/Nr1FormShell.tsx')).not.toThrow();
  });
});
