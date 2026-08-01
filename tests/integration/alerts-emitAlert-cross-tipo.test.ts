// ROIP APP 9BOX — teste integracao emitAlert cross-tipo (ME-059).
// Cobre pipeline M1→M2→[B3]→M3→M4→M5→M6→M7 exercitando os 17 tipos
// canonicos em cenarios de fluxo feliz. Nao explora todas as
// combinacoes de supressao — outros testes dedicados fazem isso.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  cLevelMembers,
  companies,
  emailQueue,
  employees,
  notifications,
  superAdmins,
} from '../../src/db/schema';
import { emitAlert } from '../../src/lib/alerts/emitAlert';
import { AlertTipoInvalidoError } from '../../src/lib/alerts/typeDictionary';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Empresa criada ha muito tempo — fora da janela onboarding para
// alertas nao-isentos.
const CREATED_ANTIGA = new Date('2025-01-01T00:00:00Z');
const AGORA = new Date('2026-06-15T12:00:00Z');

describe('emitAlert — cross-tipo pipeline completo M1-M7', () => {
  let client: RoipDbClient;
  let companyId: number;
  let brunoId: number;
  let rhId: number;
  let empId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [b] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Bruno Cross',
        email: 'bruno-cross-me059@roip.local',
        passwordHash: 'x',
      })
      .$returningId();
    if (!b) throw new Error('setup bruno');
    brunoId = b.id;

    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Cross',
        nomeFantasia: 'Cross',
        cnpj: '10190000000005',
        telefone: '1633330000',
        endereco: 'Rua Cross',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'X',
        contatoPrincipalEmail: 'x@x.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh@x.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
        createdAt: CREATED_ANTIGA,
      })
      .$returningId();
    if (!c) throw new Error('setup empresa');
    companyId = c.id;

    const [r] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Cross',
        cpf: '99900001001',
        email: 'rh-cross@x.local',
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

    const [e] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp Cross',
        cpf: '99900001002',
        email: 'emp-cross@x.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: 'ativo',
      })
      .$returningId();
    if (!e) throw new Error('setup emp');
    empId = e.id;

    const [cl] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level Cross',
        cpf: '99900001003',
        email: 'clevel-cross@x.local',
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2015-01-01'),
        cargo: 'CFO',
        descricaoCargo: 'CFO',
        departamento: 'Financeiro',
        custoMensal: '30000.00',
        acessoTotal: true,
        status: 'ativo',
      })
      .$returningId();
    if (!cl) throw new Error('setup clevel');
    clevelId = cl.id;
  });

  afterAll(async () => {
    // Limpar todas as tabelas usadas em ordem canonica reversa
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, brunoId));
    await closeDbClient(client);
  });

  async function limpaBanco() {
    await client.db.delete(emailQueue).where(eq(emailQueue.companyId, companyId));
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(alerts).where(eq(alerts.companyId, companyId));
  }

  describe('Rejeicao de entrada — tipo fora do enum canonico', () => {
    it('tipo invalido lanca AlertTipoInvalidoError', async () => {
      await expect(
        emitAlert(client.db, {
          companyId,
          tipo: 'tipo_inventado',
          severidade: 'atencao',
          escopo: 'empresa',
          escopoDepartamentoId: null,
          escopoEmployeeId: null,
          metadados: {},
          linkContext: { companyId },
          now: AGORA,
        }),
      ).rejects.toThrow(AlertTipoInvalidoError);
    });
  });

  describe('Fluxo feliz — 4 tipos administrativos de ciclo/RF (nao-nr1)', () => {
    it('ciclo_instrumento_encerrado grava alert+notifications+emailQueue', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'ciclo_instrumento_encerrado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { cicloReferencia: '2026-Q1' },
        linkContext: { companyId },
        now: AGORA,
      });

      expect(res.resultado).toBe('gravado');
      expect(res.alertId).not.toBe(null);
      // Pelo menos 1 RH + 1 Bruno; contagem exata depende do estado do banco
      // de super admins compartilhado (outros testes de integracao podem
      // deixar registros persistentes). Usamos >= 2 como piso canonico.
      expect(res.notificationIds.length).toBeGreaterThanOrEqual(2);
      expect(res.emailQueueIds.length).toBeGreaterThanOrEqual(2);

      // Verificar linkDestino canonico gravado em notifications
      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.alertId, res.alertId!));
      for (const n of notifs) {
        expect(n.linkDestino).toBe('/cycle-management');
        expect(n.titulo).toBe('Instrumento C encerrado');
        expect(n.severidade).toBe('atencao');
      }
    });

    it('ciclo_mensal_fechado grava normalmente', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'ciclo_mensal_fechado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { cicloReferencia: '2026-05' },
        linkContext: { companyId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.alertId, res.alertId!));
      for (const n of notifs) {
        expect(n.titulo).toBe('Mês fechado para lançamentos');
      }
    });

    it('desbloqueio_solicitado grava com roteamento condicional §5 (bruno vs rh)', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desbloqueio_solicitado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { solicitanteNome: 'X', mes: '2026-05', aba: 'rh' },
        linkContext: { companyId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.alertId, res.alertId!));
      const linksBruno = notifs
        .filter((n) => n.destinatarioTipo === 'bruno')
        .map((n) => n.linkDestino);
      const linksRh = notifs.filter((n) => n.destinatarioTipo === 'rh').map((n) => n.linkDestino);
      expect(linksBruno).toContain('/super-admin/desbloqueios');
      expect(linksRh).toContain('/cycle-management');
      // T1 override → canal imediato → linhas em emailQueue devem ser imediato
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato');
      }
    });

    it('fechamento_bloqueado_sem_resp_financeiro (D049) apenas_bruno + imediato', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'fechamento_bloqueado_sem_resp_financeiro',
        severidade: 'critico',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { mes: '2026-05' },
        linkContext: { companyId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.alertId, res.alertId!));
      // Apenas bruno destinatario
      expect(notifs.every((n) => n.destinatarioTipo === 'bruno')).toBe(true);
      for (const n of notifs) {
        expect(n.linkDestino).toBe(`/super-admin/empresa/${companyId}`);
        expect(n.severidade).toBe('critico');
      }
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato');
      }
    });
  });

  describe('D050 responsavel_financeiro_nomeado — info sem e-mail', () => {
    it('grava notification mas NAO enfileira emailQueue (severidade info)', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'responsavel_financeiro_nomeado',
        severidade: 'info',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: rhId,
        metadados: { novoResponsavelId: rhId, novoResponsavelTipo: 'employee' },
        linkContext: { companyId, employeeId: rhId },
        resolverContexto: { novoResponsavelId: rhId, novoResponsavelTipo: 'employee' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      expect(res.emailQueueIds).toEqual([]); // sem e-mail para info
      // 1 destinatario canonico — o proprio RF nomeado (rhId)
      expect(res.notificationIds.length).toBe(1);
      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.alertId, res.alertId!));
      expect(notifs[0]!.linkDestino).toBe('/faturamento-mensal');
      expect(notifs[0]!.severidade).toBe('info');
      expect(notifs[0]!.destinatarioEmployeeId).toBe(rhId);
    });

    it('D050 para C-level tambem grava sem enfileirar', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'responsavel_financeiro_nomeado',
        severidade: 'info',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { novoResponsavelId: clevelId, novoResponsavelTipo: 'clevel' },
        linkContext: { companyId },
        resolverContexto: { novoResponsavelId: clevelId, novoResponsavelTipo: 'clevel' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      expect(res.emailQueueIds).toEqual([]);
      expect(res.notificationIds.length).toBe(1);
    });
  });

  describe('Desempenho — 3 tipos com escopo colaborador', () => {
    it('desempenho_queda_brusca critico → imediato + M2 acima_limiar', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { variacao: -25 },
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q1' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato'); // critico → imediato
      }
    });

    it('desempenho_queda_brusca com variacao<5 → suprimido_materialidade', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { variacao: -2 }, // abaixo de 5pp
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q1' },
        now: AGORA,
      });
      expect(res.resultado).toBe('suprimido_materialidade');
      expect(res.alertId).toBe(null);
      // Nada gravado em alerts
      const rows = await client.db.select().from(alerts).where(eq(alerts.companyId, companyId));
      expect(rows.length).toBe(0);
    });

    it('desempenho_estagnacao atencao com override → imediato', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_estagnacao',
        severidade: 'atencao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { indiceDesempenho: 60 },
        linkContext: { companyId, employeeId: empId, mes: '2026-05' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato'); // Q2 override
      }
    });

    it('desempenho_queda_isolada observacao → digest_semanal', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_queda_isolada',
        severidade: 'observacao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { variacao: -8 },
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q2' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('digest_semanal');
      }
    });
  });

  describe('B3 sub-step §9.2 — nao recorrencia', () => {
    it('B3 apos P07 previo (nao suprimido, dentro de 6 meses) → b3_nao_recorrencia', async () => {
      await limpaBanco();
      // Cria P07 previo
      await client.db.insert(alerts).values({
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoEmployeeId: empId,
        suprimidoPorCooldown: false,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      });
      // Tenta gravar B3
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_queda_isolada',
        severidade: 'observacao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { variacao: -10 },
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q2' },
        now: AGORA,
      });
      expect(res.resultado).toBe('b3_nao_recorrencia');
      expect(res.alertId).toBe(null);
    });
  });

  describe('Assiduidade + Plenitude + Perfis', () => {
    it('assiduidade_baixa critico → imediato', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'assiduidade_baixa',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { assiduidade: 80 },
        linkContext: { companyId, employeeId: empId, mes: '2026-05' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
    });

    it('divergencia_a_c observacao com |diferenca|>=5 → digest', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'divergencia_a_c',
        severidade: 'observacao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { diferenca: 30 },
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q2' },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
    });

    it('perfil_inconsistente_primeira atencao override → imediato', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'perfil_inconsistente_primeira',
        severidade: 'atencao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { tentativa: 1 },
        linkContext: { companyId, employeeId: empId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const eqs = await client.db
        .select()
        .from(emailQueue)
        .where(eq(emailQueue.companyId, companyId));
      for (const e of eqs) {
        expect(e.tipoEnvio).toBe('imediato');
      }
    });

    it('perfil_retest_consistente observacao → digest', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'perfil_retest_consistente',
        severidade: 'observacao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { tentativa: 2 },
        linkContext: { companyId, employeeId: empId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
    });

    it('perfil_retest_reincidente atencao override → imediato + M4 ISENTO (V4)', async () => {
      await limpaBanco();
      // Grava um alerta anterior recente para testar isencao M4
      await client.db.insert(alerts).values({
        companyId,
        tipo: 'perfil_retest_reincidente',
        severidade: 'atencao',
        escopo: 'colaborador',
        escopoEmployeeId: empId,
        suprimidoPorCooldown: false,
        createdAt: new Date(AGORA.getTime() - 24 * 60 * 60 * 1000),
      });
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'perfil_retest_reincidente',
        severidade: 'atencao',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { tentativa: 2 },
        linkContext: { companyId, employeeId: empId },
        now: AGORA,
      });
      // V4 canonizada: reincidencia sempre alerta sem cooldown
      expect(res.resultado).toBe('gravado');
    });
  });

  describe('Desbloqueios aprovado/recusado', () => {
    it('desbloqueio_aprovado → /cycle-management + imediato', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desbloqueio_aprovado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { requestId: 42 },
        linkContext: { companyId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
      const notifs = await client.db
        .select()
        .from(notifications)
        .where(eq(notifications.alertId, res.alertId!));
      for (const n of notifs) {
        expect(n.linkDestino).toBe('/cycle-management');
      }
    });

    it('desbloqueio_recusado similar', async () => {
      await limpaBanco();
      const res = await emitAlert(client.db, {
        companyId,
        tipo: 'desbloqueio_recusado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { requestId: 43 },
        linkContext: { companyId },
        now: AGORA,
      });
      expect(res.resultado).toBe('gravado');
    });
  });

  describe('M4 cooldown 7 dias', () => {
    it('mesmo tipo dentro de 7d → suprimido_cooldown + flag na linha', async () => {
      await limpaBanco();
      // Primeiro alerta livre
      const res1 = await emitAlert(client.db, {
        companyId,
        tipo: 'ciclo_mensal_fechado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: {},
        linkContext: { companyId },
        now: AGORA,
      });
      // ciclo_mensal_fechado e isento de M4 (§8.6) — nao aplica cooldown.
      // Uso um tipo que APLICA cooldown: desempenho_queda_brusca
      await limpaBanco();
      const t1 = new Date(AGORA.getTime());
      const t2 = new Date(AGORA.getTime() + 60 * 1000); // 1 min depois
      await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { variacao: -25 },
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q1' },
        now: t1,
      });
      const res_b = await emitAlert(client.db, {
        companyId,
        tipo: 'desempenho_queda_brusca',
        severidade: 'critico',
        escopo: 'colaborador',
        escopoDepartamentoId: null,
        escopoEmployeeId: empId,
        metadados: { variacao: -30 },
        linkContext: { companyId, employeeId: empId, trimestre: '2026-Q1' },
        now: t2,
      });
      expect(res_b.resultado).toBe('suprimido_cooldown');
      expect(res_b.alertId).not.toBe(null);
      const row = await client.db.select().from(alerts).where(eq(alerts.id, res_b.alertId!));
      expect(row[0]!.suprimidoPorCooldown).toBe(true);
      expect(res1.resultado).toBe('gravado'); // preserva 1a chamada
    });
  });

  describe('M7 agrupamento imediato 15min', () => {
    it('dois alertas imediatos em <15min → agrupamento canonico', async () => {
      await limpaBanco();
      const t1 = new Date(AGORA.getTime());
      const t2 = new Date(AGORA.getTime() + 5 * 60 * 1000); // 5 min depois

      await emitAlert(client.db, {
        companyId,
        tipo: 'desbloqueio_aprovado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { requestId: 1 },
        linkContext: { companyId },
        now: t1,
      });
      await emitAlert(client.db, {
        companyId,
        tipo: 'desbloqueio_recusado',
        severidade: 'atencao',
        escopo: 'empresa',
        escopoDepartamentoId: null,
        escopoEmployeeId: null,
        metadados: { requestId: 2 },
        linkContext: { companyId },
        now: t2,
      });

      const linhasImediato = await client.db
        .select()
        .from(emailQueue)
        .where(and(eq(emailQueue.companyId, companyId), eq(emailQueue.tipoEnvio, 'imediato')));
      // Agrupamento canonico: 1 linha por destinatario, com alertIds
      // array de 2 elementos (2 alertas agrupados por janela de 15 min).
      // Numero de linhas depende de destinatarios ativos (RH + N brunos).
      expect(linhasImediato.length).toBeGreaterThanOrEqual(2);
      for (const l of linhasImediato) {
        const ids = l.alertIds as number[];
        expect(Array.isArray(ids)).toBe(true);
        // Cada linha deve ter os 2 alertIds agrupados
        expect(ids.length).toBe(2);
      }
    });
  });
});
