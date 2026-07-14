// ROIP APP 9BOX — service `instrumentUnlockLog` (ME-015).
//
// Repositorio tipado da tabela canonica `instrumentUnlockLog` (DOC 01
// §8.5). Registro auditavel dos desbloqueios de instrumento (A ou C) por
// Bruno. Append-only (§16.1 item 3) com excecao unica declarada em §2.4:
// `houveAlteracao` pode ser atualizado quando a janela expira (setter
// dedicado `markInstrumentUnlockJanelaExpirada`). Nenhum outro UPDATE
// nem DELETE eh permitido em producao.
//
// Semantica dos campos:
// - `instrumento`: enum canonico de 2 valores (`A` | `C`) — qual
//   instrumento teve a janela de resposta desbloqueada.
// - `desbloqueadoPor`: superAdmin autor da acao (FK RESTRICT).
// - `justificativa`: padrao global 100-500 (§2.5) — validacao de minimo
//   e responsabilidade do caller; aqui aceita-se qualquer TEXT.
// - `expiraEm`: fim da janela concedida.
// - `ajusteRetroativo`: marca desbloqueio de trimestre ja encerrado.
//
// Multiplos desbloqueios do mesmo trio (companyId, employeeId,
// trimestre) geram multiplos registros — todos preservados. Nao existe
// UNIQUE nesta tabela.

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { instrumentUnlockLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewInstrumentUnlockLog = typeof instrumentUnlockLog.$inferInsert;

/**
 * Insere um registro de desbloqueio de instrumento. Retorna o `id`
 * autogerado. Erros de FK (`companyId`, `employeeId`, `desbloqueadoPor`)
 * sobem como excecoes do mysql2. A validacao das regras de negocio
 * (justificativa 100-500, janela vigente) e responsabilidade do caller.
 */
export async function insertInstrumentUnlockLog(
  db: RoipDatabase,
  data: NewInstrumentUnlockLog,
): Promise<number> {
  const [result] = await db.insert(instrumentUnlockLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertInstrumentUnlockLog: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um registro pelo `id`. Retorna `undefined` se nao existir. */
export async function getInstrumentUnlockLogById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(instrumentUnlockLog)
    .where(eq(instrumentUnlockLog.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Lista todos os desbloqueios de uma empresa em ordem cronologica
 * decrescente por `desbloqueadoEm` (mais recente primeiro), com
 * desempate por `id` decrescente. Consumida pelo Histórico da empresa
 * e por telas administrativas.
 */
export async function listInstrumentUnlockLogByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(instrumentUnlockLog)
    .where(eq(instrumentUnlockLog.companyId, companyId))
    .orderBy(desc(instrumentUnlockLog.desbloqueadoEm), desc(instrumentUnlockLog.id));
}

/**
 * Lista todos os desbloqueios do par (employeeId, trimestre) em ordem
 * cronologica decrescente por `desbloqueadoEm`, com desempate por `id`.
 * Consumida pelo fluxo de desbloqueio (Bloco B3) para localizar a
 * janela vigente do colaborador no trimestre.
 */
export async function listInstrumentUnlockLogByEmployeeQuarter(
  db: RoipDatabase,
  employeeId: number,
  trimestre: string,
) {
  return await db
    .select()
    .from(instrumentUnlockLog)
    .where(
      and(
        eq(instrumentUnlockLog.employeeId, employeeId),
        eq(instrumentUnlockLog.trimestre, trimestre),
      ),
    )
    .orderBy(desc(instrumentUnlockLog.desbloqueadoEm), desc(instrumentUnlockLog.id));
}

/**
 * Marca o fechamento da janela de um desbloqueio, gravando
 * `houveAlteracao` (true se respostas foram gravadas por cima na
 * janela; false caso contrario). Esta e a UNICA excecao autorizada ao
 * append-only (§2.4 / §16.1 item 3) — nenhum outro UPDATE ou DELETE eh
 * permitido sobre esta tabela em producao. Retorna o numero de linhas
 * afetadas.
 */
export async function markInstrumentUnlockJanelaExpirada(
  db: RoipDatabase,
  id: number,
  houveAlteracao: boolean,
): Promise<number> {
  const [result] = await db
    .update(instrumentUnlockLog)
    .set({ houveAlteracao })
    .where(eq(instrumentUnlockLog.id, id));
  return result.affectedRows;
}
