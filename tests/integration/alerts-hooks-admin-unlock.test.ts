// ROIP APP 9BOX — teste integracao factory `createAdminUnlockAlertHook` (ME-061).
// Cobre:
// - 3 tipos canonicos P11 (§4.9-§4.11): desbloqueio_solicitado,
//   desbloqueio_aprovado, desbloqueio_recusado.
// - Snapshot canonico `alerts.metadados` bit-exact para cada tipo.
// - Resolucao canonica de solicitanteNome (employee vs clevel) e
//   liderNome (apenas aba='lider').
// - Silencio canonico §8.12: requestId inexistente + monthlyUnlockLog
//   inexistente para desbloqueio_aprovado.
// - Trilha canonica RH+Bruno via `resolveDestinatarios` (§7.1).
// - Severidade `atencao` + override T1 para canal `imediato` (§6.5).
// - LinkContext canonico { companyId, mes } + rota condicional §5:
//   destinatarioTipo='bruno' vs 'rh' (apenas desbloqueio_solicitado).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  cLevelMembers,
  companies,
  cycleUnlockRequests,
  emailQueue,
  employees,
  monthlyClosureStatus,
  monthlyUnlockLog,
  notifications,
} from '../../src/db/schema';
import { createAdminUnlockAlertHook } from '../../src/lib/alerts/hooks';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Fixture canonica de `tests/integration/setup.ts`: super_admin id=1,
// email `fixture-test@roip.local`. Reutilizada para preservar contagem
// canonica da trilha §7.1 = 2 destinatarios (1 RH + 1 Bruno) sem criar
// Super Admins adicionais.
const FIXTURE_SUPER_ADMIN_ID = 1;

const AGORA = new Date('2026-06-15T12:00:00Z');

describe('createAdminUnlockAlertHook — factory canonica P11 (ME-061)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let rhEmployeeId: number;
  let cLevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    // Empresa canonica (fora janela onboarding — evita supressao M1).
    // CNPJ na faixa S337 (10230000000001..049).
    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa ME-061 Hook',
        nomeFantasia: 'ME061Hook',
        cnpj: '10230000000001',
        telefone: '1633330000',
        endereco: 'Rua ME061 Hook',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'X',
        contatoPrincipalEmail: 'me061-hook@t.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh-me061-hook@t.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
        status: 'ativa',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      })
      .$returningId();
    if (!c) throw new Error('setup empresa');
    companyId = c.id;

    // RH ativo para trilha RH+Bruno.
    const [rh] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH ME-061',
        cpf: '99900004001',
        email: 'rh-me061-hook@t.local',
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
    if (!rh) throw new Error('setup rh');
    rhEmployeeId = rh.id;

    // C-level ativo (para testar solicitanteTipo='clevel').
    const [cl] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level ME-061',
        cpf: '99900004002',
        email: 'clevel-me061-hook@t.local',
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'Diretor',
        descricaoCargo: 'x',
        departamento: 'Diretoria',
        custoMensal: '30000.00',
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (!cl) throw new Error('setup clevel');
    cLevelId = cl.id;
  });

  afterAll(async () => {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, companyId));
    await client.db.delete(cycleUnlockRequests).where(eq(cycleUnlockRequests.companyId, companyId));
    await client.db
      .delete(monthlyClosureStatus)
      .where(eq(monthlyClosureStatus.companyId, companyId));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  async function limpaResultados() {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(monthlyUnlockLog).where(eq(monthlyUnlockLog.companyId, companyId));
    await client.db.delete(cycleUnlockRequests).where(eq(cycleUnlockRequests.companyId, companyId));
  }

  async function criaSolicitacao(overrides: {
    aba: 'rh' | 'lider' | 'faturamento';
    solicitanteTipo: 'employee' | 'clevel';
    solicitanteId: number;
    liderId?: number | null;
    liderTipo?: 'employee' | 'clevel' | null;
    status?: 'pendente' | 'aprovada' | 'recusada';
    decididoEm?: Date | null;
    comentarioAprovacao?: string | null;
    motivoRecusa?: string | null;
    mes?: string;
    justificativa?: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(cycleUnlockRequests)
      .values({
        companyId,
        solicitanteTipo: overrides.solicitanteTipo,
        solicitanteId: overrides.solicitanteId,
        mes: overrides.mes ?? '2026-05',
        aba: overrides.aba,
        liderId: overrides.liderId ?? null,
        liderTipo: overrides.liderTipo ?? null,
        justificativa:
          overrides.justificativa ??
          'Justificativa canonica de teste com pelo menos cem caracteres ' +
            'para respeitar o padrao 100-500 do DOC 03 §2.',
        status: overrides.status ?? 'pendente',
        decididoPor:
          overrides.status === 'aprovada' || overrides.status === 'recusada'
            ? FIXTURE_SUPER_ADMIN_ID
            : null,
        decididoEm: overrides.decididoEm ?? null,
        comentarioAprovacao: overrides.comentarioAprovacao ?? null,
        motivoRecusa: overrides.motivoRecusa ?? null,
      })
      .$returningId();
    if (!row) throw new Error('insert solicitacao');
    return row.id;
  }

  describe('desbloqueio_solicitado (§4.9)', () => {
    it('grava alerta canonico com metadados completos aba=rh', async () => {
      await limpaResultados();
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_solicitado', requestId);

      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(1);
      const a = rows[0]!;
      expect(a.tipo).toBe('desbloqueio_solicitado');
      expect(a.severidade).toBe('atencao');
      expect(a.escopo).toBe('empresa');
      expect(a.escopoDepartamentoId).toBeNull();
      expect(a.escopoEmployeeId).toBeNull();
      const meta = a.metadados as Record<string, unknown>;
      expect(meta.cycleUnlockRequestId).toBe(requestId);
      expect(meta.mes).toBe('2026-05');
      expect(meta.aba).toBe('rh');
      expect(meta.liderNome).toBeNull();
      expect(meta.solicitanteEmployeeId).toBe(rhEmployeeId);
      expect(meta.solicitanteNome).toBe('RH ME-061');
      expect(typeof meta.justificativa).toBe('string');
    });

    it('aba=lider preenche liderNome canonicamente (§4.9)', async () => {
      await limpaResultados();
      const requestId = await criaSolicitacao({
        aba: 'lider',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
        liderId: cLevelId,
        liderTipo: 'clevel',
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_solicitado', requestId);

      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      const meta = rows[0]!.metadados as Record<string, unknown>;
      expect(meta.aba).toBe('lider');
      expect(meta.liderNome).toBe('C-Level ME-061');
    });

    it('solicitante C-level resolve nome via cLevelMembers', async () => {
      await limpaResultados();
      const requestId = await criaSolicitacao({
        aba: 'faturamento',
        solicitanteTipo: 'clevel',
        solicitanteId: cLevelId,
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_solicitado', requestId);

      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      const meta = rows[0]!.metadados as Record<string, unknown>;
      expect(meta.aba).toBe('faturamento');
      expect(meta.solicitanteNome).toBe('C-Level ME-061');
    });

    it('enfileira em emailQueue com canal imediato (override T1 §6.5)', async () => {
      await limpaResultados();
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_solicitado', requestId);

      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      expect(eqs.length).toBeGreaterThan(0);
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato');
      }
    });

    it('grava notifications para RH e Bruno (trilha padrao §7.1)', async () => {
      await limpaResultados();
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_solicitado', requestId);

      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.companyId, companyId));
      // Trilha canonica RH+Bruno = 2 notificacoes (1 RH ativo + 1 Bruno).
      expect(notifs.length).toBe(2);
      const tipos = notifs.map((n) => n.destinatarioTipo).sort();
      expect(tipos).toEqual(['bruno', 'rh']);
      // Roteamento condicional §5: destinatarioTipo='bruno' →
      // '/super-admin/desbloqueios'; 'rh' → '/cycle-management'.
      for (const n of notifs) {
        if (n.destinatarioTipo === 'bruno') {
          expect(n.linkDestino).toBe('/super-admin/desbloqueios');
        } else {
          expect(n.linkDestino).toBe('/cycle-management');
        }
      }
    });
  });

  describe('desbloqueio_aprovado (§4.10)', () => {
    it('grava alerta com metadados completos incluindo monthlyUnlockLogId + expiraEm', async () => {
      await limpaResultados();
      // Simula fluxo canonico: cria solicitacao aprovada + linha em
      // monthlyUnlockLog (§13.5 grava ambas na transacao atomica).
      const decididoEm = new Date('2026-06-15T10:00:00Z');
      const expiraEm = new Date(decididoEm.getTime() + 24 * 60 * 60 * 1000);
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
        status: 'aprovada',
        decididoEm,
        comentarioAprovacao: 'Aprovado apos revisao dos dados operacionais.',
      });
      const [log] = await client.db
        .insert(monthlyUnlockLog)
        .values({
          companyId,
          mes: '2026-05',
          aba: 'rh',
          desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
          justificativa: 'Justificativa canonica copiada.',
          desbloqueadoEm: decididoEm,
          expiraEm,
          unlockRequestId: requestId,
          houveAlteracao: false,
        })
        .$returningId();
      if (!log) throw new Error('setup log');

      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_aprovado', requestId);

      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(1);
      const a = rows[0]!;
      expect(a.tipo).toBe('desbloqueio_aprovado');
      expect(a.severidade).toBe('atencao');
      const meta = a.metadados as Record<string, unknown>;
      expect(meta.cycleUnlockRequestId).toBe(requestId);
      expect(meta.decididoEm).toBe(decididoEm.toISOString());
      expect(meta.comentarioAprovacao).toBe('Aprovado apos revisao dos dados operacionais.');
      expect(meta.monthlyUnlockLogId).toBe(log.id);
      expect(meta.expiraEm).toBe(expiraEm.toISOString());
    });

    it('silencio canonico §8.12 quando monthlyUnlockLog inexistente', async () => {
      await limpaResultados();
      // Aprovada mas sem log (cenario patologico).
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
        status: 'aprovada',
        decididoEm: new Date('2026-06-15T10:00:00Z'),
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_aprovado', requestId);
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(0);
    });

    it('link canonico /cycle-management para todos os destinatarios (§5)', async () => {
      await limpaResultados();
      const decididoEm = new Date('2026-06-15T10:00:00Z');
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
        status: 'aprovada',
        decididoEm,
      });
      await client.db.insert(monthlyUnlockLog).values({
        companyId,
        mes: '2026-05',
        aba: 'rh',
        desbloqueadoPor: FIXTURE_SUPER_ADMIN_ID,
        justificativa: 'x',
        desbloqueadoEm: decididoEm,
        expiraEm: new Date(decididoEm.getTime() + 24 * 60 * 60 * 1000),
        unlockRequestId: requestId,
        houveAlteracao: false,
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_aprovado', requestId);

      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.companyId, companyId));
      for (const n of notifs) {
        expect(n.linkDestino).toBe('/cycle-management');
      }
    });
  });

  describe('desbloqueio_recusado (§4.11)', () => {
    it('grava alerta com metadados incluindo motivoRecusa', async () => {
      await limpaResultados();
      const decididoEm = new Date('2026-06-15T11:00:00Z');
      const motivo =
        'Recusado porque as evidencias apresentadas nao justificam a reabertura ' +
        'do mes ja fechado; o processo canonico exige que uma nova solicitacao ' +
        'seja feita apos avaliacao interna do RH.';
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
        status: 'recusada',
        decididoEm,
        motivoRecusa: motivo,
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_recusado', requestId);

      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(1);
      const meta = rows[0]!.metadados as Record<string, unknown>;
      expect(meta.decididoEm).toBe(decididoEm.toISOString());
      expect(meta.motivoRecusa).toBe(motivo);
    });

    it('link canonico /cycle-management (§5)', async () => {
      await limpaResultados();
      const requestId = await criaSolicitacao({
        aba: 'rh',
        solicitanteTipo: 'employee',
        solicitanteId: rhEmployeeId,
        status: 'recusada',
        decididoEm: new Date('2026-06-15T11:00:00Z'),
        motivoRecusa: 'x'.repeat(120),
      });
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      await hook('desbloqueio_recusado', requestId);

      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.companyId, companyId));
      for (const n of notifs) {
        expect(n.linkDestino).toBe('/cycle-management');
      }
    });
  });

  describe('silencio canonico §8.12', () => {
    it('requestId inexistente: sem gravacao em alerts', async () => {
      await limpaResultados();
      const hook = createAdminUnlockAlertHook(client.db, AGORA);
      // requestId inexistente — silencio absoluto.
      await hook('desbloqueio_solicitado', 999_999_999);
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(0);
    });
  });
});
