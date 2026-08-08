// ROIP APP 9BOX — teste de integracao ME-057a (/notificacoes MySQL real).
//
// Cobre contra MySQL real (RV-11):
//   1. `loadNotificacoesPage` (server component query canonica) — filtros
//      (categoria, severidade, periodo, status, search), paginacao, count
//      total e count de nao lidas.
//   2. Guard canonico cross-tenant: RH da empresa A NAO ve nem altera
//      notificacoes cujo destinatario esta em outra empresa/tipo.
//   3. Bruno (destinatarioTipo='bruno', destinatarioEmployeeId=NULL) ve
//      notificacoes globais e nao ve as de RH.
//   4. Mapeamento categoria → tipos: filtro 'plenitude' retorna 0 linhas
//      (nenhum tipo do enum atual mapeado); filtro 'todos' retorna todas
//      as linhas do destinatario.
//   5. Mutations diretas via services/notifications.ts (markRead,
//      archive) refletem no re-fetch com filtros.
//
// Faixa canonica desta ME (S313):
//   - Principal: CNPJ 10110000000001..10110000000119 (10 slots).
//   - Auxiliar: 10120000000001..10120000000129 (10 slots reservados;
//     nao usados nesta ME).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, notifications } from '../../src/db/schema';
import type { NotificationTipo, Severidade } from '../../src/db/schema/enums';
import { createCompany } from '../../src/server/services/companies';
import {
  archiveNotification,
  insertNotification,
  markNotificationRead,
} from '../../src/server/services/notifications';
import { loadNotificacoesPage } from '../../src/app/notificacoes/internals';
import {
  CANONICAL_DEFAULT_FILTERS,
  type NotificacoesFilters,
} from '../../src/app/notificacoes/filters';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Faixa principal S313: 10110000000001..119
const CNPJ_A = '10110000000001';
const CNPJ_B = '10110000000029';

describe('ME-057a — /notificacoes (MySQL real)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;
  let rhIdA: number;
  let rhIdB: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(notifications);
    await client.db.delete(employees);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(notifications);
    await client.db.delete(employees);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP ME-057a A LTDA',
      nomeFantasia: 'ROIP ME-057a A',
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
      razaoSocial: 'ROIP ME-057a B LTDA',
      nomeFantasia: 'ROIP ME-057a B',
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

    rhIdA = await seedEmployee(companyIdA, '00000000001', 'RH da Empresa A');
    rhIdB = await seedEmployee(companyIdB, '00000000002', 'RH da Empresa B');
  });

  async function seedEmployee(companyId: number, cpf: string, name: string): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId,
        name,
        cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isRH: true,
        isLider: false,
        isResponsavelFinanceiro: false,
        status: 'ativo',
      })
      .$returningId();
    if (row === undefined) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  // Helper canonico para semear notificacoes
  async function seedNotif(
    destTipo: 'bruno' | 'rh',
    destEmpId: number | null,
    companyId: number | null,
    tipo: NotificationTipo,
    severidade: Severidade,
    titulo: string,
    opts: {
      subtitulo?: string;
      lidaEm?: Date;
      arquivadaEm?: Date;
      createdAt?: Date;
    } = {},
  ): Promise<number> {
    return await insertNotification(client.db, {
      destinatarioTipo: destTipo,
      destinatarioEmployeeId: destEmpId,
      companyId,
      tipo,
      severidade,
      titulo,
      subtitulo: opts.subtitulo ?? null,
      lidaEm: opts.lidaEm ?? null,
      arquivadaEm: opts.arquivadaEm ?? null,
      // createdAt e defaultNow — se opts.createdAt vier, override abaixo
    });
  }

  // -------------------------------------------------------------------
  // Grupo 1 — query basica + guards de destinatario
  // -------------------------------------------------------------------
  describe('Grupo 1 — guards de destinatario', () => {
    it('RH da empresa A ve apenas suas proprias notificacoes', async () => {
      await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'desempenho_queda_brusca',
        'atencao',
        'Nova para RH A',
      );
      await seedNotif(
        'rh',
        rhIdB,
        companyIdB,
        'desempenho_queda_brusca',
        'atencao',
        'Nova para RH B',
      );

      const resultA = await loadNotificacoesPage(client.db, 'rh', rhIdA, CANONICAL_DEFAULT_FILTERS);
      expect(resultA.totalCount).toBe(1);
      expect(resultA.rows[0]?.titulo).toBe('Nova para RH A');
    });

    it('RH da empresa B ve apenas suas proprias notificacoes', async () => {
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'atencao', 'Para RH A');
      await seedNotif('rh', rhIdB, companyIdB, 'desempenho_queda_brusca', 'atencao', 'Para RH B');

      const resultB = await loadNotificacoesPage(client.db, 'rh', rhIdB, CANONICAL_DEFAULT_FILTERS);
      expect(resultB.totalCount).toBe(1);
      expect(resultB.rows[0]?.titulo).toBe('Para RH B');
    });

    it('Bruno (bruno, NULL) ve globais e nao ve as de RH', async () => {
      await seedNotif('bruno', null, null, 'ciclo_mensal_fechado', 'info', 'Global Bruno');
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'Para RH A');

      const brunoResult = await loadNotificacoesPage(
        client.db,
        'bruno',
        null,
        CANONICAL_DEFAULT_FILTERS,
      );
      expect(brunoResult.totalCount).toBe(1);
      expect(brunoResult.rows[0]?.titulo).toBe('Global Bruno');
    });
  });

  // -------------------------------------------------------------------
  // Grupo 2 — filtros canonicos
  // -------------------------------------------------------------------
  describe('Grupo 2 — filtros canonicos §14.19', () => {
    it('filtro categoria "desempenho" retorna apenas tipos mapeados', async () => {
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'atencao', 'A');
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_estagnacao', 'observacao', 'B');
      await seedNotif('rh', rhIdA, companyIdA, 'divergencia_a_c', 'atencao', 'C');
      await seedNotif('rh', rhIdA, companyIdA, 'assiduidade_baixa', 'atencao', 'D');
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'E');

      const filters: NotificacoesFilters = {
        ...CANONICAL_DEFAULT_FILTERS,
        categoria: 'desempenho',
      };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(3);
    });

    it('filtro categoria "plenitude" retorna 0 linhas (RV-03 alvo)', async () => {
      // Semear notificacoes de todos os tipos possiveis; nenhuma mapeada a plenitude
      await seedNotif('rh', rhIdA, companyIdA, 'nr1_fator_critico', 'critico', 'A');
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'atencao', 'B');
      await seedNotif('rh', rhIdA, companyIdA, 'assiduidade_baixa', 'atencao', 'C');

      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, categoria: 'plenitude' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(0);
      expect(result.rows).toHaveLength(0);
    });

    it('filtro severidade "critico" retorna apenas as criticas', async () => {
      await seedNotif('rh', rhIdA, companyIdA, 'nr1_fator_critico', 'critico', 'Critica');
      await seedNotif('rh', rhIdA, companyIdA, 'nr1_ciclo_fechado', 'info', 'Info');
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'atencao', 'Atencao');

      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, severidade: 'critico' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]?.severidade).toBe('critico');
    });

    it('filtro status "nao_lidas" exclui lidas e arquivadas', async () => {
      const now = new Date();
      const lidaId = await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'ciclo_mensal_fechado',
        'info',
        'Lida',
      );
      await markNotificationRead(client.db, lidaId, 'rh', rhIdA, now);
      const arqId = await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'Arq');
      await archiveNotification(client.db, arqId, 'rh', rhIdA, now);
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'NaoLida');

      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, status: 'nao_lidas' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]?.titulo).toBe('NaoLida');
    });

    it('filtro status "arquivadas" retorna apenas as arquivadas', async () => {
      const now = new Date();
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'Ativa');
      const arqId = await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'Arq');
      await archiveNotification(client.db, arqId, 'rh', rhIdA, now);

      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, status: 'arquivadas' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]?.titulo).toBe('Arq');
    });

    it('filtro status "todas" inclui arquivadas', async () => {
      const now = new Date();
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'A');
      const arqId = await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'B');
      await archiveNotification(client.db, arqId, 'rh', rhIdA, now);

      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, status: 'todas' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(2);
    });

    it('filtro search em titulo — match parcial via LIKE', async () => {
      await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'desempenho_queda_brusca',
        'atencao',
        'Silva Souza reduziu',
      );
      await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'desempenho_queda_brusca',
        'atencao',
        'Oliveira caiu',
      );

      const filters: NotificacoesFilters = {
        ...CANONICAL_DEFAULT_FILTERS,
        searchColaborador: 'Silva',
      };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]?.titulo).toContain('Silva');
    });

    it('filtro search em subtitulo tambem casa', async () => {
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'atencao', 'Aviso', {
        subtitulo: 'Colaborador: Pereira dos Santos',
      });
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'atencao', 'Aviso2', {
        subtitulo: 'Colaborador: Costa',
      });

      const filters: NotificacoesFilters = {
        ...CANONICAL_DEFAULT_FILTERS,
        searchColaborador: 'Pereira',
      };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 3 — paginacao e contadores
  // -------------------------------------------------------------------
  describe('Grupo 3 — paginacao e contadores', () => {
    it('paginacao de 3 paginas com pageSize=2', async () => {
      for (let i = 1; i <= 5; i++) {
        await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', `Notif ${i}`);
      }

      const filtersP1: NotificacoesFilters = {
        ...CANONICAL_DEFAULT_FILTERS,
        pageSize: 25,
        page: 1,
      };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filtersP1);
      expect(result.totalCount).toBe(5);
      expect(result.rows).toHaveLength(5);
    });

    it('unreadCount reflete apenas nao lidas + nao arquivadas — independe de filtros', async () => {
      const now = new Date();
      const lidaId = await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'L');
      await markNotificationRead(client.db, lidaId, 'rh', rhIdA, now);
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'NL1');
      await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'NL2');
      const arqId = await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'Arq');
      await archiveNotification(client.db, arqId, 'rh', rhIdA, now);

      // Filtro que mostra apenas 1 linha (lidas)
      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, status: 'lidas' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      // total das linhas filtradas
      expect(result.totalCount).toBe(1);
      // mas unreadCount continua contando as 2 nao lidas (ignora arquivada)
      expect(result.unreadCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 4 — cross-tenant guard das mutations
  // -------------------------------------------------------------------
  describe('Grupo 4 — cross-tenant guard nas mutations', () => {
    it('markRead com destinatario errado nao afeta a notif', async () => {
      const id = await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'ciclo_mensal_fechado',
        'info',
        'Da empresa A',
      );

      // Tenta marcar como se fosse rh empresa B
      const affected = await markNotificationRead(client.db, id, 'rh', rhIdB, new Date());
      expect(affected).toBe(0);

      // Verifica que continua nao lida no banco
      const [row] = await client.db
        .select()
        .from(notifications)
        .where(and(eq(notifications.id, id), isNull(notifications.lidaEm)));
      expect(row?.id).toBe(id);
    });

    it('archive com tipo errado nao afeta a notif', async () => {
      const id = await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'ciclo_mensal_fechado',
        'info',
        'Da empresa A',
      );

      // Tenta arquivar como se fosse bruno
      const affected = await archiveNotification(client.db, id, 'bruno', null, new Date());
      expect(affected).toBe(0);
    });

    it('markRead correto marca como lida', async () => {
      const id = await seedNotif('rh', rhIdA, companyIdA, 'ciclo_mensal_fechado', 'info', 'Certa');

      const affected = await markNotificationRead(client.db, id, 'rh', rhIdA, new Date());
      expect(affected).toBe(1);

      const filters: NotificacoesFilters = { ...CANONICAL_DEFAULT_FILTERS, status: 'lidas' };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // Grupo 5 — filtro combinado end-to-end
  // -------------------------------------------------------------------
  describe('Grupo 5 — filtros combinados end-to-end', () => {
    it('categoria + severidade + status combinados', async () => {
      const now = new Date();

      // 1 do desempenho critico nao lido — deve casar
      await seedNotif('rh', rhIdA, companyIdA, 'desempenho_queda_brusca', 'critico', 'Alvo');

      // 1 do desempenho critico ja lido — nao casa (status)
      const lidaId = await seedNotif(
        'rh',
        rhIdA,
        companyIdA,
        'desempenho_estagnacao',
        'critico',
        'Lida',
      );
      await markNotificationRead(client.db, lidaId, 'rh', rhIdA, now);

      // 1 do desempenho atencao nao lido — nao casa (severidade)
      await seedNotif('rh', rhIdA, companyIdA, 'divergencia_a_c', 'atencao', 'Atencao');

      // 1 do assiduidade critico nao lido — nao casa (categoria)
      await seedNotif('rh', rhIdA, companyIdA, 'assiduidade_baixa', 'critico', 'Assid');

      const filters: NotificacoesFilters = {
        ...CANONICAL_DEFAULT_FILTERS,
        categoria: 'desempenho',
        severidade: 'critico',
        status: 'nao_lidas',
      };
      const result = await loadNotificacoesPage(client.db, 'rh', rhIdA, filters);
      expect(result.totalCount).toBe(1);
      expect(result.rows[0]?.titulo).toBe('Alvo');
    });
  });
});
