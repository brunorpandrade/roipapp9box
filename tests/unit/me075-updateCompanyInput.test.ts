// ROIP APP 9BOX — teste unitario ME-075 `updateCompanyInput` (D086).
//
// Cobre canonicamente bit-exact os predicados puros e o normalizador
// canonicos do lib `updateCompanyInput.ts`:
//   1. `assertModoPadraoConstraints` — modo padrao aceita apenas
//      inicio=1 e kickoff∈{1,4,7,10}.
//   2. `assertAnoFiscalImmutabilityWhenLocked` — validacao bit-exact
//      §13.1 linha 1506 (imutabilidade pos-primeiro-trimestre).
//   3. `hasAnyMetaROIChanged` — comparador canonico bit-exact §3.9
//      (tolerancia 0.005 decimal).
//   4. `formatDateISO` — formato canonico bit-exact `YYYY-MM-DD`.
//   5. `normalizeUpdateCompanyParametersInput` — end-to-end normalizacao.

import { describe, expect, it } from 'vitest';

import {
  assertAnoFiscalImmutabilityWhenLocked,
  assertModoPadraoConstraints,
  formatDateISO,
  hasAnyMetaROIChanged,
  MODO_ANO_FISCAL_KICKOFF_INVARIANT_FIELDS,
  MSG_ANO_FISCAL_IMUTAVEL,
  normalizeUpdateCompanyParametersInput,
  UpdateCompanyValidationError,
  type UpdateCompanyParametersInputParsed,
} from '../../src/lib/company/updateCompanyInput';

const BASE_INPUT: UpdateCompanyParametersInputParsed = {
  companyId: 1,
  razaoSocial: 'Test LTDA',
  nomeFantasia: 'Test',
  cnpj: '12345678000199',
  telefone: '1633330000',
  endereco: 'Rua 1',
  cidade: 'RP',
  estado: 'SP',
  logoUrl: null,
  contatoPrincipalNome: 'A',
  contatoPrincipalEmail: 'a@test.com',
  contatoRHNome: 'B',
  contatoRHEmail: 'b@test.com',
  encarregadoLgpdNome: null,
  encarregadoLgpdEmail: null,
  encarregadoLgpdTelefone: null,
  encarregadoLgpdPoliticaUrl: null,
  segmento: 'Comércio',
  tipoAtividade: 'X',
  descricaoAtividade: 'Y',
  contextoMercado: 'Z',
  modoAnoFiscal: 'padrao',
  mesInicioAnoFiscal: 1,
  mesKickoff: 4,
  kickoffDate: '2027-01-01',
  timezone: 'America/Sao_Paulo',
  metaROIOperacional: null,
  metaROITatico: null,
  metaROIEstrategico: null,
  roiSegmentoMinimo: null,
  roiSegmentoMaximo: null,
  folhaPercMinima: null,
  folhaPercMaxima: null,
  thresholdDesempenhoBaixo: 60,
  thresholdDesempenhoMedio: 85,
  thresholdPlenitudeBaixo: 50,
  thresholdPlenitudeMedio: 75,
};

describe('assertModoPadraoConstraints', () => {
  it('aceita modo padrao com inicio=1 e kickoff∈{1,4,7,10}', () => {
    expect(() =>
      assertModoPadraoConstraints({
        ...BASE_INPUT,
        modoAnoFiscal: 'padrao',
        mesInicioAnoFiscal: 1,
        mesKickoff: 1,
      }),
    ).not.toThrow();
    expect(() => assertModoPadraoConstraints({ ...BASE_INPUT, mesKickoff: 4 })).not.toThrow();
    expect(() => assertModoPadraoConstraints({ ...BASE_INPUT, mesKickoff: 7 })).not.toThrow();
    expect(() => assertModoPadraoConstraints({ ...BASE_INPUT, mesKickoff: 10 })).not.toThrow();
  });

  it('rejeita modo padrao com inicio != 1', () => {
    expect(() => assertModoPadraoConstraints({ ...BASE_INPUT, mesInicioAnoFiscal: 3 })).toThrow(
      UpdateCompanyValidationError,
    );
  });

  it('rejeita modo padrao com kickoff ∉ {1,4,7,10}', () => {
    for (const badMes of [2, 3, 5, 6, 8, 9, 11, 12]) {
      expect(() => assertModoPadraoConstraints({ ...BASE_INPUT, mesKickoff: badMes })).toThrow(
        UpdateCompanyValidationError,
      );
    }
  });

  it('aceita modo customizado com qualquer mesInicio e mesKickoff', () => {
    for (const mes of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(() =>
        assertModoPadraoConstraints({
          ...BASE_INPUT,
          modoAnoFiscal: 'customizado',
          mesInicioAnoFiscal: mes,
          mesKickoff: mes,
        }),
      ).not.toThrow();
    }
  });
});

describe('assertAnoFiscalImmutabilityWhenLocked', () => {
  const now = new Date('2027-01-01T00:00:00Z');
  const currentBase = {
    modoAnoFiscal: 'padrao' as const,
    mesInicioAnoFiscal: 1,
    mesKickoff: 4,
    kickoffDate: now,
  };
  const incomingBase = {
    modoAnoFiscal: 'padrao' as const,
    mesInicioAnoFiscal: 1,
    mesKickoff: 4,
    kickoffDate: '2027-01-01',
  };

  it('nao lanca quando locked=false, independentemente de mudancas', () => {
    expect(() =>
      assertAnoFiscalImmutabilityWhenLocked(false, currentBase, {
        ...incomingBase,
        mesKickoff: 7,
        modoAnoFiscal: 'customizado',
      }),
    ).not.toThrow();
  });

  it('nao lanca quando locked=true mas nenhum campo mudou', () => {
    expect(() =>
      assertAnoFiscalImmutabilityWhenLocked(true, currentBase, incomingBase),
    ).not.toThrow();
  });

  it('lanca quando locked=true e qualquer um dos 4 campos mudou', () => {
    for (const patch of [
      { modoAnoFiscal: 'customizado' as const },
      { mesInicioAnoFiscal: 2 },
      { mesKickoff: 7 },
      { kickoffDate: '2027-02-01' },
    ]) {
      expect(() =>
        assertAnoFiscalImmutabilityWhenLocked(true, currentBase, {
          ...incomingBase,
          ...patch,
        }),
      ).toThrow(UpdateCompanyValidationError);
    }
  });

  it('mensagem canonica bit-exact', () => {
    try {
      assertAnoFiscalImmutabilityWhenLocked(true, currentBase, {
        ...incomingBase,
        mesKickoff: 7,
      });
      throw new Error('deveria ter lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(UpdateCompanyValidationError);
      expect((err as UpdateCompanyValidationError).canonicalMessage).toBe(MSG_ANO_FISCAL_IMUTAVEL);
    }
  });

  it('cobre os 4 campos invariantes canonicos bit-exact', () => {
    expect([...MODO_ANO_FISCAL_KICKOFF_INVARIANT_FIELDS]).toEqual([
      'modoAnoFiscal',
      'mesInicioAnoFiscal',
      'mesKickoff',
      'kickoffDate',
    ]);
  });
});

describe('hasAnyMetaROIChanged', () => {
  it('false quando ambos sao null em todos os 3 campos', () => {
    expect(
      hasAnyMetaROIChanged(
        { metaROIOperacional: null, metaROITatico: null, metaROIEstrategico: null },
        { metaROIOperacional: null, metaROITatico: null, metaROIEstrategico: null },
      ),
    ).toBe(false);
  });

  it('true quando algum campo passa de null para numero', () => {
    expect(
      hasAnyMetaROIChanged(
        { metaROIOperacional: null, metaROITatico: null, metaROIEstrategico: null },
        { metaROIOperacional: 10, metaROITatico: null, metaROIEstrategico: null },
      ),
    ).toBe(true);
  });

  it('true quando algum campo altera valor', () => {
    expect(
      hasAnyMetaROIChanged(
        {
          metaROIOperacional: '10.00',
          metaROITatico: '12.00',
          metaROIEstrategico: '15.00',
        },
        { metaROIOperacional: 10, metaROITatico: 14, metaROIEstrategico: 15 },
      ),
    ).toBe(true);
  });

  it('false quando string DB == number input (tolerancia 0.005)', () => {
    expect(
      hasAnyMetaROIChanged(
        {
          metaROIOperacional: '10.00',
          metaROITatico: '12.50',
          metaROIEstrategico: '15.00',
        },
        { metaROIOperacional: 10, metaROITatico: 12.5, metaROIEstrategico: 15 },
      ),
    ).toBe(false);
  });

  it('trata undefined como null (input nao passado)', () => {
    expect(
      hasAnyMetaROIChanged(
        { metaROIOperacional: null, metaROITatico: null, metaROIEstrategico: null },
        { metaROIOperacional: undefined, metaROITatico: undefined, metaROIEstrategico: undefined },
      ),
    ).toBe(false);
  });
});

describe('formatDateISO', () => {
  it('formata UTC canonicamente bit-exact YYYY-MM-DD', () => {
    expect(formatDateISO(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
    expect(formatDateISO(new Date('2027-12-31T23:59:59Z'))).toBe('2027-12-31');
    expect(formatDateISO(new Date('2027-06-15T12:00:00Z'))).toBe('2027-06-15');
  });
});

describe('normalizeUpdateCompanyParametersInput', () => {
  it('normalizacao end-to-end preservando bit-exact valores validos', () => {
    const normalized = normalizeUpdateCompanyParametersInput(BASE_INPUT);
    expect(normalized.razaoSocial).toBe('Test LTDA');
    expect(normalized.modoAnoFiscal).toBe('padrao');
    expect(normalized.mesInicioAnoFiscal).toBe(1);
    expect(normalized.mesKickoff).toBe(4);
    expect(normalized.kickoffDate.getUTCFullYear()).toBe(2027);
    expect(normalized.metaROIOperacional).toBeNull();
    expect(normalized.encarregadoLgpdNome).toBeNull();
    expect(normalized.encarregadoLgpdEmail).toBeNull();
  });

  it('normaliza email LGPD invalido → erro canonico bit-exact', () => {
    expect(() =>
      normalizeUpdateCompanyParametersInput({
        ...BASE_INPUT,
        encarregadoLgpdEmail: 'invalido',
      }),
    ).toThrow(UpdateCompanyValidationError);
  });

  it('normaliza email LGPD valido preservando bit-exact', () => {
    const normalized = normalizeUpdateCompanyParametersInput({
      ...BASE_INPUT,
      encarregadoLgpdNome: 'Marcelo',
      encarregadoLgpdEmail: 'marcelo@empresa.com.br',
    });
    expect(normalized.encarregadoLgpdEmail).toBe('marcelo@empresa.com.br');
    expect(normalized.encarregadoLgpdNome).toBe('Marcelo');
  });

  it('rejeita modo padrao com kickoff invalido dentro da normalizacao', () => {
    expect(() =>
      normalizeUpdateCompanyParametersInput({
        ...BASE_INPUT,
        mesKickoff: 5,
      }),
    ).toThrow(UpdateCompanyValidationError);
  });
});
