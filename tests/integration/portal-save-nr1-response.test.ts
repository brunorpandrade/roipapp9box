// ROIP APP 9BOX — teste de integracao do Route Handler
// `POST /api/portal/save-nr1-response` (ME-049cd).
//
// Cobre a gravacao canonica da resposta do Radar NR-1 (DOC 03 §11.4 e
// §11.5): guardas de token, titular, empresa e ciclo; §11.15 corte de
// 00:00 da data de fechamento; elegibilidade pelo snapshot; controles
// anti-fraude SILENCIOSOS (uniformidade e tempo baixo via
// `nr1StartToken`, S236); transacao atomica com 32 INSERTs em
// `copsoq_responses` e atualizacao do snapshot; imutabilidade apos
// gravacao (§11.4 sem reenvio).
//
// Padrao S009/S204: CNPJ da faixa auxiliar 10000000000993..994.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoq_responses,
  employees,
} from '../../src/db/schema';
import {
  __setPortalSaveNr1ResponseDbClient,
  __setPortalSaveNr1ResponseNow,
  MSG_BODY_MALFORMED_NR1_SAVE,
  MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1,
  MSG_CICLO_NAO_ABERTO_NR1,
  MSG_CICLO_NAO_ENCONTRADO_NR1_SAVE,
  MSG_CLEVEL_NAO_RESPONDE_NR1_SAVE,
  MSG_COMPANY_MISMATCH_NR1_SAVE,
  MSG_EMPLOYEE_INATIVO_NR1_SAVE,
  MSG_INVALID_TOKEN_NR1_SAVE,
  MSG_ITENS_INCOMPLETOS_NR1,
  MSG_JA_RESPONDIDO_NR1,
  MSG_MISSING_TOKEN_NR1_SAVE,
  MSG_SEM_SNAPSHOT_NR1,
  normalizeRespostasNr1,
  POST as saveNr1POST,
  type SaveNr1ResponseSuccess,
} from '../../src/app/api/portal/save-nr1-response/route';
import { signNr1StartToken } from '../../src/server/auth/nr1StartToken';
import { signPortalToken } from '../../src/server/auth/portalToken';
import {
  FATORES_NR1,
  NUM_ITENS_POR_FATOR_NR1,
  NUM_ITENS_TOTAL_NR1,
  TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1,
} from '../../src/server/services/nr1CalculationEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049cd-nr1-save';

const HASH_SAVE = 'hash-fixo-me049cd-nr1-save';
const CNPJ_SAVE = '10000000000993';
const CNPJ_SAVE_ALT = '10000000000994';

const NOW_FIXO = new Date('2026-07-15T14:00:00.000Z');
const INICIO_HA_400S = new Date(NOW_FIXO.getTime() - 400_000);
const INICIO_HA_60S = new Date(NOW_FIXO.getTime() - 60_000);

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalSaveNr1ResponseDbClient(client);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(copsoq_responses)
      .where(inArray(copsoq_responses.companyId, createdCompanyIds));
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
  __setPortalSaveNr1ResponseDbClient(null);
  __setPortalSaveNr1ResponseNow(null);
  await closeDbClient(client);
});

beforeEach(() => {
  __setPortalSaveNr1ResponseNow(() => NOW_FIXO);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049CD SAVE ${cnpj} LTDA`,
      nomeFantasia: `ME049CD SAVE ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049cd S, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `prs-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rhs-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      timezone: 'UTC',
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49930000000;
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
      name: `EmpS ${cpf}`,
      cpf,
      email: `emps-${cpf}@roip.local`,
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
      passwordHash: HASH_SAVE,
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
      name: `CLS ${cpf}`,
      cpf,
      email: `cls-${cpf}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO da companhia',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      status: 'ativo',
      passwordHash: HASH_SAVE,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createCiclo(
  companyId: number,
  opts: {
    dataAbertura?: string;
    dataFechamento?: string;
    status?: 'agendado' | 'aberto' | 'fechado';
  } = {},
): Promise<number> {
  const abertura = opts.dataAbertura ?? '2026-07-01';
  const fechamento = opts.dataFechamento ?? '2026-08-20';
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo: abertura,
      dataAbertura: new Date(`${abertura}T00:00:00.000Z`),
      dataFechamento: new Date(`${fechamento}T00:00:00.000Z`),
      status: opts.status ?? 'aberto',
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
    snapshotEm: INICIO_HA_400S,
    respondeu: opts.respondeu ?? false,
    inativadoAposSnapshot: opts.inativadoAposSnapshot ?? false,
  });
}

/** Grid canonico completo com valor default (variacao entre fatores). */
function gridCanonico(valorBase = 2): { fator: number; itemIndex: number; valor: number }[] {
  const respostas: { fator: number; itemIndex: number; valor: number }[] = [];
  for (const fator of FATORES_NR1) {
    for (let itemIndex = 1; itemIndex <= NUM_ITENS_POR_FATOR_NR1; itemIndex += 1) {
      // Alterna valor para nao cair na uniformidade acidental.
      const valor = (valorBase + fator.id + itemIndex) % 5;
      respostas.push({ fator: fator.id, itemIndex, valor });
    }
  }
  return respostas;
}

/** Grid uniforme para exercitar §11.5 (todos os 32 itens iguais). */
function gridUniforme(valor: number): { fator: number; itemIndex: number; valor: number }[] {
  const respostas: { fator: number; itemIndex: number; valor: number }[] = [];
  for (const fator of FATORES_NR1) {
    for (let itemIndex = 1; itemIndex <= NUM_ITENS_POR_FATOR_NR1; itemIndex += 1) {
      respostas.push({ fator: fator.id, itemIndex, valor });
    }
  }
  return respostas;
}

async function callSave(body: unknown): Promise<Response> {
  const req = new Request('http://localhost/api/portal/save-nr1-response', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await saveNr1POST(req);
}

// ============================================================
// 1) Guardas de token, titular e body
// ============================================================

describe('portal-save-nr1-response — token, titular e body (§4.3 padrao portal)', () => {
  it('rejeita token ausente e invalido', async () => {
    const semToken = await callSave({});
    expect(semToken.status).toBe(400);
    expect(((await semToken.json()) as { msg: string }).msg).toBe(MSG_MISSING_TOKEN_NR1_SAVE);

    const invalido = await callSave({ portalToken: 'nao-e-jwt', cicloDbId: 1, respostas: [] });
    expect(invalido.status).toBe(401);
    expect(((await invalido.json()) as { msg: string }).msg).toBe(MSG_INVALID_TOKEN_NR1_SAVE);
  });

  it('S239 — C-level recebe 403 canonico', async () => {
    const companyId = await createCompany(CNPJ_SAVE);
    const clevelId = await createClevel(companyId);
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'clevel',
      titularId: clevelId,
    });
    const res = await callSave({ portalToken, cicloDbId: 1, respostas: [] });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { msg: string }).msg).toBe(MSG_CLEVEL_NAO_RESPONDE_NR1_SAVE);
  });

  it('rejeita `cicloDbId` fora do formato e grid incompleto', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    const semCiclo = await callSave({ portalToken, respostas: [] });
    expect(semCiclo.status).toBe(400);
    expect(((await semCiclo.json()) as { msg: string }).msg).toBe(MSG_BODY_MALFORMED_NR1_SAVE);

    const gridCurto = gridCanonico().slice(0, 31);
    const resIncompleto = await callSave({ portalToken, cicloDbId: 1, respostas: gridCurto });
    expect(resIncompleto.status).toBe(400);
    expect(((await resIncompleto.json()) as { msg: string }).msg).toBe(MSG_ITENS_INCOMPLETOS_NR1);
  });

  it('normalizeRespostasNr1 filtra formatos invalidos (RV-13)', () => {
    expect(normalizeRespostasNr1('nao array')).toBeNull();
    expect(normalizeRespostasNr1([{ fator: 1, itemIndex: 1, valor: 9 }])).toBeNull();
    expect(normalizeRespostasNr1([{ fator: 1.5, itemIndex: 1, valor: 2 }])).toBeNull();
    const bom = normalizeRespostasNr1([{ fator: 1, itemIndex: 1, valor: 3 }]);
    expect(bom).toEqual([{ fator: 1, itemIndex: 1, valor: 3 }]);
  });

  it('bloqueia colaborador inativo e token cruzado de outra empresa', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const inativo = await createEmployee(companyId, { status: 'inativo' });
    const tokenInativo = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: inativo,
    });
    const resInativo = await callSave({
      portalToken: tokenInativo,
      cicloDbId: 1,
      respostas: gridCanonico(),
    });
    expect(resInativo.status).toBe(403);
    expect(((await resInativo.json()) as { msg: string }).msg).toBe(MSG_EMPLOYEE_INATIVO_NR1_SAVE);

    const outra = await createCompany(CNPJ_SAVE_ALT);
    const forasteiro = await createEmployee(outra);
    const tokenCruzado = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: forasteiro,
    });
    const resCruzado = await callSave({
      portalToken: tokenCruzado,
      cicloDbId: 1,
      respostas: gridCanonico(),
    });
    expect(resCruzado.status).toBe(403);
    expect(((await resCruzado.json()) as { msg: string }).msg).toBe(MSG_COMPANY_MISMATCH_NR1_SAVE);
  });
});

// ============================================================
// 2) Ciclo, §11.15 e elegibilidade
// ============================================================

describe('portal-save-nr1-response — ciclo, corte §11.15 e elegibilidade', () => {
  it('recusa ciclo inexistente e ciclo fora de aberto', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    const resInexistente = await callSave({
      portalToken,
      cicloDbId: 9_999_999,
      respostas: gridCanonico(),
    });
    expect(resInexistente.status).toBe(404);
    expect(((await resInexistente.json()) as { msg: string }).msg).toBe(
      MSG_CICLO_NAO_ENCONTRADO_NR1_SAVE,
    );

    const agendado = await createCiclo(companyId, { status: 'agendado' });
    const resAgendado = await callSave({
      portalToken,
      cicloDbId: agendado,
      respostas: gridCanonico(),
    });
    expect(resAgendado.status).toBe(409);
    expect(((await resAgendado.json()) as { msg: string }).msg).toBe(MSG_CICLO_NAO_ABERTO_NR1);
  });

  it('§11.15 — submissao apos 00:00 da data de fechamento devolve mensagem canonica', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-06-01',
      dataFechamento: '2026-07-10',
      status: 'aberto',
    });
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    // NOW_FIXO = 2026-07-15 (posterior a `dataFechamento`).
    const res = await callSave({ portalToken, cicloDbId, respostas: gridCanonico() });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { msg: string }).msg).toBe(
      MSG_CICLO_ENCERRADO_DURANTE_PREENCHIMENTO_NR1,
    );
  });

  it('recusa colaborador fora do snapshot ou inativado apos snapshot', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-07-02',
      dataFechamento: '2026-08-20',
      status: 'aberto',
    });
    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    const startToken = await signNr1StartToken(
      { companyId, employeeId, cicloDbId },
      INICIO_HA_400S,
    );

    const resFora = await callSave({
      portalToken,
      startToken,
      cicloDbId,
      respostas: gridCanonico(),
    });
    expect(resFora.status).toBe(403);
    expect(((await resFora.json()) as { msg: string }).msg).toBe(MSG_SEM_SNAPSHOT_NR1);

    await inserirSnapshot(cicloDbId, companyId, employeeId, { inativadoAposSnapshot: true });
    const resInativado = await callSave({
      portalToken,
      startToken,
      cicloDbId,
      respostas: gridCanonico(),
    });
    expect(resInativado.status).toBe(403);
    expect(((await resInativado.json()) as { msg: string }).msg).toBe(MSG_SEM_SNAPSHOT_NR1);
  });
});

// ============================================================
// 3) Transacao, §11.5 e §11.4 imutabilidade
// ============================================================

describe('portal-save-nr1-response — transacao atomica e §11.5', () => {
  it('grava 32 itens, marca respondeu e persiste tempo medido pelo servidor', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-07-03',
      dataFechamento: '2026-08-20',
      status: 'aberto',
    });
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const startToken = await signNr1StartToken(
      { companyId, employeeId, cicloDbId },
      INICIO_HA_400S,
    );

    const respostas = gridCanonico();
    const res = await callSave({ portalToken, startToken, cicloDbId, respostas });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as SaveNr1ResponseSuccess;
    expect(corpo.itensGravados).toBe(NUM_ITENS_TOTAL_NR1);
    expect(corpo.operacao).toBe('insert');
    expect(corpo.respondidoEm).toBe(NOW_FIXO.toISOString());

    const persistidas = await client.db
      .select()
      .from(copsoq_responses)
      .where(
        and(eq(copsoq_responses.cicloDbId, cicloDbId), eq(copsoq_responses.employeeId, employeeId)),
      );
    expect(persistidas).toHaveLength(NUM_ITENS_TOTAL_NR1);

    const [linhaSnap] = await client.db
      .select()
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
          eq(copsoqCycleSnapshot.employeeId, employeeId),
        ),
      );
    expect(linhaSnap!.respondeu).toBe(true);
    expect(linhaSnap!.respostaInvalida).toBe(false);
    expect(linhaSnap!.motivoInvalidade).toBeNull();
    // Tempo calculado pelo servidor: (NOW - INICIO_HA_400S) = 400s.
    expect(linhaSnap!.tempoRespostaSegundos).toBe(400);
  });

  it('§11.5 — grava resposta uniforme como invalida sem sinalizar o cliente', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-07-04',
      dataFechamento: '2026-08-20',
      status: 'aberto',
    });
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const startToken = await signNr1StartToken(
      { companyId, employeeId, cicloDbId },
      INICIO_HA_400S,
    );

    const res = await callSave({
      portalToken,
      startToken,
      cicloDbId,
      respostas: gridUniforme(2),
    });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as SaveNr1ResponseSuccess;
    // Toast canonico de sucesso: o cliente nao ve `respostaInvalida`.
    expect(corpo).not.toHaveProperty('respostaInvalida');
    expect(corpo).not.toHaveProperty('motivoInvalidade');

    const [linhaSnap] = await client.db
      .select()
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
          eq(copsoqCycleSnapshot.employeeId, employeeId),
        ),
      );
    expect(linhaSnap!.respondeu).toBe(true);
    expect(linhaSnap!.respostaInvalida).toBe(true);
    expect(linhaSnap!.motivoInvalidade).toBe('uniformidade');
  });

  it('§11.5 — tempo abaixo de 180s marca `tempo_baixo` silenciosamente', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-07-05',
      dataFechamento: '2026-08-20',
      status: 'aberto',
    });
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const startToken = await signNr1StartToken({ companyId, employeeId, cicloDbId }, INICIO_HA_60S);

    const res = await callSave({ portalToken, startToken, cicloDbId, respostas: gridCanonico() });
    expect(res.status).toBe(200);

    const [linhaSnap] = await client.db
      .select()
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
          eq(copsoqCycleSnapshot.employeeId, employeeId),
        ),
      );
    expect(linhaSnap!.respostaInvalida).toBe(true);
    expect(linhaSnap!.motivoInvalidade).toBe('tempo_baixo');
    expect(linhaSnap!.tempoRespostaSegundos).toBe(60);
    expect(linhaSnap!.tempoRespostaSegundos).toBeLessThan(TEMPO_MINIMO_RESPOSTA_SEGUNDOS_NR1);
  });

  it('S236 — sem `startToken`, o servidor trata como tempo baixo (fecha o bypass)', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-07-06',
      dataFechamento: '2026-08-20',
      status: 'aberto',
    });
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });

    const res = await callSave({ portalToken, cicloDbId, respostas: gridCanonico() });
    expect(res.status).toBe(200);

    const [linhaSnap] = await client.db
      .select()
      .from(copsoqCycleSnapshot)
      .where(
        and(
          eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
          eq(copsoqCycleSnapshot.employeeId, employeeId),
        ),
      );
    expect(linhaSnap!.motivoInvalidade).toBe('tempo_baixo');
    expect(linhaSnap!.tempoRespostaSegundos).toBe(0);
  });

  it('§11.4 — segunda submissao do mesmo respondente recebe 409 canonico', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await createCiclo(companyId, {
      dataAbertura: '2026-07-07',
      dataFechamento: '2026-08-20',
      status: 'aberto',
    });
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const portalToken = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const startToken = await signNr1StartToken(
      { companyId, employeeId, cicloDbId },
      INICIO_HA_400S,
    );

    const primeira = await callSave({
      portalToken,
      startToken,
      cicloDbId,
      respostas: gridCanonico(),
    });
    expect(primeira.status).toBe(200);

    const segunda = await callSave({
      portalToken,
      startToken,
      cicloDbId,
      respostas: gridCanonico(3),
    });
    expect(segunda.status).toBe(409);
    expect(((await segunda.json()) as { msg: string }).msg).toBe(MSG_JA_RESPONDIDO_NR1);
  });
});
