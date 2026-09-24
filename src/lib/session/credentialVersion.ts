// ROIP APP 9BOX — versao de credencial vigente (pwv, S011) — modulo
// compartilhado.
//
// Origem canonica: DOC 02 §5.7 (invalidacao de sessao por versao de
// credencial). Este modulo e a UNICA implementacao da derivacao do pwv
// vigente do titular de um token. Consumido por:
//   - `src/server/trpc.ts` (middleware `authed`, transporte tRPC).
//   - `src/server/session/serverSession.ts` (`resolveServerSession`,
//     render server-side dos paineis).
//
// Antes desta extracao (ME de correcao dos Debitos A e B da §8.07) a
// derivacao vivia apenas dentro de `trpc.ts`; o render server-side via
// `getServerSession` NAO comparava pwv, permitindo que uma sessao com
// credencial ja trocada continuasse abrindo paineis renderizados no
// servidor (falha de invalidacao). RV-14: implementacao unica, sem duas
// copias — `trpc.ts` passa a importar deste modulo.

import type { RoipDatabase } from '../../db/client';
import { deriveCredentialVersion, type VerifiedToken } from '../../server/auth/jwt';
import { getCLevelMemberById } from '../../server/services/cLevelMembers';
import { getEmployeeById } from '../../server/services/employees';
import { getSuperAdminById } from '../../server/services/superAdmins';

/**
 * Deriva a versao de credencial vigente do titular do token (§5.7, S011).
 * Retorna null quando o titular nao existe ou nao possui `passwordHash`
 * definido (S014): um token cujo titular sumiu ou nunca definiu senha e
 * tratado como sessao invalida, nunca como AccessDenied.
 *
 * O consumidor compara o retorno com o claim `credentialVersion` do token:
 * `expected === null || expected !== token.claims.credentialVersion` = sessao
 * invalida (UNAUTHORIZED no transporte tRPC; `null` no render server-side).
 */
export async function currentCredentialVersion(
  db: RoipDatabase,
  token: VerifiedToken,
): Promise<string | null> {
  if (token.kind === 'super_admin') {
    const admin = await getSuperAdminById(db, token.claims.superAdminId);
    if (admin === undefined) {
      return null;
    }
    // Super Admin: e-mail participa da derivacao (§5.7 — alteracao de
    // e-mail tambem invalida sessoes). `passwordHash` e NOT NULL na tabela.
    return deriveCredentialVersion(admin.passwordHash + admin.email);
  }

  if (token.claims.role === 'clevel') {
    const member = await getCLevelMemberById(db, token.claims.userId);
    if (member === undefined || member.passwordHash === null) {
      return null;
    }
    return deriveCredentialVersion(member.passwordHash);
  }

  // rh | rh_lider | lider — titular em `employees`.
  const employee = await getEmployeeById(db, token.claims.userId);
  if (employee === undefined || employee.passwordHash === null) {
    return null;
  }
  return deriveCredentialVersion(employee.passwordHash);
}
