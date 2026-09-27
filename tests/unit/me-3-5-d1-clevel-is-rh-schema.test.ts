// ROIP APP 9BOX — teste unit ME 3.5 Dispatch 1.
//
// Regua RV-03 dirigida ao contrato canonico do isRH em cLevelMembers:
//   1. `CREATE_CLEVEL_INPUT_SCHEMA` aceita `isRH` boolean (default false).
//   2. `UPDATE_CLEVEL_INPUT_SCHEMA` aceita `isRH` boolean opcional.
//   3. `buildCLevelInsertPayload` propaga `isRH` do input para o payload
//      do INSERT (default false quando ausente).
//   4. `CLevelListRow` expoe o campo (RV-13 — consumido a partir do D5).
//   5. `GetByIdCLevelResult` expoe o campo (RV-13 — pre-populacao do form).
//
// Injecao canonica RV-03 (prova bilateral em CI):
//   - Caso bom (esta regua no HEAD): exit 0.
//   - Defeito injetado (remover `isRH` do CREATE_CLEVEL_INPUT_SCHEMA):
//     este teste reprova em "aceita isRH=true".
//   - Defeito injetado (remover propagacao no `buildCLevelInsertPayload`):
//     este teste reprova em "propaga isRH=true no payload".
//
// Padrao S049 canonico: teste puro, sem I/O (sem MySQL, sem tRPC caller).
// A validacao ponta-a-ponta com MySQL real fica no D6 (bateria de seguranca
// expandida §8.11 → 32/32).

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CREATE_CLEVEL_INPUT_SCHEMA,
  UPDATE_CLEVEL_INPUT_SCHEMA,
  buildCLevelInsertPayload,
  type CLevelListRow,
  type GetByIdCLevelResult,
} from '../../src/server/routers/cLevelMembers';

// -----------------------------------------------------------------------
// Fixture canonica minima do input do `create`.
// -----------------------------------------------------------------------

function baseCreateInput() {
  return {
    companyId: 1,
    name: 'Diretor Teste',
    cpf: '11144477735',
    email: 'diretor@empresa.com.br',
    dataNascimento: '1980-01-15',
    dataAdmissao: '2020-01-15',
    cargo: 'CEO',
    descricaoCargo: 'Diretor executivo principal',
    departamento: 'Diretoria' as const,
    custoMensal: 30000,
    acessoTotal: true,
  };
}

// -----------------------------------------------------------------------
// 1) Schema Zod do `create` aceita isRH
// -----------------------------------------------------------------------

describe('ME 3.5 D1 — CREATE_CLEVEL_INPUT_SCHEMA aceita isRH', () => {
  it('parseia com isRH=true', () => {
    const parsed = CREATE_CLEVEL_INPUT_SCHEMA.parse({
      ...baseCreateInput(),
      isRH: true,
    });
    expect(parsed.isRH).toBe(true);
  });

  it('parseia com isRH=false explicito', () => {
    const parsed = CREATE_CLEVEL_INPUT_SCHEMA.parse({
      ...baseCreateInput(),
      isRH: false,
    });
    expect(parsed.isRH).toBe(false);
  });

  it('aplica default false quando isRH ausente', () => {
    const parsed = CREATE_CLEVEL_INPUT_SCHEMA.parse(baseCreateInput());
    expect(parsed.isRH).toBe(false);
  });

  it('rejeita isRH string', () => {
    expect(() =>
      CREATE_CLEVEL_INPUT_SCHEMA.parse({
        ...baseCreateInput(),
        isRH: 'sim' as unknown as boolean,
      }),
    ).toThrow();
  });
});

// -----------------------------------------------------------------------
// 2) Schema Zod do `update` aceita isRH opcional
// -----------------------------------------------------------------------

describe('ME 3.5 D1 — UPDATE_CLEVEL_INPUT_SCHEMA aceita isRH opcional', () => {
  it('parseia com isRH=true', () => {
    const parsed = UPDATE_CLEVEL_INPUT_SCHEMA.parse({
      cLevelId: 1,
      isRH: true,
    });
    expect(parsed.isRH).toBe(true);
  });

  it('parseia com isRH=false', () => {
    const parsed = UPDATE_CLEVEL_INPUT_SCHEMA.parse({
      cLevelId: 1,
      isRH: false,
    });
    expect(parsed.isRH).toBe(false);
  });

  it('aceita ausencia de isRH (update parcial de outro campo)', () => {
    const parsed = UPDATE_CLEVEL_INPUT_SCHEMA.parse({
      cLevelId: 1,
      cargo: 'Novo cargo',
    });
    expect(parsed.isRH).toBeUndefined();
    expect(parsed.cargo).toBe('Novo cargo');
  });
});

// -----------------------------------------------------------------------
// 3) buildCLevelInsertPayload propaga isRH
// -----------------------------------------------------------------------

describe('ME 3.5 D1 — buildCLevelInsertPayload propaga isRH', () => {
  it('propaga isRH=true no payload do INSERT', () => {
    const input = CREATE_CLEVEL_INPUT_SCHEMA.parse({
      ...baseCreateInput(),
      isRH: true,
    });
    const payload = buildCLevelInsertPayload(input);
    expect(payload.isRH).toBe(true);
  });

  it('propaga isRH=false no payload do INSERT', () => {
    const input = CREATE_CLEVEL_INPUT_SCHEMA.parse({
      ...baseCreateInput(),
      isRH: false,
    });
    const payload = buildCLevelInsertPayload(input);
    expect(payload.isRH).toBe(false);
  });

  it('propaga isRH=false quando ausente no input original (default aplicado)', () => {
    const input = CREATE_CLEVEL_INPUT_SCHEMA.parse(baseCreateInput());
    const payload = buildCLevelInsertPayload(input);
    expect(payload.isRH).toBe(false);
  });

  it('nao muda outros campos ao propagar isRH', () => {
    const input = CREATE_CLEVEL_INPUT_SCHEMA.parse({
      ...baseCreateInput(),
      isRH: true,
    });
    const payload = buildCLevelInsertPayload(input);
    expect(payload.name).toBe('Diretor Teste');
    expect(payload.isResponsavelFinanceiro).toBe(false);
    expect(payload.acessoTotal).toBe(true);
  });
});

// -----------------------------------------------------------------------
// 4) Tipos publicos exportados expõem isRH (RV-13)
// -----------------------------------------------------------------------

describe('ME 3.5 D1 — tipos publicos exportam isRH (RV-13)', () => {
  it('CLevelListRow tem propriedade readonly isRH: boolean', () => {
    expectTypeOf<CLevelListRow>().toHaveProperty('isRH').toBeBoolean();
  });

  it('GetByIdCLevelResult tem propriedade readonly isRH: boolean', () => {
    expectTypeOf<GetByIdCLevelResult>().toHaveProperty('isRH').toBeBoolean();
  });
});
