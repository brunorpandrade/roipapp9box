// ROIP APP 9BOX — teste de integracao `buildFamilyLabelsForCompany`
// (ME-1.17.c, Conversa 5 — migracao de 7 callsites de leitura para o
// resolver canonico com nomeCustomizado da empresa).
//
// Cobre canonicamente bit-exact o helper
// `buildFamilyLabelsForCompany(db, companyId)` que:
//   1. Carrega todas as settings da empresa via
//      `listAllFamilySettingsForCompany`.
//   2. Resolve cada uma das 26 chaves de `JOB_FAMILY_VALUES` via
//      `getJobFamilyLabel(key, setting)` — prioriza
//      `nomeCustomizado` quando preenchido.
//   3. Retorna `Readonly<Record<JobFamily, string>>` serializavel.
//
// Tres cenarios canonicos (RV-03 — regua provada nos dois sentidos):
//   1. Empresa sem settings (zero linhas em
//      `companyRoleFamilySettings`) → todas as 26 chaves caem no
//      label canonico `JOB_FAMILY_LABELS[key]`.
//   2. Empresa com 6 canonicas seedadas sem customizacao
//      (`nomeCustomizado=NULL`) → labels canonicos pt-BR das 6 +
//      placeholders dos 20 slots custom.
//   3. Empresa com uma canonica renomeada (`nomeCustomizado='Hunter
//      B2B'`) + um slot custom ativado (`custom1` nomeado
//      'Projetista') → prioriza `nomeCustomizado` nessas 2 chaves,
//      canonicos nas demais.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  companyRoleFamilySettings,
  JOB_FAMILY_CANONICAL_VALUES,
} from '../../src/db/schema';
import {
  activateCustomSlot,
  seedCanonicalFamilySettingsForCompany,
  updateFamilySettings,
} from '../../src/server/services/companyRoleFamilySettings';
import { buildFamilyLabelsForCompany } from '../../src/lib/job-family/buildFamilyLabelsForCompany';
import { JOB_FAMILY_LABELS } from '../../src/lib/job-family/formatJobFamily';
import { eq } from 'drizzle-orm';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '55555555000166';
const FIXTURE_SUPER_ADMIN_ID = 1;

describe('buildFamilyLabelsForCompany (ME-1.17.c)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa 1.17.c LTDA',
        nomeFantasia: 'Empresa 1.17.c',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330003',
        endereco: 'Rua 1.17.c, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@1.17.c.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@1.17.c.local',
        segmento: 'Comércio',
        tipoAtividade: 'Comercio de bens',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 4,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!row) {
      throw new Error('setup 1.17.c: insert company retornou sem id');
    }
    companyId = row.id;
  });

  afterAll(async () => {
    await client.db
      .delete(companyRoleFamilySettings)
      .where(eq(companyRoleFamilySettings.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db
      .delete(companyRoleFamilySettings)
      .where(eq(companyRoleFamilySettings.companyId, companyId));
  });

  it('empresa SEM settings — todas 26 chaves caem no label canonico', async () => {
    const labels = await buildFamilyLabelsForCompany(client.db, companyId);
    for (const canonicaKey of JOB_FAMILY_CANONICAL_VALUES) {
      expect(labels[canonicaKey]).toBe(JOB_FAMILY_LABELS[canonicaKey]);
    }
    expect(labels.custom1).toBe(JOB_FAMILY_LABELS.custom1);
    expect(labels.custom20).toBe(JOB_FAMILY_LABELS.custom20);
  });

  it('seed canonico (nomeCustomizado=NULL) — 6 pt-BR + 20 placeholders', async () => {
    await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
    const labels = await buildFamilyLabelsForCompany(client.db, companyId);
    expect(labels.vendas_comercial).toBe('Vendas e comercial');
    expect(labels.producao_operacoes).toBe('Produção e operações');
    expect(labels.tecnico_especialista).toBe('Técnico especialista');
    expect(labels.administrativo_suporte).toBe('Administrativo e suporte');
    expect(labels.atendimento_relacionamento).toBe('Atendimento e relacionamento');
    expect(labels.lideranca_gestao).toBe('Liderança e gestão');
    expect(labels.custom1).toBe('Família customizada 1');
    expect(labels.custom10).toBe('Família customizada 10');
  });

  it('canonica renomeada + slot custom ativado — prioriza nomeCustomizado', async () => {
    await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
    await updateFamilySettings(
      client.db,
      companyId,
      'vendas_comercial',
      { nomeCustomizado: 'Hunter B2B' },
      FIXTURE_SUPER_ADMIN_ID,
    );
    const chosenCustom = await activateCustomSlot(
      client.db,
      companyId,
      'Projetista',
      FIXTURE_SUPER_ADMIN_ID,
    );
    const labels = await buildFamilyLabelsForCompany(client.db, companyId);
    expect(labels.vendas_comercial).toBe('Hunter B2B');
    expect(labels[chosenCustom]).toBe('Projetista');
    expect(labels.producao_operacoes).toBe('Produção e operações');
    expect(labels.lideranca_gestao).toBe('Liderança e gestão');
  });
});
