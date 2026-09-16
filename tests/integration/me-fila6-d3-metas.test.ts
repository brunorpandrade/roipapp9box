// ROIP APP 9BOX — ME-fila6 D3 — modal [Definir metas] (M1) e variaveis
// vigentes por colaborador (MySQL real).
//
// Faixa CNPJ 990..999 (reserva do turnover da ME-fila6; D2 usou 980/981).
//
// Cenario: RH; Lider L com liderado E (vendas_comercial); C-level C com
// liderado E6 (lideranca_gestao); O sem vinculo; I inativo; T da familia
// tecnico_especialista (sem template). Templates de vendas e lideranca.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  companyJobFamilies,
  employeeGoals,
  employeeLeaderHistory,
  employees,
} from '../../src/db/schema';
import type { JobFamily } from '../../src/db/schema';
import type { PlatformSession } from '../../src/lib/session/platformMenuContext';
import {
  MSG_META_FORA_INTERVALO,
  MSG_META_VAZIA,
  MSG_PESO_FORA_INTERVALO,
  MSG_PESO_VAZIO,
  MSG_SOMA_PESOS,
  validarMetas,
  type MetaRascunho,
} from '../../src/lib/shared/employeeGoalsForm';
import { createCompany } from '../../src/server/services/companies';
import {
  MSG_METAS_COLABORADOR_INATIVO,
  MSG_METAS_INVALIDAS,
  MSG_METAS_SEM_PERMISSAO,
  canViewerDefineGoals,
  loadMetasModal,
  loadMetasStatus,
  salvarMetas,
} from '../../src/server/services/employeeGoalsModal';
import { listEmployeeVariables } from '../../src/server/services/employeeVariables';
import { loadFichaCadastralForViewer } from '../../src/server/services/fichaCadastral';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';
const CNPJ_A = '10000000000990';
const CNPJ_B = '10000000000991';
const BATCH = '00000000-0000-0000-0000-000000000f63';
let cpfSeq = 56000000000;

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

function linhas(pesos: string[], metas: string[]): MetaRascunho[] {
  return pesos.map((w, i) => ({ variableIndex: i, weight: w, goal: metas[i] ?? '' }));
}

describe('ME-fila6 D3 — metas individuais (MySQL real)', () => {
  let client: RoipDbClient;
  let companyA = 0;
  let companyB = 0;
  const ids = { rh: 0, lider: 0, e: 0, e6: 0, o: 0, i: 0, t: 0, c: 0 };

  function platform(role: PlatformSession['role'], userId: number, companyId = companyA) {
    return { kind: 'platform', role, userId, companyId } as const;
  }

  async function seedEmployee(
    name: string,
    jobFamily: JobFamily,
    opts: { isLider?: boolean; isRH?: boolean; status?: 'ativo' | 'inativo' } = {},
  ): Promise<number> {
    cpfSeq += 1;
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: companyA,
        name,
        cpf: String(cpfSeq),
        dataNascimento: new Date('1990-05-20'),
        dataAdmissao: new Date('2021-03-01'),
        cargo: 'Analista',
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily,
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: opts.isLider ?? false,
        isRH: opts.isRH ?? false,
        isResponsavelFinanceiro: false,
        status: opts.status ?? 'ativo',
        onboardingEstagio: 'treinar',
      })
      .$returningId();
    return row!.id;
  }

  async function link(employeeId: number, leader: { liderId?: number; clevelId?: number }) {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId: leader.liderId ?? null,
      clevelId: leader.clevelId ?? null,
      dataInicio: new Date('2021-03-01'),
      dataFim: null,
      reason: 'Seed ME-fila6 D3',
      transferBatchId: BATCH,
    });
  }

  async function seedTemplate(jobFamily: JobFamily, nomes: string[]) {
    for (let i = 0; i < 4; i += 1) {
      await client.db.insert(companyJobFamilies).values({
        companyId: companyA,
        jobFamily,
        variableIndex: i,
        variableName: nomes[i]!,
        unit: jobFamily === 'lideranca_gestao' ? 'pontos (1-5)' : 'unidades',
        weight: '25.00',
        updatedBy: 1,
      });
    }
  }

  async function cleanup(): Promise<void> {
    const rows = await client.db
      .select({ id: companies.id })
      .from(companies)
      .where(inArray(companies.cnpj, [CNPJ_A, CNPJ_B]));
    const companyIds = rows.map((r) => r.id);
    if (companyIds.length === 0) {
      return;
    }
    const emps = await client.db
      .select({ id: employees.id })
      .from(employees)
      .where(inArray(employees.companyId, companyIds));
    const empIds = emps.map((e) => e.id);
    if (empIds.length > 0) {
      await client.db.delete(employeeGoals).where(inArray(employeeGoals.employeeId, empIds));
      await client.db
        .delete(employeeLeaderHistory)
        .where(inArray(employeeLeaderHistory.employeeId, empIds));
      await client.db.delete(employees).where(inArray(employees.id, empIds));
    }
    await client.db
      .delete(companyJobFamilies)
      .where(inArray(companyJobFamilies.companyId, companyIds));
    await client.db.delete(cLevelMembers).where(inArray(cLevelMembers.companyId, companyIds));
    await client.db.delete(companies).where(inArray(companies.id, companyIds));
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    await cleanup();
    companyA = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP FILA6 D3 A LTDA',
      nomeFantasia: 'ROIP D3 A',
      cnpj: CNPJ_A,
    });
    companyB = await createCompany(client.db, {
      ...BASE_COMPANY_INPUT,
      razaoSocial: 'ROIP FILA6 D3 B LTDA',
      nomeFantasia: 'ROIP D3 B',
      cnpj: CNPJ_B,
    });
    await seedTemplate('vendas_comercial', ['Contratos', 'Ticket', 'Reuniões', 'Conversão']);
    await seedTemplate('lideranca_gestao', [
      'Direcionamento',
      'Desenvolvimento',
      'Confiança',
      'Gestão',
    ]);
    cpfSeq += 1;
    const [c] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: companyA,
        name: 'C-level D3',
        cpf: String(cpfSeq),
        email: `${cpfSeq}@roip.test`,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'Diretor',
        descricaoCargo: 'Executivo',
        departamento: 'Administrativo',
        custoMensal: '20000.00',
        acessoTotal: true,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    ids.c = c!.id;
    ids.rh = await seedEmployee('RH D3', 'administrativo_suporte', { isRH: true });
    ids.lider = await seedEmployee('Lider D3', 'lideranca_gestao', { isLider: true });
    ids.e = await seedEmployee('Liderado Vendas', 'vendas_comercial');
    ids.e6 = await seedEmployee('Liderado Lideranca', 'lideranca_gestao');
    ids.o = await seedEmployee('Sem Vinculo', 'vendas_comercial');
    ids.i = await seedEmployee('Inativo', 'vendas_comercial', { status: 'inativo' });
    ids.t = await seedEmployee('Tecnico Sem Template', 'tecnico_especialista');
    await link(ids.e, { liderId: ids.lider });
    await link(ids.i, { liderId: ids.lider });
    await link(ids.e6, { clevelId: ids.c });
  });

  afterAll(async () => {
    await cleanup();
    await closeDbClient(client);
  });

  describe('validacao §18.9', () => {
    it('mensagens literais por campo e soma', () => {
      const r = validarMetas(linhas(['', '101', '25', '25'], ['1', '1', '', '0']), false);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.erros.porVariavel[0]?.peso).toBe(MSG_PESO_VAZIO);
        expect(r.erros.porVariavel[1]?.peso).toBe(MSG_PESO_FORA_INTERVALO);
        expect(r.erros.porVariavel[2]?.meta).toBe(MSG_META_VAZIA);
        expect(r.erros.porVariavel[3]?.meta).toBe(MSG_META_FORA_INTERVALO);
        expect(r.erros.soma).toBe(MSG_SOMA_PESOS);
      }
    });

    it('aceita decimais que somam 100 e peso zero sem meta', () => {
      const r = validarMetas(
        linhas(['33.33', '33.33', '33.34', '0'], ['10', '20', '30', '']),
        false,
      );
      expect(r.ok).toBe(true);
    });
  });

  describe('permissao (DOC 02)', () => {
    it('RH e Bruno sim; Lider e C-level so liderado direto; outra empresa nao', async () => {
      const db = client.db;
      expect(await canViewerDefineGoals(db, platform('rh', ids.rh), companyA, ids.o)).toBe(true);
      expect(await canViewerDefineGoals(db, { kind: 'super_admin' }, companyA, ids.o)).toBe(true);
      expect(await canViewerDefineGoals(db, platform('lider', ids.lider), companyA, ids.e)).toBe(
        true,
      );
      expect(await canViewerDefineGoals(db, platform('lider', ids.lider), companyA, ids.o)).toBe(
        false,
      );
      expect(await canViewerDefineGoals(db, platform('clevel', ids.c), companyA, ids.e6)).toBe(
        true,
      );
      expect(await canViewerDefineGoals(db, platform('clevel', ids.c), companyA, ids.e)).toBe(
        false,
      );
      expect(
        await canViewerDefineGoals(db, platform('rh', ids.rh, companyB), companyA, ids.o),
      ).toBe(false);
      expect(await canViewerDefineGoals(db, { kind: 'super_admin' }, companyB, ids.o)).toBe(false);
    });
  });

  describe('modal e gravacao', () => {
    it('pendentes: linhas do template sem meta; familia sem template bloqueia', async () => {
      const m = await loadMetasModal(client.db, platform('rh', ids.rh), companyA, ids.e);
      expect(m?.status).toBe('pendentes');
      expect(m?.templateAusente).toBe(false);
      expect(m?.linhas.map((l) => l.variableName)).toEqual([
        'Contratos',
        'Ticket',
        'Reuniões',
        'Conversão',
      ]);
      expect(m?.linhas.every((l) => l.goal === '')).toBe(true);
      const t = await loadMetasModal(client.db, platform('rh', ids.rh), companyA, ids.t);
      expect(t?.templateAusente).toBe(true);
      const semPermissao = await loadMetasModal(
        client.db,
        platform('lider', ids.lider),
        companyA,
        ids.o,
      );
      expect(semPermissao).toBeNull();
    });

    it('Lider grava as 4 metas do liderado direto (updatedBy=lider)', async () => {
      const r = await salvarMetas(client.db, platform('lider', ids.lider), companyA, ids.e, {
        aplicarTemplate: false,
        linhas: linhas(['40', '30', '30', '0'], ['12', '45000.50', '60', '']),
      });
      expect(r).toEqual({ ok: true, status: 'definidas' });
      const rows = await client.db
        .select()
        .from(employeeGoals)
        .where(eq(employeeGoals.employeeId, ids.e));
      expect(rows).toHaveLength(4);
      const idx1 = rows.find((g) => g.variableIndex === 1);
      expect(idx1?.goal).toBe('45000.50');
      expect(idx1?.variableName).toBe('Ticket');
      expect(rows.find((g) => g.variableIndex === 3)?.goal).toBe('0.00');
      expect(rows.every((g) => g.updatedBy === 'lider' && g.jobFamily === 'vendas_comercial')).toBe(
        true,
      );
      expect(await loadMetasStatus(client.db, ids.e, 'vendas_comercial')).toBe('definidas');
    });

    it('rejeita soma diferente de 100 sem alterar o que ja estava gravado', async () => {
      const r = await salvarMetas(client.db, platform('rh', ids.rh), companyA, ids.e, {
        aplicarTemplate: false,
        linhas: linhas(['50', '30', '30', '0'], ['1', '1', '1', '']),
      });
      expect(r).toEqual({ ok: false, message: MSG_METAS_INVALIDAS });
      const [g0] = await client.db
        .select()
        .from(employeeGoals)
        .where(and(eq(employeeGoals.employeeId, ids.e), eq(employeeGoals.variableIndex, 0)));
      expect(g0?.weight).toBe('40.00');
    });

    it('Familia 6 pelo C-level: meta forcada em 5', async () => {
      const r = await salvarMetas(client.db, platform('clevel', ids.c), companyA, ids.e6, {
        aplicarTemplate: false,
        linhas: linhas(['25', '25', '25', '25'], ['3', '3', '3', '3']),
      });
      expect(r.ok).toBe(true);
      const rows = await client.db
        .select()
        .from(employeeGoals)
        .where(eq(employeeGoals.employeeId, ids.e6));
      expect(rows.map((g) => g.goal)).toEqual(['5.00', '5.00', '5.00', '5.00']);
      expect(rows.every((g) => g.updatedBy === 'lider')).toBe(true);
    });

    it('sem vinculo e colaborador inativo sao recusados', async () => {
      const semVinculo = await salvarMetas(
        client.db,
        platform('lider', ids.lider),
        companyA,
        ids.o,
        { aplicarTemplate: false, linhas: linhas(['25', '25', '25', '25'], ['1', '1', '1', '1']) },
      );
      expect(semVinculo).toEqual({ ok: false, message: MSG_METAS_SEM_PERMISSAO });
      const inativo = await salvarMetas(client.db, platform('rh', ids.rh), companyA, ids.i, {
        aplicarTemplate: false,
        linhas: linhas(['25', '25', '25', '25'], ['1', '1', '1', '1']),
      });
      expect(inativo).toEqual({ ok: false, message: MSG_METAS_COLABORADOR_INATIVO });
    });

    it('template atualizado: aviso, snapshot preservado e aplicacao do template', async () => {
      await client.db
        .update(companyJobFamilies)
        .set({ variableName: 'Contratos fechados', updatedAt: new Date(Date.now() + 120000) })
        .where(
          and(
            eq(companyJobFamilies.companyId, companyA),
            eq(companyJobFamilies.jobFamily, 'vendas_comercial'),
            eq(companyJobFamilies.variableIndex, 0),
          ),
        );
      const m = await loadMetasModal(client.db, platform('rh', ids.rh), companyA, ids.e);
      expect(m?.templateAtualizado).toBe(true);
      expect(m?.linhas[0]?.variableName).toBe('Contratos');
      expect(m?.template[0]?.variableName).toBe('Contratos fechados');
      await salvarMetas(client.db, platform('rh', ids.rh), companyA, ids.e, {
        aplicarTemplate: false,
        linhas: linhas(['40', '30', '30', '0'], ['12', '45000.50', '60', '']),
      });
      const [manteve] = await client.db
        .select()
        .from(employeeGoals)
        .where(and(eq(employeeGoals.employeeId, ids.e), eq(employeeGoals.variableIndex, 0)));
      expect(manteve?.variableName).toBe('Contratos');
      await salvarMetas(client.db, platform('rh', ids.rh), companyA, ids.e, {
        aplicarTemplate: true,
        linhas: linhas(['25', '25', '25', '25'], ['12', '45000.50', '60', '10']),
      });
      const [aplicou] = await client.db
        .select()
        .from(employeeGoals)
        .where(and(eq(employeeGoals.employeeId, ids.e), eq(employeeGoals.variableIndex, 0)));
      expect(aplicou?.variableName).toBe('Contratos fechados');
      expect(aplicou?.updatedBy).toBe('rh');
    });
  });

  describe('variaveis vigentes e ficha cadastral', () => {
    it('usa o snapshot individual quando definido e o template quando pendente', async () => {
      await salvarMetas(client.db, platform('rh', ids.rh), companyA, ids.e, {
        aplicarTemplate: false,
        linhas: linhas(['50', '50', '0', '0'], ['1', '1', '', '']),
      });
      const vars = await listEmployeeVariables(client.db, companyA, [
        { id: ids.e, jobFamily: 'vendas_comercial' },
        { id: ids.o, jobFamily: 'vendas_comercial' },
      ]);
      expect(vars.get(ids.e)?.map((v) => v.weight)).toEqual(['50.00', '50.00', '0.00', '0.00']);
      expect(vars.get(ids.o)?.map((v) => v.weight)).toEqual(['25.00', '25.00', '25.00', '25.00']);
      expect(vars.get(ids.o)?.[0]?.variableName).toBe('Contratos fechados');
    });

    it('ficha informa permissao e selo de metas ao visualizador', async () => {
      const lider = await loadFichaCadastralForViewer(
        client.db,
        platform('lider', ids.lider),
        companyA,
        ids.e,
      );
      expect(lider?.podeDefinirMetas).toBe(true);
      expect(lider?.metasStatus).toBe('definidas');
      const rh = await loadFichaCadastralForViewer(
        client.db,
        platform('rh', ids.rh),
        companyA,
        ids.o,
      );
      expect(rh?.podeDefinirMetas).toBe(true);
      expect(rh?.metasStatus).toBe('pendentes');
      const inativo = await loadFichaCadastralForViewer(
        client.db,
        platform('rh', ids.rh),
        companyA,
        ids.i,
      );
      expect(inativo?.podeDefinirMetas).toBe(false);
    });
  });
});
