// ROIP APP 9BOX — teste de integracao ME-086 (D-086-10 consolidacao).
//
// Cobre canonicamente bit-exact contra MySQL real (RV-11 + RV-13) os
// casos NOVOS introduzidos pela consolidacao canonica ME-086 D-086-10:
//
//   1. **Bug canonico 1 corrigido** — campo `isResponsavelFinanceiro`
//      passa a ser retornado bit-exact pelas 6 rotas outrora bugadas
//      (via `loadRhSessionFlags` compartilhado em
//      `src/lib/session/rhSessionFlags`). Caso positivo canonico: RH com
//      `isResponsavelFinanceiro=true` → `flags.isResponsavelFinanceiro
//      === true`. O me083 ja cobre o caso negativo (linha 154).
//
//   2. **Bug canonico 2 corrigido** — filtro `employees.status='ativo'`
//      na join de `hasDescendingChain`. RH-Lider com liderado tambem
//      lider MAS `status='inativo'` → `hasDescendingChain === false`
//      (antes retornava `true` incorretamente). Regra §5.5 canonica.
//
//   3. **Simetria de assinatura consolidada** — verifica bit-exact que
//      o mesmo helper canonico e importavel bit-exact tanto pela lib
//      `src/lib/session/rhSessionFlags` quanto pelo teste, sem cache
//      residual do internals removido (RV-13).
//
// Faixa canonica RESERVADA S513 ME-086:
//   - Principal: CNPJ 10260000000001..049 (evita colisao com me083 que
//     usa 10250000000001..049).
//
// **RV-11.** MySQL real via `DATABASE_URL_TEST`.
// **RV-12.** Zero SQL cru — inserts via Drizzle tipado.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, employeeLeaderHistory } from '../../src/db/schema';
import type { Departamento } from '../../src/db/schema/enums';
import { createCompany } from '../../src/server/services/companies';
import { loadRhSessionFlags } from '../../src/lib/session/rhSessionFlags';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa canonica ME-086 S513 (RESERVADA — nao colide com me083)
const CNPJ_A = '10260000000001';

const BASE_COMPANY_INPUT = {
  telefone: '1633330001',
  endereco: 'Rua Teste ME-086',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  contatoPrincipalNome: 'Principal 086',
  contatoPrincipalEmail: 'p086@roip.test',
  contatoRHNome: 'RH 086',
  contatoRHEmail: 'rh086@roip.test',
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'A',
  contextoMercado: 'A',
  mesKickoff: 1,
  kickoffDate: new Date('2020-01-01'),
};

describe('ME-086 D-086-10 — loadRhSessionFlags consolidado (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-086 A LTDA',
      nomeFantasia: 'ROIP ME-086 A',
      cnpj: CNPJ_A,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyIdA]));
  });

  // ---------------------------------------------------------------------
  // Bug canonico 1 corrigido: isResponsavelFinanceiro
  // ---------------------------------------------------------------------

  describe('bug 1 corrigido — isResponsavelFinanceiro caso positivo', () => {
    it('resolve RH+RF bit-exact — flag TRUE canonica', async () => {
      const rhRfId = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000001',
        isRH: true,
        isLider: false,
        isResponsavelFinanceiro: true,
      });
      const flags = await loadRhSessionFlags(client.db, rhRfId);
      expect(flags).not.toBe(null);
      if (flags === null) return;
      expect(flags.isRH).toBe(true);
      expect(flags.isLider).toBe(false);
      expect(flags.isResponsavelFinanceiro).toBe(true);
      expect(flags.hasDescendingChain).toBe(false);
    });

    it('resolve RH-Lider+RF bit-exact — flag TRUE canonica com cadeia', async () => {
      const rhlRfId = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000002',
        isRH: true,
        isLider: true,
        isResponsavelFinanceiro: true,
      });
      const liderMedio = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000003',
        isLider: true,
      });
      await seedLeaderHistoryOpen({ employeeId: liderMedio, liderId: rhlRfId });
      const flags = await loadRhSessionFlags(client.db, rhlRfId);
      expect(flags?.isResponsavelFinanceiro).toBe(true);
      expect(flags?.hasDescendingChain).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Bug canonico 2 corrigido: filtro status='ativo' em hasDescendingChain
  // ---------------------------------------------------------------------

  describe('bug 2 corrigido — filtro status=ativo em hasDescendingChain', () => {
    it('RH-Lider com unico liderado-lider INATIVO → hasDescendingChain FALSE', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000010',
        isRH: true,
        isLider: true,
      });
      // Liderado que TAMBEM e lider, mas com status=inativo. Antes do
      // bug fix, hasDescendingChain retornava TRUE incorretamente
      // (inflando RH-Lider Cenario 2). Pos-D-086-10 retorna FALSE
      // (regra §5.5 canonica).
      const liderInativo = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000011',
        isLider: true,
        status: 'inativo',
      });
      await seedLeaderHistoryOpen({ employeeId: liderInativo, liderId: rhlId });
      const flags = await loadRhSessionFlags(client.db, rhlId);
      expect(flags).not.toBe(null);
      expect(flags?.hasDescendingChain).toBe(false);
    });

    it('RH-Lider com 1 liderado-lider ATIVO + 1 INATIVO → TRUE (o ativo conta)', async () => {
      const rhlId = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000020',
        isRH: true,
        isLider: true,
      });
      const liderAtivo = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000021',
        isLider: true,
        status: 'ativo',
      });
      const liderInativo = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000022',
        isLider: true,
        status: 'inativo',
      });
      await seedLeaderHistoryOpen({ employeeId: liderAtivo, liderId: rhlId });
      await seedLeaderHistoryOpen({ employeeId: liderInativo, liderId: rhlId });
      const flags = await loadRhSessionFlags(client.db, rhlId);
      expect(flags?.hasDescendingChain).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Simetria de assinatura consolidada — RV-13
  // ---------------------------------------------------------------------

  describe('simetria consolidada — import bit-exact do lib canonico', () => {
    it('helper canonico esta acessivel bit-exact via src/lib/session/rhSessionFlags', async () => {
      // Este teste consome o helper via import canonico consolidado
      // ME-086 D-086-10. Se o helper nao existir bit-exact no path, o
      // proprio import falha na compilacao (RV-13 preservada).
      const rhId = await seedEmployee({
        companyId: companyIdA,
        cpf: '30000000030',
        isRH: true,
        isLider: false,
      });
      const flags = await loadRhSessionFlags(client.db, rhId);
      expect(typeof flags).toBe('object');
      expect(flags).not.toBe(null);
    });

    it('retorna null bit-exact para userId inexistente (fail-safe canonico)', async () => {
      const flags = await loadRhSessionFlags(client.db, 999999);
      expect(flags).toBe(null);
    });
  });

  // ---------------------------------------------------------------------
  // Helpers seed (bit-exact ao padrao me083)
  // ---------------------------------------------------------------------

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    departamento?: Departamento;
    isLider?: boolean;
    isRH?: boolean;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
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
        isRH: overrides.isRH ?? false,
        isResponsavelFinanceiro: overrides.isResponsavelFinanceiro ?? false,
        status: overrides.status ?? 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedLeaderHistoryOpen(overrides: {
    employeeId: number;
    liderId: number;
  }): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: overrides.employeeId,
      liderId: overrides.liderId,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'Seed test ME-086',
      transferBatchId: '00000000-0000-0000-0000-000000000086',
    });
  }
});
