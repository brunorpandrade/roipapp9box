// ROIP APP 9BOX — regua de aceite: invalidacao de sessao por versao de
// credencial (pwv) no render server-side (DOC 02 §5.7).
//
// Mede o PRODUTO `resolveServerSession` contra o requisito §5.7, para os
// ramos super_admin e plataforma (lider). Prova RV-03 nos dois sentidos:
//   - Codigo conforme (com a comparacao de pwv em resolveServerSession):
//     A ok, B ok, C ok -> exit 0.
//   - Defeito injetado (comparacao de pwv desativada): B falha
//     (token com pwv defasado aceito) -> exit != 0.
//
// Requer MySQL real (RV-11): DATABASE_URL + JWT_SECRET no ambiente.

import { eq } from 'drizzle-orm';

import { createDbClient, closeDbClient } from '../../src/db/client';
import { companies, employees, superAdmins } from '../../src/db/schema';
import {
  DEPARTAMENTO_VALUES,
  JOB_FAMILY_VALUES,
  NIVEL_HIERARQUICO_VALUES,
} from '../../src/db/schema/enums';
import { hashPassword } from '../../src/server/auth/password';
import {
  deriveCredentialVersion,
  signPlatformToken,
  signSuperAdminToken,
} from '../../src/server/auth/jwt';
import { resolveServerSession } from '../../src/server/session/serverSession';

const CNPJ = '99999999000199';
const CPF = '00000000191';
const SA_EMAIL = 'regua-pwv-sa@roip.local';

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error('DATABASE_URL ausente');
  }
  return url;
}

async function main(): Promise<number> {
  const client = createDbClient(resolveDatabaseUrl());
  const db = client.db;
  const results: Array<{ name: string; pass: boolean }> = [];
  const record = (name: string, pass: boolean): void => {
    results.push({ name, pass });
  };

  try {
    // Limpeza idempotente dos registros da regua.
    await db.delete(employees).where(eq(employees.cpf, CPF));
    await db.delete(companies).where(eq(companies.cnpj, CNPJ));
    await db.delete(superAdmins).where(eq(superAdmins.email, SA_EMAIL));

    // --- Seed empresa ---
    await db.insert(companies).values({
      razaoSocial: 'Regua PWV Ltda',
      nomeFantasia: 'Regua PWV',
      cnpj: CNPJ,
      telefone: '0000000000',
      endereco: 'Rua Teste, 1',
      cidade: 'Porto Alegre',
      estado: 'RS',
      contatoPrincipalNome: 'Contato',
      contatoPrincipalEmail: 'contato@roip.local',
      contatoRHNome: 'RH',
      contatoRHEmail: 'rh@roip.local',
      segmento: 'Serviço',
      tipoAtividade: 'Teste',
      descricaoAtividade: 'Teste',
      contextoMercado: 'Teste',
      mesKickoff: 1,
      kickoffDate: new Date('2020-01-01'),
      status: 'ativa',
    });
    const companyRow = (
      await db.select({ id: companies.id }).from(companies).where(eq(companies.cnpj, CNPJ)).limit(1)
    )[0];
    if (companyRow === undefined) {
      throw new Error('seed company falhou');
    }
    const companyId = companyRow.id;

    // --- Seed employee (lider) ---
    const empHashV1 = await hashPassword('SenhaReguaV1a1');
    await db.insert(employees).values({
      companyId,
      name: 'Regua Lider',
      cpf: CPF,
      dataNascimento: new Date('1990-01-01'),
      dataAdmissao: new Date('2020-01-01'),
      cbo: '000000',
      descricaoCBO: 'Teste',
      jobFamily: JOB_FAMILY_VALUES[0],
      senioridade: 'pleno',
      nivelHierarquico: NIVEL_HIERARQUICO_VALUES[0],
      departamento: DEPARTAMENTO_VALUES[0],
      status: 'ativo',
      isLider: true,
      passwordHash: empHashV1,
      passwordSet: true,
    });
    const empRow = (
      await db.select({ id: employees.id }).from(employees).where(eq(employees.cpf, CPF)).limit(1)
    )[0];
    if (empRow === undefined) {
      throw new Error('seed employee falhou');
    }
    const empId = empRow.id;

    // --- Seed super admin ---
    const saHashV1 = await hashPassword('SenhaReguaSAv1a1');
    await db.insert(superAdmins).values({
      name: 'Regua SA',
      email: SA_EMAIL,
      passwordHash: saHashV1,
    });
    const saRow = (
      await db
        .select({ id: superAdmins.id })
        .from(superAdmins)
        .where(eq(superAdmins.email, SA_EMAIL))
        .limit(1)
    )[0];
    if (saRow === undefined) {
      throw new Error('seed super admin falhou');
    }
    const saId = saRow.id;

    // ================= Ramo plataforma (lider) =================
    const empTokenV1 = await signPlatformToken({
      userId: empId,
      role: 'lider',
      companyId,
      credentialVersion: deriveCredentialVersion(empHashV1),
    });
    // A) sessao valida corrente -> nao-nulo.
    const empA = await resolveServerSession(empTokenV1, db);
    record('emp.A token_v1 valido resolve', empA !== null);

    // Simula troca de senha: novo hash no banco.
    const empHashV2 = await hashPassword('SenhaReguaV2b2');
    await db.update(employees).set({ passwordHash: empHashV2 }).where(eq(employees.id, empId));

    // B) token antigo (pwv defasado) -> DEVE ser nulo (§5.7).
    const empB = await resolveServerSession(empTokenV1, db);
    record('emp.B token_v1 defasado rejeitado', empB === null);

    // C) token novo (pwv atual) -> nao-nulo (sessao corrente preservada).
    const empTokenV2 = await signPlatformToken({
      userId: empId,
      role: 'lider',
      companyId,
      credentialVersion: deriveCredentialVersion(empHashV2),
    });
    const empC = await resolveServerSession(empTokenV2, db);
    record('emp.C token_v2 atual resolve', empC !== null);

    // ================= Ramo super admin =================
    const saTokenV1 = await signSuperAdminToken({
      superAdminId: saId,
      credentialVersion: deriveCredentialVersion(saHashV1 + SA_EMAIL),
    });
    const saA = await resolveServerSession(saTokenV1, db);
    record('sa.A token_v1 valido resolve', saA !== null);

    const saHashV2 = await hashPassword('SenhaReguaSAv2b2');
    await db.update(superAdmins).set({ passwordHash: saHashV2 }).where(eq(superAdmins.id, saId));

    const saB = await resolveServerSession(saTokenV1, db);
    record('sa.B token_v1 defasado rejeitado', saB === null);

    const saTokenV2 = await signSuperAdminToken({
      superAdminId: saId,
      credentialVersion: deriveCredentialVersion(saHashV2 + SA_EMAIL),
    });
    const saC = await resolveServerSession(saTokenV2, db);
    record('sa.C token_v2 atual resolve', saC !== null);

    // Limpeza final.
    await db.delete(employees).where(eq(employees.id, empId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(superAdmins).where(eq(superAdmins.id, saId));
  } finally {
    await closeDbClient(client);
  }

  let allPass = true;
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.name}`);
    if (!r.pass) {
      allPass = false;
    }
  }
  console.log(allPass ? 'REGUA PWV: OK' : 'REGUA PWV: FALHOU');
  return allPass ? 0 : 1;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error('REGUA PWV: ERRO', err);
    process.exit(2);
  });
