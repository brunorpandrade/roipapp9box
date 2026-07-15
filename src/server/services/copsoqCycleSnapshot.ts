// ROIP APP 9BOX — service `copsoqCycleSnapshot` (ME-016).
//
// Repositorio tipado da tabela canonica `copsoqCycleSnapshot` (DOC 01
// §11.2). Snapshot de elegibilidade congelado no dia da abertura do
// ciclo do Radar NR-1 — filho de `copsoqCycles` com ON DELETE CASCADE.
//
// Regime de mutabilidade: a COMPOSICAO do snapshot (quem esta nele,
// `departamentoId` de vinculo, `snapshotEm`) e congelada na abertura e
// nunca muda — se um departamento muda durante o ciclo, o respondente
// permanece vinculado ao `departamentoId` original (limitacao conhecida,
// §11.2). Ja os campos de ESTADO evoluem durante o ciclo, cada evento
// com setter dedicado (nao ha setter generico):
//
// - `markCopsoqSnapshotRespondeu` — resposta concluida: `respondeu`,
//   `respondidoEm`, `tempoRespostaSegundos`.
// - `markCopsoqSnapshotInvalida` — resposta invalidada pelo motor de
//   validade: `respostaInvalida` + `motivoInvalidade`
//   ('uniformidade' | 'tempo_baixo').
// - `markCopsoqSnapshotInativado` — colaborador inativado apos o
//   snapshot: `inativadoAposSnapshot`.
//
// Nao ha DELETE: a limpeza de snapshots ocorre exclusivamente pelo
// CASCADE do ciclo pai.

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { copsoqCycleSnapshot } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewCopsoqCycleSnapshot = typeof copsoqCycleSnapshot.$inferInsert;

/**
 * Insere uma linha de snapshot (um colaborador elegivel em um ciclo).
 * Retorna o `id` autogerado. Erros de FK (`cicloDbId`, `companyId`,
 * `employeeId`, `departamentoId`) e de UNIQUE (`uq_snapshot`) sobem
 * como excecoes do mysql2.
 */
export async function insertCopsoqCycleSnapshot(
  db: RoipDatabase,
  data: NewCopsoqCycleSnapshot,
): Promise<number> {
  const [result] = await db.insert(copsoqCycleSnapshot).values(data).$returningId();
  if (!result) {
    throw new Error('insertCopsoqCycleSnapshot: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getCopsoqCycleSnapshotById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(copsoqCycleSnapshot)
    .where(eq(copsoqCycleSnapshot.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca uma linha pela chave logica UNIQUE (`cicloDbId`, `employeeId`).
 * Retorna `undefined` se nao existir.
 */
export async function getCopsoqCycleSnapshotByKey(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
) {
  const rows = await db
    .select()
    .from(copsoqCycleSnapshot)
    .where(
      and(
        eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
        eq(copsoqCycleSnapshot.employeeId, employeeId),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista o snapshot completo de um ciclo, ordenado por `employeeId`
 * ascendente. Consumida pelos calculos de adesao e amostra minima.
 */
export async function listCopsoqCycleSnapshotsByCiclo(db: RoipDatabase, cicloDbId: number) {
  return await db
    .select()
    .from(copsoqCycleSnapshot)
    .where(eq(copsoqCycleSnapshot.cicloDbId, cicloDbId))
    .orderBy(asc(copsoqCycleSnapshot.employeeId));
}

/**
 * Lista o snapshot de um ciclo restrito a um departamento, ordenado por
 * `employeeId` ascendente. Cobre o indice `idx_snapshot_ciclo_dept` —
 * base do criterio de amostra minima por departamento.
 */
export async function listCopsoqCycleSnapshotsByCicloDepartamento(
  db: RoipDatabase,
  cicloDbId: number,
  departamentoId: number,
) {
  return await db
    .select()
    .from(copsoqCycleSnapshot)
    .where(
      and(
        eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
        eq(copsoqCycleSnapshot.departamentoId, departamentoId),
      ),
    )
    .orderBy(asc(copsoqCycleSnapshot.employeeId));
}

/**
 * Evento de resposta concluida: grava `respondeu=true`, `respondidoEm`
 * e `tempoRespostaSegundos` pela chave logica UNIQUE. Retorna linhas
 * afetadas (0 se a chave nao existir).
 */
export async function markCopsoqSnapshotRespondeu(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
  respondidoEm: Date,
  tempoRespostaSegundos: number,
): Promise<number> {
  const [result] = await db
    .update(copsoqCycleSnapshot)
    .set({ respondeu: true, respondidoEm, tempoRespostaSegundos })
    .where(
      and(
        eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
        eq(copsoqCycleSnapshot.employeeId, employeeId),
      ),
    );
  return result.affectedRows;
}

/**
 * Evento de invalidacao da resposta: grava `respostaInvalida=true` e o
 * `motivoInvalidade` canonico ('uniformidade' | 'tempo_baixo') pela
 * chave logica UNIQUE. Retorna linhas afetadas (0 se a chave nao
 * existir).
 */
export async function markCopsoqSnapshotInvalida(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
  motivoInvalidade: 'uniformidade' | 'tempo_baixo',
): Promise<number> {
  const [result] = await db
    .update(copsoqCycleSnapshot)
    .set({ respostaInvalida: true, motivoInvalidade })
    .where(
      and(
        eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
        eq(copsoqCycleSnapshot.employeeId, employeeId),
      ),
    );
  return result.affectedRows;
}

/**
 * Evento de inativacao pos-snapshot: grava `inativadoAposSnapshot=true`
 * pela chave logica UNIQUE (o colaborador sai da base de calculo de
 * adesao, mas a linha do snapshot permanece). Retorna linhas afetadas
 * (0 se a chave nao existir).
 */
export async function markCopsoqSnapshotInativado(
  db: RoipDatabase,
  cicloDbId: number,
  employeeId: number,
): Promise<number> {
  const [result] = await db
    .update(copsoqCycleSnapshot)
    .set({ inativadoAposSnapshot: true })
    .where(
      and(
        eq(copsoqCycleSnapshot.cicloDbId, cicloDbId),
        eq(copsoqCycleSnapshot.employeeId, employeeId),
      ),
    );
  return result.affectedRows;
}
