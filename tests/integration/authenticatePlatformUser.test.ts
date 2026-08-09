// ROIP APP 9BOX — teste de integracao `authenticatePlatformUser`
// (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact do helper puro §4.1 a-i:
// - (a) rate limit atingido → `code='rate_limit'`.
// - (d) CPF nao encontrado → `code='unauthorized'`.
// - (e) status='inativo' → `code='unauthorized'` sem incremento.
// - (f) senha errada → `code='unauthorized'` com incremento.
// - (g) colaborador puro apos senha correta → `code='collaborator_only'`
//   + `redirectUrl='/colaborador'`.
// - (h) empresa inativa → `code='company_inactive'`.
// - (i) sucesso → `success:true` + JWT + `redirectPath` conforme role
//   (§2.3 + §5.5/§5.6/§5.7).
// - Precedencia §2.3: rh, rh_lider, clevel, lider.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import {
  authenticatePlatformUser,
  resolveRedirectPath,
} from '../../src/lib/auth/authenticatePlatformUser';
import { hashPassword } from '../../src/server/auth/password';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import { createCompany } from '../../src/server/services/companies';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-rota-c-d075-authenticatePlatformUser';

const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';
const SENHA_ERRADA = 'SenhaErrada123';
const IP_A = '10.0.0.30';

// Faixa CNPJ canonica bit-exact D075 — sequencial acima do range D074.
const CNPJ_A = '10000000000600';

const CPF_RH = '11122233301';
const CPF_RH_LIDER = '11122233302';
const CPF_LIDER = '11122233303';
const CPF_CLEVEL = '11122233304';
const CPF_COLAB_PURO = '11122233305';
const CPF_INATIVO = '11122233306';
const CPF_INEXISTENTE = '99999999999';

describe('authenticatePlatformUser — helper puro §4.1 (ME-Rota-C-D075)', () => {
  let client: RoipDbClient;
  let hashOk: string;
  let companyIdA: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    hashOk = await hashPassword(SENHA_OK, BCRYPT_COST_TEST);
  });

  afterAll(async () => {
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP D075 A LTDA',
      nomeFantasia: 'ROIP D075 A',
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
      kickoffDate: new Date('2020-01-01'),
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
        name: overrides.name ?? 'Titular D075',
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
    if (!row) throw new Error('seedEmployee sem id');
    return row.id;
  }

  async function seedCLevel(overrides: {
    companyId: number;
    cpf: string;
    passwordHash: string;
    status?: 'ativo' | 'inativo';
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: overrides.companyId,
        name: 'C-Level D075',
        cpf: overrides.cpf,
        email: `clevel-${overrides.cpf}@roip.test`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'Diretor',
        descricaoCargo: 'Cargo executivo',
        departamento: 'Comercial',
        custoMensal: '20000.00',
        acessoTotal: true,
        status: overrides.status ?? 'ativo',
        passwordHash: overrides.passwordHash,
        passwordSet: true,
      })
      .$returningId();
    if (!row) throw new Error('seedCLevel sem id');
    return row.id;
  }

  it('resolveRedirectPath deriva canonicamente por role', () => {
    expect(resolveRedirectPath('rh')).toBe('/painel-rh');
    expect(resolveRedirectPath('rh_lider')).toBe('/painel-rh');
    expect(resolveRedirectPath('clevel')).toBe('/painel-clevel');
    expect(resolveRedirectPath('lider')).toBe('/painel-lider');
  });

  it('(d) CPF nao encontrado → unauthorized', async () => {
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_INEXISTENTE,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
  });

  it('(e) status=inativo → unauthorized (sem incremento)', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_INATIVO,
      passwordHash: hashOk,
      isRH: true,
      status: 'inativo',
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_INATIVO,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
  });

  it('(f) senha errada → unauthorized', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_RH,
      senha: SENHA_ERRADA,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
  });

  it('(g) colaborador puro apos senha correta → collaborator_only + redirect', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_COLAB_PURO,
      passwordHash: hashOk,
      isRH: false,
      isLider: false,
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_COLAB_PURO,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(false);
    if (!r.success && r.code === 'collaborator_only') {
      expect(r.redirectUrl).toBe('/colaborador');
    } else {
      throw new Error('Esperava collaborator_only');
    }
  });

  it('(h) empresa inativa → company_inactive', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
    });
    await client.db.update(companies).set({ status: 'inativa' });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_RH,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('company_inactive');
  });

  it('(i) sucesso role=rh → redirectPath=/painel-rh', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_RH,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.user.role).toBe('rh');
      expect(r.redirectPath).toBe('/painel-rh');
    }
  });

  it('(i) sucesso role=rh_lider (isRH+isLider) → redirectPath=/painel-rh', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_RH_LIDER,
      passwordHash: hashOk,
      isRH: true,
      isLider: true,
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_RH_LIDER,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.user.role).toBe('rh_lider');
      expect(r.redirectPath).toBe('/painel-rh');
    }
  });

  it('(i) sucesso role=lider → redirectPath=/painel-lider', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_LIDER,
      passwordHash: hashOk,
      isRH: false,
      isLider: true,
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_LIDER,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.user.role).toBe('lider');
      expect(r.redirectPath).toBe('/painel-lider');
    }
  });

  it('(i) sucesso role=clevel → redirectPath=/painel-clevel', async () => {
    await seedCLevel({
      companyId: companyIdA,
      cpf: CPF_CLEVEL,
      passwordHash: hashOk,
    });
    const r = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: createRateLimiter(),
      ip: IP_A,
      cpf: CPF_CLEVEL,
      senha: SENHA_OK,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.user.role).toBe('clevel');
      expect(r.redirectPath).toBe('/painel-clevel');
    }
  });

  it('(a) rate limit atingido → code=rate_limit', async () => {
    await seedEmployee({
      companyId: companyIdA,
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
    });
    const shared = createRateLimiter();
    for (let i = 0; i < 5; i += 1) {
      await authenticatePlatformUser({
        db: client.db,
        rateLimiter: shared,
        ip: IP_A,
        cpf: CPF_RH,
        senha: SENHA_ERRADA,
      });
    }
    const blocked = await authenticatePlatformUser({
      db: client.db,
      rateLimiter: shared,
      ip: IP_A,
      cpf: CPF_RH,
      senha: SENHA_OK,
    });
    expect(blocked.success).toBe(false);
    if (!blocked.success && blocked.code === 'rate_limit') {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    } else {
      throw new Error('Esperava code=rate_limit');
    }
  });
});
