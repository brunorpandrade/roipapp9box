// ROIP APP 9BOX — teste de integracao `companyEconomicDiagnosis` (ME-014).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e cobre o §7.5: insert, lookup
// pelo UNIQUE par (companyId, trimestre), listagem por company, setter
// do motor economico (`updateCompanyEconomicDiagnosis` — todos os
// blocos), os 5 valores do enum `statusDiagnostico`, colisao de UNIQUE,
// FK RESTRICT em companyId, delete.
//
// Cleanup:
// - `beforeEach`: apaga `companyEconomicDiagnosis` do escopo.
// - `afterAll`: apaga company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, companyEconomicDiagnosis } from '../../src/db/schema';
import {
  deleteCompanyEconomicDiagnosisById,
  getCompanyEconomicDiagnosisById,
  getCompanyEconomicDiagnosisByQuarter,
  insertCompanyEconomicDiagnosis,
  listCompanyEconomicDiagnosisByCompany,
  type NewCompanyEconomicDiagnosis,
  updateCompanyEconomicDiagnosis,
} from '../../src/server/services/companyEconomicDiagnosis';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000117';

function buildValidDiagnosis(
  companyId: number,
  overrides: Partial<NewCompanyEconomicDiagnosis> = {},
): NewCompanyEconomicDiagnosis {
  return {
    companyId,
    trimestre: '2026-Q1',
    faturamentoMedioTrimestral: '500000.00',
    folhaTotalMedia: '120000.00',
    roiEmpresa: '4.1667',
    folhaPorcentagem: '24.00',
    statusDiagnostico: 'aceitavel',
    ...overrides,
  };
}

describe('service companyEconomicDiagnosis (ME-014)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa EconDiag Test LTDA',
        nomeFantasia: 'Empresa EconDiag Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330017',
        endereco: 'Rua EconDiag, 17',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@econdiag.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@econdiag.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;
  });

  afterAll(async () => {
    await client.db.delete(companyEconomicDiagnosis);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(companyEconomicDiagnosis);
  });

  it('insertCompanyEconomicDiagnosis insere e retorna id positivo', async () => {
    const id = await insertCompanyEconomicDiagnosis(client.db, buildValidDiagnosis(companyId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getCompanyEconomicDiagnosisById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.companyId).toBe(companyId);
    expect(row.trimestre).toBe('2026-Q1');
    expect(row.statusDiagnostico).toBe('aceitavel');
    expect(row.faturamentoMedioTrimestral).toBe('500000.00');
    // Campos snapshot do segmento nascem NULL enquanto o motor nao popular.
    expect(row.roiSegmentoMinimo).toBeNull();
    expect(row.roiSegmentoMaximo).toBeNull();
    expect(row.roiMuitoBom).toBeNull();
    expect(row.faturamentoIdeal).toBeNull();
    expect(row.faturamentoPotencial).toBeNull();
  });

  it('getCompanyEconomicDiagnosisByQuarter resolve pelo UNIQUE par', async () => {
    const id = await insertCompanyEconomicDiagnosis(
      client.db,
      buildValidDiagnosis(companyId, { trimestre: '2026-Q2' }),
    );
    const row = await getCompanyEconomicDiagnosisByQuarter(client.db, companyId, '2026-Q2');
    if (!row) throw new Error('linha nao encontrada pelo par');
    expect(row.id).toBe(id);
    const miss = await getCompanyEconomicDiagnosisByQuarter(client.db, companyId, '2099-Q4');
    expect(miss).toBeUndefined();
  });

  it('listCompanyEconomicDiagnosisByCompany ordena por trimestre crescente', async () => {
    const idQ3 = await insertCompanyEconomicDiagnosis(
      client.db,
      buildValidDiagnosis(companyId, { trimestre: '2026-Q3' }),
    );
    const idQ1 = await insertCompanyEconomicDiagnosis(
      client.db,
      buildValidDiagnosis(companyId, { trimestre: '2026-Q1' }),
    );
    const idQ2 = await insertCompanyEconomicDiagnosis(
      client.db,
      buildValidDiagnosis(companyId, { trimestre: '2026-Q2' }),
    );
    const rows = await listCompanyEconomicDiagnosisByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([idQ1, idQ2, idQ3]);
  });

  it('updateCompanyEconomicDiagnosis grava todos os blocos calculados', async () => {
    const id = await insertCompanyEconomicDiagnosis(client.db, buildValidDiagnosis(companyId));
    const calculadoEm = new Date('2026-04-15T12:00:00Z');
    const affected = await updateCompanyEconomicDiagnosis(client.db, id, {
      faturamentoMedioTrimestral: '600000.00',
      folhaTotalMedia: '150000.00',
      faturamentoPotencial: '750000.00',
      roiEmpresa: '4.0000',
      folhaPorcentagem: '25.00',
      roiSegmentoMinimo: '3.00',
      roiSegmentoMaximo: '5.00',
      roiMuitoBom: '4.00',
      faturamentoIdeal: '600000.00',
      statusDiagnostico: 'muito_bom',
      calculadoEm,
    });
    expect(affected).toBe(1);
    const row = await getCompanyEconomicDiagnosisById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos update');
    expect(row.faturamentoMedioTrimestral).toBe('600000.00');
    expect(row.folhaTotalMedia).toBe('150000.00');
    expect(row.faturamentoPotencial).toBe('750000.00');
    expect(row.roiEmpresa).toBe('4.0000');
    expect(row.roiSegmentoMinimo).toBe('3.00');
    expect(row.roiSegmentoMaximo).toBe('5.00');
    expect(row.roiMuitoBom).toBe('4.00');
    expect(row.faturamentoIdeal).toBe('600000.00');
    expect(row.statusDiagnostico).toBe('muito_bom');
  });

  it('statusDiagnostico aceita os 5 valores canonicos do enum', async () => {
    // Insere um por trimestre distinto (UNIQUE por par (companyId, trimestre)).
    const statuses = ['excelente', 'muito_bom', 'aceitavel', 'critico', 'sem_referencia'] as const;
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      if (!status) throw new Error(`statuses[${i}] indefinido`);
      const trimestre = `2027-Q${i + 1}`;
      const id = await insertCompanyEconomicDiagnosis(
        client.db,
        buildValidDiagnosis(companyId, { trimestre, statusDiagnostico: status }),
      );
      const row = await getCompanyEconomicDiagnosisById(client.db, id);
      expect(row?.statusDiagnostico).toBe(status);
    }
  });

  it('UNIQUE uq_econDiag impede duplicidade do par (companyId, trimestre)', async () => {
    await insertCompanyEconomicDiagnosis(client.db, buildValidDiagnosis(companyId));
    await expect(
      insertCompanyEconomicDiagnosis(client.db, buildValidDiagnosis(companyId)),
    ).rejects.toThrow();
  });

  it('FK RESTRICT em companyId impede insert com company inexistente', async () => {
    await expect(
      insertCompanyEconomicDiagnosis(client.db, buildValidDiagnosis(99999)),
    ).rejects.toThrow();
  });

  it('deleteCompanyEconomicDiagnosisById remove e retorna 1', async () => {
    const id = await insertCompanyEconomicDiagnosis(client.db, buildValidDiagnosis(companyId));
    const affected = await deleteCompanyEconomicDiagnosisById(client.db, id);
    expect(affected).toBe(1);
    const row = await getCompanyEconomicDiagnosisById(client.db, id);
    expect(row).toBeUndefined();
  });
});
