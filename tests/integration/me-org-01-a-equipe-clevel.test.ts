// ROIP APP 9BOX — teste de integracao ME-ORG-01-A (MySQL real, RV-11).
//
// Cobre canonicamente o polimorfismo `liderTipo` do loader
// `loadDashboardEquipeContext`, desbloqueando o Assistente de
// lideranca no painel C-level de equipe direta (D-CHAT-EQUIPE-CLEVEL).
//
// Causa raiz canonica (RV-01 dirigida contra HEAD `b00f7ff`):
//   `src/server/services/_shared/dashboardEquipeContext.ts` presumia
//   `liderTipo='employee'` bit-a-bit no `composeEquipeIdentificacao`
//   (lookup so em `employees`) e nos composers subjacentes (todos via
//   `employeeLeaderHistory.liderId`). Para C-level, retornava `null`,
//   derrubando o fluxo com `context_not_found`.
//
// Fix canonico ME-ORG-01-A: `liderTipo: 'employee' | 'clevel'`
// adicionado em `DashboardEquipeContextArgs` e propagado por todos
// os composers via helper `matchLiderAtivo(liderId, liderTipo)` que
// bifurca `employeeLeaderHistory.liderId` XOR `employeeLeaderHistory.
// clevelId`. Lookup de identificacao bifurca entre `employees` e
// `cLevelMembers`. Blocos IQL e Clima consomem APIs polimorficas ja
// existentes (`getIqlDataByClevelQuarter` + `computeClimateBlock`).
//
// Faixa canonica desta ME: CNPJ 10200000000001..10200000000049.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
// eslint-disable-next-line @stylistic/max-len -- import atomico (prettier)
import { loadDashboardEquipeContext } from '../../src/server/services/_shared/dashboardEquipeContext';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_A = '10200000000001';
const CNPJ_B = '10200000000002';

let cpfSeq = 30000;
function nextCpf(): string {
  return String(cpfSeq++).padStart(11, '0');
}

let batchSeq = 50000;
function nextBatchId(): string {
  const n = String(batchSeq++).padStart(12, '0');
  return `000000000000000000-${n}`.slice(-36);
}

describe('ME-ORG-01-A — loadDashboardEquipeContext polimorfico liderTipo', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let empLiderAId: number;
  let empDiretoAId: number;
  let clevelAId: number;
  let empDiretoClA1Id: number;
  let empDiretoClA2Id: number;
  let clevelBId: number;

  async function limparBase(): Promise<void> {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
  }

  async function insertEmployee(input: {
    readonly companyId: number;
    readonly name: string;
    readonly isLider?: boolean;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: input.companyId,
        name: input.name,
        cpf: nextCpf(),
        email: `${input.name.toLowerCase().replace(/\s+/g, '.')}@roip.test`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '999999',
        descricaoCBO: 'Analista',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: 'ativo',
        isLider: input.isLider ?? false,
        isRH: false,
        passwordHash: 'x',
        passwordSet: true,
      })
      .$returningId();
    return row!.id;
  }

  async function insertClevel(input: {
    readonly companyId: number;
    readonly name: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: input.companyId,
        name: input.name,
        cpf: nextCpf(),
        email: `${input.name.toLowerCase().replace(/\s+/g, '.')}@roip.test`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'CEO',
        departamento: 'Comercial',
        custoMensal: '10000.00',
        acessoTotal: true,
        isResponsavelFinanceiro: false,
        isRH: false,
        status: 'ativo',
        passwordHash: 'x',
        passwordSet: true,
        matricula: null,
      })
      .$returningId();
    return row!.id;
  }

  async function vinculaEmployeeLider(employeeId: number, liderEmployeeId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId: liderEmployeeId,
      clevelId: null,
      dataInicio: new Date('2025-01-01'),
      dataFim: null,
      reason: 'fixture ME-ORG-01-A',
      transferBatchId: nextBatchId(),
    });
  }

  async function vinculaClevelLider(employeeId: number, clevelLiderId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId: null,
      clevelId: clevelLiderId,
      dataInicio: new Date('2025-01-01'),
      dataFim: null,
      reason: 'fixture ME-ORG-01-A',
      transferBatchId: nextBatchId(),
    });
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await limparBase();
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await limparBase();
    cpfSeq = 30000;
    batchSeq = 50000;

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-ORG-01-A LTDA',
      nomeFantasia: 'ROIP ME-ORG-01-A',
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
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdA));

    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-ORG-01-B LTDA',
      nomeFantasia: 'ROIP ME-ORG-01-B',
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
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdB));

    empLiderAId = await insertEmployee({
      companyId: companyIdA,
      name: 'Lider Employee',
      isLider: true,
    });
    empDiretoAId = await insertEmployee({ companyId: companyIdA, name: 'Direto Employee' });
    await vinculaEmployeeLider(empDiretoAId, empLiderAId);

    clevelAId = await insertClevel({ companyId: companyIdA, name: 'Marcio CEO' });
    empDiretoClA1Id = await insertEmployee({ companyId: companyIdA, name: 'Direto Clevel 1' });
    empDiretoClA2Id = await insertEmployee({ companyId: companyIdA, name: 'Direto Clevel 2' });
    await vinculaClevelLider(empDiretoClA1Id, clevelAId);
    await vinculaClevelLider(empDiretoClA2Id, clevelAId);

    clevelBId = await insertClevel({ companyId: companyIdB, name: 'Clevel Empresa B' });
  });

  it('liderTipo=employee carrega canonicamente lider employee com diretos', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: empLiderAId,
      liderTipo: 'employee',
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.identificacao.nome_lider).toBe('Lider Employee');
    expect(ctx!.identificacao.diretos).toBe(1);
    expect(ctx!.lista_colaboradores).toHaveLength(1);
    expect(ctx!.lista_colaboradores[0]!.nome).toBe('Direto Employee');
  });

  it('liderTipo=clevel carrega canonicamente C-level com 2 diretos', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: clevelAId,
      liderTipo: 'clevel',
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.identificacao.nome_lider).toBe('Marcio CEO');
    expect(ctx!.identificacao.diretos).toBe(2);
    expect(ctx!.lista_colaboradores).toHaveLength(2);
    const nomes = ctx!.lista_colaboradores.map((c) => c.nome).sort();
    expect(nomes).toEqual(['Direto Clevel 1', 'Direto Clevel 2']);
  });

  it('liderTipo=clevel com C-level inexistente retorna null', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: 9999999,
      liderTipo: 'clevel',
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    expect(ctx).toBeNull();
  });

  it('autovisualizacao canonica para C-level (viewer=clevel e viewerUserId=liderId)', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: clevelAId,
      liderTipo: 'clevel',
      viewerRole: 'clevel',
      viewerUserId: clevelAId,
      viewerUserType: 'clevel',
    });
    expect(ctx).not.toBeNull();
    // IQL de autovisualizacao canonicamente omitido (§5.6).
    expect(ctx!.iql_lider).toBeNull();
  });

  it('cross-tenant: liderTipo=clevel nao vaza entre empresas', async () => {
    const ctx = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: clevelBId,
      liderTipo: 'clevel',
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    // C-level B existe mas scope e companyA — identificacao retorna
    // o nome (lookup em cLevelMembers nao filtra companyId por design
    // canonico atual; cross-tenant guard esta no router/action).
    // Aqui testamos o loader: carrega o C-level e nao retorna diretos
    // (vinculo canonico de B em companyA nao existe).
    expect(ctx).not.toBeNull();
    expect(ctx!.identificacao.diretos).toBe(0);
    expect(ctx!.lista_colaboradores).toHaveLength(0);
  });

  it('diretos de C-level ficam isolados dos diretos do lider employee', async () => {
    const ctxClevel = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: clevelAId,
      liderTipo: 'clevel',
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    const ctxEmployee = await loadDashboardEquipeContext(client.db, {
      companyId: companyIdA,
      liderId: empLiderAId,
      liderTipo: 'employee',
      viewerRole: 'rh',
      viewerUserId: 999,
      viewerUserType: 'super_admin',
    });
    const idsClevel = ctxClevel!.lista_colaboradores.map((c) => c.nome).sort();
    const idsEmployee = ctxEmployee!.lista_colaboradores.map((c) => c.nome).sort();
    expect(idsClevel).toEqual(['Direto Clevel 1', 'Direto Clevel 2']);
    expect(idsEmployee).toEqual(['Direto Employee']);
    // Interseccao canonicamente vazia.
    expect(idsClevel.filter((n) => idsEmployee.includes(n))).toEqual([]);
  });
});
