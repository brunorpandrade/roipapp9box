// ROIP APP 9BOX — teste de integracao server action
// `loginPlatformAction` (ME-Rota-C-D075).
//
// Cobertura canonica bit-exact:
// - CPF invalido → unauthorized sem tocar DB.
// - CPF nao encontrado → unauthorized.
// - Colaborador puro → collaborator_only + redirectUrl='/colaborador'.
// - Empresa inativa → company_inactive.
// - Sucesso role=rh → cookie 'session' gravado + redirect '/painel-rh'
//   (NEXT_REDIRECT).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import { hashPassword } from '../../src/server/auth/password';
import { createCompany } from '../../src/server/services/companies';

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

const cookieCalls: {
  set: { name: string; value: string }[];
  delete: string[];
} = { set: [], delete: [] };

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name === 'x-forwarded-for') return '10.0.0.50';
      return null;
    },
  }),
  cookies: async () => ({
    set: (name: string, value: string) => {
      cookieCalls.set.push({ name, value });
    },
    delete: (name: string) => {
      cookieCalls.delete.push(name);
    },
    get: () => undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT ${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));

import { loginPlatformAction } from '../../src/app/actions';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-rota-c-d075-loginPlatformAction';
process.env.DATABASE_URL = TEST_URL;

const BCRYPT_COST_TEST = 4;
const SENHA_OK = 'SenhaBoa123';
const CNPJ_A = '10000000000627';
const CPF_RH = '22233344401';
const CPF_COLAB = '22233344402';

describe('loginPlatformAction — server action §4.1 (ME-Rota-C-D075)', () => {
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
    cookieCalls.set = [];
    cookieCalls.delete = [];

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP D075 Action LTDA',
      nomeFantasia: 'ROIP D075 Action',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua Action',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal',
      contatoPrincipalEmail: 'p.action@roip.test',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh.action@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Action',
      contextoMercado: 'Action',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' });
  });

  async function seedEmployee(overrides: {
    cpf: string;
    passwordHash: string | null;
    isRH: boolean;
    isLider: boolean;
  }): Promise<void> {
    await client.db.insert(employees).values({
      companyId: companyIdA,
      name: 'Titular Action',
      cpf: overrides.cpf,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '000000',
      descricaoCBO: 'Cargo',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      isRH: overrides.isRH,
      isLider: overrides.isLider,
      status: 'ativo',
      passwordHash: overrides.passwordHash,
      passwordSet: overrides.passwordHash !== null,
    });
  }

  it('CPF com menos de 11 digitos → unauthorized (sem tocar DB)', async () => {
    const r = await loginPlatformAction({ cpf: '123', senha: SENHA_OK });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
    expect(cookieCalls.set).toHaveLength(0);
  });

  it('CPF valido nao encontrado → unauthorized', async () => {
    const r = await loginPlatformAction({ cpf: '99988877766', senha: SENHA_OK });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('unauthorized');
  });

  it('Colaborador puro → collaborator_only + redirectUrl=/colaborador', async () => {
    await seedEmployee({
      cpf: CPF_COLAB,
      passwordHash: hashOk,
      isRH: false,
      isLider: false,
    });
    const r = await loginPlatformAction({ cpf: CPF_COLAB, senha: SENHA_OK });
    expect(r.success).toBe(false);
    if (!r.success && r.code === 'collaborator_only') {
      expect(r.redirectUrl).toBe('/colaborador');
    } else {
      throw new Error('Esperava collaborator_only');
    }
    expect(cookieCalls.set).toHaveLength(0);
  });

  it('Empresa inativa → company_inactive', async () => {
    await seedEmployee({
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
      isLider: false,
    });
    await client.db.update(companies).set({ status: 'inativa' });
    const r = await loginPlatformAction({ cpf: CPF_RH, senha: SENHA_OK });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe('company_inactive');
  });

  it('sucesso role=rh → cookie session gravado + NEXT_REDIRECT para /painel-rh', async () => {
    await seedEmployee({
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
      isLider: false,
    });
    let caughtDigest: string | null = null;
    try {
      await loginPlatformAction({ cpf: CPF_RH, senha: SENHA_OK });
      throw new Error('esperava NEXT_REDIRECT');
    } catch (err) {
      const digest = (err as { digest?: string }).digest;
      if (typeof digest === 'string') caughtDigest = digest;
    }
    expect(caughtDigest).not.toBeNull();
    expect(caughtDigest ?? '').toContain('/painel-rh');
    expect(cookieCalls.set).toHaveLength(1);
    expect(cookieCalls.set[0]!.name).toBe('session');
  });

  it('CPF com mascara e-mail-like e senha OK — normaliza e autentica', async () => {
    await seedEmployee({
      cpf: CPF_RH,
      passwordHash: hashOk,
      isRH: true,
      isLider: false,
    });
    // CPF chega mascarado — action normaliza.
    const a = CPF_RH.slice(0, 3);
    const b = CPF_RH.slice(3, 6);
    const c = CPF_RH.slice(6, 9);
    const d = CPF_RH.slice(9, 11);
    const cpfMasked = `${a}.${b}.${c}-${d}`;
    let redirected = false;
    try {
      await loginPlatformAction({ cpf: cpfMasked, senha: SENHA_OK });
    } catch (err) {
      const digest = (err as { digest?: string }).digest;
      if (typeof digest === 'string' && digest.includes('/painel-rh')) redirected = true;
    }
    expect(redirected).toBe(true);
  });
});
