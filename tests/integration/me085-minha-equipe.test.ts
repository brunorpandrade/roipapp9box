// ROIP APP 9BOX — teste de integracao ME-085 rota RH-Lider
// `/minha-equipe` (§14.11 + §5.5).
//
// Cobre canonicamente bit-exact contra MySQL real (RV-11):
//   1. `enforceRHLiderScope` (funcao pura):
//      - Aplica `liderId = leaderId` + `liderIdTipo = 'employee'` bit-
//        exact independentemente do input.
//      - Reseta `papelFuncional = 'respfin' → 'todos'`.
//      - Preserva todos os demais filtros bit-exact.
//   2. `loadMinhaEquipePageForRHLider`:
//      - Retorna apenas liderados diretos ativos do RH-Lider (via
//        `elh.liderId = leaderId AND elh.dataFim IS NULL`).
//      - Ignora liderados diretos de outros lideres (defense-in-depth).
//      - Ignora liderados que tiveram `dataFim` preenchido (vinculo
//        fechado — nao ativo).
//      - Blindado contra escape de escopo via cliente (input
//        `filters.liderId` diferente e sobrescrito).
//      - Preserva `totalCount` respeitando filtros ativos (busca,
//        status, senioridade).
//
// Faixa canonica CNPJ desta ME: 10850000000001..10850000000049.
// Padrao bit-exact ME-083 (S513) — L32 cleanup em afterAll + beforeEach.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, employeeLeaderHistory } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  enforceRHLiderScope,
  loadMinhaEquipePageForRHLider,
} from '../../src/app/minha-equipe/internals';
import { CANONICAL_COLABORADORES_DEFAULT_FILTERS } from '../../src/app/minha-equipe/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_A = '10850000000001';
const CNPJ_B = '10850000000002';

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

describe('ME-085 — rota RH-Lider `/minha-equipe` §14.11 (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-085 A LTDA',
      nomeFantasia: 'ROIP ME-085 A',
      cnpj: CNPJ_A,
    });
    companyIdB = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-085 B LTDA',
      nomeFantasia: 'ROIP ME-085 B',
      cnpj: CNPJ_B,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyIdA, companyIdB]));
  });

  // ---------------------------------------------------------------------
  // enforceRHLiderScope — funcao pura
  // ---------------------------------------------------------------------

  describe('enforceRHLiderScope', () => {
    it('forca liderId e liderIdTipo canonica bit-exact', () => {
      const input = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        liderId: 999, // cliente tenta injetar liderId aleatorio
        liderIdTipo: 'clevel' as const, // e tipo aleatorio
      };
      const out = enforceRHLiderScope(input, 42);
      expect(out.liderId).toBe(42);
      expect(out.liderIdTipo).toBe('employee');
    });

    it('reseta papelFuncional respfin para todos (defesa §16.2)', () => {
      const input = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        papelFuncional: 'respfin' as const,
      };
      const out = enforceRHLiderScope(input, 42);
      expect(out.papelFuncional).toBe('todos');
    });

    it('preserva bit-exact papelFuncional em valores nao-respfin', () => {
      const cases = ['todos', 'lider', 'rh', 'sem_papel'] as const;
      for (const p of cases) {
        const out = enforceRHLiderScope(
          { ...CANONICAL_COLABORADORES_DEFAULT_FILTERS, papelFuncional: p },
          42,
        );
        expect(out.papelFuncional).toBe(p);
      }
    });

    it('preserva bit-exact todos os demais filtros', () => {
      const input = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        busca: 'ana',
        status: 'todos' as const,
        senioridade: 'senior' as const,
        page: 3,
        pageSize: 100 as const,
      };
      const out = enforceRHLiderScope(input, 42);
      expect(out.busca).toBe('ana');
      expect(out.status).toBe('todos');
      expect(out.senioridade).toBe('senior');
      expect(out.page).toBe(3);
      expect(out.pageSize).toBe(100);
    });
  });

  // ---------------------------------------------------------------------
  // loadMinhaEquipePageForRHLider — 3 queries paralelas
  // ---------------------------------------------------------------------

  describe('loadMinhaEquipePageForRHLider', () => {
    it('retorna apenas liderados diretos ativos do RH-Lider autenticado', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000001',
        name: 'RH Lider Titular',
        isRH: true,
        isLider: true,
      });
      const liderado1 = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000002',
        name: 'Ana Liderada Direta',
      });
      const liderado2 = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000003',
        name: 'Bruno Liderado Direto',
      });
      // Vinculo ativo (dataFim=null)
      await seedLeaderHistoryOpen({ employeeId: liderado1, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: liderado2, liderId: rhlId });

      const data = await loadMinhaEquipePageForRHLider(
        client.db,
        companyIdA,
        rhlId,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
      );
      expect(data.listResult.totalCount).toBe(2);
      const names = data.listResult.rows.map((r) => r.name).sort();
      expect(names).toEqual(['Ana Liderada Direta', 'Bruno Liderado Direto']);
    });

    it('ignora bit-exact liderados de outros lideres (defense-in-depth)', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000010',
        name: 'RH Lider A',
        isRH: true,
        isLider: true,
      });
      const outroLiderId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000011',
        name: 'Outro Lider',
        isLider: true,
      });
      const meuLiderado = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000012',
        name: 'Meu Liderado',
      });
      const naoMeuLiderado = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000013',
        name: 'Nao Meu Liderado',
      });
      await seedLeaderHistoryOpen({ employeeId: meuLiderado, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: naoMeuLiderado, liderId: outroLiderId });

      const data = await loadMinhaEquipePageForRHLider(
        client.db,
        companyIdA,
        rhlId,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
      );
      expect(data.listResult.totalCount).toBe(1);
      expect(data.listResult.rows[0]?.name).toBe('Meu Liderado');
    });

    it('ignora bit-exact liderados com vinculo fechado (dataFim preenchido)', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000020',
        name: 'RH Lider',
        isRH: true,
        isLider: true,
      });
      const exLiderado = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000021',
        name: 'Ex Liderado',
      });
      // Vinculo fechado — dataFim preenchido
      await client.db.insert(employeeLeaderHistory).values({
        employeeId: exLiderado,
        liderId: rhlId,
        dataInicio: new Date('2020-01-01'),
        dataFim: new Date('2023-12-31'),
        reason: 'Transferencia',
        transferBatchId: '00000000-0000-0000-0000-000000000085',
      });

      const data = await loadMinhaEquipePageForRHLider(
        client.db,
        companyIdA,
        rhlId,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
      );
      expect(data.listResult.totalCount).toBe(0);
    });

    it('blindada contra escape de escopo: input liderId divergente e sobrescrito', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000030',
        name: 'RH Lider',
        isRH: true,
        isLider: true,
      });
      const outroLiderId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000031',
        name: 'Outro Lider',
        isLider: true,
      });
      const meuLiderado = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000032',
        name: 'Meu Liderado',
      });
      const alvoDoOutroLider = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000033',
        name: 'Alvo Do Outro',
      });
      await seedLeaderHistoryOpen({ employeeId: meuLiderado, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: alvoDoOutroLider, liderId: outroLiderId });

      // Cliente injeta liderId do outro lider — deve ser sobrescrito
      // por `enforceRHLiderScope` para `rhlId`.
      const filtrosManipulados = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        liderId: outroLiderId,
        liderIdTipo: 'employee' as const,
      };
      const data = await loadMinhaEquipePageForRHLider(
        client.db,
        companyIdA,
        rhlId,
        filtrosManipulados,
      );
      expect(data.listResult.totalCount).toBe(1);
      expect(data.listResult.rows[0]?.name).toBe('Meu Liderado');
    });

    it('respeita filtro `busca` no escopo dos liderados diretos', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000040',
        name: 'RH Lider',
        isRH: true,
        isLider: true,
      });
      const ana = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000041',
        name: 'Ana Silva',
      });
      const bruno = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000042',
        name: 'Bruno Costa',
      });
      await seedLeaderHistoryOpen({ employeeId: ana, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: bruno, liderId: rhlId });

      const filtroBusca = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        busca: 'ana',
      };
      const data = await loadMinhaEquipePageForRHLider(client.db, companyIdA, rhlId, filtroBusca);
      expect(data.listResult.totalCount).toBe(1);
      expect(data.listResult.rows[0]?.name).toBe('Ana Silva');
    });

    it('devolve totalCount=0 canonicamente quando RH-Lider nao tem liderados', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000050',
        name: 'RH Lider Solo',
        isRH: true,
        isLider: true,
      });

      const data = await loadMinhaEquipePageForRHLider(
        client.db,
        companyIdA,
        rhlId,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
      );
      expect(data.listResult.totalCount).toBe(0);
      expect(data.listResult.rows).toEqual([]);
    });

    it('escopo por companyId: liderado em outra empresa e ignorado', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '20000000060',
        name: 'RH Lider A',
        isRH: true,
        isLider: true,
      });
      const liderado = await seedEmployee({
        companyId: companyIdB, // outra empresa
        cpf: '20000000061',
        name: 'Liderado Outra Empresa',
      });
      // Vinculo tecnicamente possivel via id (nao valida FK cross-company)
      await seedLeaderHistoryOpen({ employeeId: liderado, liderId: rhlId });

      const data = await loadMinhaEquipePageForRHLider(
        client.db,
        companyIdA,
        rhlId,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
      );
      // Query escopa por employees.companyId = companyIdA → liderado
      // fica fora mesmo com vinculo em history.
      expect(data.listResult.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Helpers de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    name?: string;
    isLider?: boolean;
    isRH?: boolean;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: overrides.name ?? `Titular ${overrides.cpf}`,
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

  async function seedLeaderHistoryOpen(overrides: {
    employeeId: number;
    liderId: number;
  }): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: overrides.employeeId,
      liderId: overrides.liderId,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'Seed test ME-085',
      transferBatchId: '00000000-0000-0000-0000-000000000085',
    });
  }
});
