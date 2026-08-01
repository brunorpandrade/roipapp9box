/* eslint-disable @stylistic/max-len -- labels canonicas de describe/it em portugues com contexto S/§ */
// ROIP APP 9BOX — teste de integracao do service `lgpdPortability`
// (ME-062b, DOC 06 §19.6). Contra MySQL real.
//
// Cobertura canonica:
//   - `getCompanyNomeFantasia`: sucesso + falha canonica quando
//     empresa nao existe (throw `LgpdPortabilityCompanyNotFoundError`).
//   - `getCadastraisEmployee`: sucesso + falha canonica quando
//     employee nao existe.
//   - `getCadastraisClevel`: sucesso + falha canonica quando C-level
//     nao existe.
//   - `getInstrumentARespostas`: SELECT canonico + filtro cross-titular
//     + filtro cross-company + retorno vazio para titular C-level (S344).
//   - `getInstrumentDRespostas`: SELECT canonico (respondenteId) +
//     retorno vazio para C-level (S344).
//   - `getCopsoqRespostas`: SELECT canonico + retorno vazio para
//     C-level (S344).
//   - `getIndividualProfileTentativas`: SELECT canonico polimorfico
//     (employee E clevel) + ordenacao por tentativa ASC.
//   - `buildLgpdPortabilityPayload`: orquestracao canonica bit-exact
//     §19.6 — SELECTs paralelos + agregacao + escopo exclusivo do
//     titular + exclusao canonica de avaliacoes de terceiros
//     (Instrumento C nao aparece no payload).
//
// Faixa CNPJ desta ME (S344 canonizada): auxiliar 10280000000001..049.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycles,
  copsoq_responses,
  employees,
  individualProfileAssessments,
  instrumentA_responses,
  instrumentC_assessments,
  instrumentD_responses,
} from '../../src/db/schema';
import {
  buildLgpdPortabilityPayload,
  getCadastraisClevel,
  getCadastraisEmployee,
  getCompanyNomeFantasia,
  getCopsoqRespostas,
  getIndividualProfileTentativas,
  getInstrumentARespostas,
  getInstrumentDRespostas,
  LgpdPortabilityCompanyNotFoundError,
  LgpdPortabilityTitularNotFoundError,
  type LgpdPortabilityCadastraisPayload,
  type LgpdPortabilityCopsoqResposta,
  type LgpdPortabilityIndividualProfileTentativa,
  type LgpdPortabilityInstrumentoResposta,
  type LgpdPortabilityPayload,
  type LgpdPortabilityTitularType,
} from '../../src/server/services/lgpdPortability';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCopsoqCycleIds: number[] = [];

async function seedCompany(cnpj: string, nomeFantasia: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `Portabilidade ${cnpj} LTDA`,
      nomeFantasia,
      cnpj,
      telefone: '1633330062',
      endereco: `Rua ME-062b Aux, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato Principal',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'Contato RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canônica portabilidade LGPD',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!row) throw new Error('seed company failed');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function seedEmployee(companyId: number, cpf: string, name: string): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf,
      email: `${cpf}@example.com`,
      dataNascimento: new Date('1985-05-10'),
      dataAdmissao: new Date('2022-03-01'),
      cbo: '2521',
      descricaoCBO: 'Analista de sistemas',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Tecnologia da Informação',
      status: 'ativo',
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  return row.id;
}

async function seedClevel(companyId: number, cpf: string, name: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      cpf,
      email: `${cpf}@clevel.example.com`,
      dataNascimento: new Date('1975-08-15'),
      dataAdmissao: new Date('2020-01-15'),
      cargo: 'Diretor de Tecnologia',
      descricaoCargo: 'C-level canônico de teste',
      departamento: 'Tecnologia da Informação',
      custoMensal: '35000.00',
      status: 'ativo',
    })
    .$returningId();
  if (!row) throw new Error('seed clevel failed');
  return row.id;
}

async function seedCopsoqCycle(companyId: number): Promise<number> {
  const [row] = await db
    .insert(copsoqCycles)
    .values({
      companyId,
      dataAbertura: new Date('2026-01-15'),
      dataFechamento: new Date('2026-01-29'),
      ciclo: '2026-Q1',
      status: 'aberto',
    })
    .$returningId();
  if (!row) throw new Error('seed copsoq cycle failed');
  createdCopsoqCycleIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
});

afterAll(async () => {
  if (!client) return;
  if (createdCopsoqCycleIds.length > 0) {
    await db
      .delete(copsoq_responses)
      .where(inArray(copsoq_responses.cicloDbId, createdCopsoqCycleIds));
  }
  if (createdCompanyIds.length > 0) {
    await db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await db
      .delete(instrumentD_responses)
      .where(inArray(instrumentD_responses.companyId, createdCompanyIds));
    await db
      .delete(instrumentC_assessments)
      .where(inArray(instrumentC_assessments.companyId, createdCompanyIds));
    await db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    await db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
    await db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

describe('service lgpdPortability — SELECTs canônicos §19.6', () => {
  // ============================================================
  // getCompanyNomeFantasia
  // ============================================================

  describe('getCompanyNomeFantasia', () => {
    it('retorna o nomeFantasia canônico da empresa', async () => {
      const cid = await seedCompany('10280000000001', 'Fantasia Portabilidade');
      const nome = await getCompanyNomeFantasia(db, cid);
      expect(nome).toBe('Fantasia Portabilidade');
    });

    it('throw LgpdPortabilityCompanyNotFoundError quando empresa inexistente', async () => {
      await expect(getCompanyNomeFantasia(db, 999999999)).rejects.toBeInstanceOf(
        LgpdPortabilityCompanyNotFoundError,
      );
    });
  });

  // ============================================================
  // getCadastraisEmployee
  // ============================================================

  describe('getCadastraisEmployee', () => {
    it('retorna payload canônico bit-exact do titular employee', async () => {
      const cid = await seedCompany('10280000000002', 'Cadastrais Employee');
      const eid = await seedEmployee(cid, '11122233340', 'João Cadastral');
      const cad: LgpdPortabilityCadastraisPayload = await getCadastraisEmployee(db, cid, eid);
      expect(cad.titularType).toBe('employee');
      expect(cad.nome).toBe('João Cadastral');
      expect(cad.cpf).toBe('11122233340');
      expect(cad.email).toBe('11122233340@example.com');
      expect(cad.dataNascimento).toBe('1985-05-10');
      expect(cad.dataAdmissao).toBe('2022-03-01');
      expect(cad.cbo).toBe('2521');
      expect(cad.descricaoCBO).toBe('Analista de sistemas');
      expect(cad.departamento).toBe('Tecnologia da Informação');
      expect(cad.jobFamily).toBe('administrativo_suporte');
      expect(cad.senioridade).toBe('pleno');
      expect(cad.nivelHierarquico).toBe('tatico');
      expect(cad.status).toBe('ativo');
    });

    it('throw quando employee inexistente na empresa', async () => {
      const cid = await seedCompany('10280000000003', 'CadaEmp NotFound');
      await expect(getCadastraisEmployee(db, cid, 999999999)).rejects.toBeInstanceOf(
        LgpdPortabilityTitularNotFoundError,
      );
    });

    it('throw quando employee existe mas em outra empresa (cross-company)', async () => {
      const cidA = await seedCompany('10280000000004', 'CadaEmp A');
      const cidB = await seedCompany('10280000000005', 'CadaEmp B');
      const eidB = await seedEmployee(cidB, '22233344450', 'Empregado B');
      await expect(getCadastraisEmployee(db, cidA, eidB)).rejects.toBeInstanceOf(
        LgpdPortabilityTitularNotFoundError,
      );
    });
  });

  // ============================================================
  // getCadastraisClevel
  // ============================================================

  describe('getCadastraisClevel', () => {
    it('retorna payload canônico bit-exact do titular clevel (campos exclusivos de employee = null)', async () => {
      const cid = await seedCompany('10280000000006', 'Cadastrais Clevel');
      const clid = await seedClevel(cid, '33344455560', 'Maria C-level');
      const cad: LgpdPortabilityCadastraisPayload = await getCadastraisClevel(db, cid, clid);
      expect(cad.titularType).toBe('clevel');
      expect(cad.nome).toBe('Maria C-level');
      expect(cad.cpf).toBe('33344455560');
      expect(cad.cargo).toBe('Diretor de Tecnologia');
      expect(cad.departamento).toBe('Tecnologia da Informação');
      expect(cad.cbo).toBeNull();
      expect(cad.descricaoCBO).toBeNull();
      expect(cad.nivelHierarquico).toBeNull();
      expect(cad.senioridade).toBeNull();
      expect(cad.jobFamily).toBeNull();
      expect(cad.status).toBe('ativo');
    });

    it('throw quando clevel inexistente', async () => {
      const cid = await seedCompany('10280000000007', 'CadaCle NotFound');
      await expect(getCadastraisClevel(db, cid, 999999999)).rejects.toBeInstanceOf(
        LgpdPortabilityTitularNotFoundError,
      );
    });
  });

  // ============================================================
  // getInstrumentARespostas
  // ============================================================

  describe('getInstrumentARespostas', () => {
    it('retorna respostas canônicas apenas do próprio titular (employeeId = titularId)', async () => {
      const cid = await seedCompany('10280000000008', 'IA Employee');
      const eidTitular = await seedEmployee(cid, '44455566670', 'Titular IA');
      const eidOutro = await seedEmployee(cid, '44455566671', 'Outro IA');
      await db.insert(instrumentA_responses).values([
        {
          companyId: cid,
          employeeId: eidTitular,
          trimestre: '2026-Q1',
          dimensao: 1,
          itemIndex: 1,
          valor: 80,
        },
        {
          companyId: cid,
          employeeId: eidTitular,
          trimestre: '2026-Q1',
          dimensao: 1,
          itemIndex: 2,
          valor: 90,
        },
        {
          companyId: cid,
          employeeId: eidOutro,
          trimestre: '2026-Q1',
          dimensao: 1,
          itemIndex: 1,
          valor: 50,
        },
      ]);
      const rows: LgpdPortabilityInstrumentoResposta[] = await getInstrumentARespostas(
        db,
        cid,
        'employee',
        eidTitular,
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.trimestre === '2026-Q1')).toBe(true);
      expect(rows.map((r) => r.itemIndex).sort()).toEqual([1, 2]);
    });

    it('retorna vazio canonicamente para titular C-level (S344 — schema exclusivo a employee)', async () => {
      const cid = await seedCompany('10280000000009', 'IA Clevel');
      const clid = await seedClevel(cid, '55566677780', 'Clevel IA');
      const rows = await getInstrumentARespostas(db, cid, 'clevel', clid);
      expect(rows).toEqual([]);
    });

    it('não vaza dados cross-company (companyId isola escopo)', async () => {
      const cidA = await seedCompany('10280000000010', 'IA Cross A');
      const cidB = await seedCompany('10280000000011', 'IA Cross B');
      const eidA = await seedEmployee(cidA, '66677788890', 'A');
      await db.insert(instrumentA_responses).values({
        companyId: cidA,
        employeeId: eidA,
        trimestre: '2026-Q1',
        dimensao: 2,
        itemIndex: 1,
        valor: 75,
      });
      const rowsB = await getInstrumentARespostas(db, cidB, 'employee', eidA);
      expect(rowsB).toEqual([]);
    });
  });

  // ============================================================
  // getInstrumentDRespostas
  // ============================================================

  describe('getInstrumentDRespostas', () => {
    it('retorna respostas canônicas apenas do próprio titular (respondenteId = titularId)', async () => {
      const cid = await seedCompany('10280000000012', 'ID Employee');
      const eidTitular = await seedEmployee(cid, '77788899900', 'Titular ID');
      const eidLider = await seedEmployee(cid, '77788899901', 'Líder ID');
      await db.insert(instrumentD_responses).values([
        {
          companyId: cid,
          respondenteId: eidTitular,
          liderId: eidLider,
          trimestre: '2026-Q1',
          dimensao: 1,
          itemIndex: 1,
          valor: 4,
          versaoInstrumento: 1,
        },
        {
          companyId: cid,
          respondenteId: eidTitular,
          liderId: eidLider,
          trimestre: '2026-Q1',
          dimensao: 1,
          itemIndex: 2,
          valor: 5,
          versaoInstrumento: 1,
        },
      ]);
      const rows = await getInstrumentDRespostas(db, cid, 'employee', eidTitular);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.trimestre === '2026-Q1')).toBe(true);
    });

    it('retorna vazio canonicamente para titular C-level (S344)', async () => {
      const cid = await seedCompany('10280000000013', 'ID Clevel');
      const clid = await seedClevel(cid, '88899900010', 'Clevel ID');
      const rows = await getInstrumentDRespostas(db, cid, 'clevel', clid);
      expect(rows).toEqual([]);
    });
  });

  // ============================================================
  // getCopsoqRespostas
  // ============================================================

  describe('getCopsoqRespostas', () => {
    it('retorna respostas canônicas apenas do próprio titular (employeeId = titularId)', async () => {
      const cid = await seedCompany('10280000000014', 'Copsoq Employee');
      const eidTitular = await seedEmployee(cid, '99900011120', 'Titular Copsoq');
      const cycleId = await seedCopsoqCycle(cid);
      await db.insert(copsoq_responses).values([
        {
          cicloDbId: cycleId,
          companyId: cid,
          employeeId: eidTitular,
          fator: 1,
          itemIndex: 1,
          valor: 3,
        },
        {
          cicloDbId: cycleId,
          companyId: cid,
          employeeId: eidTitular,
          fator: 1,
          itemIndex: 2,
          valor: 4,
        },
      ]);
      const rows: LgpdPortabilityCopsoqResposta[] = await getCopsoqRespostas(
        db,
        cid,
        'employee',
        eidTitular,
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.cicloDbId === cycleId)).toBe(true);
    });

    it('retorna vazio canonicamente para titular C-level (S344)', async () => {
      const cid = await seedCompany('10280000000015', 'Copsoq Clevel');
      const clid = await seedClevel(cid, '11122233341', 'Clevel Copsoq');
      const rows = await getCopsoqRespostas(db, cid, 'clevel', clid);
      expect(rows).toEqual([]);
    });
  });

  // ============================================================
  // getIndividualProfileTentativas
  // ============================================================

  describe('getIndividualProfileTentativas', () => {
    it('retorna tentativas canônicas do titular employee ordenadas ASC', async () => {
      const cid = await seedCompany('10280000000016', 'IPA Employee');
      const eid = await seedEmployee(cid, '22233344451', 'Titular IPA E');
      await db.insert(individualProfileAssessments).values([
        {
          companyId: cid,
          userType: 'employee',
          userId: eid,
          tentativa: 2,
          status: 'enviado',
          blocoAtual: 10,
          respostas: { bloco1: [1, 2, 3] },
          enviadoEm: new Date('2026-02-10T12:00:00.000Z'),
        },
        {
          companyId: cid,
          userType: 'employee',
          userId: eid,
          tentativa: 1,
          status: 'inconsistente',
          blocoAtual: 10,
          respostas: { bloco1: [1, 2] },
          enviadoEm: new Date('2026-01-10T12:00:00.000Z'),
        },
      ]);
      const rows: LgpdPortabilityIndividualProfileTentativa[] =
        await getIndividualProfileTentativas(db, cid, 'employee', eid);
      expect(rows).toHaveLength(2);
      expect(rows[0]?.tentativa).toBe(1);
      expect(rows[1]?.tentativa).toBe(2);
      expect(rows[0]?.status).toBe('inconsistente');
      expect(rows[1]?.status).toBe('enviado');
    });

    it('retorna tentativas canônicas do titular C-level (polimórfico)', async () => {
      const cid = await seedCompany('10280000000017', 'IPA Clevel');
      const clid = await seedClevel(cid, '33344455561', 'Titular IPA C');
      await db.insert(individualProfileAssessments).values({
        companyId: cid,
        userType: 'clevel',
        userId: clid,
        tentativa: 1,
        status: 'enviado',
        blocoAtual: 10,
        respostas: { blocoClevel: [10, 20] },
        enviadoEm: new Date('2026-03-10T12:00:00.000Z'),
      });
      const rows = await getIndividualProfileTentativas(db, cid, 'clevel', clid);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tentativa).toBe(1);
      expect(rows[0]?.respostas).toEqual({ blocoClevel: [10, 20] });
    });

    it('não retorna tentativa de outro titularType (polimórfico canônico)', async () => {
      const cid = await seedCompany('10280000000018', 'IPA Cross');
      const eid = await seedEmployee(cid, '44455566671', 'IPA Cross E');
      const clid = await seedClevel(cid, '55566677781', 'IPA Cross C');
      await db.insert(individualProfileAssessments).values([
        {
          companyId: cid,
          userType: 'employee',
          userId: eid,
          tentativa: 1,
          status: 'enviado',
          blocoAtual: 10,
          respostas: { do_employee: true },
        },
        {
          companyId: cid,
          userType: 'clevel',
          userId: clid,
          tentativa: 1,
          status: 'enviado',
          blocoAtual: 10,
          respostas: { do_clevel: true },
        },
      ]);
      const rowsE = await getIndividualProfileTentativas(db, cid, 'employee', eid);
      expect(rowsE).toHaveLength(1);
      expect(rowsE[0]?.respostas).toEqual({ do_employee: true });
      const rowsC = await getIndividualProfileTentativas(db, cid, 'clevel', clid);
      expect(rowsC).toHaveLength(1);
      expect(rowsC[0]?.respostas).toEqual({ do_clevel: true });
    });
  });

  // ============================================================
  // buildLgpdPortabilityPayload — orquestracao canonica integral
  // ============================================================

  describe('buildLgpdPortabilityPayload', () => {
    it('agrega payload canônico bit-exact §19.6 para titular employee', async () => {
      const cid = await seedCompany('10280000000019', 'Build Employee');
      const eid = await seedEmployee(cid, '66677788891', 'Build E');
      const cycleId = await seedCopsoqCycle(cid);
      await db.insert(instrumentA_responses).values({
        companyId: cid,
        employeeId: eid,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 85,
      });
      await db.insert(instrumentD_responses).values({
        companyId: cid,
        respondenteId: eid,
        liderId: eid,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 5,
        versaoInstrumento: 1,
      });
      await db.insert(copsoq_responses).values({
        cicloDbId: cycleId,
        companyId: cid,
        employeeId: eid,
        fator: 2,
        itemIndex: 1,
        valor: 4,
      });
      await db.insert(individualProfileAssessments).values({
        companyId: cid,
        userType: 'employee',
        userId: eid,
        tentativa: 1,
        status: 'enviado',
        blocoAtual: 10,
        respostas: { totais: [1, 2, 3] },
      });
      const payload: LgpdPortabilityPayload = await buildLgpdPortabilityPayload(
        db,
        cid,
        'employee',
        eid,
      );
      expect(payload.companyNomeFantasia).toBe('Build Employee');
      expect(payload.cadastrais.titularType).toBe('employee');
      expect(payload.cadastrais.nome).toBe('Build E');
      expect(payload.instrumentA).toHaveLength(1);
      expect(payload.instrumentD).toHaveLength(1);
      expect(payload.copsoq).toHaveLength(1);
      expect(payload.individualProfile).toHaveLength(1);
    });

    it('agrega payload canônico para titular C-level (A/D/Copsoq vazios por S344)', async () => {
      const cid = await seedCompany('10280000000020', 'Build Clevel');
      const clid = await seedClevel(cid, '77788899901', 'Build C');
      await db.insert(individualProfileAssessments).values({
        companyId: cid,
        userType: 'clevel',
        userId: clid,
        tentativa: 1,
        status: 'enviado',
        blocoAtual: 10,
        respostas: { clevel_respostas: [] },
      });
      const payload = await buildLgpdPortabilityPayload(db, cid, 'clevel', clid);
      expect(payload.companyNomeFantasia).toBe('Build Clevel');
      expect(payload.cadastrais.titularType).toBe('clevel');
      expect(payload.instrumentA).toEqual([]);
      expect(payload.instrumentD).toEqual([]);
      expect(payload.copsoq).toEqual([]);
      expect(payload.individualProfile).toHaveLength(1);
    });

    it('exclui canonicamente Instrumento C (avaliação de terceiros sobre titular — fora do escopo §19.6)', async () => {
      const cid = await seedCompany('10280000000021', 'Build Exclusion');
      const eidTitular = await seedEmployee(cid, '88899900011', 'Titular Excl');
      const eidAvaliador = await seedEmployee(cid, '88899900012', 'Avaliador Excl');
      // Instrumento C — outro colaborador avalia o titular (fora do escopo).
      await db.insert(instrumentC_assessments).values({
        companyId: cid,
        employeeId: eidTitular,
        liderId: eidAvaliador,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 4,
      });
      // Instrumento A do titular (dentro do escopo — controle canônico).
      await db.insert(instrumentA_responses).values({
        companyId: cid,
        employeeId: eidTitular,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 80,
      });
      const payload = await buildLgpdPortabilityPayload(db, cid, 'employee', eidTitular);
      // §19.6 exclusão canônica: instrumento C não aparece no payload.
      const payloadKeys = Object.keys(payload);
      expect(payloadKeys).not.toContain('instrumentC');
      // Controle canônico: instrumento A do próprio titular está presente.
      expect(payload.instrumentA).toHaveLength(1);
    });

    it('type discriminante canônico preservado bit-exact', () => {
      const employee: LgpdPortabilityTitularType = 'employee';
      const clevel: LgpdPortabilityTitularType = 'clevel';
      expect(employee).toBe('employee');
      expect(clevel).toBe('clevel');
    });
  });
});
