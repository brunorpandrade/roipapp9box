// ROIP APP 9BOX — teste de integracao
// `countEmployeesByJobFamily` (ME-1.17.2, Conversa 5 — UI de gestao
// de familias).
//
// Cobre canonicamente bit-exact o helper
// `countEmployeesByJobFamily(db, companyId)` que:
//   1. SELECT com GROUP BY sobre `employees` filtrado por `companyId`
//      e `status = 'ativo'`.
//   2. Retorna `Record<JobFamily, number>` com todas as 26 chaves
//      canonicas (zeros nas familias sem colaboradores ATIVOS).
//
// Tres cenarios canonicos (RV-03):
//   1. Empresa sem colaboradores → todas 26 chaves retornam 0.
//   2. Empresa com 3 colaboradores em 2 familias canonicas → counts
//      corretos nessas 2, 0 nas demais.
//   3. Colaborador inativo nao conta (filtro `status = 'ativo'`).
//
// Guard canonico de desativacao da familia (ME-1.17.2 Despacho 2 D6)
// consome este helper via `toggleFamilyActiveAction` server-side.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, JOB_FAMILY_CANONICAL_VALUES } from '../../src/db/schema';
import { createEmployee, type NewEmployee } from '../../src/server/services/employees';
import { countEmployeesByJobFamily } from '../../src/lib/job-family/countEmployeesByJobFamily';
import { eq } from 'drizzle-orm';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '55555555000188';

describe('countEmployeesByJobFamily (ME-1.17.2)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa 1.17.2 LTDA',
        nomeFantasia: 'Empresa 1.17.2',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330005',
        endereco: 'Rua 1.17.2, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@1.17.2.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@1.17.2.local',
        segmento: 'Comércio',
        tipoAtividade: 'Comercio de bens',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 4,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!row) {
      throw new Error('setup 1.17.2: insert company retornou sem id');
    }
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
  });

  it('empresa sem colaboradores — todas 26 chaves retornam 0', async () => {
    const counts = await countEmployeesByJobFamily(client.db, companyId);
    for (const key of JOB_FAMILY_CANONICAL_VALUES) {
      expect(counts[key]).toBe(0);
    }
    expect(counts.custom1).toBe(0);
    expect(counts.custom20).toBe(0);
  });

  function mkEmployee(partial: Partial<NewEmployee>): NewEmployee {
    return {
      companyId,
      name: 'Colaborador',
      cpf: '00000000000',
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'Cargo',
      cbo: '0000',
      descricaoCBO: 'Descricao CBO',
      jobFamily: 'vendas_comercial',
      senioridade: 'junior',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      ...partial,
    };
  }

  it('3 colaboradores em 2 familias — counts corretos nelas, 0 nas demais', async () => {
    await createEmployee(
      client.db,
      mkEmployee({ name: 'Vendedor 1', cpf: '00000000001', jobFamily: 'vendas_comercial' }),
    );
    await createEmployee(
      client.db,
      mkEmployee({ name: 'Vendedor 2', cpf: '00000000002', jobFamily: 'vendas_comercial' }),
    );
    await createEmployee(
      client.db,
      mkEmployee({
        name: 'Operador 1',
        cpf: '00000000003',
        jobFamily: 'producao_operacoes',
        departamento: 'Produção',
      }),
    );
    const counts = await countEmployeesByJobFamily(client.db, companyId);
    expect(counts.vendas_comercial).toBe(2);
    expect(counts.producao_operacoes).toBe(1);
    expect(counts.tecnico_especialista).toBe(0);
    expect(counts.administrativo_suporte).toBe(0);
    expect(counts.atendimento_relacionamento).toBe(0);
    expect(counts.lideranca_gestao).toBe(0);
  });

  it('colaborador inativo nao conta', async () => {
    await createEmployee(
      client.db,
      mkEmployee({ name: 'Ativo', cpf: '00000000010', status: 'ativo' }),
    );
    await createEmployee(
      client.db,
      mkEmployee({ name: 'Inativo', cpf: '00000000011', status: 'inativo' }),
    );
    const counts = await countEmployeesByJobFamily(client.db, companyId);
    expect(counts.vendas_comercial).toBe(1);
  });
});
