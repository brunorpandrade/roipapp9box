// ROIP APP 9BOX — teste de integracao ME-PROD-01 (MySQL real, RV-11).
//
// Cobre canonicamente a emissao do card `meuPerfil` do
// `pendenciasEngine` para C-levels, corrigindo o blocker de producao
// em que Marcio (CEO) e Michelle (COO) da Embrastec nao conseguiam
// acessar o Perfil Individual via `/meu-portal/perfil-individual`.
//
// Causa raiz canonica (RV-01 dirigida contra HEAD `ae6db66`):
//   `src/lib/pendencias/pendenciasEngine.ts` bloco 1 (meuPerfil)
//   descartava bit-a-bit `p.userType !== 'employee'` com um `continue`
//   explicito, impedindo que o motor materializasse pendencia de
//   meuPerfil para C-level. `loadMeuPortalData` (que serve a page
//   `/meu-portal/perfil-individual`) depende canonicamente dessa
//   emissao para localizar o card do C-level logado.
//
// Fix canonico ME-PROD-01: Consulta 2.5 nova (cLevelMembersRows +
// cLevelMembersById) e Bloco 1 reescrito com bifurcacao de lookup
// (`employee` → employeesById; `clevel` → cLevelMembersById).
// `liderNome` e `liderId` ficam `null` para C-level (C-level nao e
// liderado em `employeeLeaderHistory`).
//
// Faixa canonica desta ME (S327 analogo): CNPJ 10190000000001..
// 10190000000049 (nova sub-faixa reservada para ME-PROD-01).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycleSnapshot,
  copsoqCycles,
  cycleSchedule,
  employeeLeaderHistory,
  employees,
  individualProfilePlaceholders,
  instrumentA_responses,
  instrumentD_responses,
  portalReminderLog,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { loadPendenciasPage } from '../../src/lib/pendencias/pendenciasEngine';
import { CANONICAL_PENDENCIAS_DEFAULT_FILTERS } from '../../src/app/pendencias-portal/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_A = '10190000000001';
const CNPJ_B = '10190000000002';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const CRIADO_HA_10D = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
const CRIADO_HA_40D = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);

let cpfSeq = 20000;
function nextCpf(): string {
  return String(cpfSeq++).padStart(11, '0');
}

describe('ME-PROD-01 — pendenciasEngine materializa meuPerfil de C-level', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let empAId: number;
  let clevelAId: number;
  let clevelAIdInativo: number;
  let clevelBId: number;

  async function limparBase(): Promise<void> {
    await client.db.delete(portalReminderLog);
    await client.db.delete(instrumentA_responses);
    await client.db.delete(instrumentD_responses);
    await client.db.delete(copsoqCycleSnapshot);
    await client.db.delete(copsoqCycles);
    await client.db.delete(cycleSchedule);
    await client.db.delete(individualProfilePlaceholders);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
  }

  async function insertEmployee(input: {
    readonly companyId: number;
    readonly name: string;
    readonly departamento?: 'Financeiro' | 'Comercial' | 'Marketing' | 'Recursos Humanos';
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
        departamento: input.departamento ?? 'Comercial',
        status: 'ativo',
        isLider: false,
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
    readonly cargo: string;
    readonly departamento?: 'Financeiro' | 'Comercial' | 'Marketing' | 'Recursos Humanos';
    readonly status?: 'ativo' | 'inativo';
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
        cargo: input.cargo,
        descricaoCargo: input.cargo,
        departamento: input.departamento ?? 'Comercial',
        custoMensal: '10000.00',
        acessoTotal: true,
        isResponsavelFinanceiro: false,
        isRH: false,
        status: input.status ?? 'ativo',
        passwordHash: 'x',
        passwordSet: true,
        matricula: null,
      })
      .$returningId();
    return row!.id;
  }

  async function insertPlaceholder(input: {
    readonly companyId: number;
    readonly userType: 'employee' | 'clevel';
    readonly userId: number;
    readonly createdAt: Date;
    readonly status?: 'pendente' | 'em_andamento' | 'aguardando_nova_resposta';
  }): Promise<void> {
    await client.db.insert(individualProfilePlaceholders).values({
      companyId: input.companyId,
      userType: input.userType,
      userId: input.userId,
      status: input.status ?? 'pendente',
      createdAt: input.createdAt,
    });
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    // Padrao canonico herdado de `me058-pendencias.test.ts`: limpar base
    // antes de fechar o client, caso contrario placeholders residuais do
    // ultimo `it` ficam ligados a `companies` de teste e quebram o
    // `beforeEach` da suite seguinte que nao limpa
    // `individualProfilePlaceholders` (ex.: `trpc-procedures.test.ts`
    // falha com FK ER_ROW_IS_REFERENCED_2 sobre
    // `individualprofileplaceholders_ibfk_1`).
    await limparBase();
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await limparBase();
    cpfSeq = 20000;

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-PROD-01 A LTDA',
      nomeFantasia: 'ROIP ME-PROD-01 A',
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
      razaoSocial: 'ROIP ME-PROD-01 B LTDA',
      nomeFantasia: 'ROIP ME-PROD-01 B',
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

    empAId = await insertEmployee({
      companyId: companyIdA,
      name: 'Ana Employee',
      departamento: 'Financeiro',
    });
    clevelAId = await insertClevel({
      companyId: companyIdA,
      name: 'Marcio CEO',
      cargo: 'CEO',
      departamento: 'Comercial',
    });
    clevelAIdInativo = await insertClevel({
      companyId: companyIdA,
      name: 'Ex Diretor',
      cargo: 'CFO',
      departamento: 'Financeiro',
      status: 'inativo',
    });
    clevelBId = await insertClevel({
      companyId: companyIdB,
      name: 'Clevel Empresa B',
      cargo: 'CEO',
    });
  });

  it('emite card meuPerfil para C-level ativo com userType=clevel e campos corretos', async () => {
    await insertPlaceholder({
      companyId: companyIdA,
      userType: 'clevel',
      userId: clevelAId,
      createdAt: CRIADO_HA_10D,
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const linhasMeuPerfilClevel = result.rows.filter(
      (r) => r.instrumento === 'meuPerfil' && r.userType === 'clevel',
    );
    expect(linhasMeuPerfilClevel).toHaveLength(1);
    const linha = linhasMeuPerfilClevel[0]!;
    expect(linha.userId).toBe(clevelAId);
    expect(linha.nome).toBe('Marcio CEO');
    expect(linha.cargo).toBe('CEO');
    expect(linha.departamento).toBe('Comercial');
    expect(linha.liderNome).toBeNull();
    expect(linha.liderId).toBeNull();
    expect(linha.status).toBe('Pendente');
    expect(linha.cicloReferencia).toBeNull();
    expect(linha.key).toBe(`meuPerfil:clevel:${clevelAId}:-`);
  });

  it('emite card meuPerfil para employee e C-level na mesma empresa simultaneamente', async () => {
    await insertPlaceholder({
      companyId: companyIdA,
      userType: 'employee',
      userId: empAId,
      createdAt: CRIADO_HA_10D,
    });
    await insertPlaceholder({
      companyId: companyIdA,
      userType: 'clevel',
      userId: clevelAId,
      createdAt: CRIADO_HA_10D,
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const linhasMeuPerfil = result.rows.filter((r) => r.instrumento === 'meuPerfil');
    expect(linhasMeuPerfil).toHaveLength(2);
    const porTipo = new Map(linhasMeuPerfil.map((r) => [r.userType, r]));
    expect(porTipo.get('employee')!.userId).toBe(empAId);
    expect(porTipo.get('clevel')!.userId).toBe(clevelAId);
  });

  it('C-level com idade >= threshold canoniza status Atrasado', async () => {
    await insertPlaceholder({
      companyId: companyIdA,
      userType: 'clevel',
      userId: clevelAId,
      createdAt: CRIADO_HA_40D,
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const linha = result.rows.find((r) => r.instrumento === 'meuPerfil' && r.userType === 'clevel');
    expect(linha).toBeDefined();
    expect(linha!.status).toBe('Atrasado');
    expect(linha!.diasEmAtraso).toBeGreaterThanOrEqual(10);
  });

  it('C-level de outra empresa nao vaza no scope da empresa consultada', async () => {
    await insertPlaceholder({
      companyId: companyIdB,
      userType: 'clevel',
      userId: clevelBId,
      createdAt: CRIADO_HA_10D,
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    expect(result.rows.filter((r) => r.instrumento === 'meuPerfil')).toHaveLength(0);
  });

  it('C-level inativo nao emite card (filtro status=ativo na Consulta 2.5)', async () => {
    await insertPlaceholder({
      companyId: companyIdA,
      userType: 'clevel',
      userId: clevelAIdInativo,
      createdAt: CRIADO_HA_10D,
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    expect(result.rows.filter((r) => r.instrumento === 'meuPerfil')).toHaveLength(0);
  });

  it('C-level com status aguardando_nova_resposta emite card canonicamente', async () => {
    await insertPlaceholder({
      companyId: companyIdA,
      userType: 'clevel',
      userId: clevelAId,
      createdAt: CRIADO_HA_10D,
      status: 'aguardando_nova_resposta',
    });

    const result = await loadPendenciasPage({
      db: client.db,
      companyId: companyIdA,
      filters: CANONICAL_PENDENCIAS_DEFAULT_FILTERS,
      page: 1,
      pageSize: 50,
      now: NOW,
    });

    const linha = result.rows.find((r) => r.instrumento === 'meuPerfil' && r.userType === 'clevel');
    expect(linha).toBeDefined();
    expect(linha!.userId).toBe(clevelAId);
  });
});
