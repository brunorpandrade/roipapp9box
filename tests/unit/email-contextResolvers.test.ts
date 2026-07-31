// ROIP APP 9BOX — teste unitario `contextResolvers` (ME-060).
// Cobre §12.6 regras canonicas de renderizacao de contexto por tipo:
// 15 resolvers bit-exact (D050 retorna vazio — §12.6 linha 1428).

import { describe, expect, it } from 'vitest';

import { resolveContextoCurto } from '../../src/lib/email/contextResolvers';

describe('resolveContextoCurto — §12.6 bit-exact', () => {
  it('desempenho_queda_brusca — variacao pp entre trimestres', () => {
    const meta = {
      colaboradorNome: 'Ana Silva',
      variacao: -20,
      trimestreAnterior: '2025-T4',
      trimestre: '2026-T1',
      scoreAtual: 55,
    };
    expect(resolveContextoCurto('desempenho_queda_brusca', meta)).toBe(
      'Ana Silva — variacao -20 pp entre 2025-T4 e 2026-T1 (score atual: 55)',
    );
  });

  it('desempenho_queda_isolada — mesmo formato de queda_brusca', () => {
    const meta = {
      colaboradorNome: 'Beto Costa',
      variacao: -8,
      trimestreAnterior: '2025-T4',
      trimestre: '2026-T1',
      scoreAtual: 72,
    };
    expect(resolveContextoCurto('desempenho_queda_isolada', meta)).toBe(
      'Beto Costa — variacao -8 pp entre 2025-T4 e 2026-T1 (score atual: 72)',
    );
  });

  it('desempenho_estagnacao — indice em 3 meses', () => {
    const meta = {
      colaboradorNome: 'Carla Dias',
      indiceAtual: 60,
      mesAtual: '2026-06',
      indiceAnterior1: 62,
      mesAnterior1: '2026-05',
      indiceAnterior2: 61,
      mesAnterior2: '2026-04',
    };
    expect(resolveContextoCurto('desempenho_estagnacao', meta)).toBe(
      'Carla Dias — indice de desempenho 60 em 2026-06, 62 em 2026-05, 61 em 2026-04',
    );
  });

  it('assiduidade_baixa — assiduidade% e faltas', () => {
    const meta = {
      colaboradorNome: 'Diego Melo',
      assiduidade: 75,
      mes: '2026-06',
      faltas: 5,
      diasUteis: 20,
    };
    expect(resolveContextoCurto('assiduidade_baixa', meta)).toBe(
      'Diego Melo — assiduidade 75% em 2026-06 (5 faltas em 20 dias uteis)',
    );
  });

  it('divergencia_a_c — colaborador ativo (sem sufixo)', () => {
    const meta = { resumoContexto: 'Divergencia significativa X→Y', colaboradorAtivo: true };
    expect(resolveContextoCurto('divergencia_a_c', meta)).toBe('Divergencia significativa X→Y');
  });

  it('divergencia_a_c — colaborador inativo (sufixo canonico)', () => {
    const meta = { resumoContexto: 'Divergencia significativa X→Y', colaboradorAtivo: false };
    expect(resolveContextoCurto('divergencia_a_c', meta)).toBe(
      'Divergencia significativa X→Y (colaborador inativado)',
    );
  });

  it('nr1_fator_critico — fator em escopo', () => {
    const meta = {
      fatorNome: 'Assedio moral',
      escopo: 'departamento Vendas',
      scoreValor: 3.2,
      trimestre: '2026-T2',
    };
    expect(resolveContextoCurto('nr1_fator_critico', meta)).toBe(
      'Assedio moral em departamento Vendas — score 3.2 no trimestre 2026-T2',
    );
  });

  it('nr1_ciclo_fechado — trimestre encerrado', () => {
    const meta = { trimestre: '2026-T2', empresaNome: 'ACME Ltda' };
    expect(resolveContextoCurto('nr1_ciclo_fechado', meta)).toBe(
      'Ciclo do trimestre 2026-T2 de ACME Ltda encerrado',
    );
  });

  it('perfil_inconsistente_primeira — confiabilidade + tentativa', () => {
    const meta = {
      colaboradorNome: 'Eva Rocha',
      confiabilidade: 'inconsistente',
      tentativa: 1,
    };
    expect(resolveContextoCurto('perfil_inconsistente_primeira', meta)).toBe(
      'Eva Rocha — inconsistente na tentativa 1',
    );
  });

  it('perfil_retest_reincidente — mesmo formato', () => {
    const meta = { colaboradorNome: 'Fabio Lima', confiabilidade: 'inconsistente', tentativa: 2 };
    expect(resolveContextoCurto('perfil_retest_reincidente', meta)).toBe(
      'Fabio Lima — inconsistente na tentativa 2',
    );
  });

  it('perfil_retest_consistente — mesmo formato', () => {
    const meta = { colaboradorNome: 'Gabi Nunes', confiabilidade: 'consistente', tentativa: 2 };
    expect(resolveContextoCurto('perfil_retest_consistente', meta)).toBe(
      'Gabi Nunes — consistente na tentativa 2',
    );
  });

  it('desbloqueio_solicitado', () => {
    const meta = { solicitanteNome: 'Helena', mes: '2026-06', aba: 'desempenho' };
    expect(resolveContextoCurto('desbloqueio_solicitado', meta)).toBe(
      'Helena solicitou desbloqueio de 2026-06 (aba: desempenho)',
    );
  });

  it('desbloqueio_aprovado', () => {
    const meta = { solicitanteNome: 'Igor', mes: '2026-06', expiraEm: '2026-06-30' };
    expect(resolveContextoCurto('desbloqueio_aprovado', meta)).toBe(
      'Solicitacao de Igor para 2026-06 aprovada. Janela expira em 2026-06-30',
    );
  });

  it('desbloqueio_recusado', () => {
    const meta = { solicitanteNome: 'Julia', mes: '2026-06', motivoRecusa: 'Justificativa fraca' };
    expect(resolveContextoCurto('desbloqueio_recusado', meta)).toBe(
      'Solicitacao de Julia para 2026-06 recusada. Motivo: Justificativa fraca',
    );
  });

  it('ciclo_instrumento_encerrado — instrumento C + taxa resposta', () => {
    const meta = { cicloReferencia: '2026-T2', empresaNome: 'ACME Ltda', taxaResposta: 85 };
    expect(resolveContextoCurto('ciclo_instrumento_encerrado', meta)).toBe(
      'Instrumento C do trimestre 2026-T2 de ACME Ltda encerrado. Taxa de resposta: 85%',
    );
  });

  it('ciclo_mensal_fechado', () => {
    const meta = { cicloReferencia: '2026-06', empresaNome: 'ACME Ltda' };
    expect(resolveContextoCurto('ciclo_mensal_fechado', meta)).toBe(
      'Mes 2026-06 de ACME Ltda fechado para lancamentos',
    );
  });

  it('fechamento_bloqueado_sem_resp_financeiro (D049)', () => {
    const meta = { empresaNome: 'ACME Ltda', mesReferencia: '2026-06' };
    expect(resolveContextoCurto('fechamento_bloqueado_sem_resp_financeiro', meta)).toBe(
      'ACME Ltda — fechamento mensal de 2026-06 sem Responsavel financeiro atribuido. ' +
        'Nomeie um titular antes do proximo ciclo.',
    );
  });

  it('responsavel_financeiro_nomeado (D050) — retorna vazio (§12.6 linha 1428)', () => {
    expect(resolveContextoCurto('responsavel_financeiro_nomeado', {})).toBe('');
  });
});
