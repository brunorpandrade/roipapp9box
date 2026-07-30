// ROIP APP 9BOX — testes unit dos filtros canonicos (ME-057a).
//
// Cobre `src/app/notificacoes/filters.ts`:
//   - `parseFiltersFromSearchParams` bit-exact §14.19.
//   - `resolvePeriodoRange` para os 4 valores de periodo canonicos.
//   - `normalizeSearchColaborador` e `validateSearchColaborador`
//     (limites 2 chars minimo, 100 chars maximo).
//   - `CANONICAL_DEFAULT_FILTERS` consolidado.
//   - `SELECAO_LOTE_CAP` = 500 e `TOAST_LIMITE_SELECAO_MSG` bit-exact.

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_DEFAULT_FILTERS,
  normalizeSearchColaborador,
  parseFiltersFromSearchParams,
  resolvePeriodoRange,
  SELECAO_LOTE_CAP,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  TOAST_LIMITE_SELECAO_MSG,
  validateSearchColaborador,
} from '../../src/app/notificacoes/filters';

describe('ME-057a — filters.ts (rota /notificacoes)', () => {
  describe('CANONICAL_DEFAULT_FILTERS bit-exact §14.19', () => {
    it('estado canonico bit-exact', () => {
      expect(CANONICAL_DEFAULT_FILTERS).toEqual({
        categoria: 'todos',
        severidade: 'todas',
        periodo: 'ultimos_30d',
        periodoPersonalizadoInicio: null,
        periodoPersonalizadoFim: null,
        status: 'nao_lidas_e_lidas',
        searchColaborador: '',
        page: 1,
        pageSize: 25,
      });
    });
  });

  describe('parseFiltersFromSearchParams — valores validos', () => {
    it('parse completo de todos os filtros', () => {
      const params = {
        categoria: 'desempenho',
        severidade: 'critico',
        periodo: 'ultimos_7d',
        status: 'nao_lidas',
        q: 'Silva Souza',
        page: '3',
        pageSize: '50',
      };
      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed).toEqual({
        categoria: 'desempenho',
        severidade: 'critico',
        periodo: 'ultimos_7d',
        periodoPersonalizadoInicio: null,
        periodoPersonalizadoFim: null,
        status: 'nao_lidas',
        searchColaborador: 'Silva Souza',
        page: 3,
        pageSize: 50,
      });
    });

    it('periodo personalizado com datas validas', () => {
      const params = {
        periodo: 'personalizado',
        pInicio: '2026-06-01',
        pFim: '2026-06-30',
      };
      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed.periodo).toBe('personalizado');
      expect(parsed.periodoPersonalizadoInicio).toBe('2026-06-01');
      expect(parsed.periodoPersonalizadoFim).toBe('2026-06-30');
    });

    it('periodo personalizado com pInicio invalido → null', () => {
      const params = {
        periodo: 'personalizado',
        pInicio: '01/06/2026', // formato errado
        pFim: '2026-06-30',
      };
      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed.periodoPersonalizadoInicio).toBe(null);
      expect(parsed.periodoPersonalizadoFim).toBe('2026-06-30');
    });

    it('pInicio/pFim ignorados quando periodo != personalizado', () => {
      const params = {
        periodo: 'ultimos_30d',
        pInicio: '2026-06-01',
        pFim: '2026-06-30',
      };
      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed.periodoPersonalizadoInicio).toBe(null);
      expect(parsed.periodoPersonalizadoFim).toBe(null);
    });
  });

  describe('parseFiltersFromSearchParams — valores invalidos caem em default', () => {
    it('valor de enum invalido → default', () => {
      const parsed = parseFiltersFromSearchParams({
        categoria: 'inventado',
        severidade: 'nao_existe',
        periodo: 'quinquenio',
        status: 'x',
      });
      expect(parsed.categoria).toBe('todos');
      expect(parsed.severidade).toBe('todas');
      expect(parsed.periodo).toBe('ultimos_30d');
      expect(parsed.status).toBe('nao_lidas_e_lidas');
    });

    it('page nao-numerico → default 1', () => {
      const parsed = parseFiltersFromSearchParams({ page: 'abc' });
      expect(parsed.page).toBe(1);
    });

    it('page zero ou negativo → default 1', () => {
      expect(parseFiltersFromSearchParams({ page: '0' }).page).toBe(1);
      expect(parseFiltersFromSearchParams({ page: '-5' }).page).toBe(1);
    });

    it('pageSize fora do enum {25,50,100} → default 25', () => {
      expect(parseFiltersFromSearchParams({ pageSize: '10' }).pageSize).toBe(25);
      expect(parseFiltersFromSearchParams({ pageSize: '200' }).pageSize).toBe(25);
      expect(parseFiltersFromSearchParams({ pageSize: 'x' }).pageSize).toBe(25);
    });

    it('parametros vazios → defaults canonicos completos', () => {
      const parsed = parseFiltersFromSearchParams({});
      expect(parsed).toEqual(CANONICAL_DEFAULT_FILTERS);
    });

    it('array em vez de string usa primeiro elemento', () => {
      const parsed = parseFiltersFromSearchParams({
        categoria: ['desempenho', 'assiduidade'],
      });
      expect(parsed.categoria).toBe('desempenho');
    });
  });

  describe('parseFiltersFromSearchParams — search q', () => {
    it('q vazio → ""', () => {
      expect(parseFiltersFromSearchParams({ q: '' }).searchColaborador).toBe('');
    });

    it('q com 1 char → "" (abaixo do minimo canonico)', () => {
      expect(parseFiltersFromSearchParams({ q: 'a' }).searchColaborador).toBe('');
    });

    it('q com 2 chars → mantido', () => {
      expect(parseFiltersFromSearchParams({ q: 'jo' }).searchColaborador).toBe('jo');
    });

    it('q com espacos e menos de 2 chars uteis → ""', () => {
      expect(parseFiltersFromSearchParams({ q: '  a  ' }).searchColaborador).toBe('');
    });

    it('q com mais de 100 chars → trunca em 100', () => {
      const longo = 'a'.repeat(200);
      const parsed = parseFiltersFromSearchParams({ q: longo });
      expect(parsed.searchColaborador).toHaveLength(100);
    });
  });

  describe('normalizeSearchColaborador — regras §14.19', () => {
    it('vazio → ""', () => {
      expect(normalizeSearchColaborador('')).toBe('');
    });
    it('trim e retorna vazio se < 2 chars', () => {
      expect(normalizeSearchColaborador('  a  ')).toBe('');
      expect(normalizeSearchColaborador('a')).toBe('');
    });
    it('trim preservado se >= 2 chars', () => {
      expect(normalizeSearchColaborador('  jo  ')).toBe('jo');
      expect(normalizeSearchColaborador('Silva')).toBe('Silva');
    });
    it('trunca em 100 chars canonicos', () => {
      const longo = 'x'.repeat(150);
      expect(normalizeSearchColaborador(longo)).toHaveLength(100);
    });
  });

  describe('validateSearchColaborador — informa razao canonica', () => {
    it('vazio → too_short', () => {
      const r = validateSearchColaborador('');
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.reason).toBe('too_short');
    });
    it('1 char → too_short', () => {
      const r = validateSearchColaborador('a');
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.reason).toBe('too_short');
    });
    it('2 chars → valid', () => {
      const r = validateSearchColaborador('jo');
      expect(r.valid).toBe(true);
      if (r.valid) expect(r.trimmed).toBe('jo');
    });
    it('100 chars → valid', () => {
      const r = validateSearchColaborador('x'.repeat(100));
      expect(r.valid).toBe(true);
    });
    it('101 chars → truncated', () => {
      const r = validateSearchColaborador('x'.repeat(101));
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.reason).toBe('truncated');
    });
    it('constantes canonicas §14.19', () => {
      expect(SEARCH_MIN_LENGTH).toBe(2);
      expect(SEARCH_MAX_LENGTH).toBe(100);
    });
  });

  describe('resolvePeriodoRange — 4 opcoes canonicas', () => {
    // Data ancora canonica dos testes: 2026-07-30 (dia da ME).
    const hoje = new Date(Date.UTC(2026, 6, 30));

    it('ultimos_7d: from = hoje-7d 00:00, to = hoje+1d 00:00', () => {
      const r = resolvePeriodoRange('ultimos_7d', null, null, hoje);
      expect(r).not.toBe(null);
      if (r !== null) {
        expect(r.from.toISOString()).toBe('2026-07-23T00:00:00.000Z');
        expect(r.to.toISOString()).toBe('2026-07-31T00:00:00.000Z');
      }
    });

    it('ultimos_30d: from = hoje-30d 00:00', () => {
      const r = resolvePeriodoRange('ultimos_30d', null, null, hoje);
      expect(r).not.toBe(null);
      if (r !== null) {
        expect(r.from.toISOString()).toBe('2026-06-30T00:00:00.000Z');
        expect(r.to.toISOString()).toBe('2026-07-31T00:00:00.000Z');
      }
    });

    it('ultimos_90d: from = hoje-90d 00:00', () => {
      const r = resolvePeriodoRange('ultimos_90d', null, null, hoje);
      expect(r).not.toBe(null);
      if (r !== null) {
        expect(r.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
        expect(r.to.toISOString()).toBe('2026-07-31T00:00:00.000Z');
      }
    });

    it('personalizado com datas validas', () => {
      const r = resolvePeriodoRange('personalizado', '2026-01-15', '2026-02-28', hoje);
      expect(r).not.toBe(null);
      if (r !== null) {
        expect(r.from.toISOString()).toBe('2026-01-15T00:00:00.000Z');
        // to exclusivo = fim + 1 dia
        expect(r.to.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      }
    });

    it('personalizado sem pInicio → null', () => {
      const r = resolvePeriodoRange('personalizado', null, '2026-06-30', hoje);
      expect(r).toBe(null);
    });

    it('personalizado sem pFim → null', () => {
      const r = resolvePeriodoRange('personalizado', '2026-06-01', null, hoje);
      expect(r).toBe(null);
    });

    it('personalizado com pInicio invalido → null', () => {
      const r = resolvePeriodoRange('personalizado', '2026-02-31', '2026-06-30', hoje);
      expect(r).toBe(null);
    });

    it('personalizado com pFim < pInicio → null', () => {
      const r = resolvePeriodoRange('personalizado', '2026-06-30', '2026-06-01', hoje);
      expect(r).toBe(null);
    });
  });

  describe('cap canonico de selecao em lote §14.19', () => {
    it('SELECAO_LOTE_CAP = 500', () => {
      expect(SELECAO_LOTE_CAP).toBe(500);
    });
    it('TOAST_LIMITE_SELECAO_MSG bit-exact §14.19', () => {
      expect(TOAST_LIMITE_SELECAO_MSG).toBe('Limite de 500 notificações por seleção atingido.');
    });
  });
});
