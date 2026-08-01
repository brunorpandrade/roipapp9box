/* eslint-disable @stylistic/max-len -- describe/it com contexto S/§/canonizacoes tornam labels longas por design */
// ROIP APP 9BOX — teste integracao refreshCycleScheduleCounters (§15.1.4 + §14.8) — ME-063b (S354).
//
// Cobertura canonica RV-03 bidirecional dirigida a Hook 5 do
// cycleScheduleEngine:
// - Reconciliacao canonica por cada tipoCiclo (A/C/D/NR-1) com
//   MySQL real e agregacao COUNT DISTINCT bit-exact.
// - Skip canonico de `fechamento_mensal` (§15.1.4 nao aplicavel).
// - Skip canonico de `radar_nr1` sem `origemDbId` (defesa canonica).
// - No-op quando valor recalculado bate com valor persistido
//   (evita write desnecessario).
// - UPDATE canonico quando valor recalculado diverge do persistido.
// - Idempotencia canonica §15.3: reexecucao no mesmo momento produz
//   resultado bit-exact e converge.
// - Linhas `fechado` sao canonicamente skipadas (fora do WHERE).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  copsoq_responses,
  copsoqCycles,
  cycleSchedule,
  employees,
  instrumentA_responses,
  instrumentC_assessments,
  instrumentD_responses,
} from '../../src/db/schema';
import { refreshCycleScheduleCounters } from '../../src/server/services/cycleScheduleEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// ---------------------------------------------------------------------
// Helpers canonicos de fixture (bit-exact ao padrao consolidado ME-063a)
// ---------------------------------------------------------------------

async function criaEmpresaAtiva(client: RoipDbClient, cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `Empresa ${cnpj}`,
      nomeFantasia: `Empresa ${cnpj}`,
      cnpj,
      telefone: '1633330000',
      endereco: 'Rua ME063b',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `contato-${cnpj}@me063b.local`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@me063b.local`,
      segmento: 'Serviço',
      tipoAtividade: 'x',
      descricaoAtividade: 'x',
      contextoMercado: 'x',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      // status='ativa' canonico em companies (schema difere de employees).
      status: 'ativa',
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar empresa ${cnpj}`);
  return row.id;
}

async function criaEmployeeMinimo(
  client: RoipDbClient,
  companyId: number,
  idx: number,
): Promise<number> {
  const cpf = String(10000000000 + companyId * 100 + idx).padStart(11, '0');
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `Colaborador ${idx}`,
      cpf,
      email: `colab-${companyId}-${idx}@me063b.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2024-01-01'),
      cbo: '141405',
      descricaoCBO: 'Analista',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Recursos Humanos',
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar employee ${idx}`);
  return row.id;
}

async function criaCycleSchedule(
  client: RoipDbClient,
  companyId: number,
  tipoCiclo:
    'instrumento_a' | 'instrumento_c' | 'instrumento_d' | 'radar_nr1' | 'fechamento_mensal',
  cicloReferencia: string,
  status: 'aberto' | 'atrasado' | 'fechado',
  totalRespondidos: number | null = null,
  origemDbId: number | null = null,
): Promise<number> {
  const [row] = await client.db
    .insert(cycleSchedule)
    .values({
      companyId,
      tipoCiclo,
      cicloReferencia,
      status,
      totalElegiveis: 100,
      totalRespondidos,
      origemDbId,
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar cycleSchedule ${tipoCiclo}/${cicloReferencia}`);
  return row.id;
}

async function limpaDadosEmpresa(client: RoipDbClient, companyId: number): Promise<void> {
  // Ordem canonica de limpeza (FKs restrict via companies.id nas
  // tabelas de respostas — deletamos manualmente).
  await client.db.delete(copsoq_responses).where(eq(copsoq_responses.companyId, companyId));
  await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
  await client.db
    .delete(instrumentA_responses)
    .where(eq(instrumentA_responses.companyId, companyId));
  await client.db
    .delete(instrumentC_assessments)
    .where(eq(instrumentC_assessments.companyId, companyId));
  await client.db
    .delete(instrumentD_responses)
    .where(eq(instrumentD_responses.companyId, companyId));
  await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  await client.db.delete(employees).where(eq(employees.companyId, companyId));
}

// ---------------------------------------------------------------------
// Suite canonica
// ---------------------------------------------------------------------

describe('refreshCycleScheduleCounters — reconciliacao canonica §15.1.4 + §14.8 (ME-063b S354)', () => {
  let client: RoipDbClient;
  let empresaId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaId = await criaEmpresaAtiva(client, '10310000000001');
  });

  beforeEach(async () => {
    // Limpa apenas ciclos + respostas + funcionarios entre testes;
    // preserva empresa + departamento (economia canonica).
    await client.db.delete(copsoq_responses).where(eq(copsoq_responses.companyId, empresaId));
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, empresaId));
    await client.db
      .delete(instrumentA_responses)
      .where(eq(instrumentA_responses.companyId, empresaId));
    await client.db
      .delete(instrumentC_assessments)
      .where(eq(instrumentC_assessments.companyId, empresaId));
    await client.db
      .delete(instrumentD_responses)
      .where(eq(instrumentD_responses.companyId, empresaId));
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, empresaId));
    await client.db.delete(employees).where(eq(employees.companyId, empresaId));
  });

  afterAll(async () => {
    await limpaDadosEmpresa(client, empresaId);
    await client.db.delete(companies).where(eq(companies.id, empresaId));
    await closeDbClient(client);
  });

  it('varredura vazia retorna zeros canonicos', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.startedAt).toEqual(now);
    expect(result.ciclosVarridos).toBe(0);
    expect(result.ciclosReconciliados).toBe(0);
    expect(result.ciclosSkipadosFechamentoMensal).toBe(0);
    expect(result.ciclosSkipadosNr1SemOrigem).toBe(0);
  });

  it('reconcilia instrumento_a por COUNT(DISTINCT employeeId, trimestre) canonico', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    const emp2 = await criaEmployeeMinimo(client, empresaId, 2);

    // Colaborador 1: 32 itens no trimestre (uma unica resposta canonica)
    // Colaborador 2: 5 itens (parcial) — mas COUNT DISTINCT o inclui
    // Colaborador 3: nenhum
    for (let dim = 1; dim <= 8; dim += 1) {
      for (let item = 1; item <= 4; item += 1) {
        await client.db.insert(instrumentA_responses).values({
          companyId: empresaId,
          employeeId: emp1,
          trimestre: '2026-Q1',
          dimensao: dim,
          itemIndex: item,
          valor: 5,
        });
      }
    }
    for (let item = 1; item <= 5; item += 1) {
      await client.db.insert(instrumentA_responses).values({
        companyId: empresaId,
        employeeId: emp2,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: item,
        valor: 3,
      });
    }

    // cycleSchedule com totalRespondidos=0 (contador otimista atrasado)
    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_a',
      '2026-Q1',
      'aberto',
      0,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosVarridos).toBe(1);
    expect(result.ciclosReconciliados).toBe(1);
    expect(result.ciclosSkipadosFechamentoMensal).toBe(0);
    expect(result.ciclosSkipadosNr1SemOrigem).toBe(0);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(2);
  });

  it('reconcilia instrumento_c por COUNT(DISTINCT employeeId, trimestre) canonico', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    const emp2 = await criaEmployeeMinimo(client, empresaId, 2);
    const emp3 = await criaEmployeeMinimo(client, empresaId, 3);
    const lider = await criaEmployeeMinimo(client, empresaId, 4);

    for (const empId of [emp1, emp2, emp3]) {
      await client.db.insert(instrumentC_assessments).values({
        companyId: empresaId,
        employeeId: empId,
        liderId: lider,
        clevelId: null,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 4,
      });
    }

    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_c',
      '2026-Q1',
      'atrasado',
      0,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosReconciliados).toBe(1);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(3);
  });

  it('reconcilia instrumento_d por COUNT(DISTINCT respondenteId, trimestre) canonico', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    const emp2 = await criaEmployeeMinimo(client, empresaId, 2);

    // respondenteId eh a coluna canonica (nao employeeId) em instrumentD;
    // liderId sempre preenchido (constraint chk_iD_avaliador_unico).
    await client.db.insert(instrumentD_responses).values({
      companyId: empresaId,
      respondenteId: emp1,
      liderId: emp2,
      clevelId: null,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 4,
    });
    await client.db.insert(instrumentD_responses).values({
      companyId: empresaId,
      respondenteId: emp2,
      liderId: emp1,
      clevelId: null,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 3,
    });

    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_d',
      '2026-Q1',
      'aberto',
      null,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosReconciliados).toBe(1);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(2);
  });

  it('reconcilia radar_nr1 por COUNT(DISTINCT employeeId, cicloDbId) canonico via origemDbId', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    const emp2 = await criaEmployeeMinimo(client, empresaId, 2);

    const [ciclo] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId: empresaId,
        ciclo: '2026-Q1',
        dataAbertura: new Date('2026-01-16'),
        dataFechamento: new Date('2026-02-15'),
        status: 'aberto',
      })
      .$returningId();
    if (!ciclo) throw new Error('falha ao criar copsoqCycle');

    // 2 respondentes distintos, 3 itens cada
    for (const empId of [emp1, emp2]) {
      for (let fator = 1; fator <= 3; fator += 1) {
        await client.db.insert(copsoq_responses).values({
          cicloDbId: ciclo.id,
          companyId: empresaId,
          employeeId: empId,
          fator,
          itemIndex: 1,
          valor: 2,
        });
      }
    }

    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'radar_nr1',
      '2026-Q1',
      'aberto',
      0,
      ciclo.id,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosReconciliados).toBe(1);
    expect(result.ciclosSkipadosNr1SemOrigem).toBe(0);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(2);
  });

  it('skipa fechamento_mensal canonicamente (§15.1.4 nao aplicavel)', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'fechamento_mensal',
      '2026-02',
      'aberto',
      42,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosVarridos).toBe(1);
    expect(result.ciclosSkipadosFechamentoMensal).toBe(1);
    expect(result.ciclosReconciliados).toBe(0);

    // Contador preservado bit-exact (nao ha reconciliacao para este tipo).
    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(42);
  });

  it('skipa radar_nr1 sem origemDbId canonicamente (defesa)', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'radar_nr1',
      '2026-Q1',
      'aberto',
      10,
      null,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosVarridos).toBe(1);
    expect(result.ciclosSkipadosNr1SemOrigem).toBe(1);
    expect(result.ciclosReconciliados).toBe(0);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(10);
  });

  it('no-op canonico quando valor persistido ja bate com recalculado (evita write)', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    await client.db.insert(instrumentA_responses).values({
      companyId: empresaId,
      employeeId: emp1,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 5,
    });

    // Valor persistido JA canonicamente correto = 1.
    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_a',
      '2026-Q1',
      'aberto',
      1,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosVarridos).toBe(1);
    expect(result.ciclosReconciliados).toBe(0); // nenhum UPDATE emitido
    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(1);
  });

  it('skipa canonicamente linhas com status=fechado (fora do WHERE)', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    await client.db.insert(instrumentA_responses).values({
      companyId: empresaId,
      employeeId: emp1,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 5,
    });

    // Linha fechada com contador desatualizado — NAO deve ser reconciliada.
    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_a',
      '2026-Q1',
      'fechado',
      99,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosVarridos).toBe(0); // fora do WHERE canonico
    expect(result.ciclosReconciliados).toBe(0);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(99); // preservado bit-exact
  });

  it('idempotencia canonica §15.3: reexecucao no mesmo momento produz zero reconciliados', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    await client.db.insert(instrumentA_responses).values({
      companyId: empresaId,
      employeeId: emp1,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 5,
    });

    const cycleId = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_a',
      '2026-Q1',
      'aberto',
      0,
    );

    const primeira = await refreshCycleScheduleCounters(client.db, now);
    expect(primeira.ciclosReconciliados).toBe(1);

    const segunda = await refreshCycleScheduleCounters(client.db, now);
    expect(segunda.ciclosVarridos).toBe(1);
    expect(segunda.ciclosReconciliados).toBe(0); // ja convergido
    expect(segunda.ciclosSkipadosFechamentoMensal).toBe(0);

    const [linha] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId));
    expect(linha?.totalRespondidos).toBe(1);
  });

  it('agregacao canonica mista (A + C + D + NR-1 + fechamento_mensal + fechado) numa passagem', async () => {
    const now = new Date('2026-03-15T00:15:00Z');
    const emp1 = await criaEmployeeMinimo(client, empresaId, 1);
    const emp2 = await criaEmployeeMinimo(client, empresaId, 2);

    // Ciclo A com 2 respondentes
    await client.db.insert(instrumentA_responses).values({
      companyId: empresaId,
      employeeId: emp1,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 5,
    });
    await client.db.insert(instrumentA_responses).values({
      companyId: empresaId,
      employeeId: emp2,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 4,
    });
    const cicloA = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_a',
      '2026-Q1',
      'aberto',
      0,
    );

    // Ciclo C com 1 respondente (liderId sempre preenchido por constraint)
    await client.db.insert(instrumentC_assessments).values({
      companyId: empresaId,
      employeeId: emp1,
      liderId: emp2,
      clevelId: null,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 5,
    });
    const cicloC = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_c',
      '2026-Q1',
      'aberto',
      0,
    );

    // Ciclo D com 1 respondente
    await client.db.insert(instrumentD_responses).values({
      companyId: empresaId,
      respondenteId: emp2,
      liderId: emp1,
      clevelId: null,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 4,
    });
    const cicloD = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_d',
      '2026-Q1',
      'aberto',
      0,
    );

    // NR-1 com 1 respondente
    const [nr1] = await client.db
      .insert(copsoqCycles)
      .values({
        companyId: empresaId,
        ciclo: '2026-Q1',
        dataAbertura: new Date('2026-01-16'),
        dataFechamento: new Date('2026-02-15'),
        status: 'aberto',
      })
      .$returningId();
    if (!nr1) throw new Error('falha ao criar copsoqCycle');
    await client.db.insert(copsoq_responses).values({
      cicloDbId: nr1.id,
      companyId: empresaId,
      employeeId: emp1,
      fator: 1,
      itemIndex: 1,
      valor: 3,
    });
    const cicloNr1 = await criaCycleSchedule(
      client,
      empresaId,
      'radar_nr1',
      '2026-Q1',
      'aberto',
      0,
      nr1.id,
    );

    // Fechamento mensal (skipado canonicamente)
    const cicloFM = await criaCycleSchedule(
      client,
      empresaId,
      'fechamento_mensal',
      '2026-02',
      'aberto',
      77,
    );

    // Fechado (fora do WHERE canonico)
    const cicloFechado = await criaCycleSchedule(
      client,
      empresaId,
      'instrumento_a',
      '2025-Q4',
      'fechado',
      88,
    );

    const result = await refreshCycleScheduleCounters(client.db, now);
    expect(result.ciclosVarridos).toBe(5); // A, C, D, NR-1, FM (fechado fora)
    expect(result.ciclosReconciliados).toBe(4); // A/C/D/NR-1
    expect(result.ciclosSkipadosFechamentoMensal).toBe(1);
    expect(result.ciclosSkipadosNr1SemOrigem).toBe(0);

    const rows = await client.db
      .select({ id: cycleSchedule.id, totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, empresaId));
    const byId = new Map(rows.map((r) => [r.id, r.totalRespondidos]));
    expect(byId.get(cicloA)).toBe(2);
    expect(byId.get(cicloC)).toBe(1);
    expect(byId.get(cicloD)).toBe(1);
    expect(byId.get(cicloNr1)).toBe(1);
    expect(byId.get(cicloFM)).toBe(77); // preservado
    expect(byId.get(cicloFechado)).toBe(88); // preservado
  });
});

describe('refreshCycleScheduleCounters — RV-03 defeito injetado + comportamento em falha', () => {
  it('falha canonica sobe excecao (nao encapsula try/catch — scheduler eh responsavel)', async () => {
    // Passa um db invalido (null cast) para provar que a excecao sobe
    // sem ser silenciada — bit-exact ao contrato canonico §15.4:
    // "scheduler encapsula em try/catch + log estruturado; motor
    // apenas propaga".
    const now = new Date('2026-03-15T00:15:00Z');
    const dbInvalido = null as unknown as Parameters<typeof refreshCycleScheduleCounters>[0];
    await expect(refreshCycleScheduleCounters(dbInvalido, now)).rejects.toThrow();
  });
});
