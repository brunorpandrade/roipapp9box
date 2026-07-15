// ROIP APP 9BOX — service `copsoqCycles` (ME-016).
//
// Repositorio tipado da tabela canonica `copsoqCycles` (DOC 01 §11.1).
// Configuracao de cada ciclo do Radar NR-1 — ciclos livres, sem cadencia
// automatica. Tabela MUTAVEL com ciclo de vida rico:
//
// - Agendamento: o INSERT grava a configuracao com `status='agendado'`
//   (default do schema). A auditoria de configuracao e polimorfica por
//   par de FKs NULLABLE (`configuradoPorEmployeeId` se RH,
//   `configuradoPorSuperAdminId` se Super Admin) SEM CHECK canonico de
//   exclusividade — a coerencia do par e responsabilidade do caller
//   (§11.1; confirmado por leitura direta: o unico CHECK da tabela e
//   `chk_datas`, que bloqueia dataAbertura >= dataFechamento).
// - Abertura: `abrirCopsoqCycle` grava `status='aberto'` + `abertoEm`,
//   com guarda estrutural `status='agendado'` no WHERE — transicao
//   invalida retorna 0 linhas afetadas e preserva o registro.
// - Edicao da data de fechamento: `editarCopsoqCycleDataFechamento`
//   grava a nova `dataFechamento` + `dataFechamentoOriginal` + o bloco
//   `ultimaEdicao*` (par polimorfico tambem sem CHECK — caller).
// - Fechamento: `fecharCopsoqCycle` grava `status='fechado'` +
//   `fechadoEm` + os resultados calculados no fechamento
//   (`departamentoCritico*`, `departamentosAmostraInsuficiente`), com
//   guarda estrutural `status='aberto'` no WHERE.
//
// Reprocessamento gera NOVO ciclo, nunca sobrescrita dos resultados de
// um ciclo fechado — por isso nao existe setter de resultado avulso.
// `deleteCopsoqCycleById` existe para teardown de testes; a delecao
// propaga CASCADE para snapshot, respostas, scores, analises e
// relatorios (§11.2..§11.6).

import { and, asc, eq } from 'drizzle-orm';

import type { RoipDatabase } from '../../db/client';
import { copsoqCycles } from '../../db/schema';

/** Tipo derivado do schema (payload de INSERT). */
export type NewCopsoqCycle = typeof copsoqCycles.$inferInsert;

/** Payload da edicao de data de fechamento (auditoria §11.1). */
export interface CopsoqCycleEdicaoDataFechamento {
  dataFechamento: Date;
  dataFechamentoOriginal: Date;
  ultimaEdicaoPorEmployeeId?: number;
  ultimaEdicaoPorSuperAdminId?: number;
  ultimaEdicaoEm: Date;
  ultimaEdicaoJustificativa: string;
}

/** Payload dos resultados calculados no fechamento (§11.1). */
export interface CopsoqCycleFechamento {
  fechadoEm: Date;
  departamentoCriticoDepartamentoId?: number | null;
  departamentoCriticoDepartamentoNome?: string | null;
  departamentosAmostraInsuficiente?: unknown;
}

/**
 * Insere (agenda) um ciclo do Radar NR-1. Retorna o `id` autogerado.
 * Erros de FK (`companyId`, pares polimorficos, departamento critico),
 * de UNIQUE (`uq_copsoqCycles_ciclo`) e do CHECK `chk_datas`
 * (dataAbertura >= dataFechamento) sobem como excecoes do mysql2. A
 * coerencia do par polimorfico `configuradoPor*` e do caller.
 */
export async function insertCopsoqCycle(db: RoipDatabase, data: NewCopsoqCycle): Promise<number> {
  const [result] = await db.insert(copsoqCycles).values(data).$returningId();
  if (!result) {
    throw new Error('insertCopsoqCycle: insert retornou sem id (estado inconsistente)');
  }
  return result.id;
}

/** Busca um ciclo pelo `id`. Retorna `undefined` se nao existir. */
export async function getCopsoqCycleById(db: RoipDatabase, id: number) {
  const rows = await db.select().from(copsoqCycles).where(eq(copsoqCycles.id, id)).limit(1);
  return rows[0];
}

/**
 * Busca um ciclo pela chave logica UNIQUE (`companyId`, `ciclo`).
 * Retorna `undefined` se nao existir.
 */
export async function getCopsoqCycleByCiclo(db: RoipDatabase, companyId: number, ciclo: string) {
  const rows = await db
    .select()
    .from(copsoqCycles)
    .where(and(eq(copsoqCycles.companyId, companyId), eq(copsoqCycles.ciclo, ciclo)))
    .limit(1);
  return rows[0];
}

/**
 * Lista os ciclos de uma empresa em um dado `status`, ordenados por
 * `dataAbertura` ascendente. Cobre o indice
 * `idx_copsoqCycles_company_status`.
 */
export async function listCopsoqCyclesByCompanyStatus(
  db: RoipDatabase,
  companyId: number,
  status: 'agendado' | 'aberto' | 'fechado',
) {
  return await db
    .select()
    .from(copsoqCycles)
    .where(and(eq(copsoqCycles.companyId, companyId), eq(copsoqCycles.status, status)))
    .orderBy(asc(copsoqCycles.dataAbertura));
}

/**
 * Lista todos os ciclos em um dado `status` (todas as empresas),
 * ordenados por `dataFechamento` ascendente. Cobre o indice
 * `idx_copsoqCycles_status_dataFechamento` — consumida pelo job de
 * fechamento automatico (Bloco B3), que varre ciclos abertos vencidos.
 */
export async function listCopsoqCyclesByStatusDataFechamento(
  db: RoipDatabase,
  status: 'agendado' | 'aberto' | 'fechado',
) {
  return await db
    .select()
    .from(copsoqCycles)
    .where(eq(copsoqCycles.status, status))
    .orderBy(asc(copsoqCycles.dataFechamento), asc(copsoqCycles.id));
}

/**
 * Transicao agendado -> aberto: grava `status='aberto'` + `abertoEm`.
 * Guarda estrutural no WHERE: so afeta linha com `status='agendado'`.
 * Retorna o numero de linhas afetadas (0 se o ciclo nao existir ou nao
 * estiver agendado — transicao invalida nao altera nada).
 */
export async function abrirCopsoqCycle(
  db: RoipDatabase,
  id: number,
  abertoEm: Date,
): Promise<number> {
  const [result] = await db
    .update(copsoqCycles)
    .set({ status: 'aberto', abertoEm })
    .where(and(eq(copsoqCycles.id, id), eq(copsoqCycles.status, 'agendado')));
  return result.affectedRows;
}

/**
 * Edicao da data de fechamento com auditoria completa (§11.1): grava a
 * nova `dataFechamento`, preserva `dataFechamentoOriginal` e registra o
 * bloco `ultimaEdicao*`. A coerencia do par polimorfico
 * `ultimaEdicaoPor*` e a elegibilidade do ciclo (regra de negocio do
 * Bloco B3) sao responsabilidade do caller. Retorna linhas afetadas.
 */
export async function editarCopsoqCycleDataFechamento(
  db: RoipDatabase,
  id: number,
  edicao: CopsoqCycleEdicaoDataFechamento,
): Promise<number> {
  const [result] = await db
    .update(copsoqCycles)
    .set({
      dataFechamento: edicao.dataFechamento,
      dataFechamentoOriginal: edicao.dataFechamentoOriginal,
      ultimaEdicaoPorEmployeeId: edicao.ultimaEdicaoPorEmployeeId ?? null,
      ultimaEdicaoPorSuperAdminId: edicao.ultimaEdicaoPorSuperAdminId ?? null,
      ultimaEdicaoEm: edicao.ultimaEdicaoEm,
      ultimaEdicaoJustificativa: edicao.ultimaEdicaoJustificativa,
    })
    .where(eq(copsoqCycles.id, id));
  return result.affectedRows;
}

/**
 * Transicao aberto -> fechado: grava `status='fechado'` + `fechadoEm` +
 * os resultados calculados no fechamento (`departamentoCritico*`,
 * `departamentosAmostraInsuficiente`). Guarda estrutural no WHERE: so
 * afeta linha com `status='aberto'`. Retorna linhas afetadas (0 se a
 * transicao for invalida). Reprocessamento posterior gera novo ciclo.
 */
export async function fecharCopsoqCycle(
  db: RoipDatabase,
  id: number,
  fechamento: CopsoqCycleFechamento,
): Promise<number> {
  const [result] = await db
    .update(copsoqCycles)
    .set({
      status: 'fechado',
      fechadoEm: fechamento.fechadoEm,
      departamentoCriticoDepartamentoId: fechamento.departamentoCriticoDepartamentoId ?? null,
      departamentoCriticoDepartamentoNome: fechamento.departamentoCriticoDepartamentoNome ?? null,
      departamentosAmostraInsuficiente: fechamento.departamentosAmostraInsuficiente ?? null,
    })
    .where(and(eq(copsoqCycles.id, id), eq(copsoqCycles.status, 'aberto')));
  return result.affectedRows;
}

/**
 * Remove um ciclo pelo `id` (teardown de testes). A delecao propaga
 * CASCADE para as tabelas filhas do §11. Retorna linhas afetadas.
 */
export async function deleteCopsoqCycleById(db: RoipDatabase, id: number): Promise<number> {
  const [result] = await db.delete(copsoqCycles).where(eq(copsoqCycles.id, id));
  return result.affectedRows;
}
