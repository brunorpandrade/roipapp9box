// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/nr1-form-state` (ME-049cd).
//
// Cobre o carregamento canonico da tela do questionario do Radar NR-1
// (DOC 03 §11.4) e a emissao do `nr1StartToken` que sustenta o controle
// anti-fraude "tempo baixo" do §11.5 (S236):
//   - Guardas de token, titular e empresa.
//   - S239 — titular C-level recebe 403 (restricao arquitetural).
//   - Sem ciclo aberto: `disponivel: false` e nenhum token emitido.
//   - Com ciclo aberto e elegivel: token assinado com os claims certos.
//   - Ja respondeu ou fora do snapshot: sem token.
//   - Grid canonico de 32 itens com os nomes literais dos 8 fatores.
//
// Padrao S009/S204: CNPJ da faixa auxiliar 10000000000991..992.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  employees,
} from '../../src/db/schema';
import {
  __setPortalNr1FormStateDbClient,
  __setPortalNr1FormStateNow,
  montarGridCanonicoNr1,
  MSG_AVISO_INICIO_NR1,
  MSG_BODY_MALFORMED_NR1_FORM,
  MSG_CLEVEL_NAO_RESPONDE_NR1,
  MSG_COMPANY_MISMATCH_NR1,
  MSG_EMPLOYEE_INATIVO_NR1,
  MSG_INVALID_TOKEN_NR1_FORM,
  MSG_MISSING_TOKEN_NR1_FORM,
  type Nr1FormStateSuccess,
  POST as nr1FormStatePOST,
} from '../../src/app/api/portal/nr1-form-state/route';
import { verifyNr1StartToken } from '../../src/server/auth/nr1StartToken';
import { signPortalToken } from '../../src/server/auth/portalToken';
import {
  FATORES_NR1,
  NUM_ITENS_TOTAL_NR1,
  TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1,
} from '../../src/server/services/nr1CalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049cd-nr1-form-state';

const HASH_FORM_STATE = 'hash-fixo-me049cd-nr1-form-state';
const CNPJ_FORM = '10000000000991';
const CNPJ_FORM_ALT = '10000000000992';
const NOW_FIXO = new Date('2026-07-10T12:00:00.000Z');

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalNr1FormStateDbClient(client);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(copsoqCycleSnapshot)
      .where(inArray(copsoqCycleSnapshot.companyId, createdCompanyIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  __setPortalNr1FormStateDbClient(null);
  __setPortalNr1FormStateNow(null);
  await closeDbClient(client);
});

beforeEach(() => {
  __setPortalNr1FormStateNow(() => NOW_FIXO);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049CD FORM ${cnpj} LTDA`,
      nomeFantasia: `ME049CD FORM ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049cd F, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `prf-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rhf-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      timezone: 'UTC',
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49910000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  opts: { status?: 'ativo' | 'inativo' } = {},
): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `EmpF ${cpf}`,
      cpf,
      email: `empf-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: opts.status ?? 'ativo',
      isLider: false,
      isRH: false,
      passwordHash: HASH_FORM_STATE,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(companyId: number): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLF ${cpf}`,
      cpf,
      email: `clf-${cpf}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO da companhia',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      status: 'ativo',
      passwordHash: HASH_FORM_STATE,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createCicloAberto(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo: '2026-07-01',
      dataAbertura: new Date('2026-07-01T00:00:00.000Z'),
      dataFechamento: new Date('2026-08-20T00:00:00.000Z'),
      status: 'aberto',
    })
    .$returningId();
  return row!.id;
}

async function inserirSnapshot(
  cicloDbId: number,
  companyId: number,
  employeeId: number,
  opts: { respondeu?: boolean; inativadoAposSnapshot?: boolean } = {},
): Promise<void> {
  await client.db.insert(copsoqCycleSnapshot).values({
    cicloDbId,
    companyId,
    employeeId,
    departamentoId: 1,
    snapshotEm: NOW_FIXO,
    respondeu: opts.respondeu ?? false,
    inativadoAposSnapshot: opts.inativadoAposSnapshot ?? false,
  });
}

async function callFormState(body: unknown): Promise<Response> {
  const req = new Request('http://localhost/api/portal/nr1-form-state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await nr1FormStatePOST(req);
}

// ============================================================
// 1) Contratos e guardas de token
// ============================================================

describe('portal-nr1-form-state — contratos e guardas', () => {
  it('expoe o grid canonico de 32 itens com os 8 fatores literais (§11.4/§11.6)', () => {
    const grid = montarGridCanonicoNr1();
    expect(grid).toHaveLength(NUM_ITENS_TOTAL_NR1);
    expect(grid[0]).toEqual({
      fator: 1,
      fatorNome: 'Exigências quantitativas',
      itemIndex: 1,
      itemGlobal: 1,
    });
    expect(grid[31]).toEqual({
      fator: 8,
      fatorNome: 'Saúde geral autopercebida',
      itemIndex: 4,
      itemGlobal: 32,
    });
    expect(new Set(grid.map((g) => g.fatorNome)).size).toBe(FATORES_NR1.length);
    expect(MSG_AVISO_INICIO_NR1).toContain('Não há salvamento parcial');
  });

  it('rejeita token ausente, malformado e body invalido', async () => {
    const semToken = await callFormState({});
    expect(semToken.status).toBe(400);
    expect(((await semToken.json()) as { msg: string }).msg).toBe(MSG_MISSING_TOKEN_NR1_FORM);

    const tokenInvalido = await callFormState({ portalToken: 'nao-e-jwt' });
    expect(tokenInvalido.status).toBe(401);
    expect(((await tokenInvalido.json()) as { msg: string }).msg).toBe(MSG_INVALID_TOKEN_NR1_FORM);

    const req = new Request('http://localhost/api/portal/nr1-form-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ nao é json',
    });
    const malformado = await nr1FormStatePOST(req);
    expect(malformado.status).toBe(400);
    expect(((await malformado.json()) as { msg: string }).msg).toBe(MSG_BODY_MALFORMED_NR1_FORM);
  });

  it('S239 — titular C-level recebe 403 canonico', async () => {
    const companyId = await createCompany(CNPJ_FORM);
    const clevelId = await createClevel(companyId);
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'clevel',
      titularId: clevelId,
    });
    const res = await callFormState({ portalToken });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { msg: string }).msg).toBe(MSG_CLEVEL_NAO_RESPONDE_NR1);
  });

  it('bloqueia colaborador inativo e token de outra empresa', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const inativo = await createEmployee(companyId, { status: 'inativo' });
    const tokenInativo = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: inativo,
    });
    const resInativo = await callFormState({ portalToken: tokenInativo });
    expect(resInativo.status).toBe(403);
    expect(((await resInativo.json()) as { msg: string }).msg).toBe(MSG_EMPLOYEE_INATIVO_NR1);

    const outraEmpresa = await createCompany(CNPJ_FORM_ALT);
    const forasteiro = await createEmployee(outraEmpresa);
    const tokenCruzado = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: forasteiro,
    });
    const resCruzado = await callFormState({ portalToken: tokenCruzado });
    expect(resCruzado.status).toBe(403);
    expect(((await resCruzado.json()) as { msg: string }).msg).toBe(MSG_COMPANY_MISMATCH_NR1);
  });
});

// ============================================================
// 2) Estado canonico do questionario (§11.4) e token de inicio
// ============================================================

describe('portal-nr1-form-state — estado do questionario e token de inicio (S236)', () => {
  it('sem ciclo aberto devolve indisponivel e nenhum token', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    const res = await callFormState({ portalToken });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as Nr1FormStateSuccess;
    expect(corpo.disponivel).toBe(false);
    expect(corpo.cicloDbId).toBeNull();
    expect(corpo.startToken).toBeNull();
    expect(corpo.grid).toHaveLength(NUM_ITENS_TOTAL_NR1);
    expect(corpo.tempoMinimoSegundos).toBe(TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1);
  });

  it('elegivel e sem resposta recebe token assinado com os claims canonicos', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCicloAberto(companyId);
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const res = await callFormState({ portalToken });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as Nr1FormStateSuccess;

    expect(corpo.disponivel).toBe(true);
    expect(corpo.elegivel).toBe(true);
    expect(corpo.jaRespondeu).toBe(false);
    expect(corpo.cicloDbId).toBe(cicloDbId);
    expect(corpo.ciclo).toBe('2026-07-01');
    expect(corpo.dataFechamento).toBe('2026-08-20');
    expect(corpo.startToken).not.toBeNull();

    const verificado = await verifyNr1StartToken(corpo.startToken!, NOW_FIXO);
    expect(verificado.valid).toBe(true);
    if (verificado.valid) {
      expect(verificado.claims.kind).toBe('nr1_start');
      expect(verificado.claims.companyId).toBe(companyId);
      expect(verificado.claims.employeeId).toBe(employeeId);
      expect(verificado.claims.cicloDbId).toBe(cicloDbId);
      expect(verificado.claims.issuedAtEpochSeconds).toBe(Math.floor(NOW_FIXO.getTime() / 1000));
    }
  });

  it('quem ja respondeu ou esta fora do snapshot nao recebe token', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const [ciclo] = await client.db
      .select()
      .from(copsoqCycles)
      .where(inArray(copsoqCycles.companyId, [companyId]))
      .limit(1);
    const cicloDbId = ciclo!.id;

    const respondente = await createEmployee(companyId);
    await inserirSnapshot(cicloDbId, companyId, respondente, { respondeu: true });
    const tokenRespondente = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondente,
    });
    const resRespondente = await callFormState({ portalToken: tokenRespondente });
    const corpoRespondente = (await resRespondente.json()) as Nr1FormStateSuccess;
    expect(corpoRespondente.jaRespondeu).toBe(true);
    expect(corpoRespondente.disponivel).toBe(false);
    expect(corpoRespondente.startToken).toBeNull();

    const foraDoSnapshot = await createEmployee(companyId);
    const tokenFora = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: foraDoSnapshot,
    });
    const resFora = await callFormState({ portalToken: tokenFora });
    const corpoFora = (await resFora.json()) as Nr1FormStateSuccess;
    expect(corpoFora.elegivel).toBe(false);
    expect(corpoFora.disponivel).toBe(false);
    expect(corpoFora.startToken).toBeNull();
  });
});
