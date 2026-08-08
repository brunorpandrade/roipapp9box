// ROIP APP 9BOX — teste de integracao ME-057b (MySQL real).
//
// Cobre contra MySQL real (RV-11):
//   1. `loadRFLogsPage` (server component query canonica §14.20) —
//      filtros (empresa, periodo, tipo evento), paginacao, count total,
//      resolucao polimorfica dos holders De/Para e do executadoPor.
//   2. `loadDataAccessLogPage` (query canonica compartilhada §14.22) —
//      3 modos: scopeCompanyId=null (Bruno cross-empresa),
//      scopeCompanyId=X (RH ou Bruno filtrado), filtros combinados
//      (search unificado CC043 + tipoAcesso + periodo + empresa).
//   3. Cross-tenant guards: RH da empresa A NAO ve logs da empresa B.
//   4. Bruno cross-empresa: com empresaId=null ve tudo; com empresaId=X
//      filtra server-side.
//   5. Resolucao polimorfica do agente: super_admin | rh | lider |
//      clevel — nome correto vindo do LEFT JOIN respectivo.
//   6. Search unificado CC043: casa nome titular OU CPF titular OU
//      nome do agente.
//
// Faixa canonica desta ME (S313):
//   - Principal: CNPJ 10130000000001..10130000000149 (usada aqui).
//   - Auxiliar: 10140000000001..10140000000149 (reservada).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  dataAccessLog,
  employees,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { insertDataAccessLogEntry } from '../../src/server/services/dataAccessLog';
import {
  CANONICAL_DAL_DEFAULT_FILTERS,
  loadDataAccessLogPage,
} from '../../src/lib/logs/dataAccessLog';
import {
  loadEmpresasList,
  loadRFLogsPage,
} from '../../src/app/super-admin/logs/responsavel-financeiro/internals';
// eslint-disable-next-line @stylistic/max-len -- path canonico de rota app router Next 15
import { CANONICAL_RF_DEFAULT_FILTERS } from '../../src/app/super-admin/logs/responsavel-financeiro/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa principal S313: 10130000000001..149
const CNPJ_A = '10130000000001';
const CNPJ_B = '10130000000029';

describe('ME-057b — logs administrativos (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let rhIdA: number;
  let rhIdB: number;
  let liderIdA: number;
  let colabIdA: number;
  let colabIdB: number;
  let cLevelIdA: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(dataAccessLog);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(dataAccessLog);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-057b A LTDA',
      nomeFantasia: 'ROIP ME-057b A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua A',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal A',
      contatoPrincipalEmail: 'p.a@roip.test',
      contatoRHNome: 'RH A',
      contatoRHEmail: 'rh.a@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'A',
      contextoMercado: 'A',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdA));

    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-057b B LTDA',
      nomeFantasia: 'ROIP ME-057b B',
      cnpj: CNPJ_B,
      telefone: '1633330002',
      endereco: 'Rua B',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal B',
      contatoPrincipalEmail: 'p.b@roip.test',
      contatoRHNome: 'RH B',
      contatoRHEmail: 'rh.b@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'B',
      contextoMercado: 'B',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdB));

    rhIdA = await seedEmployee(companyIdA, '00000000101', 'Marina Costa RH A', {
      isRH: true,
    });
    rhIdB = await seedEmployee(companyIdB, '00000000102', 'Ana Silva RH B', { isRH: true });
    liderIdA = await seedEmployee(companyIdA, '00000000103', 'Pedro Lima Lider A', {
      isLider: true,
    });
    colabIdA = await seedEmployee(companyIdA, '00000000104', 'Carlos Mendes Colab A', {});
    colabIdB = await seedEmployee(companyIdB, '00000000105', 'Roberto Nascimento Colab B', {});
    cLevelIdA = await seedCLevel(companyIdA, '00000000106', 'Marina Souza CFO A');
  });

  async function seedEmployee(
    companyId: number,
    cpf: string,
    name: string,
    opts: { isRH?: boolean; isLider?: boolean } = {},
  ): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isRH: opts.isRH ?? false,
        isLider: opts.isLider ?? false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedCLevel(companyId: number, cpf: string, name: string): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name,
        cpf,
        email: `${cpf}@roip.test`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2018-01-01'),
        cargo: 'CFO',
        descricaoCargo: 'CFO da empresa',
        departamento: 'Financeiro',
        custoMensal: '25000.00',
        acessoTotal: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seedCLevel sem id');
    }
    return row.id;
  }

  async function seedRFLog(
    companyId: number,
    eventType: 'atribuido' | 'transferido' | 'removido',
    prev: { type: 'employee' | 'cLevel' | 'none'; id: number | null },
    novo: { type: 'employee' | 'cLevel' | 'none'; id: number | null },
    reason: string,
    createdAt?: Date,
  ): Promise<number> {
    const [row] = await client.db
      .insert(responsavelFinanceiroTransferLog)
      .values({
        companyId,
        previousHolderType: prev.type,
        previousHolderId: prev.id,
        newHolderType: novo.type,
        newHolderId: novo.id,
        actorSuperAdminId: 1, // fixture
        eventType,
        reason,
      })
      .$returningId();
    if (row === undefined) throw new Error('seedRFLog sem id');
    if (createdAt !== undefined) {
      await client.db
        .update(responsavelFinanceiroTransferLog)
        .set({ createdAt })
        .where(eq(responsavelFinanceiroTransferLog.id, row.id));
    }
    return row.id;
  }

  // -------------------------------------------------------------------
  // Grupo 1 — Logs RF Bruno cross-empresa (§14.20)
  // -------------------------------------------------------------------
  describe('Grupo 1 — logs RF cross-empresa (§14.20 Bruno only)', () => {
    it('sem filtros → todos os logs cross-empresa em createdAt DESC', async () => {
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdA },
        'Primeiro RF atribuido A',
      );
      await seedRFLog(
        companyIdB,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdB },
        'Primeiro RF atribuido B',
      );
      await seedRFLog(
        companyIdA,
        'transferido',
        { type: 'employee', id: rhIdA },
        { type: 'cLevel', id: cLevelIdA },
        'Transferencia RH → CFO na A',
      );

      const result = await loadRFLogsPage(client.db, CANONICAL_RF_DEFAULT_FILTERS);
      expect(result.totalCount).toBe(3);
      expect(result.rows.length).toBe(3);
      // Mais recente primeiro (o ultimo seeded).
      expect(result.rows[0]!.eventType).toBe('transferido');
      expect(result.rows[0]!.companyDisplayName).toBe('ROIP ME-057b A');
    });

    it('resolucao polimorfica bit-exact: employee vs cLevel vs none', async () => {
      await seedRFLog(
        companyIdA,
        'transferido',
        { type: 'employee', id: rhIdA },
        { type: 'cLevel', id: cLevelIdA },
        'Trans RH → CFO',
      );
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: liderIdA },
        'RF atribuido ao lider',
      );
      await seedRFLog(
        companyIdA,
        'removido',
        { type: 'cLevel', id: cLevelIdA },
        { type: 'none', id: null },
        'RF removido do CFO',
      );

      const result = await loadRFLogsPage(client.db, CANONICAL_RF_DEFAULT_FILTERS);
      // Mais recente primeiro: removido, atribuido, transferido.
      expect(result.rows[0]!.eventType).toBe('removido');
      expect(result.rows[0]!.deNome).toBe('Marina Souza CFO A');
      expect(result.rows[0]!.paraNome).toBeNull();
      expect(result.rows[1]!.eventType).toBe('atribuido');
      expect(result.rows[1]!.deNome).toBeNull();
      expect(result.rows[1]!.paraNome).toBe('Pedro Lima Lider A');
      expect(result.rows[2]!.eventType).toBe('transferido');
      expect(result.rows[2]!.deNome).toBe('Marina Costa RH A');
      expect(result.rows[2]!.paraNome).toBe('Marina Souza CFO A');
    });

    it('filtro empresa → restringe a empresa selecionada', async () => {
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdA },
        'A',
      );
      await seedRFLog(
        companyIdB,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdB },
        'B',
      );

      const result = await loadRFLogsPage(client.db, {
        ...CANONICAL_RF_DEFAULT_FILTERS,
        empresaId: companyIdA,
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.companyId).toBe(companyIdA);
    });

    it('filtro tipo evento → apenas o tipo selecionado', async () => {
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdA },
        'atr',
      );
      await seedRFLog(
        companyIdA,
        'transferido',
        { type: 'employee', id: rhIdA },
        { type: 'cLevel', id: cLevelIdA },
        'trans',
      );
      await seedRFLog(
        companyIdA,
        'removido',
        { type: 'cLevel', id: cLevelIdA },
        { type: 'none', id: null },
        'rem',
      );

      const result = await loadRFLogsPage(client.db, {
        ...CANONICAL_RF_DEFAULT_FILTERS,
        eventType: 'transferido',
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.eventType).toBe('transferido');
    });

    it('paginacao 25/50/100 respeitada', async () => {
      // Semeia 30 logs.
      for (let i = 0; i < 30; i++) {
        await seedRFLog(
          companyIdA,
          'atribuido',
          { type: 'none', id: null },
          { type: 'employee', id: rhIdA },
          `evento ${i}`,
        );
      }

      const p1 = await loadRFLogsPage(client.db, {
        ...CANONICAL_RF_DEFAULT_FILTERS,
        pageSize: 25,
        page: 1,
      });
      expect(p1.totalCount).toBe(30);
      expect(p1.rows.length).toBe(25);

      const p2 = await loadRFLogsPage(client.db, {
        ...CANONICAL_RF_DEFAULT_FILTERS,
        pageSize: 25,
        page: 2,
      });
      expect(p2.rows.length).toBe(5);
    });

    it('executadoPor sempre resolve para o superAdmin fixture', async () => {
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdA },
        'x',
      );
      const result = await loadRFLogsPage(client.db, CANONICAL_RF_DEFAULT_FILTERS);
      expect(result.rows[0]!.executadoPorNome).toBe('Fixture Super Admin (test)');
    });
  });

  // -------------------------------------------------------------------
  // Grupo 2 — Log de acesso individual RH proprio escopo (§14.22)
  // -------------------------------------------------------------------
  describe('Grupo 2 — DAL RH proprio escopo (§14.22)', () => {
    it('scopeCompanyId=X → filtra bit-exact a essa empresa', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'Dashboard individual — 2º trimestre',
      });
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdB,
        agentType: 'rh',
        agentId: rhIdB,
        titularEmployeeId: colabIdB,
        tipoAcesso: 'dashboard_individual',
        contexto: 'Dashboard individual — 2º trimestre',
      });

      const result = await loadDataAccessLogPage(
        client.db,
        companyIdA,
        CANONICAL_DAL_DEFAULT_FILTERS,
      );
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.companyId).toBe(companyIdA);
      expect(result.rows[0]!.agentName).toBe('Marina Costa RH A');
      expect(result.rows[0]!.titularName).toBe('Carlos Mendes Colab A');
    });

    it('resolucao polimorfica do agente: rh vs lider vs clevel vs super_admin', async () => {
      // agentType='rh'
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'ctx rh',
      });
      // agentType='lider'
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'lider',
        agentId: liderIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'relatorio_perfil_individual',
        contexto: 'ctx lider',
      });
      // agentType='clevel'
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'clevel',
        agentId: cLevelIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'exportacao_planilha',
        contexto: 'ctx clevel',
      });
      // agentType='super_admin'
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'super_admin',
        agentId: 1,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'ctx super_admin',
      });

      const result = await loadDataAccessLogPage(
        client.db,
        companyIdA,
        CANONICAL_DAL_DEFAULT_FILTERS,
      );
      expect(result.totalCount).toBe(4);
      const nomesPorAgente = result.rows.map((r) => ({
        agentType: r.agentType,
        agentName: r.agentName,
      }));
      expect(nomesPorAgente).toEqual(
        expect.arrayContaining([
          { agentType: 'rh', agentName: 'Marina Costa RH A' },
          { agentType: 'lider', agentName: 'Pedro Lima Lider A' },
          { agentType: 'clevel', agentName: 'Marina Souza CFO A' },
          { agentType: 'super_admin', agentName: 'Fixture Super Admin (test)' },
        ]),
      );
    });

    it('filtro tipoAcesso', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'a',
      });
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'exportacao_planilha',
        contexto: 'b',
      });

      const result = await loadDataAccessLogPage(client.db, companyIdA, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        tipoAcesso: 'exportacao_planilha',
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.tipoAcesso).toBe('exportacao_planilha');
    });

    it('search unificado CC043: casa nome do titular', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'a',
      });
      const result = await loadDataAccessLogPage(client.db, companyIdA, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        search: 'Carlos',
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.titularName).toContain('Carlos');
    });

    it('search unificado CC043: casa CPF do titular', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'a',
      });
      const result = await loadDataAccessLogPage(client.db, companyIdA, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        search: '00000000104',
      });
      expect(result.totalCount).toBe(1);
    });

    it('search unificado CC043: casa nome do agente (via LEFT JOIN polimorfico)', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'a',
      });
      const result = await loadDataAccessLogPage(client.db, companyIdA, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        search: 'Marina Costa',
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.agentName).toBe('Marina Costa RH A');
    });

    it('paginacao respeitada', async () => {
      for (let i = 0; i < 30; i++) {
        await insertDataAccessLogEntry(client.db, {
          companyId: companyIdA,
          agentType: 'rh',
          agentId: rhIdA,
          titularEmployeeId: colabIdA,
          tipoAcesso: 'dashboard_individual',
          contexto: `ctx ${i}`,
        });
      }
      const p1 = await loadDataAccessLogPage(client.db, companyIdA, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        pageSize: 25,
        page: 1,
      });
      expect(p1.totalCount).toBe(30);
      expect(p1.rows.length).toBe(25);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 3 — DAL Bruno cross-empresa
  // -------------------------------------------------------------------
  describe('Grupo 3 — DAL Bruno cross-empresa', () => {
    it('scopeCompanyId=null → retorna logs de todas as empresas', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'A',
      });
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdB,
        agentType: 'rh',
        agentId: rhIdB,
        titularEmployeeId: colabIdB,
        tipoAcesso: 'dashboard_individual',
        contexto: 'B',
      });

      const result = await loadDataAccessLogPage(client.db, null, CANONICAL_DAL_DEFAULT_FILTERS);
      expect(result.totalCount).toBe(2);
      const companyIds = result.rows.map((r) => r.companyId).sort();
      expect(companyIds).toEqual([companyIdA, companyIdB].sort());
    });

    it('scopeCompanyId=null com filtro empresaId=X → filtra server-side', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'A',
      });
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdB,
        agentType: 'rh',
        agentId: rhIdB,
        titularEmployeeId: colabIdB,
        tipoAcesso: 'dashboard_individual',
        contexto: 'B',
      });

      const result = await loadDataAccessLogPage(client.db, null, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        empresaId: companyIdA,
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.companyId).toBe(companyIdA);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 4 — Cross-tenant guards
  // -------------------------------------------------------------------
  describe('Grupo 4 — cross-tenant guards', () => {
    it('RH da empresa A NAO ve logs da empresa B (scopeCompanyId=A)', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdB,
        agentType: 'rh',
        agentId: rhIdB,
        titularEmployeeId: colabIdB,
        tipoAcesso: 'dashboard_individual',
        contexto: 'B',
      });

      const result = await loadDataAccessLogPage(
        client.db,
        companyIdA,
        CANONICAL_DAL_DEFAULT_FILTERS,
      );
      expect(result.totalCount).toBe(0);
      expect(result.rows.length).toBe(0);
    });

    it('RH da empresa A ve APENAS proprio escopo mesmo com logs mistos', async () => {
      // 2 logs A + 3 logs B.
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'dashboard_individual',
        contexto: 'A1',
      });
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdA,
        agentType: 'rh',
        agentId: rhIdA,
        titularEmployeeId: colabIdA,
        tipoAcesso: 'exportacao_planilha',
        contexto: 'A2',
      });
      for (let i = 0; i < 3; i++) {
        await insertDataAccessLogEntry(client.db, {
          companyId: companyIdB,
          agentType: 'rh',
          agentId: rhIdB,
          titularEmployeeId: colabIdB,
          tipoAcesso: 'dashboard_individual',
          contexto: `B${i}`,
        });
      }

      const resultA = await loadDataAccessLogPage(
        client.db,
        companyIdA,
        CANONICAL_DAL_DEFAULT_FILTERS,
      );
      expect(resultA.totalCount).toBe(2);
      expect(resultA.rows.every((r) => r.companyId === companyIdA)).toBe(true);

      const resultB = await loadDataAccessLogPage(
        client.db,
        companyIdB,
        CANONICAL_DAL_DEFAULT_FILTERS,
      );
      expect(resultB.totalCount).toBe(3);
      expect(resultB.rows.every((r) => r.companyId === companyIdB)).toBe(true);
    });

    it('scopeCompanyId=X ignora filters.empresaId=Y (guard prevalece sobre param)', async () => {
      await insertDataAccessLogEntry(client.db, {
        companyId: companyIdB,
        agentType: 'rh',
        agentId: rhIdB,
        titularEmployeeId: colabIdB,
        tipoAcesso: 'dashboard_individual',
        contexto: 'B',
      });

      // RH da empresa A tenta forjar `empresaId=B` — o scopeCompanyId
      // deve prevalecer (guard bit-exact do query).
      const result = await loadDataAccessLogPage(client.db, companyIdA, {
        ...CANONICAL_DAL_DEFAULT_FILTERS,
        empresaId: companyIdB,
      });
      expect(result.totalCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 5 — loadEmpresasList
  // -------------------------------------------------------------------
  describe('Grupo 5 — loadEmpresasList (dropdown Empresa)', () => {
    it('retorna todas as empresas em ordem alfabetica', async () => {
      const list = await loadEmpresasList(client.db);
      // 2 empresas semeadas.
      expect(list.length).toBe(2);
      expect(list[0]!.nomeFantasia < list[1]!.nomeFantasia).toBe(true);
    });

    it('estrutura canonica {id, nomeFantasia}', async () => {
      const list = await loadEmpresasList(client.db);
      for (const e of list) {
        expect(typeof e.id).toBe('number');
        expect(typeof e.nomeFantasia).toBe('string');
      }
    });
  });

  // -------------------------------------------------------------------
  // Grupo 6 — Filtro periodo
  // -------------------------------------------------------------------
  describe('Grupo 6 — filtro periodo (RF §14.20)', () => {
    it('periodo 30 dias → apenas eventos recentes', async () => {
      // Insere 1 evento antigo (100 dias atras) e 1 recente (5 dias).
      const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdA },
        'antigo',
        old,
      );
      await seedRFLog(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: rhIdA },
        'recente',
        recent,
      );

      // Sanity check: 2 rows via SELECT COUNT antes.
      const before = await client.db
        .select({ n: sql<number>`COUNT(*)` })
        .from(responsavelFinanceiroTransferLog);
      expect(Number(before[0]!.n)).toBe(2);

      const result = await loadRFLogsPage(client.db, {
        ...CANONICAL_RF_DEFAULT_FILTERS,
        periodo: '30',
      });
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]!.reason).toBe('recente');
    });
  });
});
