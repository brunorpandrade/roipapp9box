// ROIP APP 9BOX — service `monthlyUnlockLog` (ME-013).
//
// Repositorio tipado da tabela canonica `monthlyUnlockLog` (DOC 01 §7.7).
// Append-only (§16.1 item 2) com excecao unica declarada em §2.4:
// `houveAlteracao` pode ser atualizado quando a janela de 24h expira
// (setter dedicado `markMonthlyUnlockJanelaExpirada`). Nenhum outro
// UPDATE nem DELETE eh permitido em producao.
//
// Polimorfismo padrao B (§2.3 / §7.7): `liderTipo` enum
// (`employee | clevel`) + `liderId` sem FK formal, preenchidos apenas
// quando `aba = 'lider'`. A integridade do par (liderTipo, liderId) e
// responsabilidade do caller (Bloco B3).
//
// Semantica dos campos:
// - `aba`: escopo do desbloqueio — `rh` (dados mensais do RH), `lider`
//   (dados mensais do lider — exige liderId/liderTipo), `faturamento`
//   (tela /faturamento-mensal — cadeado do Bruno ou aprovacao de
//   solicitacao do Responsavel financeiro).
// - `desbloqueadoPor`: superAdmin autor da acao (FK RESTRICT).
// - `justificativa`: padrao global 100-500 (§2.5) — validacao de minimo
//   e responsabilidade do caller; aqui aceita-se qualquer VARCHAR(500).
// - `unlockRequestId`: solicitacao de origem (Fase 8), quando houver.
//   FK SET NULL.
//
// Multiplos desbloqueios do mesmo par (companyId, mes) geram multiplos
// registros — todos preservados (§7.7). Nao existe UNIQUE nesta tabela.
// A tela exibe apenas o ultimo; o historico completo permanece disponivel
// via `listMonthlyUnlockLogByMonth`.

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { monthlyUnlockLog } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewMonthlyUnlockLog = typeof monthlyUnlockLog.$inferInsert;

/**
 * Insere um registro de desbloqueio. Retorna o `id` autogerado. Erros
 * de FK (`companyId`, `desbloqueadoPor`, `unlockRequestId` quando
 * presente) sobem como excecoes do mysql2. A validacao das regras de
 * negocio (justificativa 100-500, coerencia entre `aba` e liderId /
 * liderTipo) e responsabilidade do caller — este service apenas
 * persiste.
 */
export async function insertMonthlyUnlockLog(
  db: RoipDatabase,
  data: NewMonthlyUnlockLog,
): Promise<number> {
  const [result] = await db.insert(monthlyUnlockLog).values(data).$returningId();
  if (!result) {
    throw new Error('insertMonthlyUnlockLog: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um registro pelo `id`. Retorna `undefined` se nao existir. */
export async function getMonthlyUnlockLogById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(monthlyUnlockLog).where(eq(monthlyUnlockLog.id, id)).limit(1);
  return rows[0];
}

/**
 * Lista todos os desbloqueios de uma empresa em ordem cronologica
 * decrescente por `desbloqueadoEm` (mais recente primeiro), com
 * desempate por `id` decrescente. Consumida pelo Histórico da empresa
 * e por telas administrativas.
 */
export async function listMonthlyUnlockLogByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(monthlyUnlockLog)
    .where(eq(monthlyUnlockLog.companyId, companyId))
    .orderBy(desc(monthlyUnlockLog.desbloqueadoEm), desc(monthlyUnlockLog.id));
}

/**
 * Lista todos os desbloqueios do par (companyId, mes) em ordem
 * cronologica decrescente por `desbloqueadoEm`, com desempate por `id`.
 * Consumida pela tela /faturamento-mensal (visualiza historico do mes)
 * e pelo modal de desbloqueio (Bloco B3).
 */
export async function listMonthlyUnlockLogByMonth(
  db: RoipDatabase,
  companyId: number,
  mes: string,
) {
  return await db
    .select()
    .from(monthlyUnlockLog)
    .where(and(eq(monthlyUnlockLog.companyId, companyId), eq(monthlyUnlockLog.mes, mes)))
    .orderBy(desc(monthlyUnlockLog.desbloqueadoEm), desc(monthlyUnlockLog.id));
}

/**
 * Marca o fechamento da janela de 24h de um desbloqueio, gravando
 * `houveAlteracao` (true se dados foram alterados na janela; false
 * caso contrario). Esta e a UNICA excecao autorizada ao append-only
 * (§2.4) — nenhum outro UPDATE ou DELETE eh permitido sobre esta
 * tabela em producao. Retorna o numero de linhas afetadas.
 */
export async function markMonthlyUnlockJanelaExpirada(
  db: RoipDatabase,
  id: number,
  houveAlteracao: boolean,
): Promise<number> {
  const [result] = await db
    .update(monthlyUnlockLog)
    .set({ houveAlteracao })
    .where(eq(monthlyUnlockLog.id, id));
  return result.affectedRows;
}
