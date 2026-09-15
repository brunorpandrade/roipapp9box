// ROIP APP 9BOX — teste de integracao ME-fila4 (MySQL real, RV-11).
//
// Cobre o fix deterministico canonico aplicado ao Route Handler
// `POST /api/portal/nr1-form-state` (route.ts:154-159): sob estado
// empiricamente corrompido — mais de um ciclo em `status='aberto'` na
// mesma empresa (violacao do invariante DOC 03 §11.2, mas fisicamente
// possivel via bug/injecao manual regime L114/race em migracao) — o
// handler retorna o ciclo com `dataAbertura` mais recente, de forma
// deterministica em MySQL.
//
// Este teste NAO valida o invariante canonico (que e protegido na
// criacao pelas pre-condicoes de §11.2). Ele valida que, se o
// invariante for empiricamente violado, o handler exibe comportamento
// determinado e reproducivel.
//
// Padrao S009/S204: CNPJs da faixa auxiliar 10000000000993..999 (7 CNPJs
// reservados). Contador sequencial `nextCnpj()` — evita colisao UNIQUE
// `companies.cnpj` quando ha mais de 1 cenario `it` (RV-16 desta ME).
// Padrao bit-a-bit ao precedente `portal-nr1-form-state.test.ts`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoqCycles, copsoqCycleSnapshot, employees } from '../../src/db/schema';
import { POST as nr1FormStatePOST } from '../../src/app/api/portal/nr1-form-state/route';
import {
  __setPortalNr1FormStateDbClient,
  __setPortalNr1FormStateNow,
  type Nr1FormStateSuccess,
} from '../../src/app/api/portal/nr1-form-state/internals';
import { signPortalToken } from '../../src/server/auth/portalToken';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-mefila4-nr1-determinism';

const HASH_FILA4 = 'hash-fixo-mefila4-nr1-determinism';
const CNPJ_FILA4_BASE = 10000000000993;
const NOW_FIXO = new Date('2026-09-14T12:00:00.000Z');

let cnpjCounter = CNPJ_FILA4_BASE - 1;
function nextCnpj(): string {
  cnpjCounter += 1;
  return String(cnpjCounter);
}

let client: RoipDbClient;
const createdCompanyIds: number[] = [];

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setPortalNr1FormStateDbClient(client);
});

afterAll(async () => {
  if (!client) return;
  if (createdCompanyIds.length > 0) {
    await client.db
      .delete(copsoqCycleSnapshot)
      .where(inArray(copsoqCycleSnapshot.companyId, createdCompanyIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  __setPortalNr1FormStateDbClient(null);
  __setPortalNr1FormStateNow(null);
  await closeDbClient(client);
});

beforeEach(() => {
  __setPortalNr1FormStateNow(() => NOW_FIXO);
});

// ============================================================
// Helpers de fixture (padrao bit-a-bit ao portal-nr1-form-state.test.ts)
// ============================================================

async function createCompany(): Promise<number> {
  const cnpj = nextCnpj();
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME-fila4 DET ${cnpj} LTDA`,
      nomeFantasia: `ME-fila4 DET ${cnpj}`,
      cnpj,
      telefone: '1633330404',
      endereco: `Rua ME-fila4 D, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `prf4-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rhf4-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      timezone: 'UTC',
      status: 'ativa',
    })
    .$returningId();
  const companyId = row!.id;
  createdCompanyIds.push(companyId);
  return companyId;
}

let cpfCounter = 49930000000;
function nextCpf(): string {
  cpfCounter += 1;
  return String(cpfCounter);
}

async function createEmployee(companyId: number): Promise<number> {
  const cpf = nextCpf();
  const [row] = await client.db
    .insert(employees)
    .values({
      companyId,
      name: `EmpF4 ${cpf}`,
      cpf,
      email: `empf4-${cpf}@roip.local`,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '999999',
      descricaoCBO: 'Analista',
      jobFamily: 'vendas_comercial',
      senioridade: 'pleno',
      nivelHierarquico: 'operacional',
      departamento: 'Comercial',
      status: 'ativo',
      isLider: false,
      isRH: false,
      passwordHash: HASH_FILA4,
      passwordSet: true,
    })
    .$returningId();
  return row!.id;
}

async function insertCicloAberto(
  companyId: number,
  ciclo: string,
  dataAbertura: Date,
  dataFechamento: Date,
): Promise<number> {
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo,
      dataAbertura,
      dataFechamento,
      status: 'aberto',
    })
    .$returningId();
  return row!.id;
}

async function inserirSnapshot(
  cicloDbId: number,
  companyId: number,
  employeeId: number,
): Promise<void> {
  await client.db.insert(copsoqCycleSnapshot).values({
    cicloDbId,
    companyId,
    employeeId,
    departamentoId: 1,
    snapshotEm: NOW_FIXO,
    respondeu: false,
    inativadoAposSnapshot: false,
  });
}

async function chamarHandler(portalToken: string): Promise<Nr1FormStateSuccess> {
  const req = new Request('http://localhost/api/portal/nr1-form-state', {
    method: 'POST',
    body: JSON.stringify({ portalToken }),
    headers: { 'Content-Type': 'application/json' },
  });
  const res = await nr1FormStatePOST(req);
  return (await res.json()) as Nr1FormStateSuccess;
}

// ============================================================
// Cenarios canonicos
// ============================================================

describe('ME-fila4 — determinismo do ORDER BY dataAbertura DESC (MySQL real)', () => {
  it('1 ciclo aberto retorna esse ciclo (invariante canonico DOC 03 §11.2)', async () => {
    const companyId = await createCompany();
    const employeeId = await createEmployee(companyId);
    const cicloDbId = await insertCicloAberto(
      companyId,
      '2026-06-01',
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-31T00:00:00.000Z'),
    );
    await inserirSnapshot(cicloDbId, companyId, employeeId);

    const token = await signPortalToken({
      companyId,
      titularType: 'employee',
      titularId: employeeId,
    });
    const corpo = await chamarHandler(token);

    expect(corpo.disponivel).toBe(true);
    expect(corpo.cicloDbId).toBe(cicloDbId);
    expect(corpo.ciclo).toBe('2026-06-01');
  });

  it(
    '2 ciclos abertos simultaneos (violacao do invariante) retorna deterministicamente ' +
      'o mais recente por dataAbertura',
    async () => {
      const companyId = await createCompany();
      const employeeId = await createEmployee(companyId);

      // Ciclo antigo (dataAbertura anterior).
      const cicloAntigoId = await insertCicloAberto(
        companyId,
        '2026-04-01',
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-31T00:00:00.000Z'),
      );
      // Ciclo recente (dataAbertura posterior).
      const cicloRecenteId = await insertCicloAberto(
        companyId,
        '2026-08-01',
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-30T00:00:00.000Z'),
      );

      // Snapshot em AMBOS os ciclos: garante que o teste isole o efeito do
      // ORDER BY do handler — se ele escolher o antigo, retornaria elegivel
      // no ciclo antigo; se escolher o recente (canonico), retorna elegivel
      // no ciclo recente.
      await inserirSnapshot(cicloAntigoId, companyId, employeeId);
      await inserirSnapshot(cicloRecenteId, companyId, employeeId);

      const token = await signPortalToken({
        companyId,
        titularType: 'employee',
        titularId: employeeId,
      });
      const corpo = await chamarHandler(token);

      expect(corpo.disponivel).toBe(true);
      expect(corpo.cicloDbId).toBe(cicloRecenteId);
      expect(corpo.ciclo).toBe('2026-08-01');
    },
  );

  it(
    '2 ciclos abertos simultaneos com ordem INSERT invertida — resultado permanece o mais ' +
      'recente por dataAbertura',
    async () => {
      const companyId = await createCompany();
      const employeeId = await createEmployee(companyId);

      // INSERT do ciclo mais recente PRIMEIRO — descarta hipotese de o
      // resultado ser mero artefato da ordem de INSERT do MySQL.
      const cicloRecenteId = await insertCicloAberto(
        companyId,
        '2026-08-15',
        new Date('2026-08-15T00:00:00.000Z'),
        new Date('2026-10-15T00:00:00.000Z'),
      );
      const cicloAntigoId = await insertCicloAberto(
        companyId,
        '2026-03-15',
        new Date('2026-03-15T00:00:00.000Z'),
        new Date('2026-05-15T00:00:00.000Z'),
      );

      await inserirSnapshot(cicloAntigoId, companyId, employeeId);
      await inserirSnapshot(cicloRecenteId, companyId, employeeId);

      const token = await signPortalToken({
        companyId,
        titularType: 'employee',
        titularId: employeeId,
      });
      const corpo = await chamarHandler(token);

      expect(corpo.disponivel).toBe(true);
      expect(corpo.cicloDbId).toBe(cicloRecenteId);
      expect(corpo.ciclo).toBe('2026-08-15');
    },
  );
});
