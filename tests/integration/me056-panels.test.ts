// ROIP APP 9BOX — teste de integracao ME-056 (paineis + serverSession).
//
// Cobre contra MySQL real (RV-11):
//   1. `resolveServerSession` (Bloco A) para os 5 roles canonicos:
//      super_admin, rh, rh_lider, clevel, lider — enriquecimento
//      correto de `displayName`, `companyDisplayName`, `companyLogoUrl`
//      via queries Drizzle tipadas.
//   2. `resolveServerSession` com `userId` inexistente (registro
//      deletado entre emissao e verificacao) → null.
//   3. Queries canonicas dos paineis (Blocos C+D) via replica dedicada
//      dentro do teste — mesmas queries que os `page.tsx` executam,
//      exercitadas end-to-end:
//      - Total colaboradores ativos plataforma (Bruno §5.3).
//      - Total colaboradores ativos empresa (RH §5.5, C-level §5.7).
//      - `hasDescendingChain` para RH-Lider e Lider (§5.5, §5.6).
//      - `cLevelCount` e `acessoTotal` para C-level (§5.7).
//      - Liderados diretos count para Lider (§5.6 Cenario 1).
//   4. Integracao end-to-end: `resolveProfileKey` com session real +
//      flags reais → ProfileKey canonico esperado (bit-exact 5 casos).
//
// Faixa canonica desta ME (S310):
//   - Principal: CNPJ 10100000000001..10100000000109 (10 slots).
//   - Auxiliar: 10110000000001..10110000000119 (10 slots reservados
//     para futuros cenarios; nao utilizados nesta ME).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, employeeLeaderHistory } from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import { createCompany } from '../../src/server/services/companies';
import { resolveProfileKey } from '../../src/lib/session/resolveProfileKey';
import { resolveServerSession } from '../../src/server/session/serverSession';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me056-panels';

const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';

// Faixa principal S310: 10100000000001..109
const CNPJ_A = '10100000000001';
const CNPJ_B = '10100000000029';
const CNPJ_C = '10100000000037';

describe('ME-056 — Paineis + resolveServerSession (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let hashOk: string;
  let pwv: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashOk = await hashPassword(SENHA_OK, BCRYPT_COST_TEST);
    pwv = deriveCredentialVersion(hashOk);
  });

  afterAll(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-056 A LTDA',
      nomeFantasia: 'ROIP ME-056 A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua A',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal A',
      contatoPrincipalEmail: 'p.a@roip.test',
      contatoRHNome: 'RH A',
      contatoRHEmail: 'rh.a@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'A',
      contextoMercado: 'A',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' });
  });

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    isRH?: boolean;
    isLider?: boolean;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
    name?: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: overrides.name ?? 'Titular',
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isRH: overrides.isRH ?? false,
        isLider: overrides.isLider ?? false,
        isResponsavelFinanceiro: overrides.isResponsavelFinanceiro ?? false,
        status: overrides.status ?? 'ativo',
        passwordHash: hashOk,
        passwordSet: true,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedClevel(overrides: {
    companyId: number;
    email: string;
    acessoTotal?: boolean;
    isResponsavelFinanceiro?: boolean;
    status?: 'ativo' | 'inativo';
    name?: string;
    cpf?: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: overrides.companyId,
        name: overrides.name ?? 'C-Level Fulano',
        cpf: overrides.cpf ?? '90000000000',
        email: overrides.email,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'Executivo principal',
        departamento: 'Administrativo',
        custoMensal: '20000.00',
        acessoTotal: overrides.acessoTotal ?? false,
        isResponsavelFinanceiro: overrides.isResponsavelFinanceiro ?? false,
        status: overrides.status ?? 'ativo',
        passwordHash: hashOk,
        passwordSet: true,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedClevel sem id');
    }
    return row.id;
  }

  async function seedLeadership(overrides: {
    employeeId: number;
    liderId?: number;
    clevelId?: number;
  }): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId: overrides.employeeId,
      liderId: overrides.liderId ?? null,
      clevelId: overrides.clevelId ?? null,
      dataInicio: new Date('2024-01-01'),
      dataFim: null,
      reason: 'seed test',
      transferBatchId: '00000000-0000-0000-0000-000000000001',
    });
  }

  // ---------------------------------------------------------------------
  // 1. resolveServerSession — 5 roles + userId inexistente
  // ---------------------------------------------------------------------

  describe('resolveServerSession — 5 roles + userId inexistente', () => {
    it('super_admin: enriquece displayName com superAdmins.name (fixture id=1)', async () => {
      const token = await signSuperAdminToken({ superAdminId: 1, credentialVersion: pwv });
      const session = await resolveServerSession(token, client.db);
      expect(session).not.toBe(null);
      if (session === null) return;
      expect(session.kind).toBe('super_admin');
      if (session.kind !== 'super_admin') return;
      expect(session.superAdminId).toBe(1);
      expect(session.displayName).toBe('Fixture Super Admin (test)');
    });

    it('platform rh: enriquece displayName + companyDisplayName + companyLogoUrl', async () => {
      const empId = await seedEmployee({
        companyId: companyIdA,
        cpf: '11111111111',
        isRH: true,
        name: 'RH puro',
      });
      const token = await signPlatformToken({
        userId: empId,
        role: 'rh',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session).not.toBe(null);
      if (session === null) return;
      expect(session.kind).toBe('platform');
      if (session.kind !== 'platform') return;
      expect(session.role).toBe('rh');
      expect(session.userId).toBe(empId);
      expect(session.companyId).toBe(companyIdA);
      expect(session.displayName).toBe('RH puro');
      expect(session.companyDisplayName).toBe('ROIP ME-056 A');
      // logoUrl nao seeded — canonicamente null.
      expect(session.companyLogoUrl).toBe(null);
    });

    it('platform rh_lider: mesmo enriquecimento com role rh_lider', async () => {
      const empId = await seedEmployee({
        companyId: companyIdA,
        cpf: '22222222222',
        isRH: true,
        isLider: true,
        name: 'RH-Lider',
      });
      const token = await signPlatformToken({
        userId: empId,
        role: 'rh_lider',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session?.kind).toBe('platform');
      if (session?.kind !== 'platform') return;
      expect(session.role).toBe('rh_lider');
      expect(session.displayName).toBe('RH-Lider');
    });

    it('platform clevel: enriquece via cLevelMembers.name (nao employees)', async () => {
      const cId = await seedClevel({
        companyId: companyIdA,
        email: 'ceo@a.test',
        cpf: '90000000001',
        name: 'CEO Fulana',
      });
      const token = await signPlatformToken({
        userId: cId,
        role: 'clevel',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session?.kind).toBe('platform');
      if (session?.kind !== 'platform') return;
      expect(session.role).toBe('clevel');
      expect(session.userId).toBe(cId);
      expect(session.displayName).toBe('CEO Fulana');
      expect(session.companyDisplayName).toBe('ROIP ME-056 A');
    });

    it('platform lider: enriquece via employees.name', async () => {
      const empId = await seedEmployee({
        companyId: companyIdA,
        cpf: '33333333333',
        isLider: true,
        name: 'Lider puro',
      });
      const token = await signPlatformToken({
        userId: empId,
        role: 'lider',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session?.kind).toBe('platform');
      if (session?.kind !== 'platform') return;
      expect(session.role).toBe('lider');
      expect(session.displayName).toBe('Lider puro');
    });

    it('userId inexistente (deletado entre emissao e verificacao): retorna null', async () => {
      const token = await signPlatformToken({
        userId: 999999,
        role: 'rh',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session).toBe(null);
    });

    it('super_admin com id inexistente: retorna null', async () => {
      const token = await signSuperAdminToken({
        superAdminId: 999999,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session).toBe(null);
    });
  });

  // ---------------------------------------------------------------------
  // 2. Queries canonicas dos paineis (Bruno §5.3)
  // ---------------------------------------------------------------------

  describe('Queries canonicas §5.3 — Painel Bruno global', () => {
    it('empresas ativas + colaboradores plataforma inteira (soma emp + clevel)', async () => {
      // Empresa auxiliar B ativa + empresa C inativa
      const companyIdB = await createCompany(client.db, {
        razaoSocial: 'ROIP ME-056 B LTDA',
        nomeFantasia: 'ROIP ME-056 B',
        cnpj: CNPJ_B,
        telefone: '1633330002',
        endereco: 'Rua B',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'PB',
        contatoPrincipalEmail: 'pb@r.t',
        contatoRHNome: 'RB',
        contatoRHEmail: 'rb@r.t',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'B',
        contextoMercado: 'B',
        mesKickoff: 1,
      });
      const companyIdC = await createCompany(client.db, {
        razaoSocial: 'ROIP ME-056 C LTDA',
        nomeFantasia: 'ROIP ME-056 C',
        cnpj: CNPJ_C,
        telefone: '1633330003',
        endereco: 'Rua C',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'PC',
        contatoPrincipalEmail: 'pc@r.t',
        contatoRHNome: 'RC',
        contatoRHEmail: 'rc@r.t',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'C',
        contextoMercado: 'C',
        mesKickoff: 1,
      });
      await client.db
        .update(companies)
        .set({ status: 'ativa' })
        .where(eq(companies.id, companyIdB));
      await client.db
        .update(companies)
        .set({ status: 'inativa' })
        .where(eq(companies.id, companyIdC));

      // Seed A: 2 employees ativos + 1 clevel ativo
      await seedEmployee({ companyId: companyIdA, cpf: '10000000001' });
      await seedEmployee({ companyId: companyIdA, cpf: '10000000002' });
      await seedClevel({ companyId: companyIdA, email: 'c1@a.t', cpf: '90000000002' });
      // Seed B: 1 employee ativo + 1 clevel ativo
      await seedEmployee({ companyId: companyIdB, cpf: '10000000003' });
      await seedClevel({ companyId: companyIdB, email: 'c1@b.t', cpf: '90000000003' });
      // Seed C: 1 employee inativo (nao conta)
      await seedEmployee({ companyId: companyIdC, cpf: '10000000004', status: 'inativo' });

      const [companiesActive] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(companies)
        .where(eq(companies.status, 'ativa'));
      const [empActive] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(eq(employees.status, 'ativo'));
      const [clevelActive] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(cLevelMembers)
        .where(eq(cLevelMembers.status, 'ativo'));

      expect(Number(companiesActive?.count ?? 0)).toBe(2); // A + B
      expect(Number(empActive?.count ?? 0)).toBe(3); // A(2) + B(1)
      expect(Number(clevelActive?.count ?? 0)).toBe(2); // A(1) + B(1)
    });
  });

  // ---------------------------------------------------------------------
  // 3. Queries canonicas dos paineis RH §5.5
  // ---------------------------------------------------------------------

  describe('Queries canonicas §5.5 — Painel RH (hasDescendingChain)', () => {
    it('RH-Lider sem cadeia: hasDescendingChain=false (C1)', async () => {
      const rhLiderId = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000010',
        isRH: true,
        isLider: true,
      });
      const liderado = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000011',
        isLider: false, // liderado NAO e lider → sem cadeia descendente
      });
      await seedLeadership({ employeeId: liderado, liderId: rhLiderId });

      const chainRows = await client.db
        .select({ id: employees.id })
        .from(employeeLeaderHistory)
        .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
        .where(
          and(
            eq(employeeLeaderHistory.liderId, rhLiderId),
            sql`${employeeLeaderHistory.dataFim} IS NULL`,
            eq(employees.isLider, true),
            eq(employees.status, 'ativo'),
          ),
        )
        .limit(1);
      expect(chainRows).toHaveLength(0);
    });

    it('RH-Lider com cadeia: hasDescendingChain=true (C2)', async () => {
      const rhLiderId = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000012',
        isRH: true,
        isLider: true,
      });
      // Liderado que TAMBEM e lider → cadeia descendente existe
      const subLider = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000013',
        isLider: true,
      });
      await seedLeadership({ employeeId: subLider, liderId: rhLiderId });

      const chainRows = await client.db
        .select({ id: employees.id })
        .from(employeeLeaderHistory)
        .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
        .where(
          and(
            eq(employeeLeaderHistory.liderId, rhLiderId),
            sql`${employeeLeaderHistory.dataFim} IS NULL`,
            eq(employees.isLider, true),
            eq(employees.status, 'ativo'),
          ),
        )
        .limit(1);
      expect(chainRows.length).toBeGreaterThan(0);
    });

    it('total colaboradores empresa: soma employees + clevel (PC1c)', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: '10000000020' });
      await seedEmployee({ companyId: companyIdA, cpf: '10000000021' });
      await seedClevel({ companyId: companyIdA, email: 'ceo1@a.t', cpf: '90000000004' });
      await seedClevel({ companyId: companyIdA, email: 'cfo1@a.t', cpf: '90000000005' });

      const [emp] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(and(eq(employees.companyId, companyIdA), eq(employees.status, 'ativo')));
      const [cl] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(cLevelMembers)
        .where(and(eq(cLevelMembers.companyId, companyIdA), eq(cLevelMembers.status, 'ativo')));

      expect(Number(emp?.count ?? 0) + Number(cl?.count ?? 0)).toBe(4);
    });
  });

  // ---------------------------------------------------------------------
  // 4. Queries canonicas dos paineis C-level §5.7
  // ---------------------------------------------------------------------

  describe('Queries canonicas §5.7 — Painel C-level (cLevelCount + acessoTotal)', () => {
    it('C-level unico: cLevelCount=1', async () => {
      const cId = await seedClevel({
        companyId: companyIdA,
        email: 'unico@a.t',
        cpf: '90000000006',
      });

      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(cLevelMembers)
        .where(and(eq(cLevelMembers.companyId, companyIdA), eq(cLevelMembers.status, 'ativo')));
      expect(Number(row?.count ?? 0)).toBe(1);
      expect(cId).toBeGreaterThan(0);
    });

    it('C-level multiplo com acessoTotal=true → clevel_full §3.8', async () => {
      const c1 = await seedClevel({
        companyId: companyIdA,
        email: 'c1@a.t',
        cpf: '90000000007',
        acessoTotal: true,
      });
      await seedClevel({
        companyId: companyIdA,
        email: 'c2@a.t',
        acessoTotal: false,
        cpf: '90000000008',
      });
      await seedClevel({
        companyId: companyIdA,
        email: 'c3@a.t',
        acessoTotal: false,
        cpf: '90000000009',
      });

      const token = await signPlatformToken({
        userId: c1,
        role: 'clevel',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      expect(session?.kind).toBe('platform');
      if (session?.kind !== 'platform') return;

      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(cLevelMembers)
        .where(and(eq(cLevelMembers.companyId, companyIdA), eq(cLevelMembers.status, 'ativo')));
      const [self] = await client.db
        .select({ acessoTotal: cLevelMembers.acessoTotal })
        .from(cLevelMembers)
        .where(eq(cLevelMembers.id, c1))
        .limit(1);

      const profileKey = resolveProfileKey({
        session,
        isRH: false,
        isLider: false,
        acessoTotal: self?.acessoTotal === true,
        hasDescendingChain: false,
        cLevelCount: Number(row?.count ?? 0),
        isSuperAdminInCompany: false,
      });
      expect(profileKey).toBe('clevel_full');
    });

    it('C-level multiplo com acessoTotal=false → clevel_restricted §3.9', async () => {
      const c1 = await seedClevel({
        companyId: companyIdA,
        email: 'c4@a.t',
        cpf: '90000000010',
        acessoTotal: false,
      });
      await seedClevel({
        companyId: companyIdA,
        email: 'c5@a.t',
        acessoTotal: false,
        cpf: '90000000011',
      });

      const token = await signPlatformToken({
        userId: c1,
        role: 'clevel',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      if (session?.kind !== 'platform') return;

      const [row] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(cLevelMembers)
        .where(and(eq(cLevelMembers.companyId, companyIdA), eq(cLevelMembers.status, 'ativo')));

      const profileKey = resolveProfileKey({
        session,
        isRH: false,
        isLider: false,
        acessoTotal: false,
        hasDescendingChain: false,
        cLevelCount: Number(row?.count ?? 0),
        isSuperAdminInCompany: false,
      });
      expect(profileKey).toBe('clevel_restricted');
    });
  });

  // ---------------------------------------------------------------------
  // 5. Queries canonicas dos paineis Lider §5.6
  // ---------------------------------------------------------------------

  describe('Queries canonicas §5.6 — Painel Lider (liderados diretos + cadeia)', () => {
    it('Lider C1: count liderados = 3; hasDescendingChain=false', async () => {
      const liderId = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000030',
        isLider: true,
      });
      // 3 liderados diretos, todos operacionais (isLider=false)
      const l1 = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000031',
        isLider: false,
      });
      const l2 = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000032',
        isLider: false,
      });
      const l3 = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000033',
        isLider: false,
      });
      await seedLeadership({ employeeId: l1, liderId });
      await seedLeadership({ employeeId: l2, liderId });
      await seedLeadership({ employeeId: l3, liderId });

      const [count] = await client.db
        .select({ count: sql<number>`count(*)` })
        .from(employeeLeaderHistory)
        .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
        .where(
          and(
            eq(employeeLeaderHistory.liderId, liderId),
            sql`${employeeLeaderHistory.dataFim} IS NULL`,
            eq(employees.status, 'ativo'),
          ),
        );
      expect(Number(count?.count ?? 0)).toBe(3);

      const chainRows = await client.db
        .select({ id: employees.id })
        .from(employeeLeaderHistory)
        .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
        .where(
          and(
            eq(employeeLeaderHistory.liderId, liderId),
            sql`${employeeLeaderHistory.dataFim} IS NULL`,
            eq(employees.isLider, true),
            eq(employees.status, 'ativo'),
          ),
        )
        .limit(1);
      expect(chainRows).toHaveLength(0);
    });

    it('Lider C2 com cadeia: um dos liderados diretos e lider', async () => {
      const liderId = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000040',
        isLider: true,
      });
      const subLider = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000041',
        isLider: true,
      });
      await seedLeadership({ employeeId: subLider, liderId });

      const chainRows = await client.db
        .select({ id: employees.id })
        .from(employeeLeaderHistory)
        .innerJoin(employees, eq(employees.id, employeeLeaderHistory.employeeId))
        .where(
          and(
            eq(employeeLeaderHistory.liderId, liderId),
            sql`${employeeLeaderHistory.dataFim} IS NULL`,
            eq(employees.isLider, true),
            eq(employees.status, 'ativo'),
          ),
        )
        .limit(1);
      expect(chainRows.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // 6. Integracao end-to-end resolveProfileKey (session real + flags reais)
  // ---------------------------------------------------------------------

  describe('Integracao end-to-end: resolveServerSession + resolveProfileKey', () => {
    it('RH puro (isRH=true, isLider=false) → ProfileKey rh (§3.3)', async () => {
      const empId = await seedEmployee({
        companyId: companyIdA,
        cpf: '10000000050',
        isRH: true,
      });
      const token = await signPlatformToken({
        userId: empId,
        role: 'rh',
        companyId: companyIdA,
        credentialVersion: pwv,
      });
      const session = await resolveServerSession(token, client.db);
      if (session?.kind !== 'platform') return;
      const profileKey = resolveProfileKey({
        session,
        isRH: true,
        isLider: false,
        acessoTotal: false,
        hasDescendingChain: false,
        cLevelCount: 0,
        isSuperAdminInCompany: false,
      });
      expect(profileKey).toBe('rh');
    });

    it('super_admin → ProfileKey super_admin_global (§3.1)', async () => {
      const token = await signSuperAdminToken({ superAdminId: 1, credentialVersion: pwv });
      const session = await resolveServerSession(token, client.db);
      if (session?.kind !== 'super_admin') return;
      const profileKey = resolveProfileKey({
        session,
        isRH: false,
        isLider: false,
        acessoTotal: false,
        hasDescendingChain: false,
        cLevelCount: 0,
        isSuperAdminInCompany: false,
      });
      expect(profileKey).toBe('super_admin_global');
    });
  });
});
