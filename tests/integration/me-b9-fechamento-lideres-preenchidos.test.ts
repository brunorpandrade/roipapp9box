// ROIP APP 9BOX — teste de integracao ME-B9-fechamento CORR1
// (D-B9F-CARD-LIDERES-DIVERGENTE ENCERRADO — S235-A). Cobre semantica
// canonica bit-a-bit do `loadMesAtualClosureStatus` reusando o service
// `leaderMonthlyStatus`:
// - `lideresComLiderados`: lideres com >=1 liderado direto ativo no mes
//   (semantica temporal §3.11 — cobre mes inteiro, inclui C-levels que
//   sao lider de employees; alinhado bit-a-bit ao drill-down).
// - `lideresPreenchidos`: subset onde `computeStatusForLeader` retorna
//   'Preenchido' (todas as variaveis com peso>0 do
//   `companyJobFamilies` de todos os liderados tem `demanda` E
//   `executado` NOT NULL).
//
// Faixa canonica CNPJ desta ME: 10870000000001..10870000000049.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  companyMonthlyData,
  employeeGoals,
  employeeLeaderHistory,
  employees,
  monthlyClosureStatus,
  performanceData,
  performanceQuarterlyData,
  performanceVariableData,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { loadMesAtualClosureStatus } from '../../src/app/super-admin/empresa/[id]/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_A = '10870000000001';
const REFERENCE = new Date('2026-08-17');
const MES_ATUAL = '2026-08';

const BASE_COMPANY_INPUT = {
  telefone: '1633330001',
  endereco: 'Rua Teste',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  contatoPrincipalNome: 'Principal',
  contatoPrincipalEmail: 'p@roip.test',
  contatoRHNome: 'RH',
  contatoRHEmail: 'rh@roip.test',
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'A',
  contextoMercado: 'A',
  mesKickoff: 1,
  kickoffDate: new Date('2020-01-01'),
};

describe('ME-B9-fechamento CORR1 — lideresPreenchidos via service (S235-A)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(employeeGoals);
    await client.db.delete(companyJobFamilies);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(employeeGoals);
    await client.db.delete(companyJobFamilies);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-B9-fech CORR1 LTDA',
      nomeFantasia: 'ROIP ME-B9-fech CORR1',
      cnpj: CNPJ_A,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyId]));

    // Seed canonico: companyJobFamilies para vendas_comercial (peso 1, index 1).
    await seedCompanyJobFamily('vendas_comercial', 1, '1.00');
  });

  it('lider com liderado com variavel canonica preenchida → preenchido = 1', async () => {
    const liderId = await seedEmployee({ cpf: '20870000001', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000002' });
    await seedLeaderHistory(liderado, liderId);
    const perfId = await seedPerformanceData(liderado, MES_ATUAL);
    await seedVariableData(perfId, 1, '100.00', '95.00');

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(1);
  });

  it('lider com liderado sem performanceData do mes → NAO preenchido = 0', async () => {
    const liderId = await seedEmployee({ cpf: '20870000020', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000021' });
    await seedLeaderHistory(liderado, liderId);
    // Sem performanceData.

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('variavel com executado NULL → Parcial → NAO preenchido', async () => {
    const liderId = await seedEmployee({ cpf: '20870000030', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000031' });
    await seedLeaderHistory(liderado, liderId);
    const perfId = await seedPerformanceData(liderado, MES_ATUAL);
    await seedVariableData(perfId, 1, '100.00', null);

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('lider ativo sem liderados NAO entra em lideresComLiderados', async () => {
    await seedEmployee({ cpf: '20870000050', isLider: true });

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(0);
    expect(status.lideresPreenchidos).toBe(0);
  });

  it('vinculo encerrado ANTES do mes NAO conta (semantica temporal §3.11)', async () => {
    const liderId = await seedEmployee({ cpf: '20870000060', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000061' });
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: new Date('2026-07-31'),
      reason: 'seed teste encerramento antes',
      transferBatchId: '00000000-0000-4000-8000-000000000870',
    });

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(0);
  });

  it('vinculo encerrado NO MEIO do mes CONTA (semantica temporal §3.11)', async () => {
    // Descoberta canonica material da CORR1: liderado cujo vinculo
    // termina no meio do mes DEVE aparecer na equipe daquele mes.
    // Semantica antiga (S231-B' — dataFim IS NULL) ERRADAMENTE excluia.
    const liderId = await seedEmployee({ cpf: '20870000070', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000071' });
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: new Date('2026-08-15'),
      reason: 'seed teste encerramento meio do mes',
      transferBatchId: '00000000-0000-4000-8000-000000000871',
    });

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
  });

  it('C-level com liderado direto entra no denominador (CORR1 canonica)', async () => {
    // Descoberta canonica material da CORR1: C-levels que sao lider
    // direto de employees DEVEM entrar no denominador. Semantica antiga
    // (S231-B') ignorava C-levels completamente.
    const clevelId = await seedCLevel('99000000001');
    const liderado = await seedEmployee({ cpf: '20870000080' });
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: liderado,
      liderId: null,
      clevelId,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'seed teste clevel lider',
      transferBatchId: '00000000-0000-4000-8000-000000000872',
    });

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
  });

  it('variavel com peso=0 NAO conta em totalRequired (canonico §3.11)', async () => {
    // Descoberta canonica material: variaveis com weight=0 sao
    // canonicamente ignoradas — nao geram obrigacao de preenchimento.
    // Semantica antiga (S231-B') exigia todas as employeeGoals — ERRADO.
    await client.db.delete(companyJobFamilies);
    await seedCompanyJobFamily('vendas_comercial', 1, '1.00'); // peso 1 — obriga
    await seedCompanyJobFamily('vendas_comercial', 2, '0.00'); // peso 0 — nao obriga

    const liderId = await seedEmployee({ cpf: '20870000090', isLider: true });
    const liderado = await seedEmployee({ cpf: '20870000091' });
    await seedLeaderHistory(liderado, liderId);
    const perfId = await seedPerformanceData(liderado, MES_ATUAL);
    // Preenche apenas variavel 1 (peso 1); variavel 2 (peso 0) fica sem.
    await seedVariableData(perfId, 1, '100.00', '95.00');

    const status = await loadMesAtualClosureStatus(client.db, companyId, REFERENCE);
    expect(status.lideresComLiderados).toBe(1);
    // Esperado: Preenchido (variavel de peso 0 nao obriga).
    expect(status.lideresPreenchidos).toBe(1);
  });

  // ---------------------------------------------------------------------
  // Helpers de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: { cpf: string; isLider?: boolean }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: `Titular ${overrides.cpf}`,
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: overrides.isLider ?? false,
        isRH: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedCLevel(cpf: string): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: `CLevel ${cpf}`,
        cpf,
        email: `clevel${cpf}@roip.test`,
        cargo: 'CEO',
        descricaoCargo: 'Chief Executive Officer',
        departamento: 'Diretoria',
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        custoMensal: '50000.00',
        acessoTotal: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedCLevel sem id');
    }
    return row.id;
  }

  async function seedLeaderHistory(employeeId: number, liderId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'seed teste CORR1',
      transferBatchId: '00000000-0000-4000-8000-000000000873',
    });
  }

  async function seedCompanyJobFamily(
    family: 'vendas_comercial',
    variableIndex: number,
    weight: string,
  ): Promise<void> {
    await client.db.insert(companyJobFamilies).values({
      companyId,
      jobFamily: family,
      variableIndex,
      variableName: `Var ${variableIndex}`,
      unit: 'un',
      weight,
      updatedBy: 1,
    });
  }

  async function seedPerformanceData(employeeId: number, mes: string): Promise<number> {
    const [row] = await client.db
      .insert(performanceData)
      .values({
        companyId,
        employeeId,
        mes,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedPerformanceData sem id');
    }
    return row.id;
  }

  async function seedVariableData(
    performanceDataId: number,
    variableIndex: number,
    demanda: string | null,
    executado: string | null,
  ): Promise<void> {
    await client.db.insert(performanceVariableData).values({
      performanceDataId,
      variableIndex,
      demanda,
      executado,
    });
  }
});
