// ROIP APP 9BOX — provisionamento canonico de credenciais (ME-080b Dispatch 2).
//
// Escopo canonico: coordenar a geracao de matriculas unicas por empresa e
// senhas iniciais bcrypted para employees e cLevelMembers. Consumido por:
//   - `employees.create` (Dispatch 2): matricula sempre; senha se
//     `isLider|isRH=true`.
//   - `employees.update` (Dispatch 2): senha se toggle de isLider|isRH liga
//     para true e o colaborador nao tem passwordHash.
//   - `employees.regenerateMatricula` / `regeneratePassword` (Dispatch 2).
//   - `cLevelMembers.create` (Dispatch 2): matricula e senha sempre.
//   - `cLevelMembers.regenerateMatricula` / `regeneratePassword` (Dispatch 2).
//   - `company.setResponsavelFinanceiro` (Dispatch 2): senha se o novo
//     titular RF for employee sem passwordHash.
//   - `employees.uploadCSV` (Dispatch 4): lote de matriculas e senhas.
//   - Reseed Nativa (Dispatch 5): geracao deterministica via seed.
//
// Convencoes canonicas (S515, S516):
//   - Matricula: formato `^[A-Z]{2}[0-9]{2}$`, UNIQUE por companyId.
//     Uppercase sempre — normalizacao acontece antes da geracao/consulta.
//   - Senha inicial: 8 chars alfanumericos, plain text SO devolvido nesta
//     chamada; nunca persistido. `passwordSet=false` no INSERT/UPDATE para
//     obrigar troca no primeiro acesso (Dispatch 3).
//
// RV-12: zero SQL cru. RV-13: consumidores listados acima; teste unit
// (`credentialProvisioning.test.ts`) tambem conta como chamador.

import { and, eq, isNotNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cLevelMembers, employees } from '../../db/schema';
import {
  createMatriculaPrng,
  generateUniqueMatriculas,
  MATRICULA_REGEX,
} from '../../lib/auth/matriculaGenerator';
import { createPasswordPrng, generateInitialPassword } from '../../lib/auth/passwordGenerator';
import { hashPassword } from '../auth/password';

/**
 * Seed nao-deterministico para uso em runtime (create/regenerate em UI).
 * Reseed deterministico da Nativa (Dispatch 5) usa seed fixo — nao passa
 * por aqui. Este helper garante que cada chamada em runtime tenha entropia
 * distinta (evita colisao entre requisicoes concorrentes).
 */
function runtimeSeed(): number {
  // `Math.random() * 2^32` cobre todo o espaco de 32-bit sem sinal.
  return (Math.random() * 0x100000000) >>> 0;
}

/**
 * Coleta o conjunto atual de matriculas em uso na empresa (employees +
 * cLevelMembers), unificado para evitar colisao cross-tabela dentro do
 * mesmo escopo canonico `(companyId, matricula)`.
 *
 * O UNIQUE canonico e por tabela — nao ha constraint cross-tabela. Mas do
 * ponto de vista do usuario ambas as matriculas coexistem no mesmo login
 * do portal, entao a colisao cross-tabela na mesma empresa quebraria a
 * unicidade percebida. Este set consolida ambos os universos.
 */
async function loadExistingMatriculas(db: RoipDatabase, companyId: number): Promise<Set<string>> {
  const [empRows, clevelRows] = await Promise.all([
    db
      .select({ matricula: employees.matricula })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), isNotNull(employees.matricula))),
    db
      .select({ matricula: cLevelMembers.matricula })
      .from(cLevelMembers)
      .where(and(eq(cLevelMembers.companyId, companyId), isNotNull(cLevelMembers.matricula))),
  ]);
  const set = new Set<string>();
  for (const row of empRows) {
    if (row.matricula !== null) set.add(row.matricula);
  }
  for (const row of clevelRows) {
    if (row.matricula !== null) set.add(row.matricula);
  }
  return set;
}

/**
 * Gera uma matricula unica para uma empresa consultando o estado atual do
 * banco. Retorna o plain text ja em uppercase, pronto para INSERT/UPDATE.
 */
export async function provisionUniqueMatricula(
  db: RoipDatabase,
  companyId: number,
): Promise<string> {
  const existing = await loadExistingMatriculas(db, companyId);
  const prng = createMatriculaPrng(runtimeSeed());
  const [matricula] = generateUniqueMatriculas(1, prng, existing);
  if (matricula === undefined) {
    // generateUniqueMatriculas lanca se esgotar; guard defensivo aqui.
    throw new Error('provisionUniqueMatricula: falha ao gerar matricula unica.');
  }
  return matricula;
}

/**
 * Valida uma matricula fornecida externamente (ex.: RH digitou no cadastro
 * individual em vez de clicar "Gerar"): formato canonico + unicidade contra
 * o conjunto de existentes. Ja normaliza para uppercase antes de tudo.
 */
export async function validateProvidedMatricula(
  db: RoipDatabase,
  companyId: number,
  raw: string,
  opts: { excludeEmployeeId?: number; excludeClevelId?: number } = {},
): Promise<{ ok: true; matricula: string } | { ok: false; reason: 'formato' | 'duplicada' }> {
  const upper = raw.trim().toUpperCase();
  if (!MATRICULA_REGEX.test(upper)) {
    return { ok: false, reason: 'formato' };
  }
  // Verifica se ja existe na mesma empresa (excluindo o proprio registro
  // no caso de edicao — evitar falso positivo de "duplicada" contra si
  // mesmo quando o RH mantem a matricula atual na tela e clica salvar).
  const existing = await loadExistingMatriculas(db, companyId);
  // Se opts pediram excluir um id, precisamos remover a matricula atual
  // desse id do set de "usadas".
  if (opts.excludeEmployeeId !== undefined) {
    const rows = await db
      .select({ matricula: employees.matricula })
      .from(employees)
      .where(eq(employees.id, opts.excludeEmployeeId));
    const own = rows[0]?.matricula;
    if (own !== null && own !== undefined) existing.delete(own);
  }
  if (opts.excludeClevelId !== undefined) {
    const rows = await db
      .select({ matricula: cLevelMembers.matricula })
      .from(cLevelMembers)
      .where(eq(cLevelMembers.id, opts.excludeClevelId));
    const own = rows[0]?.matricula;
    if (own !== null && own !== undefined) existing.delete(own);
  }
  if (existing.has(upper)) {
    return { ok: false, reason: 'duplicada' };
  }
  return { ok: true, matricula: upper };
}

/**
 * Gera uma senha inicial em plain text e o hash bcrypt correspondente.
 * O consumidor grava o hash em `passwordHash` (com `passwordSet=false`) e
 * devolve o plain text ao usuario final via retorno da mutation — plain
 * text NUNCA e persistido.
 */
export async function provisionInitialPassword(): Promise<{
  plain: string;
  hash: string;
}> {
  const prng = createPasswordPrng(runtimeSeed());
  const plain = generateInitialPassword(prng);
  const hash = await hashPassword(plain);
  return { plain, hash };
}
