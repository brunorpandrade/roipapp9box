// ROIP APP 9BOX — teste de integracao `companyJobFamilies` (ME-010).
//
// Roda contra a base efemera `roip_test`. Cada caso limpa
// `companyJobFamilies` e `companies` antes de executar (dependencias
// diretas). O `superAdmins.id = 1` foi semeado no globalSetup.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companyJobFamilies, companies } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  deleteJobFamiliesForCompany,
  insertJobFamilyVariable,
  listJobFamiliesForCompany,
  listVariablesByJobFamily,
} from '../../src/server/services/companyJobFamilies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const FIXTURE_SUPER_ADMIN_ID = 1;

async function seedCompany(client: RoipDbClient): Promise<number> {
  return await createCompany(client.db, {
    razaoSocial: 'CJF Empresa LTDA',
    nomeFantasia: 'CJF Empresa',
    cnpj: '55555555000155',
    telefone: '1633330000',
    endereco: 'Av. Job Family, 1',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Contato Principal',
    contatoPrincipalEmail: 'principal@cjf.test',
    contatoRHNome: 'Contato RH',
    contatoRHEmail: 'rh@cjf.test',
    segmento: 'Comércio',
    tipoAtividade: 'Comercio de bens',
    descricaoAtividade: 'Descricao',
    contextoMercado: 'Contexto',
    mesKickoff: 4,
  });
}

describe('service companyJobFamilies (ME-010)', () => {
  let client: RoipDbClient;

  beforeAll(() => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(companyJobFamilies);
    await client.db.delete(companies);
  });

  it('insertJobFamilyVariable insere e retorna id numerico', async () => {
    const companyId = await seedCompany(client);
    const id = await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket Medio',
      unit: 'R$',
      weight: '0.50',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('listJobFamiliesForCompany ordena por jobFamily e variableIndex', async () => {
    const companyId = await seedCompany(client);
    // Insere fora de ordem para provar que o SELECT ordena.
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 2,
      variableName: 'Conversao',
      unit: '%',
      weight: '0.30',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'producao_operacoes',
      variableIndex: 1,
      variableName: 'Produtividade',
      unit: 'un/h',
      weight: '0.60',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket Medio',
      unit: 'R$',
      weight: '0.50',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    const rows = await listJobFamiliesForCompany(client.db, companyId);
    expect(rows).toHaveLength(3);
    // MySQL ordena ENUM pela POSICAO declarada (JOB_FAMILY_VALUES §15.2 do
    // DOC 01: vendas_comercial=1, producao_operacoes=2, ...), nao
    // alfabeticamente. Ordem esperada: vendas(1), vendas(2), producao(1).
    expect(rows.map((r) => [r.jobFamily, r.variableIndex])).toEqual([
      ['vendas_comercial', 1],
      ['vendas_comercial', 2],
      ['producao_operacoes', 1],
    ]);
  });

  it('listVariablesByJobFamily filtra por jobFamily especifica', async () => {
    const companyId = await seedCompany(client);
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket Medio',
      unit: 'R$',
      weight: '0.50',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'lideranca_gestao',
      variableIndex: 1,
      variableName: 'Engajamento',
      unit: '%',
      weight: '0.70',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    const vendas = await listVariablesByJobFamily(client.db, companyId, 'vendas_comercial');
    expect(vendas).toHaveLength(1);
    expect(vendas[0]?.variableName).toBe('Ticket Medio');
    const lideranca = await listVariablesByJobFamily(client.db, companyId, 'lideranca_gestao');
    expect(lideranca).toHaveLength(1);
    expect(lideranca[0]?.variableName).toBe('Engajamento');
  });

  it('UNIQUE (companyId, jobFamily, variableIndex) rejeita duplicidade', async () => {
    const companyId = await seedCompany(client);
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'Ticket Medio',
      unit: 'R$',
      weight: '0.50',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    await expect(
      insertJobFamilyVariable(client.db, {
        companyId,
        jobFamily: 'vendas_comercial',
        variableIndex: 1,
        variableName: 'Ticket Medio (dup)',
        unit: 'R$',
        weight: '0.50',
        updatedBy: FIXTURE_SUPER_ADMIN_ID,
      }),
    ).rejects.toThrow();
  });

  it('FK companyId invalido rejeita insercao', async () => {
    await expect(
      insertJobFamilyVariable(client.db, {
        companyId: 999999,
        jobFamily: 'vendas_comercial',
        variableIndex: 1,
        variableName: 'X',
        unit: 'R$',
        weight: '0.50',
        updatedBy: FIXTURE_SUPER_ADMIN_ID,
      }),
    ).rejects.toThrow();
  });

  it('deleteJobFamiliesForCompany remove todas as linhas da empresa', async () => {
    const companyId = await seedCompany(client);
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 1,
      variableName: 'V1',
      unit: 'R$',
      weight: '0.50',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    await insertJobFamilyVariable(client.db, {
      companyId,
      jobFamily: 'vendas_comercial',
      variableIndex: 2,
      variableName: 'V2',
      unit: 'R$',
      weight: '0.50',
      updatedBy: FIXTURE_SUPER_ADMIN_ID,
    });
    const affected = await deleteJobFamiliesForCompany(client.db, companyId);
    expect(affected).toBe(2);
    const rows = await listJobFamiliesForCompany(client.db, companyId);
    expect(rows).toHaveLength(0);
  });
});
