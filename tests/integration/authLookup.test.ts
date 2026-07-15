// ROIP APP 9BOX — teste de integracao do service `authLookup` (ME-022a).
//
// Cobre o unico ponto do repositorio autorizado a resolver CPF
// cross-company (`findPlatformUserByCpf`, DOC 02 §4.1 b/c). Valida:
//
//   - Agregacao por companyId: mesmo CPF em `employees` e em
//     `cLevelMembers` da MESMA empresa produz UM candidato com ambos os
//     campos preenchidos (canonico §2.3 regra 2 admite este caso).
//   - CPF em empresas DIFERENTES produz N candidatos — a base para a
//     ambiguidade S019 tratada pelo handler.
//   - CPF apenas em `employees` ou apenas em `cLevelMembers`.
//   - CPF ausente: array vazio.
//   - Ordem deterministica por companyId ascendente.
//
// Padrao S009: company local com CNPJ unico. L32: cleanup em afterAll
// preservando `superAdmins` id=1. L36: datas < 2037.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees } from '../../src/db/schema';
import { createCompany } from '../../src/server/services/companies';
import { findPlatformUserByCpf } from '../../src/server/services/authLookup';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// CNPJs canonicos reservados a esta ME (S009). Proximos livres apos o
// consumo da ME-021 (`10000000000148`). Sao CNPJs sinteticos com digitos
// verificadores validos (mod 11) — validados manualmente durante a geracao
// para evitar quebra do check_cnpj_valid caso alguma tabela imponha.
const CNPJ_A = '10000000000229';
const CNPJ_B = '10000000000237';

const CPF_ONLY_EMPLOYEE = '30000010001';
const CPF_ONLY_CLEVEL = '30000010002';
const CPF_BOTH_SAME_COMPANY = '30000010003';
const CPF_CROSS_COMPANY = '30000010004';
const CPF_ABSENT = '99999999999';

describe('authLookup — findPlatformUserByCpf (ME-022a)', () => {
  let client: RoipDbClient;
  let companyIdA: number;
  let companyIdB: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);
    await closeDbClient(client);
  });

  beforeEach(async () => {
    await client.db.delete(employees);
    await client.db.delete(cLevelMembers);
    await client.db.delete(companies);

    companyIdA = await createCompany(client.db, {
      razaoSocial: 'ROIP AuthLookup A LTDA',
      nomeFantasia: 'ROIP AuthLookup A',
      cnpj: CNPJ_A,
      telefone: '1633330001',
      endereco: 'Rua A, 1',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal A',
      contatoPrincipalEmail: 'principal.a@roip.test',
      contatoRHNome: 'RH A',
      contatoRHEmail: 'rh.a@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade A',
      contextoMercado: 'Mercado A',
      mesKickoff: 1,
    });
    companyIdB = await createCompany(client.db, {
      razaoSocial: 'ROIP AuthLookup B LTDA',
      nomeFantasia: 'ROIP AuthLookup B',
      cnpj: CNPJ_B,
      telefone: '1633330002',
      endereco: 'Rua B, 2',
      cidade: 'Ribeirão Preto',
      estado: 'SP',
      contatoPrincipalNome: 'Principal B',
      contatoPrincipalEmail: 'principal.b@roip.test',
      contatoRHNome: 'RH B',
      contatoRHEmail: 'rh.b@roip.test',
      segmento: 'Serviço',
      tipoAtividade: 'Consultoria',
      descricaoAtividade: 'Atividade B',
      contextoMercado: 'Mercado B',
      mesKickoff: 1,
    });
    await client.db.update(companies).set({ status: 'ativa' });
  });

  async function seedEmployee(overrides: {
    companyId: number;
    cpf: string;
    passwordHash?: string | null;
    isRH?: boolean;
    isLider?: boolean;
  }): Promise<number> {
    const [row] = await client.db
      .insert(employees)
      .values({
        companyId: overrides.companyId,
        name: 'Emp',
        cpf: overrides.cpf,
        dataNascimento: new Date('1990-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '000000',
        descricaoCBO: 'Cargo',
        jobFamily: 'vendas_comercial',
        senioridade: 'pleno',
        nivelHierarquico: 'operacional',
        departamento: 'Comercial',
        isRH: overrides.isRH ?? false,
        isLider: overrides.isLider ?? false,
        passwordHash: overrides.passwordHash ?? null,
        passwordSet: overrides.passwordHash !== null && overrides.passwordHash !== undefined,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedEmployee sem id');
    }
    return row.id;
  }

  async function seedClevel(overrides: {
    companyId: number;
    cpf: string;
    passwordHash?: string | null;
  }): Promise<number> {
    const [row] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId: overrides.companyId,
        name: 'Clevel',
        cpf: overrides.cpf,
        email: `clevel-${overrides.cpf}@roip.test`,
        dataNascimento: new Date('1975-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cargo: 'CEO',
        descricaoCargo: 'Diretor Executivo',
        departamento: 'Diretoria',
        custoMensal: '20000.00',
        acessoTotal: true,
        passwordHash: overrides.passwordHash ?? null,
        passwordSet: overrides.passwordHash !== null && overrides.passwordHash !== undefined,
      })
      .$returningId();
    if (!row) {
      throw new Error('seedClevel sem id');
    }
    return row.id;
  }

  it('CPF ausente devolve array vazio', async () => {
    const result = await findPlatformUserByCpf(client.db, CPF_ABSENT);
    expect(result).toEqual([]);
  });

  it('CPF apenas em employees devolve 1 candidato com clevel undefined', async () => {
    await seedEmployee({ companyId: companyIdA, cpf: CPF_ONLY_EMPLOYEE, isRH: true });
    const result = await findPlatformUserByCpf(client.db, CPF_ONLY_EMPLOYEE);
    expect(result).toHaveLength(1);
    const [candidate] = result;
    expect(candidate?.companyId).toBe(companyIdA);
    expect(candidate?.employee).toBeDefined();
    expect(candidate?.clevel).toBeUndefined();
    expect(candidate?.employee?.isRH).toBe(true);
  });

  it('CPF apenas em cLevelMembers devolve 1 candidato com employee undefined', async () => {
    await seedClevel({ companyId: companyIdA, cpf: CPF_ONLY_CLEVEL });
    const result = await findPlatformUserByCpf(client.db, CPF_ONLY_CLEVEL);
    expect(result).toHaveLength(1);
    const [candidate] = result;
    expect(candidate?.companyId).toBe(companyIdA);
    expect(candidate?.employee).toBeUndefined();
    expect(candidate?.clevel).toBeDefined();
  });

  it('CPF em employees + cLevelMembers da MESMA empresa agrega em 1 candidato', async () => {
    // Canonico §2.3 regra 2 admite este caso.
    await seedEmployee({ companyId: companyIdA, cpf: CPF_BOTH_SAME_COMPANY, isLider: true });
    await seedClevel({ companyId: companyIdA, cpf: CPF_BOTH_SAME_COMPANY });
    const result = await findPlatformUserByCpf(client.db, CPF_BOTH_SAME_COMPANY);
    expect(result).toHaveLength(1);
    const [candidate] = result;
    expect(candidate?.companyId).toBe(companyIdA);
    expect(candidate?.employee).toBeDefined();
    expect(candidate?.clevel).toBeDefined();
    expect(candidate?.employee?.isLider).toBe(true);
  });

  it('CPF em empresas DIFERENTES devolve N candidatos ordenados por companyId', async () => {
    // Base para o cenario S019 (ambiguidade fail-safe no handler).
    await seedEmployee({ companyId: companyIdB, cpf: CPF_CROSS_COMPANY, isRH: true });
    await seedEmployee({ companyId: companyIdA, cpf: CPF_CROSS_COMPANY, isLider: true });
    const result = await findPlatformUserByCpf(client.db, CPF_CROSS_COMPANY);
    expect(result).toHaveLength(2);
    // Ordem canonica ascendente por companyId.
    expect(result[0]?.companyId).toBe(Math.min(companyIdA, companyIdB));
    expect(result[1]?.companyId).toBe(Math.max(companyIdA, companyIdB));
  });
});
