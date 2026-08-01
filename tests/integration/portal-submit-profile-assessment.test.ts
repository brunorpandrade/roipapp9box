// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/submit-profile-assessment` (ME-049a; §10.13).
//
// Contra MySQL real. Cobre:
//   - Body malformado / token ausente / invalido.
//   - Guard cruzado companyId/titular -> 403.
//   - Assessment inexistente -> 404.
//   - Assessment ja `enviado` -> 409 MSG_ASSESSMENT_JA_ENVIADA.
//   - Completude: menos de 10 blocos ou menos de 80 itens -> 400.
//   - Fluxo consistente: chama motor via Facade DI, retorna corpo
//     tipado com motivo=`consistente`, status=`enviado`, 5 indices.
//   - Fluxo inconsistente: motivo=`inconsistente_baixa_confiabilidade`,
//     status=`inconsistente`.
//   - Facade DI: spy substitui o motor com
//     `__setPortalSubmitProfileAssessmentEngine`.
//   - Helpers puros `todosOs80Presentes` e
//     `todosOs10BlocosConcluidos`.
//
// CNPJs faixa 940..949 (S199 auxiliar).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
} from '../../src/db/schema';
import { signPortalToken } from '../../src/server/auth/portalToken';
import {
  DEFAULT_INDIVIDUAL_PROFILE_ENGINE,
  itemKey,
  NUM_ITENS_TOTAL,
  type IndividualProfileEngineFacade,
} from '../../src/server/services/individualProfileEngine';
import {
  __setPortalSubmitProfileAssessmentDbClient,
  __setPortalSubmitProfileAssessmentEngine,
  __setPortalSubmitProfileAssessmentNow,
  MSG_ASSESSMENT_INCOMPLETO,
  MSG_ASSESSMENT_JA_ENVIADA,
  MSG_ASSESSMENT_NAO_ENCONTRADO,
  MSG_ASSESSMENT_TITULAR_MISMATCH,
  MSG_BODY_MALFORMED,
  MSG_INVALID_TOKEN,
  MSG_MISSING_TOKEN,
  POST as submitPOST,
  todosOs10BlocosConcluidos,
  todosOs80Presentes,
  type SubmitProfileAssessmentSuccess,
} from '../../src/app/api/portal/submit-profile-assessment/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049a-portal-submit';
process.env.DATABASE_URL = TEST_URL;

const HASH = 'hash-fixo-me049a-submit';
const NOW = new Date('2026-07-20T12:00:00Z');

const CNPJ_TOKEN = '10000000000940';
const CNPJ_MISMATCH = '10000000000941';
const CNPJ_TERMINAL = '10000000000942';
const CNPJ_INCOMPLETO = '10000000000943';
const CNPJ_CONSISTENTE = '10000000000944';
const CNPJ_INCONS = '10000000000945';
const CNPJ_FACADE = '10000000000946';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalSubmitProfileAssessmentDbClient(client);
  __setPortalSubmitProfileAssessmentNow(() => NOW);
});

afterAll(async () => {
  __setPortalSubmitProfileAssessmentDbClient(null);
  __setPortalSubmitProfileAssessmentNow(null);
  __setPortalSubmitProfileAssessmentEngine(null);
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(individualProfileScores)
      .where(inArray(individualProfileScores.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049a SUB ${cnpj} LTDA`,
      nomeFantasia: `ME049a SUB ${cnpj}`,
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

let cpfCounter = 49300000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME049a SUB',
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

async function createPlaceholder(companyId: number, employeeId: number): Promise<number> {
  const [row] = await client.db
    .insert(individualProfilePlaceholders)
    .values({ companyId, userType: 'employee', userId: employeeId, status: 'pendente' })
    .$returningId();
  return row!.id;
}

function respostasBase(): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const efs = new Set<number>([3, 8, 13, 19, 28, 30, 34, 45, 49, 58, 64, 73]);
  const cns = new Set<number>([
    4, 11, 15, 16, 22, 26, 33, 36, 42, 46, 48, 51, 56, 60, 62, 66, 72, 76,
  ]);
  for (let i = 1; i <= NUM_ITENS_TOTAL; i += 1) {
    if (i === 18) {
      out[itemKey(i)] = 2;
      continue;
    }
    if (i === 80) {
      out[itemKey(i)] = 1;
      continue;
    }
    if (efs.has(i)) {
      out[itemKey(i)] = 'A';
      continue;
    }
    if (cns.has(i)) {
      out[itemKey(i)] = 'B';
      continue;
    }
    out[itemKey(i)] = 3;
  }
  return out;
}

async function createAssessment(
  companyId: number,
  employeeId: number,
  respostas: Record<string, string | number>,
  blocosCompletos: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  status: 'em_andamento' | 'enviado' = 'em_andamento',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      tentativa: 1,
      status,
      blocoAtual: 10,
      blocosCompletos,
      respostas,
    })
    .$returningId();
  return row!.id;
}

async function callSubmit(body: unknown) {
  const req = new Request('http://localhost/api/portal/submit-profile-assessment', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await submitPOST(req);
}

// ============================================================
// 1) Falhas token/body
// ============================================================

describe('POST /api/portal/submit-profile-assessment — falhas canonicas', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_TOKEN);
  });

  it('token ausente -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSubmit({ assessmentId: 1 });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('token invalido -> 401 MSG_INVALID_TOKEN', async () => {
    const res = await callSubmit({ portalToken: 'xxx', assessmentId: 1 });
    expect(res.status).toBe(401);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_INVALID_TOKEN);
  });

  it('assessmentId ausente/invalido -> 400 MSG_BODY_MALFORMED', async () => {
    const cid = await createCompany('10000000000947');
    const eid = await createEmployee(cid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: 'xxx' });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_BODY_MALFORMED);
  });
});

// ============================================================
// 2) Guard cruzado + assessment inexistente + terminal
// ============================================================

describe('POST /api/portal/submit-profile-assessment — guard e status', () => {
  it('assessment inexistente -> 404', async () => {
    const cid = await createCompany('10000000000948');
    const eid = await createEmployee(cid);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: 999999999 });
    expect(res.status).toBe(404);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_NAO_ENCONTRADO);
  });

  it('assessment de outro titular -> 403 MSG_ASSESSMENT_TITULAR_MISMATCH', async () => {
    const cid = await createCompany(CNPJ_MISMATCH);
    const empA = await createEmployee(cid);
    const empB = await createEmployee(cid);
    await createPlaceholder(cid, empA);
    const aidA = await createAssessment(cid, empA, respostasBase());
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: empB,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: aidA });
    expect(res.status).toBe(403);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_TITULAR_MISMATCH);
  });

  it('assessment enviado -> 409 MSG_ASSESSMENT_JA_ENVIADA', async () => {
    const cid = await createCompany(CNPJ_TERMINAL);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(
      cid,
      eid,
      respostasBase(),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      'enviado',
    );
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: aid });
    expect(res.status).toBe(409);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_JA_ENVIADA);
  });
});

// ============================================================
// 3) Completude
// ============================================================

describe('POST /api/portal/submit-profile-assessment — completude', () => {
  it('blocos incompletos -> 400 MSG_ASSESSMENT_INCOMPLETO', async () => {
    const cid = await createCompany(CNPJ_INCOMPLETO);
    const eid = await createEmployee(cid);
    const aid = await createAssessment(cid, eid, respostasBase(), [1, 2, 3]);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: aid });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_INCOMPLETO);
  });

  it('respostas com menos de 80 itens -> 400 MSG_ASSESSMENT_INCOMPLETO', async () => {
    const cid = await createCompany('10000000000949');
    const eid = await createEmployee(cid);
    const parciais = respostasBase();
    delete parciais[itemKey(80)];
    const aid = await createAssessment(cid, eid, parciais);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: aid });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { msg: string };
    expect(b.msg).toBe(MSG_ASSESSMENT_INCOMPLETO);
  });
});

// ============================================================
// 4) Fluxo consistente
// ============================================================

describe('POST /api/portal/submit-profile-assessment — fluxo consistente', () => {
  it('respostas confiaveis -> 200 motivo=consistente + status=enviado', async () => {
    const cid = await createCompany(CNPJ_CONSISTENTE);
    const eid = await createEmployee(cid);
    await createPlaceholder(cid, eid);
    const aid = await createAssessment(cid, eid, respostasBase());
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: aid });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitProfileAssessmentSuccess;
    expect(body.motivo).toBe('consistente');
    expect(body.status).toBe('enviado');
    expect(body.confiabilidadeNivel).toBe('alta');
    expect(body.assessmentId).toBe(aid);
    expect(body.enviadoEm).toBe(NOW.toISOString());
  });
});

// ============================================================
// 5) Fluxo inconsistente
// ============================================================

describe('POST /api/portal/submit-profile-assessment — fluxo inconsistente', () => {
  it('confiabilidade baixa -> 200 motivo=inconsistente + status=inconsistente', async () => {
    const cid = await createCompany(CNPJ_INCONS);
    const eid = await createEmployee(cid);
    await createPlaceholder(cid, eid);
    const respostas = respostasBase();
    // Inconsistente forcado: 3 criticos.
    respostas.ITEM_018 = 5;
    respostas.ITEM_080 = 5;
    respostas.ITEM_025 = 5;
    respostas.ITEM_057 = 5;
    respostas.ITEM_009 = 5;
    respostas.ITEM_039 = 5;
    respostas.ITEM_075 = 5;
    const aid = await createAssessment(cid, eid, respostas);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const res = await callSubmit({ portalToken: token, assessmentId: aid });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitProfileAssessmentSuccess;
    expect(body.motivo).toBe('inconsistente_baixa_confiabilidade');
    expect(body.status).toBe('inconsistente');
    expect(body.confiabilidadeNivel).toBe('baixa');
  });
});

// ============================================================
// 6) Facade DI (S105)
// ============================================================

describe('POST /api/portal/submit-profile-assessment — Facade DI', () => {
  it('motor injetado substitui o default e e chamado uma vez', async () => {
    const cid = await createCompany(CNPJ_FACADE);
    const eid = await createEmployee(cid);
    await createPlaceholder(cid, eid);
    const aid = await createAssessment(cid, eid, respostasBase());

    let chamadas = 0;
    const spy: IndividualProfileEngineFacade = {
      runAssessment: async () => {
        chamadas += 1;
        return {
          assessmentId: aid,
          companyId: cid,
          userType: 'employee',
          userId: eid,
          tentativa: 1,
          motivo: 'consistente',
          confiabilidadeNivel: 'alta',
          ia_att: 2,
          ia_soc: 0,
          ia_acq: 0,
          ia_cons: 0,
          ia_ext: 0,
          status: 'enviado',
          calculadoEm: NOW,
          enviadoEm: NOW,
          exibirConfirmacaoAte: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000),
        };
      },
    };
    __setPortalSubmitProfileAssessmentEngine(spy);
    try {
      const token = await signPortalToken({
        companyId: cid,
        titularType: 'employee',
        titularId: eid,
      });
      const res = await callSubmit({ portalToken: token, assessmentId: aid });
      expect(res.status).toBe(200);
      expect(chamadas).toBe(1);
    } finally {
      __setPortalSubmitProfileAssessmentEngine(null);
    }
    // Confirma restauracao ao default (S105).
    expect(DEFAULT_INDIVIDUAL_PROFILE_ENGINE.runAssessment).toBeDefined();
  });
});

// ============================================================
// 7) Helpers puros
// ============================================================

describe('submit-profile-assessment — helpers puros', () => {
  it('todosOs80Presentes cobre 1..80', () => {
    const r: Record<string, unknown> = {};
    for (let i = 1; i <= NUM_ITENS_TOTAL; i += 1) r[itemKey(i)] = 3;
    expect(todosOs80Presentes(r)).toBe(true);
    delete r[itemKey(42)];
    expect(todosOs80Presentes(r)).toBe(false);
  });

  it('todosOs10BlocosConcluidos cobre 1..10', () => {
    expect(todosOs10BlocosConcluidos([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(true);
    expect(todosOs10BlocosConcluidos([1, 2, 3])).toBe(false);
  });
});
