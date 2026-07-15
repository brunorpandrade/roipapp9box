// ROIP APP 9BOX — teste de integracao `copsoqCycles` (ME-016).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico (S009) + employee RH
// local; reusa a fixture `superAdmins.id=1` do globalSetup.
//
// Cobre: INSERT (agendamento) com defaults nas duas variantes do par
// polimorfico `configuradoPor*` (§11.1 nao declara CHECK de
// exclusividade — coerencia do caller); lookup pela UNIQUE
// `uq_copsoqCycles_ciclo` e colisao; CHECK `chk_datas` bloqueando
// dataAbertura >= dataFechamento; transicoes com guarda estrutural
// (abrir so de 'agendado', fechar so de 'aberto', repeticao retorna
// 0); edicao de data de fechamento com auditoria completa; listagens
// pelos indices canonicos; FK RESTRICT em `companyId`; delete de
// teardown.
//
// Cleanup:
// - `beforeEach`: apaga os ciclos da company local.
// - `afterAll`: apaga ciclos + employee + company local (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, copsoqCycles, employees } from '../../src/db/schema';
import {
  abrirCopsoqCycle,
  type CopsoqCycleEdicaoDataFechamento,
  type CopsoqCycleFechamento,
  deleteCopsoqCycleById,
  editarCopsoqCycleDataFechamento,
  fecharCopsoqCycle,
  getCopsoqCycleByCiclo,
  getCopsoqCycleById,
  insertCopsoqCycle,
  listCopsoqCyclesByCompanyStatus,
  listCopsoqCyclesByStatusDataFechamento,
  type NewCopsoqCycle,
} from '../../src/server/services/copsoqCycles';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000129';

function buildValidCycle(
  companyId: number,
  overrides: Partial<NewCopsoqCycle> = {},
): NewCopsoqCycle {
  return {
    companyId,
    ciclo: '2026-03-02',
    dataAbertura: new Date('2026-03-02'),
    dataFechamento: new Date('2026-03-16'),
    ...overrides,
  };
}

describe('service copsoqCycles (ME-016)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let rhEmployeeId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa CopsoqCycles Test LTDA',
        nomeFantasia: 'Empresa CopsoqCycles Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330029',
        endereco: 'Rua CopsoqCycles, 29',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@copsoqcycles.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@copsoqcycles.local',
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
        name: 'RH CopsoqCycles',
        cpf: '10101010129',
        email: 'rh.cc@roip.local',
        dataNascimento: new Date('1988-04-14'),
        dataAdmissao: new Date('2021-01-11'),
        cbo: '252105',
        descricaoCBO: 'Analista de RH',
        jobFamily: 'tecnico_especialista',
        senioridade: 'senior',
        nivelHierarquico: 'operacional',
        departamento: 'Recursos Humanos',
        isRH: true,
        isLider: false,
      })
      .$returningId();
    if (!emp) throw new Error('beforeAll: falha ao criar employee RH');
    rhEmployeeId = emp.id;
  });

  afterAll(async () => {
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, rhEmployeeId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(copsoqCycles).where(eq(copsoqCycles.companyId, companyId));
  });

  it('agenda ciclo com defaults e retorna id positivo', async () => {
    const id = await insertCopsoqCycle(
      client.db,
      buildValidCycle(companyId, { configuradoPorEmployeeId: rhEmployeeId }),
    );
    expect(id).toBeGreaterThan(0);

    const row = await getCopsoqCycleById(client.db, id);
    expect(row?.status).toBe('agendado');
    expect(row?.configuradoPorEmployeeId).toBe(rhEmployeeId);
    expect(row?.configuradoPorSuperAdminId).toBeNull();
    expect(row?.configuradoEm).not.toBeNull();
    expect(row?.abertoEm).toBeNull();
    expect(row?.fechadoEm).toBeNull();
    expect(row?.dataFechamentoOriginal).toBeNull();
  });

  it('agenda ciclo na variante configurada pelo super admin (fixture id=1)', async () => {
    const id = await insertCopsoqCycle(
      client.db,
      buildValidCycle(companyId, { configuradoPorSuperAdminId: 1 }),
    );
    const row = await getCopsoqCycleById(client.db, id);
    expect(row?.configuradoPorSuperAdminId).toBe(1);
    expect(row?.configuradoPorEmployeeId).toBeNull();
  });

  it('getCopsoqCycleByCiclo localiza pela chave logica UNIQUE', async () => {
    const id = await insertCopsoqCycle(client.db, buildValidCycle(companyId));
    const row = await getCopsoqCycleByCiclo(client.db, companyId, '2026-03-02');
    expect(row?.id).toBe(id);
    const missing = await getCopsoqCycleByCiclo(client.db, companyId, '2030-01-01');
    expect(missing).toBeUndefined();
  });

  it('UNIQUE uq_copsoqCycles_ciclo bloqueia ciclo duplicado na empresa', async () => {
    await insertCopsoqCycle(client.db, buildValidCycle(companyId));
    await expect(insertCopsoqCycle(client.db, buildValidCycle(companyId))).rejects.toThrow();
  });

  it('CHECK chk_datas bloqueia dataAbertura igual ou posterior a dataFechamento', async () => {
    await expect(
      insertCopsoqCycle(
        client.db,
        buildValidCycle(companyId, { dataFechamento: new Date('2026-03-02') }),
      ),
    ).rejects.toThrow();
    await expect(
      insertCopsoqCycle(
        client.db,
        buildValidCycle(companyId, { dataFechamento: new Date('2026-02-20') }),
      ),
    ).rejects.toThrow();
  });

  it('abrirCopsoqCycle transiciona agendado -> aberto; repeticao retorna 0', async () => {
    const id = await insertCopsoqCycle(client.db, buildValidCycle(companyId));
    const afetadas = await abrirCopsoqCycle(client.db, id, new Date('2026-03-02T08:00:00Z'));
    expect(afetadas).toBe(1);

    const row = await getCopsoqCycleById(client.db, id);
    expect(row?.status).toBe('aberto');
    expect(row?.abertoEm).not.toBeNull();

    const repeticao = await abrirCopsoqCycle(client.db, id, new Date('2026-03-03T08:00:00Z'));
    expect(repeticao).toBe(0);
  });

  it('editarCopsoqCycleDataFechamento grava auditoria completa (variante RH)', async () => {
    const id = await insertCopsoqCycle(client.db, buildValidCycle(companyId));
    const edicao: CopsoqCycleEdicaoDataFechamento = {
      dataFechamento: new Date('2026-03-23'),
      dataFechamentoOriginal: new Date('2026-03-16'),
      ultimaEdicaoPorEmployeeId: rhEmployeeId,
      ultimaEdicaoEm: new Date('2026-03-10T14:00:00Z'),
      ultimaEdicaoJustificativa: 'Extensao da janela por baixa adesao inicial.',
    };
    const afetadas = await editarCopsoqCycleDataFechamento(client.db, id, edicao);
    expect(afetadas).toBe(1);

    const row = await getCopsoqCycleById(client.db, id);
    expect(row?.dataFechamento?.getTime()).toBe(new Date('2026-03-23').getTime());
    expect(row?.dataFechamentoOriginal).not.toBeNull();
    expect(row?.ultimaEdicaoPorEmployeeId).toBe(rhEmployeeId);
    expect(row?.ultimaEdicaoPorSuperAdminId).toBeNull();
    expect(row?.ultimaEdicaoEm).not.toBeNull();
    expect(row?.ultimaEdicaoJustificativa).toBe('Extensao da janela por baixa adesao inicial.');
  });

  it('fecharCopsoqCycle exige status aberto e grava resultados do fechamento', async () => {
    const id = await insertCopsoqCycle(client.db, buildValidCycle(companyId));

    const sobreAgendado = await fecharCopsoqCycle(client.db, id, {
      fechadoEm: new Date('2026-03-16T18:00:00Z'),
    });
    expect(sobreAgendado).toBe(0);

    await abrirCopsoqCycle(client.db, id, new Date('2026-03-02T08:00:00Z'));
    const fechamento: CopsoqCycleFechamento = {
      fechadoEm: new Date('2026-03-16T18:00:00Z'),
      departamentoCriticoDepartamentoId: 1,
      departamentoCriticoDepartamentoNome: 'Comercial',
      departamentosAmostraInsuficiente: [2, 3],
    };
    const afetadas = await fecharCopsoqCycle(client.db, id, fechamento);
    expect(afetadas).toBe(1);

    const row = await getCopsoqCycleById(client.db, id);
    expect(row?.status).toBe('fechado');
    expect(row?.fechadoEm).not.toBeNull();
    expect(row?.departamentoCriticoDepartamentoId).toBe(1);
    expect(row?.departamentoCriticoDepartamentoNome).toBe('Comercial');
    expect(row?.departamentosAmostraInsuficiente).toEqual([2, 3]);
  });

  it('listagens cobrem os indices canonicos de status', async () => {
    const id1 = await insertCopsoqCycle(
      client.db,
      buildValidCycle(companyId, { ciclo: '2026-03-02' }),
    );
    const id2 = await insertCopsoqCycle(
      client.db,
      buildValidCycle(companyId, {
        ciclo: '2026-06-01',
        dataAbertura: new Date('2026-06-01'),
        dataFechamento: new Date('2026-06-15'),
      }),
    );

    const agendados = await listCopsoqCyclesByCompanyStatus(client.db, companyId, 'agendado');
    expect(agendados.map((c) => c.id)).toEqual([id1, id2]);

    await abrirCopsoqCycle(client.db, id1, new Date('2026-03-02T08:00:00Z'));
    const abertos = await listCopsoqCyclesByStatusDataFechamento(client.db, 'aberto');
    expect(abertos.some((c) => c.id === id1)).toBe(true);
    expect(abertos.some((c) => c.id === id2)).toBe(false);
  });

  it('FK RESTRICT bloqueia companyId inexistente', async () => {
    await expect(insertCopsoqCycle(client.db, buildValidCycle(999999))).rejects.toThrow();
  });

  it('deleteCopsoqCycleById remove existente (1) e inexistente retorna 0', async () => {
    const id = await insertCopsoqCycle(client.db, buildValidCycle(companyId));
    expect(await deleteCopsoqCycleById(client.db, id)).toBe(1);
    expect(await deleteCopsoqCycleById(client.db, id)).toBe(0);
  });
});
