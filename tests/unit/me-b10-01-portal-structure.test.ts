// ROIP APP 9BOX — teste estrutural ME-B10-01 (portal do colaborador
// desktop). Protege padrão contra regressão silenciosa.
//
// Cobertura:
//   1. Arquivos canônicos existem nos caminhos esperados.
//   2. Route Handler novo `/api/portal/pendencias` exporta apenas
//      `GET` (S207 + Next 15 App Router).
//   3. `internals.ts` do handler exporta as constantes canônicas.
//   4. Helper `loadPortalColaboradorPendencias` é exportado do lib
//      canônico `src/lib/pendencias/portalColaborador.ts`.
//   5. Server pages `/colaborador`, `/colaborador/gate-lgpd`,
//      `/colaborador/pendencias` existem como `page.tsx`.
//   6. Client components esperados estão em
//      `src/components/portal-colaborador/`.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf-8');
}

describe('ME-B10-01 — estrutura canônica do portal do colaborador desktop', () => {
  const arquivosObrigatorios = [
    'src/lib/pendencias/portalColaborador.ts',
    'src/app/api/portal/pendencias/route.ts',
    'src/app/api/portal/pendencias/internals.ts',
    'src/app/colaborador/page.tsx',
    'src/app/colaborador/gate-lgpd/page.tsx',
    'src/app/colaborador/pendencias/page.tsx',
    'src/components/portal-colaborador/PortalLayout.tsx',
    'src/components/portal-colaborador/PrivacyModal.tsx',
    'src/components/portal-colaborador/ColaboradorLoginClient.tsx',
    'src/components/portal-colaborador/GateLgpdClient.tsx',
    'src/components/portal-colaborador/PendenciasClient.tsx',
  ] as const;

  it.each(arquivosObrigatorios)('arquivo canônico %s existe', (path) => {
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true);
  });

  it('route handler exporta apenas GET (S207 + Next 15 App Router)', () => {
    const content = readSrc('src/app/api/portal/pendencias/route.ts');
    expect(content).toContain('export async function GET');
    expect(content).not.toContain('export async function POST');
    expect(content).not.toContain('export async function PUT');
    expect(content).not.toContain('export async function DELETE');
    expect(content).not.toContain('export async function PATCH');
  });

  it('internals do handler exporta mensagens canônicas', () => {
    const content = readSrc('src/app/api/portal/pendencias/internals.ts');
    expect(content).toContain('MSG_MISSING_TOKEN_PORTAL_PENDENCIAS');
    expect(content).toContain('MSG_INVALID_TOKEN_PORTAL_PENDENCIAS');
    expect(content).toContain('MSG_EXPIRED_TOKEN_PORTAL_PENDENCIAS');
    expect(content).toContain('getDbClient');
  });

  it('helper canônico exporta loadPortalColaboradorPendencias', () => {
    const content = readSrc('src/lib/pendencias/portalColaborador.ts');
    expect(content).toContain('export async function loadPortalColaboradorPendencias');
    expect(content).toContain('export interface PortalColaboradorPendencias');
    expect(content).toContain('export interface PortalPendenciaCard');
    expect(content).toContain('export interface PortalRespondidoRecente');
  });

  it('helper importa resolveDatabaseUrl do lib canônico (L126)', () => {
    // Confere que o handler consome resolveDatabaseUrl do lib canônico
    // (S250 + L126 preservado bit-a-bit — ME-D101).
    const content = readSrc('src/app/api/portal/pendencias/internals.ts');
    expect(content).toContain("from '../../../../lib/db/resolveDatabaseUrl'");
  });

  it('handler consome verifyPortalToken canônico (S207 + S343)', () => {
    const content = readSrc('src/app/api/portal/pendencias/route.ts');
    expect(content).toContain('verifyPortalToken');
    expect(content).toContain('authorization');
    expect(content).toContain('bearer');
  });

  it('ColaboradorLoginClient contém campo matrícula (S248 Opção B)', () => {
    const content = readSrc('src/components/portal-colaborador/ColaboradorLoginClient.tsx');
    expect(content).toContain('matricula');
    expect(content).toContain('Matrícula');
  });

  it('PrivacyModal usa GET /api/portal/lgpd/portability (S249 Opção A)', () => {
    const content = readSrc('src/components/portal-colaborador/PrivacyModal.tsx');
    expect(content).toContain('/api/portal/lgpd/portability?token=');
    expect(content).toContain('window.location.assign');
  });

  it('PendenciasClient guard client-side quando sem portalToken', () => {
    const content = readSrc('src/components/portal-colaborador/PendenciasClient.tsx');
    expect(content).toContain("router.replace('/colaborador')");
    expect(content).toContain("sessionStorage.getItem('portalToken')");
  });
});
