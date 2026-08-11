// ROIP APP 9BOX — service `companies` (ME-010 + ME-075).
//
// Repositorio tipado da tabela canonica `companies` (DOC 01 §4.2). Toda
// persistencia via API tipada do Drizzle — nenhum SQL cru (RV-12). Cada
// export tem chamador nos testes de integracao da propria ME-010 (RV-13),
// e futuramente nos routers tRPC (Bloco B2).
//
// ME-075 canonica bit-exact (D086) — adiciona `updateCompanyParameters`
// e `hasFirstQuarterCalculated`. Ambos exportados sao consumidos por
// `src/server/routers/company.ts` na proc `updateParameters` (§13.1 DOC 05
// + §16 DOC 03 + §3.9 DOC 03).

import { eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { companies, performanceQuarterlyData } from '../../db/schema';
import type { NormalizedUpdate } from '../../lib/company/updateCompanyInput';

/** Tipo derivado do schema (payload de INSERT em `companies`). */
export type NewCompany = typeof companies.$inferInsert;

/**
 * Insere uma nova empresa. Retorna o `id` autogerado. Nao valida regras de
 * negocio da §4.2 (isso vive nos routers da B3); aqui e apenas persistencia
 * tipada.
 */
export async function createCompany(db: RoipDatabase, data: NewCompany): Promise<number> {
  const [result] = await db.insert(companies).values(data).$returningId();
  if (!result) {
    throw new Error('createCompany: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Busca uma empresa pelo id. Retorna `undefined` se nao existir.
 */
export async function getCompanyById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca uma empresa pelo CNPJ (apenas digitos, sem formatacao — DOC 01
 * §4.2). Retorna `undefined` se nao existir.
 */
export async function getCompanyByCnpj(db: RoipDatabase, cnpj: string) {
  const rows = await db.select().from(companies).where(eq(companies.cnpj, cnpj)).limit(1);
  return rows[0];
}

/**
 * Atualiza apenas o campo `status` de uma empresa. Nao toca em outros
 * campos. Retorna o numero de linhas afetadas para permitir asserts de
 * teste sem SELECT adicional.
 */
export async function updateCompanyStatus(
  db: RoipDatabase,
  id: number,
  status: 'ativa' | 'inativa',
): Promise<number> {
  const [result] = await db.update(companies).set({ status }).where(eq(companies.id, id));
  return result.affectedRows;
}

/**
 * Remove uma empresa pelo id. Somente para uso em teardown de testes; em
 * producao a inativacao e via `updateCompanyStatus`. Retorna o numero de
 * linhas afetadas.
 */
export async function deleteCompanyById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(companies).where(eq(companies.id, id));
  return result.affectedRows;
}

// ============================================================
// ME-075 — updateCompanyParameters (D086)
// ============================================================

/**
 * Atualiza os parametros gerais canonicos bit-exact §13.1 DOC 05 (Aba 1)
 * de uma empresa. **Nao altera `status`** (proc separada `setStatus` no
 * router). **Nao altera `id`/`isDemo`/`createdAt`/`updatedAt`.**
 * Retorna o numero de linhas afetadas para permitir asserts de teste.
 *
 * Validacoes de aplicacao (imutabilidade pos-primeiro-trimestre §13.1 +
 * regras modo padrao §4.2 linha 180) sao feitas no router antes da
 * chamada. Este servico e persistencia pura — nao decide nada.
 */
export async function updateCompanyParameters(
  db: RoipDatabase,
  companyId: number,
  data: NormalizedUpdate,
): Promise<number> {
  const [result] = await db
    .update(companies)
    .set({
      razaoSocial: data.razaoSocial,
      nomeFantasia: data.nomeFantasia,
      cnpj: data.cnpj,
      telefone: data.telefone,
      endereco: data.endereco,
      cidade: data.cidade,
      estado: data.estado,
      logoUrl: data.logoUrl,
      contatoPrincipalNome: data.contatoPrincipalNome,
      contatoPrincipalEmail: data.contatoPrincipalEmail,
      contatoRHNome: data.contatoRHNome,
      contatoRHEmail: data.contatoRHEmail,
      encarregadoLgpdNome: data.encarregadoLgpdNome,
      encarregadoLgpdEmail: data.encarregadoLgpdEmail,
      encarregadoLgpdTelefone: data.encarregadoLgpdTelefone,
      encarregadoLgpdPoliticaUrl: data.encarregadoLgpdPoliticaUrl,
      segmento: data.segmento,
      tipoAtividade: data.tipoAtividade,
      descricaoAtividade: data.descricaoAtividade,
      contextoMercado: data.contextoMercado,
      modoAnoFiscal: data.modoAnoFiscal,
      mesInicioAnoFiscal: data.mesInicioAnoFiscal,
      mesKickoff: data.mesKickoff,
      kickoffDate: data.kickoffDate,
      timezone: data.timezone,
      metaROIOperacional: data.metaROIOperacional === null ? null : String(data.metaROIOperacional),
      metaROITatico: data.metaROITatico === null ? null : String(data.metaROITatico),
      metaROIEstrategico: data.metaROIEstrategico === null ? null : String(data.metaROIEstrategico),
      roiSegmentoMinimo: data.roiSegmentoMinimo === null ? null : String(data.roiSegmentoMinimo),
      roiSegmentoMaximo: data.roiSegmentoMaximo === null ? null : String(data.roiSegmentoMaximo),
      folhaPercMinima: data.folhaPercMinima === null ? null : String(data.folhaPercMinima),
      folhaPercMaxima: data.folhaPercMaxima === null ? null : String(data.folhaPercMaxima),
      thresholdDesempenhoBaixo: data.thresholdDesempenhoBaixo,
      thresholdDesempenhoMedio: data.thresholdDesempenhoMedio,
      thresholdPlenitudeBaixo: data.thresholdPlenitudeBaixo,
      thresholdPlenitudeMedio: data.thresholdPlenitudeMedio,
    })
    .where(eq(companies.id, companyId));
  return result.affectedRows;
}

/**
 * §DOC 05 §13.1 linha 1506 (nota canonica) — predicado puro: existe pelo
 * menos uma linha em `performanceQuarterlyData` da empresa (indicando que
 * o primeiro trimestre ja foi calculado)? Consumido pelo router
 * `company.updateParameters` para decidir se a validacao de imutabilidade
 * do bloco ano fiscal e disparada.
 */
export async function hasFirstQuarterCalculated(
  db: RoipDatabase,
  companyId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: performanceQuarterlyData.id })
    .from(performanceQuarterlyData)
    .where(eq(performanceQuarterlyData.companyId, companyId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Auxiliar canonico bit-exact — busca os campos usados na validacao de
 * imutabilidade + no predicado de retroatividade em `updateParameters`.
 * Extrai bit-exact os 3 `metaROI*` + o bloco ano fiscal atual. Retorna
 * `undefined` se a empresa nao existir.
 */
export async function getCompanyForUpdate(db: RoipDatabase, companyId: number) {
  const rows = await db
    .select({
      id: companies.id,
      modoAnoFiscal: companies.modoAnoFiscal,
      mesInicioAnoFiscal: companies.mesInicioAnoFiscal,
      mesKickoff: companies.mesKickoff,
      kickoffDate: companies.kickoffDate,
      metaROIOperacional: companies.metaROIOperacional,
      metaROITatico: companies.metaROITatico,
      metaROIEstrategico: companies.metaROIEstrategico,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return rows[0];
}
