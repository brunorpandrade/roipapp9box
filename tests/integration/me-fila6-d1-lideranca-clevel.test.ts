// ROIP APP 9BOX — ME-fila6 D1 — contexto de menu platform, cadeia
// indireta, ficha cadastral e `/minha-equipe` para C-level (MySQL real).
//
// Cenario (empresa A):
//   C1 C-level acessoTotal=true + RF      C2 C-level acessoTotal=false
//   E1 Lider  (lider direto: C2)          E2 Lider  (lider direto: E1)
//   E3 Colab  (lider direto: E2)          E4 Colab  (lider direto: E1)
//   E5 RH puro                            E6 Lider  (unico liderado E7 inativo)
//   E7 Lider inativo (lider direto: E6)
// Empresa B: C3 C-level unico acessoTotal=false; E8 colaborador.
//
// Faixa CNPJ 940..949 (reservada sem uso na ME-fila5 D3).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import {
  loadPlatformMenuContext,
  type PlatformSession,
} from '../../src/lib/session/platformMenuContext';
import { createCompany } from '../../src/server/services/companies';
import { loadFichaCadastralForViewer } from '../../src/server/services/fichaCadastral';
import { listIndirectChainEmployeeIds } from '../../src/server/services/hierarchicalScope';
import {
  enforceCadeiaIndiretaFilters,
  listCadeiaIndireta,
  resolveCadeiaIndiretaAccess,
} from '../../src/app/cadeia-indireta/internals';
import { CANONICAL_COLABORADORES_DEFAULT_FILTERS } from '../../src/app/minha-equipe/filters';
import {
  enforceEmployeeLeaderScope,
  loadMinhaEquipePageForEmployeeLeader,
} from '../../src/app/minha-equipe/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_A = '10000000000940';
const CNPJ_B = '10000000000941';
const BATCH = '00000000-0000-0000-0000-000000000f61';

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

describe('ME-fila6 D1 — lideranca e C-level (MySQL real)', () => {
  let client: RoipDbClient;
  let companyA = 0;
  let companyB = 0;
  const ids = {
    c1: 0,
    c2: 0,
    c3: 0,
    e1: 0,
    e2: 0,
    e3: 0,
    e4: 0,
    e5: 0,
    e6: 0,
    e7: 0,
    e8: 0,
  };

  function platform(
    role: PlatformSession['role'],
    userId: number,
    companyId: number,
  ): PlatformSession {
    return { kind: 'platform', role, userId, companyId };
  }

  async function cleanup(): Promise<void> {
    const companyRows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.cnpj, [CNPJ_A, CNPJ_B]));
    const companyIds = companyRows.map((r) => r.id);
    if (companyIds.length === 0) {
      return;
    }
    const empRows = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, companyIds));
    const empIds = empRows.map((r) => r.id);
    if (empIds.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
      await client.db.delete(employees).where(inArray(employees.id, empIds));
    }
    await client.db.delete(cLevelMembers).where(inArray(cLevelMembers.companyId, companyIds));
    await client.db.delete(companies).where(inArray(companies.id, companyIds));
  }

  async function seedClevel(
    companyId: number,
    cpf: string,
    name: string,
    acessoTotal: boolean,
    isResponsavelFinanceiro: boolean,
  ): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name,
        cpf,
        email: `${cpf}@roip.test`,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'Diretor',
        descricaoCargo: 'Executivo',
        departamento: 'Administrativo',
        custoMensal: '20000.00',
        acessoTotal,
        isResponsavelFinanceiro,
        status: 'ativo',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedClevel sem id');
    }
    return row.id;
  }

  async function seedEmployee(
    companyId: number,
    cpf: string,
    name: string,
    opts: { isLider?: boolean; isRH?: boolean; status?: 'ativo' | 'inativo' },
  ): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf,
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

  async function link(
    employeeId: number,
    leader: { liderId?: number; clevelId?: number },
  ): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId: leader.liderId ?? null,
      clevelId: leader.clevelId ?? null,
      dataInicio: new Date('2021-03-01'),
      dataFim: null,
      reason: 'Seed ME-fila6 D1',
      transferBatchId: BATCH,
    });
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-FILA6 D1 A LTDA',
      nomeFantasia: 'ROIP FILA6 A',
      cnpj: CNPJ_A,
    });
    companyB = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-FILA6 D1 B LTDA',
      nomeFantasia: 'ROIP FILA6 B',
      cnpj: CNPJ_B,
    });
    ids.c1 = await seedClevel(companyA, '54000000001', 'C1 Diretora Geral', true, true);
    ids.c2 = await seedClevel(companyA, '54000000002', 'C2 Diretor Operacoes', false, false);
    ids.c3 = await seedClevel(companyB, '54000000003', 'C3 Diretor Unico', false, false);
    ids.e1 = await seedEmployee(companyA, '54000000011', 'E1 Lider Nivel 1', { isLider: true });
    ids.e2 = await seedEmployee(companyA, '54000000012', 'E2 Lider Nivel 2', { isLider: true });
    ids.e3 = await seedEmployee(companyA, '54000000013', 'E3 Colaborador Nivel 3', {});
    ids.e4 = await seedEmployee(companyA, '54000000014', 'E4 Colaborador Nivel 2', {});
    ids.e5 = await seedEmployee(companyA, '54000000015', 'E5 RH Puro', { isRH: true });
    ids.e6 = await seedEmployee(companyA, '54000000016', 'E6 Lider C1', { isLider: true });
    ids.e7 = await seedEmployee(companyA, '54000000017', 'E7 Lider Inativo', {
      isLider: true,
      status: 'inativo',
    });
    ids.e8 = await seedEmployee(companyB, '54000000018', 'E8 Colaborador B', {});
    await link(ids.e1, { clevelId: ids.c2 });
    await link(ids.e2, { liderId: ids.e1 });
    await link(ids.e3, { liderId: ids.e2 });
    await link(ids.e4, { liderId: ids.e1 });
    await link(ids.e7, { liderId: ids.e6 });
    await link(ids.e8, { clevelId: ids.c3 });
  });

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  describe('loadPlatformMenuContext', () => {
    it('C-level acessoTotal=true com RF: clevel_full, faturamento no menu, sem sino', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('clevel', ids.c1, companyA));
      expect(ctx).not.toBeNull();
      expect(ctx?.profileKey).toBe('clevel_full');
      expect(ctx?.isResponsavelFinanceiro).toBe(true);
      expect(ctx?.showNotificationBell).toBe(false);
      expect(ctx?.cLevel).toEqual({ acessoTotal: true, cLevelCount: 2 });
      const hrefs = (ctx?.menuItems ?? []).map((i) => (i.type === 'link' ? i.href : '-'));
      expect(hrefs).toContain('/faturamento-mensal');
      expect(hrefs).toContain('/todos-os-colaboradores');
    });

    it('C-level multiplo acessoTotal=false: clevel_restricted com cadeia indireta', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('clevel', ids.c2, companyA));
      expect(ctx?.profileKey).toBe('clevel_restricted');
      const hrefs = (ctx?.menuItems ?? []).map((i) => (i.type === 'link' ? i.href : '-'));
      expect(hrefs).toContain('/cadeia-indireta');
      expect(hrefs).not.toContain('/todos-os-colaboradores');
      expect(hrefs).not.toContain('/faturamento-mensal');
    });

    it('C-level unico com acessoTotal=false resolve clevel_full (§3.8)', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('clevel', ids.c3, companyB));
      expect(ctx?.profileKey).toBe('clevel_full');
      expect(ctx?.cLevel?.cLevelCount).toBe(1);
    });

    it('C-level com companyId divergente retorna null (sem leitura cruzada)', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('clevel', ids.c3, companyA));
      expect(ctx).toBeNull();
    });

    it('Lider com liderado lider ativo: lider_c2, sem sino', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('lider', ids.e1, companyA));
      expect(ctx?.profileKey).toBe('lider_c2');
      expect(ctx?.hasDescendingChain).toBe(true);
      expect(ctx?.showNotificationBell).toBe(false);
      expect(ctx?.cLevel).toBeNull();
    });

    it('Lider cujo unico sub-lider esta inativo: lider_c1', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('lider', ids.e6, companyA));
      expect(ctx?.profileKey).toBe('lider_c1');
    });

    it('RH puro: sino presente', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('rh', ids.e5, companyA));
      expect(ctx?.profileKey).toBe('rh');
      expect(ctx?.showNotificationBell).toBe(true);
    });

    it('registro inexistente retorna null', async () => {
      const ctx = await loadPlatformMenuContext(client.db, platform('lider', 999999999, companyA));
      expect(ctx).toBeNull();
    });
  });

  describe('cadeia indireta (§14.12)', () => {
    it('C-level: cadeia abaixo dos diretos exclui o liderado direto', async () => {
      const out = await listIndirectChainEmployeeIds(client.db, companyA, {
        tipo: 'clevel',
        id: ids.c2,
      });
      expect(out).toEqual([ids.e2, ids.e3, ids.e4].sort((a, b) => a - b));
    });

    it('Lider employee: apenas o nivel abaixo dos diretos', async () => {
      const out = await listIndirectChainEmployeeIds(client.db, companyA, {
        tipo: 'employee',
        id: ids.e1,
      });
      expect(out).toEqual([ids.e3]);
    });

    it('acesso: CF e L2 passam; CT e L1 negam', async () => {
      const cf = await resolveCadeiaIndiretaAccess(client.db, platform('clevel', ids.c2, companyA));
      const l2 = await resolveCadeiaIndiretaAccess(client.db, platform('lider', ids.e1, companyA));
      const ct = await resolveCadeiaIndiretaAccess(client.db, platform('clevel', ids.c1, companyA));
      const l1 = await resolveCadeiaIndiretaAccess(client.db, platform('lider', ids.e6, companyA));
      expect(cf).not.toBeNull();
      expect(l2?.scopeEmployeeIds).toEqual([ids.e3]);
      expect(ct).toBeNull();
      expect(l1).toBeNull();
    });

    it('listagem respeita o escopo e ignora filtro de lider manipulado', async () => {
      const filtros = { ...CANONICAL_COLABORADORES_DEFAULT_FILTERS, liderId: ids.e2 };
      const result = await listCadeiaIndireta(client.db, companyA, [ids.e3], filtros);
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]?.name).toBe('E3 Colaborador Nivel 3');
      expect(enforceCadeiaIndiretaFilters(filtros).liderId).toBeNull();
    });

    it('escopo vazio retorna lista vazia', async () => {
      const result = await listCadeiaIndireta(
        client.db,
        companyA,
        [],
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
      );
      expect(result.totalCount).toBe(0);
      expect(result.rows).toEqual([]);
    });
  });

  describe('ficha cadastral (§14.10)', () => {
    it('RH le qualquer employee da empresa', async () => {
      const ficha = await loadFichaCadastralForViewer(
        client.db,
        platform('rh', ids.e5, companyA),
        companyA,
        ids.e3,
      );
      expect(ficha?.name).toBe('E3 Colaborador Nivel 3');
      expect(ficha?.liderName).toBe('E2 Lider Nivel 2');
      expect(ficha?.liderTipo).toBe('employee');
    });

    it('Lider le a propria cadeia e nao le fora dela', async () => {
      const viewer = platform('lider', ids.e1, companyA);
      const dentro = await loadFichaCadastralForViewer(client.db, viewer, companyA, ids.e3);
      const fora = await loadFichaCadastralForViewer(client.db, viewer, companyA, ids.e5);
      expect(dentro?.id).toBe(ids.e3);
      expect(fora).toBeNull();
    });

    it('CF le a propria cadeia; CT le a empresa inteira', async () => {
      const cf = platform('clevel', ids.c2, companyA);
      const ct = platform('clevel', ids.c1, companyA);
      const cfDireto = await loadFichaCadastralForViewer(client.db, cf, companyA, ids.e1);
      const cfFora = await loadFichaCadastralForViewer(client.db, cf, companyA, ids.e5);
      const ctFora = await loadFichaCadastralForViewer(client.db, ct, companyA, ids.e5);
      expect(cfDireto?.liderTipo).toBe('clevel');
      expect(cfDireto?.liderName).toBe('C2 Diretor Operacoes');
      expect(cfFora).toBeNull();
      expect(ctFora?.id).toBe(ids.e5);
    });

    it('bloqueia leitura cruzada entre empresas', async () => {
      const ct = platform('clevel', ids.c1, companyA);
      const cruzada = await loadFichaCadastralForViewer(client.db, ct, companyB, ids.e8);
      const bruno = await loadFichaCadastralForViewer(
        client.db,
        { kind: 'super_admin' },
        companyB,
        ids.e8,
      );
      const brunoEmpresaErrada = await loadFichaCadastralForViewer(
        client.db,
        { kind: 'super_admin' },
        companyA,
        ids.e8,
      );
      expect(cruzada).toBeNull();
      expect(bruno?.id).toBe(ids.e8);
      expect(brunoEmpresaErrada).toBeNull();
    });
  });

  describe('/minha-equipe para C-level', () => {
    it('escopo clevelId lista os liderados diretos do C-level', async () => {
      const data = await loadMinhaEquipePageForEmployeeLeader(
        client.db,
        companyA,
        ids.c2,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        'clevel',
      );
      expect(data.listResult.totalCount).toBe(1);
      expect(data.listResult.rows[0]?.name).toBe('E1 Lider Nivel 1');
    });

    it('C-level sem liderados diretos recebe lista vazia (estado vazio §5.5)', async () => {
      const data = await loadMinhaEquipePageForEmployeeLeader(
        client.db,
        companyA,
        ids.c1,
        CANONICAL_COLABORADORES_DEFAULT_FILTERS,
        'clevel',
      );
      expect(data.listResult.totalCount).toBe(0);
    });

    it('override de escopo aplica liderIdTipo=clevel', () => {
      const out = enforceEmployeeLeaderScope(CANONICAL_COLABORADORES_DEFAULT_FILTERS, 7, 'clevel');
      expect(out.liderId).toBe(7);
      expect(out.liderIdTipo).toBe('clevel');
    });
  });
});
