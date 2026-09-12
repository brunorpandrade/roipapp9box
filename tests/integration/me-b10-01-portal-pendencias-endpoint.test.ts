// ROIP APP 9BOX — teste de integração ME-B10-01
// (S250 Opção B) — Route Handler `GET /api/portal/pendencias`.
//
// Cobertura canônica:
//   1. Sem header Authorization → 401 MSG_MISSING_TOKEN.
//   2. Header sem Bearer prefix → 401 MSG_MISSING_TOKEN.
//   3. Token malformado → 401 MSG_INVALID_TOKEN.
//   4. Token válido → 200 com payload PortalColaboradorPendencias.
//
// Faixa canônica CNPJ desta ME: 10870000000250..10870000000299.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { signPortalToken } from '../../src/server/auth/portalToken';
import { GET } from '../../src/app/api/portal/pendencias/route';
import {
  _resetDbClientForTests,
  _setDbClientForTests,
} from '../../src/app/api/portal/pendencias/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ = '10870000000250';

const BASE_COMPANY_INPUT = {
  telefone: '1633330001',
  endereco: 'Rua Teste',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  contatoPrincipalNome: 'Principal',
  contatoPrincipalEmail: 'p@roip.test',
  contatoRHNome: 'RH',
  contatoRHEmail: 'rh@roip.test',
  segmento: 'Serviço' as const,
  tipoAtividade: 'Consultoria',
  descricaoAtividade: 'A',
  contextoMercado: 'A',
  mesKickoff: 1,
  kickoffDate: new Date('2020-01-01'),
};

describe('ME-B10-01 — GET /api/portal/pendencias (S250 Opção B)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let empId: number;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-me-b10-01-endpoint';
    client = createDbClient(TEST_URL);
    _setDbClientForTests(client);
  });

  afterAll(async () => {
    await client.db.delete(employees);
    await client.db.delete(companies);
    // `_resetDbClientForTests` já fecha o pool internamente porque
    // `_setDbClientForTests(client)` injetou o próprio `client` como
    // singleton — chamar `closeDbClient(client)` aqui provocaria
    // rejection "Can't add new command when connection is in closed
    // state" no segundo close.
    _resetDbClientForTests();
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(companies);

    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP ME-B10-01 endpoint LTDA',
      nomeFantasia: 'ROIP ME-B10-01 endpoint',
      cnpj: CNPJ,
    });
    await client.db
      .update(companies)
      .set({ status: 'ativa' })
      .where(inArray(companies.id, [companyId]));

    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Endpoint Titular',
        cpf: '40870000060',
        matricula: 'AB01',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
        isRH: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seed endpoint sem id');
    }
    empId = row.id;
  });

  it('sem header Authorization → 401', async () => {
    const req = new Request('http://test/api/portal/pendencias', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toContain('Token');
  });

  it('header sem prefixo Bearer → 401', async () => {
    const req = new Request('http://test/api/portal/pendencias', {
      method: 'GET',
      headers: { authorization: 'apenas-token-sem-bearer' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('token malformado → 401', async () => {
    const req = new Request('http://test/api/portal/pendencias', {
      method: 'GET',
      headers: { authorization: 'Bearer nao-eh-jwt-valido' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('token válido → 200 com PortalColaboradorPendencias', async () => {
    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: empId,
    });
    const req = new Request('http://test/api/portal/pendencias', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pendencias: unknown[];
      respondidosRecentes: unknown[];
    };
    expect(Array.isArray(body.pendencias)).toBe(true);
    expect(Array.isArray(body.respondidosRecentes)).toBe(true);
  });
});
