// ROIP APP 9BOX — service `developmentDialogs` (ME-017 + Etapa 1 —
// Bloco 2 setters granulares + patch v6 criador polimorfico
// + ME-PAINEL-PENDENCIAS-DIALOGOS: listPendenciasByCLevel +
// getPendenciasCardData polimorfico com JOIN em employees).
//
// Repositorio tipado da tabela canonica `developmentDialogs`
// (DOC 01 §10.1 REESCRITO NO PATCH v6). Dialogos informais lider-
// liderado, nao-estruturados, nao-transferiveis. O criador do dialogo
// e polimorfico (precedente §4.6 employeeLeaderHistory):
//   - `liderId INT NULL FK employees.id` — quando o lider direto e um
//     employee (lider padrao ou RH-lider).
//   - `clevelId INT NULL FK cLevelMembers.id` — quando o lider direto e
//     C-level (canonizado no patch v6: C-level Cenario 1/2 e simetrico
//     a Lider Cenario 1/2 em permissoes).
//   - Invariante canonica: liderId XOR clevelId (exatamente um
//     preenchido). Imposta pelo caller (router).
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
//
// ME-PAINEL-PENDENCIAS-DIALOGOS adiciona canonicamente:
// - `listPendenciasByCLevel(db, clevelId)` — espelho simetrico de
//   `listPendenciasByLeader`, filtra por clevelId + pendencia=true +
//   arquivado=false. Cobre o indice `idx_dd_clevel_pend`.
// - `getPendenciasCardData(db, args)` — helper polimorfico com JOIN em
//   `employees` que retorna dados prontos para renderizar no card
//   `CardPendenciasDialogos` dos paineis /painel-lider e /painel-clevel.
//   Aceita `{liderId}` XOR `{clevelId}` (nunca ambos, nunca nenhum).

import { and, desc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { developmentDialogs, employees } from '../../db/schema';

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
 * Atualiza os campos textuais `titulo` e/ou `corpo` do dialogo (Etapa 1
 * Bloco 2). Aceita atualizacoes parciais bit-a-bit: campos ausentes
 * (undefined) nao sao tocados; campos com string (mesmo vazia) sobrescrevem.
 * Retorna linhas afetadas.
 */
export async function updateDevelopmentDialogFields(
  db: RoipDatabase,
  id: number,
  patch: { titulo?: string | null; corpo?: string | null },
): Promise<number> {
  const set: Record<string, string | null> = {};
  if (patch.titulo !== undefined) {
    set.titulo = patch.titulo;
  }
  if (patch.corpo !== undefined) {
    set.corpo = patch.corpo;
  }
  if (Object.keys(set).length === 0) {
    return 0;
  }
  const [result] = await db
    .update(developmentDialogs)
    .set(set)
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
 * Descarta um dialogo (DELETE fisico) — canonico exclusivamente antes do
 * primeiro salvamento (§14.26 CAMADA_UI "elimina sem modal"). O router
 * valida a pre-condicao `titulo IS NULL/'' AND corpo IS NULL/''` antes de
 * chamar — este setter e cru. Retorna linhas afetadas.
 */
export async function deleteDevelopmentDialogById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(developmentDialogs).where(eq(developmentDialogs.id, id));
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
 * Lista todos os dialogos ATIVOS (arquivado=false) de um colaborador,
 * independentemente do lider (Etapa 1 Bloco 2 — o drawer no dashboard
 * individual mostra todos os dialogos com o colaborador atual, mesmo os
 * criados por lideres anteriores). Cobre o indice `idx_dd_emp_arq`.
 */
export async function listDialogsByEmployee(db: RoipDatabase, employeeId: number) {
  return await db
    .select()
    .from(developmentDialogs)
    .where(
      and(eq(developmentDialogs.employeeId, employeeId), eq(developmentDialogs.arquivado, false)),
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
 * Lista as pendencias ativas de um C-level lider direto (todos os seus
 * liderados). Espelho simetrico de `listPendenciasByLeader`. Cobre o
 * indice `idx_dd_clevel_pend` (clevelId, pendencia, arquivado). Consumido
 * pelo painel /painel-clevel via `getPendenciasCardData` (ME-PAINEL-
 * PENDENCIAS-DIALOGOS).
 */
export async function listPendenciasByCLevel(db: RoipDatabase, clevelId: number) {
  return await db
    .select()
    .from(developmentDialogs)
    .where(
      and(
        eq(developmentDialogs.clevelId, clevelId),
        eq(developmentDialogs.pendencia, true),
        eq(developmentDialogs.arquivado, false),
      ),
    )
    .orderBy(desc(developmentDialogs.createdAt), desc(developmentDialogs.id));
}

// ============================================================
// ME-PAINEL-PENDENCIAS-DIALOGOS — helper polimorfico para os cards
// dos paineis /painel-lider e /painel-clevel
// ============================================================

/**
 * Linha canonica retornada pelo `getPendenciasCardData`. Contem tudo o
 * que o widget `CardPendenciasDialogos` precisa para renderizar cada
 * pendencia (titulo, nome do colaborador, natureza da conversa e link
 * para o dashboard individual). Ordem cronologica descendente.
 *
 * O campo `status` reflete a natureza canonica do dialogo (enum
 * `['verde','vermelho']` — verde = positiva, vermelho = corretiva) e
 * permite ao card do painel renderizar a bolinha de natureza sem novo
 * fetch (retomada ME-PAINEL-PENDENCIAS-DIALOGOS — D1).
 */
export interface PendenciaCardRow {
  dialogId: number;
  titulo: string | null;
  employeeId: number;
  employeeNome: string;
  status: 'verde' | 'vermelho';
  createdAt: Date;
}

/**
 * Argumentos canonicos polimorficos (liderId XOR clevelId). O helper
 * seleciona a coluna correta do WHERE conforme o tipo canonico do
 * criador. Passar ambos ou nenhum eleva excecao (invariante de callsite).
 */
export type PendenciaCardArgs = { liderId: number } | { clevelId: number };

/**
 * Carrega as pendencias ativas de um lider (employee) ou C-level lider
 * direto, ja com o nome do colaborador resolvido via JOIN canonico em
 * `employees`. Consumido pelos server components `/painel-lider/page.tsx`
 * e `/painel-clevel/page.tsx` para renderizar o card canonico
 * `CardPendenciasDialogos` da secao "Minha equipe".
 *
 * Filtros canonicos aplicados (identicos a `listPendenciasByLeader` e
 * `listPendenciasByCLevel`):
 *   - `pendencia = true`
 *   - `arquivado = false`
 *   - `liderId = <id>` OU `clevelId = <id>` conforme argumento.
 *
 * Ordem canonica: `createdAt DESC, id DESC` (mais recente primeiro).
 */
export async function getPendenciasCardData(
  db: RoipDatabase,
  args: PendenciaCardArgs,
): Promise<PendenciaCardRow[]> {
  const isLider = 'liderId' in args;
  const isCLevel = 'clevelId' in args;
  if (isLider === isCLevel) {
    throw new Error(
      'getPendenciasCardData: exige exatamente um de {liderId, clevelId} (invariante XOR §10.1 v6)',
    );
  }
  const criadorClause = isLider
    ? eq(developmentDialogs.liderId, args.liderId)
    : eq(developmentDialogs.clevelId, args.clevelId);
  const rows = await db
    .select({
      dialogId: developmentDialogs.id,
      titulo: developmentDialogs.titulo,
      employeeId: developmentDialogs.employeeId,
      employeeNome: employees.name,
      status: developmentDialogs.status,
      createdAt: developmentDialogs.createdAt,
    })
    .from(developmentDialogs)
    .innerJoin(employees, eq(employees.id, developmentDialogs.employeeId))
    .where(
      and(
        criadorClause,
        eq(developmentDialogs.pendencia, true),
        eq(developmentDialogs.arquivado, false),
      ),
    )
    .orderBy(desc(developmentDialogs.createdAt), desc(developmentDialogs.id));
  return rows;
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
