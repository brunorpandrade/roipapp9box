// ROIP APP 9BOX — ME-REPROC-IASOC: teste de integracao do
// reprocessamento retroativo (`applyReprocessIaSoc`) contra MySQL real.
//
// Cobre os quatro caminhos canonicos da Opcao A:
//   1. reprocessa_em_andamento — titular com tentativa aberta: a
//      tentativa recente recebe as respostas e vira consistente.
//   2. reprocessa_inplace — titular sem tentativa aberta: a tentativa
//      inconsistente e reprocessada in-place.
//   3. skip att=0 — quem errou as duas perguntas de atencao continua
//      inconsistente (§5.1.1).
//   4. idempotencia — segunda execucao nao reprocessa nada.
//
// CNPJs faixa 980..989 (mecanica desta ME).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
} from '../../src/db/schema';
import {
  applyReprocessIaSoc,
  planReprocessIaSoc,
  type ReprocessPlanItem,
  type ReprocessResult,
} from '../../src/server/services/reprocessIaSocInconsistentes';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const HASH = 'hash-fixo-me-reproc-iasoc';
const NOW = new Date('2026-11-06T12:00:00Z');

// Respostas que passam sob a regua recalibrada (att=2, soc soma 5, acq
// opostos, cons soma 6, extremidade baixa).
const RESPOSTAS_PASSA: Record<string, number> = {
  ITEM_018: 2,
  ITEM_080: 1,
  ITEM_009: 5,
  ITEM_039: 4,
  ITEM_075: 3,
  ITEM_001: 5,
  ITEM_006: 1,
  ITEM_025: 3,
  ITEM_057: 3,
};
// Mesmas respostas mas erra as duas perguntas de atencao (att=0).
const RESPOSTAS_BAIXA: Record<string, number> = {
  ...RESPOSTAS_PASSA,
  ITEM_018: 5,
  ITEM_080: 5,
};

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let cpfCounter = 980000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `REPROC ${cnpj} LTDA`,
      nomeFantasia: `REPROC ${cnpj}`,
      cnpj,
      telefone: '1633330980',
      endereco: `Rua REPROC, ${cnpj}`,
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
  const id = row!.id;
  createdCompanyIds.push(id);
  return id;
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab REPROC',
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
  userId: number,
  tentativa: number,
  status: 'em_andamento' | 'enviado' | 'inconsistente',
  respostas: Record<string, number>,
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType: 'employee',
      userId,
      tentativa,
      status,
      blocoAtual: 10,
      blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      respostas,
      confiabilidadeNivel: status === 'inconsistente' ? 'baixa' : null,
      enviadoEm: status === 'em_andamento' ? null : NOW,
      calculadoEm: status === 'em_andamento' ? null : NOW,
    })
    .$returningId();
  return row!.id;
}

async function createPlaceholder(
  companyId: number,
  userId: number,
  status: 'inconsistente' | 'aguardando_nova_resposta',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfilePlaceholders)
    .values({ companyId, userType: 'employee', userId, status })
    .$returningId();
  return row!.id;
}

async function getAssessment(id: number) {
  const [row] = await client.db
    .select()
    .from(individualProfileAssessments)
    .where(eq(individualProfileAssessments.id, id))
    .limit(1);
  return row;
}

async function countScores(assessmentId: number): Promise<number> {
  const rows = await client.db
    .select()
    .from(individualProfileScores)
    .where(eq(individualProfileScores.assessmentId, assessmentId));
  return rows.length;
}

async function getPlaceholderStatus(companyId: number, userId: number): Promise<string | null> {
  const [row] = await client.db
    .select()
    .from(individualProfilePlaceholders)
    .where(
      and(
        eq(individualProfilePlaceholders.companyId, companyId),
        eq(individualProfilePlaceholders.userType, 'employee'),
        eq(individualProfilePlaceholders.userId, userId),
      ),
    )
    .limit(1);
  return row?.status ?? null;
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
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

describe('ME-REPROC-IASOC — applyReprocessIaSoc (MySQL real)', () => {
  it('reprocessa_em_andamento: tentativa aberta recebe respostas e vira consistente', async () => {
    const companyId = await createCompany('10000000000980');
    const empId = await createEmployee(companyId);
    await createAssessment(companyId, empId, 1, 'inconsistente', RESPOSTAS_PASSA);
    const t2 = await createAssessment(companyId, empId, 2, 'em_andamento', { ITEM_001: 4 });
    await createPlaceholder(companyId, empId, 'aguardando_nova_resposta');

    const res = await applyReprocessIaSoc(client.db, NOW);
    const meu = res.plan.find((p) => p.companyId === companyId && p.userId === empId);
    expect(meu?.acao).toBe('reprocessa_em_andamento');

    const alvo = await getAssessment(t2);
    expect(alvo?.status).toBe('enviado');
    expect(alvo?.confiabilidadeNivel).not.toBe('baixa');
    expect(await countScores(t2)).toBe(1);
    expect(await getPlaceholderStatus(companyId, empId)).toBe('respondido');
  });

  it('reprocessa_inplace: sem tentativa aberta, reprocessa a inconsistente', async () => {
    const companyId = await createCompany('10000000000981');
    const empId = await createEmployee(companyId);
    const t1 = await createAssessment(companyId, empId, 1, 'inconsistente', RESPOSTAS_PASSA);
    await createPlaceholder(companyId, empId, 'inconsistente');

    const res = await applyReprocessIaSoc(client.db, NOW);
    const meu = res.plan.find((p) => p.companyId === companyId && p.userId === empId);
    expect(meu?.acao).toBe('reprocessa_inplace');

    const alvo = await getAssessment(t1);
    expect(alvo?.status).toBe('enviado');
    expect(await countScores(t1)).toBe(1);
    expect(await getPlaceholderStatus(companyId, empId)).toBe('respondido');
  });

  it('skip att=0: quem errou as duas perguntas de atencao continua inconsistente', async () => {
    const companyId = await createCompany('10000000000982');
    const empId = await createEmployee(companyId);
    const t1 = await createAssessment(companyId, empId, 1, 'inconsistente', RESPOSTAS_BAIXA);
    await createPlaceholder(companyId, empId, 'inconsistente');

    const res = await applyReprocessIaSoc(client.db, NOW);
    const meu = res.plan.find((p) => p.companyId === companyId && p.userId === empId);
    expect(meu?.acao).toBe('skip_continua_baixa');

    const alvo = await getAssessment(t1);
    expect(alvo?.status).toBe('inconsistente');
    expect(await countScores(t1)).toBe(0);
    expect(await getPlaceholderStatus(companyId, empId)).toBe('inconsistente');
  });

  it('idempotente: segunda execucao nao reprocessa o que ja virou consistente', async () => {
    const companyId = await createCompany('10000000000983');
    const empId = await createEmployee(companyId);
    await createAssessment(companyId, empId, 1, 'inconsistente', RESPOSTAS_PASSA);
    await createPlaceholder(companyId, empId, 'inconsistente');

    const primeira: ReprocessResult = await applyReprocessIaSoc(client.db, NOW);
    expect(primeira.aplicados).toBeGreaterThanOrEqual(1);
    const segunda = await applyReprocessIaSoc(client.db, NOW);
    const meuNaSegunda = segunda.plan.find((p) => p.companyId === companyId && p.userId === empId);
    expect(meuNaSegunda).toBeUndefined();
  });

  it('planReprocessIaSoc e read-only: planeja mas nao muta o banco', async () => {
    const companyId = await createCompany('10000000000984');
    const empId = await createEmployee(companyId);
    const t1 = await createAssessment(companyId, empId, 1, 'inconsistente', RESPOSTAS_PASSA);
    await createPlaceholder(companyId, empId, 'inconsistente');

    const plan: ReprocessPlanItem[] = await planReprocessIaSoc(client.db);
    const meu = plan.find((p) => p.companyId === companyId && p.userId === empId);
    expect(meu?.acao).toBe('reprocessa_inplace');

    // Nada mudou: segue inconsistente, sem score, placeholder inconsistente.
    const alvo = await getAssessment(t1);
    expect(alvo?.status).toBe('inconsistente');
    expect(await countScores(t1)).toBe(0);
    expect(await getPlaceholderStatus(companyId, empId)).toBe('inconsistente');
  });
});
