// ROIP APP 9BOX — teste de integracao `auth.validateToken` (ME-022b).
//
// Cobre a ordem canonica de validacao do DOC 02 §4.5 passo 4 (a-d) contra
// MySQL real. Cenarios:
//
//   - Sucesso: token valido, tipo bate com registro, titular ativo →
//     retorna `{ userName, tipo }` (S021).
//   - Falhas (todas com msg canonica unificada MSG_TOKEN_EXPIRED, §13.2):
//     assinatura invalida; ausente em `accessTokens`; `usedAt IS NOT NULL`
//     (ja consumido); `expiresAt` passado; `type` do registro nao bate com
//     `tipo` requisitado; `userType`/`userId` do payload divergente do
//     registro; titular ausente ou inativo (403).
//
// Padrao S009: company local com CNPJ unico. L32: cleanup em afterAll.

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
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { signCredentialToken } from '../../src/server/auth/credentialToken';
import { authRouter, MSG_TOKEN_EXPIRED } from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';
import { createCompany } from '../../src/server/services/companies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022b-validateToken';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';

// CNPJ canonico reservado (S009). Base 100000000032.
const CNPJ_A = '10000000003241';

const CPF_ATIVO = '50000010001';
const CPF_INATIVO = '50000010002';

const IP_A = '10.0.0.30';

const createCaller = createCallerFactory(authRouter);

function ctxFresh(client: RoipDbClient): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip: IP_A,
  });
}

describe('auth.validateToken — ordem canonica §4.5 passo 4 (ME-022b)', () => {
  let client: RoipDbClient;
  let hashOk: string;
  let companyId: number;

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

    companyId = await createCompany(client.db, {
      razaoSocial: 'ME-022b-validate LTDA',
      nomeFantasia: 'ME-022b-validate',
      cnpj: CNPJ_A,
      telefone: '1633330100',
      endereco: 'Rua V, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'principal@me022b-validate.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh@me022b-validate.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade',
      contextoMercado: 'Mercado',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyId));
  });

  async function seedEmployee(params: {
    cpf: string;
    status?: 'ativo' | 'inativo';
    name?: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: params.name ?? 'Emp Teste',
        cpf: params.cpf,
        email: `${params.cpf}@teste.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: params.status ?? 'ativo',
        isRH: true,
        isLider: false,
        passwordHash: hashOk,
        passwordSet: true,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed employee falhou');
    }
    return row.id;
  }

  async function emitToken(params: {
    userType: 'employee' | 'clevel' | 'super_admin';
    userId: number;
    type: 'password_reset' | 'first_access';
    expiresAt?: Date;
    usedAt?: Date;
  }): Promise<string> {
    const tipo = params.type === 'first_access' ? 'first_access' : 'reset';
    const token = await signCredentialToken({
      userId: params.userId,
      tipo,
      userType: params.userType,
    });
    await client.db.insert(accessTokens).values({
      userType: params.userType,
      userId: params.userId,
      token,
      type: params.type,
      expiresAt: params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      usedAt: params.usedAt ?? null,
    });
    return token;
  }

  // ---- Sucesso ------------------------------------------------------

  it('token valido de reset → retorna { userName, tipo: reset }', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO, name: 'Fulana Alpha' });
    const token = await emitToken({
      userType: 'employee',
      userId: empId,
      type: 'password_reset',
    });

    const caller = createCaller(ctxFresh(client));
    const result = await caller.validateToken({ token, tipo: 'reset' });
    expect(result).toEqual({ userName: 'Fulana Alpha', tipo: 'reset' });
  });

  it('token valido de first_access → retorna { userName, tipo: first_access }', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO, name: 'Fulano Beta' });
    const token = await emitToken({
      userType: 'employee',
      userId: empId,
      type: 'first_access',
    });

    const caller = createCaller(ctxFresh(client));
    const result = await caller.validateToken({ token, tipo: 'first_access' });
    expect(result).toEqual({ userName: 'Fulano Beta', tipo: 'first_access' });
  });

  it('token de super_admin valido → retorna userName do super_admin', async () => {
    const [row] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Super Gamma',
        email: 'sa-validate@teste.local',
        passwordHash: hashOk,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    const token = await emitToken({
      userType: 'super_admin',
      userId: row.id,
      type: 'password_reset',
    });

    const caller = createCaller(ctxFresh(client));
    const result = await caller.validateToken({ token, tipo: 'reset' });
    expect(result.userName).toBe('Super Gamma');
  });

  // ---- Falhas — MSG_TOKEN_EXPIRED unificado -------------------------

  it('assinatura invalida → BAD_REQUEST + MSG_TOKEN_EXPIRED', async () => {
    const caller = createCaller(ctxFresh(client));
    await expect(
      caller.validateToken({ token: 'header.payload.badsig', tipo: 'reset' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: MSG_TOKEN_EXPIRED });
  });

  it('token ausente em accessTokens → BAD_REQUEST + MSG_TOKEN_EXPIRED', async () => {
    // Emite um token valido mas nunca insere no accessTokens.
    const token = await signCredentialToken({
      userId: 999,
      tipo: 'reset',
      userType: 'employee',
    });
    const caller = createCaller(ctxFresh(client));
    await expect(caller.validateToken({ token, tipo: 'reset' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('token ja usado (usedAt IS NOT NULL) → BAD_REQUEST + MSG_TOKEN_EXPIRED', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO });
    const token = await emitToken({
      userType: 'employee',
      userId: empId,
      type: 'password_reset',
      usedAt: new Date(),
    });

    const caller = createCaller(ctxFresh(client));
    await expect(caller.validateToken({ token, tipo: 'reset' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('token expirado (expiresAt no passado) → BAD_REQUEST + MSG_TOKEN_EXPIRED', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO });
    const token = await emitToken({
      userType: 'employee',
      userId: empId,
      type: 'password_reset',
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const caller = createCaller(ctxFresh(client));
    await expect(caller.validateToken({ token, tipo: 'reset' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('type incompativel (accessTokens.type=first_access; tipo=reset) → BAD_REQUEST', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO });
    // Emite um token valido de first_access mas trata como reset.
    // Como o token no payload tem tipo='first_access', o proprio helper
    // pega no cruzamento payload<->input; o accessTokens.type tambem
    // divergiria, mas o cruzamento do payload cai antes. Aqui provamos
    // que a defesa em profundidade nao vaza.
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
    await expect(caller.validateToken({ token, tipo: 'reset' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('payload userId divergente do registro → BAD_REQUEST', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO });
    // Forja: JWT com userId=empId+1 mas grava no accessTokens com userId=empId.
    const forgedToken = await signCredentialToken({
      userId: empId + 999,
      tipo: 'reset',
      userType: 'employee',
    });
    await client.db.insert(accessTokens).values({
      userType: 'employee',
      userId: empId,
      token: forgedToken,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const caller = createCaller(ctxFresh(client));
    await expect(caller.validateToken({ token: forgedToken, tipo: 'reset' })).rejects.toMatchObject(
      { code: 'BAD_REQUEST', message: MSG_TOKEN_EXPIRED },
    );
  });

  it('titular inativo → FORBIDDEN + MSG_TOKEN_EXPIRED (anti-enumeracao)', async () => {
    const empId = await seedEmployee({ cpf: CPF_INATIVO, status: 'inativo' });
    const token = await emitToken({
      userType: 'employee',
      userId: empId,
      type: 'password_reset',
    });

    const caller = createCaller(ctxFresh(client));
    await expect(caller.validateToken({ token, tipo: 'reset' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_TOKEN_EXPIRED,
    });
  });

  it('titular ausente (deletado apos emissao) → FORBIDDEN + MSG_TOKEN_EXPIRED', async () => {
    const empId = await seedEmployee({ cpf: CPF_ATIVO });
    const token = await emitToken({
      userType: 'employee',
      userId: empId,
      type: 'password_reset',
    });
    // Deleta o employee mantendo o accessTokens.
    await client.db.delete(employees).where(eq(employees.id, empId));

    const caller = createCaller(ctxFresh(client));
    await expect(caller.validateToken({ token, tipo: 'reset' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_TOKEN_EXPIRED,
    });
  });
});
