// ROIP APP 9BOX — teste de integracao ME-fila1-01 (MySQL real).
//
// Cobertura canonica do fix D-INSTRUMENTO-A-CARD-PENDENCIA-JANELA-FECHADA
// (ME-fila1-01) contra MySQL real (RV-11):
//   1. `dataAbertura` no FUTURO → ciclo NAO gera pendencia (fix).
//   2. `dataAbertura` no PASSADO → ciclo gera pendencia (regressao ok).
//   3. `dataAbertura` NULL → ciclo gera pendencia (compat legada).
//   4. `dataAbertura` == now → ciclo gera pendencia (limite inclusivo).
// Verificacao paralela em `countPendenciasEmpresa` para garantir que o
// refactor §5.8 (card resumo do painel-rh) tambem passa a respeitar a
// janela canonica pos-fix.
//
// Faixa de CNPJ desta ME: 20260000000001..20260000000049 (reservada).

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
  performanceData,
  performanceVariableData,
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

const CNPJ_A = '20260000000001';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const NOW_MENOS_10D = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
const NOW_MAIS_10D = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);
const NOW_MAIS_30D = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const NOW_MAIS_60D = new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000);

let cpfSeq = 20260;
function nextCpf(): string {
  return String(cpfSeq++).padStart(11, '0');
}

describe('ME-fila1-01 — pendencias engine: janela dataAbertura (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let empId1: number;
  let empId2: number;

  async function limparBase(): Promise<void> {
    await client.db.delete(portalReminderLog);
    await client.db.delete(instrumentA_responses);
    await client.db.delete(instrumentD_responses);
    await client.db.delete(copsoqCycleSnapshot);
    await client.db.delete(copsoqCycles);
    await client.db.delete(cycleSchedule);
    await client.db.delete(individualProfilePlaceholders);
    // FIX L113 (retomada empirica pos-dispatch): apagar
    // performanceVariableData + performanceData antes de employees.
    // Testes vizinhos (me-fila1-meus-liderados-actions, monthlyData-router)
    // gravam nessas tabelas via saveMonthlyLeaderData; ordem canonica
    // do cleanup precisa respeitar FK performancedata_ibfk_2.
    await client.db.delete(performanceVariableData);
    await client.db.delete(performanceData);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
  }

  async function insertEmployee(input: {
    readonly companyId: number;
    readonly name: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: input.companyId,
        name: input.name,
        cpf: nextCpf(),
        email: `${input.name.toLowerCase().replace(/\s+/g, '.')}@roip-mefila1.test`,
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
    cpfSeq = 20260;

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-fila1 A LTDA',
      nomeFantasia: 'ROIP ME-fila1 A',
      cnpj: CNPJ_A,
      telefone: '1633330301',
      endereco: 'Rua ME-fila1 A',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'p.a@roip-mefila1.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh.a@roip-mefila1.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'A',
      contextoMercado: 'A',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdA));

    empId1 = await insertEmployee({ companyId: companyIdA, name: 'Ana Fila1' });
    empId2 = await insertEmployee({ companyId: companyIdA, name: 'Bruno Fila1' });
    void empId1;
    void empId2;
  });

  // -------------------------------------------------------------------
  // Caso 1: dataAbertura no futuro → ciclo NAO gera pendencia
  // -------------------------------------------------------------------

  it('instrumentA com dataAbertura no FUTURO → sem pendencias emitidas', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T4',
      dataAbertura: NOW_MAIS_30D,
      dataCorte: NOW_MAIS_60D,
      status: 'aberto',
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const instrumentARows = result.rows.filter((r) => r.instrumento === 'autoAvaliacao');
    expect(instrumentARows).toHaveLength(0);
    expect(result.totals.pendentes).toBe(0);
    expect(result.totals.atrasadas).toBe(0);

    // Regressao paralela no card §5.8.
    const totalCard = await countPendenciasEmpresa({
      db: client.db,
      companyId: companyIdA,
      now: NOW,
    });
    expect(totalCard).toBe(0);
  });

  it('instrumentD com dataAbertura no FUTURO → sem pendencias emitidas', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_d',
      cicloReferencia: '2026-T4',
      dataAbertura: NOW_MAIS_30D,
      dataCorte: NOW_MAIS_60D,
      status: 'aberto',
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const instrumentDRows = result.rows.filter((r) => r.instrumento === 'avaliacaoLiderancaDireta');
    expect(instrumentDRows).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // Caso 2: dataAbertura no passado → ciclo gera pendencia (regressao ok)
  // -------------------------------------------------------------------

  it('instrumentA com dataAbertura no PASSADO → gera pendencias (regressao)', async () => {
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
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const instrumentARows = result.rows.filter((r) => r.instrumento === 'autoAvaliacao');
    // 2 employees ativos, ambos ainda sem resposta.
    expect(instrumentARows).toHaveLength(2);
    for (const row of instrumentARows) {
      expect(row.status).toBe('Pendente');
      expect(row.cicloReferencia).toBe('2026-T3');
    }
  });

  // -------------------------------------------------------------------
  // Caso 3: dataAbertura NULL → ciclo gera pendencia (compat legada)
  // -------------------------------------------------------------------

  it('instrumentA com dataAbertura NULL → gera pendencias (compat legada)', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3-legado',
      dataAbertura: null,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });

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
  });

  // -------------------------------------------------------------------
  // Caso 4: dataAbertura == now → limite inclusivo canonico
  // -------------------------------------------------------------------

  it('instrumentA com dataAbertura == now → gera pendencias (limite inclusivo)', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3-agora',
      dataAbertura: NOW,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });

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
  });

  // -------------------------------------------------------------------
  // Caso 5: mix — passado + futuro na mesma empresa
  // -------------------------------------------------------------------

  it('mix de ciclos passado+futuro → apenas passado gera pendencias', async () => {
    // Ciclo A passado (deve gerar)
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-T3',
      dataAbertura: NOW_MENOS_10D,
      dataCorte: NOW_MAIS_10D,
      status: 'aberto',
    });
    // Ciclo D futuro (NAO deve gerar)
    await client.db.insert(cycleSchedule).values({
      companyId: companyIdA,
      tipoCiclo: 'instrumento_d',
      cicloReferencia: '2026-T4',
      dataAbertura: NOW_MAIS_30D,
      dataCorte: NOW_MAIS_60D,
      status: 'aberto',
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const instrumentARows = result.rows.filter((r) => r.instrumento === 'autoAvaliacao');
    const instrumentDRows = result.rows.filter((r) => r.instrumento === 'avaliacaoLiderancaDireta');
    expect(instrumentARows).toHaveLength(2);
    expect(instrumentDRows).toHaveLength(0);
  });
});
