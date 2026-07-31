// ROIP APP 9BOX — teste unit linkResolver (ME-059).
// Cobre §5 canonico — 17 tipos com roteamento condicional para 3 tipos
// (nr1_fator_critico, nr1_ciclo_fechado, desbloqueio_solicitado).

import { describe, expect, it } from 'vitest';

import { LinkResolverError, resolveLinkDestino } from '../../src/lib/alerts/linkResolver';

const COMPANY = 42;
const EMPLOYEE = 100;

describe('resolveLinkDestino — mapeamento canonico §5', () => {
  describe('desempenho — highlight eixox', () => {
    it('desempenho_queda_brusca: dashboard-individual + trimestre', () => {
      const url = resolveLinkDestino('desempenho_queda_brusca', 'rh', {
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        trimestre: '2026-Q1',
      });
      expect(url).toBe('/dashboard-individual/100?highlight=eixox&trimestre=2026-Q1');
    });
    it('desempenho_estagnacao: dashboard-individual + mes', () => {
      const url = resolveLinkDestino('desempenho_estagnacao', 'bruno', {
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        mes: '2026-03',
      });
      expect(url).toBe('/dashboard-individual/100?highlight=eixox&mes=2026-03');
    });
    it('desempenho_queda_isolada: dashboard-individual + trimestre', () => {
      const url = resolveLinkDestino('desempenho_queda_isolada', 'rh', {
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        trimestre: '2026-Q2',
      });
      expect(url).toBe('/dashboard-individual/100?highlight=eixox&trimestre=2026-Q2');
    });
    it('assiduidade_baixa: dashboard-individual + mes', () => {
      const url = resolveLinkDestino('assiduidade_baixa', 'rh', {
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        mes: '2026-01',
      });
      expect(url).toBe('/dashboard-individual/100?highlight=eixox&mes=2026-01');
    });
  });

  describe('plenitude — highlight eixoy', () => {
    it('divergencia_a_c: dashboard-individual + trimestre eixoy', () => {
      const url = resolveLinkDestino('divergencia_a_c', 'rh', {
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        trimestre: '2026-Q4',
      });
      expect(url).toBe('/dashboard-individual/100?highlight=eixoy&trimestre=2026-Q4');
    });
  });

  describe('nr1 — roteamento condicional §5', () => {
    it('nr1_fator_critico para rh: /nr1 (nao super-admin)', () => {
      const url = resolveLinkDestino('nr1_fator_critico', 'rh', {
        companyId: COMPANY,
        cicloDbId: 7,
        fatorId: 15,
      });
      expect(url).toBe('/nr1?ciclo=7&fator=15');
    });
    it('nr1_fator_critico para bruno: /super-admin/empresa/{cid}/nr1', () => {
      const url = resolveLinkDestino('nr1_fator_critico', 'bruno', {
        companyId: COMPANY,
        cicloDbId: 7,
        fatorId: 15,
      });
      expect(url).toBe('/super-admin/empresa/42/nr1?ciclo=7&fator=15');
    });
    it('nr1_ciclo_fechado para rh: /nr1 sem fator', () => {
      const url = resolveLinkDestino('nr1_ciclo_fechado', 'rh', {
        companyId: COMPANY,
        cicloDbId: 7,
      });
      expect(url).toBe('/nr1?ciclo=7');
    });
    it('nr1_ciclo_fechado para bruno: /super-admin/empresa/{cid}/nr1', () => {
      const url = resolveLinkDestino('nr1_ciclo_fechado', 'bruno', {
        companyId: COMPANY,
        cicloDbId: 7,
      });
      expect(url).toBe('/super-admin/empresa/42/nr1?ciclo=7');
    });
  });

  describe('perfil — 3 tipos apontam ao dashboard-individual sem params', () => {
    for (const tipo of [
      'perfil_inconsistente_primeira',
      'perfil_retest_consistente',
      'perfil_retest_reincidente',
    ] as const) {
      it(`${tipo}: /dashboard-individual/{eid}`, () => {
        const url = resolveLinkDestino(tipo, 'rh', {
          companyId: COMPANY,
          employeeId: EMPLOYEE,
        });
        expect(url).toBe('/dashboard-individual/100');
      });
    }
  });

  describe('desbloqueio — 3 tipos', () => {
    it('desbloqueio_solicitado para bruno → /super-admin/desbloqueios', () => {
      const url = resolveLinkDestino('desbloqueio_solicitado', 'bruno', { companyId: COMPANY });
      expect(url).toBe('/super-admin/desbloqueios');
    });
    it('desbloqueio_solicitado para rh → /cycle-management', () => {
      const url = resolveLinkDestino('desbloqueio_solicitado', 'rh', { companyId: COMPANY });
      expect(url).toBe('/cycle-management');
    });
    it('desbloqueio_aprovado → /cycle-management (ambos destinatarios)', () => {
      expect(resolveLinkDestino('desbloqueio_aprovado', 'bruno', { companyId: COMPANY })).toBe(
        '/cycle-management',
      );
      expect(resolveLinkDestino('desbloqueio_aprovado', 'rh', { companyId: COMPANY })).toBe(
        '/cycle-management',
      );
    });
    it('desbloqueio_recusado → /cycle-management', () => {
      expect(resolveLinkDestino('desbloqueio_recusado', 'rh', { companyId: COMPANY })).toBe(
        '/cycle-management',
      );
    });
  });

  describe('ciclos automaticos', () => {
    it('ciclo_instrumento_encerrado → /cycle-management', () => {
      expect(resolveLinkDestino('ciclo_instrumento_encerrado', 'rh', { companyId: COMPANY })).toBe(
        '/cycle-management',
      );
    });
    it('ciclo_mensal_fechado → /cycle-management', () => {
      expect(resolveLinkDestino('ciclo_mensal_fechado', 'bruno', { companyId: COMPANY })).toBe(
        '/cycle-management',
      );
    });
  });

  describe('RF — D049/D050', () => {
    it('fechamento_bloqueado_sem_resp_financeiro → /super-admin/empresa/{cid}', () => {
      const url = resolveLinkDestino('fechamento_bloqueado_sem_resp_financeiro', 'bruno', {
        companyId: COMPANY,
      });
      expect(url).toBe('/super-admin/empresa/42');
    });
    it('responsavel_financeiro_nomeado → /faturamento-mensal (independente de tipo)', () => {
      expect(
        resolveLinkDestino('responsavel_financeiro_nomeado', 'rh', { companyId: COMPANY }),
      ).toBe('/faturamento-mensal');
    });
  });
});

describe('LinkResolverError — contexto ausente', () => {
  it('desempenho sem employeeId → LinkResolverError', () => {
    expect(() =>
      resolveLinkDestino('desempenho_queda_brusca', 'rh', {
        companyId: COMPANY,
        trimestre: '2026-Q1',
      }),
    ).toThrow(LinkResolverError);
  });
  it('desempenho_estagnacao sem mes → LinkResolverError', () => {
    expect(() =>
      resolveLinkDestino('desempenho_estagnacao', 'rh', {
        companyId: COMPANY,
        employeeId: EMPLOYEE,
      }),
    ).toThrow(LinkResolverError);
  });
  it('nr1_fator_critico sem fatorId → LinkResolverError', () => {
    expect(() =>
      resolveLinkDestino('nr1_fator_critico', 'rh', { companyId: COMPANY, cicloDbId: 7 }),
    ).toThrow(LinkResolverError);
  });
  it('nr1_ciclo_fechado sem cicloDbId → LinkResolverError', () => {
    expect(() => resolveLinkDestino('nr1_ciclo_fechado', 'bruno', { companyId: COMPANY })).toThrow(
      LinkResolverError,
    );
  });
});
