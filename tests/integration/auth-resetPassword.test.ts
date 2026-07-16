// ROIP APP 9BOX — teste de integracao `auth.resetPassword` (ME-022b).
//
// Cobre a ordem canonica do DOC 02 §4.5 passo 9-11 contra MySQL real.
// Foco: sucesso grava hash + marca usedAt; politica de senha canonica;
// mesmo escrutinio de token que validateToken (via helper compartilhado);
// reset de super_admin muda passwordHash e (via S011) invalida sessoes.
//
// §4.5 "Regra canonica de reutilizacao": PERMITE nova senha igual a
// anterior (backend nao compara plaintext). Este teste tambem valida
// isso.

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

process.env.JWT_SECRET = 'test-secret-roip-me022b-resetPassword';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_ANTIGA = 'SenhaAntiga1';
const SENHA_NOVA = 'SenhaNova1';

const CNPJ_A = '10000000003322';
const CPF_ATIVO = '60000010001';
const IP_A = '10.0.0.40';

const createCaller = createCallerFactory(authRouter);

function ctxFresh(client: RoipDbClient): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip: IP_A,
  });
}

describe('auth.resetPassword — ordem canonica §4.5 (ME-022b)', () => {
  let client: RoipDbClient;
  let hashAntigo: string;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashAntigo = await hashPassword(SENHA_ANTIGA, BCRYPT_COST_TEST);
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
      razaoSocial: 'ME-022b-reset LTDA',
      nomeFantasia: 'ME-022b-reset',
      cnpj: CNPJ_A,
      telefone: '1633330200',
      endereco: 'Rua R, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'principal@me022b-reset.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh@me022b-reset.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade',
      contextoMercado: 'Mercado',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyId));
  });

  async function seedEmployee(): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp Reset',
        cpf: CPF_ATIVO,
        email: `${CPF_ATIVO}@teste.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: 'ativo',
        isRH: true,
        isLider: false,
        passwordHash: hashAntigo,
        passwordSet: true,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed employee falhou');
    }
    return row.id;
  }

  async function emitResetTokenForEmployee(empId: number): Promise<string> {
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
    return token;
  }

  it('sucesso: grava novo hash + usedAt + resposta MSG_PASSWORD_CHANGED_SUCCESS', async () => {
    const empId = await seedEmployee();
    const token = await emitResetTokenForEmployee(empId);

    const caller = createCaller(ctxFresh(client));
    const result = await caller.resetPassword({ token, novaSenha: SENHA_NOVA });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGED_SUCCESS });

    // hash deve ter mudado
    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    const only = emp[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      expect(only.passwordHash).not.toBe(hashAntigo);
      // nova senha valida
      const ok = await verifyPassword(SENHA_NOVA, only.passwordHash ?? '');
      expect(ok).toBe(true);
    }

    // token marcado como usado
    const tk = await client.db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.token, token))
      .limit(1);
    const tkRow = tk[0];
    expect(tkRow).toBeDefined();
    if (tkRow !== undefined) {
      expect(tkRow.usedAt).not.toBeNull();
    }
  });

  it('sucesso permite senha identica a anterior (§4.5 reutilizacao canonica)', async () => {
    const empId = await seedEmployee();
    const token = await emitResetTokenForEmployee(empId);

    const caller = createCaller(ctxFresh(client));
    const result = await caller.resetPassword({ token, novaSenha: SENHA_ANTIGA });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGED_SUCCESS });
    // Novo hash e diferente do antigo (salt aleatorio) mas verifyPassword
    // continua aceitando a mesma senha em plaintext — canonico permite.
    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    const only = emp[0];
    if (only !== undefined) {
      const ok = await verifyPassword(SENHA_ANTIGA, only.passwordHash ?? '');
      expect(ok).toBe(true);
    }
  });

  it('politica de senha: <8 chars → BAD_REQUEST + MSG_PASSWORD_POLICY', async () => {
    const empId = await seedEmployee();
    const token = await emitResetTokenForEmployee(empId);
    const caller = createCaller(ctxFresh(client));
    await expect(caller.resetPassword({ token, novaSenha: 'Ab1234' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('politica de senha: sem letra (so digitos) → BAD_REQUEST + MSG_PASSWORD_POLICY', async () => {
    const empId = await seedEmployee();
    const token = await emitResetTokenForEmployee(empId);
    const caller = createCaller(ctxFresh(client));
    await expect(caller.resetPassword({ token, novaSenha: '12345678' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('politica de senha: sem digito (so letras) → BAD_REQUEST + MSG_PASSWORD_POLICY', async () => {
    const empId = await seedEmployee();
    const token = await emitResetTokenForEmployee(empId);
    const caller = createCaller(ctxFresh(client));
    await expect(caller.resetPassword({ token, novaSenha: 'AbcdefghI' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('token invalido → BAD_REQUEST + MSG_TOKEN_EXPIRED (nao grava hash)', async () => {
    const empId = await seedEmployee();
    const caller = createCaller(ctxFresh(client));
    await expect(
      caller.resetPassword({ token: 'header.payload.badsig', novaSenha: SENHA_NOVA }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_TOKEN_EXPIRED });

    // hash antigo preservado
    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    expect(emp[0]?.passwordHash).toBe(hashAntigo);
  });

  it('token de first_access rejeitado em resetPassword (tipo incompativel)', async () => {
    const empId = await seedEmployee();
    // Emite token com tipo=first_access.
    const token = await signCredentialToken({
      userId: empId,
      tipo: 'first_access',
      userType: 'employee',
    });
    await client.db.insert(accessTokens).values({
      userType: 'employee',
      userId: empId,
      token,
      type: 'first_access',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const caller = createCaller(ctxFresh(client));
    await expect(caller.resetPassword({ token, novaSenha: SENHA_NOVA })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('reset de super_admin: atualiza passwordHash', async () => {
    const [row] = await client.db
      .insert(superAdmins)
      .values({
        name: 'SA Reset',
        email: 'sa-reset@teste.local',
        passwordHash: hashAntigo,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    const token = await signCredentialToken({
      userId: row.id,
      tipo: 'reset',
      userType: 'super_admin',
    });
    await client.db.insert(accessTokens).values({
      userType: 'super_admin',
      userId: row.id,
      token,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const caller = createCaller(ctxFresh(client));
    const result = await caller.resetPassword({ token, novaSenha: SENHA_NOVA });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGED_SUCCESS });

    const sa = await client.db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.id, row.id))
      .limit(1);
    const only = sa[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      expect(only.passwordHash).not.toBe(hashAntigo);
      const ok = await verifyPassword(SENHA_NOVA, only.passwordHash);
      expect(ok).toBe(true);
    }
  });
});
