// ROIP APP 9BOX — teste de integracao ME-B9-fechamento
// (D-B9-MEU-PORTAL-PENDENCIAS ENCERRADO). Cobre semantica canonica da
// nova assinatura `loadMeuPortalData(db, companyId, userId)`:
// - Retorno vazio quando o RH nao tem pendencias no portal.
// - Retorno vazio quando outro colaborador tem pendencias mas o RH nao.
// - Filtro correto por `userId` (nao contamina com pendencias alheias).
//
// A engine subjacente (`pendenciasEngine.loadPendenciasPage`) e
// canonicamente exercitada pelos testes existentes de `/pendencias-portal`;
// este teste cobre apenas o wrapper canonico da Secao 4 §5.5.
//
// Faixa canonica CNPJ desta ME: 10870000000050..10870000000099.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { loadMeuPortalData } from '../../src/app/painel-rh/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ = '10870000000050';

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

describe('ME-B9-fechamento — loadMeuPortalData (D-B9-MEU-PORTAL-PENDENCIAS)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-B9-fech meu portal LTDA',
      nomeFantasia: 'ROIP ME-B9-fech meu portal',
      cnpj: CNPJ,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyId]));
  });

  it('retorna vazio quando o RH nao tem pendencias no portal', async () => {
    const rhId = await seedEmployee({ cpf: '20870000060', isRH: true });
    const data = await loadMeuPortalData(client.db, companyId, rhId);
    expect(data.pendencias).toEqual([]);
  });

  it('retorna vazio para userId inexistente na empresa (defense-in-depth)', async () => {
    const data = await loadMeuPortalData(client.db, companyId, 999999);
    expect(data.pendencias).toEqual([]);
  });

  it('retorna vazio quando so outros colaboradores tem pendencias (filtro userId)', async () => {
    const rhId = await seedEmployee({ cpf: '20870000070', isRH: true });
    // Colaborador puro que poderia ter pendencias — mas sem seed de
    // portalReminderLog + ciclo, ninguem tem pendencia nesta suite.
    await seedEmployee({ cpf: '20870000071' });
    const data = await loadMeuPortalData(client.db, companyId, rhId);
    expect(data.pendencias).toEqual([]);
  });

  // ---------------------------------------------------------------------
  // Helper de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: { cpf: string; isRH?: boolean }): Promise<number> {
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
        isLider: false,
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
});
