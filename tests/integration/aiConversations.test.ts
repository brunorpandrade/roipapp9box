// ROIP APP 9BOX — teste de integracao `aiConversations` (ME-017).
//
// Cobre §10.2: INSERT nas variantes de (`userType`, `dashboardLevel`,
// `contextId`), listActive filtra `archivedAt IS NULL` e ordena por
// `createdAt`, contextId NULL (dashboard global) tratado por IS NULL,
// arquivamento em lote via cutoff (mantem posteriores intactos), FK
// RESTRICT em `companyId`, delete por company.
//
// Cleanup:
// - `beforeEach`: apaga aiConversations da company local.
// - `afterAll`: apaga tudo + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { aiConversations, companies, employees } from '../../src/db/schema';
import {
  archiveAiConversationsBefore,
  deleteAiConversationsByCompanyId,
  insertAiConversation,
  listAiConversationsActive,
  type NewAiConversation,
} from '../../src/server/services/aiConversations';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000135';

function buildValidMessage(
  companyId: number,
  overrides: Partial<NewAiConversation> = {},
): NewAiConversation {
  return {
    companyId,
    userId: 1,
    userType: 'employee',
    dashboardLevel: 'individual',
    contextId: 1,
    role: 'user',
    content: 'Pergunta de teste ao Chat IA.',
    ...overrides,
  };
}

describe('service aiConversations (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderEmployeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa AiConversations Test LTDA',
        nomeFantasia: 'Empresa AiConv Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330035',
        endereco: 'Rua AiConv, 35',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@aiconv.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@aiconv.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider AiConv',
        cpf: '10101010135',
        email: 'lider.aic@roip.local',
        dataNascimento: new Date('1985-03-10'),
        dataAdmissao: new Date('2016-01-15'),
        cbo: '142105',
        descricaoCBO: 'Gerente Comercial',
        jobFamily: 'lideranca_gestao',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Comercial',
        isLider: true,
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee');
    liderEmployeeId = emp.id;
  });

  afterAll(async () => {
    await client.db.delete(aiConversations).where(eq(aiConversations.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, liderEmployeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(aiConversations).where(eq(aiConversations.companyId, companyId));
  });

  it('insere mensagem com defaults e retorna id positivo', async () => {
    const id = await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId }),
    );
    expect(id).toBeGreaterThan(0);
  });

  it('aceita todas as variantes canonicas de userType e dashboardLevel', async () => {
    const userTypes: Array<'employee' | 'clevel' | 'super_admin'> = [
      'employee',
      'clevel',
      'super_admin',
    ];
    const levels: Array<'global' | 'departamento' | 'equipe' | 'individual'> = [
      'global',
      'departamento',
      'equipe',
      'individual',
    ];
    for (const ut of userTypes) {
      for (const lv of levels) {
        const id = await insertAiConversation(
          client.db,
          buildValidMessage(companyId, {
            userType: ut,
            dashboardLevel: lv,
            contextId: lv === 'global' ? null : 1,
          }),
        );
        expect(id).toBeGreaterThan(0);
      }
    }
  });

  it('listAiConversationsActive filtra archivedAt IS NULL e ordena por createdAt', async () => {
    const id1 = await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId, role: 'user' }),
    );
    await new Promise((r) => setTimeout(r, 1100));
    const id2 = await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId, role: 'assistant' }),
    );

    const ativos = await listAiConversationsActive(
      client.db,
      liderEmployeeId,
      'employee',
      'individual',
      1,
    );
    expect(ativos.map((r) => r.id)).toEqual([id1, id2]);
  });

  it('listAiConversationsActive com contextId=null filtra por IS NULL (global)', async () => {
    await insertAiConversation(
      client.db,
      buildValidMessage(companyId, {
        userId: liderEmployeeId,
        dashboardLevel: 'global',
        contextId: null,
      }),
    );
    await insertAiConversation(
      client.db,
      buildValidMessage(companyId, {
        userId: liderEmployeeId,
        dashboardLevel: 'individual',
        contextId: 1,
      }),
    );

    const globais = await listAiConversationsActive(
      client.db,
      liderEmployeeId,
      'employee',
      'global',
      null,
    );
    expect(globais.length).toBe(1);
    expect(globais[0]?.contextId).toBeNull();
    expect(globais[0]?.dashboardLevel).toBe('global');
  });

  it('archiveAiConversationsBefore afeta apenas linhas anteriores ao cutoff', async () => {
    const id1 = await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId, role: 'user' }),
    );
    await new Promise((r) => setTimeout(r, 1100));
    const cutoff = new Date();
    await new Promise((r) => setTimeout(r, 1100));
    const id2 = await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId, role: 'assistant' }),
    );

    const archivedAt = new Date();
    const afetadas = await archiveAiConversationsBefore(client.db, companyId, cutoff, archivedAt);
    expect(afetadas).toBe(1);

    const ativos = await listAiConversationsActive(
      client.db,
      liderEmployeeId,
      'employee',
      'individual',
      1,
    );
    expect(ativos.map((r) => r.id)).toEqual([id2]);

    // Repetir arquivamento com o mesmo cutoff nao afeta linhas ja arquivadas.
    const reAfetadas = await archiveAiConversationsBefore(client.db, companyId, cutoff, archivedAt);
    expect(reAfetadas).toBe(0);

    // A linha id1 continua existente, so nao aparece em listActive.
    const [linha1] = await client.db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, id1))
      .limit(1);
    expect(linha1?.archivedAt).not.toBeNull();
  });

  it('FK RESTRICT bloqueia companyId inexistente', async () => {
    await expect(insertAiConversation(client.db, buildValidMessage(999999))).rejects.toThrow();
  });

  it('deleteAiConversationsByCompanyId remove todas as mensagens da empresa', async () => {
    await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId }),
    );
    await insertAiConversation(
      client.db,
      buildValidMessage(companyId, { userId: liderEmployeeId }),
    );
    const afetadas = await deleteAiConversationsByCompanyId(client.db, companyId);
    expect(afetadas).toBe(2);
    const zero = await deleteAiConversationsByCompanyId(client.db, companyId);
    expect(zero).toBe(0);
  });
});
