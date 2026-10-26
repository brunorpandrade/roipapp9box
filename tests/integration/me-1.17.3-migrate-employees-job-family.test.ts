// ROIP APP 9BOX — teste de integracao
// `migrateEmployeesJobFamily` (ME-1.17.3, Conversa 5 — fecho
// operacional).
//
// Cobre canonicamente o helper que move em LOTE todos os
// colaboradores ATIVOS de uma empresa de `fromFamily` para
// `toFamily`:
//   1. Idempotente quando `fromFamily === toFamily` (zero updates).
//   2. Zero updates quando nao ha colaboradores em `fromFamily`.
//   3. Move apenas colaboradores ATIVOS (status = 'ativo'); nao
//      toca inativos.
//   4. Nao afeta colaboradores de outras empresas.
//
// Fluxo canonico consumidor: `migrateAndDeactivateFamilyAction` da
// rota `/super-admin/empresa/[id]/familias` (modal de migracao
// aberto ao tentar desativar familia ocupada).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees } from '../../src/db/schema';
import { createEmployee, type NewEmployee } from '../../src/server/services/employees';
import { migrateEmployeesJobFamily } from '../../src/server/services/employees';
import { countEmployeesByJobFamily } from '../../src/lib/job-family/countEmployeesByJobFamily';
import { eq } from 'drizzle-orm';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '55555555000199';

describe('migrateEmployeesJobFamily (ME-1.17.3)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa 1.17.3 LTDA',
        nomeFantasia: 'Empresa 1.17.3',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330006',
        endereco: 'Rua 1.17.3, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@1.17.3.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@1.17.3.local',
        segmento: 'Comércio',
        tipoAtividade: 'Comercio de bens',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 4,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!row) {
      throw new Error('setup 1.17.3: insert company retornou sem id');
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

  it('idempotente quando fromFamily === toFamily', async () => {
    await createEmployee(client.db, mkEmployee({ cpf: '00000000001' }));
    const affected = await migrateEmployeesJobFamily(
      client.db,
      companyId,
      'vendas_comercial',
      'vendas_comercial',
    );
    expect(affected).toBe(0);
  });

  it('zero updates quando fromFamily esta vazia', async () => {
    const affected = await migrateEmployeesJobFamily(
      client.db,
      companyId,
      'vendas_comercial',
      'producao_operacoes',
    );
    expect(affected).toBe(0);
  });

  it('move apenas colaboradores ATIVOS (status=ativo)', async () => {
    await createEmployee(
      client.db,
      mkEmployee({ cpf: '00000000010', jobFamily: 'vendas_comercial', status: 'ativo' }),
    );
    await createEmployee(
      client.db,
      mkEmployee({ cpf: '00000000011', jobFamily: 'vendas_comercial', status: 'ativo' }),
    );
    await createEmployee(
      client.db,
      mkEmployee({ cpf: '00000000012', jobFamily: 'vendas_comercial', status: 'inativo' }),
    );
    const affected = await migrateEmployeesJobFamily(
      client.db,
      companyId,
      'vendas_comercial',
      'tecnico_especialista',
    );
    expect(affected).toBe(2);
    const counts = await countEmployeesByJobFamily(client.db, companyId);
    expect(counts.vendas_comercial).toBe(0);
    expect(counts.tecnico_especialista).toBe(2);
  });

  it('nao afeta outras empresas', async () => {
    await createEmployee(
      client.db,
      mkEmployee({ cpf: '00000000020', jobFamily: 'vendas_comercial' }),
    );
    const outraCnpj = '55555555000200';
    const [outra] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Outra 1.17.3 LTDA',
        nomeFantasia: 'Outra 1.17.3',
        cnpj: outraCnpj,
        telefone: '1633330007',
        endereco: 'Rua Outra, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato',
        contatoPrincipalEmail: 'c@outra-1.17.3.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@outra-1.17.3.local',
        segmento: 'Comércio',
        tipoAtividade: 'Comercio de bens',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 4,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!outra) {
      throw new Error('setup teste outra empresa: insert retornou sem id');
    }
    try {
      await createEmployee(
        client.db,
        mkEmployee({ companyId: outra.id, cpf: '00000000030', jobFamily: 'vendas_comercial' }),
      );
      const affected = await migrateEmployeesJobFamily(
        client.db,
        companyId,
        'vendas_comercial',
        'producao_operacoes',
      );
      expect(affected).toBe(1);
      const outraCounts = await countEmployeesByJobFamily(client.db, outra.id);
      expect(outraCounts.vendas_comercial).toBe(1);
    } finally {
      await client.db.delete(employees).where(eq(employees.companyId, outra.id));
      await client.db.delete(companies).where(eq(companies.id, outra.id));
    }
  });
});
