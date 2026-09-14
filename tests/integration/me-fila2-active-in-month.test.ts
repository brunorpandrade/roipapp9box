// ROIP APP 9BOX — teste de integracao ME-fila2-seed do helper canonico
// `activeInMonthWhere` (src/lib/scope/activeInMonth.ts).
//
// Cobertura canonica:
// - Elegibilidade temporal por `dataAdmissao <= lastDay(mes)`.
// - Exclusao de employees desligados antes de `firstDay(mes)`.
// - Inclusao de employees desligados dentro do proprio mes.
// - Independencia canonica do campo `employees.status` (nao filtra por
//   estado atual — filtro puramente cronologico).
//
// Padrao S009 estendido: 1 company local ao describe, CNPJ unico da
// faixa 10000000000750..75X. Cleanup L32 em afterAll.
//
// Executa contra MySQL real via `DATABASE_URL_TEST` (RV-11).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, employeeTerminationEvents } from '../../src/db/schema';
import {
  activeInMonthWhere,
  monthBounds,
  resolveDesligadosPreviosIds,
} from '../../src/lib/scope/activeInMonth';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const HASH_A = 'hash-fixo-me-fila2-active';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

let cpfCounter = 27000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

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
      await client.db
        .delete(employeeTerminationEvents)
        .where(inArray(employeeTerminationEvents.employeeId, empIds));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `MEFila2 ${cnpj} LTDA`,
      nomeFantasia: `MEFila2 ${cnpj}`,
      cnpj,
      telefone: '1633330200',
      endereco: `Rua ME-fila2, ${cnpj}`,
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
      kickoffDate: new Date('2025-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

async function createEmployee(
  companyId: number,
  name: string,
  dataAdmissao: Date,
  status: 'ativo' | 'inativo' = 'ativo',
): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@fila2.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao,
      cbo: '414110',
      descricaoCBO: 'Auxiliar administrativo',
      jobFamily: 'producao_operacoes',
      senioridade: 'junior',
      nivelHierarquico: 'operacional',
      departamento: 'Administrativo',
      status,
      passwordHash: HASH_A,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createTerminationEvent(
  companyId: number,
  employeeId: number,
  dataInativacao: Date,
): Promise<void> {
  await client.db.insert(employeeTerminationEvents).values({
    employeeId,
    companyId,
    dataInativacao,
    motivo: 'voluntario',
    nivelHierarquicoSnapshot: 'operacional',
    departamentoSnapshot: 'Administrativo',
    actorTipo: 'superAdmin',
    actorId: 1,
  });
}

describe('ME-fila2-seed — activeInMonthWhere (helper canonico §3.11)', () => {
  const CNPJ = '10000000000750';
  let companyId: number;
  let idPre2026: number;
  let idJan2026: number;
  let idSet2026: number;
  let idJun2027: number;
  let idDesligadoAgo2026: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ);
    idPre2026 = await createEmployee(companyId, 'Alice PreDemo', new Date('2025-06-15'));
    idJan2026 = await createEmployee(companyId, 'Bruno Kickoff', new Date('2026-01-05'));
    idSet2026 = await createEmployee(companyId, 'Carla Set2026', new Date('2026-09-01'));
    idJun2027 = await createEmployee(companyId, 'Diego Jun2027', new Date('2027-06-10'));
    idDesligadoAgo2026 = await createEmployee(
      companyId,
      'Eduardo Desligado',
      new Date('2025-11-20'),
      'inativo',
    );
    await createTerminationEvent(
      companyId,
      idDesligadoAgo2026,
      new Date('2026-08-15T10:00:00.000Z'),
    );
  });

  async function selectActive(mes: string): Promise<number[]> {
    const bounds = monthBounds(mes);
    const desligados = await resolveDesligadosPreviosIds(client.db, companyId, bounds.firstDay);
    const rows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(activeInMonthWhere(companyId, bounds, desligados))
      .orderBy(asc(employees.id));
    return rows.map((r) => r.id);
  }

  it('Caso 1: mes=2025-05 (antes do primeiro admitido) → lista vazia', async () => {
    const ids = await selectActive('2025-05');
    expect(ids).toEqual([]);
  });

  it('Caso 2: mes=2026-04 → Alice + Bruno + Eduardo (Eduardo ativo em abril)', async () => {
    const ids = await selectActive('2026-04');
    expect(ids.sort((a, b) => a - b)).toEqual(
      [idPre2026, idJan2026, idDesligadoAgo2026].sort((a, b) => a - b),
    );
  });

  it('Caso 3: mes=2026-08 → Eduardo APARECE (desligado 2026-08-15 dentro do mes)', async () => {
    const ids = await selectActive('2026-08');
    expect(ids).toContain(idDesligadoAgo2026);
    expect(ids).toContain(idPre2026);
    expect(ids).toContain(idJan2026);
    expect(ids).not.toContain(idSet2026);
    expect(ids).not.toContain(idJun2027);
  });

  it('Caso 4: mes=2026-09 → Eduardo NAO aparece (desligado antes de 2026-09-01)', async () => {
    const ids = await selectActive('2026-09');
    expect(ids).not.toContain(idDesligadoAgo2026);
    expect(ids).toContain(idSet2026);
    expect(ids).toContain(idPre2026);
    expect(ids).toContain(idJan2026);
    expect(ids).not.toContain(idJun2027);
  });

  it('Caso 5: mes=2027-07 → Alice + Bruno + Carla + Diego, Eduardo excluido', async () => {
    const ids = await selectActive('2027-07');
    expect(ids.sort((a, b) => a - b)).toEqual(
      [idPre2026, idJan2026, idSet2026, idJun2027].sort((a, b) => a - b),
    );
  });

  it('Independencia: employee status=inativo sem desligamento canonico → aparece', async () => {
    // Regressao contra retorno da regra anterior (`status='ativo'`).
    const id = await createEmployee(companyId, 'Faltando Ete', new Date('2026-03-15'), 'inativo');
    const ids = await selectActive('2026-09');
    expect(ids).toContain(id);
  });
});

describe('ME-fila2-seed — monthBounds (helper puro)', () => {
  it('deriva firstDay e lastDay corretos para mes canonico', () => {
    const b = monthBounds('2026-09');
    expect(b.firstDay.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(b.lastDay.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('trata fevereiro em ano bissexto', () => {
    const b = monthBounds('2024-02');
    expect(b.lastDay.toISOString()).toBe('2024-02-29T23:59:59.999Z');
  });

  it('trata fevereiro em ano nao bissexto', () => {
    const b = monthBounds('2026-02');
    expect(b.lastDay.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('trata dezembro (limite superior)', () => {
    const b = monthBounds('2027-12');
    expect(b.firstDay.toISOString()).toBe('2027-12-01T00:00:00.000Z');
    expect(b.lastDay.toISOString()).toBe('2027-12-31T23:59:59.999Z');
  });
});
