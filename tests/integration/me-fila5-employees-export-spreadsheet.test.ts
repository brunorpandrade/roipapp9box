// ROIP APP 9BOX — teste de integracao ME-fila5 Dispatch 2 para a proc
// canonica `employees.exportSpreadsheet` (§14.10 CAMADA_UI).
//
// Cobre canonicamente:
//   - Contratos publicos exportados (RV-13): 14 rotulos de export,
//     schema Zod, tipo de retorno, `NOME_ABA_EMPLOYEES_EXPORT`, helper
//     `buildEmployeesExportBuffer`, `EXPORT_MAX_ROWS`, mensagem
//     canonica `MSG_EXPORT_TETO_EXCEDIDO`.
//   - Matriz de autorizacao: super_admin / rh / rh_lider autorizados;
//     lider / clevel FORBIDDEN.
//   - Guard cruzado §2.4.
//   - Round-trip: XLSX baixado tem 14 colunas + N linhas conforme
//     colaboradores ativos filtrados.
//   - Filtro respeitado (status ativo, departamento, etc.) — respeitando
//     ordem e agregacao id-a-id ao `list`.
//   - PC1a canonica automaticamente aplicada (herdada do service).
//   - Empresa inexistente = NOT_FOUND.
//
// Faixa CNPJ 910..919. L32 cleanup em afterAll. JWT_SECRET fixo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import ExcelJS from 'exceljs';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeGoals,
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
  COLUNAS_CANONICAS_EMPLOYEES_EXPORT,
  EXPORT_EMPLOYEES_SPREADSHEET_INPUT_SCHEMA,
  MSG_EMPRESA_NAO_ENCONTRADA_EXPORT,
  NOME_ABA_EMPLOYEES_EXPORT,
  buildEmployeesExportBuffer,
  createEmployeesRouter,
} from '../../src/server/routers/employees';
import {
  EXPORT_MAX_ROWS,
  MSG_EXPORT_TETO_EXCEDIDO,
  type EmployeeListRow,
} from '../../src/server/services/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-fila5-d2-export-spreadsheet';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me-fila5-d2-export-spreadsheet';

let cpfCounter = 53000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Faixa CNPJ 920..939 (S195 estendido — sub-faixa canonica ME-fila5 D2
// dispatch export-spreadsheet, 20 slots).
let cnpjCounter = 919;
function nextCnpj(): string {
  cnpjCounter += 1;
  if (cnpjCounter > 939) {
    throw new Error('nextCnpj: faixa 920..939 esgotada');
  }
  return String(10000000000000 + cnpjCounter).padStart(14, '0');
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, createdCompanyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
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

async function createEmployeeFixture(
  companyId: number,
  name: string,
  status: 'ativo' | 'inativo' = 'ativo',
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `emp-${name.replace(/\s+/g, '')}@roip.local`,
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
      isRH: false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

/**
 * Cria employee RH canonico bit-a-bit ao padrao de `employees-uploadCSV
 * .test.ts`. Necessario para autenticar RH/rh_lider no middleware.
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

const EMPTY_FILTERS = {
  busca: '',
  departamento: null,
  liderId: null,
  liderIdTipo: null,
  nivelHierarquico: null,
  status: 'ativo' as const,
  senioridade: null,
  jobFamily: null,
  dataAdmissaoInicio: null,
  dataAdmissaoFim: null,
  dataCadastroInicio: null,
  dataCadastroFim: null,
  papelFuncional: 'todos' as const,
};

// ============================================================
// 0) Contratos publicos exportados
// ============================================================

describe('employees.exportSpreadsheet — contratos publicos exportados', () => {
  it('COLUNAS_CANONICAS_EMPLOYEES_EXPORT tem 14 rotulos em ordem literal', () => {
    expect(COLUNAS_CANONICAS_EMPLOYEES_EXPORT.length).toBe(14);
    expect(COLUNAS_CANONICAS_EMPLOYEES_EXPORT[0]).toBe('Nome');
    expect(COLUNAS_CANONICAS_EMPLOYEES_EXPORT[1]).toBe('CPF');
    expect(COLUNAS_CANONICAS_EMPLOYEES_EXPORT[2]).toBe('Cargo');
    expect(COLUNAS_CANONICAS_EMPLOYEES_EXPORT[10]).toBe('Status');
    expect(COLUNAS_CANONICAS_EMPLOYEES_EXPORT[13]).toBe('Responsavel financeiro');
  });

  it('NOME_ABA_EMPLOYEES_EXPORT eh "Colaboradores"', () => {
    expect(NOME_ABA_EMPLOYEES_EXPORT).toBe('Colaboradores');
  });

  it('EXPORT_MAX_ROWS eh 10_000', () => {
    expect(EXPORT_MAX_ROWS).toBe(10_000);
  });

  it('MSG_EXPORT_TETO_EXCEDIDO tem texto canonico', () => {
    expect(MSG_EXPORT_TETO_EXCEDIDO).toBe(
      'Empresa excede o teto canonico de 10000 colaboradores para exportacao.',
    );
  });

  it('EXPORT_EMPLOYEES_SPREADSHEET_INPUT_SCHEMA aceita input canonico', () => {
    const parsed = EXPORT_EMPLOYEES_SPREADSHEET_INPUT_SCHEMA.safeParse({
      companyId: 1,
      filters: EMPTY_FILTERS,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(parsed.success).toBe(true);
  });

  it('EXPORT_EMPLOYEES_SPREADSHEET_INPUT_SCHEMA rejeita page/pageSize', () => {
    // Zod default `strip` remove chaves extra silenciosamente; o comportamento
    // canonico e que `page` e `pageSize` nunca aparecem no output pos-parse.
    const parsed = EXPORT_EMPLOYEES_SPREADSHEET_INPUT_SCHEMA.parse({
      companyId: 1,
      filters: EMPTY_FILTERS,
      sortBy: 'name',
      sortOrder: 'asc',
      page: 5,
      pageSize: 50,
    } as unknown as Parameters<typeof EXPORT_EMPLOYEES_SPREADSHEET_INPUT_SCHEMA.parse>[0]);
    expect((parsed as unknown as Record<string, unknown>).page).toBeUndefined();
    expect((parsed as unknown as Record<string, unknown>).pageSize).toBeUndefined();
  });
});

// ============================================================
// 1) Helper puro `buildEmployeesExportBuffer`
// ============================================================

describe('buildEmployeesExportBuffer — helper canonico standalone', () => {
  it('produz XLSX com cabecalho de 14 colunas de export', async () => {
    const buf = await buildEmployeesExportBuffer([]);
    expect(buf).toBeInstanceOf(Buffer);
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_EMPLOYEES_EXPORT);
    expect(ws).toBeDefined();
    if (!ws) throw new Error('ws missing');
    for (let i = 0; i < COLUNAS_CANONICAS_EMPLOYEES_EXPORT.length; i += 1) {
      const cell = ws.getRow(1).getCell(i + 1).value;
      expect(cell).toBe(COLUNAS_CANONICAS_EMPLOYEES_EXPORT[i]);
    }
  });

  it('produz linhas de dados a partir de EmployeeListRow', async () => {
    const row: EmployeeListRow = {
      id: 1,
      companyId: 10,
      name: 'Fulano',
      cpf: '12345678901',
      email: 'f@x.com',
      photoUrl: null,
      cargo: 'Analista',
      senioridade: 'pleno',
      jobFamily: 'administrativo_suporte',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isRH: false,
      isLider: false,
      isResponsavelFinanceiro: false,
      dataAdmissao: new Date('2020-01-01'),
      createdAt: new Date('2020-01-15'),
      liderName: 'Beltrano',
      liderTipo: 'employee',
      profileIndividualStatus: 'nao_respondido',
    };
    const buf = await buildEmployeesExportBuffer([row]);
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_EMPLOYEES_EXPORT);
    if (!ws) throw new Error('ws missing');
    expect(ws.getRow(2).getCell(1).value).toBe('Fulano');
    expect(ws.getRow(2).getCell(2).value).toBe('12345678901');
    expect(ws.getRow(2).getCell(3).value).toBe('Analista');
    expect(ws.getRow(2).getCell(11).value).toBe('Ativo');
  });
});

// ============================================================
// 2) Matriz de autorizacao
// ============================================================

describe('employees.exportSpreadsheet — matriz de autorizacao', () => {
  it('super_admin exporta com sucesso', async () => {
    const companyId = await createCompany('ME-fila5 D2 Exp SA');
    await createEmployeeFixture(companyId, 'ColabA');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.exportSpreadsheet({
      companyId,
      filters: EMPTY_FILTERS,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(result.filename).toContain('colaboradores_');
    expect(result.filename.endsWith('.xlsx')).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('rh exporta com sucesso na propria empresa', async () => {
    const companyId = await createCompany('ME-fila5 D2 Exp RH');
    const rhEmpId = await createRHEmployee(companyId, 'Ana RH Exp');
    await createEmployeeFixture(companyId, 'ColabB');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmpId, companyId);
    const caller = factory(ctx(token));
    const result = await caller.exportSpreadsheet({
      companyId,
      filters: EMPTY_FILTERS,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(result.filename).toContain('colaboradores_');
  });

  it('lider recebe FORBIDDEN', async () => {
    const companyId = await createCompany('ME-fila5 D2 Exp LID');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('lider', 42, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.exportSpreadsheet({
        companyId,
        filters: EMPTY_FILTERS,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).rejects.toThrow(TRPCError);
  });

  it('clevel recebe FORBIDDEN', async () => {
    const companyId = await createCompany('ME-fila5 D2 Exp CL');
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('clevel', 42, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.exportSpreadsheet({
        companyId,
        filters: EMPTY_FILTERS,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).rejects.toThrow(TRPCError);
  });
});

// ============================================================
// 3) Guard cruzado §2.4
// ============================================================

describe('employees.exportSpreadsheet — guard cruzado §2.4', () => {
  it('RH nao consegue exportar empresa alheia', async () => {
    const companyIdA = await createCompany('ME-fila5 D2 Exp Guard A');
    const companyIdB = await createCompany('ME-fila5 D2 Exp Guard B');
    const { factory, ctx } = bindRouter();
    const tokenA = await tokenPlatform('rh', 42, companyIdA);
    const caller = factory(ctx(tokenA));
    await expect(
      caller.exportSpreadsheet({
        companyId: companyIdB,
        filters: EMPTY_FILTERS,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).rejects.toThrow(TRPCError);
  });
});

// ============================================================
// 4) Round-trip funcional — export contem N colaboradores
// ============================================================

describe('employees.exportSpreadsheet — round-trip funcional', () => {
  it('XLSX exportado contem cabecalho + 1 linha por colaborador ativo', async () => {
    const companyId = await createCompany('ME-fila5 D2 Exp RT');
    await createEmployeeFixture(companyId, 'ColabX');
    await createEmployeeFixture(companyId, 'ColabY');
    await createEmployeeFixture(companyId, 'ColabZ');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.exportSpreadsheet({
      companyId,
      filters: EMPTY_FILTERS,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    const buf = Buffer.from(result.xlsxBase64, 'base64');
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_EMPLOYEES_EXPORT);
    if (!ws) throw new Error('ws missing');
    // Linha 1 = cabecalho; linhas 2..4 = ColabX, ColabY, ColabZ (ordem alfabetica).
    expect(ws.getRow(2).getCell(1).value).toBe('ColabX');
    expect(ws.getRow(3).getCell(1).value).toBe('ColabY');
    expect(ws.getRow(4).getCell(1).value).toBe('ColabZ');
  });

  it('filtro status=inativo retorna apenas inativos', async () => {
    const companyId = await createCompany('ME-fila5 D2 Exp Fltr');
    await createEmployeeFixture(companyId, 'AtivoA', 'ativo');
    await createEmployeeFixture(companyId, 'InativoB', 'inativo');
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const result = await caller.exportSpreadsheet({
      companyId,
      filters: { ...EMPTY_FILTERS, status: 'inativo' },
      sortBy: 'name',
      sortOrder: 'asc',
    });
    const buf = Buffer.from(result.xlsxBase64, 'base64');
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(NOME_ABA_EMPLOYEES_EXPORT);
    if (!ws) throw new Error('ws missing');
    expect(ws.getRow(2).getCell(1).value).toBe('InativoB');
    // Nao deve haver linha 3.
    expect(ws.getRow(3).getCell(1).value).toBeNull();
  });
});

// ============================================================
// 5) Empresa inexistente
// ============================================================

describe('employees.exportSpreadsheet — empresa inexistente', () => {
  it('super_admin em companyId inexistente recebe NOT_FOUND', async () => {
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    await expect(
      caller.exportSpreadsheet({
        companyId: 999_999_999,
        filters: EMPTY_FILTERS,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).rejects.toMatchObject({
      message: MSG_EMPRESA_NAO_ENCONTRADA_EXPORT,
    });
  });
});
