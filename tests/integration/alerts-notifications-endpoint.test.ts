// ROIP APP 9BOX — teste integracao /api/notifications (ME-059).
// Cobre §10.2 (getUnreadCount) + §10.4 (listUnread) + endpoint canonico
// de marcacao read/archive via PATCH.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, employees, notifications, superAdmins } from '../../src/db/schema';
import { GET, PATCH } from '../../src/app/api/notifications/route';
import { __setNotificationsRouteDbClient } from '../../src/app/api/notifications/internals';
import type { ServerSession } from '../../src/server/session/serverSession';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Mock canonico do getServerSession — cada teste ajusta a sessao.
let mockSession: ServerSession | null = null;

vi.mock('../../src/server/session/serverSession', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getServerSession: async (): Promise<ServerSession | null> => mockSession,
  };
});

describe('/api/notifications — GET + PATCH canonicos §10.2/§10.4', () => {
  let client: RoipDbClient;
  let companyId: number;
  let brunoId: number;
  let rhId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
    __setNotificationsRouteDbClient(client);

    const [b] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Bruno Endpoint',
        email: 'bruno-endpoint-me059@roip.local',
        passwordHash: 'x',
      })
      .$returningId();
    if (!b) throw new Error('setup bruno');
    brunoId = b.id;

    const [c] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Endpoint',
        nomeFantasia: 'Endpoint',
        cnpj: '10190000000008',
        telefone: '1633330000',
        endereco: 'Rua Endpoint',
        cidade: 'RP',
        estado: 'SP',
        contatoPrincipalNome: 'X',
        contatoPrincipalEmail: 'endpoint@t.local',
        contatoRHNome: 'RH',
        contatoRHEmail: 'rh-endpoint@t.local',
        segmento: 'Serviço',
        tipoAtividade: 'x',
        descricaoAtividade: 'x',
        contextoMercado: 'x',
        mesKickoff: 1,
        kickoffDate: new Date('2020-01-01'),
      })
      .$returningId();
    if (!c) throw new Error('setup empresa');
    companyId = c.id;

    const [r] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Endpoint',
        cpf: '99900004001',
        email: 'rh-endpoint-me059@t.local',
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142205',
        descricaoCBO: 'RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
        isRH: true,
        status: 'ativo',
      })
      .$returningId();
    if (!r) throw new Error('setup rh');
    rhId = r.id;
  });

  afterAll(async () => {
    __setNotificationsRouteDbClient(null);
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, brunoId));
    await closeDbClient(client);
  });

  async function limpaNotificacoes() {
    await client.db.delete(notifications).where(eq(notifications.companyId, companyId));
  }

  async function insereNotificacaoRh(overrides: {
    severidade: 'critico' | 'atencao' | 'observacao' | 'info';
    lida?: boolean;
    arquivada?: boolean;
  }): Promise<number> {
    const [row] = await client.db
      .insert(notifications)
      .values({
        companyId,
        destinatarioTipo: 'rh',
        destinatarioEmployeeId: rhId,
        tipo: 'ciclo_mensal_fechado',
        titulo: 'X',
        subtitulo: null,
        linkDestino: '/cycle-management',
        severidade: overrides.severidade,
        lidaEm: overrides.lida === true ? new Date() : null,
        arquivadaEm: overrides.arquivada === true ? new Date() : null,
      })
      .$returningId();
    if (!row) throw new Error('setup notif');
    return row.id;
  }

  describe('Autenticacao — 401 e 403', () => {
    it('sessao ausente → 401', async () => {
      mockSession = null;
      const res = await GET(new Request('http://localhost/api/notifications?mode=count'));
      expect(res.status).toBe(401);
    });

    it('perfil clevel → 403', async () => {
      mockSession = {
        kind: 'platform',
        role: 'clevel',
        userId: 999,
        companyId,
        displayName: 'C',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await GET(new Request('http://localhost/api/notifications?mode=count'));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { motivo: string };
      expect(body.motivo).toBe('perfil_sem_sino_clevel');
    });

    it('perfil lider → 403', async () => {
      mockSession = {
        kind: 'platform',
        role: 'lider',
        userId: 999,
        companyId,
        displayName: 'L',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await GET(new Request('http://localhost/api/notifications?mode=count'));
      expect(res.status).toBe(403);
    });
  });

  describe('Modo/acao invalidos → 400', () => {
    beforeAll(() => {
      mockSession = {
        kind: 'super_admin',
        superAdminId: brunoId,
        displayName: 'Bruno',
      };
    });
    it('GET sem mode → 400', async () => {
      const res = await GET(new Request('http://localhost/api/notifications'));
      expect(res.status).toBe(400);
    });
    it('GET com mode=invalid → 400', async () => {
      const res = await GET(new Request('http://localhost/api/notifications?mode=xyz'));
      expect(res.status).toBe(400);
    });
    it('PATCH sem action → 400', async () => {
      const res = await PATCH(new Request('http://localhost/api/notifications?id=1'));
      expect(res.status).toBe(400);
    });
    it('PATCH read sem id → 400', async () => {
      const res = await PATCH(new Request('http://localhost/api/notifications?action=read'));
      expect(res.status).toBe(400);
    });
  });

  describe('GET ?mode=count — agregacao canonica §10.2', () => {
    it('retorna todos os 5 campos como 0 quando nao ha notificacoes', async () => {
      await limpaNotificacoes();
      mockSession = {
        kind: 'platform',
        role: 'rh',
        userId: rhId,
        companyId,
        displayName: 'RH',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await GET(new Request('http://localhost/api/notifications?mode=count'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        total: number;
        criticoCount: number;
        atencaoCount: number;
        observacaoCount: number;
        infoCount: number;
      };
      expect(body.total).toBe(0);
      expect(body.criticoCount).toBe(0);
      expect(body.atencaoCount).toBe(0);
      expect(body.observacaoCount).toBe(0);
      expect(body.infoCount).toBe(0);
    });

    it('conta por severidade correctly', async () => {
      await limpaNotificacoes();
      await insereNotificacaoRh({ severidade: 'critico' });
      await insereNotificacaoRh({ severidade: 'critico' });
      await insereNotificacaoRh({ severidade: 'atencao' });
      await insereNotificacaoRh({ severidade: 'observacao' });
      await insereNotificacaoRh({ severidade: 'info' });
      // Lidas nao contam
      await insereNotificacaoRh({ severidade: 'critico', lida: true });
      // Arquivadas nao contam
      await insereNotificacaoRh({ severidade: 'atencao', arquivada: true });

      mockSession = {
        kind: 'platform',
        role: 'rh',
        userId: rhId,
        companyId,
        displayName: 'RH',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await GET(new Request('http://localhost/api/notifications?mode=count'));
      const body = (await res.json()) as {
        total: number;
        criticoCount: number;
        atencaoCount: number;
        observacaoCount: number;
        infoCount: number;
      };
      expect(body.total).toBe(5);
      expect(body.criticoCount).toBe(2);
      expect(body.atencaoCount).toBe(1);
      expect(body.observacaoCount).toBe(1);
      expect(body.infoCount).toBe(1);
    });
  });

  describe('GET ?mode=unread — top 10 §10.4', () => {
    it('retorna array vazio quando nao ha nao-lidas', async () => {
      await limpaNotificacoes();
      mockSession = {
        kind: 'platform',
        role: 'rh',
        userId: rhId,
        companyId,
        displayName: 'RH',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await GET(new Request('http://localhost/api/notifications?mode=unread'));
      const body = (await res.json()) as unknown[];
      expect(body).toEqual([]);
    });

    it('retorna no maximo 10 itens', async () => {
      await limpaNotificacoes();
      for (let i = 0; i < 15; i++) {
        await insereNotificacaoRh({ severidade: 'critico' });
      }
      mockSession = {
        kind: 'platform',
        role: 'rh',
        userId: rhId,
        companyId,
        displayName: 'RH',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await GET(new Request('http://localhost/api/notifications?mode=unread'));
      const body = (await res.json()) as Array<{ id: number }>;
      expect(body.length).toBe(10);
    });
  });

  describe('PATCH ?action=read', () => {
    it('marca notificacao como lida com guard canonico', async () => {
      await limpaNotificacoes();
      const nid = await insereNotificacaoRh({ severidade: 'critico' });
      mockSession = {
        kind: 'platform',
        role: 'rh',
        userId: rhId,
        companyId,
        displayName: 'RH',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await PATCH(
        new Request(`http://localhost/api/notifications?action=read&id=${nid}`),
      );
      expect(res.status).toBe(200);
      const row = await client.db.select().from(notifications).where(eq(notifications.id, nid));
      expect(row[0]!.lidaEm).not.toBe(null);
    });

    it('PATCH read de notificacao de OUTRO destinatario → 404 (guard canonico)', async () => {
      await limpaNotificacoes();
      const nid = await insereNotificacaoRh({ severidade: 'critico' });
      // Autentica como Bruno — nao consegue marcar notificacao de RH
      mockSession = {
        kind: 'super_admin',
        superAdminId: brunoId,
        displayName: 'Bruno',
      };
      const res = await PATCH(
        new Request(`http://localhost/api/notifications?action=read&id=${nid}`),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH ?action=archive', () => {
    it('marca notificacao como arquivada', async () => {
      await limpaNotificacoes();
      const nid = await insereNotificacaoRh({ severidade: 'critico' });
      mockSession = {
        kind: 'platform',
        role: 'rh',
        userId: rhId,
        companyId,
        displayName: 'RH',
        companyDisplayName: 'X',
        companyLogoUrl: null,
      };
      const res = await PATCH(
        new Request(`http://localhost/api/notifications?action=archive&id=${nid}`),
      );
      expect(res.status).toBe(200);
      const row = await client.db.select().from(notifications).where(eq(notifications.id, nid));
      expect(row[0]!.arquivadaEm).not.toBe(null);
    });
  });
});
