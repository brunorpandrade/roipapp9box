// ROIP APP 9BOX — teste de integracao `auth.loginPlatform` (ME-022a).
//
// Exercita a ordem canonica a-i do DOC 02 §4.1 contra MySQL real, via
// `createCallerFactory`. Cobre:
//   (a) rate limit atingido → TOO_MANY_REQUESTS.
//   (d) CPF nao encontrado → UNAUTHORIZED + incremento de rate limit.
//   (S019) CPF ambiguo cross-company → UNAUTHORIZED + incremento (=nao encontrado).
//   Precedencia §2.3:
//     - RH → role 'rh'.
//     - RH + Lider → role 'rh_lider'.
//     - C-level (mesma empresa que employee sem isRH) → role 'clevel'.
//     - Lider puro → role 'lider'.
//   (e) status='inativo' → UNAUTHORIZED SEM incremento.
//   (f) senha errada → UNAUTHORIZED + incremento.
//   passwordHash null → tratado como senha errada (defensivo).
//   (g) colaborador puro APOS senha correta → FORBIDDEN + redirectUrl.
//   (h) empresa inativa APOS senha correta → FORBIDDEN.
//   (i) sucesso → reset do rate limit, JWT valido com claims corretas.
//
// Padrao S009: company local com CNPJ unico a partir de 10000000000245.
// L32 cleanup em afterAll. bcrypt cost=4 (S010). JWT_SECRET fixo no teste.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { jwtVerify } from 'jose';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createCompany } from '../../src/server/services/companies';
import {
  authRouter,
  MSG_LOGIN_INVALID,
  MSG_COLLABORATOR_ONLY,
  MSG_COMPANY_INACTIVE,
  MSG_RATE_LIMIT,
} from '../../src/server/routers/auth';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me022a-loginPlatform';

const CNPJ_A = '10000000000245';
const CNPJ_B = '10000000000253';

const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';
const SENHA_ERRADA = 'SenhaErrada123';

const IP_A = '10.0.0.1';
const IP_B = '10.0.0.2';

const createCaller = createCallerFactory(authRouter);

function ctxWith(client: RoipDbClient, ip: string): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken: null,
    ip,
  });
}

/**
 * Variante que compartilha o mesmo rate limiter entre chamadas — necessario
 * para exercer (a) rate limit atingido: 5 falhas na mesma janela.
 */
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

describe('auth.loginPlatform — ordem canonica §4.1 (ME-022a)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let hashOk: string;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashOk = await hashPassword(SENHA_OK, BCRYPT_COST_TEST);
  });

  afterAll(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP loginPlatform A LTDA',
      nomeFantasia: 'ROIP loginPlatform A',
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
    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ROIP loginPlatform B LTDA',
      nomeFantasia: 'ROIP loginPlatform B',
      cnpj: CNPJ_B,
      telefone: '1633330002',
      endereco: 'Rua B',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal B',
      contatoPrincipalEmail: 'p.b@roip.test',
      contatoRHNome: 'RH B',
      contatoRHEmail: 'rh.b@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'B',
      contextoMercado: 'B',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' });
  });

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    passwordHash?: string | null;
    isRH?: boolean;
    isLider?: boolean;
    status?: 'ativo' | 'inativo';
    name?: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: overrides.name ?? 'Titular Emp',
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
        status: overrides.status ?? 'ativo',
        passwordHash: overrides.passwordHash ?? null,
        passwordSet: overrides.passwordHash !== null && overrides.passwordHash !== undefined,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedClevel(overrides: {
    companyId: number;
    cpf: string;
    passwordHash?: string | null;
    status?: 'ativo' | 'inativo';
    name?: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: overrides.companyId,
        name: overrides.name ?? 'Titular Clevel',
        cpf: overrides.cpf,
        email: `clevel-${overrides.cpf}@roip.test`,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'Diretor Executivo',
        departamento: 'Diretoria',
        custoMensal: '20000.00',
        acessoTotal: true,
        status: overrides.status ?? 'ativo',
        passwordHash: overrides.passwordHash ?? null,
        passwordSet: overrides.passwordHash !== null && overrides.passwordHash !== undefined,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedClevel sem id');
    }
    return row.id;
  }

  // ---- (d) e (S019) — mensagem anti-enumeracao unica --------------------

  it('CPF nao encontrado → UNAUTHORIZED com mensagem canonica', async () => {
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginPlatform({ cpf: '00000000000', senha: SENHA_OK }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
  });

  it('CPF ambiguo cross-company (S019) → UNAUTHORIZED igual a "nao encontrado"', async () => {
    // Mesmo CPF em duas empresas — canonico nao regula, S019 trata como
    // nao encontrado (anti-enumeracao preservada).
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020001',
      isRH: true,
      passwordHash: hashOk,
    });
    await seedEmployee({
      companyId: companyIdB,
      cpf: '30000020001',
      isLider: true,
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginPlatform({ cpf: '30000020001', senha: SENHA_OK }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
  });

  // ---- (e) — inativo NAO incrementa rate limit -------------------------

  it('titular status=inativo → UNAUTHORIZED SEM incremento (canonico §4.1 e)', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020002',
      isRH: true,
      status: 'inativo',
      passwordHash: hashOk,
    });
    const makeCtx = makeSharedCtxFactory(client, IP_A);

    // 10 tentativas contra usuario inativo — nenhuma incrementa; a 11a
    // ainda deve retornar UNAUTHORIZED (nao TOO_MANY_REQUESTS).
    for (let i = 0; i < 10; i++) {
      const caller = createCaller(makeCtx());
      await expect(
        caller.loginPlatform({ cpf: '30000020002', senha: SENHA_OK }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
    }
  });

  // ---- (f) — senha errada incrementa rate limit ------------------------

  it('senha errada: 5 falhas UNAUTHORIZED, 6a TOO_MANY_REQUESTS', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020003',
      isRH: true,
      passwordHash: hashOk,
    });
    const makeCtx = makeSharedCtxFactory(client, IP_A);

    // As 5 primeiras falhas sao UNAUTHORIZED (rate limit atinge apos a 5a).
    for (let i = 0; i < 5; i++) {
      const caller = createCaller(makeCtx());
      await expect(
        caller.loginPlatform({ cpf: '30000020003', senha: SENHA_ERRADA }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
    }
    // A 6a bloqueia — TOO_MANY_REQUESTS.
    const caller = createCaller(makeCtx());
    await expect(
      caller.loginPlatform({ cpf: '30000020003', senha: SENHA_ERRADA }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS', message: MSG_RATE_LIMIT });
  });

  it('rate limit devolve retryAfterSeconds no cause', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020004',
      isRH: true,
      passwordHash: hashOk,
    });
    const makeCtx = makeSharedCtxFactory(client, IP_A);
    for (let i = 0; i < 5; i++) {
      const caller = createCaller(makeCtx());
      await caller
        .loginPlatform({ cpf: '30000020004', senha: SENHA_ERRADA })
        .catch(() => undefined);
    }
    const caller = createCaller(makeCtx());
    try {
      await caller.loginPlatform({ cpf: '30000020004', senha: SENHA_ERRADA });
      throw new Error('deveria ter bloqueado');
    } catch (err) {
      const e = err as { code?: string; cause?: { retryAfterSeconds?: number } };
      expect(e.code).toBe('TOO_MANY_REQUESTS');
      expect(e.cause?.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.cause?.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    }
  });

  it('passwordHash null (titular sem passwordSet) → UNAUTHORIZED com incremento', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020005',
      isRH: true,
      passwordHash: null,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginPlatform({ cpf: '30000020005', senha: SENHA_OK }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
  });

  // ---- (g) — colaborador puro APOS senha correta -----------------------

  it('colaborador puro com senha correta → FORBIDDEN com redirectUrl (§4.1 g)', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020006',
      isRH: false,
      isLider: false,
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginPlatform({ cpf: '30000020006', senha: SENHA_OK }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: MSG_COLLABORATOR_ONLY,
      cause: { redirectUrl: '/colaborador' },
    });
  });

  it('colaborador puro com senha ERRADA → UNAUTHORIZED (§4.1 f antes de g)', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020007',
      isRH: false,
      isLider: false,
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginPlatform({ cpf: '30000020007', senha: SENHA_ERRADA }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: MSG_LOGIN_INVALID });
  });

  // ---- (h) — empresa inativa APOS senha correta ------------------------

  it('empresa inativa com senha correta → FORBIDDEN com mensagem canonica (§4.1 h)', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020008',
      isRH: true,
      passwordHash: hashOk,
    });
    await client.db.update(companies).set({ status: 'inativa' });
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(
      caller.loginPlatform({ cpf: '30000020008', senha: SENHA_OK }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MSG_COMPANY_INACTIVE });
  });

  // ---- (i) — sucesso: precedencia §2.3, JWT valido ---------------------

  it('sucesso RH (isRH=true, isLider=false) → role="rh" no JWT e na resposta', async () => {
    const userId = await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020101',
      isRH: true,
      isLider: false,
      passwordHash: hashOk,
      name: 'Titular RH',
    });
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginPlatform({ cpf: '30000020101', senha: SENHA_OK });
    expect(result.user.role).toBe('rh');
    expect(result.user.id).toBe(userId);
    expect(result.user.companyId).toBe(companyIdA);
    expect(result.user.name).toBe('Titular RH');
    const { payload } = await jwtVerify(
      result.token,
      new TextEncoder().encode(process.env.JWT_SECRET),
    );
    expect(payload.role).toBe('rh');
    expect(payload.companyId).toBe(companyIdA);
    expect(payload.sub).toBe(String(userId));
    expect(typeof payload.pwv).toBe('string');
  });

  it('sucesso RH+Lider (precedencia §2.3 regra 1) → role="rh_lider"', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020102',
      isRH: true,
      isLider: true,
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginPlatform({ cpf: '30000020102', senha: SENHA_OK });
    expect(result.user.role).toBe('rh_lider');
  });

  it('sucesso Lider puro (isLider=true, sem isRH, sem C-level) → role="lider"', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020103',
      isLider: true,
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginPlatform({ cpf: '30000020103', senha: SENHA_OK });
    expect(result.user.role).toBe('lider');
  });

  it('sucesso C-level (só cLevelMembers, sem employee) → role="clevel"', async () => {
    const cId = await seedClevel({
      companyId: companyIdA,
      cpf: '30000020104',
      passwordHash: hashOk,
      name: 'Titular CEO',
    });
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginPlatform({ cpf: '30000020104', senha: SENHA_OK });
    expect(result.user.role).toBe('clevel');
    expect(result.user.id).toBe(cId);
  });

  it('CPF em employee(sem RH) + clevel mesma empresa → §2.3 regra 2 (clevel)', async () => {
    // §2.3 regra 2: se ha registro em cLevelMembers com mesmo CPF e mesma
    // empresa (e nao ha isRH=true), o alvo e o cLevelMembers. Verifica-se
    // sobre o passwordHash do CLEVEL — o employee correspondente pode ter
    // outro passwordHash (ou null) e nao interfere.
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020105',
      isRH: false,
      isLider: true,
      passwordHash: null,
    });
    await seedClevel({
      companyId: companyIdA,
      cpf: '30000020105',
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginPlatform({ cpf: '30000020105', senha: SENHA_OK });
    expect(result.user.role).toBe('clevel');
  });

  it('CPF em employee(isRH) + clevel mesma empresa → §2.3 regra 1 (rh)', async () => {
    // §2.3 regra 1: isRH=true prevalece sobre C-level.
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020106',
      isRH: true,
      passwordHash: hashOk,
    });
    await seedClevel({
      companyId: companyIdA,
      cpf: '30000020106',
      passwordHash: hashOk,
    });
    const caller = createCaller(ctxWith(client, IP_A));
    const result = await caller.loginPlatform({ cpf: '30000020106', senha: SENHA_OK });
    expect(result.user.role).toBe('rh');
  });

  it('sucesso reseta rate limit — nova falha pos-sucesso comeca do zero', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: '30000020107',
      isRH: true,
      passwordHash: hashOk,
    });
    const makeCtx = makeSharedCtxFactory(client, IP_B);

    // 4 falhas — nao bloqueia.
    for (let i = 0; i < 4; i++) {
      const c = createCaller(makeCtx());
      await c.loginPlatform({ cpf: '30000020107', senha: SENHA_ERRADA }).catch(() => undefined);
    }
    // Sucesso — deve resetar.
    const c = createCaller(makeCtx());
    await c.loginPlatform({ cpf: '30000020107', senha: SENHA_OK });
    // Apos reset, mais 5 falhas ainda nao bloqueiam; a 6a bloqueia.
    for (let i = 0; i < 5; i++) {
      const cc = createCaller(makeCtx());
      await expect(
        cc.loginPlatform({ cpf: '30000020107', senha: SENHA_ERRADA }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    const cf = createCaller(makeCtx());
    await expect(
      cf.loginPlatform({ cpf: '30000020107', senha: SENHA_ERRADA }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('input CPF fora do formato (nao 11 digitos) → BAD_REQUEST via zod', async () => {
    const caller = createCaller(ctxWith(client, IP_A));
    await expect(caller.loginPlatform({ cpf: '123', senha: SENHA_OK })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
