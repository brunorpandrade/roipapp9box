// ROIP APP 9BOX — teste estrutural (ME-fila7 construcao dispatch 1).
//
// Cobre os exports puros da tela de Faturamento mensal e a mudanca de
// menu (item "Faturamento da empresa" no menu Super Admin dentro-de-
// empresa; item condicional RF na plataforma). A regra de negocio de
// faturamento continua coberta por `tests/integration/revenue-router`.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  addMonthsToMes,
  currentMesUTC,
  enumerateJanelaDesc,
  formatBRL,
  formatMesLabel,
} from '../../src/components/faturamento/internals';
import { resolveMenuItems } from '../../src/lib/menu/menuConfig';

const REPO_ROOT = resolve(__dirname, '../..');

describe('faturamento — helpers puros', () => {
  it('currentMesUTC devolve YYYY-MM', () => {
    expect(currentMesUTC(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06');
  });

  it('addMonthsToMes atravessa a virada de ano nos dois sentidos', () => {
    expect(addMonthsToMes('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToMes('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToMes('2026-06', 0)).toBe('2026-06');
  });

  it('formatMesLabel rotula em pt-BR', () => {
    expect(formatMesLabel('2026-06')).toBe('Junho 2026');
  });

  it('enumerateJanelaDesc devolve N meses decrescentes', () => {
    expect(enumerateJanelaDesc('2026-03', 3)).toEqual(['2026-03', '2026-02', '2026-01']);
  });

  it('formatBRL formata e trata nulo/invalido', () => {
    expect(formatBRL(null)).toBe('—');
    expect(formatBRL('abc')).toBe('—');
    expect(formatBRL('1234567.89')).toContain('R$');
    expect(formatBRL('1234567.89')).toContain('1.234.567,89');
  });
});

describe('faturamento — menu', () => {
  it('Super Admin dentro-de-empresa expoe o item com companyId resolvido', () => {
    const items = resolveMenuItems('super_admin_in_company', false, 2);
    expect(items).not.toBeNull();
    const hrefs = (items ?? [])
      .filter((i): i is Extract<typeof i, { type: 'link' }> => i.type === 'link')
      .map((i) => i.href);
    expect(hrefs).toContain('/super-admin/empresa/2/faturamento-mensal');
  });

  it('plataforma exibe faturamento apenas quando RF', () => {
    const comRf = resolveMenuItems('rh', true) ?? [];
    const semRf = resolveMenuItems('rh', false) ?? [];
    const hrefsCom = comRf
      .filter((i): i is Extract<typeof i, { type: 'link' }> => i.type === 'link')
      .map((i) => i.href);
    const hrefsSem = semRf
      .filter((i): i is Extract<typeof i, { type: 'link' }> => i.type === 'link')
      .map((i) => i.href);
    expect(hrefsCom).toContain('/faturamento-mensal');
    expect(hrefsSem).not.toContain('/faturamento-mensal');
  });
});

describe('faturamento — rotas existem', () => {
  it('as duas pages estao presentes', () => {
    expect(existsSync(resolve(REPO_ROOT, 'src/app/faturamento-mensal/page.tsx'))).toBe(true);
    expect(
      existsSync(
        resolve(REPO_ROOT, 'src/app/super-admin/empresa/[id]/faturamento-mensal/page.tsx'),
      ),
    ).toBe(true);
  });
});
