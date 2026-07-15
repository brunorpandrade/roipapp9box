// ROIP APP 9BOX — service `cycleUnlockRequests` (ME-017).
//
// Repositorio tipado da tabela canonica `cycleUnlockRequests`
// (DOC 01 §12.9). Solicitacoes de desbloqueio de mes fechado
// (fluxo P11). Solicitante polimorfico padrao B (S420 Opcao A) — sem
// FK formal para `employees`/`cLevelMembers`; integridade na aplicacao.
//
// Maquina de estados:
//   pendente → aprovada
//            → recusada
//            → cancelada
//
// A decisao (`decidirCycleUnlockRequest`) usa WHERE guard
// `status='pendente'` — decidir uma solicitacao ja decidida retorna 0
// linhas afetadas e preserva o registro. Aprovacao por Bruno gera a
// linha correspondente em `monthlyUnlockLog` com `unlockRequestId`
// apontando para esta — coordenacao a cargo do caller (§12.9).
//
// `hasPendingUnlockRequest` alimenta o gate do botao `[Solicitar
// desbloqueio]` (D051/D053): quando `true`, o botao e substituido pelo
// badge "Solicitacao em analise".

import { and, count, desc, eq, isNull } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { cycleUnlockRequests } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewCycleUnlockRequest = typeof cycleUnlockRequests.$inferInsert;

/** Status canonicos (§12.9). */
type CycleUnlockRequestStatus = 'pendente' | 'aprovada' | 'recusada' | 'cancelada';

/** Aba canonica (§12.9). */
type CycleUnlockRequestAba = 'rh' | 'lider' | 'faturamento';

/** Payload da decisao (aprovacao / recusa / cancelamento). */
export interface CycleUnlockDecisao {
  novoStatus: 'aprovada' | 'recusada' | 'cancelada';
  decididoPor?: number | null;
  decididoEm: Date;
  motivoRecusa?: string | null;
  comentarioAprovacao?: string | null;
}

/**
 * Insere uma solicitacao de desbloqueio. Retorna o `id` autogerado.
 * Default do schema: `status='pendente'`. Erros de FK (`companyId`,
 * `decididoPor`) sobem como excecoes do mysql2.
 */
export async function insertCycleUnlockRequest(
  db: RoipDatabase,
  data: NewCycleUnlockRequest,
): Promise<number> {
  const [result] = await db.insert(cycleUnlockRequests).values(data).$returningId();
  if (!result) {
    throw new Error('insertCycleUnlockRequest: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca uma solicitacao pelo `id`. Retorna `undefined` se nao existir. */
export async function getCycleUnlockRequestById(db: RoipDatabase, id: number) {
  const rows = await db
    .select()
    .from(cycleUnlockRequests)
    .where(eq(cycleUnlockRequests.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Decide uma solicitacao (aprovacao, recusa ou cancelamento). Grava
 * `status`, `decididoPor`, `decididoEm` e — conforme o novo status —
 * `motivoRecusa` (recusa) ou `comentarioAprovacao` (aprovacao).
 * WHERE guard: so afeta linha com `status='pendente'`. Retorna linhas
 * afetadas (0 se a transicao for invalida).
 */
export async function decidirCycleUnlockRequest(
  db: RoipDatabase,
  id: number,
  decisao: CycleUnlockDecisao,
): Promise<number> {
  const [result] = await db
    .update(cycleUnlockRequests)
    .set({
      status: decisao.novoStatus,
      decididoPor: decisao.decididoPor ?? null,
      decididoEm: decisao.decididoEm,
      motivoRecusa: decisao.motivoRecusa ?? null,
      comentarioAprovacao: decisao.comentarioAprovacao ?? null,
    })
    .where(and(eq(cycleUnlockRequests.id, id), eq(cycleUnlockRequests.status, 'pendente')));
  return result.affectedRows;
}

/**
 * Verifica se existe solicitacao PENDENTE para a chave logica
 * (`companyId`, `mes`, `aba`, `liderId`). `liderId` nulo (caso das
 * abas `rh` e `faturamento`) e filtrado via `IS NULL`.
 */
export async function hasPendingUnlockRequest(
  db: RoipDatabase,
  companyId: number,
  mes: string,
  aba: CycleUnlockRequestAba,
  liderId: number | null,
): Promise<boolean> {
  const liderClause =
    liderId === null
      ? isNull(cycleUnlockRequests.liderId)
      : eq(cycleUnlockRequests.liderId, liderId);
  const rows = await db
    .select({ n: count() })
    .from(cycleUnlockRequests)
    .where(
      and(
        eq(cycleUnlockRequests.companyId, companyId),
        eq(cycleUnlockRequests.mes, mes),
        eq(cycleUnlockRequests.aba, aba),
        liderClause,
        eq(cycleUnlockRequests.status, 'pendente'),
      ),
    );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Lista solicitacoes em um dado `status` (todas as empresas),
 * ordenadas por `createdAt` descendente. Cobre o indice
 * `idx_cycleUnlockRequests_status_created`.
 */
export async function listCycleUnlockRequestsByStatus(
  db: RoipDatabase,
  status: CycleUnlockRequestStatus,
) {
  return await db
    .select()
    .from(cycleUnlockRequests)
    .where(eq(cycleUnlockRequests.status, status))
    .orderBy(desc(cycleUnlockRequests.createdAt), desc(cycleUnlockRequests.id));
}

/**
 * Lista solicitacoes de uma empresa para um `mes`, ordenadas por
 * `createdAt` descendente. Cobre o indice
 * `idx_cycleUnlockRequests_company_mes`.
 */
export async function listCycleUnlockRequestsByCompanyMes(
  db: RoipDatabase,
  companyId: number,
  mes: string,
) {
  return await db
    .select()
    .from(cycleUnlockRequests)
    .where(and(eq(cycleUnlockRequests.companyId, companyId), eq(cycleUnlockRequests.mes, mes)))
    .orderBy(desc(cycleUnlockRequests.createdAt), desc(cycleUnlockRequests.id));
}

/**
 * Remove todas as solicitacoes de uma empresa (teardown de testes).
 * Retorna linhas afetadas.
 */
export async function deleteCycleUnlockRequestsByCompany(
  db: RoipDatabase,
  companyId: number,
): Promise<number> {
  const [result] = await db
    .delete(cycleUnlockRequests)
    .where(eq(cycleUnlockRequests.companyId, companyId));
  return result.affectedRows;
}
