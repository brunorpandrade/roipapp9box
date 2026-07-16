// ROIP APP 9BOX — teste de integracao `auth.firstAccess` (ME-022b).
//
// Cobre a ordem canonica do DOC 02 §4.5 passo 9-11 para primeiro acesso
// contra MySQL real. Diferencas do `resetPassword`:
//
//   - `tipo='first_access'`, cruzado com `type='first_access'` no
//     accessTokens.
//   - Update grava tambem `passwordSet=true` (libera o botao de login,
//     §5.5).
//   - S026: `userType='super_admin'` e rejeitado canonicamente
//     (Bruno nasce com senha semeada; §5.4 lista apenas password_reset
//     para superAdmins).
//
// Reuso dos escrutinios de token (assinatura, ausencia, usedAt,
// expiresAt) e provado no `resolveCredentialTokenForConsumption` do
// helper compartilhado com `validateToken`/`resetPassword`. Aqui foca em
// primeiro acesso: passwordSet transiciona false→true e S026.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, ne } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  accessTokens,
  cLevelMembers,
  companies,
  employees,
  superAdmins,
} from '../../src/db/schema';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { signCredentialToken } from '../../src/server/auth/credentialToken';
import {
  authRouter,
  MSG_PASSWORD_CHANGED_SUCCESS,
  MSG_PASSWORD_POLICY,
  MSG_TOKEN_EXPIRED,
} from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { createCompany } from '../../src/server/services/companies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022b-firstAccess';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_NOVA = 'PrimeiraSenha1';

const CNPJ_A = '10000000003403';
const CPF_EMP = '70000010001';
const CPF_CLEVEL = '70000010002';
const IP_A = '10.0.0.50';

const createCaller = createCallerFactory(authRouter);

function ctxFresh(client: RoipDbClient): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip: IP_A,
  });
}

describe('auth.firstAccess — ordem canonica §4.5 + S026 (ME-022b)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
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

    companyId = await createCompany(client.db, {
      razaoSocial: 'ME-022b-first LTDA',
      nomeFantasia: 'ME-022b-first',
      cnpj: CNPJ_A,
      telefone: '1633330300',
      endereco: 'Rua F, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'principal@me022b-first.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh@me022b-first.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade',
      contextoMercado: 'Mercado',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyId));
  });

  async function seedEmployee(): Promise<number> {
    // Novo colaborador SEM passwordHash (passwordSet=false).
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Novo Emp',
        cpf: CPF_EMP,
        email: `${CPF_EMP}@teste.local`,
        dataNascimento: new Date('1995-01-01'),
        dataAdmissao: new Date('2026-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: 'ativo',
        isRH: true,
        isLider: false,
        passwordHash: null,
        passwordSet: false,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed employee falhou');
    }
    return row.id;
  }

  async function seedCLevel(): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'Novo C-level',
        cpf: CPF_CLEVEL,
        email: `${CPF_CLEVEL}@teste.local`,
        dataNascimento: new Date('1970-01-01'),
        dataAdmissao: new Date('2026-01-01'),
        cargo: 'CTO',
        descricaoCargo: 'Chief Technology Officer',
        departamento: 'Diretoria',
        custoMensal: '40000.00',
        status: 'ativo',
        passwordHash: null,
        passwordSet: false,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed clevel falhou');
    }
    return row.id;
  }

  async function emitFirstAccessToken(
    userType: 'employee' | 'clevel' | 'super_admin',
    userId: number,
  ): Promise<string> {
    const token = await signCredentialToken({
      userId,
      tipo: 'first_access',
      userType,
    });
    await client.db.insert(accessTokens).values({
      userType,
      userId,
      token,
      type: 'first_access',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return token;
  }

  it('sucesso employee: grava hash+passwordSet=true+usedAt, msg canonica', async () => {
    const empId = await seedEmployee();
    const token = await emitFirstAccessToken('employee', empId);

    const caller = createCaller(ctxFresh(client));
    const result = await caller.firstAccess({ token, novaSenha: SENHA_NOVA });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGED_SUCCESS });

    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    const only = emp[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      expect(only.passwordSet).toBe(true);
      expect(only.passwordHash).not.toBeNull();
      const ok = await verifyPassword(SENHA_NOVA, only.passwordHash ?? '');
      expect(ok).toBe(true);
    }

    const tk = await client.db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.token, token))
      .limit(1);
    expect(tk[0]?.usedAt).not.toBeNull();
  });

  it('sucesso clevel: grava hash e passwordSet=true', async () => {
    const cleId = await seedCLevel();
    const token = await emitFirstAccessToken('clevel', cleId);

    const caller = createCaller(ctxFresh(client));
    const result = await caller.firstAccess({ token, novaSenha: SENHA_NOVA });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGED_SUCCESS });

    const cle = await client.db
      .select()
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, cleId))
      .limit(1);
    const only = cle[0];
    if (only !== undefined) {
      expect(only.passwordSet).toBe(true);
      expect(only.passwordHash).not.toBeNull();
    }
  });

  it('S026: userType=super_admin rejeitado com MSG_TOKEN_EXPIRED (anti-enumeracao)', async () => {
    // Cria super_admin novo (nao o fixture id=1) para nao interferir.
    const [row] = await client.db
      .insert(superAdmins)
      .values({
        name: 'SA Diversa',
        email: 'sa-first@teste.local',
        passwordHash: await hashPassword('SenhaOriginal1', BCRYPT_COST_TEST),
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    const token = await emitFirstAccessToken('super_admin', row.id);

    const caller = createCaller(ctxFresh(client));
    await expect(caller.firstAccess({ token, novaSenha: SENHA_NOVA })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });

    // Nada muda no super_admin.
    const sa = await client.db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.id, row.id))
      .limit(1);
    const only = sa[0];
    if (only !== undefined) {
      const ok = await verifyPassword('SenhaOriginal1', only.passwordHash);
      expect(ok).toBe(true);
    }
  });

  it('politica de senha: <8 chars → BAD_REQUEST + MSG_PASSWORD_POLICY', async () => {
    const empId = await seedEmployee();
    const token = await emitFirstAccessToken('employee', empId);
    const caller = createCaller(ctxFresh(client));
    await expect(caller.firstAccess({ token, novaSenha: 'Ab1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('politica de senha: sem letra → BAD_REQUEST', async () => {
    const empId = await seedEmployee();
    const token = await emitFirstAccessToken('employee', empId);
    const caller = createCaller(ctxFresh(client));
    await expect(caller.firstAccess({ token, novaSenha: '12345678' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('politica de senha: sem digito → BAD_REQUEST', async () => {
    const empId = await seedEmployee();
    const token = await emitFirstAccessToken('employee', empId);
    const caller = createCaller(ctxFresh(client));
    await expect(caller.firstAccess({ token, novaSenha: 'ApenasLetras' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('token de password_reset rejeitado em firstAccess (tipo incompativel)', async () => {
    const empId = await seedEmployee();
    // Emite token com tipo=reset e type=password_reset.
    const token = await signCredentialToken({
      userId: empId,
      tipo: 'reset',
      userType: 'employee',
    });
    await client.db.insert(accessTokens).values({
      userType: 'employee',
      userId: empId,
      token,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const caller = createCaller(ctxFresh(client));
    await expect(caller.firstAccess({ token, novaSenha: SENHA_NOVA })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('token invalido → BAD_REQUEST + MSG_TOKEN_EXPIRED', async () => {
    const caller = createCaller(ctxFresh(client));
    await expect(
      caller.firstAccess({ token: 'header.payload.badsig', novaSenha: SENHA_NOVA }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_TOKEN_EXPIRED });
  });
});
