// ROIP APP 9BOX — teste de integracao `copsoqCycleSnapshot` (ME-016).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico (S009) + 2 employees
// locais e usa o proprio service ME-016 `insertCopsoqCycle` para
// materializar o ciclo pai (dogfood RV-13; precedente
// `individualProfileScores` -> `individualProfileAssessments` em
// ME-015).
//
// Cobre: INSERT com defaults (respondeu/respostaInvalida/
// inativadoAposSnapshot em false, snapshotEm preenchido); lookup pela
// UNIQUE `uq_snapshot` e colisao; os 3 setters de evento
// (`markCopsoqSnapshotRespondeu`, `markCopsoqSnapshotInvalida` nos 2
// motivos canonicos, `markCopsoqSnapshotInativado`) com chave
// inexistente retornando 0; listagens por ciclo e por
// ciclo+departamento (indice `idx_snapshot_ciclo_dept`); FK RESTRICT
// em `employeeId`; CASCADE do ciclo pai apagando o snapshot.
//
// Cleanup:
// - `beforeEach`: apaga os snapshots do ciclo pai.
// - `afterAll`: apaga ciclos (CASCADE leva snapshots) + employees +
//   company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoqCycles, copsoqCycleSnapshot, employees } from '../../src/db/schema';
import { deleteCopsoqCycleById, insertCopsoqCycle } from '../../src/server/services/copsoqCycles';
import {
  getCopsoqCycleSnapshotById,
  getCopsoqCycleSnapshotByKey,
  insertCopsoqCycleSnapshot,
  listCopsoqCycleSnapshotsByCiclo,
  listCopsoqCycleSnapshotsByCicloDepartamento,
  markCopsoqSnapshotInativado,
  markCopsoqSnapshotInvalida,
  markCopsoqSnapshotRespondeu,
  type NewCopsoqCycleSnapshot,
} from '../../src/server/services/copsoqCycleSnapshot';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000130';

describe('service copsoqCycleSnapshot (ME-016)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let employee1Id: number;
  let employee2Id: number;
  let cicloDbId: number;

  function buildValidSnapshot(
    overrides: Partial<NewCopsoqCycleSnapshot> = {},
  ): NewCopsoqCycleSnapshot {
    return {
      cicloDbId,
      companyId,
      employeeId: employee1Id,
      departamentoId: 1,
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CopsoqSnapshot Test LTDA',
        nomeFantasia: 'Empresa CopsoqSnapshot Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330030',
        endereco: 'Rua CopsoqSnapshot, 30',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@copsoqsnap.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@copsoqsnap.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [emp1] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colaborador Snap 1',
        cpf: '10101010130',
        email: 'colab.snap1@roip.local',
        dataNascimento: new Date('1993-02-19'),
        dataAdmissao: new Date('2022-03-07'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isLider: false,
      })
      .$returningId();
    if (!emp1) throw new Error('beforeAll: falha ao criar employee 1');
    employee1Id = emp1.id;

    const [emp2] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Colaborador Snap 2',
        cpf: '10101010131',
        email: 'colab.snap2@roip.local',
        dataNascimento: new Date('1991-11-05'),
        dataAdmissao: new Date('2020-08-17'),
        cbo: '252105',
        descricaoCBO: 'Analista',
        jobFamily: 'tecnico_especialista',
        senioridade: 'junior',
        nivelHierarquico: 'operacional',
        departamento: 'Financeiro',
        isLider: false,
      })
      .$returningId();
    if (!emp2) throw new Error('beforeAll: falha ao criar employee 2');
    employee2Id = emp2.id;

    // Dogfood RV-13: ciclo pai via service da propria ME-016.
    cicloDbId = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-04-06',
      dataAbertura: new Date('2026-04-06'),
      dataFechamento: new Date('2026-04-20'),
    });
  });

  afterAll(async () => {
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(copsoqCycleSnapshot).where(eq(copsoqCycleSnapshot.cicloDbId, cicloDbId));
  });

  it('insere linha de snapshot com defaults e retorna id positivo', async () => {
    const id = await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    expect(id).toBeGreaterThan(0);

    const row = await getCopsoqCycleSnapshotById(client.db, id);
    expect(row?.respondeu).toBe(false);
    expect(row?.respondidoEm).toBeNull();
    expect(row?.tempoRespostaSegundos).toBeNull();
    expect(row?.respostaInvalida).toBe(false);
    expect(row?.motivoInvalidade).toBeNull();
    expect(row?.inativadoAposSnapshot).toBe(false);
    expect(row?.snapshotEm).not.toBeNull();
  });

  it('getCopsoqCycleSnapshotByKey localiza pela chave logica UNIQUE', async () => {
    const id = await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    const row = await getCopsoqCycleSnapshotByKey(client.db, cicloDbId, employee1Id);
    expect(row?.id).toBe(id);
    const missing = await getCopsoqCycleSnapshotByKey(client.db, cicloDbId, 999999);
    expect(missing).toBeUndefined();
  });

  it('UNIQUE uq_snapshot bloqueia o mesmo colaborador duas vezes no ciclo', async () => {
    await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    await expect(insertCopsoqCycleSnapshot(client.db, buildValidSnapshot())).rejects.toThrow();
  });

  it('markCopsoqSnapshotRespondeu grava o evento; chave inexistente retorna 0', async () => {
    await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    const afetadas = await markCopsoqSnapshotRespondeu(
      client.db,
      cicloDbId,
      employee1Id,
      new Date('2026-04-08T10:30:00Z'),
      412,
    );
    expect(afetadas).toBe(1);

    const row = await getCopsoqCycleSnapshotByKey(client.db, cicloDbId, employee1Id);
    expect(row?.respondeu).toBe(true);
    expect(row?.respondidoEm).not.toBeNull();
    expect(row?.tempoRespostaSegundos).toBe(412);

    const inexistente = await markCopsoqSnapshotRespondeu(
      client.db,
      cicloDbId,
      999999,
      new Date(),
      100,
    );
    expect(inexistente).toBe(0);
  });

  it('markCopsoqSnapshotInvalida grava os 2 motivos canonicos', async () => {
    await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    await insertCopsoqCycleSnapshot(
      client.db,
      buildValidSnapshot({ employeeId: employee2Id, departamentoId: 2 }),
    );

    expect(
      await markCopsoqSnapshotInvalida(client.db, cicloDbId, employee1Id, 'uniformidade'),
    ).toBe(1);
    expect(await markCopsoqSnapshotInvalida(client.db, cicloDbId, employee2Id, 'tempo_baixo')).toBe(
      1,
    );

    const row1 = await getCopsoqCycleSnapshotByKey(client.db, cicloDbId, employee1Id);
    expect(row1?.respostaInvalida).toBe(true);
    expect(row1?.motivoInvalidade).toBe('uniformidade');
    const row2 = await getCopsoqCycleSnapshotByKey(client.db, cicloDbId, employee2Id);
    expect(row2?.motivoInvalidade).toBe('tempo_baixo');

    expect(await markCopsoqSnapshotInvalida(client.db, cicloDbId, 999999, 'uniformidade')).toBe(0);
  });

  it('markCopsoqSnapshotInativado grava o evento de inativacao', async () => {
    await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    expect(await markCopsoqSnapshotInativado(client.db, cicloDbId, employee1Id)).toBe(1);
    const row = await getCopsoqCycleSnapshotByKey(client.db, cicloDbId, employee1Id);
    expect(row?.inativadoAposSnapshot).toBe(true);
    expect(await markCopsoqSnapshotInativado(client.db, cicloDbId, 999999)).toBe(0);
  });

  it('listagens por ciclo e por ciclo+departamento cobrem os indices', async () => {
    await insertCopsoqCycleSnapshot(client.db, buildValidSnapshot());
    await insertCopsoqCycleSnapshot(
      client.db,
      buildValidSnapshot({ employeeId: employee2Id, departamentoId: 2 }),
    );

    const todos = await listCopsoqCycleSnapshotsByCiclo(client.db, cicloDbId);
    expect(todos.map((s) => s.employeeId)).toEqual([employee1Id, employee2Id]);

    const dept2 = await listCopsoqCycleSnapshotsByCicloDepartamento(client.db, cicloDbId, 2);
    expect(dept2).toHaveLength(1);
    expect(dept2[0]?.employeeId).toBe(employee2Id);
  });

  it('FK RESTRICT bloqueia employeeId inexistente', async () => {
    await expect(
      insertCopsoqCycleSnapshot(client.db, buildValidSnapshot({ employeeId: 999999 })),
    ).rejects.toThrow();
  });

  it('CASCADE do ciclo pai apaga o snapshot filho', async () => {
    const cicloTemp = await insertCopsoqCycle(client.db, {
      companyId,
      ciclo: '2026-09-07',
      dataAbertura: new Date('2026-09-07'),
      dataFechamento: new Date('2026-09-21'),
    });
    const snapId = await insertCopsoqCycleSnapshot(
      client.db,
      buildValidSnapshot({ cicloDbId: cicloTemp }),
    );

    expect(await deleteCopsoqCycleById(client.db, cicloTemp)).toBe(1);
    const row = await getCopsoqCycleSnapshotById(client.db, snapId);
    expect(row).toBeUndefined();
  });
});
