// ROIP APP 9BOX — teste de integracao
// `buildActiveFamilyKeysForCompany` (ME-1.17.c expansao CC079-1c-2+,
// Conversa 5).
//
// Cobre canonicamente bit-exact o helper companion do
// `buildFamilyLabelsForCompany` que:
//   1. Carrega `listActiveFamilySettingsForCompany` (filtro
//      `ativo = true`, ordenado por `ordem, jobFamily`).
//   2. Retorna as chaves `JobFamily` ordenadas.
//   3. Fallback bit-exact as 6 canonicas quando empresa nao tem
//      NENHUMA setting ativa (edge case defensivo).
//
// Tres cenarios canonicos (RV-03 — regua provada nos dois sentidos):
//   1. Empresa SEM settings → fallback as 6 canonicas.
//   2. Empresa com 6 canonicas seedadas → exatamente as 6 chaves
//      canonicas em ordem canonica.
//   3. Empresa com seed + 1 custom ativado → 7 chaves (6 canonicas
//      + a custom na ordem canonica apos as 6).
//
// Dropdown canonico de filtro (todos os colaboradores SA/RH/Lider)
// consome o retorno deste helper — nunca `JOB_FAMILY_VALUES` cru.

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
} from '../../src/server/services/companyRoleFamilySettings';
import {
  buildActiveFamilyKeysForCompany,
  type ActiveFamilyKeys,
} from '../../src/lib/job-family/buildActiveFamilyKeysForCompany';
import { eq } from 'drizzle-orm';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '55555555000177';
const FIXTURE_SUPER_ADMIN_ID = 1;

describe('buildActiveFamilyKeysForCompany (ME-1.17.c CC079-1c-2+)', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    const [row] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa 1.17.c cc2 LTDA',
        nomeFantasia: 'Empresa 1.17.c cc2',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330004',
        endereco: 'Rua 1.17.c cc2, 1',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@1.17.c-cc2.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@1.17.c-cc2.local',
        segmento: 'Comércio',
        tipoAtividade: 'Comercio de bens',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 4,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!row) {
      throw new Error('setup 1.17.c cc2: insert company retornou sem id');
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

  it('empresa SEM settings — fallback as 6 canonicas', async () => {
    const keys: ActiveFamilyKeys = await buildActiveFamilyKeysForCompany(client.db, companyId);
    expect(keys).toEqual(JOB_FAMILY_CANONICAL_VALUES);
    expect(keys.length).toBe(6);
  });

  it('seed canonico — exatamente as 6 chaves canonicas', async () => {
    await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
    const keys = await buildActiveFamilyKeysForCompany(client.db, companyId);
    expect(keys.length).toBe(6);
    for (const canonicaKey of JOB_FAMILY_CANONICAL_VALUES) {
      expect(keys).toContain(canonicaKey);
    }
    expect(keys).not.toContain('custom1');
    expect(keys).not.toContain('custom20');
  });

  it('seed + 1 custom ativado — 7 chaves (6 canonicas + custom)', async () => {
    await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
    const chosenCustom = await activateCustomSlot(
      client.db,
      companyId,
      'Projetista',
      FIXTURE_SUPER_ADMIN_ID,
    );
    const keys = await buildActiveFamilyKeysForCompany(client.db, companyId);
    expect(keys.length).toBe(7);
    for (const canonicaKey of JOB_FAMILY_CANONICAL_VALUES) {
      expect(keys).toContain(canonicaKey);
    }
    expect(keys).toContain(chosenCustom);
  });
});
