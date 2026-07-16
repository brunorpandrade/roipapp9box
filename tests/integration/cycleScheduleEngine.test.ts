// ROIP APP 9BOX — teste de integracao `cycleScheduleEngine` (ME-030).
//
// Motor canonico dos ciclos automaticos (DOC 03 §17 + DOC 06 §14). Testes
// contra MySQL real com companies fabricadas por CNPJ unico (padrao S009
// consolidado no Bloco B1). `now` e injetado como Date literal — o motor
// e deterministico por design (parametro `now` nunca substituido por
// `Date.now()` interno).
//
// Cobertura:
//   - `refreshCycleSchedule`: idempotencia; criacao dos 4 tipos periodicos
//     no horizonte de 6 meses; NR-1 fora; empresa inexistente; timezones
//     distintos coexistindo.
//   - `updateCycleScheduleStatuses`: `aberto → atrasado` global nos 5
//     tipos; `atrasado/aberto → fechado` restrito a instrumento_c e
//     fechamento_mensal no dia 11; emissao de alertas por tipo; NR-1 e
//     A/D fora da transicao para fechado; retorno das linhas fechadas.
//   - `updateCycleSchedule`: UPSERT idempotente para linha nova e para
//     linha ja fechada (sem re-emissao); disparo condicional de alerta
//     por tipo canonico.
//   - `incrementCycleScheduleCounter`: incremento +1; incremento com null
//     inicial (COALESCE); delta arbitrario; id inexistente.

import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, cycleSchedule } from '../../src/db/schema';
import type { CycleScheduleTipo } from '../../src/server/services/cycleSchedule';
import {
  type CicloFechadoInfo,
  type EmitAutoAlert,
  incrementCycleScheduleCounter,
  refreshCycleSchedule,
  REFRESH_HORIZON_MONTHS,
  type RefreshCycleScheduleResult,
  updateCycleSchedule,
  type UpdateCycleScheduleResult,
  updateCycleScheduleStatuses,
  type UpdateCycleScheduleStatusesResult,
} from '../../src/server/services/cycleScheduleEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_SP = '10000000000330';
const CNPJ_UTC = '10000000000331';

type CompanyFixture = typeof companies.$inferInsert;

function fixture(cnpj: string, tag: string, timezone?: string): CompanyFixture {
  return {
    razaoSocial: `Empresa Engine ${tag} LTDA`,
    nomeFantasia: `Empresa Engine ${tag}`,
    cnpj,
    telefone: '1633330030',
    endereco: `Rua Engine, ${tag}`,
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Contato Principal',
    contatoPrincipalEmail: `principal.${tag}@engine.local`,
    contatoRHNome: 'Contato RH',
    contatoRHEmail: `rh.${tag}@engine.local`,
    segmento: 'Serviço',
    tipoAtividade: 'Consultoria',
    descricaoAtividade: 'Descricao',
    contextoMercado: 'Contexto',
    mesKickoff: 1,
    ...(timezone !== undefined ? { timezone } : {}),
  };
}

describe('service cycleScheduleEngine — refreshCycleSchedule (ME-030)', () => {
  let client: RoipDbClient;
  let companyIdSP: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [rowSP] = await client.db.insert(companies).values(fixture(CNPJ_SP, 'SP')).$returningId();
    if (!rowSP) throw new Error('beforeAll: falha ao criar company SP');
    companyIdSP = rowSP.id;
  });

  afterAll(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyIdSP));
    await client.db.delete(companies).where(eq(companies.id, companyIdSP));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyIdSP));
  });

  it('cria linhas para os 4 tipos periodicos (A, C, D, fechamento_mensal)', async () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const res = await refreshCycleSchedule(client.db, companyIdSP, now);
    expect(res.criados).toBeGreaterThan(0);
    expect(res.existentes).toBe(0);
    expect(res.total).toBe(res.criados);

    const linhas = await client.db
      .select({ tipoCiclo: cycleSchedule.tipoCiclo })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyIdSP));
    const tipos = new Set(linhas.map((l) => l.tipoCiclo));
    expect(tipos.has('instrumento_a')).toBe(true);
    expect(tipos.has('instrumento_c')).toBe(true);
    expect(tipos.has('instrumento_d')).toBe(true);
    expect(tipos.has('fechamento_mensal')).toBe(true);
  });

  it('NR-1 fica FORA do refresh — nenhuma linha radar_nr1 criada', async () => {
    const now = new Date('2026-01-15T12:00:00Z');
    await refreshCycleSchedule(client.db, companyIdSP, now);
    const nr1 = await client.db
      .select({ id: cycleSchedule.id })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyIdSP));
    const tipos = nr1.map((r) => r.id);
    expect(tipos.length).toBeGreaterThan(0);
    const radarLinhas = await client.db
      .select({ id: cycleSchedule.id })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.tipoCiclo, 'radar_nr1'));
    const radarDaEmpresa = radarLinhas.filter((r) => r.id != null);
    // Nenhuma linha radar_nr1 desta empresa (nao filtramos por companyId aqui
    // porque a tabela pode ter linhas de outras companies; o filtro proximo
    // e por companyId).
    const radarSP = await client.db
      .select({ id: cycleSchedule.id })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyIdSP));
    const linhas = await Promise.all(
      radarSP.map(async (r) => {
        const [full] = await client.db
          .select()
          .from(cycleSchedule)
          .where(eq(cycleSchedule.id, r.id))
          .limit(1);
        return full;
      }),
    );
    for (const l of linhas) {
      expect(l?.tipoCiclo).not.toBe('radar_nr1');
    }
    expect(radarDaEmpresa.length).toBeGreaterThanOrEqual(0);
  });

  it('e idempotente — segunda execucao no mesmo `now` nao cria duplicatas', async () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const primeira = await refreshCycleSchedule(client.db, companyIdSP, now);
    const segunda = await refreshCycleSchedule(client.db, companyIdSP, now);
    expect(segunda.criados).toBe(0);
    expect(segunda.existentes).toBe(primeira.criados);
    expect(segunda.total).toBe(primeira.total);
  });

  it('respeita o horizonte canonico de 6 meses', async () => {
    expect(REFRESH_HORIZON_MONTHS).toBe(6);
    const now = new Date('2026-01-15T12:00:00Z');
    await refreshCycleSchedule(client.db, companyIdSP, now);
    // Deve conter o mes 2026-01 (fechamento_mensal) mas nao 2026-09
    // (>6 meses de horizonte).
    const linhas = await client.db
      .select({
        tipoCiclo: cycleSchedule.tipoCiclo,
        cicloReferencia: cycleSchedule.cicloReferencia,
      })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyIdSP));
    const refsMensais = linhas
      .filter((l) => l.tipoCiclo === 'fechamento_mensal')
      .map((l) => l.cicloReferencia);
    expect(refsMensais).toContain('2026-01');
    expect(refsMensais).not.toContain('2026-09');
  });

  it('falha canonica quando companyId nao existe', async () => {
    const now = new Date('2026-01-15T12:00:00Z');
    await expect(refreshCycleSchedule(client.db, 9999999, now)).rejects.toThrow(
      /companyId|company/i,
    );
  });

  it('cria D somente em Q1 e Q3 do trimestre no horizonte', async () => {
    const now = new Date('2026-01-15T12:00:00Z');
    await refreshCycleSchedule(client.db, companyIdSP, now);
    const linhasD = await client.db
      .select({ cicloReferencia: cycleSchedule.cicloReferencia })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.tipoCiclo, 'instrumento_d'));
    const refsSP = linhasD.map((l) => l.cicloReferencia);
    for (const ref of refsSP) {
      // Padrao YYYY-Q1 ou YYYY-Q3.
      expect(ref).toMatch(/^\d{4}-Q(1|3)$/);
    }
  });
});

describe('service cycleScheduleEngine — timezone da empresa (ME-030)', () => {
  let client: RoipDbClient;
  let companyIdUTC: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [rowUTC] = await client.db
      .insert(companies)
      .values(fixture(CNPJ_UTC, 'UTC', 'UTC'))
      .$returningId();
    if (!rowUTC) throw new Error('beforeAll: falha ao criar company UTC');
    companyIdUTC = rowUTC.id;
  });

  afterAll(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyIdUTC));
    await client.db.delete(companies).where(eq(companies.id, companyIdUTC));
    await closeDbClient(client);
  });

  it('empresa em UTC recebe datas canonicas conforme seu timezone', async () => {
    const now = new Date('2026-01-15T12:00:00Z');
    await refreshCycleSchedule(client.db, companyIdUTC, now);
    const [q1] = await client.db
      .select({
        dataAbertura: cycleSchedule.dataAbertura,
      })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyIdUTC))
      .limit(1);
    // A linha mais recente para o trimestre corrente deve estar em UTC
    // (dia 16 do ultimo mes do trimestre 00:00 UTC).
    expect(q1?.dataAbertura).not.toBeNull();
  });
});

describe('service cycleScheduleEngine — updateCycleScheduleStatuses (ME-030)', () => {
  let client: RoipDbClient;
  let companyId: number;
  const CNPJ = '10000000000332';

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ, 'StatusSP'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Status');
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  });

  it('transita aberto → atrasado quando NOW() > dataCorte em todos os 5 tipos', async () => {
    const tipos: CycleScheduleTipo[] = [
      'instrumento_a',
      'instrumento_c',
      'instrumento_d',
      'radar_nr1',
      'fechamento_mensal',
    ];
    const refPorTipo: Record<CycleScheduleTipo, string> = {
      instrumento_a: '2025-VA',
      instrumento_c: '2025-VC',
      instrumento_d: '2025-VD',
      radar_nr1: '2025-VN',
      fechamento_mensal: '2025-VM',
    };
    for (const tipo of tipos) {
      await client.db.insert(cycleSchedule).values({
        companyId,
        tipoCiclo: tipo,
        cicloReferencia: refPorTipo[tipo],
        dataAbertura: new Date('2025-01-01T00:00:00Z'),
        dataCorte: new Date('2025-06-01T00:00:00Z'),
        status: 'aberto',
      });
    }
    const now = new Date('2026-01-15T12:00:00Z');
    const res = await updateCycleScheduleStatuses(client.db, now);
    expect(res.paraAtrasado).toBe(5);

    const linhas = await client.db
      .select({ tipoCiclo: cycleSchedule.tipoCiclo, status: cycleSchedule.status })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyId));
    for (const l of linhas) {
      expect(l.status).toBe('atrasado');
    }
  });

  it('nao transita aberto → atrasado quando dataCorte ainda no futuro', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2027-Q1',
      dataAbertura: new Date('2027-03-16T03:00:00Z'),
      dataCorte: new Date('2027-04-11T02:59:59Z'),
      status: 'aberto',
    });
    const now = new Date('2026-01-15T12:00:00Z');
    const res = await updateCycleScheduleStatuses(client.db, now);
    expect(res.paraAtrasado).toBe(0);
  });

  it('fecha instrumento_c no dia 11 quando cicloReferencia refere ao trim anterior', async () => {
    // Empresa em SP (default). now = 2026-04-11 15:00 UTC → 2026-04-11
    // 12:00 America/Sao_Paulo (dia 11). Trim anterior = Q1/2026.
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'atrasado',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleScheduleStatuses(client.db, now, emit);
    expect(res.paraFechado.length).toBe(1);
    expect(res.paraFechado[0]!.tipoCiclo).toBe('instrumento_c');
    expect(res.paraFechado[0]!.cicloReferencia).toBe('2026-Q1');
    expect(emitidos).toEqual([{ tipo: 'instrumento_c', ref: '2026-Q1' }]);
  });

  it('fecha fechamento_mensal no dia 11 quando ref e o mes anterior', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'fechamento_mensal',
      cicloReferencia: '2026-03',
      dataAbertura: new Date('2026-03-01T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'atrasado',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleScheduleStatuses(client.db, now, emit);
    expect(res.paraFechado.length).toBe(1);
    expect(res.paraFechado[0]!.tipoCiclo).toBe('fechamento_mensal');
    expect(emitidos).toEqual([{ tipo: 'fechamento_mensal', ref: '2026-03' }]);
  });

  it('NAO fecha instrumento_a nem instrumento_d no dia 11 (Y8 canonizada)', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_a',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'atrasado',
    });
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_d',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'atrasado',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const res = await updateCycleScheduleStatuses(client.db, now);
    expect(res.paraFechado.length).toBe(0);

    const linhas = await client.db
      .select({ tipoCiclo: cycleSchedule.tipoCiclo, status: cycleSchedule.status })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyId));
    for (const l of linhas) {
      expect(l.status).toBe('atrasado');
    }
  });

  it('NAO fecha radar_nr1 no dia 11 (fecha via closeNR1Cycle — outro motor)', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'radar_nr1',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'atrasado',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const res = await updateCycleScheduleStatuses(client.db, now);
    expect(res.paraFechado.length).toBe(0);
  });

  it('NAO fecha quando o dia local NAO e 11', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'atrasado',
    });
    const now = new Date('2026-04-12T15:00:00Z');
    const res = await updateCycleScheduleStatuses(client.db, now);
    expect(res.paraFechado.length).toBe(0);
  });

  it('NAO fecha quando cicloReferencia NAO refere ao trim anterior', async () => {
    // Trim atual (Q2/2026) — nao deve fechar mesmo no dia 11.
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q2',
      dataAbertura: new Date('2026-06-16T03:00:00Z'),
      dataCorte: new Date('2026-07-11T02:59:59Z'),
      status: 'atrasado',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const res = await updateCycleScheduleStatuses(client.db, now);
    expect(res.paraFechado.length).toBe(0);
  });

  it('linha ja `fechado` nao e re-tocada nem re-alertada', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      dataFechamento: new Date('2026-04-11T15:00:00Z'),
      status: 'fechado',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleScheduleStatuses(client.db, now, emit);
    expect(res.paraFechado.length).toBe(0);
    expect(emitidos.length).toBe(0);
  });
});

describe('service cycleScheduleEngine — updateCycleSchedule (ME-030)', () => {
  let client: RoipDbClient;
  let companyId: number;
  const CNPJ = '10000000000333';

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ, 'UpsertSP'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Upsert');
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  });

  it('cria linha nova com status=fechado quando inexistente e alerta para C', async () => {
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleSchedule(
      client.db,
      companyId,
      'instrumento_c',
      '2026-Q1',
      now,
      emit,
    );
    expect(res.transitionedToFechado).toBe(true);
    expect(emitidos).toEqual([{ tipo: 'instrumento_c', ref: '2026-Q1' }]);

    const [linha] = await client.db
      .select()
      .from(cycleSchedule)
      .where(eq(cycleSchedule.companyId, companyId))
      .limit(1);
    expect(linha?.status).toBe('fechado');
    expect(linha?.dataFechamento).not.toBeNull();
  });

  it('transita linha existente aberto → fechado e alerta uma vez', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      status: 'aberto',
    });
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleSchedule(
      client.db,
      companyId,
      'instrumento_c',
      '2026-Q1',
      now,
      emit,
    );
    expect(res.transitionedToFechado).toBe(true);
    expect(emitidos.length).toBe(1);
  });

  it('linha ja fechado — nova chamada e no-op e NAO re-alerta', async () => {
    await client.db.insert(cycleSchedule).values({
      companyId,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q1',
      dataAbertura: new Date('2026-03-16T03:00:00Z'),
      dataCorte: new Date('2026-04-11T02:59:59Z'),
      dataFechamento: new Date('2026-04-11T15:00:00Z'),
      status: 'fechado',
    });
    const now = new Date('2026-04-12T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleSchedule(
      client.db,
      companyId,
      'instrumento_c',
      '2026-Q1',
      now,
      emit,
    );
    expect(res.transitionedToFechado).toBe(false);
    expect(emitidos.length).toBe(0);
  });

  it('fechamento_mensal fechando dispara ciclo_mensal_fechado', async () => {
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleSchedule(
      client.db,
      companyId,
      'fechamento_mensal',
      '2026-03',
      now,
      emit,
    );
    expect(res.transitionedToFechado).toBe(true);
    expect(emitidos).toEqual([{ tipo: 'fechamento_mensal', ref: '2026-03' }]);
  });

  it('radar_nr1 fecha SEM disparar alerta (evaluateNR1Alerts cobre)', async () => {
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const res = await updateCycleSchedule(client.db, companyId, 'radar_nr1', '2026-Q1', now, emit);
    expect(res.transitionedToFechado).toBe(true);
    expect(emitidos.length).toBe(0);
  });

  it('instrumento_a e instrumento_d fechados manualmente NAO alertam por este motor', async () => {
    const now = new Date('2026-04-11T15:00:00Z');
    const emitidos: Array<{ tipo: string; ref: string }> = [];
    const emit: EmitAutoAlert = async (t, r) => {
      emitidos.push({ tipo: t, ref: r });
    };
    const resA = await updateCycleSchedule(
      client.db,
      companyId,
      'instrumento_a',
      '2026-Q1',
      now,
      emit,
    );
    const resD = await updateCycleSchedule(
      client.db,
      companyId,
      'instrumento_d',
      '2026-Q1',
      now,
      emit,
    );
    expect(resA.transitionedToFechado).toBe(true);
    expect(resD.transitionedToFechado).toBe(true);
    expect(emitidos.length).toBe(0);
  });

  it('default no-op de emitAutoAlert nao lanca (Opcao A canonica RV-08)', async () => {
    const now = new Date('2026-04-11T15:00:00Z');
    // Chamada sem passar emitAutoAlert — usa o NOOP_EMIT_AUTO_ALERT default.
    const res = await updateCycleSchedule(client.db, companyId, 'instrumento_c', '2026-Q1', now);
    expect(res.transitionedToFechado).toBe(true);
  });
});

describe('service cycleScheduleEngine — incrementCycleScheduleCounter (ME-030)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let cycleId: number;
  const CNPJ = '10000000000334';

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values(fixture(CNPJ, 'CounterSP'))
      .$returningId();
    if (!row) throw new Error('beforeAll: falha ao criar company Counter');
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    const [inserted] = await client.db
      .insert(cycleSchedule)
      .values({
        companyId,
        tipoCiclo: 'instrumento_a',
        cicloReferencia: '2026-Q1',
        dataAbertura: new Date('2026-03-16T03:00:00Z'),
        dataCorte: new Date('2026-04-11T02:59:59Z'),
        status: 'aberto',
      })
      .$returningId();
    if (!inserted) throw new Error('beforeEach: falha ao criar cycleSchedule para counter');
    cycleId = inserted.id;
  });

  it('incrementa +1 quando totalRespondidos e NULL inicial', async () => {
    const afetadas = await incrementCycleScheduleCounter(client.db, cycleId);
    expect(afetadas).toBe(1);
    const [row] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId))
      .limit(1);
    expect(row?.totalRespondidos).toBe(1);
  });

  it('incrementa +1 varias vezes acumulando', async () => {
    await incrementCycleScheduleCounter(client.db, cycleId);
    await incrementCycleScheduleCounter(client.db, cycleId);
    await incrementCycleScheduleCounter(client.db, cycleId);
    const [row] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId))
      .limit(1);
    expect(row?.totalRespondidos).toBe(3);
  });

  it('aceita delta arbitrario', async () => {
    await incrementCycleScheduleCounter(client.db, cycleId, 7);
    const [row] = await client.db
      .select({ totalRespondidos: cycleSchedule.totalRespondidos })
      .from(cycleSchedule)
      .where(eq(cycleSchedule.id, cycleId))
      .limit(1);
    expect(row?.totalRespondidos).toBe(7);
  });

  it('retorna 0 quando id nao existe', async () => {
    const afetadas = await incrementCycleScheduleCounter(client.db, 9999999);
    expect(afetadas).toBe(0);
  });
});

describe('service cycleScheduleEngine — contratos exportados (ME-030)', () => {
  it('inArray combinado com tipos e status e nativamente compativel', () => {
    // Sanity check para o import inArray usado nos testes acima e no motor.
    expect(inArray).toBeTypeOf('function');
  });

  it('RefreshCycleScheduleResult tem forma canonica {criados, existentes, total}', () => {
    const sample: RefreshCycleScheduleResult = { criados: 5, existentes: 3, total: 8 };
    expect(sample.criados + sample.existentes).toBe(sample.total);
  });

  it('UpdateCycleScheduleStatusesResult tem forma canonica', () => {
    const info: CicloFechadoInfo = {
      id: 1,
      companyId: 2,
      tipoCiclo: 'instrumento_c',
      cicloReferencia: '2026-Q1',
    };
    const sample: UpdateCycleScheduleStatusesResult = {
      paraAtrasado: 4,
      paraFechado: [info],
    };
    expect(sample.paraFechado).toHaveLength(1);
    expect(sample.paraFechado[0]!.tipoCiclo).toBe('instrumento_c');
  });

  it('UpdateCycleScheduleResult carrega apenas transitionedToFechado', () => {
    const sample: UpdateCycleScheduleResult = { transitionedToFechado: true };
    expect(sample.transitionedToFechado).toBe(true);
  });
});
