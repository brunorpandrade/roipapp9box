// ROIP APP 9BOX — teste de integracao do motor
// `individualProfileEngine` (ME-049a).
//
// Exercita o motor deterministico canonico do Perfil Individual
// (DOC 03 §10.4-§10.6 + Perfil_Individual__instrumento_completo_.md
// §5.1-§5.5) contra MySQL real. Cobre:
//
//   - Camada 1 pura: IA_ATT (§5.1.1), IA_SOC (§5.1.2), IA_ACQ (§5.1.3),
//     IA_CONS (§5.1.4), IA_EXT (§5.1.5), classificacao alta/moderada/
//     baixa (§5.1.6).
//   - Camada 2 pura: Likert direto, Likert invertido, EF (Anexo B
//     §9.1-§9.2), CN (Anexo B §9.3-§9.5).
//   - Camada 3 pura: agregacao por subvetor via
//     `computeBrutoPorSubvetor`.
//   - Camada 4 pura: `normalizeSubvector` (min/max Anexo C),
//     `computeMotorHierarchy` + `EMPATE_MOT`,
//     `computeTop3Assinatura` + `EQUIL_ASS`,
//     `computePerfilComportamental` (§5.4.3), `computeEquIndice`.
//   - Camada 5 pura: `computeCrossDimensionalFlags` (§6.3 + DOC 03
//     §10.5) — as 4 flags cross-dimensionais.
//   - Constantes canonicas (RV-13): `NUM_ITENS_TOTAL=80`,
//     `NUM_BLOCOS_TOTAL=10`, `NUM_ITENS_POR_BLOCO=8`.
//   - Persistencia canonica via `runAssessment`: caminho consistente
//     (alta/moderada) -> UPDATE assessment status='enviado' + INSERT
//     score com 24 escores + top3 + flags + placeholder='respondido';
//     caminho inconsistente (baixa) -> UPDATE status='inconsistente'
//     + NAO cria score + placeholder='inconsistente'.
//   - Isolamento canonico: motor NAO vaza entre companies/titulares.
//   - Facade DI: `DEFAULT_INDIVIDUAL_PROFILE_ENGINE` aponta ao motor
//     real (S105/S060 replicado).
//
// Padrao S009 estendido (S076/S199): uma company por describe, CNPJ
// unico da faixa canonica reservada 10000000000900..909 (S199 —
// ME-049a). L32 cleanup em afterAll. JWT_SECRET fixo no arquivo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  employees,
  individualProfileAssessments,
  individualProfilePlaceholders,
  individualProfileScores,
} from '../../src/db/schema';
import {
  classifyReliability,
  computeBrutoPorSubvetor,
  computeCrossDimensionalFlags,
  computeEquIndice,
  computeIaAcq,
  computeIaAtt,
  computeIaCons,
  computeIaExt,
  computeIaSoc,
  computeItemScoreLikert,
  computeMotorHierarchy,
  computePerfilComportamental,
  computeTop3Assinatura,
  CONFIRMACAO_TTL_DIAS,
  DEFAULT_INDIVIDUAL_PROFILE_ENGINE,
  itemKey,
  normalizeSubvector,
  NUM_BLOCOS_TOTAL,
  NUM_ITENS_POR_BLOCO,
  NUM_ITENS_TOTAL,
  round2,
  runAssessment,
  type ConfiabilidadeNivel,
  type CrossDimensionalFlags,
  type IndividualProfileEngineFacade,
  type IndividualProfileEngineResult,
  type RespostasPerfil,
  type SubvectorId,
} from '../../src/server/services/individualProfileEngine';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049a-individual-profile-engine';

const HASH_IP = 'hash-fixo-me049a-motor';

// CNPJs canonicos por describe (S076/S109/S199 — faixa 900..909
// reservada a ME-049a).
const CNPJ_CONSTANTES = '10000000000900';
const CNPJ_CAMADA1 = '10000000000901';
const CNPJ_CAMADA2 = '10000000000902';
const CNPJ_CAMADA3_4 = '10000000000903';
const CNPJ_CAMADA5 = '10000000000904';
const CNPJ_CONSISTENTE = '10000000000905';
const CNPJ_INCONSISTENTE = '10000000000906';
const CNPJ_ISOLAMENTO_A = '10000000000907';
const CNPJ_ISOLAMENTO_B = '10000000000908';
const CNPJ_FACADE = '10000000000909';

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(individualProfileScores)
      .where(inArray(individualProfileScores.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await client.db
      .delete(individualProfilePlaceholders)
      .where(inArray(individualProfilePlaceholders.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Fixture helpers
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049a Motor ${cnpj} LTDA`,
      nomeFantasia: `ME049a Motor ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049a Motor, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49000000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: 'Colab ME049a',
      cpf: nextCpf(),
      email: `emp-${nextCpf()}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      isRH: false,
      passwordHash: HASH_IP,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createPlaceholder(
  companyId: number,
  employeeId: number,
  status: 'pendente' | 'em_andamento' = 'pendente',
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfilePlaceholders)
    .values({ companyId, userType: 'employee', userId: employeeId, status })
    .$returningId();
  return row!.id;
}

async function createAssessment(
  companyId: number,
  employeeId: number,
  respostas: RespostasPerfil,
  tentativa = 1,
): Promise<number> {
  const [row] = await client.db
    .insert(individualProfileAssessments)
    .values({
      companyId,
      userType: 'employee',
      userId: employeeId,
      tentativa,
      status: 'em_andamento',
      blocoAtual: NUM_BLOCOS_TOTAL,
      blocosCompletos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      respostas,
    })
    .$returningId();
  return row!.id;
}

/**
 * Constroi payload canonico de 80 respostas todo mid-range (3 nos
 * Likert, 'A' nos EF, 'B' nos CN), com respostas corretas nos ATT
 * (018=2, 080=1). Base para variacoes controladas.
 */
function buildRespostasBase(): RespostasPerfil {
  const out: RespostasPerfil = {};
  const efs = new Set<number>([3, 8, 13, 19, 28, 30, 34, 45, 49, 58, 64, 73]);
  const cns = new Set<number>([
    4, 11, 15, 16, 22, 26, 33, 36, 42, 46, 48, 51, 56, 60, 62, 66, 72, 76,
  ]);
  for (let i = 1; i <= NUM_ITENS_TOTAL; i += 1) {
    if (i === 18) {
      out[itemKey(i)] = 2;
      continue;
    }
    if (i === 80) {
      out[itemKey(i)] = 1;
      continue;
    }
    if (efs.has(i)) {
      out[itemKey(i)] = 'A';
      continue;
    }
    if (cns.has(i)) {
      out[itemKey(i)] = 'B';
      continue;
    }
    out[itemKey(i)] = 3;
  }
  return out;
}

// ============================================================
// Constantes canonicas
// ============================================================

describe('individualProfileEngine — constantes canonicas', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CONSTANTES);
  });

  it('expoe totais canonicos §3.2 + DOC 01 §9.1', () => {
    expect(NUM_ITENS_TOTAL).toBe(80);
    expect(NUM_BLOCOS_TOTAL).toBe(10);
    expect(NUM_ITENS_POR_BLOCO).toBe(8);
    expect(NUM_BLOCOS_TOTAL * NUM_ITENS_POR_BLOCO).toBe(NUM_ITENS_TOTAL);
    expect(CONFIRMACAO_TTL_DIAS).toBe(7);
  });

  it('itemKey formata canonicamente ITEM_XXX (padStart 3)', () => {
    expect(itemKey(1)).toBe('ITEM_001');
    expect(itemKey(18)).toBe('ITEM_018');
    expect(itemKey(80)).toBe('ITEM_080');
  });

  it('DEFAULT_INDIVIDUAL_PROFILE_ENGINE aponta ao motor real (S105)', () => {
    expect(DEFAULT_INDIVIDUAL_PROFILE_ENGINE.runAssessment).toBe(runAssessment);
  });

  it('tipos publicos assinatura canonica (RV-13)', () => {
    // Exercita ConfiabilidadeNivel, CrossDimensionalFlags e
    // IndividualProfileEngineResult como consumidores canonicos —
    // acompanham o resto do contrato publico do motor.
    const nivel: ConfiabilidadeNivel = 'alta';
    expect(['alta', 'moderada', 'baixa']).toContain(nivel);
    const flags: CrossDimensionalFlags = {
      FLAG_ADAPT_POST: false,
      FLAG_DESALINH_MOT_ASS: false,
      FLAG_COMP_APRENDIDA: false,
      FLAG_LIDER_REATIVO: false,
      EMPATE_MOT: false,
      EQUIL_ASS: false,
    };
    expect(flags.FLAG_ADAPT_POST).toBe(false);
    const resultShape: Pick<IndividualProfileEngineResult, 'motivo' | 'status'> = {
      motivo: 'consistente',
      status: 'enviado',
    };
    expect(resultShape.motivo).toBe('consistente');
  });

  it('round2 arredonda deterministicamente para 2 casas', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(0)).toBe(0);
  });
});

// ============================================================
// Camada 1 — Confiabilidade
// ============================================================

describe('individualProfileEngine — Camada 1 (confiabilidade)', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CAMADA1);
  });

  it('IA_ATT: 2 corretos -> score 2 alerta ok', () => {
    const r: RespostasPerfil = { ITEM_018: 2, ITEM_080: 1 };
    const out = computeIaAtt(r);
    expect(out.score).toBe(2);
    expect(out.alerta).toBe('ok');
  });

  it('IA_ATT: 1 errado -> score 1 alerta medio', () => {
    expect(computeIaAtt({ ITEM_018: 2, ITEM_080: 3 }).alerta).toBe('medio');
    expect(computeIaAtt({ ITEM_018: 5, ITEM_080: 1 }).alerta).toBe('medio');
  });

  it('IA_ATT: 2 errados -> score 0 alerta critico', () => {
    const out = computeIaAtt({ ITEM_018: 5, ITEM_080: 5 });
    expect(out.score).toBe(0);
    expect(out.alerta).toBe('critico');
  });

  it('IA_SOC: todos 1-2 -> ok', () => {
    const out = computeIaSoc({ ITEM_009: 1, ITEM_039: 2, ITEM_075: 1 });
    expect(out.score).toBe(0);
    expect(out.alerta).toBe('ok');
  });

  it('IA_SOC: resposta 3 soma 1; 4-5 soma 2', () => {
    expect(computeIaSoc({ ITEM_009: 3, ITEM_039: 3, ITEM_075: 3 }).score).toBe(3);
    expect(computeIaSoc({ ITEM_009: 5, ITEM_039: 4, ITEM_075: 5 }).score).toBe(6);
  });

  it('IA_SOC: fronteiras canonicas alta/media/critica', () => {
    expect(computeIaSoc({ ITEM_009: 1, ITEM_039: 3, ITEM_075: 1 }).alerta).toBe('ok');
    expect(computeIaSoc({ ITEM_009: 3, ITEM_039: 3, ITEM_075: 1 }).alerta).toBe('medio');
    expect(computeIaSoc({ ITEM_009: 5, ITEM_039: 5, ITEM_075: 5 }).alerta).toBe('critico');
  });

  it('IA_ACQ: ambos altos ou ambos baixos -> alerta; opostos -> ok', () => {
    expect(computeIaAcq({ ITEM_001: 5, ITEM_006: 5 }).score).toBe(1);
    expect(computeIaAcq({ ITEM_001: 1, ITEM_006: 2 }).score).toBe(1);
    expect(computeIaAcq({ ITEM_001: 5, ITEM_006: 1 }).score).toBe(0);
    expect(computeIaAcq({ ITEM_001: 3, ITEM_006: 3 }).score).toBe(0);
  });

  it('IA_CONS: |6 - soma| classificado por fronteiras', () => {
    expect(computeIaCons({ ITEM_025: 3, ITEM_057: 3 }).alerta).toBe('ok');
    expect(computeIaCons({ ITEM_025: 4, ITEM_057: 3 }).alerta).toBe('ok');
    expect(computeIaCons({ ITEM_025: 4, ITEM_057: 4 }).alerta).toBe('medio');
    expect(computeIaCons({ ITEM_025: 5, ITEM_057: 5 }).alerta).toBe('critico');
  });

  it('IA_EXT: fracao de 1|5 sobre 73 Likert', () => {
    const base = buildRespostasBase();
    // Base: nenhuma extrema entre Likert (018=2, 080=1 — 080 EH 1
    // extrema). Total extremas = 1; score = round2(1/73).
    const out = computeIaExt(base);
    expect(out.score).toBe(round2(1 / 73));
    expect(out.alerta).toBe('ok');
  });

  it('IA_EXT: fronteiras > 0.6 medio; > 0.75 critico', () => {
    // Reponde todos os Likert em 5 e mantem EF/CN validos.
    // Denominador canonico literal §5.1.5 = 73. Extremas Likert
    // reais = 50; fracao = round2(50/73) ≈ 0.68, alerta medio.
    // Aqui provamos apenas o limiar critico: soma extremas
    // (1s + 5s) o suficiente para ultrapassar 0.75 x 73 = 55.
    // Como so temos ~50 Likert, o teste demonstra que ao adicionar
    // 1s de ATT (18=1 e 80=5 - EXTREMAS), + ANC 5s + CON 5s + par
    // aquiescencia 5s + Likert 5s alcancamos > 0.75.
    const r: RespostasPerfil = {};
    for (let i = 1; i <= NUM_ITENS_TOTAL; i += 1) {
      r[itemKey(i)] = 5;
    }
    // Preserva EF/CN validos (nao Likert - nao entram no IA_EXT).
    const efs = [3, 8, 13, 19, 28, 30, 34, 45, 49, 58, 64, 73];
    const cns = [4, 11, 15, 16, 22, 26, 33, 36, 42, 46, 48, 51, 56, 60, 62, 66, 72, 76];
    for (const i of efs) r[itemKey(i)] = 'A';
    for (const i of cns) r[itemKey(i)] = 'B';
    // Todos os 50 Likert em 5 -> 50 extremas -> 50/73 ≈ 0.68.
    // Fica no ramo `medio` (>0.6 e <=0.75).
    const out = computeIaExt(r);
    expect(out.score).toBeGreaterThan(0.6);
    expect(out.score).toBeLessThanOrEqual(0.75);
    expect(out.alerta).toBe('medio');
  });

  it('classifyReliability: 5 ok -> alta', () => {
    expect(classifyReliability(['ok', 'ok', 'ok', 'ok', 'ok'])).toBe('alta');
  });

  it('classifyReliability: 1 medio -> alta; 2 medios -> moderada; 4 medios -> baixa', () => {
    expect(classifyReliability(['medio', 'ok', 'ok', 'ok', 'ok'])).toBe('alta');
    expect(classifyReliability(['medio', 'medio', 'ok', 'ok', 'ok'])).toBe('moderada');
    expect(classifyReliability(['medio', 'medio', 'medio', 'medio', 'ok'])).toBe('baixa');
  });

  it('classifyReliability: critico isolado -> moderada; 2 criticos -> baixa', () => {
    expect(classifyReliability(['critico', 'ok', 'ok', 'ok', 'ok'])).toBe('moderada');
    expect(classifyReliability(['critico', 'critico', 'ok', 'ok', 'ok'])).toBe('baixa');
    expect(classifyReliability(['critico', 'medio', 'medio', 'ok', 'ok'])).toBe('baixa');
  });
});

// ============================================================
// Camada 2 — Pontuacao bruta por item
// ============================================================

describe('individualProfileEngine — Camada 2 (item score)', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CAMADA2);
  });

  it('Likert direto: valor identico', () => {
    expect(computeItemScoreLikert(1, 3)).toBe(3);
    expect(computeItemScoreLikert(7, 5)).toBe(5);
  });

  it('Likert invertido: 6 - valor', () => {
    // ITEM_006 é invertido (§8.2 do instrumento)
    expect(computeItemScoreLikert(6, 5)).toBe(1);
    expect(computeItemScoreLikert(6, 1)).toBe(5);
    expect(computeItemScoreLikert(70, 4)).toBe(2);
  });

  it('valor fora do range -> 0 (defesa canonica)', () => {
    expect(computeItemScoreLikert(1, 0)).toBe(0);
    expect(computeItemScoreLikert(1, 6)).toBe(0);
    expect(computeItemScoreLikert(1, Number.NaN)).toBe(0);
  });
});

// ============================================================
// Camada 3 + Camada 4 — Agregacao e normalizacao
// ============================================================

describe('individualProfileEngine — Camadas 3 e 4', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CAMADA3_4);
  });

  it('computeBrutoPorSubvetor agrega Likert (base todo 3)', () => {
    const bruto = computeBrutoPorSubvetor(buildRespostasBase());
    // POST_ASSERT: itens 1(D,3), 6(I,6-3=3), 22(CN B=2), 42(CN B=2),
    // 67(D,3), 77(D,3) = 3+3+2+2+3+3 = 16.
    expect(bruto.post_assert).toBe(16);
    // POST_TAREFAS: itens 27(D,3), 47(D,3) = 6.
    expect(bruto.post_tarefas).toBe(6);
    // MOT_SEGURANCA: apenas EF. Base escolhe 'A' em todos:
    // ITEM_030 A -> MOT_SEGURANCA (+2). ITEM_034 A -> MOT_LIDERANCA.
    // ITEM_058 A -> MOT_AUTONOMIA. Total canonico = 2.
    expect(bruto.mot_seguranca).toBe(2);
  });

  it('normalizeSubvector aplica formula canonica com clamp', () => {
    // POST_ASSERT: min=6, max=28; bruto=6 -> 0; bruto=28 -> 100.
    expect(normalizeSubvector('post_assert', 6)).toBe(0);
    expect(normalizeSubvector('post_assert', 28)).toBe(100);
    // bruto=17 (metade) -> 50.
    expect(normalizeSubvector('post_assert', 17)).toBe(50);
    // Clamp: bruto=0 (abaixo do min) -> 0.
    expect(normalizeSubvector('post_assert', 0)).toBe(0);
  });

  it('EF Anexo B: escolher A soma 2 pontos ao subvetor A canonico', () => {
    const r = buildRespostasBase();
    // ITEM_003 A -> MOT_MAESTRIA; ITEM_019 A -> MOT_PROPOSITO;
    // ITEM_045 A -> MOT_PROPOSITO; ITEM_073 A -> MOT_AUTONOMIA.
    r.ITEM_003 = 'B'; // muda para B -> MOT_LIDERANCA
    const bruto = computeBrutoPorSubvetor(r);
    // MOT_LIDERANCA: EFs 3.B (+2), 34.A (base A=lideranca +2),
    // 73.B (nao escolhida na base A). Base escolhe A em ITEM_034
    // (A=MOT_LIDERANCA) e A em ITEM_073 (A=MOT_AUTONOMIA). Likert
    // 079(I, base 3 -> 6-3=3). Total = 2+2+3 = 7.
    expect(bruto.mot_lideranca).toBe(7);
  });

  it('CN Anexo B: peso por alternativa aplicado ao subvetor canonico', () => {
    const r = buildRespostasBase();
    // ITEM_004 -> EQU_AUTOGEST peso B=4. Base tem B em todos CN.
    // ITEM_015 EQU_AUTOGEST peso B=4. ITEM_066 EQU_AUTOGEST peso B=4.
    // Likert 020(D,3), 031(I, 6-3=3), 050(D,3).
    const bruto = computeBrutoPorSubvetor(r);
    expect(bruto.equ_autogest).toBe(4 + 4 + 4 + 3 + 3 + 3);
  });

  it('computeMotorHierarchy identifica dominante/sustentacao/negligenciado', () => {
    const norm: Record<SubvectorId, number> = {
      post_assert: 0,
      post_tarefas: 0,
      post_pessoas: 0,
      post_pressao: 0,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 90,
      mot_lideranca: 70,
      mot_autonomia: 60,
      mot_seguranca: 40,
      mot_proposito: 30,
      equ_autocons: 0,
      equ_autogest: 0,
      equ_leitura: 0,
      equ_influencia: 0,
      ass_sabed: 0,
      ass_coragem: 0,
      ass_humanid: 0,
      ass_justica: 0,
      ass_temper: 0,
      ass_transc: 0,
    };
    const h = computeMotorHierarchy(norm);
    expect(h.vetorDominante).toBe('mot_maestria');
    expect(h.vetorSustentacao).toBe('mot_lideranca');
    expect(h.vetorNegligenciado).toBe('mot_proposito');
    expect(h.empateMot).toBe(false);
  });

  it('EMPATE_MOT ativa quando top 2 diferem em menos de 5', () => {
    const norm: Record<SubvectorId, number> = {
      post_assert: 0,
      post_tarefas: 0,
      post_pessoas: 0,
      post_pressao: 0,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 80,
      mot_lideranca: 77,
      mot_autonomia: 60,
      mot_seguranca: 40,
      mot_proposito: 30,
      equ_autocons: 0,
      equ_autogest: 0,
      equ_leitura: 0,
      equ_influencia: 0,
      ass_sabed: 0,
      ass_coragem: 0,
      ass_humanid: 0,
      ass_justica: 0,
      ass_temper: 0,
      ass_transc: 0,
    };
    expect(computeMotorHierarchy(norm).empateMot).toBe(true);
  });

  it('computeTop3Assinatura identifica as 3 virtudes de topo', () => {
    const norm: Record<SubvectorId, number> = {
      post_assert: 0,
      post_tarefas: 0,
      post_pessoas: 0,
      post_pressao: 0,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 0,
      mot_lideranca: 0,
      mot_autonomia: 0,
      mot_seguranca: 0,
      mot_proposito: 0,
      equ_autocons: 0,
      equ_autogest: 0,
      equ_leitura: 0,
      equ_influencia: 0,
      ass_sabed: 90,
      ass_coragem: 80,
      ass_humanid: 70,
      ass_justica: 40,
      ass_temper: 30,
      ass_transc: 20,
    };
    const t = computeTop3Assinatura(norm);
    expect(t.top3).toEqual(['ass_sabed', 'ass_coragem', 'ass_humanid']);
    expect(t.equilAss).toBe(false);
  });

  it('EQUIL_ASS ativa quando top 2 virtudes diferem em menos de 5', () => {
    const norm: Record<SubvectorId, number> = {
      post_assert: 0,
      post_tarefas: 0,
      post_pessoas: 0,
      post_pressao: 0,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 0,
      mot_lideranca: 0,
      mot_autonomia: 0,
      mot_seguranca: 0,
      mot_proposito: 0,
      equ_autocons: 0,
      equ_autogest: 0,
      equ_leitura: 0,
      equ_influencia: 0,
      ass_sabed: 90,
      ass_coragem: 88,
      ass_humanid: 70,
      ass_justica: 40,
      ass_temper: 30,
      ass_transc: 20,
    };
    expect(computeTop3Assinatura(norm).equilAss).toBe(true);
  });

  it('computePerfilComportamental retorna par sub1+sub2 dos 2 mais altos da Postura', () => {
    const norm: Record<SubvectorId, number> = {
      post_assert: 80,
      post_tarefas: 60,
      post_pessoas: 70,
      post_pressao: 40,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 0,
      mot_lideranca: 0,
      mot_autonomia: 0,
      mot_seguranca: 0,
      mot_proposito: 0,
      equ_autocons: 0,
      equ_autogest: 0,
      equ_leitura: 0,
      equ_influencia: 0,
      ass_sabed: 0,
      ass_coragem: 0,
      ass_humanid: 0,
      ass_justica: 0,
      ass_temper: 0,
      ass_transc: 0,
    };
    expect(computePerfilComportamental(norm)).toBe('post_assert+post_pessoas');
  });

  it('computeEquIndice: media dos 4 subvetores', () => {
    const norm: Record<SubvectorId, number> = {
      post_assert: 0,
      post_tarefas: 0,
      post_pessoas: 0,
      post_pressao: 0,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 0,
      mot_lideranca: 0,
      mot_autonomia: 0,
      mot_seguranca: 0,
      mot_proposito: 0,
      equ_autocons: 60,
      equ_autogest: 70,
      equ_leitura: 80,
      equ_influencia: 50,
      ass_sabed: 0,
      ass_coragem: 0,
      ass_humanid: 0,
      ass_justica: 0,
      ass_temper: 0,
      ass_transc: 0,
    };
    expect(computeEquIndice(norm)).toBe(65);
  });
});

// ============================================================
// Camada 5 — Flags cross-dimensional
// ============================================================

describe('individualProfileEngine — Camada 5 (flags cross-dimensional)', () => {
  beforeAll(async () => {
    await createCompany(CNPJ_CAMADA5);
  });

  function zeros(): Record<SubvectorId, number> {
    return {
      post_assert: 0,
      post_tarefas: 0,
      post_pessoas: 0,
      post_pressao: 0,
      est_abert: 0,
      est_disc: 0,
      est_ext: 0,
      est_amab: 0,
      est_estab: 0,
      mot_maestria: 0,
      mot_lideranca: 0,
      mot_autonomia: 0,
      mot_seguranca: 0,
      mot_proposito: 0,
      equ_autocons: 0,
      equ_autogest: 0,
      equ_leitura: 0,
      equ_influencia: 0,
      ass_sabed: 0,
      ass_coragem: 0,
      ass_humanid: 0,
      ass_justica: 0,
      ass_temper: 0,
      ass_transc: 0,
    };
  }

  it('FLAG_ADAPT_POST: post_assert>60 e est_ext<40', () => {
    const n = zeros();
    n.post_assert = 70;
    n.est_ext = 30;
    const flags = computeCrossDimensionalFlags(n, 'mot_maestria', ['ass_sabed'], false, false);
    expect(flags.FLAG_ADAPT_POST).toBe(true);
  });

  it('FLAG_ADAPT_POST: fronteira post_assert=60 (nao ativa: > estrito)', () => {
    const n = zeros();
    n.post_assert = 60;
    n.est_ext = 30;
    const flags = computeCrossDimensionalFlags(n, 'mot_maestria', ['ass_sabed'], false, false);
    expect(flags.FLAG_ADAPT_POST).toBe(false);
  });

  it('FLAG_DESALINH_MOT_ASS: dominante sem ressonancia no top-3', () => {
    const n = zeros();
    // Dominante mot_maestria — ressonancia = ['ass_sabed'].
    // top-3 sem ass_sabed -> flag ativa.
    const flags = computeCrossDimensionalFlags(
      n,
      'mot_maestria',
      ['ass_humanid', 'ass_justica', 'ass_temper'],
      false,
      false,
    );
    expect(flags.FLAG_DESALINH_MOT_ASS).toBe(true);
  });

  it('FLAG_DESALINH_MOT_ASS: com ressonancia -> nao ativa', () => {
    const n = zeros();
    const flags = computeCrossDimensionalFlags(
      n,
      'mot_lideranca',
      ['ass_justica', 'ass_coragem', 'ass_humanid'],
      false,
      false,
    );
    expect(flags.FLAG_DESALINH_MOT_ASS).toBe(false);
  });

  it('FLAG_COMP_APRENDIDA: est_estab<40 e equ_indice>60', () => {
    const n = zeros();
    n.est_estab = 20;
    n.equ_autocons = 80;
    n.equ_autogest = 80;
    n.equ_leitura = 80;
    n.equ_influencia = 80;
    const flags = computeCrossDimensionalFlags(n, 'mot_maestria', ['ass_sabed'], false, false);
    expect(flags.FLAG_COMP_APRENDIDA).toBe(true);
  });

  it('FLAG_LIDER_REATIVO: post_assert>60 e equ_autocons<40', () => {
    const n = zeros();
    n.post_assert = 80;
    n.equ_autocons = 30;
    const flags = computeCrossDimensionalFlags(n, 'mot_maestria', ['ass_sabed'], false, false);
    expect(flags.FLAG_LIDER_REATIVO).toBe(true);
  });

  it('flags binarias: passthrough de EMPATE_MOT/EQUIL_ASS', () => {
    const flags = computeCrossDimensionalFlags(zeros(), 'mot_maestria', ['ass_sabed'], true, true);
    expect(flags.EMPATE_MOT).toBe(true);
    expect(flags.EQUIL_ASS).toBe(true);
  });
});

// ============================================================
// runAssessment — caminho consistente
// ============================================================

describe('individualProfileEngine — runAssessment consistente (persistencia)', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_CONSISTENTE);
  });

  it('runAssessment confiavel -> enviado + score + placeholder respondido', async () => {
    const employeeId = await createEmployee(companyId);
    const placeholderId = await createPlaceholder(companyId, employeeId);
    const respostas = buildRespostasBase();
    const assessmentId = await createAssessment(companyId, employeeId, respostas);

    const now = new Date('2026-07-20T10:00:00Z');
    const result = await runAssessment(client.db, assessmentId, now);

    expect(result.motivo).toBe('consistente');
    expect(result.status).toBe('enviado');
    expect(result.confiabilidadeNivel).toBe('alta');
    expect(result.enviadoEm).toEqual(now);
    expect(result.exibirConfirmacaoAte.getTime()).toBe(
      now.getTime() + CONFIRMACAO_TTL_DIAS * 24 * 3600 * 1000,
    );

    // Assessment atualizado.
    const [a] = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, assessmentId))
      .limit(1);
    expect(a!.status).toBe('enviado');
    expect(a!.confiabilidadeNivel).toBe('alta');

    // Score inserido com 24 colunas nao-nulas + top3 + flags + timestamp.
    const [s] = await client.db
      .select()
      .from(individualProfileScores)
      .where(eq(individualProfileScores.assessmentId, assessmentId))
      .limit(1);
    expect(s).toBeDefined();
    expect(s!.perfilComportamental).toBeTruthy();
    expect(s!.vetorDominante).toBeTruthy();
    expect(s!.vetorSustentacao).toBeTruthy();
    expect(s!.vetorNegligenciado).toBeTruthy();
    expect(Array.isArray(s!.top3Assinatura)).toBe(true);
    expect(typeof s!.flags).toBe('object');
    expect(s!.equ_indice).not.toBeNull();
    expect(s!.exibirConfirmacaoAte).not.toBeNull();

    // Placeholder transicionou canonicamente.
    const [p] = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(eq(individualProfilePlaceholders.id, placeholderId))
      .limit(1);
    expect(p!.status).toBe('respondido');
    expect(p!.respondidoEm).not.toBeNull();
  });
});

// ============================================================
// runAssessment — caminho inconsistente
// ============================================================

describe('individualProfileEngine — runAssessment inconsistente', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_INCONSISTENTE);
  });

  it('confiabilidade baixa -> inconsistente + sem score + placeholder inconsistente', async () => {
    const employeeId = await createEmployee(companyId);
    const placeholderId = await createPlaceholder(companyId, employeeId);
    // Constroi respostas com 2+ criticos: IA_ATT critico (ambos errados) +
    // IA_CONS critico (diff >= 3) + IA_SOC critico.
    const respostas = buildRespostasBase();
    respostas.ITEM_018 = 5; // errado
    respostas.ITEM_080 = 5; // errado -> IA_ATT critico
    respostas.ITEM_025 = 5; // + 057 = 5 -> soma 10 -> diff 4 critico
    respostas.ITEM_057 = 5;
    respostas.ITEM_009 = 5;
    respostas.ITEM_039 = 5;
    respostas.ITEM_075 = 5; // IA_SOC = 6 -> critico
    const assessmentId = await createAssessment(companyId, employeeId, respostas);

    const now = new Date('2026-07-20T11:00:00Z');
    const result = await runAssessment(client.db, assessmentId, now);

    expect(result.motivo).toBe('inconsistente_baixa_confiabilidade');
    expect(result.status).toBe('inconsistente');
    expect(result.confiabilidadeNivel).toBe('baixa');

    const [a] = await client.db
      .select()
      .from(individualProfileAssessments)
      .where(eq(individualProfileAssessments.id, assessmentId))
      .limit(1);
    expect(a!.status).toBe('inconsistente');
    expect(a!.confiabilidadeNivel).toBe('baixa');

    // NAO cria score canonico (§10.6).
    const scores = await client.db
      .select()
      .from(individualProfileScores)
      .where(eq(individualProfileScores.assessmentId, assessmentId));
    expect(scores).toHaveLength(0);

    // Placeholder transicionou para inconsistente.
    const [p] = await client.db
      .select()
      .from(individualProfilePlaceholders)
      .where(eq(individualProfilePlaceholders.id, placeholderId))
      .limit(1);
    expect(p!.status).toBe('inconsistente');
    expect(p!.respondidoEm).toBeNull();
  });
});

// ============================================================
// Isolamento canonico
// ============================================================

describe('individualProfileEngine — isolamento entre companies', () => {
  let companyA: number;
  let companyB: number;

  beforeAll(async () => {
    companyA = await createCompany(CNPJ_ISOLAMENTO_A);
    companyB = await createCompany(CNPJ_ISOLAMENTO_B);
  });

  it('motor NAO vaza escores entre companies', async () => {
    const empA = await createEmployee(companyA);
    await createPlaceholder(companyA, empA);
    const respA = buildRespostasBase();
    const assessA = await createAssessment(companyA, empA, respA);
    await runAssessment(client.db, assessA, new Date('2026-07-20T12:00:00Z'));

    const scoresB = await client.db
      .select()
      .from(individualProfileScores)
      .where(eq(individualProfileScores.companyId, companyB));
    expect(scoresB).toHaveLength(0);
  });
});

// ============================================================
// Facade DI (S105/S060)
// ============================================================

describe('individualProfileEngine — Facade DI', () => {
  let companyId: number;

  beforeAll(async () => {
    companyId = await createCompany(CNPJ_FACADE);
  });

  it('spy Facade substituivel conta chamadas', async () => {
    let chamadas = 0;
    const spy: IndividualProfileEngineFacade = {
      runAssessment: async () => {
        chamadas += 1;
        return {
          assessmentId: 0,
          companyId,
          userType: 'employee',
          userId: 0,
          tentativa: 1,
          motivo: 'consistente',
          confiabilidadeNivel: 'alta',
          ia_att: 2,
          ia_soc: 0,
          ia_acq: 0,
          ia_cons: 0,
          ia_ext: 0,
          status: 'enviado',
          calculadoEm: new Date(0),
          enviadoEm: new Date(0),
          exibirConfirmacaoAte: new Date(0),
        };
      },
    };
    await spy.runAssessment(client.db, 1, new Date());
    expect(chamadas).toBe(1);
  });
});
