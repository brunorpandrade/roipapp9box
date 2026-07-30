// ROIP APP 9BOX — teste unit DAL filters + mappings (ME-057b Bloco E).
// Cobre CC043 aprovada em ME-057b: busca unificada (1 campo canonico),
// label default dropdown "Todos os tipos de acesso" (mockup), parse
// tolerante de searchParams, resolveTipoAcessoLabel bit-exact §14.22.

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_DAL_DEFAULT_FILTERS,
  parseDALFiltersFromSearchParams,
  normalizeSearchTitularAgente,
  resolveTipoAcessoLabel,
  TIPO_ACESSO_LABEL_TODOS,
} from '../../src/lib/logs/dataAccessLog';
import { TIPO_ACESSO_VALUES } from '../../src/db/schema/enums';

describe('DAL filters + mappings — CC043 (mockup prevalece)', () => {
  describe('CANONICAL_DAL_DEFAULT_FILTERS', () => {
    it('todos nulos, page=1, pageSize=25', () => {
      expect(CANONICAL_DAL_DEFAULT_FILTERS).toEqual({
        search: null,
        tipoAcesso: null,
        periodoInicio: null,
        periodoFim: null,
        empresaId: null,
        page: 1,
        pageSize: 25,
      });
    });
  });

  describe('normalizeSearchTitularAgente — busca unificada CC043', () => {
    it('null → null', () => {
      expect(normalizeSearchTitularAgente(null)).toBeNull();
    });

    it('string vazia → null', () => {
      expect(normalizeSearchTitularAgente('')).toBeNull();
    });

    it('apenas espacos → null (trim primeiro)', () => {
      expect(normalizeSearchTitularAgente('   ')).toBeNull();
    });

    it('menos de 2 chars (aa min-length) → null', () => {
      expect(normalizeSearchTitularAgente('a')).toBeNull();
      expect(normalizeSearchTitularAgente(' b ')).toBeNull();
    });

    it('exatamente 2 chars → aceita', () => {
      expect(normalizeSearchTitularAgente('ab')).toBe('ab');
      expect(normalizeSearchTitularAgente('  cd  ')).toBe('cd');
    });

    it('mais de 100 chars → truncado a 100', () => {
      const big = 'x'.repeat(150);
      const r = normalizeSearchTitularAgente(big);
      expect(r).not.toBeNull();
      expect(r!.length).toBe(100);
    });

    it('string longa exata em 100 chars → preservada', () => {
      const at100 = 'y'.repeat(100);
      expect(normalizeSearchTitularAgente(at100)).toBe(at100);
    });

    it('unicode PT-BR preservado (acentos)', () => {
      expect(normalizeSearchTitularAgente('João Ávila')).toBe('João Ávila');
    });
  });

  describe('resolveTipoAcessoLabel — mockup bit-exact', () => {
    it('dashboard_individual → Dashboard individual', () => {
      expect(resolveTipoAcessoLabel('dashboard_individual')).toBe('Dashboard individual');
    });

    it('relatorio_perfil_individual → Relatorio do Perfil Individual', () => {
      expect(resolveTipoAcessoLabel('relatorio_perfil_individual')).toBe(
        'Relatório do Perfil Individual',
      );
    });

    it('exportacao_planilha → Exportacao em planilha', () => {
      expect(resolveTipoAcessoLabel('exportacao_planilha')).toBe('Exportação em planilha');
    });

    it('cobre exaustivamente os 3 values do enum', () => {
      for (const v of TIPO_ACESSO_VALUES) {
        expect(resolveTipoAcessoLabel(v).length).toBeGreaterThan(0);
      }
    });
  });

  describe('TIPO_ACESSO_LABEL_TODOS — CC043 label do default dropdown', () => {
    it('exato bit-exact ao mockup: "Todos os tipos de acesso"', () => {
      expect(TIPO_ACESSO_LABEL_TODOS).toBe('Todos os tipos de acesso');
    });
  });

  describe('parseDALFiltersFromSearchParams — parse tolerante Next 15', () => {
    it('params vazios → default canonico com busca null', () => {
      const r = parseDALFiltersFromSearchParams({});
      expect(r).toEqual(CANONICAL_DAL_DEFAULT_FILTERS);
    });

    it('q com busca >= 2 chars → preservada', () => {
      const r = parseDALFiltersFromSearchParams({ q: 'Maria' });
      expect(r.search).toBe('Maria');
    });

    it('q com 1 char → null (invalidada por normalize)', () => {
      const r = parseDALFiltersFromSearchParams({ q: 'X' });
      expect(r.search).toBeNull();
    });

    it('tipo valido → preservado', () => {
      const r = parseDALFiltersFromSearchParams({ tipo: 'dashboard_individual' });
      expect(r.tipoAcesso).toBe('dashboard_individual');
    });

    it('tipo invalido (nao no enum) → null', () => {
      const r = parseDALFiltersFromSearchParams({ tipo: 'inexistente' });
      expect(r.tipoAcesso).toBeNull();
    });

    it('de e ate ISO validos → Date parseado', () => {
      const r = parseDALFiltersFromSearchParams({ de: '2026-01-01', ate: '2026-06-30' });
      expect(r.periodoInicio).toBeInstanceOf(Date);
      expect(r.periodoFim).toBeInstanceOf(Date);
      expect(r.periodoInicio!.getFullYear()).toBe(2026);
    });

    it('de invalido → null', () => {
      const r = parseDALFiltersFromSearchParams({ de: 'nao-e-data' });
      expect(r.periodoInicio).toBeNull();
    });

    it('empresa int positivo → preservado', () => {
      const r = parseDALFiltersFromSearchParams({ empresa: '42' });
      expect(r.empresaId).toBe(42);
    });

    it('empresa zero ou negativo → null', () => {
      expect(parseDALFiltersFromSearchParams({ empresa: '0' }).empresaId).toBeNull();
      expect(parseDALFiltersFromSearchParams({ empresa: '-5' }).empresaId).toBeNull();
    });

    it('empresa nao-numerico → null', () => {
      expect(parseDALFiltersFromSearchParams({ empresa: 'abc' }).empresaId).toBeNull();
    });

    it('page valido → preservado', () => {
      expect(parseDALFiltersFromSearchParams({ page: '3' }).page).toBe(3);
    });

    it('page 0 ou negativo → 1', () => {
      expect(parseDALFiltersFromSearchParams({ page: '0' }).page).toBe(1);
      expect(parseDALFiltersFromSearchParams({ page: '-1' }).page).toBe(1);
    });

    it('pageSize 25/50/100 → preservado', () => {
      expect(parseDALFiltersFromSearchParams({ pageSize: '25' }).pageSize).toBe(25);
      expect(parseDALFiltersFromSearchParams({ pageSize: '50' }).pageSize).toBe(50);
      expect(parseDALFiltersFromSearchParams({ pageSize: '100' }).pageSize).toBe(100);
    });

    it('pageSize invalido (nao 25/50/100) → 25 default canonico', () => {
      expect(parseDALFiltersFromSearchParams({ pageSize: '30' }).pageSize).toBe(25);
      expect(parseDALFiltersFromSearchParams({ pageSize: '200' }).pageSize).toBe(25);
      expect(parseDALFiltersFromSearchParams({ pageSize: 'abc' }).pageSize).toBe(25);
    });

    it('array em params (Next 15 permite string[]) → pega o primeiro', () => {
      const r = parseDALFiltersFromSearchParams({ q: ['Ana', 'Bob'] });
      expect(r.search).toBe('Ana');
    });

    it('combinacao de todos os filtros', () => {
      const r = parseDALFiltersFromSearchParams({
        q: 'Silva',
        tipo: 'relatorio_perfil_individual',
        de: '2026-01-01',
        ate: '2026-12-31',
        empresa: '7',
        page: '2',
        pageSize: '50',
      });
      expect(r).toEqual({
        search: 'Silva',
        tipoAcesso: 'relatorio_perfil_individual',
        periodoInicio: expect.any(Date),
        periodoFim: expect.any(Date),
        empresaId: 7,
        page: 2,
        pageSize: 50,
      });
    });
  });
});
