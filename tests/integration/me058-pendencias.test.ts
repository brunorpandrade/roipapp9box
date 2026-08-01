// ROIP APP 9BOX — teste de integracao ME-058 §14.23 (MySQL real).
//
// Cobre contra MySQL real (RV-11):
//   1. `loadPendenciasPage` — agregacao cross-instrumento canonica das
//      4 fontes: individualProfilePlaceholders, instrumentA_responses,
//      instrumentD_responses, copsoqCycleSnapshot.
//   2. `countPendenciasEmpresa` — soma total canonica para o card §5.8.
//   3. Cross-tenant guards: empresa A nao ve dados da empresa B.
//   4. Filtros canonicos: instrumento, status, departamento, busca.
//   5. Ordenacao tripla S328: dias em atraso desc, nome asc, instr asc.
//   6. Cooldown 72h via portalReminderLog.
//   7. Refactor §5.8 painel-rh: total canonico consumido.
//
// Faixa canonica desta ME (S327):
//   - Principal: CNPJ 10170000000001..10170000000049 (usada aqui).
//   - Auxiliar: 10180000000001..10180000000049 (reservada).

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycleSnapshot,
  copsoqCycles,
  cycleSchedule,
  employeeLeaderHistory,
  employees,
  individualProfilePlaceholders,
  instrumentA_responses,
  instrumentD_responses,
  portalReminderLog,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  countPendenciasEmpresa,
  loadPendenciasPage,
} from '../../src/lib/pendencias/pendenciasEngine';
import { CANONICAL_PENDENCIAS_DEFAULT_FILTERS } from '../../src/app/pendencias-portal/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa principal S327 ME-058: 10170000000001..10170000000049
const CNPJ_A = '10170000000001';
const CNPJ_B = '10170000000002';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const NOW_MENOS_5D = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
const NOW_MENOS_10D = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
const NOW_MAIS_10D = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);

let cpfSeq = 1;
function nextCpf(): string {
  const s = String(cpfSeq++).padStart(11, '0');
  return s;
}

describe('ME-058 — pendencias-portal (MySQL real, §14.23 + refactor §5.8)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let empId1: number;
  let empId2: number;
  let empId3: number;
  let empIdB: number;

  async function limparBase(): Promise<void> {
    await client.db.delete(portalReminderLog);
    await client.db.delete(instrumentA_responses);
    await client.db.delete(instrumentD_responses);
    await client.db.delete(copsoqCycleSnapshot);
    await client.db.delete(copsoqCycles);
    await client.db.delete(cycleSchedule);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
  }

  async function insertEmployee(input: {
    readonly companyId: number;
    readonly name: string;
    readonly departamento?: 'Financeiro' | 'Comercial' | 'Marketing' | 'Recursos Humanos';
    readonly isLider?: boolean;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: input.companyId,
        name: input.name,
        cpf: nextCpf(),
        email: `${input.name.toLowerCase().replace(/\s+/g, '.')}@roip.test`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '999999',
        descricaoCBO: 'Analista',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: input.departamento ?? 'Comercial',
        status: 'ativo',
        isLider: input.isLider ?? false,
        isRH: false,
        passwordHash: 'x',
        passwordSet: true,
      })
      .$returningId();
    return row!.id;
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await limparBase();
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await limparBase();
    cpfSeq = 10000;

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-058 A LTDA',
      nomeFantasia: 'ROIP ME-058 A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua A',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal A',
      contatoPrincipalEmail: 'p.a@roip.test',
      contatoRHNome: 'RH A',
      contatoRHEmail: 'rh.a@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'A',
      contextoMercado: 'A',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdA));

    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-058 B LTDA',
      nomeFantasia: 'ROIP ME-058 B',
      cnpj: CNPJ_B,
      telefone: '1633330002',
      endereco: 'Rua B',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal B',
      contatoPrincipalEmail: 'p.b@roip.test',
      contatoRHNome: 'RH B',
      contatoRHEmail: 'rh.b@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'B',
      contextoMercado: 'B',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdB));

    empId1 = await insertEmployee({
      companyId: companyIdA,
      name: 'Ana Silva',
      departamento: 'Financeiro',
    });
    empId2 = await insertEmployee({
      companyId: companyIdA,
      name: 'Bruno Costa',
      departamento: 'Comercial',
    });
    empId3 = await insertEmployee({
      companyId: companyIdA,
      name: 'Carla Diniz',
      departamento: 'Marketing',
    });
    empIdB = await insertEmployee({
      companyId: companyIdB,
      name: 'Zeca da Empresa B',
    });
  });

  // -------------------------------------------------------------------
  // Cenario base: sem pendencias
  // -------------------------------------------------------------------

  it('empresa vazia sem pendencias → totalRows === 0', async () => {
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.totalRows).toBe(0);
    expect(result.rows).toHaveLength(0);
    expect(result.totals.atrasadas).toBe(0);
    expect(result.totals.pendentes).toBe(0);
    expect(result.totals.colaboradoresImpactados).toBe(0);
  });

  it('countPendenciasEmpresa retorna 0 para empresa vazia', async () => {
    const total = await countPendenciasEmpresa({
      db: client.db,
      companyId: companyIdA,
      now: NOW,
    });
    expect(total).toBe(0);
  });

  // -------------------------------------------------------------------
  // Bloco 1: meuPerfil (individualProfilePlaceholders)
  // -------------------------------------------------------------------

  it('meuPerfil com status pendente → aparece em loadPendenciasPage', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'pendente',
      createdAt: NOW_MENOS_10D,
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.totalRows).toBe(1);
    const row = result.rows[0]!;
    expect(row.userId).toBe(empId1);
    expect(row.instrumento).toBe('meuPerfil');
    expect(row.nome).toBe('Ana Silva');
    // Idade 10 dias < threshold 30 → Pendente.
    expect(row.status).toBe('Pendente');
  });

  it('meuPerfil respondido → nao aparece', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'respondido',
      createdAt: NOW_MENOS_10D,
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.totalRows).toBe(0);
  });

  it('meuPerfil idade >= 30 dias → status Atrasado', async () => {
    const criacaoAntiga = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'em_andamento',
      createdAt: criacaoAntiga,
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]!.status).toBe('Atrasado');
    expect(result.rows[0]!.diasEmAtraso).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------
  // Bloco 2: instrumentA (autoAvaliacao)
  // -------------------------------------------------------------------

  it('instrumentA aberto: 19 respostas → pendente, 20 respostas → sem pendencia', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    // empId1 respondeu 19 → pendente; empId2 respondeu 20 → OK; empId3 zero → pendente.
    for (let i = 1; i <= 19; i++) {
      await client.db.insert(instrumentA_responses).values({
        companyId: companyIdA,
        employeeId: empId1,
        trimestre: '2026-T3',
        dimensao: Math.ceil(i / 2),
        itemIndex: ((i - 1) % 2) + 1,
        valor: 3,
      });
    }
    for (let i = 1; i <= 20; i++) {
      await client.db.insert(instrumentA_responses).values({
        companyId: companyIdA,
        employeeId: empId2,
        trimestre: '2026-T3',
        dimensao: Math.ceil(i / 2),
        itemIndex: ((i - 1) % 2) + 1,
        valor: 3,
      });
    }
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    const instrumentARows = result.rows.filter((r) => r.instrumento === 'autoAvaliacao');
    expect(instrumentARows).toHaveLength(2);
    const nomes = instrumentARows.map((r) => r.nome).sort();
    expect(nomes).toEqual(['Ana Silva', 'Carla Diniz']);
    expect(instrumentARows[0]!.status).toBe('Pendente');
    expect(instrumentARows[0]!.cicloReferencia).toBe('2026-T3');
  });

  it('instrumentA com ciclo atrasado → status Atrasado', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T2',
      dataAbertura: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000),
      dataCorte: NOW_MENOS_5D,
      status: 'atrasado',
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.totalRows).toBe(3);
    for (const r of result.rows) {
      expect(r.status).toBe('Atrasado');
      expect(r.diasEmAtraso).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------
  // Bloco 3: instrumentD (avaliacaoLiderancaDireta)
  // -------------------------------------------------------------------

  it('instrumentD com 20 respostas → sem pendencia', async () => {
    // Cria lider elegivel (constraint chk_iD_avaliado_unico exige liderId
    // OU clevelId NOT NULL — polimorfismo canonico DOC 01).
    const liderIdAvaliado = await insertEmployee({
      companyId: companyIdA,
      name: 'Dario Líder',
      isLider: true,
    });
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_d',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    for (let i = 1; i <= 20; i++) {
      await client.db.insert(instrumentD_responses).values({
        companyId: companyIdA,
        respondenteId: empId1,
        liderId: liderIdAvaliado,
        trimestre: '2026-T3',
        dimensao: Math.ceil(i / 2),
        itemIndex: ((i - 1) % 2) + 1,
        valor: 3,
        versaoInstrumento: 1,
      });
    }
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    const dRows = result.rows.filter((r) => r.instrumento === 'avaliacaoLiderancaDireta');
    // empId1 respondeu 20 → sem pendencia; empId2, empId3, liderIdAvaliado
    // (novo colaborador ativo) → 3 pendencias.
    expect(dRows).toHaveLength(3);
    const respondentes = dRows.map((r) => r.userId).sort();
    expect(respondentes).toEqual([empId2, empId3, liderIdAvaliado].sort());
  });

  // -------------------------------------------------------------------
  // Bloco 4: radar NR-1
  // -------------------------------------------------------------------

  it('radarNR1 com respondeu=false → pendencia; respondeu=true → sem', async () => {
    const [ciclo] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId: companyIdA,
        ciclo: '2026-T3',
        dataAbertura: NOW_MENOS_10D,
        dataFechamento: NOW_MAIS_10D,
        status: 'aberto',
      })
      .$returningId();
    await client.db.insert(copsoqCycleSnapshot).values([
      {
        cicloDbId: ciclo!.id,
        companyId: companyIdA,
        employeeId: empId1,
        respondeu: false,
        inativadoAposSnapshot: false,
      },
      {
        cicloDbId: ciclo!.id,
        companyId: companyIdA,
        employeeId: empId2,
        respondeu: true,
        inativadoAposSnapshot: false,
      },
      {
        cicloDbId: ciclo!.id,
        companyId: companyIdA,
        employeeId: empId3,
        respondeu: false,
        inativadoAposSnapshot: true,
      },
    ]);
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    const nr1Rows = result.rows.filter((r) => r.instrumento === 'radarNR1');
    expect(nr1Rows).toHaveLength(1);
    expect(nr1Rows[0]!.userId).toBe(empId1);
    expect(nr1Rows[0]!.status).toBe('Pendente');
  });

  it('radarNR1 com dataFechamento passada → status derivado Atrasado', async () => {
    const [ciclo] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId: companyIdA,
        ciclo: '2026-T2',
        dataAbertura: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000),
        dataFechamento: NOW_MENOS_5D,
        status: 'aberto',
      })
      .$returningId();
    await client.db.insert(copsoqCycleSnapshot).values({
      cicloDbId: ciclo!.id,
      companyId: companyIdA,
      employeeId: empId1,
      respondeu: false,
      inativadoAposSnapshot: false,
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    const nr1 = result.rows.find((r) => r.instrumento === 'radarNR1');
    expect(nr1).toBeDefined();
    expect(nr1!.status).toBe('Atrasado');
  });

  // -------------------------------------------------------------------
  // Cross-tenant safety
  // -------------------------------------------------------------------

  it('cross-tenant: empresa A nao ve dados da empresa B', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdB,
      userType: 'employee',
      userId: empIdB,
      status: 'pendente',
      createdAt: NOW_MENOS_10D,
    });
    const resultA = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(resultA.totalRows).toBe(0);

    const resultB = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdB,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(resultB.totalRows).toBe(1);
    expect(resultB.rows[0]!.userId).toBe(empIdB);
  });

  // -------------------------------------------------------------------
  // Filtros canonicos
  // -------------------------------------------------------------------

  it('filtro instrumento=meuPerfil filtra corretamente', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'pendente',
      createdAt: NOW_MENOS_10D,
    });
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: { ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, instrumento: 'meuPerfil' },
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    for (const r of result.rows) {
      expect(r.instrumento).toBe('meuPerfil');
    }
    expect(result.rows).toHaveLength(1);
  });

  it('filtro departamento aplicado corretamente', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: { ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, departamento: 'Financeiro' },
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.nome).toBe('Ana Silva');
    expect(result.rows[0]!.departamento).toBe('Financeiro');
  });

  it('filtro busca (q) por nome parcial', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: { ...CANONICAL_PENDENCIAS_DEFAULT_FILTERS, q: 'Bruno' },
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.nome).toBe('Bruno Costa');
  });

  // -------------------------------------------------------------------
  // Ordenacao tripla S328
  // -------------------------------------------------------------------

  it('ordenacao tripla S328: dias em atraso desc, nome asc, instrumento asc', async () => {
    // Ciclo atrasado 5 dias.
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T2',
      dataAbertura: new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000),
      dataCorte: NOW_MENOS_5D,
      status: 'atrasado',
    });
    // Ciclo atrasado 10 dias.
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_d',
      cicloReferencia: '2026-T1',
      dataAbertura: new Date(NOW.getTime() - 50 * 24 * 60 * 60 * 1000),
      dataCorte: NOW_MENOS_10D,
      status: 'atrasado',
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    // Primeiras 3 linhas devem ser instrumento_d (10 dias atraso).
    for (let i = 0; i < 3; i++) {
      expect(result.rows[i]!.diasEmAtraso).toBe(10);
    }
    // Ultimas 3 devem ser instrumento_a (5 dias atraso).
    for (let i = 3; i < 6; i++) {
      expect(result.rows[i]!.diasEmAtraso).toBe(5);
    }
    // Dentro do mesmo grupo (10 dias), ordem alfabetica de nome.
    expect(result.rows[0]!.nome).toBe('Ana Silva');
    expect(result.rows[1]!.nome).toBe('Bruno Costa');
    expect(result.rows[2]!.nome).toBe('Carla Diniz');
  });

  // -------------------------------------------------------------------
  // countPendenciasEmpresa — refactor §5.8
  // -------------------------------------------------------------------

  it('countPendenciasEmpresa retorna soma total cross-instrumento', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'pendente',
      createdAt: NOW_MENOS_10D,
    });
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    // 1 (meuPerfil) + 3 (instrumento_a, 3 colabs) = 4.
    const total = await countPendenciasEmpresa({
      db: client.db,
      companyId: companyIdA,
      now: NOW,
    });
    expect(total).toBe(4);
  });

  // -------------------------------------------------------------------
  // Cooldown 72h via portalReminderLog
  // -------------------------------------------------------------------

  it('portalReminderLog com sucesso recente → cooldownUntil populado', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'pendente',
      createdAt: NOW_MENOS_10D,
    });
    const sentAt = new Date(NOW.getTime() - 12 * 60 * 60 * 1000); // 12h atras
    await client.db.insert(portalReminderLog).values({
      id: randomUUID(),
      employeeId: empId1,
      instrumentType: 'meuPerfil',
      cycleReference: null,
      sentAt,
      sentBy: 'test',
      sentByType: 'employee',
      success: true,
      failReason: null,
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.cooldownUntil).not.toBeNull();
  });

  it('portalReminderLog antigo (> 72h) → cooldownUntil null', async () => {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: companyIdA,
      userType: 'employee',
      userId: empId1,
      status: 'pendente',
      createdAt: NOW_MENOS_10D,
    });
    const sentAt = new Date(NOW.getTime() - 100 * 60 * 60 * 1000); // 100h atras
    await client.db.insert(portalReminderLog).values({
      id: randomUUID(),
      employeeId: empId1,
      instrumentType: 'meuPerfil',
      cycleReference: null,
      sentAt,
      sentBy: 'test',
      sentByType: 'employee',
      success: true,
      failReason: null,
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.cooldownUntil).toBeNull();
  });

  // -------------------------------------------------------------------
  // Paginacao 25/50/100
  // -------------------------------------------------------------------

  it('paginacao pageSize=25 respeitada', async () => {
    // 3 colabs + ciclo A + ciclo D → 6 pendencias.
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_d',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 25,
      now: NOW,
    });
    expect(result.totalRows).toBe(6);
    expect(result.rows.length).toBeLessThanOrEqual(25);
    expect(result.pageSize).toBe(25);
  });
});
