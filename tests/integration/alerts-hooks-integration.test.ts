// ROIP APP 9BOX — teste integracao factories de religacao (ME-059).
// Cobre CC048 + RV-13 — factories createAutoAlertHook,
// createNr1AlertFacade, createAdminAlertHook produzem hooks que
// invocam o motor emitAlert/emitAlertPostGravacao end-to-end.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  companies,
  cycleSchedule,
  emailQueue,
  employees,
  notifications,
  superAdmins,
} from '../../src/db/schema';
import {
  createAdminAlertHook,
  createAutoAlertHook,
  createNr1AlertFacade,
} from '../../src/lib/alerts/hooks';
import { updateCycleSchedule } from '../../src/server/services/cycleScheduleEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const AGORA = new Date('2026-06-15T12:00:00Z');

describe('factories de religacao — hooks NOOP → motor real', () => {
  let client: RoipDbClient;
  let companyId: number;
  let brunoId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [b] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Bruno Hooks',
        email: 'bruno-hooks-me059@roip.local',
        passwordHash: 'x',
      })
      .$returningId();
    if (!b) throw new Error('setup bruno');
    brunoId = b.id;

    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Hooks',
        nomeFantasia: 'Hooks',
        cnpj: '10190000000007',
        telefone: '1633330000',
        endereco: 'Rua Hooks',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'X',
        contatoPrincipalEmail: 'hooks@t.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh-hooks@t.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
        createdAt: new Date('2025-01-01T00:00:00Z'), // fora janela onboarding
      })
      .$returningId();
    if (!c) throw new Error('setup empresa');
    companyId = c.id;

    await client.db.insert(employees).values({
      companyId,
      name: 'RH Hooks',
      cpf: '99900003001',
      email: 'rh-hooks@t.local',
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
    });
  });

  afterAll(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, brunoId));
    await closeDbClient(client);
  });

  async function limpaResultados() {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(cycleSchedule).where(eq(cycleSchedule.companyId, companyId));
  }

  describe('createAutoAlertHook — religa NOOP_EMIT_AUTO_ALERT', () => {
    it('updateCycleSchedule fechando instrumento_c dispara ciclo_encerrado', async () => {
      await limpaResultados();
      const hook = createAutoAlertHook(client.db, AGORA);
      await updateCycleSchedule(client.db, companyId, 'instrumento_c', '2026-Q1', AGORA, hook);
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(1);
      expect(rows[0]!.tipo).toBe('ciclo_instrumento_encerrado');
      expect(rows[0]!.severidade).toBe('atencao');
    });

    it('updateCycleSchedule fechando fechamento_mensal dispara ciclo_mensal_fechado', async () => {
      await limpaResultados();
      const hook = createAutoAlertHook(client.db, AGORA);
      await updateCycleSchedule(client.db, companyId, 'fechamento_mensal', '2026-05', AGORA, hook);
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(1);
      expect(rows[0]!.tipo).toBe('ciclo_mensal_fechado');
    });

    it('updateCycleSchedule fechando radar_nr1 NAO dispara auto alert', async () => {
      await limpaResultados();
      const hook = createAutoAlertHook(client.db, AGORA);
      await updateCycleSchedule(client.db, companyId, 'radar_nr1', '2026-Q1', AGORA, hook);
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(0);
    });
  });

  describe('createNr1AlertFacade — religa DEFAULT_NR1_ALERT_FACADE', () => {
    it('facade.emitAlertPostGravacao invoca pipeline reduzido NR-1', async () => {
      await limpaResultados();
      // Simula Fase 6: grava alerta previo
      const [row] = await client.db
        .insert(alerts)
        .values({
          companyId,
          tipo: 'nr1_ciclo_fechado',
          severidade: 'atencao',
          escopo: 'empresa',
          suprimidoPorCooldown: false,
        })
        .$returningId();
      if (!row) throw new Error('setup');

      const facade = createNr1AlertFacade(client.db, AGORA);
      await facade.emitAlertPostGravacao({
        alertId: row.id,
        companyId,
        tipo: 'nr1_ciclo_fechado',
        escopoDepartamentoId: null,
        fatorId: null,
        cicloDbId: 42,
      });

      // O motor enfileira em emailQueue (digest_semanal para atencao sem override)
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      expect(eqs.length).toBeGreaterThan(0);
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('digest_semanal');
      }
    });
  });

  describe('createAdminAlertHook — religa NOOP_EVALUATE_ADMIN_ALERTS (D049)', () => {
    it('hook D049 dispara fechamento_bloqueado_sem_resp_financeiro', async () => {
      await limpaResultados();
      const hook = createAdminAlertHook(client.db, AGORA);
      await hook('fechamento_bloqueado_sem_resp_financeiro', companyId, '2026-05');
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(1);
      expect(rows[0]!.tipo).toBe('fechamento_bloqueado_sem_resp_financeiro');
      expect(rows[0]!.severidade).toBe('critico');
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      // Bruno recebe imediato (critico)
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato');
      }
    });
  });
});
