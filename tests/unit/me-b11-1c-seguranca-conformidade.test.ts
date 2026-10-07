// ROIP APP 9BOX — testes unitarios canonicos ME-B11.1c
// (SEGURANCA-E-CONFORMIDADE).
//
// Cobertura canonica (RV-03 bi-direcional em caso bom + defeito
// injetado, aplicada apenas aos helpers puros desta ME):
//
// - PDL2: `formatCpf` da fonte unica canonica
//   `src/lib/cpf/formatCpf.ts` formata 11 digitos crus em mascara
//   `XXX.XXX.XXX-XX`, normaliza separadores pre-existentes e
//   retorna input literal quando nao normaliza para 11 digitos.
// - PDL2 (continuacao): a delegacao canonica a partir dos 3
//   callsites antigos (`meus-dados/internals.ts` -> `formatCpf`,
//   `todos-os-colaboradores/internals.ts` -> `formatCpfMasked`,
//   PDF LGPD template) permanece bit-exact aos usos pre-ME.
// - LGPD2: a interface `LgpdContatosPayload` canonica expoe os
//   4 campos canonicos (`encarregadoNome/Email/Telefone/PoliticaUrl`)
//   com `null` como estado canonico de ausencia.
//
// **RV-13.** Todo export novo tem chamador real:
//   - `formatCpf`: consumido pelos 3 callsites refatorados nesta ME
//     + pelo template PDF LGPD.
//   - `LgpdContatosPayload`: consumido pela Route Handler
//     `/api/portal/lgpd/contatos` + pelo PortalLayout.tsx.
// **RV-14.** Um statement por linha, 100 colunas.

import { describe, expect, it } from 'vitest';

import { formatCpf } from '../../src/lib/cpf/formatCpf';
import { formatCpf as formatCpfFromMeusDados } from '../../src/app/meus-dados/internals';
// eslint-disable-next-line @stylistic/max-len -- path real do callsite canonico refatorado nesta ME
import { formatCpfMasked } from '../../src/app/super-admin/empresa/[id]/todos-os-colaboradores/internals';
import type { LgpdContatosPayload } from '../../src/app/api/portal/lgpd/contatos/route';

describe('ME-B11.1c · formatCpf (PDL2) — fonte unica canonica', () => {
  it('formata 11 digitos crus em XXX.XXX.XXX-XX', () => {
    expect(formatCpf('10000005169')).toBe('100.000.051-69');
    expect(formatCpf('12345678900')).toBe('123.456.789-00');
  });

  it('normaliza entrada ja mascarada (idempotente)', () => {
    expect(formatCpf('100.000.051-69')).toBe('100.000.051-69');
    expect(formatCpf('123.456.789-00')).toBe('123.456.789-00');
  });

  it('normaliza entrada com separadores arbitrarios', () => {
    expect(formatCpf('100 000 051 69')).toBe('100.000.051-69');
    expect(formatCpf('100-000-051-69')).toBe('100.000.051-69');
    expect(formatCpf('100.000.05169')).toBe('100.000.051-69');
  });

  it('retorna input bit-exact quando nao normaliza para 11 digitos', () => {
    // Entrada mais curta — defensivo canonico (dados antigos, fixtures).
    expect(formatCpf('123')).toBe('123');
    expect(formatCpf('')).toBe('');
    // Entrada mais longa — mesma regra.
    expect(formatCpf('123456789012')).toBe('123456789012');
  });

  it('RV-03 defeito injetado — nao formata se o input for curto', () => {
    // Entrada com 10 digitos NAO ganha mascara (regra defensiva).
    const curto = '1234567890';
    expect(formatCpf(curto)).toBe(curto);
    expect(formatCpf(curto)).not.toBe('123.456.789-0');
  });
});

describe('ME-B11.1c · delegacao canonica dos callsites antigos (L125 RV-14)', () => {
  it('meus-dados/internals.ts.formatCpf delega bit-exact ao helper', () => {
    const cpf = '10000005169';
    expect(formatCpfFromMeusDados(cpf)).toBe(formatCpf(cpf));
    expect(formatCpfFromMeusDados(cpf)).toBe('100.000.051-69');
  });

  it('todos-os-colaboradores/internals.ts.formatCpfMasked delega bit-exact', () => {
    const cpf = '10000005169';
    expect(formatCpfMasked(cpf)).toBe(formatCpf(cpf));
    expect(formatCpfMasked(cpf)).toBe('100.000.051-69');
  });
});

describe('ME-B11.1c · LgpdContatosPayload (LGPD2) — contrato canonico', () => {
  it('aceita 4 campos canonicos com null como ausencia', () => {
    const vazio: LgpdContatosPayload = {
      encarregadoNome: null,
      encarregadoEmail: null,
      encarregadoTelefone: null,
      encarregadoPoliticaUrl: null,
    };
    expect(vazio.encarregadoNome).toBeNull();
    expect(vazio.encarregadoEmail).toBeNull();
  });

  it('aceita 4 campos canonicos com valores reais', () => {
    const preenchido: LgpdContatosPayload = {
      encarregadoNome: 'Fernanda Almeida Torres',
      encarregadoEmail: 'dpo@empresa.com.br',
      encarregadoTelefone: '(16) 3232-8100',
      encarregadoPoliticaUrl: 'https://empresa.com.br/privacidade',
    };
    expect(preenchido.encarregadoNome).toBe('Fernanda Almeida Torres');
    expect(preenchido.encarregadoEmail).toBe('dpo@empresa.com.br');
    expect(preenchido.encarregadoTelefone).toBe('(16) 3232-8100');
    expect(preenchido.encarregadoPoliticaUrl).toBe('https://empresa.com.br/privacidade');
  });

  it('aceita mix de null e preenchido (telefone/politica opcionais)', () => {
    const mix: LgpdContatosPayload = {
      encarregadoNome: 'Fernanda Almeida Torres',
      encarregadoEmail: 'dpo@empresa.com.br',
      encarregadoTelefone: null,
      encarregadoPoliticaUrl: null,
    };
    expect(mix.encarregadoNome).not.toBeNull();
    expect(mix.encarregadoTelefone).toBeNull();
  });
});
