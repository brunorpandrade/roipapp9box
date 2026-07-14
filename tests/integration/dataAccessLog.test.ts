// ROIP APP 9BOX — teste de integracao `dataAccessLog` (ME-012).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local + dois employees (um RH, um titular) +
// um cLevelMember. Cobre append-only (§16.1), agente polimorfico padrao
// B (§14.2), FK RESTRICT em `companyId` e FK CASCADE em
// `titularEmployeeId` (a delecao do titular apaga suas entradas de log).
//
// Cleanup:
// - `beforeEach`: apaga apenas `dataAccessLog` (isolamento entre casos).
// - `afterAll`: apaga tudo do escopo + employees + cLevel + company local
//   (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, dataAccessLog, employees } from '../../src/db/schema';
import {
  getDataAccessLogById,
  insertDataAccessLogEntry,
  listDataAccessLogByCompany,
  listDataAccessLogByTitular,
} from '../../src/server/services/dataAccessLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '88888888000108';
const SUPER_ADMIN_FIXTURE_ID = 1;

describe('service dataAccessLog (ME-012)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let agenteRhId: number;
  let titularId: number;
  let liderId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa DataAccessLog Test LTDA',
        nomeFantasia: 'Empresa DataAccessLog Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330008',
        endereco: 'Rua DataAccessLog, 8',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@dataaccesslog.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@dataaccesslog.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Agente RH.
    const [rhRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Agente RH DAL',
        cpf: '88888888881',
        email: 'rh.dal@roip.local',
        dataNascimento: new Date('1985-01-01'),
        dataAdmissao: new Date('2018-01-15'),
        cbo: '141405',
        descricaoCBO: 'Analista de RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
      })
      .$returningId();
    if (!rhRow) throw new Error('beforeAll: falha ao criar agente RH');
    agenteRhId = rhRow.id;

    // Titular (colaborador cujo dado sera acessado).
    const [titularRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Titular DAL',
        cpf: '88888888882',
        email: 'titular.dal@roip.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-15'),
        cbo: '514320',
        descricaoCBO: 'Operador de Producao',
        jobFamily: 'producao_operacoes',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Produção',
      })
      .$returningId();
    if (!titularRow) throw new Error('beforeAll: falha ao criar titular');
    titularId = titularRow.id;

    // Lider (para agentType='lider').
    const [liderRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider DAL',
        cpf: '88888888883',
        email: 'lider.dal@roip.local',
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2015-01-15'),
        cbo: '141410',
        descricaoCBO: 'Gerente',
        jobFamily: 'producao_operacoes',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Produção',
      })
      .$returningId();
    if (!liderRow) throw new Error('beforeAll: falha ao criar lider');
    liderId = liderRow.id;

    // C-Level (para agentType='clevel').
    const [clevelRow] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level DAL',
        cpf: '88888888884',
        email: 'clevel.dal@roip.local',
        dataNascimento: new Date('1970-01-01'),
        dataAdmissao: new Date('2010-01-15'),
        cargo: 'CEO',
        descricaoCargo: 'Chief Executive Officer',
        departamento: 'Diretoria',
        custoMensal: '55000.00',
      })
      .$returningId();
    if (!clevelRow) throw new Error('beforeAll: falha ao criar clevel');
    clevelId = clevelRow.id;
  });

  afterAll(async () => {
    await client.db.delete(dataAccessLog);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(dataAccessLog);
  });

  it('insertDataAccessLogEntry com agentType=rh insere e retorna id', async () => {
    const id = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'dashboard_individual',
      contexto: 'Dashboard individual — 2º trimestre de 2026',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getDataAccessLogById(client.db, id);
    expect(row?.agentType).toBe('rh');
    expect(row?.tipoAcesso).toBe('dashboard_individual');
    expect(row?.contexto).toBe('Dashboard individual — 2º trimestre de 2026');
  });

  it('insertDataAccessLogEntry cobre os 4 agentTypes canonicos', async () => {
    const idSA = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'super_admin',
      agentId: SUPER_ADMIN_FIXTURE_ID,
      titularEmployeeId: titularId,
      tipoAcesso: 'relatorio_perfil_individual',
    });
    const idRh = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'exportacao_planilha',
    });
    const idLider = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'lider',
      agentId: liderId,
      titularEmployeeId: titularId,
      tipoAcesso: 'dashboard_individual',
    });
    const idClevel = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'clevel',
      agentId: clevelId,
      titularEmployeeId: titularId,
      tipoAcesso: 'dashboard_individual',
    });

    const rowSA = await getDataAccessLogById(client.db, idSA);
    const rowRh = await getDataAccessLogById(client.db, idRh);
    const rowLider = await getDataAccessLogById(client.db, idLider);
    const rowClevel = await getDataAccessLogById(client.db, idClevel);

    expect(rowSA?.agentType).toBe('super_admin');
    expect(rowRh?.agentType).toBe('rh');
    expect(rowLider?.agentType).toBe('lider');
    expect(rowClevel?.agentType).toBe('clevel');
  });

  it('insertDataAccessLogEntry aceita os 3 tipoAcesso canonicos (§15.3)', async () => {
    const idA = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'dashboard_individual',
    });
    const idB = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'relatorio_perfil_individual',
    });
    const idC = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'exportacao_planilha',
    });
    expect(idA).toBeGreaterThan(0);
    expect(idB).toBeGreaterThan(0);
    expect(idC).toBeGreaterThan(0);
  });

  it('companyId invalido reprova por FK RESTRICT (§14.2)', async () => {
    await expect(
      insertDataAccessLogEntry(client.db, {
        companyId: 999_999,
        agentType: 'rh',
        agentId: agenteRhId,
        titularEmployeeId: titularId,
        tipoAcesso: 'dashboard_individual',
      }),
    ).rejects.toThrow();
  });

  it('titularEmployeeId invalido reprova por FK CASCADE (§14.2)', async () => {
    // FK CASCADE se aplica no DELETE do titular; no INSERT, um titular
    // inexistente reprova como qualquer outra FK.
    await expect(
      insertDataAccessLogEntry(client.db, {
        companyId,
        agentType: 'rh',
        agentId: agenteRhId,
        titularEmployeeId: 999_999,
        tipoAcesso: 'dashboard_individual',
      }),
    ).rejects.toThrow();
  });

  it('listDataAccessLogByCompany retorna em desc por createdAt / id', async () => {
    const idA = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'dashboard_individual',
      contexto: 'entrada A (mais antiga)',
    });
    const idB = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'lider',
      agentId: liderId,
      titularEmployeeId: titularId,
      tipoAcesso: 'exportacao_planilha',
      contexto: 'entrada B',
    });
    const idC = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'super_admin',
      agentId: SUPER_ADMIN_FIXTURE_ID,
      titularEmployeeId: titularId,
      tipoAcesso: 'relatorio_perfil_individual',
      contexto: 'entrada C (mais recente)',
    });

    const rows = await listDataAccessLogByCompany(client.db, companyId);
    expect(rows).toHaveLength(3);
    // Desempate por id desc quando createdAt colide (mesma segundo).
    expect(rows[0]?.id).toBe(idC);
    expect(rows[1]?.id).toBe(idB);
    expect(rows[2]?.id).toBe(idA);
  });

  it('listDataAccessLogByTitular filtra pelo titular e ordena desc', async () => {
    // Insere para o titular principal.
    await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: titularId,
      tipoAcesso: 'dashboard_individual',
    });
    // Insere para OUTRO titular (o proprio agenteRh como titular fictcio)
    // — precisa ficar de fora do resultado.
    await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'super_admin',
      agentId: SUPER_ADMIN_FIXTURE_ID,
      titularEmployeeId: agenteRhId,
      tipoAcesso: 'relatorio_perfil_individual',
    });

    const rowsTitular = await listDataAccessLogByTitular(client.db, titularId);
    expect(rowsTitular).toHaveLength(1);
    expect(rowsTitular[0]?.titularEmployeeId).toBe(titularId);

    const rowsOutro = await listDataAccessLogByTitular(client.db, agenteRhId);
    expect(rowsOutro).toHaveLength(1);
    expect(rowsOutro[0]?.titularEmployeeId).toBe(agenteRhId);
  });

  it('CASCADE em titularEmployeeId apaga entries quando o titular e deletado', async () => {
    // Cria um titular sacrificable APENAS para este teste.
    const [scRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Sacrifica DAL',
        cpf: '88888888899',
        email: 'sacrifica.dal@roip.local',
        dataNascimento: new Date('1995-01-01'),
        dataAdmissao: new Date('2023-01-15'),
        cbo: '514320',
        descricaoCBO: 'Operador',
        jobFamily: 'producao_operacoes',
        senioridade: 'junior',
        nivelHierarquico: 'operacional',
        departamento: 'Produção',
      })
      .$returningId();
    if (!scRow) throw new Error('titular sacrificable nao criado');
    const scId = scRow.id;

    const logId = await insertDataAccessLogEntry(client.db, {
      companyId,
      agentType: 'rh',
      agentId: agenteRhId,
      titularEmployeeId: scId,
      tipoAcesso: 'dashboard_individual',
    });
    expect(await getDataAccessLogById(client.db, logId)).toBeDefined();

    // Deleta o titular; CASCADE deve remover a entrada.
    await client.db.delete(employees).where(eq(employees.id, scId));

    expect(await getDataAccessLogById(client.db, logId)).toBeUndefined();
  });
});
