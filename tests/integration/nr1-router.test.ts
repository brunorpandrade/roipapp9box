// ROIP APP 9BOX — teste de integracao do sub-router `nr1` (ME-049cd).
//
// Exercita as 6 procedures canonicas entregues nesta ME (§11.17 /
// §19.8 do DOC 03): `configureCycle`, `editClosingDate`,
// `cancelCycle`, `closeCycle`, `getCycleDetails` e
// `getCollectionStatus`.
//
// Cobre tambem:
//   - Contratos publicos exportados (RV-13): mensagens canonicas
//     literais, schemas Zod, tipos e factory.
//   - Matriz canonica de autorizacao (S209 — DOC 02 §10.4, `/nr1`):
//     Bruno + RH + RH-Lider entram; C-level e Lider recebem FORBIDDEN.
//     `closeCycle` e super_admin exclusivo (S208/S216).
//   - Guard cross-company (§2.4).
//   - Pre-condicoes canonicas do §11.2 nas tres transicoes.
//   - Padrao canonico 100-500 (§2) em `editClosingDate`.
//   - Marca visual permanente de edicao (§11.3).
//
// Padrao S009/S204: uma company por describe, CNPJ da faixa
// 10000000000985..989. L32 cleanup em afterAll.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  alerts,
  cLevelMembers,
  companies,
  copsoqCycles,
  copsoqCycleSnapshot,
  copsoqFactorScores,
  copsoq_responses,
  employees,
  notifications,
  nr1AreaDivergenceAnalysis,
} from '../../src/db/schema';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
  type PlatformRole,
} from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';
import {
  CANCEL_CYCLE_INPUT_SCHEMA_NR1,
  CLOSE_CYCLE_INPUT_SCHEMA_NR1,
  CONFIGURE_CYCLE_INPUT_SCHEMA_NR1,
  createNr1Router,
  DATA_CIVIL_SCHEMA_NR1,
  DEFAULT_NR1_ENGINE,
  EDIT_CLOSING_DATE_INPUT_SCHEMA_NR1,
  GET_COLLECTION_STATUS_INPUT_SCHEMA_NR1,
  GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1,
  MSG_ABERTURA_NO_PASSADO_NR1,
  MSG_ADESAO_VERDE_NR1,
  MSG_ADESAO_VERMELHA_NR1,
  MSG_ANTECIPACAO_INVALIDA_NR1,
  MSG_AVISO_EMPRESA_PEQUENA_NR1,
  MSG_CANCELAMENTO_EXIGE_AGENDADO_NR1,
  MSG_CICLO_NAO_ENCONTRADO_NR1,
  MSG_COLISAO_CONFIGURACAO_NR1,
  MSG_EDICAO_EXIGE_CICLO_ABERTO_NR1,
  MSG_EMPRESA_FORA_DO_ESCOPO_NR1,
  MSG_JANELA_MINIMA_NR1,
  MSG_JUSTIFICATIVA_MAX_NR1,
  MSG_JUSTIFICATIVA_MIN_NR1,
  MSG_SEM_DEPARTAMENTO_CRITICO_NR1,
  msgColisaoEdicaoNr1,
} from '../../src/server/routers/nr1';
import { openScheduledNr1Cycles } from '../../src/server/services/nr1CalculationEngine';
import { createCallerFactory, createContextInner, type Context } from '../../src/server/trpc';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me049cd-nr1-router';

const FIXTURE_SUPER_ADMIN_ID = 1;
const HASH_NR1_ROUTER = 'hash-fixo-me049cd-nr1-router';

// Faixa CNPJ principal desta ME (S204): 985..989.
const CNPJ_CONFIG = '10000000000985';
const CNPJ_EDICAO = '10000000000986';
const CNPJ_CANCEL = '10000000000987';
const CNPJ_LEITURA = '10000000000988';
const CNPJ_AUTORIZACAO = '10000000000989';

const NOW_FIXO = new Date('2026-07-01T12:00:00.000Z');
const JUSTIFICATIVA_VALIDA = 'x'.repeat(120);

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(notifications)
      .where(inArray(notifications.companyId, createdCompanyIds));
    await client.db.delete(alerts).where(inArray(alerts.companyId, createdCompanyIds));
    await client.db
      .delete(nr1AreaDivergenceAnalysis)
      .where(inArray(nr1AreaDivergenceAnalysis.companyId, createdCompanyIds));
    await client.db
      .delete(copsoqFactorScores)
      .where(inArray(copsoqFactorScores.companyId, createdCompanyIds));
    await client.db
      .delete(copsoq_responses)
      .where(inArray(copsoq_responses.companyId, createdCompanyIds));
    await client.db
      .delete(copsoqCycleSnapshot)
      .where(inArray(copsoqCycleSnapshot.companyId, createdCompanyIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db
      .delete(cLevelMembers)
      .where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

// ============================================================
// Helpers de fixture
// ============================================================

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME049CD ROUTER ${cnpj} LTDA`,
      nomeFantasia: `ME049CD ROUTER ${cnpj}`,
      cnpj,
      telefone: '1633330049',
      endereco: `Rua ME-049cd R, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `prr-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rhr-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      timezone: 'UTC',
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49850000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number, opts: { isRH?: boolean } = {}): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `EmpR ${cpf}`,
      cpf,
      email: `empr-${cpf}@roip.local`,
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
      isRH: opts.isRH ?? false,
      passwordHash: HASH_NR1_ROUTER,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function createClevel(companyId: number): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(cLevelMembers)
    .values({
      companyId,
      name: `CLR ${cpf}`,
      cpf,
      email: `clrr-${cpf}@roip.local`,
      dataNascimento: new Date('1980-01-01'),
      dataAdmissao: new Date('2018-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO da companhia',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: true,
      status: 'ativo',
      passwordHash: HASH_NR1_ROUTER,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function tokenFor(role: PlatformRole, userId: number, companyId: number): Promise<string> {
  const credVersion = deriveCredentialVersion(HASH_NR1_ROUTER);
  return await signPlatformToken({ role, userId, companyId, credentialVersion: credVersion });
}

async function tokenSuperAdmin(): Promise<string> {
  const credVersion = deriveCredentialVersion('x' + 'fixture-test@roip.local');
  return await signSuperAdminToken({
    superAdminId: FIXTURE_SUPER_ADMIN_ID,
    credentialVersion: credVersion,
  });
}

function contextFor(bearerToken: string | null): Context {
  return createContextInner({
    db: client.db,
    rateLimiter: createRateLimiter(),
    bearerToken,
    ip: '127.0.0.1',
  });
}

function callerFor(
  bearerToken: string | null,
  deps: Parameters<typeof createNr1Router>[0] = { now: () => NOW_FIXO },
) {
  const factory = createCallerFactory(createNr1Router(deps));
  return factory(contextFor(bearerToken));
}

async function insertCiclo(
  companyId: number,
  opts: { dataAbertura: string; dataFechamento: string; status: 'agendado' | 'aberto' | 'fechado' },
): Promise<number> {
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo: opts.dataAbertura,
      dataAbertura: new Date(`${opts.dataAbertura}T00:00:00.000Z`),
      dataFechamento: new Date(`${opts.dataFechamento}T00:00:00.000Z`),
      status: opts.status,
    })
    .$returningId();
  return row!.id;
}

// ============================================================
// Contratos publicos exportados (RV-13)
// ============================================================

describe('nr1-router — contratos publicos (RV-13)', () => {
  it('exporta as mensagens canonicas literais do §11', () => {
    expect(MSG_EMPRESA_FORA_DO_ESCOPO_NR1).toBe('Empresa fora do escopo do titular.');
    expect(MSG_COLISAO_CONFIGURACAO_NR1).toBe(
      'Já existe um ciclo agendado ou aberto que colide com as datas escolhidas. ' +
        'Cancele-o ou escolha novas datas.',
    );
    expect(MSG_AVISO_EMPRESA_PEQUENA_NR1).toBe(
      'A empresa tem menos de 5 colaboradores ativos. O piso mínimo de amostra por escopo é 5, ' +
        'então este ciclo pode gerar apenas escopo empresa (se atingido) ou nenhum score válido. ' +
        'Continuar mesmo assim?',
    );
    expect(MSG_JUSTIFICATIVA_MIN_NR1).toBe('A justificativa deve ter no mínimo 100 caracteres.');
    expect(MSG_JUSTIFICATIVA_MAX_NR1).toBe('A justificativa deve ter no máximo 500 caracteres.');
    expect(MSG_SEM_DEPARTAMENTO_CRITICO_NR1).toBe(
      'Nenhum departamento em situação crítica neste ciclo.',
    );
  });

  it('compoe o template canonico de colisao na edicao (§11.2)', () => {
    expect(msgColisaoEdicaoNr1('2026-09-01', '2026-09-01')).toBe(
      'A nova data de fechamento entraria em conflito com o ciclo agendado para 2026-09-01. ' +
        'Cancele o ciclo agendado ou escolha uma data anterior a 2026-09-01.',
    );
  });

  it('valida os schemas Zod canonicos', () => {
    expect(DATA_CIVIL_SCHEMA_NR1.safeParse('2026-07-01').success).toBe(true);
    expect(DATA_CIVIL_SCHEMA_NR1.safeParse('01/07/2026').success).toBe(false);
    expect(
      CONFIGURE_CYCLE_INPUT_SCHEMA_NR1.safeParse({
        companyId: 1,
        dataAbertura: '2026-07-01',
        dataFechamento: '2026-08-31',
      }).success,
    ).toBe(true);
    expect(
      EDIT_CLOSING_DATE_INPUT_SCHEMA_NR1.safeParse({
        cicloDbId: 1,
        dataFechamento: '2026-08-31',
        justificativa: 'texto',
      }).success,
    ).toBe(true);
    expect(CANCEL_CYCLE_INPUT_SCHEMA_NR1.safeParse({ cicloDbId: 1 }).success).toBe(true);
    expect(CLOSE_CYCLE_INPUT_SCHEMA_NR1.safeParse({ cicloDbId: 1 }).success).toBe(true);
    expect(GET_COLLECTION_STATUS_INPUT_SCHEMA_NR1.safeParse({ cicloDbId: 1 }).success).toBe(true);
    expect(GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1.safeParse({ companyId: 1, fatorId: 9 }).success).toBe(
      false,
    );
    expect(GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1.safeParse({ companyId: 1, fatorId: 8 }).success).toBe(
      true,
    );
  });

  it('aponta o default do motor para a funcao real desta ME (S205)', () => {
    expect(typeof DEFAULT_NR1_ENGINE.closeNr1Cycle).toBe('function');
  });
});

// ============================================================
// configureCycle — §11.2 + §11.15
// ============================================================

describe('nr1.configureCycle — transicao null -> agendado (§11.2)', () => {
  it('agenda o ciclo, registra o executor e devolve o aviso do §11.15', async () => {
    const companyId = await createCompany(CNPJ_CONFIG);
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));

    const resultado = await caller.configureCycle({
      companyId,
      dataAbertura: '2026-07-05',
      dataFechamento: '2026-08-20',
    });

    expect(resultado.status).toBe('agendado');
    expect(resultado.ciclo).toBe('2026-07-05');
    expect(resultado.colaboradoresAtivos).toBe(1);
    // §11.15 — menos de 5 ativos AVISA, nao bloqueia.
    expect(resultado.aviso).toBe(MSG_AVISO_EMPRESA_PEQUENA_NR1);

    const [linha] = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, resultado.cicloDbId));
    expect(linha!.status).toBe('agendado');
    expect(linha!.configuradoPorEmployeeId).toBe(rh);
    expect(linha!.configuradoPorSuperAdminId).toBeNull();
  });

  it('rejeita abertura no passado, janela menor que 30 dias e colisao', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));

    await expect(
      caller.configureCycle({
        companyId,
        dataAbertura: '2026-06-30',
        dataFechamento: '2026-08-20',
      }),
    ).rejects.toThrow(MSG_ABERTURA_NO_PASSADO_NR1);

    await expect(
      caller.configureCycle({
        companyId,
        dataAbertura: '2026-10-01',
        dataFechamento: '2026-10-20',
      }),
    ).rejects.toThrow(MSG_JANELA_MINIMA_NR1);

    // O ciclo agendado do teste anterior fecha em 2026-08-20 — colide
    // com qualquer abertura anterior a essa data.
    await expect(
      caller.configureCycle({
        companyId,
        dataAbertura: '2026-08-01',
        dataFechamento: '2026-09-30',
      }),
    ).rejects.toThrow(MSG_COLISAO_CONFIGURACAO_NR1);
  });

  it('aceita Bruno e grava o executor no par polimorfico de super admin', async () => {
    const companyId = await createCompany(CNPJ_AUTORIZACAO);
    const caller = callerFor(await tokenSuperAdmin());
    const resultado = await caller.configureCycle({
      companyId,
      dataAbertura: '2026-07-02',
      dataFechamento: '2026-08-15',
    });
    const [linha] = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, resultado.cicloDbId));
    expect(linha!.configuradoPorSuperAdminId).toBe(FIXTURE_SUPER_ADMIN_ID);
    expect(linha!.configuradoPorEmployeeId).toBeNull();
  });
});

// ============================================================
// editClosingDate — §11.2 + §11.3 + §2
// ============================================================

describe('nr1.editClosingDate — edicao de data de fechamento (§11.2, §11.3)', () => {
  it('posterga, grava a data original e liga a marca permanente do §11.3', async () => {
    const companyId = await createCompany(CNPJ_EDICAO);
    const rh = await createEmployee(companyId, { isRH: true });
    const cicloDbId = await insertCiclo(companyId, {
      dataAbertura: '2026-06-01',
      dataFechamento: '2026-07-15',
      status: 'aberto',
    });
    const caller = callerFor(await tokenFor('rh_lider', rh, companyId));

    const resultado = await caller.editClosingDate({
      cicloDbId,
      dataFechamento: '2026-08-30',
      justificativa: JUSTIFICATIVA_VALIDA,
    });

    expect(resultado.dataFechamento).toBe('2026-08-30');
    expect(resultado.dataFechamentoOriginal).toBe('2026-07-15');
    expect(resultado.marcaEdicaoPermanente).toBe(true);

    const [linha] = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, cicloDbId));
    expect(linha!.ultimaEdicaoPorEmployeeId).toBe(rh);
    expect(linha!.ultimaEdicaoJustificativa).toBe(JUSTIFICATIVA_VALIDA);

    // Segunda edicao preserva a data ORIGINAL da primeira.
    const segunda = await caller.editClosingDate({
      cicloDbId,
      dataFechamento: '2026-09-30',
      justificativa: JUSTIFICATIVA_VALIDA,
    });
    expect(segunda.dataFechamentoOriginal).toBe('2026-07-15');
  });

  it('aplica o padrao canonico 100-500 (§2) com HTTP 422 canonico', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));
    const cicloDbId = await insertCiclo(companyId, {
      dataAbertura: '2026-06-02',
      dataFechamento: '2026-07-20',
      status: 'aberto',
    });

    await expect(
      caller.editClosingDate({ cicloDbId, dataFechamento: '2026-09-01', justificativa: 'curta' }),
    ).rejects.toThrow(MSG_JUSTIFICATIVA_MIN_NR1);

    await expect(
      caller.editClosingDate({
        cicloDbId,
        dataFechamento: '2026-09-01',
        justificativa: 'y'.repeat(501),
      }),
    ).rejects.toThrow(MSG_JUSTIFICATIVA_MAX_NR1);
  });

  it('rejeita antecipacao que viola a janela minima e ciclo fora de aberto', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));

    const aberto = await insertCiclo(companyId, {
      dataAbertura: '2026-06-10',
      dataFechamento: '2026-09-10',
      status: 'aberto',
    });
    // 2026-06-20 esta a menos de 30 dias da abertura.
    await expect(
      caller.editClosingDate({
        cicloDbId: aberto,
        dataFechamento: '2026-06-20',
        justificativa: JUSTIFICATIVA_VALIDA,
      }),
    ).rejects.toThrow(MSG_ANTECIPACAO_INVALIDA_NR1);

    const fechado = await insertCiclo(companyId, {
      dataAbertura: '2026-01-01',
      dataFechamento: '2026-03-01',
      status: 'fechado',
    });
    await expect(
      caller.editClosingDate({
        cicloDbId: fechado,
        dataFechamento: '2026-09-01',
        justificativa: JUSTIFICATIVA_VALIDA,
      }),
    ).rejects.toThrow(MSG_EDICAO_EXIGE_CICLO_ABERTO_NR1);
  });

  it('bloqueia colisao com ciclo agendado posterior (§11.2)', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));

    const aberto = await insertCiclo(companyId, {
      dataAbertura: '2026-06-15',
      dataFechamento: '2026-08-01',
      status: 'aberto',
    });
    await insertCiclo(companyId, {
      dataAbertura: '2026-09-01',
      dataFechamento: '2026-10-15',
      status: 'agendado',
    });

    await expect(
      caller.editClosingDate({
        cicloDbId: aberto,
        dataFechamento: '2026-09-20',
        justificativa: JUSTIFICATIVA_VALIDA,
      }),
    ).rejects.toThrow(msgColisaoEdicaoNr1('2026-09-01', '2026-09-01'));
  });
});

// ============================================================
// cancelCycle — §11.2
// ============================================================

describe('nr1.cancelCycle — cancelamento de ciclo agendado (§11.2)', () => {
  it('remove o ciclo agendado e recusa ciclo aberto', async () => {
    const companyId = await createCompany(CNPJ_CANCEL);
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));

    const agendado = await insertCiclo(companyId, {
      dataAbertura: '2026-09-01',
      dataFechamento: '2026-10-15',
      status: 'agendado',
    });
    const resultado = await caller.cancelCycle({ cicloDbId: agendado });
    expect(resultado.cancelado).toBe(true);
    const restantes = await client.db
      .select()
      .from(copsoqCycles)
      .where(eq(copsoqCycles.id, agendado));
    expect(restantes).toHaveLength(0);

    const aberto = await insertCiclo(companyId, {
      dataAbertura: '2026-06-01',
      dataFechamento: '2026-07-20',
      status: 'aberto',
    });
    await expect(caller.cancelCycle({ cicloDbId: aberto })).rejects.toThrow(
      MSG_CANCELAMENTO_EXIGE_AGENDADO_NR1,
    );
  });

  it('devolve NOT_FOUND canonico para ciclo inexistente', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));
    await expect(caller.cancelCycle({ cicloDbId: 999999999 })).rejects.toThrow(
      MSG_CICLO_NAO_ENCONTRADO_NR1,
    );
  });
});

// ============================================================
// closeCycle — §11.17 (interna, S208/S216)
// ============================================================

describe('nr1.closeCycle — proc interna exposta como super_admin (S208/S216)', () => {
  it('delega ao motor injetado com o relogio do router', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const chamadas: Array<{ cicloDbId: number; now: Date }> = [];
    const caller = callerFor(await tokenSuperAdmin(), {
      now: () => NOW_FIXO,
      nr1Engine: {
        closeNr1Cycle: async (_db, cicloDbId, now) => {
          chamadas.push({ cicloDbId, now });
          return {
            cicloDbId,
            companyId,
            fechado: true,
            elegiveis: 0,
            respondentesEfetivos: 0,
            adesaoPercentual: 0,
            escoposCalculados: 0,
            scoresGravados: 0,
            divergenciasGravadas: 0,
            alertasGravados: 0,
            notificacoesGravadas: 0,
            departamentoCriticoDepartamentoId: null,
            departamentosAmostraInsuficiente: [],
          };
        },
      },
    });

    const resultado = await caller.closeCycle({ cicloDbId: 4242 });
    expect(resultado.fechado).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.cicloDbId).toBe(4242);
    expect(chamadas[0]!.now).toEqual(NOW_FIXO);
  });

  it('recusa RH, RH-Lider, C-level e Lider (super_admin exclusivo)', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const lider = await createEmployee(companyId);
    const clevel = await createClevel(companyId);

    for (const [role, userId] of [
      ['rh', rh],
      ['rh_lider', rh],
      ['lider', lider],
      ['clevel', clevel],
    ] as const) {
      const caller = callerFor(await tokenFor(role, userId, companyId));
      await expect(caller.closeCycle({ cicloDbId: 1 })).rejects.toThrow(
        'Perfil sem permissao para a rota.',
      );
    }
  });
});

// ============================================================
// getCycleDetails e getCollectionStatus — §11.17, §11.16
// ============================================================

describe('nr1.getCycleDetails e getCollectionStatus — leitura consolidada', () => {
  it('devolve payload vazio canonico quando a empresa nao tem ciclo', async () => {
    const companyId = await createCompany(CNPJ_LEITURA);
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));

    const resultado = await caller.getCycleDetails({ companyId });
    expect(resultado.presente).toBe(false);
    expect(resultado.cicloDbId).toBeNull();
    expect(resultado.escopos).toHaveLength(0);
    expect(resultado.mensagemDepartamentoCritico).toBe(MSG_SEM_DEPARTAMENTO_CRITICO_NR1);
    expect(resultado.textoAdesao).toBe(MSG_ADESAO_VERMELHA_NR1);
  });

  it('consolida ciclo, adesao, faixa canonica e destaque de fator', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const respondentes: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      respondentes.push(await createEmployee(companyId));
    }

    const cicloDbId = await insertCiclo(companyId, {
      dataAbertura: '2026-06-01',
      dataFechamento: '2026-07-20',
      status: 'aberto',
    });
    for (const employeeId of [rh, ...respondentes]) {
      await client.db.insert(copsoqCycleSnapshot).values({
        cicloDbId,
        companyId,
        employeeId,
        departamentoId: 1,
        snapshotEm: NOW_FIXO,
        respondeu: employeeId !== rh,
        respondidoEm: employeeId === rh ? null : NOW_FIXO,
      });
    }

    const caller = callerFor(await tokenFor('rh', rh, companyId));
    const detalhes = await caller.getCycleDetails({ companyId, cicloDbId, fatorId: 5 });

    expect(detalhes.presente).toBe(true);
    expect(detalhes.cicloDbId).toBe(cicloDbId);
    expect(detalhes.status).toBe('aberto');
    expect(detalhes.dataAbertura).toBe('2026-06-01');
    expect(detalhes.dataFechamento).toBe('2026-07-20');
    expect(detalhes.marcaEdicaoPermanente).toBe(false);
    expect(detalhes.elegiveis).toBe(5);
    expect(detalhes.respondentesEfetivos).toBe(4);
    expect(detalhes.adesaoPercentual).toBe(80);
    expect(detalhes.faixaAdesao).toBe('verde');
    expect(detalhes.textoAdesao).toBe(MSG_ADESAO_VERDE_NR1);
    expect(detalhes.fatorDestacado).toBe(5);
    expect(detalhes.pisoAmostra).toBe(5);

    const coleta = await caller.getCollectionStatus({ cicloDbId });
    expect(coleta.totalElegiveis).toBe(5);
    expect(coleta.totalRespondidos).toBe(4);
    expect(coleta.totalRespondentesEfetivos).toBe(4);
    expect(coleta.totalPendentes).toBe(1);
    expect(coleta.adesaoPercentual).toBe(80);
    // §11.16 (PC1d) — satisfeita por vacuidade sob S239.
    expect(coleta.clevelsOmitidosDaListagem).toBe(0);
    expect(coleta.linhas).toHaveLength(5);
    expect(coleta.linhas.filter((l) => l.respondeu)).toHaveLength(4);
  });

  it('bloqueia C-level e Lider e aplica o guard cross-company (§2.4)', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const lider = await createEmployee(companyId);
    const clevel = await createClevel(companyId);

    for (const [role, userId] of [
      ['lider', lider],
      ['clevel', clevel],
    ] as const) {
      const caller = callerFor(await tokenFor(role, userId, companyId));
      await expect(caller.getCycleDetails({ companyId })).rejects.toThrow(
        'Perfil sem permissao para a rota.',
      );
    }

    const outraEmpresa = await createCompany('10000000000990');
    const rh = await createEmployee(companyId, { isRH: true });
    const caller = callerFor(await tokenFor('rh', rh, companyId));
    await expect(caller.getCycleDetails({ companyId: outraEmpresa })).rejects.toThrow(
      MSG_EMPRESA_FORA_DO_ESCOPO_NR1,
    );
  });
});

// ============================================================
// Integracao motor + router (RV-13: chamador real do openScheduled)
// ============================================================

describe('nr1 — abertura por servico e leitura pelo router', () => {
  it('abre o ciclo pelo motor (S237) e o router passa a enxergar o snapshot', async () => {
    const companyId = createdCompanyIds[createdCompanyIds.length - 1]!;
    const rh = await createEmployee(companyId, { isRH: true });
    const cicloDbId = await insertCiclo(companyId, {
      dataAbertura: '2026-07-01',
      dataFechamento: '2026-08-20',
      status: 'agendado',
    });

    await openScheduledNr1Cycles(client.db, NOW_FIXO);

    const caller = callerFor(await tokenFor('rh', rh, companyId));
    const coleta = await caller.getCollectionStatus({ cicloDbId });
    expect(coleta.status).toBe('aberto');
    expect(coleta.totalElegiveis).toBeGreaterThan(0);
    expect(coleta.totalRespondidos).toBe(0);
  });
});
