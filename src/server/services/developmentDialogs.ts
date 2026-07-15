// ROIP APP 9BOX — service `developmentDialogs` (ME-017).
//
// Repositorio tipado da tabela canonica `developmentDialogs`
// (DOC 01 §10.1). Dialogos informais lider-liderado, nao-estruturados,
// nao-transferiveis. `liderId` e sempre `employees.id` — C-levels nao
// criam dialogos por regra definitiva (§10.1).
//
// Tabela mutavel com estado composto por 3 flags ortogonais:
// - `status`    ENUM('verde','vermelho') — sinal do dialogo
// - `pendencia` BOOLEAN — pendencia gerada a partir do dialogo
// - `arquivado` BOOLEAN — arquivamento logico; registros arquivados
//    nao retornam em consultas padrao
//
// Setters granulares por transicao (nunca setter generico). Sem WHERE
// guard de estado anterior porque, em contraste com `copsoqCycles`, as
// transicoes aqui sao livres — o caller decide.

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { developmentDialogs } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewDevelopmentDialog = typeof developmentDialogs.$inferInsert;

/**
 * Insere um dialogo. Retorna o `id` autogerado. Erros de FK
 * (`companyId`, `liderId`, `employeeId`) sobem como excecoes do mysql2.
 */
export async function insertDevelopmentDialog(
  db: RoipDatabase,
  data: NewDevelopmentDialog,
): Promise<number> {
  const [result] = await db.insert(developmentDialogs).values(data).$returningId();
  if (!result) {
    throw new Error('insertDevelopmentDialog: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um dialogo pelo `id`. Retorna `undefined` se nao existir. */
export async function getDevelopmentDialogById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(developmentDialogs)
    .where(eq(developmentDialogs.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Atualiza o sinal do dialogo. Retorna linhas afetadas. Transicao livre
 * entre verde e vermelho — sem guard de estado anterior.
 */
export async function updateDevelopmentDialogStatus(
  db: RoipDatabase,
  id: number,
  status: 'verde' | 'vermelho',
): Promise<number> {
  const [result] = await db
    .update(developmentDialogs)
    .set({ status })
    .where(eq(developmentDialogs.id, id));
  return result.affectedRows;
}

/** Marca/desmarca a flag `pendencia` do dialogo. Retorna linhas afetadas. */
export async function setDevelopmentDialogPendencia(
  db: RoipDatabase,
  id: number,
  valor: boolean,
): Promise<number> {
  const [result] = await db
    .update(developmentDialogs)
    .set({ pendencia: valor })
    .where(eq(developmentDialogs.id, id));
  return result.affectedRows;
}

/**
 * Arquiva um dialogo (`arquivado = true`). Registros arquivados nao
 * retornam em consultas padrao (§10.1). Sem desarquivamento no MVP.
 */
export async function archiveDevelopmentDialog(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db
    .update(developmentDialogs)
    .set({ arquivado: true })
    .where(eq(developmentDialogs.id, id));
  return result.affectedRows;
}

/**
 * Lista os dialogos de um par lider/liderado. Por default oculta
 * arquivados. Cobre o indice `idx_dd_lider_emp`. Ordena por `createdAt`
 * descendente (mais recente primeiro).
 */
export async function listDialogsByLeaderEmployee(
  db: RoipDatabase,
  liderId: number,
  employeeId: number,
  incluirArquivados = false,
) {
  if (incluirArquivados) {
    return await db
      .select()
      .from(developmentDialogs)
      .where(
        and(eq(developmentDialogs.liderId, liderId), eq(developmentDialogs.employeeId, employeeId)),
      )
      .orderBy(desc(developmentDialogs.createdAt), desc(developmentDialogs.id));
  }
  return await db
    .select()
    .from(developmentDialogs)
    .where(
      and(
        eq(developmentDialogs.liderId, liderId),
        eq(developmentDialogs.employeeId, employeeId),
        eq(developmentDialogs.arquivado, false),
      ),
    )
    .orderBy(desc(developmentDialogs.createdAt), desc(developmentDialogs.id));
}

/**
 * Lista as pendencias ativas de um lider (todos os seus liderados).
 * Cobre o indice `idx_dd_lider_pend` (liderId, pendencia, arquivado).
 */
export async function listPendenciasByLeader(db: RoipDatabase, liderId: number) {
  return await db
    .select()
    .from(developmentDialogs)
    .where(
      and(
        eq(developmentDialogs.liderId, liderId),
        eq(developmentDialogs.pendencia, true),
        eq(developmentDialogs.arquivado, false),
      ),
    )
    .orderBy(desc(developmentDialogs.createdAt), desc(developmentDialogs.id));
}

/**
 * Remove todos os dialogos de uma empresa (teardown de testes).
 * Retorna linhas afetadas.
 */
export async function deleteDevelopmentDialogsByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db
    .delete(developmentDialogs)
    .where(eq(developmentDialogs.companyId, companyId));
  return result.affectedRows;
}
