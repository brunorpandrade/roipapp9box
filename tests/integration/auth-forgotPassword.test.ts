// ROIP APP 9BOX — teste de integracao `auth.forgotPassword` (ME-022b).
//
// Cobre a ordem canonica a-d do DOC 02 §4.4 contra MySQL real, nos dois
// branches (CPF em `/`, email em `/login-super-admin`):
//
//   - Rate limit (§5.8): forgotPassword=3/15min; forgotPasswordSuperAdmin=
//     3/15min. Incremento a cada tentativa (S025).
//   - Anti-enumeracao total: resposta 200 identica encontrado/nao
//     encontrado/inativo/colaborador puro (§4.4 c, §13.2).
//   - Concorrencia §5.4: emitir dois tokens do mesmo tipo/usuario invalida
//     o primeiro (`usedAt=now`); apenas 1 ativo por (userType, userId, type).
//   - S019: CPF ambiguo cross-company trata como nao encontrado (nao gera
//     token, mesma resposta anti-enumeracao).
//   - S021: contrato `{ msg, enviado: true }`.
//
// Padrao S009: 2 companies locais com CNPJ unico. L32: cleanup em afterAll
// preservando `superAdmins` id=1. L36: datas < 2037.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull, ne } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  accessTokens,
  cLevelMembers,
  companies,
  employees,
  superAdmins,
} from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { verifyCredentialToken } from '../../src/server/auth/credentialToken';
import {
  authRouter,
  MSG_FORGOT_PASSWORD_SENT,
  MSG_RATE_LIMIT,
} from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { createCompany } from '../../src/server/services/companies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022b-forgotPassword';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';

// CNPJs canonicos reservados a esta ME (S009). Base 100000000030 e 031.
const CNPJ_A = '10000000003080';
const CNPJ_B = '10000000003160';

const CPF_RH_ATIVO = '40000010001';
const CPF_CLEVEL_ATIVO = '40000010002';
const CPF_EMPLOYEE_INATIVO = '40000010003';
const CPF_COLAB_PURO = '40000010004';
const CPF_AUSENTE = '99999999998';
const CPF_CROSS_COMPANY = '40000010005';

const IP_A = '10.0.0.20';
const IP_B = '10.0.0.21';

const createCaller = createCallerFactory(authRouter);

function makeSharedCtxFactory(client: RoipDbClient, ip: string) {
  const limiter = createRateLimiter();
  return () =>
    createContextInner({
      db: client.db,
      rateLimiter: limiter,
      bearerToken: null,
      ip,
    });
}

function ctxFresh(client: RoipDbClient, ip: string): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip,
  });
}

describe('auth.forgotPassword — ordem canonica §4.4 (ME-022b)', () => {
  let client: RoipDbClient;
  let hashOk: string;
  let companyIdA: number;
  let companyIdB: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashOk = await hashPassword(SENHA_OK, BCRYPT_COST_TEST);
  });

  afterAll(async () => {
    await client.db.delete(accessTokens);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(accessTokens);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ME-022b Empresa A LTDA',
      nomeFantasia: 'ME-022b A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua A, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal A',
      contatoPrincipalEmail: 'principal.a@me022b.test',
      contatoRHNome: 'RH A',
      contatoRHEmail: 'rh.a@me022b.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade A',
      contextoMercado: 'Mercado A',
      mesKickoff: 1,
    });
    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ME-022b Empresa B LTDA',
      nomeFantasia: 'ME-022b B',
      cnpj: CNPJ_B,
      telefone: '1633330002',
      endereco: 'Rua B, 2',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal B',
      contatoPrincipalEmail: 'principal.b@me022b.test',
      contatoRHNome: 'RH B',
      contatoRHEmail: 'rh.b@me022b.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade B',
      contextoMercado: 'Mercado B',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' });
  });

  async function seedEmployee(params: {
    companyId: number;
    cpf: string;
    isRH?: boolean;
    isLider?: boolean;
    status?: 'ativo' | 'inativo';
    name?: string;
  }): Promise<number> {
    const [insertResult] = await client.db
      .insert(employees)
      .values({
        companyId: params.companyId,
        name: params.name ?? 'Fulano Teste',
        cpf: params.cpf,
        email: `${params.cpf}@teste.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '2521-05',
        descricaoCBO: 'Analista',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: params.status ?? 'ativo',
        isRH: params.isRH ?? false,
        isLider: params.isLider ?? false,
        passwordHash: hashOk,
        passwordSet: true,
      })
      .$returningId();
    if (insertResult === undefined) {
      throw new Error('seed employee falhou');
    }
    return insertResult.id;
  }

  async function seedCLevel(companyId: number, cpf: string): Promise<number> {
    const [insertResult] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-level Teste',
        cpf,
        email: `${cpf}@teste.local`,
        dataNascimento: new Date('1970-01-01'),
        dataAdmissao: new Date('2020-06-01'),
        cargo: 'CEO',
        descricaoCargo: 'Chief Executive Officer',
        departamento: 'Diretoria',
        custoMensal: '50000.00',
        status: 'ativo',
        passwordHash: hashOk,
        passwordSet: true,
      })
      .$returningId();
    if (insertResult === undefined) {
      throw new Error('seed clevel falhou');
    }
    return insertResult.id;
  }

  async function seedSuperAdmin(email: string): Promise<number> {
    const [insertResult] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Super Admin Teste',
        email,
        passwordHash: hashOk,
      })
      .$returningId();
    if (insertResult === undefined) {
      throw new Error('seed super_admin falhou');
    }
    return insertResult.id;
  }

  // ---- Branch CPF (/) -------------------------------------------------

  describe('branch CPF (/)', () => {
    it('RH ativo encontrado → 200 anti-enumeracao + accessToken tipo=password_reset', async () => {
      const empId = await seedEmployee({
        companyId: companyIdA,
        cpf: CPF_RH_ATIVO,
        isRH: true,
      });

      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ cpf: CPF_RH_ATIVO });

      expect(result).toEqual({ msg: MSG_FORGOT_PASSWORD_SENT, enviado: true });

      const activeTokens = await client.db
        .select()
        .from(accessTokens)
        .where(
          and(
            eq(accessTokens.userType, 'employee'),
            eq(accessTokens.userId, empId),
            eq(accessTokens.type, 'password_reset'),
            isNull(accessTokens.usedAt),
          ),
        );
      expect(activeTokens).toHaveLength(1);
      const singleToken = activeTokens[0];
      if (singleToken !== undefined) {
        const claimsResult = await verifyCredentialToken(singleToken.token);
        expect(claimsResult.valid).toBe(true);
        if (claimsResult.valid) {
          expect(claimsResult.claims.userType).toBe('employee');
          expect(claimsResult.claims.userId).toBe(empId);
          expect(claimsResult.claims.tipo).toBe('reset');
        }
        // expiresAt ~= now + 7 dias
        const ttl = singleToken.expiresAt.getTime() - singleToken.createdAt!.getTime();
        expect(ttl).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
        expect(ttl).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
      }
    });

    it('C-level ativo encontrado → gera token userType=clevel', async () => {
      const cleId = await seedCLevel(companyIdA, CPF_CLEVEL_ATIVO);

      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ cpf: CPF_CLEVEL_ATIVO });

      expect(result.enviado).toBe(true);
      const rows = await client.db
        .select()
        .from(accessTokens)
        .where(and(eq(accessTokens.userType, 'clevel'), eq(accessTokens.userId, cleId)));
      expect(rows).toHaveLength(1);
    });

    it('CPF nao encontrado → 200 identica, NAO gera token', async () => {
      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ cpf: CPF_AUSENTE });
      expect(result).toEqual({ msg: MSG_FORGOT_PASSWORD_SENT, enviado: true });

      const rows = await client.db.select().from(accessTokens);
      expect(rows).toHaveLength(0);
    });

    it('CPF de employee inativo → 200 identica, NAO gera token', async () => {
      await seedEmployee({
        companyId: companyIdA,
        cpf: CPF_EMPLOYEE_INATIVO,
        isRH: true,
        status: 'inativo',
      });

      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ cpf: CPF_EMPLOYEE_INATIVO });
      expect(result.enviado).toBe(true);

      const rows = await client.db.select().from(accessTokens);
      expect(rows).toHaveLength(0);
    });

    it('CPF de colaborador puro (sem RH nem lider) → 200 identica, NAO gera token', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: CPF_COLAB_PURO });

      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ cpf: CPF_COLAB_PURO });
      expect(result.enviado).toBe(true);

      const rows = await client.db.select().from(accessTokens);
      expect(rows).toHaveLength(0);
    });

    it('CPF ambiguo cross-company (S019) → 200 identica, NAO gera token', async () => {
      await seedEmployee({ companyId: companyIdA, cpf: CPF_CROSS_COMPANY, isRH: true });
      await seedEmployee({ companyId: companyIdB, cpf: CPF_CROSS_COMPANY, isRH: true });

      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ cpf: CPF_CROSS_COMPANY });
      expect(result.enviado).toBe(true);

      const rows = await client.db.select().from(accessTokens);
      expect(rows).toHaveLength(0);
    });

    it('concorrencia §5.4: 2 chamadas → 1o vira usado, 1 ativo apenas', async () => {
      const empId = await seedEmployee({
        companyId: companyIdA,
        cpf: CPF_RH_ATIVO,
        isRH: true,
      });

      const ctx = ctxFresh(client, IP_A);
      const caller = createCaller(ctx);
      await caller.forgotPassword({ cpf: CPF_RH_ATIVO });
      // segunda chamada em ctx com limiter distinto para nao esbarrar em rate limit
      const caller2 = createCaller(ctxFresh(client, IP_B));
      await caller2.forgotPassword({ cpf: CPF_RH_ATIVO });

      const all = await client.db
        .select()
        .from(accessTokens)
        .where(and(eq(accessTokens.userType, 'employee'), eq(accessTokens.userId, empId)));
      expect(all).toHaveLength(2);

      const active = all.filter((r) => r.usedAt === null);
      const used = all.filter((r) => r.usedAt !== null);
      expect(active).toHaveLength(1);
      expect(used).toHaveLength(1);
    });

    it('rate limit: 3 chamadas OK, 4a → TOO_MANY_REQUESTS canonico', async () => {
      const makeCtx = makeSharedCtxFactory(client, IP_A);
      // 3 tentativas para CPF ausente
      for (let i = 0; i < 3; i++) {
        const caller = createCaller(makeCtx());
        await caller.forgotPassword({ cpf: CPF_AUSENTE });
      }
      const caller4 = createCaller(makeCtx());
      await expect(caller4.forgotPassword({ cpf: CPF_AUSENTE })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        message: MSG_RATE_LIMIT,
      });
    });

    it('zod refine: nem cpf nem email → BAD_REQUEST', async () => {
      const caller = createCaller(ctxFresh(client, IP_A));
      await expect(caller.forgotPassword({})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('zod refine: cpf E email → BAD_REQUEST', async () => {
      const caller = createCaller(ctxFresh(client, IP_A));
      await expect(
        caller.forgotPassword({ cpf: CPF_RH_ATIVO, email: 'x@y.com' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ---- Branch email (/login-super-admin) ------------------------------

  describe('branch email (/login-super-admin)', () => {
    const EMAIL_A = 'sa-me022b-a@teste.local';
    const EMAIL_AUSENTE = 'sa-me022b-ausente@teste.local';

    it('email de super_admin encontrado → 200 + accessToken tipo=password_reset', async () => {
      const admId = await seedSuperAdmin(EMAIL_A);

      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ email: EMAIL_A });

      expect(result).toEqual({ msg: MSG_FORGOT_PASSWORD_SENT, enviado: true });
      const rows = await client.db
        .select()
        .from(accessTokens)
        .where(and(eq(accessTokens.userType, 'super_admin'), eq(accessTokens.userId, admId)));
      expect(rows).toHaveLength(1);
      const single = rows[0];
      if (single !== undefined) {
        expect(single.type).toBe('password_reset');
        expect(single.usedAt).toBeNull();
        const parsed = await verifyCredentialToken(single.token);
        expect(parsed.valid).toBe(true);
      }
    });

    it('email nao encontrado → 200 identica, NAO gera token', async () => {
      const caller = createCaller(ctxFresh(client, IP_A));
      const result = await caller.forgotPassword({ email: EMAIL_AUSENTE });
      expect(result.enviado).toBe(true);

      const rows = await client.db.select().from(accessTokens);
      expect(rows).toHaveLength(0);
    });

    it('rate limit (chave forgot-password-super-admin): 3 OK, 4a → 429', async () => {
      const makeCtx = makeSharedCtxFactory(client, IP_A);
      for (let i = 0; i < 3; i++) {
        const caller = createCaller(makeCtx());
        await caller.forgotPassword({ email: EMAIL_AUSENTE });
      }
      const caller4 = createCaller(makeCtx());
      await expect(caller4.forgotPassword({ email: EMAIL_AUSENTE })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        message: MSG_RATE_LIMIT,
      });
    });
  });
});
