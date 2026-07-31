// ROIP APP 9BOX — teste unit typeDictionary (ME-059).
// Cobre §3 (17 tipos), §6.1 (rotulos legiveis literais), §6.2 (emojis),
// isencoes M1 (9 tipos §8.3) + isencoes M4 (8 tipos §8.6), lista override
// canal atencao→imediato (6 tipos §6.5), trilhas canonicas §7 (padrao +
// apenas_bruno + apenas_rf).

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TIPO_VALUES } from '../../src/db/schema/enums';
import {
  AlertTipoInvalidoError,
  assertTipoCanonico,
  getTipoMetadata,
  SEVERIDADE_EMOJI,
  TIPO_DICTIONARY,
} from '../../src/lib/alerts/typeDictionary';

describe('typeDictionary — enum canonico + metadata bit-exact', () => {
  it('cobre todos os 17 tipos do enum NOTIFICATION_TIPO_VALUES', () => {
    const chavesDict = Object.keys(TIPO_DICTIONARY).sort();
    const chavesEnum = [...NOTIFICATION_TIPO_VALUES].sort();
    expect(chavesDict).toEqual(chavesEnum);
    expect(chavesDict.length).toBe(17);
  });

  it('rotulos legiveis literais §6.1 bit-exact', () => {
    expect(TIPO_DICTIONARY.desempenho_queda_brusca.rotuloLegivel).toBe(
      'Queda brusca de desempenho',
    );
    expect(TIPO_DICTIONARY.desempenho_estagnacao.rotuloLegivel).toBe(
      'Índice de desempenho abaixo do esperado',
    );
    expect(TIPO_DICTIONARY.desempenho_queda_isolada.rotuloLegivel).toBe(
      'Queda pontual de desempenho',
    );
    expect(TIPO_DICTIONARY.assiduidade_baixa.rotuloLegivel).toBe('Assiduidade abaixo do mínimo');
    expect(TIPO_DICTIONARY.divergencia_a_c.rotuloLegivel).toBe(
      'Divergência entre autoavaliação e avaliação do líder',
    );
    expect(TIPO_DICTIONARY.nr1_fator_critico.rotuloLegivel).toBe(
      'Fator do Radar NR-1 em nível crítico',
    );
    expect(TIPO_DICTIONARY.nr1_ciclo_fechado.rotuloLegivel).toBe('Ciclo do Radar NR-1 encerrado');
    expect(TIPO_DICTIONARY.perfil_inconsistente_primeira.rotuloLegivel).toBe(
      'Perfil Individual do colaborador com inconsistência',
    );
    expect(TIPO_DICTIONARY.perfil_retest_consistente.rotuloLegivel).toBe(
      'Perfil Individual — resposta consistente após reteste',
    );
    expect(TIPO_DICTIONARY.perfil_retest_reincidente.rotuloLegivel).toBe(
      'Perfil Individual com inconsistência após reteste',
    );
    expect(TIPO_DICTIONARY.desbloqueio_solicitado.rotuloLegivel).toBe(
      'Solicitação de desbloqueio de mês',
    );
    expect(TIPO_DICTIONARY.desbloqueio_aprovado.rotuloLegivel).toBe(
      'Solicitação de desbloqueio aprovada',
    );
    expect(TIPO_DICTIONARY.desbloqueio_recusado.rotuloLegivel).toBe(
      'Solicitação de desbloqueio recusada',
    );
    expect(TIPO_DICTIONARY.ciclo_instrumento_encerrado.rotuloLegivel).toBe(
      'Instrumento C encerrado',
    );
    expect(TIPO_DICTIONARY.ciclo_mensal_fechado.rotuloLegivel).toBe('Mês fechado para lançamentos');
    expect(TIPO_DICTIONARY.fechamento_bloqueado_sem_resp_financeiro.rotuloLegivel).toBe(
      'Fechamento mensal sem Responsável financeiro',
    );
    expect(TIPO_DICTIONARY.responsavel_financeiro_nomeado.rotuloLegivel).toBe(
      'Você foi nomeado Responsável financeiro',
    );
  });

  it('isencoes M1 canonicas §8.3 — 9 tipos isentos', () => {
    const isentosM1 = NOTIFICATION_TIPO_VALUES.filter((t) => TIPO_DICTIONARY[t].isentoM1);
    expect(isentosM1.sort()).toEqual(
      [
        'nr1_fator_critico',
        'nr1_ciclo_fechado',
        'desbloqueio_solicitado',
        'desbloqueio_aprovado',
        'desbloqueio_recusado',
        'ciclo_instrumento_encerrado',
        'ciclo_mensal_fechado',
        'fechamento_bloqueado_sem_resp_financeiro',
        'responsavel_financeiro_nomeado',
      ].sort(),
    );
    expect(isentosM1.length).toBe(9);
  });

  it('isencoes M4 canonicas §8.6 — 8 tipos isentos', () => {
    const isentosM4 = NOTIFICATION_TIPO_VALUES.filter((t) => TIPO_DICTIONARY[t].isentoM4);
    expect(isentosM4.sort()).toEqual(
      [
        'nr1_ciclo_fechado',
        'desbloqueio_solicitado',
        'desbloqueio_aprovado',
        'desbloqueio_recusado',
        'perfil_retest_reincidente',
        'ciclo_instrumento_encerrado',
        'ciclo_mensal_fechado',
        'fechamento_bloqueado_sem_resp_financeiro',
      ].sort(),
    );
    expect(isentosM4.length).toBe(8);
  });

  it('chave M4 ampliada canonica — apenas nr1_fator_critico', () => {
    const ampliada = NOTIFICATION_TIPO_VALUES.filter((t) => TIPO_DICTIONARY[t].chaveM4Ampliada);
    expect(ampliada).toEqual(['nr1_fator_critico']);
  });

  it('override atencao→imediato canonico §6.5 — 6 tipos', () => {
    const override = NOTIFICATION_TIPO_VALUES.filter(
      (t) => TIPO_DICTIONARY[t].override_atencao_imediato,
    );
    expect(override.sort()).toEqual(
      [
        'desempenho_estagnacao',
        'perfil_inconsistente_primeira',
        'perfil_retest_reincidente',
        'desbloqueio_solicitado',
        'desbloqueio_aprovado',
        'desbloqueio_recusado',
      ].sort(),
    );
    expect(override.length).toBe(6);
  });

  it('trilha padrao canonica §7 — 15 tipos (2 NR-1 + 13 Fase 8)', () => {
    const padrao = NOTIFICATION_TIPO_VALUES.filter((t) => TIPO_DICTIONARY[t].trilha === 'padrao');
    expect(padrao.length).toBe(15);
  });

  it('trilha apenas_bruno canonica §7.3 — apenas D049', () => {
    const apenasBruno = NOTIFICATION_TIPO_VALUES.filter(
      (t) => TIPO_DICTIONARY[t].trilha === 'apenas_bruno',
    );
    expect(apenasBruno).toEqual(['fechamento_bloqueado_sem_resp_financeiro']);
  });

  it('trilha apenas_rf canonica §7.3 — apenas D050', () => {
    const apenasRf = NOTIFICATION_TIPO_VALUES.filter(
      (t) => TIPO_DICTIONARY[t].trilha === 'apenas_rf',
    );
    expect(apenasRf).toEqual(['responsavel_financeiro_nomeado']);
  });

  it('severidades canonicas §3 — mapeamento por tipo', () => {
    // §3.1 NR-1: ambos atencao
    expect(TIPO_DICTIONARY.nr1_fator_critico.severidadePadrao).toBe('atencao');
    expect(TIPO_DICTIONARY.nr1_ciclo_fechado.severidadePadrao).toBe('atencao');
    // §3.2 Desempenho: P07 critico, P08 atencao, B3 observacao
    expect(TIPO_DICTIONARY.desempenho_queda_brusca.severidadePadrao).toBe('critico');
    expect(TIPO_DICTIONARY.desempenho_estagnacao.severidadePadrao).toBe('atencao');
    expect(TIPO_DICTIONARY.desempenho_queda_isolada.severidadePadrao).toBe('observacao');
    // §3.3 Assiduidade: critico
    expect(TIPO_DICTIONARY.assiduidade_baixa.severidadePadrao).toBe('critico');
    // §3.4 Plenitude: observacao
    expect(TIPO_DICTIONARY.divergencia_a_c.severidadePadrao).toBe('observacao');
    // §3.5 Perfil: P27a atencao, P27b observacao, P27c atencao
    expect(TIPO_DICTIONARY.perfil_inconsistente_primeira.severidadePadrao).toBe('atencao');
    expect(TIPO_DICTIONARY.perfil_retest_consistente.severidadePadrao).toBe('observacao');
    expect(TIPO_DICTIONARY.perfil_retest_reincidente.severidadePadrao).toBe('atencao');
    // §3.6 Desbloqueios: todos atencao (T1 canonizada)
    expect(TIPO_DICTIONARY.desbloqueio_solicitado.severidadePadrao).toBe('atencao');
    expect(TIPO_DICTIONARY.desbloqueio_aprovado.severidadePadrao).toBe('atencao');
    expect(TIPO_DICTIONARY.desbloqueio_recusado.severidadePadrao).toBe('atencao');
    // §3.7 Ciclos auto: ambos atencao
    expect(TIPO_DICTIONARY.ciclo_instrumento_encerrado.severidadePadrao).toBe('atencao');
    expect(TIPO_DICTIONARY.ciclo_mensal_fechado.severidadePadrao).toBe('atencao');
    // §3.8 RF: D049 critico, D050 info
    expect(TIPO_DICTIONARY.fechamento_bloqueado_sem_resp_financeiro.severidadePadrao).toBe(
      'critico',
    );
    expect(TIPO_DICTIONARY.responsavel_financeiro_nomeado.severidadePadrao).toBe('info');
  });

  it('escopos canonicos §3 — mapeamento por tipo', () => {
    // NR-1 fator_critico: null (empresa OU departamento — §3.1.1)
    expect(TIPO_DICTIONARY.nr1_fator_critico.escopoCanonico).toBe(null);
    // NR-1 ciclo_fechado: empresa
    expect(TIPO_DICTIONARY.nr1_ciclo_fechado.escopoCanonico).toBe('empresa');
    // Desempenho/Assiduidade/Plenitude/Perfil: colaborador
    expect(TIPO_DICTIONARY.desempenho_queda_brusca.escopoCanonico).toBe('colaborador');
    expect(TIPO_DICTIONARY.assiduidade_baixa.escopoCanonico).toBe('colaborador');
    expect(TIPO_DICTIONARY.divergencia_a_c.escopoCanonico).toBe('colaborador');
    expect(TIPO_DICTIONARY.perfil_retest_consistente.escopoCanonico).toBe('colaborador');
    // Administrativos + D049: empresa
    expect(TIPO_DICTIONARY.desbloqueio_solicitado.escopoCanonico).toBe('empresa');
    expect(TIPO_DICTIONARY.ciclo_instrumento_encerrado.escopoCanonico).toBe('empresa');
    expect(TIPO_DICTIONARY.fechamento_bloqueado_sem_resp_financeiro.escopoCanonico).toBe('empresa');
    // D050: colaborador
    expect(TIPO_DICTIONARY.responsavel_financeiro_nomeado.escopoCanonico).toBe('colaborador');
  });
});

describe('SEVERIDADE_EMOJI — emojis canonicos §6.2', () => {
  it('mapeamento bit-exact §6.2', () => {
    expect(SEVERIDADE_EMOJI.critico).toBe('🔴');
    expect(SEVERIDADE_EMOJI.atencao).toBe('🔶');
    expect(SEVERIDADE_EMOJI.observacao).toBe('⚪');
    expect(SEVERIDADE_EMOJI.info).toBe('🔵');
  });
});

describe('assertTipoCanonico — guardiao de entrada', () => {
  it('nao lanca para valores canonicos', () => {
    for (const tipo of NOTIFICATION_TIPO_VALUES) {
      expect(() => assertTipoCanonico(tipo)).not.toThrow();
    }
  });

  it('lanca AlertTipoInvalidoError para valor fora do enum', () => {
    expect(() => assertTipoCanonico('nao_existe')).toThrow(AlertTipoInvalidoError);
    expect(() => assertTipoCanonico('')).toThrow(AlertTipoInvalidoError);
    expect(() => assertTipoCanonico('desempenho_qualquer')).toThrow(AlertTipoInvalidoError);
  });

  it('mensagem de erro inclui o tipo recebido e lista canonica', () => {
    try {
      assertTipoCanonico('foo');
    } catch (err) {
      expect(err).toBeInstanceOf(AlertTipoInvalidoError);
      expect((err as AlertTipoInvalidoError).tipoRecebido).toBe('foo');
      expect((err as Error).message).toContain('foo');
      expect((err as Error).message).toContain('nr1_fator_critico');
    }
  });
});

describe('getTipoMetadata — recuperacao denso do dicionario', () => {
  it('devolve metadata bit-exact do TIPO_DICTIONARY', () => {
    const meta = getTipoMetadata('desempenho_queda_brusca');
    expect(meta).toEqual(TIPO_DICTIONARY.desempenho_queda_brusca);
  });
});
