// ROIP APP 9BOX — teste unit `executiveReportAI` (ME-053, S275).
//
// Cobertura canonica (com stub facades — sem chamada real a Claude,
// sem PDF real, sem storage real):
//   - Guard §7.10: contador >= 5 -> outcome `limit_reached`.
//   - Bypass §7.6: Clima indisponivel -> nao chama Claude para Clima,
//     usa paragrafo canonico curto direto.
//   - Falha canonica §11.4: qualquer bloco falha -> outcome
//     `failed_claude` + callback `onGenerationFailed` invocado + cache
//     NAO gravado + apiUsageLog NAO incrementado.
//   - Sucesso: 6 chamadas (5 blocos + sintese) -> outcome `ok` +
//     cacheId + pdfPath + filename canonico.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { apiUsageLog, companies, employees, executiveReportCache } from '../../src/db/schema';
import type { ClaudeCallFacade } from '../../src/server/services/claudeCall';
import {
  EXEC_REPORT_CLIMA_INDISPONIVEL_PARAGRAFO,
  EXECUTIVE_REPORT_SYSTEM_PROMPT,
} from '../../src/server/services/executiveReportSystemPrompt';
import {
  EXEC_REPORT_LIMITE_DIARIO,
  generateExecutiveReport,
  MSG_EXEC_REPORT_LIMIT_REACHED,
  type ExecutiveReportAIDeps,
} from '../../src/server/services/executiveReportAI';
// eslint-disable-next-line @stylistic/max-len -- import path canonico
import type { ExecutiveReportStorageFacade } from '../../src/server/services/executiveReportStorage';
import type { PdfRendererFacade } from '../../src/server/services/pdfRenderer';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

let client: RoipDbClient;
let db: RoipDbClient['db'];

const CNPJ_LIMIT = '10040000000001';
const CNPJ_FAIL = '10040000000002';
const CNPJ_OK = '10040000000003';

const createdCompanyIds: number[] = [];

async function seedCompany(cnpj: string, nomeFantasia: string): Promise<number> {
  const [res] = await db
    .insert(companies)
    .values({
      razaoSocial: `${nomeFantasia} LTDA`,
      nomeFantasia,
      cnpj,
      telefone: '1633330053',
      endereco: `Rua ME-053, ${cnpj}`,
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: `p-${cnpj}@example.com`,
      contatoRHNome: 'RH',
      contatoRHEmail: `rh-${cnpj}@example.com`,
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Consultoria canonica ME053',
      contextoMercado: 'PMEs BR',
      metaROIOperacional: '3.00',
      metaROITatico: '4.00',
      metaROIEstrategico: '5.00',
      roiSegmentoMinimo: '2.00',
      roiSegmentoMaximo: '4.00',
      mesKickoff: 1,
      status: 'ativa',
      timezone: 'America/Sao_Paulo',
    })
    .$returningId();
  if (!res) throw new Error('seed company failed');
  createdCompanyIds.push(res.id);
  return res.id;
}

beforeAll(async () => {
  client = createDbClient(TEST_URL);
  db = client.db;
});

afterAll(async () => {
  if (createdCompanyIds.length > 0) {
    await db
      .delete(executiveReportCache)
      .where(inArray(executiveReportCache.companyId, createdCompanyIds));
    await db.delete(apiUsageLog).where(inArray(apiUsageLog.companyId, createdCompanyIds));
    await db.delete(employees).where(inArray(employees.companyId, createdCompanyIds));
    await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
  }
  await closeDbClient(client);
});

function mkStubDeps(overrides: Partial<ExecutiveReportAIDeps> = {}): ExecutiveReportAIDeps {
  const telemetryStub = {
    callId: 'stub-call',
    companyId: 1,
    surface: 'execReport_financeiro' as const,
    model: 'claude-stub',
    startedAt: new Date(),
    finishedAt: new Date(),
    latencyMs: 10,
    inputTokens: 10,
    outputTokens: 10,
    status: 'sucesso' as const,
    retriesEffective: 0,
    userId: 1,
    userType: 'employee' as const,
  };
  const claudeStub: ClaudeCallFacade = {
    claudeCall: async () => ({
      ok: true,
      content: 'Paragrafo interpretativo stub.',
      parsedJson: null,
      telemetry: telemetryStub,
    }),
  };
  const pdfStub: PdfRendererFacade = {
    renderPdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  };
  const storageStub: ExecutiveReportStorageFacade = {
    writePdf: async () => '/tmp/stub/report.pdf',
    readPdfFromPath: async () => new Uint8Array(),
  };
  return {
    db,
    claudeCallFacade: claudeStub,
    pdfRendererFacade: pdfStub,
    storageFacade: storageStub,
    now: () => new Date('2026-01-15T12:00:00.000Z'),
    ...overrides,
  };
}

const baseArgs = {
  nomeFantasia: 'Empresa Teste',
  razaoSocialSanitizada: 'EMPRESA_TESTE',
  escopo: { tipo: 'empresa' as const, referencia: null, rotulo: 'Empresa' },
  trimestre: '2026-Q1',
  geradoPorTipo: 'employee' as const,
  geradoPorId: 1,
  geradoPorUserType: 'employee' as const,
  dataUsoLocal: new Date('2026-01-15T00:00:00.000Z'),
};

describe('executiveReportAI — guard §7.10 limite diario', () => {
  it('retorna limit_reached quando contador >= 5', async () => {
    const companyId = await seedCompany(CNPJ_LIMIT, 'Empresa Limit');
    // Semeia contador = LIMITE.
    await db.insert(apiUsageLog).values({
      companyId,
      tipo: 'relatorio_executivo',
      dataUso: baseArgs.dataUsoLocal,
      contador: EXEC_REPORT_LIMITE_DIARIO,
    });
    const outcome = await generateExecutiveReport(mkStubDeps(), {
      companyId,
      ...baseArgs,
    });
    expect(outcome.kind).toBe('limit_reached');
    if (outcome.kind === 'limit_reached') {
      expect(outcome.message).toBe(MSG_EXEC_REPORT_LIMIT_REACHED);
      expect(outcome.contadorAtual).toBe(EXEC_REPORT_LIMITE_DIARIO);
    }
  });
});

describe('executiveReportAI — falha canonica §11.4', () => {
  it('propaga failed_claude e invoca onGenerationFailed sem gravar cache', async () => {
    const companyId = await seedCompany(CNPJ_FAIL, 'Empresa Fail');
    const failStub: ClaudeCallFacade = {
      claudeCall: async () => ({
        ok: false,
        status: 'falha_5xx',
        message: 'stub-fail',
        telemetry: {
          callId: 'fail-1',
          companyId,
          surface: 'execReport_financeiro',
          model: 'claude-stub',
          startedAt: new Date(),
          finishedAt: new Date(),
          latencyMs: 10,
          inputTokens: 10,
          outputTokens: 0,
          status: 'falha_5xx',
          retriesEffective: 0,
          userId: 1,
          userType: 'employee',
        },
      }),
    };
    const onFailed = vi.fn();
    const deps = mkStubDeps({ claudeCallFacade: failStub, onGenerationFailed: onFailed });
    const outcome = await generateExecutiveReport(deps, {
      companyId,
      ...baseArgs,
    });
    expect(outcome.kind).toBe('failed_claude');
    expect(onFailed).toHaveBeenCalled();
    // Cache NAO gravado.
    const cacheRows = await db
      .select()
      .from(executiveReportCache)
      .where(inArray(executiveReportCache.companyId, [companyId]));
    expect(cacheRows).toHaveLength(0);
    // apiUsageLog NAO incrementado.
    const usageRows = await db
      .select()
      .from(apiUsageLog)
      .where(inArray(apiUsageLog.companyId, [companyId]));
    expect(usageRows).toHaveLength(0);
  });
});

describe('executiveReportAI — sucesso completo', () => {
  it('gera relatorio, grava cache, incrementa apiUsageLog e retorna outcome ok', async () => {
    const companyId = await seedCompany(CNPJ_OK, 'Empresa OK');
    const okTelemetry = {
      callId: 'stub-call',
      companyId,
      surface: 'execReport_financeiro' as const,
      model: 'claude-stub',
      startedAt: new Date(),
      finishedAt: new Date(),
      latencyMs: 10,
      inputTokens: 10,
      outputTokens: 10,
      status: 'sucesso' as const,
      retriesEffective: 0,
      userId: 1,
      userType: 'employee' as const,
    };
    const claudeStub = vi.fn(async () => ({
      ok: true as const,
      content: 'Paragrafo interpretativo canonico.',
      parsedJson: null,
      telemetry: okTelemetry,
    }));
    const onComplete = vi.fn();
    const deps = mkStubDeps({
      claudeCallFacade: { claudeCall: claudeStub },
      onGenerationComplete: onComplete,
    });
    const outcome = await generateExecutiveReport(deps, {
      companyId,
      ...baseArgs,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.cacheId).toBeGreaterThan(0);
      expect(outcome.filename).toContain('relatorio_executivo_EMPRESA_TESTE_2026-Q1_');
      expect(outcome.filename).toMatch(/\.pdf$/);
    }
    // 6 chamadas Claude (5 blocos + sintese) — Clima indisponivel
    // reduz para 5 (bypass §7.6). Empresa recem-criada sem climateEngagementData
    // -> disponivel=false. Portanto 4 blocos IA + 1 sintese = 5 chamadas.
    expect(claudeStub.mock.calls.length).toBe(5);
    // System prompt canonico em todas as chamadas.
    for (const call of claudeStub.mock.calls as unknown as Array<[{ systemPrompt: string }]>) {
      expect(call[0]?.systemPrompt).toBe(EXECUTIVE_REPORT_SYSTEM_PROMPT);
    }
    expect(onComplete).toHaveBeenCalled();
  });
});

describe('executiveReportAI — bypass canonico §7.6 Clima indisponivel', () => {
  it('paragrafo Clima usa constante canonica sem chamada Claude', () => {
    // O bypass e testado indiretamente no teste anterior — clima nao
    // disponivel em company recem-criada. O paragrafo canonico esta
    // exposto e pode ser assercao literal.
    expect(EXEC_REPORT_CLIMA_INDISPONIVEL_PARAGRAFO).toContain(
      'Bloco de Clima indisponível neste trimestre',
    );
  });
});
