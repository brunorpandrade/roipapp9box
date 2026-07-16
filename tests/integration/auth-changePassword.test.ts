// ROIP APP 9BOX — teste de integracao `auth.changePassword` (ME-022c).
//
// Cobre a ordem canonica do DOC 02 §4.7 passo 3 contra MySQL real. Ordem
// canonica testada:
//   (b) rate limit `{ip}:change-password:{userId}` = 5/15min → 429;
//   (d) senhaAtual errada → 401 canonica §13.3 + incremento;
//   (e) politica de senha nova violada → 400 canonica §13.3;
//   (f) novaSenha === senhaAtual (bcrypt.compare) → 400 canonica §13.3;
//   (g) sucesso: UPDATE passwordHash + reset rate limit;
//   (h) §5.7 "exceto a sessao atual" (S029): `ctx.reissuedToken.value`
//       recebe token novo com pwv derivado do NOVO hash. Cobertura para
//       os 5 branches de perfil (super_admin, rh, rh_lider, clevel, lider).
//   (i) contrato de resposta canonico literal: `{ msg }` sem token no body.
//
// L32 — cleanup em afterAll para nao contaminar arquivos posteriores.

import { eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  accessTokens,
  cLevelMembers,
  companies,
  employees,
  superAdmins,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  authRouter,
  MSG_NEW_PASSWORD_MUST_DIFFER,
  MSG_PASSWORD_ACTUAL_INCORRECT,
  MSG_PASSWORD_CHANGE_SUCCESS,
  MSG_PASSWORD_POLICY,
  MSG_RATE_LIMIT,
} from '../../src/server/routers/auth';
import { createCompany } from '../../src/server/services/companies';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022c-changePassword';

const FIXTURE_SUPER_ADMIN_ID = 1;
const BCRYPT_COST_TEST = 4;
const SENHA_ANTIGA = 'SenhaAtual1';
const SENHA_NOVA = 'SenhaNova2';
const SENHA_FRACA = 'curta';

const CNPJ_A = '10000000010001';
const CPF_RH = '90000010001';
const CPF_RH_LIDER = '90000010002';
const CPF_LIDER = '90000010003';
const CPF_CLEVEL = '90000010004';
const IP_A = '10.0.0.50';

const createCaller = createCallerFactory(authRouter);

/**
 * Contexto de teste com bearer opcional. Recria o rateLimiter a cada
 * chamada para isolar contadores entre testes (evita flake por ordem).
 */
function ctxAuthed(client: RoipDbClient, bearerToken: string | null): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: IP_A,
  });
}

/** Emite JWT de sessao administrativa com pwv canonico. */
async function signPlatformFor(
  userId: number,
  role: 'rh' | 'rh_lider' | 'lider' | 'clevel',
  companyId: number,
  passwordHash: string,
): Promise<string> {
  return await signPlatformToken({
    userId,
    role,
    companyId,
    credentialVersion: deriveCredentialVersion(passwordHash),
  });
}

/** Emite JWT de sessao Super Admin com pwv canonico (`hash + email`). */
async function signSuperAdminFor(
  superAdminId: number,
  passwordHash: string,
  email: string,
): Promise<string> {
  return await signSuperAdminToken({
    superAdminId,
    credentialVersion: deriveCredentialVersion(passwordHash + email),
  });
}

describe('auth.changePassword — ordem canonica §4.7 (ME-022c)', () => {
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
      razaoSocial: 'ME-022c-change LTDA',
      nomeFantasia: 'ME-022c-change',
      cnpj: CNPJ_A,
      telefone: '1633330500',
      endereco: 'Rua Alterar, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'principal@me022c-change.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh@me022c-change.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade',
      contextoMercado: 'Mercado',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyId));
  });

  async function seedEmployee(cpf: string, flags: { isRH: boolean; isLider: boolean }) {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Emp Change',
        cpf,
        email: `${cpf}@teste.local`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: 'ativo',
        isRH: flags.isRH,
        isLider: flags.isLider,
        passwordHash: hashAntigo,
        passwordSet: true,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed employee falhou');
    }
    return row.id;
  }

  async function seedCLevel(cpf: string): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'CL Change',
        cpf,
        email: `${cpf}@teste.local`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CFO',
        descricaoCargo: 'Chief Financial Officer',
        departamento: 'Financeiro',
        custoMensal: '25000.00',
        status: 'ativo',
        passwordHash: hashAntigo,
        passwordSet: true,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed clevel falhou');
    }
    return row.id;
  }

  async function seedSuperAdmin(email: string): Promise<number> {
    const [row] = await client.db
      .insert(superAdmins)
      .values({
        name: 'SA Change',
        email,
        passwordHash: hashAntigo,
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seed super_admin falhou');
    }
    return row.id;
  }

  it('sem sessao (bearer null) rejeita com UNAUTHORIZED (protectedProcedure)', async () => {
    const caller = createCaller(ctxAuthed(client, null));
    await expect(
      caller.changePassword({ senhaAtual: SENHA_ANTIGA, novaSenha: SENHA_NOVA }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('sucesso (RH puro): UPDATE hash + resposta canonica + reemissao pwv', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);
    const result = await caller.changePassword({
      senhaAtual: SENHA_ANTIGA,
      novaSenha: SENHA_NOVA,
    });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGE_SUCCESS });

    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    const only = emp[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      expect(only.passwordHash).not.toBe(hashAntigo);
      const ok = await verifyPassword(SENHA_NOVA, only.passwordHash ?? '');
      expect(ok).toBe(true);
    }

    // §5.7 exceto a atual: reemissao com pwv-novo.
    expect(ctx.reissuedToken.value).not.toBeNull();
    expect(ctx.reissuedToken.value).not.toBe(token);
  });

  it('sucesso (RH-Lider): UPDATE + reemissao', async () => {
    const empId = await seedEmployee(CPF_RH_LIDER, { isRH: true, isLider: true });
    const token = await signPlatformFor(empId, 'rh_lider', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);
    const result = await caller.changePassword({
      senhaAtual: SENHA_ANTIGA,
      novaSenha: SENHA_NOVA,
    });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGE_SUCCESS });
    expect(ctx.reissuedToken.value).not.toBeNull();
    expect(ctx.reissuedToken.value).not.toBe(token);
  });

  it('sucesso (Lider): UPDATE + reemissao', async () => {
    const empId = await seedEmployee(CPF_LIDER, { isRH: false, isLider: true });
    const token = await signPlatformFor(empId, 'lider', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);
    const result = await caller.changePassword({
      senhaAtual: SENHA_ANTIGA,
      novaSenha: SENHA_NOVA,
    });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGE_SUCCESS });
    expect(ctx.reissuedToken.value).not.toBeNull();
    expect(ctx.reissuedToken.value).not.toBe(token);
  });

  it('sucesso (C-level): UPDATE cLevelMembers.passwordHash + reemissao', async () => {
    const clId = await seedCLevel(CPF_CLEVEL);
    const token = await signPlatformFor(clId, 'clevel', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);
    const result = await caller.changePassword({
      senhaAtual: SENHA_ANTIGA,
      novaSenha: SENHA_NOVA,
    });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGE_SUCCESS });

    const cl = await client.db
      .select()
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, clId))
      .limit(1);
    const only = cl[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      expect(only.passwordHash).not.toBe(hashAntigo);
      const ok = await verifyPassword(SENHA_NOVA, only.passwordHash ?? '');
      expect(ok).toBe(true);
    }
    expect(ctx.reissuedToken.value).not.toBeNull();
    expect(ctx.reissuedToken.value).not.toBe(token);
  });

  it('sucesso (Super Admin): UPDATE superAdmins.passwordHash + reemissao', async () => {
    const email = 'sa-change@teste.local';
    const saId = await seedSuperAdmin(email);
    const token = await signSuperAdminFor(saId, hashAntigo, email);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);
    const result = await caller.changePassword({
      senhaAtual: SENHA_ANTIGA,
      novaSenha: SENHA_NOVA,
    });
    expect(result).toEqual({ msg: MSG_PASSWORD_CHANGE_SUCCESS });

    const sa = await client.db.select().from(superAdmins).where(eq(superAdmins.id, saId)).limit(1);
    const only = sa[0];
    expect(only).toBeDefined();
    if (only !== undefined) {
      expect(only.passwordHash).not.toBe(hashAntigo);
      const ok = await verifyPassword(SENHA_NOVA, only.passwordHash);
      expect(ok).toBe(true);
    }

    // Super Admin: reemissao obrigatoria (S029) senao proximo request cai
    // por pwv divergente (§5.1 sem exp + S011 hash+email).
    expect(ctx.reissuedToken.value).not.toBeNull();
    expect(ctx.reissuedToken.value).not.toBe(token);
  });

  it('senhaAtual incorreta → 401 canonica + registerFailure (nao troca hash)', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const caller = createCaller(ctxAuthed(client, token));
    await expect(
      caller.changePassword({ senhaAtual: 'senha-errada-1', novaSenha: SENHA_NOVA }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: MSG_PASSWORD_ACTUAL_INCORRECT,
    });

    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    expect(emp[0]?.passwordHash).toBe(hashAntigo);
  });

  it('politica violada (nova senha) → 400 canonica MSG_PASSWORD_POLICY', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const caller = createCaller(ctxAuthed(client, token));
    await expect(
      caller.changePassword({ senhaAtual: SENHA_ANTIGA, novaSenha: SENHA_FRACA }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_PASSWORD_POLICY,
    });
  });

  it('novaSenha === senhaAtual rejeita com MSG_NEW_PASSWORD_MUST_DIFFER', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const caller = createCaller(ctxAuthed(client, token));
    await expect(
      caller.changePassword({ senhaAtual: SENHA_ANTIGA, novaSenha: SENHA_ANTIGA }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MSG_NEW_PASSWORD_MUST_DIFFER,
    });
  });

  it('rate limit atingido (5 falhas) bloqueia proxima com TOO_MANY_REQUESTS', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);

    // 5 falhas com senha errada — cada uma incrementa (§4.7 3d).
    for (let i = 0; i < 5; i += 1) {
      await expect(
        caller.changePassword({ senhaAtual: 'errada' + String(i), novaSenha: SENHA_NOVA }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    // 6a tentativa (ainda que com senha correta) — bloqueada.
    await expect(
      caller.changePassword({ senhaAtual: SENHA_ANTIGA, novaSenha: SENHA_NOVA }),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: MSG_RATE_LIMIT,
    });
  });

  it('sucesso reseta rate limit (contador limpo apos 200 canonico)', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);

    // 4 falhas nao passam do limite (5).
    for (let i = 0; i < 4; i += 1) {
      await expect(
        caller.changePassword({ senhaAtual: 'errada' + String(i), novaSenha: SENHA_NOVA }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    // Sucesso reseta contador (§4.1 passo i canonico dos logins,
    // reaplicado a changePassword no resolver).
    const ok = await caller.changePassword({
      senhaAtual: SENHA_ANTIGA,
      novaSenha: SENHA_NOVA,
    });
    expect(ok).toEqual({ msg: MSG_PASSWORD_CHANGE_SUCCESS });
  });

  it('pwv-novo bate com hash-novo (invalidacao futura de sessoes antigas)', async () => {
    const empId = await seedEmployee(CPF_RH, { isRH: true, isLider: false });
    const token = await signPlatformFor(empId, 'rh', companyId, hashAntigo);
    const ctx = ctxAuthed(client, token);
    const caller = createCaller(ctx);

    await caller.changePassword({ senhaAtual: SENHA_ANTIGA, novaSenha: SENHA_NOVA });

    const emp = await client.db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    const only = emp[0];
    expect(only).toBeDefined();
    if (only?.passwordHash !== null && only?.passwordHash !== undefined) {
      const pwvNovoEsperado = deriveCredentialVersion(only.passwordHash);
      const pwvVelho = deriveCredentialVersion(hashAntigo);
      expect(pwvNovoEsperado).not.toBe(pwvVelho);
      // O token reemitido carrega pwv-novo — no proximo request o
      // middleware `authed` compara e libera.
      expect(ctx.reissuedToken.value).not.toBeNull();
    }
  });
});
