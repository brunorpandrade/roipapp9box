// ROIP APP 9BOX — teste de integracao me055-shell (ME-055c).
//
// Cobertura canonica: valida `resolveMenuItems` (ME-055a §3 canonico)
// contra 4 combinacoes de perfil + isResponsavelFinanceiro provadas em
// MySQL real, satisfazendo RV-11.
//
// Molde canonico: `tests/integration/accessTokens.test.ts` + `companies.
// test.ts`. Cria company propria por caso (CNPJ na faixa auxiliar
// 100 90..100 99 da ME-055c), semeia employees/cLevelMembers minimos com
// a flag `isResponsavelFinanceiro` da tabela correspondente, resolve o
// `ProfileKey` via `resolveMenuItems` e valida a contagem canonica de
// itens §3.1..§3.6.
//
// Nao renderiza React — o repo nao instalou jsdom nem
// @testing-library/react intencionalmente (padrao Blocos A/B/C). O
// componente `Layout` de ME-055b e verificado por smoke test estatico em
// `tests/unit/shell.test.ts`; aqui provamos a INTEGRACAO
// DADOS_MYSQL → resolveMenuItems → conjunto canonico de itens, que e o
// contrato canonico funcional do shell (§3 canonico exige que o
// consumidor da ME-056 chame `resolveMenuItems(role, isRF)` com o
// `isRF` real vindo do banco).
//
// A resolucao canonica `flags(isRH, isLider) + acessoTotal → ProfileKey`
// e canonizada em ME-056 (paineis). Nesta ME-055c, os tests passam o
// `ProfileKey` diretamente ao `resolveMenuItems` e leem `isRF` do
// registro MySQL — provando a integracao do parametro dinamico.
//
// Contagens canonicas §3.1..§3.6 verificadas:
// - super_admin_global: 11 itens de menu §3.1.
// - rh + isRF=true: 15 itens §3.2 (inclui Faturamento da empresa).
// - lider_c1 + isRF=false: 7 itens §3.4.
// - clevel_full + isRF=true: 10 itens §3.5 (inclui Faturamento).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, cLevelMembers, employees } from '../../src/db/schema';
import { resolveMenuItems } from '../../src/lib/menu/menuConfig';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa auxiliar canonica desta ME (ME-055c: 100 90..100 99).
const LOCAL_CNPJ = '10090000000199';

describe('integration ME-055c shell (RV-11) — resolveMenuItems x MySQL real', () => {
  let client: RoipDbClient;
  let companyId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);

    // Semeia empresa propria da ME-055c com CNPJ auxiliar canonico.
    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'ROIP Teste ME-055c LTDA',
        nomeFantasia: 'ROIP ME-055c',
        cnpj: LOCAL_CNPJ,
        telefone: '1633334444',
        endereco: 'Rua Teste, 100',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@roip.test',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@roip.test',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeEach: falha ao criar company local');
    companyId = companyRow.id;
  });

  it('super_admin_global: 11 itens §3.1 (S466: sem Faturamento mesmo com RF=true)', async () => {
    // Super Admin nao ha registro por empresa — testa via ProfileKey
    // direto (a resolucao super_admin_global independe de flag RF).
    const items = resolveMenuItems('super_admin_global', true);
    expect(items).not.toBeNull();
    // Contagem canonica §3.1: 11 itens totais (10 links + 1 separador).
    expect(items!.length).toBe(11);
    // Nunca inclui Faturamento da empresa (S466: super admin nao ve esse item).
    const hasFaturamento = items!.some(
      (i) => i.type === 'link' && i.label === 'Faturamento da empresa',
    );
    expect(hasFaturamento).toBe(false);
  });

  it('rh + isRF=true: 15 itens §3.2 (inclui Faturamento da empresa)', async () => {
    // Semeia employee canonico com isRH=true e isResponsavelFinanceiro=true.
    // A resolucao flags → ProfileKey e canonizada em ME-056; aqui provamos
    // apenas a leitura MySQL real da flag RF e sua integracao com
    // resolveMenuItems.
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Responsavel Financeiro',
        cpf: '10090000001',
        email: 'rh.rf@roip.local',
        dataNascimento: new Date('1985-01-01'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '142105',
        descricaoCBO: 'Gerente RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
        isRH: true,
        isResponsavelFinanceiro: true,
      })
      .$returningId();
    expect(row).toBeDefined();

    const rows = await client.db.select().from(employees).where(eq(employees.id, row!.id));
    const isRF = rows[0]!.isResponsavelFinanceiro === true;
    expect(isRF).toBe(true);

    const items = resolveMenuItems('rh', isRF);
    expect(items).not.toBeNull();
    // Contagem canonica §3.3 com RF=true: 15 itens totais (14 links + 1 separador).
    expect(items!.length).toBe(15);
    const hasFaturamento = items!.some(
      (i) => i.type === 'link' && i.label === 'Faturamento da empresa',
    );
    expect(hasFaturamento).toBe(true);
  });

  it('lider_c1 + isRF=false: 7 itens totais §3.6 (sem Faturamento)', async () => {
    // Semeia employee canonico com isLider=true e isRF=false.
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider C1 Comum',
        cpf: '10090000002',
        email: 'lider.c1@roip.local',
        dataNascimento: new Date('1985-01-01'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '141405',
        descricaoCBO: 'Coordenador',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'tatico',
        departamento: 'Operações',
        isLider: true,
        isResponsavelFinanceiro: false,
      })
      .$returningId();
    expect(row).toBeDefined();

    const rows = await client.db.select().from(employees).where(eq(employees.id, row!.id));
    const isRF = rows[0]!.isResponsavelFinanceiro === true;
    expect(isRF).toBe(false);

    const items = resolveMenuItems('lider_c1', isRF);
    expect(items).not.toBeNull();
    // Contagem canonica §3.6 com RF=false: 7 itens totais (6 links + 1 separador).
    expect(items!.length).toBe(7);
    const hasFaturamento = items!.some(
      (i) => i.type === 'link' && i.label === 'Faturamento da empresa',
    );
    expect(hasFaturamento).toBe(false);
  });

  it('clevel_full + isRF=true: 10 itens totais §3.8 (inclui Faturamento)', async () => {
    // Semeia cLevelMember canonico com acessoTotal=true e isRF=true.
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'CLevel Full RF',
        cpf: '10090000003',
        email: 'clevel.full@roip.local',
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2018-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'Chief Executive Officer',
        departamento: 'Recursos Humanos',
        custoMensal: '25000.00',
        acessoTotal: true,
        isResponsavelFinanceiro: true,
      })
      .$returningId();
    expect(row).toBeDefined();

    const rows = await client.db.select().from(cLevelMembers).where(eq(cLevelMembers.id, row!.id));
    const isRF = rows[0]!.isResponsavelFinanceiro === true;
    expect(isRF).toBe(true);

    const items = resolveMenuItems('clevel_full', isRF);
    expect(items).not.toBeNull();
    // Contagem canonica §3.8 com RF=true: 10 itens totais (9 links + 1 separador).
    expect(items!.length).toBe(10);
    const hasFaturamento = items!.some(
      (i) => i.type === 'link' && i.label === 'Faturamento da empresa',
    );
    expect(hasFaturamento).toBe(true);
  });
});
