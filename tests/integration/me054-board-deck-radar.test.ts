// ROIP APP 9BOX — teste de integracao do radar NR-1 no Board Deck
// (ME-054, fecha D060). Route Handler
// `GET /api/reports/board-deck/download` contra MySQL real, com
// PdfRendererFacade stub que captura o HTML renderizado.
//
// Cobertura canonica §13.8 elemento 3:
//   - Escopo empresa: ciclo copsoq fechado vigente no trimestre ->
//     8 fatores canonicos populados no HTML (nomes literais §11.6).
//   - Escopo departamento: le scores do escopo 'departamento' via
//     departamento resolvido por nome.
//   - Sem ciclo fechado elegivel -> placeholder canonico preservado.
//
// Padrao S009: CNPJ unico da faixa principal 10062. L32 cleanup.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import {
  companies,
  copsoqCycles,
  copsoqFactorScores,
  departments,
  employees,
} from '../../src/db/schema';
import { signPdfEphemeralToken } from '../../src/server/auth/pdfEphemeralToken';
import { deriveResourceIdCanonicoEscopo } from '../../src/server/routers/exports';
import type { PdfRendererFacade } from '../../src/server/services/pdfRenderer';
import {
  __setBoardDeckDbClient,
  __setBoardDeckNow,
  __setBoardDeckPdfRenderer,
  GET as boardDeckGet,
} from '../../src/app/api/reports/board-deck/download/route';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

process.env.JWT_SECRET = 'test-secret-roip-me054-board-deck';

const CNPJ = '10062000000062';
const TRIMESTRE = '2026-Q2';
const NOW = new Date('2026-07-15T12:00:00.000Z');
const PDF_STUB_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

let client: RoipDbClient;
const createdCompanyIds: number[] = [];
let companyId: number;
let deptId: number;
const createdCicloIds: number[] = [];

// Stub que captura o ultimo HTML renderizado.
let capturedHtml = '';
const CAPTURE_FACADE: PdfRendererFacade = {
  renderPdf: async (html: string): Promise<Uint8Array> => {
    capturedHtml = html;
    return PDF_STUB_BYTES;
  },
};

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  __setBoardDeckDbClient(client);
  __setBoardDeckPdfRenderer(CAPTURE_FACADE);
  __setBoardDeckNow(() => NOW);

  companyId = await createCompany(CNPJ);
  // Departamento canonico (tabela global — resolvido por nome).
  const [dept] = await client.db
    .select({ id: departments.id })
    .from(departments)
    .where(inArray(departments.nome, ['Comercial']))
    .limit(1);
  deptId = dept!.id;
});

afterEach(async () => {
  capturedHtml = '';
  // Isola cada caso: remove ciclos e scores criados no teste anterior,
  // para que o cenario "sem ciclo elegivel" nao encontre ciclos de
  // casos anteriores na mesma empresa.
  if (createdCicloIds.length > 0) {
    await client.db
      .delete(copsoqFactorScores)
      .where(inArray(copsoqFactorScores.cicloDbId, createdCicloIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.id, createdCicloIds));
    createdCicloIds.length = 0;
  }
});

afterAll(async () => {
  if (!client) {
    return;
  }
  if (createdCicloIds.length > 0) {
    await client.db
      .delete(copsoqFactorScores)
      .where(inArray(copsoqFactorScores.cicloDbId, createdCicloIds));
    await client.db.delete(copsoqCycles).where(inArray(copsoqCycles.id, createdCicloIds));
  }
  if (createdCompanyIds.length > 0) {
    await client.db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await client.db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  __setBoardDeckDbClient(null);
  __setBoardDeckPdfRenderer(null);
  __setBoardDeckNow(null);
  await closeDbClient(client);
});

async function createCompany(cnpj: string): Promise<number> {
  const [row] = await client.db
    .insert(companies)
    .values({
      razaoSocial: `ME054 BoardDeck ${cnpj} LTDA`,
      nomeFantasia: `ME054 BoardDeck ${cnpj}`,
      cnpj,
      telefone: '1633330054',
      endereco: `Rua ME-054, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    })
    .$returningId();
  if (!row) {
    throw new Error('createCompany: sem id');
  }
  createdCompanyIds.push(row.id);
  return row.id;
}

let cicloSeq = 0;
async function createCicloFechado(dataFechamento: string): Promise<number> {
  cicloSeq += 1;
  const [row] = await client.db
    .insert(copsoqCycles)
    .values({
      companyId,
      ciclo: `2026-S${cicloSeq}`,
      dataAbertura: new Date('2026-03-01'),
      dataFechamento: new Date(dataFechamento),
      status: 'fechado',
    })
    .$returningId();
  if (!row) {
    throw new Error('createCiclo: sem id');
  }
  createdCicloIds.push(row.id);
  return row.id;
}

async function seedFatores(
  cicloDbId: number,
  escopo: 'empresa' | 'departamento',
  escopoDepartamentoId: number | null,
): Promise<void> {
  for (let fator = 1; fator <= 8; fator += 1) {
    await client.db.insert(copsoqFactorScores).values({
      cicloDbId,
      companyId,
      escopo,
      escopoDepartamentoId,
      fator,
      score: String(50 + fator).concat('.00'),
      countRespondentes: 10,
    });
  }
}

async function mkRequest(escopoTipo: string, escopoReferencia: string | null): Promise<Request> {
  const resourceId = deriveResourceIdCanonicoEscopo(
    companyId,
    escopoTipo as 'empresa' | 'departamento',
    escopoReferencia,
  );
  const token = await signPdfEphemeralToken(
    { scope: 'board_deck', companyId, resourceId, userId: 1, userType: 'super_admin' },
    NOW,
  );
  const params = new URLSearchParams({ token, escopoTipo, trimestre: TRIMESTRE });
  if (escopoReferencia !== null) {
    params.set('escopoReferencia', escopoReferencia);
  }
  return new Request(`https://x/api/reports/board-deck/download?${params.toString()}`);
}

describe('board-deck radar NR-1 (ME-054 — fecha D060)', () => {
  it('escopo empresa: popula os 8 fatores canonicos quando ha ciclo fechado', async () => {
    const cicloId = await createCicloFechado('2026-06-20');
    await seedFatores(cicloId, 'empresa', null);

    const res = await boardDeckGet(await mkRequest('empresa', null));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    // HTML capturado contem os nomes canonicos §11.6 e nao o placeholder.
    expect(capturedHtml).toContain('Exigências quantitativas');
    expect(capturedHtml).toContain('Saúde geral autopercebida');
    expect(capturedHtml).not.toContain('Sem dados de Radar NR-1');
  });

  it('escopo departamento: le scores do escopo departamento', async () => {
    const cicloId = await createCicloFechado('2026-06-21');
    await seedFatores(cicloId, 'departamento', deptId);

    const res = await boardDeckGet(await mkRequest('departamento', 'Comercial'));
    expect(res.status).toBe(200);
    expect(capturedHtml).toContain('Autonomia');
    expect(capturedHtml).not.toContain('Sem dados de Radar NR-1');
  });

  it('sem ciclo elegivel: preserva o placeholder canonico', async () => {
    // Ciclo fechado com dataFechamento posterior ao fim do trimestre
    // -> nao elegivel para o Q2 (fim = 2026-06-30).
    const cicloId = await createCicloFechado('2026-09-30');
    await seedFatores(cicloId, 'empresa', null);

    const res = await boardDeckGet(await mkRequest('empresa', null));
    expect(res.status).toBe(200);
    expect(capturedHtml).toContain('Sem dados de Radar NR-1');
  });
});
