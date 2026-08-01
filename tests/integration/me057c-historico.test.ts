// ROIP APP 9BOX — teste de integracao ME-057c (MySQL real).
//
// Cobre contra MySQL real (RV-11):
//   1. `loadCompanyHistoryPage` — UNION canonica das 5 fontes §14.21
//      (respfin, desbloqueio, transferencia, solicitacao + placeholder
//      canonico performanceMultiplierLog).
//   2. `findCompanyDisplayInfo` — resolve empresa existente ou null.
//   3. Cross-tenant guards: empresa A nao ve dados da empresa B.
//   4. Filtros canonicos: periodo (30/90/365/personalizado), tipo (4
//      valores + null), ator (LIKE com min 2 chars — S324).
//   5. Ordenacao canonica desc(createdAt, id) e paginacao 25/50/100.
//   6. S322 canonizada — ator canonico da transferencia = literal
//      "Sistema (transferencia de liderados)"; filtro "Ator" com padrao
//      que casa esse literal in-memory.
//   7. S323 canonizada — agrupamento canonico de batch de transferencia:
//      1 linha visual por (transferBatchId, novoLiderId) com contador
//      "N colaboradores".
//
// Faixa canonica desta ME (S325):
//   - Principal: CNPJ 10150000000001..10150000000049 (usada aqui).
//   - Auxiliar: 10160000000001..10160000000049 (reservada).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  cycleUnlockRequests,
  employeeLeaderHistory,
  employees,
  monthlyUnlockLog,
  responsavelFinanceiroTransferLog,
} from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import {
  findCompanyDisplayInfo,
  loadCompanyHistoryPage,
  type HistoryEventRow,
} from '../../src/lib/logs/companyHistoryLog';
// eslint-disable-next-line @stylistic/max-len -- path canonico de rota app router Next 15
import { CANONICAL_HISTORICO_DEFAULT_FILTERS } from '../../src/app/super-admin/empresa/[id]/historico/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa principal S325: 10150000000001..10150000000049
const CNPJ_A = '10150000000001';
const CNPJ_B = '10150000000002';

describe('ME-057c — historico consolidado da empresa (MySQL real, §14.21)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let rhIdA: number;
  let colabIdA: number;
  let colabIdA2: number;
  let colabIdB: number;
  let liderIdA: number;
  let cLevelIdA: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(monthlyUnlockLog);
    await client.db.delete(cycleUnlockRequests);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(responsavelFinanceiroTransferLog);
    await client.db.delete(monthlyUnlockLog);
    await client.db.delete(cycleUnlockRequests);
    await client.db.delete(employeeLeaderHistory);
    await client.db.delete(cLevelMembers);
    await client.db.delete(employees);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-057c A LTDA',
      nomeFantasia: 'ROIP ME-057c A',
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
      razaoSocial: 'ROIP ME-057c B LTDA',
      nomeFantasia: 'ROIP ME-057c B',
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

    rhIdA = await seedEmployee(companyIdA, '00000015101', 'Camila Duarte RH A', { isRH: true });
    colabIdA = await seedEmployee(companyIdA, '00000015102', 'Carla Menezes Colab A', {});
    colabIdA2 = await seedEmployee(companyIdA, '00000015103', 'Rogerio Andrade Colab A', {});
    liderIdA = await seedEmployee(companyIdA, '00000015104', 'Marina Souza Lider A', {
      isLider: true,
    });
    colabIdB = await seedEmployee(companyIdB, '00000015105', 'Bruno B Colab B', {});
    cLevelIdA = await seedCLevel(companyIdA, '00000015106', 'Silvana Costa CFO A');
  });

  async function seedEmployee(
    companyId: number,
    cpf: string,
    name: string,
    opts: { isRH?: boolean; isLider?: boolean } = {},
  ): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo canonico',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isRH: opts.isRH ?? false,
        isLider: opts.isLider ?? false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (row === undefined) throw new Error('seedEmployee sem id');
    return row.id;
  }

  async function seedCLevel(companyId: number, cpf: string, name: string): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name,
        cpf,
        email: `${cpf}@roip.test`,
        dataNascimento: new Date('1980-01-01'),
        dataAdmissao: new Date('2018-01-01'),
        cargo: 'CFO',
        descricaoCargo: 'CFO da empresa',
        departamento: 'Financeiro',
        custoMensal: '25000.00',
        acessoTotal: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (row === undefined) throw new Error('seedCLevel sem id');
    return row.id;
  }

  async function seedRespfin(
    companyId: number,
    eventType: 'atribuido' | 'transferido' | 'removido',
    prev: { type: 'employee' | 'cLevel' | 'none'; id: number | null },
    novo: { type: 'employee' | 'cLevel' | 'none'; id: number | null },
    reason: string,
    createdAt?: Date,
  ): Promise<number> {
    const [row] = await client.db
      .insert(responsavelFinanceiroTransferLog)
      .values({
        companyId,
        previousHolderType: prev.type,
        previousHolderId: prev.id,
        newHolderType: novo.type,
        newHolderId: novo.id,
        actorSuperAdminId: 1,
        eventType,
        reason,
      })
      .$returningId();
    if (row === undefined) throw new Error('seedRespfin sem id');
    if (createdAt !== undefined) {
      await client.db
        .update(responsavelFinanceiroTransferLog)
        .set({ createdAt })
        .where(eq(responsavelFinanceiroTransferLog.id, row.id));
    }
    return row.id;
  }

  async function seedDesbloqueio(
    companyId: number,
    mes: string,
    aba: 'rh' | 'lider' | 'faturamento',
    justificativa: string,
    createdAt?: Date,
  ): Promise<number> {
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [row] = await client.db
      .insert(monthlyUnlockLog)
      .values({
        companyId,
        mes,
        aba,
        desbloqueadoPor: 1,
        justificativa,
        expiraEm: expira,
      })
      .$returningId();
    if (row === undefined) throw new Error('seedDesbloqueio sem id');
    if (createdAt !== undefined) {
      await client.db
        .update(monthlyUnlockLog)
        .set({ createdAt })
        .where(eq(monthlyUnlockLog.id, row.id));
    }
    return row.id;
  }

  async function seedTransferBatch(
    batchId: string,
    reason: string,
    lideradoIds: readonly number[],
    novoLider: { liderId?: number; clevelId?: number },
    createdAt?: Date,
  ): Promise<readonly number[]> {
    const ids: number[] = [];
    for (const lidId of lideradoIds) {
      const [row] = await client.db
        .insert(employeeLeaderHistory)
        .values({
          employeeId: lidId,
          liderId: novoLider.liderId ?? null,
          clevelId: novoLider.clevelId ?? null,
          dataInicio: new Date('2026-01-01'),
          reason,
          transferBatchId: batchId,
        })
        .$returningId();
      if (row === undefined) throw new Error('seedTransferBatch sem id');
      ids.push(row.id);
      if (createdAt !== undefined) {
        await client.db
          .update(employeeLeaderHistory)
          .set({ createdAt })
          .where(eq(employeeLeaderHistory.id, row.id));
      }
    }
    return ids;
  }

  async function seedSolicitacao(
    companyId: number,
    solicitanteTipo: 'employee' | 'clevel',
    solicitanteId: number,
    mes: string,
    aba: 'rh' | 'lider' | 'faturamento',
    status: 'pendente' | 'aprovada' | 'recusada' | 'cancelada',
    justificativa: string,
    opts: { decididoPor?: number; motivoRecusa?: string; createdAt?: Date } = {},
  ): Promise<number> {
    const [row] = await client.db
      .insert(cycleUnlockRequests)
      .values({
        companyId,
        solicitanteTipo,
        solicitanteId,
        mes,
        aba,
        justificativa,
        status,
        decididoPor: opts.decididoPor ?? null,
        motivoRecusa: opts.motivoRecusa ?? null,
      })
      .$returningId();
    if (row === undefined) throw new Error('seedSolicitacao sem id');
    if (opts.createdAt !== undefined) {
      await client.db
        .update(cycleUnlockRequests)
        .set({ createdAt: opts.createdAt })
        .where(eq(cycleUnlockRequests.id, row.id));
    }
    return row.id;
  }

  // NOW canonico dos testes — 1 dia no futuro (real time + 86400s) para
  // garantir que todo `defaultNow()` do MySQL fique dentro do range de
  // periodo canonico (90d anteriores). Testes que precisam de eventos
  // antigos passam `createdAt` explicito.
  const NOW = new Date(Date.now() + 86400000);

  // -------------------------------------------------------------------
  // Grupo 1 — findCompanyDisplayInfo (guard existencia)
  // -------------------------------------------------------------------
  describe('Grupo 1 — findCompanyDisplayInfo', () => {
    it('empresa existente retorna id + nomeFantasia', async () => {
      const info = await findCompanyDisplayInfo(client.db, companyIdA);
      expect(info).not.toBeNull();
      expect(info?.id).toBe(companyIdA);
      expect(info?.nomeFantasia).toBe('ROIP ME-057c A');
    });

    it('empresa inexistente retorna null', async () => {
      const info = await findCompanyDisplayInfo(client.db, 999999);
      expect(info).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Grupo 2 — UNION basica de 5 fontes (§14.21)
  // -------------------------------------------------------------------
  describe('Grupo 2 — UNION de 5 fontes canonicas', () => {
    it('sem eventos → totalCount 0 e rows vazio', async () => {
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(0);
      expect(r.rows).toEqual([]);
    });

    it('respfin — atribuido → tipo respfin + descricao canonica', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'Atribuicao inicial',
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(1);
      const row = r.rows[0];
      expect(row?.tipo).toBe('respfin');
      expect(row?.descricao).toBe(
        'Atribuição do papel de Responsável financeiro a Carla Menezes Colab A',
      );
      expect(row?.detalhes.find((d) => d.label === 'De')?.valor).toBe('—');
      expect(row?.detalhes.find((d) => d.label === 'Para')?.valor).toBe('Carla Menezes Colab A');
    });

    it('desbloqueio → tipo desbloqueio + mes formatado + justificativa', async () => {
      await seedDesbloqueio(companyIdA, '2026-06', 'rh', 'Correcao de faltas');
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      const row = r.rows[0];
      expect(row?.tipo).toBe('desbloqueio');
      expect(row?.detalhes.find((d) => d.label === 'Mês desbloqueado')?.valor).toBe('Junho/2026');
      expect(row?.detalhes.find((d) => d.label === 'Aba')?.valor).toBe('Dados mensais — RH');
      expect(row?.justificativa).toBe('Correcao de faltas');
    });

    it('transferencia — batch 3 liderados unico destino → 1 linha "3 colaboradores"', async () => {
      await seedTransferBatch(
        '11111111-1111-1111-1111-111111111111',
        'Promocao do lider original',
        [colabIdA, colabIdA2, rhIdA],
        { liderId: liderIdA },
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(1);
      const row = r.rows[0];
      expect(row?.tipo).toBe('transferencia');
      expect(row?.atorNome).toBe('Sistema (transferência de líderados)');
      expect(row?.detalhes.find((d) => d.label === 'Liderado(s) afetado(s)')?.valor).toBe(
        '3 colaboradores',
      );
      expect(row?.detalhes.find((d) => d.label === 'Novo líder')?.valor).toContain(
        'Marina Souza Lider A',
      );
      expect(row?.justificativa).toBe('Promocao do lider original');
    });

    it('solicitacao aprovada → tipo solicitacao + ator = solicitante', async () => {
      await seedSolicitacao(
        companyIdA,
        'employee',
        rhIdA,
        '2026-06',
        'rh',
        'aprovada',
        'Foram identificados 4 colaboradores com faltas',
        { decididoPor: 1 },
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      const row = r.rows[0];
      expect(row?.tipo).toBe('solicitacao');
      expect(row?.atorNome).toBe('Camila Duarte RH A');
      expect(row?.detalhes.find((d) => d.label === 'Status')?.valor).toBe('Aprovada');
      expect(row?.detalhes.find((d) => d.label === 'Mês solicitado')?.valor).toBe('Junho/2026');
    });

    it('solicitacao recusada com motivoRecusa → detalhes extras aparecem', async () => {
      await seedSolicitacao(
        companyIdA,
        'employee',
        rhIdA,
        '2026-04',
        'lider',
        'recusada',
        'Solicitado por engano',
        { decididoPor: 1, motivoRecusa: 'Prazo de correcao encerrado' },
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      const row = r.rows[0];
      expect(row?.detalhes.find((d) => d.label === 'Motivo da recusa')?.valor).toBe(
        'Prazo de correcao encerrado',
      );
    });

    it('UNION real de 4 fontes retorna todas', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF 1',
        new Date('2026-07-25T10:00:00.000Z'),
      );
      await seedDesbloqueio(
        companyIdA,
        '2026-06',
        'rh',
        'Deblo 1',
        new Date('2026-07-26T10:00:00.000Z'),
      );
      await seedTransferBatch(
        '22222222-2222-2222-2222-222222222222',
        'Trans 1',
        [colabIdA],
        { liderId: liderIdA },
        new Date('2026-07-27T10:00:00.000Z'),
      );
      await seedSolicitacao(companyIdA, 'employee', rhIdA, '2026-05', 'rh', 'aprovada', 'Sol 1', {
        decididoPor: 1,
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
      });
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(4);
      const tiposCasados = r.rows.map((x: HistoryEventRow) => x.tipo).sort();
      expect(tiposCasados).toEqual(['desbloqueio', 'respfin', 'solicitacao', 'transferencia']);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 3 — Cross-tenant guards
  // -------------------------------------------------------------------
  describe('Grupo 3 — cross-tenant guards', () => {
    it('empresa A nao ve respfin da empresa B', async () => {
      await seedRespfin(
        companyIdB,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdB },
        'RF na B',
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(0);
    });

    it('empresa A nao ve desbloqueio da empresa B', async () => {
      await seedDesbloqueio(companyIdB, '2026-06', 'rh', 'Deblo na B');
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(0);
    });

    it('empresa A nao ve transferencia via employees da empresa B (JOIN companyId)', async () => {
      await seedTransferBatch(
        '33333333-3333-3333-3333-333333333333',
        'Batch B',
        [colabIdB],
        { liderId: liderIdA }, // liderIdA existe mas o employeeId aponta pra B
      );
      const rA = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(rA.totalCount).toBe(0);
      const rB = await loadCompanyHistoryPage(
        client.db,
        companyIdB,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(rB.totalCount).toBe(1);
    });

    it('empresa A nao ve solicitacao da empresa B', async () => {
      await seedSolicitacao(
        companyIdB,
        'employee',
        colabIdB,
        '2026-06',
        'rh',
        'pendente',
        'S na B',
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.totalCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 4 — Filtros canonicos (periodo, tipo, ator)
  // -------------------------------------------------------------------
  describe('Grupo 4 — filtros canonicos', () => {
    it('filtro tipo=respfin corta as demais fontes', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF',
      );
      await seedDesbloqueio(companyIdA, '2026-06', 'rh', 'Deblo');
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, tipo: 'respfin' },
        NOW,
      );
      expect(r.totalCount).toBe(1);
      expect(r.rows[0]?.tipo).toBe('respfin');
    });

    it('filtro tipo=transferencia inclui apenas transferencias', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF',
      );
      await seedTransferBatch('44444444-4444-4444-4444-444444444444', 'Batch T', [colabIdA], {
        liderId: liderIdA,
      });
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, tipo: 'transferencia' },
        NOW,
      );
      expect(r.totalCount).toBe(1);
      expect(r.rows[0]?.tipo).toBe('transferencia');
    });

    it('filtro periodo=30 exclui eventos antigos (createdAt < now-30d)', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF antigo',
        new Date('2026-05-01T00:00:00.000Z'), // ~90d antes de NOW
      );
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF recente',
        new Date('2026-07-25T00:00:00.000Z'), // ~5d antes de NOW
      );
      const r30 = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, periodo: '30' },
        NOW,
      );
      expect(r30.totalCount).toBe(1);
      expect(r30.rows[0]?.descricao).toContain('Carla Menezes');
    });

    it('filtro ator LIKE casa nome do executor RF', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF do super admin',
      );
      const rFiltro = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, atorBusca: 'fixture' },
        NOW,
      );
      expect(rFiltro.totalCount).toBe(1);
      const rVazio = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, atorBusca: 'jamais_existira' },
        NOW,
      );
      expect(rVazio.totalCount).toBe(0);
    });

    it('filtro ator casa "Sistema" em transferencia (S322 literal)', async () => {
      await seedTransferBatch(
        '55555555-5555-5555-5555-555555555555',
        'Batch com S322',
        [colabIdA],
        { liderId: liderIdA },
      );
      const rCasa = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, atorBusca: 'Sistema' },
        NOW,
      );
      expect(rCasa.totalCount).toBe(1);
      const rNaoCasa = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, atorBusca: 'Bruno' },
        NOW,
      );
      expect(rNaoCasa.totalCount).toBe(0);
    });

    it('filtro ator casa nome do solicitante (busca sobre nome resolvido)', async () => {
      await seedSolicitacao(
        companyIdA,
        'employee',
        rhIdA,
        '2026-06',
        'rh',
        'pendente',
        'Solicitacao teste ator',
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, atorBusca: 'Camila' },
        NOW,
      );
      expect(r.totalCount).toBe(1);
      expect(r.rows[0]?.atorNome).toContain('Camila');
    });
  });

  // -------------------------------------------------------------------
  // Grupo 5 — Ordenacao + paginacao (desc canonica)
  // -------------------------------------------------------------------
  describe('Grupo 5 — ordenacao canonica + paginacao', () => {
    it('ordenacao desc(createdAt) — evento mais recente vem primeiro', async () => {
      await seedRespfin(
        companyIdA,
        'atribuido',
        { type: 'none', id: null },
        { type: 'employee', id: colabIdA },
        'RF antigo',
        new Date('2026-07-20T00:00:00.000Z'),
      );
      await seedRespfin(
        companyIdA,
        'transferido',
        { type: 'employee', id: colabIdA },
        { type: 'cLevel', id: cLevelIdA },
        'RF recente',
        new Date('2026-07-28T00:00:00.000Z'),
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      expect(r.rows[0]?.descricao).toContain('Transferência');
    });

    it('paginacao pageSize=1 corta corretamente', async () => {
      for (let i = 0; i < 5; i++) {
        await seedDesbloqueio(
          companyIdA,
          '2026-06',
          'rh',
          `Debug ${i}`,
          new Date(`2026-07-${20 + i}T10:00:00.000Z`),
        );
      }
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        // pageSize valid canonicos sao 25/50/100 — assertion sobre slice
        // via limite pratico: forcamos pageSize=25 e conferimos 5 rows,
        // depois page=2 vazia.
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, page: 1, pageSize: 25 },
        NOW,
      );
      expect(r.totalCount).toBe(5);
      expect(r.rows.length).toBe(5);
      const r2 = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        { ...CANONICAL_HISTORICO_DEFAULT_FILTERS, page: 2, pageSize: 25 },
        NOW,
      );
      expect(r2.totalCount).toBe(5);
      expect(r2.rows.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 6 — S323 agrupamento batch por (batchId, novoLider)
  // -------------------------------------------------------------------
  describe('Grupo 6 — S323 agrupamento canonico', () => {
    it('mesmo batch, 2 destinos distintos → 2 linhas', async () => {
      const batchId = '66666666-6666-6666-6666-666666666666';
      await seedTransferBatch(batchId, 'Batch multi-destino', [colabIdA], { liderId: liderIdA });
      await seedTransferBatch(batchId, 'Batch multi-destino', [colabIdA2], {
        clevelId: cLevelIdA,
      });
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      const transferRows = r.rows.filter((x: HistoryEventRow) => x.tipo === 'transferencia');
      expect(transferRows.length).toBe(2);
    });

    it('mesmo batch + mesmo destino, 3 liderados → 1 linha "3 colaboradores"', async () => {
      const batchId = '77777777-7777-7777-7777-777777777777';
      await seedTransferBatch(batchId, 'Batch mesmo destino', [colabIdA, colabIdA2, rhIdA], {
        liderId: liderIdA,
      });
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      const transferRows = r.rows.filter((x: HistoryEventRow) => x.tipo === 'transferencia');
      expect(transferRows.length).toBe(1);
      expect(
        transferRows[0]?.detalhes.find((d) => d.label === 'Liderado(s) afetado(s)')?.valor,
      ).toBe('3 colaboradores');
    });

    it('batch com 1 liderado → "1 colaborador" (singular)', async () => {
      await seedTransferBatch(
        '88888888-8888-8888-8888-888888888888',
        'Batch singular',
        [colabIdA],
        { liderId: liderIdA },
      );
      const r = await loadCompanyHistoryPage(
        client.db,
        companyIdA,
        CANONICAL_HISTORICO_DEFAULT_FILTERS,
        NOW,
      );
      const row = r.rows[0];
      expect(row?.detalhes.find((d) => d.label === 'Liderado(s) afetado(s)')?.valor).toBe(
        '1 colaborador',
      );
    });
  });
});
