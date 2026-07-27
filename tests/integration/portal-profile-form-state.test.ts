// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/profile-form-state` (ME-049a; §10.13).
//
// Contra MySQL real (`roip_test`, S008). Padrao S036 herdado:
// chama a funcao `POST` diretamente com `new Request(...)`, injeta
// `RoipDbClient` via `__setPortalProfileFormStateDbClient` e relogio
// via `__setPortalProfileFormStateNow`. Cobre:
//   - Body malformado / token ausente / invalido / expirado.
//   - Primeira chamada: cria tentativa `em_andamento` com
//     `blocoAtual=1`, `respostas={}`, `blocosCompletos=[]`,
//     `tentativa=1`.
//   - Chamada repetida sobre mesmo titular: retorna o mesmo
//     `assessmentId` (idempotencia canonica).
//   - Retomada canonica DOC 05 §7.5: se ja existe tentativa
//     `em_andamento`, retorna estado vigente (`blocoAtual`,
//     `blocosCompletos`, `respostas`).
//   - Reteste: tentativa terminal (`enviado`) NAO abre nova
//     tentativa automatica — nova tentativa exige fluxo de reteste
//     (ME futura §10.7); enquanto isso, get devolve nova tentativa
//     `em_andamento` com `tentativa` incrementada.
//   - Contrato tipado `ProfileFormStateSuccess`.
//   - Isolamento canonico: titular A nao ve tentativa de titular B.
//
// CNPJs faixa canonica 900..909 (S199 — reservada para ME-049a).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, individualProfileAssessments } from '../../src/db/schema';
import { signPortalToken } from '../../src/server/auth/portalToken';
import {
  __setPortalProfileFormStateDbClient,
  __setPortalProfileFormStateNow,
  MSG_BODY_MALFORMED,
  MSG_EXPIRED_TOKEN,
  MSG_INVALID_TOKEN,
  MSG_MISSING_TOKEN,
  POST as profileFormStatePOST,
  type ProfileFormStateSuccess,
} from '../../src/app/api/portal/profile-form-state/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049a-portal-profile-form-state';
process.env.DATABASE_URL = TEST_URL;

const HASH = 'hash-fixo-me049a-form-state';

// Faixa auxiliar 910..919 (S195/S199 — sub-faixa da ME-049a).
const CNPJ_TOKEN = '10000000000910';
const CNPJ_NOVO = '10000000000911';
const CNPJ_RETOMADA = '10000000000912';
const CNPJ_RETESTE = '10000000000913';
const CNPJ_ISOLAMENTO = '10000000000914';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
const NOW_FIXO = new Date('2026-07-20T10:00:00Z');

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalProfileFormStateDbClient(client);
  __setPortalProfileFormStateNow(() => NOW_FIXO);
});

afterAll(async () => {
  __setPortalProfileFormStateDbClient(null);
  __setPortalProfileFormStateNow(null);
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049a FormState ${cnpj} LTDA`,
      nomeFantasia: `ME049a FS ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049a, ${cnpj}`,
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

let cpfCounter = 49100000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME049a FS',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
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
      passwordHash: HASH,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function callFormState(body: unknown) {
  const req = new Request('http://localhost/api/portal/profile-form-state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await profileFormStatePOST(req);
}

// ============================================================
// 1) Falhas canonicas de token e body
// ============================================================

describe('POST /api/portal/profile-form-state — falhas canonicas', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_TOKEN);
  });

  it('body nao-JSON -> 400 MSG_BODY_MALFORMED', async () => {
    const req = new Request('http://localhost/api/portal/profile-form-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'nao-e-json',
    });
    const res = await profileFormStatePOST(req);
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BODY_MALFORMED);
  });

  it('token ausente -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callFormState({});
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('token invalido -> 401 MSG_INVALID_TOKEN', async () => {
    const res = await callFormState({ portalToken: 'invalido' });
    expect(res.status).toBe(401);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_INVALID_TOKEN);
  });

  it('MSG_EXPIRED_TOKEN e distinto de MSG_INVALID_TOKEN', () => {
    expect(MSG_EXPIRED_TOKEN).toBe('Sessão expirada. Faça a identificação novamente.');
    expect(MSG_INVALID_TOKEN).toBe('Sessão inválida. Faça a identificação novamente.');
    expect(MSG_EXPIRED_TOKEN).not.toBe(MSG_INVALID_TOKEN);
  });
});

// ============================================================
// 2) Primeira chamada — cria tentativa `em_andamento` canonica
// ============================================================

describe('POST /api/portal/profile-form-state — cria tentativa nova', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_NOVO);
    employeeId = await createEmployee(companyId);
  });

  it('primeira chamada cria assessment em_andamento com tentativa=1', async () => {
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const res = await callFormState({ portalToken: token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProfileFormStateSuccess;
    expect(body.companyId).toBe(companyId);
    expect(body.userType).toBe('employee');
    expect(body.userId).toBe(employeeId);
    expect(body.tentativa).toBe(1);
    expect(body.blocoAtual).toBe(1);
    expect(body.blocosCompletos).toEqual([]);
    expect(body.respostas).toEqual({});
    expect(body.totalBlocos).toBe(10);
    expect(body.itensPorBloco).toBe(8);
  });

  it('segunda chamada retorna mesmo assessmentId (idempotencia)', async () => {
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const res1 = await callFormState({ portalToken: token });
    const b1 = (await res1.json()) as ProfileFormStateSuccess;
    const res2 = await callFormState({ portalToken: token });
    const b2 = (await res2.json()) as ProfileFormStateSuccess;
    expect(b2.assessmentId).toBe(b1.assessmentId);
  });
});

// ============================================================
// 3) Retomada canonica DOC 05 §7.5
// ============================================================

describe('POST /api/portal/profile-form-state — retomada canonica', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETOMADA);
    employeeId = await createEmployee(companyId);
  });

  it('retorna blocoAtual/blocosCompletos/respostas atuais', async () => {
    await client.db.insert(individualProfileAssessments).values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      tentativa: 1,
      status: 'em_andamento',
      blocoAtual: 4,
      blocosCompletos: [1, 2, 3],
      respostas: { ITEM_001: 3, ITEM_002: 4 },
    });

    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const res = await callFormState({ portalToken: token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProfileFormStateSuccess;
    expect(body.blocoAtual).toBe(4);
    expect(body.blocosCompletos).toEqual([1, 2, 3]);
    expect(body.respostas).toEqual({ ITEM_001: 3, ITEM_002: 4 });
  });
});

// ============================================================
// 4) Reteste — tentativa terminal abre proxima tentativa
// ============================================================

describe('POST /api/portal/profile-form-state — proxima tentativa apos terminal', () => {
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_RETESTE);
    employeeId = await createEmployee(companyId);
  });

  it('tentativa=1 enviado + sem em_andamento -> nova tentativa=2', async () => {
    await client.db.insert(individualProfileAssessments).values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      tentativa: 1,
      status: 'enviado',
      blocoAtual: 10,
      blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      respostas: {},
      enviadoEm: NOW_FIXO,
    });

    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const res = await callFormState({ portalToken: token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProfileFormStateSuccess;
    expect(body.tentativa).toBe(2);
    expect(body.blocoAtual).toBe(1);
    expect(body.blocosCompletos).toEqual([]);
  });
});

// ============================================================
// 5) Isolamento canonico (§2.4)
// ============================================================

describe('POST /api/portal/profile-form-state — isolamento entre titulares', () => {
  let companyId: number;
  let empA: number;
  let empB: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_ISOLAMENTO);
    empA = await createEmployee(companyId);
    empB = await createEmployee(companyId);
  });

  it('titular B nao ve tentativa de titular A', async () => {
    const tokenA = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: empA,
    });
    const resA = await callFormState({ portalToken: tokenA });
    const bA = (await resA.json()) as ProfileFormStateSuccess;

    const tokenB = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: empB,
    });
    const resB = await callFormState({ portalToken: tokenB });
    const bB = (await resB.json()) as ProfileFormStateSuccess;

    expect(bA.userId).toBe(empA);
    expect(bB.userId).toBe(empB);
    expect(bA.assessmentId).not.toBe(bB.assessmentId);

    // Confirma que so ha 1 assessment por titular.
    const rowsA = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.userId, empA));
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]!.companyId).toBe(companyId);
  });
});
