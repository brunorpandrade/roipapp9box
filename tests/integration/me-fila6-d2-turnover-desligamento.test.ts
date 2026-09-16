// ROIP APP 9BOX — ME-fila6 D2 — formularios de desligamento, pagina e card
// de turnover, acesso e documentos padrao (MySQL real).
//
// Faixa CNPJ 980..999 (reservada para o turnover da ME-fila6).
//
// Empresa A (calculo): 8 ativos admitidos em 2021 + 2 desligados em
// 2025-11 (V1 voluntario com Formulario A; I1 involuntario sem formulario —
// evento anterior a captura estruturada). Meses fechados: 2025-07..12 e
// 2026-01 (2026-Q1 incompleto). C1 C-level acessoTotal=true, C2 C-level
// acessoTotal=false (C-level multiplo).
// Empresa B (procs): inativacao simples e transferencia de liderados.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  employeeLeaderHistory,
  employeeTerminationEvents,
  employees,
  monthlyClosureStatus,
  terminationInvoluntaryJustifications,
  terminationVoluntaryInterviews,
} from '../../src/db/schema';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { deriveCredentialVersion, signSuperAdminToken } from '../../src/server/auth/jwt';
import {
  DOCUMENTO_PADRAO_TIPOS,
  parseDocumentoPadraoTipo,
  renderDocumentoPadraoBody,
} from '../../src/server/pdf-templates/terminationFormDocumentTemplate';
import { createEmployeesRouter } from '../../src/server/routers/employees';
import { createLeadershipTransferRouter } from '../../src/server/routers/leadershipTransfer';
import { createCompany } from '../../src/server/services/companies';
import { listClosedQuarters } from '../../src/server/services/closedQuarters';
import {
  insertTerminationForm,
  loadTerminationFormsByEventIds,
} from '../../src/server/services/terminationForms';
import {
  listTurnoverDrilldown,
  loadTurnoverCard,
  loadTurnoverPage,
} from '../../src/server/services/turnoverPanel';
import type { ServerSession } from '../../src/server/session/serverSession';
import { createCallerFactory, createContextInner } from '../../src/server/trpc';
import {
  CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS,
  MOTIVO_SAIDA_VOLUNTARIA_LABELS,
  NOTAS_VOLUNTARIO,
  ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO,
} from '../../src/lib/shared/terminationForms';
import { formatTaxaTurnover } from '../../src/lib/shared/turnoverFormat';
import { resolveTurnoverAccess } from '../../src/app/turnover/internals';
import {
  FORMULARIO_INVOLUNTARIO_TESTE,
  FORMULARIO_VOLUNTARIO_TESTE,
} from '../fixtures/terminationForms';

process.env.JWT_SECRET = 'test-secret-roip-me-fila6-d2';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ_A = '10000000000980';
const CNPJ_B = '10000000000981';
const BATCH = '00000000-0000-0000-0000-000000000f62';
let cpfSeq = 55000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330001',
  endereco: 'Rua Teste',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  contatoPrincipalNome: 'Principal',
  contatoPrincipalEmail: 'p@roip.test',
  contatoRHNome: 'RH',
  contatoRHEmail: 'rh@roip.test',
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'A',
  contextoMercado: 'A',
  mesKickoff: 1,
  kickoffDate: new Date('2020-01-01'),
};

describe('ME-fila6 D2 — turnover e desligamento (MySQL real)', () => {
  let client: RoipDbClient;
  let companyA = 0;
  let companyB = 0;
  const idsA = { c1: 0, c2: 0, rh: 0, lider: 0, v1: 0, i1: 0 };

  function platform(
    role: 'rh' | 'rh_lider' | 'clevel' | 'lider',
    userId: number,
    companyId: number,
  ): ServerSession {
    return {
      kind: 'platform',
      role,
      userId,
      companyId,
      displayName: 'Teste',
      companyDisplayName: 'Empresa Teste',
      companyLogoUrl: null,
      passwordSet: true,
    } as ServerSession;
  }

  async function seedEmployee(
    companyId: number,
    name: string,
    opts: { isLider?: boolean; isRH?: boolean; status?: 'ativo' | 'inativo' } = {},
  ): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf: String(cpfSeq),
        email: `${cpfSeq}@roip.test`,
        dataNascimento: new Date('1990-05-20'),
        dataAdmissao: new Date('2021-03-01'),
        cargo: 'Analista',
        cbo: '252105',
        descricaoCBO: 'Analista de negócios',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: opts.isLider ?? false,
        isRH: opts.isRH ?? false,
        isResponsavelFinanceiro: false,
        status: opts.status ?? 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedClevel(
    companyId: number,
    name: string,
    acessoTotal: boolean,
  ): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name,
        cpf: String(cpfSeq),
        email: `${cpfSeq}@roip.test`,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'Diretor',
        descricaoCargo: 'Executivo',
        departamento: 'Administrativo',
        custoMensal: '20000.00',
        acessoTotal,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedClevel sem id');
    }
    return row.id;
  }

  async function cleanup(): Promise<void> {
    const rows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.cnpj, [CNPJ_A, CNPJ_B]));
    const companyIds = rows.map((r) => r.id);
    if (companyIds.length === 0) {
      return;
    }
    const events = await client.db
      .select({ id: employeeTerminationEvents.id })
      .from(employeeTerminationEvents)
      .where(inArray(employeeTerminationEvents.companyId, companyIds));
    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      await client.db
        .delete(terminationVoluntaryInterviews)
        .where(inArray(terminationVoluntaryInterviews.terminationEventId, eventIds));
      await client.db
        .delete(terminationInvoluntaryJustifications)
        .where(inArray(terminationInvoluntaryJustifications.terminationEventId, eventIds));
      await client.db
        .delete(employeeTerminationEvents)
        .where(inArray(employeeTerminationEvents.id, eventIds));
    }
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, companyIds));
    const empIds = emps.map((e) => e.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
      await client.db.delete(employees).where(inArray(employees.id, empIds));
    }
    await client.db.delete(cLevelMembers).where(inArray(cLevelMembers.companyId, companyIds));
    await client.db
      .delete(monthlyClosureStatus)
      .where(inArray(monthlyClosureStatus.companyId, companyIds));
    await client.db.delete(companies).where(inArray(companies.id, companyIds));
  }

  async function superAdminCaller<T>(
    make: (ctx: ReturnType<typeof createContextInner>) => T,
  ): Promise<T> {
    const token = await signSuperAdminToken({
      superAdminId: 1,
      credentialVersion: deriveCredentialVersion('x' + 'fixture-test@roip.local'),
    });
    return make(
      createContextInner({ db: client.db, rateLimiter: createRateLimiter(), bearerToken: token }),
    );
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP FILA6 D2 A LTDA',
      nomeFantasia: 'ROIP D2 A',
      cnpj: CNPJ_A,
    });
    companyB = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP FILA6 D2 B LTDA',
      nomeFantasia: 'ROIP D2 B',
      cnpj: CNPJ_B,
    });
    idsA.c1 = await seedClevel(companyA, 'C1 Acesso Total', true);
    idsA.c2 = await seedClevel(companyA, 'C2 Acesso Restrito', false);
    idsA.rh = await seedEmployee(companyA, 'RH A', { isRH: true });
    idsA.lider = await seedEmployee(companyA, 'Lider A', { isLider: true });
    for (let i = 0; i < 6; i += 1) {
      await seedEmployee(companyA, `Ativo A ${i}`);
    }
    idsA.v1 = await seedEmployee(companyA, 'V1 Voluntario', { status: 'inativo' });
    idsA.i1 = await seedEmployee(companyA, 'I1 Involuntario', { status: 'inativo' });
    const [ev1] = await client.db
      .insert(employeeTerminationEvents)
      .values({
        employeeId: idsA.v1,
        companyId: companyA,
        dataInativacao: new Date('2025-11-10T12:00:00Z'),
        motivo: 'voluntario',
        nivelHierarquicoSnapshot: 'operacional',
        departamentoSnapshot: 'Comercial',
        actorTipo: 'superAdmin',
        actorId: 1,
      })
      .$returningId();
    await insertTerminationForm(client.db, ev1!.id, FORMULARIO_VOLUNTARIO_TESTE);
    await client.db.insert(employeeTerminationEvents).values({
      employeeId: idsA.i1,
      companyId: companyA,
      dataInativacao: new Date('2025-11-20T12:00:00Z'),
      motivo: 'involuntario',
      nivelHierarquicoSnapshot: 'operacional',
      departamentoSnapshot: 'Comercial',
      actorTipo: 'superAdmin',
      actorId: 1,
    });
    for (const mes of ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12']) {
      await client.db
        .insert(monthlyClosureStatus)
        .values({ companyId: companyA, mes, status: 'fechado' });
    }
    await client.db
      .insert(monthlyClosureStatus)
      .values({ companyId: companyA, mes: '2026-01', status: 'fechado' });
  });

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  describe('trimestres fechados, card e pagina', () => {
    it('so considera trimestres com os 3 meses fechados', async () => {
      const fechados = await listClosedQuarters(client.db, companyA);
      expect(fechados.map((q) => q.trimestre)).toEqual(['2025-Q4', '2025-Q3']);
      expect(fechados[0]?.label).toBe('4º trimestre de 2025');
    });

    it('card mostra a taxa total do ultimo trimestre fechado', async () => {
      const card = await loadTurnoverCard(client.db, companyA);
      expect(card).toMatchObject({ trimestre: '2025-Q4', taxa: 20, saidas: 2, headcount: 10 });
      expect(formatTaxaTurnover(card!.taxa, card!.saidas, card!.headcount)).toBe(
        '20,0% (2 saídas de 10 colaboradores)',
      );
    });

    it('card retorna null sem trimestre fechado', async () => {
      expect(await loadTurnoverCard(client.db, companyB)).toBeNull();
    });

    it('pagina divide total, voluntario e involuntario e navega entre fechados', async () => {
      const page = await loadTurnoverPage(client.db, companyA, null);
      expect(page.resumo?.trimestre).toBe('2025-Q4');
      expect(page.resumo?.total).toEqual({ taxa: 20, saidas: 2, headcount: 10 });
      expect(page.resumo?.voluntario).toEqual({ taxa: 10, saidas: 1, headcount: 10 });
      expect(page.resumo?.involuntario).toEqual({ taxa: 10, saidas: 1, headcount: 10 });
      expect(page.rolling12m).toMatchObject({
        taxa: 20,
        saidas: 2,
        trimestreReferencia: '2025-Q4',
      });
      expect(page.trimestreAnterior).toBe('2025-Q3');
      expect(page.trimestreSeguinte).toBeNull();
      const q3 = await loadTurnoverPage(client.db, companyA, '2025-Q3');
      expect(q3.resumo?.total.saidas).toBe(0);
      expect(q3.trimestreSeguinte).toBe('2025-Q4');
      const naoFechado = await loadTurnoverPage(client.db, companyA, '2026-Q1');
      expect(naoFechado.resumo?.trimestre).toBe('2025-Q4');
    });

    it('drill-down traz o formulario gravado e marca evento antigo sem formulario', async () => {
      const vol = await listTurnoverDrilldown(client.db, companyA, '2025-Q4', 'voluntario');
      expect(vol).toHaveLength(1);
      expect(vol[0]?.name).toBe('V1 Voluntario');
      expect(vol[0]?.formulario).toEqual(FORMULARIO_VOLUNTARIO_TESTE);
      const inv = await listTurnoverDrilldown(client.db, companyA, '2025-Q4', 'involuntario');
      expect(inv).toHaveLength(1);
      expect(inv[0]?.formulario).toBeNull();
      expect(await listTurnoverDrilldown(client.db, companyA, '2026-Q1', 'voluntario')).toEqual([]);
      const forms = await loadTerminationFormsByEventIds(client.db, [
        vol[0]!.terminationEventId,
        inv[0]!.terminationEventId,
      ]);
      expect(forms.size).toBe(1);
      expect(forms.get(vol[0]!.terminationEventId)).toEqual(FORMULARIO_VOLUNTARIO_TESTE);
      expect((await loadTerminationFormsByEventIds(client.db, [])).size).toBe(0);
    });
  });

  describe('acesso (especificacao §7)', () => {
    it('RH tem drill-down; C-level acesso total nao; restrito e lider sem acesso', async () => {
      const rh = await resolveTurnoverAccess(client.db, platform('rh', idsA.rh, companyA), null);
      const ct = await resolveTurnoverAccess(
        client.db,
        platform('clevel', idsA.c1, companyA),
        null,
      );
      const cf = await resolveTurnoverAccess(
        client.db,
        platform('clevel', idsA.c2, companyA),
        null,
      );
      const lider = await resolveTurnoverAccess(
        client.db,
        platform('lider', idsA.lider, companyA),
        null,
      );
      expect(rh).toEqual({ companyId: companyA, podeDrilldown: true });
      expect(ct).toEqual({ companyId: companyA, podeDrilldown: false });
      expect(cf).toBeNull();
      expect(lider).toBeNull();
    });

    it('platform ignora companyId de outra empresa; Bruno exige empresa', async () => {
      const rh = await resolveTurnoverAccess(
        client.db,
        platform('rh', idsA.rh, companyA),
        companyB,
      );
      expect(rh?.companyId).toBe(companyA);
      const bruno = { kind: 'super_admin', superAdminId: 1, displayName: 'Bruno' } as ServerSession;
      expect(await resolveTurnoverAccess(client.db, bruno, companyB)).toEqual({
        companyId: companyB,
        podeDrilldown: true,
      });
      expect(await resolveTurnoverAccess(client.db, bruno, null)).toBeNull();
    });
  });

  describe('inativacao com formulario (transacao unica)', () => {
    it('employees.inactivate grava evento + Formulario A', async () => {
      const alvo = await seedEmployee(companyB, 'Alvo Voluntario B');
      const caller = await superAdminCaller((ctx) =>
        createCallerFactory(createEmployeesRouter())(ctx),
      );
      const res = await caller.inactivate({
        employeeId: alvo,
        motivoSaida: 'voluntario',
        formulario: FORMULARIO_VOLUNTARIO_TESTE,
      });
      const [form] = await client.db
        .select()
        .from(terminationVoluntaryInterviews)
        .where(eq(terminationVoluntaryInterviews.terminationEventId, res.terminationEventId));
      expect(form?.motivoPrincipal).toBe('proposta_externa');
      expect(form?.motivoSecundario1).toBe('falta_perspectiva_carreira');
      expect(form?.motivoSecundario2).toBeNull();
      const [emp] = await client.db.select().from(employees).where(eq(employees.id, alvo));
      expect(emp?.status).toBe('inativo');
    });

    it('formulario invalido nao inativa nem grava evento', async () => {
      const alvo = await seedEmployee(companyB, 'Alvo Invalido B');
      const caller = await superAdminCaller((ctx) =>
        createCallerFactory(createEmployeesRouter())(ctx),
      );
      await expect(
        caller.inactivate({
          employeeId: alvo,
          motivoSaida: 'voluntario',
          formulario: { ...FORMULARIO_VOLUNTARIO_TESTE, oQuePoderiaReter: 'curto demais' },
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(
        caller.inactivate({
          employeeId: alvo,
          motivoSaida: 'voluntario',
          formulario: FORMULARIO_INVOLUNTARIO_TESTE,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      const [emp] = await client.db.select().from(employees).where(eq(employees.id, alvo));
      expect(emp?.status).toBe('ativo');
      const evs = await client.db
        .select()
        .from(employeeTerminationEvents)
        .where(eq(employeeTerminationEvents.employeeId, alvo));
      expect(evs).toHaveLength(0);
    });

    it('leadershipTransfer.execute transfere liderados e grava Formulario B', async () => {
      const lider = await seedEmployee(companyB, 'Lider Saindo B', { isLider: true });
      const novoLider = await seedEmployee(companyB, 'Lider Ficando B', { isLider: true });
      const liderado = await seedEmployee(companyB, 'Liderado B');
      await client.db.insert(employeeLeaderHistory).values({
        employeeId: liderado,
        liderId: lider,
        clevelId: null,
        dataInicio: new Date('2021-03-01'),
        dataFim: null,
        reason: 'Seed ME-fila6 D2',
        transferBatchId: BATCH,
      });
      const caller = await superAdminCaller((ctx) =>
        createCallerFactory(createLeadershipTransferRouter())(ctx),
      );
      const res = await caller.execute({
        liderOriginalId: lider,
        mapeamento: [{ lideradoId: liderado, novoLiderId: novoLider, novoLiderTipo: 'employee' }],
        candidatosGrupo4: [],
        reason: 'x'.repeat(120),
        motivoSaida: 'involuntario',
        formulario: FORMULARIO_INVOLUNTARIO_TESTE,
      });
      const [form] = await client.db
        .select()
        .from(terminationInvoluntaryJustifications)
        .where(eq(terminationInvoluntaryJustifications.terminationEventId, res.terminationEventId));
      expect(form?.categoria).toBe('reducao_quadro');
      expect(form?.necessidadeReposicao).toBe(false);
      const [emp] = await client.db.select().from(employees).where(eq(employees.id, lider));
      expect(emp?.status).toBe('inativo');
    });
  });

  describe('documentos padrao', () => {
    it('roteiro e formulario trazem todas as opcoes fechadas e perguntas', () => {
      const roteiro = renderDocumentoPadraoBody('roteiro-voluntario');
      for (const label of Object.values(MOTIVO_SAIDA_VOLUNTARIA_LABELS)) {
        expect(roteiro).toContain(label);
      }
      for (const n of NOTAS_VOLUNTARIO) {
        expect(roteiro).toContain(n.label);
      }
      const formulario = renderDocumentoPadraoBody('formulario-involuntario');
      for (const label of Object.values(CATEGORIA_DESLIGAMENTO_INVOLUNTARIO_LABELS)) {
        expect(formulario).toContain(label);
      }
      expect(formulario).toContain(ORIENTACAO_JUSTIFICATIVA_INVOLUNTARIO);
      expect(DOCUMENTO_PADRAO_TIPOS.map((t) => parseDocumentoPadraoTipo(t))).toEqual([
        ...DOCUMENTO_PADRAO_TIPOS,
      ]);
      expect(parseDocumentoPadraoTipo('outro')).toBeNull();
    });
  });
});
