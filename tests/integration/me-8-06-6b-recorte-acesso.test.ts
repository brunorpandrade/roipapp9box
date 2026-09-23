// ROIP APP 9BOX — ME §8.06.6b — autorização de acesso aos recortes
// (PC1h, cadeia descendente própria) contra MySQL real (RV-11). Semeia
// dois departamentos (Comercial: e1 líder + e2/e4 diretos + e3 sob e2;
// Operações: e10 líder + e11/e12) e um líder solto (e5). Verifica a régua
// `canAccessRecorte` com escopo nulo (acesso total), escopo de líder e de
// C-level restrito, e a integração real com `resolveHierarchicalScope`.
//
// Faixa CNPJ reservada distinta (987).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import type { Departamento } from '../../src/db/schema/enums';
import { createCompany } from '../../src/server/services/companies';
import { canAccessRecorte } from '../../src/server/services/recorteAccess';
import { resolveHierarchicalScope } from '../../src/server/services/hierarchicalScope';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ = '10000000000987';
let cpfSeq = 60000000000;

const BASE_COMPANY_INPUT = {
  telefone: '1633330099',
  endereco: 'Rua Acesso',
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
  kickoffDate: new Date('2025-01-01'),
};

describe('ME §8.06.6b — canAccessRecorte (PC1h, MySQL real)', () => {
  let client: RoipDbClient;
  let companyId = 0;
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;
  let e4 = 0;
  let e5 = 0;
  let e10 = 0;
  let e11 = 0;
  let e12 = 0;

  async function seedEmployee(name: string, dept: Departamento, lider: boolean): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf: String(cpfSeq),
        email: `${cpfSeq}@roip.test`,
        dataNascimento: new Date('1990-05-20'),
        dataAdmissao: new Date('2024-01-10'),
        cargo: 'Analista',
        cbo: '252105',
        descricaoCBO: 'Analista de negócios',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: dept,
        isLider: lider,
        isRH: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function link(employeeId: number, liderId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2024-01-15'),
      dataFim: null,
      reason: 'seed §8.06.6b',
      transferBatchId: '00000000-0000-0000-0000-000000000000',
    });
  }

  async function cleanup(): Promise<void> {
    const rows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.cnpj, [CNPJ]));
    const cids = rows.map((r) => r.id);
    if (cids.length === 0) {
      return;
    }
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, cids));
    const eids = emps.map((r) => r.id);
    if (eids.length > 0) {
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, eids));
    }
    await client.db.delete(employees).where(inArray(employees.companyId, cids));
    await client.db.delete(companies).where(inArray(companies.id, cids));
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyId = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP 8066B LTDA',
      nomeFantasia: 'ROIP 8066B',
      cnpj: CNPJ,
    });
    e1 = await seedEmployee('Acc E1', 'Comercial', true);
    e2 = await seedEmployee('Acc E2', 'Comercial', true);
    e3 = await seedEmployee('Acc E3', 'Comercial', false);
    e4 = await seedEmployee('Acc E4', 'Comercial', false);
    e5 = await seedEmployee('Acc E5', 'Comercial', true);
    e10 = await seedEmployee('Acc E10', 'Operações', true);
    e11 = await seedEmployee('Acc E11', 'Operações', false);
    e12 = await seedEmployee('Acc E12', 'Operações', false);
    await link(e2, e1);
    await link(e4, e1);
    await link(e3, e2);
    await link(e11, e10);
    await link(e12, e10);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  function equipe(id: number): { tipo: 'equipe'; leader: { tipo: 'employee'; id: number } } {
    return { tipo: 'equipe', leader: { tipo: 'employee', id } };
  }
  function depto(d: Departamento): { tipo: 'departamento'; departamento: Departamento } {
    return { tipo: 'departamento', departamento: d };
  }

  it('escopo nulo (Bruno/RH/C-level total): qualquer recorte é acessível', async () => {
    expect(await canAccessRecorte(client.db, companyId, null, '', equipe(e1))).toBe(true);
    expect(await canAccessRecorte(client.db, companyId, null, '', depto('Comercial'))).toBe(true);
    expect(await canAccessRecorte(client.db, companyId, null, '', depto('Operações'))).toBe(true);
  });

  it('líder: própria equipe (self) e subordinado-líder na cadeia; fora não', async () => {
    const scope = new Set([`employee-${e2}`, `employee-${e3}`, `employee-${e4}`]);
    const self = `employee-${e1}`;
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e1))).toBe(true);
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e2))).toBe(true);
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e5))).toBe(false);
    // Departamento inteiro inclui o próprio líder (fora do scope) -> negado.
    expect(await canAccessRecorte(client.db, companyId, scope, self, depto('Comercial'))).toBe(
      false,
    );
  });

  it('C-level restrito: departamento todo na cadeia sim; com alguém fora não', async () => {
    const scope = new Set([`employee-${e10}`, `employee-${e11}`, `employee-${e12}`]);
    const self = `clevel-999`;
    expect(await canAccessRecorte(client.db, companyId, scope, self, depto('Operações'))).toBe(
      true,
    );
    expect(await canAccessRecorte(client.db, companyId, scope, self, depto('Comercial'))).toBe(
      false,
    );
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e10))).toBe(true);
  });

  it('integração real: resolveHierarchicalScope(líder) alimenta canAccessRecorte', async () => {
    const scope = await resolveHierarchicalScope(client.db, {
      role: 'lider',
      userId: e1,
      companyId,
    });
    expect(scope).not.toBeNull();
    const self = `employee-${e1}`;
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e1))).toBe(true);
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e2))).toBe(true);
    expect(await canAccessRecorte(client.db, companyId, scope, self, equipe(e5))).toBe(false);
  });
});
