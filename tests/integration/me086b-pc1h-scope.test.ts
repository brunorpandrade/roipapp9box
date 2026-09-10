// ROIP APP 9BOX — teste integracao ME-086b RETOMADA v2:
// `resolveHierarchicalScope` (§11.9 PC1h).
//
// Cobertura:
//   - Bruno: retorna null (sem restricao).
//   - RH puro: retorna null.
//   - RH-Lider: retorna null (PC1b cobre C-levels ortogonalmente).
//   - CU (cLevelCount=1): retorna null.
//   - CT (cLevelCount>1, acessoTotal=true): retorna null.
//   - CF (cLevelCount>1, acessoTotal=false): retorna Set com cadeia
//     propria + descendentes + proprio no.
//   - Lider L1 (sem descendente): retorna Set com liderados diretos
//     + proprio.
//   - Lider L2 (com descendente): retorna Set com liderados diretos
//     + descendentes recursivos + proprio.
//   - Clevel sem contexto: safe default = Set apenas com o proprio no.
//   - Role desconhecida: safe default = Set vazio.
//
// Faixa CNPJ: 86400000000000..86499999999999.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employeeLeaderHistory, employees } from '../../src/db/schema';
import { resolveHierarchicalScope } from '../../src/server/services/hierarchicalScope';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const HASH_A = 'hash-fixo-me086b-pc1h';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCLevelIds: number[] = [];
const createdEmployeeIds: number[] = [];
const createdElhIds: number[] = [];
let cpfCounter = 86400000000;

function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function seedCompany(cnpj: string, nome: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nome} LTDA`,
      nomeFantasia: nome,
      cnpj,
      telefone: '1633330099',
      endereco: `Rua PC1h ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'PC1h',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!row) throw new Error('seed company failed');
  createdCompanyIds.push(row.id);
  return row.id;
}

async function seedClevel(companyId: number, name: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${Date.now()}@pc1h.com`,
      cpf: nextCpf(),
      dataNascimento: new Date('1985-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cargo: 'CEO',
      descricaoCargo: 'CEO',
      departamento: 'Comercial',
      custoMensal: '10000.00',
      acessoTotal: true,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed cLevel failed');
  createdCLevelIds.push(row.id);
  return row.id;
}

async function seedEmployee(
  companyId: number,
  name: string,
  opts: { readonly isLider?: boolean } = {},
): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf: nextCpf(),
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '212405',
      descricaoCBO: 'Analista',
      jobFamily: 'tecnico_especialista',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isRH: false,
      isLider: opts.isLider === true,
      passwordHash: HASH_A,
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  createdEmployeeIds.push(row.id);
  return row.id;
}

async function seedLinkClevel(empId: number, clevelId: number): Promise<void> {
  const [row] = await db
    .insert(employeeLeaderHistory)
    .values({
      employeeId: empId,
      liderId: null,
      clevelId,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'setup pc1h',
      transferBatchId: '00000000-0000-0000-0000-00000086400a',
    })
    .$returningId();
  if (!row) throw new Error('seed elh clevel failed');
  createdElhIds.push(row.id);
}

async function seedLinkLider(empId: number, liderId: number): Promise<void> {
  const [row] = await db
    .insert(employeeLeaderHistory)
    .values({
      employeeId: empId,
      liderId,
      clevelId: null,
      dataInicio: new Date('2020-01-01'),
      dataFim: null,
      reason: 'setup pc1h',
      transferBatchId: '00000000-0000-0000-0000-00000086400b',
    })
    .$returningId();
  if (!row) throw new Error('seed elh lider failed');
  createdElhIds.push(row.id);
}

// -----------------------------------------------------------------------
// Setup — 1 empresa com cadeia canônica:
//   ceo (clevel A)                       cfo (clevel B)
//     └─ liderMid (empregado L2)           └─ liderOutro (empregado L1)
//         └─ liderFolha (empregado L1)         └─ colabOutro
//             └─ colabFolha
// -----------------------------------------------------------------------

let companyId: number;
let ceo: number;
let cfo: number;
let liderMid: number;
let liderFolha: number;
let colabFolha: number;
let liderOutro: number;
let colabOutro: number;

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;

  companyId = await seedCompany('86400000000001', 'PC1h Alpha');

  ceo = await seedClevel(companyId, 'Ceo PC1h');
  cfo = await seedClevel(companyId, 'Cfo PC1h');

  liderMid = await seedEmployee(companyId, 'Lider Mid PC1h', { isLider: true });
  liderFolha = await seedEmployee(companyId, 'Lider Folha PC1h', { isLider: true });
  colabFolha = await seedEmployee(companyId, 'Colab Folha PC1h');
  liderOutro = await seedEmployee(companyId, 'Lider Outro PC1h', { isLider: true });
  colabOutro = await seedEmployee(companyId, 'Colab Outro PC1h');

  // Cadeia CEO
  await seedLinkClevel(liderMid, ceo);
  await seedLinkLider(liderFolha, liderMid);
  await seedLinkLider(colabFolha, liderFolha);
  // Cadeia CFO
  await seedLinkClevel(liderOutro, cfo);
  await seedLinkLider(colabOutro, liderOutro);
}, 60000);

afterAll(async () => {
  if (createdElhIds.length > 0) {
    await db.delete(employeeLeaderHistory).where(inArray(employeeLeaderHistory.id, createdElhIds));
  }
  if (createdEmployeeIds.length > 0) {
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdCLevelIds.length > 0) {
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.id, createdCLevelIds));
  }
  if (createdCompanyIds.length > 0) {
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
}, 60000);

// -----------------------------------------------------------------------
// Testes
// -----------------------------------------------------------------------

describe('resolveHierarchicalScope — perfis sem restrição PC1h', () => {
  it('super_admin: null', async () => {
    const scope = await resolveHierarchicalScope(db, { role: 'super_admin' });
    expect(scope).toBeNull();
  });

  it('rh puro: null', async () => {
    const scope = await resolveHierarchicalScope(db, {
      role: 'rh',
      userId: 999,
      companyId,
    });
    expect(scope).toBeNull();
  });

  it('rh_lider: null', async () => {
    const scope = await resolveHierarchicalScope(db, {
      role: 'rh_lider',
      userId: 999,
      companyId,
    });
    expect(scope).toBeNull();
  });

  it('CU (cLevelCount=1): null', async () => {
    const scope = await resolveHierarchicalScope(
      db,
      { role: 'clevel', userId: ceo, companyId },
      { cLevelCount: 1, acessoTotal: true },
    );
    expect(scope).toBeNull();
  });

  it('CT (cLevelCount>1, acessoTotal=true): null', async () => {
    const scope = await resolveHierarchicalScope(
      db,
      { role: 'clevel', userId: ceo, companyId },
      { cLevelCount: 2, acessoTotal: true },
    );
    expect(scope).toBeNull();
  });
});

describe('resolveHierarchicalScope — CF (§11.9 PC1h)', () => {
  it('CF ceo: escopo liderMid + liderFolha + colabFolha (PC1i exclui proprio)', async () => {
    const scope = await resolveHierarchicalScope(
      db,
      { role: 'clevel', userId: ceo, companyId },
      { cLevelCount: 2, acessoTotal: false },
    );
    expect(scope).not.toBeNull();
    const set = scope as ReadonlySet<string>;
    // §11.10 PC1i: proprio nao entra no scope (auto-referencia
    // bloqueada por mecanismo separado no client).
    expect(set.has(`clevel-${ceo}`)).toBe(false);
    expect(set.has(`employee-${liderMid}`)).toBe(true);
    expect(set.has(`employee-${liderFolha}`)).toBe(true);
    expect(set.has(`employee-${colabFolha}`)).toBe(true);
    // Cadeia do outro C-level NAO faz parte
    expect(set.has(`clevel-${cfo}`)).toBe(false);
    expect(set.has(`employee-${liderOutro}`)).toBe(false);
    expect(set.has(`employee-${colabOutro}`)).toBe(false);
  });

  it('CF cfo: escopo com liderOutro + colabOutro (proprio nao entra — PC1i)', async () => {
    const scope = await resolveHierarchicalScope(
      db,
      { role: 'clevel', userId: cfo, companyId },
      { cLevelCount: 2, acessoTotal: false },
    );
    expect(scope).not.toBeNull();
    const set = scope as ReadonlySet<string>;
    expect(set.has(`clevel-${cfo}`)).toBe(false);
    expect(set.has(`employee-${liderOutro}`)).toBe(true);
    expect(set.has(`employee-${colabOutro}`)).toBe(true);
    // Outro CEO nao entra
    expect(set.has(`clevel-${ceo}`)).toBe(false);
    expect(set.has(`employee-${liderMid}`)).toBe(false);
  });
});

describe('resolveHierarchicalScope — Lider (§11.9 PC1h)', () => {
  it('Lider L2 (liderMid): liderFolha + colabFolha (PC1i exclui proprio)', async () => {
    const scope = await resolveHierarchicalScope(db, {
      role: 'lider',
      userId: liderMid,
      companyId,
    });
    expect(scope).not.toBeNull();
    const set = scope as ReadonlySet<string>;
    // §11.10 PC1i: proprio nao entra no scope.
    expect(set.has(`employee-${liderMid}`)).toBe(false);
    expect(set.has(`employee-${liderFolha}`)).toBe(true);
    expect(set.has(`employee-${colabFolha}`)).toBe(true);
    // C-levels e outra cadeia fora do escopo
    expect(set.has(`clevel-${ceo}`)).toBe(false);
    expect(set.has(`clevel-${cfo}`)).toBe(false);
    expect(set.has(`employee-${liderOutro}`)).toBe(false);
    expect(set.has(`employee-${colabOutro}`)).toBe(false);
  });

  it('Lider L1 (liderFolha) sem descendente: apenas colabFolha (proprio nao entra)', async () => {
    const scope = await resolveHierarchicalScope(db, {
      role: 'lider',
      userId: liderFolha,
      companyId,
    });
    expect(scope).not.toBeNull();
    const set = scope as ReadonlySet<string>;
    expect(set.has(`employee-${liderFolha}`)).toBe(false);
    expect(set.has(`employee-${colabFolha}`)).toBe(true);
    // liderMid (o proprio lider dele) esta ACIMA — nao entra
    expect(set.has(`employee-${liderMid}`)).toBe(false);
  });

  it('Lider L1 outra cadeia (liderOutro): apenas colabOutro (proprio nao entra)', async () => {
    const scope = await resolveHierarchicalScope(db, {
      role: 'lider',
      userId: liderOutro,
      companyId,
    });
    expect(scope).not.toBeNull();
    const set = scope as ReadonlySet<string>;
    expect(set.has(`employee-${liderOutro}`)).toBe(false);
    expect(set.has(`employee-${colabOutro}`)).toBe(true);
    expect(set.has(`employee-${liderMid}`)).toBe(false);
  });
});

describe('resolveHierarchicalScope — safe defaults', () => {
  it('clevel sem contexto: Set vazio (proprio nao entra — PC1i via client)', async () => {
    const scope = await resolveHierarchicalScope(db, {
      role: 'clevel',
      userId: 12345,
      companyId,
    });
    expect(scope).not.toBeNull();
    const set = scope as ReadonlySet<string>;
    expect(set.size).toBe(0);
  });
});
