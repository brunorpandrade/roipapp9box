// ROIP APP 9BOX — teste de integracao ME-ORG-01-B (MySQL real, RV-11).
//
// Cobre canonicamente a procedure `employees.unmarkAsLeader` (D3+D4),
// que desmarca um colaborador como lider (`isLider=false`) em transacao
// atomica, aplicando reatribuicoes de liderados ativos via padrao
// canonico de `employeeLeaderHistory` (fechar vinculo + abrir novo com
// `transferBatchId` canonico).
//
// Fecha D-INATIVACAO-LIDER-DESACOPLADA do commit canonico pedido:
// desmarca como lider sem desligamento.
//
// Faixa canonica desta ME: CNPJ 10210000000001..10210000000049.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { createEmployeesRouter } from '../../src/server/routers/employees';
import { createCallerFactory, createContextInner } from '../../src/server/trpc';
import { signPlatformToken, deriveCredentialVersion } from '../../src/server/auth/jwt';
import { createRateLimiter } from '../../src/server/auth/rateLimit';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-me-org-01-b';

const CNPJ_A = '10210000000001';
const CNPJ_B = '10210000000002';
const REASON_CANONICO =
  'Reatribuicao canonica de liderados por desmarcacao de lider em teste de integracao ' +
  'ME-ORG-01-B (RV-11 contra MySQL real).';

let cpfSeq = 40000;
function nextCpf(): string {
  return String(cpfSeq++).padStart(11, '0');
}

let batchSeq = 60000;
function nextBatchId(): string {
  const n = String(batchSeq++).padStart(12, '0');
  return `000000000000000000-${n}`.slice(-36);
}

describe('ME-ORG-01-B — employees.unmarkAsLeader (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let liderA: number;
  let novoLiderA: number;
  let novoLiderBclevel: number;
  let liderado1: number;
  let liderado2: number;
  let rhUserId: number;

  async function limparBase(): Promise<void> {
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
  }

  async function insertEmployee(input: {
    readonly companyId: number;
    readonly name: string;
    readonly isLider?: boolean;
    readonly isRH?: boolean;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: input.companyId,
        name: input.name,
        cpf: nextCpf(),
        email: `${input.name.toLowerCase().replace(/\s+/g, '.')}@roip.test`,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '999999',
        descricaoCBO: 'Analista',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        status: 'ativo',
        isLider: input.isLider ?? false,
        isRH: input.isRH ?? false,
        passwordHash: 'test-hash-fixo',
        passwordSet: true,
      })
      .$returningId();
    return row!.id;
  }

  async function insertClevel(input: {
    readonly companyId: number;
    readonly name: string;
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: input.companyId,
        name: input.name,
        cpf: nextCpf(),
        email: `${input.name.toLowerCase().replace(/\s+/g, '.')}@roip.test`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'CEO',
        departamento: 'Comercial',
        custoMensal: '10000.00',
        acessoTotal: true,
        isResponsavelFinanceiro: false,
        isRH: false,
        status: 'ativo',
        passwordHash: 'x',
        passwordSet: true,
        matricula: null,
      })
      .$returningId();
    return row!.id;
  }

  async function vincula(employeeId: number, liderEmployeeId: number): Promise<void> {
    await client.db.insert(employeeLeaderHistory).values({
      employeeId,
      liderId: liderEmployeeId,
      clevelId: null,
      dataInicio: new Date('2025-01-01'),
      dataFim: null,
      reason: 'fixture ME-ORG-01-B',
      transferBatchId: nextBatchId(),
    });
  }

  async function callerRH(companyId: number, rhId: number) {
    const token = await signPlatformToken({
      companyId,
      userId: rhId,
      role: 'rh',
      credentialVersion: deriveCredentialVersion('test-hash-fixo'),
    });
    return createCallerFactory(createEmployeesRouter())(
      createContextInner({
        db: client.db,
        rateLimiter: createRateLimiter(),
        bearerToken: token,
      }),
    );
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await limparBase();
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await limparBase();
    cpfSeq = 40000;
    batchSeq = 60000;

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-ORG-01-B A LTDA',
      nomeFantasia: 'ROIP ME-ORG-01-B A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua A',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal A',
      contatoPrincipalEmail: 'p.a@roip.test',
      contatoRHNome: 'RH A',
      contatoRHEmail: 'rh.a@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'A',
      contextoMercado: 'A',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdA));

    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-ORG-01-B B LTDA',
      nomeFantasia: 'ROIP ME-ORG-01-B B',
      cnpj: CNPJ_B,
      telefone: '1633330002',
      endereco: 'Rua B',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal B',
      contatoPrincipalEmail: 'p.b@roip.test',
      contatoRHNome: 'RH B',
      contatoRHEmail: 'rh.b@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'B',
      contextoMercado: 'B',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
    });
    await client.db.update(companies).set({ status: 'ativa' }).where(eq(companies.id, companyIdB));

    rhUserId = await insertEmployee({ companyId: companyIdA, name: 'RH Teste', isRH: true });
    liderA = await insertEmployee({ companyId: companyIdA, name: 'Lider A', isLider: true });
    novoLiderA = await insertEmployee({
      companyId: companyIdA,
      name: 'Novo Lider A',
      isLider: true,
    });
    liderado1 = await insertEmployee({ companyId: companyIdA, name: 'Liderado 1' });
    liderado2 = await insertEmployee({ companyId: companyIdA, name: 'Liderado 2' });
    await vincula(liderado1, liderA);
    await vincula(liderado2, liderA);

    novoLiderBclevel = await insertClevel({ companyId: companyIdA, name: 'Clevel Target' });
  });

  it('desmarca lider com liderados em massa (todos → mesmo novo lider employee)', async () => {
    const caller = await callerRH(companyIdA, rhUserId);
    const res = await caller.unmarkAsLeader({
      employeeId: liderA,
      mapeamento: [
        { lideradoId: liderado1, novoLiderId: novoLiderA, novoLiderTipo: 'employee' },
        { lideradoId: liderado2, novoLiderId: novoLiderA, novoLiderTipo: 'employee' },
      ],
      candidatosGrupo4: [],
      reason: REASON_CANONICO,
    });
    expect(res.employeeId).toBe(liderA);
    expect(res.fechados).toBe(2);
    expect(res.inseridos).toBe(2);
    expect(res.promovidos).toBe(0);

    // isLider=false canonicamente.
    const [liderRow] = await client.db
      .select({ isLider: employees.isLider })
      .from(employees)
      .where(eq(employees.id, liderA))
      .limit(1);
    expect(liderRow!.isLider).toBe(false);

    // Vinculos ativos agora apontam para novoLiderA.
    const vinculos = await client.db
      .select({
        employeeId: employeeLeaderHistory.employeeId,
        liderId: employeeLeaderHistory.liderId,
      })
      .from(employeeLeaderHistory)
      .where(
        and(eq(employeeLeaderHistory.liderId, novoLiderA), isNull(employeeLeaderHistory.dataFim)),
      );
    expect(vinculos).toHaveLength(2);
  });

  it('desmarca lider com liderados 1-a-1 (um para employee, outro para cLevel)', async () => {
    const caller = await callerRH(companyIdA, rhUserId);
    const res = await caller.unmarkAsLeader({
      employeeId: liderA,
      mapeamento: [
        { lideradoId: liderado1, novoLiderId: novoLiderA, novoLiderTipo: 'employee' },
        { lideradoId: liderado2, novoLiderId: novoLiderBclevel, novoLiderTipo: 'cLevel' },
      ],
      candidatosGrupo4: [],
      reason: REASON_CANONICO,
    });
    expect(res.inseridos).toBe(2);

    const [v1] = await client.db
      .select({ liderId: employeeLeaderHistory.liderId })
      .from(employeeLeaderHistory)
      .where(
        and(eq(employeeLeaderHistory.employeeId, liderado1), isNull(employeeLeaderHistory.dataFim)),
      )
      .limit(1);
    expect(v1!.liderId).toBe(novoLiderA);

    const [v2] = await client.db
      .select({ clevelId: employeeLeaderHistory.clevelId })
      .from(employeeLeaderHistory)
      .where(
        and(eq(employeeLeaderHistory.employeeId, liderado2), isNull(employeeLeaderHistory.dataFim)),
      )
      .limit(1);
    expect(v2!.clevelId).toBe(novoLiderBclevel);
  });

  it('rejeita se mapeamento nao cobre todos os liderados ativos', async () => {
    const caller = await callerRH(companyIdA, rhUserId);
    await expect(
      caller.unmarkAsLeader({
        employeeId: liderA,
        mapeamento: [
          { lideradoId: liderado1, novoLiderId: novoLiderA, novoLiderTipo: 'employee' },
          // Falta liderado2.
        ],
        candidatosGrupo4: [],
        reason: REASON_CANONICO,
      }),
    ).rejects.toThrow(/mapeamento/i);
  });

  it('rejeita se colaborador nao e lider ativo', async () => {
    const caller = await callerRH(companyIdA, rhUserId);
    await expect(
      caller.unmarkAsLeader({
        employeeId: liderado1,
        mapeamento: [],
        candidatosGrupo4: [],
        reason: REASON_CANONICO,
      }),
    ).rejects.toThrow(/lider/i);
  });

  it('promove candidato Grupo 4 a lider na mesma transacao', async () => {
    // Promove liderado1 a lider como parte do Grupo 4; depois atribui
    // liderado2 a esse novo lider (bit-a-bit do padrao canonico §14.4).
    const caller = await callerRH(companyIdA, rhUserId);
    const res = await caller.unmarkAsLeader({
      employeeId: liderA,
      mapeamento: [
        { lideradoId: liderado1, novoLiderId: novoLiderA, novoLiderTipo: 'employee' },
        { lideradoId: liderado2, novoLiderId: novoLiderA, novoLiderTipo: 'employee' },
      ],
      candidatosGrupo4: [{ candidatoId: liderado1 }],
      reason: REASON_CANONICO,
    });
    expect(res.promovidos).toBe(1);
    const [row] = await client.db
      .select({ isLider: employees.isLider })
      .from(employees)
      .where(eq(employees.id, liderado1))
      .limit(1);
    expect(row!.isLider).toBe(true);
  });
});
