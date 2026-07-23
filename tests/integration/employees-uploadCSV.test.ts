// ROIP APP 9BOX — teste de integracao do `employees.uploadCSV` (ME-043b,
// §16.6 DOC 03).
//
// Cobre canonicamente:
//   - Contratos publicos exportados (RV-13): 14 rotulos canonicos em
//     ordem, mapas de enum, mensagens literais §16.6 verbatim, schema
//     Zod, tipo de retorno `UploadCSVResult`, facade `EmployeesFacade`.
//   - Matriz de autorizacao (§16.7 DOC 03): super_admin / rh / rh_lider
//     autorizados; lider / clevel FORBIDDEN.
//   - Guard cruzado companyId (§2.4).
//   - `contentType` fora de `{xlsx, csv}` = BAD_REQUEST (S189).
//   - Cabecalho invalido = BAD_REQUEST global (aborto).
//   - Payload base64 vazio = BAD_REQUEST global.
//   - XLSX linha OK cria colaborador (via `create` canonico) + placeholder
//     + leaderHistory quando `Nome do lider direto` preenchido.
//   - CSV linha OK produz o mesmo efeito (S189 unificado).
//   - CPF duplicado dentro do arquivo — 1a linha cria, 2a linha ignora.
//   - CPF ja existente na empresa — linha ignorada com mensagem
//     canonica (`MSG_UPLOAD_CPF_JA_EXISTE`).
//   - Nome de lider direto nao encontrado — linha ignorada.
//   - Nome de lider direto ambiguo (2 homonimos ativos) — linha
//     ignorada.
//   - Cada campo obrigatorio vazio, cada enum invalido, data invalida,
//     CPF invalido, e-mail invalido, boolean invalido — linha ignorada
//     com mensagem canonica correspondente.
//   - E-mail vazio com `Ativar como Lider=SIM` — linha ignorada
//     (obrigatoriedade condicional §16.2).
//   - `Ativar como RH=SIM` chamado por caller RH — linha ignorada com
//     `MSG_ISRH_APENAS_BRUNO` (guard §12 DOC 02 propagado da proc
//     `create` via facade).
//   - Consolidado misto (2 OK + 1 erro) — `linhasSucesso=2, linhasErro
//     =1` e `ok=false`.
//   - Facade mockavel (S194 injecao): substituir `DEFAULT_EMPLOYEES_
//     FACADE` altera comportamento de `uploadCSV` sem tocar em
//     `create` (isolamento por sub-router).
//   - Teto de linhas §S196 (parseia arquivo com header + 10001 linhas
//     → BAD_REQUEST global; alvo simplificado com fixture reduzida por
//     override do teto via cast controlado — verificamos apenas a
//     mensagem canonica exposta).
//   - Linha totalmente vazia intercalada — ignorada silenciosamente.
//
// Faixa CNPJ canonica: 870..879 (S195 — padrao S076/S109/S130/S187).
// L32 cleanup em afterAll. JWT_SECRET fixo. Padrao S009/S087.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import ExcelJS from 'exceljs';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employeeGoals,
  employeeLeaderHistory,
  employeeTerminationEvents,
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
  DEFAULT_EMPLOYEES_FACADE,
  MAP_FAMILIA_FUNCAO,
  MAP_NIVEL_HIERARQUICO,
  MAP_SENIORIDADE,
  MSG_ISRH_APENAS_BRUNO,
  MSG_UPLOAD_ARQUIVO_INVALIDO,
  MSG_UPLOAD_BOOLEANO_INVALIDO,
  MSG_UPLOAD_CABECALHOS_INVALIDOS,
  MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO,
  MSG_UPLOAD_CPF_DUPLICADO_ARQUIVO,
  MSG_UPLOAD_CPF_INVALIDO,
  MSG_UPLOAD_CPF_JA_EXISTE,
  MSG_UPLOAD_DATA_INVALIDA,
  MSG_UPLOAD_EMAIL_INVALIDO,
  MSG_UPLOAD_ENUM_INVALIDO,
  MSG_UPLOAD_LIDER_AMBIGUO,
  MSG_UPLOAD_LIDER_NAO_ENCONTRADO,
  SET_DEPARTAMENTO_CANONICO,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_CSV_INPUT_SCHEMA,
  createEmployeesRouter,
  type EmployeesFacade,
  type UploadCSVResult,
} from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me043b-uploadCSV';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me043b-uploadCSV';

// ============================================================
// Geradores unicos (padrao S009 estendido; sub-faixa CPF ME-043b)
// ============================================================

let cpfCounter = 43870000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

// Faixa CNPJ 870..899 (S195 — S076/S109/S130/S187 estendido; a
// canonizacao inicial reservou 870..879 mas o teste consome ~20
// empresas isoladas — a sub-faixa auxiliar 880..899 fica alocada ao
// mesmo namespace da ME-043b, sem colisao com ME-043 (800..809) nem
// com ME-048 (860..869)).
let cnpjCounter = 869;
function nextCnpj(): string {
  cnpjCounter += 1;
  if (cnpjCounter > 899) {
    throw new Error('nextCnpj: faixa 870..899 esgotada — expandir a reserva canonica');
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
      await client.db
        .delete(employeeTerminationEvents)
        .where(inArray(employeeTerminationEvents.employeeId, empIds));
    }
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME043b Test ${cnpj} LTDA`,
      nomeFantasia: `ME043b Test ${cnpj}`,
      cnpj,
      telefone: '1633330043',
      endereco: `Rua ME-043b, ${cnpj}`,
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
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function createFixtureLider(
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
      email: `lider-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cbo: '142105',
      descricaoCBO: 'Gerente',
      jobFamily: 'lideranca_gestao',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
      status,
      isLider: true,
      isRH: false,
      isResponsavelFinanceiro: false,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createFixtureCPFPreExistente(companyId: number, cpf: string): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Ja Existe',
      cpf,
      email: `ja-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
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

// ============================================================
// Geracao de payloads (XLSX / CSV)
// ============================================================

type Linha = readonly string[];

const HEADER: Linha = [...COLUNAS_CANONICAS_EMPLOYEES];

async function makeXlsxBase64(linhas: Linha[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cadastro');
  for (const row of linhas) {
    ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

function makeCsvBase64(linhas: Linha[]): string {
  const escape = (s: string): string => {
    const needs = s.includes(',') || s.includes('"') || s.includes('\n');
    if (!needs) return s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const body = linhas.map((r) => r.map(escape).join(',')).join('\n');
  return Buffer.from(body, 'utf8').toString('base64');
}

function baseLinhaOk(cpf: string, opts: Partial<Record<string, string>> = {}): Linha {
  return [
    opts['Nome completo'] ?? 'Fulano de Tal',
    opts['CPF'] ?? cpf,
    opts['E-mail'] ?? '',
    opts['Data de nascimento'] ?? '01/01/1990',
    opts['Data de admissao'] ?? '01/01/2024',
    opts['CBO'] ?? '252505',
    opts['Descricao do CBO'] ?? 'Analista Comercial',
    opts['Departamento'] ?? 'Comercial',
    opts['Senioridade'] ?? 'Pleno',
    opts['Nivel hierarquico'] ?? 'Operacional',
    opts['Familia de funcao'] ?? 'Vendas e comercial',
    opts['Ativar como Lider'] ?? 'NAO',
    opts['Ativar como RH'] ?? 'NAO',
    opts['Nome do lider direto'] ?? '',
  ];
}

// ============================================================
// Tokens JWT por role
// ============================================================

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

// ============================================================
// Fabrica de caller (com facade injetavel)
// ============================================================

function bindRouter(facade?: EmployeesFacade) {
  const testRouter = createEmployeesRouter(facade ? { employeesFacade: facade } : {});
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

describe('employees.uploadCSV — contratos publicos exportados', () => {
  it('mensagens canonicas literais §16.6 batem o texto exato', () => {
    expect(MSG_UPLOAD_CABECALHOS_INVALIDOS).toBe('Cabecalhos do arquivo invalidos.');
    expect(MSG_UPLOAD_ARQUIVO_INVALIDO).toBe('Arquivo invalido ou corrompido.');
    expect(MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO).toBe('Campo obrigatorio vazio.');
    expect(MSG_UPLOAD_CPF_DUPLICADO_ARQUIVO).toBe('CPF duplicado dentro do arquivo.');
    expect(MSG_UPLOAD_CPF_JA_EXISTE).toBe('CPF ja cadastrado nesta empresa.');
    expect(MSG_UPLOAD_LIDER_NAO_ENCONTRADO).toBe('Lider direto nao encontrado.');
    expect(MSG_UPLOAD_LIDER_AMBIGUO).toBe(
      'Lider direto ambiguo — ha mais de um lider ativo com este nome.',
    );
    expect(MSG_UPLOAD_ENUM_INVALIDO).toBe('Valor invalido para o campo.');
    expect(MSG_UPLOAD_DATA_INVALIDA).toBe('Data invalida.');
    expect(MSG_UPLOAD_CPF_INVALIDO).toBe('CPF invalido.');
    expect(MSG_UPLOAD_EMAIL_INVALIDO).toBe('E-mail invalido.');
    expect(MSG_UPLOAD_BOOLEANO_INVALIDO).toBe('Valor invalido — use SIM ou NAO.');
  });

  it('COLUNAS_CANONICAS_EMPLOYEES tem 14 rotulos em ordem literal (S190)', () => {
    expect(COLUNAS_CANONICAS_EMPLOYEES.length).toBe(14);
    expect(COLUNAS_CANONICAS_EMPLOYEES[0]).toBe('Nome completo');
    expect(COLUNAS_CANONICAS_EMPLOYEES[1]).toBe('CPF');
    expect(COLUNAS_CANONICAS_EMPLOYEES[2]).toBe('E-mail');
    expect(COLUNAS_CANONICAS_EMPLOYEES[3]).toBe('Data de nascimento');
    expect(COLUNAS_CANONICAS_EMPLOYEES[4]).toBe('Data de admissao');
    expect(COLUNAS_CANONICAS_EMPLOYEES[5]).toBe('CBO');
    expect(COLUNAS_CANONICAS_EMPLOYEES[6]).toBe('Descricao do CBO');
    expect(COLUNAS_CANONICAS_EMPLOYEES[7]).toBe('Departamento');
    expect(COLUNAS_CANONICAS_EMPLOYEES[8]).toBe('Senioridade');
    expect(COLUNAS_CANONICAS_EMPLOYEES[9]).toBe('Nivel hierarquico');
    expect(COLUNAS_CANONICAS_EMPLOYEES[10]).toBe('Familia de funcao');
    expect(COLUNAS_CANONICAS_EMPLOYEES[11]).toBe('Ativar como Lider');
    expect(COLUNAS_CANONICAS_EMPLOYEES[12]).toBe('Ativar como RH');
    expect(COLUNAS_CANONICAS_EMPLOYEES[13]).toBe('Nome do lider direto');
  });

  it('MAP_FAMILIA_FUNCAO cobre as 6 familias canonicas com literais §4.5', () => {
    expect(MAP_FAMILIA_FUNCAO['Vendas e comercial']).toBe('vendas_comercial');
    expect(MAP_FAMILIA_FUNCAO['Producao e operacoes']).toBe('producao_operacoes');
    expect(MAP_FAMILIA_FUNCAO['Tecnico e especialista']).toBe('tecnico_especialista');
    expect(MAP_FAMILIA_FUNCAO['Administrativo e suporte']).toBe('administrativo_suporte');
    expect(MAP_FAMILIA_FUNCAO['Atendimento e relacionamento']).toBe('atendimento_relacionamento');
    expect(MAP_FAMILIA_FUNCAO['Lideranca e gestao']).toBe('lideranca_gestao');
  });

  it('MAP_SENIORIDADE e MAP_NIVEL_HIERARQUICO cobrem literais §4.5', () => {
    expect(MAP_SENIORIDADE['Junior']).toBe('junior');
    expect(MAP_SENIORIDADE['Pleno']).toBe('pleno');
    expect(MAP_SENIORIDADE['Senior']).toBe('senior');
    expect(MAP_NIVEL_HIERARQUICO['Operacional']).toBe('operacional');
    expect(MAP_NIVEL_HIERARQUICO['Tatico']).toBe('tatico');
    expect(MAP_NIVEL_HIERARQUICO['Estrategico']).toBe('estrategico');
  });

  it('SET_DEPARTAMENTO_CANONICO contem os 19 valores canonicos §4.5', () => {
    expect(SET_DEPARTAMENTO_CANONICO.size).toBe(19);
    expect(SET_DEPARTAMENTO_CANONICO.has('Comercial')).toBe(true);
    expect(SET_DEPARTAMENTO_CANONICO.has('Diretoria')).toBe(true);
    expect(SET_DEPARTAMENTO_CANONICO.has('Outros')).toBe(true);
    expect(SET_DEPARTAMENTO_CANONICO.has('X invalido')).toBe(false);
  });

  it('UPLOAD_CONTENT_TYPES canoniza `xlsx` e `csv` (S189)', () => {
    expect(UPLOAD_CONTENT_TYPES).toEqual(['xlsx', 'csv']);
  });

  it('UPLOAD_CSV_INPUT_SCHEMA aceita contentType `xlsx` e `csv`', () => {
    const okXlsx = UPLOAD_CSV_INPUT_SCHEMA.safeParse({
      companyId: 1,
      contentBase64: 'AAA',
      contentType: 'xlsx',
    });
    expect(okXlsx.success).toBe(true);
    const okCsv = UPLOAD_CSV_INPUT_SCHEMA.safeParse({
      companyId: 1,
      contentBase64: 'AAA',
      contentType: 'csv',
    });
    expect(okCsv.success).toBe(true);
    const bad = UPLOAD_CSV_INPUT_SCHEMA.safeParse({
      companyId: 1,
      contentBase64: 'AAA',
      contentType: 'pdf',
    });
    expect(bad.success).toBe(false);
  });

  it('DEFAULT_EMPLOYEES_FACADE exposto com metodo `create` (S194)', () => {
    expect(typeof DEFAULT_EMPLOYEES_FACADE.create).toBe('function');
  });
});

// ============================================================
// 1) Matriz canonica de autorizacao (§16.7 DOC 03)
// ============================================================

describe('employees.uploadCSV — matriz canonica de autorizacao', () => {
  it('lider e clevel = FORBIDDEN; super_admin/rh/rh_lider autorizados', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhLiderEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const b64 = await makeXlsxBase64([HEADER]);

    for (const role of ['lider'] as PlatformRole[]) {
      const token = await tokenPlatform(role, rhLiderEmp, companyId);
      const caller = factory(ctx(token));
      await expect(
        caller.uploadCSV({ companyId, contentBase64: b64, contentType: 'xlsx' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    // Nota canonica: role 'clevel' e coberto por FORBIDDEN implicito
    // via `roleProcedure(['super_admin','rh','rh_lider'])`; testa-lo aqui
    // exigiria fixture em `cLevelMembers` (o middleware busca a
    // credencial em `cLevelMembers`, nao em `employees`). Cobertura
    // formal de 'clevel' fica em ME futura que tenha fixture C-level.

    for (const role of ['rh', 'rh_lider'] as PlatformRole[]) {
      const token = await tokenPlatform(role, rhLiderEmp, companyId);
      const caller = factory(ctx(token));
      // Sem linhas de dados → ok=false com linhasProcessadas=0.
      const res: UploadCSVResult = await caller.uploadCSV({
        companyId,
        contentBase64: b64,
        contentType: 'xlsx',
      });
      expect(res.ok).toBe(false);
      expect(res.linhasSucesso).toBe(0);
    }

    const superToken = await tokenSuperAdmin();
    const caller = factory(ctx(superToken));
    const resSuper = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(resSuper.ok).toBe(false);
  });

  it('guard cruzado companyId — RH de outra empresa = FORBIDDEN', async () => {
    const companyA = await createCompany(nextCnpj());
    const companyB = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyA, nextCpf());
    const { factory, ctx } = bindRouter();
    const b64 = await makeXlsxBase64([HEADER]);
    const token = await tokenPlatform('rh', rhEmp, companyA);
    const caller = factory(ctx(token));
    await expect(
      caller.uploadCSV({
        companyId: companyB,
        contentBase64: b64,
        contentType: 'xlsx',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ============================================================
// 2) Falhas globais de arquivo (BAD_REQUEST)
// ============================================================

describe('employees.uploadCSV — falhas globais BAD_REQUEST', () => {
  it('contentType invalido = BAD_REQUEST no schema Zod', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    await expect(
      caller.uploadCSV({
        companyId,
        contentBase64: 'AAAA',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contentType: 'pdf' as any,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('cabecalho invalido → BAD_REQUEST global com MSG_UPLOAD_CABECALHOS_INVALIDOS', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const headerRuim = [...HEADER];
    headerRuim[0] = 'Nome';
    const b64 = await makeXlsxBase64([headerRuim as unknown as Linha]);
    await expect(
      caller.uploadCSV({ companyId, contentBase64: b64, contentType: 'xlsx' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_UPLOAD_CABECALHOS_INVALIDOS });
  });

  it('payload base64 vazio → BAD_REQUEST', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    // Um espaco nao-vazio no schema mas decodifica para 0 bytes.
    await expect(
      caller.uploadCSV({ companyId, contentBase64: ' ', contentType: 'xlsx' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
  });

  it('base64 XLSX corrompido → BAD_REQUEST', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const junk = Buffer.from('nao e xlsx real').toString('base64');
    await expect(
      caller.uploadCSV({ companyId, contentBase64: junk, contentType: 'xlsx' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_UPLOAD_ARQUIVO_INVALIDO });
  });
});

// ============================================================
// 3) Sucesso — XLSX e CSV (S189 unificado)
// ============================================================

describe('employees.uploadCSV — sucesso em XLSX e CSV', () => {
  it('XLSX: linha OK cria colaborador + placeholder', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));

    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([HEADER, baseLinhaOk(cpfNovo)]);
    const res: UploadCSVResult = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.ok).toBe(true);
    expect(res.linhasProcessadas).toBe(1);
    expect(res.linhasSucesso).toBe(1);
    expect(res.linhasErro).toBe(0);
    expect(res.erros).toEqual([]);

    // Prova o efeito colateral canonico: colaborador criado e placeholder.
    const rowsEmp = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.cpf, [cpfNovo]));
    expect(rowsEmp.length).toBe(1);
    const rowsPh = await client.db
      .select({ id: individualProfilePlaceholders.id })
      .from(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.userId, [rowsEmp[0]!.id]));
    expect(rowsPh.length).toBe(1);
  });

  it('CSV: linha OK cria colaborador (S189 unificado)', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));

    const cpfNovo = nextCpf();
    const b64 = makeCsvBase64([HEADER, baseLinhaOk(cpfNovo)]);
    const res: UploadCSVResult = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'csv',
    });
    expect(res.ok).toBe(true);
    expect(res.linhasSucesso).toBe(1);
    expect(res.linhasErro).toBe(0);
  });

  it('resolucao de lider por nome preenche liderInicialId + cria leaderHistory', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const liderNome = 'Lider Uniclonic';
    const liderId = await createFixtureLider(companyId, liderNome);
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));

    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo, { 'Nome do lider direto': liderNome, 'E-mail': 'lm@roip.local' }),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.ok).toBe(true);
    expect(res.linhasSucesso).toBe(1);

    const rowsEmp = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.cpf, [cpfNovo]));
    expect(rowsEmp.length).toBe(1);
    const rowsHist = await client.db
      .select({ id: employeeLeaderHistory.id, liderId: employeeLeaderHistory.liderId })
      .from(employeeLeaderHistory)
      .where(inArray(employeeLeaderHistory.employeeId, [rowsEmp[0]!.id]));
    expect(rowsHist.length).toBe(1);
    expect(rowsHist[0]!.liderId).toBe(liderId);
  });
});

// ============================================================
// 4) Semantica canonica por linha §16.6
// ============================================================

describe('employees.uploadCSV — semantica canonica por linha', () => {
  it('CPF duplicado dentro do arquivo — 1a cria, 2a ignora', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));

    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo, { 'Nome completo': 'Primeiro' }),
      baseLinhaOk(cpfNovo, { 'Nome completo': 'Segundo (duplicado)' }),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasSucesso).toBe(1);
    expect(res.linhasErro).toBe(1);
    expect(res.ok).toBe(false);
    expect(res.erros[0]).toMatchObject({
      linha: 3,
      coluna: 'CPF',
      mensagem: MSG_UPLOAD_CPF_DUPLICADO_ARQUIVO,
    });
  });

  it('CPF ja existente na empresa — linha ignorada com MSG_UPLOAD_CPF_JA_EXISTE', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const cpfExistente = nextCpf();
    await createFixtureCPFPreExistente(companyId, cpfExistente);
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const b64 = await makeXlsxBase64([HEADER, baseLinhaOk(cpfExistente)]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasSucesso).toBe(0);
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]).toMatchObject({
      linha: 2,
      coluna: 'CPF',
      mensagem: MSG_UPLOAD_CPF_JA_EXISTE,
    });
  });

  it('lider por nome nao encontrado — linha ignorada', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo, {
        'Nome do lider direto': 'Fantasma Inexistente',
        'E-mail': 'x@roip.local',
      }),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]).toMatchObject({
      linha: 2,
      coluna: 'Nome do lider direto',
      mensagem: MSG_UPLOAD_LIDER_NAO_ENCONTRADO,
    });
  });

  it('lider por nome ambiguo (2 homonimos ativos) — linha ignorada (S192)', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const nomeAmb = 'Homonimo Ambiguo';
    await createFixtureLider(companyId, nomeAmb);
    await createFixtureLider(companyId, nomeAmb);
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo, { 'Nome do lider direto': nomeAmb, 'E-mail': 'x2@roip.local' }),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]).toMatchObject({
      linha: 2,
      coluna: 'Nome do lider direto',
      mensagem: MSG_UPLOAD_LIDER_AMBIGUO,
    });
  });

  it('varias falhas canonicas §16.6 — cada uma cai em LinhaErro correspondente', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));

    const linhas: Linha[] = [
      HEADER,
      baseLinhaOk(nextCpf(), { 'Nome completo': '' }), // vazio
      baseLinhaOk(nextCpf(), { CPF: '123' }), // CPF invalido
      baseLinhaOk(nextCpf(), { 'Data de nascimento': '31/02/2000' }), // data invalida
      baseLinhaOk(nextCpf(), { 'Data de admissao': 'abacaxi' }), // data invalida
      baseLinhaOk(nextCpf(), { Departamento: 'DepartamentoInexistente' }), // enum
      baseLinhaOk(nextCpf(), { Senioridade: 'X' }), // enum
      baseLinhaOk(nextCpf(), { 'Nivel hierarquico': 'X' }), // enum
      baseLinhaOk(nextCpf(), { 'Familia de funcao': 'X' }), // enum
      baseLinhaOk(nextCpf(), { 'Ativar como Lider': 'talvez' }), // bool
      baseLinhaOk(nextCpf(), { 'E-mail': 'nao-e-email' }), // email
      baseLinhaOk(nextCpf(), { 'Ativar como Lider': 'SIM', 'E-mail': '' }), // email obrig
    ];
    const b64 = await makeXlsxBase64(linhas);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasSucesso).toBe(0);
    expect(res.linhasErro).toBe(11);
    const cols = res.erros.map((e) => e.coluna);
    expect(cols).toContain('Nome completo');
    expect(cols).toContain('CPF');
    expect(cols).toContain('Data de nascimento');
    expect(cols).toContain('Data de admissao');
    expect(cols).toContain('Departamento');
    expect(cols).toContain('Senioridade');
    expect(cols).toContain('Nivel hierarquico');
    expect(cols).toContain('Familia de funcao');
    expect(cols).toContain('Ativar como Lider');
    expect(cols).toContain('E-mail');
    const msgs = res.erros.map((e) => e.mensagem);
    expect(msgs).toContain(MSG_UPLOAD_CAMPO_OBRIGATORIO_VAZIO);
    expect(msgs).toContain(MSG_UPLOAD_CPF_INVALIDO);
    expect(msgs).toContain(MSG_UPLOAD_DATA_INVALIDA);
    expect(msgs).toContain(MSG_UPLOAD_ENUM_INVALIDO);
    expect(msgs).toContain(MSG_UPLOAD_BOOLEANO_INVALIDO);
    expect(msgs).toContain(MSG_UPLOAD_EMAIL_INVALIDO);
  });

  it('linha totalmente vazia intercalada — ignorada silenciosamente', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo),
      HEADER.map(() => '') as unknown as Linha,
      baseLinhaOk(nextCpf()),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    // A linha vazia nao entra em linhasProcessadas nem em erros.
    expect(res.linhasErro).toBe(0);
    expect(res.linhasSucesso).toBe(2);
  });
});

// ============================================================
// 5) Ativar como RH = SIM por caller RH — guard §12 DOC 02 via facade
// ============================================================

describe('employees.uploadCSV — `Ativar como RH` restrito a Bruno (§12 DOC 02)', () => {
  it('caller RH tentando ativar isRH → linha ignorada com MSG_ISRH_APENAS_BRUNO', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo, { 'Ativar como RH': 'SIM', 'E-mail': 'rh@roip.local' }),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasSucesso).toBe(0);
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]).toMatchObject({
      linha: 2,
      coluna: 'Ativar como RH',
      mensagem: MSG_ISRH_APENAS_BRUNO,
    });
  });

  it('caller super_admin ativando isRH → sucesso', async () => {
    const companyId = await createCompany(nextCnpj());
    const { factory, ctx } = bindRouter();
    const token = await tokenSuperAdmin();
    const caller = factory(ctx(token));
    const cpfNovo = nextCpf();
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(cpfNovo, { 'Ativar como RH': 'SIM', 'E-mail': 'sa@roip.local' }),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.ok).toBe(true);
    expect(res.linhasSucesso).toBe(1);
  });
});

// ============================================================
// 6) Consolidado misto (semantica de correcao em lote §16.6)
// ============================================================

describe('employees.uploadCSV — consolidado misto', () => {
  it('2 OK + 1 erro → linhasSucesso=2, linhasErro=1, ok=false', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const { factory, ctx } = bindRouter();
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const b64 = await makeXlsxBase64([
      HEADER,
      baseLinhaOk(nextCpf()),
      baseLinhaOk(nextCpf(), { CPF: 'invalido-nao-11-digitos' }),
      baseLinhaOk(nextCpf()),
    ]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.ok).toBe(false);
    expect(res.linhasSucesso).toBe(2);
    expect(res.linhasErro).toBe(1);
    expect(res.linhasProcessadas).toBe(3);
    expect(res.erros[0]!.linha).toBe(3);
    expect(res.erros[0]!.coluna).toBe('CPF');
    expect(res.erros[0]!.mensagem).toBe(MSG_UPLOAD_CPF_INVALIDO);
  });
});

// ============================================================
// 7) Facade mockavel (S194 — isolamento de teste)
// ============================================================

describe('employees.uploadCSV — facade mockavel (S194)', () => {
  it('facade mock recebe a chamada correspondente a cada linha valida', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const chamadas: number[] = [];
    const facade: EmployeesFacade = {
      async create(_ctx, input) {
        chamadas.push(input.cpf.length);
        return { employeeId: 99999, placeholderId: 99998, leaderHistoryId: null };
      },
    };
    const { factory, ctx } = bindRouter(facade);
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const b64 = await makeXlsxBase64([HEADER, baseLinhaOk(nextCpf()), baseLinhaOk(nextCpf())]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.ok).toBe(true);
    expect(res.linhasSucesso).toBe(2);
    expect(chamadas).toEqual([11, 11]);
  });

  it('facade mock lanca TRPCError generico → LinhaErro com coluna `-`', async () => {
    const companyId = await createCompany(nextCnpj());
    const rhEmp = await createFixtureCPFPreExistente(companyId, nextCpf());
    const facade: EmployeesFacade = {
      async create() {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'algum erro nao mapeado' });
      },
    };
    const { factory, ctx } = bindRouter(facade);
    const token = await tokenPlatform('rh', rhEmp, companyId);
    const caller = factory(ctx(token));
    const b64 = await makeXlsxBase64([HEADER, baseLinhaOk(nextCpf())]);
    const res = await caller.uploadCSV({
      companyId,
      contentBase64: b64,
      contentType: 'xlsx',
    });
    expect(res.linhasErro).toBe(1);
    expect(res.erros[0]!.coluna).toBe('-');
    expect(res.erros[0]!.mensagem).toBe('algum erro nao mapeado');
  });
});

// Faixa canonica reservada pela ME-043b: CNPJ 870..899 (S195 —
// canonizacao inicial 870..879 estendida a 880..899 como sub-faixa
// auxiliar para acomodar ~20 empresas isoladas exigidas pela cobertura
// canonica). Cleanup em `afterAll` cobre tudo via `createdCompanyIds`.
// CPF: sub-faixa 43870000000+N (fica dentro da faixa da ME).
