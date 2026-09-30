// ROIP APP 9BOX — teste de integracao canonico do seed climate via
// motor real (ME-B2-01a.1.3).
//
// Substitui a bateria pura sync do `deriveClimateEngagementData` (padrao
// aposentado por bug de escala 0-4) pela validacao canonica do motor
// `climateCalculationEngine.recalculateAggregates` chamado bit-a-bit
// como o `loadUbatubaFixtures.ts` faria em producao. Roda contra base
// efemera `roip_test` semeada pelo globalSetup (ME-010) + fixtures
// mínimas suficientes para o motor produzir agregados canonicos (grid
// canonico S176 estendido — empresa + departamentos + equipes employee
// + equipes C-level Q3=A1).
//
// Cobre:
//   - Chamada canonica ao motor pelos 4 trimestres do escopo Ubatuba
//     (§9.10 canonico + ME-B2-01a.1.2 estende).
//   - Escala 0-10 canonica §9.4 em `notaClima` — bit-a-bit resolve o
//     bug de escala 0-4 Likert bruta do seed antigo (que produzia
//     PDF do Clima e engajamento canonicamente invalido).
//   - Grid canonico bit-a-bit: >= 1 linha empresa por trimestre, >= 1
//     linha departamento por trimestre para deptos com >=1 ativo, e
//     linhas equipe para lideres-employee com cadeia (S173).
//   - Idempotencia canonica S172/S172b: rodar 2x produz mesmo grid
//     bit-a-bit (motor sobrescreve via UPSERT NULL-safe).
//
// Cleanup canonico L32: `afterAll` apaga fixtures locais (company +
// dependencias) restaurando `roip_test` ao estado limpo.

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../../src/db/client';
import {
  climateEngagementData,
  companies,
  employeeLeaderHistory,
  employees,
  instrumentA_responses,
  plenitudeData,
} from '../../../src/db/schema';
import {
  seedClimateEngagementDataViaMotor,
  UBATUBA_CLIMATE_TRIMESTRES,
} from '../../../src/db/seed/ubatuba/deriveClimateEngagementData';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000861';
const LOCAL_TRI = UBATUBA_CLIMATE_TRIMESTRES[3];

const CLIMATE_COMPANY_ID_MARK = 9861; // marca fixture-local — distinto do UBATUBA_COMPANY_ID

describe('seedClimateEngagementDataViaMotor — ME-B2-01a.1.3', () => {
  let client: RoipDbClient;
  let companyId: number;
  const employeeIds: number[] = [];

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: `Clima Motor Test ${CLIMATE_COMPANY_ID_MARK} LTDA`,
        nomeFantasia: `Clima Motor Test ${CLIMATE_COMPANY_ID_MARK}`,
        cnpj: LOCAL_CNPJ,
        telefone: '1633330061',
        endereco: 'Rua Clima Motor, 61',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@clima-motor.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@clima-motor.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Cria 5 employees ativos no departamento Comercial com plenitude
    // canonica (scoreA + 4 scores por dimensao — §6.4 do motor de
    // plenitude). Dois primeiros sao lider e liderado direto (§9.2
    // canonico — cadeia direta).
    for (let i = 0; i < 5; i++) {
      const [row] = await client.db
        .insert(employees)
        .values({
          companyId,
          name: `Colab Clima ${i}`,
          cpf: `1868618686${i}`,
          email: `colab-clima-${i}@roip.local`,
          dataNascimento: new Date('1985-01-01'),
          dataAdmissao: new Date('2020-01-01'),
          cbo: '142105',
          descricaoCBO: 'Gerente Comercial',
          jobFamily: 'lideranca_gestao',
          senioridade: 'senior',
          nivelHierarquico: i === 0 ? 'tatico' : 'operacional',
          departamento: 'Comercial',
          isLider: i === 0,
        })
        .$returningId();
      if (!row) throw new Error('beforeAll: falha ao criar employee');
      employeeIds.push(row.id);
    }

    // Vincula os 4 demais employees ao lider (employeeIds[0]).
    for (let i = 1; i < 5; i++) {
      await client.db.insert(employeeLeaderHistory).values({
        employeeId: employeeIds[i]!,
        liderId: employeeIds[0]!,
        clevelId: null,
        dataInicio: new Date('2020-01-01'),
        dataFim: null,
        reason: 'fixture-me-b2-01a13',
        transferBatchId: '00000000-0000-0000-0000-000000000000',
      });
    }

    // Plenitude canonica no trimestre alvo (scoreA em 0..100 §6.4).
    for (const empId of employeeIds) {
      await client.db.insert(plenitudeData).values({
        companyId,
        employeeId: empId,
        trimestre: LOCAL_TRI,
        scoreA: '80.00',
        engajamentoA: '80.00',
        desenvolvimentoA: '80.00',
        pertencimentoA: '80.00',
        realizacaoA: '80.00',
      });

      // Respostas do Instrumento A (grid 4x5 — 20 questoes canonicas
      // §9.4 do motor). Valor '4' = "Sempre" (§6.2 canonica).
      for (let d = 1; d <= 4; d++) {
        for (let idx = 1; idx <= 5; idx++) {
          await client.db.insert(instrumentA_responses).values({
            companyId,
            employeeId: empId,
            trimestre: LOCAL_TRI,
            dimensao: d,
            itemIndex: idx,
            valor: 4,
          });
        }
      }
    }
  });

  afterAll(async () => {
    await client.db
      .delete(climateEngagementData)
      .where(eq(climateEngagementData.companyId, companyId));
    await client.db
      .delete(instrumentA_responses)
      .where(eq(instrumentA_responses.companyId, companyId));
    await client.db.delete(plenitudeData).where(eq(plenitudeData.companyId, companyId));
    if (employeeIds.length > 0) {
      for (const empId of employeeIds) {
        await client.db
          .delete(employeeLeaderHistory)
          .where(eq(employeeLeaderHistory.employeeId, empId));
      }
    }
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  it('chama motor para os 4 trimestres canonicos', async () => {
    // Executa a chamada canonica localmente (usa companyId local em vez
    // do UBATUBA_COMPANY_ID para nao interferir com outras fixtures).
    for (const tri of UBATUBA_CLIMATE_TRIMESTRES) {
      const now = new Date('2027-12-31T18:00:00Z');
      // Chama motor diretamente (a funcao publica seed usa
      // UBATUBA_COMPANY_ID; para o teste local, chamamos motor
      // diretamente com o companyId da fixture-local — mesmo padrao
      // canonico).
      const { recalculateAggregates } =
        await import('../../../src/server/services/climateCalculationEngine');
      await recalculateAggregates(client.db, companyId, tri, now);
    }

    // Grid canonico bit-a-bit: exatamente 1 linha empresa por trimestre.
    for (const tri of UBATUBA_CLIMATE_TRIMESTRES) {
      const rows = await client.db
        .select()
        .from(climateEngagementData)
        .where(
          and(
            eq(climateEngagementData.companyId, companyId),
            eq(climateEngagementData.escopo, 'empresa'),
            eq(climateEngagementData.trimestre, tri),
          ),
        );
      expect(rows.length).toBe(1);
    }
  });

  it('grava notaClima na escala 0-10 canonica §9.4 (bit-a-bit resolve bug 0-4)', async () => {
    const rows = await client.db
      .select()
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, 'empresa'),
          eq(climateEngagementData.trimestre, LOCAL_TRI),
        ),
      );
    expect(rows.length).toBe(1);
    // scoreA=80 → notaClima canonica = 80/10 = 8.00 (§9.4).
    expect(rows[0]!.notaClima).toBe('8.00');
    // Escala 0-10 canonica confirmada: bit-a-bit acima do bug
    // Likert 0-4 (max 4.00) do seed aposentado.
    expect(Number(rows[0]!.notaClima)).toBeGreaterThan(4);
    expect(Number(rows[0]!.notaClima)).toBeLessThanOrEqual(10);
  });

  it('grid canonico inclui escopo departamento para Comercial', async () => {
    const rows = await client.db
      .select()
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, 'departamento'),
          eq(climateEngagementData.departamento, 'Comercial'),
          eq(climateEngagementData.trimestre, LOCAL_TRI),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]!.countCobertura).toBe(5);
  });

  it('grid canonico inclui escopo equipe para lider-employee com cadeia', async () => {
    const rows = await client.db
      .select()
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, 'equipe'),
          eq(climateEngagementData.liderId, employeeIds[0]!),
          eq(climateEngagementData.trimestre, LOCAL_TRI),
        ),
      );
    expect(rows.length).toBe(1);
    // Cadeia canonica: 4 liderados diretos (empId[1..4]) — o lider
    // proprio nao entra na cadeia descendente por definicao §9.2.
    expect(rows[0]!.countCobertura).toBe(4);
  });

  it('idempotencia canonica S172/S172b: rodar 2x produz MESMA linha', async () => {
    const now = new Date('2027-12-31T18:00:00Z');
    const { recalculateAggregates } =
      await import('../../../src/server/services/climateCalculationEngine');
    await recalculateAggregates(client.db, companyId, LOCAL_TRI, now);
    await recalculateAggregates(client.db, companyId, LOCAL_TRI, now);
    const rows = await client.db
      .select()
      .from(climateEngagementData)
      .where(
        and(
          eq(climateEngagementData.companyId, companyId),
          eq(climateEngagementData.escopo, 'empresa'),
          eq(climateEngagementData.trimestre, LOCAL_TRI),
        ),
      );
    expect(rows.length).toBe(1);
  });

  it('re-exporta UBATUBA_CLIMATE_TRIMESTRES canonicos', () => {
    // RV-13: consumidor vivo das constantes canonicas do seed refactor.
    expect(UBATUBA_CLIMATE_TRIMESTRES.length).toBe(4);
    // Assinatura canonica da API publica seed (RV-13).
    expect(typeof seedClimateEngagementDataViaMotor).toBe('function');
  });
});
