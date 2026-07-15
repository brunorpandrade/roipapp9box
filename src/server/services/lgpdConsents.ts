// ROIP APP 9BOX — service `lgpdConsents` (ME-017).
//
// Repositorio tipado da tabela canonica `lgpdConsents` (DOC 01 §14.1).
// Consentimento unico simples, persistido APENAS no aceite explicito —
// nunca existe estado "pendente" gravado. Padrao polimorfico A:
// exatamente uma das FKs `employeeId` / `clevelId` esta preenchida.
//
// A exclusividade e imposta pelo CHECK canonico
// `chk_lgpd_titular_unico` (declarado na migration por S004 — CHECKs
// vivem na migration, nao em `tables.ts`). O CHECK bloqueia
// (employeeId != NULL AND clevelId != NULL) e (both NULL).
//
// UNIQUE polimorficas separadas — mesmo padrao dos UNIQUE polimorficos
// de `iqlData` (ME-014):
//   uq_lgpd_employee (employeeId, versaoTermoAceita)
//   uq_lgpd_clevel   (clevelId, versaoTermoAceita)
// Como MySQL trata NULL como distinto em UNIQUE, as duas convivem sem
// conflito: linhas de employee tem clevelId=NULL, e vice-versa.
//
// Sem edicao pos-aceite (imutabilidade por design). Sem tratamento
// retroativo (base ainda nao implantada em cliente real na
// consolidacao — §14.1).

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { lgpdConsents } from '../../db/schema';

/**
 * Insere o consentimento de um employee (padrao polimorfico A —
 * `clevelId` fica NULL). Retorna o `id` autogerado. Erros de FK
 * (`companyId`, `employeeId`), CHECK (`chk_lgpd_titular_unico`) e
 * UNIQUE (`uq_lgpd_employee`) sobem como excecoes do mysql2.
 */
export async function insertLgpdConsentForEmployee(
  db: RoipDatabase,
  companyId: number,
  employeeId: number,
  versaoTermoAceita: string,
): Promise<number> {
  const [result] = await db
    .insert(lgpdConsents)
    .values({ companyId, employeeId, clevelId: null, versaoTermoAceita })
    .$returningId();
  if (!result) {
    throw new Error('insertLgpdConsentForEmployee: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Insere o consentimento de um C-level (padrao polimorfico A —
 * `employeeId` fica NULL). Retorna o `id` autogerado. Erros de FK
 * (`companyId`, `clevelId`), CHECK (`chk_lgpd_titular_unico`) e
 * UNIQUE (`uq_lgpd_clevel`) sobem como excecoes do mysql2.
 */
export async function insertLgpdConsentForClevel(
  db: RoipDatabase,
  companyId: number,
  clevelId: number,
  versaoTermoAceita: string,
): Promise<number> {
  const [result] = await db
    .insert(lgpdConsents)
    .values({ companyId, employeeId: null, clevelId, versaoTermoAceita })
    .$returningId();
  if (!result) {
    throw new Error('insertLgpdConsentForClevel: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Busca o consentimento de um employee para uma dada versao do termo.
 * Cobre a UNIQUE `uq_lgpd_employee`.
 */
export async function getLgpdConsentByEmployeeVersao(
  db: RoipDatabase,
  employeeId: number,
  versaoTermoAceita: string,
) {
  const rows = await db
    .select()
    .from(lgpdConsents)
    .where(
      and(
        eq(lgpdConsents.employeeId, employeeId),
        eq(lgpdConsents.versaoTermoAceita, versaoTermoAceita),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Busca o consentimento de um C-level para uma dada versao do termo.
 * Cobre a UNIQUE `uq_lgpd_clevel`.
 */
export async function getLgpdConsentByClevelVersao(
  db: RoipDatabase,
  clevelId: number,
  versaoTermoAceita: string,
) {
  const rows = await db
    .select()
    .from(lgpdConsents)
    .where(
      and(
        eq(lgpdConsents.clevelId, clevelId),
        eq(lgpdConsents.versaoTermoAceita, versaoTermoAceita),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os consentimentos de um employee, ordenados por
 * `aceitoEm` descendente (mais recente primeiro).
 */
export async function listLgpdConsentsByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(lgpdConsents)
    .where(eq(lgpdConsents.employeeId, employeeId))
    .orderBy(desc(lgpdConsents.aceitoEm), desc(lgpdConsents.id));
}

/**
 * Remove todos os consentimentos de uma empresa (teardown de testes;
 * producao mantem tudo — §16.4 retencao integral para logs LGPD).
 * Retorna linhas afetadas.
 */
export async function deleteLgpdConsentsByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db.delete(lgpdConsents).where(eq(lgpdConsents.companyId, companyId));
  return result.affectedRows;
}
