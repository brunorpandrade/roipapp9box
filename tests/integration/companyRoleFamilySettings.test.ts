// ROIP APP 9BOX — teste de integracao `companyRoleFamilySettings`
// (ME-1.17, Conversa 5 — Famílias de função 100% customizáveis).
//
// Roda contra a base efemera `roip_test`. Cada caso limpa
// `companyRoleFamilySettings`, `companyJobFamilies` e `companies`
// antes de executar (dependencias diretas). O `superAdmins.id = 1`
// foi semeado no globalSetup.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  companyJobFamilies,
  companyRoleFamilySettings,
  JOB_FAMILY_CANONICAL_VALUES,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { listJobFamiliesForCompany } from '../../src/server/services/companyJobFamilies';
import {
  FAMILY_SETTINGS_ERROR_CODES,
  FamilySettingsError,
  activateCustomSlot,
  deactivateCustomSlot,
  getFamilySettings,
  isSettingActive,
  listActiveFamilySettingsForCompany,
  listAllFamilySettingsForCompany,
  seedCanonicalFamilySettingsForCompany,
  updateFamilySettings,
} from '../../src/server/services/companyRoleFamilySettings';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const FIXTURE_SUPER_ADMIN_ID = 1;

async function seedCompany(client: RoipDbClient): Promise<number> {
  return await createCompany(client.db, {
    razaoSocial: 'CRFS Empresa LTDA',
    nomeFantasia: 'CRFS Empresa',
    cnpj: '44444444000144',
    telefone: '1633330000',
    endereco: 'Av. Famílias, 1',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Contato Principal',
    contatoPrincipalEmail: 'principal@crfs.test',
    contatoRHNome: 'Contato RH',
    contatoRHEmail: 'rh@crfs.test',
    segmento: 'Comércio',
    tipoAtividade: 'Comercio de bens',
    descricaoAtividade: 'Descricao',
    contextoMercado: 'Contexto',
    mesKickoff: 4,
    kickoffDate: new Date('2020-01-01'),
  });
}

describe('service companyRoleFamilySettings (ME-1.17)', () => {
  let client: RoipDbClient;

  beforeAll(() => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(companyRoleFamilySettings);
    await client.db.delete(companyJobFamilies);
    await client.db.delete(companies);
  });

  describe('seedCanonicalFamilySettingsForCompany', () => {
    it('insere as 6 canonicas na primeira execucao', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const all = await listAllFamilySettingsForCompany(client.db, companyId);
      expect(all).toHaveLength(6);
      const familias = all.map((r) => r.jobFamily).sort();
      const canonicas = [...JOB_FAMILY_CANONICAL_VALUES].sort();
      expect(familias).toEqual(canonicas);
      for (const row of all) {
        expect(row.ativo).toBe(true);
        expect(row.nomeCustomizado).toBeNull();
        expect(row.ordem).toBeGreaterThanOrEqual(1);
        expect(row.ordem).toBeLessThanOrEqual(6);
      }
    });

    it('e idempotente: segunda execucao mantem as 6 linhas', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const all = await listAllFamilySettingsForCompany(client.db, companyId);
      expect(all).toHaveLength(6);
    });

    it('ordem canonica das 6 canonicas e 1..6 na ordem de JOB_FAMILY_CANONICAL', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const all = await listAllFamilySettingsForCompany(client.db, companyId);
      const sorted = [...all].sort((a, b) => a.ordem - b.ordem);
      const observed = sorted.map((r) => ({ jobFamily: r.jobFamily, ordem: r.ordem }));
      const expected = JOB_FAMILY_CANONICAL_VALUES.map((k, i) => ({
        jobFamily: k,
        ordem: i + 1,
      }));
      expect(observed).toEqual(expected);
    });
  });

  describe('listActiveFamilySettingsForCompany', () => {
    it('retorna apenas settings com ativo=TRUE', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await updateFamilySettings(
        client.db,
        companyId,
        'vendas_comercial',
        { ativo: false },
        FIXTURE_SUPER_ADMIN_ID,
      );
      const ativos = await listActiveFamilySettingsForCompany(client.db, companyId);
      expect(ativos).toHaveLength(5);
      expect(ativos.map((r) => r.jobFamily)).not.toContain('vendas_comercial');
    });
  });

  describe('updateFamilySettings — trava canonica de lideranca_gestao', () => {
    it('rejeita desativar lideranca_gestao com LOCKED_STRUCTURAL', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await expect(
        updateFamilySettings(
          client.db,
          companyId,
          'lideranca_gestao',
          { ativo: false },
          FIXTURE_SUPER_ADMIN_ID,
        ),
      ).rejects.toThrow(FamilySettingsError);
      try {
        await updateFamilySettings(
          client.db,
          companyId,
          'lideranca_gestao',
          { ativo: false },
          FIXTURE_SUPER_ADMIN_ID,
        );
      } catch (err) {
        expect(err).toBeInstanceOf(FamilySettingsError);
        expect((err as FamilySettingsError).code).toBe(
          FAMILY_SETTINGS_ERROR_CODES.LOCKED_STRUCTURAL,
        );
      }
    });

    it('rejeita renomear lideranca_gestao com LOCKED_STRUCTURAL', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await expect(
        updateFamilySettings(
          client.db,
          companyId,
          'lideranca_gestao',
          { nomeCustomizado: 'Management' },
          FIXTURE_SUPER_ADMIN_ID,
        ),
      ).rejects.toThrow(FamilySettingsError);
    });

    it('permite reordenar lideranca_gestao (ordem editavel)', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const refreshed = await updateFamilySettings(
        client.db,
        companyId,
        'lideranca_gestao',
        { ordem: 1 },
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(refreshed.ordem).toBe(1);
      expect(refreshed.ativo).toBe(true);
      expect(refreshed.nomeCustomizado).toBeNull();
    });

    it('permite ativo=true explicito em lideranca_gestao (no-op canonico)', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const refreshed = await updateFamilySettings(
        client.db,
        companyId,
        'lideranca_gestao',
        { ativo: true },
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(refreshed.ativo).toBe(true);
    });

    it('permite nomeCustomizado=null explicito em lideranca_gestao (no-op canonico)', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const refreshed = await updateFamilySettings(
        client.db,
        companyId,
        'lideranca_gestao',
        { nomeCustomizado: null },
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(refreshed.nomeCustomizado).toBeNull();
    });
  });

  describe('updateFamilySettings — canonicas nao-estruturais', () => {
    it('permite desativar as 5 canonicas nao-estruturais', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const desativaveis = [
        'vendas_comercial',
        'producao_operacoes',
        'tecnico_especialista',
        'administrativo_suporte',
        'atendimento_relacionamento',
      ] as const;
      for (const family of desativaveis) {
        const refreshed = await updateFamilySettings(
          client.db,
          companyId,
          family,
          { ativo: false },
          FIXTURE_SUPER_ADMIN_ID,
        );
        expect(refreshed.ativo).toBe(false);
      }
      const ativos = await listActiveFamilySettingsForCompany(client.db, companyId);
      expect(ativos).toHaveLength(1);
      expect(ativos[0]?.jobFamily).toBe('lideranca_gestao');
    });

    it('permite renomear canonica nao-estrutural', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const refreshed = await updateFamilySettings(
        client.db,
        companyId,
        'vendas_comercial',
        { nomeCustomizado: 'Hunter B2B' },
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(refreshed.nomeCustomizado).toBe('Hunter B2B');
    });

    it('rejeita nomeCustomizado vazio ou somente-espacos', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await expect(
        updateFamilySettings(
          client.db,
          companyId,
          'vendas_comercial',
          { nomeCustomizado: '   ' },
          FIXTURE_SUPER_ADMIN_ID,
        ),
      ).rejects.toThrow(FamilySettingsError);
    });

    it('rejeita nomeCustomizado acima de 100 chars', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const nomeLongo = 'A'.repeat(101);
      await expect(
        updateFamilySettings(
          client.db,
          companyId,
          'vendas_comercial',
          { nomeCustomizado: nomeLongo },
          FIXTURE_SUPER_ADMIN_ID,
        ),
      ).rejects.toThrow(FamilySettingsError);
    });

    it('rejeita settings inexistente com SETTINGS_NOT_FOUND', async () => {
      const companyId = await seedCompany(client);
      // Nao chama seed — tabela vazia para esta empresa.
      await expect(
        updateFamilySettings(
          client.db,
          companyId,
          'vendas_comercial',
          { ativo: false },
          FIXTURE_SUPER_ADMIN_ID,
        ),
      ).rejects.toThrow(FamilySettingsError);
    });
  });

  describe('activateCustomSlot', () => {
    it('ocupa custom1 na primeira ativacao e popula 4 variaveis canonicas', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const chosen = await activateCustomSlot(
        client.db,
        companyId,
        'Especialista técnico sênior',
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(chosen).toBe('custom1');

      const settings = await getFamilySettings(client.db, companyId, 'custom1');
      expect(settings).not.toBeNull();
      expect(settings?.nomeCustomizado).toBe('Especialista técnico sênior');
      expect(settings?.ativo).toBe(true);
      expect(settings?.ordem).toBe(7);

      const vars = await listJobFamiliesForCompany(client.db, companyId);
      const custom1Vars = vars.filter((v) => v.jobFamily === 'custom1');
      expect(custom1Vars).toHaveLength(4);
      const nomes = custom1Vars.map((v) => v.variableName).sort();
      expect(nomes).toEqual(['Variável 1', 'Variável 2', 'Variável 3', 'Variável 4']);
      const pesos = custom1Vars.map((v) => Number(v.weight));
      expect(pesos.reduce((a, b) => a + b, 0)).toBe(100);
      for (const p of pesos) expect(p).toBe(25);
      for (const v of custom1Vars) expect(v.unit).toBe('');
    });

    it('ocupa custom2 na segunda ativacao', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await activateCustomSlot(client.db, companyId, 'Projetista', FIXTURE_SUPER_ADMIN_ID);
      const segunda = await activateCustomSlot(
        client.db,
        companyId,
        'Instrutor interno',
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(segunda).toBe('custom2');
    });

    it('reutiliza slot desativado antes de ocupar o proximo', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await activateCustomSlot(client.db, companyId, 'Primeiro', FIXTURE_SUPER_ADMIN_ID);
      await deactivateCustomSlot(client.db, companyId, 'custom1', FIXTURE_SUPER_ADMIN_ID);
      const rechosen = await activateCustomSlot(
        client.db,
        companyId,
        'Reaproveitado',
        FIXTURE_SUPER_ADMIN_ID,
      );
      expect(rechosen).toBe('custom1');
      const settings = await getFamilySettings(client.db, companyId, 'custom1');
      expect(settings?.nomeCustomizado).toBe('Reaproveitado');
      expect(settings?.ativo).toBe(true);
    });

    it('rejeita NO_FREE_CUSTOM_SLOT quando os 20 slots estao ativos', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      for (let i = 1; i <= 20; i += 1) {
        await activateCustomSlot(client.db, companyId, `Custom ${i}`, FIXTURE_SUPER_ADMIN_ID);
      }
      await expect(
        activateCustomSlot(client.db, companyId, 'Nao cabe', FIXTURE_SUPER_ADMIN_ID),
      ).rejects.toThrow(FamilySettingsError);
    });

    it('rejeita nomeCustomizado vazio na ativacao', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await expect(
        activateCustomSlot(client.db, companyId, '', FIXTURE_SUPER_ADMIN_ID),
      ).rejects.toThrow(FamilySettingsError);
    });
  });

  describe('deactivateCustomSlot', () => {
    it('marca ativo=FALSE preservando nome e ordem', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await activateCustomSlot(client.db, companyId, 'Para desativar', FIXTURE_SUPER_ADMIN_ID);
      await deactivateCustomSlot(client.db, companyId, 'custom1', FIXTURE_SUPER_ADMIN_ID);
      const settings = await getFamilySettings(client.db, companyId, 'custom1');
      expect(settings).not.toBeNull();
      expect(settings?.ativo).toBe(false);
      expect(settings?.nomeCustomizado).toBe('Para desativar');
      const ativos = await listActiveFamilySettingsForCompany(client.db, companyId);
      expect(ativos.map((r) => r.jobFamily)).not.toContain('custom1');
    });
  });

  describe('isSettingActive', () => {
    it('retorna true para settings com ativo=TRUE', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      const settings = await getFamilySettings(client.db, companyId, 'vendas_comercial');
      expect(isSettingActive(settings)).toBe(true);
    });

    it('retorna false para settings null', () => {
      expect(isSettingActive(null)).toBe(false);
    });

    it('retorna false para settings com ativo=FALSE', async () => {
      const companyId = await seedCompany(client);
      await seedCanonicalFamilySettingsForCompany(client.db, companyId, FIXTURE_SUPER_ADMIN_ID);
      await updateFamilySettings(
        client.db,
        companyId,
        'vendas_comercial',
        { ativo: false },
        FIXTURE_SUPER_ADMIN_ID,
      );
      const settings = await getFamilySettings(client.db, companyId, 'vendas_comercial');
      expect(isSettingActive(settings)).toBe(false);
    });
  });
});
