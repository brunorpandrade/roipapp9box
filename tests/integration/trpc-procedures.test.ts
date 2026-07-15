// ROIP APP 9BOX — teste de integracao do bootstrap tRPC (ME-021).
//
// Exercita os guards canonicos (DOC 02) contra MySQL real, via
// `createCallerFactory`: emite JWTs de verdade (ME-020), semeia titulares
// reais e chama as procedures do `appRouter`. Cobre:
//
//   - publicProcedure (health.status): sem sessao, responde.
//   - protectedProcedure (session.whoami): sessao valida (super_admin e
//     perfil administrativo); ausencia de token → UNAUTHORIZED; token
//     malformado → UNAUTHORIZED; pwv divergente (§5.7) → UNAUTHORIZED;
//     empresa inativa para perfil administrativo (§5.6, S444) → FORBIDDEN
//     com forceLogout; super_admin atravessa empresa inativa (§2.4).
//   - roleProcedure (admin.ping): perfil na lista passa; fora da lista →
//     FORBIDDEN (§8.3 — perfil errado, nunca sessao expirada).
//   - isolamento por empresa: o companyId do contexto vem do token (§2.4).
//
// Padrao S009: company local com CNPJ unico a partir de 10000000000148.
// Cleanup afterAll (L32): FKs compartilhadas exigem limpeza total ao fim,
// nao so no beforeEach. Segredo JWT deterministico fixado no proprio teste.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ne } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, superAdmins } from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createCompany } from '../../src/server/services/companies';
import { appRouter } from '../../src/server/routers';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Segredo deterministico do teste — os tokens sao assinados e verificados
// com este mesmo valor no processo.
process.env.JWT_SECRET = 'test-secret-roip-me021-deterministico';

// passwordHash arbitrario porem fixo: o pwv deriva dele como string, sem
// depender de bcrypt real. Trocar o hash simula troca de senha (§5.7).
// Fixture global de superAdmins semeada pelo globalSetup (id=1) — NUNCA
// pode ser deletada pelo cleanup local, sob pena de contaminar os demais
// arquivos que dependem dela para FKs (L32).
const FIXTURE_SUPER_ADMIN_ID = 1;

const HASH_A = 'hash-fixo-A-me021';
const HASH_B = 'hash-fixo-B-me021';

const createCaller = createCallerFactory(appRouter);

/** Contexto de teste com um bearer token opcional. */
function ctxWith(client: RoipDbClient, bearerToken: string | null): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
  });
}

describe('bootstrap tRPC — guards canonicos (ME-021)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    // L32 — limpeza total das tabelas tocadas ao fim do arquivo.
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_SUPER_ADMIN_ID));

    // S009 — company local com CNPJ unico da faixa reservada.
    companyId = await createCompany(client.db, {
      razaoSocial: 'ROIP tRPC LTDA',
      nomeFantasia: 'ROIP tRPC',
      cnpj: '10000000000148',
      telefone: '1633330000',
      endereco: 'Rua tRPC, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'principal@roip.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade',
      contextoMercado: 'Mercado',
      mesKickoff: 1,
    });
    // Empresa nasce 'inativa' (default do schema); ativa para os cenarios
    // administrativos padrao.
    await client.db.update(companies).set({ status: 'ativa' });
  });

  async function seedEmployee(overrides: {
    cpf: string;
    passwordHash: string | null;
    isRH?: boolean;
    isLider?: boolean;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Titular Employee',
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
        passwordHash: overrides.passwordHash,
        passwordSet: overrides.passwordHash !== null,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee: insert sem id');
    }
    return row.id;
  }

  async function seedSuperAdmin(passwordHash: string, email: string): Promise<number> {
    const [row] = await client.db
      .insert(superAdmins)
      .values({ name: 'Titular Super Admin', email, passwordHash })
      .$returningId();
    if (!row) {
      throw new Error('seedSuperAdmin: insert sem id');
    }
    return row.id;
  }

  // ---- publicProcedure -----------------------------------------------

  it('health.status responde sem sessao (publicProcedure)', async () => {
    const caller = createCaller(ctxWith(client, null));
    const result = await caller.health.status();
    expect(result.ok).toBe(true);
  });

  // ---- protectedProcedure: sessao valida -----------------------------

  it('session.whoami com JWT rh valido devolve companyId do token', async () => {
    const userId = await seedEmployee({ cpf: '30000000001', passwordHash: HASH_A, isRH: true });
    const token = await signPlatformToken({
      userId,
      role: 'rh',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const caller = createCaller(ctxWith(client, token));
    const result = await caller.session.whoami();
    expect(result.user.role).toBe('rh');
    if (result.user.role === 'rh') {
      expect(result.user.companyId).toBe(companyId);
      expect(result.user.userId).toBe(userId);
    }
  });

  it('session.whoami com JWT super_admin valido devolve identidade global', async () => {
    const superAdminId = await seedSuperAdmin(HASH_A, 'sa@roip.test');
    const token = await signSuperAdminToken({
      superAdminId,
      credentialVersion: deriveCredentialVersion(HASH_A + 'sa@roip.test'),
    });
    const caller = createCaller(ctxWith(client, token));
    const result = await caller.session.whoami();
    expect(result.user.role).toBe('super_admin');
    if (result.user.role === 'super_admin') {
      expect(result.user.superAdminId).toBe(superAdminId);
    }
  });

  // ---- protectedProcedure: sessao invalida (§8.3 → UNAUTHORIZED) ------

  it('session.whoami sem bearer token → UNAUTHORIZED', async () => {
    const caller = createCaller(ctxWith(client, null));
    await expect(caller.session.whoami()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('session.whoami com token malformado → UNAUTHORIZED', async () => {
    const caller = createCaller(ctxWith(client, 'nao-e-um-jwt'));
    await expect(caller.session.whoami()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('session.whoami com pwv divergente (senha trocada, §5.7) → UNAUTHORIZED', async () => {
    // Token emitido com a versao antiga (HASH_A), mas o registro vigente
    // ja tem HASH_B — a derivacao diverge, a sessao cai.
    const userId = await seedEmployee({ cpf: '30000000002', passwordHash: HASH_B, isRH: true });
    const staleToken = await signPlatformToken({
      userId,
      role: 'rh',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const caller = createCaller(ctxWith(client, staleToken));
    await expect(caller.session.whoami()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('session.whoami com titular sem passwordHash (S014) → UNAUTHORIZED', async () => {
    // Cenario defensivo: token de titular que nao tem senha definida.
    const userId = await seedEmployee({ cpf: '30000000003', passwordHash: null, isRH: true });
    const token = await signPlatformToken({
      userId,
      role: 'rh',
      companyId,
      credentialVersion: deriveCredentialVersion('qualquer'),
    });
    const caller = createCaller(ctxWith(client, token));
    await expect(caller.session.whoami()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  // ---- guard de empresa inativa (§5.6, S444) -------------------------

  it('empresa inativa para perfil administrativo → FORBIDDEN com forceLogout', async () => {
    const userId = await seedEmployee({ cpf: '30000000004', passwordHash: HASH_A, isRH: true });
    const token = await signPlatformToken({
      userId,
      role: 'rh',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    await client.db.update(companies).set({ status: 'inativa' });
    const caller = createCaller(ctxWith(client, token));
    await expect(caller.session.whoami()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      cause: { forceLogout: true },
    });
  });

  it('empresa inativa NAO bloqueia super_admin (atravessa, §2.4)', async () => {
    const superAdminId = await seedSuperAdmin(HASH_A, 'sa2@roip.test');
    const token = await signSuperAdminToken({
      superAdminId,
      credentialVersion: deriveCredentialVersion(HASH_A + 'sa2@roip.test'),
    });
    await client.db.update(companies).set({ status: 'inativa' });
    const caller = createCaller(ctxWith(client, token));
    const result = await caller.session.whoami();
    expect(result.user.role).toBe('super_admin');
  });

  // ---- roleProcedure (§8.3: perfil errado → FORBIDDEN) ---------------

  it('admin.ping permite perfil na lista (rh)', async () => {
    const userId = await seedEmployee({ cpf: '30000000005', passwordHash: HASH_A, isRH: true });
    const token = await signPlatformToken({
      userId,
      role: 'rh',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const caller = createCaller(ctxWith(client, token));
    const result = await caller.admin.ping();
    expect(result.role).toBe('rh');
  });

  it('admin.ping nega perfil fora da lista (lider) → FORBIDDEN', async () => {
    const userId = await seedEmployee({ cpf: '30000000006', passwordHash: HASH_A, isLider: true });
    const token = await signPlatformToken({
      userId,
      role: 'lider',
      companyId,
      credentialVersion: deriveCredentialVersion(HASH_A),
    });
    const caller = createCaller(ctxWith(client, token));
    await expect(caller.admin.ping()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin.ping sem sessao → UNAUTHORIZED (nao FORBIDDEN)', async () => {
    const caller = createCaller(ctxWith(client, null));
    await expect(caller.admin.ping()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
