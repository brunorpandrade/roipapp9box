// ROIP APP 9BOX — teste de integracao `companies` (ME-010).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup. Cada
// caso limpa `companyJobFamilies` (dependentes) e `companies` antes de
// executar, de forma que a ordem de execucao dos testes seja irrelevante e
// nenhum caso arraste estado para o proximo.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companyJobFamilies, companies } from '../../src/db/schema';
import {
  createCompany,
  deleteCompanyById,
  getCompanyByCnpj,
  getCompanyById,
  updateCompanyStatus,
  type NewCompany,
} from '../../src/server/services/companies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

function buildValidCompany(overrides: Partial<NewCompany> = {}): NewCompany {
  return {
    razaoSocial: 'ROIP Teste LTDA',
    nomeFantasia: 'ROIP Teste',
    cnpj: '12345678000199',
    telefone: '1633334444',
    endereco: 'Rua Teste, 100',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Contato Principal',
    contatoPrincipalEmail: 'principal@roip.test',
    contatoRHNome: 'Contato RH',
    contatoRHEmail: 'rh@roip.test',
    segmento: 'Serviço',
    tipoAtividade: 'Consultoria',
    descricaoAtividade: 'Descricao da atividade',
    contextoMercado: 'Contexto de mercado',
    mesKickoff: 1,
    ...overrides,
  };
}

describe('service companies (ME-010)', () => {
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

  it('createCompany insere e retorna id numerico', async () => {
    const id = await createCompany(client.db, buildValidCompany());
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('getCompanyById retorna a linha semeada com defaults canonicos', async () => {
    const id = await createCompany(client.db, buildValidCompany());
    const row = await getCompanyById(client.db, id);
    if (!row) throw new Error('getCompanyById retornou undefined para id recem-inserido');
    expect(row.id).toBe(id);
    expect(row.cnpj).toBe('12345678000199');
    expect(row.segmento).toBe('Serviço');
    // Defaults canonicos da §4.2:
    expect(row.status).toBe('inativa');
    expect(row.thresholdDesempenhoBaixo).toBe(60);
    expect(row.thresholdDesempenhoMedio).toBe(85);
    expect(row.thresholdPlenitudeBaixo).toBe(50);
    expect(row.thresholdPlenitudeMedio).toBe(75);
    expect(row.modoAnoFiscal).toBe('padrao');
    expect(row.mesInicioAnoFiscal).toBe(1);
    expect(row.timezone).toBe('America/Sao_Paulo');
  });

  it('getCompanyByCnpj retorna a linha pelo cnpj', async () => {
    const id = await createCompany(client.db, buildValidCompany({ cnpj: '98765432000155' }));
    const row = await getCompanyByCnpj(client.db, '98765432000155');
    if (!row) throw new Error('getCompanyByCnpj retornou undefined');
    expect(row.id).toBe(id);
  });

  it('getCompanyByCnpj retorna undefined para cnpj inexistente', async () => {
    const row = await getCompanyByCnpj(client.db, '00000000000000');
    expect(row).toBeUndefined();
  });

  it('updateCompanyStatus altera status de inativa para ativa', async () => {
    const id = await createCompany(client.db, buildValidCompany());
    const affected = await updateCompanyStatus(client.db, id, 'ativa');
    expect(affected).toBe(1);
    const row = await getCompanyById(client.db, id);
    if (!row) throw new Error('getCompanyById retornou undefined apos updateCompanyStatus');
    expect(row.status).toBe('ativa');
  });

  it('deleteCompanyById remove a linha e getCompanyById passa a retornar undefined', async () => {
    const id = await createCompany(client.db, buildValidCompany());
    const affected = await deleteCompanyById(client.db, id);
    expect(affected).toBe(1);
    const row = await getCompanyById(client.db, id);
    expect(row).toBeUndefined();
  });

  it('cnpj UNIQUE (§4.2) rejeita duplicidade', async () => {
    await createCompany(client.db, buildValidCompany({ cnpj: '11111111000100' }));
    await expect(
      createCompany(client.db, buildValidCompany({ cnpj: '11111111000100' })),
    ).rejects.toThrow();
  });
});
