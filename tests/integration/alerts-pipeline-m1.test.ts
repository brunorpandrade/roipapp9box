// ROIP APP 9BOX — teste integracao stepM1Onboarding (ME-059).
// Cobre §8.3 sob CC049: proxy `companies.createdAt` para kickoffDate
// canonico. Empresa recem-criada dentro da janela 90d suprime alertas
// nao-isentos. Empresa criada ha mais de 90d libera. Tipos isentos
// passam sem consulta.

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

async function criaEmpresa(client: RoipDbClient, cnpj: string, createdAt: Date): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `Empresa ${cnpj}`,
      nomeFantasia: `Empresa ${cnpj}`,
      cnpj,
      telefone: '1633330000',
      endereco: 'Rua M1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `contato-${cnpj}@m1.local`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@m1.local`,
      segmento: 'Serviço',
      tipoAtividade: 'x',
      descricaoAtividade: 'x',
      contextoMercado: 'x',
      mesKickoff: 1,
      createdAt,
    })
    .$returningId();
  if (!row) throw new Error(`falha ao criar empresa ${cnpj}`);
  return row.id;
}

describe('stepM1Onboarding — §8.3 sob CC049 (proxy createdAt)', () => {
  let client: RoipDbClient;
  let empresaNova: number;
  let empresaVelha: number;

  const AGORA = new Date('2026-06-01T12:00:00Z');
  const CREATED_HOJE = new Date('2026-05-30T00:00:00Z'); // 2 dias
  const CREATED_100_DIAS = new Date('2026-02-21T00:00:00Z'); // ~100 dias antes

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    empresaNova = await criaEmpresa(client, '10190000000002', CREATED_HOJE);
    empresaVelha = await criaEmpresa(client, '10190000000003', CREATED_100_DIAS);
  });

  afterAll(async () => {
    await client.db.delete(companies).where(eq(companies.id, empresaNova));
    await client.db.delete(companies).where(eq(companies.id, empresaVelha));
    await closeDbClient(client);
  });

  it('M1_ONBOARDING_JANELA_DIAS constante canonica = 90', () => {
    expect(M1_ONBOARDING_JANELA_DIAS).toBe(90);
  });

  describe('empresa dentro da janela 90d (createdAt=2d atras)', () => {
    it('desempenho_queda_brusca (nao isento) → suprime', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'desempenho_queda_brusca', AGORA);
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('dentro_onboarding');
    });

    it('assiduidade_baixa (nao isento) → suprime', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'assiduidade_baixa', AGORA);
      expect(res.suppress).toBe(true);
    });

    it('divergencia_a_c (nao isento) → suprime', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'divergencia_a_c', AGORA);
      expect(res.suppress).toBe(true);
    });

    it('nr1_fator_critico (isento Y4) → passa mesmo dentro da janela', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'nr1_fator_critico', AGORA);
      expect(res.suppress).toBe(false);
      expect(res.motivo).toBe('isento');
    });

    it('nr1_ciclo_fechado (isento) → passa', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'nr1_ciclo_fechado', AGORA);
      expect(res.suppress).toBe(false);
    });

    it('ciclo_instrumento_encerrado (isento §8.3) → passa', async () => {
      const res = await stepM1Onboarding(
        client.db,
        empresaNova,
        'ciclo_instrumento_encerrado',
        AGORA,
      );
      expect(res.suppress).toBe(false);
    });

    it('ciclo_mensal_fechado (isento §8.3) → passa', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'ciclo_mensal_fechado', AGORA);
      expect(res.suppress).toBe(false);
    });

    it('desbloqueio_solicitado (isento §8.3) → passa', async () => {
      const res = await stepM1Onboarding(client.db, empresaNova, 'desbloqueio_solicitado', AGORA);
      expect(res.suppress).toBe(false);
    });

    it('fechamento_bloqueado_sem_resp_financeiro (isento D049 §8.3) → passa', async () => {
      const res = await stepM1Onboarding(
        client.db,
        empresaNova,
        'fechamento_bloqueado_sem_resp_financeiro',
        AGORA,
      );
      expect(res.suppress).toBe(false);
    });

    it('responsavel_financeiro_nomeado (isento D050 §8.3) → passa', async () => {
      const res = await stepM1Onboarding(
        client.db,
        empresaNova,
        'responsavel_financeiro_nomeado',
        AGORA,
      );
      expect(res.suppress).toBe(false);
    });
  });

  describe('empresa fora da janela 90d (createdAt=100d atras)', () => {
    it('desempenho_queda_brusca → passa (motivo=fora_onboarding)', async () => {
      const res = await stepM1Onboarding(client.db, empresaVelha, 'desempenho_queda_brusca', AGORA);
      expect(res.suppress).toBe(false);
      expect(res.motivo).toBe('fora_onboarding');
    });

    it('todos os 8 tipos NAO-isentos passam quando fora da janela', async () => {
      const naoIsentos = [
        'desempenho_queda_brusca',
        'desempenho_estagnacao',
        'desempenho_queda_isolada',
        'assiduidade_baixa',
        'divergencia_a_c',
        'perfil_inconsistente_primeira',
        'perfil_retest_consistente',
        'perfil_retest_reincidente',
      ] as const;
      for (const tipo of naoIsentos) {
        const res = await stepM1Onboarding(client.db, empresaVelha, tipo, AGORA);
        expect(res.suppress).toBe(false);
      }
    });
  });

  describe('empresa inexistente', () => {
    it('devolve suppress=true motivo=kickoff_ausente (salvaguarda defensiva)', async () => {
      const res = await stepM1Onboarding(
        client.db,
        999999999, // id inexistente
        'desempenho_queda_brusca',
        AGORA,
      );
      expect(res.suppress).toBe(true);
      expect(res.motivo).toBe('kickoff_ausente');
    });
  });
});
