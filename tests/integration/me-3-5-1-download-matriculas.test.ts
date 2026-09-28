// ROIP APP 9BOX — teste de integracao ME 3.5.1 Debito A.
//
// Cobre canonicamente a proc `employees.downloadMatriculas`:
//   - Matriz de autorizacao (rhAllowedProcedure ME 3.5 D2):
//     super_admin / rh / clevel+isRH admitidos;
//     lider / clevel sem isRH FORBIDDEN.
//   - Excecao canonica a PC1a: XLSX inclui employees + cLevelMembers
//     ativos (documentado no service).
//   - Round-trip: XLSX baixado tem aba `Matriculas`, header canonico
//     `Nome | CPF | Matricula`, ordenacao alfabetica bit-exact, matricula
//     NULL renderiza como string vazia.
//   - Filename canonico: `matriculas_<razaoSanitizada>_<YYYY-MM-DD>.xlsx`.
//   - Registros INATIVOS ficam de fora.
//
// Faixa CNPJ dedicada: 95000000000001..95000000000099 (D-EMPRESA-3-5-1).
// L32 cleanup em afterAll. JWT_SECRET fixo. Assinatura de fixtures
// bit-exact ao padrao `me-fila5-employees-export-spreadsheet.test.ts`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import ExcelJS from 'exceljs';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createEmployeesRouter } from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import {
  MATRICULAS_COLUMNS_CANONICAS,
  NOME_ABA_MATRICULAS,
} from '../../src/lib/shared/matriculasExport';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-3-5-1-download-matriculas';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me-3-5-1-download-matriculas';

let cnpjCounter = 94999999999999;
function nextCnpj(): string {
  cnpjCounter += 1;
  if (cnpjCounter > 95000000000099) {
    throw new Error('nextCnpj: faixa 95000000000001..95000000000099 esgotada');
  }
  return String(cnpjCounter).padStart(14, '0');
}

let cpfCounter = 78000000000;
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
      endereco: `Rua ME-3-5-1, ${cnpj}`,
      cidade: 'Ribeirão Preto',
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

async function createEmployee(
  companyId: number,
  name: string,
  matricula: string | null,
  isRH: boolean,
  status: 'ativo' | 'inativo' = 'ativo',
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `emp-${name.replace(/\s+/g, '')}-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '142105',
      descricaoCBO: 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status,
      isLider: false,
      isRH,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
      matricula,
    })
    .$returningId();
  return row!.id;
}

async function createCLevel(
  companyId: number,
  name: string,
  matricula: string | null,
  isRH: boolean,
  status: 'ativo' | 'inativo' = 'ativo',
): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `${name.replace(/\s+/g, '').toLowerCase()}-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1975-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'Chief Executive Officer',
      departamento: 'Diretoria',
      custoMensal: '0.00',
      acessoTotal: true,
      isResponsavelFinanceiro: false,
      isRH,
      status,
      passwordHash: HASH_A,
      passwordSet: true,
      matricula,
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

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

describe('ME 3.5.1 Debito A — employees.downloadMatriculas', () => {
  it('super_admin baixa XLSX com employees + cLevelMembers ativos (excecao PC1a)', async () => {
    const companyId = await createCompany('Empresa Alpha Ltda');
    await createEmployee(companyId, 'Bruno Employee', 'BR01', false);
    await createEmployee(companyId, 'Ana Employee', 'AN02', false);
    await createEmployee(companyId, 'Carlos Inativo', 'CA99', false, 'inativo');
    await createCLevel(companyId, 'Diana CEO', 'DI03', false);
    await createCLevel(companyId, 'Elena COO', 'EL04', true);

    const token = await tokenSuperAdmin();
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createEmployeesRouter())(ctx);
    const res = await caller.downloadMatriculas({ companyId });

    // `sanitizeRazaoSocialEmp` (employees.ts) uppercase canonico bit-a-bit.
    expect(res.filename).toMatch(/^matriculas_EMPRESA_ALPHA_LTDA_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(res.bytes).toBeGreaterThan(0);
    expect(res.xlsxBase64.length).toBeGreaterThan(0);

    const buf = Buffer.from(res.xlsxBase64, 'base64');
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_MATRICULAS);
    expect(ws).toBeDefined();

    // Header canonico
    expect(ws!.getRow(1).getCell(1).value).toBe(MATRICULAS_COLUMNS_CANONICAS[0]);
    expect(ws!.getRow(1).getCell(2).value).toBe(MATRICULAS_COLUMNS_CANONICAS[1]);
    expect(ws!.getRow(1).getCell(3).value).toBe(MATRICULAS_COLUMNS_CANONICAS[2]);

    // Ordem canonica alfabetica: Ana, Bruno, Diana, Elena (Carlos inativo fica fora)
    const nomes: string[] = [];
    for (let r = 2; r <= ws!.rowCount; r += 1) {
      const v = ws!.getRow(r).getCell(1).value;
      if (v) nomes.push(String(v));
    }
    expect(nomes).toEqual(['Ana Employee', 'Bruno Employee', 'Diana CEO', 'Elena COO']);
  });

  it('rh (platform role) tem acesso canonico', async () => {
    const companyId = await createCompany('Empresa Beta Ltda');
    const rhId = await createEmployee(companyId, 'Rh User', 'RH01', true);
    const token = await tokenPlatform('rh', rhId, companyId);
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createEmployeesRouter())(ctx);
    const res = await caller.downloadMatriculas({ companyId });
    expect(res.bytes).toBeGreaterThan(0);
  });

  it('clevel+isRH=true tem acesso canonico (ME 3.5 D2)', async () => {
    const companyId = await createCompany('Empresa Gamma Ltda');
    const clevelId = await createCLevel(companyId, 'Michelle COO', 'MI01', true);
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createEmployeesRouter())(ctx);
    const res = await caller.downloadMatriculas({ companyId });
    expect(res.bytes).toBeGreaterThan(0);
  });

  it('clevel sem isRH e FORBIDDEN canonico', async () => {
    const companyId = await createCompany('Empresa Delta Ltda');
    const clevelId = await createCLevel(companyId, 'Fabio CEO', 'FA01', false);
    const token = await tokenPlatform('clevel', clevelId, companyId);
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createEmployeesRouter())(ctx);
    await expect(caller.downloadMatriculas({ companyId })).rejects.toThrow(TRPCError);
  });

  it('lider puro e FORBIDDEN canonico', async () => {
    const companyId = await createCompany('Empresa Epsilon Ltda');
    const liderId = await createEmployee(companyId, 'Lider Puro', 'LI01', false);
    const token = await tokenPlatform('lider', liderId, companyId);
    const ctx = await buildContext(token);
    const caller = createCallerFactory(createEmployeesRouter())(ctx);
    await expect(caller.downloadMatriculas({ companyId })).rejects.toThrow(TRPCError);
  });
});
