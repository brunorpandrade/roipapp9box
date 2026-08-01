// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/save-profile-block` (ME-049a; §10.13 + §7.5).
//
// Contra MySQL real. Cobre:
//   - Body malformado / token ausente / invalido.
//   - Bloco fora de range (0/11) -> 400.
//   - Bloco incompleto (< 8 itens presentes) -> 400.
//   - Guard cruzado companyId/titular vs assessment -> 403.
//   - Assessment `enviado`/`inconsistente` -> 409.
//   - Save canonico: 200 + merge de respostas + append blocosCompletos
//     + avanco blocoAtual.
//   - Regra de volta canonica DOC 05 §7.5: bloco ja completo pode ser
//     reescrito apenas se `blocoAtual == bloco+1` (edicao de volta
//     imediata); fora dessa janela -> 409
//     MSG_BLOCO_JA_COMPLETO_TRAVADO.
//   - `itensDoBloco` puro: cobre 1 -> [1..8]; 10 -> [73..80].
//   - `bloqueEstaCompleto` puro.
//
// CNPJs faixa 920..929 (S199 auxiliar).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, individualProfileAssessments } from '../../src/db/schema';
import { signPortalToken } from '../../src/server/auth/portalToken';
import { itemKey } from '../../src/server/services/individualProfileEngine';
import {
  __setPortalSaveProfileBlockDbClient,
  __setPortalSaveProfileBlockNow,
  bloqueEstaCompleto,
  itensDoBloco,
  MSG_ASSESSMENT_NAO_EM_ANDAMENTO,
  MSG_ASSESSMENT_NAO_ENCONTRADO,
  MSG_ASSESSMENT_TITULAR_MISMATCH,
  MSG_BLOCO_FORA_DE_RANGE,
  MSG_BLOCO_INCOMPLETO,
  MSG_BLOCO_JA_COMPLETO_TRAVADO,
  MSG_BODY_MALFORMED,
  MSG_INVALID_TOKEN,
  MSG_MISSING_TOKEN,
  POST as saveBlockPOST,
  type SaveProfileBlockSuccess,
} from '../../src/app/api/portal/save-profile-block/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049a-portal-save-block';
process.env.DATABASE_URL = TEST_URL;

const HASH = 'hash-fixo-me049a-save-block';
const NOW = new Date('2026-07-20T11:00:00Z');

const CNPJ_TOKEN = '10000000000920';
const CNPJ_RANGE = '10000000000921';
const CNPJ_INCOMPLETO = '10000000000922';
const CNPJ_MISMATCH = '10000000000923';
const CNPJ_TERMINAL = '10000000000924';
const CNPJ_SAVE_OK = '10000000000925';
const CNPJ_VOLTA_OK = '10000000000926';
const CNPJ_VOLTA_KO = '10000000000927';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalSaveProfileBlockDbClient(client);
  __setPortalSaveProfileBlockNow(() => NOW);
});

afterAll(async () => {
  __setPortalSaveProfileBlockDbClient(null);
  __setPortalSaveProfileBlockNow(null);
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
      razaoSocial: `ME049a SB ${cnpj} LTDA`,
      nomeFantasia: `ME049a SB ${cnpj}`,
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
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49200000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME049a SB',
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

async function createAssessment(
  companyId: number,
  employeeId: number,
  blocoAtual = 1,
  blocosCompletos: number[] = [],
  respostas: Record<string, string | number> = {},
  status: 'em_andamento' | 'enviado' | 'inconsistente' = 'em_andamento',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      tentativa: 1,
      status,
      blocoAtual,
      blocosCompletos,
      respostas,
    })
    .$returningId();
  return row!.id;
}

function respostasBloco(
  bloco: number,
  valor: string | number = 3,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const i of itensDoBloco(bloco)) out[itemKey(i)] = valor;
  return out;
}

async function callSaveBlock(body: unknown) {
  const req = new Request('http://localhost/api/portal/save-profile-block', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await saveBlockPOST(req);
}

// ============================================================
// 1) Falhas token/body
// ============================================================

describe('POST /api/portal/save-profile-block — falhas canonicas', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_TOKEN);
  });

  it('token ausente -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSaveBlock({ assessmentId: 1, bloco: 1, respostas: {} });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('token invalido -> 401 MSG_INVALID_TOKEN', async () => {
    const res = await callSaveBlock({
      portalToken: 'invalido',
      assessmentId: 1,
      bloco: 1,
      respostas: {},
    });
    expect(res.status).toBe(401);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_INVALID_TOKEN);
  });

  it('body malformado (assessmentId nao numerico) -> 400', async () => {
    const cid = await createCompany('10000000000928');
    const eid = await createEmployee(cid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: 'x',
      bloco: 1,
      respostas: {},
    });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BODY_MALFORMED);
  });
});

// ============================================================
// 2) Bloco fora de range
// ============================================================

describe('POST /api/portal/save-profile-block — bloco fora de range', () => {
  it('bloco=0 -> 400 MSG_BLOCO_FORA_DE_RANGE', async () => {
    const cid = await createCompany(CNPJ_RANGE);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 0,
      respostas: respostasBloco(1),
    });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BLOCO_FORA_DE_RANGE);
  });

  it('bloco=11 -> 400 MSG_BLOCO_FORA_DE_RANGE', async () => {
    const cid = await createCompany('10000000000929');
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 11,
      respostas: respostasBloco(1),
    });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BLOCO_FORA_DE_RANGE);
  });
});

// ============================================================
// 3) Bloco incompleto
// ============================================================

describe('POST /api/portal/save-profile-block — bloco incompleto', () => {
  it('respostas com menos de 8 itens -> 400 MSG_BLOCO_INCOMPLETO', async () => {
    const cid = await createCompany(CNPJ_INCOMPLETO);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const parcial = respostasBloco(1);
    delete parcial[itemKey(8)];
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 1,
      respostas: parcial,
    });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BLOCO_INCOMPLETO);
  });
});

// ============================================================
// 4) Guard cruzado + assessment inexistente + status terminal
// ============================================================

describe('POST /api/portal/save-profile-block — guard cruzado e status', () => {
  it('assessment inexistente -> 404', async () => {
    const cid = await createCompany('10000000000930');
    const eid = await createEmployee(cid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: 999999999,
      bloco: 1,
      respostas: respostasBloco(1),
    });
    expect(res.status).toBe(404);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_NAO_ENCONTRADO);
  });

  it('assessment de outro titular -> 403 MSG_ASSESSMENT_TITULAR_MISMATCH', async () => {
    const cid = await createCompany(CNPJ_MISMATCH);
    const empA = await createEmployee(cid);
    const empB = await createEmployee(cid);
    const aidA = await createAssessment(cid, empA);
    // Token de B tenta gravar em assessment de A.
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: empB,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aidA,
      bloco: 1,
      respostas: respostasBloco(1),
    });
    expect(res.status).toBe(403);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_TITULAR_MISMATCH);
  });

  it('assessment enviado -> 409 MSG_ASSESSMENT_NAO_EM_ANDAMENTO', async () => {
    const cid = await createCompany(CNPJ_TERMINAL);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(
      cid,
      eid,
      10,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      {},
      'enviado',
    );
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 1,
      respostas: respostasBloco(1),
    });
    expect(res.status).toBe(409);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_NAO_EM_ANDAMENTO);
  });
});

// ============================================================
// 5) Save canonico + merge + avanco
// ============================================================

describe('POST /api/portal/save-profile-block — save canonico', () => {
  it('primeiro save do bloco 1 avanca blocoAtual para 2 e faz merge', async () => {
    const cid = await createCompany(CNPJ_SAVE_OK);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 1,
      respostas: respostasBloco(1, 3),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveProfileBlockSuccess;
    expect(body.blocoAtual).toBe(2);
    expect(body.blocosCompletos).toEqual([1]);
    expect(body.totalBlocos).toBe(10);

    // Confirma persistencia canonica.
    const [row] = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, aid))
      .limit(1);
    expect(row!.blocoAtual).toBe(2);
    expect(row!.blocosCompletos).toEqual([1]);
    // Merge preservou canonicamente.
    const persistidas = row!.respostas as Record<string, unknown>;
    expect(persistidas[itemKey(1)]).toBe(3);
    expect(persistidas[itemKey(8)]).toBe(3);
  });
});

// ============================================================
// 6) Regra de volta canonica
// ============================================================

describe('POST /api/portal/save-profile-block — regra de volta canonica', () => {
  it('bloco ja completo + blocoAtual=bloco+1 -> 200 (edicao canonica)', async () => {
    const cid = await createCompany(CNPJ_VOLTA_OK);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid, 2, [1], respostasBloco(1, 3));
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 1,
      respostas: respostasBloco(1, 4),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveProfileBlockSuccess;
    expect(body.blocoAtual).toBe(2);
    expect(body.blocosCompletos).toEqual([1]);
  });

  it('bloco ja completo + blocoAtual > bloco+1 -> 409 MSG_BLOCO_JA_COMPLETO_TRAVADO', async () => {
    const cid = await createCompany(CNPJ_VOLTA_KO);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid, 5, [1, 2, 3, 4], {});
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSaveBlock({
      portalToken: token,
      assessmentId: aid,
      bloco: 1,
      respostas: respostasBloco(1, 4),
    });
    expect(res.status).toBe(409);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BLOCO_JA_COMPLETO_TRAVADO);
  });
});

// ============================================================
// 7) Helpers puros
// ============================================================

describe('save-profile-block — helpers puros', () => {
  it('itensDoBloco canonico: 1 -> [1..8], 10 -> [73..80]', () => {
    expect(itensDoBloco(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(itensDoBloco(10)).toEqual([73, 74, 75, 76, 77, 78, 79, 80]);
  });

  it('bloqueEstaCompleto detecta ausencias', () => {
    const completo: Record<string, unknown> = {};
    for (const i of itensDoBloco(1)) completo[itemKey(i)] = 3;
    expect(bloqueEstaCompleto(1, completo)).toBe(true);
    delete completo[itemKey(5)];
    expect(bloqueEstaCompleto(1, completo)).toBe(false);
  });
});
