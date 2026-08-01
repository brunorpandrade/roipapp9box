// ROIP APP 9BOX — teste integracao MARCO CANONICO cadeia ME-059+060+061.
//
// Este e o primeiro teste que exercita a cadeia canonica completa da
// pilha de alertas + e-mails do DOC 06, do commit tRPC ate o e-mail
// enviado via stub SMTP:
//
//   1. Router `cycleUnlockRequests.create` (ME-032) commita solicitacao.
//   2. Gatilho canonico pos-COMMIT (§13.2) chama a factory
//      `createAdminUnlockAlertHook` (ME-061 — religacao S244).
//   3. Motor `emitAlert` (ME-059 — §8.2 pipeline M1-M7):
//      - M1 onboarding (isento §3.6 — administrativos nao suprimidos).
//      - M2 materialidade (nao se aplica).
//      - M3 INSERT em `alerts`.
//      - M4 cooldown (isento §3.6).
//      - M5 INSERT em `notifications` + resolveDestinatarios §7.1 +
//        linkResolver §5 com roteamento condicional por destinatarioTipo.
//      - M6 canal (severidade `atencao` + override T1 §6.5 = `imediato`).
//      - M7 enqueue em `emailQueue` (tipoEnvio `imediato`).
//   4. Worker `runEmailQueueJob` (ME-060 — §11.2) claim otimista +
//      Template A (§12.6) + Nodemailer stub + `emailNotifications` +
//      marca queue como `enviado`.
//
// O padrao de teste segue bit-exact `cycleUnlockRequests-router.test.ts`
// (ME-032) — createCallerFactory + tokens JWT reais + createContextInner.
// O `evaluateAdminAlertsFactory` religado ao motor real substitui o
// callback capturador daquele teste; o `sendEmail` do worker e stub via
// `vi.fn()` para inspecao dos payloads canonicos §12.6.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  cLevelMembers,
  companies,
  cycleUnlockRequests,
  emailNotifications,
  emailQueue,
  employees,
  monthlyClosureStatus,
  monthlyUnlockLog,
  notifications,
} from '../../src/db/schema';
import { deriveCredentialVersion, signPlatformToken } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { runEmailQueueJob } from '../../src/server/jobs/emailQueueJob';
import { createAdminUnlockAlertHook } from '../../src/lib/alerts/hooks';
import { createCycleUnlockRequestsRouter } from '../../src/server/routers/cycleUnlockRequests';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// JWT_SECRET fixo canonicamente (padrao ME-032/S244): definido no topo do
// arquivo antes de qualquer import que possa ler `process.env`.
process.env.JWT_SECRET = 'test-secret-roip-me061-cadeia';

const NOW_FIXED = new Date('2026-06-15T12:00:00Z');
const MES_ALVO = '2026-05';
const HASH_A = 'hash-fixo-me061-cadeia';

// Fixture canonica de `tests/integration/setup.ts`: super_admin id=1,
// email `fixture-test@roip.local`. Reutilizada para preservar contagem
// canonica da trilha §7.1 = 2 destinatarios (1 RH + 1 Bruno).
const FIXTURE_SUPER_ADMIN_ID = 1;
const FIXTURE_SUPER_ADMIN_EMAIL = 'fixture-test@roip.local';
void FIXTURE_SUPER_ADMIN_ID;

describe('MARCO CANONICO — cadeia ME-059+060+061 completa (create → e-mail)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let rhEmployeeId: number;
  let rhEmail: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    // CNPJ auxiliar S337: 10240000000001..049.
    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Cadeia ME-061',
        nomeFantasia: 'CadeiaME061',
        cnpj: '10240000000001',
        telefone: '1633330000',
        endereco: 'Rua Cadeia',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'X',
        contatoPrincipalEmail: 'cadeia-me061@t.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh-cadeia-me061@t.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        status: 'ativa',
        // Fora janela onboarding — evita supressao M1 em outros tipos
        // (administrativos §3.6 sao isentos, mas mantem o padrao canonico).
        createdAt: new Date('2025-01-01T00:00:00Z'),
      })
      .$returningId();
    if (!c) throw new Error('setup empresa');
    companyId = c.id;

    rhEmail = 'rh-cadeia-me061@t.local';
    const [rh] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Cadeia',
        cpf: '99900004501',
        email: rhEmail,
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
        passwordHash: HASH_A,
        passwordSet: true,
      })
      .$returningId();
    if (!rh) throw new Error('setup rh');
    rhEmployeeId = rh.id;

    // Pre-condicao canonica §13.2: mes fechado.
    await client.db.insert(monthlyClosureStatus).values({
      companyId,
      mes: MES_ALVO,
      status: 'fechado',
      dataFechamento: new Date('2026-06-10T23:59:59Z'),
    });
  });

  afterAll(async () => {
    await client.db.delete(emailNotifications).where(eq(emailNotifications.companyId, companyId));
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

  it('cadeia completa create -> emitAlert -> runEmailQueueJob envia e-mails', async () => {
    // ============================================================
    // Fase 1: monta router com religacao canonica S244 (mesmo padrao
    // usado no `routers/index.ts` de producao, mas com `now` fixo
    // injetado tanto no router quanto no factory — em producao o
    // wiring padrao passa `createAdminUnlockAlertHook` sem `now`, o
    // que resolve para `new Date()` real.)
    // ============================================================
    const testRouter = createCycleUnlockRequestsRouter({
      evaluateAdminAlertsFactory: (db) => createAdminUnlockAlertHook(db, NOW_FIXED),
      now: () => NOW_FIXED,
    });
    const factory = createCallerFactory(testRouter);
    const buildCtx = (bearerToken: string | null): Context =>
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken,
      });

    // Token JWT canonico RH (padrao ME-032).
    const token = await signPlatformToken({
      userId: rhEmployeeId,
      role: 'rh',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const caller = factory(buildCtx(token));

    // ============================================================
    // Fase 2: create — dispara `desbloqueio_solicitado` via factory.
    // ============================================================
    const createResult = await caller.create({
      companyId,
      mes: MES_ALVO,
      aba: 'rh',
      justificativa:
        'Justificativa canonica de teste E2E ME-061 — cadeia completa desde o ' +
        'create ate o e-mail canonico. Este texto tem cem caracteres para ' +
        'respeitar o padrao 100-500 do DOC 03 §2.',
    });
    expect(createResult.id).toBeGreaterThan(0);

    // Aguarda o `void ... .catch()` fire-and-forget completar. O motor
    // emitAlert executa 5+ operacoes async (M1-M7): usamos multiplas
    // rodadas de microtask + uma macrotask para drenar a queue sem
    // usar polling ativo.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setImmediate(r));
    }
    await new Promise((r) => setTimeout(r, 200));

    // ============================================================
    // Fase 3: motor `emitAlert` (ME-059) executou pipeline M1-M7.
    // ============================================================
    const alertRows = await client.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.companyId, companyId), eq(alerts.tipo, 'desbloqueio_solicitado')));
    expect(alertRows.length).toBe(1);
    const alertRow = alertRows[0]!;
    expect(alertRow.severidade).toBe('atencao');
    expect(alertRow.escopo).toBe('empresa');
    expect(alertRow.escopoDepartamentoId).toBeNull();
    expect(alertRow.escopoEmployeeId).toBeNull();
    const meta = alertRow.metadados as Record<string, unknown>;
    expect(meta.cycleUnlockRequestId).toBe(createResult.id);
    expect(meta.mes).toBe(MES_ALVO);
    expect(meta.aba).toBe('rh');
    expect(meta.solicitanteNome).toBe('RH Cadeia');
    expect(meta.liderNome).toBeNull();

    // ============================================================
    // Fase 4: M5 gravou notifications (trilha canonica RH+Bruno §7.1)
    // com linkResolver §5 aplicado por destinatarioTipo.
    // ============================================================
    const notifs = await client.db
      .select()
      .from(notifications)
      .where(eq(notifications.companyId, companyId));
    expect(notifs.length).toBe(2);
    const brunoNotif = notifs.find((n) => n.destinatarioTipo === 'bruno');
    const rhNotif = notifs.find((n) => n.destinatarioTipo === 'rh');
    expect(brunoNotif).toBeDefined();
    expect(rhNotif).toBeDefined();
    // Roteamento condicional canonico §5 (bit-exact):
    expect(brunoNotif!.linkDestino).toBe('/super-admin/desbloqueios');
    expect(rhNotif!.linkDestino).toBe('/cycle-management');

    // ============================================================
    // Fase 5: M6+M7 enfileirou em `emailQueue` (canal imediato §6.5).
    // ============================================================
    const queueRowsBefore = await client.db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.companyId, companyId));
    expect(queueRowsBefore.length).toBe(2);
    for (const q of queueRowsBefore) {
      expect(q.tipoEnvio).toBe('imediato');
      expect(q.status).toBe('pendente');
    }

    // ============================================================
    // Fase 6: `runEmailQueueJob` (ME-060) processa fila + Template A.
    // ============================================================
    const sendEmail = vi.fn().mockResolvedValue({ smtpMessageId: '<msg-me061@smtp>' });
    const result = await runEmailQueueJob(client.db, NOW_FIXED, { sendEmail });
    expect(result.outcomes.enviado).toBe(2);
    expect(result.outcomes.falha_final).toBe(0);
    expect(result.outcomes.retry_agendado).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(2);

    // Verifica Template A canonicamente renderizado (§12.6):
    // - Assunto de 1 alerta = `{nomeEmpresa} — {tipoLegivel}` §12.6.
    // - Corpo contem emoji 🔶 (`atencao` §6.2) + rotulo legivel §6.1.
    for (const call of sendEmail.mock.calls) {
      const args = call[0] as { subject: string; to: string; html: string; text: string };
      expect(args.subject).toContain('Empresa Cadeia ME-061');
      expect(args.subject).toContain('Solicitação de desbloqueio de mês');
      // Emoji canonico §6.2: `atencao` = 🔶.
      expect(args.html).toContain('🔶');
      expect(args.text).toContain('🔶');
      // Rotulo legivel canonico §6.1 linha 566.
      expect(args.html).toContain('Solicitação de desbloqueio de mês');
    }

    // Ao menos um dos e-mails vai para Bruno; ao menos um vai para RH.
    const destinatarios = sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to) as string[];
    expect(destinatarios).toContain(FIXTURE_SUPER_ADMIN_EMAIL);
    expect(destinatarios).toContain(rhEmail);

    // ============================================================
    // Fase 7: `emailQueue` final = `enviado`; `emailNotifications`
    // gravado com FK canonica.
    // ============================================================
    const queueRowsAfter = await client.db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.companyId, companyId));
    for (const q of queueRowsAfter) {
      expect(q.status).toBe('enviado');
      expect(q.emailNotificationId).not.toBeNull();
    }

    const emailRows = await client.db
      .select()
      .from(emailNotifications)
      .where(eq(emailNotifications.companyId, companyId));
    expect(emailRows.length).toBe(2);
    const destinos = emailRows.map((e) => e.destinatarioEmail).sort();
    expect(destinos).toEqual([FIXTURE_SUPER_ADMIN_EMAIL, rhEmail].sort());
    for (const e of emailRows) {
      expect(e.smtpMessageId).toBe('<msg-me061@smtp>');
      expect(e.tipoEnvio).toBe('imediato');
    }
  });
});
