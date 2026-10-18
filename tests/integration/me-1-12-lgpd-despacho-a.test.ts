// ROIP APP 9BOX — teste de integracao ME-1.12 Despacho A
// (itens [1.12.a] + [1.12.b] + [1.12.c] do roadmap V4).
//
// Cobre contra MySQL real (RV-11):
//   1. `buildLgpdPortabilityPayload(db, companyId, 'employee', id,
//      'colaborador')` suprime SELECTs de respostas brutas:
//      instrumentA/D/COPSOQ/individualProfile retornam [].
//   2. `buildLgpdPortabilityPayload(db, companyId, 'employee', id,
//      'super_admin')` retorna o payload integral canonico (mesmo
//      formato bit-exact pre-ME-1.12.a).
//   3. `getTermoAceiteDoTitular(db, 'employee', id)` retorna
//      estrutura com versao + aceitoEm + textoLiteral canonico
//      resolvido quando o titular aceitou pelo menos uma versao.
//   4. `getTermoAceiteDoTitular` retorna `null` quando o titular
//      nunca aceitou.
//
// Faixa canonica desta ME: CNPJ 10180000000001..10180000000009 (10
// slots reservados).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, lgpdConsents } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  getTermoAceiteDoTitular,
  insertLgpdConsentForEmployee,
} from '../../src/server/services/lgpdConsents';
import { buildLgpdPortabilityPayload } from '../../src/server/services/lgpdPortability';
import { TERMO_LITERAL_V10 } from '../../src/lib/lgpd/termoLiteral';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me-1-12-lgpd';

const CNPJ_A = '10180000000001';

describe('ME-1.12 Despacho A — LGPD modo colaborador vs super_admin', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let employeeIdComAceite: number;
  let employeeIdSemAceite: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-1.12 A LTDA',
      nomeFantasia: 'ROIP ME-1.12 A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua ME-1.12 A',
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

    const [empComAceite] = await client.db
      .insert(employees)
      .values({
        companyId: companyIdA,
        name: 'Titular Com Aceite',
        cpf: '12345678901',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo Teste',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!empComAceite) {
      throw new Error('insert employee com aceite nao retornou id');
    }
    employeeIdComAceite = empComAceite.id;

    const [empSemAceite] = await client.db
      .insert(employees)
      .values({
        companyId: companyIdA,
        name: 'Titular Sem Aceite',
        cpf: '12345678902',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo Teste',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!empSemAceite) {
      throw new Error('insert employee sem aceite nao retornou id');
    }
    employeeIdSemAceite = empSemAceite.id;

    // Insere aceite canonico v1.0 para o primeiro titular.
    await insertLgpdConsentForEmployee(client.db, companyIdA, employeeIdComAceite, '1.0');
  });

  afterAll(async () => {
    await client.db.delete(lgpdConsents).where(eq(lgpdConsents.companyId, companyIdA));
    await client.db.delete(employees).where(eq(employees.companyId, companyIdA));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, companyIdA));
    await client.db.delete(companies).where(eq(companies.id, companyIdA));
    await closeDbClient(client);
  });

  it('getTermoAceiteDoTitular retorna estrutura canonica quando ha aceite', async () => {
    const termo = await getTermoAceiteDoTitular(client.db, 'employee', employeeIdComAceite);
    expect(termo).not.toBeNull();
    if (termo === null) return;
    expect(termo.versao).toBe('1.0');
    expect(termo.aceitoEm).toBeInstanceOf(Date);
    expect(termo.textoLiteral).toBe(TERMO_LITERAL_V10);
  });

  it('getTermoAceiteDoTitular retorna null quando titular nunca aceitou', async () => {
    const termo = await getTermoAceiteDoTitular(client.db, 'employee', employeeIdSemAceite);
    expect(termo).toBeNull();
  });

  it('buildLgpdPortabilityPayload modo colaborador suprime respostas brutas', async () => {
    const payload = await buildLgpdPortabilityPayload(
      client.db,
      companyIdA,
      'employee',
      employeeIdComAceite,
      'colaborador',
    );
    expect(payload.instrumentA).toEqual([]);
    expect(payload.instrumentD).toEqual([]);
    expect(payload.copsoq).toEqual([]);
    expect(payload.individualProfile).toEqual([]);
    expect(payload.cadastrais.nome).toBe('Titular Com Aceite');
    expect(payload.termoAceite).not.toBeNull();
    if (payload.termoAceite === null) return;
    expect(payload.termoAceite.versao).toBe('1.0');
    expect(payload.termoAceite.aceitoEmDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.termoAceite.textoLiteral).toBe(TERMO_LITERAL_V10);
  });

  it('buildLgpdPortabilityPayload modo super_admin preserva formato canonico', async () => {
    const payload = await buildLgpdPortabilityPayload(
      client.db,
      companyIdA,
      'employee',
      employeeIdComAceite,
      'super_admin',
    );
    // Mesmo sem respostas brutas semeadas, as listas sao arrays (nao
    // undefined). Formato canonico bit-exact preservado.
    expect(Array.isArray(payload.instrumentA)).toBe(true);
    expect(Array.isArray(payload.instrumentD)).toBe(true);
    expect(Array.isArray(payload.copsoq)).toBe(true);
    expect(Array.isArray(payload.individualProfile)).toBe(true);
    expect(payload.cadastrais.nome).toBe('Titular Com Aceite');
    expect(payload.termoAceite).not.toBeNull();
  });

  it('modo colaborador para titular sem aceite retorna termoAceite null', async () => {
    const payload = await buildLgpdPortabilityPayload(
      client.db,
      companyIdA,
      'employee',
      employeeIdSemAceite,
      'colaborador',
    );
    expect(payload.termoAceite).toBeNull();
  });
});
