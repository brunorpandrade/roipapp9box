// ROIP APP 9BOX — testes unit dos mapeamentos canonicos (ME-057a).
//
// Cobre `src/app/notificacoes/mappings.ts`:
//   - `CATEGORIA_UI_VALUES` bit-exact §14.19 (8 valores).
//   - `CATEGORIA_BY_TIPO` bit-exact: 17 tipos → 6 categorias mapeadas
//     (plenitude sem tipo).
//   - `resolveCategoriaFromTipo` para os 17 valores canonicos.
//   - `resolveTiposFromCategoria`: cada categoria retorna exatamente os
//     tipos que sao mapeados a ela; 'todos' retorna todos os 17;
//     'plenitude' retorna vazio (integracao futura).
//   - `SEVERIDADE_UI_VALUES` bit-exact §14.19 (5 valores).
//   - `SEVERIDADE_EMOJI` e `SEVERIDADE_LABEL` bit-exact §14.19.
//   - `STATUS_UI_VALUES` e `PERIODO_UI_VALUES` bit-exact §14.19.
//   - Defaults canonicos consolidados.

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_DEFAULT_CATEGORIA,
  CANONICAL_DEFAULT_PAGE,
  CANONICAL_DEFAULT_PAGE_SIZE,
  CANONICAL_DEFAULT_PERIODO,
  CANONICAL_DEFAULT_SEARCH_COLABORADOR,
  CANONICAL_DEFAULT_SEVERIDADE,
  CANONICAL_DEFAULT_STATUS,
  CANONICAL_PAGE_SIZE_VALUES,
  CATEGORIA_BY_TIPO,
  CATEGORIA_UI_LABEL,
  CATEGORIA_UI_VALUES,
  PERIODO_UI_LABEL,
  PERIODO_UI_VALUES,
  resolveCategoriaFromTipo,
  resolveEmojiFromSeveridade,
  resolveLabelFromSeveridade,
  resolveTiposFromCategoria,
  SEVERIDADE_EMOJI,
  SEVERIDADE_LABEL,
  SEVERIDADE_UI_LABEL,
  SEVERIDADE_UI_VALUES,
  STATUS_UI_LABEL,
  STATUS_UI_VALUES,
} from '../../src/app/notificacoes/mappings';
import { NOTIFICATION_TIPO_VALUES, SEVERIDADE_VALUES } from '../../src/db/schema/enums';

describe('ME-057a — mappings.ts (rota /notificacoes)', () => {
  describe('CATEGORIA_UI_VALUES bit-exact §14.19', () => {
    it('contem exatamente os 8 valores canonicos na ordem §14.19', () => {
      expect(CATEGORIA_UI_VALUES).toEqual([
        'todos',
        'desempenho',
        'assiduidade',
        'plenitude',
        'radar_nr1',
        'perfil_individual',
        'administrativos',
        'ciclos_automaticos',
      ]);
    });

    it('todos os 8 valores possuem label canonico literal', () => {
      for (const v of CATEGORIA_UI_VALUES) {
        expect(CATEGORIA_UI_LABEL[v]).toBeTypeOf('string');
        expect(CATEGORIA_UI_LABEL[v].length).toBeGreaterThan(0);
      }
    });

    it('labels canonicos §14.19 bit-exact', () => {
      expect(CATEGORIA_UI_LABEL.todos).toBe('Tipo: todos');
      expect(CATEGORIA_UI_LABEL.desempenho).toBe('Desempenho');
      expect(CATEGORIA_UI_LABEL.assiduidade).toBe('Assiduidade');
      expect(CATEGORIA_UI_LABEL.plenitude).toBe('Plenitude');
      expect(CATEGORIA_UI_LABEL.radar_nr1).toBe('Radar NR-1');
      expect(CATEGORIA_UI_LABEL.perfil_individual).toBe('Perfil Individual');
      expect(CATEGORIA_UI_LABEL.administrativos).toBe('Administrativos');
      expect(CATEGORIA_UI_LABEL.ciclos_automaticos).toBe('Ciclos automáticos');
    });
  });

  describe('CATEGORIA_BY_TIPO mapeamento canonico 17 tipos → 6 categorias', () => {
    it('mapeia todos os 17 tipos do enum sem lacuna', () => {
      const mapped = Object.keys(CATEGORIA_BY_TIPO).sort();
      const enumSorted = [...NOTIFICATION_TIPO_VALUES].sort();
      expect(mapped).toEqual(enumSorted);
    });

    it('radar_nr1 tem 2 tipos (§15.2 NR-1)', () => {
      const tipos = resolveTiposFromCategoria('radar_nr1');
      expect(tipos).toHaveLength(2);
      expect(tipos).toContain('nr1_fator_critico');
      expect(tipos).toContain('nr1_ciclo_fechado');
    });

    it('desempenho tem 4 tipos (3 desempenho + divergencia A/C)', () => {
      const tipos = resolveTiposFromCategoria('desempenho');
      expect(tipos).toHaveLength(4);
      expect(tipos).toContain('desempenho_queda_brusca');
      expect(tipos).toContain('desempenho_estagnacao');
      expect(tipos).toContain('desempenho_queda_isolada');
      expect(tipos).toContain('divergencia_a_c');
    });

    it('assiduidade tem 1 tipo', () => {
      const tipos = resolveTiposFromCategoria('assiduidade');
      expect(tipos).toEqual(['assiduidade_baixa']);
    });

    it('perfil_individual tem 3 tipos', () => {
      const tipos = resolveTiposFromCategoria('perfil_individual');
      expect(tipos).toHaveLength(3);
      expect(tipos).toContain('perfil_inconsistente_primeira');
      expect(tipos).toContain('perfil_retest_consistente');
      expect(tipos).toContain('perfil_retest_reincidente');
    });

    it('administrativos tem 5 tipos (3 desbloqueio + 2 RF)', () => {
      const tipos = resolveTiposFromCategoria('administrativos');
      expect(tipos).toHaveLength(5);
      expect(tipos).toContain('desbloqueio_solicitado');
      expect(tipos).toContain('desbloqueio_aprovado');
      expect(tipos).toContain('desbloqueio_recusado');
      expect(tipos).toContain('fechamento_bloqueado_sem_resp_financeiro');
      expect(tipos).toContain('responsavel_financeiro_nomeado');
    });

    it('ciclos_automaticos tem 2 tipos', () => {
      const tipos = resolveTiposFromCategoria('ciclos_automaticos');
      expect(tipos).toHaveLength(2);
      expect(tipos).toContain('ciclo_instrumento_encerrado');
      expect(tipos).toContain('ciclo_mensal_fechado');
    });

    it('plenitude retorna vazio (integracao futura — sem tipos mapeados)', () => {
      const tipos = resolveTiposFromCategoria('plenitude');
      expect(tipos).toEqual([]);
    });

    it('todos retorna a lista completa dos 17 tipos', () => {
      const tipos = resolveTiposFromCategoria('todos');
      expect(tipos).toHaveLength(17);
      expect([...tipos].sort()).toEqual([...NOTIFICATION_TIPO_VALUES].sort());
    });

    it('cobertura canonica: 2+4+1+3+5+2 = 17 tipos distribuidos em 6 categorias', () => {
      const soma =
        resolveTiposFromCategoria('radar_nr1').length +
        resolveTiposFromCategoria('desempenho').length +
        resolveTiposFromCategoria('assiduidade').length +
        resolveTiposFromCategoria('perfil_individual').length +
        resolveTiposFromCategoria('administrativos').length +
        resolveTiposFromCategoria('ciclos_automaticos').length +
        resolveTiposFromCategoria('plenitude').length;
      expect(soma).toBe(17);
    });
  });

  describe('resolveCategoriaFromTipo — 17 casos canonicos', () => {
    it.each([
      ['nr1_fator_critico', 'radar_nr1'],
      ['nr1_ciclo_fechado', 'radar_nr1'],
      ['desempenho_queda_brusca', 'desempenho'],
      ['desempenho_estagnacao', 'desempenho'],
      ['desempenho_queda_isolada', 'desempenho'],
      ['assiduidade_baixa', 'assiduidade'],
      ['divergencia_a_c', 'desempenho'],
      ['perfil_inconsistente_primeira', 'perfil_individual'],
      ['perfil_retest_consistente', 'perfil_individual'],
      ['perfil_retest_reincidente', 'perfil_individual'],
      ['desbloqueio_solicitado', 'administrativos'],
      ['desbloqueio_aprovado', 'administrativos'],
      ['desbloqueio_recusado', 'administrativos'],
      ['ciclo_instrumento_encerrado', 'ciclos_automaticos'],
      ['ciclo_mensal_fechado', 'ciclos_automaticos'],
      ['fechamento_bloqueado_sem_resp_financeiro', 'administrativos'],
      ['responsavel_financeiro_nomeado', 'administrativos'],
    ] as const)('%s → %s', (tipo, esperada) => {
      expect(resolveCategoriaFromTipo(tipo)).toBe(esperada);
    });
  });

  describe('SEVERIDADE_UI_VALUES bit-exact §14.19', () => {
    it('contem 5 valores na ordem canonica', () => {
      expect(SEVERIDADE_UI_VALUES).toEqual(['todas', 'critico', 'atencao', 'observacao', 'info']);
    });

    it('labels canonicos §14.19 bit-exact', () => {
      expect(SEVERIDADE_UI_LABEL.todas).toBe('Severidade: todas');
      expect(SEVERIDADE_UI_LABEL.critico).toBe('🔴 Crítico');
      expect(SEVERIDADE_UI_LABEL.atencao).toBe('🔶 Atenção');
      expect(SEVERIDADE_UI_LABEL.observacao).toBe('⚪ Observação');
      expect(SEVERIDADE_UI_LABEL.info).toBe('🔵 Info');
    });
  });

  describe('SEVERIDADE_EMOJI + SEVERIDADE_LABEL bit-exact', () => {
    it('cobre 4 severidades do enum', () => {
      const mappedEmoji = Object.keys(SEVERIDADE_EMOJI).sort();
      const enumSorted = [...SEVERIDADE_VALUES].sort();
      expect(mappedEmoji).toEqual(enumSorted);
      const mappedLabel = Object.keys(SEVERIDADE_LABEL).sort();
      expect(mappedLabel).toEqual(enumSorted);
    });

    it('emojis canonicos §14.19', () => {
      expect(SEVERIDADE_EMOJI.info).toBe('🔵');
      expect(SEVERIDADE_EMOJI.observacao).toBe('⚪');
      expect(SEVERIDADE_EMOJI.atencao).toBe('🔶');
      expect(SEVERIDADE_EMOJI.critico).toBe('🔴');
    });

    it('labels canonicos (sem emoji)', () => {
      expect(SEVERIDADE_LABEL.info).toBe('Info');
      expect(SEVERIDADE_LABEL.observacao).toBe('Observação');
      expect(SEVERIDADE_LABEL.atencao).toBe('Atenção');
      expect(SEVERIDADE_LABEL.critico).toBe('Crítico');
    });

    it('resolvers puros retornam bit-exact', () => {
      for (const s of SEVERIDADE_VALUES) {
        expect(resolveEmojiFromSeveridade(s)).toBe(SEVERIDADE_EMOJI[s]);
        expect(resolveLabelFromSeveridade(s)).toBe(SEVERIDADE_LABEL[s]);
      }
    });
  });

  describe('STATUS_UI_VALUES bit-exact §14.19', () => {
    it('5 valores na ordem canonica', () => {
      expect(STATUS_UI_VALUES).toEqual([
        'nao_lidas_e_lidas',
        'nao_lidas',
        'lidas',
        'arquivadas',
        'todas',
      ]);
    });

    it('labels canonicos §14.19 bit-exact', () => {
      expect(STATUS_UI_LABEL.nao_lidas_e_lidas).toBe('Status: não lidas + lidas');
      expect(STATUS_UI_LABEL.nao_lidas).toBe('Não lidas');
      expect(STATUS_UI_LABEL.lidas).toBe('Lidas');
      expect(STATUS_UI_LABEL.arquivadas).toBe('Arquivadas');
      expect(STATUS_UI_LABEL.todas).toBe('Todas (inclui arquivadas)');
    });
  });

  describe('PERIODO_UI_VALUES bit-exact §14.19', () => {
    it('4 valores na ordem canonica', () => {
      expect(PERIODO_UI_VALUES).toEqual([
        'ultimos_30d',
        'ultimos_7d',
        'ultimos_90d',
        'personalizado',
      ]);
    });

    it('labels canonicos §14.19 bit-exact', () => {
      expect(PERIODO_UI_LABEL.ultimos_30d).toBe('Período: últimos 30 dias');
      expect(PERIODO_UI_LABEL.ultimos_7d).toBe('Últimos 7 dias');
      expect(PERIODO_UI_LABEL.ultimos_90d).toBe('Últimos 90 dias');
      expect(PERIODO_UI_LABEL.personalizado).toBe('Personalizado…');
    });
  });

  describe('Defaults canonicos consolidados', () => {
    it('categoria default = "todos"', () => {
      expect(CANONICAL_DEFAULT_CATEGORIA).toBe('todos');
    });
    it('severidade default = "todas"', () => {
      expect(CANONICAL_DEFAULT_SEVERIDADE).toBe('todas');
    });
    it('periodo default = "ultimos_30d"', () => {
      expect(CANONICAL_DEFAULT_PERIODO).toBe('ultimos_30d');
    });
    it('status default = "nao_lidas_e_lidas"', () => {
      expect(CANONICAL_DEFAULT_STATUS).toBe('nao_lidas_e_lidas');
    });
    it('search default = ""', () => {
      expect(CANONICAL_DEFAULT_SEARCH_COLABORADOR).toBe('');
    });
    it('page default = 1', () => {
      expect(CANONICAL_DEFAULT_PAGE).toBe(1);
    });
    it('pageSize default = 25', () => {
      expect(CANONICAL_DEFAULT_PAGE_SIZE).toBe(25);
    });
    it('page size options canonicas', () => {
      expect(CANONICAL_PAGE_SIZE_VALUES).toEqual([25, 50, 100]);
    });
  });
});
