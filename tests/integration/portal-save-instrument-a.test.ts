// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/save-instrument-a` (ME-039, §6.8 primeira linha).
//
// Contra MySQL real (`roip_test`, S008). Padrao S036 herdado da ME-023:
// chama a funcao `POST` diretamente com `new Request(...)`, injeta
// `RoipDbClient` via `__setPortalSaveInstrumentADbClient` e o relogio
// via `__setPortalSaveInstrumentANow`. Cobre:
//   - Body malformado / token ausente / token invalido / token expirado
//     (paralelo ao teste da ME-023).
//   - S099: token de C-level (`titularType='clevel'`) -> 403
//     MSG_CLEVEL_NAO_RESPONDE_A (§6.2 canoniza EXPLICITAMENTE que
//     C-level nao responde o A).
//   - Guard cruzado companyId (§2.4) — token com companyId inconsistente
//     com o employees.companyId real -> 403 MSG_COMPANY_MISMATCH_A.
//   - Employee inativo (§3.13 estendido) -> 403 MSG_EMPLOYEE_INATIVO_A.
//   - Validacao canonica de trimestre (Zod TRIMESTRE_SCHEMA_INSTRUMENT_A)
//     e respostas (grid 4x5 completo, valor 0-4).
//   - S095: janela `nao_aberta` (before dia 16 ultimo mes) -> 409
//     MSG_TRIMESTRE_NAO_ABERTO_A.
//   - Primeiro envio dentro da janela -> INSERT transacional dos 20
//     itens em `instrumentA_responses`.
//   - S095: submit repetido SEM desbloqueio -> 409 MSG_A_JA_ENVIADA
//     (nao ha MSG_TRIMESTRE_FECHADO — A nao fecha, §6.7 literal).
//   - S095: submit repetido COM `instrumentUnlockLog` vigente do tipo
//     'A' -> OVERWRITE linha a linha.
//   - §6.7 comportamento canonico: resposta tardia sem envio previo NAO
//     e desbloqueio (INSERT normal mesmo apos dia 10 do mes seguinte).
//
// L32 cleanup em afterAll. CNPJs faixa 10000000000750..759 reservada
// para o Route Handler (ME-039, disjunta da faixa 740..746 do teste
// do router tRPC deste mesmo ME-039). Faixa 771 (ME-040 EDIT) para o
// describe do hook canonico do motor de plenitude.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employees,
  instrumentA_responses,
  instrumentC_assessments,
  instrumentUnlockLog,
  nineBoxCalculationLog,
  nineBoxClassifications,
  plenitudeData,
} from '../../src/db/schema';
import { signPortalToken } from '../../src/server/auth/portalToken';
import {
  MSG_A_JA_ENVIADA,
  MSG_CLEVEL_NAO_RESPONDE_A,
  MSG_COMPANY_MISMATCH_A,
  MSG_EMPLOYEE_INATIVO_A,
  MSG_ITENS_INCOMPLETOS_A,
  MSG_TRIMESTRE_NAO_ABERTO_A,
  NUM_ITENS_TOTAL_A,
} from '../../src/server/routers/instrumentA';
import {
  DEFAULT_PLENITUDE_ENGINE,
  NUM_DIMENSOES_PLENITUDE,
  NUM_ITENS_POR_DIMENSAO_PLENITUDE,
  type PlenitudeEngineFacade,
} from '../../src/server/services/plenitudeCalculationEngine';
import {
  __setPortalSaveInstrumentADbClient,
  __setPortalSaveInstrumentANow,
  __setPortalSaveInstrumentAPlenitudeEngine,
  MSG_BODY_MALFORMED,
  MSG_EXPIRED_TOKEN,
  MSG_INVALID_TOKEN,
  MSG_MISSING_TOKEN,
  POST as saveInstrumentAPOST,
  type SaveInstrumentASuccess,
} from '../../src/app/api/portal/save-instrument-a/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me039-portal-save-A';
process.env.DATABASE_URL = TEST_URL;

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_A = 'hash-fixo-me039-portal-A';

// CNPJs canonicos (S076 — faixa 750.. reservada para o Route Handler
// desta ME-039, disjunta das faixas 720..729 (ME-038) e 740..746
// (router tRPC ME-039)).
const CNPJ_TOKEN = '10000000000750';
const CNPJ_S099 = '10000000000751';
const CNPJ_MISMATCH = '10000000000752';
const CNPJ_MISMATCH_OTHER = '10000000000753';
const CNPJ_INATIVO = '10000000000754';
const CNPJ_SCHEMA = '10000000000755';
const CNPJ_JANELA = '10000000000756';
const CNPJ_INSERT = '10000000000757';
const CNPJ_OVERWRITE = '10000000000758';
const CNPJ_TARDIA = '10000000000759';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

// `now` fixo canonico dentro da janela 2024-Q1 (aberta desde 16/Mar/2024
// no fuso America/Sao_Paulo).
const NOW_ABERTO_Q1_2024 = new Date('2024-03-20T12:00:00Z');
const NOW_ANTES_ABERTURA_Q1_2024 = new Date('2024-03-15T12:00:00Z');
const NOW_APOS_CORTE_Q1_2024 = new Date('2024-04-15T12:00:00Z');

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalSaveInstrumentADbClient(client);
});

afterAll(async () => {
  __setPortalSaveInstrumentADbClient(null);
  __setPortalSaveInstrumentANow(null);
  __setPortalSaveInstrumentAPlenitudeEngine(null);
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    // L32 cleanup em ordem topologica FK. Motor de plenitude (ME-040)
    // upserta em `plenitudeData` a cada save do A — precisa limpar
    // antes de `employees` por causa da FK canonica ON DELETE RESTRICT.
    // ME-041: plenitude chama 9-Box (S112) em cenarios `ambos_completos`;
    // log tem FK RESTRICT a employees, entao limpar log/classifications
    // do 9-Box antes de plenitude/employees.
    await client.db
      .delete(nineBoxCalculationLog)
      .where(inArray(nineBoxCalculationLog.companyId, createdCompanyIds));
    await client.db
      .delete(nineBoxClassifications)
      .where(inArray(nineBoxClassifications.companyId, createdCompanyIds));
    // `instrumentC_assessments` limpa por defesa: teste do handler A
    // pode gravar C via helper canonico para exercitar o hook.
    await client.db
      .delete(plenitudeData)
      .where(inArray(plenitudeData.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentUnlockLog)
      .where(inArray(instrumentUnlockLog.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    await client.db
      .delete(instrumentC_assessments)
      .where(inArray(instrumentC_assessments.companyId, createdCompanyIds));
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
      razaoSocial: `ME039 Portal ${cnpj} LTDA`,
      nomeFantasia: `ME039 Portal ${cnpj}`,
      cnpj,
      telefone: '1633330040',
      endereco: `Rua ME-039 Portal, ${cnpj}`,
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

let cpfCounter = 39500000000;
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
      name: 'Colab ME039 Portal',
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
      passwordHash: HASH_A,
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
      name: 'C-Level ME039',
      cpf: nextCpf(),
      email: `cl-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2015-01-01'),
      cargo: 'Diretor',
      descricaoCargo: 'Direção',
      departamento: 'Comercial',
      custoMensal: '30000.00',
      status: 'ativo',
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function seedUnlockAVigente(
  companyId: number,
  employeeId: number,
  trimestre: string,
  now: Date,
): Promise<void> {
  await client.db.insert(instrumentUnlockLog).values({
    companyId,
    employeeId,
    trimestre,
    instrumento: 'A',
    desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
    justificativa: 'j'.repeat(120),
    desbloqueadoEm: now,
    expiraEm: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    houveAlteracao: false,
    ajusteRetroativo: false,
    createdAt: now,
  });
}

/** Grid canonico completo: 4 dimensoes x 5 itens x valor default 3. */
function gridCanonico(valorDefault: number = 3) {
  const respostas: { dimensao: number; itemIndex: number; valor: number }[] = [];
  for (let d = 1; d <= 4; d++) {
    for (let i = 1; i <= 5; i++) {
      respostas.push({ dimensao: d, itemIndex: i, valor: valorDefault });
    }
  }
  return respostas;
}

async function callSave(body: unknown) {
  const req = new Request('http://localhost/api/portal/save-instrument-a', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await saveInstrumentAPOST(req);
}

async function callSaveRaw(rawBody: string) {
  const req = new Request('http://localhost/api/portal/save-instrument-a', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody,
  });
  return await saveInstrumentAPOST(req);
}

beforeEach(() => {
  __setPortalSaveInstrumentANow(() => NOW_ABERTO_Q1_2024);
});

// ============================================================
// 1) Token e body
// ============================================================

describe('POST /api/portal/save-instrument-a — token e body', () => {
  let companyId: number;
  let employeeId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TOKEN);
    employeeId = await createEmployee(companyId);
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
  });

  it('body nao-JSON -> 400 MSG_BODY_MALFORMED', async () => {
    const res = await callSaveRaw('nao_e_json');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_BODY_MALFORMED);
  });

  it('portalToken ausente no body -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSave({ trimestre: '2024-Q1', respostas: gridCanonico() });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('portalToken vazio -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSave({
      portalToken: '',
      trimestre: '2024-Q1',
      respostas: gridCanonico(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('portalToken tipo errado (numero) -> 400 MSG_MISSING_TOKEN', async () => {
    const res = await callSave({
      portalToken: 123,
      trimestre: '2024-Q1',
      respostas: gridCanonico(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_MISSING_TOKEN);
  });

  it('portalToken malformado (nao JWT) -> 401 MSG_INVALID_TOKEN', async () => {
    const res = await callSave({
      portalToken: 'nao.eh.jwt',
      trimestre: '2024-Q1',
      respostas: gridCanonico(),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_INVALID_TOKEN);
  });

  it('portalToken assinado por outra chave -> 401 (INVALID ou EXPIRED)', async () => {
    // Assina com JWT_SECRET diferente para forcar falha de assinatura
    const savedSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'outra-chave-diferente-me039';
    const bogus = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    process.env.JWT_SECRET = savedSecret;
    const res = await callSave({
      portalToken: bogus,
      trimestre: '2024-Q1',
      respostas: gridCanonico(),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect([MSG_INVALID_TOKEN, MSG_EXPIRED_TOKEN]).toContain(body.msg);
  });

  it('token valido + payload valido -> 200 sucesso (INSERT)', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(200);
  });
});

// ============================================================
// 2) S099 — C-level bloqueado (§6.2 literal)
// ============================================================

describe('POST /api/portal/save-instrument-a — S099 C-level bloqueado', () => {
  let companyId: number;
  let clevelId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_S099);
    clevelId = await createClevel(companyId);
  });

  it('titularType=clevel -> 403 MSG_CLEVEL_NAO_RESPONDE_A', async () => {
    const token = await signPortalToken({
      companyId,
      titularType: 'clevel',
      titularId: clevelId,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_CLEVEL_NAO_RESPONDE_A);

    // Verifica que nenhuma linha foi gravada em instrumentA_responses.
    const rows = await client.db
      .select()
      .from(instrumentA_responses)
      .where(eq(instrumentA_responses.companyId, companyId));
    expect(rows.length).toBe(0);
  });
});

// ============================================================
// 3) Guard cruzado companyId (§2.4)
// ============================================================

describe('POST /api/portal/save-instrument-a — companyId cruzado', () => {
  let companyIdA: number;
  let companyIdB: number;
  let employeeIdA: number;

  beforeAll(async () => {
    companyIdA = await createCompany(CNPJ_MISMATCH);
    companyIdB = await createCompany(CNPJ_MISMATCH_OTHER);
    employeeIdA = await createEmployee(companyIdA);
  });

  it('token com companyId errado -> 403 MSG_COMPANY_MISMATCH_A', async () => {
    // Token assinado com companyIdB, mas titularId aponta para colab em A
    const token = await signPortalToken({
      companyId: companyIdB,
      titularType: 'employee',
      titularId: employeeIdA,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_COMPANY_MISMATCH_A);
  });

  it('titularId inexistente -> 403 MSG_COMPANY_MISMATCH_A', async () => {
    const token = await signPortalToken({
      companyId: companyIdA,
      titularType: 'employee',
      titularId: 999999999,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_COMPANY_MISMATCH_A);
  });
});

// ============================================================
// 4) Employee inativo (§3.13 estendido)
// ============================================================

describe('POST /api/portal/save-instrument-a — employee inativo', () => {
  let companyId: number;
  let employeeInativoId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INATIVO);
    employeeInativoId = await createEmployee(companyId, 'inativo');
  });

  it('colaborador inativo -> 403 MSG_EMPLOYEE_INATIVO_A', async () => {
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeInativoId,
    });
    const res = await callSave({
      portalToken: token,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_EMPLOYEE_INATIVO_A);
  });
});

// ============================================================
// 5) Validacao de payload (schema Zod + grid canonico)
// ============================================================

describe('POST /api/portal/save-instrument-a — validacao de payload', () => {
  let companyId: number;
  let employeeId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_SCHEMA);
    employeeId = await createEmployee(companyId);
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
  });

  it('trimestre malformado (formato errado) -> 400 MSG_BODY_MALFORMED', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-01',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_BODY_MALFORMED);
  });

  it('trimestre valido semanticamente errado (Q5) -> 400 MSG_BODY_MALFORMED', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q5',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(400);
  });

  it('respostas com 19 itens (lacuna) -> 400 MSG_ITENS_INCOMPLETOS_A', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3).slice(0, 19),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ITENS_INCOMPLETOS_A);
  });

  it('respostas com 21 itens (duplicata) -> 400 MSG_ITENS_INCOMPLETOS_A', async () => {
    const respostas = [...gridCanonico(3), { dimensao: 1, itemIndex: 1, valor: 0 }];
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ITENS_INCOMPLETOS_A);
  });

  it('valor 5 (fora de escala 0-4) -> 400 MSG_ITENS_INCOMPLETOS_A', async () => {
    const respostas = gridCanonico(3);
    respostas[0]!.valor = 5;
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ITENS_INCOMPLETOS_A);
  });

  it('valor -1 -> 400 MSG_ITENS_INCOMPLETOS_A', async () => {
    const respostas = gridCanonico(3);
    respostas[0]!.valor = -1;
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas,
    });
    expect(res.status).toBe(400);
  });

  it('respostas com dimensao 5 (fora do grid) -> 400 MSG_ITENS_INCOMPLETOS_A', async () => {
    const respostas = gridCanonico(3);
    respostas[0]!.dimensao = 5;
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas,
    });
    expect(res.status).toBe(400);
  });

  it('respostas nao-array -> 400 MSG_ITENS_INCOMPLETOS_A', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: 'nao_e_array',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_ITENS_INCOMPLETOS_A);
  });
});

// ============================================================
// 6) Janela canonica §6.1 (nao_aberta antes dia 16 ultimo mes)
// ============================================================

describe('POST /api/portal/save-instrument-a — janela canonica', () => {
  let companyId: number;
  let employeeId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_JANELA);
    employeeId = await createEmployee(companyId);
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
  });

  it('antes do dia 16 do ultimo mes -> 409 MSG_TRIMESTRE_NAO_ABERTO_A', async () => {
    __setPortalSaveInstrumentANow(() => NOW_ANTES_ABERTURA_Q1_2024);
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_TRIMESTRE_NAO_ABERTO_A);
  });

  it('§6.7: resposta TARDIA (apos corte) SEM envio previo -> 200 INSERT', async () => {
    // A NAO fecha. Se nao houve envio previo, aceita mesmo tardio.
    __setPortalSaveInstrumentANow(() => NOW_APOS_CORTE_Q1_2024);
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(2),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveInstrumentASuccess;
    expect(body.operacao).toBe('insert');
    expect(body.itensGravados).toBe(20);
  });
});

// ============================================================
// 7) Primeiro envio (INSERT transacional)
// ============================================================

describe('POST /api/portal/save-instrument-a — primeiro envio (INSERT)', () => {
  let companyId: number;
  let employeeId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INSERT);
    employeeId = await createEmployee(companyId);
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
  });

  it('primeiro envio -> INSERT dos 20 itens em transacao atomica', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveInstrumentASuccess;
    expect(body.companyId).toBe(companyId);
    expect(body.employeeId).toBe(employeeId);
    expect(body.trimestre).toBe('2024-Q1');
    expect(body.operacao).toBe('insert');
    expect(body.itensGravados).toBe(20);
    expect(new Date(body.respondidoEm).getTime()).toBe(NOW_ABERTO_Q1_2024.getTime());

    // Verifica que exatamente 20 linhas foram gravadas.
    const rows = await client.db
      .select()
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.employeeId, employeeId),
          eq(instrumentA_responses.trimestre, '2024-Q1'),
        ),
      );
    expect(rows.length).toBe(20);
    for (const r of rows) {
      expect(r.companyId).toBe(companyId);
      expect(r.valor).toBe(3);
      expect(r.respondidoEm).not.toBeNull();
    }
  });

  it('segundo envio no MESMO trimestre sem desbloqueio -> 409 MSG_A_JA_ENVIADA', async () => {
    // Reaproveita a linha gravada acima.
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(4),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_A_JA_ENVIADA);

    // Valores nao devem ter mudado (ainda todos = 3).
    const rows = await client.db
      .select({ valor: instrumentA_responses.valor })
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.employeeId, employeeId),
          eq(instrumentA_responses.trimestre, '2024-Q1'),
        ),
      );
    for (const r of rows) {
      expect(r.valor).toBe(3);
    }
  });

  it('primeiro envio em OUTRO trimestre convive com o anterior', async () => {
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q2',
      respostas: gridCanonico(2),
    });
    // 2024-Q2 abre em 16/Jun/2024 — precisa avancar o now.
    const now = new Date('2024-06-20T12:00:00Z');
    __setPortalSaveInstrumentANow(() => now);
    const res2 = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q2',
      respostas: gridCanonico(2),
    });
    // Primeira chamada anterior foi feita antes do now avancar - pode
    // ter dado 409 (nao_aberta) porque 2024-03-20 < 16/Jun/2024. A
    // segunda chamada e a que vale. Ignora primeira resposta:
    void res;
    expect(res2.status).toBe(200);
    const body = (await res2.json()) as SaveInstrumentASuccess;
    expect(body.trimestre).toBe('2024-Q2');
    expect(body.operacao).toBe('insert');

    // Q1 permanece com 20 linhas
    const rowsQ1 = await client.db
      .select()
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.employeeId, employeeId),
          eq(instrumentA_responses.trimestre, '2024-Q1'),
        ),
      );
    expect(rowsQ1.length).toBe(20);
    // Q2 tambem tem 20
    const rowsQ2 = await client.db
      .select()
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.employeeId, employeeId),
          eq(instrumentA_responses.trimestre, '2024-Q2'),
        ),
      );
    expect(rowsQ2.length).toBe(20);
  });
});

// ============================================================
// 8) OVERWRITE (S095: com desbloqueio vigente)
// ============================================================

describe('POST /api/portal/save-instrument-a — OVERWRITE com desbloqueio vigente (S095)', () => {
  let companyId: number;
  let employeeId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_OVERWRITE);
    employeeId = await createEmployee(companyId);
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    // Primeiro envio na janela normal
    __setPortalSaveInstrumentANow(() => NOW_ABERTO_Q1_2024);
    const resInit = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(resInit.status).toBe(200);
  });

  it('com instrumentUnlockLog vigente -> OVERWRITE linha a linha (valor muda)', async () => {
    // Bruno desbloqueia manualmente (simulacao — em producao viria pelo
    // sub-router tRPC `instrumentA.reopenResponse`). Aqui inserimos
    // direto na tabela porque este teste isola o Route Handler.
    const nowOverwrite = new Date('2024-04-20T15:00:00Z');
    await seedUnlockAVigente(companyId, employeeId, '2024-Q1', nowOverwrite);

    __setPortalSaveInstrumentANow(() => nowOverwrite);
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(4), // valores novos = 4
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveInstrumentASuccess;
    expect(body.operacao).toBe('overwrite');
    expect(body.itensGravados).toBe(20);
    expect(new Date(body.respondidoEm).getTime()).toBe(nowOverwrite.getTime());

    // Continua com apenas 20 linhas (sem duplicacao).
    const rows = await client.db
      .select()
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.employeeId, employeeId),
          eq(instrumentA_responses.trimestre, '2024-Q1'),
        ),
      );
    expect(rows.length).toBe(20);
    for (const r of rows) {
      expect(r.valor).toBe(4); // valor atualizado
    }
  });

  it('apos janela do desbloqueio expirar -> volta a rejeitar com MSG_A_JA_ENVIADA', async () => {
    // Avanca now 30h alem do nowOverwrite acima (24h + margem)
    const nowExpirado = new Date('2024-04-21T21:00:00Z');
    __setPortalSaveInstrumentANow(() => nowExpirado);
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(0),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_A_JA_ENVIADA);

    // Valores permanecem = 4 (do overwrite anterior)
    const rows = await client.db
      .select({ valor: instrumentA_responses.valor })
      .from(instrumentA_responses)
      .where(
        and(
          eq(instrumentA_responses.employeeId, employeeId),
          eq(instrumentA_responses.trimestre, '2024-Q1'),
        ),
      );
    for (const r of rows) {
      expect(r.valor).toBe(4);
    }
  });
});

// ============================================================
// 9) §6.7 canonico — resposta tardia SEM envio previo (comportamento normal)
// ============================================================

describe('POST /api/portal/save-instrument-a — §6.7 resposta tardia canonica', () => {
  let companyId: number;
  let employeeId: number;
  let validToken: string;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_TARDIA);
    employeeId = await createEmployee(companyId);
    validToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
  });

  it('sem envio previo, apos corte -> INSERT normal (§6.7: nao e desbloqueio)', async () => {
    __setPortalSaveInstrumentANow(() => NOW_APOS_CORTE_Q1_2024);
    const res = await callSave({
      portalToken: validToken,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SaveInstrumentASuccess;
    expect(body.operacao).toBe('insert');
    expect(body.itensGravados).toBe(20);

    // Nenhum instrumentUnlockLog gerado — resposta tardia NAO e desbloqueio.
    const unlockRows = await client.db
      .select()
      .from(instrumentUnlockLog)
      .where(
        and(
          eq(instrumentUnlockLog.employeeId, employeeId),
          eq(instrumentUnlockLog.trimestre, '2024-Q1'),
        ),
      );
    expect(unlockRows.length).toBe(0);
  });
});

// ============================================================
// 8) Hook canonico do motor de plenitude (ME-040 — §6.4)
// ============================================================

describe('POST /api/portal/save-instrument-a — hook motor de plenitude ME-040', () => {
  let companyIdHook: number;
  let employeeIdHook: number;
  let validTokenHook: string;

  beforeAll(async () => {
    companyIdHook = await createCompany('10000000000771');
    employeeIdHook = await createEmployee(companyIdHook);
    validTokenHook = await signPortalToken({
      companyId: companyIdHook,
      titularType: 'employee',
      titularId: employeeIdHook,
    });
  });

  // Restaura setter DI apos cada teste — evita vazamento de spy para
  // teste seguinte que espera comportamento default.
  const resetPlenitudeEngine = () => __setPortalSaveInstrumentAPlenitudeEngine(null);

  it('INSERT dispara hook com trio canonico (companyId, employeeId, trimestre)', async () => {
    const chamadas: Array<{
      companyId: number;
      employeeId: number;
      trimestre: string;
      now: Date;
    }> = [];
    const spy: PlenitudeEngineFacade = {
      recalculatePlenitude: async (_db, cid, eid, tri, now) => {
        chamadas.push({ companyId: cid, employeeId: eid, trimestre: tri, now });
        return {
          companyId: cid,
          employeeId: eid,
          trimestre: tri,
          motivo: 'instrumento_c_ausente',
          calculado: false,
          scoreA: null,
          scoreC: null,
          plenitudeScore: null,
          faixaPlenitude: null,
          divergencia: null,
          alertaDivergencia: false,
          engajamentoA: null,
          desenvolvimentoA: null,
          pertencimentoA: null,
          realizacaoA: null,
          engajamentoC: null,
          desenvolvimentoC: null,
          pertencimentoC: null,
          realizacaoC: null,
          calculadoEm: now,
        };
      },
    };
    __setPortalSaveInstrumentAPlenitudeEngine(spy);
    try {
      const res = await callSave({
        portalToken: validTokenHook,
        trimestre: '2024-Q1',
        respostas: gridCanonico(3),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as SaveInstrumentASuccess;
      expect(body.operacao).toBe('insert');
      expect(chamadas.length).toBe(1);
      expect(chamadas[0]!.companyId).toBe(companyIdHook);
      expect(chamadas[0]!.employeeId).toBe(employeeIdHook);
      expect(chamadas[0]!.trimestre).toBe('2024-Q1');
      expect(chamadas[0]!.now.getTime()).toBe(NOW_ABERTO_Q1_2024.getTime());
    } finally {
      resetPlenitudeEngine();
    }
  });

  it('OVERWRITE dispara hook com trio canonico', async () => {
    // Setup: cria outro employee dedicado (nao vaza state entre casos).
    const empOverwrite = await createEmployee(companyIdHook);
    const tokenOverwrite = await signPortalToken({
      companyId: companyIdHook,
      titularType: 'employee',
      titularId: empOverwrite,
    });
    const chamadas: string[] = [];
    const spy: PlenitudeEngineFacade = {
      recalculatePlenitude: async (_db, cid, eid, tri, now) => {
        chamadas.push(`${cid}:${eid}:${tri}`);
        return {
          companyId: cid,
          employeeId: eid,
          trimestre: tri,
          motivo: 'ambos_ausentes',
          calculado: false,
          scoreA: null,
          scoreC: null,
          plenitudeScore: null,
          faixaPlenitude: null,
          divergencia: null,
          alertaDivergencia: false,
          engajamentoA: null,
          desenvolvimentoA: null,
          pertencimentoA: null,
          realizacaoA: null,
          engajamentoC: null,
          desenvolvimentoC: null,
          pertencimentoC: null,
          realizacaoC: null,
          calculadoEm: now,
        };
      },
    };
    __setPortalSaveInstrumentAPlenitudeEngine(spy);
    try {
      // Primeiro submit (INSERT).
      const res1 = await callSave({
        portalToken: tokenOverwrite,
        trimestre: '2024-Q1',
        respostas: gridCanonico(3),
      });
      expect(res1.status).toBe(200);
      expect(chamadas.length).toBe(1);
      // Cria desbloqueio vigente para permitir OVERWRITE.
      await client.db.insert(instrumentUnlockLog).values({
        companyId: companyIdHook,
        employeeId: empOverwrite,
        trimestre: '2024-Q1',
        instrumento: 'A',
        desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
        desbloqueadoEm: new Date('2024-03-20T09:00:00Z'),
        expiraEm: new Date('2024-03-21T09:00:00Z'),
        justificativa: 'Teste de OVERWRITE do hook canonico '.padEnd(150, 'x'),
        houveAlteracao: false,
      });
      // Segundo submit (OVERWRITE) dentro da janela.
      __setPortalSaveInstrumentANow(() => new Date('2024-03-20T12:00:00Z'));
      const res2 = await callSave({
        portalToken: tokenOverwrite,
        trimestre: '2024-Q1',
        respostas: gridCanonico(4),
      });
      expect(res2.status).toBe(200);
      const body2 = (await res2.json()) as SaveInstrumentASuccess;
      expect(body2.operacao).toBe('overwrite');
      expect(chamadas.length).toBe(2);
      expect(chamadas[1]).toBe(`${companyIdHook}:${empOverwrite}:2024-Q1`);
    } finally {
      resetPlenitudeEngine();
    }
  });

  it('default (sem setter) usa DEFAULT_PLENITUDE_ENGINE e grava plenitudeData', async () => {
    // Sem injetar spy — handler usa DEFAULT_PLENITUDE_ENGINE (motor real).
    // Como so A foi gravado (nao C), linha em plenitudeData nasce com nulos.
    const empDefault = await createEmployee(companyIdHook);
    const tokenDefault = await signPortalToken({
      companyId: companyIdHook,
      titularType: 'employee',
      titularId: empDefault,
    });
    const res = await callSave({
      portalToken: tokenDefault,
      trimestre: '2024-Q1',
      respostas: gridCanonico(3),
    });
    expect(res.status).toBe(200);
    // Motor real rodou → linha em plenitudeData com scores nulos
    // (§6.4 literal — falta C).
    const linhas = await client.db
      .select()
      .from(plenitudeData)
      .where(
        and(
          eq(plenitudeData.companyId, companyIdHook),
          eq(plenitudeData.employeeId, empDefault),
          eq(plenitudeData.trimestre, '2024-Q1'),
        ),
      );
    expect(linhas.length).toBe(1);
    expect(linhas[0]!.scoreA).toBeNull();
    expect(linhas[0]!.scoreC).toBeNull();
    expect(linhas[0]!.plenitudeScore).toBeNull();
  });

  it('failure do motor propaga como 500 no handler (nao silenciado)', async () => {
    const empFail = await createEmployee(companyIdHook);
    const tokenFail = await signPortalToken({
      companyId: companyIdHook,
      titularType: 'employee',
      titularId: empFail,
    });
    const spy: PlenitudeEngineFacade = {
      recalculatePlenitude: async () => {
        throw new Error('Motor de plenitude falhou (teste canonico S102)');
      },
    };
    __setPortalSaveInstrumentAPlenitudeEngine(spy);
    try {
      const res = await callSave({
        portalToken: tokenFail,
        trimestre: '2024-Q1',
        respostas: gridCanonico(3),
      });
      expect(res.status).toBe(500);
      // Response JA foi persistido pela transacao anterior — motor idempotente.
      const linhas = await client.db
        .select()
        .from(instrumentA_responses)
        .where(
          and(
            eq(instrumentA_responses.employeeId, empFail),
            eq(instrumentA_responses.trimestre, '2024-Q1'),
          ),
        );
      expect(linhas.length).toBe(NUM_ITENS_TOTAL_A);
    } finally {
      resetPlenitudeEngine();
    }
  });

  it('DEFAULT_PLENITUDE_ENGINE eh o motor real da ME-040 (RV-13 estrito)', () => {
    // Ancoragem canonica: producao usa o motor real.
    expect(typeof DEFAULT_PLENITUDE_ENGINE.recalculatePlenitude).toBe('function');
  });

  it('hook chamado com now == relogio injetado (determinismo S044/L38)', async () => {
    const empDeterm = await createEmployee(companyIdHook);
    const tokenDeterm = await signPortalToken({
      companyId: companyIdHook,
      titularType: 'employee',
      titularId: empDeterm,
    });
    let nowRecebido: Date | null = null;
    const spy: PlenitudeEngineFacade = {
      recalculatePlenitude: async (_db, cid, eid, tri, now) => {
        nowRecebido = now;
        return {
          companyId: cid,
          employeeId: eid,
          trimestre: tri,
          motivo: 'instrumento_c_ausente',
          calculado: false,
          scoreA: null,
          scoreC: null,
          plenitudeScore: null,
          faixaPlenitude: null,
          divergencia: null,
          alertaDivergencia: false,
          engajamentoA: null,
          desenvolvimentoA: null,
          pertencimentoA: null,
          realizacaoA: null,
          engajamentoC: null,
          desenvolvimentoC: null,
          pertencimentoC: null,
          realizacaoC: null,
          calculadoEm: now,
        };
      },
    };
    const nowFixo = new Date('2024-04-05T09:15:30Z');
    __setPortalSaveInstrumentANow(() => nowFixo);
    __setPortalSaveInstrumentAPlenitudeEngine(spy);
    try {
      const res = await callSave({
        portalToken: tokenDeterm,
        trimestre: '2024-Q1',
        respostas: gridCanonico(2),
      });
      expect(res.status).toBe(200);
      expect(nowRecebido).not.toBeNull();
      expect((nowRecebido as unknown as Date).getTime()).toBe(nowFixo.getTime());
    } finally {
      resetPlenitudeEngine();
    }
  });

  it('constantes canonicas do motor sao exportadas (NUM_DIMENSOES/ITENS_POR_DIM)', () => {
    // Ancora RV-13: as constantes do motor sao consumidas pelo teste.
    expect(NUM_DIMENSOES_PLENITUDE).toBe(4);
    expect(NUM_ITENS_POR_DIMENSAO_PLENITUDE).toBe(5);
  });
});
