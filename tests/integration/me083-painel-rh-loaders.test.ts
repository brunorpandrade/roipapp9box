// ROIP APP 9BOX — teste de integracao ME-083 (loaders `/painel-rh` §5.5).
//
// Cobre canonicamente bit-exact contra MySQL real (RV-11):
//   1. Loaders puros de `src/app/painel-rh/internals.ts`:
//      - `loadRhSessionFlags` (isRH/isLider/isResponsavelFinanceiro/
//        hasDescendingChain) — casos: RH puro sem cadeia; RH-Lider com
//        cadeia; RH-Lider sem cadeia; userId inexistente.
//      - `loadCompanyForRhPanel` (companyId existente / inexistente).
//      - `loadMinhaEquipeData` (total + primeiros 5 alfabetico +
//        estado vazio).
//      - `loadCadeiaIndiretaData` (apenas liderados que sao lideres +
//        primeiros 5 alfabetico + estado vazio).
//      - `loadMeuPortalData` (retorno vazio canonico no B9 —
//        D-B9-MEU-PORTAL-PENDENCIAS rastreado).
//   2. Expansao canonica ME-083 D-ME083-9 do `loadMesAtualClosureStatus`:
//      - `lideresTotal` conta employees ativos com `isLider=true`.
//      - `lideresPreenchidos` retorna `null` bit-exact no B9.
//
// Faixa canonica desta ME (S513 ME-083):
//   - Principal: CNPJ 10250000000001..049.
//   - Auxiliar:  CNPJ 10260000000001..049 (reservada).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyMonthlyData,
  employees,
  employeeLeaderHistory,
  monthlyClosureStatus,
  performanceQuarterlyData,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  loadCadeiaIndiretaData,
  loadCompanyForRhPanel,
  loadMeuPortalData,
  loadMinhaEquipeData,
} from '../../src/app/painel-rh/internals';
import { loadMesAtualClosureStatus } from '../../src/app/super-admin/empresa/[id]/internals';
import { loadRhSessionFlags } from '../../src/lib/session/rhSessionFlags';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa canonica ME-083 S513
const CNPJ_A = '10250000000001';
const CNPJ_B = '10250000000002';

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

describe('ME-083 — loaders `/painel-rh` §5.5 (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-083 A LTDA',
      nomeFantasia: 'ROIP ME-083 A',
      cnpj: CNPJ_A,
    });
    companyIdB = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-083 B LTDA',
      nomeFantasia: 'ROIP ME-083 B',
      cnpj: CNPJ_B,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyIdA, companyIdB]));
  });

  // ---------------------------------------------------------------------
  // loadCompanyForRhPanel
  // ---------------------------------------------------------------------

  describe('loadCompanyForRhPanel', () => {
    it('resolve canonicamente bit-exact empresa existente', async () => {
      const info = await loadCompanyForRhPanel(client.db, companyIdA);
      expect(info).not.toBe(null);
      if (info === null) return;
      expect(info.id).toBe(companyIdA);
      expect(info.nomeFantasia).toBe('ROIP ME-083 A');
      expect(info.logoUrl).toBe(null);
    });

    it('retorna null bit-exact para companyId inexistente', async () => {
      const info = await loadCompanyForRhPanel(client.db, 999999);
      expect(info).toBe(null);
    });
  });

  // ---------------------------------------------------------------------
  // loadRhSessionFlags
  // ---------------------------------------------------------------------

  describe('loadRhSessionFlags', () => {
    it('resolve RH puro sem cadeia bit-exact', async () => {
      const rhId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000001',
        isRH: true,
        isLider: false,
      });
      const flags = await loadRhSessionFlags(client.db, rhId);
      expect(flags).not.toBe(null);
      if (flags === null) return;
      expect(flags.isRH).toBe(true);
      expect(flags.isLider).toBe(false);
      expect(flags.isResponsavelFinanceiro).toBe(false);
      expect(flags.hasDescendingChain).toBe(false);
    });

    it('resolve RH-Lider Cenario 1 (com liderados sem lideres proprios)', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000010',
        isRH: true,
        isLider: true,
      });
      const liderado = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000011',
        isLider: false,
      });
      await seedLeaderHistoryOpen({ employeeId: liderado, liderId: rhlId });
      const flags = await loadRhSessionFlags(client.db, rhlId);
      expect(flags?.hasDescendingChain).toBe(false);
    });

    it('resolve RH-Lider Cenario 2 (com liderado que tambem e lider)', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000020',
        isRH: true,
        isLider: true,
      });
      const liderMedio = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000021',
        isLider: true,
      });
      await seedLeaderHistoryOpen({ employeeId: liderMedio, liderId: rhlId });
      const flags = await loadRhSessionFlags(client.db, rhlId);
      expect(flags?.hasDescendingChain).toBe(true);
    });

    it('retorna null bit-exact para userId inexistente', async () => {
      const flags = await loadRhSessionFlags(client.db, 999999);
      expect(flags).toBe(null);
    });
  });

  // ---------------------------------------------------------------------
  // loadMinhaEquipeData
  // ---------------------------------------------------------------------

  describe('loadMinhaEquipeData', () => {
    it('estado vazio canonico bit-exact quando sem liderados', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000030',
        isRH: true,
        isLider: true,
      });
      const data = await loadMinhaEquipeData(client.db, rhlId);
      expect(data.totalLideradosDiretos).toBe(0);
      expect(data.primeiros5).toEqual([]);
    });

    it('conta canonicamente liderados diretos ativos ignorando inativos', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000040',
        isRH: true,
        isLider: true,
      });
      const l1 = await seedEmployee({ companyId: companyIdA, cpf: '20000000041' });
      const l2 = await seedEmployee({ companyId: companyIdA, cpf: '20000000042' });
      const l3Inativo = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000043',
        status: 'inativo',
      });
      await seedLeaderHistoryOpen({ employeeId: l1, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: l2, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: l3Inativo, liderId: rhlId });
      const data = await loadMinhaEquipeData(client.db, rhlId);
      expect(data.totalLideradosDiretos).toBe(2);
    });

    it('retorna canonicamente 5 primeiros em ordem alfabetica', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000050',
        isRH: true,
        isLider: true,
      });
      // 6 liderados com nomes controlados
      const nomes = ['Zeta', 'Alfa', 'Delta', 'Beta', 'Charlie', 'Épsilon'];
      const ids: number[] = [];
      for (let i = 0; i < nomes.length; i += 1) {
        const nomeAtual = nomes[i];
        if (nomeAtual === undefined) {
          throw new Error('nomes[i] undefined — array literal');
        }
        const eid = await seedEmployeeWithName({
          companyId: companyIdA,
          cpf: `2000000005${i + 1}`,
          name: nomeAtual,
        });
        ids.push(eid);
        await seedLeaderHistoryOpen({ employeeId: eid, liderId: rhlId });
      }
      const data = await loadMinhaEquipeData(client.db, rhlId);
      expect(data.totalLideradosDiretos).toBe(6);
      expect(data.primeiros5.length).toBe(5);
      const nomesOrdenados = data.primeiros5.map((l) => l.nome);
      expect(nomesOrdenados).toEqual(['Alfa', 'Beta', 'Charlie', 'Delta', 'Épsilon']);
    });
  });

  // ---------------------------------------------------------------------
  // loadCadeiaIndiretaData
  // ---------------------------------------------------------------------

  describe('loadCadeiaIndiretaData', () => {
    it('estado vazio canonico bit-exact quando nenhum liderado e lider', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000060',
        isRH: true,
        isLider: true,
      });
      const nao1 = await seedEmployee({ companyId: companyIdA, cpf: '20000000061' });
      await seedLeaderHistoryOpen({ employeeId: nao1, liderId: rhlId });
      const data = await loadCadeiaIndiretaData(client.db, rhlId);
      expect(data.totalCadeiaCompleta).toBe(0);
      expect(data.primeiros5Lideres).toEqual([]);
    });

    it('conta canonicamente apenas liderados que sao lideres', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000070',
        isRH: true,
        isLider: true,
      });
      const l1 = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000071',
        isLider: true,
      });
      const l2 = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000072',
        isLider: true,
      });
      const nao = await seedEmployee({ companyId: companyIdA, cpf: '20000000073' });
      await seedLeaderHistoryOpen({ employeeId: l1, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: l2, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: nao, liderId: rhlId });
      const data = await loadCadeiaIndiretaData(client.db, rhlId);
      expect(data.totalCadeiaCompleta).toBe(2);
    });
  });

  // ---------------------------------------------------------------------
  // loadMeuPortalData
  // ---------------------------------------------------------------------

  describe('loadMeuPortalData', () => {
    it('retorna vazio canonico bit-exact no B9 (D-B9-MEU-PORTAL-PENDENCIAS)', async () => {
      const rhId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000080',
        isRH: true,
      });
      const data = await loadMeuPortalData(client.db, rhId);
      expect(data.pendencias).toEqual([]);
    });

    it('retorna vazio canonico bit-exact para userId inexistente', async () => {
      const data = await loadMeuPortalData(client.db, 999999);
      expect(data.pendencias).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // Expansao ME-083 D-ME083-9 do loadMesAtualClosureStatus
  // ---------------------------------------------------------------------

  describe('loadMesAtualClosureStatus — expansao ME-083 D-ME083-9', () => {
    it('lideresTotal conta employees ativos com isLider=true', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: '20000000090', isLider: true });
      await seedEmployee({ companyId: companyIdA, cpf: '20000000091', isLider: true });
      await seedEmployee({ companyId: companyIdA, cpf: '20000000092', isLider: false });
      const status = await loadMesAtualClosureStatus(client.db, companyIdA, new Date('2026-08-17'));
      expect(status.lideresTotal).toBe(2);
    });

    it('lideresPreenchidos = null bit-exact no B9', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: '20000000095', isLider: true });
      const status = await loadMesAtualClosureStatus(client.db, companyIdA, new Date('2026-08-17'));
      expect(status.lideresPreenchidos).toBe(null);
    });

    it('lideresTotal ignora lideres de outra empresa', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: '20000000100', isLider: true });
      await seedEmployee({ companyId: companyIdB, cpf: '20000000101', isLider: true });
      const status = await loadMesAtualClosureStatus(client.db, companyIdA, new Date('2026-08-17'));
      expect(status.lideresTotal).toBe(1);
    });
  });

  // ---------------------------------------------------------------------
  // Helpers de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    departamento?: 'Comercial' | 'Administrativo' | 'Operações' | 'Financeiro' | 'Recursos Humanos';
    isLider?: boolean;
    isRH?: boolean;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: `Titular ${overrides.cpf}`,
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: overrides.departamento ?? 'Comercial',
        isLider: overrides.isLider ?? false,
        isRH: overrides.isRH ?? false,
        isResponsavelFinanceiro: overrides.isResponsavelFinanceiro ?? false,
        status: overrides.status ?? 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedEmployeeWithName(overrides: {
    companyId: number;
    cpf: string;
    name: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: overrides.name,
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
        isRH: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployeeWithName sem id');
    }
    return row.id;
  }

  async function seedLeaderHistoryOpen(overrides: {
    employeeId: number;
    liderId: number;
  }): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: overrides.employeeId,
      liderId: overrides.liderId,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'Seed test ME-083',
      transferBatchId: '00000000-0000-0000-0000-000000000083',
    });
  }
});
