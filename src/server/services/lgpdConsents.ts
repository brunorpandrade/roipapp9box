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
import { getTermoLiteral } from '../../lib/lgpd/termoLiteral';

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

// ME-023 — high-level orquestrador do gate LGPD ---------------------------
//
// Consumido pelos Route Handlers do portal (`POST /api/portal/login` e
// `POST /api/portal/consent-lgpd`). Compoe as primitivas ja existentes;
// nao introduz SQL novo. Titular polimorfico A: `type` distingue
// employee vs C-level.
//
// Fonte da versao vigente: env var `LGPD_TERM_VERSION` (§7.3), lida em
// `src/lib/env.ts`. Este service e agnostico do valor — recebe como
// parametro para manter as consultas puras (facil testar).

/** Tipo canonico do titular do consentimento (polimorfico A). */
type LgpdTitularType = 'employee' | 'clevel';

/**
 * Verifica se o titular tem consentimento vigente para a versao
 * canonica do termo. Consulta a UNIQUE `uq_lgpd_employee` ou
 * `uq_lgpd_clevel` (registro unico por versao). Retorna false quando
 * nao ha registro para a versao (gate pendente §7.2 caso d).
 */
export async function hasValidLGPDConsent(
  db: RoipDatabase,
  titularType: LgpdTitularType,
  titularId: number,
  versaoVigente: string,
): Promise<boolean> {
  const consent =
    titularType === 'employee'
      ? await getLgpdConsentByEmployeeVersao(db, titularId, versaoVigente)
      : await getLgpdConsentByClevelVersao(db, titularId, versaoVigente);
  return consent !== undefined;
}

/**
 * Grava o consentimento vigente do titular. Idempotencia — se ja existe
 * registro para (titular, versao) (UNIQUE canonica), reaproveita o id
 * existente sem lancar (§7.3: "consentimento único por versão").
 * Retorna o id do consentimento (novo ou pre-existente).
 */
export async function recordLGPDConsent(
  db: RoipDatabase,
  companyId: number,
  titularType: LgpdTitularType,
  titularId: number,
  versaoVigente: string,
): Promise<number> {
  const existing =
    titularType === 'employee'
      ? await getLgpdConsentByEmployeeVersao(db, titularId, versaoVigente)
      : await getLgpdConsentByClevelVersao(db, titularId, versaoVigente);
  if (existing !== undefined) {
    return existing.id;
  }
  return titularType === 'employee'
    ? await insertLgpdConsentForEmployee(db, companyId, titularId, versaoVigente)
    : await insertLgpdConsentForClevel(db, companyId, titularId, versaoVigente);
}

// ME-1.12.c Despacho A (item [1.12.c] do roadmap V4) ---------------------
//
// `getTermoAceiteDoTitular` — fonte canonica do consentimento mais
// recente do titular para a renderizacao da secao "Termo de aceite" no
// PDF LGPD (ambos os modos: colaborador e super_admin). Retorna versao
// + data civil do aceite + texto literal canonico resolvido via
// `src/lib/lgpd/termoLiteral.ts`. Rastreabilidade: o PDF do SA
// renderiza o texto exatamente como o titular aceitou (preserva
// versao antiga quando a base ja migrou).

/**
 * Retorno canonico de `getTermoAceiteDoTitular`. `aceitoEm` nunca e
 * null pois o schema `lgpdConsents.aceitoEm` tem `defaultNow()` e o
 * valor so e consultado quando o registro existe. `textoLiteral`
 * pode ser `null` quando a versao historica aceita saiu do mapa
 * `TERMO_LITERAL_POR_VERSAO` (fallback canonico renderizado pelo
 * template).
 */
interface TermoAceiteDoTitular {
  readonly versao: string;
  readonly aceitoEm: Date;
  readonly textoLiteral: string | null;
}

/**
 * Resolve o consentimento LGPD mais recente do titular (polimorfico
 * employee XOR clevel). Retorna `null` quando o titular nunca aceitou
 * nenhuma versao do termo — caso raro em producao pois o gate bloqueia
 * acesso ao portal sem aceite, mas o PDF do SA deve degradar
 * graciosamente (titular criado e nunca logou).
 *
 * Carrega o `textoLiteral` canonico da versao aceita via
 * `getTermoLiteral`. Versao historica desconhecida retorna
 * `textoLiteral=null` sem lancar.
 */
export async function getTermoAceiteDoTitular(
  db: RoipDatabase,
  titularType: LgpdTitularType,
  titularId: number,
): Promise<TermoAceiteDoTitular | null> {
  const rows =
    titularType === 'employee'
      ? await db
          .select({
            versao: lgpdConsents.versaoTermoAceita,
            aceitoEm: lgpdConsents.aceitoEm,
          })
          .from(lgpdConsents)
          .where(eq(lgpdConsents.employeeId, titularId))
          .orderBy(desc(lgpdConsents.aceitoEm), desc(lgpdConsents.id))
          .limit(1)
      : await db
          .select({
            versao: lgpdConsents.versaoTermoAceita,
            aceitoEm: lgpdConsents.aceitoEm,
          })
          .from(lgpdConsents)
          .where(eq(lgpdConsents.clevelId, titularId))
          .orderBy(desc(lgpdConsents.aceitoEm), desc(lgpdConsents.id))
          .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  if (row.aceitoEm === null) {
    return null;
  }
  return {
    versao: row.versao,
    aceitoEm: row.aceitoEm,
    textoLiteral: getTermoLiteral(row.versao),
  };
}
