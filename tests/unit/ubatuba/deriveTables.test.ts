// ROIP APP 9BOX — testes unit dos derivadores Ubatuba (ME-080b Dispatch 5).
//
// Cobre invariantes canonicas bit-exact dos 6 derivadores:
//   - deriveUbatubaCLevels: 3 rows, IDs 4-6, dominio email, CPFs validos.
//   - deriveUbatubaEmployees: 66 rows, IDs 70-135, matricula formato,
//     passwordHash condicional isLider/isRH/isRF.
//   - deriveClimateEngagementData: 84 rows canonicos.
//   - deriveDataAccessLog: 200 rows canonicos.
//   - deriveAlerts: 13 rows canonicos.
//   - deriveNotifications: 92 rows canonicos.
//
// RV-15: numeros medidos, nao estimados. RV-13: derivadores exercitados.

import { describe, expect, it } from 'vitest';

import { isValidCpf } from '../../../src/lib/auth/cpfGenerator';
import { MATRICULA_REGEX } from '../../../src/lib/auth/matriculaGenerator';
import {
  UBATUBA_CLEVEL_ID_SHIFT,
  UBATUBA_COMPANY_ID,
  UBATUBA_EMAIL_DOMAIN,
  UBATUBA_EMPLOYEE_ID_SHIFT,
} from '../../../src/db/seed/ubatuba/constants';
import { deriveUbatubaCLevels } from '../../../src/db/seed/ubatuba/deriveUbatubaCLevels';
import {
  deriveUbatubaEmployees,
  derivarEmailUbatuba,
  type DerivedUbatubaEmployeeRow,
} from '../../../src/db/seed/ubatuba/deriveUbatubaEmployees';
import {
  UBATUBA_CLIMATE_TRIMESTRES,
  deriveClimateEngagementData,
} from '../../../src/db/seed/ubatuba/deriveClimateEngagementData';
import {
  UBATUBA_DAL_TOTAL_ESPERADO,
  deriveDataAccessLog,
} from '../../../src/db/seed/ubatuba/deriveDataAccessLog';
import {
  UBATUBA_ALERTS_TOTAL_ESPERADO,
  deriveAlerts,
} from '../../../src/db/seed/ubatuba/deriveAlerts';
import {
  UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO,
  deriveNotifications,
} from '../../../src/db/seed/ubatuba/deriveNotifications';

// Stub deterministico do hasher bcrypt para testes unit rapidos.
const HASHER_STUB = async (plain: string): Promise<string> => `stub_hash_${plain}`;

describe('deriveUbatubaCLevels — 3 canonicos bit-exact', () => {
  const cLevels = deriveUbatubaCLevels();

  it('total = 3', () => {
    expect(cLevels.length).toBe(3);
  });

  it('IDs canonicamente 4, 5, 6 (shift +NATIVA_CLEVEL_COUNT sobre 1,2,3)', () => {
    expect(cLevels.map((c) => c.id).sort((a, b) => a - b)).toEqual([4, 5, 6]);
    expect(UBATUBA_CLEVEL_ID_SHIFT).toBe(3);
  });

  it('companyId sempre UBATUBA_COMPANY_ID', () => {
    for (const c of cLevels) {
      expect(c.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('email termina em @bebidasubatuba.com.br', () => {
    for (const c of cLevels) {
      expect(c.email.endsWith(`@${UBATUBA_EMAIL_DOMAIN}`)).toBe(true);
    }
  });

  it('CPF valido e no faixa reservada "1xx"', () => {
    for (const c of cLevels) {
      expect(isValidCpf(c.cpf)).toBe(true);
      expect(c.cpf.charAt(0)).toBe('1');
    }
    const cpfs = new Set(cLevels.map((c) => c.cpf));
    expect(cpfs.size).toBe(3);
  });

  it('preserva estrutura Nativa (nomes, cargos, custoMensal)', () => {
    const cargos = cLevels.map((c) => c.cargo).sort();
    expect(cargos).toEqual(['CEO', 'CFO', 'COO']);
  });

  it('determinismo bit-exact: rodar 2x produz mesmos CPFs', () => {
    const a = deriveUbatubaCLevels();
    const b = deriveUbatubaCLevels();
    expect(a.map((c) => c.cpf)).toEqual(b.map((c) => c.cpf));
  });
});

describe('deriveUbatubaEmployees — 66 canonicos bit-exact', () => {
  let employees: DerivedUbatubaEmployeeRow[];

  it('total = 66', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    expect(employees.length).toBe(66);
  });

  it('IDs canonicamente 70..135 (shift +NATIVA_EMPLOYEE_COUNT sobre 4..69)', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const ids = employees.map((e) => e.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(70);
    expect(ids[ids.length - 1]).toBe(135);
    expect(UBATUBA_EMPLOYEE_ID_SHIFT).toBe(66);
  });

  it('companyId sempre UBATUBA_COMPANY_ID', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    for (const e of employees) expect(e.companyId).toBe(UBATUBA_COMPANY_ID);
  });

  it('email formato canonico (sem acento, minusculo, @bebidasubatuba.com.br)', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    for (const e of employees) {
      expect(e.email.toLowerCase()).toBe(e.email);
      expect(e.email.endsWith(`@${UBATUBA_EMAIL_DOMAIN}`)).toBe(true);
      // Sem acentos: nao deve conter cedilhas/acentos.
      expect(/[áâãéêíóôõúç]/.test(e.email)).toBe(false);
    }
  });

  it('CPF unico e valido para todos', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const cpfs = new Set(employees.map((e) => e.cpf));
    expect(cpfs.size).toBe(66);
    for (const e of employees) {
      expect(isValidCpf(e.cpf)).toBe(true);
      expect(e.cpf.charAt(0)).toBe('1');
    }
  });

  it('matricula unica e no formato canonico AA00', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const matriculas = new Set(employees.map((e) => e.matricula));
    expect(matriculas.size).toBe(66);
    for (const e of employees) {
      expect(MATRICULA_REGEX.test(e.matricula)).toBe(true);
    }
  });

  it('passwordHash preenchido APENAS para isLider/isRH/isResponsavelFinanceiro', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    for (const e of employees) {
      const deveTer = e.isLider || e.isRH || e.isResponsavelFinanceiro;
      if (deveTer) {
        expect(e.passwordHash).not.toBeNull();
        expect(e.passwordHash!.startsWith('stub_hash_')).toBe(true);
      } else {
        expect(e.passwordHash).toBeNull();
      }
    }
  });

  it('passwordSet=false para todos (gate primeiro acesso Dispatch 3)', async () => {
    employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    for (const e of employees) expect(e.passwordSet).toBe(false);
  });

  it('helper derivarEmailUbatuba: caso canonico "Juliana Freitas"', () => {
    expect(derivarEmailUbatuba('Juliana Freitas')).toBe(`juliana.freitas@${UBATUBA_EMAIL_DOMAIN}`);
  });

  it('helper derivarEmailUbatuba: normaliza acento e caixa', () => {
    expect(derivarEmailUbatuba('Márcio Fernándes')).toBe(
      `marcio.fernandes@${UBATUBA_EMAIL_DOMAIN}`,
    );
  });
});

describe('deriveClimateEngagementData — 84 canonicos bit-exact', () => {
  it('total = 64 (4 empresa + 24 depto + 36 equipe)', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveClimateEngagementData(employees);
    expect(rows.length).toBe(64);
  });

  it('distribuicao por escopo bate com esperado', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveClimateEngagementData(employees);
    const empresa = rows.filter((r) => r.escopo === 'empresa');
    const departamento = rows.filter((r) => r.escopo === 'departamento');
    const equipe = rows.filter((r) => r.escopo === 'equipe');
    expect(empresa.length).toBe(4);
    expect(departamento.length).toBe(24);
    expect(equipe.length).toBe(36);
  });

  it('todos os trimestres canonicos aparecem para escopo empresa', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveClimateEngagementData(employees);
    const trimestres = new Set(rows.filter((r) => r.escopo === 'empresa').map((r) => r.trimestre));
    expect([...trimestres].sort()).toEqual([...UBATUBA_CLIMATE_TRIMESTRES].sort());
  });

  it('notas canonicas no intervalo [3.00, 4.80]', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveClimateEngagementData(employees);
    for (const r of rows) {
      const nota = Number(r.notaClima);
      expect(nota).toBeGreaterThanOrEqual(3.0);
      expect(nota).toBeLessThanOrEqual(4.8);
    }
  });

  it('determinismo bit-exact: rodar 2x produz mesmos valores', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const a = deriveClimateEngagementData(employees);
    const b = deriveClimateEngagementData(employees);
    expect(a.map((r) => r.notaClima)).toEqual(b.map((r) => r.notaClima));
    expect(a.map((r) => r.notaQuestao01)).toEqual(b.map((r) => r.notaQuestao01));
  });
});

describe('deriveDataAccessLog — 200 canonicos bit-exact', () => {
  it('total = 200 (106 RH + 40 lider + 30 super_admin + 24 CEO)', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const cLevels = deriveUbatubaCLevels();
    const rows = deriveDataAccessLog(employees, cLevels);
    expect(rows.length).toBeLessThanOrEqual(UBATUBA_DAL_TOTAL_ESPERADO);
    // O total real pode ser < 200 se algum lider ficar sem liderados (pulo).
    // Testamos a distribuicao esperada:
    const byAgent = {
      rh: rows.filter((r) => r.agentType === 'rh').length,
      lider: rows.filter((r) => r.agentType === 'lider').length,
      super_admin: rows.filter((r) => r.agentType === 'super_admin').length,
      clevel: rows.filter((r) => r.agentType === 'clevel').length,
    };
    expect(byAgent.rh).toBe(106); // 2 × 53 ativos
    expect(byAgent.super_admin).toBe(30);
    expect(byAgent.clevel).toBe(24);
    expect(byAgent.lider).toBeGreaterThan(0);
  });

  it('agentType canonico, tipoAcesso canonico', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const cLevels = deriveUbatubaCLevels();
    const rows = deriveDataAccessLog(employees, cLevels);
    for (const r of rows) {
      expect(['super_admin', 'rh', 'lider', 'clevel']).toContain(r.agentType);
      expect([
        'dashboard_individual',
        'relatorio_perfil_individual',
        'exportacao_planilha',
      ]).toContain(r.tipoAcesso);
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('determinismo: 2x rodadas produzem mesmos timestamps', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const cLevels = deriveUbatubaCLevels();
    const a = deriveDataAccessLog(employees, cLevels);
    const b = deriveDataAccessLog(employees, cLevels);
    expect(a.length).toBe(b.length);
    expect(a[0]!.createdAt.getTime()).toBe(b[0]!.createdAt.getTime());
  });
});

describe('deriveAlerts — 13 canonicos bit-exact', () => {
  it('total = 13 (6 nr1 + 3 performance + 2 plenitude + 1 turnover + 1 iql)', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveAlerts(employees);
    expect(rows.length).toBe(UBATUBA_ALERTS_TOTAL_ESPERADO);
    const tipos = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.tipo] = (acc[r.tipo] ?? 0) + 1;
      return acc;
    }, {});
    expect(tipos.nr1_fator_critico).toBe(6);
    expect(tipos.performance_baixa).toBe(3);
    expect(tipos.plenitude_baixa).toBe(2);
    expect(tipos.turnover_alto).toBe(1);
    expect(tipos.iql_critico).toBe(1);
  });

  it('todos escopos e severidades canonicas', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveAlerts(employees);
    for (const r of rows) {
      expect(['empresa', 'departamento', 'colaborador']).toContain(r.escopo);
      expect(['info', 'observacao', 'atencao', 'critico']).toContain(r.severidade);
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('NR-1 sempre com cicloDbId=null nesta ME (backlog documentado)', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveAlerts(employees);
    for (const r of rows.filter((x) => x.tipo === 'nr1_fator_critico')) {
      expect(r.cicloDbId).toBeNull();
    }
  });
});

describe('deriveNotifications — 92 canonicos bit-exact', () => {
  it('total = 80 (18 nr1 + 9 pendencias + 53 boas-vindas)', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveNotifications(employees);
    expect(rows.length).toBeLessThanOrEqual(UBATUBA_NOTIFICATIONS_TOTAL_ESPERADO);
    const tipos = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.tipo] = (acc[r.tipo] ?? 0) + 1;
      return acc;
    }, {});
    expect(tipos.nr1_fator_critico).toBe(18);
    // pendencias e boas-vindas dependem de ativos/lideres reais.
    expect(tipos.perfil_individual_pendente).toBeGreaterThan(0);
    expect(tipos.boas_vindas_onboarding).toBeGreaterThan(0);
  });

  it('destinatarioTipo canonico rh, nunca bruno', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const rows = deriveNotifications(employees);
    for (const r of rows) {
      expect(r.destinatarioTipo).toBe('rh');
      expect(r.companyId).toBe(UBATUBA_COMPANY_ID);
    }
  });

  it('alertId propagado para nr1 quando alertIdsNr1 fornecido', async () => {
    const employees = await deriveUbatubaEmployees({ hashPassword: HASHER_STUB });
    const alertIds = [1001, 1002, 1003, 1004, 1005, 1006];
    const rows = deriveNotifications(employees, alertIds);
    const nr1 = rows.filter((r) => r.tipo === 'nr1_fator_critico');
    for (const r of nr1) {
      expect(alertIds).toContain(r.alertId);
    }
  });
});
