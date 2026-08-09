// ROIP APP 9BOX — unit test createCompanyInput (ME-Rota-C-D074).
//
// Cobertura canonica bit-exact do helper `normalizeCreateCompanyInput`
// (§DOC 01 §4.2 linha 180). Testes puros (sem MySQL) porque a
// normalizacao e deterministica sobre input parseado.
//
// **RV-13.** Chamador isolado do helper puro — permite validar as regras
// canonicas §DOC 01 §4.2 sem contaminacao do INSERT ou da tRPC.

import { describe, expect, it } from 'vitest';

import {
  CreateCompanyInputSchema,
  CreateCompanyValidationError,
  MSG_CNPJ_INVALIDO,
  MSG_MODO_PADRAO_KICKOFF_INVALIDO,
  MSG_MODO_PADRAO_MES_INICIO_INVALIDO,
  MSG_THRESHOLD_FORA_INTERVALO,
  SEGMENTO_CANONICO_VALORES,
  isMesKickoffPadraoPermitido,
  normalizeCreateCompanyInput,
} from '../../src/lib/company/createCompanyInput';

// ============================================================
// Payload canonico base para reutilizacao
// ============================================================

function baseParsed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    razaoSocial: 'Nativa Alimentos Ltda',
    nomeFantasia: 'Nativa',
    cnpj: '10000000000830',
    telefone: '1633330000',
    endereco: 'Rua Central, 100',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    contatoPrincipalNome: 'Bruno Andrade',
    contatoPrincipalEmail: 'bruno@nativa.com',
    contatoRHNome: 'Maria RH',
    contatoRHEmail: 'rh@nativa.com',
    segmento: 'Serviço',
    tipoAtividade: 'Consultoria',
    descricaoAtividade: 'Consultoria em gestão',
    contextoMercado: 'PMEs BR',
    modoAnoFiscal: 'padrao',
    mesInicioAnoFiscal: 1,
    mesKickoff: 4,
    kickoffDate: '2026-04-01',
    timezone: 'America/Sao_Paulo',
    thresholdDesempenhoBaixo: 60,
    thresholdDesempenhoMedio: 85,
    thresholdPlenitudeBaixo: 50,
    thresholdPlenitudeMedio: 75,
    ...overrides,
  };
}

describe('CreateCompanyInputSchema — parse bit-exact', () => {
  it('happy path canonico bit-exact aceita payload completo', () => {
    const result = CreateCompanyInputSchema.safeParse(baseParsed());
    expect(result.success).toBe(true);
  });

  it('CNPJ nao-numerico rejeitado com literal §18.7 MSG_CNPJ_INVALIDO', () => {
    const result = CreateCompanyInputSchema.safeParse(baseParsed({ cnpj: '12.345.678/0001-99' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain(MSG_CNPJ_INVALIDO);
    }
  });

  it('segmento fora do enum canonico bit-exact rejeitado', () => {
    const result = CreateCompanyInputSchema.safeParse(baseParsed({ segmento: 'Startup' }));
    expect(result.success).toBe(false);
  });

  it('threshold negativo rejeitado com literal §18.7 MSG_THRESHOLD_FORA_INTERVALO', () => {
    const result = CreateCompanyInputSchema.safeParse(baseParsed({ thresholdDesempenhoBaixo: -1 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain(MSG_THRESHOLD_FORA_INTERVALO);
    }
  });

  it('threshold 101 rejeitado com literal §18.7 MSG_THRESHOLD_FORA_INTERVALO', () => {
    const result = CreateCompanyInputSchema.safeParse(baseParsed({ thresholdPlenitudeMedio: 101 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain(MSG_THRESHOLD_FORA_INTERVALO);
    }
  });

  it('7 valores canonicos bit-exact do enum segmento sao aceitos', () => {
    for (const seg of SEGMENTO_CANONICO_VALORES) {
      const result = CreateCompanyInputSchema.safeParse(baseParsed({ segmento: seg }));
      expect(result.success).toBe(true);
    }
  });
});

describe('normalizeCreateCompanyInput — regras §DOC 01 §4.2 linha 180', () => {
  it("modoAnoFiscal='padrao' + mesInicioAnoFiscal=1 + kick=4 aceita bit-exact", () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed());
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.mesInicioAnoFiscal).toBe(1);
    expect(normalized.mesKickoff).toBe(4);
    expect(normalized.status).toBe('inativa');
  });

  it("modoAnoFiscal='padrao' + mesInicioAnoFiscal=6 rejeita bit-exact (server-side FORCE)", () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed({ mesInicioAnoFiscal: 6 }));
    expect(() => normalizeCreateCompanyInput(parsed)).toThrowError(CreateCompanyValidationError);
    try {
      normalizeCreateCompanyInput(parsed);
    } catch (err) {
      expect(err).toBeInstanceOf(CreateCompanyValidationError);
      expect((err as CreateCompanyValidationError).canonicalMessage).toBe(
        MSG_MODO_PADRAO_MES_INICIO_INVALIDO,
      );
    }
  });

  it("modoAnoFiscal='padrao' + mesKickoff=6 rejeita bit-exact (∉{1,4,7,10})", () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed({ mesKickoff: 6 }));
    expect(() => normalizeCreateCompanyInput(parsed)).toThrowError(CreateCompanyValidationError);
    try {
      normalizeCreateCompanyInput(parsed);
    } catch (err) {
      expect((err as CreateCompanyValidationError).canonicalMessage).toBe(
        MSG_MODO_PADRAO_KICKOFF_INVALIDO,
      );
    }
  });

  it("modoAnoFiscal='customizado' + mesInicioAnoFiscal=6 + kick=6 aceita bit-exact", () => {
    const parsed = CreateCompanyInputSchema.parse(
      baseParsed({ modoAnoFiscal: 'customizado', mesInicioAnoFiscal: 6, mesKickoff: 6 }),
    );
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.modoAnoFiscal).toBe('customizado');
    expect(normalized.mesInicioAnoFiscal).toBe(6);
    expect(normalized.mesKickoff).toBe(6);
  });

  it('status FORCADO=inativa bit-exact independente de qualquer input (§9 §13.1)', () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed());
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.status).toBe('inativa');
  });

  it('kickoffDate parseia canonicamente bit-exact para Date', () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed({ kickoffDate: '2026-04-01' }));
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.kickoffDate.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('DECIMAL(5,2) serializado bit-exact com toFixed(2)', () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed({ metaROIOperacional: 12.5 }));
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.metaROIOperacional).toBe('12.50');
  });

  it('DECIMAL(5,2) ausente serializado bit-exact como null', () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed());
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.metaROIOperacional).toBeNull();
  });

  it('strings opcionais vazias/ausentes convertidas bit-exact para null', () => {
    const parsed = CreateCompanyInputSchema.parse(baseParsed());
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.logoUrl).toBeNull();
    expect(normalized.encarregadoLgpdNome).toBeNull();
    expect(normalized.encarregadoLgpdEmail).toBeNull();
    expect(normalized.encarregadoLgpdTelefone).toBeNull();
    expect(normalized.encarregadoLgpdPoliticaUrl).toBeNull();
  });

  it('encarregado LGPD parcial preenchido normaliza bit-exact', () => {
    const parsed = CreateCompanyInputSchema.parse(
      baseParsed({
        encarregadoLgpdNome: 'Bruno',
        encarregadoLgpdEmail: 'bruno@nativa.com',
      }),
    );
    const normalized = normalizeCreateCompanyInput(parsed);
    expect(normalized.encarregadoLgpdNome).toBe('Bruno');
    expect(normalized.encarregadoLgpdEmail).toBe('bruno@nativa.com');
    expect(normalized.encarregadoLgpdTelefone).toBeNull();
  });

  it('defaults canonicos bit-exact §13.1: thresholds 60/85/50/75 aplicados', () => {
    const parsedMinimo = CreateCompanyInputSchema.parse({
      razaoSocial: 'Test',
      nomeFantasia: 'Test',
      cnpj: '10000000000839',
      telefone: '1600000000',
      endereco: 'X',
      cidade: 'X',
      estado: 'SP',
      contatoPrincipalNome: 'X',
      contatoPrincipalEmail: 'x@x.com',
      contatoRHNome: 'X',
      contatoRHEmail: 'x@x.com',
      segmento: 'Serviço',
      tipoAtividade: 'X',
      descricaoAtividade: 'X',
      contextoMercado: 'X',
      mesKickoff: 1,
      kickoffDate: '2026-01-01',
    });
    expect(parsedMinimo.thresholdDesempenhoBaixo).toBe(60);
    expect(parsedMinimo.thresholdDesempenhoMedio).toBe(85);
    expect(parsedMinimo.thresholdPlenitudeBaixo).toBe(50);
    expect(parsedMinimo.thresholdPlenitudeMedio).toBe(75);
    expect(parsedMinimo.modoAnoFiscal).toBe('padrao');
    expect(parsedMinimo.mesInicioAnoFiscal).toBe(1);
    expect(parsedMinimo.timezone).toBe('America/Sao_Paulo');
  });
});

describe('isMesKickoffPadraoPermitido — helper bit-exact §13.1 linha 1497', () => {
  it('aceita 1, 4, 7, 10 bit-exact', () => {
    expect(isMesKickoffPadraoPermitido(1)).toBe(true);
    expect(isMesKickoffPadraoPermitido(4)).toBe(true);
    expect(isMesKickoffPadraoPermitido(7)).toBe(true);
    expect(isMesKickoffPadraoPermitido(10)).toBe(true);
  });

  it('rejeita meses fora do conjunto canonico bit-exact', () => {
    for (const mes of [2, 3, 5, 6, 8, 9, 11, 12]) {
      expect(isMesKickoffPadraoPermitido(mes)).toBe(false);
    }
  });
});
