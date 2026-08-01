// ROIP APP 9BOX — teste integracao emitAlertPostGravacao (ME-059).
// Cobre §8.10 canonica — variante NR-1: pula M1/M2/M3/M5, executa
// M4 com chave AMPLIADA (fatorId para nr1_fator_critico) + M6 + M7.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  companies,
  emailQueue,
  employees,
  notifications,
  superAdmins,
} from '../../src/db/schema';
import { emitAlertPostGravacao } from '../../src/lib/alerts/emitAlertPostGravacao';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const AGORA = new Date('2026-06-15T12:00:00Z');

describe('emitAlertPostGravacao — variante NR-1 §8.10', () => {
  let client: RoipDbClient;
  let companyId: number;
  let brunoId: number;
  let rhId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [b] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Bruno NR1',
        email: 'bruno-nr1-me059@roip.local',
        passwordHash: 'x',
      })
      .$returningId();
    if (!b) throw new Error('setup bruno');
    brunoId = b.id;

    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa NR1',
        nomeFantasia: 'NR1',
        cnpj: '10190000000006',
        telefone: '1633330000',
        endereco: 'Rua NR1',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'X',
        contatoPrincipalEmail: 'nr1@t.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh-nr1@t.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!c) throw new Error('setup empresa');
    companyId = c.id;

    const [r] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH NR1',
        cpf: '99900002001',
        email: 'rh-nr1@t.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142205',
        descricaoCBO: 'RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
        isRH: true,
        status: 'ativo',
      })
      .$returningId();
    if (!r) throw new Error('setup rh');
    rhId = r.id;
  });

  afterAll(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, brunoId));
    await closeDbClient(client);
  });

  async function graveAlertaFase6(
    tipo: 'nr1_fator_critico' | 'nr1_ciclo_fechado',
    fatorId: number | null,
    escopoDepartamentoId: number | null = null,
  ): Promise<number> {
    // Simula gravacao previa da Fase 6 — alerta e notification.
    const [row] = await client.db
      .insert(alerts)
      .values({
        companyId,
        tipo,
        severidade: 'atencao',
        escopo: tipo === 'nr1_fator_critico' ? 'departamento' : 'empresa',
        escopoDepartamentoId,
        escopoEmployeeId: null,
        fatorId,
        cicloDbId: null, // aceito no schema — nao criamos copsoqCycles no fixture
        suprimidoPorCooldown: false,
      })
      .$returningId();
    if (!row) throw new Error('graveAlertaFase6');
    return row.id;
  }

  it('nr1_ciclo_fechado passa M4 (isento §8.6) + M6/M7 canal digest_semanal', async () => {
    const alertId = await graveAlertaFase6('nr1_ciclo_fechado', null);
    const res = await emitAlertPostGravacao(client.db, {
      alertId,
      companyId,
      tipo: 'nr1_ciclo_fechado',
      severidade: 'atencao',
      escopoDepartamentoId: null,
      fatorId: null,
      cicloDbId: 100,
      now: AGORA,
    });
    expect(res.resultado).toBe('gravado');
    expect(res.notificationIds).toEqual([]); // Fase 6 ja gravou; nao regrava
    expect(res.emailQueueIds.length).toBeGreaterThanOrEqual(2); // RH + Bruno pelo menos

    const eqs = await client.db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.companyId, companyId));
    for (const e of eqs) {
      expect(e.tipoEnvio).toBe('digest_semanal'); // atencao SEM override
    }
  });

  it('nr1_fator_critico com fatorId=15 → M4 chave ampliada permite outro fatorId', async () => {
    // Limpa emailQueue anterior
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));

    // Cria previamente linha de fator 10 na chave ampliada
    await client.db.insert(alerts).values({
      companyId,
      tipo: 'nr1_fator_critico',
      severidade: 'atencao',
      escopo: 'departamento',
      escopoDepartamentoId: null,
      fatorId: 10,
      suprimidoPorCooldown: false,
      createdAt: new Date(AGORA.getTime() - 24 * 60 * 60 * 1000), // 1 dia antes
    });

    // Agora tenta gravar fator 15 (chave ampliada diferente)
    const alertId = await graveAlertaFase6('nr1_fator_critico', 15);
    const res = await emitAlertPostGravacao(client.db, {
      alertId,
      companyId,
      tipo: 'nr1_fator_critico',
      severidade: 'atencao',
      escopoDepartamentoId: null,
      fatorId: 15,
      cicloDbId: 100,
      now: AGORA,
    });
    // fatorId=15 e diferente do 10 previo — nao aciona cooldown
    expect(res.resultado).toBe('gravado');
  });

  it('nr1_fator_critico mesmo fatorId em <7d → suprimido_cooldown (V4 amp)', async () => {
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));

    // Grava previo do mesmo fator 20
    await client.db.insert(alerts).values({
      companyId,
      tipo: 'nr1_fator_critico',
      severidade: 'atencao',
      escopo: 'departamento',
      escopoDepartamentoId: null,
      fatorId: 20,
      suprimidoPorCooldown: false,
      createdAt: new Date(AGORA.getTime() - 24 * 60 * 60 * 1000),
    });

    // Agora tenta gravar novo mesmo fator 20
    const alertId = await graveAlertaFase6('nr1_fator_critico', 20);
    const res = await emitAlertPostGravacao(client.db, {
      alertId,
      companyId,
      tipo: 'nr1_fator_critico',
      severidade: 'atencao',
      escopoDepartamentoId: null,
      fatorId: 20,
      cicloDbId: 100,
      now: AGORA,
    });
    expect(res.resultado).toBe('suprimido_cooldown');
    // A linha recem-gravada foi marcada como suprimida
    const row = await client.db.select().from(alerts).where(eq(alerts.id, alertId));
    expect(row[0]!.suprimidoPorCooldown).toBe(true);
  });

  // Silencia unused
  it('setup RH id visivel', () => {
    expect(rhId).toBeGreaterThan(0);
  });
});
