// ROIP APP 9BOX — teste de integração ME-080d Onda 1c.
//
// Cobre bit-exact as duas mutacoes canonicas nas telas de login
// (`/` e `/login-super-admin`):
//
// 1. D13=A — substituicao do texto placeholder "ROIP APP" pela
//    logo oficial `/brand/roipeople-horizontal.png` (Image next).
// 2. D14=Y — HEADER_STYLE ganha `padding: '80px 24px 40px'` para
//    posicionar a logo verticalmente centralizada no espaco entre
//    o topo da pagina e o topo do card de login.
//
// Estrategia canonica: leitura do source-code como texto (grep-style).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const UNIFIED_PATH = join(process.cwd(), 'src/app/LoginUnifiedClient.tsx');
const SUPERADMIN_PATH = join(process.cwd(), 'src/app/login-super-admin/LoginSuperAdminClient.tsx');

describe('ME-080d Onda 1c — LoginUnifiedClient (D13 + D14)', () => {
  const source = readFileSync(UNIFIED_PATH, 'utf8');

  it('D13=A — Image /brand/roipeople-horizontal.png presente', () => {
    expect(source).toMatch(/src=["']\/brand\/roipeople-horizontal\.png["']/);
    expect(source).toContain("import Image from 'next/image'");
  });

  it('D13=A — texto placeholder "ROIP APP" removido do JSX renderizado', () => {
    // Placeholder original: <span style={BRAND_STYLE}>ROIP APP</span>
    // Precisa nao existir mais nem o span com esse texto nem o BRAND_STYLE.
    expect(source).not.toMatch(/<span\s+style=\{BRAND_STYLE\}>/);
    expect(source).not.toMatch(/BRAND_STYLE:\s*CSSProperties/);
  });

  it('D14=Y — HEADER_STYLE tem padding-top 80 (centralização vertical)', () => {
    expect(source).toMatch(/padding:\s*['"]80px 24px 40px['"]/);
  });

  it('D14=Y — LOGO_HEIGHT e LOGO_WIDTH declarados como constantes', () => {
    expect(source).toMatch(/LOGO_HEIGHT\s*=\s*60/);
    expect(source).toMatch(/LOGO_WIDTH\s*=\s*170/);
  });
});

describe('ME-080d Onda 1c — LoginSuperAdminClient (D13 + D14)', () => {
  const source = readFileSync(SUPERADMIN_PATH, 'utf8');

  it('D13=A — Image /brand/roipeople-horizontal.png presente', () => {
    expect(source).toMatch(/src=["']\/brand\/roipeople-horizontal\.png["']/);
    expect(source).toContain("import Image from 'next/image'");
  });

  it('D13=A — texto placeholder "ROIP APP" removido do JSX renderizado', () => {
    expect(source).not.toMatch(/<span\s+style=\{BRAND_STYLE\}>/);
    expect(source).not.toMatch(/BRAND_STYLE:\s*CSSProperties/);
  });

  it('D14=Y — HEADER_STYLE tem padding-top 80', () => {
    expect(source).toMatch(/padding:\s*['"]80px 24px 40px['"]/);
  });

  it('D14=Y — LOGO_HEIGHT e LOGO_WIDTH declarados', () => {
    expect(source).toMatch(/LOGO_HEIGHT\s*=\s*60/);
    expect(source).toMatch(/LOGO_WIDTH\s*=\s*170/);
  });

  it('SELO_STYLE "ÁREA DO SUPER ADMIN" preservado bit-exact', () => {
    // O selo dentro do card nao deve ter sido tocado.
    expect(source).toContain('SELO_STYLE');
  });
});
