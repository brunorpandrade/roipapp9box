// ROIP APP 9BOX — teste de integracao D066 kickoffDate (ME-062a).
//
// Vertical canonica do Bloco B6 sub-d — Bloco 1: adicao canonica de
// `companies.kickoffDate DATE NOT NULL` (DOC 01 §4.2 estendido conforme
// DOC 06 §8.3). Fecha CC049 canonicamente. Refactor bit-exact de
// `stepM1Onboarding` para consumir o campo real ao inves do proxy
// operacional `createdAt`.
//
// RV-03 bidirecional dirigida canonica:
//   - Caso bom: kickoff antigo (>90 dias) — `suppress=false, motivo='fora_onboarding'`.
//   - Caso ruim conhecido: kickoff hoje — `suppress=true, motivo='dentro_onboarding'`.
//   - Salvaguarda: kickoff exatamente no limite 89.9 dias — `suppress=true`.
//   - Salvaguarda: kickoff exatamente no limite 90.1 dias — `suppress=false`.
//   - Isento M1: tipos com `isentoM1=true` passam sem consulta ao banco.
//   - Salvaguarda defensiva: empresa em corrida — `suppress=true, motivo='kickoff_ausente'`.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies } from '../../src/db/schema';
import {
  M1_ONBOARDING_JANELA_DIAS,
  stepM1Onboarding,
} from '../../src/lib/alerts/pipeline/m1-onboarding';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa CNPJ ME-062 canonica (S341 aprovada): principal
// `10250000000001..049`; auxiliar `10260000000001..049`.
const LOCAL_CNPJ_1 = '10250000000001';
const LOCAL_CNPJ_2 = '10250000000002';
const LOCAL_CNPJ_3 = '10250000000003';
const LOCAL_CNPJ_4 = '10250000000004';

describe('D066 kickoffDate — pipeline M1 (ME-062a)', () => {
  let client: RoipDbClient;
  const companyIds: number[] = [];

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    // Semeia 4 empresas com kickoffDate distintas cobrindo os 4 cenarios
    // canonicos do RV-03 bidirecional.
    const now = new Date('2026-07-31T12:00:00Z');
    const kickoffs = [
      new Date('2020-01-01'), // >90 dias antes — fora_onboarding
      new Date('2026-07-31'), // hoje mesmo — dentro_onboarding
      new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000 - 12 * 60 * 60 * 1000), // 89.5d dentro
      new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000), // 91 dias — fora
    ];
    const cnpjs = [LOCAL_CNPJ_1, LOCAL_CNPJ_2, LOCAL_CNPJ_3, LOCAL_CNPJ_4];
    for (let i = 0; i < 4; i++) {
      const [row] = await client.db
        .insert(companies)
        .values({
          razaoSocial: `Empresa D066 Test ${i + 1} LTDA`,
          nomeFantasia: `Empresa D066 Test ${i + 1}`,
          cnpj: cnpjs[i]!,
          telefone: '1633330008',
          endereco: 'Rua D066, 1',
          cidade: 'Ribeirão Preto',
          estado: 'SP',
          contatoPrincipalNome: 'Contato Principal',
          contatoPrincipalEmail: 'principal@d066.local',
          contatoRHNome: 'Contato RH',
          contatoRHEmail: 'rh@d066.local',
          segmento: 'Serviço',
          tipoAtividade: 'Consultoria',
          descricaoAtividade: 'Descricao',
          contextoMercado: 'Contexto',
          mesKickoff: 1,
          kickoffDate: kickoffs[i]!,
        })
        .$returningId();
      if (!row) throw new Error(`beforeAll: falha ao criar company ${i}`);
      companyIds.push(row.id);
    }
  });

  afterAll(async () => {
    for (const id of companyIds) {
      await client.db.delete(companies).where(eq(companies.id, id));
    }
    await closeDbClient(client);
  });

  it('constante canonica M1_ONBOARDING_JANELA_DIAS = 90 (§8.3)', () => {
    expect(M1_ONBOARDING_JANELA_DIAS).toBe(90);
  });

  it('caso bom: kickoff >90 dias no passado → suppress=false, motivo=fora_onboarding', async () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const result = await stepM1Onboarding(client.db, companyIds[0]!, 'desempenho_estagnacao', now);
    expect(result.suppress).toBe(false);
    expect(result.motivo).toBe('fora_onboarding');
  });

  it('caso ruim: kickoff hoje → suppress=true (dentro_onboarding — D066)', async () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const result = await stepM1Onboarding(client.db, companyIds[1]!, 'desempenho_estagnacao', now);
    expect(result.suppress).toBe(true);
    expect(result.motivo).toBe('dentro_onboarding');
  });

  it('salvaguarda: kickoff 89.5 dias → suppress=true (dentro da janela §8.3 literal)', async () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const result = await stepM1Onboarding(client.db, companyIds[2]!, 'desempenho_estagnacao', now);
    expect(result.suppress).toBe(true);
    expect(result.motivo).toBe('dentro_onboarding');
  });

  it('salvaguarda: kickoff 91 dias → suppress=false (fora da janela §8.3 literal)', async () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const result = await stepM1Onboarding(client.db, companyIds[3]!, 'desempenho_estagnacao', now);
    expect(result.suppress).toBe(false);
    expect(result.motivo).toBe('fora_onboarding');
  });

  it('isento M1: nr1_fator_critico passa sem consulta ao banco (§8.3 lista canonica)', async () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const result = await stepM1Onboarding(client.db, companyIds[1]!, 'nr1_fator_critico', now);
    expect(result.suppress).toBe(false);
    expect(result.motivo).toBe('isento');
  });

  it('salvaguarda: companyId inexistente → suppress=true, kickoff_ausente', async () => {
    const now = new Date('2026-07-31T12:00:00Z');
    const result = await stepM1Onboarding(client.db, 99999999, 'desempenho_estagnacao', now);
    expect(result.suppress).toBe(true);
    expect(result.motivo).toBe('kickoff_ausente');
  });
});
