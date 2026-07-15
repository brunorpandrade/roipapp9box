// ROIP APP 9BOX — teste de integracao `lgpdConsents` (ME-017).
//
// Cobre §14.1: padrao polimorfico A (employeeId XOR clevelId); INSERT
// nas duas variantes; UNIQUE separadas por variante
// (uq_lgpd_employee, uq_lgpd_clevel); CHECK canonico
// `chk_lgpd_titular_unico` bloqueia (ambos preenchidos) e (nenhum
// preenchido); FK CASCADE em employeeId/clevelId; delete por company.

import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, lgpdConsents } from '../../src/db/schema';
import {
  deleteLgpdConsentsByCompany,
  getLgpdConsentByClevelVersao,
  getLgpdConsentByEmployeeVersao,
  insertLgpdConsentForClevel,
  insertLgpdConsentForEmployee,
  listLgpdConsentsByEmployee,
} from '../../src/server/services/lgpdConsents';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000147';

describe('service lgpdConsents (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa LGPD Test LTDA',
        nomeFantasia: 'Empresa LGPD Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330047',
        endereco: 'Rua LGPD, 47',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@lgpd.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@lgpd.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colab LGPD',
        cpf: '10101010147',
        email: 'colab.lgpd@roip.local',
        dataNascimento: new Date('1990-05-10'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee');
    employeeId = emp.id;

    const [cle] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'CEO LGPD',
        cpf: '20202020147',
        email: 'ceo.lgpd@roip.local',
        dataNascimento: new Date('1970-05-10'),
        dataAdmissao: new Date('2010-01-15'),
        cargo: 'CEO',
        descricaoCargo: 'Chief Executive Officer',
        departamento: 'Diretoria',
        custoMensal: '50000.00',
      })
      .$returningId();
    if (!cle) throw new Error('beforeAll: falha ao criar cLevelMember');
    clevelId = cle.id;
  });

  afterAll(async () => {
    await client.db.delete(lgpdConsents).where(eq(lgpdConsents.companyId, companyId));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.id, clevelId));
    await client.db.delete(employees).where(eq(employees.id, employeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(lgpdConsents).where(eq(lgpdConsents.companyId, companyId));
  });

  it('insertLgpdConsentForEmployee grava com clevelId=null', async () => {
    const id = await insertLgpdConsentForEmployee(client.db, companyId, employeeId, '1.0');
    expect(id).toBeGreaterThan(0);
    const row = await getLgpdConsentByEmployeeVersao(client.db, employeeId, '1.0');
    expect(row?.id).toBe(id);
    expect(row?.employeeId).toBe(employeeId);
    expect(row?.clevelId).toBeNull();
  });

  it('insertLgpdConsentForClevel grava com employeeId=null', async () => {
    const id = await insertLgpdConsentForClevel(client.db, companyId, clevelId, '1.0');
    expect(id).toBeGreaterThan(0);
    const row = await getLgpdConsentByClevelVersao(client.db, clevelId, '1.0');
    expect(row?.id).toBe(id);
    expect(row?.employeeId).toBeNull();
    expect(row?.clevelId).toBe(clevelId);
  });

  it('UNIQUE uq_lgpd_employee bloqueia (employeeId, versao) duplicada', async () => {
    await insertLgpdConsentForEmployee(client.db, companyId, employeeId, '1.0');
    await expect(
      insertLgpdConsentForEmployee(client.db, companyId, employeeId, '1.0'),
    ).rejects.toThrow();
  });

  it('UNIQUE uq_lgpd_clevel bloqueia (clevelId, versao) duplicada', async () => {
    await insertLgpdConsentForClevel(client.db, companyId, clevelId, '1.0');
    await expect(
      insertLgpdConsentForClevel(client.db, companyId, clevelId, '1.0'),
    ).rejects.toThrow();
  });

  it('versoes distintas do termo coexistem para o mesmo titular', async () => {
    const id1 = await insertLgpdConsentForEmployee(client.db, companyId, employeeId, '1.0');
    const id2 = await insertLgpdConsentForEmployee(client.db, companyId, employeeId, '2.0');
    expect(id1).not.toBe(id2);
    const historico = await listLgpdConsentsByEmployee(client.db, employeeId);
    expect(historico.map((r) => r.versaoTermoAceita).sort()).toEqual(['1.0', '2.0']);
  });

  it('CHECK chk_lgpd_titular_unico bloqueia employee+clevel preenchidos', async () => {
    await expect(
      client.db.insert(lgpdConsents).values({
        companyId,
        employeeId,
        clevelId,
        versaoTermoAceita: '1.0',
      }),
    ).rejects.toThrow();
  });

  it('CHECK chk_lgpd_titular_unico bloqueia ambos NULL', async () => {
    await expect(
      client.db.insert(lgpdConsents).values({
        companyId,
        employeeId: null,
        clevelId: null,
        versaoTermoAceita: '1.0',
      }),
    ).rejects.toThrow();
  });

  it('FK CASCADE em employeeId propaga delete', async () => {
    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colab Cascade LGPD',
        cpf: '99999999147',
        email: 'cascade.lgpd@roip.local',
        dataNascimento: new Date('1990-05-10'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!emp) throw new Error('falha ao criar employee de cascade');
    await insertLgpdConsentForEmployee(client.db, companyId, emp.id, '1.0');
    await client.db.delete(employees).where(eq(employees.id, emp.id));
    const rows = await client.db
      .select()
      .from(lgpdConsents)
      .where(and(eq(lgpdConsents.employeeId, emp.id), isNull(lgpdConsents.clevelId)));
    expect(rows.length).toBe(0);
  });

  it('deleteLgpdConsentsByCompany remove tudo da empresa', async () => {
    await insertLgpdConsentForEmployee(client.db, companyId, employeeId, '1.0');
    await insertLgpdConsentForClevel(client.db, companyId, clevelId, '1.0');
    const afetadas = await deleteLgpdConsentsByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
