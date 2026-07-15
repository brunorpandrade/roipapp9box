// ROIP APP 9BOX — teste de integracao `developmentDialogs` (ME-017).
//
// Cobre §10.1: INSERT com defaults (status='verde', pendencia=false,
// arquivado=false); setters granulares por transicao (updateStatus,
// setPendencia, archive); listagens cobrindo indices canonicos
// (idx_dd_lider_emp, idx_dd_lider_pend) — arquivados nao retornam por
// default; FK RESTRICT em liderId/employeeId; delete por company.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, developmentDialogs, employees } from '../../src/db/schema';
import {
  archiveDevelopmentDialog,
  deleteDevelopmentDialogsByCompany,
  getDevelopmentDialogById,
  insertDevelopmentDialog,
  listDialogsByLeaderEmployee,
  listPendenciasByLeader,
  type NewDevelopmentDialog,
  setDevelopmentDialogPendencia,
  updateDevelopmentDialogStatus,
} from '../../src/server/services/developmentDialogs';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000136';

describe('service developmentDialogs (ME-017)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderId: number;
  let liderado1Id: number;
  let liderado2Id: number;

  function buildDialog(overrides: Partial<NewDevelopmentDialog> = {}): NewDevelopmentDialog {
    return {
      companyId,
      liderId,
      employeeId: liderado1Id,
      titulo: 'Dialogo de teste',
      corpo: 'Corpo do dialogo.',
      ...overrides,
    };
  }

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa DevDialogs Test LTDA',
        nomeFantasia: 'Empresa DD Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330036',
        endereco: 'Rua DD, 36',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@dd.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@dd.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    const [lider] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider DD',
        cpf: '10101010136',
        email: 'lider.dd@roip.local',
        dataNascimento: new Date('1980-05-10'),
        dataAdmissao: new Date('2012-01-15'),
        cbo: '142105',
        descricaoCBO: 'Gerente Comercial',
        jobFamily: 'lideranca_gestao',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Comercial',
        isLider: true,
      })
      .$returningId();
    if (!lider) throw new Error('beforeAll: falha ao criar lider');
    liderId = lider.id;

    const [lid1] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Liderado 1',
        cpf: '20202020136',
        email: 'liderado1.dd@roip.local',
        dataNascimento: new Date('1992-04-20'),
        dataAdmissao: new Date('2020-03-01'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!lid1) throw new Error('beforeAll: falha ao criar liderado1');
    liderado1Id = lid1.id;

    const [lid2] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Liderado 2',
        cpf: '30303030136',
        email: 'liderado2.dd@roip.local',
        dataNascimento: new Date('1994-07-12'),
        dataAdmissao: new Date('2021-06-01'),
        cbo: '351305',
        descricaoCBO: 'Analista',
        jobFamily: 'administrativo_suporte',
        senioridade: 'junior',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
      })
      .$returningId();
    if (!lid2) throw new Error('beforeAll: falha ao criar liderado2');
    liderado2Id = lid2.id;
  });

  afterAll(async () => {
    await client.db.delete(developmentDialogs).where(eq(developmentDialogs.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.id, liderado2Id));
    await client.db.delete(employees).where(eq(employees.id, liderado1Id));
    await client.db.delete(employees).where(eq(employees.id, liderId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(developmentDialogs).where(eq(developmentDialogs.companyId, companyId));
  });

  it('insere dialogo com defaults verde/pendencia=false/arquivado=false', async () => {
    const id = await insertDevelopmentDialog(client.db, buildDialog());
    expect(id).toBeGreaterThan(0);
    const row = await getDevelopmentDialogById(client.db, id);
    expect(row?.status).toBe('verde');
    expect(row?.pendencia).toBe(false);
    expect(row?.arquivado).toBe(false);
  });

  it('updateDevelopmentDialogStatus transita entre verde e vermelho livremente', async () => {
    const id = await insertDevelopmentDialog(client.db, buildDialog());
    expect(await updateDevelopmentDialogStatus(client.db, id, 'vermelho')).toBe(1);
    expect((await getDevelopmentDialogById(client.db, id))?.status).toBe('vermelho');
    expect(await updateDevelopmentDialogStatus(client.db, id, 'verde')).toBe(1);
    expect((await getDevelopmentDialogById(client.db, id))?.status).toBe('verde');
  });

  it('setDevelopmentDialogPendencia liga e desliga a flag', async () => {
    const id = await insertDevelopmentDialog(client.db, buildDialog());
    expect(await setDevelopmentDialogPendencia(client.db, id, true)).toBe(1);
    expect((await getDevelopmentDialogById(client.db, id))?.pendencia).toBe(true);
    expect(await setDevelopmentDialogPendencia(client.db, id, false)).toBe(1);
    expect((await getDevelopmentDialogById(client.db, id))?.pendencia).toBe(false);
  });

  it('archiveDevelopmentDialog seta arquivado=true; nao ha desarquivamento', async () => {
    const id = await insertDevelopmentDialog(client.db, buildDialog());
    expect(await archiveDevelopmentDialog(client.db, id)).toBe(1);
    expect((await getDevelopmentDialogById(client.db, id))?.arquivado).toBe(true);
  });

  it('listDialogsByLeaderEmployee oculta arquivados por default', async () => {
    const idAtivo = await insertDevelopmentDialog(client.db, buildDialog({ titulo: 'ativo' }));
    const idArquivado = await insertDevelopmentDialog(
      client.db,
      buildDialog({ titulo: 'a arquivar' }),
    );
    await archiveDevelopmentDialog(client.db, idArquivado);

    const semArquivados = await listDialogsByLeaderEmployee(client.db, liderId, liderado1Id);
    expect(semArquivados.map((d) => d.id)).toEqual([idAtivo]);

    const comArquivados = await listDialogsByLeaderEmployee(client.db, liderId, liderado1Id, true);
    expect(comArquivados.length).toBe(2);
  });

  it('listPendenciasByLeader retorna so pendencia=true e arquivado=false', async () => {
    const idSemPend = await insertDevelopmentDialog(client.db, buildDialog({ titulo: 'sem' }));
    const idComPend = await insertDevelopmentDialog(client.db, buildDialog({ titulo: 'com' }));
    await setDevelopmentDialogPendencia(client.db, idComPend, true);
    const idPendArq = await insertDevelopmentDialog(client.db, buildDialog({ titulo: 'p+a' }));
    await setDevelopmentDialogPendencia(client.db, idPendArq, true);
    await archiveDevelopmentDialog(client.db, idPendArq);

    const pendencias = await listPendenciasByLeader(client.db, liderId);
    expect(pendencias.map((d) => d.id)).toEqual([idComPend]);
    expect(idSemPend).toBeGreaterThan(0);
  });

  it('FK RESTRICT bloqueia liderId ou employeeId inexistente', async () => {
    await expect(
      insertDevelopmentDialog(client.db, buildDialog({ liderId: 999999 })),
    ).rejects.toThrow();
    await expect(
      insertDevelopmentDialog(client.db, buildDialog({ employeeId: 999999 })),
    ).rejects.toThrow();
  });

  it('lista dialogos de outro liderado nao aparece na consulta do primeiro', async () => {
    await insertDevelopmentDialog(client.db, buildDialog({ titulo: 'A' }));
    await insertDevelopmentDialog(client.db, buildDialog({ employeeId: liderado2Id, titulo: 'B' }));
    const paraLid1 = await listDialogsByLeaderEmployee(client.db, liderId, liderado1Id);
    expect(paraLid1.length).toBe(1);
    expect(paraLid1[0]?.titulo).toBe('A');
  });

  it('deleteDevelopmentDialogsByCompany remove tudo da empresa', async () => {
    await insertDevelopmentDialog(client.db, buildDialog());
    await insertDevelopmentDialog(client.db, buildDialog());
    const afetadas = await deleteDevelopmentDialogsByCompany(client.db, companyId);
    expect(afetadas).toBe(2);
  });
});
