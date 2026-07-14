// ROIP APP 9BOX — teste de integracao `monthlyUnlockLog` (ME-013).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). Cria company local com CNPJ unico do arquivo (S009),
// employee local (para cobrir polimorfismo `liderTipo='employee'`) e
// cLevelMember local (para cobrir `liderTipo='clevel'`). Reusa a
// fixture `superAdmins.id=1` como autor do desbloqueio.
//
// Cobre:
// - INSERT com os 3 valores canonicos de `aba` (`rh`, `lider`,
//   `faturamento`).
// - Padrao B em (liderTipo, liderId): preenchido apenas quando
//   `aba='lider'`; polimorfismo `employee | clevel` sem FK formal (o
//   liderId nao valida contra employees/cLevelMembers).
// - Multiplos desbloqueios do mesmo (companyId, mes): permitidos
//   (§7.7 — nao ha UNIQUE).
// - Listagem por empresa e por mes em ordem cronologica decrescente
//   (mais recente primeiro, desempate por id desc).
// - Excecao append-only §2.4: `markMonthlyUnlockJanelaExpirada` grava
//   `houveAlteracao`.
// - FK RESTRICT em `desbloqueadoPor` (superAdmin invalido reprova).
//
// Cleanup:
// - `beforeEach`: apaga apenas `monthlyUnlockLog` (isolamento).
// - `afterAll`: apaga o escopo + employee + cLevel + company (L32).

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, monthlyUnlockLog } from '../../src/db/schema';
import {
  getMonthlyUnlockLogById,
  insertMonthlyUnlockLog,
  listMonthlyUnlockLogByCompany,
  listMonthlyUnlockLogByMonth,
  markMonthlyUnlockJanelaExpirada,
  type NewMonthlyUnlockLog,
} from '../../src/server/services/monthlyUnlockLog';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const LOCAL_CNPJ = '10000000000114';
const SUPER_ADMIN_FIXTURE_ID = 1;

// Justificativa canonica dentro do intervalo 100-500 (§2.5) — a validacao
// vive no caller (Bloco B3); aqui apenas geramos uma string plausivel.
const JUSTIFICATIVA_VALIDA =
  'Justificativa canonica de teste com mais de cem caracteres para respeitar o ' +
  'intervalo do padrao global 100-500 caracteres da regra §2.5, empregada nos ' +
  'casos de desbloqueio administrativo mensal.';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function buildValidUnlock(
  companyId: number,
  overrides: Partial<NewMonthlyUnlockLog> = {},
): NewMonthlyUnlockLog {
  return {
    companyId,
    mes: '2026-01',
    aba: 'rh',
    desbloqueadoPor: SUPER_ADMIN_FIXTURE_ID,
    justificativa: JUSTIFICATIVA_VALIDA,
    expiraEm: daysFromNow(1),
    ...overrides,
  };
}

describe('service monthlyUnlockLog (ME-013)', () => {
  let client: RoipDbClient;
  let companyId: number;
  let liderEmployeeId: number;
  let liderClevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    const [companyRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa MonthlyUnlock Test LTDA',
        nomeFantasia: 'Empresa MonthlyUnlock Test',
        cnpj: LOCAL_CNPJ,
        telefone: '1633330014',
        endereco: 'Rua MonthlyUnlock, 14',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@monthlyunlock.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@monthlyunlock.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!companyRow) throw new Error('beforeAll: falha ao criar company local');
    companyId = companyRow.id;

    // Lider tipo employee.
    const [empRow] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'Lider Employee MUL',
        cpf: '10101010114',
        email: 'lider.employee.mul@roip.local',
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
    if (!empRow) throw new Error('beforeAll: falha ao criar employee lider');
    liderEmployeeId = empRow.id;

    // Lider tipo clevel.
    const [cleRow] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level MUL',
        cpf: '10101010115',
        email: 'clevel.mul@roip.local',
        dataNascimento: new Date('1970-08-20'),
        dataAdmissao: new Date('2010-06-01'),
        cargo: 'CFO',
        descricaoCargo: 'Chief Financial Officer',
        departamento: 'Diretoria',
        custoMensal: '40000.00',
      })
      .$returningId();
    if (!cleRow) throw new Error('beforeAll: falha ao criar cLevelMember lider');
    liderClevelId = cleRow.id;
  });

  afterAll(async () => {
    await client.db.delete(monthlyUnlockLog);
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(monthlyUnlockLog);
  });

  it('insertMonthlyUnlockLog com aba=rh insere e retorna id numerico positivo', async () => {
    const id = await insertMonthlyUnlockLog(client.db, buildValidUnlock(companyId));
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = await getMonthlyUnlockLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada apos insert');
    expect(row.aba).toBe('rh');
    expect(row.liderId).toBeNull();
    expect(row.liderTipo).toBeNull();
    expect(row.houveAlteracao).toBe(false);
    expect(row.unlockRequestId).toBeNull();
  });

  it('insertMonthlyUnlockLog com aba=lider e liderTipo=employee cobre padrao B', async () => {
    const id = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, {
        aba: 'lider',
        liderTipo: 'employee',
        liderId: liderEmployeeId,
      }),
    );
    const row = await getMonthlyUnlockLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada');
    expect(row.aba).toBe('lider');
    expect(row.liderTipo).toBe('employee');
    expect(row.liderId).toBe(liderEmployeeId);
  });

  it('insertMonthlyUnlockLog com aba=lider e liderTipo=clevel cobre padrao B', async () => {
    const id = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, {
        aba: 'lider',
        liderTipo: 'clevel',
        liderId: liderClevelId,
      }),
    );
    const row = await getMonthlyUnlockLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada');
    expect(row.liderTipo).toBe('clevel');
    expect(row.liderId).toBe(liderClevelId);
  });

  it('insertMonthlyUnlockLog com aba=faturamento cobre o terceiro valor do enum', async () => {
    const id = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { aba: 'faturamento' }),
    );
    const row = await getMonthlyUnlockLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada');
    expect(row.aba).toBe('faturamento');
  });

  it('padrao B: liderId inexistente (fora de employees/cLevelMembers) e aceito', async () => {
    // Padrao B nao valida FK — a integridade do par (liderTipo, liderId)
    // e responsabilidade do caller. Aqui provamos que o service persiste
    // um liderId arbitrario sem falhar (id 99999 nao existe em nenhuma
    // das duas tabelas de origem).
    const id = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, {
        aba: 'lider',
        liderTipo: 'employee',
        liderId: 99999,
      }),
    );
    const row = await getMonthlyUnlockLogById(client.db, id);
    if (!row) throw new Error('linha nao encontrada');
    expect(row.liderId).toBe(99999);
  });

  it('multiplos desbloqueios do mesmo (companyId, mes) sao aceitos', async () => {
    // §7.7: nao ha UNIQUE — todos os registros sao preservados.
    const id1 = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { mes: '2026-02' }),
    );
    const id2 = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { mes: '2026-02', aba: 'faturamento' }),
    );
    const id3 = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { mes: '2026-02' }),
    );
    const rows = await listMonthlyUnlockLogByMonth(client.db, companyId, '2026-02');
    expect(rows.length).toBe(3);
    // Ordem: desbloqueadoEm desc, id desc — insercoes em sequencia geram
    // desbloqueadoEm iguais (mesma resolucao de timestamp); o desempate
    // por id desc garante ordem determinística [id3, id2, id1].
    expect(rows.map((r) => r.id)).toEqual([id3, id2, id1]);
  });

  it('listMonthlyUnlockLogByCompany traz todas as abas em ordem id desc', async () => {
    const idA = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { mes: '2026-03', aba: 'rh' }),
    );
    const idB = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { mes: '2026-04', aba: 'faturamento' }),
    );
    const idC = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, {
        mes: '2026-05',
        aba: 'lider',
        liderTipo: 'employee',
        liderId: liderEmployeeId,
      }),
    );
    const rows = await listMonthlyUnlockLogByCompany(client.db, companyId);
    expect(rows.length).toBe(3);
    // desbloqueadoEm iguais, desempate por id desc — [idC, idB, idA].
    expect(rows.map((r) => r.id)).toEqual([idC, idB, idA]);
  });

  it('markMonthlyUnlockJanelaExpirada grava houveAlteracao (append-only §2.4)', async () => {
    const id = await insertMonthlyUnlockLog(
      client.db,
      buildValidUnlock(companyId, { mes: '2026-06' }),
    );
    // Estado inicial: houveAlteracao=false (default).
    const antes = await getMonthlyUnlockLogById(client.db, id);
    expect(antes?.houveAlteracao).toBe(false);
    // Fim de janela: dados foram alterados na janela de 24h.
    const affected = await markMonthlyUnlockJanelaExpirada(client.db, id, true);
    expect(affected).toBe(1);
    const depois = await getMonthlyUnlockLogById(client.db, id);
    if (!depois) throw new Error('linha nao encontrada apos mark');
    expect(depois.houveAlteracao).toBe(true);
    // Verifica que a excecao §2.4 nao mudou nenhum outro campo canonico.
    expect(depois.aba).toBe(antes?.aba);
    expect(depois.mes).toBe(antes?.mes);
    expect(depois.desbloqueadoPor).toBe(antes?.desbloqueadoPor);
    expect(depois.justificativa).toBe(antes?.justificativa);
  });

  it('FK RESTRICT em desbloqueadoPor impede insert com superAdmin inexistente', async () => {
    await expect(
      insertMonthlyUnlockLog(
        client.db,
        buildValidUnlock(companyId, { mes: '2026-07', desbloqueadoPor: 99999 }),
      ),
    ).rejects.toThrow();
  });
});
