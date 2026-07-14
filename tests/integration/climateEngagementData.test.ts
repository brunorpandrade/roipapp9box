// ROIP APP 9BOX — teste de integracao `climateEngagementData` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e employee lider (para escopo
// `equipe`).
//
// Cobre: INSERT para os 3 escopos canonicos (empresa | departamento |
// equipe), defaults `countCobertura=0` e `countTotal=0`, lookups
// dedicados por escopo (`getClimateByEmpresaQuarter`,
// `getClimateByDepartamentoQuarter`, `getClimateByEquipeQuarter`),
// listagem por (company, trimestre) ordenada pela posicao declarada do
// enum `escopo` (L28), setter `updateClimateCalculo` (nota geral,
// adesao, contagens, 4 notas de dimensao e algumas notas de questao),
// FKs RESTRICT (companyId, liderId) e delete de teardown.
//
// Cleanup:
// - `beforeEach`: apaga `climateEngagementData` do escopo.
// - `afterAll`: apaga o escopo + employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { climateEngagementData, companies, employees } from '../../src/db/schema';
import {
  deleteClimateEngagementDataById,
  getClimateByDepartamentoQuarter,
  getClimateByEmpresaQuarter,
  getClimateByEquipeQuarter,
  getClimateEngagementDataById,
  insertClimateEngagementData,
  listClimateEngagementDataByCompanyQuarter,
  type ClimateCalculoPatch,
  type NewClimateEngagementData,
  updateClimateCalculo,
} from '../../src/server/services/climateEngagementData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000126';

function buildEmpresaScope(
  companyId: number,
  overrides: Partial<NewClimateEngagementData> = {},
): NewClimateEngagementData {
  return {
    companyId,
    escopo: 'empresa',
    trimestre: '2026-Q1',
    ...overrides,
  };
}

describe('service climateEngagementData (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderEmployeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Climate Test LTDA',
        nomeFantasia: 'Empresa Climate Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330026',
        endereco: 'Rua Climate, 26',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@climate.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@climate.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [lider] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider Climate',
        cpf: '10101010135',
        email: 'lider.climate@roip.local',
        dataNascimento: new Date('1983-07-22'),
        dataAdmissao: new Date('2014-11-10'),
        cbo: '142105',
        descricaoCBO: 'Gerente Comercial',
        jobFamily: 'lideranca_gestao',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Comercial',
        isLider: true,
      })
      .$returningId();
    if (!lider) throw new Error('beforeAll: falha ao criar employee lider');
    liderEmployeeId = lider.id;
  });

  afterAll(async () => {
    await client.db
      .delete(climateEngagementData)
      .where(eq(climateEngagementData.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(climateEngagementData)
      .where(eq(climateEngagementData.companyId, companyId));
  });

  it('insere agregado de escopo empresa com defaults zerados', async () => {
    const id = await insertClimateEngagementData(client.db, buildEmpresaScope(companyId));
    expect(id).toBeGreaterThan(0);

    const row = await getClimateEngagementDataById(client.db, id);
    expect(row?.escopo).toBe('empresa');
    expect(row?.departamento).toBeNull();
    expect(row?.liderId).toBeNull();
    expect(row?.countCobertura).toBe(0);
    expect(row?.countTotal).toBe(0);
  });

  it('insere agregado de escopo departamento com nome canonico', async () => {
    const id = await insertClimateEngagementData(client.db, {
      companyId,
      escopo: 'departamento',
      departamento: 'Comercial',
      trimestre: '2026-Q1',
    });
    const row = await getClimateByDepartamentoQuarter(client.db, companyId, 'Comercial', '2026-Q1');
    expect(row?.id).toBe(id);
    expect(row?.escopo).toBe('departamento');
    expect(row?.liderId).toBeNull();
  });

  it('insere agregado de escopo equipe com liderId', async () => {
    const id = await insertClimateEngagementData(client.db, {
      companyId,
      escopo: 'equipe',
      liderId: liderEmployeeId,
      trimestre: '2026-Q1',
    });
    const row = await getClimateByEquipeQuarter(client.db, companyId, liderEmployeeId, '2026-Q1');
    expect(row?.id).toBe(id);
    expect(row?.escopo).toBe('equipe');
    expect(row?.departamento).toBeNull();
  });

  it('getClimateByEmpresaQuarter localiza o registro do escopo empresa', async () => {
    await insertClimateEngagementData(client.db, buildEmpresaScope(companyId));
    const row = await getClimateByEmpresaQuarter(client.db, companyId, '2026-Q1');
    expect(row).toBeDefined();
    expect(row?.escopo).toBe('empresa');
  });

  it('listClimateEngagementDataByCompanyQuarter ordena por posicao do enum escopo', async () => {
    await insertClimateEngagementData(client.db, {
      companyId,
      escopo: 'equipe',
      liderId: liderEmployeeId,
      trimestre: '2026-Q1',
    });
    await insertClimateEngagementData(client.db, {
      companyId,
      escopo: 'departamento',
      departamento: 'Comercial',
      trimestre: '2026-Q1',
    });
    await insertClimateEngagementData(client.db, buildEmpresaScope(companyId));
    const rows = await listClimateEngagementDataByCompanyQuarter(client.db, companyId, '2026-Q1');
    expect(rows.map((r) => r.escopo)).toEqual(['empresa', 'departamento', 'equipe']);
  });

  it('updateClimateCalculo grava nota geral, dimensoes e algumas questoes', async () => {
    const id = await insertClimateEngagementData(client.db, buildEmpresaScope(companyId));
    const patch: ClimateCalculoPatch = {
      notaClima: '8.20',
      adesao: '85.00',
      countCobertura: 17,
      countTotal: 20,
      notaEngajamento: '8.10',
      notaDesenvolvimento: '7.40',
      notaPertencimento: '8.90',
      notaRealizacao: '8.30',
      notasQuestoes: {
        notaQuestao01: '8.00',
        notaQuestao10: '7.50',
        notaQuestao20: '8.90',
      },
      calculadoEm: new Date('2026-04-11T12:00:00Z'),
    };
    const afetadas = await updateClimateCalculo(client.db, id, patch);
    expect(afetadas).toBe(1);

    const row = await getClimateEngagementDataById(client.db, id);
    expect(row?.notaClima).toBe('8.20');
    expect(row?.countCobertura).toBe(17);
    expect(row?.notaRealizacao).toBe('8.30');
    expect(row?.notaQuestao01).toBe('8.00');
    expect(row?.notaQuestao10).toBe('7.50');
    expect(row?.notaQuestao20).toBe('8.90');
    expect(row?.notaQuestao05).toBeNull();
  });

  it('FK RESTRICT reprova liderId invalido em escopo equipe', async () => {
    await expect(
      insertClimateEngagementData(client.db, {
        companyId,
        escopo: 'equipe',
        liderId: 99999,
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow();
  });

  it('FK RESTRICT reprova companyId invalido', async () => {
    await expect(
      insertClimateEngagementData(client.db, {
        companyId: 99999,
        escopo: 'empresa',
        trimestre: '2026-Q1',
      }),
    ).rejects.toThrow();
  });

  it('deleteClimateEngagementDataById remove pelo id (teardown)', async () => {
    const id = await insertClimateEngagementData(client.db, buildEmpresaScope(companyId));
    const afetadas = await deleteClimateEngagementDataById(client.db, id);
    expect(afetadas).toBe(1);

    const row = await getClimateEngagementDataById(client.db, id);
    expect(row).toBeUndefined();
  });
});
