// ROIP APP 9BOX — teste de integracao ME-074 (landing §5.4 + D088 fix).
//
// Cobre canonicamente bit-exact contra MySQL real (RV-11):
//   1. Loaders puros de `internals.ts`:
//      - `loadCompanyForLanding` (companyId existente / inexistente).
//      - `loadLandingCounts` (contadores + flag hasResponsavelFinanceiro
//        via OR entre employees e cLevelMembers §5.7 CAMADA_NEGOCIO).
//      - `loadDepartmentCounts` (agregacao por departamento).
//      - `loadOnboardingSummaryCounts` (§21.3 CAMADA_OPERACOES —
//        equivalente canonico bit-exact ao SUM(estagio) do SQL literal).
//      - `loadLastClosedQuarter` (MAX trimestre por companyId).
//      - `loadLastQuarterFaturamentoMedio` (media aritmetica dos 3
//        meses do ultimo trimestre calculado).
//      - `loadMesAtualClosureStatus` (status canonico do fechamento
//        mensal do mes de referencia).
//   2. Helpers puros:
//      - `parseCompanyIdParam` (aceita positivo; rejeita '', '0', '-1',
//        '1a', 'abc', '1.5').
//      - `deriveMesAtual`, `deriveDataLimiteRh` (deterministicos).
//      - `formatFaturamentoMedio`, `formatTrimestre` (locale pt-BR).
//   3. D088 fix — `resolveMenuItems` com 3 argumentos:
//      - Sem `companyId`: hrefs mantem `[id]` literal (retrocompativel).
//      - Com `companyId`: hrefs bit-exact substituidos por String(id).
//      - Efeito canonico sobre `MENU_SUPER_ADMIN_IN_COMPANY` §3.2 (12
//        hrefs com `[id]`).
//      - Retrocompativel: MENU_SUPER_ADMIN_GLOBAL §3.1 nao tem `[id]`,
//        substituicao nao afeta.
//      - Aplicacao recursiva a `children` do item Logs administrativos.
//
// Faixa canonica desta ME (S497):
//   - Principal: CNPJ 10190000000001..049 (usada aqui).
//   - Auxiliar:  CNPJ 10200000000001..049 (reservada).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyMonthlyData,
  employees,
  monthlyClosureStatus,
  performanceQuarterlyData,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  deriveDataLimiteRh,
  deriveMesAtual,
  formatFaturamentoMedio,
  formatTrimestre,
  loadCompanyForLanding,
  loadDepartmentCounts,
  loadLandingCounts,
  loadLastClosedQuarter,
  loadLastQuarterFaturamentoMedio,
  loadMesAtualClosureStatus,
  loadOnboardingSummaryCounts,
  parseCompanyIdParam,
} from '../../src/app/super-admin/empresa/[id]/internals';
import {
  MENU_CONFIG_BY_PROFILE,
  resolveMenuItems,
  type MenuLinkItem,
} from '../../src/lib/menu/menuConfig';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa canonica ME-074 S497
const CNPJ_A = '10190000000001';
const CNPJ_B = '10190000000002';

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

describe('ME-074 — landing §5.4 + D088 fix (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    // Cleanup final canonico bit-exact seguindo padrao me057c: deleta
    // toda a arvore de FKs para nao contaminar suites subsequentes.
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    // Cleanup canonico bit-exact pattern me057c: maxWorkers=1 garante
    // isolamento entre arquivos de teste. Sem cleanup por FK (padrao
    // acumulador de companyIds), o beforeEach falha quando FKs
    // remanescentes de execucao anterior apontam para as companies.
    await client.db.delete(performanceQuarterlyData);
    await client.db.delete(companyMonthlyData);
    await client.db.delete(monthlyClosureStatus);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-074 A LTDA',
      nomeFantasia: 'ROIP ME-074 A',
      cnpj: CNPJ_A,
    });
    companyIdB = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-074 B LTDA',
      nomeFantasia: 'ROIP ME-074 B',
      cnpj: CNPJ_B,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyIdA, companyIdB]));
  });

  // ---------------------------------------------------------------------
  // 1. parseCompanyIdParam
  // ---------------------------------------------------------------------

  describe('parseCompanyIdParam', () => {
    it('aceita canonicamente inteiro positivo bit-exact', () => {
      expect(parseCompanyIdParam('1')).toBe(1);
      expect(parseCompanyIdParam('42')).toBe(42);
      expect(parseCompanyIdParam('999999')).toBe(999999);
    });

    it('rejeita canonicamente string vazia, zero, negativo, decimal', () => {
      expect(parseCompanyIdParam('')).toBe(null);
      expect(parseCompanyIdParam('0')).toBe(null);
      expect(parseCompanyIdParam('-1')).toBe(null);
      expect(parseCompanyIdParam('1.5')).toBe(null);
    });

    it('rejeita canonicamente lixo alfanumerico bit-exact', () => {
      expect(parseCompanyIdParam('1a')).toBe(null);
      expect(parseCompanyIdParam('abc')).toBe(null);
      expect(parseCompanyIdParam('12 ')).toBe(null);
      expect(parseCompanyIdParam(' 12')).toBe(null);
    });
  });

  // ---------------------------------------------------------------------
  // 2. loadCompanyForLanding
  // ---------------------------------------------------------------------

  describe('loadCompanyForLanding', () => {
    it('resolve canonicamente bit-exact empresa existente', async () => {
      const info = await loadCompanyForLanding(client.db, companyIdA);
      expect(info).not.toBe(null);
      if (info === null) return;
      expect(info.id).toBe(companyIdA);
      expect(info.nomeFantasia).toBe('ROIP ME-074 A');
      expect(info.status).toBe('ativa');
      expect(info.isDemo).toBe(false);
      expect(info.logoUrl).toBe(null);
    });

    it('retorna null bit-exact para companyId inexistente', async () => {
      const info = await loadCompanyForLanding(client.db, 999999);
      expect(info).toBe(null);
    });

    it('propaga canonicamente isDemo=true quando presente', async () => {
      await client.db.update(companies).set({ isDemo: true }).where(eq(companies.id, companyIdA));
      const info = await loadCompanyForLanding(client.db, companyIdA);
      expect(info?.isDemo).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 3. loadLandingCounts
  // ---------------------------------------------------------------------

  describe('loadLandingCounts', () => {
    it('empresa vazia retorna zeros bit-exact + hasResponsavelFinanceiro=false', async () => {
      const c = await loadLandingCounts(client.db, companyIdA);
      expect(c.totalColaboradoresAtivos).toBe(0);
      expect(c.totalCLevelsAtivos).toBe(0);
      expect(c.hasResponsavelFinanceiro).toBe(false);
    });

    it('conta canonicamente employees ativos e ignora inativos', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: '10000000001' });
      await seedEmployee({ companyId: companyIdA, cpf: '10000000002' });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000003',
        status: 'inativo',
      });
      const c = await loadLandingCounts(client.db, companyIdA);
      expect(c.totalColaboradoresAtivos).toBe(2);
    });

    it('conta canonicamente cLevels ativos e ignora inativos', async () => {
      await seedCLevel({ companyId: companyIdA, cpf: '20000000001', email: 'a@r.t' });
      await seedCLevel({
        companyId: companyIdA,
        cpf: '20000000002',
        email: 'b@r.t',
        status: 'inativo',
      });
      const c = await loadLandingCounts(client.db, companyIdA);
      expect(c.totalCLevelsAtivos).toBe(1);
    });

    it('hasResponsavelFinanceiro=true quando employee canonico ativo', async () => {
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000010',
        isResponsavelFinanceiro: true,
      });
      const c = await loadLandingCounts(client.db, companyIdA);
      expect(c.hasResponsavelFinanceiro).toBe(true);
    });

    it('hasResponsavelFinanceiro=true quando cLevel canonico ativo', async () => {
      await seedCLevel({
        companyId: companyIdA,
        cpf: '20000000010',
        email: 'c@r.t',
        isResponsavelFinanceiro: true,
      });
      const c = await loadLandingCounts(client.db, companyIdA);
      expect(c.hasResponsavelFinanceiro).toBe(true);
    });

    it('cross-tenant guard: contadores canonicos por companyId bit-exact', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: '10000000020' });
      await seedEmployee({
        companyId: companyIdB,
        cpf: '10000000021',
        isResponsavelFinanceiro: true,
      });
      const a = await loadLandingCounts(client.db, companyIdA);
      const b = await loadLandingCounts(client.db, companyIdB);
      expect(a.totalColaboradoresAtivos).toBe(1);
      expect(a.hasResponsavelFinanceiro).toBe(false);
      expect(b.totalColaboradoresAtivos).toBe(1);
      expect(b.hasResponsavelFinanceiro).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 4. loadDepartmentCounts
  // ---------------------------------------------------------------------

  describe('loadDepartmentCounts', () => {
    it('agrupa canonicamente por departamento bit-exact', async () => {
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000030',
        departamento: 'Comercial',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000031',
        departamento: 'Comercial',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000032',
        departamento: 'Administrativo',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000033',
        departamento: 'Administrativo',
        status: 'inativo',
      });
      const rows = await loadDepartmentCounts(client.db, companyIdA);
      const byDept = new Map(rows.map((r) => [r.departamento, r.total]));
      expect(byDept.get('Comercial')).toBe(2);
      expect(byDept.get('Administrativo')).toBe(1);
    });

    it('empresa vazia retorna array vazio bit-exact', async () => {
      const rows = await loadDepartmentCounts(client.db, companyIdA);
      expect(rows).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // 5. loadOnboardingSummaryCounts (§21.3)
  // ---------------------------------------------------------------------

  describe('loadOnboardingSummaryCounts', () => {
    it('empresa vazia: zeros canonicos bit-exact', async () => {
      const s = await loadOnboardingSummaryCounts(client.db, companyIdA);
      expect(s).toEqual({ treinar: 0, em_treinamento: 0, treinado: 0, reciclagem: 0 });
    });

    it('conta canonicamente por estagio bit-exact e ignora nao-lider', async () => {
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000040',
        isLider: true,
        onboardingEstagio: 'treinar',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000041',
        isLider: true,
        onboardingEstagio: 'em_treinamento',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000042',
        isLider: true,
        onboardingEstagio: 'em_treinamento',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000043',
        isLider: true,
        onboardingEstagio: 'treinado',
      });
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000044',
        isLider: false,
        onboardingEstagio: 'treinar',
      });
      const s = await loadOnboardingSummaryCounts(client.db, companyIdA);
      expect(s.treinar).toBe(1);
      expect(s.em_treinamento).toBe(2);
      expect(s.treinado).toBe(1);
      expect(s.reciclagem).toBe(0);
    });

    it('ignora canonicamente lideres inativos bit-exact', async () => {
      await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000045',
        isLider: true,
        onboardingEstagio: 'treinar',
        status: 'inativo',
      });
      const s = await loadOnboardingSummaryCounts(client.db, companyIdA);
      expect(s.treinar).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // 6. loadLastClosedQuarter + loadLastQuarterFaturamentoMedio
  // ---------------------------------------------------------------------

  describe('trimestre + faturamento medio', () => {
    it('sem dados: null bit-exact em ambos', async () => {
      expect(await loadLastClosedQuarter(client.db, companyIdA)).toBe(null);
      expect(await loadLastQuarterFaturamentoMedio(client.db, companyIdA)).toBe(null);
    });

    it('MAX trimestre bit-exact canonico', async () => {
      const empId = await seedEmployee({ companyId: companyIdA, cpf: '10000000050' });
      await client.db.insert(performanceQuarterlyData).values([
        { companyId: companyIdA, employeeId: empId, trimestre: '2025-Q1' },
        { companyId: companyIdA, employeeId: empId, trimestre: '2025-Q4' },
        { companyId: companyIdA, employeeId: empId, trimestre: '2025-Q2' },
      ]);
      const t = await loadLastClosedQuarter(client.db, companyIdA);
      expect(t).toBe('2025-Q4');
    });

    it('faturamento medio canonico bit-exact do ultimo trimestre (3 meses)', async () => {
      const empId = await seedEmployee({ companyId: companyIdA, cpf: '10000000051' });
      await client.db
        .insert(performanceQuarterlyData)
        .values({ companyId: companyIdA, employeeId: empId, trimestre: '2025-Q2' });
      await client.db.insert(companyMonthlyData).values([
        { companyId: companyIdA, mes: '2025-04', faturamentoBruto: '100000.00' },
        { companyId: companyIdA, mes: '2025-05', faturamentoBruto: '200000.00' },
        { companyId: companyIdA, mes: '2025-06', faturamentoBruto: '300000.00' },
        { companyId: companyIdA, mes: '2025-07', faturamentoBruto: '999999.99' },
      ]);
      const media = await loadLastQuarterFaturamentoMedio(client.db, companyIdA);
      expect(media).toBe(200000);
    });

    it('faturamento medio bit-exact ignora meses vazios do trimestre', async () => {
      const empId = await seedEmployee({ companyId: companyIdA, cpf: '10000000052' });
      await client.db
        .insert(performanceQuarterlyData)
        .values({ companyId: companyIdA, employeeId: empId, trimestre: '2025-Q1' });
      await client.db.insert(companyMonthlyData).values([
        { companyId: companyIdA, mes: '2025-01', faturamentoBruto: '100000.00' },
        { companyId: companyIdA, mes: '2025-02', faturamentoBruto: null },
        { companyId: companyIdA, mes: '2025-03', faturamentoBruto: '300000.00' },
      ]);
      const media = await loadLastQuarterFaturamentoMedio(client.db, companyIdA);
      expect(media).toBe(200000);
    });
  });

  // ---------------------------------------------------------------------
  // 7. loadMesAtualClosureStatus
  // ---------------------------------------------------------------------

  describe('loadMesAtualClosureStatus', () => {
    it('deriva canonicamente bit-exact mesAtual e dataLimiteRh do referencial', async () => {
      const status = await loadMesAtualClosureStatus(
        client.db,
        companyIdA,
        new Date('2026-03-15T12:00:00Z'),
      );
      expect(status.mesAtual).toBe('2026-03');
      expect(status.dataLimiteRh).toBe('2026-04-10');
      expect(status.rhPreenchido).toBe(false);
      expect(status.closureStatus).toBe(null);
    });

    it('rollover ano fiscal — mes 12 → data limite janeiro proximo ano', async () => {
      const status = await loadMesAtualClosureStatus(
        client.db,
        companyIdA,
        new Date('2026-12-05T00:00:00Z'),
      );
      expect(status.mesAtual).toBe('2026-12');
      expect(status.dataLimiteRh).toBe('2027-01-10');
    });

    it('rhPreenchido=true canonicamente bit-exact quando faturamentoBruto NOT NULL', async () => {
      await client.db
        .insert(companyMonthlyData)
        .values({ companyId: companyIdA, mes: '2026-03', faturamentoBruto: '50000.00' });
      const status = await loadMesAtualClosureStatus(
        client.db,
        companyIdA,
        new Date('2026-03-15T12:00:00Z'),
      );
      expect(status.rhPreenchido).toBe(true);
    });

    it('closureStatus canonicamente bit-exact da monthlyClosureStatus', async () => {
      await client.db
        .insert(monthlyClosureStatus)
        .values({ companyId: companyIdA, mes: '2026-03', status: 'fechado' });
      const status = await loadMesAtualClosureStatus(
        client.db,
        companyIdA,
        new Date('2026-03-15T12:00:00Z'),
      );
      expect(status.closureStatus).toBe('fechado');
    });
  });

  // ---------------------------------------------------------------------
  // 8. Helpers puros
  // ---------------------------------------------------------------------

  describe('deriveMesAtual + deriveDataLimiteRh', () => {
    it('deriva canonicamente bit-exact meses padded', () => {
      expect(deriveMesAtual(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
      expect(deriveMesAtual(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
    });

    it('dataLimiteRh canonica bit-exact dia 10 mes seguinte', () => {
      expect(deriveDataLimiteRh(new Date('2026-01-15T00:00:00Z'))).toBe('2026-02-10');
      expect(deriveDataLimiteRh(new Date('2026-12-01T00:00:00Z'))).toBe('2027-01-10');
    });
  });

  describe('formatFaturamentoMedio + formatTrimestre', () => {
    it('formata canonicamente bit-exact valor null como estado §5.2', () => {
      expect(formatFaturamentoMedio(null)).toBe('Coleta de dados em andamento');
      expect(formatTrimestre(null)).toBe('Coleta de dados em andamento');
    });

    it('formata trimestre canonico bit-exact YYYY-QN → NºTri/YYYY', () => {
      expect(formatTrimestre('2025-Q1')).toBe('1ºTri/2025');
      expect(formatTrimestre('2025-Q4')).toBe('4ºTri/2025');
      expect(formatTrimestre('2026-Q3')).toBe('3ºTri/2026');
    });

    it('formata faturamento canonicamente pt-BR bit-exact', () => {
      const formatted = formatFaturamentoMedio(200000);
      // R$ 200.000,00 — espaco separador pode ser NBSP em locales pt-BR
      expect(formatted).toMatch(/^R\$\s*200\.000,00$/);
    });
  });

  // ---------------------------------------------------------------------
  // 9. D088 fix — resolveMenuItems com companyId opcional
  // ---------------------------------------------------------------------

  describe('D088 fix — resolveMenuItems substitui [id] canonicamente bit-exact', () => {
    it('sem companyId: hrefs de super_admin_in_company preservam bit-exact [id] literal', () => {
      const items = resolveMenuItems('super_admin_in_company', false);
      expect(items).not.toBe(null);
      if (items === null) return;
      const painel = items.find(
        (i): i is MenuLinkItem => i.type === 'link' && i.label === 'Painel',
      );
      expect(painel?.href).toBe('/super-admin/empresa/[id]');
    });

    it('com companyId=1: substitui bit-exact [id] em todo href do menu §3.2', () => {
      const items = resolveMenuItems('super_admin_in_company', false, 1);
      expect(items).not.toBe(null);
      if (items === null) return;
      const hrefs = items.filter((i): i is MenuLinkItem => i.type === 'link').map((i) => i.href);
      expect(hrefs).toContain('/super-admin/empresa/1');
      expect(hrefs).toContain('/super-admin/empresa/1/todos-os-colaboradores');
      expect(hrefs).toContain('/super-admin/empresa/1/pendencias-portal');
      expect(hrefs).toContain('/super-admin/empresa/1/historico');
      expect(hrefs).toContain('/super-admin/empresa/1/onboarding-lideres');
      // Nenhum item pode conservar [id] literal apos substituicao.
      for (const href of hrefs) {
        expect(href).not.toContain('[id]');
      }
    });

    it('com companyId=42: preserva bit-exact numero canonico substituido', () => {
      const items = resolveMenuItems('super_admin_in_company', false, 42);
      expect(items).not.toBe(null);
      if (items === null) return;
      const painel = items.find(
        (i): i is MenuLinkItem => i.type === 'link' && i.label === 'Painel',
      );
      expect(painel?.href).toBe('/super-admin/empresa/42');
    });

    it('outro perfil sem [id] — substituicao canonica bit-exact e no-op', () => {
      const items = resolveMenuItems('super_admin_global', false, 99);
      expect(items).not.toBe(null);
      if (items === null) return;
      const hrefs = items.filter((i): i is MenuLinkItem => i.type === 'link').map((i) => i.href);
      expect(hrefs).toContain('/super-admin');
      expect(hrefs).toContain('/super-admin/desbloqueios');
      expect(hrefs).not.toContain('/super-admin/99');
    });

    it('substituicao canonica bit-exact aplica a children (Logs administrativos)', () => {
      const items = resolveMenuItems('super_admin_global', false, 7);
      expect(items).not.toBe(null);
      if (items === null) return;
      const logs = items.find(
        (i): i is MenuLinkItem => i.type === 'link' && i.label === 'Logs administrativos',
      );
      expect(logs?.children).toBeDefined();
      for (const c of logs?.children ?? []) {
        expect(c.href).not.toContain('[id]');
      }
    });

    it('retrocompatibilidade — 2 argumentos preservam assinatura anterior', () => {
      // Prova RV-03 canonica: chamadas de 2 argumentos usadas por consumidores
      // legados continuam funcionando bit-exact identicas ao pre-fix D088.
      const withUndefined = resolveMenuItems('rh', false, undefined);
      const withoutArg = resolveMenuItems('rh', false);
      expect(withUndefined).toEqual(withoutArg);
    });

    it('MENU_CONFIG_BY_PROFILE preserva canonicamente bit-exact [id] literal', () => {
      // O metadata canonico (config bruta exportada) NAO deve ser mutado
      // pela chamada — apenas a saida do `resolveMenuItems` e substituida.
      const raw = MENU_CONFIG_BY_PROFILE.super_admin_in_company;
      expect(raw).not.toBe(null);
      if (raw === null) return;
      resolveMenuItems('super_admin_in_company', false, 1);
      const painel = raw.find((i): i is MenuLinkItem => i.type === 'link' && i.label === 'Painel');
      // Config original preservada bit-exact — RV-09 canonica.
      expect(painel?.href).toBe('/super-admin/empresa/[id]');
    });
  });

  // ---------------------------------------------------------------------
  // Helpers de seed
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    departamento?: 'Comercial' | 'Administrativo' | 'Operações' | 'Financeiro' | 'Recursos Humanos';
    isLider?: boolean;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
    onboardingEstagio?: 'treinar' | 'em_treinamento' | 'treinado' | 'reciclagem';
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: `Titular ${overrides.cpf}`,
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: overrides.departamento ?? 'Comercial',
        isLider: overrides.isLider ?? false,
        isResponsavelFinanceiro: overrides.isResponsavelFinanceiro ?? false,
        status: overrides.status ?? 'ativo',
        onboardingEstagio: overrides.onboardingEstagio ?? 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedCLevel(overrides: {
    companyId: number;
    cpf: string;
    email: string;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: overrides.companyId,
        name: `C-Level ${overrides.cpf}`,
        cpf: overrides.cpf,
        email: overrides.email,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'Executivo',
        departamento: 'Administrativo',
        custoMensal: '20000.00',
        acessoTotal: true,
        isResponsavelFinanceiro: overrides.isResponsavelFinanceiro ?? false,
        status: overrides.status ?? 'ativo',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedCLevel sem id');
    }
    return row.id;
  }
});
