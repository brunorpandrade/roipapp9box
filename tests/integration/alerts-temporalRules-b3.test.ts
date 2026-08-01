// ROIP APP 9BOX — teste integracao checkB3NaoRecorrencia (ME-059).
// Cobre §9.2 canonica — janela 183 dias (proxy 2 trimestres) + regra
// canonica de "efetivamente entregue" (suprimidoPorCooldown=false).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { alerts, companies, employees } from '../../src/db/schema';
import {
  checkB3NaoRecorrencia,
  SEIS_MESES_INTERVALO_DIAS,
} from '../../src/lib/alerts/temporalRules';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

describe('checkB3NaoRecorrencia — §9.2 janela 183 dias', () => {
  let client: RoipDbClient;
  let companyId: number;
  let empA: number;
  let empB: number;

  const AGORA = new Date('2026-06-01T12:00:00Z');

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa B3 Test',
        nomeFantasia: 'Empresa B3',
        cnpj: '10190000000004',
        telefone: '1633330000',
        endereco: 'Rua B3',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'Contato',
        contatoPrincipalEmail: 'b3@t.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh-b3@t.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!c) throw new Error('setup company');
    companyId = c.id;

    const [a] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp A B3',
        cpf: '99900000001',
        email: 'a-b3@t.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '351305',
        descricaoCBO: 'x',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!a) throw new Error('setup empA');
    empA = a.id;

    const [b] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp B B3',
        cpf: '99900000002',
        email: 'b-b3@t.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '351305',
        descricaoCBO: 'x',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!b) throw new Error('setup empB');
    empB = b.id;
  });

  afterAll(async () => {
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  it('SEIS_MESES_INTERVALO_DIAS canonico = 183', () => {
    expect(SEIS_MESES_INTERVALO_DIAS).toBe(183);
  });

  it('sem alertas anteriores → NAO bloqueia', async () => {
    const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
    expect(res.bloquear).toBe(false);
    expect(res.alertIdBloqueador).toBe(null);
  });

  it('alerta P07 nao suprimido dentro de 183 dias → BLOQUEIA', async () => {
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoEmployeeId: empA,
        suprimidoPorCooldown: false,
        createdAt: new Date('2026-04-01T00:00:00Z'), // 2 meses antes
      })
      .$returningId();
    if (!row) throw new Error('setup insert alert');
    try {
      const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
      expect(res.bloquear).toBe(true);
      expect(res.alertIdBloqueador).toBe(row.id);
    } finally {
      await client.db.delete(alerts).where(eq(alerts.id, row.id));
    }
  });

  it('alerta B3 nao suprimido dentro de 183 dias → BLOQUEIA', async () => {
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo: 'desempenho_queda_isolada',
        severidade: 'observacao',
        escopo: 'colaborador',
        escopoEmployeeId: empA,
        suprimidoPorCooldown: false,
        createdAt: new Date('2026-03-15T00:00:00Z'),
      })
      .$returningId();
    if (!row) throw new Error('setup insert alert');
    try {
      const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
      expect(res.bloquear).toBe(true);
    } finally {
      await client.db.delete(alerts).where(eq(alerts.id, row.id));
    }
  });

  it('alerta SUPRIMIDO por cooldown NAO conta (V4 canonizada §9.2)', async () => {
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoEmployeeId: empA,
        suprimidoPorCooldown: true, // suprimido — nao efetivamente entregue
        createdAt: new Date('2026-04-01T00:00:00Z'),
      })
      .$returningId();
    if (!row) throw new Error('setup insert alert');
    try {
      const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
      expect(res.bloquear).toBe(false);
    } finally {
      await client.db.delete(alerts).where(eq(alerts.id, row.id));
    }
  });

  it('alerta FORA da janela 183d NAO bloqueia', async () => {
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoEmployeeId: empA,
        suprimidoPorCooldown: false,
        createdAt: new Date('2025-06-01T00:00:00Z'), // 1 ano antes
      })
      .$returningId();
    if (!row) throw new Error('setup insert alert');
    try {
      const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
      expect(res.bloquear).toBe(false);
    } finally {
      await client.db.delete(alerts).where(eq(alerts.id, row.id));
    }
  });

  it('alerta de OUTRO colaborador (empB) NAO bloqueia empA', async () => {
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoEmployeeId: empB,
        suprimidoPorCooldown: false,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      })
      .$returningId();
    if (!row) throw new Error('setup insert alert');
    try {
      const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
      expect(res.bloquear).toBe(false);
    } finally {
      await client.db.delete(alerts).where(eq(alerts.id, row.id));
    }
  });

  it('alerta de outro tipo (assiduidade_baixa) NAO bloqueia B3', async () => {
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo: 'assiduidade_baixa',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoEmployeeId: empA,
        suprimidoPorCooldown: false,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      })
      .$returningId();
    if (!row) throw new Error('setup insert alert');
    try {
      const res = await checkB3NaoRecorrencia(client.db, companyId, empA, AGORA);
      expect(res.bloquear).toBe(false);
    } finally {
      await client.db.delete(alerts).where(eq(alerts.id, row.id));
    }
  });
});
