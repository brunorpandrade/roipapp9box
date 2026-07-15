// ROIP APP 9BOX — service `authLookup` (ME-022a).
//
// Resolucao de titular por CPF para o login unificado (DOC 02 §4.1 passos
// b/c). O login unificado NAO recebe `companyId` como input — o usuario
// digita apenas CPF e senha — enquanto o UNIQUE canonico de `employees` e
// `cLevelMembers` e `(companyId, cpf)` (DOC 01 §4.4 e §4.5). Este service
// e o unico ponto do repositorio autorizado a resolver CPF cross-company:
// os services `employees.getByCpf` e `cLevelMembers.getByCpf` continuam
// escopados por empresa (regime de dominio do Bloco B3).
//
// Semantica canonica de agregacao (DOC 02 §2.3):
//   Uma pessoa em UMA empresa e UM candidato — mesmo se o CPF aparecer em
//   `employees` E em `cLevelMembers` dessa empresa (cenario admitido
//   explicitamente pela regra 2 de §2.3, que decide entre os dois
//   registros por precedencia). Portanto os candidatos sao agregados por
//   `companyId`; a regra §2.3 e aplicada FORA deste service, pelo handler
//   do login, quando ha apenas um candidato.
//
// Semantica canonica de ambiguidade (S019 — opcao A):
//   Se o mesmo CPF existir em MAIS de uma empresa (schema admite, canonico
//   nao regula), o handler do login trata como "nao encontrado" — mesma
//   mensagem anti-enumeracao "CPF ou senha incorretos.". Este service se
//   limita a devolver TODOS os candidatos por empresa; a decisao de
//   bloqueio e do handler. Divida D004 registrada: consolidacao futura em
//   UNIQUE global de CPF administrativo, quando o volume real justificar.
//
// RV-12: zero SQL cru. RV-13: chamador exclusivo `auth.loginPlatform`
// (ME-022a) e, na ME-022b, `auth.forgotPassword` (branch CPF). O teste de
// integracao desta ME (`authLookup.test.ts`) tambem consta como chamador —
// convencao do repositorio herdada do Bloco B1.

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, employees } from '../../db/schema';

/** Registro de `employees` retornado pela busca (tipagem inferida). */
type EmployeeRow = typeof employees.$inferSelect;

/** Registro de `cLevelMembers` retornado pela busca (tipagem inferida). */
type CLevelMemberRow = typeof cLevelMembers.$inferSelect;

/**
 * Candidato agregado por empresa. Um dos dois campos SEMPRE esta
 * preenchido (a agregacao ocorre porque o CPF apareceu em pelo menos uma
 * das duas tabelas dessa empresa); ambos podem estar preenchidos quando o
 * canonico §2.3 regra 2 se aplica (mesmo CPF em `employees` e em
 * `cLevelMembers` da mesma empresa).
 */
export interface PlatformUserCandidate {
  companyId: number;
  employee: EmployeeRow | undefined;
  clevel: CLevelMemberRow | undefined;
}

/**
 * Busca cross-company do CPF em `employees` e `cLevelMembers` e agrega por
 * `companyId`. Retorna a lista ordenada por `companyId` ascendente para
 * comportamento deterministico em testes e logs.
 *
 * A funcao NAO filtra por `status`, NAO aplica §2.3 e NAO decide bloqueio:
 * so entrega dado bruto agregado. Toda politica canonica (anti-enumeracao,
 * ambiguidade S019, precedencia §2.3, guard de empresa inativa) vive no
 * handler `auth.loginPlatform`.
 */
export async function findPlatformUserByCpf(
  db: RoipDatabase,
  cpf: string,
): Promise<PlatformUserCandidate[]> {
  const [employeeRows, clevelRows] = await Promise.all([
    db.select().from(employees).where(eq(employees.cpf, cpf)),
    db.select().from(cLevelMembers).where(eq(cLevelMembers.cpf, cpf)),
  ]);

  const byCompanyId = new Map<number, PlatformUserCandidate>();

  for (const row of employeeRows) {
    byCompanyId.set(row.companyId, {
      companyId: row.companyId,
      employee: row,
      clevel: undefined,
    });
  }

  for (const row of clevelRows) {
    const existing = byCompanyId.get(row.companyId);
    if (existing === undefined) {
      byCompanyId.set(row.companyId, {
        companyId: row.companyId,
        employee: undefined,
        clevel: row,
      });
    } else {
      existing.clevel = row;
    }
  }

  return Array.from(byCompanyId.values()).sort((a, b) => a.companyId - b.companyId);
}
