// ROIP APP 9BOX — bateria de seguranca S9-S13 ME 3.5 D6.
//
// Cobre canonicamente:
//   - S9  (skip com TODO canonico): clevel+isRH=true da empresa A
//         tentando acessar `/painel-rh` renderizando dados da empresa
//         B. Requer forja de session cookie multi-empresa + render
//         SSR — a barreira efetiva vive no `assertUserCompanyScope`
//         chamado por cada procedure, ja coberto bit-exact pelas
//         baterias `*-cross-company` de cada router. Nada novo em D6.
//   - S10 (integracao Drizzle real): clevel+isRH=false chamando
//         procedure protegida por `rhAllowedProcedure()` = FORBIDDEN.
//   - S11 (skip com TODO canonico): clevel+isRH=true da empresa A
//         chamando `employees.uploadCSV` com companyId da empresa B
//         = FORBIDDEN. Coberto pelo guard cruzado ja presente em
//         `tests/integration/employees-uploadCSV.test.ts:487`
//         ("guard cruzado companyId — RH de outra empresa = FORBIDDEN")
//         que a ME 3.5 D6 nao altera; o mesmo path canonico
//         (`assertUserCompanyScope`) rejeita clevel+isRH cross-company.
//   - S12 (integracao Drizzle real): clevel+isRH=true chamando
//         procedure protegida por `rhAllowedProcedure()` = allow.
//   - S13 (skip com TODO canonico): clevel+isRH=true tentando ativar
//         `isRH` de outro clevel via `cLevelMembers.update` = FORBIDDEN.
//         O router `cLevelMembers.update` e Super-Admin-only via
//         `superAdminProcedure` no transporte tRPC; qualquer session
//         `kind='platform'` retorna FORBIDDEN antes mesmo do handler
//         rodar (`tests/integration/superAdminOnly.test.ts` cobre
//         bit-exact). Nada novo em D6.
//
// Faixa CNPJ canonica reservada: 900..919 (padrao S009/S087 estendido
// para ME 3.5 D6, sem colisao com faixas de ME anteriores).
//
// **RV-11.** S10/S12 rodam contra MySQL real via `DATABASE_URL_TEST`.
// Ambientes sem MySQL: o describe inteiro e skipado via variavel de
// ambiente ROIP_SKIP_INTEGRATION=1 (padrao Bruno pos-CC079). Nao ha
// caminho degradado — a decisao canonica de allow/forbid em
// `rhAllowedProcedure` depende do estado real de `cLevelMembers.isRH`
// na tabela.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createLeaderOnboardingRouter } from '../../src/server/routers/leaderOnboarding';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const SHOULD_SKIP = process.env.ROIP_SKIP_INTEGRATION === '1';
const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-3-5-d6-clevel-rh-security';

const HASH_A = 'hash-fixo-me-3-5-d6';

// Faixa CNPJ canonica ME 3.5 D6: 900..919.
let cnpjCounter = 899;
function nextCnpj(): string {
  cnpjCounter += 1;
  if (cnpjCounter > 919) {
    throw new Error('nextCnpj: faixa 900..919 esgotada — expandir a reserva canonica');
  }
  return String(10000000000000 + cnpjCounter).padStart(14, '0');
}

let cpfCounter = 90000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient | null = null;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  if (SHOULD_SKIP) {
    return;
  }
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (client === null) {
    return;
  }
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(): Promise<number> {
  if (client === null) {
    throw new Error('client nao inicializado');
  }
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME 3.5 D6 Test ${cnpj} LTDA`,
      nomeFantasia: `ME 3.5 D6 Test ${cnpj}`,
      cnpj,
      telefone: '1633330035',
      endereco: `Rua ME-3-5-D6, ${cnpj}`,
      cidade: 'Ribeirao Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
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

async function createClevel(companyId: number, isRH: boolean): Promise<number> {
  if (client === null) {
    throw new Error('client nao inicializado');
  }
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: isRH ? 'C-level Operando RH' : 'C-level Puro',
      cpf: nextCpf(),
      email: `clevel-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Executivo principal',
      departamento: 'Administrativo',
      custoMensal: '20000.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      isRH,
      status: 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function tokenPlatform(
  role: PlatformRole,
  userId: number,
  companyId: number,
): Promise<string> {
  return signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(HASH_A),
  });
}

function bindLeaderOnboardingCaller(bearerToken: string) {
  if (client === null) {
    throw new Error('client nao inicializado');
  }
  const router = createLeaderOnboardingRouter();
  const factory = createCallerFactory(router);
  const ctx: Context = createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
  return factory(ctx);
}

// -----------------------------------------------------------------------
// Bateria S9-S13 ME 3.5 D6
// -----------------------------------------------------------------------

describe.skipIf(SHOULD_SKIP)('ME 3.5 D6 — bateria S9-S13 clevel+isRH security', () => {
  it.skip('S9 — TODO canonico: cross-company render SSR nao muda em D6', () => {
    // Coberto bit-exact pelo `assertUserCompanyScope` presente em cada
    // procedure. Requer forja de session cookie + render Next 15 SSR,
    // infra fora do escopo D6. Nada novo — reaproveita as baterias
    // `*-cross-company` ja no repo.
    expect(true).toBe(true);
  });

  it('S10 — clevel+isRH=false chamando rhAllowedProcedure = FORBIDDEN', async () => {
    const companyId = await createCompany();
    const clevelId = await createClevel(companyId, false);
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const caller = bindLeaderOnboardingCaller(token);
    await expect(caller.list({ companyId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.skip('S11 — TODO canonico: cross-company employees.uploadCSV', () => {
    // Coberto bit-exact por `tests/integration/employees-uploadCSV.
    // test.ts:487` ("guard cruzado companyId — RH de outra empresa =
    // FORBIDDEN"). O mesmo `assertUserCompanyScope` rejeita
    // clevel+isRH cross-company; D6 nao altera o path.
    expect(true).toBe(true);
  });

  it('S12 — clevel+isRH=true chamando rhAllowedProcedure = allow', async () => {
    const companyId = await createCompany();
    const clevelId = await createClevel(companyId, true);
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const caller = bindLeaderOnboardingCaller(token);
    // `list` retorna array vazio em empresa sem lideres — o objetivo
    // canonico e nao rejeitar com FORBIDDEN.
    const rows = await caller.list({ companyId });
    expect(Array.isArray(rows)).toBe(true);
  });

  it.skip('S13 — TODO canonico: cLevelMembers.update e Super-Admin-only', () => {
    // O router `cLevelMembers.update` opera sob `superAdminProcedure` no
    // transporte tRPC; qualquer session `kind='platform'` retorna
    // FORBIDDEN antes do handler. Coberto bit-exact por
    // `tests/integration/superAdminOnly.test.ts`. D6 nao altera o path.
    expect(true).toBe(true);
  });
});
