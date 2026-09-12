// ROIP APP 9BOX — teste estrutural ME-B10-02 (S253). Protege
// padrao contra regressao silenciosa dos arquivos entregues.
//
// Cobertura:
//   1. Arquivos canonicos existem nos caminhos esperados.
//   2. Route Handler `/api/portal/session-token` exporta apenas POST.
//   3. `internals.ts` do handler exporta as constantes canonicas.
//   4. `signPortalToken` aceita `ttlSeconds` opcional (S251).
//   5. Catalogos de instrumento expoem estrutura canonica.
//   6. Componente compartilhado `LikertFormShell` esta em
//      `src/components/instruments/`.
//   7. 4 paginas de formulario existem nas rotas canonicas
//      `/colaborador/responder/*` e `/meu-portal/*`.
//   8. `MeuPortalClient` habilita hrefs para A e D via `<Link>`.
//   9. `PendenciasClient` habilita hrefs para A e D.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-B10-02 — estrutura canonica dos formularios A/D + endpoint session-token', () => {
  const arquivosObrigatorios = [
    'src/lib/instruments/instrumentACatalog.ts',
    'src/lib/instruments/instrumentDCatalog.ts',
    'src/components/instruments/LikertFormShell.tsx',
    'src/app/api/portal/session-token/route.ts',
    'src/app/api/portal/session-token/internals.ts',
    'src/app/colaborador/responder/auto-avaliacao/page.tsx',
    'src/app/colaborador/responder/lideranca-direta/page.tsx',
    'src/app/meu-portal/auto-avaliacao/page.tsx',
    'src/app/meu-portal/lideranca-direta/page.tsx',
  ] as const;

  it.each(arquivosObrigatorios)('arquivo canonico %s existe', (path) => {
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
  });

  it('route handler session-token exporta apenas POST (S366 + Next 15 App Router)', () => {
    const content = readSrc('src/app/api/portal/session-token/route.ts');
    expect(content).toContain('export async function POST');
    expect(content).not.toContain('export async function GET');
    expect(content).not.toContain('export async function PUT');
    expect(content).not.toContain('export async function DELETE');
    expect(content).not.toContain('export async function PATCH');
  });

  it('internals session-token exporta mensagens canonicas', () => {
    const content = readSrc('src/app/api/portal/session-token/internals.ts');
    expect(content).toContain('MSG_SEM_SESSAO_SESSION_TOKEN');
    expect(content).toContain('MSG_ACESSO_NEGADO_SESSION_TOKEN');
  });

  it('handler session-token consome getServerSession + signPortalToken', () => {
    const content = readSrc('src/app/api/portal/session-token/route.ts');
    expect(content).toContain('getServerSession');
    expect(content).toContain('signPortalToken');
    expect(content).toContain('PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP');
  });

  it('portalToken exporta signPortalToken com parametro ttlSeconds opcional (S251)', () => {
    const content = readSrc('src/server/auth/portalToken.ts');
    expect(content).toContain('ttlSeconds?: number');
    expect(content).toContain('PORTAL_SESSION_TTL_SECONDS_PLATFORM_TEMP');
    // Retrocompat: default 12h preservado
    expect(content).toContain('PORTAL_SESSION_TTL_SECONDS_DEFAULT');
    expect(content).toContain('12 * 60 * 60');
    // TTL curto canonico para respondente platform (10 min)
    expect(content).toContain('10 * 60');
  });

  it('LikertFormShell exporta componente client canonico', () => {
    const content = readSrc('src/components/instruments/LikertFormShell.tsx');
    expect(content).toContain("'use client'");
    expect(content).toContain('export function LikertFormShell');
    expect(content).toContain('canalAutenticacao');
    expect(content).toContain("'portal'");
    expect(content).toContain("'platform'");
    expect(content).toContain('/api/portal/session-token');
  });

  it('paginas portal consomem LikertFormShell + catalogo correto', () => {
    const paginaA = readSrc('src/app/colaborador/responder/auto-avaliacao/page.tsx');
    expect(paginaA).toContain('INSTRUMENT_A_CATALOG');
    expect(paginaA).toContain('canalAutenticacao="portal"');
    expect(paginaA).toContain('/api/portal/save-instrument-a');
    const paginaD = readSrc('src/app/colaborador/responder/lideranca-direta/page.tsx');
    expect(paginaD).toContain('INSTRUMENT_D_CATALOG');
    expect(paginaD).toContain('canalAutenticacao="portal"');
    expect(paginaD).toContain('/api/portal/save-instrument-d');
  });

  it('paginas platform sao server components autenticados via getServerSession', () => {
    const paginaA = readSrc('src/app/meu-portal/auto-avaliacao/page.tsx');
    expect(paginaA).not.toContain("'use client'");
    expect(paginaA).toContain('getServerSession');
    expect(paginaA).toContain('INSTRUMENT_A_CATALOG');
    expect(paginaA).toContain('canalAutenticacao="platform"');
    const paginaD = readSrc('src/app/meu-portal/lideranca-direta/page.tsx');
    expect(paginaD).not.toContain("'use client'");
    expect(paginaD).toContain('getServerSession');
    expect(paginaD).toContain('INSTRUMENT_D_CATALOG');
    expect(paginaD).toContain('canalAutenticacao="platform"');
  });

  it('MeuPortalClient habilita hrefs para A e D via Link (S253)', () => {
    const content = readSrc('src/app/meu-portal/MeuPortalClient.tsx');
    expect(content).toContain("import Link from 'next/link'");
    expect(content).toContain('/meu-portal/auto-avaliacao');
    expect(content).toContain('/meu-portal/lideranca-direta');
    // ME-B10-03 (S254) habilitou radarNR1; ME-B10-04 (S255) habilitou
    // meuPerfil — assert `meuPerfil: null` removido nesta ME
    // (L113 acumulativo CC079 dentro da ME-B10-04).
  });

  it('PendenciasClient habilita hrefs para A e D via Link', () => {
    const content = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    expect(content).toContain("import Link from 'next/link'");
    expect(content).toContain('/colaborador/responder/auto-avaliacao');
    expect(content).toContain('/colaborador/responder/lideranca-direta');
    // ME-B10-04 (S255) fechou os 4 hrefs canonicos; constante
    // `TOOLTIP_EM_BREVE` e o fallback disabled foram removidos
    // por RV-13 (dead code proibido) — asserts obsoletos removidos
    // nesta ME (L113 acumulativo CC079 dentro da ME-B10-04).
  });

  it('PortalPendenciaCard exporta cicloReferencia (S253 — trimestre canonico do card)', () => {
    const content = readSrc('src/lib/pendencias/portalColaborador.ts');
    expect(content).toContain('readonly cicloReferencia: string | null');
  });

  it('MeuPortalPendenciaItem exporta cicloReferencia (S253)', () => {
    const content = readSrc('src/app/painel-rh/internals.ts');
    expect(content).toContain('readonly cicloReferencia: string | null');
  });
});
