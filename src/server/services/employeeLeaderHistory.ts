// ROIP APP 9BOX — service `employeeLeaderHistory` (ME-011).
//
// Repositorio tipado da tabela `employeeLeaderHistory` (DOC 01 §4.6).
// Vinculo lider-liderado versionado por data; imutavel apos insercao
// (exceto o fechamento de vinculo por `dataFim`). A garantia "exatamente um
// entre liderId e clevelId preenchido" (§4.6) e responsabilidade do
// caller — nao imposta aqui como CHECK (o schema segue o §4.6 sem
// constraint SQL).

import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { employeeLeaderHistory } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT em `employeeLeaderHistory`). */
type NewLeaderHistoryEntry = typeof employeeLeaderHistory.$inferInsert;

/**
 * Insere um novo vinculo lider-liderado. Retorna o `id` autogerado. Cada
 * batch de transferencia atomica (ex.: promocao de novo lider) compartilha
 * o mesmo `transferBatchId` (UUID v4). O caller e responsavel por gerar o
 * UUID e por respeitar a invariante liderId XOR clevelId (§4.6).
 */
export async function insertLeaderHistoryEntry(
  db: RoipDatabase,
  data: NewLeaderHistoryEntry,
): Promise<number> {
  const [result] = await db.insert(employeeLeaderHistory).values(data).$returningId();
  if (!result) {
    throw new Error('insertLeaderHistoryEntry: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/**
 * Fecha um vinculo ativo definindo `dataFim`. Esta e a UNICA mutacao
 * permitida sobre um registro apos insercao (§4.6 — imutabilidade). Retorna
 * o numero de linhas afetadas.
 */
export async function closeLeaderHistoryEntry(
  db: RoipDatabase,
  id: number,
  dataFim: Date,
): Promise<number> {
  const [result] = await db
    .update(employeeLeaderHistory)
    .set({ dataFim })
    .where(eq(employeeLeaderHistory.id, id));
  return result.affectedRows;
}

/**
 * Retorna o vinculo ATUAL ativo de um colaborador (o unico com
 * `dataFim IS NULL` — §4.6 "NULL indica vinculo atual ativo"). Retorna
 * `undefined` se nao houver vinculo ativo (colaborador sem lider registrado
 * ou historico integralmente fechado).
 */
export async function getActiveLeaderHistoryByEmployee(db: RoipDatabase, employeeId: number) {
  const rows = await db
    .select()
    .from(employeeLeaderHistory)
    .where(
      and(eq(employeeLeaderHistory.employeeId, employeeId), isNull(employeeLeaderHistory.dataFim)),
    )
    .limit(1);
  return rows[0];
}

/**
 * Lista o historico completo de vinculos de um colaborador em ordem
 * cronologica decrescente por `dataInicio` (mais recente primeiro).
 * Consumida pelo Historico da empresa (DOC 06) e pelo motor de organograma.
 */
export async function listLeaderHistoryByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(employeeLeaderHistory)
    .where(eq(employeeLeaderHistory.employeeId, employeeId))
    .orderBy(desc(employeeLeaderHistory.dataInicio), desc(employeeLeaderHistory.id));
}

/**
 * Lista todos os registros de um batch de transferencia atomica pelo
 * `transferBatchId`. Consumida pelo motor `leadershipTransfer.execute` (B3)
 * para auditoria e rollback logico do batch. Ordem crescente de `id`
 * reproduz a ordem de insercao dentro do batch.
 */
export async function listLeaderHistoryByBatch(db: RoipDatabase, transferBatchId: string) {
  return await db
    .select()
    .from(employeeLeaderHistory)
    .where(eq(employeeLeaderHistory.transferBatchId, transferBatchId))
    .orderBy(asc(employeeLeaderHistory.id));
}

/**
 * Retorna o vinculo do colaborador ATIVO EM UM MES ESPECIFICO (semantica
 * de "vinculo-no-mes" do DOC 03 §3.11 — `monthlyData.saveMonthlyLeaderData`,
 * `getMonthlyInputForm(aba='lider')` e `getPendentLeaders(escopo=
 * 'minha_cadeia')`). Distinta da vigencia canonica do S066
 * (`getActiveLeaderHistoryByEmployee`): abrange meses passados nos quais o
 * lider ja pode ter sido substituido — o vinculo correto para preenchimento
 * do mes de referencia e o que cobria a data em questao, nao o vigente.
 *
 * Criterio canonico: `dataInicio <= ultimo_dia_do_mes` E
 * (`dataFim IS NULL` OU `dataFim >= primeiro_dia_do_mes`). Cobre transicoes
 * intra-mes (rare) — nesse caso o helper retorna o mais recente por
 * `dataInicio` decrescente, alinhado com "quem estava vigente ao fim do
 * mes de referencia".
 *
 * `mes` no formato `YYYY-MM` (varchar canonico das tabelas mensais).
 * Retorna `undefined` se nao houver vinculo cobrindo o mes.
 */
export async function resolveLeaderLinkAtMonth(db: RoipDatabase, employeeId: number, mes: string) {
  const [anoStr, mesStr] = mes.split('-');
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const firstDay = new Date(Date.UTC(ano, mesNum - 1, 1));
  const lastDay = new Date(Date.UTC(ano, mesNum, 0));

  const rows = await db
    .select()
    .from(employeeLeaderHistory)
    .where(
      and(
        eq(employeeLeaderHistory.employeeId, employeeId),
        lte(employeeLeaderHistory.dataInicio, lastDay),
        or(isNull(employeeLeaderHistory.dataFim), gte(employeeLeaderHistory.dataFim, firstDay)),
      ),
    )
    .orderBy(desc(employeeLeaderHistory.dataInicio), desc(employeeLeaderHistory.id))
    .limit(1);
  return rows[0];
}
