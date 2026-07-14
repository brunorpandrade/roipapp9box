// ROIP APP 9BOX — service `monthlyClosureStatus` (ME-013).
//
// Repositorio tipado da tabela canonica `monthlyClosureStatus` (DOC 01
// §7.6). Estrutura critica do orquestrador de calculo automatico:
// registra o status de fechamento mensal por empresa e por mes. UNIQUE
// (`companyId`, `mes`) garante uma linha unica por par.
//
// Estados canonicos (enum `status`): `aberto | fechado | desbloqueado`
// (nesta ordem declarada — L28: MySQL ordena ENUM pela posicao, nao
// alfabeticamente). Transicoes canonicas (§7.6, redacao CC5):
//
// - `aberto -> fechado`: automatica as 00:00 do dia 11 do mes
//   subsequente (hora local de `companies.timezone`), ativada pelo
//   scheduler `closeMonthScheduled` (Bloco B3).
// - `fechado -> desbloqueado`: manual, quando Bruno autoriza
//   desbloqueio de 24h para o par (empresa, mes).
// - `desbloqueado -> fechado`: automatica 24h apos o desbloqueio; se
//   houve alteracao de dados na janela, dispara recalculo automatico do
//   trimestre afetado.
//
// As transicoes vivem em routers/orchestrators do Bloco B3. Este service
// expoe apenas o primitivo de persistencia; nao valida transicoes
// (isso ocorre na camada de aplicacao, com base no estado corrente lido
// via `getMonthlyClosureStatusByMonth`).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { monthlyClosureStatus } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewMonthlyClosureStatus = typeof monthlyClosureStatus.$inferInsert;

/** Estados canonicos (§7.6). Uso interno na assinatura do setter. */
type MonthlyClosureStatusValue = 'aberto' | 'fechado' | 'desbloqueado';

/**
 * Insere uma linha de status para o par (companyId, mes). Retorna o
 * `id` autogerado. Erros de FK (`companyId`) e de UNIQUE (`uq_closure`)
 * sobem como excecoes do mysql2. O default do schema (`aberto`) e
 * aplicado quando o payload nao carrega `status`.
 */
export async function insertMonthlyClosureStatus(
  db: RoipDatabase,
  data: NewMonthlyClosureStatus,
): Promise<number> {
  const [result] = await db.insert(monthlyClosureStatus).values(data).$returningId();
  if (!result) {
    throw new Error('insertMonthlyClosureStatus: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma linha pelo `id`. Retorna `undefined` se nao existir. */
export async function getMonthlyClosureStatusById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(monthlyClosureStatus)
    .where(eq(monthlyClosureStatus.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Busca pelo par (companyId, mes) — o UNIQUE canonico da §7.6. Retorna
 * `undefined` se nao existir. Este e o caminho canonico do orquestrador
 * para ler o estado corrente antes de decidir transicao.
 */
export async function getMonthlyClosureStatusByMonth(
  db: RoipDatabase,
  companyId: number,
  mes: string,
) {
  const rows = await db
    .select()
    .from(monthlyClosureStatus)
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)))
    .limit(1);
  return rows[0];
}

/**
 * Lista todas as linhas de status de uma empresa em ordem crescente de
 * `mes` (formato YYYY-MM ordena cronologicamente). Consumida pelo
 * dashboard administrativo e pelo scheduler mensal.
 */
export async function listMonthlyClosureStatusByCompany(db: RoipDatabase, companyId: number) {
  return await db
    .select()
    .from(monthlyClosureStatus)
    .where(eq(monthlyClosureStatus.companyId, companyId))
    .orderBy(asc(monthlyClosureStatus.mes));
}

/**
 * Aplica uma transicao de status ao par (companyId, mes). Grava
 * `status` e, opcionalmente, `dataFechamento` e `processadoEm`.
 * `dataFechamento` e preenchida nas transicoes `aberto -> fechado`
 * (automatica) e `desbloqueado -> fechado` (fim da janela);
 * `processadoEm` marca o instante em que o motor consumiu o fechamento
 * (calculos trimestrais concluidos). Retorna o numero de linhas
 * afetadas. A validacao da transicao (estado corrente -> estado
 * pretendido) e responsabilidade do caller (Bloco B3).
 */
export async function updateMonthlyClosureStatus(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  patch: {
    status: MonthlyClosureStatusValue;
    dataFechamento?: Date | null;
    processadoEm?: Date | null;
  },
): Promise<number> {
  const set: {
    status: MonthlyClosureStatusValue;
    dataFechamento?: Date | null;
    processadoEm?: Date | null;
  } = { status: patch.status };
  if (patch.dataFechamento !== undefined) {
    set.dataFechamento = patch.dataFechamento;
  }
  if (patch.processadoEm !== undefined) {
    set.processadoEm = patch.processadoEm;
  }
  const [result] = await db
    .update(monthlyClosureStatus)
    .set(set)
    .where(and(eq(monthlyClosureStatus.companyId, companyId), eq(monthlyClosureStatus.mes, mes)));
  return result.affectedRows;
}

/**
 * Remove uma linha pelo `id`. Somente para teardown de testes — em
 * producao a linha e retentiva (histórico do fechamento mensal e
 * consumido pelo Histórico da empresa). Retorna o numero de linhas
 * afetadas.
 */
export async function deleteMonthlyClosureStatusById(
  db: RoipDatabase,
  id: number,
): Promise<number> {
  const [result] = await db.delete(monthlyClosureStatus).where(eq(monthlyClosureStatus.id, id));
  return result.affectedRows;
}
