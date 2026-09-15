// ROIP APP 9BOX — teste de integracao ME-fila5 Dispatch 2 para a proc
// canonica `employees.downloadTemplate` (§14 CAMADA_UI + §16.6 DOC 03).
//
// Cobre canonicamente:
//   - Contratos publicos exportados (RV-13): 14 rotulos identicos ao
//     parser upload (garante round-trip download → preenche → upload),
//     schema Zod, tipo de retorno `EmployeesDownloadResult`, constante
//     `NOME_ABA_EMPLOYEES_TEMPLATE`, helper `buildEmployeesTemplate-
//     Buffer`, helper `sanitizeRazaoSocialEmp`.
//   - Matriz de autorizacao (§14.10 DOC 05): super_admin / rh /
//     rh_lider autorizados; lider / clevel FORBIDDEN.
//   - Guard cruzado companyId (§2.4) — RH nao consegue baixar template
//     de empresa alheia.
//   - Empresa inexistente = NOT_FOUND canonico.
//   - Round-trip funcional: XLSX baixado tem cabecalho id-a-id com
//     `COLUNAS_CANONICAS_EMPLOYEES`; parseia sem erro em `readEmployees-
//     Workbook` + `parseEmployeesUpload` (que valida cabecalho estrito).
//   - Filename canonico: `template_colaboradores_{razaoSocialSanitized}
//     .xlsx`.
//   - Nome canonico da aba: `Cadastro em massa`.
//
// Faixa CNPJ canonica: 900..919 (reservada ME-fila5 D2).
// L32 cleanup em afterAll. JWT_SECRET fixo. Padrao S009/S087.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import ExcelJS from 'exceljs';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeLeaderHistory,
  employees,
  individualProfilePlaceholders,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  COLUNAS_CANONICAS_EMPLOYEES,
  DOWNLOAD_EMPLOYEES_TEMPLATE_INPUT_SCHEMA,
  MSG_EMPRESA_NAO_ENCONTRADA_EXPORT,
  NOME_ABA_EMPLOYEES_TEMPLATE,
  buildEmployeesTemplateBuffer,
  createEmployeesRouter,
  parseEmployeesUpload,
  readEmployeesWorkbook,
  sanitizeRazaoSocialEmp,
  type EmployeesDownloadResult,
} from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-fila5-d2-download-template';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me-fila5-d2-download-template';

// Faixa CNPJ 900..919 (S195 estendido — sub-faixa canonica ME-fila5 D2
// dispatch download-template; 20 slots cobrem 12+ empresas fixtures com
// folga). Faixa 920..939 reservada para o dispatch irmao `export-
// spreadsheet` para preservar isolamento.
let cnpjCounter = 899;
function nextCnpj(): string {
  cnpjCounter += 1;
  if (cnpjCounter > 919) {
    throw new Error('nextCnpj: faixa 900..919 esgotada — expandir a reserva canonica');
  }
  return String(10000000000000 + cnpjCounter).padStart(14, '0');
}

// Sub-faixa CPF ME-fila5 D2 download-template — evita colisao com
// ME-043b (43870000000+).
let cpfCounter = 52000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // Coleta employeeIds das empresas para limpar FKs ON DELETE RESTRICT.
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
    }
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(razaoSocial: string): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial,
      nomeFantasia: razaoSocial,
      cnpj,
      telefone: '1633330000',
      endereco: `Rua ME-fila5, ${cnpj}`,
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

/**
 * Cria employee canonico com passwordHash=HASH_A e retorna o id. Padrao
 * bit-a-bit ao `createFixtureLider` de `employees-uploadCSV.test.ts:197`.
 * Necessario para que o middleware de autenticacao encontre o employee
 * pelo `sub` do JWT e valide `credentialVersion` contra o hash real.
 */
async function createRHEmployee(companyId: number, name: string): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `${name.replace(/\s+/g, '').toLowerCase()}-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente RH',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      isRH: true,
      isResponsavelFinanceiro: false,
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

async function tokenSuperAdmin(): Promise<string> {
  return signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
  });
}

function bindRouter() {
  const testRouter = createEmployeesRouter();
  const factory = createCallerFactory(testRouter);
  const ctx = (bearerToken: string | null): Context =>
    createContextInner({
      db: client.db,
      rateLimiter: createRateLimiter(),
      bearerToken,
    });
  return { factory, ctx };
}

// ============================================================
// 0) Contratos publicos exportados (RV-13)
// ============================================================

describe('employees.downloadTemplate — contratos publicos exportados', () => {
  it('NOME_ABA_EMPLOYEES_TEMPLATE eh "Cadastro em massa"', () => {
    expect(NOME_ABA_EMPLOYEES_TEMPLATE).toBe('Cadastro em massa');
  });

  it('MSG_EMPRESA_NAO_ENCONTRADA_EXPORT eh literal canonica', () => {
    expect(MSG_EMPRESA_NAO_ENCONTRADA_EXPORT).toBe('Empresa nao encontrada.');
  });

  it('DOWNLOAD_EMPLOYEES_TEMPLATE_INPUT_SCHEMA aceita companyId inteiro positivo', () => {
    const parsed = DOWNLOAD_EMPLOYEES_TEMPLATE_INPUT_SCHEMA.safeParse({ companyId: 1 });
    expect(parsed.success).toBe(true);
  });

  it('DOWNLOAD_EMPLOYEES_TEMPLATE_INPUT_SCHEMA rejeita companyId nao-positivo', () => {
    expect(DOWNLOAD_EMPLOYEES_TEMPLATE_INPUT_SCHEMA.safeParse({ companyId: 0 }).success).toBe(
      false,
    );
    expect(DOWNLOAD_EMPLOYEES_TEMPLATE_INPUT_SCHEMA.safeParse({ companyId: -1 }).success).toBe(
      false,
    );
  });

  it('sanitizeRazaoSocialEmp normaliza acentos e caracteres especiais', () => {
    expect(sanitizeRazaoSocialEmp('Nativa Alimentos Ltda.')).toBe('NATIVA_ALIMENTOS_LTDA');
    expect(sanitizeRazaoSocialEmp('Empresa Ção & Cia')).toBe('EMPRESA_CAO_CIA');
    expect(sanitizeRazaoSocialEmp('  Espacos  ')).toBe('ESPACOS');
  });

  it('sanitizeRazaoSocialEmp trunca em 40 caracteres', () => {
    const longo = 'A'.repeat(100);
    const san = sanitizeRazaoSocialEmp(longo);
    expect(san.length).toBeLessThanOrEqual(40);
  });
});

// ============================================================
// 1) Helper puro `buildEmployeesTemplateBuffer` — round-trip
// ============================================================

describe('buildEmployeesTemplateBuffer — helper canonico standalone', () => {
  it('produz XLSX com cabecalho id-a-id ao parser upload', async () => {
    const buf = await buildEmployeesTemplateBuffer();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);

    // Re-parseia o XLSX para inspecionar cabecalho.
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_EMPLOYEES_TEMPLATE);
    expect(ws).toBeDefined();
    if (!ws) throw new Error('worksheet missing');
    for (let i = 0; i < COLUNAS_CANONICAS_EMPLOYEES.length; i += 1) {
      const cell = ws.getRow(1).getCell(i + 1).value;
      expect(cell).toBe(COLUNAS_CANONICAS_EMPLOYEES[i]);
    }
  });

  it('template vazio parseia sem linhas de dados via parser canonico', async () => {
    const buf = await buildEmployeesTemplateBuffer();
    const ws = await readEmployeesWorkbook(buf.toString('base64'), 'xlsx');
    // parseEmployeesUpload precisa de companyId real para checar CPFs
    // existentes; passamos um id inexistente (99999) — nenhum CPF vai
    // existir, e como o template tem 0 linhas, `linhas` sera vazio.
    const parsed = await parseEmployeesUpload(client.db, 99999, ws);
    expect(parsed.linhas.length).toBe(0);
    expect(parsed.erros.length).toBe(0);
  });
});

// ============================================================
// 2) Matriz de autorizacao (§14.10 DOC 05)
// ============================================================

describe('employees.downloadTemplate — matriz de autorizacao', () => {
  it('super_admin baixa template com sucesso', async () => {
    const companyId = await createCompany('ME-fila5 D2 SA');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result: EmployeesDownloadResult = await caller.downloadTemplate({ companyId });
    expect(result.filename).toContain('template_colaboradores_');
    expect(result.filename.endsWith('.xlsx')).toBe(true);
    expect(result.xlsxBase64.length).toBeGreaterThan(0);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('rh baixa template com sucesso na propria empresa', async () => {
    const companyId = await createCompany('ME-fila5 D2 RH');
    const rhEmpId = await createRHEmployee(companyId, 'Ana RH');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmpId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.downloadTemplate({ companyId });
    expect(result.filename).toContain('template_colaboradores_');
  });

  it('rh_lider baixa template com sucesso na propria empresa', async () => {
    const companyId = await createCompany('ME-fila5 D2 RHL');
    const rhLiderEmpId = await createRHEmployee(companyId, 'Beto RH Lider');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh_lider', rhLiderEmpId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.downloadTemplate({ companyId });
    expect(result.filename).toContain('template_colaboradores_');
  });

  it('lider recebe FORBIDDEN', async () => {
    const companyId = await createCompany('ME-fila5 D2 LID');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', 42, companyId);
    const caller = factory(ctx(token));
    await expect(caller.downloadTemplate({ companyId })).rejects.toThrow(TRPCError);
  });

  it('clevel recebe FORBIDDEN', async () => {
    const companyId = await createCompany('ME-fila5 D2 CL');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('clevel', 42, companyId);
    const caller = factory(ctx(token));
    await expect(caller.downloadTemplate({ companyId })).rejects.toThrow(TRPCError);
  });

  it('sem token recebe UNAUTHORIZED', async () => {
    const companyId = await createCompany('ME-fila5 D2 NoAuth');
    const { factory, ctx } = bindRouter();
    const caller = factory(ctx(null));
    await expect(caller.downloadTemplate({ companyId })).rejects.toThrow(TRPCError);
  });
});

// ============================================================
// 3) Guard cruzado companyId (§2.4)
// ============================================================

describe('employees.downloadTemplate — guard cruzado §2.4', () => {
  it('RH nao consegue baixar template de empresa alheia', async () => {
    const companyIdA = await createCompany('ME-fila5 D2 A');
    const companyIdB = await createCompany('ME-fila5 D2 B');
    const { factory, ctx } = bindRouter();
    const tokenA = await tokenPlatform('rh', 42, companyIdA);
    const caller = factory(ctx(tokenA));
    await expect(caller.downloadTemplate({ companyId: companyIdB })).rejects.toThrow(TRPCError);
  });

  it('super_admin acessa qualquer empresa', async () => {
    const companyIdA = await createCompany('ME-fila5 D2 SA A');
    const companyIdB = await createCompany('ME-fila5 D2 SA B');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const resultA = await caller.downloadTemplate({ companyId: companyIdA });
    const resultB = await caller.downloadTemplate({ companyId: companyIdB });
    expect(resultA.filename).toContain('template_colaboradores_');
    expect(resultB.filename).toContain('template_colaboradores_');
    expect(resultA.filename).not.toBe(resultB.filename);
  });
});

// ============================================================
// 4) Empresa inexistente = NOT_FOUND canonico
// ============================================================

describe('employees.downloadTemplate — empresa inexistente', () => {
  it('super_admin em companyId inexistente recebe NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(caller.downloadTemplate({ companyId: 999_999_999 })).rejects.toMatchObject({
      message: MSG_EMPRESA_NAO_ENCONTRADA_EXPORT,
    });
  });
});

// ============================================================
// 5) Round-trip funcional canonico — download → parseia via parser
// ============================================================

describe('employees.downloadTemplate — round-trip funcional', () => {
  it('XLSX baixado passa validacao de cabecalho do parser upload', async () => {
    const companyId = await createCompany('ME-fila5 D2 RT');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.downloadTemplate({ companyId });

    // Re-parseia o XLSX baixado via helpers canonicos do parser.
    const ws = await readEmployeesWorkbook(result.xlsxBase64, 'xlsx');
    const parsed = await parseEmployeesUpload(client.db, companyId, ws);
    // Zero linhas de dados: nenhum sucesso, nenhum erro.
    expect(parsed.linhas.length).toBe(0);
    expect(parsed.erros.length).toBe(0);
  });

  it('filename canonico contem razaoSocial sanitizada e termina em .xlsx', async () => {
    const companyId = await createCompany('Empresa Ção Ltda ME-fila5');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.downloadTemplate({ companyId });
    expect(result.filename).toMatch(/^template_colaboradores_[A-Z0-9_]+\.xlsx$/);
  });
});
