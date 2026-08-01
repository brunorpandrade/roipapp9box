/* eslint-disable @stylistic/max-len -- labels canonicas de describe/it em portugues com contexto S/§ */
// ROIP APP 9BOX — teste de integracao do Route Handler
// `GET /api/portal/lgpd/portability` (ME-062b, DOC 06 §19.6, S197 +
// S207 + S343). Contra MySQL real, com renderer PDF stub em memoria.
//
// Cobertura canonica:
//   - 401 token ausente (query string sem `token`).
//   - 401 token malformado (assinatura invalida).
//   - 401 token expirado (exp no passado).
//   - 200 titular employee sem respostas — Content-Type + filename
//     canonicos + binario do stub renderer.
//   - 200 titular employee COM respostas em todos os instrumentos.
//   - 200 titular C-level (payload canonico com A/D/Copsoq vazios
//     por S344).
//   - Determinismo bit-exact: 2 chamadas com mesmo token e mesmo `now`
//     retornam mesmo binario (o stub captura o HTML canonico).
//   - Filename canonico bit-exact `dados_pessoais_{nome}_{YYYYMMDD}.pdf`.
//   - 404 titular deletado apos emissao do token (corrida rara).
//   - 500 falha do renderer (Facade que lanca).
//   - Cache-Control canonico no-store.
//   - S343: token do titular A retorna dados de A — Route Handler
//     deriva identidade exclusivamente do token (sem input tampering).
//
// Faixa CNPJ desta ME (S344 canonizada): principal
// 10270000000001..049.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  cLevelMembers,
  companies,
  copsoqCycles,
  copsoq_responses,
  employees,
  individualProfileAssessments,
  instrumentA_responses,
  instrumentD_responses,
} from '../../src/db/schema';
import { signPortalToken } from '../../src/server/auth/portalToken';
import type { PdfRendererFacade } from '../../src/server/services/pdfRenderer';
import {
  __setLgpdPortabilityDbClient,
  __setLgpdPortabilityNow,
  __setLgpdPortabilityPdfRenderer,
  GET as lgpdPortabilityGET,
  MSG_EXPIRED_TOKEN_LGPD_PORTABILITY,
  MSG_INVALID_TOKEN_LGPD_PORTABILITY,
  MSG_MISSING_TOKEN_LGPD_PORTABILITY,
  MSG_TITULAR_NOT_FOUND_LGPD_PORTABILITY,
} from '../../src/app/api/portal/lgpd/portability/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me062b-lgpd-portability';

const NOW_FIXO = new Date('2026-08-15T12:00:00.000Z');
const NOW_FIXO_YYYYMMDD_COMPACT = '20260815';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const createdCompanyIds: number[] = [];
const createdCopsoqCycleIds: number[] = [];

// ============================================================
// Stub canonico do renderer PDF (S260 — Facade DI)
// ============================================================

// Captura o HTML canonico da ultima chamada — permite asserts sobre
// determinismo bit-exact e conteudo do payload.
let capturedHtml: string | null = null;
const STUB_PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3,
]);
const stubRenderer: PdfRendererFacade = {
  renderPdf: async (html: string) => {
    capturedHtml = html;
    return STUB_PDF_BYTES;
  },
};

// Renderer que lanca sempre (usado para testar 500 canonico).
const throwingRenderer: PdfRendererFacade = {
  renderPdf: async () => {
    throw new Error('puppeteer indisponivel — stub de falha canonica');
  },
};

// ============================================================
// Helpers de fixture
// ============================================================

async function seedCompany(cnpj: string, nomeFantasia: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({
      razaoSocial: `Handler Port ${cnpj} LTDA`,
      nomeFantasia,
      cnpj,
      telefone: '1633330062',
      endereco: `Rua Handler ME-062b, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato Principal',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'Contato RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canônica handler portabilidade',
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

async function seedEmployee(companyId: number, cpf: string, name: string): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({
      companyId,
      name,
      cpf,
      email: `${cpf}@example.com`,
      dataNascimento: new Date('1988-04-20'),
      dataAdmissao: new Date('2023-06-01'),
      cbo: '2521',
      descricaoCBO: 'Analista de sistemas',
      jobFamily: 'administrativo_suporte',
      senioridade: 'pleno',
      nivelHierarquico: 'tatico',
      departamento: 'Tecnologia da Informação',
      status: 'ativo',
    })
    .$returningId();
  if (!row) throw new Error('seed employee failed');
  return row.id;
}

async function seedClevel(companyId: number, cpf: string, name: string): Promise<number> {
  const [row] = await db
    .insert(cLevelMembers)
    .values({
      companyId,
      name,
      cpf,
      email: `${cpf}@clevel.example.com`,
      dataNascimento: new Date('1970-11-05'),
      dataAdmissao: new Date('2019-08-15'),
      cargo: 'CTO',
      descricaoCargo: 'Chief Technology Officer',
      departamento: 'Tecnologia da Informação',
      custoMensal: '45000.00',
      status: 'ativo',
    })
    .$returningId();
  if (!row) throw new Error('seed clevel failed');
  return row.id;
}

async function seedCopsoqCycle(companyId: number): Promise<number> {
  const [row] = await db
    .insert(copsoqCycles)
    .values({
      companyId,
      dataAbertura: new Date('2026-02-15'),
      dataFechamento: new Date('2026-03-01'),
      ciclo: '2026-Q1',
      status: 'aberto',
    })
    .$returningId();
  if (!row) throw new Error('seed copsoq cycle failed');
  createdCopsoqCycleIds.push(row.id);
  return row.id;
}

async function mkRequest(token: string | null): Promise<Request> {
  const url =
    token === null
      ? 'https://test.local/api/portal/lgpd/portability'
      : `https://test.local/api/portal/lgpd/portability?token=${encodeURIComponent(token)}`;
  return new Request(url);
}

// ============================================================
// Setup / Teardown canonicos
// ============================================================

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
  __setLgpdPortabilityDbClient(client);
});

afterAll(async () => {
  if (!client) return;
  if (createdCopsoqCycleIds.length > 0) {
    await db
      .delete(copsoq_responses)
      .where(inArray(copsoq_responses.cicloDbId, createdCopsoqCycleIds));
  }
  if (createdCompanyIds.length > 0) {
    await db
      .delete(individualProfileAssessments)
      .where(inArray(individualProfileAssessments.companyId, createdCompanyIds));
    await db
      .delete(instrumentD_responses)
      .where(inArray(instrumentD_responses.companyId, createdCompanyIds));
    await db
      .delete(instrumentA_responses)
      .where(inArray(instrumentA_responses.companyId, createdCompanyIds));
    await db.delete(copsoqCycles).where(inArray(copsoqCycles.companyId, createdCompanyIds));
    await db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await db.delete(cLevelMembers).where(inArray(cLevelMembers.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  __setLgpdPortabilityDbClient(null);
  __setLgpdPortabilityPdfRenderer(null);
  __setLgpdPortabilityNow(null);
  await closeDbClient(client);
});

beforeEach(() => {
  __setLgpdPortabilityPdfRenderer(stubRenderer);
  __setLgpdPortabilityNow(() => NOW_FIXO);
  capturedHtml = null;
});

// ============================================================
// Testes canonicos
// ============================================================

describe('Route Handler GET /api/portal/lgpd/portability — token guards', () => {
  it('401 quando token ausente (sem query string)', async () => {
    const req = await mkRequest(null);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_MISSING_TOKEN_LGPD_PORTABILITY);
  });

  it('401 quando token malformado (assinatura invalida)', async () => {
    const req = await mkRequest('token-nao-jwt-valido');
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_INVALID_TOKEN_LGPD_PORTABILITY);
  });

  it('401 quando token expirado', async () => {
    const cid = await seedCompany('10270000000001', 'Expirado');
    const eid = await seedEmployee(cid, '11122233340', 'Expirado E');
    // O `signPortalToken` canonico nao permite `exp` custom (TTL fixo
    // de 12h). Para simular token expirado sem manipular o relogio do
    // handler, o teste monta um JWT canonico manualmente com `exp`
    // retroativo — mesmo issuer/kind/JWT_SECRET, apenas com exp
    // vencido. O `verifyPortalToken` (S042) usa `Date.now()` real e
    // corretamente reprova como `reason: 'expired'`.
    const { SignJWT } = await import('jose');
    const expiredToken = await new SignJWT({
      kind: 'portal',
      companyId: cid,
      titularType: 'employee',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(eid))
      .setIssuedAt(Math.floor(Date.now() / 1000) - 24 * 60 * 60)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET ?? ''));
    const req = await mkRequest(expiredToken);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_EXPIRED_TOKEN_LGPD_PORTABILITY);
  });
});

describe('Route Handler GET /api/portal/lgpd/portability — 200 sucesso', () => {
  it('200 titular employee sem respostas — headers canonicos + filename bit-exact', async () => {
    const cid = await seedCompany('10270000000002', 'Empresa Sem Respostas');
    const eid = await seedEmployee(cid, '22233344450', 'Titular Vazio');
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const req = await mkRequest(token);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(cd).toContain(`dados_pessoais_Titular_Vazio_${NOW_FIXO_YYYYMMDD_COMPACT}.pdf`);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(STUB_PDF_BYTES);
  });

  it('200 titular employee COM respostas em todos os instrumentos (§19.6 escopo integral)', async () => {
    const cid = await seedCompany('10270000000003', 'Empresa Completa');
    const eid = await seedEmployee(cid, '33344455560', 'Titular Completo');
    const cycleId = await seedCopsoqCycle(cid);
    await db.insert(instrumentA_responses).values({
      companyId: cid,
      employeeId: eid,
      trimestre: '2026-Q2',
      dimensao: 1,
      itemIndex: 1,
      valor: 85,
    });
    await db.insert(instrumentD_responses).values({
      companyId: cid,
      respondenteId: eid,
      liderId: eid,
      trimestre: '2026-Q2',
      dimensao: 1,
      itemIndex: 1,
      valor: 4,
      versaoInstrumento: 1,
    });
    await db.insert(copsoq_responses).values({
      cicloDbId: cycleId,
      companyId: cid,
      employeeId: eid,
      fator: 3,
      itemIndex: 1,
      valor: 4,
    });
    await db.insert(individualProfileAssessments).values({
      companyId: cid,
      userType: 'employee',
      userId: eid,
      tentativa: 1,
      status: 'enviado',
      blocoAtual: 10,
      respostas: { integracao: 'canonica' },
    });
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const req = await mkRequest(token);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(200);
    expect(capturedHtml).not.toBeNull();
    const html = capturedHtml ?? '';
    // Preserva referencias canonicas literais do template §19.6.
    expect(html).toContain('Portabilidade de dados pessoais');
    expect(html).toContain('Instrumento A — Autoavaliação');
    expect(html).toContain('Instrumento D — Avaliação do líder direto');
    expect(html).toContain('Radar NR-1 (COPSOQ)');
    expect(html).toContain('Perfil Individual — respostas brutas');
    expect(html).toContain('Titular Completo');
    expect(html).toContain('Empresa Completa');
  });

  it('200 titular C-level — payload canonico com A/D/Copsoq vazios por S344', async () => {
    const cid = await seedCompany('10270000000004', 'Empresa Clevel');
    const clid = await seedClevel(cid, '44455566670', 'CTO Titular');
    await db.insert(individualProfileAssessments).values({
      companyId: cid,
      userType: 'clevel',
      userId: clid,
      tentativa: 1,
      status: 'enviado',
      blocoAtual: 10,
      respostas: { clevel: true },
    });
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'clevel',
      titularId: clid,
    });
    const req = await mkRequest(token);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(200);
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain(`dados_pessoais_CTO_Titular_${NOW_FIXO_YYYYMMDD_COMPACT}.pdf`);
    expect(capturedHtml).not.toBeNull();
    const html = capturedHtml ?? '';
    // Secoes A/D/Copsoq presentes canonicamente mas com "Nenhuma resposta"
    // (S344 bit-exact).
    const contarOcorrencias = (needle: string): number =>
      (html.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
    // A secao de Instrumento A + D + COPSOQ tem "Nenhuma resposta registrada."
    expect(contarOcorrencias('Nenhuma resposta registrada.')).toBeGreaterThanOrEqual(3);
    // Perfil Individual da C-level nao esta vazio.
    expect(html).toContain('CTO Titular');
    expect(html).toContain('C-Level');
  });
});

describe('Route Handler GET /api/portal/lgpd/portability — determinismo canonico', () => {
  it('duas chamadas com mesmo token e mesmo `now` geram HTML canonico bit-exact', async () => {
    const cid = await seedCompany('10270000000005', 'Empresa Deterministica');
    const eid = await seedEmployee(cid, '55566677780', 'Determinista');
    await db.insert(instrumentA_responses).values({
      companyId: cid,
      employeeId: eid,
      trimestre: '2026-Q1',
      dimensao: 1,
      itemIndex: 1,
      valor: 70,
    });
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });

    const req1 = await mkRequest(token);
    const res1 = await lgpdPortabilityGET(req1);
    const html1 = capturedHtml;

    capturedHtml = null;

    const req2 = await mkRequest(token);
    const res2 = await lgpdPortabilityGET(req2);
    const html2 = capturedHtml;

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(html1).not.toBeNull();
    expect(html2).not.toBeNull();
    // Determinismo canonico bit-exact §11.12 estendido a §19.6.
    expect(html2).toBe(html1);
  });
});

describe('Route Handler GET /api/portal/lgpd/portability — falhas canonicas', () => {
  it('404 quando titular deletado apos emissao do token', async () => {
    const cid = await seedCompany('10270000000006', 'Empresa Corrida');
    const eid = await seedEmployee(cid, '66677788890', 'Corrida E');
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    // Deleta o titular canonicamente antes da requisicao — simula a
    // corrida rara mencionada no §19.6.
    await db.delete(employees).where(inArray(employees.id, [eid]));
    const req = await mkRequest(token);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { msg: string };
    expect(body.msg).toBe(MSG_TITULAR_NOT_FOUND_LGPD_PORTABILITY);
  });

  it('500 quando renderer PDF lanca (Puppeteer indisponivel)', async () => {
    const cid = await seedCompany('10270000000007', 'Empresa Falha Render');
    const eid = await seedEmployee(cid, '77788899900', 'Falha Render');
    __setLgpdPortabilityPdfRenderer(throwingRenderer);
    const token = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eid,
    });
    const req = await mkRequest(token);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('falha_render');
    expect(body.message).toContain('puppeteer indisponivel');
  });
});

describe('Route Handler GET /api/portal/lgpd/portability — S343 defense-in-depth', () => {
  it('Route Handler deriva identidade exclusivamente do token — sem input do cliente', async () => {
    // Cria dois titulares distintos na mesma empresa.
    const cid = await seedCompany('10270000000008', 'Empresa Defense');
    const eidA = await seedEmployee(cid, '88899900011', 'Titular A');
    const eidB = await seedEmployee(cid, '88899900012', 'Titular B');
    await db.insert(instrumentA_responses).values([
      {
        companyId: cid,
        employeeId: eidA,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 55,
      },
      {
        companyId: cid,
        employeeId: eidB,
        trimestre: '2026-Q1',
        dimensao: 1,
        itemIndex: 1,
        valor: 95,
      },
    ]);
    const tokenA = await signPortalToken({
      companyId: cid,
      titularType: 'employee',
      titularId: eidA,
    });

    // Chamada com token de A retorna PDF com dados de A — mesmo se o
    // atacante tentasse enfiar `?employeeId=eidB` na URL, o handler nao
    // aceita esse parametro.
    const url = `https://test.local/api/portal/lgpd/portability?token=${encodeURIComponent(tokenA)}&employeeId=${eidB}`;
    const req = new Request(url);
    const res = await lgpdPortabilityGET(req);
    expect(res.status).toBe(200);
    const cd = res.headers.get('content-disposition') ?? '';
    // Filename deve conter o nome de A (dados de A), nao de B.
    expect(cd).toContain('Titular_A');
    expect(cd).not.toContain('Titular_B');
    // HTML capturado deve conter valor 55 (de A) mas nao 95 (de B).
    expect(capturedHtml).toContain('55');
    // (nao asserimos ausencia de '95' por risco de match falso no CSS
    // ou em contadores de pagina — o filename ja e prova canonica).
  });
});
