// ROIP APP 9BOX — teste de integracao ME-075 proc `company.updateJobFamilies`.
//
// Cobre canonicamente bit-exact:
//   1. UPSERT de familia nao-estrutural — nome/unidade customizaveis
//      persistem bit-exact.
//   2. Familia 6 `lideranca_gestao` (estrutural) — nome/unidade
//      sobrescritos server-side pelos hard-coded.
//   3. Rejeicao: soma pesos != 100 (tolerancia 0.01) → mensagem canonica.
//   4. Rejeicao: variaveis com indices != {0,1,2,3} → mensagem canonica.
//   5. Idempotencia UPSERT — chamada duplicada nao falha.
//   6. Update de valores existentes preserva demais familias.
//   7. NOT_FOUND para empresa inexistente.
//
// Faixa CNPJ canonica ME-075 familias: 75200000000000..75299999999999.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, companyJobFamilies } from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  createCompanyRouter,
  LIDERANCA_GESTAO_VAR_NAMES,
  LIDERANCA_GESTAO_VAR_UNITS,
  MSG_JOB_FAMILY_INDICES_INVALIDOS,
  MSG_JOB_FAMILY_SOMA_PESOS_INVALIDA,
} from '../../src/server/routers/company';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me075-families';

const FIXTURE_SUPER_ADMIN_ID = 1;

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cnpjCounter = 75200000000000;

function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter);
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(companyJobFamilies)
      .where(inArray(companyJobFamilies.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createTestCompany(): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME075 Fam ${cnpj} LTDA`,
      nomeFantasia: `ME075 Fam ${cnpj}`,
      cnpj,
      telefone: '1633330075',
      endereco: `Rua ${cnpj}`,
      cidade: 'RP',
      estado: 'SP',
      contatoPrincipalNome: 'C',
      contatoPrincipalEmail: `p-${cnpj}@x.com`,
      contatoRHNome: 'R',
      contatoRHEmail: `rh-${cnpj}@x.com`,
      segmento: 'Serviço',
      tipoAtividade: 'X',
      descricaoAtividade: 'Y',
      contextoMercado: 'Z',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'inativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createCompanyRouter({});
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

const VARIAVEIS_OK = [
  { variableIndex: 0, variableName: 'Receita gerada', unit: 'R$', weight: 25 },
  { variableIndex: 1, variableName: 'Negocios fechados', unit: 'un', weight: 25 },
  { variableIndex: 2, variableName: 'Leads convertidos', unit: 'un', weight: 25 },
  { variableIndex: 3, variableName: 'Ticket medio', unit: 'R$', weight: 25 },
];

describe('company.updateJobFamilies (D086)', () => {
  it('UPSERT de familia nao-estrutural persiste nomes/unidades customizaveis', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.updateJobFamilies({
      companyId,
      jobFamily: 'vendas_comercial',
      variables: VARIAVEIS_OK,
    });
    expect(result.upserted).toBe(4);

    const rows = await client.db
      .select()
      .from(companyJobFamilies)
      .where(
        and(
          eq(companyJobFamilies.companyId, companyId),
          eq(companyJobFamilies.jobFamily, 'vendas_comercial'),
        ),
      );
    expect(rows).toHaveLength(4);
    const v0 = rows.find((r) => r.variableIndex === 0);
    expect(v0?.variableName).toBe('Receita gerada');
    expect(v0?.unit).toBe('R$');
    expect(Number(v0?.weight)).toBe(25);
  });

  it('familia 6 lideranca_gestao SOBRESCREVE nome/unidade customizados', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await caller.updateJobFamilies({
      companyId,
      jobFamily: 'lideranca_gestao',
      variables: [
        { variableIndex: 0, variableName: 'MALICIOSO A', unit: 'MALIC', weight: 25 },
        { variableIndex: 1, variableName: 'MALICIOSO B', unit: 'MALIC', weight: 25 },
        { variableIndex: 2, variableName: 'MALICIOSO C', unit: 'MALIC', weight: 25 },
        { variableIndex: 3, variableName: 'MALICIOSO D', unit: 'MALIC', weight: 25 },
      ],
    });

    const rows = await client.db
      .select()
      .from(companyJobFamilies)
      .where(
        and(
          eq(companyJobFamilies.companyId, companyId),
          eq(companyJobFamilies.jobFamily, 'lideranca_gestao'),
        ),
      );
    // Ordena por variableIndex.
    rows.sort((a, b) => a.variableIndex - b.variableIndex);
    for (let i = 0; i < 4; i += 1) {
      expect(rows[i]?.variableName).toBe(LIDERANCA_GESTAO_VAR_NAMES[i]);
      expect(rows[i]?.unit).toBe(LIDERANCA_GESTAO_VAR_UNITS[i]);
    }
  });

  it('rejeita soma pesos != 100 com mensagem canonica bit-exact', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.updateJobFamilies({
        companyId,
        jobFamily: 'vendas_comercial',
        variables: [
          { variableIndex: 0, variableName: 'A', unit: 'u', weight: 20 },
          { variableIndex: 1, variableName: 'B', unit: 'u', weight: 20 },
          { variableIndex: 2, variableName: 'C', unit: 'u', weight: 20 },
          { variableIndex: 3, variableName: 'D', unit: 'u', weight: 20 },
        ],
      }),
    ).rejects.toThrow(MSG_JOB_FAMILY_SOMA_PESOS_INVALIDA);
  });

  it('rejeita variableIndex fora de {0,1,2,3}', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.updateJobFamilies({
        companyId,
        jobFamily: 'vendas_comercial',
        variables: [
          { variableIndex: 0, variableName: 'A', unit: 'u', weight: 25 },
          { variableIndex: 1, variableName: 'B', unit: 'u', weight: 25 },
          { variableIndex: 2, variableName: 'C', unit: 'u', weight: 25 },
          { variableIndex: 2, variableName: 'D', unit: 'u', weight: 25 }, // duplicado
        ],
      }),
    ).rejects.toThrow(MSG_JOB_FAMILY_INDICES_INVALIDOS);
  });

  it('idempotencia UPSERT: chamada duplicada nao falha', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await caller.updateJobFamilies({
      companyId,
      jobFamily: 'vendas_comercial',
      variables: VARIAVEIS_OK,
    });
    // Segunda chamada — mesmos valores.
    await caller.updateJobFamilies({
      companyId,
      jobFamily: 'vendas_comercial',
      variables: VARIAVEIS_OK,
    });
    const rows = await client.db
      .select()
      .from(companyJobFamilies)
      .where(
        and(
          eq(companyJobFamilies.companyId, companyId),
          eq(companyJobFamilies.jobFamily, 'vendas_comercial'),
        ),
      );
    // UPSERT idempotente — continua 4 linhas, nao duplica.
    expect(rows).toHaveLength(4);
  });

  it('update de UMA familia preserva as demais familias', async () => {
    const companyId = await createTestCompany();
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await caller.updateJobFamilies({
      companyId,
      jobFamily: 'vendas_comercial',
      variables: VARIAVEIS_OK,
    });
    await caller.updateJobFamilies({
      companyId,
      jobFamily: 'producao_operacoes',
      variables: [
        { variableIndex: 0, variableName: 'Volume', unit: 'un', weight: 30 },
        { variableIndex: 1, variableName: 'Prazo', unit: 'un', weight: 30 },
        { variableIndex: 2, variableName: 'Qualidade', unit: 'un', weight: 20 },
        { variableIndex: 3, variableName: 'Produtividade', unit: 'un/h', weight: 20 },
      ],
    });
    const allRows = await client.db
      .select()
      .from(companyJobFamilies)
      .where(eq(companyJobFamilies.companyId, companyId));
    expect(allRows).toHaveLength(8);
    const vc = allRows.filter((r) => r.jobFamily === 'vendas_comercial');
    const po = allRows.filter((r) => r.jobFamily === 'producao_operacoes');
    expect(vc).toHaveLength(4);
    expect(po).toHaveLength(4);
  });

  it('NOT_FOUND para empresa inexistente', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.updateJobFamilies({
        companyId: 999999,
        jobFamily: 'vendas_comercial',
        variables: VARIAVEIS_OK,
      }),
    ).rejects.toThrow(TRPCError);
  });
});
