// ROIP APP 9BOX — teste de integracao `instrumentUnlockLog` (ME-015).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local (S009) e employee local; reusa a
// fixture `superAdmins.id=1` como autor do desbloqueio.
//
// Cobre:
// - INSERT com os 2 valores canonicos de `instrumento` (`A` e `C`) e
//   com default `houveAlteracao=false`, `ajusteRetroativo=false`.
// - INSERT com `ajusteRetroativo=true` (trimestre encerrado).
// - Multiplos desbloqueios do mesmo trio (companyId, employeeId,
//   trimestre): permitidos — nao ha UNIQUE (§8.5).
// - Listagem por empresa e por (employee, trimestre) em ordem
//   cronologica decrescente por `desbloqueadoEm`, desempate por `id`.
// - Excecao append-only §2.4 / §16.1 item 3:
//   `markInstrumentUnlockJanelaExpirada` grava `houveAlteracao`.
// - FK RESTRICT em `desbloqueadoPor` (superAdmin invalido reprova).
//
// Cleanup:
// - `beforeEach`: apaga apenas `instrumentUnlockLog` do escopo.
// - `afterAll`: apaga o escopo + employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, instrumentUnlockLog } from '../../src/db/schema';
import {
  getInstrumentUnlockLogById,
  insertInstrumentUnlockLog,
  listInstrumentUnlockLogByCompany,
  listInstrumentUnlockLogByEmployeeQuarter,
  markInstrumentUnlockJanelaExpirada,
  type NewInstrumentUnlockLog,
} from '../../src/server/services/instrumentUnlockLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000125';
const SUPER_ADMIN_FIXTURE_ID = 1;

const JUSTIFICATIVA_VALIDA =
  'Justificativa canonica de teste com mais de cem caracteres para respeitar o ' +
  'intervalo do padrao global 100-500 caracteres da regra §2.5, empregada nos ' +
  'casos de desbloqueio administrativo de instrumento.';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function buildValidUnlock(
  companyId: number,
  employeeId: number,
  overrides: Partial<NewInstrumentUnlockLog> = {},
): NewInstrumentUnlockLog {
  return {
    companyId,
    employeeId,
    trimestre: '2026-Q1',
    instrumento: 'A',
    desbloqueadoPor: SUPER_ADMIN_FIXTURE_ID,
    justificativa: JUSTIFICATIVA_VALIDA,
    expiraEm: daysFromNow(1),
    ...overrides,
  };
}

describe('service instrumentUnlockLog (ME-015)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa InstrumentUnlock Test LTDA',
        nomeFantasia: 'Empresa InstrumentUnlock Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330025',
        endereco: 'Rua InstrumentUnlock, 25',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@instrumentunlock.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@instrumentunlock.local',
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
        name: 'Colaborador Unlock',
        cpf: '10101010134',
        email: 'colab.unlock@roip.local',
        dataNascimento: new Date('1995-02-18'),
        dataAdmissao: new Date('2022-04-01'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee');
    employeeId = emp.id;
  });

  afterAll(async () => {
    await client.db.delete(instrumentUnlockLog).where(eq(instrumentUnlockLog.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(instrumentUnlockLog).where(eq(instrumentUnlockLog.companyId, companyId));
  });

  it('insere desbloqueio de instrumento A com defaults e retorna id positivo', async () => {
    const id = await insertInstrumentUnlockLog(client.db, buildValidUnlock(companyId, employeeId));
    expect(id).toBeGreaterThan(0);

    const row = await getInstrumentUnlockLogById(client.db, id);
    expect(row?.instrumento).toBe('A');
    expect(row?.houveAlteracao).toBe(false);
    expect(row?.ajusteRetroativo).toBe(false);
    expect(row?.desbloqueadoEm).not.toBeNull();
  });

  it('insere desbloqueio de instrumento C', async () => {
    const id = await insertInstrumentUnlockLog(
      client.db,
      buildValidUnlock(companyId, employeeId, { instrumento: 'C' }),
    );
    const row = await getInstrumentUnlockLogById(client.db, id);
    expect(row?.instrumento).toBe('C');
  });

  it('aceita ajusteRetroativo=true (trimestre encerrado)', async () => {
    const id = await insertInstrumentUnlockLog(
      client.db,
      buildValidUnlock(companyId, employeeId, { ajusteRetroativo: true }),
    );
    const row = await getInstrumentUnlockLogById(client.db, id);
    expect(row?.ajusteRetroativo).toBe(true);
  });

  it('aceita multiplos desbloqueios do mesmo trio (nao ha UNIQUE)', async () => {
    const id1 = await insertInstrumentUnlockLog(client.db, buildValidUnlock(companyId, employeeId));
    const id2 = await insertInstrumentUnlockLog(
      client.db,
      buildValidUnlock(companyId, employeeId, { instrumento: 'C' }),
    );
    expect(id1).not.toBe(id2);
  });

  it('listInstrumentUnlockLogByCompany ordena por desbloqueadoEm/id desc', async () => {
    const id1 = await insertInstrumentUnlockLog(client.db, buildValidUnlock(companyId, employeeId));
    const id2 = await insertInstrumentUnlockLog(
      client.db,
      buildValidUnlock(companyId, employeeId, { instrumento: 'C' }),
    );
    const rows = await listInstrumentUnlockLogByCompany(client.db, companyId);
    expect(rows.map((r) => r.id)).toEqual([id2, id1]);
  });

  it('listInstrumentUnlockLogByEmployeeQuarter filtra pelo par exato', async () => {
    const alvo = await insertInstrumentUnlockLog(
      client.db,
      buildValidUnlock(companyId, employeeId),
    );
    await insertInstrumentUnlockLog(
      client.db,
      buildValidUnlock(companyId, employeeId, { trimestre: '2026-Q2' }),
    );
    const rows = await listInstrumentUnlockLogByEmployeeQuarter(client.db, employeeId, '2026-Q1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(alvo);
  });

  it('markInstrumentUnlockJanelaExpirada grava houveAlteracao (excecao §2.4)', async () => {
    const id = await insertInstrumentUnlockLog(client.db, buildValidUnlock(companyId, employeeId));
    const afetadas = await markInstrumentUnlockJanelaExpirada(client.db, id, true);
    expect(afetadas).toBe(1);

    const row = await getInstrumentUnlockLogById(client.db, id);
    expect(row?.houveAlteracao).toBe(true);
  });

  it('markInstrumentUnlockJanelaExpirada de id inexistente retorna 0', async () => {
    const afetadas = await markInstrumentUnlockJanelaExpirada(client.db, 99999, true);
    expect(afetadas).toBe(0);
  });

  it('FK RESTRICT reprova desbloqueadoPor invalido', async () => {
    await expect(
      insertInstrumentUnlockLog(
        client.db,
        buildValidUnlock(companyId, employeeId, { desbloqueadoPor: 99999 }),
      ),
    ).rejects.toThrow();
  });
});
