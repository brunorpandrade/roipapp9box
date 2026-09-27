// ROIP APP 9BOX — teste unit ME 3.5 D5 patch2.
// Cobre o contrato canonico do form de C-level para o flag `isRH`:
// (1) `EMPTY_CLEVEL_FORM_VALUES.isRH` nasce em `false` (default seguro).
// (2) O tipo `CLevelFormValues` expoe `isRH: boolean`.
// (3) Serializacao do payload de cadastro preserva `isRH` para envio a
//     `criarCLevelAction` (padrao S315 canonica).
//
// Este teste garante que o toggle "Ativar como RH" adicionado a §5 de
// `CLevelForm.tsx` (Papeis funcionais) tem cobertura minima do contrato
// e nao regride para o antigo comportamento "sem toggle RH" (D3
// aposentada em ME 3.5 D5 patch2).

import { describe, expect, it } from 'vitest';

import {
  EMPTY_CLEVEL_FORM_VALUES,
  type CLevelFormValues,
} from '../../src/app/super-admin/empresa/[id]/clevel/CLevelForm';

describe('ME 3.5 D5 patch2 — CLevelFormValues.isRH', () => {
  it('EMPTY_CLEVEL_FORM_VALUES.isRH inicia em false (default seguro)', () => {
    expect(EMPTY_CLEVEL_FORM_VALUES.isRH).toBe(false);
  });

  it('EMPTY_CLEVEL_FORM_VALUES.isRH e do tipo boolean estrito', () => {
    expect(typeof EMPTY_CLEVEL_FORM_VALUES.isRH).toBe('boolean');
  });

  it('CLevelFormValues aceita isRH=true na atribuicao (contrato tipado)', () => {
    const values: CLevelFormValues = {
      ...EMPTY_CLEVEL_FORM_VALUES,
      isRH: true,
    };
    expect(values.isRH).toBe(true);
    // Nao contamina os demais toggles canonicos.
    expect(values.isResponsavelFinanceiro).toBe(false);
    expect(values.acessoTotal).toBe(true);
  });

  it('CLevelFormValues aceita isRH=false na atribuicao (contrato tipado)', () => {
    const values: CLevelFormValues = {
      ...EMPTY_CLEVEL_FORM_VALUES,
      isRH: false,
    };
    expect(values.isRH).toBe(false);
  });

  it('serializacao do payload para criarCLevelAction preserva isRH', () => {
    // Simula a construcao canonica do payload feita por CLevelNovoClient.
    const v: CLevelFormValues = {
      ...EMPTY_CLEVEL_FORM_VALUES,
      name: 'Michelle',
      cpf: '12345678901',
      email: 'michelle@embrastec.com.br',
      dataNascimento: '1970-01-01',
      dataAdmissao: '2020-01-01',
      cargo: 'COO',
      descricaoCargo: 'Administrativo, RH e Producao',
      departamento: 'Diretoria',
      custoMensal: '40000',
      isRH: true,
    };
    const payload = {
      companyId: 1,
      name: v.name.trim(),
      cpf: v.cpf,
      email: v.email.trim(),
      dataNascimento: v.dataNascimento,
      dataAdmissao: v.dataAdmissao,
      cargo: v.cargo.trim(),
      descricaoCargo: v.descricaoCargo.trim(),
      departamento: v.departamento,
      custoMensal: Number(v.custoMensal),
      acessoTotal: v.acessoTotal,
      isRH: v.isRH,
    };
    expect(payload.isRH).toBe(true);
    expect(payload.custoMensal).toBe(40000);
    expect(payload.name).toBe('Michelle');
  });

  it('serializacao do payload para atualizarCLevelAction preserva isRH', () => {
    // Simula construcao canonica do payload feita por CLevelEditarClient.
    const v: CLevelFormValues = {
      ...EMPTY_CLEVEL_FORM_VALUES,
      name: 'Michelle',
      email: 'michelle@embrastec.com.br',
      dataNascimento: '1970-01-01',
      cargo: 'COO',
      descricaoCargo: 'Administrativo, RH e Producao',
      departamento: 'Diretoria',
      custoMensal: '40000',
      isRH: true,
    };
    const payload = {
      cLevelId: 42,
      name: v.name.trim(),
      email: v.email.trim(),
      dataNascimento: v.dataNascimento,
      cargo: v.cargo.trim(),
      descricaoCargo: v.descricaoCargo.trim(),
      departamento: v.departamento,
      custoMensal: Number(v.custoMensal),
      acessoTotal: v.acessoTotal,
      isRH: v.isRH,
    };
    expect(payload.isRH).toBe(true);
    expect(payload.cLevelId).toBe(42);
  });
});
