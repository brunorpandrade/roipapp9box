// ROIP APP 9BOX — teste de integracao ME-B9-fechamento
// (D-ME085-L2-MINHA-EQUIPE ENCERRADO). Cobre semantica canonica S230-B
// do loader `/minha-equipe`:
// - `enforceEmployeeLeaderScope` (renomeado de `enforceRHLiderScope`)
//   opera bit-a-bit para qualquer employee-leader (RH-Lider OU Lider).
// - `loadMinhaEquipePageForEmployeeLeader` retorna os liderados diretos
//   ativos do employee autenticado, escopado por `companyId` + `leaderId`.
// - Testes cobrem cenario Lider C1 (sem cadeia) e Lider C2 (com cadeia).
//   C-level fora do escopo (D-CU-EMPIRICO — validacao empirica de
//   `liderIdTipo='clevel'` no scoper em ME futura).
//
// Faixa canonica CNPJ desta ME: 10870000000100..10870000000149.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, employeeLeaderHistory } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  enforceEmployeeLeaderScope,
  loadMinhaEquipePageForEmployeeLeader,
} from '../../src/app/minha-equipe/internals';
import { CANONICAL_COLABORADORES_DEFAULT_FILTERS } from '../../src/app/minha-equipe/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ = '10870000000100';

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

describe('ME-B9-fechamento — /minha-equipe employee-leader (S230-B)', () => {
  let client: RoipDbClient;
  let companyId: number;

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

    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-B9-fech minha-equipe LTDA',
      nomeFantasia: 'ROIP ME-B9-fech minha-equipe',
      cnpj: CNPJ,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyId]));
  });

  describe('enforceEmployeeLeaderScope', () => {
    it('forca liderId=leaderId + liderIdTipo=employee bit-a-bit', () => {
      const input = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        liderId: 999,
        liderIdTipo: 'clevel' as const,
      };
      const out = enforceEmployeeLeaderScope(input, 42);
      expect(out.liderId).toBe(42);
      expect(out.liderIdTipo).toBe('employee');
    });

    it('reseta papelFuncional=respfin para todos (§16.2)', () => {
      const input = {
        ...CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        papelFuncional: 'respfin' as const,
      };
      const out = enforceEmployeeLeaderScope(input, 42);
      expect(out.papelFuncional).toBe('todos');
    });
  });

  describe('loadMinhaEquipePageForEmployeeLeader — Lider (nao RH-Lider) S230-B', () => {
    it('Lider C1 puro (sem cadeia descendente) ve seus liderados diretos', async () => {
      const liderId = await seedEmployee({
        cpf: '20870000101',
        isLider: true,
        isRH: false,
      });
      const l1 = await seedEmployee({ cpf: '20870000102' });
      const l2 = await seedEmployee({ cpf: '20870000103' });
      await seedLeaderHistory(l1, liderId);
      await seedLeaderHistory(l2, liderId);

      const filters = { ...CANONICAL_COLABORADORES_DEFAULT_FILTERS, page: 1 };
      const pageData = await loadMinhaEquipePageForEmployeeLeader(
        client.db,
        companyId,
        liderId,
        filters,
      );
      expect(pageData.listResult.totalCount).toBe(2);
      const ids = pageData.listResult.rows.map((r) => r.id).sort((a, b) => a - b);
      expect(ids).toEqual([l1, l2].sort((a, b) => a - b));
    });

    it('Lider C2 (com cadeia descendente) ve APENAS liderados diretos, nao a cadeia', async () => {
      const liderC2 = await seedEmployee({
        cpf: '20870000110',
        isLider: true,
      });
      const liderDireto = await seedEmployee({ cpf: '20870000111', isLider: true });
      const indireto = await seedEmployee({ cpf: '20870000112' });
      await seedLeaderHistory(liderDireto, liderC2);
      await seedLeaderHistory(indireto, liderDireto);

      const filters = { ...CANONICAL_COLABORADORES_DEFAULT_FILTERS, page: 1 };
      const pageData = await loadMinhaEquipePageForEmployeeLeader(
        client.db,
        companyId,
        liderC2,
        filters,
      );
      // Apenas o liderado direto — nao inclui o indireto.
      expect(pageData.listResult.totalCount).toBe(1);
      expect(pageData.listResult.rows[0]?.id).toBe(liderDireto);
    });

    it('Lider sem liderados diretos ve empty', async () => {
      const liderId = await seedEmployee({ cpf: '20870000120', isLider: true });
      const filters = { ...CANONICAL_COLABORADORES_DEFAULT_FILTERS, page: 1 };
      const pageData = await loadMinhaEquipePageForEmployeeLeader(
        client.db,
        companyId,
        liderId,
        filters,
      );
      expect(pageData.listResult.totalCount).toBe(0);
      expect(pageData.listResult.rows).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // Helpers de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: {
    cpf: string;
    isLider?: boolean;
    isRH?: boolean;
  }): Promise<number> {
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
        isRH: overrides.isRH ?? false,
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

  async function seedLeaderHistory(employeeId: number, liderId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'seed teste ME-B9-fechamento minha-equipe',
      transferBatchId: '00000000-0000-4000-8000-000000000872',
    });
  }
});
