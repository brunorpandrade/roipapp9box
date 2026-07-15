// ROIP APP 9BOX — service `radarNR1Reports` (ME-016).
//
// Repositorio tipado da tabela canonica `radarNR1Reports` (DOC 01
// §11.6 — nome canonico unico, D004). Estrutura minima de
// rastreabilidade das geracoes de relatorio do Radar NR-1: o documento
// e gerado on-the-fly e NAO e persistido — a tabela registra apenas o
// evento de geracao (empresa, ciclo, momento).
//
// Particularidade canonica do §11.6: `companyId` e `cicloDbId` sao
// AMBOS nullaveis e AMBOS com ON DELETE CASCADE dos respectivos pais —
// a delecao da empresa ou do ciclo apaga o rastro correspondente.
// Regime de escrita: apenas INSERT; nenhum UPDATE nem DELETE exposto —
// a limpeza ocorre exclusivamente pelos CASCADEs.

import { asc, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { radarNR1Reports } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewRadarNR1Report = typeof radarNR1Reports.$inferInsert;

/**
 * Registra uma geracao de relatorio do Radar NR-1. Retorna o `id`
 * autogerado. `companyId` e `cicloDbId` sao opcionais (§11.6); quando
 * presentes, erros de FK sobem como excecoes do mysql2.
 */
export async function insertRadarNR1Report(
  db: RoipDatabase,
  data: NewRadarNR1Report,
): Promise<number> {
  const [result] = await db.insert(radarNR1Reports).values(data).$returningId();
  if (!result) {
    throw new Error('insertRadarNR1Report: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um registro pelo `id`. Retorna `undefined` se nao existir. */
export async function getRadarNR1ReportById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(radarNR1Reports).where(eq(radarNR1Reports.id, id)).limit(1);
  return rows[0];
}

/**
 * Lista as geracoes de relatorio de uma empresa, mais recentes
 * primeiro (`id` descendente). Consumida pela trilha de auditoria de
 * exportacoes.
 */
export async function listRadarNR1ReportsByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(radarNR1Reports)
    .where(eq(radarNR1Reports.companyId, companyId))
    .orderBy(desc(radarNR1Reports.id));
}

/**
 * Lista as geracoes de relatorio de um ciclo, ordenadas por `id`
 * ascendente (ordem cronologica de geracao).
 */
export async function listRadarNR1ReportsByCiclo(db: RoipDatabase, cicloDbId: number) {
  return await db
    .select()
    .from(radarNR1Reports)
    .where(eq(radarNR1Reports.cicloDbId, cicloDbId))
    .orderBy(asc(radarNR1Reports.id));
}
