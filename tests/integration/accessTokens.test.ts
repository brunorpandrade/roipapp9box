// ROIP APP 9BOX — teste de integracao `accessTokens` (ME-012).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria a propria company local com CNPJ unico do arquivo
// (S009) mais um employee e um cLevelMember para cobrir os tres
// `userType` do polimorfismo (padrao B): `employee`, `clevel`,
// `super_admin` (para este ultimo, reusa a fixture `superAdmins.id=1`).
//
// Cleanup:
// - `beforeEach`: apaga apenas `accessTokens` (isolamento entre casos).
// - `afterAll`: apaga tudo do proprio escopo + a company local, para nao
//   arrastar linhas para arquivos posteriores (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { accessTokens, cLevelMembers, companies, employees } from '../../src/db/schema';
import {
  createAccessToken,
  deleteAccessTokenById,
  getAccessTokenById,
  getAccessTokenByToken,
  listActiveTokensByUser,
  markTokenAsUsed,
  type NewAccessToken,
} from '../../src/server/services/accessTokens';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '77777777000107';
const SUPER_ADMIN_FIXTURE_ID = 1;

// Helper para expirar em N dias a partir de agora (politica canonica: +7).
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

describe('service accessTokens (ME-012)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    // 1) Company local isolada.
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa AccessTokens Test LTDA',
        nomeFantasia: 'Empresa AccessTokens Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330007',
        endereco: 'Rua AccessTokens, 7',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@accesstokens.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@accesstokens.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // 2) Employee para userType='employee'.
    const [empRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colab AccessTokens',
        cpf: '77777777771',
        email: 'colab.accesstokens@roip.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '141405',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
      })
      .$returningId();
    if (!empRow) throw new Error('beforeAll: falha ao criar employee local');
    employeeId = empRow.id;

    // 3) cLevelMember para userType='clevel'.
    const [clevelRow] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level AccessTokens',
        cpf: '77777777772',
        email: 'clevel.accesstokens@roip.local',
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2015-01-15'),
        cargo: 'CEO',
        descricaoCargo: 'Chief Executive Officer',
        departamento: 'Diretoria',
        custoMensal: '50000.00',
      })
      .$returningId();
    if (!clevelRow) throw new Error('beforeAll: falha ao criar cLevelMember local');
    clevelId = clevelRow.id;
  });

  afterAll(async () => {
    await client.db.delete(accessTokens);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    // Isolamento entre casos: mantem employees / cLevel / company /
    // fixture superAdmin; zera apenas o escopo do arquivo.
    await client.db.delete(accessTokens);
  });

  it('createAccessToken com userType=super_admin (fixture id=1) insere e retorna id', async () => {
    const payload: NewAccessToken = {
      userType: 'super_admin',
      userId: SUPER_ADMIN_FIXTURE_ID,
      token: 'tok-superadmin-001',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    };
    const id = await createAccessToken(client.db, payload);
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('createAccessToken com userType=employee usa o employee local', async () => {
    const id = await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-employee-001',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    const row = await getAccessTokenById(client.db, id);
    expect(row?.userType).toBe('employee');
    expect(row?.userId).toBe(employeeId);
    expect(row?.type).toBe('first_access');
  });

  it('createAccessToken com userType=clevel usa o cLevelMember local', async () => {
    const id = await createAccessToken(client.db, {
      userType: 'clevel',
      userId: clevelId,
      token: 'tok-clevel-001',
      type: 'password_reset',
      expiresAt: daysFromNow(7),
    });
    const row = await getAccessTokenById(client.db, id);
    expect(row?.userType).toBe('clevel');
    expect(row?.userId).toBe(clevelId);
    expect(row?.type).toBe('password_reset');
  });

  it('getAccessTokenByToken localiza pela string', async () => {
    await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-lookup-str-001',
      type: 'password_reset',
      expiresAt: daysFromNow(7),
    });
    const row = await getAccessTokenByToken(client.db, 'tok-lookup-str-001');
    expect(row).toBeDefined();
    expect(row?.userId).toBe(employeeId);
  });

  it('getAccessTokenByToken retorna undefined para token inexistente', async () => {
    const row = await getAccessTokenByToken(client.db, 'tok-nao-existe');
    expect(row).toBeUndefined();
  });

  it('token duplicado viola UNIQUE (§4.8)', async () => {
    await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-duplicado',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    await expect(
      createAccessToken(client.db, {
        userType: 'clevel',
        userId: clevelId,
        token: 'tok-duplicado',
        type: 'first_access',
        expiresAt: daysFromNow(7),
      }),
    ).rejects.toThrow();
  });

  it('listActiveTokensByUser retorna apenas nao usados e nao expirados', async () => {
    // Ativo: nao usado, expira no futuro.
    await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-ativo',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    // Expirado: nao usado, expiresAt no passado.
    await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-expirado',
      type: 'first_access',
      expiresAt: daysFromNow(-1),
    });
    // Usado: usedAt preenchido, expiresAt no futuro.
    const usedId = await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-usado',
      type: 'password_reset',
      expiresAt: daysFromNow(7),
    });
    await markTokenAsUsed(client.db, usedId, new Date());

    const ativos = await listActiveTokensByUser(client.db, 'employee', employeeId);
    expect(ativos).toHaveLength(1);
    expect(ativos[0]?.token).toBe('tok-ativo');
  });

  it('listActiveTokensByUser filtra por (userType, userId) do polimorfismo', async () => {
    // Cria um ativo para cada userType.
    await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-poli-emp',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    await createAccessToken(client.db, {
      userType: 'clevel',
      userId: clevelId,
      token: 'tok-poli-clv',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    await createAccessToken(client.db, {
      userType: 'super_admin',
      userId: SUPER_ADMIN_FIXTURE_ID,
      token: 'tok-poli-sa',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });

    const empAtivos = await listActiveTokensByUser(client.db, 'employee', employeeId);
    const clvAtivos = await listActiveTokensByUser(client.db, 'clevel', clevelId);
    const saAtivos = await listActiveTokensByUser(client.db, 'super_admin', SUPER_ADMIN_FIXTURE_ID);

    expect(empAtivos).toHaveLength(1);
    expect(empAtivos[0]?.token).toBe('tok-poli-emp');
    expect(clvAtivos).toHaveLength(1);
    expect(clvAtivos[0]?.token).toBe('tok-poli-clv');
    expect(saAtivos).toHaveLength(1);
    expect(saAtivos[0]?.token).toBe('tok-poli-sa');
  });

  it('markTokenAsUsed grava usedAt e o remove da listagem de ativos', async () => {
    const id = await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-mark',
      type: 'password_reset',
      expiresAt: daysFromNow(7),
    });
    await markTokenAsUsed(client.db, id, new Date());
    const row = await getAccessTokenById(client.db, id);
    expect(row?.usedAt).not.toBeNull();
    const ativos = await listActiveTokensByUser(client.db, 'employee', employeeId);
    expect(ativos).toHaveLength(0);
  });

  it('deleteAccessTokenById remove o registro', async () => {
    const id = await createAccessToken(client.db, {
      userType: 'employee',
      userId: employeeId,
      token: 'tok-delete',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    await deleteAccessTokenById(client.db, id);
    const row = await getAccessTokenById(client.db, id);
    expect(row).toBeUndefined();
  });

  it('padrao B: userId nao possui FK formal — insert com userId inexistente e aceito', async () => {
    // §2.3 padrao B: (userType, userId) sem FK. A integridade e da
    // aplicacao — o service persiste literalmente o que recebe.
    const id = await createAccessToken(client.db, {
      userType: 'employee',
      userId: 999_999,
      token: 'tok-sem-fk',
      type: 'first_access',
      expiresAt: daysFromNow(7),
    });
    expect(id).toBeGreaterThan(0);
    const row = await getAccessTokenById(client.db, id);
    expect(row?.userId).toBe(999_999);
  });
});
