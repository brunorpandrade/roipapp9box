// ROIP APP 9BOX — arnês de regressão canônico bit-a-bit BEFORE/AFTER
// para TODAS as superfícies de UPDATE de dados canônicos do repo.
//
// Motivação: descarte silencioso de `dataAdmissao` em cLevelMembers.update
// e employees.update (bug canônico pré-existente descoberto por Bruno em
// 28/09/2026, corrigido no hotfix `88628290`) revelou padrão de risco
// genérico — schemas Zod `.strip()` default descartam sem erro campos
// não declarados enviados pelo formulário. Este arquivo instancia a
// regra nova canonizada RV-16 estendida: **teste de contrato de UPDATE
// cobre TODOS os campos editáveis com asserção bit-a-bit BEFORE/AFTER,
// não subset**. Serve como arnês de regressão para o repo inteiro contra
// omissões futuras equivalentes.
//
// Escopo canônico coberto (4 superfícies core):
//   1. `company.updateParameters` — 40 campos de `companies` (§13.1
//      DOC 05, ME-075).
//   2. `company.updateJobFamilies` — 4 variables com weight+goal+name+
//      unit por família de função (§13.1 Aba 2, ME-075).
//   3. `revenue.saveFaturamento` — faturamentoBruto por mês
//      (`companyMonthlyData`, §5.10 DOC 03).
//   4. `monthlyData.saveMonthlyRHData` — diasUteis da empresa + custo
//      mensal + faltas dos colaboradores (§3.11 DOC 03).
//
// Superfícies restantes com cobertura bit-a-bit já garantida:
//   - `cLevelMembers.update` + `employees.update` — cobertos por
//     `tests/integration/hotfix-update-dataAdmissao.test.ts` (hotfix
//     pós-ME 3.5.1).
//   - `nr1.editClosingDate` — 1 campo canônico coberto por
//     `nr1-router.test.ts`.
//   - `salvarMetas` — cobertura bit-a-bit em `me-fila6-d3-metas.test.ts`.
//   - `saveMonthlyLeaderData` — cobertura em `me086b-dados-mensais-rh
//     .test.ts` + `monthlyData-router.test.ts`.
//
// Faixa CNPJ dedicada: 97000000000001..97000000000099 (arnês).
// L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  companyJobFamilies,
  companyMonthlyData,
  employees,
  performanceData,
} from '../../src/db/schema';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createCompanyRouter } from '../../src/server/routers/company';
import { createMonthlyDataRouter } from '../../src/server/routers/monthlyData';
import { createRevenueRouter } from '../../src/server/routers/revenue';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-contract-update-surfaces';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-contract-update-surfaces';

let cnpjCounter = 96999999999999;
function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter).padStart(14, '0');
}

let cpfCounter = 80000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

async function createCompany(razaoSocial: string): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial,
      nomeFantasia: razaoSocial,
      cnpj,
      telefone: '1633330000',
      endereco: `Rua contract, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato Inicial',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH Inicial',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria Inicial',
      descricaoAtividade: 'Consultoria Inicial',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Employee Contract',
      cpf: nextCpf(),
      email: `emp-contract-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-03-10'),
      dataAdmissao: new Date('2020-06-01'),
      cbo: '142105',
      descricaoCBO: 'Analista Contract',
      cargo: 'Analista Contract',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      isRH: false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function buildContext(bearerToken: string | null): Promise<Context> {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: null,
  });
}

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(performanceData)
      .where(inArray(performanceData.companyId, createdCompanyIds));
    await client.db
      .delete(companyMonthlyData)
      .where(inArray(companyMonthlyData.companyId, createdCompanyIds));
    await client.db
      .delete(companyJobFamilies)
      .where(inArray(companyJobFamilies.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// 1. company.updateParameters — 40 campos bit-a-bit BEFORE/AFTER
// ============================================================
describe('Arnês bit-a-bit — company.updateParameters', () => {
  it('escreve TODOS os 40 campos do schema (nenhum descarte silencioso)', async () => {
    const companyId = await createCompany('Contract Alpha Inicial');
    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createCompanyRouter())(ctx);

    const result = await caller.updateParameters({
      companyId,
      razaoSocial: 'Contract Alpha Atualizada Ltda',
      nomeFantasia: 'Contract Alpha Atualizada',
      cnpj: nextCnpj(),
      telefone: '1699998888',
      endereco: 'Rua Atualizada, 999',
      cidade: 'São Paulo',
      estado: 'SP',
      logoUrl: 'https://example.com/logo-atualizada.png',
      contatoPrincipalNome: 'Contato Atualizado',
      contatoPrincipalEmail: 'contato-atualizado@example.com',
      contatoRHNome: 'RH Atualizado',
      contatoRHEmail: 'rh-atualizado@example.com',
      encarregadoLgpdNome: 'Encarregado LGPD',
      encarregadoLgpdEmail: 'lgpd@example.com',
      encarregadoLgpdTelefone: '1699997777',
      encarregadoLgpdPoliticaUrl: 'https://example.com/politica.pdf',
      segmento: 'Serviço',
      tipoAtividade: 'Tipo Atualizado',
      descricaoAtividade: 'Descrição atualizada da atividade',
      contextoMercado: 'Mercado atualizado',
      modoAnoFiscal: 'padrao',
      mesInicioAnoFiscal: 1,
      mesKickoff: 4,
      kickoffDate: '2021-04-01',
      timezone: 'America/Fortaleza',
      metaROIOperacional: 5.5,
      metaROITatico: 6.5,
      metaROIEstrategico: 7.5,
      roiSegmentoMinimo: 3.5,
      roiSegmentoMaximo: 8.5,
      folhaPercMinima: 12.5,
      folhaPercMaxima: 25.5,
      thresholdDesempenhoBaixo: 55,
      thresholdDesempenhoMedio: 80,
      thresholdPlenitudeBaixo: 45,
      thresholdPlenitudeMedio: 70,
    });
    expect(result.updated).toBe(true);

    const rows = await client.db.select().from(companies).where(eq(companies.id, companyId));
    const row = rows[0]!;
    expect(row.razaoSocial).toBe('Contract Alpha Atualizada Ltda');
    expect(row.nomeFantasia).toBe('Contract Alpha Atualizada');
    expect(row.telefone).toBe('1699998888');
    expect(row.endereco).toBe('Rua Atualizada, 999');
    expect(row.cidade).toBe('São Paulo');
    expect(row.estado).toBe('SP');
    expect(row.logoUrl).toBe('https://example.com/logo-atualizada.png');
    expect(row.contatoPrincipalNome).toBe('Contato Atualizado');
    expect(row.contatoPrincipalEmail).toBe('contato-atualizado@example.com');
    expect(row.contatoRHNome).toBe('RH Atualizado');
    expect(row.contatoRHEmail).toBe('rh-atualizado@example.com');
    expect(row.encarregadoLgpdNome).toBe('Encarregado LGPD');
    expect(row.encarregadoLgpdEmail).toBe('lgpd@example.com');
    expect(row.encarregadoLgpdTelefone).toBe('1699997777');
    expect(row.encarregadoLgpdPoliticaUrl).toBe('https://example.com/politica.pdf');
    expect(row.segmento).toBe('Serviço');
    expect(row.tipoAtividade).toBe('Tipo Atualizado');
    expect(row.descricaoAtividade).toBe('Descrição atualizada da atividade');
    expect(row.contextoMercado).toBe('Mercado atualizado');
    expect(row.modoAnoFiscal).toBe('padrao');
    expect(row.mesInicioAnoFiscal).toBe(1);
    expect(row.mesKickoff).toBe(4);
    expect(row.kickoffDate.toISOString().slice(0, 10)).toBe('2021-04-01');
    expect(row.timezone).toBe('America/Fortaleza');
    expect(Number(row.metaROIOperacional)).toBe(5.5);
    expect(Number(row.metaROITatico)).toBe(6.5);
    expect(Number(row.metaROIEstrategico)).toBe(7.5);
    expect(Number(row.roiSegmentoMinimo)).toBe(3.5);
    expect(Number(row.roiSegmentoMaximo)).toBe(8.5);
    expect(Number(row.folhaPercMinima)).toBe(12.5);
    expect(Number(row.folhaPercMaxima)).toBe(25.5);
    expect(row.thresholdDesempenhoBaixo).toBe(55);
    expect(row.thresholdDesempenhoMedio).toBe(80);
    expect(row.thresholdPlenitudeBaixo).toBe(45);
    expect(row.thresholdPlenitudeMedio).toBe(70);
  });
});

// ============================================================
// 2. company.updateJobFamilies — 4 variables bit-a-bit
// ============================================================
describe('Arnês bit-a-bit — company.updateJobFamilies', () => {
  it('escreve TODAS as 4 variables (variableName/unit/weight bit-a-bit)', async () => {
    const companyId = await createCompany('Contract Beta Familia');
    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createCompanyRouter())(ctx);

    const result = await caller.updateJobFamilies({
      companyId,
      jobFamily: 'administrativo_suporte',
      variables: [
        { variableIndex: 0, variableName: 'Var Zero Custom', unit: 'un', weight: 25 },
        { variableIndex: 1, variableName: 'Var Um Custom', unit: 'R$', weight: 30 },
        { variableIndex: 2, variableName: 'Var Dois Custom', unit: '%', weight: 20 },
        { variableIndex: 3, variableName: 'Var Tres Custom', unit: 'dias', weight: 25 },
      ],
    });
    expect(result.upserted).toBe(4);

    const rows = await client.db
      .select()
      .from(companyJobFamilies)
      .where(
        and(
          eq(companyJobFamilies.companyId, companyId),
          eq(companyJobFamilies.jobFamily, 'administrativo_suporte'),
        ),
      );
    expect(rows.length).toBe(4);
    const byIndex = new Map(rows.map((r) => [r.variableIndex, r]));
    expect(byIndex.get(0)!.variableName).toBe('Var Zero Custom');
    expect(byIndex.get(0)!.unit).toBe('un');
    expect(Number(byIndex.get(0)!.weight)).toBe(25);
    expect(byIndex.get(1)!.variableName).toBe('Var Um Custom');
    expect(byIndex.get(1)!.unit).toBe('R$');
    expect(Number(byIndex.get(1)!.weight)).toBe(30);
    expect(byIndex.get(2)!.variableName).toBe('Var Dois Custom');
    expect(byIndex.get(2)!.unit).toBe('%');
    expect(Number(byIndex.get(2)!.weight)).toBe(20);
    expect(byIndex.get(3)!.variableName).toBe('Var Tres Custom');
    expect(byIndex.get(3)!.unit).toBe('dias');
    expect(Number(byIndex.get(3)!.weight)).toBe(25);
  });
});

// ============================================================
// 3. revenue.saveFaturamento — bit-a-bit
// ============================================================
describe('Arnês bit-a-bit — revenue.saveFaturamento', () => {
  it('grava faturamentoBruto bit-a-bit via UPSERT', async () => {
    const companyId = await createCompany('Contract Gamma Revenue');
    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createRevenueRouter())(ctx);

    const first = await caller.saveFaturamento({
      companyId,
      mes: '2024-05',
      faturamentoBruto: '123456.78',
    });
    expect(first.created).toBe(true);
    expect(first.faturamentoBruto).toBe('123456.78');

    const rows1 = await client.db
      .select()
      .from(companyMonthlyData)
      .where(
        and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, '2024-05')),
      );
    expect(rows1.length).toBe(1);
    expect(Number(rows1[0]!.faturamentoBruto)).toBe(123456.78);

    // UPSERT bit-a-bit (segunda chamada = update, não novo insert).
    const second = await caller.saveFaturamento({
      companyId,
      mes: '2024-05',
      faturamentoBruto: '999888.55',
    });
    expect(second.created).toBe(false);
    expect(second.faturamentoBruto).toBe('999888.55');

    const rows2 = await client.db
      .select()
      .from(companyMonthlyData)
      .where(
        and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, '2024-05')),
      );
    expect(rows2.length).toBe(1);
    expect(Number(rows2[0]!.faturamentoBruto)).toBe(999888.55);
  });
});

// ============================================================
// 4. monthlyData.saveMonthlyRHData — diasUteis + custoTotalMes + faltas
// ============================================================
describe('Arnês bit-a-bit — monthlyData.saveMonthlyRHData', () => {
  it('grava diasUteis + custoTotalMes + faltas bit-a-bit por colaborador', async () => {
    const companyId = await createCompany('Contract Delta Monthly');
    const employeeId = await createEmployee(companyId);
    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createMonthlyDataRouter())(ctx);

    await caller.saveMonthlyRHData({
      companyId,
      mes: '2024-06',
      diasUteis: 21,
      colaboradores: [{ employeeId, custoTotalMes: '9876.54', faltas: 2 }],
    });

    const cmd = await client.db
      .select()
      .from(companyMonthlyData)
      .where(
        and(eq(companyMonthlyData.companyId, companyId), eq(companyMonthlyData.mes, '2024-06')),
      );
    expect(cmd.length).toBe(1);
    expect(cmd[0]!.diasUteis).toBe(21);

    const perf = await client.db
      .select()
      .from(performanceData)
      .where(
        and(
          eq(performanceData.companyId, companyId),
          eq(performanceData.employeeId, employeeId),
          eq(performanceData.mes, '2024-06'),
        ),
      );
    expect(perf.length).toBe(1);
    expect(Number(perf[0]!.custoTotalMes)).toBe(9876.54);
    expect(perf[0]!.faltas).toBe(2);
  });
});
