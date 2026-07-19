// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/save-instrument-d` (ME-046, §8.8 primeira linha).
//
// Contra MySQL real (`roip_test`, S008). Padrao S036 herdado da
// ME-023/ME-039: chama a funcao `POST` diretamente com `new
// Request(...)`, injeta `RoipDbClient` via
// `__setPortalSaveInstrumentDDbClient`, relogio via
// `__setPortalSaveInstrumentDNow` e motor IQL via
// `__setPortalSaveInstrumentDIqlEngine`. Cobre:
//   - Body malformado / token ausente / invalido / expirado.
//   - §8.6 Bloqueio 3: token de C-level -> 403
//     MSG_CLEVEL_NAO_RESPONDE_D_B3.
//   - Guard cruzado companyId (§2.4) -> 403 MSG_COMPANY_MISMATCH_D.
//   - Employee inativo -> 403 MSG_EMPLOYEE_INATIVO_D.
//   - Validacao Zod SEMESTRAL (S156): Q2/Q4 -> 400 body malformado
//     (rejeitado pelo TRIMESTRE_SCHEMA_INSTRUMENT_D).
//   - Grid incompleto -> 400 MSG_ITENS_INCOMPLETOS_D.
//   - Sem vinculo canonico no snapshot dia 16 (§8.3, S150) -> 403
//     MSG_SEM_VINCULO_SNAPSHOT_D.
//   - Duplicidade (§8.2 imutavel apos gravado) -> 409
//     MSG_JA_RESPONDIDO_D.
//   - Primeiro envio: INSERT transacional dos 20 itens em
//     `instrumentD_responses` + hook do motor IQL (S157).
//   - Hook motor DI (S152): mock substituivel via setter.
//
// L32 cleanup em afterAll. CNPJs faixa 10000000000830..832
// reservada (S151 — ME-046 portal-save-d).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentD_responses,
  iqlData,
} from '../../src/db/schema';
import { signPortalToken } from '../../src/server/auth/portalToken';
import {
  MSG_CLEVEL_NAO_RESPONDE_D_B3,
  MSG_COMPANY_MISMATCH_D,
  MSG_EMPLOYEE_INATIVO_D,
  MSG_ITENS_INCOMPLETOS_D,
  MSG_JA_RESPONDIDO_D,
  MSG_SEM_VINCULO_SNAPSHOT_D,
  NUM_ITENS_TOTAL_D,
} from '../../src/server/routers/instrumentD';
import {
  DEFAULT_IQL_ENGINE,
  type IqlCalculationResult,
  type IqlEngineFacade,
} from '../../src/server/services/iqlCalculationEngine';
import {
  __setPortalSaveInstrumentDDbClient,
  __setPortalSaveInstrumentDIqlEngine,
  __setPortalSaveInstrumentDNow,
  MSG_BODY_MALFORMED,
  MSG_EXPIRED_TOKEN,
  MSG_INVALID_TOKEN,
  MSG_MISSING_TOKEN,
  POST as saveInstrumentDPOST,
  type SaveInstrumentDSuccess,
} from '../../src/app/api/portal/save-instrument-d/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me046-portal-save-D';
process.env.DATABASE_URL = TEST_URL;

const HASH_D = 'hash-fixo-me046-portal-D';

// CNPJs canonicos (S151 — faixa 830..832 reservada para ME-046
// Route Handler save-instrument-d).
const CNPJ_TOKEN = '10000000000830';
const CNPJ_CENARIO = '10000000000831';
const CNPJ_CROSS = '10000000000832';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

// `now` fixo canonico dentro do trimestre 2024-Q1 (dia 16 do ultimo
// mes do Q1 = 2024-03-16). Post-abertura para permitir save.
const NOW_APOS_DIA16 = new Date('2024-03-20T12:00:00Z');

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalSaveInstrumentDDbClient(client);
});

afterAll(async () => {
  __setPortalSaveInstrumentDDbClient(null);
  __setPortalSaveInstrumentDNow(null);
  __setPortalSaveInstrumentDIqlEngine(null);
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db.delete(iqlData).where(inArray(iqlData.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentD_responses)
      .where(inArray(instrumentD_responses.companyId, createdCompanyIds));
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
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string, status: 'ativa' | 'inativa' = 'ativa'): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME046 Portal ${cnpj} LTDA`,
      nomeFantasia: `ME046 Portal ${cnpj}`,
      cnpj,
      telefone: '1633330046',
      endereco: `Rua ME-046 Portal, ${cnpj}`,
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
      status,
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 46200000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(
  companyId: number,
  status: 'ativo' | 'inativo' = 'ativo',
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME046 Portal',
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
      status,
      isLider: false,
      isRH: false,
      passwordHash: HASH_D,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createLider(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Lider ME046 Portal',
      cpf: nextCpf(),
      email: `lider-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cbo: '111111',
      descricaoCBO: 'Gerente',
      jobFamily: 'vendas_comercial',
      senioridade: 'senior',
      nivelHierarquico: 'tatico',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: true,
      isRH: false,
      passwordHash: HASH_D,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: 'C-Level ME046 Portal',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Direção',
      departamento: 'Comercial',
      custoMensal: '30000.00',
      status: 'ativo',
      passwordHash: HASH_D,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

let batchCounter = 0;
function nextBatchId(): string {
  batchCounter += 1;
  const seq = String(batchCounter).padStart(6, '0');
  return `00000000-0000-0000-0000-me046P${seq}`.substring(0, 36).padEnd(36, '0');
}

async function linkLeaderCanonico(
  employeeId: number,
  opts: { liderId?: number; clevelId?: number; dataInicio?: Date },
): Promise<void> {
  await client.db.insert(employeeLeaderHistory).values({
    employeeId,
    liderId: opts.liderId ?? null,
    clevelId: opts.clevelId ?? null,
    dataInicio: opts.dataInicio ?? new Date('2023-01-01'),
    dataFim: null,
    reason: 'Fixture ME-046 portal-save-d',
    transferBatchId: nextBatchId(),
  });
}

/** Grid canonico completo: 4 dimensoes x 5 itens x valor default 3. */
function gridCanonicoD(valorDefault: number = 3) {
  const respostas: { dimensao: number; itemIndex: number; valor: number }[] = [];
  for (let d = 1; d <= 4; d++) {
    for (let i = 1; i <= 5; i++) {
      respostas.push({ dimensao: d, itemIndex: i, valor: valorDefault });
    }
  }
  return respostas;
}

async function callSave(body: unknown) {
  const req = new Request('http://localhost/api/portal/save-instrument-d', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await saveInstrumentDPOST(req);
}

async function callSaveRaw(rawBody: string) {
  const req = new Request('http://localhost/api/portal/save-instrument-d', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });
  return await saveInstrumentDPOST(req);
}

beforeEach(() => {
  __setPortalSaveInstrumentDNow(() => NOW_APOS_DIA16);
  __setPortalSaveInstrumentDIqlEngine(DEFAULT_IQL_ENGINE);
});

// ============================================================
// 1) Token e body
// ============================================================

describe('POST /api/portal/save-instrument-d — token e body', () => {
  let companyId: number;
  let respondenteId: number;
  let liderId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TOKEN);
    liderId = await createLider(companyId);
    respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { liderId, dataInicio: new Date('2023-01-01') });
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
  });

  it('body nao-JSON -> 400 MSG_BODY_MALFORMED', async () => {
    const res = await callSaveRaw('nao_e_json');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_BODY_MALFORMED);
  });

  it('portalToken ausente no body -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSave({ trimestre: '2024-Q1', respostas: gridCanonicoD() });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('portalToken vazio -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSave({
      portalToken: '',
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('portalToken invalido -> 401 MSG_INVALID_TOKEN', async () => {
    const res = await callSave({
      portalToken: 'assinatura.falsa.aqui',
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_INVALID_TOKEN);
  });

  it('portalToken de outra assinatura -> 401 MSG_INVALID_TOKEN', async () => {
    // Assina com JWT_SECRET diferente e depois volta.
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'outro-secret-diferente';
    const tokenOutro = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    process.env.JWT_SECRET = originalSecret;
    const res = await callSave({
      portalToken: tokenOutro,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_INVALID_TOKEN);
  });

  it('token valido + body sem trimestre -> 400 MSG_BODY_MALFORMED', async () => {
    const res = await callSave({
      portalToken: validToken,
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_BODY_MALFORMED);
  });

  it('MSG_EXPIRED_TOKEN e distinto de MSG_INVALID_TOKEN', () => {
    // Assertividade da constante (RV-13).
    expect(MSG_EXPIRED_TOKEN).toBe('Sessão expirada. Faça a identificação novamente.');
    expect(MSG_INVALID_TOKEN).toBe('Sessão inválida. Faça a identificação novamente.');
    expect(MSG_EXPIRED_TOKEN).not.toBe(MSG_INVALID_TOKEN);
  });
});

// ============================================================
// 2) Bloqueio 3 (§8.6): C-level nunca responde D
// ============================================================

describe('POST /api/portal/save-instrument-d — Bloqueio 3 C-level', () => {
  let companyId: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CENARIO);
    clevelId = await createClevel(companyId);
  });

  it('token com titularType=clevel -> 403 MSG_CLEVEL_NAO_RESPONDE_D_B3', async () => {
    const token = await signPortalToken({
      companyId,
      titularType: 'clevel',
      titularId: clevelId,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_CLEVEL_NAO_RESPONDE_D_B3);
  });
});

// ============================================================
// 3) Cenarios canonicos de save (snapshot §8.3, S156, duplicidade)
// ============================================================

describe('POST /api/portal/save-instrument-d — cenarios canonicos', () => {
  it('S156: trimestre Q2 -> 400 MSG_BODY_MALFORMED (rejeita pelo Zod)', async () => {
    const companyId = await createCompany('10000000000842');
    const liderId = await createLider(companyId);
    const respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { liderId });
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q2',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_BODY_MALFORMED);
  });

  it('grid incompleto (19 itens) -> 400 MSG_ITENS_INCOMPLETOS_D', async () => {
    const companyId = await createCompany('10000000000843');
    const liderId = await createLider(companyId);
    const respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { liderId });
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    const respostasIncompletas = gridCanonicoD().slice(0, 19);
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: respostasIncompletas,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ITENS_INCOMPLETOS_D);
  });

  it('valor fora de range (5) -> 400 MSG_ITENS_INCOMPLETOS_D', async () => {
    const companyId = await createCompany('10000000000844');
    const liderId = await createLider(companyId);
    const respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { liderId });
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    const respostas = gridCanonicoD();
    respostas[0] = { dimensao: 1, itemIndex: 1, valor: 5 };
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ITENS_INCOMPLETOS_D);
  });

  it('company mismatch -> 403 MSG_COMPANY_MISMATCH_D', async () => {
    const companyIdA = await createCompany(CNPJ_CROSS);
    const companyIdB = await createCompany('10000000000845');
    const respondente = await createEmployee(companyIdA); // pertence A
    const token = await signPortalToken({
      companyId: companyIdB, // token diz B
      titularType: 'employee',
      titularId: respondente,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_COMPANY_MISMATCH_D);
  });

  it('employee inativo -> 403 MSG_EMPLOYEE_INATIVO_D', async () => {
    const companyId = await createCompany('10000000000851');
    const inativo = await createEmployee(companyId, 'inativo');
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: inativo,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_EMPLOYEE_INATIVO_D);
  });

  it('sem vinculo dia 16 -> 403 MSG_SEM_VINCULO_SNAPSHOT_D', async () => {
    const companyId = await createCompany('10000000000852');
    const respondente = await createEmployee(companyId);
    // Sem linkLeader — respondente orfao no snapshot.
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondente,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_SEM_VINCULO_SNAPSHOT_D);
  });

  it('vinculo iniciado APOS dia 16 -> 403 MSG_SEM_VINCULO_SNAPSHOT_D', async () => {
    const companyId = await createCompany('10000000000853');
    const lider = await createLider(companyId);
    const respondente = await createEmployee(companyId);
    // Vinculo iniciado no dia 20/mar — depois do dia 16 do Q1.
    await linkLeaderCanonico(respondente, {
      liderId: lider,
      dataInicio: new Date('2024-03-20'),
    });
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondente,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_SEM_VINCULO_SNAPSHOT_D);
  });

  it('primeiro envio: INSERT dos 20 itens + hook motor IQL executa', async () => {
    const companyId = await createCompany('10000000000854');
    const liderId = await createLider(companyId);
    const respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { liderId });

    // Substitui motor por spy.
    let motorCalled = 0;
    let motorInput: {
      companyId: number;
      avaliadoId: number;
      trimestre: string;
    } | null = null;
    const spy: IqlEngineFacade = {
      recalculateForLeader: async (
        _db,
        _companyId,
        _liderId,
        _trim,
        _n,
      ): Promise<IqlCalculationResult> => {
        motorCalled += 1;
        motorInput = { companyId: _companyId, avaliadoId: _liderId, trimestre: _trim };
        return {
          companyId: _companyId,
          avaliadoTipo: 'employee',
          avaliadoId: _liderId,
          trimestre: _trim,
          scoreDirecionamentoClareza: null,
          scoreDesenvolvimentoApoio: null,
          scoreRelacionamentoConfianca: null,
          scoreGestaoResultados: null,
          iql: null,
          countRespondentes: 0,
          countRespondentesElegiveis: 0,
          calculadoEm: _n,
        };
      },
      recalculateForClevel: async () => {
        throw new Error('nao deveria ser chamado');
      },
    };
    __setPortalSaveInstrumentDIqlEngine(spy);

    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(4),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveInstrumentDSuccess;
    expect(body.itensGravados).toBe(NUM_ITENS_TOTAL_D);
    expect(body.operacao).toBe('insert');
    expect(body.avaliadoTipo).toBe('employee');
    expect(body.avaliadoId).toBe(liderId);
    // Verifica INSERT atomico dos 20 itens.
    const persistidos = await client.db
      .select()
      .from(instrumentD_responses)
      .where(
        and(
          eq(instrumentD_responses.respondenteId, respondenteId),
          eq(instrumentD_responses.trimestre, '2024-Q1'),
        ),
      );
    expect(persistidos.length).toBe(20);
    // Hook motor IQL executado exatamente uma vez com input correto.
    expect(motorCalled).toBe(1);
    expect(motorInput).toEqual({
      companyId,
      avaliadoId: liderId,
      trimestre: '2024-Q1',
    });
  });

  it('duplicidade: segundo submit -> 409 MSG_JA_RESPONDIDO_D', async () => {
    const companyId = await createCompany('10000000000855');
    const liderId = await createLider(companyId);
    const respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { liderId });
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    // Primeiro envio (motor default no-op — nao precisa executar o
    // motor real; usa spy silencioso).
    const spy: IqlEngineFacade = {
      recalculateForLeader: async (_db, cid, aid, trim, n) => ({
        companyId: cid,
        avaliadoTipo: 'employee',
        avaliadoId: aid,
        trimestre: trim,
        scoreDirecionamentoClareza: null,
        scoreDesenvolvimentoApoio: null,
        scoreRelacionamentoConfianca: null,
        scoreGestaoResultados: null,
        iql: null,
        countRespondentes: 0,
        countRespondentesElegiveis: 0,
        calculadoEm: n,
      }),
      recalculateForClevel: async () => {
        throw new Error('nao chamado');
      },
    };
    __setPortalSaveInstrumentDIqlEngine(spy);
    const res1 = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(3),
    });
    expect(res1.status).toBe(200);
    // Segundo envio -> 409.
    const res2 = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(4),
    });
    expect(res2.status).toBe(409);
    const body2 = (await res2.json()) as { msg: string };
    expect(body2.msg).toBe(MSG_JA_RESPONDIDO_D);
  });

  it('resposta valida para C-level como avaliado (via clevelId snapshot)', async () => {
    const companyId = await createCompany('10000000000856');
    const clevelId = await createClevel(companyId);
    const respondenteId = await createEmployee(companyId);
    await linkLeaderCanonico(respondenteId, { clevelId });
    let motorClevelCalled = 0;
    const spy: IqlEngineFacade = {
      recalculateForLeader: async () => {
        throw new Error('nao deveria ser chamado');
      },
      recalculateForClevel: async (_db, cid, aid, trim, n) => {
        motorClevelCalled += 1;
        return {
          companyId: cid,
          avaliadoTipo: 'clevel',
          avaliadoId: aid,
          trimestre: trim,
          scoreDirecionamentoClareza: null,
          scoreDesenvolvimentoApoio: null,
          scoreRelacionamentoConfianca: null,
          scoreGestaoResultados: null,
          iql: null,
          countRespondentes: 0,
          countRespondentesElegiveis: 0,
          calculadoEm: n,
        };
      },
    };
    __setPortalSaveInstrumentDIqlEngine(spy);
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: respondenteId,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonicoD(3),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveInstrumentDSuccess;
    expect(body.avaliadoTipo).toBe('clevel');
    expect(body.avaliadoId).toBe(clevelId);
    expect(motorClevelCalled).toBe(1);
  });
});
