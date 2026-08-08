// ROIP APP 9BOX — teste integracao Route Handler
// `GET /api/reports/executive/download` (ME-053, S275). Contra MySQL
// real, com storage stub em memoria.
//
// Cobertura canonica:
//   - 401 token ausente.
//   - 401 token com scope errado.
//   - 404 cache ausente (resourceId invalido).
//   - 401 companyId no token nao bate com o cache.
//   - 200 sucesso: retorna application/pdf com content-disposition
//     canonico.
//
// Faixa CNPJ desta ME: principal 10040..10049.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { companies, executiveReportCache } from '../../src/db/schema';
import { signPdfEphemeralToken } from '../../src/server/auth/pdfEphemeralToken';
import { upsertExecutiveReportCache } from '../../src/server/services/executiveReportCache';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import type { ExecutiveReportStorageFacade } from '../../src/server/services/executiveReportStorage';
import { GET as executiveDownloadGet } from '../../src/app/api/reports/executive/download/route';
import {
  __setExecutiveDownloadDbClient,
  __setExecutiveDownloadNow,
  __setExecutiveDownloadStorage,
} from '../../src/app/api/reports/executive/download/internals';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me053-exec-download';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const NOW = new Date('2026-04-15T12:00:00.000Z');

async function seedCompany(cnpj: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `Handler ${cnpj} LTDA`,
      nomeFantasia: `Handler ${cnpj}`,
      cnpj,
      telefone: '1633330053',
      endereco: `Rua ME-053-Handler, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica handler',
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

// Stub in-memory storage.
const stubBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const stubStorage: ExecutiveReportStorageFacade = {
  writePdf: async () => '/tmp/stub/report.pdf',
  readPdfFromPath: async (path: string) => {
    if (path === '/tmp/stub/report.pdf') return stubBytes;
    return null;
  },
};

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
  __setExecutiveDownloadDbClient(client);
  __setExecutiveDownloadStorage(stubStorage);
  __setExecutiveDownloadNow(() => NOW);
});

afterAll(async () => {
  __setExecutiveDownloadDbClient(null);
  __setExecutiveDownloadStorage(null);
  __setExecutiveDownloadNow(null);
  if (createdCompanyIds.length > 0) {
    await db
      .delete(executiveReportCache)
      .where(inArray(executiveReportCache.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

async function mkRequest(url: string): Promise<Request> {
  return new Request(url);
}

describe('Route Handler /api/reports/executive/download', () => {
  it('401 quando token ausente', async () => {
    const req = await mkRequest('https://test.local/api/reports/executive/download');
    const res = await executiveDownloadGet(req);
    expect(res.status).toBe(401);
  });

  it('401 quando scope do token e errado', async () => {
    const companyId = await seedCompany('10044000000001');
    const cacheId = await upsertExecutiveReportCache(db, {
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
      conteudoPdfUrl: '/tmp/stub/report.pdf',
      geradoPorTipo: 'superAdmin',
      geradoPorId: 1,
      geradoEm: NOW,
    });
    const token = await signPdfEphemeralToken(
      {
        scope: 'nr1_report',
        companyId,
        resourceId: cacheId,
        userId: 1,
        userType: 'super_admin',
      },
      NOW,
    );
    const req = await mkRequest(
      `https://test.local/api/reports/executive/download?token=${encodeURIComponent(token)}`,
    );
    const res = await executiveDownloadGet(req);
    expect(res.status).toBe(401);
  });

  it('404 quando cache nao existe (resourceId invalido)', async () => {
    const companyId = await seedCompany('10044000000002');
    const token = await signPdfEphemeralToken(
      {
        scope: 'executive_report',
        companyId,
        resourceId: 9999999,
        userId: 1,
        userType: 'super_admin',
      },
      NOW,
    );
    const req = await mkRequest(
      `https://test.local/api/reports/executive/download?token=${encodeURIComponent(token)}`,
    );
    const res = await executiveDownloadGet(req);
    expect(res.status).toBe(404);
  });

  it('401 quando companyId do token nao bate com o cache', async () => {
    const companyIdA = await seedCompany('10044000000003');
    const companyIdB = await seedCompany('10044000000004');
    const cacheId = await upsertExecutiveReportCache(db, {
      companyId: companyIdA,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
      conteudoPdfUrl: '/tmp/stub/report.pdf',
      geradoPorTipo: 'superAdmin',
      geradoPorId: 1,
      geradoEm: NOW,
    });
    const token = await signPdfEphemeralToken(
      {
        scope: 'executive_report',
        companyId: companyIdB,
        resourceId: cacheId,
        userId: 1,
        userType: 'super_admin',
      },
      NOW,
    );
    const req = await mkRequest(
      `https://test.local/api/reports/executive/download?token=${encodeURIComponent(token)}`,
    );
    const res = await executiveDownloadGet(req);
    expect(res.status).toBe(401);
  });

  it('200 sucesso — retorna application/pdf com content-disposition canonico', async () => {
    const companyId = await seedCompany('10044000000005');
    const cacheId = await upsertExecutiveReportCache(db, {
      companyId,
      escopoTipo: 'empresa',
      escopoReferencia: null,
      trimestre: '2026-Q1',
      conteudoPdfUrl: '/tmp/stub/report.pdf',
      geradoPorTipo: 'superAdmin',
      geradoPorId: 1,
      geradoEm: NOW,
    });
    const token = await signPdfEphemeralToken(
      {
        scope: 'executive_report',
        companyId,
        resourceId: cacheId,
        userId: 1,
        userType: 'super_admin',
      },
      NOW,
    );
    const req = await mkRequest(
      `https://test.local/api/reports/executive/download?token=${encodeURIComponent(token)}`,
    );
    const res = await executiveDownloadGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('.pdf');
    const buf = await res.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(stubBytes);
  });
});
